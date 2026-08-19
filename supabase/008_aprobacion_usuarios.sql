-- =============================================================================
-- Migración 008 — aprobación manual de usuarios
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Hasta aquí el registro era libre: cualquiera que abriera la URL creaba una
-- cuenta y entraba al instante. La confirmación de correo está desactivada, no
-- hay allowlist y no hay roles. RLS impide que un desconocido vea datos
-- ajenos, pero no impide el alta ni el consumo de la cuota del proyecto.
--
-- A partir de aquí el registro sigue abierto, pero un usuario nuevo entra en
-- estado PENDIENTE y no puede escribir ni leer nada hasta que un administrador
-- lo apruebe desde la propia app.
--
-- ¿Por qué una tabla aparte y no una columna `aprobado` en `profiles`?
-- Porque RLS es a nivel de FILA, no de columna. La política
-- `profiles_update_own` deja a cada usuario actualizar su propia fila entera:
-- si `aprobado` viviera ahí, cualquiera podría auto-aprobarse con un PATCH
-- directo al REST usando la anon key, que va pública dentro del bundle.
-- Con una tabla separada el permiso de escritura es solo del admin y no hay
-- nada que esquivar.
--
-- Requiere: schema.sql, 002, 003, 005 y 006 aplicadas.
-- =============================================================================


-- ──────────────────────────────── la tabla ──────────────────────────────────

create table if not exists public.user_access (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  aprobado     boolean not null default false,
  es_admin     boolean not null default false,
  aprobado_por uuid references auth.users(id) on delete set null,
  aprobado_en  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists user_access_pendientes_idx
  on public.user_access (created_at desc) where aprobado = false;


-- ──────────────────────────── alta automática ───────────────────────────────
-- Se reescribe `handle_new_user()` entera para que este archivo se baste solo.
-- Sigue haciendo lo mismo que en schema.sql —crear el perfil a partir de los
-- metadatos del registro— y añade la fila de acceso en estado pendiente.
--
-- Va dentro del mismo trigger a propósito: si el alta de acceso fuera un
-- segundo trigger y fallara, quedaría un usuario sin fila en `user_access`,
-- que para `esta_aprobado()` es indistinguible de "pendiente" pero para el
-- panel de administración es un usuario invisible.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alias text;
  v_birthday date;
begin
  v_alias := nullif(trim(new.raw_user_meta_data ->> 'id_user'), '');
  if v_alias is null then
    v_alias := split_part(new.email, '@', 1);
  end if;

  begin
    v_birthday := nullif(new.raw_user_meta_data ->> 'birthday', '')::date;
  exception when others then
    v_birthday := null;
  end;

  begin
    insert into public.profiles (id, id_user, birthday, email)
    values (new.id, v_alias, v_birthday, new.email)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- El alias ya existe: se desambigua en vez de tumbar el registro completo.
    insert into public.profiles (id, id_user, birthday, email)
    values (new.id, v_alias || '_' || substr(new.id::text, 1, 8), v_birthday, new.email)
    on conflict (id) do nothing;
  end;

  insert into public.user_access (user_id, aprobado, es_admin)
  values (new.id, false, false)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;


-- ──────────────────────────────── helpers ───────────────────────────────────
-- `security definer` NO es opcional aquí: una política sobre `user_access` que
-- consultara `user_access` con los permisos de quien llama volvería a evaluar
-- la política, y Postgres aborta con recursión infinita. Definer salta RLS y
-- corta el ciclo.
--
-- Son `stable`, así que el planner las evalúa una vez por consulta y no una
-- vez por fila.

create or replace function public.esta_aprobado()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select aprobado from public.user_access where user_id = (select auth.uid())),
    false
  );
$$;

create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select es_admin and aprobado from public.user_access where user_id = (select auth.uid())),
    false
  );
$$;

revoke all on function public.esta_aprobado() from public;
revoke all on function public.esta_aprobado() from anon;
grant execute on function public.esta_aprobado() to authenticated;

revoke all on function public.es_admin() from public;
revoke all on function public.es_admin() from anon;
grant execute on function public.es_admin() to authenticated;


-- ─────────────────── nadie puede cerrarse la puerta solo ────────────────────
-- Si el único administrador se revoca a sí mismo por error, ya no queda nadie
-- que pueda devolverle el permiso: habría que entrar al panel de Supabase a
-- arreglarlo por SQL. Se bloquea en la base, no en la app, porque la app no es
-- la única forma de llamar al REST.

create or replace function public.user_access_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.user_id = (select auth.uid())
     and (new.aprobado is distinct from true or new.es_admin is distinct from old.es_admin) then
    raise exception 'No puedes quitarte a ti mismo el acceso ni el rol de administrador';
  end if;
  return new;
end;
$$;

drop trigger if exists user_access_guard_trigger on public.user_access;
create trigger user_access_guard_trigger
  before update on public.user_access
  for each row execute function public.user_access_guard();


-- ──────────────────────────── RLS de user_access ────────────────────────────
-- Cada uno ve su propio estado (lo necesita la pantalla de "pendiente"); el
-- admin los ve todos. Escribir es solo del admin. No hay insert ni delete para
-- `authenticated`: las filas las crea el trigger y las borra el cascade.

alter table public.user_access enable row level security;

drop policy if exists "user_access_select_own_o_admin" on public.user_access;
drop policy if exists "user_access_update_admin" on public.user_access;

create policy "user_access_select_own_o_admin" on public.user_access
  for select to authenticated
  using ((select auth.uid()) = user_id or public.es_admin());

