// TAB 08 - Live News (publisher RSS headlines; links out to the original source)
import { loadNews, classify, CATEGORIES } from '../services/news.js';
import { esc, timeAgo } from '../core/format.js';
import { skeleton, errorState, emptyState, sourceTag, wireRetry } from '../ui/components.js';

const REFRESH_MS = 2 * 60 * 1000;

export default {
  id: 'news',
  mount(el, ctx) {
    let alive = true, timer, all = [], sources = [], meta = null, err = null, loading = true;
    const f = { src: new Set(), cat: '', q: '', highOnly: false };

    el.innerHTML = `<div class="page-head"><h1>Live News</h1><p>Headlines from public market feeds. Click a headline to read it at the source.</p><div class="right" id="nwStamp"></div></div><div id="nwBody"></div>`;
    const body = el.querySelector('#nwBody');
    body.innerHTML = `<section class="card">${skeleton(8)}</section>`;

    async function refresh() {
      try {
        const r = await loadNews();
        if (!alive) return;
        sources = r.data.sources; meta = r.meta; err = null;
        all = r.data.items;
      } catch (e) { if (!alive) return; err = e; }
      loading = false; draw();
    }

    const fmtClock = (iso) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: ctx.tz(), day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch { return iso; } };

    function draw() {
      el.querySelector('#nwStamp').innerHTML = meta ? sourceTag(meta, ctx.tz()) : '';
      if (loading) return;
      if (err) { body.innerHTML = `<section class="card">${errorState(err)}</section>`; wireRetry(body, () => { loading = true; body.innerHTML = `<section class="card">${skeleton(8)}</section>`; refresh(); }); return; }
      const now = Date.now();
      const items = all.map((i) => classify(i, now));
      const shown = items.filter((i) =>
        (!f.src.size || f.src.has(i.source)) && (!f.cat || i.cat === f.cat) && (!f.highOnly || i.high) &&
        (!f.q || i.title.toLowerCase().includes(f.q.toLowerCase())));
      const live = sources.filter((s) => s.ok).length;
      body.innerHTML = `
        <section class="card">
          <div class="tabs" id="nwSrc">${sources.map((s) => `<button data-s="${esc(s.name)}" class="${f.src.has(s.name) ? 'on' : ''}" ${s.ok ? '' : 'disabled title="Unavailable: ' + esc(s.error || '') + '" style="opacity:.45;cursor:not-allowed"'}>${esc(s.name)}${s.ok ? ` <span class="mut">${s.count}</span>` : ''}</button>`).join('')}</div>
          <div class="form">
            <label>Search<input id="nwQ" value="${esc(f.q)}" placeholder="e.g. CPI, Fed, NVDA" style="width:180px"></label>
            <label>Topic<select id="nwCat"><option value="">All topics</option>${[...CATEGORIES.map((c) => c[0]), 'Other'].map((c) => `<option ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label style="grid-auto-flow:column;align-items:center;gap:6px;color:var(--txt)"><input type="checkbox" id="nwHigh" ${f.highOnly ? 'checked' : ''} style="width:auto"> High impact only</label>
            <span class="mut" style="margin-left:auto">${shown.length} headlines · ${live}/${sources.length} sources live</span>
          </div>
        </section>
        <section class="card">${shown.length ? `<div class="news-list">${shown.map((i) => `
          <a class="news-item" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">
            <span class="nt num" title="${esc(fmtClock(i.ts))}">${esc(timeAgo(i.ts))}<small>${esc(fmtClock(i.ts))}</small></span>
            <span class="nh">${i.breaking ? '<span class="pill neg">BREAKING</span> ' : i.fresh ? '<span class="pill pos">NEW</span> ' : ''}${i.high && !i.breaking ? '<span class="pill warn">HIGH IMPACT</span> ' : ''}${esc(i.title)}</span>
            <span class="ns"><span class="pill">${esc(i.cat)}</span> <span class="mut">${esc(i.source)}</span></span>
          </a>`).join('')}</div>` : emptyState('No headlines match', 'Clear a filter, or wait for new items.')}
          <div class="note">Tags are keyword rules, not AI: <b>BREAKING</b> = high-impact keyword (Fed, CPI, jobs, tariffs, rate decisions…) and under 30 min old; <b>NEW</b> = under 30 min; <b>HIGH IMPACT</b> = high-impact keyword. Headlines are published by the sources shown and link to their sites. Refreshes every 2 min. Sentiment scoring and AI summaries are not included.</div>
        </section>`;
      body.querySelectorAll('#nwSrc button:not([disabled])').forEach((b) => b.addEventListener('click', () => { const s = b.dataset.s; f.src.has(s) ? f.src.delete(s) : f.src.add(s); draw(); }));
      const q = body.querySelector('#nwQ');
      q.addEventListener('input', () => { f.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { draw(); const n = body.querySelector('#nwQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
      body.querySelector('#nwCat').addEventListener('change', (e) => { f.cat = e.target.value; draw(); });
      body.querySelector('#nwHigh').addEventListener('change', (e) => { f.highOnly = e.target.checked; draw(); });
    }

    refresh();
    timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  },
};
