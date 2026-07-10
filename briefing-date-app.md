# Briefing: Date-ideeën app voor twee

## Doel
Een webapp die date-ideeën en uitjes voorstelt voor twee personen, binnen een straal van
**35km rond Boerdonk** (Meierijstad, Noord-Brabant — lat 51.5595751, lng 5.6263531),
rekening houdend met het weer per dag en met welke dagen jullie beschikbaar zijn.
Geen swipe/match-systeem nodig — jullie kiezen samen uit één gedeelde lijst.

## Links
- Repo: https://github.com/tvdbapex/Date-idee-app
- Supabase project: https://supabase.com/dashboard/project/obbjmstbdxxmjapduwdq

## Stack
- **Frontend:** statische site, gehost op GitHub Pages
- **Backend:** Supabase (Postgres + Edge Functions + pg_cron)
- **Geen** Vercel/Netlify — alle server-side logica (API-keys, scheduled fetches) loopt via
  Supabase Edge Functions, niet via de statische frontend
- **Auth:** licht houden — evt. magic-link voor jullie twee e-mailadressen, of geen login als
  de site toch niet gedeeld/vindbaar is

### Architectuur
```
GitHub Pages (statisch, HTML/JS)
        │  leest via Supabase JS client (anon key, RLS read-only)
        ▼
Supabase Postgres  ←──  Edge Function (dagelijks via pg_cron)
                              │
                              ▼
                    Weer-API + evenementenbronnen
```

## UI-concept (al gebouwd als klikbaar HTML-prototype, zie bijlage)
Signature element: een **weekstrip** bovenaan — 7 dagchips die tegelijk (a) het weer van die
dag tonen en (b) aan/uit te klikken zijn als dag-filter ("we willen donderdag al iets doen").
Kaarten filteren op geselecteerde dagen, categorie en budget, en krijgen een badge als ze goed
passen bij het weer op een geselecteerde dag (indoor+regen, outdoor+zon).

### Categorieën
Eten & drinken · Natuur · Cultuur · Actief · Evenementen · Verrassend

### Card-velden
titel, categorie, indoor/outdoor, dagen beschikbaar (vast item = alle dagen, evenement =
specifieke datum/dag), prijsindicatie (Gratis/€/€€/€€€), afstand, beschrijving,
favoriet-status, gedaan-status

## Databronnen evenementen (per subregio, 35km straal)
Geen van onderstaande bronnen heeft een publieke API — allemaal scraping/RSS-kandidaten.
Start met de eerste twee, breid later uit.

**Kernregio (0-15km) — start hiermee**
- Bezoek Meierijstad: https://www.bezoekmeierijstad.nl/agenda (officiële gemeente/VVV-agenda)
- Drimble regio Noordoost-Brabant: https://drimble.nl/agenda/regio/noord-brabant/noordoost-brabant/

**Middenring (15-25km) — fase 2**
- Uitzinnig.nl per gemeente (Den Bosch, Boxtel, Oss, Helmond)
- RegioRadar Eindhoven: https://www.regioradareindhoven.nl

**Buitenring (25-35km) — fase 3**
- UitinEindhoven: https://www.uitineindhoven.nl/agenda
- UitEindhoven: https://uiteindhoven.com

**Optioneel, voor grotere events (hebben wél officiële API's)**
- Eventbrite API
- Ticketmaster API
(missen de kleine jaarmarkten/buurtevents — dus aanvullend, niet vervangend)

## Database — richting voor het schema
Nog niet vastgelegd, maar de bouwstenen die genoemd zijn:
- `date_ideas` — vaste/terugkerende ideeën, handmatig ingevoerd (niet uit een API)
- `events` — tijdelijke, datum-gebonden evenementen uit de live bronnen
- `sources` — welke bron, subregio, laatst opgehaald, betrouwbaarheid
- status-tabel voor favoriet/gedaan, gekoppeld aan de twee gebruikers (of simpel zonder auth)

## Volgorde van bouwen (advies uit eerdere sessie)
1. Weer-API koppelen aan de bestaande UI (vervang mock-data door echte forecast)
2. Zelf 15-20 date-ideeën invoeren in een echte Supabase-tabel i.p.v. hardcoded array
3. Favoriet/gedaan-status persistent maken (Supabase read/write via RLS)
4. Events-scraping toevoegen (meest fragiele onderdeel, dus als laatste)

## Bijlage
Het klikbare HTML-prototype met de weekstrip, filters en kaarten-UI staat in dit gesprek —
vraag Claude Code om dat over te nemen als uitgangspunt voor de frontend-structuur.
