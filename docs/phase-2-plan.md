# Phase 2 plan: buying online

Phase 1 is live: catalog, quote and service requests, staff admin and invite-only customer accounts. Phase 2 lets customers buy online: a cart, Stripe checkout, core charges and Net-30 terms. Below that are the additions that turn quotes and repairs into online payments.

## What Phase 1 already gives us

- **Price on request is already built in.** `products.price_cents` is nullable. Items with a price can be bought online; items without one stay quote-only.
- **Core charges:** `products.core_charge_cents` exists and the product page already shows it.
- **Shipping inputs:** `products.ship_class` (`parcel` / `ltl` / `pickup_only`) and `weight_lb`.
- **Stock reservations:** `inventory.qty_reserved` exists, and the `in_stock` trigger already subtracts it.
- **Customer accounts** with ship and bill addresses, plus a `tax_exempt` flag that staff approve.
- **Existing building blocks:** Resend for email, `site_settings` for store options, and RLS test files under `supabase/tests/`.

## Decisions

These are agreed defaults. Items marked **Morse to confirm** need a value or wording from Morse before that step goes live. They do not block building it.

| Topic | Decision | Morse to confirm |
| --- | --- | --- |
| Who can buy | Guest checkout for card orders. Net-30 needs an account. Add a public "Request a business account" form, because accounts stay invite-only. | — |
| Shipping | Version 1: flat rates by weight band, edited in Admin → Settings, plus free local pickup. Freight (`ltl`) items don't go through checkout; they get a freight quote request. Step 7 adds live UPS, FedEx and USPS rates through Shippo, quoted to the customer's ZIP code, with the bands as the fallback. | The weight bands and their prices; a Shippo account, the usual box size and any handling fee |
| Sales tax | Stripe Tax (Massachusetts 6.25% and any other state where Morse must collect). Customers with an approved exemption are created in Stripe as tax-exempt. | Which states Morse is registered in |
| Core charges | The core is its own line at checkout, refunded when the old unit comes back and passes inspection. "Exchange" items always carry a core. | Return window (proposed 30 days); what counts as an acceptable core |
| Net-30 | Staff turn on terms and set a credit limit per customer. Billing goes through Stripe Invoicing (hosted payment page, ACH, automatic reminders). An order is blocked if open balance + order total would exceed the limit. | Who qualifies; default limit |
| Accounting | Stripe is the system of record for now. Revisit a QuickBooks sync in step 5. | Which accounting software Morse uses |
| Contractor pricing | Named tiers give a % off list prices; products can have quantity prices. The customer pays the lowest of the three, never stacked. Core charges and shipping aren't discounted. Google Shopping shows list prices. | The tiers, who's on them, and any products to exclude |
| Out of stock | Only in-stock items can be bought online. Out-of-stock items keep "Special order → request a quote". | — |
| Policy pages | Terms of Sale, Returns, Shipping, Warranty and Privacy pages are live as drafts at `/policies/…`. They go final before real payments. | The policy wording and every bracketed `[XX]` value |

## Design

### Cart

- The cart is a cookie holding a list of product IDs and quantities. Prices are never stored in it; they are always re-read from the database.
- Adding to the cart, changing quantities and removing items are server actions on plain forms, so the cart works without JavaScript, like the filter sidebar.
- Lines that are no longer buyable drop out with a notice on the cart page. That covers items that went out of stock, lost their price or were archived.

### Pricing

- One pure function, `lib/orders/pricing.ts`, works out the lines, core charges, shipping and the subtotal before tax. Both the cart page and the Stripe session use it, and it has unit tests.
- Tax comes from Stripe Tax, so the cart page shows "Tax calculated at checkout".

### Checkout

- Stripe's hosted Checkout page. Card details never touch our servers. It gives Apple Pay and Google Pay, ACH, Stripe Tax and shipping options.
- Creating the session reserves stock: `qty_reserved` goes up, and the session expires after 30 minutes.
- Webhook at `app/api/stripe/webhook/route.ts`:
  - `checkout.session.completed`: create the order and its items, move the reserved quantity out of `qty_on_hand`, send the emails.
  - `checkout.session.expired`: release the reservation.
  - The signature is checked on every event. Each event ID is recorded in `stripe_events`, so a repeated event is never processed twice.
- Net-30 customers skip the Stripe page: the order is created straight away, the stock is taken, and a Stripe invoice is sent with `days_until_due: 30`.
- A **store on/off** switch in settings hides cart buttons and refuses checkout while it is off. It is off by default.

### Data (one migration per step; RLS on every table)

- `orders`
  - Reference numbers `O-1001`. Linked to a customer account when there is one, otherwise the guest's email.
  - Status: `pending_payment`, `paid`, `processing`, `shipped`, `ready_for_pickup`, `completed`, `cancelled`, `refunded`.
  - Payment method: `card`, `ach` or `net30`.
  - Totals for subtotal, cores, shipping, tax and grand total.
  - A copy of the ship and bill addresses, tracking number, and Stripe IDs.
