import type { Metadata } from "next";
import { PhoneLink } from "@/components/site/site-header";
import { ButtonLink } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & hours",
  description: `Call, visit or email ${SITE.name}.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 pt-12 pb-20">
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Contact</span>
        <h1 className="display text-5xl">Call, visit or send a request</h1>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
        <section className="flex flex-col gap-2 rounded-md border border-edge bg-surface p-6">
          <h2 className="display text-2xl">Phone</h2>
          <PhoneLink className="text-xl font-semibold" />
          <p className="text-sm text-fg-muted">Emergency service line answered 24/7.</p>
        </section>
        <section className="flex flex-col gap-2 rounded-md border border-edge bg-surface p-6">
          <h2 className="display text-2xl">Shop &amp; counter</h2>
          <address className="not-italic">
            {SITE.street}
            <br />
            {SITE.cityStateZip}
          </address>
          <p className="text-sm text-fg-muted">{SITE.hours}</p>
        </section>
        <section className="flex flex-col gap-2 rounded-md border border-edge bg-surface p-6">
          <h2 className="display text-2xl">Email</h2>
          <p className="font-semibold">{SITE.email}</p>
          <p className="text-sm text-fg-muted">For quotes, use the form so your request gets a reference number.</p>
        </section>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/quote">Request a quote</ButtonLink>
        <ButtonLink href="/service#request" variant="outline">Request service</ButtonLink>
      </div>
    </div>
  );
}
