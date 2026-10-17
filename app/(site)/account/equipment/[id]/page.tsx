import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEquipmentAction, saveEquipmentAction } from "@/app/actions/equipment";
import { AccountShell } from "@/components/account/account-shell";
import { EquipmentForm } from "@/components/account/equipment-form";
import { requireCustomer } from "@/lib/customers/account";
import { equipmentToForm, type Equipment } from "@/lib/customers/equipment";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit equipment" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEquipmentPage(props: PageProps<"/account/equipment/[id]">) {
  const [{ id: customerId, customer }, { id }] = await Promise.all([requireCustomer(), props.params]);
  if (!UUID.test(id)) notFound();
  // RLS returns only the customer's own units.
  const { data } = await (await createSessionClient()).from("equipment").select("*").eq("id", id).eq("customer_id", customerId).maybeSingle();
  if (!data) notFound();
  const unit = { ...(data as Equipment), hp: data.hp === null ? null : Number(data.hp) };

  return (
    <AccountShell current="/account/equipment" name={customer.name} company={customer.company}>
      <p className="text-sm"><Link href="/account/equipment">← Your equipment</Link></p>
      <h2 className="font-display text-3xl font-bold uppercase tracking-[0.03em]">{unit.label}</h2>
      <div className="max-w-3xl rounded-md border border-edge bg-surface p-5">
        <EquipmentForm action={saveEquipmentAction.bind(null, unit.id)} initial={equipmentToForm(unit)} submitLabel="Save changes" />
      </div>
      <form action={deleteEquipmentAction.bind(null, unit.id)}>
        <button type="submit" className="min-h-11 text-sm font-semibold text-fg-muted underline hover:text-danger">
          Remove this unit from my list
        </button>
        <span className="ml-2 text-sm text-fg-muted">Its repair jobs stay in your account.</span>
      </form>
    </AccountShell>
  );
}
