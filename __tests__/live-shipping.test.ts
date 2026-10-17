import { parseLiveRateFields } from "@/lib/orders/settings";
import { FALLBACK_CODE, quoteShipping, type LiveRatesConfig } from "@/lib/orders/live-rates";
import { priceCart, type BuyableProduct } from "@/lib/orders/pricing";
import { fetchShippoRates, quoteRates, shippoShipmentBody } from "@/lib/orders/shippo";
import {
  packParcels,
  parcelBlock,
  parseFulfillmentChoice,
  parseZip,
  shippedElsewhere,
  shippingOptions,
  transitText,
  type CarrierRate,
  type ShipAddress,
} from "@/lib/orders/shipping";

const BOX = { lengthIn: 18, widthIn: 14, heightIn: 12 };
const TO: ShipAddress = { name: "Lee Mechanical", line1: "12 Main St", line2: null, city: "Worcester", state: "MA", postal: "01608" };
const FROM: ShipAddress = { name: "Morse", line1: "380 East Broadway", line2: null, city: "Gardner", state: "MA", postal: "01440" };

const rate = (provider: string, name: string, token: string, amount: string, days: number | null = null): CarrierRate => ({
  amount,
  currency: "USD",
  provider,
  servicelevel: { name, token },
  estimated_days: days,
});

describe("ZIP codes", () => {
  it("reads 5- and 9-digit ZIP codes", () => {
    expect(parseZip(" 01608 ")).toBe("01608");
    expect(parseZip("01608-1234")).toBe("01608");
    expect(parseZip("016081234")).toBe("01608");
    expect(parseZip("1608")).toBeNull();
    expect(parseZip("K1A 0B1")).toBeNull();
    expect(parseZip(null)).toBeNull();
  });

  it("notices when Stripe's address is in another ZIP than the quote", () => {
    expect(shippedElsewhere("01608", "01608-1234")).toBe(false);
    expect(shippedElsewhere("01608", "90210")).toBe(true);
    expect(shippedElsewhere(null, "90210")).toBe(false);
    expect(shippedElsewhere("01608", null)).toBe(false);
  });
});

describe("packParcels", () => {
  it("packs heaviest first into parcels of at most 150 lb, never splitting a unit", () => {
    expect(packParcels([{ weightLb: 86, quantity: 2 }, { weightLb: 20, quantity: 3 }], BOX)).toEqual([
      { ...BOX, weightLb: 146 },
      { ...BOX, weightLb: 86 },
    ]);
    expect(packParcels([{ weightLb: 0.04, quantity: 1 }], BOX)).toEqual([{ ...BOX, weightLb: 0.1 }]);
    expect(packParcels([{ weightLb: 33.33, quantity: 1 }], BOX)).toEqual([{ ...BOX, weightLb: 33.4 }]);
  });

  it("can't pack a unit with no weight or over the limit", () => {
    expect(packParcels([{ weightLb: null, quantity: 1 }], BOX)).toBeNull();
    expect(packParcels([{ weightLb: 151, quantity: 1 }], BOX)).toBeNull();
    expect(packParcels([], BOX)).toEqual([]);
  });
});

describe("shippingOptions", () => {
  it("labels, adds handling, keeps the cheapest of a repeated service and sorts by price", () => {
    const options = shippingOptions(
      [
        rate("UPS", "Ground", "ups_ground", "41.20", 2),
        rate("USPS", "USPS Priority Mail", "usps_priority", "38.05", 3),
        rate("UPS", "Ground", "ups_ground", "40.10", 2),
        rate("FedEx", "Standard Overnight", "fedex_standard_overnight", "190.00", 1),
        { ...rate("UPS", "Next Day Air", "ups_next_day_air", "abc"), currency: "USD" },
        { ...rate("UPS", "Worldwide", "ups_worldwide", "50.00"), currency: "CAD" },
      ],
      500,
    );
    expect(options).toEqual([
      { code: "usps:usps_priority", label: "USPS Priority Mail", days: 3, cents: 4305 },
      { code: "ups:ups_ground", label: "UPS Ground", days: 2, cents: 4510 },
      { code: "fedex:fedex_standard_overnight", label: "FedEx Standard Overnight", days: 1, cents: 19500 },
    ]);
    expect(transitText(1)).toBe("1 business day");
    expect(transitText(null)).toBeNull();
  });

  it("offers at most eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => rate("UPS", `S${i}`, `s${i}`, String(10 + i)));
    expect(shippingOptions(many, 0)).toHaveLength(8);
  });
});

