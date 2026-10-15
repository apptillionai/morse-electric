import Link from "next/link";
import { PageHeader } from "@/components/admin/admin-shell";
import { ProductForm } from "@/components/admin/product-form";
import { loadRefs } from "@/lib/admin/catalog";
import { EMPTY_PRODUCT_FORM } from "@/lib/admin/product-form";
import { staffClient } from "@/lib/admin/auth";

export const metadata = { title: "Add product" };

export default async function NewProductPage() {
  const refs = await loadRefs(await staffClient());
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/products">← Products</Link></p>
      <PageHeader title="Add product" description="Save first, then add photos." />
      <ProductForm productId={null} initial={EMPTY_PRODUCT_FORM} categories={refs.categories} brands={refs.brands.map((b) => b.name)} />
    </>
  );
}
