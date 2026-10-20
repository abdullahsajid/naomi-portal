-- Run once in the Supabase SQL editor (existing projects). New installs get this from schema.sql.
-- Lets an artwork with several units in stock be reserved by several customers, one unit each.

-- 1) A sold unit keeps counting against the artwork until the owner has lowered the stock in
--    Big Cartel (the API cannot do it). Existing rows are treated as already synced.
alter table reservations add column if not exists stock_synced boolean not null default true;

-- 2) One-live-reservation-per-artwork no longer holds (several units can be held at once).
drop index if exists one_live_reservation_per_product;
create index if not exists reservations_taken_idx
  on reservations (product_id)
  where status in ('locking', 'active', 'receipt_uploaded') or (status = 'sold' and not stock_synced);

-- 3) Which artworks WE have hidden on Big Cartel, and what status to put back.
create table if not exists held_products (
  product_id text primary key,
  original_status text not null,
  hidden_at timestamptz not null default now()
);
alter table held_products enable row level security;

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
