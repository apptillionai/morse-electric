import Link from "next/link";
import {
  createQuoteAction,
  deleteDraftQuoteAction,
  reopenQuoteAction,
  resendQuoteAction,
  saveQuoteAction,
  withdrawQuoteAction,
} from "@/app/admin/quote-actions";
import { formatDate } from "@/components/admin/inbox";
import { QuoteActionButton, QuoteEditor } from "@/components/admin/quote-forms";
import { Button } from "@/components/ui/button";
import { DEFAULT_VALID_DAYS } from "@/lib/admin/quote-form";
import { formatDueDate } from "@/lib/orders/types";
import { customerStep, QUOTE_OFFER_LABELS, quoteTotals, shopToday } from "@/lib/quotes/logic";
import { lineValues, quoteState, type Quote } from "@/lib/quotes/store";
import { formatPrice } from "@/lib/utils";

const money = (cents: number) => formatPrice(cents) ?? "";
const heading = "font-display text-xl font-bold uppercase tracking-[0.04em]";

/** Days from today until a YYYY-MM-DD date, at least 1 (the editor's "valid for"). */
function daysLeft(validUntil: string): number {
  const ms = new Date(`${validUntil}T00:00:00Z`).getTime() - new Date(`${shopToday()}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

function QuoteLines({ quote }: { quote: Quote }) {
  const lines = lineValues(quote.lines);
  const totals = quoteTotals(lines, quote.shipping_cents, "pickup");
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex flex-col divide-y divide-edge-soft rounded border border-edge">
        {lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-4 px-3 py-2">
            <span>
              {l.quantity} × {l.description}
              {l.sku && <span className="font-mono text-fg-muted"> · {l.sku}</span>}
              {l.coreChargeCents > 0 && <span className="text-fg-muted"> · core {money(l.coreChargeCents)} each</span>}
            </span>
            <span className="whitespace-nowrap">{money(l.unitPriceCents * l.quantity)}</span>
          </li>
        ))}
      </ul>
      <p>
        <strong>{money(totals.itemsCents)}</strong>
        {totals.coreCents > 0 && <> + {money(totals.coreCents)} cores</>}
        {" · "}
        {quote.shipping_cents === null ? "pickup only" : `shipping ${money(quote.shipping_cents)} or pickup`} · plus tax
      </p>
      {quote.message && <p className="whitespace-pre-line text-fg-muted">“{quote.message}”</p>}
    </div>
  );
}

/**
 * The quote section of a quote request or service job: create a draft, edit
 * and send it, then follow it through approval and payment. Older declined
 * or withdrawn quotes are listed underneath.
 */
export function QuotePanel({
  kind,
  requestId,
  quotes,
  notice,
}: {
  kind: "parts" | "repair";
  requestId: string;
  quotes: Quote[];
  notice: { quote?: string; link?: string; quoteError?: string };
}) {
  const live = quotes.find((q) => ["draft", "sent", "approved", "paid"].includes(q.status));
  const past = quotes.filter((q) => q !== live);
  const step = live ? customerStep(quoteState(live)) : null;

  return (
    <section id="quote" aria-labelledby="quote-heading" className="flex scroll-mt-6 flex-col gap-4 rounded-md border border-edge bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="quote-heading" className={heading}>{kind === "repair" ? "Repair quote" : "Quote"}</h2>
        {live && (
          <span className="text-sm text-fg-muted">
            <span className="font-mono">{live.reference}</span> · {QUOTE_OFFER_LABELS[live.status]}
          </span>
        )}
      </div>

      {notice.quote === "sent" && live?.status === "sent" && (
        <p role="status" className="text-sm font-medium text-ok">Sent to {live.email}.</p>
      )}
      {notice.quote === "unsent" && (
        <p role="status" className="text-sm font-medium text-danger">
          Sent, but the email didn’t go out. Send the customer this link yourself:{" "}
          {notice.link && <a href={notice.link} className="break-all" target="_blank" rel="noreferrer">{notice.link}</a>}
        </p>
      )}
      {notice.quoteError && <p role="alert" className="text-sm font-medium text-danger">Couldn’t create the quote. Try again.</p>}

      {!live && (
        <form action={createQuoteAction.bind(null, kind, requestId)} className="flex flex-col gap-2">
          <p className="text-sm text-fg-muted">
            {kind === "repair"
              ? "Price the repair. The customer approves it online, then pays when the job is Ready."
              : "Price this request. The customer can order and pay online (card, ACH or Net-30)."}
          </p>
          <div>
            <Button type="submit" variant="dark" size="sm">Write a quote</Button>
          </div>
        </form>
      )}

      {live?.status === "draft" && (
        <>
          <QuoteEditor
            action={saveQuoteAction.bind(null, live.id)}
            lines={lineValues(live.lines)}
            shippingCents={live.shipping_cents}
            validDays={live.lines.length ? daysLeft(live.valid_until) : DEFAULT_VALID_DAYS}
            message={live.message}
            email={live.email}
            version={live.updated_at}
          />
          <form action={deleteDraftQuoteAction.bind(null, live.id)}>
            <button type="submit" className="text-sm font-semibold text-fg-muted underline hover:text-danger">Delete this draft</button>
          </form>
        </>
      )}

      {live && live.status !== "draft" && (
        <>
          <QuoteLines quote={live} />
          <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
            {live.sent_at && (<><dt className="text-fg-muted">Sent</dt><dd>{formatDate(live.sent_at)} to {live.email}</dd></>)}
            <dt className="text-fg-muted">Valid until</dt>
            <dd>{formatDueDate(live.valid_until)}{step?.step === "closed" && step.reason === "expired" ? " (expired)" : ""}</dd>
            {live.responded_at && (<><dt className="text-fg-muted">Approved</dt><dd>{formatDate(live.responded_at)}</dd></>)}
            {live.order && (
              <>
                <dt className="text-fg-muted">Order</dt>
                <dd>
                  <Link href={`/admin/orders/${live.order_id}`}>{live.order.reference}</Link>
                </dd>
              </>
            )}
          </dl>
          {step?.step === "in_progress" && (
            <p className="text-sm text-fg-muted">When the job is Ready, email the customer the payment link (or they’ll see a Pay button in their account).</p>
          )}
          <div className="flex flex-wrap items-start gap-3">
            {live.status === "sent" && (
              <QuoteActionButton action={reopenQuoteAction.bind(null, live.id)} label="Edit" confirm="Take this quote back to draft? Its link stops working until you send it again." />
            )}
            {(step?.step === "approve" || step?.step === "pay") && (
              <QuoteActionButton
                action={resendQuoteAction.bind(null, live.id)}
                label={live.status === "approved" ? "Email the payment link" : "Resend the link"}
                variant={live.status === "approved" ? "dark" : "quiet"}
              />
            )}
            {(live.status === "sent" || live.status === "approved") && (
              <QuoteActionButton action={withdrawQuoteAction.bind(null, live.id)} label="Withdraw" confirm="Withdraw this quote? The customer won’t be able to approve or pay it." />
            )}
          </div>
        </>
      )}

      {past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Earlier quotes ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {past.map((q) => {
              const total = quoteTotals(lineValues(q.lines), q.shipping_cents, "pickup");
              return (
                <li key={q.id}>
                  <span className="font-mono">{q.reference}</span> · {QUOTE_OFFER_LABELS[q.status]} · {money(total.itemsCents + total.coreCents)}
                  {q.decline_reason && <span className="text-fg-muted"> · “{q.decline_reason}”</span>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
