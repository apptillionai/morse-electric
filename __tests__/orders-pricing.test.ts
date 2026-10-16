import { addToCart, cartCount, MAX_CART_LINES, MAX_LINE_QUANTITY, parseCart, serializeCart, setCartQuantity } from "@/lib/orders/cart";
import {
  onlinePurchaseBlock,
  parseShippingRates,
  priceCart,
  shippingCents,
  shippingRateFor,
  type BuyableProduct,
} from "@/lib/orders/pricing";
import { parseRateRows, rateRowValues } from "@/lib/orders/settings";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const product = (over: Partial<BuyableProduct> = {}): BuyableProduct => ({
  id: A,
  sku: "M-1",
  slug: "m-1",
  name: "5 HP motor",
  condition: "new",
  active: true,
  priceCents: 50000,
  coreChargeCents: null,
  shipClass: "parcel",
  weightLb: 20,
  available: 3,
  ...over,
});

const rates = parseShippingRates([
  { max_lb: 50, cents: 4500 },
  { max_lb: 10, cents: 1500 },
  { max_lb: "x", cents: 1 },
]);

describe("cart cookie", () => {
  it("round-trips and merges duplicate lines", () => {
    const value = serializeCart([{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }]);
    expect(parseCart(value)).toEqual([{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }]);
    expect(parseCart(`${A}:1.${A.toUpperCase()}:2`)).toEqual([{ productId: A, quantity: 3 }]);
  });

  it("drops anything malformed instead of throwing", () => {
    expect(parseCart(`nope:1.${A}:abc.${B}:0.${C}:2`)).toEqual([{ productId: C, quantity: 2 }]);
    expect(parseCart(undefined)).toEqual([]);
  });

  it("caps quantities and the number of lines", () => {
    expect(parseCart(`${A}:5000`)).toEqual([{ productId: A, quantity: MAX_LINE_QUANTITY }]);
    const many = Array.from({ length: MAX_CART_LINES + 5 }, (_, i) => `${i.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111:1`).join(".");
    expect(parseCart(many)).toHaveLength(MAX_CART_LINES);
  });

  it("adds, changes and removes lines", () => {
    let lines = addToCart([], A, 1);
    lines = addToCart(lines, A, 2);
    lines = addToCart(lines, B, 1);
    expect(cartCount(lines)).toBe(4);
    expect(setCartQuantity(lines, A, 1)).toEqual([{ productId: A, quantity: 1 }, { productId: B, quantity: 1 }]);
    expect(setCartQuantity(lines, A, 0)).toEqual([{ productId: B, quantity: 1 }]);
  });
});

describe("onlinePurchaseBlock", () => {
  it("allows a priced, listed parcel or pickup item in stock", () => {
    expect(onlinePurchaseBlock(product())).toBeNull();
    expect(onlinePurchaseBlock(product({ shipClass: "pickup_only" }))).toBeNull();
  });

  it("keeps quote-only items out of the cart", () => {
    expect(onlinePurchaseBlock(product({ priceCents: null }))).toBe("priced on request");
    expect(onlinePurchaseBlock(product({ coreChargeCents: 7500 }))).toBe("carries a core charge");
    expect(onlinePurchaseBlock(product({ condition: "exchange" }))).toBe("carries a core charge");
    expect(onlinePurchaseBlock(product({ shipClass: "ltl" }))).toBe("ships by freight");
    expect(onlinePurchaseBlock(product({ active: false }))).toBe("no longer listed");
    expect(onlinePurchaseBlock(product({ available: 0 }))).toBe("out of stock");
  });
});

describe("shipping rates", () => {
  it("cleans and sorts the bands staff enter", () => {
    expect(rates).toEqual([{ maxLb: 10, cents: 1500 }, { maxLb: 50, cents: 4500 }]);
    expect(parseShippingRates("nope")).toEqual([]);
  });

  it("picks the lightest band that fits", () => {
    expect(shippingRateFor(10, rates)).toBe(1500);
    expect(shippingRateFor(10.5, rates)).toBe(4500);
    expect(shippingRateFor(51, rates)).toBeNull();
  });
});

describe("priceCart", () => {
  it("adds up lines and weight, and prices parcel shipping", () => {
    const cart = priceCart(
      [{ productId: A, quantity: 2 }],
      new Map([[A, product()]]),
      rates,
    );
    expect(cart.subtotalCents).toBe(100000);
    expect(cart.weightLb).toBe(40);
    expect(cart.shipping).toEqual({ available: true, cents: 4500 });
    expect(shippingCents(cart, "ship")).toBe(4500);
    expect(shippingCents(cart, "pickup")).toBe(0);
    expect(cart.adjustments).toEqual([]);
  });

  it("drops items that can't be bought and reduces quantities to what's in stock", () => {
    const cart = priceCart(
      [
        { productId: A, quantity: 5 },
        { productId: B, quantity: 1 },
        { productId: C, quantity: 1 },
      ],
      new Map([
        [A, product()],
        [B, product({ id: B, name: "Pump", priceCents: null })],
      ]),
      rates,
    );
    expect(cart.lines.map((l) => [l.product.id, l.quantity])).toEqual([[A, 3]]);
    expect(cart.cleaned).toEqual([{ productId: A, quantity: 3 }]);
    expect(cart.adjustments).toEqual([
      { name: "5 HP motor", message: "reduced to 3: only 3 in stock" },
      { name: "Pump", message: "removed: priced on request" },
      { name: "An item", message: "removed: it’s no longer in our catalog" },
    ]);
  });

  it("offers pickup only when shipping can't be priced", () => {
    const products = new Map([
      [A, product()],
      [B, product({ id: B, shipClass: "pickup_only" })],
      [C, product({ id: C, weightLb: null })],
    ]);
    const pickupOnly = priceCart([{ productId: A, quantity: 1 }, { productId: B, quantity: 1 }], products, rates);
    expect(pickupOnly.shipping.available).toBe(false);
    expect(shippingCents(pickupOnly, "ship")).toBeNull();

    const unweighed = priceCart([{ productId: C, quantity: 1 }], products, rates);
    expect(unweighed.weightLb).toBeNull();
    expect(unweighed.shipping.available).toBe(false);

    const heavy = priceCart([{ productId: A, quantity: 3 }], products, rates);
    expect(heavy.shipping.available).toBe(false);

    const noRates = priceCart([{ productId: A, quantity: 1 }], products, []);
    expect(noRates.shipping.available).toBe(false);
  });
});

describe("shipping bands form", () => {
  it("reads filled rows, skips blank ones and sorts by weight", () => {
    expect(parseRateRows({ rate_lb_0: "50", rate_price_0: "$45", rate_lb_2: "10", rate_price_2: "15.50" })).toEqual({
      ok: true,
      rates: [{ max_lb: 10, cents: 1550 }, { max_lb: 50, cents: 4500 }],
    });
    expect(rateRowValues(parseShippingRates([{ max_lb: 10, cents: 1550 }]))).toEqual({ rate_lb_0: "10", rate_price_0: "15.50" });
  });

  it("flags half-filled, invalid and duplicate rows", () => {
    expect(parseRateRows({ rate_lb_0: "10" })).toEqual({ ok: false, errors: { rate_price_0: "Enter a price, e.g. 15 or 15.50." } });
    expect(parseRateRows({ rate_lb_1: "-1", rate_price_1: "5" }).ok).toBe(false);
    expect(parseRateRows({ rate_lb_0: "10", rate_price_0: "5", rate_lb_1: "10", rate_price_1: "6" }).ok).toBe(false);
  });
});
