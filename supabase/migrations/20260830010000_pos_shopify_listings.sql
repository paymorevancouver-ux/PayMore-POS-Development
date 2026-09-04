-- Phase 1: Shopify Auto Lister drafts.
-- Safe / additive only. Does not modify or delete existing POS data.
-- Run this in the DEVELOPMENT Supabase SQL editor.

create table if not exists public.pos_shopify_listings (
  id text primary key,
  store_id text not null,
  inventory_item_id text not null,
  status text not null default 'draft',
  title text not null default '',
  description text not null default '',
  price numeric not null default 0,
  compare_at_price numeric,
  quantity integer not null default 1,
  condition text,
  shopify_vendor text not null default '',
  shopify_product_type text not null default '',
  sku text not null default '',
  barcode text not null default '',
  tags jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  accessories jsonb not null default '[]'::jsonb,
  testing_results jsonb not null default '{}'::jsonb,
  staff_notes text not null default '',
  shopify_product_id text,
  shopify_variant_id text,
  shopify_inventory_item_id text,
  shopify_handle text,
  shopify_url text,
  last_error text,
  created_by_employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  last_synced_at timestamptz,
  ended_at timestamptz,
  constraint pos_shopify_listings_status_check
    check (status in ('draft', 'ready', 'publishing', 'active', 'error', 'ended', 'sold')),
  constraint pos_shopify_listings_quantity_check
    check (quantity >= 0)
);

create index if not exists pos_shopify_listings_store_idx
  on public.pos_shopify_listings (store_id);

create index if not exists pos_shopify_listings_inventory_idx
  on public.pos_shopify_listings (inventory_item_id);

create index if not exists pos_shopify_listings_status_idx
  on public.pos_shopify_listings (store_id, status);

create index if not exists pos_shopify_listings_updated_idx
  on public.pos_shopify_listings (store_id, updated_at desc);

-- One live Shopify listing per inventory item (drafts/ready/error/ended/sold may coexist historically).
create unique index if not exists pos_shopify_listings_one_active
  on public.pos_shopify_listings (store_id, inventory_item_id)
  where status in ('publishing', 'active');

-- Foreign keys only when the referenced POS tables exist (matches current schema).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pos_stores'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'pos_shopify_listings'
      and constraint_name = 'pos_shopify_listings_store_fk'
  ) then
    alter table public.pos_shopify_listings
      add constraint pos_shopify_listings_store_fk
      foreign key (store_id) references public.pos_stores(id);
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pos_inventory'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'pos_shopify_listings'
      and constraint_name = 'pos_shopify_listings_inventory_fk'
  ) then
    alter table public.pos_shopify_listings
      add constraint pos_shopify_listings_inventory_fk
      foreign key (inventory_item_id) references public.pos_inventory(id);
  end if;
end $$;

create or replace function public.pos_shopify_listings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pos_shopify_listings_set_updated_at on public.pos_shopify_listings;
create trigger pos_shopify_listings_set_updated_at
  before update on public.pos_shopify_listings
  for each row
  execute function public.pos_shopify_listings_touch_updated_at();

-- Compatible with the current development POS: PIN/role auth is client-side
-- and the app uses the Supabase anon key (no Supabase Auth session).
alter table public.pos_shopify_listings enable row level security;

drop policy if exists pos_shopify_listings_anon_all on public.pos_shopify_listings;
create policy pos_shopify_listings_anon_all
  on public.pos_shopify_listings
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.pos_shopify_listings to anon, authenticated;
