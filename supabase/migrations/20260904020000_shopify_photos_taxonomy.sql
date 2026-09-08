-- Additive Shopify Auto Lister refinements: photo upload sessions, taxonomy columns, private storage bucket.
-- Safe / non-destructive.

create table if not exists public.shopify_photo_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text unique not null,
  listing_id text not null,
  store_id text not null,
  employee_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists shopify_photo_upload_sessions_token_idx
  on public.shopify_photo_upload_sessions (session_token);

create index if not exists shopify_photo_upload_sessions_listing_idx
  on public.shopify_photo_upload_sessions (listing_id);

alter table public.shopify_photo_upload_sessions enable row level security;

alter table if exists public.pos_shopify_listings
  add column if not exists shopify_category_id text;

alter table if exists public.pos_shopify_listings
  add column if not exists shopify_category_name text;

alter table if exists public.pos_shopify_listings
  add column if not exists shopify_category_full_name text;

alter table if exists public.pos_shopify_listings
  add column if not exists shopify_category_confirmed boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shopify-listing-photos',
  'shopify-listing-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
