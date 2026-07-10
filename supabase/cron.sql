-- Run after deploying the fetch-events Edge Function (see
-- supabase/functions/fetch-events/index.ts) with "Verify JWT" turned off.
-- Schedules a daily scrape; no Authorization header is needed since the
-- function doesn't require a caller JWT (it authenticates internally via
-- its own injected service role key).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'fetch-events-daily',
  '17 4 * * *', -- 04:17 UTC ≈ 06:17 Europe/Amsterdam summer time
  $$
  select net.http_post(
    url := 'https://obbjmstbdxxmjapduwdq.supabase.co/functions/v1/fetch-events'
  );
  $$
);
