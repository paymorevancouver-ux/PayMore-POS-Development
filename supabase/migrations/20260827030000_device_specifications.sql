-- Structured device specifications for purchase intake and inventory listings.
-- Backward compatible: existing rows receive empty JSON / empty title.

alter table if exists public.pos_purchase_items
  add column if not exists specifications jsonb not null default '{}'::jsonb;

alter table if exists public.pos_purchase_items
  add column if not exists listing_title text not null default '';

alter table if exists public.pos_inventory
  add column if not exists specifications jsonb not null default '{}'::jsonb;

alter table if exists public.pos_inventory
  add column if not exists listing_title text not null default '';
