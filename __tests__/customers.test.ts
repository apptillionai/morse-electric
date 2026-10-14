import { accountLinkUrl, safeAccountPath } from "@/lib/customers/links";
import { inviteSchema, passwordSchema, profileSchema, PROFILE_FIELDS } from "@/lib/customers/schemas";
import { repairStep, REPAIR_STEPS, SERVICE_STATUS_MESSAGE } from "@/lib/customers/status";
import { SERVICE_STATUSES } from "@/lib/admin/requests";

const blankProfile = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, ""]));

describe("profileSchema", () => {
  it("trims, nulls blanks and clears billing when it matches shipping", () => {
    const result = profileSchema.parse({
      ...blankProfile,
      name: "  Ann Lee ",
      ship_city: "Lancaster",
      bill_same_as_ship: "on",
      bill_line1: "stale value",
    });
    expect(result).toMatchObject({ name: "Ann Lee", company: null, ship_city: "Lancaster", bill_same_as_ship: true, bill_line1: null });
  });

  it("keeps a separate billing address", () => {
    const result = profileSchema.parse({ ...blankProfile, name: "Ann", bill_line1: "PO Box 9" });
    expect(result).toMatchObject({ bill_same_as_ship: false, bill_line1: "PO Box 9" });
  });

  it("rejects a missing name and a bad phone number", () => {
    const result = profileSchema.safeParse({ ...blankProfile, phone: "call me" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual(["name", "phone"]);
  });
});

describe("inviteSchema", () => {
  it("lowercases the email so request linking can match exactly", () => {
    expect(inviteSchema.parse({ email: " Garret_Peters@Yahoo.com ", name: "Garret", company: "", phone: "" }).email).toBe("garret_peters@yahoo.com");
  });
});

describe("passwordSchema", () => {
  it("needs a long enough password typed twice", () => {
    expect(passwordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "long enough pass", confirm: "long enough pasS" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "long enough pass", confirm: "long enough pass" }).success).toBe(true);
  });
});

describe("account links", () => {
  it("builds our own accept URL", () => {
    const url = new URL(accountLinkUrl("https://morse-electric.vercel.app", "abc123", "invite"));
    expect(url.pathname).toBe("/account/accept");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("invite");
  });

  it("only returns to account pages after sign-in", () => {
    expect(safeAccountPath("/account/profile")).toBe("/account/profile");
    for (const bad of [null, "/admin", "//evil.example", "https://evil.example/account", "/account/login", "/accounts", "/account\\@x"]) {
      expect(safeAccountPath(bad)).toBe("/account");
    }
  });
});

describe("repair progress", () => {
  it("maps every service status to a step, hiding spam", () => {
    for (const status of SERVICE_STATUSES) {
      const step = repairStep(status);
      if (status === "spam") expect(step).toBe(-1);
      else {
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThan(REPAIR_STEPS.length);
        expect(SERVICE_STATUS_MESSAGE[status]).not.toBe("");
      }
    }
  });

  it("only moves forward through the shop workflow", () => {
    const steps = SERVICE_STATUSES.filter((s) => s !== "spam").map(repairStep);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });
});
