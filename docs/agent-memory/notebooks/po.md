# PO Notebook

## Last updated: 2026-05-14T20:38Z (c113 — 1916 SPIKE done, FIX tasks dispatched)

---

## Cycle 113 — 1916 SPIKE complete, carry-forward FIX tasks queued

**Spawn:** user prompt with SPIKE 1916 findings (`docs/spikes/SPIKE_1916-bctc-queue-enricher-scraper-broken.md`).

### SPIKE 1916 verdict
Original hypothesis (SSC HTML structure change → Cheerio selectors stale) **FALSIFIED**. `bctcDiscovery.ts` does not use Cheerio at all. Real root cause: **`bctcQueueEnricherJob` has NEVER worked — all 4 discovery strategies dead simultaneously since at least 2026-04-22.** The 9 "working" tickers were populated by the parallel VPS-push pipeline (`fetch-bctc.sh` + `discover-bctc-urls-browser.py`), not by the enricher.

Strategy failures: S0 (VPS Playwright) — `/proxy/bctc-discover` route never deployed on `vps-proxy-server.js` + `bctcHttpFetcher.ts` never sends `X-API-Key`. S1 (SSC iboard) — NXDOMAIN since 2026-04-27. S2 (cafef) — `FinanceInfo.ashx` migrated, query params lost in 301 redirect. S3 (vietstock) — JS-rendered 404 swallowed silently.

### Triage decisions
- **1916 parent row moved to Done** as `1916-bctc-queue-enricher-scraper-broken-SPIKE-DONE-c113` (CRITICAL SPIKE completed).
- **Two carry-forward FIX tasks queued in Backlog:**
  - `1916a-fix-vps-discover-route-and-apikey` (CRITICAL FIX, zone `multi` = `vps-scripts/` + `apps/mcp-server/`, owner ops + dev-mcp-server, deadline 2026-05-15T02:00:00Z). Add `/proxy/bctc-discover/:ticker?year=&quarter=` route to `vps-proxy-server.js` (shells out to existing `discover-bctc-urls-browser.py`) + inject `X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}` in `bctcHttpFetcher.ts` for VPS host. 5 ACs.
  - `1916b-fix-cafef-strategy-replacement` (HIGH FIX, zone `apps/mcp-server/`, owner dev-mcp-server, sequenced AFTER 1916a). Replace dead `s.cafef.vn/Candles/FinanceInfo.ashx` Strategy 2 with working alt or delete. 3 ACs.
- **Sequencing:** 1916a is minimum viable fix (Strategy 0 alone delivers full enrichment); 1916b is hardening on top.
- **Concurrent with 1915 SPIKE (still pending review)** — different upstream stage. 1916 = discovery; 1915 = extraction. Banking Q1-2026 SSC filing window 2026-05-15T02:00Z still drives both deadlines.
- **Zone classification:** 1916a marked `multi` per po.md rule — architect must split into 2 sequenced subtasks (VPS route first, then header injection + Docker rebuild). 1916b clean single zone `apps/mcp-server/`.

### project-stats.json
- `_lastRefreshedBy` updated to c113 with SPIKE-DONE + carry-forward FIX summary.
- `currentSprintNotes` rewritten with full strategy-by-strategy failure map + 1916a/b dispatch info.

### Carry-forward to c114+
- Dispatch 1916a immediately (architect for zone-split + BA spec) — CRITICAL deadline 2026-05-15T02:00Z (~5h from now).
- Watch for 1915 SPIKE deliverable to surface (still pending review).
- 1909c-reparse-validation remains HOLD, now blocked by 1915 + 1916a.
- Pending USER F1: 1913 (FA gateway desktop config, 10th cycle), 1897b-carry (Docker .git/ exclude).
- Background carries: janitor-1912, 1914 dedup-api, 1914b-log-agent-work-doc, 1907a digest-predict 5d silence.
