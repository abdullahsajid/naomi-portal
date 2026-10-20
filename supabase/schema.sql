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
  phone text,
  street text,
  suburb text,
  state text,
  postcode text,
  country text,
  ip_hash text,                            -- salted hash, used only for rate limiting
  original_status text,                    -- Big Cartel product status when this was reserved (informational)
  stock_synced boolean not null default true, -- false while a sold unit still has to be taken off the stock in Big Cartel
  expires_at timestamptz,
  receipt_path text,
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- A reservation holds one unit. These rows count against an artwork's stock.
create index reservations_taken_idx
  on reservations (product_id)
  where status in ('locking', 'active', 'receipt_uploaded') or (status = 'sold' and not stock_synced);

-- Artworks WE have hidden on Big Cartel (all units held), and the status to restore.
create table held_products (
  product_id text primary key,
  original_status text not null,
  hidden_at timestamptz not null default now()
);

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

-- Pending email verifications. The artwork is NOT held until a code is confirmed.
create table email_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_hash text not null,
  product_id text not null,
  payload jsonb not null,
  code_hash text not null,
  attempts int not null default 0,
  consumed boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index email_verifications_email_idx on email_verifications (email, created_at);
create index email_verifications_ip_idx on email_verifications (ip_hash, created_at);
create index reservations_ip_idx on reservations (ip_hash, created_at);
create index reservations_email_idx on reservations (customer_email, created_at);

-- 4) Take one unit atomically. The advisory lock serialises requests for the same artwork, so the
--    count and the insert cannot interleave: two customers can never take more units than exist.
--    Returns null when every unit is already taken.
create or replace function reserve_unit(p_product_id text, p_capacity integer, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taken integer;
  v_id uuid;
  v_ref text;
begin
  perform pg_advisory_xact_lock(hashtextextended('reserve:' || p_product_id, 0));

  select count(*) into v_taken
  from reservations
  where product_id = p_product_id
    and (status in ('locking', 'active', 'receipt_uploaded') or (status = 'sold' and not stock_synced));

  if v_taken >= p_capacity then
    return null;
  end if;

  insert into reservations (
    reference, product_id, customer_name, customer_email, phone, street, suburb, state, postcode,
    country, shipping_address, ip_hash, status
  ) values (
    p_row->>'reference', p_product_id, p_row->>'customer_name', p_row->>'customer_email', p_row->>'phone',
    p_row->>'street', p_row->>'suburb', p_row->>'state', p_row->>'postcode', p_row->>'country',
    p_row->>'shipping_address', p_row->>'ip_hash', 'locking'
  )
  returning id, reference into v_id, v_ref;

  return jsonb_build_object('id', v_id, 'reference', v_ref, 'taken', v_taken + 1);
end;
$$;

revoke all on function reserve_unit(text, integer, jsonb) from public, anon, authenticated;
grant execute on function reserve_unit(text, integer, jsonb) to service_role;

-- All access goes through the server with the service-role key (which bypasses RLS).
-- Enabling RLS with no policies blocks the anon key entirely.
alter table reservations enable row level security;
alter table settings enable row level security;
alter table alerts enable row level security;
alter table email_verifications enable row level security;
alter table held_products enable row level security;

insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict (id) do nothing;
