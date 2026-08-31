-- Supabase security advisor: "Security Definer View".
--
-- In Postgres 15+ a view runs SECURITY DEFINER by default - as its owner - so a
-- query through permits_needing_geocode bypasses the deny-all RLS on `permits`.
-- Supabase auto-grants `anon` SELECT on public views, so any anonymous caller
-- could read permit_number / address / zip_code for every pending permit while
-- the queue is non-empty (which it is for a few hours after each daily import).
--
-- security_invoker = true makes the view execute as the calling role, so the
-- `permits` RLS applies and `anon` gets nothing. The geocode background
-- function is unaffected - it uses the service_role key, which bypasses RLS.

alter view permits_needing_geocode set (security_invoker = true);
