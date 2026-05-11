# Architecture Brief — 1862f-RCA-BRIEF
## Reuters / TradingEconomics Permanent Unreachability
**Date:** 2026-05-11  
**Author:** Architect  
**Trigger:** TNB c32 finding 1 — counters 16/16/16 post-container-restart, zero successes since 19:05 UTC 2026-05-10  
**Priority:** MEDIUM  
**Status:** BRIEF DELIVERED — awaiting PM task creation

---

## 1. Problem Statement

Task 1862f shipped exponential backoff (15 min base, x2, 2h cap) on the `reuters` and `tradingEconomics` circuit breakers to stop rapid CB thrash. It passed all 10 tests and was deployed 2026-05-10.

After container reboot at 19:05 UTC 2026-05-10, three in-memory error counters reset to zero and immediately accumulated back to max (16 = `consecutiveErrors` at module scope in `reuters.ts` and `tradingEconomicsStream.ts`, with REUTERS_ERROR_THRESHOLD=10 and TE_STREAM_ERROR_THRESHOLD=10 already exceeded). TNB c32 observed: Reuters + 2x TradingEconomics sources showing 16/16/16 consecutive errors, zero successes since restart.

**Root hypothesis confirmed by code analysis:**

The fetchers now target **Google News RSS + MarketWatch RSS** — NOT the original Reuters RSS or tradingeconomics.com/stream.ashx endpoints (those were already replaced in prior sprints). The "reuters" and "tradingEconomics" source labels are backward-compat aliases. The actual endpoints failing are:

| Fetcher module | Source label | Actual endpoint 1 | Actual endpoint 2 | Actual endpoint 3 |
|---|---|---|---|---|
| `reuters.ts` | `reuters` / `ap_news` | news.google.com/rss/search?q=vietnam+economy+OR+stock+market | news.google.com/rss/search?q=asia+finance+OR+emerging+markets | — |
| `tradingEconomicsStream.ts` | `tradingeconomics` | feeds.marketwatch.com/marketwatch/topstories/ | news.google.com/rss/search?q=global+economy+... | news.google.com/rss/search?q=financial+markets+... |
| `tradingEconomicsChromium.ts` | `trading_economics` | tradingeconomics.com/vietnam/indicators (Puppeteer) | tradingeconomics.com/vietnam/news (Puppeteer) | — |

The exponential backoff slows the CB probe cadence. It does NOT fix the underlying 4-layer failure:
1. CB opens after 5 failures (default `failureThreshold`).
2. Fetcher is never called while CB is open.
3. Counter `_reutersConsecutiveErrors` (module-level) accumulates only when `tryFetchFeed()` returns empty — but with CB open, the fetcher is never even reached. The 16/16/16 counters are from the pre-CB-open failure run, frozen at module reset on restart.
4. After container restart: CB resets to closed (in-memory state), fetcher fires once, immediately fails across all 3 feeds, counter climbs again to threshold, CB opens, backoff starts. Net result: zero successful fetches.

**TNB hypothesis — permanent block — is plausible.** Google News RSS and MarketWatch are global CDN endpoints that should not be geo-blocked from France. The failure from the Docker container (which runs locally on macOS) is unexpected unless:
- Docker container IP/user-agent fingerprint is blocklisted (common for residential + Chromium-detected scraping)
- Google News returns empty RSS body (not a 4xx) when it detects bot patterns (soft-block)
- MarketWatch feeds.marketwatch.com has recently deprecated the public RSS feed (this has been announced intermittently)

**What the "counters 16/16/16" actually measure:** The `_reutersConsecutiveErrors` and `_teStreamConsecutiveErrors` module-level integers count how many consecutive times ALL fallback feeds returned zero items. At threshold 10, a Telegram alert fires once. Counter keeps incrementing. These are independent from the CB `failures` counter.

---

## 2. Ops Probe Required (for next cycle — do not run in this brief)

PM: spawn `ops` with these exact commands to execute from the **Docker mcp-server container** (not the VPS, not the host):

```bash
# Exec into the running mcp-server container
docker exec -it vn-market-intelligence-mcp-mcp-server-1 sh

# ─── reuters.ts endpoints ───
# Primary: Google News RSS — Vietnam economy
curl -v -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  --max-redirs 5 -L \
  "https://news.google.com/rss/search?q=vietnam+economy+OR+stock+market&hl=en" \
  2>&1 | head -60

# Secondary: Google News RSS — Asia finance
curl -v -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  --max-redirs 5 -L \
  "https://news.google.com/rss/search?q=asia+finance+OR+emerging+markets&hl=en" \
  2>&1 | head -60

# ─── tradingEconomicsStream.ts endpoints ───
# Feed 1: MarketWatch top stories
curl -v -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  --max-redirs 5 -L \
  "https://feeds.marketwatch.com/marketwatch/topstories/" \
  2>&1 | head -60

# Feed 2: Google News — global economy / central banks
curl -v -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  --max-redirs 5 -L \
  "https://news.google.com/rss/search?q=global+economy+OR+central+bank+OR+interest+rate+OR+inflation&hl=en" \
  2>&1 | head -60

# Feed 3: Google News — financial markets
curl -v -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  --max-redirs 5 -L \
  "https://news.google.com/rss/search?q=financial+markets+OR+commodities+OR+USD+VND+exchange+rate&hl=en" \
  2>&1 | head -60
```

