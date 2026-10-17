import { parseTierForm } from "@/lib/admin/price-tiers";
import {
  nextPriceBreak,
  parsePriceBreaks,
  priceCart,
  priceNote,
  tierOf,
  tierPriceCents,
  unitPriceFor,
  type BuyableProduct,
} from "@/lib/orders/pricing";

const A = "11111111-1111-4111-8111-111111111111";

const BREAKS = [
  { minQty: 5, priceCents: 65000 },
  { minQty: 10, priceCents: 62000 },
];

const motor = (over: Partial<BuyableProduct> = {}): BuyableProduct => ({
  id: A,
  sku: "EM-5HP",
  slug: "em-5hp",
  name: "5 HP motor",
  condition: "new",
  active: true,
  priceCents: 68900,
  coreChargeCents: null,
  shipClass: "parcel",
  weightLb: 20,
  priceBreaks: BREAKS,
  available: 40,
  ...over,
});

const CONTRACTOR = { tierName: "Contractor", discountPercent: 10 };

describe("parsePriceBreaks", () => {
  it("reads the stored JSON, sorted by quantity, dropping anything malformed", () => {
    expect(
      parsePriceBreaks([
        { min_qty: 10, price_cents: 62000 },
        { min_qty: 5, price_cents: 65000 },
        { min_qty: 1, price_cents: 1 },
        { min_qty: 2.5, price_cents: 100 },
        { min_qty: 3 },
        "junk",
      ]),
    ).toEqual(BREAKS);
    expect(parsePriceBreaks(null)).toEqual([]);
    expect(parsePriceBreaks({ min_qty: 5 })).toEqual([]);
  });
});

describe("tierPriceCents", () => {
  it("takes the discount off to the nearest cent", () => {
    expect(tierPriceCents(68900, 10)).toBe(62010);
    expect(tierPriceCents(999, 12.5)).toBe(874); // 874.125
    expect(tierPriceCents(1001, 12.5)).toBe(876); // 875.875
    expect(tierPriceCents(68900, 0)).toBe(68900);
  });
});

describe("unitPriceFor", () => {
  it("charges list price for one, with no tier", () => {
    expect(unitPriceFor(motor(), 1, null)).toEqual({ unitCents: 68900, listCents: 68900, basis: "list" });
  });

  it("uses the quantity price the order reaches", () => {
    expect(unitPriceFor(motor(), 4, null)?.unitCents).toBe(68900);
    expect(unitPriceFor(motor(), 5, null)).toEqual({ unitCents: 65000, listCents: 68900, basis: "volume" });
    expect(unitPriceFor(motor(), 9, null)?.unitCents).toBe(65000);
    expect(unitPriceFor(motor(), 25, null)?.unitCents).toBe(62000);
  });

  it("gives a tier customer the lower of their price and the quantity price, never both", () => {
    // 10% off 689.00 is 620.10, which beats 650.00 at five...
    expect(unitPriceFor(motor(), 5, CONTRACTOR)).toEqual({ unitCents: 62010, listCents: 68900, basis: "tier" });
    // ...but not 620.00 at ten.
    expect(unitPriceFor(motor(), 10, CONTRACTOR)).toEqual({ unitCents: 62000, listCents: 68900, basis: "volume" });
    expect(unitPriceFor(motor({ priceBreaks: [] }), 10, CONTRACTOR)?.unitCents).toBe(62010);
  });

  it("has no price for a product priced on request", () => {
    expect(unitPriceFor(motor({ priceCents: null, priceBreaks: [] }), 1, CONTRACTOR)).toBeNull();
  });
});

describe("priceCart with customer pricing", () => {
  it("prices each line at the customer's unit price; core charges and shipping aren't discounted", () => {
    const products = new Map([[A, motor({ coreChargeCents: 15000 })]]);
    const rates = [{ maxLb: 500, cents: 9500 }];
    const guest = priceCart([{ productId: A, quantity: 2 }], products, rates);
    expect(guest.subtotalCents).toBe(137800);

    const contractor = priceCart([{ productId: A, quantity: 2 }], products, rates, CONTRACTOR);
    expect(contractor.lines[0].unit.unitCents).toBe(62010);
    expect(contractor.subtotalCents).toBe(124020);
    expect(contractor.coreCents).toBe(30000);
    expect(contractor.shipping).toEqual({ available: true, cents: 9500 });

    const bulk = priceCart([{ productId: A, quantity: 12 }], products, rates);
    expect(bulk.lines[0].unit.basis).toBe("volume");
    expect(bulk.subtotalCents).toBe(12 * 62000);
  });
});

describe("price notes", () => {
  it("says why a unit costs less than list", () => {
    const at = (qty: number, pricing = null as typeof CONTRACTOR | null) =>
      priceNote(unitPriceFor(motor(), qty, pricing)!, motor(), qty, pricing);
    expect(at(1)).toBeNull();
    expect(at(6)).toBe("Price for 5 or more");
    expect(at(2, CONTRACTOR)).toBe("Contractor price (10% off)");
    expect(priceNote(unitPriceFor(motor(), 1, { tierName: "OEM", discountPercent: 12.5 })!, motor(), 1, { tierName: "OEM", discountPercent: 12.5 })).toBe(
      "OEM price (12.5% off)",
    );
  });

  it("points out the next quantity price only when it beats the current one", () => {
    expect(nextPriceBreak(motor(), 1, unitPriceFor(motor(), 1, null)!)).toEqual({ minQty: 5, priceCents: 65000 });
    expect(nextPriceBreak(motor(), 5, unitPriceFor(motor(), 5, null)!)).toEqual({ minQty: 10, priceCents: 62000 });
    // A contractor already pays 620.10, so 650.00 at five isn't worth mentioning; 620.00 at ten is.
    expect(nextPriceBreak(motor(), 1, unitPriceFor(motor(), 1, CONTRACTOR)!)).toEqual({ minQty: 10, priceCents: 62000 });
    expect(nextPriceBreak(motor(), 10, unitPriceFor(motor(), 10, null)!)).toBeNull();
  });
});

describe("tierOf", () => {
  it("reads a price_tiers embed, single or as a list", () => {
    expect(tierOf({ name: "Contractor", discount_percent: "10.00" })).toEqual(CONTRACTOR);
    expect(tierOf([{ name: "Contractor", discount_percent: 10 }])).toEqual(CONTRACTOR);
    expect(tierOf(null)).toBeNull();
    expect(tierOf([])).toBeNull();
  });
});

describe("parseTierForm", () => {
  it("reads a name and a discount, with or without a percent sign", () => {
    expect(parseTierForm({ name: "  Contractor   pricing ", discount: "12.5%" })).toEqual({
      ok: true,
      values: { name: "Contractor pricing", discount_percent: 12.5 },
    });
    expect(parseTierForm({ name: "OEM", discount: "50" })).toEqual({ ok: true, values: { name: "OEM", discount_percent: 50 } });
  });

  it("needs a name and a discount above 0 and at most 50%", () => {
    for (const discount of ["", "0", "50.01", "75", "-5", "ten", "10.555"]) {
      const result = parseTierForm({ name: "Contractor", discount });
      expect(result.ok ? null : Object.keys(result.errors)).toEqual(["discount"]);
    }
    const result = parseTierForm({ name: " ", discount: "10" });
    expect(result.ok ? null : result.errors.name).toMatch(/Name the tier/);
  });
});
