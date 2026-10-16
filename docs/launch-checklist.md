# Launch checklist

Everything that needs a person (you or Morse) rather than code. Updated with each Phase 2 step. ✅ means done.

Last updated: Phase 2, step 3 (Net-30 terms and business account requests).

## 1. Right now

- [ ] Review [PR #8](https://github.com/apptillionai/morse-electric/pull/8) (Phase 2 plan, steps 0–3) and merge it.
- [x] ✅ Request-photos migration applied to the live database.
- [x] ✅ Orders migration applied to the live database.
- [x] ✅ Core-returns migration applied to the live database.
- [ ] Net-30 migration (`20261016190000_net30.sql`) applied to the live database. Claude does this once you say so. **It must happen before the merge**: the admin and cart pages read the new columns.
- [ ] After the merge, send one quote request with a photo on the live site and open it in Admin → Quotes to check the photo shows. (Previews can't save requests: they don't have `SUPABASE_SECRET_KEY`.)

## 2. Vercel environment variables

Already set for Production: Supabase (URL, publishable key, secret key), Resend (`RESEND_API_KEY`, `MORSE_EMAIL_FROM`, `MORSE_STAFF_EMAIL`), Turnstile (both keys) and `NEXT_PUBLIC_SITE_URL`.

Still to add (Project → Settings → Environment Variables):

- [ ] `STRIPE_SECRET_KEY`: a test key (`sk_test_…`) on Preview, the live key (`sk_live_…`) on Production.
- [ ] `STRIPE_WEBHOOK_SECRET`: from the Stripe webhook endpoint (section 3), one per environment.
- [ ] `CRON_SECRET`: any long random string, on Production. It switches on the daily core-return reminders (Vercel sends it to `/api/cron/core-reminders`).
- [ ] Optional, to test the full store on previews: copy `SUPABASE_SECRET_KEY`, the Turnstile keys and the Resend keys to Preview too. Previews share the live database, so test orders there are real rows; use Stripe test keys only.
- [ ] Redeploy after adding variables.

## 3. Stripe

- [ ] Create the Stripe account (or confirm Morse's) and finish its business verification and bank account.
- [ ] Developers → Webhooks: add `https://morseelectricmotor.com/api/stripe/webhook` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `invoice.voided` and `invoice.marked_uncollectible`. Do it in test mode and again in live mode; each gives its own signing secret.
- [ ] Settings → Tax: set the origin address (380 East Broadway, Gardner, MA 01440) and add a Massachusetts registration, plus any other state where Morse collects tax.
- [ ] Settings → Payment methods: turn on cards, Apple Pay / Google Pay and ACH Direct Debit (US bank account).
- [ ] Settings → Billing → Invoices (for Net-30): turn on the invoice emails Stripe sends to customers, choose how they can pay an invoice (card and ACH bank transfer), and optionally turn on payment reminders for overdue invoices.
- [ ] Optional: Settings → Branding (logo, colours) for the checkout page, invoices and receipts.
- [ ] Test mode, end to end:
  - [ ] Buy something by card (`4242 4242 4242 4242`). Check the order appears in Admin → Orders, the stock goes down, and the confirmation email arrives.
  - [ ] Pay by ACH with Stripe's test bank account. The order shows "Awaiting bank payment", then "Paid".
  - [ ] Buy an item with a core charge. Mark the core received, then "Accept & refund" in Admin → Cores. Check the partial refund in Stripe.
  - [ ] Mark an order shipped with tracking and check the email.
  - [ ] Cancel an order and check the refund and restock.
  - [ ] Net-30: put a test customer on terms in Admin → Customers, with a company address on their profile. Sign in as them, choose "Charge to my account", and check that the invoice email arrives. Pay it with the test card, and check the order shows "Invoice paid". Try an order over the limit (it should be refused). Cancel a Net-30 order and check the invoice is voided.
  - [ ] Send a business account request from /account/request. Invite it from Admin → Customers.
- [ ] Switch Production to the live keys and live webhook secret.

## 4. Morse to supply or decide

**Catalog**
- [ ] Real parts list: prices, stock and **weights**. Items without a weight can't be shipped, only picked up.
- [ ] Core charges on remanufactured and exchange items. Exchange items can't be sold online until they have one.
- [ ] Product photography (stand-in photos fill the gap until then).
- [ ] Which brands Morse is authorized to sell.

**Store settings** (Admin → Settings)
- [ ] Shipping bands: price by order weight, e.g. up to 10 lb $15, up to 50 lb $45, up to 100 lb $95.
- [ ] Core return window (default 30 days).
- [ ] Business phone, email, hours and service area (they show as [PHONE]-style placeholders until set).

**Policies and tax**
- [ ] Wording for terms of sale, returns, shipping, warranty and privacy at `/policies/…`, including every bracketed `[XX]` value: warranty months, restocking fee, return window, late-fee rate, cut-off time. Once approved, Claude turns off each page's draft flag.
- [ ] What counts as an acceptable core (in the terms of sale).
- [ ] **Ask Morse's accountant whether core charges are taxable** in Massachusetts. Right now Stripe taxes them like the item.
- [ ] The states where Morse is registered to collect sales tax.

**Net-30**
- [ ] Who qualifies for Net-30 terms, and a typical credit limit. Staff set both per customer in Admin → Customers.
- [ ] Wording for Net-30 in the terms of sale: due date, late fees and holding orders when past due. The draft already has a `[1.5]%` late fee to confirm.
- [ ] Which accounting software Morse uses (QuickBooks?). Invoices live in Stripe for now.

## 5. Optional hardening (Supabase advisor)

- [ ] Authentication → Providers → Email: set the email OTP expiry to an hour or less. Customer sign-in links then last an hour.
- [ ] Authentication → Settings: turn on leaked-password protection.

## 6. Go live

- [ ] Everything in sections 2–4 that the store needs: Stripe keys and webhook, Stripe Tax, prices and weights, shipping bands.
- [ ] Admin → Settings → tick **Take orders online**.
- [ ] Place one real order with a real card and refund it from Admin → Orders.