**Also run from the macOS host (outside Docker)** to compare — if host succeeds and container fails, the container IP or user-agent is fingerprinted.

**Verdict classification per response:**

| HTTP code / content | Verdict |
|---|---|
| 200 + `<rss>` or `<feed>` XML with items | OK |
| 200 + empty XML / `<channel><item>` count=0 | SOFT_BLOCK (Google bot detection returning skeleton) |
| 301/302 redirect loop or final 200 with HTML (not XML) | REDIRECT_HIJACK |
| 403 | BLOCK (Cloudflare WAF or geo-IP rule) |
| 429 | THROTTLE (rate limit) |
| DNS NXDOMAIN | DNS_FAIL |
| 404 | DEAD_ENDPOINT |
| 5xx | SERVER_ERROR |
| TLS handshake failure | TLS_FAIL |
| Connection timeout | TIMEOUT |

---

## 3. Pre-Probe Analysis (Code-Level)

Without running the probes, code analysis reveals a **design mismatch** that makes the fix direction clear regardless of probe outcome:

**Critical finding — module-level counters survive CB but reset on container restart:**

`reuters.ts` line 29: `let _reutersConsecutiveErrors = 0` — module-scope mutable integer.  
`tradingEconomicsStream.ts` line 26: `let _teStreamConsecutiveErrors = 0` — same.

These reset to 0 on every container restart. With the CB also resetting (in-memory), every restart triggers a fresh fetch storm that immediately hits all endpoints, fails, and re-trips the CB. This is a restart amplification loop that 1862f did not address.

**The fetchers already have good fallback chains.** `reuters.ts` tries 2 Google News feeds. `tradingEconomicsStream.ts` tries MarketWatch + 2 Google News feeds. `tradingEconomicsChromium.ts` has 6h cache + 12h stale fallback + Puppeteer for TE indicators, and 30min cache + 2h stale for TE news. The Chromium path has its own crash-loop guard (`TE_CHROMIUM_MAX_CONSECUTIVE_FAILURES=3`, persisted to `/app/data/te-chromium-cb-state.json`).

**The TradingEconomics macro indicators path (Chromium) is separate from the TE news/RSS path.** The 16/16/16 counters are from the RSS streams (reuters.ts + tradingEconomicsStream.ts), not from the Chromium scraper. The Chromium scraper has a file-persisted CB that survives restarts.

**Likely failure mode based on code + TNB observation:**

Google News RSS has historically worked fine from residential IPs. The failure most likely is one of:
1. Docker container NAT IP is shared with other abusive traffic — Google soft-blocks it
2. MarketWatch RSS feed is deprecated/dead (the WSJ group has been dismantling legacy feeds)
3. Both are occurring simultaneously

---

## 4. Recommendations

### Option A — Wontfix + Degrade Gracefully (mark permanent, exclude from health %)
**Trigger:** Probe confirms BLOCK/SOFT_BLOCK/DEAD_ENDPOINT on ALL 5 endpoints from inside Docker.

**Changes required:**
1. `sourceHealthTracker.ts`: add `"permanent"` SourceStatus (between `"down"` and `"disabled"`)
2. `reuters.ts` + `tradingEconomicsStream.ts`: after N consecutive failures (e.g. 50 = ~12h at 15-min poll), call `recordDisabled("reuters")` / `recordDisabled("tradingEconomics")` to exclude from health %
3. `circuitBreakerRegistry.ts`: keep CB open indefinitely (already functionally true with 2h backoff cap — after 4 HALF_OPEN probes, the CB stays open for 2h windows forever)
4. `mcp.config.json`: add `enabled: false` flag for `reuters` and `tradingEconomics` RSS fetchers so `pollNews` skips them entirely
5. Dashboard + Telegram: display "Ngưng (permanent)" badge instead of red "down" in source health tool

**Pros:** Zero maintenance, no cost, correct signal, zero WIP impact on other tasks.  
**Cons:** Loses ~40 international news items/cycle. Already compensated by 226 VN items/cycle from VPS + CafeF/VnExpress/etc. The VN-Market-Intelligence system's primary value is VN market data — international macro from Google News is secondary.

