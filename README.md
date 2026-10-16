# Morse Electric Motor Co.

Live at **https://morseelectricmotor.com** (`www.` and the old `morse-electric.vercel.app` address redirect there).

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
| `/policies/[slug]` | Terms of sale, returns, shipping & pickup, warranty and privacy. Wording is a draft with `[XX]` values to confirm: each page shows a draft notice and stays out of search results until its `draft` flag in `lib/policies.ts` is turned off. |

Quote and service requests are stored in Supabase with a reference number (`Q-1001`, `SR-1001`). Staff get an email notification and customers get a confirmation. Both forms take up to 4 photos (nameplate, damage, installation); the browser shrinks large photos first, and staff see them on the request in the admin.

Every page has a **Light / Mid / Dark** theme switch in the top bar. The choice is saved in the browser. First-time visitors get the site default, which staff set at **/admin/settings** (Light out of the box; Mid, Dark or "match the device" are the other options). Colours are semantic tokens in `app/globals.css`; `__tests__/theme-contrast.test.ts` fails the build if any text or control pair drops below WCAG AA contrast in any theme.

## Online store (Phase 2)

Customers can buy in-stock items online and pay by card (including Apple Pay and Google Pay) or by ACH bank transfer through Stripe Checkout. The store stays off until staff switch it on at **/admin/settings**, and checkout also needs the Stripe keys.

| Route | What it does |
| --- | --- |
| `/cart` | The cart: change quantities, choose shipping or free pickup, check out. Works without JavaScript. |
| `/checkout/success` | The order confirmation Stripe returns customers to |
| `/account/orders` | A signed-in customer's orders, with status, tracking and "Order again" |
| `/admin/orders` | Orders to fulfil: mark as being prepared, shipped (with tracking) or ready for pickup, then completed; cancel or refund in full; staff notes |

**What can be bought online:** active products with a price, in stock, that ship by parcel or are pickup-only. Items with a core charge (including exchange units) and freight (LTL) items stay "Request a quote" until core charges arrive in step 2.

**Shipping:** staff set parcel rates by order weight at /admin/settings (e.g. up to 10 lb $15, up to 50 lb $45). Pickup is always free. Orders that are heavier than the top band, or that include an item with no weight on file, can only be picked up.

**Stock:** starting checkout reserves the stock for 31 minutes (`inventory.qty_reserved`, so the item can show as out of stock to others). Payment takes it off the shelf, and an abandoned checkout releases it. ACH orders hold their stock while the bank payment clears; a failed payment puts it back. All of this happens in database functions (`supabase/migrations/20261016170815_orders.sql`), so a repeated Stripe event never moves stock twice.

**Setting up Stripe:**
1. Set `STRIPE_SECRET_KEY` in Vercel. Use a test key (`sk_test_…`) for previews and the live key for production.
2. In Stripe → Developers → Webhooks, add an endpoint at `https://morseelectricmotor.com/api/stripe/webhook` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Turn on Stripe Tax (Settings → Tax): set the shop's origin address and add a Massachusetts registration, plus any other state where Morse collects tax. Checkout calculates tax automatically, and approved tax-exempt customers are marked exempt in Stripe when they check out signed in.
4. In Settings → Payment methods, turn on cards, Apple Pay / Google Pay and ACH Direct Debit (US bank account).
5. At /admin/settings, enter the shipping bands and tick **Take orders online**.

## Staff admin (`/admin`)

| Route | What it does |
| --- | --- |
| `/admin` | Dashboard: orders to fulfil, new quotes, open and rush service jobs, out-of-stock and draft products |
| `/admin/products` | Search and filter the catalog; add, edit, archive or delete products; photos; stock |
| `/admin/import` | CSV import with a preview (new, updated, unchanged, problems by row) before anything is saved; template download |
| `/admin/products/export` | The whole catalog as CSV, in the same format the importer reads |
| `/admin/quotes`, `/admin/service` | Request inboxes with status and private staff notes |
| `/admin/customers` | Invite customers, approve tax exemption, make new sign-in links, remove accounts |

**Adding a staff member:** create the user in the Supabase dashboard (Authentication → Users → Add user), then run in the SQL editor:

```sql
insert into public.staff (user_id, role)
select id, 'admin' from auth.users where email = 'person@example.com';
```

Turn off public sign-ups (Authentication → Sign In / Providers) — staff accounts are only ever created by hand. Access is enforced by row-level security (`private.is_staff()`), and every admin page and server action re-checks it.

## Customer accounts (`/account`)

Invite-only: staff create the account at **/admin/customers → Invite customer**. That creates the login, links any earlier requests sent from the same email, and gives a one-time link (emailed when Resend is set up, otherwise copy it and send it yourself). The customer opens it, chooses a password and can then:

- follow repair jobs through Received → Inspection → Quote → Repair → Testing → Ready
- see their quote requests
- keep company details, shipping and billing addresses on file, and upload a tax-exemption certificate (staff approve it)
- get the quote and service forms filled in automatically; requests sent while signed in appear in their account

Sign-in links use Supabase's **Email OTP expiration** (Authentication → Providers → Email; default 1 hour, max 24 hours). Staff can always make a new link from the customer's page. "Forgot your password?" needs Resend and Turnstile configured. Creating, re-linking and removing logins needs `SUPABASE_SECRET_KEY`.

**CSV import rules:** rows match existing products by SKU (a new SKU creates a product); only the columns present in the file change; new products need a name and category. Common header names (`Part #`, `Horsepower`, `Qty on hand`, …) are recognised, and values like `$1,299`, `7½`, `TEFC` and `3 phase` are understood.

Phase 2 is in progress: the online store is built (step 1); next come core charges, Net-30 and payable quotes. See [`docs/phase-2-plan.md`](docs/phase-2-plan.md).

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
4. Optionally give those products stand-in photos from Wikimedia Commons: `npm run seed:photos -- --dry-run` to check each pick and its license, then `npm run seed:photos`. Picks live in `scripts/product-photos.ts`; only public domain, CC0, CC BY and CC BY-SA files are accepted, and the product page shows them as “representative” with the author and license. Products with staff-uploaded photos are skipped.

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
| `npm run seed:photos` | Attach free-licensed stand-in photos (`--dry-run` to preview, `--replace` to swap) |

## Placeholders to replace

Phone, email, address, hours and service area are edited by staff at **/admin/settings** (stored in `public.site_settings`) and show on every page, the contact page's structured data and emails. The address is set (380 East Broadway, Gardner, MA 01440); anything left blank renders as a `[PHONE]`-style placeholder. We still need from Morse:
- the real parts list (SKU, specs, condition, price, stock)
- product photography (stand-in Commons photos fill the gap until then; staff remove them from each product's Photos panel once they upload their own)
- warranty terms (currently `[XX]-month`)
- which brands they are authorized to sell
