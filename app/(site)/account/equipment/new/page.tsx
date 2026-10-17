import Link from "next/link";
import { saveEquipmentAction } from "@/app/actions/equipment";
import { AccountShell } from "@/components/account/account-shell";
import { EquipmentForm } from "@/components/account/equipment-form";
import { requireCustomer } from "@/lib/customers/account";
import { equipmentToForm } from "@/lib/customers/equipment";

export const metadata = { title: "Add equipment" };

export default async function NewEquipmentPage() {
  const { customer } = await requireCustomer();
  return (
    <AccountShell current="/account/equipment" name={customer.name} company={customer.company}>
      <p className="text-sm"><Link href="/account/equipment">← Your equipment</Link></p>
      <h2 className="font-display text-3xl font-bold uppercase tracking-[0.03em]">Add a unit</h2>
      <p className="max-w-2xl text-fg-muted">Only a name is needed. Copy what you can from the nameplate; the more we know, the faster we can quote a repair or find a match.</p>
      <div className="max-w-3xl rounded-md border border-edge bg-surface p-5">
        <EquipmentForm action={saveEquipmentAction.bind(null, null)} initial={equipmentToForm(null)} submitLabel="Add unit" />
      </div>
    </AccountShell>
  );
}
