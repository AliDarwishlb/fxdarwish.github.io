// TAB 01 — Market Overview
import { indexSnapshot, universeQuotes, breadth, sectorPerformance } from '../services/market.js';
import { fmt, fmtPct, fmtSigned, fmtCompact, cls, esc, logoUrl, heatColor, isNum } from '../core/format.js';
import { skeleton, errorState, emptyState, sourceTag, wireRetry, sortableTable, toast, h } from '../ui/components.js';
import { watchlists } from '../core/store.js';

const REFRESH_MS = 30000;

function indexTile({ def, quote: q }) {
  if (!q) return `<div class="card tile na"><div class="l"><span>${esc(def.label)}</span></div><div class="p">Unavailable</div><div class="r">Symbol not returned by provider</div></div>`;
  return `<div class="card tile" ${def.note ? `title="${esc(def.note)}"` : ''}>
    <div class="l"><span>${esc(def.label)}</span><span class="num">${esc(q.symbol)}</span></div>
    <div class="p num">${fmt(q.price)}</div>
    <div class="c num ${cls(q.pct)}">${fmtSigned(q.change)} &nbsp; ${fmtPct(q.pct)}</div>
    <div class="r"><span>O ${fmt(q.open)}</span><span>H ${fmt(q.high)}</span><span>L ${fmt(q.low)}</span><span>Vol ${fmtCompact(q.volume)}</span>${isNum(q.marketCap) ? `<span>MC ${fmtCompact(q.marketCap)}</span>` : ''}</div>
  </div>`;
}

function moversTable(rows, title, tz, meta) {
  const card = h(`<section class="card"><h2>${title}<span class="src">${sourceTag(meta, tz)}</span></h2></section>`);
  card.appendChild(sortableTable([
    { key: 'sym', label: 'Symbol', val: (r) => r.symbol, html: (r) => `<img class="logo" src="${logoUrl(r.symbol)}" alt="" loading="lazy" onerror="this.style.display='none'"><span class="sym">${esc(r.symbol)}</span>` },
    { key: 'px', label: 'Price', val: (r) => r.q.price, html: (r) => `<span class="num">${fmt(r.q.price)}</span>` },
    { key: 'pct', label: 'Chg %', val: (r) => r.q.pct, html: (r) => `<span class="num ${cls(r.q.pct)}">${fmtPct(r.q.pct)}</span>` },
  ], rows, { sortKey: 'pct', desc: title.startsWith('Top G') }));
  return card;
}

