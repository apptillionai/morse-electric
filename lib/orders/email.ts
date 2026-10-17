import "server-only";

import { Resend } from "resend";
import { CONDITION_LABELS } from "@/lib/catalog/types";
import { escapeHtml } from "@/lib/requests/email";
import { SITE } from "@/lib/site";
import { getBusiness } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { formatDueDate, getOrder, shippingLines, type CoreReturn, type OrderWithItems } from "./types";
import { shippedElsewhere } from "./shipping";

export type OrderEmailKind =
  | "placed"
  | "paid"
  | "payment_failed"
  | "shipped"
  | "ready"
  | "cancelled"
  | "refunded"
  // Net-30: Stripe reports the invoice paid (staff only).
  | "invoice_paid"
  // About one core return (pass its id):
  | "core_reminder"
  | "core_overdue"
  | "core_credited"
  | "core_rejected";

const money = (cents: number) => formatPrice(cents) ?? "";
const p = (html: string) => `<p style="font:15px/1.5 sans-serif">${html}</p>`;

/** The order as a table (HTML) and plain lines (text). */
export function orderSummary(order: OrderWithItems): { html: string; text: string } {
  const items = order.items.flatMap((i) => [
    {
      label: `${i.quantity} × ${i.name}${i.condition ? ` (${CONDITION_LABELS[i.condition]})` : ""}${i.sku ? `, part # ${i.sku}` : ""}`,
      amount: money(i.unit_price_cents * i.quantity),
    },
    ...(i.core_charge_cents > 0
      ? [{ label: `   Core charge (refundable), ${i.quantity} × ${money(i.core_charge_cents)}`, amount: money(i.core_charge_cents * i.quantity) }]
      : []),
  ]);
  const totals = [
    { label: "Subtotal", amount: money(order.subtotal_cents) },
    ...(order.core_cents > 0 ? [{ label: "Core charges (refundable)", amount: money(order.core_cents) }] : []),
    {
      label: order.fulfillment === "pickup" ? "Pickup" : order.shipping_service ? `Shipping (${order.shipping_service})` : "Shipping",
      amount: order.fulfillment === "pickup" ? "Free" : money(order.shipping_cents),
    },
    { label: "Tax", amount: money(order.tax_cents) },
    { label: "Total", amount: money(order.total_cents) },
  ];
  const row = (r: { label: string; amount: string }, bold = false) =>
    `<tr><td style="padding:4px 12px 4px 0${bold ? ";font-weight:bold" : ""}">${escapeHtml(r.label)}</td><td style="padding:4px 0;text-align:right${bold ? ";font-weight:bold" : ""}">${escapeHtml(r.amount)}</td></tr>`;
  const address = shippingLines(order);
  return {
    html: `<table cellpadding="0" style="border-collapse:collapse;font:14px/1.5 sans-serif">${items.map((r) => row(r)).join("")}${totals
      .map((r, i) => row(r, i === totals.length - 1))
      .join("")}</table>${address ? p(`<strong>Ship to</strong><br>${address.map(escapeHtml).join("<br>")}`) : ""}`,
    text: [
      ...items.map((r) => `${r.label}: ${r.amount}`),
      "",
      ...totals.map((r) => `${r.label}: ${r.amount}`),
      ...(address ? ["", "Ship to:", ...address] : []),
    ].join("\n"),
  };
}

interface Message {
  subject: string;
  /** Paragraphs before the order summary. */
  lines: string[];
}

/** Where and how to send back a core. */
export function coreReturnInstructions(business: { street: string; cityStateZip: string }, reference: string): string {
  return `Bring or ship your old unit to ${business.street}, ${business.cityStateZip}, tagged with order ${reference}. It must be the same type and size as the one you bought, complete, not taken apart, and free of fire, flood or impact damage.`;
}

