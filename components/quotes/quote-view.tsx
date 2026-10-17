import Link from "next/link";
import { payQuoteAction, respondToQuoteAction } from "@/app/actions/quotes";
import { Button } from "@/components/ui/button";
import { formatDueDate } from "@/lib/orders/types";
import { customerStep, deliveryOptions, quoteTotals, type CustomerStep } from "@/lib/quotes/logic";
import { isQuotePayError, QUOTE_PAY_ERRORS } from "@/lib/quotes/pay";
import { lineValues, quoteKind, quoteState, quoteTitle, type Quote } from "@/lib/quotes/store";
import { formatPrice } from "@/lib/utils";

const money = (cents: number) => formatPrice(cents) ?? "";
const heading = "mb-1 font-display text-xl font-bold uppercase tracking-[0.04em]";
const choice = "flex cursor-pointer gap-3 rounded border border-edge-strong p-3 has-checked:border-bold";
const radio = "mt-1 size-[18px] accent-fg";

export interface QuoteViewProps {
  quote: Quote;
  /** How this page reached the quote; the forms send it back. */
  access: { token: string } | { quoteId: string };
  search: { done?: string; error?: string; cancelled?: string; fulfillment?: string; payment?: string };
  /** Set when the signed-in customer owns the quote and has Net-30 terms. */
  account: { availableCents: number; limitCents: number; shipTo: string | null } | null;
  /** Stripe is set up, so payment can happen online. */
  canPay: boolean;
  business: { street: string; cityStateZip: string; callUs: string };
  /** Where the paid order can be seen (signed-in owner only). */
  orderHref: string | null;
  back?: { href: string; label: string };
}

