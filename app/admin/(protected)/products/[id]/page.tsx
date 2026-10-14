import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteImageAction, deleteProductAction } from "@/app/admin/actions";
import { Notice, PageHeader } from "@/components/admin/admin-shell";
import { DeleteButton } from "@/components/admin/delete-button";
import { ImageManager } from "@/components/admin/image-manager";
import { ProductForm } from "@/components/admin/product-form";
import { getProduct, loadRefs } from "@/lib/admin/catalog";
import { productToForm } from "@/lib/admin/product-form";
import { storagePublicUrl } from "@/lib/supabase/env";
import { staffClient } from "@/lib/admin/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(props: PageProps<"/admin/products/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) return { title: "Product" };
  const found = await getProduct(await staffClient(), id);
  return { title: found ? found.product.sku : "Product" };
}

export default async function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!UUID.test(id)) notFound();
  const supabase = await staffClient();
  const [found, refs] = await Promise.all([getProduct(supabase, id), loadRefs(supabase)]);
  if (!found) notFound();
  const { product, images } = found;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/products">← Products</Link></p>
      <PageHeader
        title={product.values.name}
        description={<span className="font-mono">{product.sku}</span>}
        actions={
          <>
            {product.values.status === "active" && (
              <Link href={`/products/${product.values.slug}`} className="inline-flex h-11 items-center gap-1.5 px-2 text-sm font-semibold">
                View on site <ExternalLink size={14} aria-hidden="true" />
              </Link>
            )}
            <DeleteButton
              action={deleteProductAction.bind(null, product.id)}
              label="Delete product"
              confirmText={`Delete ${product.sku} and its photos? This can’t be undone. To hide it instead, set its status to Archived.`}
            />
          </>
        }
      />
      {sp.saved === "1" && <Notice>Saved. Changes show on the site straight away.</Notice>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ProductForm
          productId={product.id}
          initial={productToForm(product.sku, product.values)}
          categories={refs.categories}
          brands={refs.brands.map((b) => b.name)}
        />
        <ImageManager
          productId={product.id}
          images={images.map((img) => ({
            id: img.id,
            url: storagePublicUrl("product-images", img.storagePath),
            alt: img.alt,
            remove: deleteImageAction.bind(null, product.id, img.id),
          }))}
        />
      </div>
    </>
  );
}
