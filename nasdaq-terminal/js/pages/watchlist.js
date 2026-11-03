// TAB 11 — Watchlist & Portfolio (persisted locally; prices from the provider)
import * as store from '../core/store.js';
import { quotes, searchSymbols, profile } from '../services/market.js';
import { fmt, fmtPct, fmtSigned, fmtCompact, cls, esc, logoUrl, positionStats, isNum } from '../core/format.js';
import { skeleton, errorState, emptyState, sourceTag, wireRetry, sortableTable, toast, h } from '../ui/components.js';

const ALERT_TYPES = {
  price_above: 'Price ≥', price_below: 'Price ≤', pct_up: 'Day change ≥ +%', pct_down: 'Day change ≤ −%',
};

function evalAlert(a, q) {
  if (!q) return false;
  const v = Number(a.value);
  if (a.type === 'price_above') return q.price >= v;
  if (a.type === 'price_below') return q.price <= v;
  if (a.type === 'pct_up') return isNum(q.pct) && q.pct >= v;
  if (a.type === 'pct_down') return isNum(q.pct) && q.pct <= -v;
  return false;
}

export default {
  id: 'watchlist',
  mount(el, ctx) {
    let alive = true, timer, qmap = new Map(), qmeta = null, qerr = null, sectors = new Map();
    let view = 'watch';

    el.innerHTML = `<div class="page-head"><h1>Watchlist &amp; Portfolio</h1><p>Saved in this browser. Prices come from the data provider.</p><div class="right" id="wlStamp"></div></div><div id="wlBody"></div>`;
    const body = el.querySelector('#wlBody');

    const symbolsNeeded = () => {
      const s = store.get();
      return [...new Set([...s.watchlists.flatMap((w) => w.symbols), ...s.holdings.map((x) => x.symbol), ...s.alerts.map((a) => a.symbol)])];
    };

    async function refresh() {
      const syms = symbolsNeeded();
      if (!syms.length) { qmap = new Map(); qerr = null; return draw(); }
      try {
        const r = await quotes(syms);
        if (!alive) return;
        qmap = r.map; qmeta = r.meta; qerr = null;
        checkAlerts();
        loadSectors();
      } catch (e) { if (!alive) return; qerr = e; }
      draw();
    }

    function checkAlerts() {
      store.get().alerts.filter((a) => a.active).forEach((a) => {
        const q = qmap.get(a.symbol);
        if (evalAlert(a, q)) {
          store.alerts.markFired(a.id);
          toast(`<b>Alert</b> ${esc(a.symbol)} ${ALERT_TYPES[a.type]} ${esc(a.value)}<br><span class="num">${fmt(q.price)} · ${fmtPct(q.pct)}</span>`, { ms: 12000 });
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification(`${a.symbol} alert`, { body: `${ALERT_TYPES[a.type]} ${a.value} — now ${fmt(q.price)}` }); } catch {}
        }
      });
    }

    async function loadSectors() {
      const need = store.get().holdings.map((x) => x.symbol).filter((s) => !sectors.has(s));
      if (!need.length) return;
      await Promise.allSettled(need.map(async (s) => { const p = await profile(s); sectors.set(s, p?.sector || 'Unclassified'); }));
      if (alive && view === 'port') draw();
    }

    function watchView() {
      const s = store.get(); const wl = store.watchlists.active();
      const rows = wl.symbols.map((sym) => ({ symbol: sym, q: qmap.get(sym) || null }));
      const root = h('<div style="display:grid;gap:12px"></div>');
      const head = h(`<section class="card"><div class="tabs">${s.watchlists.map((w) => `<button data-wl="${w.id}" class="${w.id === wl.id ? 'on' : ''}">${esc(w.name)}</button>`).join('')}<button data-newwl>＋ New list</button>${s.watchlists.length > 1 ? '<button data-delwl class="mut">Delete this list</button>' : ''}</div>
        <div class="form"><label>Add symbol<input id="addSym" placeholder="NVDA" maxlength="12" autocapitalize="characters"></label><button class="btn" id="addBtn">Add</button><span class="mut" id="addHint"></span></div></section>`);
      root.appendChild(head);
      const card = h(`<section class="card"><h2>${esc(wl.name)}<span class="src">${sourceTag(qmeta, ctx.tz())}</span></h2></section>`);
      if (qerr) { card.insertAdjacentHTML('beforeend', errorState(qerr)); wireRetry(card, refresh); }
      if (!rows.length) card.insertAdjacentHTML('beforeend', emptyState('This watchlist is empty', 'Add a ticker above or use the search bar.'));
      else card.appendChild(sortableTable([
        { key: 'sym', label: 'Symbol', val: (r) => r.symbol, html: (r) => `<img class="logo" src="${logoUrl(r.symbol)}" alt="" loading="lazy" onerror="this.style.display='none'"><span class="sym">${esc(r.symbol)}</span> <span class="mut">${esc(r.q?.name && r.q.name !== r.symbol ? r.q.name.slice(0, 22) : '')}</span>` },
        { key: 'px', label: 'Price', val: (r) => r.q?.price ?? null, html: (r) => `<span class="num">${r.q ? fmt(r.q.price) : '—'}</span>` },
        { key: 'chg', label: 'Chg', val: (r) => r.q?.change ?? null, html: (r) => `<span class="num ${cls(r.q?.change)}">${fmtSigned(r.q?.change)}</span>` },
        { key: 'pct', label: 'Chg %', val: (r) => r.q?.pct ?? null, html: (r) => `<span class="num ${cls(r.q?.pct)}">${fmtPct(r.q?.pct)}</span>` },
        { key: 'vol', label: 'Volume', val: (r) => r.q?.volume ?? null, html: (r) => `<span class="num">${fmtCompact(r.q?.volume)}</span>` },
        { key: 'rng', label: '52W Range', val: (r) => (r.q && r.q.yearHigh && r.q.yearLow ? (r.q.price - r.q.yearLow) / (r.q.yearHigh - r.q.yearLow) : null), html: (r) => (r.q && r.q.yearHigh ? `<span class="num mut">${fmt(r.q.yearLow)} – ${fmt(r.q.yearHigh)}</span>` : '—') },
        { key: 'x', label: '', val: () => 0, html: (r) => `<button class="btn ghost sm" data-drop="${esc(r.symbol)}">Remove</button>` },
      ], rows, { sortKey: 'pct' }));
      card.insertAdjacentHTML('beforeend', '<div class="note">Earnings dates/reminders and unusual-volume alerts arrive with the Earnings module (Phase 2); they need the earnings-calendar and average-volume feeds.</div>');
      root.appendChild(card);

      const alertsCard = h(`<section class="card"><h2>Price alerts</h2>
        <div class="form"><label>Symbol<input id="alSym" placeholder="NVDA" maxlength="12"></label><label>Condition<select id="alType">${Object.entries(ALERT_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>Value<input id="alVal" inputmode="decimal" placeholder="150"></label><button class="btn" id="alAdd">Add alert</button></div>
        <div class="note">Alerts are checked while this page is open (every 30 s). Browser notifications need permission. <button class="btn ghost sm" id="notifBtn">Enable notifications</button></div></section>`);
      if (s.alerts.length) alertsCard.appendChild(sortableTable([
        { key: 'sym', label: 'Symbol', val: (a) => a.symbol, html: (a) => `<span class="sym">${esc(a.symbol)}</span>` },
        { key: 'cond', label: 'Condition', val: (a) => a.type, html: (a) => `${ALERT_TYPES[a.type]} ${esc(a.value)}` },
        { key: 'st', label: 'Status', val: (a) => (a.active ? 1 : 0), html: (a) => (a.active ? '<span class="pill">armed</span>' : `<span class="pill warn">fired ${esc(new Date(a.firedAt).toLocaleString())}</span>`) },
        { key: 'x', label: '', val: () => 0, html: (a) => `${a.active ? '' : `<button class="btn ghost sm" data-rearm="${a.id}">Re-arm</button> `}<button class="btn ghost sm" data-delal="${a.id}">Delete</button>` },
      ], s.alerts, { sortKey: 'sym', desc: false }));
      root.appendChild(alertsCard);
      return root;
    }

    function portView() {
      const s = store.get();
      const root = h('<div style="display:grid;gap:12px"></div>');
      root.appendChild(h(`<section class="card"><h2>Add / update holding</h2><div class="form"><label>Symbol<input id="hSym" maxlength="12" placeholder="AAPL"></label><label>Shares<input id="hSh" inputmode="decimal" placeholder="10"></label><label>Avg cost<input id="hCost" inputmode="decimal" placeholder="150.00"></label><button class="btn" id="hAdd">Save</button></div></section>`));
      if (!s.holdings.length) { root.appendChild(h(`<section class="card">${emptyState('No holdings yet', 'Add a position above to see value, P&L and allocation.')}</section>`)); return root; }
      const rows = s.holdings.map((x) => { const q = qmap.get(x.symbol) || null; return { ...x, q, st: positionStats(x.shares, x.cost, q), sector: sectors.get(x.symbol) || '…' }; });
      const priced = rows.filter((r) => r.st.value !== null);
      const total = priced.reduce((a, r) => a + r.st.value, 0);
      const basis = priced.reduce((a, r) => a + r.st.basis, 0);
      const day = priced.reduce((a, r) => a + (r.st.dayPnl || 0), 0);
      const unreal = total - basis;
      const missing = rows.length - priced.length;
      root.appendChild(h(`<section class="card"><h2>Summary<span class="src">${sourceTag(qmeta, ctx.tz())}</span></h2><div class="kv">
        <div><small>Market value</small><b class="num">${fmt(total)}</b></div>
        <div><small>Day P&amp;L</small><b class="num ${cls(day)}">${fmtSigned(day)}</b></div>
        <div><small>Unrealized P&amp;L</small><b class="num ${cls(unreal)}">${fmtSigned(unreal)} <span style="font-size:11px">${basis ? fmtPct((unreal / basis) * 100) : ''}</span></b></div>
        <div><small>Cost basis</small><b class="num">${fmt(basis)}</b></div></div>${missing ? `<div class="note">${missing} position(s) have no quote and are excluded from totals.</div>` : ''}</section>`));
      const tbl = h('<section class="card"><h2>Positions</h2></section>');
      tbl.appendChild(sortableTable([
        { key: 'sym', label: 'Symbol', val: (r) => r.symbol, html: (r) => `<span class="sym">${esc(r.symbol)}</span>` },
        { key: 'sh', label: 'Shares', val: (r) => r.shares, html: (r) => `<span class="num">${fmt(r.shares, 2)}</span>` },
        { key: 'cost', label: 'Avg cost', val: (r) => r.cost, html: (r) => `<span class="num">${fmt(r.cost)}</span>` },
        { key: 'px', label: 'Price', val: (r) => r.q?.price ?? null, html: (r) => `<span class="num">${r.q ? fmt(r.q.price) : '—'}</span>` },
        { key: 'val', label: 'Value', val: (r) => r.st.value, html: (r) => `<span class="num">${fmt(r.st.value)}</span>` },
        { key: 'day', label: 'Day P&L', val: (r) => r.st.dayPnl, html: (r) => `<span class="num ${cls(r.st.dayPnl)}">${fmtSigned(r.st.dayPnl)}</span>` },
        { key: 'un', label: 'Unreal. P&L', val: (r) => r.st.unrealized, html: (r) => `<span class="num ${cls(r.st.unrealized)}">${fmtSigned(r.st.unrealized)} (${fmtPct(r.st.unrealizedPct)})</span>` },
        { key: 'w', label: 'Weight', val: (r) => (r.st.value && total ? r.st.value / total : null), html: (r) => `<span class="num">${r.st.value && total ? ((r.st.value / total) * 100).toFixed(1) + '%' : '—'}</span>` },
        { key: 'x', label: '', val: () => 0, html: (r) => `<button class="btn ghost sm" data-hdel="${esc(r.symbol)}">Remove</button>` },
      ], rows, { sortKey: 'val' }));
      root.appendChild(tbl);
      const sec = new Map();
      priced.forEach((r) => sec.set(r.sector, (sec.get(r.sector) || 0) + r.st.value));
      const bars = (entries) => entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="sector"><span>${esc(k)}</span><div class="track"><div class="fill" style="left:0;width:${(v / total) * 100}%;background:var(--accent)"></div></div><span class="num">${((v / total) * 100).toFixed(1)}%</span></div>`).join('');
      root.appendChild(h(`<section class="grid g-2"><div class="card"><h2>Allocation by stock</h2><div style="padding:6px 0">${bars(priced.map((r) => [r.symbol, r.st.value]))}</div></div><div class="card"><h2>Allocation by sector</h2><div style="padding:6px 0">${bars([...sec.entries()])}</div><div class="note">Sector from provider company profile.</div></div></section>`));
      root.appendChild(h('<section class="card"><div class="note">Historical portfolio performance needs stored daily snapshots or per-lot purchase dates; it is not shown rather than estimated.</div></section>'));
      return root;
    }

    function draw() {
      if (!alive) return;
      const keepFocus = document.activeElement && document.activeElement.id;
      body.innerHTML = '';
      const tabs = h(`<div class="card"><div class="tabs"><button data-v="watch" class="${view === 'watch' ? 'on' : ''}">Watchlists</button><button data-v="port" class="${view === 'port' ? 'on' : ''}">Portfolio</button></div></div>`);
      body.appendChild(tabs);
      const content = view === 'watch' ? watchView() : portView();
      content.style.marginTop = '12px';
      body.appendChild(content);
      wire();
      el.querySelector('#wlStamp').innerHTML = sourceTag(qmeta, ctx.tz());
      if (keepFocus) body.querySelector('#' + keepFocus)?.focus();
    }

    const num = (v) => { const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
    const validSym = (v) => /^[A-Z0-9.\-^]{1,12}$/.test(v);

    function wire() {
      body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v; draw(); }));
      body.querySelectorAll('[data-wl]').forEach((b) => b.addEventListener('click', () => { store.watchlists.select(b.dataset.wl); refresh(); }));
      body.querySelector('[data-newwl]')?.addEventListener('click', () => { const n = prompt('Watchlist name'); if (n) { store.watchlists.create(n); draw(); } });
      body.querySelector('[data-delwl]')?.addEventListener('click', () => { if (confirm('Delete this watchlist?')) { store.watchlists.remove(store.get().activeWatchlist); refresh(); } });
      const add = async () => {
        const inp = body.querySelector('#addSym'); const raw = inp.value.trim();
        if (!raw) return;
        const sym = raw.toUpperCase();
        const hint = body.querySelector('#addHint');
        if (validSym(sym)) { store.watchlists.add(sym); return refresh(); }
        hint.textContent = 'Searching…';
        try { const r = await searchSymbols(raw); if (r[0]) { store.watchlists.add(r[0].symbol); refresh(); } else hint.textContent = 'No match found.'; } catch (e) { hint.textContent = 'Search unavailable.'; }
      };
      body.querySelector('#addBtn')?.addEventListener('click', add);
      body.querySelector('#addSym')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      body.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', () => { store.watchlists.drop(b.dataset.drop); draw(); }));
      body.querySelector('#alAdd')?.addEventListener('click', () => {
        const sym = body.querySelector('#alSym').value.trim().toUpperCase(); const v = num(body.querySelector('#alVal').value);
        if (!validSym(sym) || v === null || v <= 0) return toast('Enter a valid symbol and a positive value.');
        store.alerts.add({ symbol: sym, type: body.querySelector('#alType').value, value: v }); refresh();
      });
      body.querySelectorAll('[data-delal]').forEach((b) => b.addEventListener('click', () => { store.alerts.remove(b.dataset.delal); draw(); }));
      body.querySelectorAll('[data-rearm]').forEach((b) => b.addEventListener('click', () => { store.alerts.rearm(b.dataset.rearm); draw(); }));
      body.querySelector('#notifBtn')?.addEventListener('click', async () => { try { const p = await Notification.requestPermission(); toast(`Notifications: ${p}`); } catch { toast('Notifications are not supported here.'); } });
      body.querySelector('#hAdd')?.addEventListener('click', () => {
        const sym = body.querySelector('#hSym').value.trim().toUpperCase(); const sh = num(body.querySelector('#hSh').value); const c = num(body.querySelector('#hCost').value);
        if (!validSym(sym) || sh === null || sh <= 0 || c === null || c < 0) return toast('Enter symbol, shares > 0 and a non-negative cost.');
        store.holdings.upsert({ symbol: sym, shares: sh, cost: c }); refresh();
      });
      body.querySelectorAll('[data-hdel]').forEach((b) => b.addEventListener('click', () => { store.holdings.remove(b.dataset.hdel); draw(); }));
    }

    refresh();
    timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    return () => { alive = false; clearInterval(timer); };
  },
};
