// Supabase Edge Function: scrapes agenda sites covering kernregio,
// middenring, and buitenring (0-35km around Boerdonk) and upserts upcoming
// events into the `events` table.
//
// All sources below run on the same "Plaece" tourism-site platform, so
// every event page embeds identical schema.org/Event JSON-LD (name,
// description, eventSchedule, geo) — that's what's parsed here, rather than
// fragile HTML/CSS scraping.
//
// Drimble and Uitzinnig.nl (other sources named in the briefing) are NOT
// scraped: Drimble's robots.txt has `User-agent: anthropic-ai / Disallow: /`
// (an explicit opt-out), and Uitzinnig.nl's full listing only renders after
// JavaScript executes (VIEWSTATE-based pagination) — not reachable with a
// lightweight HTTP scraper, unlike every other source here. That leaves
// 's-Hertogenbosch (Den Bosch) uncovered — every candidate site checked for
// it was either broken, JS-only, or blocked ClaudeBot/anthropic-ai in
// robots.txt. Visit Brabant (province-wide, ~1,600 events, most well
// outside 35km) was also left out deliberately — poor fetch-to-yield ratio
// for a source this broad, and adding it risks repeating the
// WORKER_RESOURCE_LIMIT issue too many parallel sources caused earlier.
//
// Deploy via the Supabase dashboard (Edge Functions -> New function ->
// "fetch-events" -> paste this file) with "Verify JWT" turned OFF, since
// this is invoked by pg_cron, not by an end user. It uses the
// SUPABASE_SERVICE_ROLE_KEY that Supabase injects automatically at runtime
// to bypass RLS for writes — `events`/`sources` have no public write policy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOURCES = [
  { name: 'Bezoek Meierijstad', sitemapIndexUrl: 'https://www.bezoekmeierijstad.nl/sitemap/event.xml?_locale=nl' },
  { name: 'RegioRadar Eindhoven', sitemapIndexUrl: 'https://www.regioradareindhoven.nl/nl/sitemap/event.xml' },
  { name: 'UitInEindhoven', sitemapIndexUrl: 'https://www.uitineindhoven.nl/sitemap/event.xml?_locale=nl' },
  { name: 'Beleef Boxtel', sitemapIndexUrl: 'https://www.beleefboxtel.nl/sitemap/event.xml?_locale=nl' },
  { name: 'Tref het in Oss', sitemapIndexUrl: 'https://www.trefhetinoss.nl/sitemap/event.xml?_locale=nl' },
  { name: 'Land van de Peel', sitemapIndexUrl: 'https://www.landvandepeel.nl/nl/sitemap/event.xml' },
  { name: 'Visit Helmond', sitemapIndexUrl: 'https://www.visithelmond.nl/nl/sitemap/event.xml' },
  { name: 'Visit Vught', sitemapIndexUrl: 'https://www.visitvught.nl/sitemap/event.xml?_locale=nl' },
];

const BOERDONK = { lat: 51.5595751, lng: 5.6263531 };
const RADIUS_KM = 35;
const HORIZON_DAYS = 60;
// Sources run in parallel (see SOURCES.map below), each with its own
// mapWithConcurrency pool — worst case total concurrent connections is
// roughly SOURCES.length * FETCH_CONCURRENCY. 6 sources * 8 (=48) ran
// cleanly; 8 sources * 8 (=64) hit WORKER_RESOURCE_LIMIT again. 5 keeps
// 8 sources at 40, back under the working threshold.
const FETCH_CONCURRENCY = 5;
// Edge Functions have a 150s wall-clock limit. RegioRadar Eindhoven alone
// lists ~1,750 events (vs. ~90 for Bezoek Meierijstad) — fetching all of
// them, even in parallel with the other sources, doesn't fit. Cap each
// source to its most recently-updated listings (sitemap <lastmod>) so
// runtime stays bounded regardless of how large a source's catalog grows.
const MAX_EVENTS_PER_SOURCE = 400;
const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; date-app-scraper/1.0)' };

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Amsterdam wall-clock "today", as an ISO date string. Source timestamps
// have no UTC offset (venue-local time), so date comparisons stay as plain
// string slices throughout — never routed through Date/toISOString, which
// would apply the runtime's own timezone offset and can silently shift the
// date, not just the displayed time.
function todayIsoString(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' });
  return fmt.format(new Date()); // en-CA gives YYYY-MM-DD
}

