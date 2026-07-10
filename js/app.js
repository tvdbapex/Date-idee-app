// ---------- State ----------
let week = []; // populated by fetchWeek() in js/weather.js on init
const state = {
  selectedDays: new Set(),
  category: 'Alle',
  budget: 'Alles',
  starred: new Set(),
  done: new Set(),
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
const budgetEl = document.getElementById('budgetFilters');
function renderFilters(){
  renderPillGroup(categoryEl, categories, state.category, (opt) => {
    state.category = opt; renderFilters(); renderCards();
  });
  renderPillGroup(budgetEl, budgets, state.budget, (opt) => {
    state.budget = opt; renderFilters(); renderCards();
  });
}

// ---------- Matching logic ----------
function cardDayList(card){
  return card.days === 'alle' ? week.map(d => d.code) : card.days;
}

function weatherMatchForCard(card){
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

function matchScore(card){
  const match = weatherMatchForCard(card);
  return (card.isEvent ? 2 : 0) + (match ? 1 : 0);
}

// ---------- Render: cards ----------
const gridEl = document.getElementById('cardGrid');
const countEl = document.getElementById('resultCount');

function renderCards(){
  const visible = ideas.filter(card => {
    const dayMatch = cardDayList(card).some(code => state.selectedDays.has(code));
    const catMatch = state.category === 'Alle' || card.category === state.category;
    const budgetMatch = state.budget === 'Alles' || card.price === state.budget;
    return dayMatch && catMatch && budgetMatch;
  }).sort((a,b) => matchScore(b) - matchScore(a));

  countEl.textContent = `${visible.length} ${visible.length === 1 ? 'idee' : 'ideeën'} gevonden voor de gekozen dagen`;

  gridEl.innerHTML = '';
  if(visible.length === 0){
    gridEl.innerHTML = `<div class="empty-state">
      <p>Geen ideeën voor deze combinatie.</p>
      <p>Zet een extra dag aan of kies een andere categorie.</p>
    </div>`;
    return;
  }

  visible.forEach(card => {
    const match = weatherMatchForCard(card);
    const starred = state.starred.has(card.id);
    const done = state.done.has(card.id);

    const el = document.createElement('div');
    el.className = `card ${card.isEvent ? 'is-event' : ''}`;
    el.innerHTML = `
      <div class="card-top">
        <span class="card-category">${card.category}</span>
      </div>
      <h3 class="card-title">${card.title}</h3>
      <p class="card-desc">${card.desc}</p>
      <div class="card-meta">
        <span class="tag">${card.env === 'indoor' ? 'Binnen' : 'Buiten'}</span>
        <span class="tag">${card.price}</span>
        <span class="tag">${card.distance}</span>
        ${card.isEvent ? '<span class="tag event-tag">Evenement</span>' : ''}
        ${match ? `<span class="tag weather-match ${match.type === 'rain' ? 'rain-match' : ''}">${match.label}</span>` : ''}
      </div>
      <div class="card-actions">
        <button type="button" class="icon-btn star-btn ${starred ? 'starred' : ''}">${starred ? '★ Favoriet' : '☆ Favoriet'}</button>
        <button type="button" class="icon-btn done-btn ${done ? 'done' : ''}">${done ? '✓ Gedaan' : 'Markeer gedaan'}</button>
      </div>
    `;

    el.querySelector('.star-btn').addEventListener('click', () => {
      starred ? state.starred.delete(card.id) : state.starred.add(card.id);
      renderCards();
    });
    el.querySelector('.done-btn').addEventListener('click', () => {
      done ? state.done.delete(card.id) : state.done.add(card.id);
      renderCards();
    });

    gridEl.appendChild(el);
  });
}

// ---------- Init ----------
async function init(){
  week = await fetchWeek();
  state.selectedDays = new Set(week.map(d => d.code));
  renderWeekstrip();
  renderFilters();
  renderCards();
}
init();
