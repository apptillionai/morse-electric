-- Business details shown across the website (header, footer, contact page,
-- emails), edited by staff at /admin/settings instead of hosting env vars.
-- Same row and policies as the default theme: public read, staff update.

alter table public.site_settings
  add column phone text check (phone is null or char_length(phone) <= 40),
  add column email text check (email is null or char_length(email) <= 254),
  add column street text check (street is null or char_length(street) <= 160),
  add column city text check (city is null or char_length(city) <= 80),
  add column state text check (state is null or char_length(state) <= 40),
  add column postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  add column hours text check (hours is null or char_length(hours) <= 120),
  add column service_area text check (service_area is null or char_length(service_area) <= 160);

-- The confirmed shop address.
update public.site_settings
set street = '380 East Broadway', city = 'Gardner', state = 'MA', postal_code = '01440'
where id = 1 and street is null;