- `order_items`: a copy of SKU, name, condition, unit price, core charge and quantity at the time of sale.
- `order_notes`: staff-only notes, following the pattern of `quote_request_notes`.
- `core_returns`: one per order item that carries a core. Status `awaiting`, `received`, `accepted`, `rejected` or `credited`, with a due date and the credit amount.
- `stripe_events`: the IDs of webhook events already processed.
- `customers` gains `terms` (`prepay` or `net30`) and `credit_limit_cents`. Only staff can change them, the same way as `tax_exempt`.

**Who can do what:**

- Customers can read their own orders, items and core returns.
- Staff can read and update everything.
- Orders and payments are written only by the webhook and server actions using the service-role client.
- New test file `supabase/tests/orders_rls.sql`.

### Staff admin

- `/admin/orders` lists orders by status. From an order, staff can:
  - mark it processing
  - enter tracking (emails the customer) or mark it ready for pickup
  - cancel or refund it (through the Stripe API)
  - add notes
- `/admin/cores` shows outstanding and overdue core returns. Staff can record a core as received, then accept it (refund the card or credit the Net-30 invoice) or reject it.
- `/admin/customers/[id]` gains terms, credit limit and open balance.
- New dashboard tiles: new orders, orders to ship and overdue cores.
- New settings: the store on/off switch, shipping rate bands and the core return window.

### Customer account

- `/account/orders` shows order status, tracking and invoices (with links to Stripe's hosted invoice page), plus "Order again".
- Outstanding cores are listed with their due date and return instructions.

### Emails (Resend; never block or fail an order)

- Order confirmation (customer) and a new-order alert (staff)
- Shipped, with tracking; ready for pickup
- Core return reminder 7 days before the due date, and on the due date
- Net-30 invoices and reminders are sent by Stripe

### Environment variables

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Stripe's test keys are used everywhere except production.

## Beyond the cart

1. **Payable quotes.** Done in Step 4. This has the biggest payoff, because most industrial items will stay price-on-request. Staff price a quote request in the admin (lines, cores, shipping), and the customer gets a link to accept and pay, or charge it to Net-30. An accepted quote becomes an order, and `quote_status` moves to `won`.
2. **Approve and pay for repairs online.** Done in Step 4. Service jobs already have a Quote stage. The customer approves or declines the repair quote (from the emailed link or `/account`), and pays online when the job is Ready.
3. **Photo uploads on the public forms.** Done in Step 0: nameplate photos speed up both quotes and repairs.
4. **Equipment list per customer.** Done in Step 5. A customer's motors with their nameplate details, repair history and "order this again". This suits plant maintenance managers.
5. **Cross-reference search.** Done in Step 5. Search by a competitor's or the original manufacturer's part number in the part finder.
6. **Google Shopping free listings.** Done in Step 5: a Merchant Center feed and shipping details in the Product JSON-LD. The return policy is set once in Merchant Center rather than per product.
7. **Contractor and volume pricing.** Done in Step 6: price tiers (a % off list) that staff give customers, and quantity prices per product. A customer pays the lowest of list, quantity and tier price; discounts never stack.
8. **Live parcel rates.** Done in Step 7: real UPS, FedEx and USPS rates through Shippo, quoted to the customer's ZIP code in the cart.
9. **Later:** a QuickBooks sync, live freight (LTL) rates, buying shipping labels from the admin.

## Order of work

Each step is its own PR. Every PR passes `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, adds unit tests for new logic, and extends the RLS tests for new tables.

| Step | Ships | Depends on |
| --- | --- | --- |
| 0 | Photo uploads on the public forms ✅; policy pages with placeholder wording (terms of sale, returns, shipping, warranty, privacy) ✅; Stripe account in test mode (Morse sets this up) | — |
| 1 | Cart, card/ACH checkout for parcel and pickup items, orders, webhook, stock reservations, emails, `/admin/orders`, `/account/orders`, store switch and shipping settings ✅ (items with a core charge stay quote-only until step 2) | Step 0 |
| 2 | Core charges at checkout, core returns tracking, refunds and credits, reminders ✅ | Step 1 |
| 3 | Net-30 terms, credit limits, Stripe Invoicing, the "Request a business account" form ✅ | Step 1 |
| 4 | Payable quotes; online repair approval and payment ✅ | Step 1 (Step 3 for paying on terms) |
| 5 | Merchant Center feed ✅, equipment lists ✅, cross-reference search ✅; live parcel rates and an accounting sync wait on Morse choosing a carrier account and accounting software | — |
| 6 | Contractor price tiers and quantity prices, in the cart, checkout, Net-30 and catalog quotes ✅ | Step 1 |
| 7 | Live parcel rates through Shippo, with the weight bands as the fallback ✅ | Step 1; a Shippo account to switch on |

### Before turning the store on

The full, up-to-date list of what people need to do is in [`launch-checklist.md`](launch-checklist.md). In short:


- Real prices and stock are in the catalog.
- Morse has supplied the policy wording and warranty terms.
- Stripe account is verified, the bank is connected and Stripe Tax is registered for the right states.
- Shipping bands and the core return window are set in Admin → Settings.
- A test order has gone through end to end in production with a live card and been refunded.
