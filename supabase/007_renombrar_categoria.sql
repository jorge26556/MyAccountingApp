-- =============================================================================
-- Migración 007 — renombrar una categoría sin romper el historial
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Una categoría no se guarda por llave foránea: su NOMBRE viaja como texto en
-- tres tablas distintas.
--
--   transactions.categoria
--   budgets.categoria
--   recurring_transactions.categoria
--
-- Renombrar solo la fila de `categories` dejaría todo el historial apuntando a
-- un nombre que ya no existe: los movimientos desaparecerían de su categoría,
-- el presupuesto dejaría de encontrarlos y el recurrente seguiría creando
-- movimientos con el nombre viejo. Es el mismo agujero que ya se tapó al
-- borrar categorías.
--
-- Hacerlo desde el cliente serían cuatro UPDATE sueltos: si se corta la señal
-- entre el segundo y el tercero, quedan movimientos con el nombre nuevo y
-- presupuestos con el viejo, y nada lo señala. Aquí es una sola transacción:
-- o cambian las cuatro tablas, o no cambia ninguna.
--
-- `security invoker` a propósito: la función corre con los permisos de quien
-- llama, así que RLS sigue aplicando y nadie puede tocar filas ajenas ni
-- aunque invente los parámetros.
-- =============================================================================

create or replace function public.rename_category(p_old text, p_new text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old text := trim(p_old);
  v_new text := trim(p_new);
begin
  if v_uid is null then
    raise exception 'No autorizado';
  end if;

  if length(v_new) = 0 then
    raise exception 'El nombre de la categoría no puede estar vacío';
  end if;

  if v_old = v_new then
    return;
  end if;

  -- 'Transferencia' y 'Préstamo' no son categorías del usuario: son las
  -- etiquetas con las que la app marca las dos patas de una transferencia y
  -- los movimientos de una deuda, y el resto del código las descuenta de
  -- ingresos y gastos. Dejar que una categoría normal se renombre a una de
  -- ellas haría que sus movimientos dejaran de contar en los KPIs, en las
  -- gráficas y en los presupuestos, sin ningún aviso.
  if lower(v_new) in ('transferencia', 'préstamo', 'prestamo') then
    raise exception 'El nombre "%" está reservado por la app', v_new;
  end if;

  -- El índice único de `categories` es (user_id, name), sensible a mayúsculas;
  -- el de `budgets` es sobre lower(trim(categoria)). Se comprueban los dos
  -- antes de tocar nada: un choque a mitad de los UPDATE abortaría igual, pero
  -- con un mensaje de Postgres que no dice qué pasó.
  if exists (
    select 1 from public.categories
     where user_id = v_uid and lower(name) = lower(v_new) and name <> v_old
  ) then
    raise exception 'Ya tienes una categoría llamada "%"', v_new using errcode = '23505';
  end if;

  if exists (
    select 1 from public.budgets
     where user_id = v_uid
       and lower(trim(categoria)) = lower(v_new)
       and lower(trim(categoria)) <> lower(v_old)
  ) then
    raise exception 'Ya tienes un presupuesto para "%"', v_new using errcode = '23505';
  end if;

  update public.categories
     set name = v_new
   where user_id = v_uid and name = v_old;

  if not found then
    raise exception 'La categoría "%" no existe', v_old;
  end if;

  update public.transactions
     set categoria = v_new
   where user_id = v_uid and categoria = v_old;

  update public.budgets
     set categoria = v_new
   where user_id = v_uid and categoria = v_old;

  update public.recurring_transactions
     set categoria = v_new
   where user_id = v_uid and categoria = v_old;
end;
$$;

-- En Postgres toda función concede EXECUTE a PUBLIC por defecto, y `anon` lo
-- hereda. Revocar del rol individual no basta: hay que revocar de PUBLIC.
revoke all on function public.rename_category(text, text) from public;
revoke all on function public.rename_category(text, text) from anon;
grant execute on function public.rename_category(text, text) to authenticated;


-- ───────────────────────────── verificación rápida ──────────────────────────
-- Después de renombrar, ninguna de estas tres debe devolver el nombre viejo:
--
--   select categoria, count(*) from public.transactions group by categoria;
--   select categoria from public.budgets;
--   select categoria from public.recurring_transactions;
--
-- Y `anon` no debe poder ejecutarla:
--
--   select has_function_privilege('anon', 'public.rename_category(text,text)', 'EXECUTE');
