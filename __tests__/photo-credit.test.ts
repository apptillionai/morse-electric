import { commonsCredit, htmlToText, parseCredit, type CommonsMetadata } from "@/lib/catalog/photo-credit";

const SOURCE = "https://commons.wikimedia.org/wiki/File:Motor.jpg";

function metadata(fields: Record<string, string>): CommonsMetadata {
  return Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { value }]));
}

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText('<a href="//commons.wikimedia.org/wiki/User:Ann">Ann&nbsp;O&#39;Neil</a>\n &amp; Bo')).toBe("Ann O'Neil & Bo");
    expect(htmlToText("Caf&#xe9;")).toBe("Café");
  });
});

describe("commonsCredit", () => {
  it("credits a CC BY-SA file", () => {
    const result = commonsCredit(
      metadata({
        License: "cc-by-sa-4.0",
        LicenseShortName: "CC BY-SA 4.0",
        LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        Artist: '<a href="//commons.wikimedia.org/wiki/User:Ann">Ann</a>',
      }),
      SOURCE,
    );
    expect(result).toEqual({
      ok: true,
      credit: { author: "Ann", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", sourceUrl: SOURCE },
      warnings: [],
    });
  });

  it("accepts public domain without an author", () => {
    const result = commonsCredit(metadata({ License: "pd", LicenseShortName: "Public domain" }), SOURCE);
    expect(result.ok && result.credit).toMatchObject({ author: "Unknown author", license: "Public domain", licenseUrl: null });
  });

  it.each(["cc-by-nc-sa-2.0", "cc-by-nd-4.0", "gfdl", "fair use", ""])("refuses %j", (license) => {
    expect(commonsCredit(metadata({ License: license, Artist: "Ann" }), SOURCE).ok).toBe(false);
  });

  it("refuses files marked non-free", () => {
    expect(commonsCredit(metadata({ License: "cc-by-4.0", Artist: "Ann", NonFree: "true" }), SOURCE).ok).toBe(false);
  });

  it("refuses attribution licenses with nobody to credit", () => {
    expect(commonsCredit(metadata({ License: "cc-by-3.0" }), SOURCE)).toEqual({ ok: false, reason: "no author to credit" });
  });

  it("warns about trademarks", () => {
    const result = commonsCredit(metadata({ License: "cc0", Artist: "Ann", Restrictions: "trademarked" }), SOURCE);
    expect(result.ok && result.warnings).toEqual([expect.stringContaining("trademark")]);
  });
});

describe("parseCredit", () => {
  it("reads a stored credit", () => {
    expect(parseCredit({ author: "Ann", license: "CC0", sourceUrl: SOURCE })).toEqual({
      author: "Ann",
      license: "CC0",
      licenseUrl: null,
      sourceUrl: SOURCE,
    });
  });

  it("treats missing or malformed credits as none", () => {
    expect(parseCredit(null)).toBeNull();
    expect(parseCredit("CC0")).toBeNull();
    expect(parseCredit({ author: "Ann", license: "CC0" })).toBeNull();
  });
});
