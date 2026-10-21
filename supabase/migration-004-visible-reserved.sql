-- Run once in the Supabase SQL editor (existing projects). New installs get this from schema.sql.
-- A reserved artwork now stays visible ("sold out" + "on sale" flag) instead of being hidden, so we also
-- remember the on_sale value to put back.
alter table held_products add column if not exists original_on_sale boolean not null default false;
