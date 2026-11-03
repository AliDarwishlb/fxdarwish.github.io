// Module registry for tabs that are specified but not yet built. Each lists the exact data it will need,
// so the page is an honest roadmap — no mock numbers are shown anywhere.
const mk = (id, title, blurb, needs, phase) => ({
  id,
  mount(el) {
    el.innerHTML = `<div class="page-head"><h1>${title}</h1><p>${blurb}</p></div>
      <section class="card"><h2>Module status <span class="src"><span class="pill warn">${phase}</span></span></h2>
        <div class="state"><b>Not built yet</b><span>This module will show only provider-sourced data with timestamps. Nothing is simulated.</span></div>
        <ul class="roadmap">${needs.map((n) => `<li>${n}</li>`).join('')}</ul></section>`;
  },
});

export const PLANNED = {
  screener: mk('screener', 'Stock Screener', 'NASDAQ-100 screening engine.', ['Market-data filters (cap, price, % change, volume, 52W range) — available from the quote feed already in use', 'Fundamental filters: provider ratios / key-metrics endpoints', 'Technical filters (RSI, MACD, EMAs, ATR): computed in-browser from daily history', 'Saved screens + CSV export'], 'Phase 2'),
  earnings: mk('earnings', 'Earnings Intelligence', 'Calendar, surprises and reaction analysis.', ['Earnings calendar + estimates/actuals endpoints', 'EPS & revenue surprise %, 8-quarter history charts', 'Post-earnings reaction windows (1d / 5d / 20d) computed from price history', 'Reminders for tomorrow / 7 days / 30 days'], 'Phase 2'),
  financials: mk('financials', 'Revenue & Financial Analysis', 'Statements, margins and trend commentary.', ['Income statement, balance sheet, cash flow (quarterly + annual)', 'Margin, growth and FCF charts from reported figures', 'Rule-based commentary: improving / stable / deteriorating'], 'Phase 3'),
  deepdive: mk('deepdive', 'Stock Deep Dive', 'Per-company research page.', ['Profile, performance windows, valuation multiples', 'Analyst consensus & targets, ownership, insider activity', 'Risk panel: beta, realised volatility, drawdown'], 'Phase 3'),
  technical: mk('technical', 'Technical Analysis', 'Interactive charting and price-action engine.', ['TradingView Lightweight Charts with candles/volume', 'Intraday + daily history feed', 'Indicators and swing/BOS/level detection computed client-side'], 'Phase 3'),
  forecast: mk('forecast', 'Quantitative Forecast', 'Scenario engine with disclosed method.', ['Volatility-based (lognormal) scenario ranges with stated assumptions', 'Walk-forward backtest of the same method; probabilities shown only if the backtest supports them', 'Always labelled as model output, not fact'], 'Phase 4'),
  news: mk('news', 'Live Financial News', 'Filterable news feed with source links.', ['Provider news endpoints with ticker/category filters', 'Sentiment/summary generation needs an LLM backend — will be labelled as AI-generated'], 'Phase 3'),
  calendar: mk('calendar', 'Economic Calendar', 'US macro events in your timezone (default Beirut).', ['Economic-calendar endpoint (previous / consensus / actual / impact)', 'Timezone conversion already supported by the shell'], 'Phase 2'),
  sectors: mk('sectors', 'Sector & Industry Analysis', 'Theme baskets and relative performance.', ['Theme-to-ticker mapping maintained in config (not provider-generated)', 'Relative performance from history; fundamentals from key-metrics'], 'Phase 4'),
  compare: mk('compare', 'Stock Comparison', 'Up to 5 stocks side by side.', ['Reuses quote, ratios and statements services', 'Rule-based strengths / weaknesses summary'], 'Phase 4'),
  assistant: mk('assistant', 'AI Research Assistant', 'Questions answered from retrieved data.', ['Server-side LLM call with tool access to the same data services', 'Every answer cites sources and timestamps; refuses when data is missing'], 'Phase 5'),
};