**Effort:** 1 atomic task, developer, ~1h, no rebuild of Docker base image (TS-only change), tests needed: 3.

---

### Option B — Alternative Source Migration
**Trigger:** Probe shows MarketWatch DEAD_ENDPOINT but Google News OK from host (container-specific block).

**Replacement candidates:**

| Source | Feed URL | Type | Notes |
|---|---|---|---|
| Reuters.com official RSS | https://feeds.reuters.com/reuters/businessNews | RSS | Reuters reinstated some RSS feeds in 2024; may require User-Agent |
| Financial Times (free tier) | https://www.ft.com/rss/home/uk | RSS | Requires free FT account cookie — impractical for automated fetch |
| AP News | https://rsshub.app/apnews/topics/financial-markets | RSS | Via RSSHub proxy — adds dependency |
| Yahoo Finance RSS | https://finance.yahoo.com/news/rssindex | RSS | Yahoo frequently breaks RSS structure; already used for commodities |
| Bloomberg RSS | https://feeds.bloomberg.com/markets/news.rss | RSS | Cloudflare-protected — likely same failure mode |
| BBC Business | https://feeds.bbci.co.uk/news/business/rss.xml | RSS | Reliable, low-friction, not Cloudflare-heavy |
| CNBC | https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664 | RSS | Has worked reliably from Docker in other projects |

**Best candidates if probe shows Docker-specific block:** BBC Business + CNBC (lower bot-detection aggression than Google/MarketWatch).

**Changes required:**
1. `reuters.ts`: replace GOOGLE_NEWS_PRIMARY_URL + GOOGLE_NEWS_SECONDARY_URL with BBC Business + CNBC URLs (or Reuters official if alive)
2. `tradingEconomicsStream.ts`: replace MW_RSS_URL + GNEWS_MACRO_URL + GNEWS_MARKETS_URL with 3 alternatives
3. `mcp.config.json`: update `fetchers.rss.reuters` and add new URLs for TE stream
4. No schema change, no CB change, no Docker rebuild of base image

**Pros:** Restores international news pipeline, same architecture, no new dependencies.  
**Cons:** Alt sources may also fail over time — same root problem if container IP is the blocker. Requires probe results to choose correct sources.

**Effort:** 2 atomic tasks (task-1: probe + choose sources; task-2: swap URLs + tests), developer, ~3h total.

---

### Option C — Proxy Rotation (Last Resort)
**Trigger:** Probe shows ALL endpoints BLOCK from both host AND container. VPS (Vietnam) also blocked.

**Design:** Route RSS fetches through Cloudflare Workers (free tier) acting as a proxy with rotating edge IPs.

```
mcp-server (Docker, France)
  → Cloudflare Worker (global edge, rotating IP)
    → news.google.com/rss or feeds.marketwatch.com
      → returns RSS to Worker
    → Worker strips CF headers, returns XML
  → existing RSS parser (unchanged)
```

**Alternative:** Residential proxy service (BrightData, Oxylabs) — costly ($50-200/month), adds external dependency, overkill for free RSS feeds.

**Changes required:**
1. New CF Worker script (JS, ~30 lines) deployed to workers.dev
2. `reuters.ts` + `tradingEconomicsStream.ts`: inject `CF_WORKER_URL` env var as proxy prefix
3. `.env` / Docker Compose: add `CF_RSS_PROXY_URL` env var
4. Update HTTP client in both fetchers to prepend proxy URL
5. Health check in `vpsProxyWatchdogJob.ts` to monitor the new CF Worker endpoint

**Pros:** Solves the IP-fingerprint problem permanently, Cloudflare Workers free tier is sufficient (100k req/day, RSS fetches ~96/day at 15-min poll).  
**Cons:** New infrastructure dependency, CF Worker must be deployed + maintained, adds latency (~50-100ms acceptable), requires CF account + deploy step in CI.

**Effort:** 4 atomic tasks (CF Worker deploy, env wiring, fetcher update, tests + health monitoring), ops + developer, ~6h total. Adds infra WIP.

---

## 5. Ranked Recommendation

**Primary: Option A** — Wontfix + degrade gracefully.

**Reasoning:**

1. **The fetchers already have better alternatives in-flight.** VN news comes from 9 VPS-sourced feeds (CafeF, VnExpress, VnEconomy, Vietstock, etc.) delivering 226 items/15-min cycle. The "reuters" and "tradingEconomics" source labels are already aliases for Google News — they stopped delivering actual Reuters/TE content in prior sprints when those were replaced. Their marginal value is low.

