import { safeAdminPath } from "@/lib/admin/paths";

describe("safeAdminPath", () => {
  it("keeps admin destinations", () => {
    expect(safeAdminPath("/admin/products?status=draft")).toBe("/admin/products?status=draft");
  });

  it.each([null, "", "/", "https://evil.example/admin", "//evil.example", "/admin/login", "/admin\\@evil", "/shop", "/administrator"])(
    "falls back to /admin for %s",
    (raw) => expect(safeAdminPath(raw)).toBe("/admin"),
  );
});
