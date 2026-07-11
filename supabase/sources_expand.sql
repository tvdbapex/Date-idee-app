-- Run after venues_schema.sql. Registers the new sources so the Edge
-- Functions have a `sources.id` to attribute rows to and report status on.

insert into sources (name, subregion, url) values
  ('RegioRadar Eindhoven', 'middenring', 'https://www.regioradareindhoven.nl'),
  ('UitInEindhoven', 'buitenring', 'https://www.uitineindhoven.nl/agenda'),
  ('OpenStreetMap Overpass', 'kernregio-buitenring', 'https://overpass-api.de'),
  ('UitEindhoven Venues', 'buitenring', 'https://uiteindhoven.com')
on conflict (name) do nothing;
