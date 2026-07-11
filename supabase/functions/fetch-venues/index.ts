// Supabase Edge Function: discovers fixed "fun things to do" venues within
// 35km of Boerdonk — as opposed to fetch-events, which handles calendar-
// dated events. Two independent sources, both written into `venues`:
//
// 1. OpenStreetMap Overpass API — free, no key, structured tags. Used for
//    activity categories that are well-tagged in OSM: karting, escape
//    rooms, climbing, mini-golf, bowling, trampoline parks, arcades, darts,
//    archery. No rating data. Axe throwing was checked and has no OSM
//    coverage near Boerdonk as of writing — add it manually if you know one.
//
// 2. uiteindhoven.com — WordPress site with schema.org LocalBusiness-family
//    JSON-LD (Restaurant/BarOrPub/NightClub), including review ratings.
//    Restaurant-tagged listings specifically have poor geo-coverage on this
//    site (~1 in 5 have coordinates; the rest have no address data at all,
//    and don't resolve via name-based geocoding either) — those are
//    skipped rather than guessed at. Nightlife/bar listings are far more
//    complete.
//
// Deploy via the Supabase dashboard with "Verify JWT" turned OFF (invoked
// by pg_cron). Uses SUPABASE_SERVICE_ROLE_KEY (auto-injected) to bypass RLS
// for writes — `venues`/`sources` have no public write policy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOERDONK = { lat: 51.5595751, lng: 5.6263531 };
const RADIUS_KM = 35;
// Used both for fetching venue pages and for the per-row upsert loop (see
// upsertVenues) — the latter got much heavier once bulk upserts were
// replaced with ~500 individual calls, and 15 combined with retries hit
// WORKER_RESOURCE_LIMIT. 8 keeps concurrent load lower.
const FETCH_CONCURRENCY = 8;
const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; date-app-scraper/1.0)' };

// Supabase's client intermittently fails an early query with "JWT issued
// at future" (seen on both fetch-events and here, on different calls each
// time — looks like a clock-skew hiccup on Supabase's side). Matters most
// for the unattended cron run, which won't get a manual retry.
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

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
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

// ---------- OpenStreetMap Overpass ----------

const OSM_QUERIES: { match: string; category: string; env: 'indoor' | 'outdoor' }[] = [
  { match: `nwr["leisure"="track"]["sport"~"karting|motor"]`, category: 'Actief', env: 'outdoor' },
  { match: `nwr["leisure"="escape_game"]`, category: 'Verrassend', env: 'indoor' },
  { match: `nwr["sport"="climbing"]`, category: 'Actief', env: 'indoor' },
  { match: `nwr["leisure"="miniature_golf"]`, category: 'Actief', env: 'outdoor' },
  { match: `nwr["leisure"="bowling_alley"]`, category: 'Actief', env: 'indoor' },
  { match: `nwr["leisure"="trampoline_park"]`, category: 'Actief', env: 'indoor' },
  { match: `nwr["leisure"="amusement_arcade"]`, category: 'Verrassend', env: 'indoor' },
  { match: `nwr["sport"="darts"]`, category: 'Verrassend', env: 'indoor' },
  { match: `nwr["sport"="archery"]`, category: 'Actief', env: 'outdoor' },
];

