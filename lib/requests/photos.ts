/**
 * Photos attached to the public quote and service forms (nameplates, damage,
 * the installation). Shared by the form, which shrinks photos in the browser,
 * and the server action, which checks the actual bytes before storing them.
 */

export const MAX_PHOTOS = 4;
/** All photos together. Server action bodies are capped at 4 MB (next.config.ts), so leave room for the fields. */
export const MAX_PHOTO_BYTES = 3.5 * 1024 * 1024;
/** The browser shrinks photos to fit this before upload. */
export const PHOTO_MAX_DIMENSION = 2000;

export const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
} as const;
export type PhotoType = keyof typeof PHOTO_TYPES;

export interface PhotoUpload {
  name: string;
  type: PhotoType;
  bytes: Uint8Array;
}

export type PhotoCheck = { ok: true; photos: PhotoUpload[] } | { ok: false; error: string };

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

/** HEIF brands iPhones and Android cameras write. */
const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

/** The image type from the file's first bytes; the browser-reported type is not trusted. */
export function sniffPhotoType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(bytes, 8, 12))) return "image/heic";
  return null;
}

/**
 * Read and check the photos from a submitted form: how many, how large, and
 * that each one really is an image. Sizes are checked before anything is read.
 */
export async function readPhotos(formData: FormData, field = "photos"): Promise<PhotoCheck> {
  // A file input with nothing chosen still submits one empty file.
  const files = formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS) return { ok: false, error: `Attach up to ${MAX_PHOTOS} photos.` };

  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Those photos are too large together (3.5 MB at most). Attach fewer or smaller photos." };
  }

  const photos: PhotoUpload[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffPhotoType(bytes);
    if (!type) return { ok: false, error: `${file.name || "One file"} isn’t a JPEG, PNG, WebP or HEIC photo.` };
    photos.push({ name: file.name, type, bytes });
  }
  return { ok: true, photos };
}
