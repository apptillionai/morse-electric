import { getStaffUser } from "@/lib/admin/auth";
import { importTemplateCsv } from "@/lib/admin/csv-import";

/** A starter spreadsheet with every column the importer understands. */
export async function GET() {
  if (!(await getStaffUser())) return new Response("Not signed in", { status: 401 });
  // The byte-order mark makes Excel open the file as UTF-8 (for ½, °, etc.).
  return new Response(BOM + importTemplateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="morse-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}

const BOM = String.fromCharCode(0xfeff);