function Notice({ tone, children }: { tone: "ok" | "warn" | "danger"; children: React.ReactNode }) {
  const color = { ok: "border-ok text-ok", warn: "border-warn text-fg", danger: "border-danger text-danger" }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded border-2 bg-surface px-4 py-3 text-sm font-medium ${color}`}>
      {children}
    </p>
  );
}

function statusLine(step: CustomerStep, quote: Quote): string {
  switch (step.step) {
    case "approve":
      return `Approve it and we’ll start the repair. You pay once it’s finished. Valid until ${formatDueDate(quote.valid_until)}.`;
    case "pay":
      return quote.status === "approved"
        ? "Your repair is finished. Pay online and choose pickup or delivery."
        : `Order and pay online. Valid until ${formatDueDate(quote.valid_until)}.`;
    case "in_progress":
      return "You approved this quote. We’re on the repair and will email you when it’s ready; you can pay online then.";
    case "closed":
      return {
        expired: `This quote expired on ${formatDueDate(quote.valid_until)}. Ask us for an updated price.`,
        declined: "You declined this quote.",
        withdrawn: "We’ve withdrawn this quote. We’ll send you a new one, or get in touch.",
        paid: `Paid${quote.order ? `: order ${quote.order.reference}` : ""}. Thank you.`,
        draft: "This quote isn’t ready yet.",
        empty: "This quote has nothing on it yet. Please get in touch.",
      }[step.reason];
  }
}

/** Hidden fields that tell the server action which quote this is. */
function AccessFields({ access }: { access: QuoteViewProps["access"] }) {
  return "token" in access ? <input type="hidden" name="token" value={access.token} /> : <input type="hidden" name="quote_id" value={access.quoteId} />;
}

function DeclineForm({ access, label }: { access: QuoteViewProps["access"]; label: string }) {
  return (
    <details className="rounded-md border border-edge bg-surface p-4">
      <summary className="cursor-pointer font-semibold">{label}</summary>
      <form action={respondToQuoteAction} className="mt-3 flex flex-col gap-3">
        <AccessFields access={access} />
        <input type="hidden" name="response" value="decline" />
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Anything we should know? <span className="font-normal text-fg-muted">(optional)</span>
          <textarea name="reason" rows={3} maxLength={1000} className="rounded border border-edge-strong bg-surface p-3 font-normal" />
        </label>
        <div>
          <Button type="submit" variant="quiet" size="sm">Decline the quote</Button>
        </div>
      </form>
    </details>
  );
}

export function QuoteView({ quote, access, search, account, canPay, business, orderHref, back }: QuoteViewProps) {
  const lines = lineValues(quote.lines);
  const step = customerStep(quoteState(quote));
  const repair = quoteKind(quote) === "repair";
  const options = deliveryOptions(quote.shipping_cents);
  const pickup = quoteTotals(lines, quote.shipping_cents, "pickup");
  const wantsShip = search.fulfillment ? search.fulfillment === "ship" : options[0] === "ship";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 pt-12 pb-20">
      <div className="flex flex-col gap-3">
        {back && <p className="text-sm"><Link href={back.href}>← {back.label}</Link></p>}
        <span className="eyebrow">Quote {quote.reference}</span>
        <h1 className="display text-4xl sm:text-5xl">{quoteTitle(quote)}</h1>
        <p className="max-w-3xl text-lg text-fg-muted">{statusLine(step, quote)}</p>
      </div>

      {search.done === "approved" && <Notice tone="ok">Thanks, you’ve approved the repair. We’ll get started and email you when it’s ready.</Notice>}
      {search.done === "declined" && <Notice tone="ok">You’ve declined the quote. We’ll be in touch.</Notice>}
      {search.cancelled && step.step === "pay" && <Notice tone="warn">Payment cancelled. Nothing was charged; you can try again below.</Notice>}
      {search.error &&
        (isQuotePayError(search.error) ? (
          <Notice tone="danger">{QUOTE_PAY_ERRORS[search.error]}</Notice>
        ) : (
          <Notice tone="danger">That didn’t work: the quote may have changed. Check it below, or {business.callUs}.</Notice>
        ))}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          {quote.message && (
            <blockquote className="rounded-md border-l-4 border-accent bg-surface p-5 whitespace-pre-line">{quote.message}</blockquote>
          )}
          <ul className="flex flex-col divide-y divide-edge rounded-md border border-edge bg-surface" aria-label="What’s quoted">
            {lines.map((l, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-6 gap-y-1 p-4">
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{l.description}</span>
                  <span className="text-sm text-fg-muted">
                    {l.sku && <><span className="font-mono">Part # {l.sku}</span> · </>}
                    {l.quantity} × {money(l.unitPriceCents)}
                  </span>
                  {l.coreChargeCents > 0 && (
                    <span className="text-sm text-fg-muted">
                      Plus {money(l.coreChargeCents)} refundable core charge each. Return your old unit for a refund.
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end">
                  <strong>{money(l.unitPriceCents * l.quantity)}</strong>
                  {l.coreChargeCents > 0 && <span className="text-sm text-fg-muted">+ {money(l.coreChargeCents * l.quantity)} core</span>}
                </span>
              </li>
            ))}
          </ul>
          <dl className="flex max-w-md flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{money(pickup.itemsCents)}</dd></div>
            {pickup.coreCents > 0 && (
              <div className="flex justify-between gap-4"><dt>Core charges (refundable)</dt><dd>{money(pickup.coreCents)}</dd></div>
            )}
            <div className="flex justify-between gap-4 text-fg-muted">
              <dt>Delivery</dt>
              <dd>{quote.shipping_cents === null ? "Pickup from our shop" : `${money(quote.shipping_cents)} shipping, or free pickup`}</dd>
            </div>
            <div className="flex justify-between gap-4 text-fg-muted"><dt>Sales tax</dt><dd>Worked out at payment</dd></div>
          </dl>
        </div>

        <aside className="flex flex-col gap-4">
          {step.step === "approve" && (
            <>
              <form action={respondToQuoteAction} className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-6">
                <h2 className={heading}>Approve the repair</h2>
                <p className="text-sm text-fg-muted">
                  We’ll start the work and email you when it’s ready. You pay {money(pickup.totalCents)} plus tax
                  {quote.shipping_cents !== null ? ", and shipping if you’d like it delivered," : ""} once it’s finished.
                </p>
                <AccessFields access={access} />
                <input type="hidden" name="response" value="approve" />
                <Button type="submit" size="lg">Approve the quote</Button>
              </form>
              <DeclineForm access={access} label="Don’t want the repair?" />
            </>
          )}

          {step.step === "pay" && canPay && (
            <form action={payQuoteAction} className="flex flex-col gap-5 rounded-md border border-edge bg-surface p-6">
              <AccessFields access={access} />
              <fieldset className="flex flex-col gap-3">
                <legend className={heading}>Delivery</legend>
                {options.includes("ship") && (
                  <label className={choice}>
                    <input type="radio" name="fulfillment" value="ship" defaultChecked={wantsShip} className={radio} />
                    <span className="flex flex-col gap-0.5">
                      <strong>Ship it · {money(quote.shipping_cents ?? 0)}</strong>
                      <span className="text-sm text-fg-muted">
                        {account?.shipTo && search.payment === "account" ? `To ${account.shipTo}.` : "Within the US."}
                      </span>
                    </span>
                  </label>
                )}
                <label className={choice}>
                  <input type="radio" name="fulfillment" value="pickup" defaultChecked={!wantsShip} className={radio} />
                  <span className="flex flex-col gap-0.5">
                    <strong>Pick up · free</strong>
                    <span className="text-sm text-fg-muted">{business.street}, {business.cityStateZip}.</span>
                  </span>
                </label>
              </fieldset>
              {account && (
                <fieldset className="flex flex-col gap-3">
                  <legend className={heading}>Payment</legend>
                  <label className={choice}>
                    <input type="radio" name="payment" value="now" defaultChecked={search.payment !== "account"} className={radio} />
                    <span className="flex flex-col gap-0.5">
                      <strong>Pay now</strong>
                      <span className="text-sm text-fg-muted">Card or bank transfer (ACH) on Stripe’s secure page.</span>
                    </span>
                  </label>
                  <label className={choice}>
                    <input type="radio" name="payment" value="account" defaultChecked={search.payment === "account"} className={radio} />
                    <span className="flex flex-col gap-0.5">
                      <strong>Charge to my account (Net-30)</strong>
                      <span className="text-sm text-fg-muted">
                        {money(account.availableCents)} of {money(account.limitCents)} credit available. We email an invoice due in 30 days.
                      </span>
                    </span>
                  </label>
                </fieldset>
              )}
              <Button type="submit" size="lg">{account ? "Place order" : "Pay now"}</Button>
              <p className="text-[13px] text-fg-muted">
                By ordering you agree to our <Link href="/policies/terms-of-sale">terms of sale</Link>
                {repair ? "" : <>, <Link href="/policies/returns">returns</Link> and <Link href="/policies/shipping">shipping</Link> policies</>}
                {repair ? <> and <Link href="/policies/warranty">warranty</Link></> : null}.
              </p>
            </form>
          )}
          {step.step === "pay" && !canPay && (
            <p className="rounded-md border border-edge bg-surface p-6">Online payment isn’t available right now. Please {business.callUs} to pay.</p>
          )}
          {step.step === "pay" && quote.status === "sent" && <DeclineForm access={access} label="Not going ahead?" />}

          {step.step === "closed" && step.reason === "paid" && orderHref && (
            <p className="rounded-md border border-edge bg-surface p-6">
              <Link href={orderHref}>View order {quote.order?.reference}</Link>
            </p>
          )}
          <p className="text-sm text-fg-muted">Questions about this quote? Reply to our email or {business.callUs}.</p>
        </aside>
      </div>
    </div>
  );
}
