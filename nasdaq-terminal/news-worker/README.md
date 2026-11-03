# Live News Worker

Merges public RSS feeds into one JSON list for the terminal's Live News tab. No API key.

## Deploy (once)
```
cd nasdaq-terminal\news-worker
wrangler deploy
```
Open the printed URL (add nothing). You should see `"ok":true` and a `sources` list showing which feeds worked.
If the URL differs from `NEWS_BASE` in `../js/config.js`, update it there.

## Add or remove sources
Edit the `FEEDS` list at the top of `news-proxy.js` and redeploy. A feed that fails shows as unavailable
in the page's source chips and never breaks the others. Respect each publisher's feed terms:
the tab shows headline + link only.
