-- Credit for stock photos: freely licensed images (Wikimedia Commons) that
-- stand in on a product until Morse photographs its own unit. Loaded by
-- `npm run seed:photos`; null for photos staff upload themselves.
-- Shape: { author, license, licenseUrl, sourceUrl } (lib/catalog/photo-credit.ts).

alter table public.product_images
  add column credit jsonb
  constraint product_images_credit_shape check (
    credit is null
    or (jsonb_typeof(credit) = 'object' and credit ? 'author' and credit ? 'license' and credit ? 'sourceUrl')
  );
