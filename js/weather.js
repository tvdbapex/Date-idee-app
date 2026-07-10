// Real forecast for Boerdonk (Meierijstad) via Open-Meteo — free, no API key needed.
const WEATHER_LAT = 51.5595751;
const WEATHER_LNG = 5.6263531;

const DAY_CODES = ['ZO', 'MA', 'DI', 'WO', 'DO', 'VR', 'ZA']; // index = Date#getDay()
const DAY_LABELS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTH_LABELS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// Fallback used if the forecast can't be fetched (offline, API down, etc.)
const FALLBACK_WEEK = [
  { code: 'MA', label: 'ma', date: '—', condition: 'cloud', temp: null },
  { code: 'DI', label: 'di', date: '—', condition: 'cloud', temp: null },
  { code: 'WO', label: 'wo', date: '—', condition: 'cloud', temp: null },
  { code: 'DO', label: 'do', date: '—', condition: 'cloud', temp: null },
  { code: 'VR', label: 'vr', date: '—', condition: 'cloud', temp: null },
  { code: 'ZA', label: 'za', date: '—', condition: 'cloud', temp: null },
  { code: 'ZO', label: 'zo', date: '—', condition: 'cloud', temp: null },
];

function conditionFromWeatherCode(code){
  if(code === 0 || code === 1) return 'sun';
  if(code === 2 || code === 3 || code === 45 || code === 48) return 'cloud';
  return 'rain'; // drizzle, rain, snow, showers, thunderstorm codes
}

async function fetchWeek(){
  const params = new URLSearchParams({
    latitude: String(WEATHER_LAT),
    longitude: String(WEATHER_LNG),
    daily: 'weathercode,temperature_2m_max',
    timezone: 'Europe/Amsterdam',
    forecast_days: '7',
  });

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if(!res.ok) throw new Error(`Weer-API gaf status ${res.status}`);
    const data = await res.json();

    return data.daily.time.map((iso, i) => {
      const [y, m, d] = iso.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const dayIndex = date.getDay();
      return {
        code: DAY_CODES[dayIndex],
        label: DAY_LABELS[dayIndex],
        date: `${d} ${MONTH_LABELS_NL[m - 1]}`,
        condition: conditionFromWeatherCode(data.daily.weathercode[i]),
        temp: Math.round(data.daily.temperature_2m_max[i]),
      };
    });
  } catch(err){
    console.warn('Kon weerdata niet ophalen, val terug op placeholder-weer.', err);
    return FALLBACK_WEEK;
  }
}
