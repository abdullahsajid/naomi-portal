# Naomi Katz Art: bank transfer portal

A small web app that sits next to the Big Cartel store. A customer can buy an artwork by bank transfer at a discount: they enter their details, confirm their email with a 6-digit code, get 15 minutes to pay and upload a receipt, and the artwork is held for them until the owner confirms the payment in the admin dashboard.

Big Cartel's API cannot change stock, so while every unit of an artwork is spoken for it is switched to "sold out" with a reserved marker: it stays visible with a TEMPORARILY RESERVED label and no buy buttons, and goes back on sale when a unit frees up.

## Stack

Next.js (App Router) and TypeScript, Tailwind CSS, Supabase (Postgres and private file storage), Resend for email, Netlify for hosting, cron-job.org for the timers.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values, see docs/INSTALL.md
npm run dev                  # http://localhost:3000
```

Run the SQL in `supabase/schema.sql` in your Supabase project first.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run bc-test -- <product_id>` | Hide and restore one product on Big Cartel (API check) |
| `npm run race-test -- <product_id>` | Five simultaneous reservations; exactly one must win |
| `npm run email-preview` | Write the email templates to `.email-preview/` for viewing in a browser |

## Documentation

- [docs/INSTALL.md](docs/INSTALL.md): environment, Supabase, Netlify, cron jobs, theme button
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): guide for the store owner

