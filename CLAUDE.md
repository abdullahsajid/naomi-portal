# Naomi Katz Art – Bank Transfer Reservation Portal

## Goal
A small web app connected to a Big Cartel store. Customers can buy an artwork by bank transfer (discounted). When they reserve, the artwork's Big Cartel product status is set to `hidden` (the API cannot change stock), a 15-minute timer starts, bank details are shown, and they upload a payment receipt. If no receipt within 15 minutes, status goes back to `active`. Admin verifies payment manually in a dashboard.

Scale: ~19 artworks, 1 unit each, used a few times a year. Keep it simple, cheap (free tiers), low maintenance.

## Stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres database + Storage (private bucket `receipts`)
- Resend: transactional emails (from hello@naomikatzart.com once domain is verified)
- Hosting: Netlify (free plan, commercial use allowed)
- Cron: external cron (cron-job.org) calling protected API routes every minute
- Big Cartel API v1 with HTTP Basic auth (personal project mode)

## Environment variables
```
BIGCARTEL_SUBDOMAIN=        # e.g. littlelostland
BIGCARTEL_PASSWORD=         # store password (entered by client on live)
BIGCARTEL_ACCOUNT_ID=       # from GET /v1/accounts
BIGCARTEL_USER_AGENT="NaomiKatzPortal/1.0 (hello@naomikatzart.com)"
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=  # server only, never exposed to browser
RESEND_API_KEY=
EMAIL_FROM="Naomi Katz Art <hello@naomikatzart.com>"
ADMIN_EMAIL=hello@naomikatzart.com
ADMIN_PASSWORD=             # dashboard login
SESSION_SECRET=             # for signed admin cookie
CRON_SECRET=                # required header for cron routes
RESERVATION_MINUTES=15
NEXT_PUBLIC_SITE_URL=          # e.g. https://pay.naomikatzart.com, used for links in emails
```

## Big Cartel API notes
- Base URL: `https://api.bigcartel.com/v1`
- Required headers on every request:
  - `Accept: application/vnd.api+json`
  - `Content-Type: application/vnd.api+json` (when sending a body)
  - `User-Agent: <name>/<version> (<contact>)` — missing it returns 400
  - `Authorization: Basic base64(subdomain:password)`
- Get products: `GET /accounts/{account_id}/products`
- Get product: `GET /accounts/{account_id}/products/{product_id}?include=options` (options include `quantity`, read-only)
- Update product: `PATCH /accounts/{account_id}/products/{product_id}`
- Orders: `GET /accounts/{account_id}/orders?sort=-created_at` (items include `product_id`, transactions include `processor`)
- No webhooks available (invite-only) → use polling.
- The API cannot create orders → bank transfer sales live only in our dashboard.
- **Stock cannot be changed via the API.** Option `quantity` is read-only (tested: product PATCH ignores/rejects `options`; every option route 404s). `PATCH /products/{id}` only accepts `name, description, status, on_sale, permalink, password`.
- **We lock artworks with `status`:** `PATCH` body `{"data":{"id":"<pid>","type":"products","attributes":{"status":"hidden"}}}`; restore with `"active"`. `sold-out` is rejected by the API (422), so use `hidden`.
- **Tested behaviour of `hidden` (Oct 2026):** the product URL redirects to the store home; add-to-cart silently adds nothing; items already in a customer's cart are removed; `GET /checkout` redirects to `/cart`. Restoring to `active` makes the product purchasable again with quantity unchanged. (Not tested: a customer already on the external payment processor page when the status flips. That tiny window is covered by the `cron/orders` alerts.)
- Hidden products are still readable via the API, so the portal gets name/price/image from the API, not the storefront.
- **FIRST TASK (done):** `scripts/bc-test.ts` probes the API. Result: use the status approach above.

## Database (Supabase / Postgres)
```sql
create table reservations (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,          -- e.g. BT-YXC7GE
  product_id text not null,
  option_id text,                          -- option_id/product_name/product_image/amount are filled after the lock (step 3/5)
  product_name text,
  product_image text,
  amount numeric,                          -- AUD, after discount
  customer_name text not null,
  customer_email text not null,
  shipping_address text not null,
  status text not null,                    -- locking | active | receipt_uploaded | sold | expired | released | failed
  original_status text,                    -- Big Cartel product status before we hid it; restored EXACTLY on expiry/release/cleanup
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
  updated_at timestamptz default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id),
  bigcartel_order_id text unique,
  message text,
  created_at timestamptz default now()
);
```

