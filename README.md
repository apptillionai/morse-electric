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
| `/account/request` | "Request a business account": a public form staff review at /admin/customers, with an option to apply for Net-30 terms |
| `/admin/cores` | Core returns: what customers owe back, overdue ones first; mark received, then accept and refund the core charge, or reject with a reason; extend a due date |
| `/quotes/<link>` | A priced quote, opened from the emailed link (no sign-in needed): approve or decline a repair, or pay (card, ACH or Net-30) |
| `/account/quotes/<id>` | The same quote from the customer's account |

**What can be bought online:** active products with a price, in stock, that ship by parcel or are pickup-only. Freight (LTL) items stay "Request a quote", and so do exchange units until they have a core charge set.

**Core charges:** a product's core charge is added at checkout as its own refundable line. Placing the order opens a core return, due back after the return window set at /admin/settings (30 days by default). The customer sees what they owe, the due date and return instructions in their emails and account. Staff mark the core received at /admin/cores, then "Accept & refund", which refunds that amount through Stripe, or reject it with a reason the customer sees. A daily job (`/api/cron/core-reminders`, scheduled in `vercel.json`, needs `CRON_SECRET`) emails a reminder a week before the due date and a notice once it's overdue. Cancelling or refunding a whole order closes its open cores.

**Shipping:** staff set parcel rates by order weight at /admin/settings (e.g. up to 10 lb $15, up to 50 lb $45). Pickup is always free. Orders that are heavier than the top band, or that include an item with no weight on file, can only be picked up.

**Stock:** starting checkout reserves the stock for 31 minutes (`inventory.qty_reserved`, so the item can show as out of stock to others). Payment takes it off the shelf, and an abandoned checkout releases it. ACH orders hold their stock while the bank payment clears; a failed payment puts it back. All of this happens in database functions (`supabase/migrations/20261016170815_orders.sql`), so a repeated Stripe event never moves stock twice.

**Net-30 terms:** staff put a customer on Net-30 with a credit limit on the customer's admin page. That customer then sees "Charge to my account" at checkout, with their available credit. The order skips Stripe Checkout: the database checks the limit (unpaid invoices plus this order, with the account locked), places the order as "Charged to account" and takes the stock. Then a Stripe invoice is created, finalized and emailed, due in 30 days, with Stripe Tax worked out from the address on the customer's profile. The order is ready to fulfil straight away. Stripe's `invoice.paid`, `invoice.voided` and `invoice.marked_uncollectible` events keep the invoice status on the order up to date. Cancelling an order voids its invoice (or credits and refunds it if paid), and a returned core is taken off the invoice, or credited to the next one. New customers can ask for an account (and terms) at /account/request; staff see the requests on /admin/customers and invite with one click.

**Payable quotes and repairs:** on a quote request or service job in the admin, staff write a quote: lines (parts, labour, core charges), a shipping price (blank means pickup only), how long it's valid and a message. "Save and send" emails the customer a private link (only a hash of it is stored; "Resend" makes a new one, and the old stops working). To change a sent quote, "Edit" takes it back to draft. On a parts quote, the customer orders by paying: card or ACH through Stripe Checkout, or on account if they're signed in with Net-30 terms. On a repair quote, they approve or decline the work first; once the job is Ready, staff press "Email the payment link" (or the customer sees "Pay online" in their account). Paying creates an ordinary order (fulfilled at /admin/orders like any other) and marks the quote paid and the request won. Quote orders don't change stock, because quoted items are usually special orders. Declining marks the request lost or the job "Quote declined", with the customer's reason. Paying a quote works whenever Stripe is set up, even with the store switched off.

**Setting up Stripe:**
1. Set `STRIPE_SECRET_KEY` in Vercel. Use a test key (`sk_test_…`) for previews and the live key for production.
2. In Stripe → Developers → Webhooks, add an endpoint at `https://morseelectricmotor.com/api/stripe/webhook` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Turn on Stripe Tax (Settings → Tax): set the shop's origin address and add a Massachusetts registration, plus any other state where Morse collects tax. Checkout calculates tax automatically, and approved tax-exempt customers are marked exempt in Stripe when they check out signed in.
4. In Settings → Payment methods, turn on cards, Apple Pay / Google Pay and ACH Direct Debit (US bank account).
5. Set `CRON_SECRET` in Vercel (any long random string) for the core-return reminders.
6. At /admin/settings, enter the shipping bands, check the core return window and tick **Take orders online**.

