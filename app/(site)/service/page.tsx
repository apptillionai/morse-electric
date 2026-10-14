import { Check } from "lucide-react";
import type { Metadata } from "next";
import { ServiceRequestForm } from "@/components/forms/service-request-form";
import { ButtonLink } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Repair & service",
  description:
    "Motor rewinding and repair, pump, blower and vacuum pump rebuilds, starter and alternator repair, and on-site field service.",
  alternates: { canonical: "/service" },
};

const REPAIRS = [
  ["AC & DC motors", ["Complete rewinds, Class F/H insulation", "Bearing, shaft and housing repair", "Dynamic balancing & surge testing"]],
  ["Pumps & blowers", ["Mechanical seals and impellers", "Wear-ring and shaft machining", "Performance and leak testing"]],
  ["Vacuum pumps", ["Vane, seal and gasket kits", "Oil and filter service", "Ultimate-vacuum testing"]],
  ["Starters & alternators", ["Automotive, ag, marine, heavy equipment", "Bench-tested under load", "Rebuild your unit or exchange"]],
] as const;

const FIELD = [
  ["On-call repair", "24/7 dispatch"],
  ["Preventive maintenance", "Scheduled inspection routes"],
  ["Install & startup", "Rigging, alignment, commissioning"],
  ["Condition monitoring", "Vibration and thermal trending"],
] as const;

export default function ServicePage() {
  return (
    <>
      <section className="bg-inverse text-on-inverse">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-10 px-6 py-16">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-5">
            <span className="eyebrow text-on-inverse-accent">Repair · Rewind · Rebuild</span>
            <h1 className="display text-[clamp(44px,5.5vw,72px)] leading-[0.95]">Repaired right, tested before it leaves.</h1>
            <p className="max-w-xl text-lg leading-relaxed text-on-inverse-muted">
              Motors, pumps, blowers, vacuum pumps, starters and alternators. Every job gets a teardown report, a
              written quote and a load test.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="#request" size="lg">Request a repair quote</ButtonLink>
              {SITE.phoneHref && (
                <ButtonLink href={SITE.phoneHref} variant="outline-light" size="lg">Emergency: {SITE.phone}</ButtonLink>
              )}
            </div>
          </div>
          <div className="photo-placeholder-dark flex h-[340px] min-w-0 flex-[1_1_420px] items-center justify-center rounded-md text-[13px] text-on-inverse-muted">
            Photo: rewind bench
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pt-18 pb-8">
        <h2 className="display mb-7 text-[44px]">What we repair</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
          {REPAIRS.map(([title, items]) => (
            <div key={title} className="flex flex-col gap-2.5 rounded-md border border-edge bg-surface p-6">
              <h3 className="text-[19px] font-semibold">{title}</h3>
              <ul className="list-disc pl-4.5 leading-[1.7] text-fg-muted">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="request" className="mx-auto max-w-7xl scroll-mt-6 px-6 pt-10 pb-18">
        <div className="flex flex-wrap overflow-hidden rounded-md border border-edge bg-surface">
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4.5 bg-inverse p-9 text-on-inverse">
            <h2 className="display text-[40px]">Request service</h2>
            <p className="leading-relaxed text-on-inverse-muted">
              Tell us what you have and what it’s doing. We’ll reply with next steps and a pickup window.
            </p>
            <ul className="flex flex-col gap-3.5 text-on-inverse-muted">
              {[
                `Pickup available within ${SITE.serviceArea}`,
                "Teardown report with photos",
                "Repair vs. replace quote before we start",
                "Job number to reference every step",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check size={20} strokeWidth={2.4} className="flex-none text-on-inverse-accent" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 flex-[999_1_560px] p-9">
            <ServiceRequestForm phone={SITE.phone} />
          </div>
        </div>
      </section>

      <section id="field" className="scroll-mt-6 border-y border-edge bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-12 px-6 py-18">
          <div className="photo-placeholder flex h-80 min-w-0 flex-[1_1_420px] items-center justify-center rounded-md text-[13px] text-fg-muted">
            Photo: field crew aligning a pump
          </div>
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-4.5">
            <span className="eyebrow">Field service</span>
            <h2 className="display text-[44px]">We come to you</h2>
            <p className="text-[17px] leading-relaxed text-fg-muted">
              Service trucks cover {SITE.serviceArea}. Removal and installation, laser alignment, vibration analysis,
              thermography and motor circuit testing, on a call-out or a scheduled maintenance plan.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {FIELD.map(([title, body]) => (
                <div key={title} className="flex flex-col gap-1 rounded-md border border-edge p-4">
                  <strong>{title}</strong>
                  <span className="text-sm text-fg-muted">{body}</span>
                </div>
              ))}
            </div>
            <ButtonLink href="#request" variant="dark" className="self-start">Schedule a field visit</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
