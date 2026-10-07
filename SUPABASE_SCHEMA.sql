-- STICHA Supabase starter schema
-- Run in Supabase SQL Editor after creating your project.
-- IMPORTANT: keep RLS enabled. Never expose a service_role key in frontend code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  business_name text,
  phone text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  gender text,
  category text,
  photo_url text,
  unit text not null default 'in' check (unit in ('in','cm')),
  notes text,
  start_date date,
  delivery_date date,
  order_price numeric(12,2) default 0,
  amount_paid numeric(12,2) default 0,
  order_status text not null default 'In progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  garment_type text not null default 'Dress',
  unit text not null default 'in' check (unit in ('in','cm')),
  values jsonb not null default '{}'::jsonb,
  custom_values jsonb not null default '[]'::jsonb,
  measured_at timestamptz not null default now()
);

create index if not exists customers_user_id_idx on public.customers(user_id);
create index if not exists customers_delivery_date_idx on public.customers(delivery_date);
create index if not exists measurements_customer_id_idx on public.measurements(customer_id);

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.measurements enable row level security;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists customers_own on public.customers;
create policy customers_own on public.customers for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists measurements_own on public.measurements;
create policy measurements_own on public.measurements for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage bucket for customer photos (create as private in Storage UI or with your deployment tooling).
-- Recommended path: {auth.uid()}/{customer_id}/photo.jpg

-- Optional customer-photo Storage policies.
-- First create a PRIVATE bucket named `customer-photos` in Supabase Storage.
-- Then run these policies:

drop policy if exists customer_photos_select on storage.objects;
create policy customer_photos_select on storage.objects for select to authenticated
using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists customer_photos_insert on storage.objects;
create policy customer_photos_insert on storage.objects for insert to authenticated
with check (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists customer_photos_update on storage.objects;
create policy customer_photos_update on storage.objects for update to authenticated
using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists customer_photos_delete on storage.objects;
create policy customer_photos_delete on storage.objects for delete to authenticated
using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- STICHA profile photos
-- These buckets are public so the app can display profile/customer photos with stable URLs.
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('customer-photos', 'customer-photos', true)
on conflict (id) do update set public = true;

drop policy if exists profile_avatars_select on storage.objects;
create policy profile_avatars_select on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists profile_avatars_insert on storage.objects;
create policy profile_avatars_insert on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists profile_avatars_update on storage.objects;
create policy profile_avatars_update on storage.objects for update to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists profile_avatars_delete on storage.objects;
create policy profile_avatars_delete on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Replace the earlier customer-photo bucket behavior with the same public display setup.
drop policy if exists customer_photos_select on storage.objects;
create policy customer_photos_select on storage.objects for select to authenticated
using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists customer_photos_insert on storage.objects;
create policy customer_photos_insert on storage.objects for insert to authenticated
with check (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists customer_photos_update on storage.objects;
create policy customer_photos_update on storage.objects for update to authenticated
using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists customer_photos_delete on storage.objects;
create policy customer_photos_delete on storage.objects for delete to authenticated
using (bucket_id = 'customer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
