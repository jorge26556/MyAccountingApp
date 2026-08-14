-- =============================================================================
-- Migración 002 — presupuestos, movimientos recurrentes y baja de cuenta
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente: se puede correr varias
-- veces sin efectos secundarios.
--
-- Hasta que se ejecute, la app sigue funcionando: la capa de datos detecta el
-- error 42P01 (la tabla no existe) y muestra esas secciones como no disponibles
-- en vez de romperse.
-- =============================================================================


-- ───────────────────────────── presupuestos ─────────────────────────────────
-- Un monto mensual por categoría. No se guarda un presupuesto por cada mes:
-- el mismo monto aplica todos los meses hasta que se cambie, que es como
-- funciona en la practica un presupuesto personal.

create table if not exists public.budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  categoria  text not null,
  amount     numeric not null,
  created_at timestamptz not null default now()
);

alter table public.budgets drop constraint if exists budgets_amount_positivo;
alter table public.budgets
  add constraint budgets_amount_positivo check (amount > 0);

create unique index if not exists budgets_user_categoria_key
  on public.budgets (user_id, lower(trim(categoria)));

create index if not exists budgets_user_id_idx on public.budgets (user_id);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select_own" on public.budgets;
drop policy if exists "budgets_insert_own" on public.budgets;
drop policy if exists "budgets_update_own" on public.budgets;
drop policy if exists "budgets_delete_own" on public.budgets;

create policy "budgets_select_own" on public.budgets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "budgets_insert_own" on public.budgets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "budgets_update_own" on public.budgets
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "budgets_delete_own" on public.budgets
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ──────────────────────── movimientos recurrentes ───────────────────────────
-- Plantillas que se materializan como transacciones reales una vez al mes.
--
-- `ultima_generacion` guarda el primer dia del mes ya generado. Sirve de
-- candado: la app solo genera si ultima_generacion es null o es anterior al
-- mes actual, y la marca ANTES de insertar. Asi, si tienes la app abierta en
-- el celular y en el computador, no se duplican los movimientos.

create table if not exists public.recurring_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  tipo              text not null,
  categoria         text not null,
  importe           numeric not null,
  canal             text not null default 'Directo',
  descripcion       text not null default '',
  dia_del_mes       integer not null,
  activo            boolean not null default true,
  ultima_generacion date,
  created_at        timestamptz not null default now()
);

alter table public.recurring_transactions drop constraint if exists recurring_tipo_check;
alter table public.recurring_transactions
  add constraint recurring_tipo_check check (tipo in ('Ingreso', 'Gasto'));

alter table public.recurring_transactions drop constraint if exists recurring_importe_check;
alter table public.recurring_transactions
  add constraint recurring_importe_check check (importe > 0);

alter table public.recurring_transactions drop constraint if exists recurring_dia_check;
alter table public.recurring_transactions
  add constraint recurring_dia_check check (dia_del_mes between 1 and 31);

alter table public.recurring_transactions drop constraint if exists recurring_categoria_check;
alter table public.recurring_transactions
  add constraint recurring_categoria_check check (length(trim(categoria)) > 0);

create index if not exists recurring_user_id_idx
  on public.recurring_transactions (user_id);

alter table public.recurring_transactions enable row level security;

drop policy if exists "recurring_select_own" on public.recurring_transactions;
drop policy if exists "recurring_insert_own" on public.recurring_transactions;
drop policy if exists "recurring_update_own" on public.recurring_transactions;
drop policy if exists "recurring_delete_own" on public.recurring_transactions;

create policy "recurring_select_own" on public.recurring_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "recurring_insert_own" on public.recurring_transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "recurring_update_own" on public.recurring_transactions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recurring_delete_own" on public.recurring_transactions
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ─────────────────────────── baja de cuenta ─────────────────────────────────
-- Un usuario no puede borrar su propia fila de auth.users desde el cliente:
-- eso requiere la service_role key, que jamas debe salir del servidor. Esta
-- funcion permite darse de baja borrando SOLO la cuenta de quien la invoca.
--
-- Las transacciones, categorias, metas, presupuestos y recurrentes caen solas
-- por el ON DELETE CASCADE de sus llaves foraneas.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No autorizado';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

-- En Postgres toda funcion concede EXECUTE a PUBLIC por defecto y anon lo
-- hereda: revocar del rol individual no basta, hay que revocar de PUBLIC.
revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;


-- ───────────────────────────── verificación ─────────────────────────────────
-- Las dos tablas nuevas deben aparecer con rowsecurity = true:
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public'
--      and tablename in ('budgets', 'recurring_transactions');
--
-- Y delete_own_account NO debe ser ejecutable por anon:
--
--   select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon_puede
--     from pg_proc where proname = 'delete_own_account';
