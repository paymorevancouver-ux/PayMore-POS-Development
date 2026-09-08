-- Additive: POS inventory retail barcode (source of truth, shared with Shopify).
-- Does not drop or rewrite existing columns.

alter table if exists public.pos_inventory
  add column if not exists barcode text;

create unique index if not exists pos_inventory_barcode_unique
  on public.pos_inventory (barcode)
  where barcode is not null and barcode <> '';

create unique index if not exists pos_shopify_listings_barcode_unique
  on public.pos_shopify_listings (barcode)
  where barcode is not null and barcode <> '';
