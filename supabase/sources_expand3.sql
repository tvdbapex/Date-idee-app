-- Two more middenring/buitenring sources, found via user-supplied candidates
-- and verified the same way as the others (robots.txt, Plaece platform,
-- real Event JSON-LD with geo). Visit Brabant (province-wide, 1,593 events,
-- most well outside 35km) was deliberately left out — poor fetch-to-yield
-- ratio for a source this broad, and adding it risks repeating today's
-- WORKER_RESOURCE_LIMIT issue from too many parallel sources.

insert into sources (name, subregion, url) values
  ('Visit Helmond', 'middenring', 'https://www.visithelmond.nl/nl/agenda'),
  ('Visit Vught', 'buitenring', 'https://www.visitvught.nl/agenda')
on conflict (name) do nothing;