2. **The CB + backoff is already functionally wontfix.** With 2h max backoff cap, after 4 failed probes the source is probed at most once every 2 hours. The proposed degrades this further to "never probe" — which is the correct semantics for a known-permanent block.

3. **Option B is contingent on probe results.** Recommending it now would be premature. If probe shows Google News works from host but not from Docker, Option B (URL swap) is fast and effective. If both are blocked, Option B is pointless. Probe must come first.

4. **Option C is disproportionate.** CF Workers adds infra WIP for sources that are secondary signal. Only justified if international macro news is a hard requirement and probe confirms total block.

**Conditional escalation path:**
- Probe result = OK from host, BLOCK from container → escalate to Option B (URL swap, 2 tasks)
- Probe result = BLOCK from both → stay with Option A (1 task)
- Probe result = SOFT_BLOCK (empty XML, 200 OK) → Option A, document the soft-block pattern

---

## 6. Ship Plan

### Option A (recommended — 1 task)

**Task A1** — `developer` — MEDIUM — no rebuild required

Files to modify:
- `apps/mcp-server/src/infrastructure/fetchers/reuters.ts`: after `_reutersConsecutiveErrors >= REUTERS_ERROR_THRESHOLD` fires once, call `recordDisabled("reuters")` and stop probing (set a module-level `_reutersPermanentlyDown = true` flag; CB stays open). Add config gate: if `mcp.config.json fetchers.rss.reutersEnabled === false`, skip all fetch attempts immediately.
- `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsStream.ts`: same pattern, gate on `fetchers.tradingEconomicsStreamEnabled`.
- `apps/mcp-server/mcp.config.json`: add `"reutersEnabled": false` and `"tradingEconomicsStreamEnabled": false` under `fetchers.rss` — allows re-enabling without code change.
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/sourceHealthTools.ts`: display `"Ngưng (permanent)"` for sources in `disabled` status with `consecutiveFailures > 0` context.
- Tests: 3 new tests verifying the `enabled: false` gate skips fetch entirely.

**Estimated effort:** 1.5h. No Docker base image rebuild (TS + JSON only, hot-swap via container rebuild).  
**WIP impact:** Zero — isolated to 2 fetcher files + 1 config file + 1 tool display.

### If probe triggers Option B escalation (2 tasks)

**Task B1** — `ops` — HIGH — probe execution + source selection  
Run the 5 curl commands documented in Section 2. Report verdicts to PM. PM selects replacement URLs from Section 4 Option B candidate table.

**Task B2** — `developer` — MEDIUM — URL swap + tests  
Swap endpoint constants in `reuters.ts` and `tradingEconomicsStream.ts`. Update `mcp.config.json`. Add 5 new tests. Rebuild Docker container.

---

## 7. Brownfield Scan Notes

**Existing circuit breaker config (1862f):** reuters + tradingEconomics breakers have `resetTimeoutMs: 900_000, backoffMultiplier: 2, maxResetTimeoutMs: 7_200_000` — correctly slows probe cadence. Not repealed by this brief.

**Existing Chromium path (`tradingEconomicsChromium.ts`):** Separate from the RSS stream. Has file-persisted CB at `/app/data/te-chromium-cb-state.json`. Max 3 consecutive "Target closed" failures before circuit locks. This is for TE macro indicators (Puppeteer scrape) — NOT the RSS news stream. Not affected by this brief.

**`pollNews.ts` application use case:** Calls `fetchReuters()` and `fetchTradingEconomicsStream()` independently. If both return `[]`, downstream pipeline gets zero international items but does not error. No schema change needed for Option A.

**Source health tool (`sourceHealthTools.ts`):** Uses `globalSourceTracker.recordDisabled()` already. The `disabled` status is already handled in `getAllHealth()`. No new status type needed — existing `disabled` status covers Option A if we call `recordDisabled()` after permanent failure.

**DDD layer check:** All changes are infrastructure/fetcher layer (`infrastructure/fetchers/`) + config. No domain layer impact. No cross-layer violation risk.

---

## 8. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Probe is blocked by Docker network policy | LOW | Run from both container and host — compare |
| Google News soft-block returns 200+empty not 4xx — fetcher silently discards | MEDIUM | Check `<item>` count in response body, not just HTTP status |
| Option B URL swap fails if alt sources also get soft-blocked | MEDIUM | Choose sources with lower bot-detection aggression (BBC, CNBC) |
| Marking sources `disabled` removes them from health % denominator — health score appears improved when coverage actually shrunk | LOW | Audit `sourceHealthTools.ts` to keep `disabled` sources visible but excluded from % only if explicitly permanent |
| Container-level IP block vs endpoint-level block misdiagnosis | MEDIUM | Probe from both host and container per Section 2 instructions |
