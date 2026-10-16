import type { Metadata } from "next";
import { CheckCircle2, Clock } from "lucide-react";
import { OrderSummary } from "@/components/orders/order-summary";
import { ButtonLink } from "@/components/ui/button";
import { getSignedInUser } from "@/lib/customers/account";
import { applyCompletedSession } from "@/lib/orders/payments";
import { getStripe } from "@/lib/orders/store";
import { getOrder } from "@/lib/orders/types";
import { getBusiness } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };

const SESSION = /^cs_[A-Za-z0-9_]{10,250}$/;

export default async function CheckoutSuccessPage(props: PageProps<"/checkout/success">) {
  const sp = await props.searchParams;
  const sessionId = typeof sp.session_id === "string" && SESSION.test(sp.session_id) ? sp.session_id : null;
  const business = await getBusiness();
  const supabase = createAdminClient();
  let order = sessionId ? await getOrder(supabase, { sessionId }) : null;

  // The webhook usually gets here first. If not, ask Stripe and place the order now.
  const stripe = getStripe();
  if (order?.status === "checkout" && stripe && sessionId) {
    try {
      await applyCompletedSession(await stripe.checkout.sessions.retrieve(sessionId));
      order = await getOrder(supabase, { sessionId });
    } catch (error) {
      console.error("[checkout] success page:", error instanceof Error ? error.message : error);
    }
  }

  if (!order) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 pt-12 pb-20">
        <h1 className="display text-5xl">Thanks for your order</h1>
        <p className="text-fg-muted">We couldn’t find the details just now. Check your email for a confirmation, or {business.callUs}.</p>
      </div>
    );
  }

  const user = await getSignedInUser().catch(() => null);
  const pending = order.status === "pending_payment" || order.status === "checkout";
  const Icon = pending ? Clock : CheckCircle2;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pt-12 pb-20">
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Order {order.reference}</span>
        <h1 className="display flex items-center gap-3 text-5xl">
          <Icon size={40} aria-hidden="true" className={pending ? "text-warn" : "text-ok"} />
          {pending ? "Order received" : "Thanks, it’s ordered"}
        </h1>
        <p className="text-lg text-fg-muted">
          {order.status === "checkout"
            ? "We’re confirming your payment with Stripe. You’ll get an email as soon as it’s through."
            : order.status === "pending_payment"
              ? `Your bank payment usually takes a few business days. We’ll ${order.fulfillment === "pickup" ? "have it ready for pickup" : "ship"} as soon as it clears.`
              : order.fulfillment === "pickup"
                ? "We’ll email you when it’s ready to collect."
                : "We’ll email you the tracking number when it ships."}{" "}
          {order.email && <>A confirmation is on its way to {order.email}.</>}
        </p>
      </div>
      <OrderSummary order={order} />
      <div className="flex flex-wrap gap-3">
        {user?.customer && order.customer_id === user.id && (
          <ButtonLink href={`/account/orders/${order.reference}`} variant="quiet">View in your account</ButtonLink>
        )}
        <ButtonLink href="/shop">Keep shopping</ButtonLink>
      </div>
    </div>
  );
}
