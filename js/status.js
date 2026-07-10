// Reads/writes favorite & done status from the Supabase `idea_status` table
// (see supabase/status_v2.sql). Keyed by a plain text card_id shared by both
// curated ideas ('idea-<id>') and scraped events ('event-<id>'), so status
// persists for either. No auth yet, so this is a single shared status per
// card rather than per-user. No-ops if Supabase isn't configured.

async function fetchStatuses(){
  if(!isSupabaseConfigured()) return {};

  try {
    const { data, error } = await supabaseClient.from('idea_status').select('*');
    if(error) throw error;

    const byCardId = {};
    data.forEach(row => {
      byCardId[row.card_id] = { starred: row.starred, done: row.done };
    });
    return byCardId;
  } catch(err){
    console.warn('Kon favoriet/gedaan-status niet ophalen uit Supabase.', err);
    return {};
  }
}

async function saveStatus(cardId, { starred, done }){
  if(!isSupabaseConfigured()) return;

  const { error } = await supabaseClient
    .from('idea_status')
    .upsert({ card_id: cardId, starred, done, updated_at: new Date().toISOString() });

  if(error){
    console.warn('Kon status niet opslaan in Supabase.', error);
    throw error;
  }
}
