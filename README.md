# Morse Electric Motor Co.

Website for Morse Electric Motor Co.: sales and service of electric motors, pumps, blowers, vacuum pumps, starters and alternators.

Built with Next.js 16 (App Router), Tailwind CSS 4, Supabase (Postgres + Storage), Resend and Cloudflare Turnstile.

## What's here (Phase 1)

| Route | What it does |
| --- | --- |
| `/` | Home: part finder, product lines, in-stock items, repair process, services |
| `/shop`, `/shop/[category]` | Catalog with filters for condition, stock, HP, RPM, enclosure, power and frame, plus search and sort. Filters live in the URL. |
| `/products/[slug]` | Product detail: condition variants, specs, stock, "request price & availability", Product JSON-LD |
| `/quote` | Quote request (prefilled from a product with `?sku=`) |
| `/service` | Repair services, service request form, field service |
| `/contact` | Phone, address, hours |

Quote and service requests are stored in Supabase with a reference number (`Q-1001`, `SR-1001`). Staff get an email notification and customers get a confirmation.

Every page has a **Light / Mid / Dark** theme switch in the top bar. The choice is saved in the browser, and the first visit follows the device's dark-mode setting. Colours are semantic tokens in `app/globals.css`; `__tests__/theme-contrast.test.ts` fails the build if any text or control pair drops below WCAG AA contrast in any theme.

## Staff admin (`/admin`)

| Route | What it does |
| --- | --- |
| `/admin` | Dashboard: new quotes, open and rush service jobs, out-of-stock and draft products |
| `/admin/products` | Search and filter the catalog; add, edit, archive or delete products; photos; stock |
| `/admin/import` | CSV import with a preview (new, updated, unchanged, problems by row) before anything is saved; template download |
| `/admin/products/export` | The whole catalog as CSV, in the same format the importer reads |
| `/admin/quotes`, `/admin/service` | Request inboxes with status and private staff notes |

**Adding a staff member:** create the user in the Supabase dashboard (Authentication → Users → Add user), then run in the SQL editor:

```sql
insert into public.staff (user_id, role)
select id, 'admin' from auth.users where email = 'person@example.com';
```

Turn off public sign-ups (Authentication → Sign In / Providers) — staff accounts are only ever created by hand. Access is enforced by row-level security (`private.is_staff()`), and every admin page and server action re-checks it.

**CSV import rules:** rows match existing products by SKU (a new SKU creates a product); only the columns present in the file change; new products need a name and category. Common header names (`Part #`, `Horsepower`, `Qty on hand`, …) are recognised, and values like `$1,299`, `7½`, `TEFC` and `3 phase` are understood.

Planned next: photo uploads on the public forms, then Phase 2 (cart, Stripe checkout, accounts, core charges, Net-30).

## Getting started

```bash
npm install
cp .env.example .env.local   # optional; see below
npm run dev
```

Without Supabase credentials the site serves a **preview catalog** of placeholder products and shows a banner saying so. The request forms validate input, but then explain that online requests aren't available.

### Connecting Supabase

1. Create a Supabase project and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in `.env.local`.
2. Apply the schema: `supabase link --project-ref <ref>` then `supabase db push`.
3. Optionally load the placeholder catalog: `npm run seed:catalog`.

For a local stack, run `supabase start`, then `supabase db reset` and `supabase test db` (row-level security tests live in `supabase/tests/`, including `staff_rls.sql` for the admin permissions).

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm test` | Vitest unit tests |
| `npm run seed:catalog` | Upsert the placeholder catalog into Supabase |

## Placeholders to replace

Business details (phone, address, hours, service area, email) come from `NEXT_PUBLIC_MORSE_*` env vars and render as `[PHONE]`-style placeholders until set. We still need from Morse:
- the real parts list (SKU, specs, condition, price, stock)
- product photography
- warranty terms (currently `[XX]-month`)
- which brands they are authorized to sell
