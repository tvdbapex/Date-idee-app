// ---------- State ----------
let week = []; // populated by fetchWeek() in js/weather.js on init
let ideas = []; // populated by fetchIdeas() in js/ideas.js on init
const state = {
  selectedDays: new Set(),
  category: 'Alle',
  weather: 'Alles',
  duration: 'Alles',
  search: '',
  starred: new Set(),
  done: new Set(),
  ratings: new Map(), // cardId -> 1-5, the user's own rating after marking "gedaan" (distinct from card.rating, which is an external review score)
  quickPickExcluded: new Map(), // category -> Set<cardId>, built up via "ander voorstel"
  quickPickCurrent: new Map(), // category -> card | null, cached so re-renders (star/done clicks etc.) don't reshuffle
  programma: [], // cardIds in order, feature 6 — client-side only for v1, no DB backing
};

// ---------- Icons ----------
function weatherIcon(condition){
  if(condition === 'sun'){
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#E8A33D"/><g stroke="#E8A33D" stroke-width="1.6" stroke-linecap="round"><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.5" y2="4.5"/></g></svg>';
  }
  if(condition === 'rain'){
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 12a4.5 4.5 0 0 1 1-8.9A6 6 0 0 1 18.6 6.6 4 4 0 0 1 18 14.5H7A4.5 4.5 0 0 1 6 12Z" fill="#DEE9EE" stroke="#4C7A93" stroke-width="1.3"/><g stroke="#4C7A93" stroke-width="1.6" stroke-linecap="round"><line x1="8" y1="17" x2="7" y2="20"/><line x1="12" y1="17" x2="11" y2="20"/><line x1="16" y1="17" x2="15" y2="20"/></g></svg>';
  }
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 13a4.5 4.5 0 0 1 1-8.9A6 6 0 0 1 18.6 7.6 4 4 0 0 1 18 15.5H7A4.5 4.5 0 0 1 6 13Z" fill="#EDEFE6" stroke="#6B7568" stroke-width="1.3"/></svg>';
}

// ---------- Render: week strip ----------
const weekstripEl = document.getElementById('weekstrip');
function renderWeekstrip(){
  weekstripEl.innerHTML = '';
  week.forEach(d => {
    const on = state.selectedDays.has(d.code);
    const chip = document.createElement('button');
    chip.className = `day-chip ${d.condition} ${on ? 'on' : 'off'}`;
    chip.setAttribute('type','button');
    chip.setAttribute('aria-pressed', on);
    chip.innerHTML = `
      <span class="day-name">${d.label}</span>
      ${weatherIcon(d.condition)}
      <span class="day-temp">${d.temp}°</span>
      <span class="day-date">${d.date}</span>
    `;
    chip.addEventListener('click', () => {
      if(state.selectedDays.has(d.code)){
        state.selectedDays.delete(d.code);
      } else {
        state.selectedDays.add(d.code);
      }
      renderWeekstrip();
      renderCards();
      resetQuickPicks();
    });
    weekstripEl.appendChild(chip);
  });
}

// ---------- Render: filter pills ----------
function renderPillGroup(container, options, current, onSelect){
  container.innerHTML = '';
  options.forEach(opt => {
    const pill = document.createElement('button');
    pill.className = `pill ${opt === current ? 'active' : ''}`;
    pill.type = 'button';
    pill.textContent = opt;
    pill.addEventListener('click', () => onSelect(opt));
    container.appendChild(pill);
  });
}

const categoryEl = document.getElementById('categoryFilters');
const weatherEl = document.getElementById('weatherFilters');
const durationEl = document.getElementById('durationFilters');
function renderFilters(){
  renderPillGroup(categoryEl, categories, state.category, (opt) => {
    state.category = opt; renderFilters(); renderCards();
  });
  renderPillGroup(weatherEl, weatherFilters, state.weather, (opt) => {
    state.weather = opt; renderFilters(); renderCards();
  });
  renderPillGroup(durationEl, durationFilters, state.duration, (opt) => {
    state.duration = opt; renderFilters(); renderCards();
  });
}

