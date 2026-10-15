import {
  EXPORT_HEADER,
  exportRow,
  importTemplateCsv,
  parseImport,
  planImport,
  toCsv,
  type CatalogRefs,
  type ExistingProduct,
  type ProductValues,
} from "@/lib/admin/csv-import";
import {
  parseBool,
  parseCondition,
  parseEnclosure,
  parseMoney,
  parseNumber,
  parsePower,
  parseShipClass,
  parseSpecs,
  parseStatus,
  slugify,
} from "@/lib/admin/product-fields";

describe("field parsers", () => {
  it("parses prices the way spreadsheets write them", () => {
    expect(parseMoney("$1,234.50")).toEqual({ value: 123450 });
    expect(parseMoney("89")).toEqual({ value: 8900 });
    expect(parseMoney("")).toEqual({ value: null });
    expect(parseMoney("call")).toHaveProperty("error");
    expect(parseMoney("12.345")).toHaveProperty("error");
  });

  it("parses nameplate numbers including fractions", () => {
    expect(parseNumber("7½", "HP")).toEqual({ value: 7.5 });
    expect(parseNumber("½", "HP")).toEqual({ value: 0.5 });
    expect(parseNumber("3/4", "HP")).toEqual({ value: 0.75 });
    expect(parseNumber("1,750", "RPM", { integer: true })).toEqual({ value: 1750 });
    expect(parseNumber("17.5", "RPM", { integer: true })).toHaveProperty("error");
    expect(parseNumber("-2", "HP")).toHaveProperty("error");
  });

  it("accepts common aliases", () => {
    expect(parseCondition("Reman").value).toBe("remanufactured");
    expect(parseCondition("used").value).toBe("used_tested");
    expect(parseCondition("").value).toBe("new");
    expect(parseEnclosure("Explosion-Proof").value).toBe("xp");
    expect(parseEnclosure("tefc").value).toBe("tefc");
    expect(parsePower("3 phase").value).toBe("ac_3ph");
    expect(parsePower("AC 1PH").value).toBe("ac_1ph");
    expect(parsePower("ac_3ph").value).toBe("ac_3ph");
    expect(parsePower("DC").value).toBe("dc");
    expect(parseShipClass("Freight").value).toBe("ltl");
    expect(parseShipClass("pickup_only").value).toBe("pickup_only");
    expect(parseStatus("").value).toBe("active");
    expect(parseStatus("hidden").value).toBe("draft");
    expect(parseBool("Y", "Featured").value).toBe(true);
    expect(parseBool("", "Featured").value).toBe(false);
    for (const bad of [parseCondition("broken"), parseEnclosure("box"), parsePower("2ph"), parseStatus("gone"), parseBool("maybe", "x")]) {
      expect(bad).toHaveProperty("error");
    }
  });

  it("parses spec lines from the form (newlines) and CSV cells (semicolons)", () => {
    expect(parseSpecs("Frequency: 60 Hz\nShaft: 1⅛ in")).toEqual({
      value: [
        { label: "Frequency", value: "60 Hz" },
        { label: "Shaft", value: "1⅛ in" },
      ],
    });
    expect(parseSpecs("Mount: J180; Pulley: 2-groove").value).toHaveLength(2);
    expect(parseSpecs("no colon here")).toHaveProperty("error");
    expect(parseSpecs("")).toEqual({ value: [] });
  });

  it("slugifies product names", () => {
    expect(slugify("7½ HP Explosion-Proof Motor, 213T")).toBe("7-5-hp-explosion-proof-motor-213t");
    expect(slugify("  Pumps & Blowers  ")).toBe("pumps-blowers");
  });
});

describe("parseImport", () => {
  it("maps header aliases and reports unknown headers", () => {
    const parsed = parseImport("Part #,Product Name,Category,Unit Price,Qty on hand,Color\nM-1,Motor,Electric motors,$99,3,red\n");
    expect(parsed.columns).toEqual(["sku", "name", "category", "price", "qty"]);
    expect(parsed.ignoredHeaders).toEqual(["Color"]);
    expect(parsed.rows).toEqual([
      { line: 2, sku: "M-1", values: { name: "Motor", category: "Electric motors", price_cents: 9900, qty: 3 } },
    ]);
    expect(parsed.errors).toEqual([]);
  });

  it("requires a SKU column", () => {
    expect(parseImport("name,price\nMotor,1\n").errors[0].message).toMatch(/SKU column/);
  });

  it("collects every bad cell with its line number, skipping blank lines", () => {
    const parsed = parseImport("sku,price,condition\nA,abc,new\n,,\nB,10,broken\n,5,new\n");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors.map((e) => [e.line, e.sku])).toEqual([[2, "A"], [4, "B"], [5, null]]);
  });

  it("handles quoted fields, embedded commas and a BOM", () => {
    const parsed = parseImport('﻿sku,name,specs\nA,"Motor, 5 HP","Mount: J180; Pulley: 2-groove"\n');
    expect(parsed.rows[0].values).toEqual({
      name: "Motor, 5 HP",
      specs: [
        { label: "Mount", value: "J180" },
        { label: "Pulley", value: "2-groove" },
      ],
    });
  });
});

