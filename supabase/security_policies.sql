-- Ejecuta este script en Supabase SQL Editor.
-- Objetivo: aislar los datos por usuario para que cada persona vea solo sus
-- transacciones, categorias y perfil.

alter table if exists public.transactions enable row level security;
alter table if exists public.categories enable row level security;
alter table if exists public.profiles enable row level security;

drop policy if exists "Users can view own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;

drop policy if exists "Users can view own categories" on public.categories;
drop policy if exists "Users can insert own categories" on public.categories;
drop policy if exists "Users can update own categories" on public.categories;
drop policy if exists "Users can delete own categories" on public.categories;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can view own transactions"
  on public.transactions
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions
  for delete
  using (auth.uid() = user_id);

create policy "Users can view own categories"
  on public.categories
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own categories"
  on public.categories
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own categories"
  on public.categories
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own categories"
  on public.categories
  for delete
  using (auth.uid() = user_id);

create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