describe("parseFulfillmentChoice", () => {
  it("reads pickup, the bands and a live rate", () => {
    expect(parseFulfillmentChoice("pickup")).toEqual({ fulfillment: "pickup" });
    expect(parseFulfillmentChoice("ship")).toEqual({ fulfillment: "ship", code: null });
    expect(parseFulfillmentChoice("ship:ups:ups_ground")).toEqual({ fulfillment: "ship", code: "ups:ups_ground" });
  });

  it("never guesses pickup from something unreadable", () => {
    expect(parseFulfillmentChoice("ship:<script>")).toEqual({ fulfillment: "ship", code: null });
    expect(parseFulfillmentChoice(null)).toEqual({ fulfillment: "ship", code: null });
  });
});

describe("Shippo client", () => {
  const req = { from: FROM, to: { ...TO, line2: "Bay 4" }, parcels: [{ ...BOX, weightLb: 86 }] };

  it("sends addresses and parcels the way Shippo takes them", () => {
    expect(shippoShipmentBody(req)).toEqual({
      address_from: { name: "Morse", street1: "380 East Broadway", city: "Gardner", state: "MA", zip: "01440", country: "US" },
      address_to: { name: "Lee Mechanical", street1: "12 Main St", street2: "Bay 4", city: "Worcester", state: "MA", zip: "01608", country: "US" },
      parcels: [{ length: "18", width: "14", height: "12", distance_unit: "in", weight: "86", mass_unit: "lb" }],
      async: false,
    });
  });

  it("quotes to a ZIP code alone", () => {
    expect(shippoShipmentBody({ ...req, to: { postal: "01608" } }).address_to).toEqual({ zip: "01608", country: "US" });
  });

  it("returns rates, tells an address problem from an outage, and sends the key", async () => {
    const calls: RequestInit[] = [];
    const answer = (status: number, body: unknown) =>
      (async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push(init!);
        return new Response(JSON.stringify(body), { status });
      }) as typeof fetch;

    const ok = await fetchShippoRates(req, "shippo_test_x", answer(201, { rates: [rate("UPS", "Ground", "ups_ground", "41.20")] }));
    expect(ok).toEqual({ ok: true, rates: [rate("UPS", "Ground", "ups_ground", "41.20")] });
    expect((calls[0].headers as Record<string, string>).Authorization).toBe("ShippoToken shippo_test_x");

    expect(await fetchShippoRates(req, "k", answer(201, { rates: [], messages: [{ text: "Invalid ZIP." }] }))).toEqual({
      ok: false,
      unavailable: false,
      error: "Invalid ZIP.",
    });
    expect(await fetchShippoRates(req, "k", answer(401, { detail: "Invalid token" }))).toMatchObject({ ok: false, unavailable: true });
    const down = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    expect(await fetchShippoRates(req, "k", down)).toEqual({ ok: false, unavailable: true, error: "ECONNRESET" });
  });

  it("remembers a quote, so checkout charges what the cart showed", async () => {
    let n = 0;
    const counting = (async () => {
      n++;
      return new Response(JSON.stringify({ rates: [rate("UPS", "Ground", "ups_ground", String(40 + n))] }), { status: 201 });
    }) as typeof fetch;
    const first = await quoteRates({ ...req, to: { ...TO, postal: "01001" } }, "k", counting);
    const second = await quoteRates({ ...req, to: { ...TO, postal: "01001" } }, "k", counting);
    expect(second).toEqual(first);
    expect(n).toBe(1);
  });
});