// overpass-api.de (the "official" instance) returned 406 for every request
// tried while building this — including a bare GET to /api/status, from
// both this function's own deployment and an unrelated network, suggesting
// it's blocking broadly rather than something fixable via headers. Try it
// first anyway (it may recover), then fall back to a mirror confirmed
// working during testing.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchOsmVenues(): Promise<any[]> {
  const clauses = OSM_QUERIES.map(q => `${q.match}(around:${RADIUS_KM * 1000},${BOERDONK.lat},${BOERDONK.lng});`).join('\n');
  const query = `[out:json][timeout:50];\n(\n${clauses}\n);\nout center tags;`;

  let res: Response | undefined;
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const attempt = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': '*/*', 'User-Agent': REQUEST_HEADERS['User-Agent'] },
        body: 'data=' + encodeURIComponent(query),
      });
      if (attempt.ok) { res = attempt; break; }
      lastErr = new Error(`${endpoint} gave status ${attempt.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  if (!res) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  const data = await res.json();

  const rows: any[] = [];
  for (const el of data.elements ?? []) {
    const name = el.tags?.name;
    if (!name) continue;

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;

    const distance = haversineKm(BOERDONK, { lat, lng });
    if (distance > RADIUS_KM) continue;

    const tagKey = el.tags?.leisure || el.tags?.sport;
    const mapping = OSM_QUERIES.find(q => q.match.includes(`"${tagKey}"`));

    rows.push({
      source: 'osm',
      source_ref: `${el.type}/${el.id}`,
      title: name,
      category: mapping?.category ?? 'Actief',
      env: mapping?.env ?? null,
      description: null,
      location_name: el.tags?.['addr:city'] ?? null,
      lat,
      lng,
      distance_km: Math.round(distance * 10) / 10,
      rating: null,
      url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      image_url: null,
    });
  }
  return rows;
}

// ---------- uiteindhoven.com ----------

const UITEINDHOVEN_SITEMAPS = [
  'https://uiteindhoven.com/restaurant-sitemap.xml',
  'https://uiteindhoven.com/uitgaanszaak-sitemap.xml',
];

const UITEINDHOVEN_TYPES: Record<string, { category: string; env: 'indoor' | 'outdoor' }> = {
  Restaurant: { category: 'Eten & drinken', env: 'indoor' },
  FoodEstablishment: { category: 'Eten & drinken', env: 'indoor' },
  CafeOrCoffeeShop: { category: 'Eten & drinken', env: 'indoor' },
  BarOrPub: { category: 'Eten & drinken', env: 'indoor' },
  NightClub: { category: 'Verrassend', env: 'indoor' },
};

function extractSchemaNodes(html: string): any[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const nodes: any[] = [];
  for (const [, raw] of blocks) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed['@graph'])) nodes.push(...parsed['@graph']);
      else nodes.push(parsed);
    } catch {
      // malformed block, skip
    }
  }
  return nodes;
}

async function fetchUiteindhovenVenueUrls(): Promise<string[]> {
  const lists = await Promise.all(UITEINDHOVEN_SITEMAPS.map(async (sm) => {
    const xml = await fetch(sm, { headers: REQUEST_HEADERS }).then(r => r.text());
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  }));
  const urls = lists.flat().filter(u => !u.endsWith('/uiteten/') && !u.endsWith('/uitgaan/'));
  return [...new Set(urls)];
}

async function fetchUiteindhovenVenues(): Promise<any[]> {
  const urls = await fetchUiteindhovenVenueUrls();

  const rows = await mapWithConcurrency(urls, FETCH_CONCURRENCY, async (url) => {
    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS });
      if (!res.ok) return null;
      const html = await res.text();
      const nodes = extractSchemaNodes(html);
      const place = nodes.find((n: any) => n.geo && UITEINDHOVEN_TYPES[n['@type']]);
      if (!place) return null;

      const distance = haversineKm(BOERDONK, { lat: place.geo.latitude, lng: place.geo.longitude });
      if (distance > RADIUS_KM) return null;

      const mapping = UITEINDHOVEN_TYPES[place['@type']];
      const rv = place.review?.reviewRating;
      const rating = rv?.ratingValue != null
        ? Math.round((Number(rv.ratingValue) / Number(rv.bestRating || 5)) * 5 * 10) / 10
        : null;

      return {
        source: 'uiteindhoven',
        source_ref: res.url, // resolved (post-redirect) URL
        title: String(place.name ?? '').slice(0, 300),
        category: mapping.category,
        env: mapping.env,
        description: place.review?.reviewBody ?? null,
        location_name: place.address?.addressLocality ?? null,
        lat: place.geo.latitude,
        lng: place.geo.longitude,
        distance_km: Math.round(distance * 10) / 10,
        rating,
        url: res.url,
        image_url: place.image ?? null,
      };
    } catch {
      return null; // one bad page shouldn't fail the whole run
    }
  });

  // restaurant-sitemap.xml and uitgaanszaak-sitemap.xml both list some of
  // the same venues (redirecting to the same final URL) — a single upsert
  // batch can't contain two rows with the same conflict target, so
  // deduplicate by source_ref before returning.
  const bySourceRef = new Map<string, NonNullable<(typeof rows)[number]>>();
  for (const r of rows) if (r) bySourceRef.set(r.source_ref, r);
  return [...bySourceRef.values()];
}

// ---------- Main ----------

// `sourceName` identifies the row in the `sources` table (for status
// reporting); `sourceKey` is the value stored in venues.source ('osm' |
// 'uiteindhoven') — venues has no source_id FK, unlike events.
async function upsertVenues(supabase: any, sourceName: string, sourceKey: string, rows: any[]) {
  const runStartedAt = new Date().toISOString();

  const withMeta = rows.map(r => ({ ...r, updated_at: runStartedAt }));

  // One upsert call per row instead of a single bulk upsert: a bulk upsert
  // fails outright if any two rows in the batch share a conflict target
  // (Postgres: "ON CONFLICT DO UPDATE command cannot affect row a second
  // time"), which kept happening here despite de-duplicating source_ref
  // beforehand — per-row upserts can never conflict with themselves, so
  // this sidesteps the problem regardless of its exact cause.
  const upsertErrors: string[] = [];
  await mapWithConcurrency(withMeta, FETCH_CONCURRENCY, async (row) => {
    try {
      await withRetry(async () => {
        const { error } = await supabase.from('venues').upsert(row, { onConflict: 'source,source_ref' });
        if (error) throw new Error(error.message);
      });
    } catch (err) {
      upsertErrors.push(`${row.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  if (upsertErrors.length) throw new Error(`Upsert failed for ${sourceName} (${upsertErrors.length} rows): ${upsertErrors[0]}`);

  // Mark-and-sweep: drop rows from this source not touched this run.
  await supabase.from('venues').delete()
    .eq('source', sourceKey)
    .lt('updated_at', runStartedAt);

  await supabase.from('sources').update({
    last_fetched_at: runStartedAt,
    last_status: 'ok',
    last_error: null,
  }).eq('name', sourceName);

  return { source: sourceName, venues: withMeta.length };
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Both sources run in parallel — Edge Functions have a wall-clock
  // execution limit (150s), and uiteindhoven.com alone is ~550 page
  // fetches, so running it after OSM sequentially risks blowing past it.
  const results = await Promise.all([
    (async () => {
      try {
        const osmRows = await fetchOsmVenues();
        return await upsertVenues(supabase, 'OpenStreetMap Overpass', 'osm', osmRows);
      } catch (err) {
        await supabase.from('sources').update({
          last_fetched_at: new Date().toISOString(), last_status: 'error', last_error: String(err),
        }).eq('name', 'OpenStreetMap Overpass');
        return { source: 'OpenStreetMap Overpass', error: String(err) };
      }
    })(),
    (async () => {
      try {
        const uieRows = await fetchUiteindhovenVenues();
        return await upsertVenues(supabase, 'UitEindhoven Venues', 'uiteindhoven', uieRows);
      } catch (err) {
        await supabase.from('sources').update({
          last_fetched_at: new Date().toISOString(), last_status: 'error', last_error: String(err),
        }).eq('name', 'UitEindhoven Venues');
        return { source: 'UitEindhoven Venues', error: String(err) };
      }
    })(),
  ]);

  const ok = results.every(r => !('error' in r));
  return Response.json({ ok, results }, { status: ok ? 200 : 207 });
});
