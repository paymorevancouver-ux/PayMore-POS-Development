-- Additive listing metadata for the MultiTab Auto Lister description workflow.
-- Safe / non-destructive. Does not drop columns or existing data.

alter table if exists public.pos_shopify_listings
  add column if not exists extra_title_text text not null default '';

alter table if exists public.pos_shopify_listings
  add column if not exists cosmetic_condition text;

alter table if exists public.pos_shopify_listings
  add column if not exists cosmetic_condition_notes text;

alter table if exists public.pos_shopify_listings
  add column if not exists functionality_condition text;

alter table if exists public.pos_shopify_listings
  add column if not exists functionality_notes text;

alter table if exists public.pos_shopify_listings
  add column if not exists description_mode text not null default 'generated';

alter table if exists public.pos_shopify_listings
  add column if not exists include_not_listed_warning boolean not null default true;

alter table if exists public.pos_shopify_listings
  add column if not exists origin_country text;

alter table if exists public.pos_shopify_listings
  add column if not exists public_notes text;

alter table if exists public.pos_shopify_listings
  add column if not exists title_mode text not null default 'generated';
