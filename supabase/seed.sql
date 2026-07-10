-- Run after schema.sql. Seeds the placeholder ideas from the prototype so
-- there's real data to read from `date_ideas` — replace/extend with your
-- own 15-20 ideas whenever you like.

insert into date_ideas (title, category, env, days, price, distance_km, description, is_event) values
  ('Jaarmarkt op het plein', 'Evenementen', 'outdoor', '{ZA}', 'Gratis', 3, 'Kraampjes met streekproducten en livemuziek op het centrale plein.', true),
  ('Wandeling langs de plas', 'Natuur', 'outdoor', null, 'Gratis', 5, 'Rustige route langs het water, mooi bij zonsondergang.', false),
  ('Matinee in de kleine bioscoop', 'Cultuur', 'indoor', null, '€€', 4, 'Onafhankelijke films, knusse zaal met maar 40 stoelen.', false),
  ('Escape room: De Kluis', 'Actief', 'indoor', null, '€€', 6, '60 minuten om samen een bankkluis te kraken.', false),
  ('Rooftop terras met uitzicht', 'Eten & drinken', 'outdoor', null, '€€', 7, 'Cocktails met uitzicht over de stad, het best bij zonsondergang.', false),
  ('Pottenbakken workshop', 'Verrassend', 'indoor', '{DO,ZA}', '€€', 5, 'Samen een kom of vaas draaien onder begeleiding.', false),
  ('Vlooienmarkt bij het station', 'Evenementen', 'outdoor', '{ZO}', 'Gratis', 2, 'Tweedehands spulletjes, vintage kleding en oude platen.', true),
  ('Fietstocht door de polder', 'Natuur', 'outdoor', null, 'Gratis', 9, 'Vlak, rustig parcours langs molens en weilanden.', false),
  ('Wijnproeverij in de kelder', 'Eten & drinken', 'indoor', '{VR,ZA}', '€€€', 6, 'Vijf wijnen met bijpassende kaas, in een oud gewelf.', false),
  ('Kunstexpo in het pakhuis', 'Cultuur', 'indoor', null, '€', 4, 'Werk van lokale kunstenaars in een omgebouwd pakhuis.', false),
  ('Openluchtbioscoop op het plein', 'Evenementen', 'outdoor', '{VR}', '€', 3, 'Grote film op groot scherm, neem een kleedje mee.', true),
  ('Kajaktocht door de gracht', 'Actief', 'outdoor', '{ZA,ZO}', '€€', 5, 'Anderhalf uur peddelen langs de mooiste grachtenpanden.', false);