// ---------- Search ----------
const searchEl = document.getElementById('searchInput');
searchEl.addEventListener('input', () => {
  state.search = searchEl.value.trim().toLowerCase();
  renderCards();
});

// ---------- Matching logic ----------
function cardDayList(card){
  if(card.days === 'alle') return week.map(d => d.code);
  // Scraped events carry exact calendar dates (card.isDated), not recurring
  // weekday codes — resolve them against this week's actual dates instead
  // of matching every week on the same weekday.
  if(card.isDated) return week.filter(d => card.days.includes(d.iso)).map(d => d.code);
  return card.days;
}

function weatherMatchForCard(card){
  if(!card.env) return null; // scraped events without a known indoor/outdoor
  const relevantDays = cardDayList(card).filter(code => state.selectedDays.has(code));
  for(const code of relevantDays){
    const day = week.find(d => d.code === code);
    if(card.env === 'outdoor' && day.condition === 'sun'){
      return { label: `Mooi bij zon op ${day.label}`, type: 'sun' };
    }
    if(card.env === 'indoor' && day.condition === 'rain'){
      return { label: `Fijn bij regen op ${day.label}`, type: 'rain' };
    }
  }
  return null;
}

// Meteorological seasons (NL): winter = dec/jan/feb, lente = mrt-mei,
// zomer = jun-aug, herfst = sep-nov. `maand` is JS Date's 0-11.
function bepaalSeizoen(maand){
  if(maand === 11 || maand <= 1) return 'winter';
  if(maand <= 4) return 'lente';
  if(maand <= 7) return 'zomer';
  return 'herfst';
}

function isSeizoensgeschikt(card){
  if(!card.bestSeasons || card.bestSeasons.length === 0) return true; // geen seizoen ingesteld = hele jaar geschikt
  return card.bestSeasons.includes(bepaalSeizoen(new Date().getMonth()));
}

function matchScore(card){
  const match = weatherMatchForCard(card);
  let score = (card.isEvent ? 2 : 0) + (match ? 1 : 0);
  // Zachte penalty, geen harde uitsluiting — een zomerterras in oktober
  // mag nog steeds getoond worden, alleen lager in de sortering.
  if(!isSeizoensgeschikt(card)) score -= 2;
  return score;
}

// ---------- Quick picks (one uitgelichte kaart per categorie) ----------
function kiesBesteVoorCategorie(categorie, excludedIds){
  const kandidaten = ideas.filter(item =>
    item.category === categorie &&
    cardDayList(item).some(code => state.selectedDays.has(code)) &&
    !excludedIds.has(item.id)
  );
  if(kandidaten.length === 0) return null;

  const gescoord = kandidaten.map(item => ({ item, score: matchScore(item) }));
  gescoord.sort((a, b) => b.score - a.score);
  // Random tussen de top 3 i.p.v. altijd nummer 1, anders is "ander
  // voorstel" niet zinvol.
  const top = gescoord.slice(0, 3);
  return top[Math.floor(Math.random() * top.length)].item;
}

const quickPicksEl = document.getElementById('quickPicks');
function renderQuickPicks(){
  quickPicksEl.innerHTML = '';
  categories.filter(c => c !== 'Alle').forEach(cat => {
    if(!state.quickPickExcluded.has(cat)) state.quickPickExcluded.set(cat, new Set());
    if(!state.quickPickCurrent.has(cat)){
      state.quickPickCurrent.set(cat, kiesBesteVoorCategorie(cat, state.quickPickExcluded.get(cat)));
    }
    const card = state.quickPickCurrent.get(cat);

    const el = document.createElement('div');
    el.className = 'quick-pick-card';

    if(!card){
      el.innerHTML = `<span class="quick-pick-cat">${cat}</span><p class="quick-pick-empty">Geen match voor deze dagen</p>`;
      quickPicksEl.appendChild(el);
      return;
    }

    const match = weatherMatchForCard(card);
    el.innerHTML = `
      <span class="quick-pick-cat">${cat}</span>
      <h4 class="quick-pick-title">${card.title}</h4>
      ${match ? `<span class="tag weather-match ${match.type === 'rain' ? 'rain-match' : ''}">${match.label}</span>` : ''}
      <button type="button" class="quick-pick-shuffle">Ander voorstel</button>
    `;
    el.querySelector('.quick-pick-shuffle').addEventListener('click', () => {
      state.quickPickExcluded.get(cat).add(card.id);
      state.quickPickCurrent.delete(cat);
      renderQuickPicks();
    });
    quickPicksEl.appendChild(el);
  });
}

