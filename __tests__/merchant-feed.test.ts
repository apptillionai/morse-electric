import { feedExclusion, feedItems, renderFeed, type FeedProduct } from "@/lib/catalog/feed";

const RATES = [
  { maxLb: 10, cents: 1500 },
  { maxLb: 100, cents: 9500 },
];
const SITE = "https://morseelectricmotor.com";

const product = (over: Partial<FeedProduct> = {}): FeedProduct => ({
  id: "p1",
  sku: "EM-5HP",
  slug: "5-hp-motor",
  name: "5 HP motor, 184T",
  description: "Premium efficiency.",
  summary: "5 HP, 1750 RPM, 184T",
  condition: "new",
  priceCents: 68900,
  coreChargeCents: null,
  inStock: true,
  brand: "Baldor",
  mfrPartNumber: "EM3615T",
  categoryName: "Electric motors",
  shipClass: "parcel",
  weightLb: 86,
  imageUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
  ...over,
});

describe("feedExclusion", () => {
  it("lists a priced parcel item with a weight and its own photo", () => {
    expect(feedExclusion(product(), RATES)).toBeNull();
  });

  it("leaves out what Google would reject or a customer couldn't buy at the listed price", () => {
    expect(feedExclusion(product({ priceCents: null }), RATES)).toBe("no price");
    expect(feedExclusion(product({ coreChargeCents: 15000 }), RATES)).toBe("has a core charge");
    expect(feedExclusion(product({ shipClass: "ltl" }), RATES)).toBe("doesn't ship by parcel");
    expect(feedExclusion(product({ weightLb: null }), RATES)).toBe("no weight");
    expect(feedExclusion(product({ weightLb: 400 }), RATES)).toBe("too heavy for the shipping bands");
    expect(feedExclusion(product({ imageUrls: [] }), RATES)).toBe("no photo of its own");
  });
});

describe("feedItems", () => {
  it("maps a product to Google's fields", () => {
    expect(feedItems([product()], RATES, SITE)).toEqual([
      {
        id: "EM-5HP",
        title: "5 HP motor, 184T",
        description: "Premium efficiency.",
        link: "https://morseelectricmotor.com/products/5-hp-motor",
        imageLink: "https://cdn.example/a.jpg",
        additionalImageLinks: ["https://cdn.example/b.jpg"],
        availability: "in_stock",
        price: "689.00 USD",
        condition: "new",
        brand: "Baldor",
        mpn: "EM3615T",
        productType: "Electric motors",
        shippingPrice: "95.00 USD",
        shippingWeight: "86 lb",
      },
    ]);
  });

  it("uses Google's condition names and the summary when there's no description", () => {
    const [reman] = feedItems([product({ condition: "remanufactured", description: null, inStock: false })], RATES, SITE);
    expect(reman).toMatchObject({ condition: "refurbished", description: "5 HP, 1750 RPM, 184T", availability: "out_of_stock" });
    expect(feedItems([product({ condition: "used_tested" })], RATES, SITE)[0].condition).toBe("used");
  });

  it("drops excluded products", () => {
    expect(feedItems([product({ imageUrls: [] }), product({ sku: "OK" })], RATES, SITE).map((i) => i.id)).toEqual(["OK"]);
  });
});

describe("renderFeed", () => {
  const channel = { title: "Morse & Co", link: SITE, description: "Parts" };

  it("writes RSS 2.0 with Google's namespace, escaping text", () => {
    const xml = renderFeed(feedItems([product({ name: 'Motor <5 HP> "TEFC" & base' })], RATES, SITE), channel);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("<title>Morse &amp; Co</title>");
    expect(xml).toContain("<title>Motor &lt;5 HP&gt; &quot;TEFC&quot; &amp; base</title>");
    expect(xml).toContain("<g:price>689.00 USD</g:price>");
    expect(xml).toContain("<g:shipping><g:country>US</g:country><g:service>Ground</g:service><g:price>95.00 USD</g:price></g:shipping>");
    expect(xml).not.toContain("identifier_exists");
  });

  it("says there's no identifier when the brand or part number is missing", () => {
    expect(renderFeed(feedItems([product({ mfrPartNumber: null })], RATES, SITE), channel)).toContain(
      "<g:identifier_exists>no</g:identifier_exists>",
    );
  });

  it("is still a valid feed with no products", () => {
    const xml = renderFeed([], channel);
    expect(xml).toMatch(/<channel>[\s\S]*<\/channel>/);
    expect(xml).not.toContain("<item>");
  });
});

describe("with live carrier rates", () => {
  it("leaves shipping to Merchant Center and lists anything one parcel can carry", () => {
    expect(feedExclusion(product({ weightLb: 140 }), null)).toBeNull();
    expect(feedExclusion(product({ weightLb: 151 }), null)).toBe("too heavy for one parcel");
    expect(feedExclusion(product({ weightLb: null }), null)).toBe("no weight");
    const [item] = feedItems([product({ weightLb: 140 })], null, SITE);
    expect(item.shippingPrice).toBeNull();
    const xml = renderFeed([item], { title: "Morse", link: SITE, description: "Parts" });
    expect(xml).not.toContain("<g:shipping>");
    expect(xml).toContain("<g:shipping_weight>140 lb</g:shipping_weight>");
  });
});
