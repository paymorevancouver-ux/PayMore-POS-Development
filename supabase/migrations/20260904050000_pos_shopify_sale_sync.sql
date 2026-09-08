-- Phase 3: Shopify ↔ POS sale, inventory, cancellation, refund, and return sync.
-- Additive only. Does not recreate pos_sales, pos_returns, pos_inventory, or pos_shopify_listings.

-- ── Sale channel / Shopify relationship ─────────────────────────────────────
alter table public.pos_sales
  add column if not exists shopify_order_id text,
  add column if not exists shopify_order_name text,
  add column if not exists shopify_customer_name text,
  add column if not exists shopify_customer_email text,
  add column if not exists shopify_order_url text;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'pos_sales'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%sales_channel%'
  loop
    execute format('alter table public.pos_sales drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.pos_sales
  drop constraint if exists pos_sales_sales_channel_check;

alter table public.pos_sales
  add constraint pos_sales_sales_channel_check
  check (sales_channel in ('in-store', 'online', 'phone', 'marketplace', 'shopify'));

create unique index if not exists pos_sales_shopify_order_id_uidx
  on public.pos_sales (shopify_order_id)
  where shopify_order_id is not null;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'pos_payments'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%method%'
  loop
    execute format('alter table public.pos_payments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.pos_payments
  drop constraint if exists pos_payments_method_check;

alter table public.pos_payments
  add constraint pos_payments_method_check
  check (method in ('cash', 'debit', 'credit', 'etransfer', 'store-credit', 'other', 'shopify'));

alter table public.pos_returns
  add column if not exists restock_sellable boolean not null default true;

alter table public.pos_shopify_listings
  add column if not exists sync_status text not null default 'idle',
  add column if not exists last_sync_error text,
  add column if not exists last_sync_event_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_shopify_listings_sync_status_check'
  ) then
    alter table public.pos_shopify_listings
      add constraint pos_shopify_listings_sync_status_check
      check (sync_status in ('idle', 'pending', 'synced', 'error'));
  end if;
end $$;

-- ── Webhook idempotency ─────────────────────────────────────────────────────
create table if not exists public.pos_shopify_webhook_events (
  id uuid primary key default gen_random_uuid(),
  shopify_webhook_id text unique not null,
  topic text not null,
  shopify_order_id text,
  shopify_refund_id text,
  status text not null default 'received',
  payload_hash text,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  constraint pos_shopify_webhook_events_status_check
    check (status in ('received', 'processing', 'success', 'error', 'ignored'))
);

create index if not exists pos_shopify_webhook_events_order_idx
  on public.pos_shopify_webhook_events (shopify_order_id);

create index if not exists pos_shopify_webhook_events_topic_idx
  on public.pos_shopify_webhook_events (topic, created_at desc);

-- ── Shopify order mapping ───────────────────────────────────────────────────
create table if not exists public.pos_shopify_orders (
  id text primary key,
  store_id text not null,
  shopify_order_id text unique not null,
  shopify_order_name text,
  financial_status text,
  fulfillment_status text,
  currency text,
  subtotal numeric,
  tax numeric,
  total numeric,
  customer_name text,
  customer_email text,
  pos_sale_id text,
  status text not null default 'paid',
  shopify_order_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_shopify_orders_status_check
    check (status in ('paid', 'cancelled', 'partially_refunded', 'refunded', 'error'))
);

create index if not exists pos_shopify_orders_store_idx
  on public.pos_shopify_orders (store_id);

create index if not exists pos_shopify_orders_sale_idx
  on public.pos_shopify_orders (pos_sale_id);

create table if not exists public.pos_shopify_order_items (
  id text primary key,
  shopify_order_id text not null,
  shopify_line_item_id text unique not null,
  shopify_product_id text,
  shopify_variant_id text,
  shopify_inventory_item_id text,
  sku text,
  quantity integer not null,
  unit_price numeric,
  pos_inventory_item_id text,
  pos_sale_item_id text,
  quantity_refunded integer not null default 0,
  quantity_restocked integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_shopify_order_items_qty_check check (quantity >= 0),
  constraint pos_shopify_order_items_refunded_check check (quantity_refunded >= 0),
  constraint pos_shopify_order_items_restocked_check check (quantity_restocked >= 0)
);

create index if not exists pos_shopify_order_items_order_idx
  on public.pos_shopify_order_items (shopify_order_id);

create index if not exists pos_shopify_order_items_inventory_idx
  on public.pos_shopify_order_items (pos_inventory_item_id);

create table if not exists public.pos_shopify_refunds (
  id text primary key,
  shopify_refund_id text unique not null,
  shopify_order_id text not null,
  restocked boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Sync diagnostics ────────────────────────────────────────────────────────
create table if not exists public.pos_shopify_sync_events (
  id uuid primary key default gen_random_uuid(),
  store_id text,
  direction text,
  event_type text not null,
  inventory_item_id text,
  listing_id text,
  pos_sale_id text,
  pos_return_id text,
  shopify_order_id text,
  shopify_refund_id text,
  quantity_before integer,
  quantity_after integer,
  shopify_quantity integer,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint pos_shopify_sync_events_status_check
    check (status in ('pending', 'success', 'error', 'skipped'))
);

create index if not exists pos_shopify_sync_events_store_idx
  on public.pos_shopify_sync_events (store_id, created_at desc);

create index if not exists pos_shopify_sync_events_inventory_idx
  on public.pos_shopify_sync_events (inventory_item_id, created_at desc);

-- Foreign keys only when referenced tables exist.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pos_stores') then
    if not exists (select 1 from pg_constraint where conname = 'pos_shopify_orders_store_fk') then
      alter table public.pos_shopify_orders
        add constraint pos_shopify_orders_store_fk
        foreign key (store_id) references public.pos_stores(id);
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pos_sales') then
    if not exists (select 1 from pg_constraint where conname = 'pos_shopify_orders_sale_fk') then
      alter table public.pos_shopify_orders
        add constraint pos_shopify_orders_sale_fk
        foreign key (pos_sale_id) references public.pos_sales(id);
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pos_inventory') then
    if not exists (select 1 from pg_constraint where conname = 'pos_shopify_order_items_inventory_fk') then
      alter table public.pos_shopify_order_items
        add constraint pos_shopify_order_items_inventory_fk
        foreign key (pos_inventory_item_id) references public.pos_inventory(id);
    end if;
  end if;
end $$;

alter table public.pos_shopify_webhook_events enable row level security;
alter table public.pos_shopify_orders enable row level security;
alter table public.pos_shopify_order_items enable row level security;
alter table public.pos_shopify_refunds enable row level security;
alter table public.pos_shopify_sync_events enable row level security;

drop policy if exists pos_shopify_webhook_events_anon_all on public.pos_shopify_webhook_events;
create policy pos_shopify_webhook_events_anon_all
  on public.pos_shopify_webhook_events for all to anon, authenticated using (true) with check (true);

drop policy if exists pos_shopify_orders_anon_all on public.pos_shopify_orders;
create policy pos_shopify_orders_anon_all
  on public.pos_shopify_orders for all to anon, authenticated using (true) with check (true);

drop policy if exists pos_shopify_order_items_anon_all on public.pos_shopify_order_items;
create policy pos_shopify_order_items_anon_all
  on public.pos_shopify_order_items for all to anon, authenticated using (true) with check (true);

drop policy if exists pos_shopify_refunds_anon_all on public.pos_shopify_refunds;
create policy pos_shopify_refunds_anon_all
  on public.pos_shopify_refunds for all to anon, authenticated using (true) with check (true);

drop policy if exists pos_shopify_sync_events_anon_all on public.pos_shopify_sync_events;
create policy pos_shopify_sync_events_anon_all
  on public.pos_shopify_sync_events for all to anon, authenticated using (true) with check (true);

-- ── Atomic inventory RPCs ───────────────────────────────────────────────────
create or replace function public.pos_sell_inventory_atomic(
  p_inventory_id text,
  p_quantity integer,
  p_sold_at timestamptz default now()
) returns jsonb
language plpgsql
as $$
declare
  rec public.pos_inventory%rowtype;
  remaining integer;
  new_status text;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Sale quantity must be at least 1';
  end if;

  select * into rec
  from public.pos_inventory
  where id = p_inventory_id
  for update;

  if not found then
    raise exception 'Inventory item not found';
  end if;

  if rec.quantity_on_hand < p_quantity then
    raise exception 'INSUFFICIENT_STOCK:%', rec.quantity_on_hand;
  end if;

  remaining := rec.quantity_on_hand - p_quantity;
  if remaining < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  if remaining > 0 then
    new_status := case when rec.status = 'sold' then 'listed' else rec.status end;
    update public.pos_inventory
      set quantity_on_hand = remaining,
          status = new_status,
          sold_at = null
      where id = p_inventory_id;
  else
    new_status := 'sold';
    remaining := 0;
    update public.pos_inventory
      set quantity_on_hand = 0,
          status = 'sold',
          sold_at = p_sold_at
      where id = p_inventory_id;
  end if;

  return jsonb_build_object(
    'quantity_on_hand', remaining,
    'status', new_status,
    'sold_at', case when remaining = 0 then p_sold_at else null end,
    'fully_sold', remaining = 0
  );
end;
$$;

create or replace function public.pos_restore_inventory_atomic(
  p_inventory_id text,
  p_quantity integer,
  p_target_status text,
  p_sellable boolean default true
) returns jsonb
language plpgsql
as $$
declare
  rec public.pos_inventory%rowtype;
  new_qty integer;
  new_status text;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Restore quantity cannot be negative';
  end if;

  select * into rec
  from public.pos_inventory
  where id = p_inventory_id
  for update;

  if not found then
    raise exception 'Inventory item not found';
  end if;

  if p_sellable is not true or p_quantity = 0 then
    if p_sellable is not true then
      update public.pos_inventory
        set status = 'defective'
        where id = p_inventory_id;
      new_status := 'defective';
    else
      new_status := rec.status;
    end if;
    return jsonb_build_object(
      'quantity_on_hand', rec.quantity_on_hand,
      'status', new_status,
      'sold_at', rec.sold_at,
      'restocked', false
    );
  end if;

  new_qty := rec.quantity_on_hand + p_quantity;
  new_status := coalesce(nullif(p_target_status, ''), 'listed');
  if new_qty > 0 and new_status in ('sold', 'returned') then
    new_status := 'listed';
  end if;

  update public.pos_inventory
    set quantity_on_hand = new_qty,
        status = new_status,
        sold_at = null
    where id = p_inventory_id;

  return jsonb_build_object(
    'quantity_on_hand', new_qty,
    'status', new_status,
    'sold_at', null,
    'restocked', true
  );
end;
$$;

grant execute on function public.pos_sell_inventory_atomic(text, integer, timestamptz) to anon, authenticated, service_role;
grant execute on function public.pos_restore_inventory_atomic(text, integer, text, boolean) to anon, authenticated, service_role;