async function customerMessage(kind: OrderEmailKind, order: OrderWithItems, core: CoreReturn | null): Promise<Message | null> {
  const business = await getBusiness();
  const ref = order.reference;
  const coreItem = core ? order.items.find((i) => i.id === core.order_item_id) : undefined;
  const coreName = coreItem ? `${core!.quantity} × ${coreItem.name}` : "your old unit";
  const coreAmount = core ? money(core.core_charge_cents * core.quantity) : "";
  const openCores = order.cores.filter((c) => c.status === "awaiting");
  const coreNote = openCores.length
    ? [
        `Your order includes ${money(order.core_cents)} in refundable core charges. Return your old unit${openCores.length > 1 || openCores[0].quantity > 1 ? "s" : ""} by ${formatDueDate(openCores[0].due_date)} for a refund. ${coreReturnInstructions(business, ref)}`,
      ]
    : [];
  switch (kind) {
    case "core_reminder":
      return core && {
        subject: `Reminder: return your core for order ${ref} by ${formatDueDate(core.due_date)}`,
        lines: [`We haven’t received the core for ${coreName} yet. Return it by ${formatDueDate(core.due_date)} to get your ${coreAmount} core charge back.`, coreReturnInstructions(business, ref)],
      };
    case "core_overdue":
      return core && {
        subject: `Your core for order ${ref} is overdue`,
        lines: [`The core for ${coreName} was due back on ${formatDueDate(core.due_date)}. We can still refund the ${coreAmount} core charge if it reaches us soon; ${business.callUs} if you need more time.`, coreReturnInstructions(business, ref)],
      };
    case "core_credited":
      return core && {
        subject: `Core refund for order ${ref}`,
        lines: [
          order.payment_method === "net30"
            ? `We received and checked the core for ${coreName} and credited ${money(core.credit_cents ?? 0)} to your account: it comes off your invoice, or your next one if you’ve already paid.`
            : `We received and checked the core for ${coreName} and refunded ${money(core.credit_cents ?? 0)}. Refunds take 5–10 business days to reach your account.`,
        ],
      };
    case "core_rejected":
      return core && {
        subject: `We couldn’t accept the core for order ${ref}`,
        lines: [
          `We inspected the core for ${coreName} and couldn’t accept it${core.rejection_reason ? `: ${core.rejection_reason}` : "."}`,
          `So the ${coreAmount} core charge isn’t refunded. Questions? ${business.callUs}.`,
        ],
      };
    case "placed":
      if (order.status === "invoiced") {
        return {
          subject: `Order ${ref} confirmed and charged to your account`,
          lines: [
            `Thanks for your order. We’ve charged it to your account on Net-30 terms. Stripe will email the invoice separately${
              order.invoice_due_date ? `; it’s due ${formatDueDate(order.invoice_due_date)}` : ""
            }.`,
            order.fulfillment === "pickup"
              ? `We’ll email you when it’s ready to collect from ${business.street}, ${business.cityStateZip}.`
              : "We’ll email you the tracking number when it ships.",
            ...coreNote,
          ],
        };
      }
      return order.status === "pending_payment"
        ? {
            subject: `Order ${ref} received: waiting for your bank payment`,
            lines: [
              `Thanks for your order. Your bank payment usually takes a few business days to clear; we’ll ${
                order.fulfillment === "pickup" ? "have it ready for pickup" : "ship it"
              } as soon as it does.`,
              ...coreNote,
            ],
          }
        : {
            subject: `Order ${ref} confirmed`,
            lines: [
              order.fulfillment === "pickup"
                ? `Thanks for your order. We’ll email you when it’s ready to collect from ${business.street}, ${business.cityStateZip}.`
                : "Thanks for your order. We’ll email you the tracking number when it ships.",
              ...coreNote,
            ],
          };
    case "payment_failed":
      return {
        subject: `Payment for order ${ref} didn’t go through`,
        lines: [`Your bank payment for order ${ref} failed, so we’ve cancelled the order. To order again, visit our website or ${business.callUs}.`],
      };
    case "shipped":
      return {
        subject: `Order ${ref} has shipped`,
        lines: [
          `Your order is on its way${order.carrier ? ` with ${order.carrier}` : ""}.`,
          ...(order.tracking_number ? [`Tracking number: ${order.tracking_number}`] : []),
        ],
      };
    case "ready":
      return {
        subject: `Order ${ref} is ready for pickup`,
        lines: [`Your order is ready to collect from ${business.street}, ${business.cityStateZip}. Our hours: ${business.hours}.`],
      };
    case "cancelled":
      return {
        subject: `Order ${ref} has been cancelled`,
        lines: [
          order.payment_method === "net30"
            ? `We’ve cancelled order ${ref} and its invoice, so there’s nothing to pay. If you’d already paid it, we’ve refunded you. Questions? ${business.callUs}.`
            : `We’ve cancelled order ${ref} and refunded your payment. Refunds take 5–10 business days to reach your account. Questions? ${business.callUs}.`,
        ],
      };
    case "refunded":
      return {
        subject: `Order ${ref} has been refunded`,
        lines: [`We’ve refunded order ${ref}. Refunds take 5–10 business days to reach your account. Questions? ${business.callUs}.`],
      };
    case "paid":
    case "invoice_paid":
      return null;
  }
}

