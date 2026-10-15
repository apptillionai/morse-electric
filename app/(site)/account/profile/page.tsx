import { ShieldCheck } from "lucide-react";
import { AccountShell } from "@/components/account/account-shell";
import { ProfileForm, TaxCertificateForm } from "@/components/account/profile-form";
import { requireCustomer, type CustomerProfile } from "@/lib/customers/account";
import { PROFILE_FIELDS, type ProfileField } from "@/lib/customers/schemas";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata = { title: "Company details" };

function toForm(c: CustomerProfile): Record<ProfileField, string> {
  return Object.fromEntries(
    PROFILE_FIELDS.map((f) => [f, f === "bill_same_as_ship" ? (c.bill_same_as_ship ? "on" : "") : (c[f] ?? "")]),
  ) as Record<ProfileField, string>;
}

export default async function ProfilePage() {
  const { customer } = await requireCustomer();
  let certificate: { uploadedAt: string; url: string | null } | null = null;
  if (customer.tax_cert_path) {
    const { data } = await (await createSessionClient()).storage
      .from("customer-documents")
      .createSignedUrl(customer.tax_cert_path, 600);
    certificate = {
      uploadedAt: customer.tax_cert_uploaded_at
        ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(customer.tax_cert_uploaded_at))
        : "earlier",
      url: data?.signedUrl ?? null,
    };
  }

  return (
    <AccountShell current="/account/profile" name={customer.name} company={customer.company}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ProfileForm email={customer.email} initial={toForm(customer)} />
        <section aria-labelledby="tax-heading" className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-5">
          <h2 id="tax-heading" className="font-display text-xl font-bold uppercase tracking-[0.04em]">Sales tax</h2>
          {customer.tax_exempt ? (
            <p className="flex items-center gap-2 font-semibold text-ok">
              <ShieldCheck size={20} aria-hidden="true" /> Your account is tax-exempt.
            </p>
          ) : (
            <p className="text-sm text-fg-muted">
              Buying for resale or a tax-exempt organization? Upload your exemption or resale certificate and we’ll mark
              your account tax-exempt once we’ve checked it.
            </p>
          )}
          <TaxCertificateForm onFile={certificate} />
        </section>
      </div>
    </AccountShell>
  );
}
