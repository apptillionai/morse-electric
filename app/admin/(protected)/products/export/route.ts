import { getStaffUser } from "@/lib/admin/auth";
import { loadAllProducts } from "@/lib/admin/catalog";
import { EXPORT_HEADER, exportRow, toCsv } from "@/lib/admin/csv-import";
import { createSessionClient } from "@/lib/supabase/server";

/** The whole catalog as a CSV that the importer reads back unchanged. */
export async function GET() {
  if (!(await getStaffUser())) return new Response("Not signed in", { status: 401 });
  const products = await loadAllProducts(await createSessionClient());
  const csv = toCsv([EXPORT_HEADER, ...products.map((p) => exportRow(p.sku, p.values))]);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="morse-products-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// The byte-order mark makes Excel open the file as UTF-8 (for ½, °, etc.).
const BOM = String.fromCharCode(0xfeff);
