-- Run in Supabase SQL editor.

create table reservations (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,          -- e.g. BT-YXC7GE
  product_id text not null,
  option_id text,                          -- filled once the product has been fetched
  product_name text,
  product_image text,
  amount numeric,                          -- AUD, after discount
  customer_name text not null,
  customer_email text not null,
  shipping_address text not null,
  status text not null,                    -- locking | active | receipt_uploaded | sold | expired | released | failed
  original_status text,                    -- Big Cartel product status before we hid it; restored on expiry/release/cleanup
  expires_at timestamptz,
  receipt_path text,
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Only ONE live reservation per artwork. This is what blocks simultaneous clicks.
create unique index one_live_reservation_per_product
  on reservations (product_id)
  where status in ('locking', 'active', 'receipt_uploaded');

create table settings (
  id int primary key default 1,
  bank_name text, account_name text, account_number text,
  swift_code text, bsb text,
  payment_instructions text,
  discount_amount numeric default 300,     -- AUD off Big Cartel price
  enabled_product_ids text[] default '{}', -- empty = all products
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into settings (id) values (1) on conflict do nothing;

create table alerts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id),
  bigcartel_order_id text unique,
  message text,
  created_at timestamptz default now()
);

-- All access goes through the server with the service-role key (which bypasses RLS).
-- Enabling RLS with no policies blocks the anon key entirely.
alter table reservations enable row level security;
alter table settings enable row level security;
alter table alerts enable row level security;

insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict (id) do nothing;
