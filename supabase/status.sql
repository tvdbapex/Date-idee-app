-- Run after schema.sql/seed.sql. Stores favorite/done status per idea.
-- No auth yet (per briefing: fine for a private, unshared link) so both
-- of you write to the same shared status — there's no per-user split.

create table if not exists idea_status (
  idea_id bigint primary key references date_ideas(id) on delete cascade,
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
