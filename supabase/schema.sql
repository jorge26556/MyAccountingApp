-- =============================================================================
-- Esquema completo de MyContabilidadApp
-- =============================================================================
-- Este archivo refleja el estado real de la base de datos en Supabase y sirve
-- para reconstruirla desde cero (entorno de pruebas, recuperacion, o un
-- proyecto nuevo). Es idempotente: se puede correr varias veces.
--
-- Antes existian solo `categories.sql` y `security_policies.sql`, asi que las
-- tablas `transactions`, `profiles` y `savings_goals` no estaban en el repo y
-- no habia forma de recrear la base.
--
-- Ejecutar en: Supabase → SQL Editor.
--
-- Para reconstruir desde cero hay que correr DOS archivos, en orden:
--   1. este (schema.sql)
--   2. 002_presupuestos_recurrentes_cuenta.sql  → presupuestos, recurrentes
--                                                  y baja de cuenta
-- =============================================================================


-- ─────────────────────────────────── tablas ─────────────────────────────────

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  id_user    text not null unique,
  birthday   date,
  email      text,
  created_at timestamptz default now()
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint categories_user_id_name_key unique (user_id, name)
);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fecha       date not null default current_date,
  tipo        text not null,
  categoria   text not null,
  importe     numeric not null,
  estado_pago text not null,
  descripcion text,
  canal       text default 'Directo',
  created_at  timestamptz default now()
);

create table if not exists public.savings_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  amount     numeric not null,
  created_at timestamptz default now()
);


-- ───────────────────────────────── constraints ──────────────────────────────
-- La unica validacion del importe era el min="0" del input HTML, que se salta
-- desde las herramientas de desarrollo del navegador.

alter table public.transactions drop constraint if exists transactions_tipo_check;
alter table public.transactions
  add constraint transactions_tipo_check check (tipo in ('Ingreso', 'Gasto'));

alter table public.transactions drop constraint if exists transactions_estado_pago_check;
alter table public.transactions
  add constraint transactions_estado_pago_check check (estado_pago in ('Pagado', 'Pendiente'));

alter table public.transactions drop constraint if exists transactions_importe_no_negativo;
alter table public.transactions
  add constraint transactions_importe_no_negativo check (importe >= 0);

alter table public.transactions drop constraint if exists transactions_categoria_no_vacia;
alter table public.transactions
  add constraint transactions_categoria_no_vacia check (length(trim(categoria)) > 0);

alter table public.categories drop constraint if exists categories_name_no_vacia;
alter table public.categories
  add constraint categories_name_no_vacia check (length(trim(name)) > 0);

alter table public.savings_goals drop constraint if exists savings_goals_amount_positivo;
alter table public.savings_goals
  add constraint savings_goals_amount_positivo check (amount > 0);

alter table public.savings_goals drop constraint if exists savings_goals_name_no_vacio;
alter table public.savings_goals
  add constraint savings_goals_name_no_vacio check (length(trim(name)) > 0);


-- ─────────────────────────────────── indices ────────────────────────────────
-- La app siempre filtra por user_id y ordena por fecha desc. Sin este indice
-- cada consulta recorre la tabla entera.

create index if not exists transactions_user_id_fecha_idx
  on public.transactions (user_id, fecha desc);

create index if not exists categories_user_id_idx on public.categories (user_id);
create index if not exists savings_goals_user_id_idx on public.savings_goals (user_id);

create unique index if not exists savings_goals_user_id_name_key
  on public.savings_goals (user_id, lower(trim(name)));


-- ──────────────────────── creacion automatica del perfil ────────────────────
-- El perfil lo crea un trigger sobre auth.users, no un RPC llamado desde el
-- cliente. El RPC anterior (`create_user_profile`):
--   - era ejecutable por el rol `anon`,
--   - no validaba que quien llamaba fuera el propio usuario,
--   - hacia UPDATE auth.users SET email_confirmed_at = now(), es decir
--     auto-confirmaba correos y anulaba la verificacion de email,
--   - y si fallaba dejaba un usuario en auth.users sin fila en profiles.

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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- En Postgres toda funcion concede EXECUTE a PUBLIC por defecto, y anon lo
-- hereda. Revocar del rol individual no sirve: hay que revocar de PUBLIC.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;


-- ──────────────────────────────────── RLS ───────────────────────────────────
-- Todas las politicas se acotan al rol `authenticated`. El rol `public` incluye
-- a `anon`, es decir peticiones sin iniciar sesion.
--
-- IMPORTANTE: `profiles` tenia una politica "Users can view any profile" con
-- `using (true)` para el rol `public`. Como las politicas permisivas se
-- combinan con OR, esa sola linea anulaba a la correcta y dejaba el correo, el
-- alias y la fecha de nacimiento de TODOS los usuarios legibles sin
-- autenticacion, con solo la anon key que va publica en el bundle.

alter table public.profiles      enable row level security;
alter table public.categories    enable row level security;
alter table public.transactions  enable row level security;
alter table public.savings_goals enable row level security;

-- profiles
drop policy if exists "Users can view any profile"         on public.profiles;
drop policy if exists "Users can view own profile"         on public.profiles;
drop policy if exists "Users can view their own profile"   on public.profiles;
drop policy if exists "Users can insert own profile"       on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update own profile"       on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- transactions
drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- categories
drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;

create policy "categories_select_own" on public.categories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "categories_insert_own" on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "categories_update_own" on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories_delete_own" on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id);

-- savings_goals
drop policy if exists "savings_goals_select_own" on public.savings_goals;
drop policy if exists "savings_goals_insert_own" on public.savings_goals;
drop policy if exists "savings_goals_update_own" on public.savings_goals;
drop policy if exists "savings_goals_delete_own" on public.savings_goals;

create policy "savings_goals_select_own" on public.savings_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "savings_goals_insert_own" on public.savings_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "savings_goals_update_own" on public.savings_goals
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "savings_goals_delete_own" on public.savings_goals
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ───────────────────────────── verificacion rapida ──────────────────────────
-- Las cuatro tablas deben aparecer con rowsecurity = true, y no debe existir
-- ninguna politica con qual = 'true'.
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public';
--
--   select tablename, policyname, roles::text, cmd, qual
--     from pg_policies where schemaname = 'public' order by tablename;
