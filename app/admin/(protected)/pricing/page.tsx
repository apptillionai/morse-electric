import { deletePriceTierAction } from "@/app/admin/actions";
import { Notice, PageHeader } from "@/components/admin/admin-shell";
import { DeleteButton } from "@/components/admin/delete-button";
import { PriceTierForm } from "@/components/admin/price-tier-form";
import { staffClient } from "@/lib/admin/auth";
import { listPriceTiers } from "@/lib/admin/customers";

export const metadata = { title: "Pricing" };

export default async function PricingPage(props: PageProps<"/admin/pricing">) {
  const sp = await props.searchParams;
  const tiers = await listPriceTiers(await staffClient());

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Price tiers give a customer a discount off list prices when they’re signed in, at checkout, on Net-30 orders and on quotes started from a catalog part. Put a customer on a tier from their page under Customers."
      />
      {sp.removed === "1" && <Notice>Tier removed. Its customers are back on list prices.</Notice>}

      <section aria-labelledby="tiers-heading" className="flex flex-col gap-4">
        <h2 id="tiers-heading" className="font-display text-xl font-bold uppercase tracking-[0.04em]">Price tiers</h2>
        {tiers.length === 0 ? (
          <p className="text-fg-muted">No tiers yet. Everyone pays list prices (and quantity prices, where a product has them).</p>
        ) : (
          <ul className="flex flex-col divide-y divide-edge-soft rounded-md border border-edge bg-surface">
            {tiers.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-4">
                <PriceTierForm tier={t} />
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
                  <span>
                    {t.customers === 0 ? "No customers" : t.customers === 1 ? "1 customer" : `${t.customers} customers`} on this tier
                  </span>
                  <DeleteButton
                    action={deletePriceTierAction.bind(null, t.id)}
                    label={`Remove ${t.name}`}
                    confirmText={`Remove the ${t.name} tier? Its customers go back to list prices. Orders already placed keep their prices.`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-4">
          <h3 className="font-semibold">Add a tier</h3>
          <PriceTierForm tier={null} />
        </div>
      </section>

      <section aria-labelledby="rules-heading" className="mt-8 flex max-w-3xl flex-col gap-2 text-sm">
        <h2 id="rules-heading" className="font-display text-xl font-bold uppercase tracking-[0.04em]">How prices are worked out</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>A customer pays the lowest of the list price, the quantity price their order reaches and their tier price. Discounts never stack.</li>
          <li>Quantity prices are set on each product (Products → Price and stock) and apply to everyone, signed in or not.</li>
          <li>Tier discounts come off the item price only, never core charges or shipping.</li>
          <li>Changing a tier changes prices for new carts and quotes. Placed orders and sent quotes keep their prices.</li>
          <li>Product pages show the list price and quantity prices to everyone, and a signed-in customer also sees their own price. Google Shopping only ever gets the list price.</li>
        </ul>
      </section>
    </>
  );
}
