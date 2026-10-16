# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Highlights for Next 16: `params` and `searchParams` are Promises (use the generated `PageProps<"/route">` types), `middleware.ts` is now `proxy.ts`, and Turbopack is the default bundler.

# Project notes

- **Catalog access goes through `getCatalog()`** (`lib/catalog/index.ts`). It returns the Supabase source when Supabase env vars are set, otherwise the placeholder demo catalog. Pages must render the `DemoCatalogBanner` whenever `catalog.isDemo` is true.
- **Filtering lives in two places that must agree:** the SQL query in `lib/catalog/supabase-source.ts` and the in-memory `filterProducts` in `lib/catalog/filters.ts` (covered by unit tests). Change both together.
- **Shop URLs are the filter state.** Parse with `parseFilters`, build links with `shopHref`. The filter sidebar is a plain GET form, so filtering works without JavaScript.
- **Public forms** (`app/actions/requests.ts`) check a honeypot, validate with zod (`lib/requests/schemas.ts`), verify Turnstile, store with the service-role client, then email via `after()`. Emails never block or fail a stored request. Optional photos are checked by their bytes (`lib/requests/photos.ts`, shrunk in the browser first) before the request is stored, then go to the private `request-photos` bucket with a `request_photos` row; a failed photo upload is logged and never fails the request.
- **Database changes** go in a new file under `supabase/migrations/`. Keep RLS on every table, and extend `supabase/tests/catalog_rls.sql`.
- Install with `npm install` (`.npmrc` sets `legacy-peer-deps` to work around an npm resolver crash).
- Before pushing, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
- **Admin** (`app/admin`) uses the signed-in staff member's session client, never the service-role client, so RLS is the real gate. Every admin page calls `staffClient()`/`requireStaff()` and every server action calls `requireStaff()` itself; the layout guard is not enough.
- **Products are written in one shape:** the admin form (`lib/admin/product-form.ts`) and the CSV importer (`lib/admin/csv-import.ts`) both produce `ProductValues` via the parsers in `lib/admin/product-fields.ts`. The CSV export must keep round-tripping through the importer (there is a test).
- **Colours are theme tokens** (`bg-surface`, `text-fg-muted`, `bg-bold`, `text-accent-ink`, …) defined for light, mid and dark in `app/globals.css`. Never use raw colours in components. If you add or change a token, the contrast test must still pass.
- **Customer accounts are invite-only.** Customers read and edit their own data through RLS (`public.customers`, `customer_id` on requests, the private `customer-documents` bucket). Staff notes live in `quote_request_notes` / `service_request_notes`, never on the request rows customers can read. Only creating/re-linking/deleting auth users uses the service role (`lib/admin/customers.ts`). Extend `supabase/tests/customer_rls.sql` with any change.
- **Business details and site options live in `public.site_settings`** (one row; public read, staff update) and are edited at /admin/settings. Read them with `getBusiness()` / `getSiteSettings()` (`lib/site-settings.ts`), which go through Next's fetch cache with the `site-settings` tag so public pages stay static; the settings action calls `updateTag`. Never hard-code the phone, email, address, hours or service area.
