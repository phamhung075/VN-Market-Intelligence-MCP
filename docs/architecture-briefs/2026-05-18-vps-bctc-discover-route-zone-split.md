# ARCH-1944 — VPS BCTC Discover Route: Zone-Split Brief

**Date:** 2026-05-18
**Sprint:** 1944
**Author:** architect
**Status:** DONE
**Blocks:** BA-1944a

---

## Brownfield Scan Summary

Files read before design:

| File | Key finding |
|---|---|
| `vps-scripts/vps-proxy-server.js` | Route `/proxy/bctc-discover/:ticker` ALREADY LANDED (commit `1b8f8cd5`). Calls `runDiscoverScript()` → `python3 /root/discover-bctc-urls-browser.py`. Returns `string[]` via `jsonResponse(res, 200, urls)`. |
| `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` | `X-API-Key` injection ALREADY LANDED (commits `8f9c2d55`/`0d248b00`). `isVpsUrl()` checks hostname against `VPS_HOST` env / hardcoded `125.212.251.27`. Injects `VPS_PUSH_API_KEY` when URL is VPS-targeted. 6 unit tests in `1916a-bctc-http-fetcher-api-key.test.ts` cover AC-1 thru AC-6. |
| `apps/mcp-server/src/domain/services/bctcDiscovery.ts` | Strategy 0 is now hsx.vn (TASK-BCTC-3b). VPS Playwright is Strategy 1. `extractVpsPlaywrightUrls()` expects `{ results: [{url, source, confidence}], error }`. **MISMATCH: VPS route returns `string[]`.** See Risk R-1 below. |
| `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` | Wires `_fetchVpsPlaywright: bctcHttpFetch` + `_fetchHsx: fetchHsxBctcUrls`. Strategy dispatch correct. |
| `docs/spikes/SPIKE_1916-bctc-queue-enricher-scraper-broken.md` | Describes the state BEFORE fixes landed. VPS route and header injection root causes confirmed. Strategies 1-3 all dead. |

**SPIKE-1916 described the state before fixes. Both code fixes have landed in the repo. The gap is deployment + a response-shape mismatch.**

---

## Revised Root Cause (post-brownfield)

The SPIKE-1916 brief described two missing pieces:
1. VPS route absent — **fixed in repo, not yet deployed to VPS**
2. `X-API-Key` header missing — **fixed in repo with tests**

A third issue was missed in both SPIKE-1916 and SPIKE-1943:

**Risk R-1 — Response shape mismatch (BLOCKING):**
`vps-proxy-server.js` `runDiscoverScript()` maps Python output to `string[]` and returns it directly. `extractVpsPlaywrightUrls()` in `bctcDiscovery.ts` tries to parse `{ results: [{url,...}], error }`. A `string[]` JSON input will fail the `Array.isArray(parsed.results)` check and return `[]` silently. Strategy 1 would be live but return zero URLs for every ticker.

This shape mismatch must be resolved before the end-to-end chain works.

---

## Child Task Definitions

### 1944a-vps — zone: `vps-scripts/`
**Owner:** dev-vps-crawls
**Size:** S
**Blocked by:** nothing

**Scope:**

Deploy the updated `vps-proxy-server.js` to the VPS. The code is in the repo but the VPS is likely running the older version (no route existed per SPIKE-1916 live probe dated 2026-05-14). Deployment runs `scripts/deploy-vinahost.sh`.

Fix the response shape mismatch. `runDiscoverScript()` returns `string[]`. The MCP client (`extractVpsPlaywrightUrls`) expects `{ results: [{url, source, confidence}], error }`. One of the two sides must be aligned. The lower-risk fix is to update `runDiscoverScript` to wrap its output in the expected envelope:

```
// Instead of returning string[]
return { results: urls.map(u => ({ url: u, source: "vps-playwright", confidence: 1 })), error: null };
```

This keeps `bctcDiscovery.ts` domain logic unchanged (the `extractVpsPlaywrightUrls` parser already handles the envelope shape correctly, including partial/null URLs). The VPS file `vps-proxy-server.js` is the correct place to fix this — it is the producer of the wire format.

**Files to modify:**
- `vps-scripts/vps-proxy-server.js` — wrap `runDiscoverScript` output in `{ results, error }` envelope (L329: `jsonResponse(res, 200, urls)`)

**Files unchanged (pre-verified):**
- `vps-scripts/discover-bctc-urls-browser.py` — lives at `/root/` on VPS only, not in repo. Pre-existing, already used by `fetch-bctc.sh`. Do not modify.

**Acceptance criteria:**
1. `curl -H "X-API-Key: <key>" "http://125.212.251.27:8765/proxy/bctc-discover/VCB?year=2026&quarter=1"` returns `{"results":[...],"error":null}` with at least one entry where `url` ends in `.pdf`
2. `curl` without `X-API-Key` returns HTTP 401
3. `vn-vps-proxy.service` systemd unit is running (`systemctl status vn-vps-proxy`)
4. VPS proxy server log shows `bctc-discover: VCB → N URL(s) found` (N ≥ 1)

**Deploy:** `scripts/deploy-vinahost.sh` (already deploys `vps-proxy-server.js` to `/root/`, restarts `vn-vps-proxy.service`)

---

### 1944a-mcp — zone: `apps/mcp-server/`
**Owner:** dev-mcp-server
**Size:** S
**Blocked by:** nothing (code already landed; this task = verify + integration test)

**Scope:**

`bctcHttpFetcher.ts` X-API-Key injection is already in the codebase with 6 passing unit tests (`1916a-bctc-http-fetcher-api-key.test.ts`). This task verifies the wiring in the live stack and adds a live-probe test.

