-- Site-wide settings staff can change from /admin/settings. A single row.
-- Read publicly (the storefront needs the default theme before first paint);
-- only staff can change it.

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  default_theme text not null default 'light' check (default_theme in ('light', 'mid', 'dark', 'system')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index site_settings_updated_by_idx on public.site_settings (updated_by) where updated_by is not null;

insert into public.site_settings (id, default_theme) values (1, 'light') on conflict (id) do nothing;

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

create policy "Site settings are public" on public.site_settings
  for select to anon, authenticated using (true);
create policy "Staff update site settings" on public.site_settings
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
