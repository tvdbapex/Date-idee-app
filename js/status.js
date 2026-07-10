// Reads/writes favorite & done status from the Supabase `idea_status` table
// (see supabase/status.sql). No auth yet, so this is a single shared status
// per idea rather than per-user. No-ops if Supabase isn't configured.

async function fetchStatuses(){
  if(!isSupabaseConfigured()) return {};

  try {
    const { data, error } = await supabaseClient.from('idea_status').select('*');
    if(error) throw error;

    const byIdeaId = {};
    data.forEach(row => {
      byIdeaId[row.idea_id] = { starred: row.starred, done: row.done };
    });
    return byIdeaId;
  } catch(err){
    console.warn('Kon favoriet/gedaan-status niet ophalen uit Supabase.', err);
    return {};
  }
}

async function saveStatus(ideaId, { starred, done }){
  if(!isSupabaseConfigured()) return;

  const { error } = await supabaseClient
    .from('idea_status')
    .upsert({ idea_id: ideaId, starred, done, updated_at: new Date().toISOString() });

  if(error){
    console.warn('Kon status niet opslaan in Supabase.', error);
    throw error;
  }
}