function staffMessage(kind: OrderEmailKind, order: OrderWithItems): Message | null {
  const ref = order.reference;
  const how = order.fulfillment === "pickup" ? "pickup" : order.shipping_service ? `to ship by ${order.shipping_service}` : "to ship";
  const moved = shippedElsewhere(order.shipping_quote_postal, order.ship_postal)
    ? [`Check the shipping: it was quoted to ZIP ${order.shipping_quote_postal}, but the customer entered ${order.ship_postal} at checkout.`]
    : [];
  switch (kind) {
    case "invoice_paid":
      return { subject: `Invoice paid for Net-30 order ${ref}`, lines: [`${order.name ?? "The customer"} paid the invoice for order ${ref} (${money(order.total_cents)}).`] };
    case "placed":
      if (order.status === "invoiced") {
        return {
          subject: `New Net-30 order ${ref} (${money(order.total_cents)}), ${how}`,
          lines: [`${order.name ?? "A customer"} charged it to their account; Stripe has emailed the invoice. You can fulfil it now.`],
        };
      }
      return order.status === "pending_payment"
        ? { subject: `New order ${ref} (${money(order.total_cents)}), ACH pending`, lines: ["Don’t release it until the bank payment clears; you’ll get another email."] }
        : { subject: `New order ${ref} (${money(order.total_cents)}), ${how}`, lines: [`From ${order.name ?? order.email ?? "a customer"}.`, ...moved] };
    case "paid":
      return { subject: `Payment cleared for order ${ref}`, lines: [`The ACH payment cleared. Order ${ref} is ready to fulfil (${how}).`] };
    case "payment_failed":
      return { subject: `Payment failed: order ${ref} cancelled`, lines: ["The ACH payment failed. The order was cancelled and its stock returned."] };
    default:
      return null;
  }
}

/**
 * Email the customer and/or staff about an order. Never throws: the order is
 * already saved, and a mail outage must not undo or repeat anything. Returns
 * whether every email went out (the core reminder job retries the rest).
 */
export async function sendOrderEmails(orderId: string, kind: OrderEmailKind, coreId?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MORSE_EMAIL_FROM;
  const staff = process.env.MORSE_STAFF_EMAIL?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (!apiKey || !from) {
    console.warn(`[email] Resend not configured; no ${kind} email for order ${orderId}.`);
    return false;
  }
  try {
    const order = await getOrder(createAdminClient(), { id: orderId });
    if (!order) return false;
    const core = coreId ? order.cores.find((c) => c.id === coreId) ?? null : null;
    const resend = new Resend(apiKey);
    const summary = orderSummary(order);
    const sends: Promise<unknown>[] = [];

    const toCustomer = await customerMessage(kind, order, core);
    if (toCustomer && order.email) {
      const accountUrl = order.customer_id ? `${SITE.url}/account/orders/${order.reference}` : null;
      sends.push(
        resend.emails.send({
          from,
          to: order.email,
          ...(staff[0] ? { replyTo: staff[0] } : {}),
          subject: toCustomer.subject,
          html: `${p(`Hi ${escapeHtml(order.name ?? "there")},`)}${toCustomer.lines.map((l) => p(escapeHtml(l))).join("")}${p(
            `<strong>Order ${escapeHtml(order.reference)}</strong>`,
          )}${summary.html}${accountUrl ? p(`<a href="${escapeHtml(accountUrl)}">View your order</a>`) : ""}${p(
            `<span style="color:#4A5866;font-size:13px">${escapeHtml(SITE.name)} · <a href="${escapeHtml(SITE.url)}">${escapeHtml(new URL(SITE.url).host)}</a></span>`,
          )}`,
          text: `Hi ${order.name ?? "there"},\n\n${toCustomer.lines.join("\n\n")}\n\nOrder ${order.reference}\n${summary.text}${
            accountUrl ? `\n\nView your order: ${accountUrl}` : ""
          }\n\n${SITE.name} · ${SITE.url}`,
        }),
      );
    }

    const toStaff = staffMessage(kind, order);
    if (toStaff && staff.length) {
      const adminUrl = `${SITE.url}/admin/orders/${order.id}`;
      sends.push(
        resend.emails.send({
          from,
          to: staff,
          ...(order.email ? { replyTo: order.email } : {}),
          subject: toStaff.subject,
          html: `${toStaff.lines.map((l) => p(escapeHtml(l))).join("")}${summary.html}${p(`<a href="${escapeHtml(adminUrl)}">Open in the admin</a>`)}`,
          text: `${toStaff.lines.join("\n\n")}\n\n${summary.text}\n\nOpen in the admin: ${adminUrl}`,
        }),
      );
    }

    let ok = sends.length > 0;
    for (const result of await Promise.allSettled(sends)) {
      if (result.status === "rejected") {
        ok = false;
        console.error(`[email] order ${order.reference} ${kind}:`, result.reason);
      } else if ((result.value as { error?: { message: string } | null })?.error) {
        ok = false;
        console.error(`[email] order ${order.reference} ${kind}:`, (result.value as { error: { message: string } }).error.message);
      }
    }
    return ok;
  } catch (error) {
    console.error(`[email] order ${orderId} ${kind}:`, error instanceof Error ? error.message : error);
    return false;
  }
}
