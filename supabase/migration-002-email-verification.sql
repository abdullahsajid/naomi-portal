-- Run once in the Supabase SQL editor (existing projects). New installs get this from schema.sql.

-- 1) Structured customer details on reservations.
alter table reservations add column if not exists phone text;
alter table reservations add column if not exists street text;
alter table reservations add column if not exists suburb text;
alter table reservations add column if not exists state text;
alter table reservations add column if not exists postcode text;
alter table reservations add column if not exists country text;
alter table reservations add column if not exists ip_hash text; -- salted hash, used only for rate limiting

-- 2) Pending email verifications. The artwork is NOT held until a code is confirmed.
create table if not exists email_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_hash text not null,
  product_id text not null,
  payload jsonb not null,          -- the submitted form, reserved only after a correct code
  code_hash text not null,         -- HMAC of the 6-digit code, never the code itself
  attempts int not null default 0, -- wrong guesses; locked after 5
  consumed boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists email_verifications_email_idx on email_verifications (email, created_at);
create index if not exists email_verifications_ip_idx on email_verifications (ip_hash, created_at);
alter table email_verifications enable row level security;

-- Rate-limit lookups on reservations.
create index if not exists reservations_ip_idx on reservations (ip_hash, created_at);
create index if not exists reservations_email_idx on reservations (customer_email, created_at);