const refs: CatalogRefs = {
  categories: [
    { id: "c1", slug: "electric-motors", name: "Electric motors" },
    { id: "c2", slug: "pumps", name: "Pumps" },
  ],
  brands: [{ id: "b1", slug: "acme", name: "Acme" }],
};

function existing(sku: string, overrides: Partial<ProductValues> = {}): ExistingProduct {
  return {
    id: `id-${sku}`,
    sku,
    values: {
      name: "5 HP Motor",
      slug: "5-hp-motor",
      category: "electric-motors",
      brand: "Acme",
      mfr_part_number: null,
      family_key: null,
      description: null,
      condition: "new",
      price_cents: 50000,
      core_charge_cents: null,
      ship_class: "parcel",
      weight_lb: null,
      hp: 5,
      rpm: 1750,
      frame: "184T",
      enclosure: "tefc",
      power: "ac_3ph",
      voltage: "230/460V",
      specs: [],
      featured: false,
      status: "active",
      qty: 2,
      ...overrides,
    },
  };
}

describe("planImport", () => {
  it("updates only the columns present and only when they change", () => {
    const parsed = parseImport("sku,price,qty\nM-1,500.00,2\nM-2,525,4\n");
    const plan = planImport(parsed, [existing("M-1"), existing("M-2", { slug: "other" })], refs);
    expect(plan.unchanged).toBe(1);
    expect(plan.updates).toEqual([{ line: 3, sku: "M-2", id: "id-M-2", changes: { price_cents: 52500, qty: 4 } }]);
    expect(plan.creates).toEqual([]);
  });

  it("matches SKUs case-insensitively and categories by name or slug", () => {
    const parsed = parseImport("sku,category\nm-1,Pumps\n");
    const plan = planImport(parsed, [existing("M-1")], refs);
    expect(plan.updates[0].changes).toEqual({ category: "pumps" });
  });

  it("creates new products with defaults and a unique slug", () => {
    const parsed = parseImport("sku,name,category,condition\nN-1,5 HP Motor,electric motors,new\nN-2,5 HP Motor,electric motors,reman\nN-3,5 HP Motor,electric motors,\n");
    const plan = planImport(parsed, [existing("M-1")], refs);
    expect(plan.creates.map((c) => c.values.slug)).toEqual(["5-hp-motor-2", "5-hp-motor-remanufactured", "5-hp-motor-3"]);
    expect(plan.creates[0].values).toMatchObject({ status: "active", ship_class: "parcel", condition: "new", specs: [] });
  });

  it("rejects new products without a name or category, unknown categories and duplicate SKUs", () => {
    const parsed = parseImport("sku,name,category\nN-1,,pumps\nN-2,Pump,\nN-3,Pump,Spaceships\nN-4,Pump,pumps\nn-4,Pump,pumps\n");
    const plan = planImport(parsed, [], refs);
    expect(plan.errors.map((e) => [e.line, e.message.split(" ").slice(0, 3).join(" ")])).toEqual([
      [2, "New products need"],
      [3, "New products need"],
      [4, "Unknown category “Spaceships”."],
      [6, "Duplicate SKU (also"],
    ]);
    expect(plan.creates.map((c) => c.sku)).toEqual(["N-4"]);
  });

  it("lists brands that will be created", () => {
    const parsed = parseImport("sku,brand\nM-1,acme\nM-2,Zenith Motors\n");
    const plan = planImport(parsed, [existing("M-1"), existing("M-2", { slug: "x" })], refs);
    expect(plan.newBrands).toEqual(["Zenith Motors"]);
    expect(plan.updates.map((u) => u.sku)).toEqual(["M-2"]);
  });

  it("refuses a slug another product already uses", () => {
    const parsed = parseImport("sku,slug\nM-2,5-hp-motor\n");
    const plan = planImport(parsed, [existing("M-1"), existing("M-2", { slug: "x" })], refs);
    expect(plan.errors[0].message).toMatch(/already used/);
  });
});

describe("export", () => {
  it("round-trips through parseImport with no changes", () => {
    const product = existing("M-1", {
      description: 'Has "quotes", commas\nand a newline',
      specs: [{ label: "Mount", value: "J180" }],
      enclosure: "xp",
      power: "dc",
      ship_class: "pickup_only",
      condition: "used_tested",
      featured: true,
      hp: 7.5,
    });
    const csv = toCsv([EXPORT_HEADER, exportRow(product.sku, product.values)]);
    const plan = planImport(parseImport(csv), [product], refs);
    expect(plan.errors).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("ships a template whose example rows import cleanly", () => {
    const plan = planImport(parseImport(importTemplateCsv()), [], refs);
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toHaveLength(2);
    expect(plan.creates[1].values).toMatchObject({ condition: "exchange", core_charge_cents: 15000, enclosure: "tefc", power: "ac_3ph" });
  });
});
