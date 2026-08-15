-- =============================================================================
-- Migración 004 — compras a cuotas
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Hasta que se ejecute la app sigue funcionando: detecta que las columnas no
-- existen y esconde la opción de diferir, igual que hicieron las migraciones
-- 002 y 003.
--
-- No hay tabla nueva. Una compra a cuotas son N movimientos normales que
-- comparten `compra_id`, cada uno con su número de cuota. Así las cuotas
-- aparecen solas en la agenda de próximos pagos, entran en el comprometido del
-- mes que toca y se marcan pagadas una por una, sin ninguna lógica aparte.
-- =============================================================================

alter table public.transactions
  add column if not exists compra_id uuid;

alter table public.transactions
  add column if not exists cuota_numero integer;

alter table public.transactions
  add column if not exists cuota_total integer;

-- Una cuota suelta (la 3 sin la 12) no significa nada, y una cuota 13 de 12
-- tampoco. Las tres columnas van juntas o no van.
alter table public.transactions drop constraint if exists transactions_cuota_coherente;
alter table public.transactions
  add constraint transactions_cuota_coherente check (
    (compra_id is null and cuota_numero is null and cuota_total is null)
    or (
      compra_id is not null
      and cuota_numero is not null
      and cuota_total is not null
      and cuota_total >= 2
      and cuota_numero >= 1
      and cuota_numero <= cuota_total
    )
  );

-- Una compra no puede tener dos veces la misma cuota.
create unique index if not exists transactions_compra_cuota_key
  on public.transactions (compra_id, cuota_numero)
  where compra_id is not null;

create index if not exists transactions_compra_id_idx
  on public.transactions (compra_id) where compra_id is not null;


-- ───────────────────────────── verificación ─────────────────────────────────
--
--   -- Las tres columnas deben aparecer:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'transactions'
--      and column_name in ('compra_id', 'cuota_numero', 'cuota_total');
--
--   -- La suma de las cuotas de cada compra, para cuadrar contra el extracto:
--   select compra_id, count(*) as cuotas, sum(importe) as total
--     from public.transactions
--    where compra_id is not null
--    group by compra_id;
