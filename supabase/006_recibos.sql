-- =============================================================================
-- Migración 006 — foto del recibo
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Hasta que se ejecute, la app funciona igual y el botón de adjuntar no
-- aparece: comprueba que el bucket exista antes de ofrecerlo.
--
-- El bucket es PRIVADO. Las fotos de recibos llevan nombres, montos y a veces
-- direcciones; un bucket público las dejaría accesibles a cualquiera que
-- adivine la URL, sin necesidad de sesión. Se leen con URLs firmadas de vida
-- corta que genera la app.
--
-- Cada usuario escribe únicamente dentro de una carpeta con su propio uid, y
-- la política lo comprueba contra `auth.uid()`: el nombre de la carpeta no es
-- una convención, es la regla que aplica Postgres.
-- =============================================================================


-- ─────────────────────────────── el bucket ──────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recibos',
  'recibos',
  false,
  5242880,  -- 5 MB: una foto de recibo con sobra, y un tope al costo de storage
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ───────────────────────── políticas de acceso ──────────────────────────────
-- `storage.foldername(name)` parte la ruta: para "<uid>/2026/archivo.jpg"
-- devuelve {<uid>, 2026}. El primer segmento tiene que ser el uid de quien
-- llama, así que nadie puede leer ni escribir en la carpeta de otro.

drop policy if exists "recibos_select_own" on storage.objects;
drop policy if exists "recibos_insert_own" on storage.objects;
drop policy if exists "recibos_update_own" on storage.objects;
drop policy if exists "recibos_delete_own" on storage.objects;

create policy "recibos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "recibos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "recibos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "recibos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- ──────────────── la ruta del archivo, en el movimiento ─────────────────────
-- Solo la ruta dentro del bucket, nunca una URL: las URLs firmadas caducan, y
-- guardarlas dejaría enlaces muertos en la base a los pocos minutos.

alter table public.transactions
  add column if not exists recibo_path text;


-- ───────────────────────────── verificación ─────────────────────────────────
--
--   -- El bucket debe existir y NO ser público:
--   select id, public, file_size_limit from storage.buckets where id = 'recibos';
--
--   -- Cuatro políticas, todas acotadas al rol authenticated:
--   select policyname, cmd, roles::text from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'recibos_%';
