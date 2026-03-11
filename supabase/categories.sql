create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint categories_user_id_name_key unique (user_id, name)
);

alter table public.categories enable row level security;

drop policy if exists "Users can view their own categories" on public.categories;
drop policy if exists "Users can insert their own categories" on public.categories;
drop policy if exists "Users can delete their own categories" on public.categories;

create policy "Users can view their own categories"
  on public.categories
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own categories"
  on public.categories
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own categories"
  on public.categories
  for delete
  using (auth.uid() = user_id);