export default {
  id: 'overview',
  mount(el, ctx) {
    el.innerHTML = `
      <div class="page-head"><h1>Market Overview</h1><p>Indices, NASDAQ-100 breadth, sectors and movers.</p><div class="right" id="ovStamp"></div></div>
      <section class="grid g-idx" id="ovIdx">${Array.from({ length: 8 }, () => `<div class="card tile"><div class="skel" style="width:60%"></div><div class="skel" style="height:22px"></div><div class="skel" style="width:40%"></div></div>`).join('')}</section>
      <section class="grid g-2">
        <div class="card" id="ovBreadth"><h2>Market breadth · NASDAQ-100</h2>${skeleton(3)}</div>
        <div class="card" id="ovSectors"><h2>Sector performance · NASDAQ</h2>${skeleton(6)}</div>
      </section>
      <section class="grid g-2" id="ovMovers"></section>
      <section class="card" id="ovHeat"><h2>NASDAQ-100 heatmap</h2>${skeleton(6)}</section>`;

    const $ = (id) => el.querySelector('#' + id);
    let alive = true, timer;

    async function loadIdx() {
      try {
        const s = await indexSnapshot();
        if (!alive) return;
        $('ovIdx').innerHTML = s.items.map(indexTile).join('');
        $('ovStamp').innerHTML = sourceTag(s.meta, ctx.tz());
      } catch (e) {
        if (!alive) return;
        $('ovIdx').innerHTML = `<div class="card" style="grid-column:1/-1">${errorState(e)}</div>`;
        wireRetry($('ovIdx'), loadIdx);
      }
    }

    async function loadUniverse() {
      try {
        const u = await universeQuotes();
        if (!alive) return;
        if (!u.rows.length) throw Object.assign(new Error('empty'), { code: 'empty' });
        const b = breadth(u.rows);
        const pa = (b.adv / b.total) * 100, pd = (b.dec / b.total) * 100;
        $('ovBreadth').innerHTML = `<h2>Market breadth · NASDAQ-100<span class="src">${sourceTag(u.meta, ctx.tz())}</span></h2>
          <div class="breadth">
            <div class="bar"><i class="a" style="width:${pa}%"></i><i class="u" style="width:${100 - pa - pd}%"></i><i class="d" style="width:${pd}%"></i></div>
            <div class="bar-row"><span class="pos num">${b.adv} advancing</span><span class="mut num">${b.unch} unch.</span><span class="neg num">${b.dec} declining</span></div>
            <div class="mut" style="font-size:11px">Computed from ${b.total} of ${u.universeSize} NASDAQ-100 constituents with a quote. Not exchange-wide breadth.</div>
          </div>`;
        const sorted = [...u.rows].sort((a, c) => c.q.pct - a.q.pct);
        $('ovMovers').innerHTML = '';
        $('ovMovers').append(moversTable(sorted.slice(0, 8), 'Top Gainers', ctx.tz(), u.meta), moversTable(sorted.slice(-8).reverse(), 'Top Losers', ctx.tz(), u.meta));
        const heatRows = [...u.rows].sort((a, c) => (c.q.marketCap || 0) - (a.q.marketCap || 0));
        $('ovHeat').innerHTML = `<h2>NASDAQ-100 heatmap<span class="src">ordered by market cap · ${sourceTag(u.meta, ctx.tz())}</span></h2><div class="heat">${heatRows.map((r) => `<div class="hm" data-s="${esc(r.symbol)}" style="background:${heatColor(r.q.pct)}" title="${esc(r.name)} · ${fmt(r.q.price)}"><img src="${logoUrl(r.symbol)}" alt="" loading="lazy" onerror="this.style.display='none'"><b>${esc(r.symbol)}</b><span class="num">${fmtPct(r.q.pct)}</span></div>`).join('')}</div>`;
        $('ovHeat').querySelectorAll('.hm').forEach((t) => t.addEventListener('click', () => {
          const s = t.dataset.s; const row = u.rows.find((r) => r.symbol === s);
          toast(`<b>${esc(s)}</b> ${esc(row.name)}<br><span class="num">${fmt(row.q.price)} · ${fmtPct(row.q.pct)}</span>`, { action: watchlists.has(s) ? undefined : { label: 'Add to watchlist', run: () => watchlists.add(s) } });
        }));
      } catch (e) {
        if (!alive) return;
        for (const id of ['ovBreadth', 'ovHeat']) { $(id).innerHTML = `<h2>${id === 'ovHeat' ? 'NASDAQ-100 heatmap' : 'Market breadth · NASDAQ-100'}</h2>${errorState(e)}`; wireRetry($(id), loadUniverse); }
        $('ovMovers').innerHTML = `<div class="card" style="grid-column:1/-1"><h2>Gainers &amp; losers</h2>${errorState(e)}</div>`;
        wireRetry($('ovMovers'), loadUniverse);
      }
    }

    async function loadSectors() {
      try {
        const s = await sectorPerformance();
        if (!alive) return;
        const max = Math.max(...s.rows.map((r) => Math.abs(r.pct)), 0.01);
        $('ovSectors').innerHTML = `<h2>Sector performance · NASDAQ<span class="src">${esc(s.date)} · ${sourceTag(s.meta, ctx.tz())}</span></h2><div style="padding:6px 0">${s.rows.map((r) => `<div class="sector"><span>${esc(r.sector)}</span><div class="track"><div class="fill" style="${r.pct >= 0 ? 'left:50%' : 'right:50%'};width:${(Math.abs(r.pct) / max) * 50}%;background:${r.pct >= 0 ? 'var(--pos)' : 'var(--neg)'}"></div></div><span class="num ${cls(r.pct)}">${fmtPct(r.pct)}</span></div>`).join('')}</div>`;
      } catch (e) {
        if (!alive) return;
        $('ovSectors').innerHTML = `<h2>Sector performance · NASDAQ</h2>${e.code === 'empty' ? emptyState('No sector snapshot yet', 'The provider returned nothing for recent dates.') : errorState(e)}`;
        wireRetry($('ovSectors'), loadSectors);
      }
    }

    const all = () => Promise.allSettled([loadIdx(), loadUniverse(), loadSectors()]);
    all();
    timer = setInterval(() => { if (!document.hidden) all(); }, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  },
};
