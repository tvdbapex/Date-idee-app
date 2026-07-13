-- Adds columns for three new features (see technische-uitwerking-features.md):
-- rating after "gedaan", duration filter, seasonal awareness. Reuses the
-- existing idea_status table for feature 3 instead of the spec's proposed
-- item_status — idea_status already covers starred/done for date_ideas,
-- events, and venues via a shared text card_id, so a rating column there
-- is the smaller change and keeps status data in one place.

-- Feature 3: rating na "gedaan"
alter table idea_status add column if not exists rating smallint check (rating between 1 and 5);

-- Feature 4: duur/tijdsindicatie (date_ideas + events only, per spec — venues
-- are open-ended/always-available and weren't in scope here)
alter table date_ideas add column if not exists duration text check (duration in ('kort','halve_dag','hele_dag'));
alter table events add column if not exists duration text check (duration in ('kort','halve_dag','hele_dag'));

-- Feature 5: seizoensbewustzijn (date_ideas only — events already carry a
-- real event_date and are filtered to upcoming dates, so no column needed
-- there; venues out of scope per spec)
alter table date_ideas add column if not exists best_seasons text[];
