"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/customers/account";
import { EQUIPMENT_FORM_FIELDS, MAX_EQUIPMENT, parseEquipmentForm } from "@/lib/customers/equipment";
import { formFields } from "@/lib/requests/schemas";
import { createSessionClient } from "@/lib/supabase/server";

// A customer's equipment list. Every write goes through their own session,
// so RLS limits it to their own units.

export interface EquipmentFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  saved?: boolean;
  /** Changes on every result, so the form shows what was typed (or the saved values). */
  version?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Add a unit (id null) or save changes to one. */
export async function saveEquipmentAction(id: string | null, _prev: EquipmentFormState, formData: FormData): Promise<EquipmentFormState> {
  const { id: customerId } = await requireCustomer();
  if (id !== null && !UUID.test(id)) return { error: "That unit no longer exists." };
  const form = formFields(formData, EQUIPMENT_FORM_FIELDS);
  const parsed = parseEquipmentForm(form);
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors, values: form, version: Date.now() };

  const supabase = await createSessionClient();
  if (id === null) {
    const { count } = await supabase.from("equipment").select("id", { count: "exact", head: true }).eq("customer_id", customerId);
    if ((count ?? 0) >= MAX_EQUIPMENT) return { error: `Your list can hold up to ${MAX_EQUIPMENT} units.`, values: form, version: Date.now() };
  }
  const { error } =
    id === null
      ? await supabase.from("equipment").insert({ ...parsed.values, customer_id: customerId })
      : await supabase.from("equipment").update(parsed.values).eq("id", id);
  if (error) {
    console.error("[equipment] save:", error.message);
    return { error: "We couldn’t save that. Please try again.", values: form, version: Date.now() };
  }
  revalidatePath("/account/equipment");
  redirect(`/account/equipment?saved=${id === null ? "added" : "updated"}`);
}

/** Remove a unit from the list. Its repair jobs stay, unlinked. */
export async function deleteEquipmentAction(id: string): Promise<void> {
  await requireCustomer();
  if (!UUID.test(id)) return;
  const supabase = await createSessionClient();
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) console.error("[equipment] delete:", error.message);
  revalidatePath("/account/equipment");
  redirect("/account/equipment?saved=removed");
}