function addDaysToIsoString(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Best-effort duration guess from the title/description text — sources
// don't carry a structured duration field, and detection here is not
// reliable enough to trust fully, so this only ever nudges toward 'kort'
// or 'hele_dag' on strong keyword signals and otherwise defaults to
// 'halve_dag' (per the feature spec: don't rely on consistent detection).
function guessDuration(title: string, description: string | null): string {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (/hele dag|dagje uit|van ochtend tot avond|jaarmarkt|braderie/.test(text)) return 'hele_dag';
  if (/avondvoorstelling|lezing|rondleiding|borrel|quiz|filmvoorstelling|concert\b/.test(text)) return 'kort';
  return 'halve_dag';
}

// Same best-effort approach as guessDuration: the platform's own dataLayer
// `categories` tag turned out to be per-source and inconsistent for
// workshops (seen values include "workshop-2" and "varia" for what are
// clearly the same kind of event), so title/description keywords are the
// more reliable signal here despite being imperfect. Everything else stays
// 'Evenementen', the existing default.
function guessCategory(title: string, description: string | null): string {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (/workshop|cursus|masterclass|keramiek|pottenbak|kaarsen (maken|gieten)|sieraden maken|zilversmeden|schilder(en|cursus)|teken(en|cursus)|naaien|breien|\bhaken\b|houtbewerk|glasblazen|glas.?fusen|bloemschikken|boeket maken|zeep maken|bierbrouwen|parfum|kalligrafie|handlettering|knutsel/.test(text)) {
    return 'Creatief';
  }
  return 'Evenementen';
}

function extractEventJsonLd(html: string): any | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      const found = candidates.find((c: any) => c && c['@type'] === 'Event');
      if (found) return found;
    } catch {
      // malformed block, skip
    }
  }
  return null;
}

