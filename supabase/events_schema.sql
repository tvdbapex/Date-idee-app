-- Run after status_v2.sql. Adds tables for scraped events (see supabase/functions/fetch-events).
--
-- Only the service role (used internally by the Edge Function) can write here —
-- unlike idea_status, there's no public write policy, so nobody can spoof events
-- via the anon key.

create table if not exists sources (
  id bigint generated always as identity primary key,
  name text not null unique,
  subregion text not null,
  url text not null,
  last_fetched_at timestamptz,
  last_status text,
  last_error text
);

insert into sources (name, subregion, url)
values ('Bezoek Meierijstad', 'kernregio', 'https://www.bezoekmeierijstad.nl/agenda')
on conflict (name) do nothing;

create table if not exists events (
  id bigint generated always as identity primary key,
  source_id bigint references sources(id) on delete cascade,
  source_url text not null,
  title text not null,
  description text,
  category text not null default 'Evenementen',
  env text check (env in ('indoor', 'outdoor') or env is null),
  event_date date not null,
  event_time text, -- 'HH:MM' or null if the source has no specific time
  price text,
  location_name text,
  lat numeric,
  lng numeric,
  distance_km numeric,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_url, event_date)
);

alter table sources enable row level security;
create policy "Public read access" on sources for select using (true);

alter table events enable row level security;
create policy "Public read access" on events for select using (true);