describe("quoteShipping", () => {
  const motor = (over: Partial<BuyableProduct> = {}): BuyableProduct => ({
    id: "11111111-1111-4111-8111-111111111111",
    sku: "EM-5HP",
    slug: "em-5hp",
    name: "5 HP motor",
    condition: "new",
    active: true,
    priceCents: 68900,
    coreChargeCents: null,
    shipClass: "parcel",
    weightLb: 86,
    priceBreaks: [],
    available: 5,
    ...over,
  });
  const cartOf = (p: BuyableProduct, qty = 1, bands = [{ maxLb: 100, cents: 9500 }]) =>
    priceCart([{ productId: p.id, quantity: qty }], new Map([[p.id, p]]), bands);
  const config: LiveRatesConfig = { apiKey: "k", from: FROM, box: BOX, handlingCents: 300 };
  const replying = (result: Awaited<ReturnType<typeof quoteRates>>) => (async () => result) as typeof quoteRates;

  it("asks for an address, then offers the carriers' rates with handling", async () => {
    const quote = replying({ ok: true, rates: [rate("UPS", "Ground", "ups_ground", "41.20", 2)] });
    expect(await quoteShipping(cartOf(motor()), null, config, quote)).toEqual({ kind: "address" });
    expect(await quoteShipping(cartOf(motor(), 2), TO, config, quote)).toEqual({
      kind: "options",
      options: [{ code: "ups:ups_ground", label: "UPS Ground", days: 2, cents: 4420 }],
      notice: null,
    });
  });

  it("goes past the weight bands, but not past what a parcel can carry", async () => {
    const quote = replying({ ok: true, rates: [rate("UPS", "Ground", "ups_ground", "80")] });
    // 172 lb is over the 100 lb band, but two parcels can carry it.
    expect((await quoteShipping(cartOf(motor(), 2), TO, config, quote)).kind).toBe("options");
    expect(await quoteShipping(cartOf(motor({ weightLb: 400 })), TO, config, quote)).toMatchObject({ kind: "blocked" });
    expect(parcelBlock(cartOf(motor({ shipClass: "pickup_only" })))).toMatch(/pickup only/);
  });

  it("falls back to the band price when Shippo is down, but not when the address is the problem", async () => {
    const down = replying({ ok: false, unavailable: true, error: "timeout" });
    expect(await quoteShipping(cartOf(motor()), TO, config, down)).toEqual({
      kind: "options",
      options: [{ code: FALLBACK_CODE, label: "Ground shipping (UPS or FedEx)", days: null, cents: 9500 }],
      notice: expect.stringMatching(/standard ground rate/),
    });
    expect(await quoteShipping(cartOf(motor(), 2), TO, config, down)).toMatchObject({ kind: "blocked" });
    const badAddress = replying({ ok: false, unavailable: false, error: "Invalid ZIP." });
    expect(await quoteShipping(cartOf(motor()), TO, config, badAddress)).toMatchObject({
      kind: "blocked",
      reason: expect.stringMatching(/No carrier could quote that ZIP code/),
    });
  });
});

describe("live rate settings", () => {
  it("reads the switch, the box and the handling fee", () => {
    expect(
      parseLiveRateFields({ live_rates_enabled: "on", parcel_length: "24", parcel_width: "18.25", parcel_height: "16", handling_fee: "$7.50" }),
    ).toEqual({
      ok: true,
      columns: { live_rates_enabled: true, parcel_length_in: 24, parcel_width_in: 18.3, parcel_height_in: 16, handling_cents: 750 },
    });
    expect(parseLiveRateFields({ parcel_length: "18", parcel_width: "14", parcel_height: "12", handling_fee: "" })).toMatchObject({
      ok: true,
      columns: { live_rates_enabled: false, handling_cents: 0 },
    });
  });

  it("flags a box that isn't real and a bad fee", () => {
    const result = parseLiveRateFields({ parcel_length: "0", parcel_width: "200", parcel_height: "x", handling_fee: "-1" });
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(["handling_fee", "parcel_height", "parcel_length", "parcel_width"]);
  });
});
