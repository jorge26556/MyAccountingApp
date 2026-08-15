-- =============================================================================
-- Migración 003 — cuentas, saldos y transferencias
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Hasta aquí la app registraba FLUJOS (entró / salió) pero no SALDOS: sabía
-- cuánto gastaste y no cuánta plata tienes. Esta migración cierra ese hueco.
--
-- El backfill asigna todos los movimientos existentes a una cuenta "Principal"
-- por usuario, así que nada queda huérfano y los saldos cuadran desde el primer
-- momento.
-- =============================================================================


-- ──────────────────────────────── cuentas ───────────────────────────────────
-- `saldo_inicial` es el saldo que tenía la cuenta ANTES del primer movimiento
-- registrado en la app. Sin él, el saldo calculado sería solo el neto de lo
-- que has apuntado, no la plata real.
--
-- Puede ser negativo a propósito: una tarjeta de crédito arranca en deuda.

create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nombre        text not null,
  tipo          text not null default 'Banco',
  saldo_inicial numeric not null default 0,
  archivada     boolean not null default false,
  orden         integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.accounts drop constraint if exists accounts_tipo_check;
alter table public.accounts
  add constraint accounts_tipo_check
  check (tipo in ('Efectivo', 'Banco', 'Tarjeta', 'Ahorro', 'Otro'));

alter table public.accounts drop constraint if exists accounts_nombre_no_vacio;
alter table public.accounts
  add constraint accounts_nombre_no_vacio check (length(trim(nombre)) > 0);

create unique index if not exists accounts_user_nombre_key
  on public.accounts (user_id, lower(trim(nombre)));

create index if not exists accounts_user_id_idx on public.accounts (user_id);


-- ─────────────────── enganche con movimientos y recurrentes ─────────────────
-- `on delete set null`, NO cascade: borrar una cuenta jamás debe borrar
-- historial financiero. Si la cuenta desaparece, el movimiento sigue ahí y la
-- app pide reasignarlo, igual que con las categorías.

alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

-- Las dos patas de una transferencia comparten este uuid. Sirve para dos cosas:
-- excluirlas de ingresos/gastos (mover plata entre tus cuentas no es ninguna de
-- las dos) y poder borrarlas juntas.
alter table public.transactions
  add column if not exists transfer_group uuid;

alter table public.recurring_transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists transactions_account_id_idx
  on public.transactions (account_id);

create index if not exists transactions_transfer_group_idx
  on public.transactions (transfer_group) where transfer_group is not null;

-- La agenda de pendientes consulta exactamente esto en cada arranque.
create index if not exists transactions_pendientes_idx
  on public.transactions (user_id, fecha) where estado_pago = 'Pendiente';


-- ──────────────────────────────── backfill ──────────────────────────────────
-- Una cuenta "Principal" por usuario que ya tenga movimientos, y todos los
-- movimientos sueltos apuntando a ella.
--
-- El campo `canal` queda intacto en la base: la app deja de usarlo (233 de 236
-- filas tenían el valor por defecto 'Directo', no distinguía nada) pero borrar
-- la columna destruiría el poco dato real que sí guarda.

insert into public.accounts (user_id, nombre, tipo, orden)
select distinct t.user_id, 'Principal', 'Banco', 0
  from public.transactions t
 where not exists (select 1 from public.accounts a where a.user_id = t.user_id);

update public.transactions t
   set account_id = a.id
  from public.accounts a
 where a.user_id = t.user_id
   and t.account_id is null
   and a.orden = (select min(a2.orden) from public.accounts a2 where a2.user_id = t.user_id);


-- ──────────────────────────────────── RLS ───────────────────────────────────

alter table public.accounts enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
drop policy if exists "accounts_insert_own" on public.accounts;
drop policy if exists "accounts_update_own" on public.accounts;
drop policy if exists "accounts_delete_own" on public.accounts;

create policy "accounts_select_own" on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "accounts_insert_own" on public.accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "accounts_update_own" on public.accounts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "accounts_delete_own" on public.accounts
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ───────────────────────────── verificación ─────────────────────────────────
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename = 'accounts';
--
--   -- No debe quedar ningún movimiento sin cuenta:
--   select count(*) from public.transactions where account_id is null;
--
--   -- Saldo por cuenta (las transferencias SÍ cuentan: mueven plata de verdad):
--   select a.nombre,
--          a.saldo_inicial
--            + coalesce(sum(case when t.estado_pago = 'Pagado'
--                                then case when t.tipo = 'Ingreso' then t.importe
--                                          else -t.importe end
--                           else 0 end), 0) as saldo
--     from public.accounts a
--     left join public.transactions t on t.account_id = a.id
--    group by a.id, a.nombre, a.saldo_inicial;