**What still needs doing:**
1. Confirm `VPS_PUSH_API_KEY` is set in `.env` (already used by other VPS fetchers — grep confirms `VPS_PUSH_API_KEY` is the canonical env var). The Docker service reads it at startup via `env_file: .env`.
2. Add one integration smoke test that calls `bctcHttpFetch` against the live VPS endpoint after 1944a-vps is deployed. This test should be guarded behind an environment check (`VPS_INTEGRATION=true`) to not run in CI by default.
3. Confirm `BCTC_DISCOVER_URL` is set in `docker-compose.yml` environment for the mcp-server service. It is (current value: `http://125.212.251.27:8765/proxy/bctc-discover`).

**Files to modify:**
- `apps/mcp-server/src/__tests__/1944a-vps-live-probe.test.ts` — new file, guarded integration test

**Files unchanged (pre-verified):**
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — already correct
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — already correct (envelope parser matches after 1944a-vps fix)
- `docker-compose.yml` — `BCTC_DISCOVER_URL` and `VPS_HOST` already present

**Acceptance criteria:**
1. `bun test --grep "1916a"` — all 6 tests GREEN (regression)
2. `VPS_INTEGRATION=true bun test 1944a-vps-live-probe` — probe returns at least one `.pdf` URL for VCB Q1/2026 or Q4/2025
3. No HTTP 401 in enricher logs after Docker rebuild (`bctcQueueEnricher` log line `source_url populated` appears within one cron cycle for at least one ticker)

---

## Handshake Order

```
1944a-vps  (VPS route deployed + shape fix)
    ↓ deploy-vinahost.sh runs
1944a-mcp  (live probe confirms header + shape chain end-to-end)
    ↓ both done
1944b      (dead strategy cleanup + 1944c smoke report)
```

Both child tasks can be started independently (no code dependency between zones). The live-probe test in 1944a-mcp requires 1944a-vps to be deployed first, but the unit tests in 1944a-mcp can run without it.

---

## 1944b Scope Clarification

The task description says "Replace dead cafef Strategy 2 in bctcDiscovery.ts OR delete it with deprecation comment."

**Brownfield finding:** cafef Strategy 2 was already fully removed in TASK_1916b (commit visible in docblock of `bctcDiscovery.ts`, line 23: `[REMOVED] cafef.vn document JSON API — TASK_1916b: permanently dead`). `extractCafefUrls` and `tryFetchCafef` are deleted. `_fetchCafef` is kept as a no-op backward-compat field only.

**Revised 1944b scope:**
- SSC iboard (Strategy 2 in current numbering) — NXDOMAIN, kept as dead-but-harmless fallback per docblock. Decision: leave with existing comment (`NOTE: iboard-query.ssc.vn is NXDOMAIN`). No code change needed unless it causes log noise. If it adds latency to the strategy chain, it can be removed — but that is a product decision for BA, not scope for 1944b as filed.
- vietstock (Strategy 3) — JS-rendered, always returns `[]` for PDF. Same treatment: leave with existing comment.
- The only code-change candidate in 1944b is removing the `_fetchCafef` backward-compat field from `DiscoverOptions` if BA confirms no test or external caller passes it. Risk: low (the field is declared with `@deprecated` already).

**Recommendation for 1944b:** Scope to a clean-up pass only — remove `_fetchCafef` field + its JSDoc, update strategy numbering in comments to match reality (hsx=0, VPS=1, SSC=2, vietstock=3 — already correct), add a comment to `tryFetchSsc` noting the NXDOMAIN status. No functional changes. Size: S. This can proceed in parallel with 1944a-mcp once 1944a-vps is deployed.

---

## DDD Layer Map

| Change | Layer | Notes |
|---|---|---|
| `vps-proxy-server.js` shape fix | Infrastructure (VPS) | Outside DDD boundary — VPS-side code. No domain import possible. |
| `1944a-vps-live-probe.test.ts` | Infrastructure test | Guarded integration test, not unit test. No domain assertions. |
| `_fetchCafef` removal (1944b) | Domain (DiscoverOptions) | Pure type cleanup, no runtime behaviour change. |

---

## Risk Surface

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Shape mismatch: VPS returns `string[]`, client expects `{results,error}` | HIGH | Fix in 1944a-vps (wrap output). Verified by 1944a-mcp live probe. |
| R-2 | `discover-bctc-urls-browser.py` absent or broken on VPS | MEDIUM | Script already used by `fetch-bctc.sh` daily. Acceptance test 1944a-vps AC-4 catches this. |
| R-3 | `VPS_PUSH_API_KEY` missing from `.env` on host | MEDIUM | 1944a-mcp AC-3: enricher log check within one cron cycle surfaces this immediately. |
| R-4 | hsx.vn token `HJ2HNS3SKICV4FNE` rotated | LOW | hsx.vn is Strategy 0 (primary). If it fails, Strategy 1 (VPS) picks up. Monitor `source: "hsx"` vs `source: "vps-playwright"` ratio in enricher logs. |
| R-5 | VPS deploy script `VULTR_IP` still pointed at decommissioned Vultr | LOW | Script uses `VULTR_IP` var; Vinahost IP is `125.212.251.27`. Verify `.env` has correct IP before running `deploy-vinahost.sh`. |

---

## Sizing Summary

| Task | Zone | Owner | Size | Blocker |
|---|---|---|---|---|
| 1944a-vps | `vps-scripts/` | dev-vps-crawls | S | none |
| 1944a-mcp | `apps/mcp-server/` | dev-mcp-server | S | none (unit tests independent; live probe needs 1944a-vps deployed) |
| 1944b | `apps/mcp-server/` | dev-mcp-server | S | 1944a |
| 1944c | `apps/mcp-server/` | ops + dev-mcp-server | S | 1944b |
