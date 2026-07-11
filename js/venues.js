// Reads fixed venues (restaurants, karting, escape rooms, etc.) from the
// Supabase `venues` table (populated by supabase/functions/fetch-venues —
// see supabase/venues_schema.sql). Returns [] if Supabase isn't configured
// or the table doesn't exist yet.
//
// Venues are always-available (days: 'alle'), same as recurring date_ideas,
// since they're not tied to a calendar date the way scraped events are.

async function fetchVenues(){
  if(!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabaseClient.from('venues').select('*').order('distance_km');
    if(error) throw error;

    return data.map(row => ({
      id: `venue-${row.id}`,
      title: row.title,
      category: row.category,
      env: row.env,
      days: 'alle',
      price: null,
      distance: row.distance_km != null ? `${row.distance_km} km` : '',
      desc: row.description || `${row.category} in de buurt.`,
      isEvent: false,
      rating: row.rating,
      sourceUrl: row.url,
    }));
  } catch(err){
    console.warn('Kon locaties niet ophalen uit Supabase.', err);
    return [];
  }
}
