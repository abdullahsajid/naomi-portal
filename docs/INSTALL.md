# Install & deploy guide

Naomi Katz Art – bank transfer reservation portal. Everything runs on free tiers: Netlify (hosting), Supabase (database + receipt storage), Resend (email), cron-job.org (timers).

## How it works in one paragraph

Big Cartel's API **cannot change stock**, so the portal locks an artwork by setting its product **status to `hidden`**. A hidden product disappears from the store (its page redirects to the home page, add-to-cart does nothing, carts that already contain it are emptied). When the reservation ends, the portal puts back the product's **original status**. The database enforces one live reservation per artwork, so simultaneous clicks can't double-book.

## 1. Environment variables

Copy these into `.env.local` for local work, and into Netlify (Site configuration → Environment variables) for production.

| Variable | What it is |
|---|---|
| `BIGCARTEL_SUBDOMAIN` | Store subdomain, e.g. `littlelostland` |
| `BIGCARTEL_PASSWORD` | The Big Cartel account password (see section 7) |
| `BIGCARTEL_ACCOUNT_ID` | Numeric id from `GET /v1/accounts` (for this store: `13112631`) |
| `BIGCARTEL_USER_AGENT` | `NaomiKatzPortal/1.0 (hello@naomikatzart.com)` (Big Cartel rejects requests without it) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key. Server only, never share it |
| `RESEND_API_KEY` | From resend.com. Without it, emails are skipped (everything else still works) |
| `EMAIL_FROM` | `Naomi Katz Art <hello@naomikatzart.com>` (needs the domain verified in Resend) |
| `ADMIN_EMAIL` | Where receipt and conflict alerts are sent |
| `ADMIN_PASSWORD` | Password for `/admin` |
| `SESSION_SECRET` | Long random string that signs the admin login cookie |
| `CRON_SECRET` | Long random string; cron-job.org sends it in the `x-cron-secret` header |
| `RESERVATION_MINUTES` | Optional, default `15` |
| `NEXT_PUBLIC_SITE_URL` | `https://pay.naomikatzart.com` (used for links in emails) |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Use **new, never-shared** values for `ADMIN_PASSWORD`, `SESSION_SECRET` and `CRON_SECRET` in production.

## 2. Supabase

1. Create a free project at supabase.com.
2. SQL Editor → New query → paste all of [`supabase/schema.sql`](../supabase/schema.sql) → Run. It creates the tables, the "one live reservation per artwork" rule, row-level security, and the private `receipts` bucket.
3. Project Settings → API Keys: copy the **service_role** key. Project URL: Data API page. (The code accepts the URL with or without a trailing `/rest/v1/`.)
4. After the first deploy, log in to `/admin` → **Settings** and enter the bank details and discount.

**Free-tier note:** Supabase pauses free projects after about a week with no activity. The every-minute cron jobs (section 4) count as activity and keep it awake. If you ever pause the cron jobs for a long time, restore the project from the Supabase dashboard.

## 3. Deploy to Netlify

1. Push the project to a Git repo (GitHub/GitLab) and in Netlify choose **Add new site → Import an existing project**.
2. Build settings are read from `netlify.toml` (`npm run build`, Node 22). Netlify detects Next.js automatically.
3. Add all the environment variables from section 1.
4. **Domain:** Domain management → Add `pay.naomikatzart.com`, then create the DNS record Netlify shows (usually a `CNAME` for `pay` → your `*.netlify.app` address) at the domain registrar. HTTPS is issued automatically.
5. Deploy, then open `https://pay.naomikatzart.com/admin/login`.

Limits to know about: Netlify functions have a ~6 MB request cap, so receipt uploads are limited to **4 MB**; and a function times out after about 10 s on the free plan (fine at this scale, each cron run makes only a few calls).

## 4. Cron jobs (cron-job.org)

Reservations only expire when something checks the clock. Create two free jobs at cron-job.org:

| Title | URL | Schedule | Method |
|---|---|---|---|
| Expire reservations | `https://pay.naomikatzart.com/api/cron/expire` | every 1 minute | POST |
| Check card orders | `https://pay.naomikatzart.com/api/cron/orders` | every 2 minutes | POST |

For **both**: Advanced → Headers → add `x-cron-secret` with the value of `CRON_SECRET`. A correct run returns `200` with a small JSON body; a wrong secret returns `401`. Turn on "notify on failure".

- *Expire* puts expired artworks back on sale, emails the customer, and cleans up reservations that crashed half-way.
- *Orders* checks Big Cartel for card orders on an artwork that is currently reserved and raises an alert (see the admin guide).

## 5. Resend (email)

1. Create an account at resend.com → Domains → add `naomikatzart.com` → add the DNS records it lists (SPF/DKIM) at the registrar → wait for "Verified".
2. Create an API key and set `RESEND_API_KEY` and `EMAIL_FROM`.

## 6. Big Cartel theme button

The theme snippet is in [`docs/bank-transfer-button.liquid`](./bank-transfer-button.liquid).

1. Big Cartel admin → **Design** → **Customize** → **Edit theme code** (custom theme code needs a paid plan, check the plan on the account).
2. Open the **product page template** (the file that renders a single product; usually named `product` ) and paste the snippet just under the Add to cart button.
3. Save, then **test both states**:
   - an `active` artwork shows the button and it opens `https://pay.naomikatzart.com/reserve/<id>`;
   - a sold-out artwork does **not** show it.

The snippet uses `product.id` and `product.status`. If the button never appears, the theme exposes the status under a different name: tell the developer and the condition is a one-line change.

## 7. Updating the Big Cartel password

The portal logs in to Big Cartel with the account's subdomain and **password**. If the password changes, **every reservation will fail** until it's updated here:

1. Netlify → Site configuration → Environment variables → edit `BIGCARTEL_PASSWORD`.
2. **Trigger a redeploy** (Deploys → Trigger deploy), because env changes only apply to new builds.
3. Check: `/admin/stock` should list the artworks again.

## 8. Local development

```bash
npm install
npm run dev                          # http://localhost:3000
npm run bc-test -- <product_id>      # hide/restore one product on Big Cartel
npm run race-test -- <product_id>    # 5 simultaneous reservations (dev server must be running)
```

Test an artwork that no customer is looking at: both scripts briefly hide it and restore it.
