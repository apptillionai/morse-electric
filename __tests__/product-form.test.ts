import { parseProductForm, PRODUCT_FORM_FIELDS, productToForm, type ProductFormField } from "@/lib/admin/product-form";

const blank = Object.fromEntries(PRODUCT_FORM_FIELDS.map((f) => [f, ""])) as Record<ProductFormField, string>;
const form = (patch: Partial<Record<ProductFormField, string>>) => ({ ...blank, ...patch });

describe("parseProductForm", () => {
  it("builds product values with defaults and a slug from the name", () => {
    const result = parseProductForm(
      form({ sku: " M-1 ", name: "7½ HP Motor", category: "electric-motors", price: "$1,299", qty: "3", specs: "Frame: 213T", featured: "on", frame: "213t" }),
      ["electric-motors"],
    );
    expect(result).toEqual({
      ok: true,
      sku: "M-1",
      values: expect.objectContaining({
        name: "7½ HP Motor",
        slug: "7-5-hp-motor",
        category: "electric-motors",
        price_cents: 129900,
        qty: 3,
        featured: true,
        frame: "213T",
        condition: "new",
        status: "active",
        ship_class: "parcel",
        specs: [{ label: "Frame", value: "213T" }],
      }),
    });
  });

  it("reports every invalid field at once", () => {
    const result = parseProductForm(form({ category: "spaceships", price: "abc", rpm: "1750.5", specs: "oops" }), ["pumps"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["category", "name", "price", "rpm", "sku", "specs"]);
  });

  it("keeps an explicit slug but normalizes it", () => {
    const result = parseProductForm(form({ sku: "A", name: "X", category: "pumps", slug: "My Pump URL" }), ["pumps"]);
    expect(result.ok && result.values.slug).toBe("my-pump-url");
  });

  it("treats an empty quantity as 'leave stock alone'", () => {
    const result = parseProductForm(form({ sku: "A", name: "X", category: "pumps" }), ["pumps"]);
    expect(result.ok && result.values.qty).toBeNull();
  });

  it("round-trips an existing product through the form", () => {
    const first = parseProductForm(
      form({
        sku: "M-2", name: "Pump", category: "pumps", brand: "Baldor", price: "1299.5", core_charge: "150", qty: "0",
        hp: "1.5", rpm: "3450", enclosure: "tefc", power: "3 phase", status: "draft", featured: "on",
        specs: "Seal: Viton\nPorts: 1 in NPT", weight_lb: "42", description: "Close-coupled", family_key: "Pump Family",
      }),
      ["pumps"],
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parseProductForm(productToForm(first.sku, first.values), ["pumps"]);
    expect(second).toEqual(first);
  });
});
