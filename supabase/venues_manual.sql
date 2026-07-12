-- Manually curated venues: single businesses with clean schema.org data
-- that aren't part of any scrapable platform (no sitemap/directory to
-- crawl), so they're not something fetch-venues can discover on its own.
-- Uses source='manual' so the fetch-venues mark-and-sweep (which only
-- deletes stale rows for source='osm'/'uiteindhoven') never touches these.

insert into venues (source, source_ref, title, category, env, description, location_name, lat, lng, distance_km, rating, url, image_url)
values (
  'manual',
  'https://www.letsrow.nl/',
  'Lets Row - Verhuur en verkoop SUPboards',
  'Actief',
  'outdoor',
  'Huur een opblaasbare SUP en peddel op de Dommel. SUPbox ophalen in Mariaheide, tussen Uden en Veghel - reserveren via de site.',
  'Veghel',
  51.638371,
  5.583502,
  9.2,
  null,
  'https://www.letsrow.nl/',
  'https://irp.cdn-website.com/1ae19a9f/dms3rep/multi/LetsRow-wit-02.png'
)
on conflict (source, source_ref) do nothing;