function resetQuickPicks(){
  state.quickPickExcluded.clear();
  state.quickPickCurrent.clear();
  renderQuickPicks();
}

// ---------- Programma (twee kaarten combineren tot een avondje) ----------
// Client-side only for v1, per spec — no plans/plan_items tables yet. Add
// those only if it turns out programma's need to survive a page reload.
const DURATION_HOURS = { kort: 2, halve_dag: 4, hele_dag: 8 };
const programmaToggleEl = document.getElementById('programmaToggle');
const programmaPanelEl = document.getElementById('programmaPanel');
const programmaListEl = document.getElementById('programmaList');
const programmaTotalEl = document.getElementById('programmaTotal');
const programmaCloseBtn = document.getElementById('programmaCloseBtn');

function isInProgramma(cardId){
  return state.programma.includes(cardId);
}

function toggleProgramma(card){
  const idx = state.programma.indexOf(card.id);
  if(idx === -1) state.programma.push(card.id);
  else state.programma.splice(idx, 1);
  renderCards();
  renderProgramma();
}

function renderProgramma(){
  const items = state.programma.map(id => ideas.find(i => i.id === id)).filter(Boolean);

  programmaToggleEl.textContent = items.length ? `Programma (${items.length})` : 'Programma';

  programmaListEl.innerHTML = '';
  if(items.length === 0){
    programmaListEl.innerHTML = '<p class="programma-empty">Nog niets toegevoegd. Klik op "+ Programma" bij een kaart.</p>';
  } else {
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'programma-item';
      row.innerHTML = `
        <span class="programma-item-title">${item.title}</span>
        ${item.duration ? `<span class="tag">${DURATION_LABELS[item.duration]}</span>` : ''}
        <button type="button" class="programma-remove" aria-label="Verwijder ${item.title} uit programma">×</button>
      `;
      row.querySelector('.programma-remove').addEventListener('click', () => toggleProgramma(item));
      programmaListEl.appendChild(row);
    });
  }

  const totalHours = items.reduce((sum, item) => sum + (DURATION_HOURS[item.duration] || 0), 0);
  programmaTotalEl.textContent = items.length
    ? `~${totalHours}u totaal (${items.length} ${items.length === 1 ? 'onderdeel' : 'onderdelen'})`
    : '';
}

programmaToggleEl.addEventListener('click', () => {
  programmaPanelEl.classList.toggle('open');
});
programmaCloseBtn.addEventListener('click', () => {
  programmaPanelEl.classList.remove('open');
});

// ---------- Verrassingsknop (feature 2) ----------
function verrasMe(){
  const kandidaten = ideas.filter(item => cardDayList(item).some(code => state.selectedDays.has(code)));
  if(kandidaten.length === 0) return null;
  return kandidaten[Math.floor(Math.random() * kandidaten.length)];
}

const surpriseBtn = document.getElementById('surpriseBtn');
const surpriseModalEl = document.getElementById('surpriseModal');
const surpriseModalContentEl = document.getElementById('surpriseModalContent');
const surpriseCloseBtn = document.getElementById('surpriseCloseBtn');
const surpriseAgainBtn = document.getElementById('surpriseAgainBtn');

