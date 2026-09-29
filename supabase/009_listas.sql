-- =============================================================================
-- Migración 009 — listas de compras
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Hasta que se ejecute, la app funciona igual y la pestaña Lista queda oculta,
-- como pasó con las migraciones 002 a 006.
--
-- QUÉ ES
-- Una lista (“Mercado de la semana”) va ligada a una categoría de gasto. Se le
-- agregan ítems (pan, leche, huevos), se tachan en el supermercado y al
-- terminar se anota el valor final: eso crea UN gasto normal en la categoría
-- de la lista, y la lista queda enlazada a ese gasto.
--
-- POR QUÉ UN SOLO GASTO Y NO UNO POR ÍTEM
-- El recibo del supermercado es uno. Un gasto por ítem llenaría Movimientos de
-- filas de $4.500 que nadie quiere revisar, y además el precio por ítem casi
-- nunca se conoce antes de pagar. Los precios de los ítems son solo una
-- estimación opcional.
--
-- Requiere: schema.sql y 008 aplicadas (usa public.esta_aprobado()).
-- =============================================================================


create table if not exists public.shopping_lists (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  nombre         text not null,
  -- Texto y no llave foránea, igual que transactions.categoria: renombrar o
  -- borrar una categoría no debe romper listas viejas.
  categoria      text not null,
  -- 'abierta' mientras se compra; 'completada' cuando ya se registró el gasto.
  estado         text not null default 'abierta',
  -- `on delete set null`: borrar el gasto desde Movimientos no borra la
  -- lista, solo la deja sin enlace.
  transaction_id uuid references public.transactions(id) on delete set null,
  total          numeric(14, 2),
  completada_en  timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.shopping_lists drop constraint if exists shopping_lists_estado_check;
alter table public.shopping_lists
  add constraint shopping_lists_estado_check check (estado in ('abierta', 'completada'));

alter table public.shopping_lists drop constraint if exists shopping_lists_nombre_no_vacio;
alter table public.shopping_lists
  add constraint shopping_lists_nombre_no_vacio check (length(trim(nombre)) > 0);

alter table public.shopping_lists drop constraint if exists shopping_lists_total_positivo;
alter table public.shopping_lists
  add constraint shopping_lists_total_positivo check (total is null or total > 0);

create index if not exists shopping_lists_user_id_idx
  on public.shopping_lists (user_id, created_at desc);

-- Sin este índice, borrar CUALQUIER movimiento recorre la tabla entera para
-- ver si alguna lista apuntaba a él (por el `on delete set null`).
create index if not exists shopping_lists_transaction_id_idx
  on public.shopping_lists (transaction_id) where transaction_id is not null;


create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  -- Se guarda también aquí para que la RLS no tenga que hacer un join.
  user_id    uuid not null references auth.users(id) on delete cascade,
  list_id    uuid not null references public.shopping_lists(id) on delete cascade,
  nombre     text not null,
  -- Texto libre: “2”, “1 kg”, “una bolsa”.
  cantidad   text not null default '',
  -- Estimado y opcional.
  precio     numeric(14, 2),
  comprado   boolean not null default false,
  orden      integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.shopping_items drop constraint if exists shopping_items_nombre_no_vacio;
alter table public.shopping_items
  add constraint shopping_items_nombre_no_vacio check (length(trim(nombre)) > 0);

alter table public.shopping_items drop constraint if exists shopping_items_precio_positivo;
alter table public.shopping_items
  add constraint shopping_items_precio_positivo check (precio is null or precio >= 0);

create index if not exists shopping_items_list_id_idx on public.shopping_items (list_id);
create index if not exists shopping_items_user_id_idx on public.shopping_items (user_id);


-- ──────────────────────────────────── RLS ───────────────────────────────────
-- Igual que el resto desde la 008: dueño Y aprobado.

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "shopping_lists_select_own" on public.shopping_lists;
drop policy if exists "shopping_lists_insert_own" on public.shopping_lists;
drop policy if exists "shopping_lists_update_own" on public.shopping_lists;
drop policy if exists "shopping_lists_delete_own" on public.shopping_lists;

create policy "shopping_lists_select_own" on public.shopping_lists
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "shopping_lists_insert_own" on public.shopping_lists
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "shopping_lists_update_own" on public.shopping_lists
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check ((select auth.uid()) = user_id and public.esta_aprobado());
create policy "shopping_lists_delete_own" on public.shopping_lists
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());

drop policy if exists "shopping_items_select_own" on public.shopping_items;
drop policy if exists "shopping_items_insert_own" on public.shopping_items;
drop policy if exists "shopping_items_update_own" on public.shopping_items;
drop policy if exists "shopping_items_delete_own" on public.shopping_items;

create policy "shopping_items_select_own" on public.shopping_items
  for select to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());
-- Al insertar se comprueba también que la lista sea tuya: sin esto, conociendo
-- el uuid de una lista ajena se le podrían colgar ítems.
create policy "shopping_items_insert_own" on public.shopping_items
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.esta_aprobado()
    and exists (
      select 1 from public.shopping_lists l
       where l.id = list_id and l.user_id = (select auth.uid())
    )
  );
-- El mismo chequeo al actualizar: si no, bastaría con cambiarle el `list_id` a
-- un ítem propio para moverlo a la lista de otro.
create policy "shopping_items_update_own" on public.shopping_items
  for update to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado())
  with check (
    (select auth.uid()) = user_id
    and public.esta_aprobado()
    and exists (
      select 1 from public.shopping_lists l
       where l.id = list_id and l.user_id = (select auth.uid())
    )
  );
create policy "shopping_items_delete_own" on public.shopping_items
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.esta_aprobado());


-- ───────────────────────────── verificación ─────────────────────────────────
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename in ('shopping_lists', 'shopping_items');
--
--   -- Listas con su avance
--   select l.nombre, l.categoria, l.estado, l.total,
--          count(i.*) filter (where i.comprado) as comprados, count(i.*) as items
--     from public.shopping_lists l
--     left join public.shopping_items i on i.list_id = l.id
--    group by l.id order by l.created_at desc;
