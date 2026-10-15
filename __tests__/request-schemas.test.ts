import { fieldErrors, formFields, quoteRequestSchema, serviceRequestSchema } from "@/lib/requests/schemas";
import { escapeHtml, renderRows } from "@/lib/requests/email";

const quote = {
  name: "  Pat Lee ",
  company: "",
  email: " Pat@Example.COM ",
  phone: "(555) 010-2000",
  sku: "",
  quantity: "",
  details: "Need a 5 HP 184T TEFC",
};

describe("quoteRequestSchema", () => {
  it("trims, lowercases email and turns blanks into null", () => {
    const parsed = quoteRequestSchema.parse(quote);
    expect(parsed).toEqual({
      name: "Pat Lee",
      company: null,
      email: "pat@example.com",
      phone: "(555) 010-2000",
      sku: null,
      quantity: null,
      details: "Need a 5 HP 184T TEFC",
    });
  });

  it("requires either a part number or details", () => {
    const result = quoteRequestSchema.safeParse({ ...quote, details: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(fieldErrors(result.error))).toEqual(["details"]);
    expect(quoteRequestSchema.safeParse({ ...quote, details: "", sku: "MEM-1" }).success).toBe(true);
  });

  it("rejects bad email, phone and quantity with field messages", () => {
    const result = quoteRequestSchema.safeParse({ ...quote, email: "nope", phone: "call me", quantity: "0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(["email", "phone", "quantity"]);
    }
  });
});

describe("serviceRequestSchema", () => {
  const service = {
    equipmentType: "vacuum_pump",
    name: "Sam",
    company: "",
    email: "sam@example.com",
    phone: "555 010 3000",
    make: "",
    size: "1 HP",
    modelSerial: "",
    symptoms: "Won't hold vacuum",
    wantsPickup: "on",
    isRush: "",
    wantsReplacementQuote: "",
  };

  it("parses checkboxes and optional fields", () => {
    expect(serviceRequestSchema.parse(service)).toMatchObject({
      equipmentType: "vacuum_pump",
      make: null,
      size: "1 HP",
      wantsPickup: true,
      isRush: false,
      wantsReplacementQuote: false,
    });
  });

  it("requires a phone number and a known equipment type", () => {
    const result = serviceRequestSchema.safeParse({ ...service, phone: "", equipmentType: "toaster" });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(["equipmentType", "phone"]);
  });
});

describe("formFields", () => {
  it("reads strings and ignores files and missing keys", () => {
    const data = new FormData();
    data.set("name", "Pat");
    data.set("upload", new Blob(["x"]), "x.txt");
    expect(formFields(data, ["name", "upload", "missing"])).toEqual({ name: "Pat", upload: "", missing: "" });
  });
});

describe("request emails", () => {
  it("escapes customer input and skips empty rows", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    const { html, text } = renderRows([
      ["Name", "<script>"],
      ["Company", null],
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Company");
    expect(text).toBe("Name: <script>");
  });
});
