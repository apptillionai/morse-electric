/**
 * Credits for stock photos: freely licensed images (Wikimedia Commons) that
 * stand in on a product until Morse photographs its own unit. Stored in
 * product_images.credit; null for the shop's own photos.
 */

export interface PhotoCredit {
  author: string;
  /** Short license name, e.g. "CC BY-SA 4.0" or "Public domain". */
  license: string;
  licenseUrl: string | null;
  /** The file's description page, which carries the full license terms. */
  sourceUrl: string;
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Read a credit from the jsonb column; anything malformed counts as no credit. */
export function parseCredit(value: unknown): PhotoCredit | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const author = str(v.author);
  const license = str(v.license);
  const sourceUrl = str(v.sourceUrl);
  if (!author || !license || !sourceUrl) return null;
  return { author, license, licenseUrl: str(v.licenseUrl), sourceUrl };
}

// ---------------------------------------------------------------------------
// Wikimedia Commons
// ---------------------------------------------------------------------------

/** imageinfo.extmetadata from the Commons API: each field is { value }. */
export type CommonsMetadata = Record<string, { value?: unknown } | undefined>;

const meta = (m: CommonsMetadata, key: string) => {
  const value = m[key]?.value;
  return typeof value === "string" ? value : "";
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Commons returns Artist/Credit as HTML; keep the text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Licenses that allow commercial use with at most attribution/share-alike:
 * public domain, CC0, CC BY and CC BY-SA (any version or port). NC/ND, GFDL-only
 * and fair-use files are refused.
 */
const FREE_LICENSE = /^(pd\b|pd-|cc0|cc-zero|cc-by-(sa-)?\d)/i;

export type CommonsCreditResult = { ok: true; credit: PhotoCredit; warnings: string[] } | { ok: false; reason: string };

/** Turn a file's Commons metadata into a credit, or explain why it can't be used. */
export function commonsCredit(metadata: CommonsMetadata, descriptionUrl: string): CommonsCreditResult {
  const licenseCode = meta(metadata, "License").trim();
  const licenseName = htmlToText(meta(metadata, "LicenseShortName"));
  if (meta(metadata, "NonFree").trim() === "true") return { ok: false, reason: "marked non-free on Commons" };
  if (!FREE_LICENSE.test(licenseCode)) {
    return { ok: false, reason: `license "${licenseName || licenseCode || "unknown"}" isn't public domain, CC0, CC BY or CC BY-SA` };
  }

  const isPublicDomain = /^(pd|cc0|cc-zero)/i.test(licenseCode);
  const author = htmlToText(meta(metadata, "Artist")) || htmlToText(meta(metadata, "Credit"));
  if (!author && !isPublicDomain) return { ok: false, reason: "no author to credit" };

  const warnings: string[] = [];
  const restrictions = meta(metadata, "Restrictions").split("|").map((r) => r.trim()).filter(Boolean);
  if (restrictions.includes("trademarked")) warnings.push("shows a trademark (brand logo); check it doesn't imply the wrong brand");
  for (const r of restrictions.filter((r) => r !== "trademarked")) warnings.push(`Commons restriction: ${r}`);

  return {
    ok: true,
    credit: {
      author: author.slice(0, 200) || "Unknown author",
      license: licenseName || (isPublicDomain ? "Public domain" : licenseCode),
      licenseUrl: str(meta(metadata, "LicenseUrl")),
      sourceUrl: descriptionUrl,
    },
    warnings,
  };
}
