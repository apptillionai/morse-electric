import Link from "next/link";
import { nameplateLine } from "@/lib/customers/equipment";
import { listEquipment } from "@/lib/customers/equipment-store";
import { notFound } from "next/navigation";
import { removeCustomerAction, setCustomerTierAction, setTaxExemptAction } from "@/app/admin/actions";
import { PageHeader } from "@/components/admin/admin-shell";
import { NewSignInLinkForm, TermsForm } from "@/components/admin/customer-forms";
import { DeleteButton } from "@/components/admin/delete-button";
import { Detail, formatDate, StatusBadge } from "@/components/admin/inbox";
import { Button } from "@/components/ui/button";
import { staffClient } from "@/lib/admin/auth";
import { getCustomerDetail, getSignInInfo, listPriceTiers } from "@/lib/admin/customers";
import { EQUIPMENT_TYPES } from "@/lib/requests/schemas";
import { formatPrice } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Customer" };

function address(prefix: "ship" | "bill", c: Record<string, unknown>) {
  const line = (k: string) => (c[`${prefix}_${k}`] as string | null) ?? "";
  const parts = [line("line1"), line("line2"), [line("city"), [line("state"), line("postal")].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean);
  return parts.length ? <span className="whitespace-pre-line">{parts.join("\n")}</span> : null;
}

export default async function CustomerPage(props: PageProps<"/admin/customers/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const supabase = await staffClient();
  const [found, signIn, units, tiers] = await Promise.all([
    getCustomerDetail(supabase, id),
    getSignInInfo(id),
    listEquipment(supabase, id),
    listPriceTiers(supabase),
  ]);
  if (!found) notFound();
  const { customer: c, quotes, service, openBalanceCents } = found;
  const cert = c.tax_cert_path
    ? (await supabase.storage.from("customer-documents").createSignedUrl(c.tax_cert_path, 600)).data?.signedUrl ?? null
    : null;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/customers">← Customers</Link></p>
      <PageHeader
        title={c.name}
        description={
          <>
            {c.company ? `${c.company} · ` : ""}Customer since {formatDate(c.created_at)} ·{" "}
            {signIn === null ? "sign-in status unknown" : signIn.hasSignedIn ? `last signed in ${formatDate(signIn.lastSignInAt!)}` : "hasn’t signed in yet"}
          </>
        }
        actions={
          <DeleteButton
            action={removeCustomerAction.bind(null, c.user_id)}
            label="Remove account"
            confirmText={`Remove ${c.name}'s customer login? Their past requests stay in the inbox.`}
          />
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <dl className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
            <Detail label="Email"><a href={`mailto:${c.email}`}>{c.email}</a></Detail>
            <Detail label="Phone">{c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}</Detail>
            <Detail label="Shipping address">{address("ship", c as unknown as Record<string, unknown>)}</Detail>
            <Detail label="Billing address">
              {c.bill_same_as_ship ? <span className="text-fg-muted">Same as shipping</span> : address("bill", c as unknown as Record<string, unknown>)}
            </Detail>
          </dl>

          <section aria-labelledby="c-service" className="flex flex-col gap-2">
            <h2 id="c-service" className="font-semibold">Service jobs ({service.length})</h2>
            {service.length === 0 ? <p className="text-sm text-fg-muted">None yet.</p> : (
              <ul className="flex flex-col divide-y divide-edge-soft rounded-md border border-edge bg-surface">
                {service.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span>
                      <Link href={`/admin/service/${j.id}`} className="font-mono font-semibold">{j.reference}</Link>{" "}
                      {EQUIPMENT_TYPES[j.equipment_type]} · {formatDate(j.created_at)}
                    </span>
                    <StatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="c-equipment" className="flex flex-col gap-2">
            <h2 id="c-equipment" className="font-semibold">Equipment ({units.length})</h2>
            {units.length === 0 ? <p className="text-sm text-fg-muted">The customer hasn’t added any units.</p> : (
              <ul className="flex flex-col divide-y divide-edge-soft rounded-md border border-edge bg-surface">
                {units.map((u) => (
                  <li key={u.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                    <span>
                      <strong>{u.label}</strong> · {EQUIPMENT_TYPES[u.equipment_type]}
                      {u.location && <span className="text-fg-muted"> · {u.location}</span>}
                    </span>
                    {nameplateLine(u) && <span className="font-mono text-[13px] text-fg-muted">{nameplateLine(u)}</span>}
                    {(u.model || u.serial) && (
                      <span className="text-fg-muted">
                        {[u.model && `Model ${u.model}`, u.serial && `S/N ${u.serial}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {u.jobs.length > 0 && (
                      <span>
                        Repairs:{" "}
                        {u.jobs.map((j, i) => (
                          <span key={j.id}>
                            {i > 0 && ", "}
                            <Link href={`/admin/service/${j.id}`} className="font-mono">{j.reference}</Link>
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="c-quotes" className="flex flex-col gap-2">
            <h2 id="c-quotes" className="font-semibold">Quote requests ({quotes.length})</h2>
            {quotes.length === 0 ? <p className="text-sm text-fg-muted">None yet.</p> : (
              <ul className="flex flex-col divide-y divide-edge-soft rounded-md border border-edge bg-surface">
                {quotes.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span>
                      <Link href={`/admin/quotes/${q.id}`} className="font-mono font-semibold">{q.reference}</Link>{" "}
                      {q.product_sku ?? "General"} · {formatDate(q.created_at)}
                    </span>
                    <StatusBadge status={q.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="c-tax" className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
            <h2 id="c-tax" className="font-display text-xl font-bold uppercase tracking-[0.04em]">Sales tax</h2>
            {c.tax_cert_path ? (
              <p className="text-sm">
                Certificate uploaded {c.tax_cert_uploaded_at ? formatDate(c.tax_cert_uploaded_at) : ""}.{" "}
                {cert && <a href={cert} target="_blank" rel="noreferrer">Open certificate</a>}
              </p>
            ) : (
              <p className="text-sm text-fg-muted">No certificate uploaded.</p>
            )}
            <form action={setTaxExemptAction.bind(null, c.user_id)} className="flex flex-wrap items-center gap-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                <input type="checkbox" name="tax_exempt" defaultChecked={c.tax_exempt} className="size-[18px] accent-fg" />
                Tax-exempt (certificate checked)
              </label>
              <Button type="submit" variant="dark" size="sm">Save</Button>
            </form>
          </section>
          <section aria-labelledby="c-terms" className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
            <h2 id="c-terms" className="font-display text-xl font-bold uppercase tracking-[0.04em]">Payment terms</h2>
            {(c.terms === "net30" || openBalanceCents > 0) && (
              <p className="text-sm">
                Unpaid Net-30 invoices: <strong>{formatPrice(openBalanceCents)}</strong>
                {c.terms === "net30" && <> · {formatPrice(Math.max(0, c.credit_limit_cents - openBalanceCents))} credit available</>}
              </p>
            )}
            <TermsForm customerId={c.user_id} terms={c.terms} limitCents={c.credit_limit_cents} />
          </section>
          <section aria-labelledby="c-pricing" className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
            <h2 id="c-pricing" className="font-display text-xl font-bold uppercase tracking-[0.04em]">Pricing</h2>
            {tiers.length === 0 ? (
              <p className="text-sm text-fg-muted">
                Pays list prices. <Link href="/admin/pricing">Set up price tiers</Link> to give customers a discount.
              </p>
            ) : (
              <form action={setCustomerTierAction.bind(null, c.user_id)} className="flex flex-wrap items-end gap-3">
                <label htmlFor="price_tier_id" className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">
                  Price tier
                  <select
                    id="price_tier_id"
                    name="price_tier_id"
                    defaultValue={c.price_tier_id ?? ""}
                    className="h-11 rounded border border-edge-strong bg-surface px-3 font-normal text-fg"
                  >
                    <option value="">List prices</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({Number(t.discount_percent.toFixed(2))}% off)
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="dark" size="sm" className="h-11">Save</Button>
              </form>
            )}
          </section>
          <section aria-labelledby="c-login" className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
            <h2 id="c-login" className="font-display text-xl font-bold uppercase tracking-[0.04em]">Sign-in</h2>
            <NewSignInLinkForm customerId={c.user_id} />
          </section>
        </div>
      </div>
    </>
  );
}
