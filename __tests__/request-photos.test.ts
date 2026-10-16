import { MAX_PHOTO_BYTES, MAX_PHOTOS, readPhotos, sniffPhotoType } from "@/lib/requests/photos";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0)));
const HEIC = [0, 0, 0, 0x18, ..."ftypheic".split("").map((c) => c.charCodeAt(0))];

const bytes = (head: number[], size = head.length) => {
  const b = new Uint8Array(size);
  b.set(head);
  return b;
};

function form(...files: File[]) {
  const data = new FormData();
  data.set("name", "Pat");
  for (const f of files) data.append("photos", f);
  return data;
}

describe("sniffPhotoType", () => {
  it("recognises JPEG, PNG, WebP and HEIC by their first bytes", () => {
    expect(sniffPhotoType(bytes(JPEG))).toBe("image/jpeg");
    expect(sniffPhotoType(bytes(PNG))).toBe("image/png");
    expect(sniffPhotoType(bytes(WEBP))).toBe("image/webp");
    expect(sniffPhotoType(bytes(HEIC))).toBe("image/heic");
  });

  it("rejects anything else, whatever it is called", () => {
    expect(sniffPhotoType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffPhotoType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffPhotoType(new Uint8Array())).toBeNull();
  });
});

describe("readPhotos", () => {
  it("ignores the empty file an untouched input submits", async () => {
    const result = await readPhotos(form(new File([], "", { type: "application/octet-stream" })));
    expect(result).toEqual({ ok: true, photos: [] });
  });

  it("returns each photo with its sniffed type, not the browser's", async () => {
    const result = await readPhotos(form(new File([bytes(PNG, 100)], "nameplate.jpg", { type: "image/jpeg" })));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.photos).toHaveLength(1);
      expect(result.photos[0]).toMatchObject({ name: "nameplate.jpg", type: "image/png" });
      expect(result.photos[0].bytes.length).toBe(100);
    }
  });

  it("limits the number of photos", async () => {
    const files = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => new File([bytes(JPEG, 10)], `p${i}.jpg`));
    expect(await readPhotos(form(...files))).toEqual({ ok: false, error: `Attach up to ${MAX_PHOTOS} photos.` });
  });

  it("limits the total size", async () => {
    const half = Math.ceil(MAX_PHOTO_BYTES / 2) + 1;
    const result = await readPhotos(form(new File([bytes(JPEG, half)], "a.jpg"), new File([bytes(JPEG, half)], "b.jpg")));
    expect(result.ok).toBe(false);
  });

  it("rejects a file that isn't a photo and names it", async () => {
    const result = await readPhotos(form(new File(["<html>"], "invoice.png", { type: "image/png" })));
    expect(result).toEqual({ ok: false, error: "invoice.png isn’t a JPEG, PNG, WebP or HEIC photo." });
  });
});
