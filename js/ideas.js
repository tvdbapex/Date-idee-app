// Reads date ideas from the Supabase `date_ideas` table (see supabase/schema.sql
// and supabase/seed.sql). Returns [] if Supabase isn't configured or the
// request fails — no placeholder fallback, since fake ideas mixed in with
// real scraped events/venues would be misleading.

async function fetchIdeas(){
  if(!isSupabaseConfigured()){
    console.warn('Supabase nog niet geconfigureerd (js/config.js).');
    return [];
  }

  try {
    const { data, error } = await supabaseClient.from('date_ideas').select('*').order('id');
    if(error) throw error;

    return data.map(row => ({
      id: `idea-${row.id}`,
      title: row.title,
      category: row.category,
      env: row.env,
      days: row.days && row.days.length ? row.days : 'alle',
      price: row.price,
      distance: row.distance_km != null ? `${row.distance_km} km` : '',
      desc: row.description,
      isEvent: row.is_event,
    }));
  } catch(err){
    console.warn('Kon ideeën niet ophalen uit Supabase.', err);
    return [];
  }
}
