# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Highlights for Next 16: `params` and `searchParams` are Promises (use the generated `PageProps<"/route">` types), `middleware.ts` is now `proxy.ts`, and Turbopack is the default bundler.

# Project notes

- **Catalog access goes through `getCatalog()`** (`lib/catalog/index.ts`). It returns the Supabase source when Supabase env vars are set, otherwise the placeholder demo catalog. Pages must render the `DemoCatalogBanner` whenever `catalog.isDemo` is true.
- **Filtering lives in two places that must agree:** the SQL query in `lib/catalog/supabase-source.ts` and the in-memory `filterProducts` in `lib/catalog/filters.ts` (covered by unit tests). Change both together.
- **Shop URLs are the filter state.** Parse with `parseFilters`, build links with `shopHref`. The filter sidebar is a plain GET form, so filtering works without JavaScript.
- **Public forms** (`app/actions/requests.ts`) check a honeypot, validate with zod (`lib/requests/schemas.ts`), verify Turnstile, store with the service-role client, then email via `after()`. Emails never block or fail a stored request.
- **Database changes** go in a new file under `supabase/migrations/`. Keep RLS on every table, and extend `supabase/tests/catalog_rls.sql`.
- Install with `npm install` (`.npmrc` sets `legacy-peer-deps` to work around an npm resolver crash).
- Before pushing, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
