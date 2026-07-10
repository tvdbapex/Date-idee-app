-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).

create table if not exists date_ideas (
  id bigint generated always as identity primary key,
  title text not null,
  category text not null,
  env text not null check (env in ('indoor', 'outdoor')),
  days text[], -- specific day codes e.g. '{ZA,ZO}'; null/empty = all days
  price text not null check (price in ('Gratis', '€', '€€', '€€€')),
  distance_km numeric,
  description text,
  is_event boolean not null default false,
  created_at timestamptz not null default now()
);

alter table date_ideas enable row level security;

create policy "Public read access"
  on date_ideas for select
  using (true);
