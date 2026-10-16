import Link from "next/link";
import type { ReactNode } from "react";
import type { Business } from "@/lib/business";
import type { PolicySlug } from "@/lib/policies";
import { SITE } from "@/lib/site";

// Draft wording for Morse to review. Bracketed values ([XX]) are still to be
// confirmed; lib/policies.ts marks a page final once they are filled in.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="display text-3xl">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Contact({ business }: { business: Business }) {
  return (
    <Section title="Questions">
      <p>
        {SITE.legalName}, {business.street}, {business.cityStateZip}. Phone{" "}
        {business.phoneHref ? <a href={business.phoneHref}>{business.phone}</a> : business.phone}, email{" "}
        {business.emailHref ? <a href={business.emailHref}>{business.email}</a> : business.email}. {business.hours}.
      </p>
    </Section>
  );
}

function TermsOfSale({ business }: { business: Business }) {
  return (
    <>
      <p>
        These terms apply to everything {SITE.legalName} (“Morse”, “we”) sells, whether you order online, by phone, by
        email or at our counter, unless we agree otherwise in writing on a quote.
      </p>
      <Section title="Prices and quotes">
        <List
          items={[
            "Prices are in US dollars and don’t include sales tax, shipping or core charges unless stated.",
            "Written quotes are good for [30] days unless the quote says otherwise. Prices on the website can change without notice.",
            "If a price is plainly wrong because of a typing or system error, we’ll contact you before we ship and you can cancel for a full refund.",
          ]}
        />
      </Section>
      <Section title="Orders">
        <p>
          An order is accepted when we confirm it by email or ship it. We may decline or cancel an order, for example
          when an item turns out to be unavailable; if we do, we refund anything you paid for it.
        </p>
      </Section>
      <Section title="Payment">
        <List
          items={[
            "We accept major credit and debit cards and ACH bank payments.",
            "Approved business accounts may pay on Net-30 terms: invoices are due 30 days from the invoice date. We set and may change credit limits, and may hold orders while an account is past due.",
            "Past-due invoices may be charged a late fee of [1.5]% per month, or the most the law allows if that is less.",
          ]}
        />
      </Section>
      <Section title="Sales tax">
        <p>
          We charge sales tax where we are required to. If you are tax-exempt, upload a valid exemption or resale
          certificate in your account (or send it to us) before you order; we remove tax once we’ve approved it. We
          can’t refund tax on orders placed before the certificate was approved.
        </p>
      </Section>
      <Section title="Core charges">
        <p>
          Remanufactured and exchange units may carry a refundable core charge, shown separately from the price.
          Return your old unit (the “core”) within [30] days of delivery and we refund or credit the core charge once
          it passes inspection. A core must be the same type and size as the unit you bought, complete and not
          disassembled, and not damaged by fire, flood or impact. Cores that don’t qualify are returned at your cost or
          scrapped at your request, and the charge is not refunded.
        </p>
      </Section>
      <Section title="Title and risk of loss">
        <p>
          Risk of loss passes to you when we hand the goods to the carrier or you collect them. Title passes when we’ve
          been paid in full.
        </p>
      </Section>
      <Section title="Returns, shipping and warranty">
        <p>
          See our <Link href="/policies/returns">returns</Link>, <Link href="/policies/shipping">shipping</Link> and{" "}
          <Link href="/policies/warranty">warranty</Link> policies, which form part of these terms.
        </p>
      </Section>
      <Section title="Limitation of liability">
        <p>
          To the extent the law allows, our total liability for any order is limited to what you paid for it, and we
          are not liable for indirect or consequential losses such as downtime, lost production or lost profit. Nothing
          in these terms limits rights you have that the law doesn’t allow us to limit.
        </p>
      </Section>
      <Section title="Governing law">
        <p>These terms are governed by the laws of the Commonwealth of Massachusetts.</p>
      </Section>
      <Contact business={business} />
    </>
  );
}

function Returns({ business }: { business: Business }) {
  return (
    <>
      <Section title="What you can return">
        <p>
          You can return new, unused items in their original packaging within [30] days of delivery. Call or email us
          first for a return authorization (RMA) number, and write it on the box; we can’t accept returns without one.
        </p>
      </Section>
      <Section title="What you can’t return">
        <List
          items={[
            "Special-order and custom items, unless they arrive defective",
            "Items that have been installed, wired, run or modified",
            "Electrical parts and controls once the packaging is opened",
            "Repairs we have carried out on your own equipment (these are covered by our warranty instead)",
          ]}
        />
      </Section>
      <Section title="Refunds">
        <List
          items={[
            "Returns may carry a [15]% restocking fee. There is no fee when we sent the wrong item or it arrived defective.",
            "You pay return shipping unless we made a mistake.",
            "Refunds go back to the original payment method (or as a credit on a Net-30 account) within [10] business days of the item reaching us.",
          ]}
        />
      </Section>
      <Section title="Damaged or wrong items">
        <p>
          Check deliveries when they arrive. Note any visible damage on the carrier’s delivery receipt, especially for
          freight, and tell us within [2] business days so we can file a claim and send a replacement.
        </p>
      </Section>
      <Section title="Core returns">
        <p>
          Returning a core for a core-charge refund works differently: see{" "}
          <Link href="/policies/terms-of-sale">core charges in our terms of sale</Link>.
        </p>
      </Section>
      <Contact business={business} />
    </>
  );
}

