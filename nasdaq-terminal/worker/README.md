# Terminal data proxy (Cloudflare Worker)

Holds the Financial Modeling Prep API key so it never touches GitHub or the browser.
The terminal page calls `https://fxd-fmp.ali-darwish-lb.workers.dev` (set in `../js/config.js`).

## Deploy (once, from your computer)
```bash
npm i -g wrangler
cd nasdaq-terminal/worker
wrangler login
wrangler deploy                     # creates the Worker "fxd-fmp"
wrangler secret put FMP_API_KEY     # paste your FMP key when prompted
```
Then open the Worker URL with `/?path=_health`. It should return `"configured":true`.
If the URL printed by `wrangler deploy` differs from the one in `../js/config.js`, update `API_BASE` there.

## Notes
- Only fxdarwish.com / www.fxdarwish.com browsers can read responses (CORS). Edit `ORIGINS` in `fmp-proxy.js` to add others.
- Cache TTLs and the endpoint allowlist are at the top of `fmp-proxy.js`.
- This is separate from the economic-calendar Worker (`/worker.js` at the repo root).
