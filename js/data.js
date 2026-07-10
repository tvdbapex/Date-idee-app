// ---------- Mock data ----------
// TODO (build step 1): replace `week` with a real forecast for Boerdonk
//   (lat 51.5595751, lng 5.6263531), e.g. via Open-Meteo.
// TODO (build step 2): replace `ideas` with rows read from the Supabase
//   `date_ideas` table instead of this hardcoded array.

const week = [
  { code:'MA', label:'ma', date:'13 jul', condition:'sun',   temp:24 },
  { code:'DI', label:'di', date:'14 jul', condition:'cloud', temp:21 },
  { code:'WO', label:'wo', date:'15 jul', condition:'rain',  temp:18 },
  { code:'DO', label:'do', date:'16 jul', condition:'cloud', temp:20 },
  { code:'VR', label:'vr', date:'17 jul', condition:'sun',   temp:23 },
  { code:'ZA', label:'za', date:'18 jul', condition:'sun',   temp:25 },
  { code:'ZO', label:'zo', date:'19 jul', condition:'rain',  temp:19 },
];

const categories = ['Alle','Eten & drinken','Natuur','Cultuur','Actief','Evenementen','Verrassend'];
const budgets = ['Alles','Gratis','€','€€','€€€'];

const ideas = [
  { id:1, title:'Jaarmarkt op het plein', category:'Evenementen', env:'outdoor', days:['ZA'], price:'Gratis', distance:'3 km', desc:'Kraampjes met streekproducten en livemuziek op het centrale plein.', isEvent:true },
  { id:2, title:'Wandeling langs de plas', category:'Natuur', env:'outdoor', days:'alle', price:'Gratis', distance:'5 km', desc:'Rustige route langs het water, mooi bij zonsondergang.' },
  { id:3, title:'Matinee in de kleine bioscoop', category:'Cultuur', env:'indoor', days:'alle', price:'€€', distance:'4 km', desc:'Onafhankelijke films, knusse zaal met maar 40 stoelen.' },
  { id:4, title:'Escape room: De Kluis', category:'Actief', env:'indoor', days:'alle', price:'€€', distance:'6 km', desc:'60 minuten om samen een bankkluis te kraken.' },
  { id:5, title:'Rooftop terras met uitzicht', category:'Eten & drinken', env:'outdoor', days:'alle', price:'€€', distance:'7 km', desc:'Cocktails met uitzicht over de stad, het best bij zonsondergang.' },
  { id:6, title:'Pottenbakken workshop', category:'Verrassend', env:'indoor', days:['DO','ZA'], price:'€€', distance:'5 km', desc:'Samen een kom of vaas draaien onder begeleiding.' },
  { id:7, title:'Vlooienmarkt bij het station', category:'Evenementen', env:'outdoor', days:['ZO'], price:'Gratis', distance:'2 km', desc:'Tweedehands spulletjes, vintage kleding en oude platen.', isEvent:true },
  { id:8, title:'Fietstocht door de polder', category:'Natuur', env:'outdoor', days:'alle', price:'Gratis', distance:'9 km', desc:'Vlak, rustig parcours langs molens en weilanden.' },
  { id:9, title:'Wijnproeverij in de kelder', category:'Eten & drinken', env:'indoor', days:['VR','ZA'], price:'€€€', distance:'6 km', desc:'Vijf wijnen met bijpassende kaas, in een oud gewelf.' },
  { id:10, title:'Kunstexpo in het pakhuis', category:'Cultuur', env:'indoor', days:'alle', price:'€', distance:'4 km', desc:'Werk van lokale kunstenaars in een omgebouwd pakhuis.' },
  { id:11, title:'Openluchtbioscoop op het plein', category:'Evenementen', env:'outdoor', days:['VR'], price:'€', distance:'3 km', desc:'Grote film op groot scherm, neem een kleedje mee.', isEvent:true },
  { id:12, title:'Kajaktocht door de gracht', category:'Actief', env:'outdoor', days:['ZA','ZO'], price:'€€', distance:'5 km', desc:'Anderhalf uur peddelen langs de mooiste grachtenpanden.' },
];
