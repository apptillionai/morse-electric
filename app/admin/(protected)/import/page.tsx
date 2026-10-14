import { PageHeader } from "@/components/admin/admin-shell";
import { ImportFlow } from "@/components/admin/import-flow";

export const metadata = { title: "Import CSV" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import products"
        description="Add or update many products at once from a spreadsheet. Save it from Excel or Google Sheets as CSV."
      />
      <ImportFlow />
    </>
  );
}
