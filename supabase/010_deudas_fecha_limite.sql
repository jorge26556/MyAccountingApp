-- =============================================================================
-- Migración 010 — fecha límite de las deudas
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- "Me paga el 15" o "le devuelvo a mamá a fin de mes". Con la fecha, una deuda
-- abierta aparece en la Agenda de "Próximos pagos" junto a los pendientes y los
-- recurrentes, y cuenta para el aviso de urgentes: una deuda sin fecha se
-- olvida justamente porque nada la recuerda.
--
-- Es opcional: las deudas existentes quedan sin fecha y todo sigue igual.
--
-- Requiere: 005 aplicada.
-- =============================================================================

alter table public.debts
  add column if not exists fecha_limite date;
