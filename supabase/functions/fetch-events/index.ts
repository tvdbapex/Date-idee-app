// Supabase Edge Function: scrapes Bezoek Meierijstad's agenda (kernregio,
// 0-15km) and upserts upcoming events into the `events` table.
//
// Source: https://www.bezoekmeierijstad.nl/agenda — every event page embeds
// schema.org/Event JSON-LD (name, description, eventSchedule, geo), which is
// what's parsed here rather than fragile HTML/CSS scraping.
//
// Drimble (the other kernregio source from the briefing) is intentionally
// NOT scraped: its robots.txt has `User-agent: anthropic-ai / Disallow: /`,
// an explicit opt-out from the site operator.
//
// Deploy via the Supabase dashboard (Edge Functions -> New function ->
// "fetch-events" -> paste this file) with "Verify JWT" turned OFF, since
// this is invoked by pg_cron, not by an end user. It uses the
// SUPABASE_SERVICE_ROLE_KEY that Supabase injects automatically at runtime
// to bypass RLS for writes — `events`/`sources` have no public write policy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SOURCE_NAME = 'Bezoek Meierijstad';
const SITEMAP_INDEX_URL = 'https://www.bezoekmeierijstad.nl/sitemap/event.xml?_locale=nl';
const BOERDONK = { lat: 51.5595751, lng: 5.6263531 };
const RADIUS_KM = 35;
const HORIZON_DAYS = 60;
const FETCH_CONCURRENCY = 6;
const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; date-app-scraper/1.0)' };

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Amsterdam wall-clock "today", as an ISO date string. The source's
// timestamps have no UTC offset (venue-local time), so date comparisons
// stay as plain string slices throughout — never routed through
// Date/toISOString, which would apply the runtime's own timezone offset
// and can silently shift the date, not just the displayed time.
function todayIsoString(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' });
  return fmt.format(new Date()); // en-CA gives YYYY-MM-DD
}

function addDaysToIsoString(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractEventJsonLd(html: string): any | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
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

async function fetchEventUrls(): Promise<string[]> {
  const idxRes = await fetch(SITEMAP_INDEX_URL, { headers: REQUEST_HEADERS });
  const idxXml = await idxRes.text();
  const pageUrls = [...idxXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

  const pages = await mapWithConcurrency(pageUrls, FETCH_CONCURRENCY, async (url) => {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    const xml = await res.text();
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  });
  return pages.flat();
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const runStartedAt = new Date().toISOString();
  const today = todayIsoString();
  const horizon = addDaysToIsoString(today, HORIZON_DAYS);

  try {
    const { data: source, error: sourceErr } = await supabase
      .from('sources')
      .select('id')
      .eq('name', SOURCE_NAME)
      .single();
    if (sourceErr || !source) throw new Error(`Source row missing: ${sourceErr?.message}`);

    const eventUrls = await fetchEventUrls();

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

        const occurrences = occurrenceDates(event, today, horizon);
        return occurrences.map(occ => ({
          source_id: source.id,
          source_url: url,
          title: String(event.name ?? '').slice(0, 300),
          description: event.description ?? null,
          category: 'Evenementen',
          env: null,
          event_date: occ.date,
          event_time: occ.time,
          price: null,
          location_name: event.location?.address?.addressLocality ?? null,
          lat: geo.latitude,
          lng: geo.longitude,
          distance_km: Math.round(distance * 10) / 10,
          image_url: Array.isArray(event.image) ? event.image[0] : (event.image ?? null),
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
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
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

    return Response.json({ ok: true, eventUrls: eventUrls.length, occurrences: flatRows.length });
  } catch (err) {
    await supabase.from('sources').update({
      last_fetched_at: runStartedAt,
      last_status: 'error',
      last_error: String(err),
    }).eq('name', SOURCE_NAME);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
