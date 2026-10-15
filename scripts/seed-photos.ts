/**
 * Give each placeholder product a free-licensed stand-in photo from Wikimedia
 * Commons (scripts/product-photos.ts maps SKU → Commons file).
 *
 *   npm run seed:photos -- --dry-run   # check every file and its license; writes nothing
 *   npm run seed:photos                # upload and attach the photos
 *   npm run seed:photos -- --replace   # swap existing stock photos for the current picks
 *
 * Each file's license is checked against the Commons API at run time: only
 * public domain, CC0, CC BY and CC BY-SA files are used, and the author and
 * license are stored in product_images.credit so the product page can credit
 * them. Products that already have staff-uploaded photos are left alone, so it
 * is safe to re-run.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { commonsCredit, type CommonsMetadata, type PhotoCredit } from "../lib/catalog/photo-credit";
import { PRODUCT_PHOTOS } from "./product-photos";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia asks automated clients to identify themselves.
const USER_AGENT = "MorseElectricPhotoSeeder/1.0 (https://morseelectricmotor.com; catalog photo seeding)";
const WIDTH = 1600;
const MAX_BYTES = 8 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const replace = args.has("--replace");

interface ResolvedPhoto {
  file: string;
  url: string;
  credit: PhotoCredit;
  warnings: string[];
}

async function resolveCommonsFile(file: string): Promise<ResolvedPhoto> {
  const title = file.startsWith("File:") ? file : `File:${file}`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: String(WIDTH),
    titles: title,
  });
  const res = await fetch(`${COMMONS_API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Commons API answered ${res.status}`);
  const body = (await res.json()) as {
    query?: { pages?: { missing?: boolean; invalid?: boolean; imageinfo?: { thumburl?: string; url: string; descriptionurl: string; extmetadata?: CommonsMetadata }[] }[] };
  };
  const page = body.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || page.invalid || !info) throw new Error("no such file on Commons");
  const result = commonsCredit(info.extmetadata ?? {}, info.descriptionurl);
  if (!result.ok) throw new Error(result.reason);
  return { file: title, url: info.thumburl ?? info.url, credit: result.credit, warnings: result.warnings };
}

async function download(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`download answered ${res.status}`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!EXTENSIONS[contentType]) throw new Error(`unexpected image type ${contentType || "unknown"}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error(`image is ${(bytes.byteLength / 1048576).toFixed(1)} MB`);
  return { bytes, contentType };
}

async function main() {
  // Resolve every distinct file first, so a bad pick is reported before anything is written.
  const resolved = new Map<string, ResolvedPhoto | Error>();
  for (const { file } of PRODUCT_PHOTOS) {
    if (resolved.has(file)) continue;
    resolved.set(file, await resolveCommonsFile(file).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))));
  }

  let problems = 0;
  for (const { sku, file } of PRODUCT_PHOTOS) {
    const r = resolved.get(file)!;
    if (r instanceof Error) {
      problems++;
      console.log(`✗ ${sku}: ${file}: ${r.message}`);
    } else {
      console.log(`✓ ${sku}: ${r.file} (${r.credit.license}, ${r.credit.author})`);
      if (dryRun) console.log(`    ${r.credit.sourceUrl}`);
      for (const w of r.warnings) console.log(`    ! ${w}`);
    }
  }
  if (dryRun) {
    console.log(`\nDry run: ${PRODUCT_PHOTOS.length - problems} of ${PRODUCT_PHOTOS.length} photos usable. Nothing was written.`);
    console.log("Open the links above to check each photo shows the right kind of equipment.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  const supabase = createClient(url, secret, { auth: { persistSession: false } });

  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, sku, name, images:product_images(id, storage_path, credit, sort_order)")
    .in("sku", PRODUCT_PHOTOS.map((p) => p.sku));
  if (productError) throw productError;
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const downloads = new Map<string, Promise<{ bytes: Uint8Array; contentType: string }>>();
  const counts = { added: 0, skipped: 0, failed: 0 };

  for (const { sku, file, alt } of PRODUCT_PHOTOS) {
    const photo = resolved.get(file)!;
    const product = bySku.get(sku);
    const skip = (why: string) => {
      counts.skipped++;
      console.log(`- ${sku}: skipped, ${why}`);
    };
    if (photo instanceof Error) { counts.failed++; continue; }
    if (!product) { skip("no product with this SKU"); continue; }

    const own = product.images.filter((i) => i.credit === null);
    const stock = product.images.filter((i) => i.credit !== null);
    if (own.length) { skip("it has its own photos"); continue; }
    if (stock.length && !replace) { skip("it already has a stock photo (use --replace to swap it)"); continue; }

    try {
      if (!downloads.has(photo.url)) downloads.set(photo.url, download(photo.url));
      const { bytes, contentType } = await downloads.get(photo.url)!;
      const hash = createHash("sha256").update(photo.file).digest("hex").slice(0, 12);
      const path = `${product.id}/commons-${hash}.${EXTENSIONS[contentType]}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, bytes, { contentType, cacheControl: "31536000", upsert: true });
      if (uploadError) throw uploadError;

      if (stock.length) {
        const { error } = await supabase.from("product_images").delete().in("id", stock.map((i) => i.id));
        if (error) throw error;
        const stale = stock.map((i) => i.storage_path).filter((p) => p !== path);
        if (stale.length) await supabase.storage.from("product-images").remove(stale);
      }
      const { error } = await supabase
        .from("product_images")
        .insert({ product_id: product.id, storage_path: path, alt: alt ?? product.name, sort_order: 0, credit: photo.credit });
      if (error) throw error;
      counts.added++;
      console.log(`+ ${sku}: added ${photo.file}`);
    } catch (e) {
      counts.failed++;
      console.log(`✗ ${sku}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nAdded ${counts.added}, skipped ${counts.skipped}, failed ${counts.failed}.`);
  if (counts.added) console.log("Product pages show the photos straight away; the home page catches up within 5 minutes.");
  if (counts.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
