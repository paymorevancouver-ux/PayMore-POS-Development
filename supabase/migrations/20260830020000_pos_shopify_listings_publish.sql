-- Phase 2: additive publish metadata for Shopify Auto Lister.
-- Safe / non-destructive. Does not drop columns or existing data.

alter table if exists public.pos_shopify_listings
  add column if not exists shopify_admin_url text;

alter table if exists public.pos_shopify_listings
  add column if not exists shopify_storefront_url text;

alter table if exists public.pos_shopify_listings
  add column if not exists publish_attempts integer not null default 0;

alter table if exists public.pos_shopify_listings
  add column if not exists last_publish_attempt_at timestamptz;

alter table if exists public.pos_shopify_listings
  add column if not exists publish_warning text;

alter table if exists public.pos_shopify_listings
  add column if not exists shopify_location_id text;
