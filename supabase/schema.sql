-- Schema applied to the Supabase project `madrassa-khata` (ref grtzdhjzdjexzufgiezl).
-- Kept here for reference / re-creating the database.

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.income (
  id bigint generated always as identity primary key,
  receipt_no bigint generated always as identity (start with 1001) unique,
  entry_date date not null default current_date,
  donor_name text not null default 'گمنام',
  phone text,
  fund text not null,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null default 'نقد',
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.expense (
  id bigint generated always as identity primary key,
  voucher_no bigint generated always as identity (start with 1001) unique,
  entry_date date not null default current_date,
  category text not null,
  detail text,
  paid_to text,
  fund text not null,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null default 'نقد',
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  madrassa_name text not null default 'مدرسہ کا حساب'
);
insert into public.settings (id) values (1);

create index income_date_idx on public.income (entry_date desc);
create index expense_date_idx on public.expense (entry_date desc);
create index income_created_by_idx on public.income (created_by);
create index expense_created_by_idx on public.expense (created_by);

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.members m where m.user_id = (select auth.uid())) $$;

-- First account ever created becomes the owner; later sign-ups get no access.
create or replace function public.bootstrap_first_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.members) then
    insert into public.members (user_id, email) values (new.id, new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.bootstrap_first_member();

alter table public.members enable row level security;
alter table public.income enable row level security;
alter table public.expense enable row level security;
alter table public.settings enable row level security;

create policy "members see members" on public.members for select to authenticated using ((select public.is_member()));

create policy "members read income" on public.income for select to authenticated using ((select public.is_member()));
create policy "members add income" on public.income for insert to authenticated with check ((select public.is_member()));
create policy "members edit income" on public.income for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members delete income" on public.income for delete to authenticated using ((select public.is_member()));

create policy "members read expense" on public.expense for select to authenticated using ((select public.is_member()));
create policy "members add expense" on public.expense for insert to authenticated with check ((select public.is_member()));
create policy "members edit expense" on public.expense for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members delete expense" on public.expense for delete to authenticated using ((select public.is_member()));

create policy "members read settings" on public.settings for select to authenticated using ((select public.is_member()));
create policy "members edit settings" on public.settings for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));

revoke execute on function public.bootstrap_first_member() from public, anon, authenticated;
revoke execute on function public.is_member() from public, anon;

-- ---------------------------------------------------------------
-- Migration: lock_signups_to_allowlist
-- Only emails on signup_allowlist can ever create an account (empty = nobody new).
-- To let someone new in later:  insert into public.signup_allowlist (email) values ('their@email.com');
-- then after they sign up:       insert into public.members (user_id, email) select id, email from auth.users where email = 'their@email.com';
create table if not exists public.signup_allowlist (
  email text primary key,
  added_at timestamptz not null default now()
);
alter table public.signup_allowlist enable row level security;

create or replace function public.block_unlisted_signups()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.signup_allowlist a where lower(a.email) = lower(new.email)) then
    raise exception 'signups_closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.block_unlisted_signups() from public, anon, authenticated;

drop trigger if exists block_unlisted_signups on auth.users;
create trigger block_unlisted_signups before insert on auth.users
for each row execute function public.block_unlisted_signups();

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.bootstrap_first_member();

-- ---------------------------------------------------------------
-- Migration: add_farm_khata_tables  (بکروں کا کھاتہ, served at /farm)
-- Same members / is_member() as the madrassa tables, so one login opens both khatas.
create table public.farm_animal (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null check (kind in ('bakri','bakra','bheer','bacha')),
  added_on date not null default current_date,
  status text not null default 'active' check (status in ('active','sold','dead')),
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.farm_expense (
  id bigint generated always as identity primary key,
  entry_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  category text not null,
  animal_id bigint references public.farm_animal(id) on delete set null,
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index farm_expense_date_idx on public.farm_expense (entry_date desc);
create index farm_expense_animal_idx on public.farm_expense (animal_id);
create index farm_animal_created_by_idx on public.farm_animal (created_by);
create index farm_expense_created_by_idx on public.farm_expense (created_by);
alter table public.farm_animal enable row level security;
alter table public.farm_expense enable row level security;
create policy "members read farm_animal" on public.farm_animal for select to authenticated using ((select public.is_member()));
create policy "members add farm_animal" on public.farm_animal for insert to authenticated with check ((select public.is_member()));
create policy "members edit farm_animal" on public.farm_animal for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members delete farm_animal" on public.farm_animal for delete to authenticated using ((select public.is_member()));
create policy "members read farm_expense" on public.farm_expense for select to authenticated using ((select public.is_member()));
create policy "members add farm_expense" on public.farm_expense for insert to authenticated with check ((select public.is_member()));
create policy "members edit farm_expense" on public.farm_expense for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members delete farm_expense" on public.farm_expense for delete to authenticated using ((select public.is_member()));

-- ---------------------------------------------------------------
-- Migration: farm_animal_price_and_photo
-- Buy/sale price per animal, and one photo per animal in a private Storage bucket (members only).
alter table public.farm_animal
  add column buy_price numeric(14,2) check (buy_price is null or buy_price >= 0),
  add column sale_price numeric(14,2) check (sale_price is null or sale_price >= 0),
  add column photo_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('farm-photos', 'farm-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "members read farm photos" on storage.objects for select to authenticated
  using (bucket_id = 'farm-photos' and (select public.is_member()));
create policy "members add farm photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'farm-photos' and (select public.is_member()));
create policy "members delete farm photos" on storage.objects for delete to authenticated
  using (bucket_id = 'farm-photos' and (select public.is_member()));
