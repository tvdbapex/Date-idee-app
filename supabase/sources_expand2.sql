-- Adds the middenring sources that were missing entirely (Boxtel, Oss,
-- Laarbeek/Peelland) — the first expansion pass only reached Eindhoven and
-- Meierijstad, leaving this corridor uncovered despite being 10-25km away.

insert into sources (name, subregion, url) values
  ('Beleef Boxtel', 'middenring', 'https://www.beleefboxtel.nl/uitagenda'),
  ('Tref het in Oss', 'middenring', 'https://www.trefhetinoss.nl/uitagenda'),
  ('Land van de Peel', 'middenring', 'https://www.landvandepeel.nl/nl')
on conflict (name) do nothing;