## Reserve flow (POST /api/reserve) — must be race-safe
1. Validate input (name, email, address, product_id, terms checkbox).
2. INSERT reservation with `status='locking'`.
   - If unique index violation → return 409 "This artwork is currently reserved." STOP.
3. Fetch product from Big Cartel. If `status` is not `active` or option quantity is 0 → set reservation `failed`, return 409. STOP.
4. Save `original_status` on the reservation, then PATCH Big Cartel `status` to `hidden`. If the call fails → set reservation `failed`, return 500. STOP.
5. Update reservation: `status='active'`, `expires_at = now() + 15 min`, amount = price − discount.
6. Send customer email (reservation started + reference). Return reservation id.
7. Bank details are ONLY returned by `GET /api/reservation/{id}` when status is `active` or `receipt_uploaded`. Never send bank details before step 5 succeeds.

## Receipt upload (POST /api/reservation/{id}/receipt)
- Only allowed if status is `active` and `expires_at > now()`.
- Accept image or PDF, **max 4MB** (Netlify functions cap request bodies at ~6MB; raise it only by switching to Supabase signed upload URLs), store in private bucket `receipts/{reservation_id}/...`.
- Set `status='receipt_uploaded'`, clear expiry.
- Email customer (receipt received, artwork held while payment is verified) and admin (new receipt + dashboard link).

## Cron routes (require header `x-cron-secret: CRON_SECRET`)
- `POST /api/cron/expire` (every minute): for reservations `active` with `expires_at < now()` → PATCH Big Cartel `status` back to the reservation's `original_status`, set `expired`, email customer.
  - Also clean up `locking` rows older than 2 minutes (crash safety): restore `original_status` (if it was recorded), mark `failed`.
- `POST /api/cron/orders` (every 2 minutes): fetch recent Big Cartel orders; if any order item matches a product with a live reservation → insert into `alerts` (dedupe by order id) and email admin.

## Customer pages (match the 3 reference screens)
1. `/reserve/[productId]` — "Official Naomi Katz Art Payment Portal", "Buy by bank transfer and save A$300", How it works (3 steps), Continue / Cancel.
2. Details form — full name, email, shipping address, terms checkbox, "Reserve artwork & view bank details".
3. `/reservation/[id]` — countdown timer, "PAY IN AUD ONLY" warning, amount, bank details with copy buttons, payment reference, receipt upload, info note.
- Also show product image + name. Mobile-first. Font should match the main store (TBC).
- Handle states: reserved by someone else, expired, receipt uploaded (thank-you state).

## Admin dashboard (`/admin`, password login, signed httpOnly cookie)
- Reservations table: filter by status, show customer, artwork, amount, reference, time left.
- Reservation detail: view receipt (signed URL), buttons:
  - **Mark as sold** → status `sold`, product stays `hidden` (TBC with client: maybe show as sold instead), email customer.
  - **Release** → status `released`, PATCH status to `original_status`.
- Stock page: list Big Cartel products with current status and quantity; show each product's current status (active/hidden) with a manual toggle.
- Settings page: bank details, payment instructions, discount amount, which artworks offer bank transfer.
- Alerts list (Stripe/checkout conflicts).

## Big Cartel theme snippet
A button on product pages linking to `https://pay.naomikatzart.com/reserve/{{ product.id }}`, shown only when the product `status` is `active` (Liquid: `{% if product.status == 'active' %}`; verify the exact variable in the theme). Provide the snippet + install guide in `docs/INSTALL.md`.

## Rules
- All Big Cartel and Supabase service-key calls happen server-side only.
- Every state change goes through a single server function so Big Cartel status and DB never drift.
- Log every Big Cartel API call result (success/failure) to the console.
- Keep dependencies minimal.

## Deliverables
- Working app deployed on Netlify
- `docs/INSTALL.md`: env setup, Supabase SQL, cron-job.org setup, theme snippet, how to update the Big Cartel password
- `docs/ADMIN_GUIDE.md`: simple guide for the client
