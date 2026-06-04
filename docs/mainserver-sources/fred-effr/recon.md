# Recon — fred-effr

**Date:** 2026-06-04 20:17 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR (broken) → https://api.stlouisfed.org/fred/series/observations (working)
**Trigger:** fetch_broken (EFFR stale since 2026-05-28, DSI-INV-1 degradation)
**Probe origin:** main-server (direct, no VPS proxy)

---

## Root Cause Summary

The `fredEffrIorb.ts` fetcher uses `https://fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR` — this URL is routed through the FRED web front-end which is blocked by an Akamai WAF/TLS-fingerprint rule at the network layer. This block has existed since at least 2026-05-13 (per prior fred-macro recon). The fetcher was implemented against the wrong host.

The official FRED API (`https://api.stlouisfed.org/fred/series/observations`) is on a **separate backend** (Apache, no Akamai), is fully reachable, and a valid `FRED_API_KEY` already exists in `.env`.

---

## Working Request Recipe

```bash
# Uses the real FRED_API_KEY from .env (32-char alphanumeric)
# Returns latest 5 EFFR observations sorted desc
curl -s \
  -H 'User-Agent: VN-Market-Intelligence/1.0' \
  -H 'Accept: application/json' \
  "https://api.stlouisfed.org/fred/series/observations?series_id=EFFR&api_key=${FRED_API_KEY}&file_type=json&limit=5&sort_order=desc"

# For IORB:
curl -s \
  -H 'User-Agent: VN-Market-Intelligence/1.0' \
  -H 'Accept: application/json' \
  "https://api.stlouisfed.org/fred/series/observations?series_id=IORB&api_key=${FRED_API_KEY}&file_type=json&limit=5&sort_order=desc"

# Full history (no limit param, or limit=10000):
curl -s \
  "https://api.stlouisfed.org/fred/series/observations?series_id=EFFR&api_key=${FRED_API_KEY}&file_type=json&sort_order=asc"
```

FRED_API_KEY is available in `.env` at project root: `FRED_API_KEY=5eb8996bd938699619edcade2960ab58`

---

## HTTP Probe Results

### fredgraph.csv endpoint (BROKEN — used by current fetcher)

- **URL:** `https://fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR`
- **Status:** 000 (timeout — 0 bytes received across all variations)
- **Variations tested:**
  - HTTP/2 with browser User-Agent → `HTTP/2 stream 1 INTERNAL_ERROR (err 2)` — stream immediately reset by server
  - HTTP/1.1 with browser User-Agent → timeout, 0 bytes received
  - HTTP/1.1 with `curl/7.88.1` User-Agent, no Accept-Encoding → timeout, 0 bytes
  - IPv4-forced (`--ipv4`), no compression → timeout, 0 bytes
  - Raw Python TLS socket (HTTP/1.1) → socket hangs, 0 bytes received after TLS handshake
  - FEDFUNDS series (same endpoint, different series_id) → same failure (confirms endpoint-level block, not series-specific)
  - Direct TCP connect to 104.121.23.240:443 → **succeeds** (3ms)
  - TLS handshake → **succeeds** (TLSv1.3, AEAD-AES256-GCM-SHA384, DigiCert cert)
  - ICMP ping to 104.121.23.240 → 0% packet loss, 3.4–4.0ms RTT
- **Root cause:** Server accepts TCP + TLS but drops all HTTP payloads directed to `fred.stlouisfed.org` Host SNI — Akamai WAF rule discards the HTTP stream silently (no RST, no 403, just stale/hang). Observed also from raw Python socket: 0 bytes received after sending a well-formed HTTP/1.1 GET.

### Official API endpoint (WORKING)

- **URL:** `https://api.stlouisfed.org/fred/series/observations?series_id=EFFR&api_key=<KEY>&file_type=json&limit=5&sort_order=desc`
- **Status:** 200 OK
- **DNS:** 104.121.23.240 (same IP as fred., but different backend via SNI routing)
- **Server header:** `Apache` (no Akamai on api subdomain)
- **Content-Type:** `application/json; charset=UTF-8`
- **Redirect chain:** none
- **Response time:** ~3.0s (expected for FRED API)
- **Latest EFFR date returned:** `2026-06-03` — value `3.62%`
- **Latest IORB date returned:** `2026-06-04` — value `3.65%`

### Key observation: fred. vs api. subdomain routing

| Subdomain | DNS | HTTP reachable | Server | Anti-bot |
|-----------|-----|----------------|--------|----------|
| `fred.stlouisfed.org` | 104.121.23.240 | NO — silent stream drop | Akamai (DigiCert cert) | Akamai WAF (TLS fingerprint + IP block) |
| `api.stlouisfed.org` | 104.121.23.240 | YES — 200 OK | Apache (direct) | API key only |
| `research.stlouisfed.org` | 104.121.23.240 | YES — 301 Moved | AkamaiGHost | none |

