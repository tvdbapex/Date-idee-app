-- Migrates idea_status from a bigint FK (date_ideas only) to a plain text
-- card_id, so favorite/done can persist for scraped events too. The table
-- only ever held test data at this point, so this drops and recreates it
-- rather than migrating rows.

drop table if exists idea_status;

create table idea_status (
  card_id text primary key, -- 'idea-<date_ideas.id>' or 'event-<events.id>'
  starred boolean not null default false,
  done boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table idea_status enable row level security;

create policy "Public read access"
  on idea_status for select
  using (true);

create policy "Public write access"
  on idea_status for insert
  with check (true);

create policy "Public update access"
  on idea_status for update
  using (true)
  with check (true);