// Every page on this platform also pushes a GTM dataLayer event with a
// `categories` array (e.g. `{"categories":["film"],"city":"Eindhoven"}`),
// separate from the JSON-LD block. It's a much more reliable film-detection
// signal than title matching — titles range from "Filmtip: X" to bare movie
// names like "Jimpa" with nothing else distinguishing them from any other
// event title.
function extractPageCategories(html: string): string[] {
  const match = html.match(/dataLayer\.push\(\{"categories":(\[[^\]]*\])/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

function occurrenceDates(event: any, today: string, horizon: string) {
  const raw: string[] = [];
  if (Array.isArray(event.eventSchedule) && event.eventSchedule.length) {
    for (const s of event.eventSchedule) if (s.startDate) raw.push(s.startDate);
  } else if (event.startDate) {
    raw.push(event.startDate);
  }

  const seen = new Set<string>();
  const out: { date: string; time: string | null }[] = [];
  for (const iso of raw) {
    if (typeof iso !== 'string' || iso.length < 10) continue;
    const date = iso.slice(0, 10);
    if (date < today || date > horizon) continue;
    if (seen.has(date)) continue;
    seen.add(date);
    // "00:00" is this source's all-day sentinel (paired with a 23:59 end),
    // not a real start time — treat it as "no specific time".
    const rawTime = iso.length >= 16 ? iso.slice(11, 16) : null;
    out.push({ date, time: rawTime === '00:00' ? null : rawTime });
  }
  return out;
}

// The Supabase client's first query in a cold invocation intermittently
// fails with "JWT issued at future" (roughly 1 in 6 runs during testing,
// spread across different sources each time — looks like a clock-skew
// hiccup on Supabase's side, not anything specific to a given source).
// This matters for the unattended cron runs, which won't get a manual
// retry, so give the source lookup itself a couple of quick retries.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchEventUrls(sitemapIndexUrl: string): Promise<string[]> {
  const idxRes = await fetch(sitemapIndexUrl, { headers: REQUEST_HEADERS });
  const idxXml = await idxRes.text();
  const pageUrls = [...idxXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

  const pages = await mapWithConcurrency(pageUrls, FETCH_CONCURRENCY, async (url) => {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    const xml = await res.text();
    const entries: { url: string; lastmod: string }[] = [];
    for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const locMatch = block.match(/<loc>(.*?)<\/loc>/);
      if (!locMatch) continue;
      const lastmodMatch = block.match(/<lastmod>(.*?)<\/lastmod>/);
      entries.push({ url: locMatch[1], lastmod: lastmodMatch?.[1] ?? '' });
    }
    return entries;
  });

  // Newest-updated first, capped — see MAX_EVENTS_PER_SOURCE above.
  const all = pages.flat();
  all.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
  return all.slice(0, MAX_EVENTS_PER_SOURCE).map(e => e.url);
}

async function fetchOneSource(supabase: any, sourceConfig: { name: string; sitemapIndexUrl: string }, today: string, horizon: string) {
  const runStartedAt = new Date().toISOString();

  const source = await withRetry(async () => {
    const { data, error } = await supabase.from('sources').select('id').eq('name', sourceConfig.name).single();
    if (error || !data) throw new Error(`Source row missing for ${sourceConfig.name}: ${error?.message}`);
    return data;
  });

  const eventUrls = await fetchEventUrls(sourceConfig.sitemapIndexUrl);

  const rows = await mapWithConcurrency(eventUrls, FETCH_CONCURRENCY, async (url) => {
    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS });
      if (!res.ok) return [];
      const html = await res.text();
      const event = extractEventJsonLd(html);
      if (!event) return [];

      const geo = event.location?.geo;
      if (!geo?.latitude || !geo?.longitude) return [];

      const distance = haversineKm(BOERDONK, { lat: geo.latitude, lng: geo.longitude });
      if (distance > RADIUS_KM) return [];

      // Filter out film screenings entirely — "go watch a movie" isn't a
      // distinctive local activity suggestion, and this ranges from bare
      // cinema listings to filmhuis/arthouse programming with nothing in
      // the title alone to tell them apart from any other event.
      if (extractPageCategories(html).includes('film')) return [];

      const title = String(event.name ?? '').slice(0, 300);
      const description = event.description ?? null;
      const duration = guessDuration(title, description);
      const category = guessCategory(title, description);

      const occurrences = occurrenceDates(event, today, horizon);
      return occurrences.map((occ: { date: string; time: string | null }) => ({
        source_id: source.id,
        source_url: url,
        title,
        description,
        category,
        env: null,
        event_date: occ.date,
        event_time: occ.time,
        price: null,
        location_name: event.location?.address?.addressLocality ?? null,
        lat: geo.latitude,
        lng: geo.longitude,
        distance_km: Math.round(distance * 10) / 10,
        image_url: Array.isArray(event.image) ? event.image[0] : (event.image ?? null),
        duration,
        updated_at: runStartedAt,
      }));
    } catch {
      return []; // one bad event page shouldn't fail the whole run
    }
  });

  const flatRows = rows.flat();

  if (flatRows.length) {
    const { error: upsertErr } = await supabase
      .from('events')
      .upsert(flatRows, { onConflict: 'source_url,event_date' });
    if (upsertErr) throw new Error(`Upsert failed for ${sourceConfig.name}: ${upsertErr.message}`);
  }

  // Mark-and-sweep: drop future rows from this source that weren't seen
  // this run (cancelled/removed events), plus anything now in the past.
  await supabase.from('events').delete()
    .eq('source_id', source.id)
    .gte('event_date', today)
    .lt('updated_at', runStartedAt);
  await supabase.from('events').delete()
    .eq('source_id', source.id)
    .lt('event_date', today);

  await supabase.from('sources').update({
    last_fetched_at: runStartedAt,
    last_status: 'ok',
    last_error: null,
  }).eq('id', source.id);

  return { source: sourceConfig.name, eventUrls: eventUrls.length, occurrences: flatRows.length };
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const today = todayIsoString();
  const horizon = addDaysToIsoString(today, HORIZON_DAYS);

  // Sources run in parallel, not sequentially — Edge Functions have a wall-
  // clock execution limit (150s), and 3 sources run one after another
  // blew past it even though each individually fits comfortably.
  const results = await Promise.all(SOURCES.map(async (sourceConfig) => {
    try {
      return await fetchOneSource(supabase, sourceConfig, today, horizon);
    } catch (err) {
      await supabase.from('sources').update({
        last_fetched_at: new Date().toISOString(),
        last_status: 'error',
        last_error: String(err),
      }).eq('name', sourceConfig.name);
      return { source: sourceConfig.name, error: String(err) };
    }
  }));

  const ok = results.every(r => !('error' in r));
  return Response.json({ ok, results }, { status: ok ? 200 : 207 });
});