Both `fred.` and `api.` resolve to the same IP; the backend is selected by SNI/Host header. The `fred.` web front-end has Akamai WAF rules that silently drop non-browser request streams. The `api.` backend bypasses Akamai entirely and serves directly via Apache.

---

## Anti-Bot Assessment

- **Type:** `akamai_bot` — silent stream drop after TLS handshake on `fred.stlouisfed.org`; Akamai JA3/TLS fingerprint block
- **Evidence:**
  - TLS certificate CN = `research.stlouisfed.org` (Federal Reserve Bank of Boston / DigiCert)
  - HTTP/2 returns `INTERNAL_ERROR (err 2)` — Akamai WAF resets h2 stream immediately
  - HTTP/1.1 raw socket returns 0 bytes — WAF drops the payload silently without TCP RST
  - `api.stlouisfed.org` same IP, but `server: Apache` header, no Akamai → responds normally
  - Confirmed consistent with prior recon (2026-05-13) which documented the same block
- **Geo-blocked from main server:** no — block is TLS/WAF-based not geographic; `api.stlouisfed.org` works from France IP
- **Recommendation:** Switch fetcher from `fredgraph.csv` URL to `api.stlouisfed.org/fred/series/observations`. FRED_API_KEY is already in `.env`. No headless needed. No VPS proxy needed.

---

## Page Structure

### JSON Paths (FRED API v2 — `api.stlouisfed.org`)

- `$.observations[*].date` → observation date (YYYY-MM-DD string)
- `$.observations[*].value` → rate value (string — use `parseFloat`; "." = missing/not-yet-published)
- `$.count` → total number of observations in series
- `$.observations[0].date` (sort_order=desc) → most recent available date

### API Parameters

| Parameter | Value for EFFR fetch |
|-----------|---------------------|
| `series_id` | `EFFR` or `IORB` |
| `api_key` | 32-char key from `.env` |
| `file_type` | `json` |
| `sort_order` | `asc` for chronological (insert-friendly) or `desc` for latest-first check |
| `limit` | omit for full history; `1` for latest-only check |
| `observation_start` | optional ISO date for incremental fetch (avoids re-parsing full history) |

Incremental fetch recipe (new rows only, avoids re-parsing full history):
```
?series_id=EFFR&api_key=KEY&file_type=json&sort_order=asc&observation_start=LAST_DATE_IN_DB
```

---

## Sample Response Excerpt

```json
{
  "realtime_start":"2026-06-04",
  "realtime_end":"2026-06-04",
  "count":6763,
  "limit":5,
  "observations":[
    {"date":"2026-06-03","value":"3.62"},
    {"date":"2026-06-02","value":"3.62"},
    {"date":"2026-06-01","value":"3.62"},
    {"date":"2026-05-29","value":"3.62"},
    {"date":"2026-05-28","value":"3.62"}
  ]
}
```

**FRED's true latest EFFR date: 2026-06-03** (value 3.62%). Our DB max date is 2026-05-28 — we are 6 business days stale. The gap is entirely due to the broken fetcher endpoint, not FRED publication lag.

---

## Fix Recommendation

**Owner:** `dev-mcp-server` (changes `apps/mcp-server/src/infrastructure/fetchers/fredEffrIorb.ts`)

**Change required:**
1. Replace `FRED_BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id="` with `api.stlouisfed.org` JSON API calls
2. Add `FRED_API_KEY` env read (already available in `.env` and already read by `fredIsmSubcomponents.ts`)
3. Parse JSON `$.observations[]` instead of CSV rows — same shape as `fredIsmSubcomponents.ts` already does
4. Use `observation_start` param for incremental-only fetches (skip rows already in DB, avoid full re-parse)
5. The existing `fredApi.ts` + `FredHttpClient` interface should already be reusable — the fix is mostly swapping the URL construction + response parsing

**Effort:** Low — `fredIsmSubcomponents.ts` already implements the JSON API pattern for FRED. The fix is adapting that pattern into `fredEffrIorb.ts`.

**No network/infrastructure changes needed.** No VPS. No Docker changes. The working API key is already in `.env`.

---

## Notes

- This block is NOT new — the 2026-05-13 fred-macro recon already documented it: `fred.stlouisfed.org` web pages return STATUS:000 (Akamai TLS fingerprint block). The `fredEffrIorb.ts` fetcher was implemented AFTER that recon but targeted the wrong URL.
- `api.stlouisfed.org` rate limit: 120 requests/60s per key — not a concern for daily polling of 2 series.
- IORB latest available: `2026-06-04` (3.65%) — our DB has it through 2026-06-01, so IORB is only 1–2 days stale (likely the last job run before the fetcher failed was partially successful for IORB only).
- `"."` values in FRED observations = not yet published (expected on weekends/holidays) — current parser handles this correctly via `isNaN` check.
- FRED EFFR is only published on business days (Mon–Fri, not Fed holidays); 2026-05-28 was a Wednesday, so the 6-day stale gap represents business days 05-29, 06-02, 06-03.
