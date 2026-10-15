import { runInNewContext } from "node:vm";
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

/** Run the inline boot script against a fake document and return the theme it applied. */
function boot({ saved, siteDefault, prefersDark = false }: { saved?: string; siteDefault?: string; prefersDark?: boolean }) {
  const attrs: Record<string, string> = siteDefault ? { "data-default-theme": siteDefault } : {};
  const documentElement = {
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => (attrs[k] = v),
  };
  runInNewContext(THEME_BOOT_SCRIPT, {
    document: { documentElement },
    localStorage: { getItem: (k: string) => (k === THEME_STORAGE_KEY ? (saved ?? null) : null) },
    window: { matchMedia: () => ({ matches: prefersDark }) },
  });
  return attrs["data-theme"];
}

describe("theme boot script", () => {
  it("uses the site default (light) for a first visit, even on a dark-mode device", () => {
    expect(boot({ siteDefault: "light", prefersDark: true })).toBe("light");
  });

  it("uses whatever default staff chose", () => {
    expect(boot({ siteDefault: "mid" })).toBe("mid");
    expect(boot({ siteDefault: "dark" })).toBe("dark");
  });

  it("follows the device when the default is 'system'", () => {
    expect(boot({ siteDefault: "system", prefersDark: true })).toBe("dark");
    expect(boot({ siteDefault: "system", prefersDark: false })).toBe("light");
  });

  it("lets a visitor's saved choice override the default", () => {
    expect(boot({ saved: "dark", siteDefault: "light" })).toBe("dark");
  });

  it("falls back to light when nothing valid is set", () => {
    expect(boot({ saved: "purple", siteDefault: "neon" })).toBe("light");
    expect(boot({})).toBe("light");
  });
});
