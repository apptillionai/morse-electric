-- Customers can read their own request rows, so staff notes must not live on
-- them. The notes were copied to quote_request_notes / service_request_notes
-- by the previous migration. `if exists` so it is safe to run by hand first.
alter table public.quote_requests drop column if exists staff_notes;
alter table public.service_requests drop column if exists staff_notes;
