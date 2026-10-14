import { BUSINESS_FIELDS, businessSchema, EMPTY_BUSINESS, toBusiness } from "@/lib/business";

const blank = Object.fromEntries(BUSINESS_FIELDS.map((f) => [f, ""]));

describe("toBusiness", () => {
  it("shows placeholders for anything not set", () => {
    const b = toBusiness(EMPTY_BUSINESS);
    expect(b).toMatchObject({ phone: "[PHONE]", phoneHref: null, email: "[EMAIL]", emailHref: null, hours: "[HOURS]", callUs: "contact us" });
    expect(b.postalAddress).toBeNull();
    expect(b.directionsUrl).toBeNull();
  });

  it("formats the confirmed address and links a dialable phone", () => {
    const b = toBusiness({
      ...EMPTY_BUSINESS,
      phone: "(978) 555-0100",
      email: "service@morseelectricmotor.com",
      street: "380 East Broadway",
      city: "Gardner",
      state: "MA",
      postalCode: "01440",
    });
    expect(b.cityStateZip).toBe("Gardner, MA 01440");
    expect(b.phoneHref).toBe("tel:9785550100");
    expect(b.callUs).toBe("call us at (978) 555-0100");
    expect(b.emailHref).toBe("mailto:service@morseelectricmotor.com");
    expect(b.postalAddress).toEqual({ streetAddress: "380 East Broadway", addressLocality: "Gardner", addressRegion: "MA", postalCode: "01440", addressCountry: "US" });
    expect(b.directionsUrl).toContain(encodeURIComponent("380 East Broadway, Gardner, MA 01440"));
  });

  it("doesn't link a phone number that can't be dialled", () => {
    expect(toBusiness({ ...EMPTY_BUSINESS, phone: "555-01" }).phoneHref).toBeNull();
  });
});

describe("businessSchema", () => {
  it("turns blanks into nulls and lowercases the email", () => {
    const r = businessSchema.parse({ ...blank, email: " Service@MorseElectricMotor.com ", city: " Gardner " });
    expect(r).toMatchObject({ email: "service@morseelectricmotor.com", city: "Gardner", phone: null, hours: null });
  });

  it("rejects a bad phone and email", () => {
    const r = businessSchema.safeParse({ ...blank, phone: "call the shop", email: "not-an-email" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(["email", "phone"]);
      expect(r.error.issues.find((i) => i.path[0] === "email")?.message).toBe("Enter a valid email address.");
    }
  });
});
