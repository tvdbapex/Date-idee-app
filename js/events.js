// Reads scraped events from the Supabase `events` table (populated daily by
// supabase/functions/fetch-events — see supabase/events_schema.sql). Returns
// [] if Supabase isn't configured or the table doesn't exist yet; unlike
// ideas/weather there's no placeholder fallback, since fake events aren't
// useful here.
//
// Each row becomes a card shaped like a date_ideas card so it can share all
// the existing filter/sort/render logic, with `isDated: true` and
// `days: [event_date]` (an exact calendar date, not a recurring weekday
// code) so js/app.js's cardDayList() resolves it against the real forecast
// date rather than matching every week.

async function fetchEvents(){
  if(!isSupabaseConfigured()) return [];

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseClient
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date');
    if(error) throw error;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return data.map(row => ({
      id: `event-${row.id}`,
      title: row.title,
      category: row.category,
      env: row.env,
      isDated: true,
      days: [row.event_date],
      time: row.event_time,
      price: row.price,
      distance: row.distance_km != null ? `${row.distance_km} km` : '',
      desc: row.description,
      isEvent: true,
      sourceUrl: row.source_url,
      duration: row.duration,
      // created_at is only set once, at first insert — the fetch-events
      // upsert never overwrites it on repeat runs — so this is a genuine
      // "first seen" timestamp, not a last-updated one.
      isNew: new Date(row.created_at).getTime() > sevenDaysAgo,
    }));
  } catch(err){
    console.warn('Kon evenementen niet ophalen uit Supabase.', err);
    return [];
  }
}
