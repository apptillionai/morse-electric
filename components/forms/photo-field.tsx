"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_MAX_DIMENSION } from "@/lib/requests/photos";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
/** Photos under this size and dimension are sent as they are. */
const SHRINK_ABOVE_BYTES = 900 * 1024;

interface Chosen {
  file: File;
  preview: string | null;
}

/**
 * Re-encode a large photo as a JPEG that fits PHOTO_MAX_DIMENSION, so a few
 * phone photos fit under the upload limit. Returns the original when the
 * browser can't decode it (HEIC outside Safari) or shrinking wouldn't help.
 */
async function shrink(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SHRINK_ABOVE_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
}

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Optional photos for the quote and service forms. Without JavaScript it is a
 * plain file input; with it, large photos are shrunk in the browser first and
 * each one can be previewed and removed.
 *
 * `onBusyChange` lets the form hold its submit button while photos are being
 * prepared.
 */
export function PhotoField({
  error,
  onBusyChange,
}: {
  error?: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosenState] = useState<Chosen[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Mirrors `chosen` for the event listener and unmount cleanup below.
  const chosenRef = useRef<Chosen[]>([]);

  function setChosen(next: Chosen[]) {
    chosenRef.current.forEach((c) => c.preview && URL.revokeObjectURL(c.preview));
    chosenRef.current = next;
    setChosenState(next);
  }

  // A submission that comes back with errors resets the form, which empties
  // the file input, so the photos have to be chosen again.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      if (!chosenRef.current.length) return;
      chosenRef.current.forEach((c) => c.preview && URL.revokeObjectURL(c.preview));
      chosenRef.current = [];
      setChosenState([]);
      setNotice("Your photos weren’t sent. Add them again before you resend.");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  useEffect(() => () => chosenRef.current.forEach((c) => c.preview && URL.revokeObjectURL(c.preview)), []);

  function apply(files: File[]) {
    const input = inputRef.current;
    if (!input) return;
    try {
      const transfer = new DataTransfer();
      files.forEach((f) => transfer.items.add(f));
      input.files = transfer.files;
    } catch {
      // Old browsers: keep what the person picked; the server checks it.
      return;
    }
    setChosen(
      files.map((file) => ({
        file,
        preview: file.type === "image/heic" || file.type === "image/heif" ? null : URL.createObjectURL(file),
      })),
    );
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setNotice(picked.length > MAX_PHOTOS ? `Only the first ${MAX_PHOTOS} photos will be sent.` : null);
    setBusy(true);
    onBusyChange(true);
    try {
      apply(await Promise.all(picked.slice(0, MAX_PHOTOS).map(shrink)));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  function remove(index: number) {
    setNotice(null);
    apply(chosen.filter((_, i) => i !== index).map((c) => c.file));
  }

  const total = chosen.reduce((sum, c) => sum + c.file.size, 0);
  const tooLarge = total > MAX_PHOTO_BYTES;
  const message = error ?? (tooLarge ? `These photos add up to ${megabytes(total)}; the limit is 3.5 MB. Remove one.` : null);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="photos" className="text-sm font-semibold">
        Photos<span className="font-normal text-fg-muted"> (optional)</span>
      </label>
      <input
        ref={inputRef}
        id="photos"
        name="photos"
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onChange}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? "photos-error" : "photos-hint"}
        className="w-full rounded border border-dashed border-edge-strong bg-surface p-3 text-sm text-fg-muted file:mr-3 file:h-10 file:cursor-pointer file:rounded file:border file:border-solid file:border-edge-strong file:bg-page file:px-4 file:font-semibold file:text-fg aria-[invalid=true]:border-danger"
      />
      {message ? (
        <span id="photos-error" className="text-[13px] font-medium text-danger">
          {message}
        </span>
      ) : (
        <span id="photos-hint" className="text-[13px] text-fg-muted">
          {busy
            ? "Preparing photos…"
            : `Up to ${MAX_PHOTOS} photos: the nameplate, the damage, or how it’s installed. JPEG, PNG, WebP or HEIC.`}
        </span>
      )}
      {notice && (
        <span role="status" className="text-[13px] font-medium text-fg">
          {notice}
        </span>
      )}
      {chosen.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-3" aria-label="Photos to send">
          {chosen.map((c, i) => (
            <li key={`${c.file.name}-${i}`} className="flex w-28 flex-col gap-1 text-xs text-fg-muted">
              <div className="relative">
                {c.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview of a file that hasn't been uploaded
                  <img src={c.preview} alt="" className="aspect-square w-full rounded border border-edge object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded border border-edge bg-page p-2 text-center">
                    No preview
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full border border-edge-strong bg-surface text-fg hover:border-bold"
                >
                  <X aria-hidden="true" className="size-4" />
                  <span className="sr-only">Remove {c.file.name}</span>
                </button>
              </div>
              <span className="truncate" title={c.file.name}>
                {c.file.name}
              </span>
              <span>{megabytes(c.file.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