create policy "user_access_update_admin" on public.user_access
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ─────────────────── el admin ve los perfiles pendientes ────────────────────
-- Se suma por OR a `profiles_select_own`, que no se toca. Sin esto el panel
-- mostraría uuids sueltos: el alias y el correo viven en `profiles`.

drop policy if exists "profiles_select_admin" on public.profiles;

create policy "profiles_select_admin" on public.profiles
  for select to authenticated using (public.es_admin());


-- ═══════════════════ cierre de las tablas de datos ══════════════════════════
-- Se recrean las políticas de las siete tablas y del bucket añadiendo
-- `and public.esta_aprobado()`. Un usuario pendiente queda inerte: ni lee ni
-- escribe nada suyo.
--
-- `profiles` y `user_access` quedan FUERA a propósito: hacen falta para pintar
-- la pantalla de espera y para cerrar sesión.

-- transactions
drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

create policy "transactions_select_own" on public.transactions
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

-- categories
drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;

create policy "categories_select_own" on public.categories
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "categories_insert_own" on public.categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "categories_update_own" on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "categories_delete_own" on public.categories
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

-- savings_goals
drop policy if exists "savings_goals_select_own" on public.savings_goals;
drop policy if exists "savings_goals_insert_own" on public.savings_goals;
drop policy if exists "savings_goals_update_own" on public.savings_goals;
drop policy if exists "savings_goals_delete_own" on public.savings_goals;

create policy "savings_goals_select_own" on public.savings_goals
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "savings_goals_insert_own" on public.savings_goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "savings_goals_update_own" on public.savings_goals
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "savings_goals_delete_own" on public.savings_goals
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

-- budgets
drop policy if exists "budgets_select_own" on public.budgets;
drop policy if exists "budgets_insert_own" on public.budgets;
drop policy if exists "budgets_update_own" on public.budgets;
drop policy if exists "budgets_delete_own" on public.budgets;

create policy "budgets_select_own" on public.budgets
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "budgets_insert_own" on public.budgets
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "budgets_update_own" on public.budgets
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "budgets_delete_own" on public.budgets
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

-- recurring_transactions
drop policy if exists "recurring_select_own" on public.recurring_transactions;
drop policy if exists "recurring_insert_own" on public.recurring_transactions;
drop policy if exists "recurring_update_own" on public.recurring_transactions;
drop policy if exists "recurring_delete_own" on public.recurring_transactions;

create policy "recurring_select_own" on public.recurring_transactions
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "recurring_insert_own" on public.recurring_transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "recurring_update_own" on public.recurring_transactions
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "recurring_delete_own" on public.recurring_transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

-- accounts
drop policy if exists "accounts_select_own" on public.accounts;
drop policy if exists "accounts_insert_own" on public.accounts;
drop policy if exists "accounts_update_own" on public.accounts;
drop policy if exists "accounts_delete_own" on public.accounts;

create policy "accounts_select_own" on public.accounts
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "accounts_insert_own" on public.accounts
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "accounts_update_own" on public.accounts
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "accounts_delete_own" on public.accounts
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

-- debts
drop policy if exists "debts_select_own" on public.debts;
drop policy if exists "debts_insert_own" on public.debts;
drop policy if exists "debts_update_own" on public.debts;
drop policy if exists "debts_delete_own" on public.debts;

create policy "debts_select_own" on public.debts
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "debts_insert_own" on public.debts
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "debts_update_own" on public.debts
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "debts_delete_own" on public.debts
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

-- recibos (storage.objects). La política del bucket en sí no se toca: solo
-- revela que existe, y la app la necesita para decidir si ofrece el botón de
-- adjuntar antes de saber nada más.
drop policy if exists "recibos_select_own" on storage.objects;
drop policy if exists "recibos_insert_own" on storage.objects;
drop policy if exists "recibos_update_own" on storage.objects;
drop policy if exists "recibos_delete_own" on storage.objects;

create policy "recibos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.esta_aprobado()
  );

create policy "recibos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.esta_aprobado()
  );

create policy "recibos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.esta_aprobado()
  );

create policy "recibos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.esta_aprobado()
  );


-- ──────────────────────────────── semilla ───────────────────────────────────
-- Primero se da de alta a TODO usuario existente en estado pendiente, para que
-- ninguno quede sin fila y sin poder aparecer en el panel. Después se aprueba
-- a los dos que ya usaban la app, y se marca al administrador.

insert into public.user_access (user_id, aprobado, es_admin)
select u.id, false, false
  from auth.users u
on conflict (user_id) do nothing;

update public.user_access ua
   set aprobado     = true,
       es_admin     = ua.es_admin or u.email = 'davidrealpe2607@gmail.com',
       aprobado_en  = coalesce(ua.aprobado_en, now())
  from auth.users u
 where u.id = ua.user_id
   and u.email in ('davidrealpe2607@gmail.com', 'manzanita0226@gmail.com');


-- ───────────────────────────── verificación ─────────────────────────────────
-- Quién puede entrar y quién manda:
--
--   select p.email, p.id_user, ua.aprobado, ua.es_admin, ua.created_at
--     from public.user_access ua
--     join public.profiles p on p.id = ua.user_id
--    order by ua.created_at desc;
--
-- Debe haber exactamente un admin y dos aprobados. Y ninguna función nueva
-- puede ser ejecutable por anon:
--
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_puede
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('esta_aprobado', 'es_admin');
