import { moneyField, parseQuoteForm } from "@/lib/admin/quote-form";
import {
  addDays,
  customerStep,
  deliveryOptions,
  isExpired,
  quoteChargeLines,
  quoteTotals,
  shopToday,
  type QuoteLineValues,
  type QuoteState,
} from "@/lib/quotes/logic";

const line = (over: Partial<QuoteLineValues> = {}): QuoteLineValues => ({
  productId: null,
  sku: null,
  description: "Rewind 10 HP motor",
  quantity: 1,
  unitPriceCents: 85000,
  coreChargeCents: 0,
  ...over,
});

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

// Noon UTC on 10 March 2027 is morning in Gardner, MA.
const NOW = new Date("2027-03-10T12:00:00Z");

describe("quoteTotals", () => {
  const lines = [line({ quantity: 2, unitPriceCents: 10000, coreChargeCents: 2500 }), line({ unitPriceCents: 5000 })];

  it("adds items and cores separately, plus shipping when shipped", () => {
    expect(quoteTotals(lines, 3000, "ship")).toEqual({ itemsCents: 25000, coreCents: 5000, shippingCents: 3000, totalCents: 33000 });
  });

  it("charges no shipping for pickup", () => {
    expect(quoteTotals(lines, 3000, "pickup")).toEqual({ itemsCents: 25000, coreCents: 5000, shippingCents: 0, totalCents: 30000 });
  });

  it("is zero for an empty quote", () => {
    expect(quoteTotals([], null, "pickup").totalCents).toBe(0);
  });
});

describe("dates", () => {
  it("uses the shop's date, not UTC", () => {
    // 02:00 UTC on 11 March is still 10 March in Massachusetts.
    expect(shopToday(new Date("2027-03-11T02:00:00Z"))).toBe("2027-03-10");
  });

  it("keeps a quote valid through its last day", () => {
    expect(isExpired("2027-03-10", NOW)).toBe(false);
    expect(isExpired("2027-03-09", NOW)).toBe(true);
  });

  it("adds days across months", () => {
    expect(addDays("2027-01-31", 30)).toBe("2027-03-02");
  });
});

describe("customerStep", () => {
  const state = (over: Partial<QuoteState> = {}): QuoteState => ({
    kind: "parts",
    status: "sent",
    validUntil: "2027-04-01",
    jobStatus: null,
    lineCount: 1,
    ...over,
  });

  it("lets the customer pay a sent parts quote", () => {
    expect(customerStep(state(), NOW)).toEqual({ step: "pay" });
  });

  it("asks for approval on a sent repair quote", () => {
    expect(customerStep(state({ kind: "repair", jobStatus: "quoted" }), NOW)).toEqual({ step: "approve" });
  });

  it("closes an expired quote", () => {
    expect(customerStep(state({ validUntil: "2027-03-01" }), NOW)).toEqual({ step: "closed", reason: "expired" });
  });

  it("closes a quote with no lines", () => {
    expect(customerStep(state({ lineCount: 0 }), NOW)).toEqual({ step: "closed", reason: "empty" });
  });

  it("waits for the repair to finish after approval, then lets them pay, even past the quote's date", () => {
    const approved = state({ kind: "repair", status: "approved", validUntil: "2027-03-01" });
    expect(customerStep({ ...approved, jobStatus: "in_repair" }, NOW)).toEqual({ step: "in_progress" });
    expect(customerStep({ ...approved, jobStatus: "ready" }, NOW)).toEqual({ step: "pay" });
    expect(customerStep({ ...approved, jobStatus: "delivered" }, NOW)).toEqual({ step: "pay" });
  });

  it("has nothing to do on drafts, declined, withdrawn and paid quotes", () => {
    for (const status of ["draft", "declined", "withdrawn", "paid"] as const) {
      expect(customerStep(state({ status }), NOW).step).toBe("closed");
    }
  });
});

describe("deliveryOptions", () => {
  it("offers pickup only without a shipping price", () => {
    expect(deliveryOptions(null)).toEqual(["pickup"]);
    expect(deliveryOptions(0)).toEqual(["ship", "pickup"]);
  });
});

describe("quoteChargeLines", () => {
  it("follows each line with its core charge", () => {
    const lines = quoteChargeLines([line({ sku: "M-1", quantity: 2, coreChargeCents: 5000 }), line({ description: "Labour" })], 30);
    expect(lines.map((l) => [l.name, l.unitAmount, l.quantity, l.core])).toEqual([
      ["Rewind 10 HP motor", 85000, 2, false],
      ["Core charge (refundable): Rewind 10 HP motor", 5000, 2, true],
      ["Labour", 85000, 1, false],
    ]);
    expect(lines[0].description).toBe("Part # M-1");
    expect(lines[2].description).toBeUndefined();
  });
});

describe("parseQuoteForm", () => {
  it("reads the filled rows and skips blank ones", () => {
    const result = parseQuoteForm(
      form({
        line_0_description: "Bearing kit",
        line_0_sku: "BK-6205",
        line_0_qty: "2",
        line_0_price: "$45.50",
        line_0_core: "",
        line_0_product: "11111111-1111-4111-8111-111111111111",
        line_1_description: "",
        line_1_qty: "",
        line_1_price: "",
        line_2_description: "Labour",
        line_2_price: "120",
        shipping: "35",
        valid_days: "14",
        message: " Thanks! ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: {
        lines: [
          { productId: "11111111-1111-4111-8111-111111111111", sku: "BK-6205", description: "Bearing kit", quantity: 2, unitPriceCents: 4550, coreChargeCents: 0 },
          { productId: null, sku: null, description: "Labour", quantity: 1, unitPriceCents: 12000, coreChargeCents: 0 },
        ],
        shippingCents: 3500,
        validDays: 14,
        message: "Thanks!",
      },
    });
  });

  it("treats a blank shipping price as pickup only, and defaults to 30 days", () => {
    const result = parseQuoteForm(form({ line_0_description: "Pump seal", line_0_price: "80", shipping: "" }));
    expect(result.ok && result.values).toMatchObject({ shippingCents: null, validDays: 30, message: null });
  });

  it("explains what's wrong with a row", () => {
    const result = parseQuoteForm(
      form({
        line_0_description: "Motor",
        line_0_qty: "0",
        line_0_price: "",
        line_1_description: "",
        line_1_price: "12",
        valid_days: "400",
        shipping: "abc",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["line_0_price", "line_0_qty", "line_1_description", "shipping", "valid_days"]);
    }
  });

  it("formats prices back into the form", () => {
    expect(moneyField(4550)).toBe("45.50");
    expect(moneyField(null)).toBe("");
  });
});
