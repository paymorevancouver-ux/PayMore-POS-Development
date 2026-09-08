-- Additive inventory listing-method fields. Non-destructive.

alter table if exists public.pos_inventory
  add column if not exists listing_method text;

alter table if exists public.pos_inventory
  add column if not exists processed_at timestamptz;

alter table if exists public.pos_inventory
  add column if not exists processed_by_employee_id text;

-- Safe backfill only:
-- Listed + an active Shopify listing → shopify
-- Listed + no Shopify listing rows at all → processed_manual
-- Anything else (drafts/errors/ended only) stays null for manual review.

update public.pos_inventory i
set listing_method = 'shopify'
where i.status = 'listed'
  and (i.listing_method is null or i.listing_method = '')
  and exists (
    select 1
    from public.pos_shopify_listings l
    where l.inventory_item_id = i.id
      and l.status = 'active'
  );

update public.pos_inventory i
set listing_method = 'processed_manual'
where i.status = 'listed'
  and (i.listing_method is null or i.listing_method = '')
  and not exists (
    select 1
    from public.pos_shopify_listings l
    where l.inventory_item_id = i.id
  );