Everything still to do before launch, for you and for Morse, is in [`docs/launch-checklist.md`](docs/launch-checklist.md).

## Staff admin (`/admin`)

| Route | What it does |
| --- | --- |
| `/admin` | Dashboard: orders to fulfil, overdue cores, new quotes, open and rush service jobs, out-of-stock and draft products |
| `/admin/products` | Search and filter the catalog; add, edit, archive or delete products; photos; stock |
| `/admin/import` | CSV import with a preview (new, updated, unchanged, problems by row) before anything is saved; template download |
| `/admin/products/export` | The whole catalog as CSV, in the same format the importer reads |
| `/admin/quotes`, `/admin/service` | Request inboxes with status and private staff notes; write, send and follow a quote on each request |
| `/admin/customers` | Business account requests to invite or dismiss; invite customers, approve tax exemption, set Net-30 terms and credit limits, make new sign-in links, remove accounts |

**Adding a staff member:** create the user in the Supabase dashboard (Authentication → Users → Add user), then run in the SQL editor:

```sql
insert into public.staff (user_id, role)
select id, 'admin' from auth.users where email = 'person@example.com';
```

Turn off public sign-ups (Authentication → Sign In / Providers) — staff accounts are only ever created by hand. Access is enforced by row-level security (`private.is_staff()`), and every admin page and server action re-checks it.

## Customer accounts (`/account`)

Invite-only: staff create the account at **/admin/customers → Invite customer**. That creates the login, links any earlier requests sent from the same email, and gives a one-time link (emailed when Resend is set up, otherwise copy it and send it yourself). The customer opens it, chooses a password and can then:

- follow repair jobs through Received → Inspection → Quote → Repair → Testing → Ready
- see their quote requests, approve repair quotes and pay quotes online
- keep company details, shipping and billing addresses on file, and upload a tax-exemption certificate (staff approve it)
- get the quote and service forms filled in automatically; requests sent while signed in appear in their account
- keep an **equipment list** (`/account/equipment`): each unit's nameplate details, where it is, its repair history, "Request a repair" (which fills in the service form and links the job to the unit) and, for motors, "Find a replacement" (a shop search by HP, speed, frame, enclosure and power). Staff see the list on the customer's admin page and the unit on the job.

Sign-in links use Supabase's **Email OTP expiration** (Authentication → Providers → Email; default 1 hour, max 24 hours). Staff can always make a new link from the customer's page. "Forgot your password?" needs Resend and Turnstile configured. Creating, re-linking and removing logins needs `SUPABASE_SECRET_KEY`.

**Cross-references:** a product's "Cross-references" (admin form, or the `Cross references` CSV column, separated by `;`) are the part numbers it replaces: other brands', the original manufacturer's. The shop search, part finder and admin product search match any of them, and the SKU and manufacturer part #, however they're punctuated (`EM-3615T` finds `EM3615T`). A result found by a cross-reference says "Replaces …", and the product page lists them.

**Google Shopping:** `/feeds/google.xml` is a Merchant Center product feed. It lists products only while the store is open, and only those a customer can buy online at the listed price: priced, no core charge, shipped by parcel with a weight inside a shipping band, and with one of Morse's own photos (stand-ins don't count). Product pages also carry the shipping price in their structured data.

**CSV import rules:** rows match existing products by SKU (a new SKU creates a product); only the columns present in the file change; new products need a name and category. Common header names (`Part #`, `Horsepower`, `Qty on hand`, …) are recognised, and values like `$1,299`, `7½`, `TEFC` and `3 phase` are understood.

Phase 2: the online store (step 1), core charges (step 2), Net-30 terms (step 3), payable quotes with online repair approval (step 4), and the Merchant Center feed, cross-reference search and equipment lists (step 5) are built. Live UPS/FedEx rates and an accounting sync wait on Morse's choices (see the launch checklist). See [`docs/phase-2-plan.md`](docs/phase-2-plan.md).

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
