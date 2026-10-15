"use client";

import { useActionState } from "react";
import { uploadImagesAction, type UploadState } from "@/app/admin/actions";
import { FormMessage } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "./delete-button";

export interface ManagedImage {
  id: string;
  url: string;
  alt: string;
  stock: boolean;
  remove: () => Promise<void>;
}

export function ImageManager({ productId, images }: { productId: string; images: ManagedImage[] }) {
  const [state, action, pending] = useActionState(uploadImagesAction.bind(null, productId), {} as UploadState);

  return (
    <section aria-labelledby="photos-heading" className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-5">
      <h2 id="photos-heading" className="font-display text-xl font-bold uppercase tracking-[0.04em]">Photos</h2>
      {images.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {images.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails straight from Storage */}
              <img src={img.url} alt={img.alt} className="aspect-square w-full rounded border border-edge object-cover" />
              <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
                <span>
                  {i === 0 ? "Main photo" : `Photo ${i + 1}`}
                  {img.stock && <span className="block">Stock photo</span>}
                </span>
                <DeleteButton action={img.remove} label="Remove" confirmText="Remove this photo?" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">No photos yet. The site shows a placeholder until you add one.</p>
      )}
      {images.some((img) => img.stock) && (
        <p className="text-[13px] text-fg-muted">
          Stock photos are free-licensed stand-ins, shown on the site as “representative” with a photo credit. Once you
          upload your own photo of the unit, remove the stock one.
        </p>
      )}
      <form action={action} className="flex flex-col gap-3">
        <FormMessage message={state.error} />
        {state.uploaded ? <p role="status" className="text-sm font-medium text-ok">Uploaded {state.uploaded} photo{state.uploaded === 1 ? "" : "s"}.</p> : null}
        <label htmlFor="images" className="text-sm font-semibold">Add photos</label>
        <input
          id="images"
          name="images"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="images-hint"
          className="text-sm file:mr-3 file:h-11 file:cursor-pointer file:rounded file:border file:border-edge-strong file:bg-surface file:px-4 file:font-semibold file:text-fg"
        />
        <span id="images-hint" className="text-[13px] text-fg-muted">JPEG, PNG or WebP, up to 3.5 MB per upload. The first photo is the main one.</span>
        <div>
          <Button type="submit" variant="dark" size="sm" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
        </div>
      </form>
    </section>
  );
}
