"use client";

import { useActionState } from "react";
import { saveProductAction, type ProductFormState } from "@/app/admin/actions";
import { CheckboxField, FormMessage, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { PRODUCT_STATUSES } from "@/lib/admin/product-fields";
import type { ProductFormField } from "@/lib/admin/product-form";
import { CONDITION_LABELS, ENCLOSURE_LABELS, ENCLOSURES, POWER_LABELS, POWER_SUPPLIES, PRODUCT_CONDITIONS } from "@/lib/catalog/types";

const STATUS_LABELS = { draft: "Draft (hidden from the site)", active: "Active (listed)", archived: "Archived (hidden)" };
const SHIP_OPTIONS = [
  { value: "parcel", label: "Parcel" },
  { value: "ltl", label: "Freight (LTL)" },
  { value: "pickup_only", label: "Pickup only" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-5 rounded-md border border-edge bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="px-1 font-display text-xl font-bold uppercase tracking-[0.04em]">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProductForm({
  productId,
  initial,
  categories,
  brands,
}: {
  productId: string | null;
  initial: Record<ProductFormField, string>;
  categories: { slug: string; name: string }[];
  brands: string[];
}) {
  const [state, action, pending] = useActionState(saveProductAction.bind(null, productId), {} as ProductFormState);
  const v = (f: ProductFormField) => state.values?.[f] ?? initial[f];
  const e = (f: ProductFormField) => state.fieldErrors?.[f];
  // Re-mount the fields when the server sends back the submitted values, so selects and
  // checkboxes show what was typed rather than the initial values.
  const key = state.values ? JSON.stringify(state) : "initial";

  return (
    <form action={action} className="flex flex-col gap-6" noValidate key={key}>
      <FormMessage message={state.error} />

      <Section title="Basics">
        <TextField label="SKU" name="sku" required defaultValue={v("sku")} error={e("sku")} className="font-mono" autoComplete="off" />
        <TextField label="Name" name="name" required defaultValue={v("name")} error={e("name")} className="sm:col-span-2" />
        <SelectField
          label="Category"
          name="category"
          required
          defaultValue={v("category")}
          error={e("category")}
          options={[{ value: "", label: "Choose…" }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]}
        />
        <TextField label="Brand" name="brand" list="brand-options" defaultValue={v("brand")} error={e("brand")} hint="New brands are added automatically." />
        <datalist id="brand-options">
          {brands.map((b) => <option key={b} value={b} />)}
        </datalist>
        <TextField label="Manufacturer part #" name="mfr_part_number" defaultValue={v("mfr_part_number")} error={e("mfr_part_number")} />
        <TextAreaField
          label="Cross-references"
          name="cross_references"
          rows={3}
          defaultValue={v("cross_references")}
          error={e("cross_references")}
          hint="Part numbers this replaces (other brands, the original maker), one per line. Customers can search by any of them."
          className="sm:col-span-2 lg:col-span-3"
        />
        <SelectField
          label="Condition"
          name="condition"
          required
          defaultValue={v("condition") || "new"}
          error={e("condition")}
          options={PRODUCT_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
        />
        <SelectField
          label="Status"
          name="status"
          required
          defaultValue={v("status") || "active"}
          error={e("status")}
          options={PRODUCT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
        <div className="flex items-end">
          <CheckboxField label="Feature on the home page" name="featured" defaultChecked={v("featured") === "on"} />
        </div>
      </Section>

      <Section title="Price and stock">
        <TextField label="Price ($)" name="price" inputMode="decimal" defaultValue={v("price")} error={e("price")} hint="Leave blank to show “Price on request”." />
        <TextField label="Core charge ($)" name="core_charge" inputMode="decimal" defaultValue={v("core_charge")} error={e("core_charge")} hint="Refundable deposit for exchange units." />
        <TextField label="Quantity on hand" name="qty" inputMode="numeric" defaultValue={v("qty")} error={e("qty")} hint={productId ? "Leave blank to keep the current count." : "0 or blank means special order."} />
        <SelectField label="Shipping" name="ship_class" required defaultValue={v("ship_class") || "parcel"} error={e("ship_class")} options={SHIP_OPTIONS} />
        <TextField label="Weight (lb)" name="weight_lb" inputMode="decimal" defaultValue={v("weight_lb")} error={e("weight_lb")} />
      </Section>

      <Section title="Specifications">
        <TextField label="HP" name="hp" inputMode="decimal" defaultValue={v("hp")} error={e("hp")} hint="Decimals or fractions: 0.5, 1/2, 7½" />
        <TextField label="RPM" name="rpm" inputMode="numeric" defaultValue={v("rpm")} error={e("rpm")} />
        <TextField label="Frame" name="frame" defaultValue={v("frame")} error={e("frame")} hint="e.g. 184T, 56C" />
        <SelectField
          label="Enclosure"
          name="enclosure"
          defaultValue={v("enclosure")}
          error={e("enclosure")}
          options={[{ value: "", label: "—" }, ...ENCLOSURES.map((x) => ({ value: x, label: ENCLOSURE_LABELS[x] }))]}
        />
        <SelectField
          label="Power"
          name="power"
          defaultValue={v("power")}
          error={e("power")}
          options={[{ value: "", label: "—" }, ...POWER_SUPPLIES.map((x) => ({ value: x, label: POWER_LABELS[x] }))]}
        />
        <TextField label="Voltage" name="voltage" defaultValue={v("voltage")} error={e("voltage")} hint="e.g. 208-230/460" />
        <TextAreaField
          label="Other specs"
          name="specs"
          rows={5}
          defaultValue={v("specs")}
          error={e("specs")}
          hint="One per line, as Label: value. For example Service factor: 1.15"
          className="sm:col-span-2 lg:col-span-3"
        />
      </Section>

      <Section title="Listing">
        <TextAreaField label="Description" name="description" rows={5} defaultValue={v("description")} error={e("description")} className="sm:col-span-2 lg:col-span-3" />
        <TextField label="URL slug" name="slug" defaultValue={v("slug")} error={e("slug")} hint="Made from the name when blank." />
        <TextField label="Family" name="family_key" defaultValue={v("family_key")} error={e("family_key")} hint="Same family = condition choices on one product page." />
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : productId ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