function openSurpriseModal(){
  const card = verrasMe();
  surpriseModalContentEl.innerHTML = '';
  if(!card){
    surpriseModalContentEl.innerHTML = '<p class="empty-state">Geen ideeën gevonden voor de gekozen dagen.</p>';
  } else {
    surpriseModalContentEl.appendChild(createCardElement(card));
  }
  surpriseModalEl.hidden = false;
}

function closeSurpriseModal(){
  surpriseModalEl.hidden = true;
}

surpriseBtn.addEventListener('click', openSurpriseModal);
surpriseAgainBtn.addEventListener('click', openSurpriseModal);
surpriseCloseBtn.addEventListener('click', closeSurpriseModal);
surpriseModalEl.addEventListener('click', (e) => {
  if(e.target === surpriseModalEl) closeSurpriseModal();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !surpriseModalEl.hidden) closeSurpriseModal();
});

// ---------- Status (favorite / done / rating) ----------
async function toggleStatus(card, kind){
  const set = kind === 'starred' ? state.starred : state.done;
  const wasOn = set.has(card.id);
  wasOn ? set.delete(card.id) : set.add(card.id);
  renderCards();

  try {
    await saveStatus(card.id, {
      starred: state.starred.has(card.id),
      done: state.done.has(card.id),
      rating: state.ratings.get(card.id) ?? null,
    });
  } catch(err){
    wasOn ? set.add(card.id) : set.delete(card.id);
    renderCards();
  }
}

async function setUserRating(card, rating){
  const prevRating = state.ratings.get(card.id);
  state.ratings.set(card.id, rating);
  renderCards();

  try {
    await saveStatus(card.id, {
      starred: state.starred.has(card.id),
      done: state.done.has(card.id),
      rating,
    });
  } catch(err){
    prevRating === undefined ? state.ratings.delete(card.id) : state.ratings.set(card.id, prevRating);
    renderCards();
  }
}

// ---------- Render: cards ----------
const gridEl = document.getElementById('cardGrid');
const countEl = document.getElementById('resultCount');

// Shared between the main grid and the surprise-me modal (feature 2) — both
// show a card in exactly the same shape.
function createCardElement(card){
  const match = weatherMatchForCard(card);
  const starred = state.starred.has(card.id);
  const done = state.done.has(card.id);
  const userRating = state.ratings.get(card.id);

  const el = document.createElement('div');
  el.className = `card ${card.isEvent ? 'is-event' : ''} ${card.sourceUrl ? 'clickable' : ''}`;
  if(card.sourceUrl){
    el.tabIndex = 0;
    el.setAttribute('role', 'link');
  }
  el.innerHTML = `
    <div class="card-top">
      <span class="card-category">${card.category}</span>
    </div>
    <h3 class="card-title">${card.title}</h3>
    <p class="card-desc">${card.desc}</p>
    <div class="card-meta">
      ${card.env ? `<span class="tag">${card.env === 'indoor' ? 'Binnen' : 'Buiten'}</span>` : ''}
      ${card.time ? `<span class="tag">${card.time}</span>` : ''}
      ${card.price ? `<span class="tag">${card.price}</span>` : ''}
      ${card.distance ? `<span class="tag">${card.distance}</span>` : ''}
      ${card.duration ? `<span class="tag">${DURATION_LABELS[card.duration]}</span>` : ''}
      ${card.rating ? `<span class="tag">★ ${card.rating.toFixed(1)}</span>` : ''}
      ${card.isEvent ? '<span class="tag event-tag">Evenement</span>' : ''}
      ${card.isNew ? '<span class="tag new-tag">Nieuw</span>' : ''}
      ${match ? `<span class="tag weather-match ${match.type === 'rain' ? 'rain-match' : ''}">${match.label}</span>` : ''}
    </div>
    <div class="card-actions">
      <button type="button" class="icon-btn star-btn ${starred ? 'starred' : ''}">${starred ? '★ Favoriet' : '☆ Favoriet'}</button>
      <button type="button" class="icon-btn done-btn ${done ? 'done' : ''}">${done ? '✓ Gedaan' : 'Markeer gedaan'}</button>
      <button type="button" class="icon-btn plan-btn ${isInProgramma(card.id) ? 'in-programma' : ''}">${isInProgramma(card.id) ? '✓ In programma' : '+ Programma'}</button>
    </div>
    ${done ? `
      <div class="rating-stars" role="group" aria-label="Hoe was het?">
        <span class="rating-label">Hoe was het?</span>
        ${[1,2,3,4,5].map(n => `<button type="button" class="star-pick ${userRating >= n ? 'on' : ''}" data-rating="${n}" aria-label="${n} ster${n > 1 ? 'ren' : ''}">★</button>`).join('')}
      </div>
    ` : ''}
    ${card.sourceUrl ? `<a class="source-link" href="${card.sourceUrl}" target="_blank" rel="noopener">Bekijk op ${new URL(card.sourceUrl).hostname.replace(/^www\./,'')} →</a>` : ''}
  `;

  el.querySelector('.star-btn').addEventListener('click', () => toggleStatus(card, 'starred'));
  el.querySelector('.done-btn').addEventListener('click', () => toggleStatus(card, 'done'));
  el.querySelector('.plan-btn').addEventListener('click', () => toggleProgramma(card));
  el.querySelectorAll('.star-pick').forEach(btn => {
    btn.addEventListener('click', () => setUserRating(card, Number(btn.dataset.rating)));
  });

  if(card.sourceUrl){
    const openSource = () => window.open(card.sourceUrl, '_blank', 'noopener');
    el.addEventListener('click', (e) => {
      // The card-actions buttons and the source-link itself already handle
      // their own click — don't also trigger the whole-card navigation.
      if(e.target.closest('.card-actions') || e.target.closest('.source-link')) return;
      openSource();
    });
    el.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        openSource();
      }
    });
  }

  return el;
}

