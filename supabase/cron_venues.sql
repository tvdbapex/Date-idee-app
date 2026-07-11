-- Run after deploying the fetch-venues Edge Function with "Verify JWT"
-- turned off. Venues change far less often than events, and the
-- uiteindhoven.com scrape alone is ~550 page fetches, so this runs weekly
-- (Sundays) rather than daily like fetch-events, out of politeness to the
-- source site.

select cron.schedule(
  'fetch-venues-weekly',
  '30 3 * * 0', -- Sundays 03:30 UTC ≈ 05:30 Europe/Amsterdam summer time
  $$
  select net.http_post(
    url := 'https://obbjmstbdxxmjapduwdq.supabase.co/functions/v1/fetch-venues'
  );
  $$
);