function Shipping({ business }: { business: Business }) {
  return (
    <>
      <Section title="Parcel shipping">
        <p>
          In-stock items that ship by parcel carrier (UPS or FedEx) leave our shop within [1] business day of your order,
          usually the same day for orders in by [2 pm] Eastern. You’ll get a tracking number by email when it ships.
        </p>
      </Section>
      <Section title="Freight">
        <p>
          Large motors, pumps and anything on a pallet ship by LTL freight. We quote freight for each order before we
          ship. Someone needs to be there to receive the delivery; tell us if you need a liftgate or residential
          delivery, which carriers charge extra for.
        </p>
      </Section>
      <Section title="Local pickup">
        <p>
          You can collect any order from {business.street}, {business.cityStateZip} during our hours ({business.hours}).
          Wait for our “ready for pickup” email or call before you come.
        </p>
      </Section>
      <Section title="Delivery in our service area">
        <p>
          We also deliver and pick up repairs ourselves in {business.serviceArea}. Ask when you order or book a repair.
        </p>
      </Section>
      <Section title="Special orders and out-of-stock items">
        <p>We confirm lead times for special-order items on your quote. Items ship when they reach us.</p>
      </Section>
      <Section title="Where we ship">
        <p>We ship within the United States. Contact us about shipping elsewhere.</p>
      </Section>
      <Contact business={business} />
    </>
  );
}

function Warranty({ business }: { business: Business }) {
  return (
    <>
      <Section title="What’s covered">
        <List
          items={[
            <><strong>New units</strong> carry the manufacturer’s warranty. We help you make the claim.</>,
            <><strong>Remanufactured and exchange units</strong> carry Morse’s [XX]-month shop warranty from the date we ship or you collect them.</>,
            <><strong>Used, tested units</strong> carry a [XX]-day warranty.</>,
            <><strong>Repairs</strong> we carry out on your equipment are covered for [XX] months on the work we did and the parts we fitted.</>,
          ]}
        />
        <p>Our warranty covers defects in materials and workmanship.</p>
      </Section>
      <Section title="What isn’t covered">
        <List
          items={[
            "Damage from incorrect installation, wiring or alignment",
            "Overload, single-phasing, voltage problems or missing motor protection",
            "Water, contamination, corrosion, fire or physical damage",
            "Normal wear, and parts we didn’t supply or repair",
            "Units that have been opened or repaired by someone else",
          ]}
        />
      </Section>
      <Section title="Making a claim">
        <p>
          Call or email us with your order or job number before you remove the unit if you can. We’ll arrange for it to
          come back to our shop for inspection. If the fault is covered, we repair or replace it or refund what you paid,
          at our choice. That is the full extent of our warranty, and we don’t cover removal, reinstallation, downtime
          or other costs.
        </p>
      </Section>
      <Contact business={business} />
    </>
  );
}

function Privacy({ business }: { business: Business }) {
  return (
    <>
      <Section title="What we collect">
        <List
          items={[
            "What you send in our quote and service forms: your name, company, email, phone, equipment details and any photos.",
            "If you have an account: your contact details, shipping and billing addresses, and any tax-exemption certificate you upload.",
            "Orders and payments. Card and bank details go straight to our payment processor; we never see or store full card numbers.",
          ]}
        />
      </Section>
      <Section title="How we use it">
        <p>
          To answer your requests, quote, repair, sell and deliver, keep your account and order history, and meet our tax
          and accounting obligations. We don’t sell your information or use it for advertising.
        </p>
      </Section>
      <Section title="Who we share it with">
        <p>Only the services that run this website and our business, and only what each one needs:</p>
        <List
          items={[
            "Supabase (database, file storage and sign-in)",
            "Vercel (website hosting)",
            "Resend (sending email)",
            "Cloudflare Turnstile (checking form submissions come from people, not bots)",
            "Our payment processor and shipping carriers, when you order",
          ]}
        />
      </Section>
      <Section title="Cookies and storage">
        <p>
          We use a cookie to keep you signed in, and your browser remembers the light, mid or dark theme you choose. The
          spam check on our forms may set its own cookie. We don’t use advertising or tracking cookies.
        </p>
      </Section>
      <Section title="How long we keep it">
        <p>
          We keep requests, orders and account details while you’re a customer and for as long as tax and accounting
          rules require, then delete them. You can ask us to see, correct or delete what we hold about you at any time.
        </p>
      </Section>
      <Contact business={business} />
    </>
  );
}

const CONTENT: Record<PolicySlug, (props: { business: Business }) => ReactNode> = {
  "terms-of-sale": TermsOfSale,
  returns: Returns,
  shipping: Shipping,
  warranty: Warranty,
  privacy: Privacy,
};

export function PolicyContent({ slug, business }: { slug: PolicySlug; business: Business }) {
  const Body = CONTENT[slug];
  return <Body business={business} />;
}