function renderCards(){
  const visible = ideas.filter(card => {
    const dayMatch = cardDayList(card).some(code => state.selectedDays.has(code));
    const catMatch = state.category === 'Alle' || card.category === state.category;
    const weatherMatch = state.weather === 'Alles'
      || (state.weather === 'Leuk bij zon' && card.env === 'outdoor')
      || (state.weather === 'Leuk bij regen' && card.env === 'indoor');
    const searchMatch = !state.search
      || card.title.toLowerCase().includes(state.search)
      || (card.desc && card.desc.toLowerCase().includes(state.search));
    const durationMatch = state.duration === 'Alles' || DURATION_LABELS[card.duration] === state.duration;
    return dayMatch && catMatch && weatherMatch && searchMatch && durationMatch;
  }).sort((a,b) => matchScore(b) - matchScore(a));

  countEl.textContent = `${visible.length} ${visible.length === 1 ? 'idee' : 'ideeën'} gevonden voor de gekozen dagen`;

  gridEl.innerHTML = '';
  if(visible.length === 0){
    gridEl.innerHTML = `<div class="empty-state">
      <p>Geen ideeën voor deze combinatie.</p>
      <p>Zet een extra dag aan, kies een andere categorie, of pas de zoekopdracht aan.</p>
    </div>`;
    return;
  }

  visible.forEach(card => gridEl.appendChild(createCardElement(card)));
}

// ---------- Init ----------
async function init(){
  let curatedIdeas, scrapedEvents, scrapedVenues, statuses;
  [week, curatedIdeas, scrapedEvents, scrapedVenues, statuses] = await Promise.all([
    fetchWeek(), fetchIdeas(), fetchEvents(), fetchVenues(), fetchStatuses(),
  ]);
  ideas = [...curatedIdeas, ...scrapedEvents, ...scrapedVenues];
  state.selectedDays = new Set(week.map(d => d.code));
  Object.entries(statuses).forEach(([cardId, status]) => {
    if(status.starred) state.starred.add(cardId);
    if(status.done) state.done.add(cardId);
    if(status.rating != null) state.ratings.set(cardId, status.rating);
  });
  renderWeekstrip();
  renderFilters();
  renderCards();
  renderQuickPicks();
  renderProgramma();
}
init();
