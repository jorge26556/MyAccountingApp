-- =============================================================================
-- Migración 005 — deudas y préstamos
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Hasta que se ejecute, la app funciona igual y la sección de Deudas queda
-- oculta, como pasó con las migraciones 002, 003 y 004.
--
-- POR QUÉ NO ES UN GASTO
-- Prestarle $500.000 a alguien saca la plata de tu cuenta, pero no es un gasto:
-- sigue siendo tuya, solo que la tiene otro. Si se contara como gasto, tus
-- gastos del mes saldrían inflados y tu patrimonio subestimado. Y cuando te la
-- devuelvan no es un ingreso: es plata tuya que vuelve.
--
-- Es el mismo problema que las transferencias entre cuentas propias, y se
-- resuelve igual: los movimientos ligados a una deuda mueven el saldo de la
-- cuenta pero NO cuentan ni como ingreso ni como gasto.
-- =============================================================================


create table if not exists public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  persona     text not null,
  -- 'me_deben' = le prestaste a alguien. 'debo' = te prestaron.
  tipo        text not null,
  descripcion text not null default '',
  archivada   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.debts drop constraint if exists debts_tipo_check;
alter table public.debts
  add constraint debts_tipo_check check (tipo in ('me_deben', 'debo'));

alter table public.debts drop constraint if exists debts_persona_no_vacia;
alter table public.debts
  add constraint debts_persona_no_vacia check (length(trim(persona)) > 0);

create index if not exists debts_user_id_idx on public.debts (user_id);


-- ─────────────────── enganche con los movimientos ───────────────────────────
-- `on delete set null`, NO cascade: borrar la ficha de una deuda jamás debe
-- borrar movimientos de plata que de verdad ocurrieron. El movimiento queda,
-- y al perder el vínculo vuelve a contar como ingreso o gasto normal — que es
-- justo lo que pasó si diste la deuda por perdida.

alter table public.transactions
  add column if not exists debt_id uuid references public.debts(id) on delete set null;

create index if not exists transactions_debt_id_idx
  on public.transactions (debt_id) where debt_id is not null;


-- ──────────────────────────────────── RLS ───────────────────────────────────

alter table public.debts enable row level security;

drop policy if exists "debts_select_own" on public.debts;
drop policy if exists "debts_insert_own" on public.debts;
drop policy if exists "debts_update_own" on public.debts;
drop policy if exists "debts_delete_own" on public.debts;

create policy "debts_select_own" on public.debts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "debts_insert_own" on public.debts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "debts_update_own" on public.debts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "debts_delete_own" on public.debts
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ───────────────────────────── verificación ─────────────────────────────────
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename = 'debts';
--
--   -- Lo pendiente de cada deuda. Para 'me_deben' lo prestado sale de la
--   -- cuenta (Gasto) y lo devuelto entra (Ingreso); para 'debo' al revés.
--   select d.persona, d.tipo,
--          sum(case when (d.tipo = 'me_deben') = (t.tipo = 'Gasto')
--                   then t.importe else -t.importe end) as pendiente
--     from public.debts d
--     join public.transactions t on t.debt_id = d.id
--    group by d.id, d.persona, d.tipo;
