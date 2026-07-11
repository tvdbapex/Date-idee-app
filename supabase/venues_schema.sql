-- Run after events_schema.sql. Adds fixed/recurring venues (restaurants,
-- karting, escape rooms, etc.) discovered from OpenStreetMap and
-- uiteindhoven.com — as opposed to `events`, which are calendar-dated.
--
-- Same write model as events: public read only, service role (Edge
-- Function) writes, bypassing RLS.

create table if not exists venues (
  id bigint generated always as identity primary key,
  source text not null,       -- 'osm' | 'uiteindhoven'
  source_ref text not null,   -- OSM 'type/id' or the venue's page URL — upsert key
  title text not null,
  category text not null,
  env text check (env in ('indoor', 'outdoor') or env is null),
  description text,
  location_name text,
  lat numeric,
  lng numeric,
  distance_km numeric,
  rating numeric,             -- out of 5, null if source has no rating
  url text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_ref)
);

alter table venues enable row level security;
create policy "Public read access" on venues for select using (true);
