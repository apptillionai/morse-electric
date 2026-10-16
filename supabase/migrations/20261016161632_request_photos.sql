-- Photos attached to quote and service requests (nameplates, damage, the
-- installation).
--
-- Access model:
--   * The public forms store photos with the service-role key from server
--     code, after the request row exists. Nobody else inserts.
--   * Staff read every photo. Customers read photos on their own requests,
--     the same rows they can already read.
--   * Files live in the private `request-photos` bucket under
--     <quote|service>/<request id>/<file>; reading one needs a matching
--     public.request_photos row the reader can see.

create table public.request_photos (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references public.quote_requests (id) on delete cascade,
  service_request_id uuid references public.service_requests (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes integer not null check (size_bytes > 0),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- Every photo belongs to exactly one request.
  check (num_nonnulls(quote_request_id, service_request_id) = 1)
);
create index request_photos_quote_idx on public.request_photos (quote_request_id, sort_order)
  where quote_request_id is not null;
create index request_photos_service_idx on public.request_photos (service_request_id, sort_order)
  where service_request_id is not null;

alter table public.request_photos enable row level security;
revoke all on public.request_photos from anon, authenticated;
grant select on public.request_photos to authenticated;

-- The request tables' own policies decide which requests a reader can see,
-- so a photo is visible exactly when its request is.
create policy "Customers read photos on their own requests; staff read all" on public.request_photos
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.quote_requests q where q.id = request_photos.quote_request_id)
    or exists (select 1 from public.service_requests s where s.id = request_photos.service_request_id)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-photos', 'request-photos', false, 3670016,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "Read request photos the reader can see" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-photos'
    and exists (select 1 from public.request_photos p where p.storage_path = objects.name)
  );
