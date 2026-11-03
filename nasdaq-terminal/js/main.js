// App shell: routing, sidebar, search, timezone clock, API status.
import overview from './pages/overview.js';
import watchlist from './pages/watchlist.js';
import news from './pages/news.js';
import { PLANNED } from './pages/planned.js';
import { health, onApiState, explain } from './services/api.js';
import { searchSymbols } from './services/market.js';
import * as store from './core/store.js';
import { esc } from './core/format.js';
import { toast } from './ui/components.js';

const ROUTES = [
  { id: 'overview', n: '01', label: 'Market Overview', mod: overview },
  { id: 'screener', n: '02', label: 'Stock Screener', mod: PLANNED.screener, soon: true },
  { id: 'earnings', n: '03', label: 'Earnings Intelligence', mod: PLANNED.earnings, soon: true },
  { id: 'financials', n: '04', label: 'Revenue & Financials', mod: PLANNED.financials, soon: true },
  { id: 'deepdive', n: '05', label: 'Stock Deep Dive', mod: PLANNED.deepdive, soon: true },
  { id: 'technical', n: '06', label: 'Technical Analysis', mod: PLANNED.technical, soon: true },
  { id: 'forecast', n: '07', label: 'Quant Forecast', mod: PLANNED.forecast, soon: true },
  { id: 'news', n: '08', label: 'Live News', mod: news },
  { id: 'calendar', n: '09', label: 'Economic Calendar', href: '/calendar.html' },
  { id: 'sectors', n: '10', label: 'Sector Analysis', mod: PLANNED.sectors, soon: true },
  { id: 'watchlist', n: '11', label: 'Watchlist & Portfolio', mod: watchlist },
  { id: 'compare', n: '12', label: 'Stock Comparison', mod: PLANNED.compare, soon: true },
  { id: 'assistant', n: '13', label: 'AI Research', mod: PLANNED.assistant, soon: true },
];

const $ = (id) => document.getElementById(id);
const view = $('view');
const ctx = { tz: () => store.get().tz };
let cleanup = null;

$('nav').innerHTML = ROUTES.map((r) => r.href ? `<a href="${r.href}"><span class="n">${r.n}</span>${esc(r.label)}<span class="tag" style="color:var(--accent);border-color:rgba(0,166,255,.4)">site</span></a>` : `<a href="#/${r.id}" data-r="${r.id}"><span class="n">${r.n}</span>${esc(r.label)}${r.soon ? '<span class="tag">soon</span>' : ''}</a>`).join('');

function route() {
  const id = location.hash.replace(/^#\//, '') || 'overview';
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r.id));
  document.body.classList.remove('nav-open');
  view.innerHTML = '';
  try { cleanup = r.mod.mount(view, ctx) || null; }
  catch (e) { view.innerHTML = `<div class="card"><div class="state err"><b>This module failed to load</b><span>${esc(e.message)}</span></div></div>`; }
  document.title = `${r.label} · NASDAQ Intelligence Terminal`;
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// Mobile drawer
$('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

// Timezone + clock
const TZS = ['Asia/Beirut', 'UTC', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Tokyo'];
$('tzSelect').innerHTML = TZS.map((z) => `<option value="${z}">${z.replace('_', ' ')}</option>`).join('');
$('tzSelect').value = store.get().tz;
$('tzSelect').addEventListener('change', (e) => { store.set({ tz: e.target.value }); tick(); route(); });
function tick() {
  try { $('clock').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: store.get().tz, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()) + ' · ' + store.get().tz.split('/').pop().replace('_', ' '); } catch {}
}
tick(); setInterval(tick, 1000);

// API status indicator
onApiState((s) => {
  const el = $('conn'), t = $('connText');
  el.className = 'conn';
  if (s.configured === false) { el.classList.add('err'); t.textContent = 'API key not configured'; }
  else if (s.lastError && s.lastError !== 'rate_limited') { el.classList.add('warn'); t.textContent = `Data issue: ${explain({ code: s.lastError })}`.slice(0, 48); }
  else if (s.lastError === 'rate_limited') { el.classList.add('warn'); t.textContent = 'Rate limited — retrying'; }
  else if (s.lastOk) { el.classList.add('ok'); t.textContent = s.inflight ? 'Updating…' : 'Provider connected'; }
  else t.textContent = s.configured ? 'Connecting…' : 'Checking API…';
});
health();

// Symbol / company search
let st;
const input = $('searchInput'), box = $('searchResults');
input.addEventListener('input', () => {
  clearTimeout(st);
  const q = input.value.trim();
  if (q.length < 1) { box.hidden = true; return; }
  st = setTimeout(async () => {
    try {
      const r = await searchSymbols(q);
      box.innerHTML = r.length ? r.map((x) => `<button data-s="${esc(x.symbol)}"><span class="sym">${esc(x.symbol)}</span><span>${esc(x.name || '')}</span><span class="mut" style="margin-left:auto">${esc(x.exchange)}</span></button>`).join('') : '<div class="state">No matches</div>';
      box.hidden = false;
      box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const s = b.dataset.s; box.hidden = true; input.value = '';
        toast(`<b>${esc(s)}</b>`, { action: store.watchlists.has(s) ? undefined : { label: 'Add to watchlist', run: () => { store.watchlists.add(s); if (location.hash === '#/watchlist') route(); } } });
      }));
    } catch (e) { box.innerHTML = `<div class="state err"><b>Search unavailable</b><span>${esc(explain(e))}</span></div>`; box.hidden = false; }
  }, 250);
});
document.addEventListener('click', (e) => { if (!$('search').contains(e.target)) box.hidden = true; });

route();
