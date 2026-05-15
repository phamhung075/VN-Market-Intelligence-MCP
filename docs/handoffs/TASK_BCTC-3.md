---
sprint: BCTC-3
branch: task/bctc-3-hsx-xhr-discovery
size: M
zone: apps/mcp-server/ | vps-scripts/
depends_on: []
blocks: []
---

## TLDR

Implement no-browser hsx.vn API scraper on VPS to discover HOSE BCTC documents via XHR endpoints. Replaces Playwright (which crashes with TasksMax=32). API is geo-restricted from France but expected accessible from Vietnam IP. Splits into 3 atomic subtasks: (1) VPS curl verification (ops prerequisite), (2) Python XHR fetcher on VPS, (3) integration into MCP discovery pipeline.

---

## [PM] Planning Context

### Zone

**Primary zones:**
- `vps-scripts/` — new `fetch-hsx-bctc.py` + integration into `discover-bctc-urls-browser.py`
- `apps/mcp-server/src/interface/mcp/tools/` — MCP tool exposure (if creating new endpoint on :8765)

**Secondary zones:**
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — strategy chain (no changes required if XHR integrated into VPS script layer)
- `vps-scripts/vps-proxy-server.js` — may add `/proxy/bctc-discover-hsx/:ticker` route OR keep integration internal to discover script

### Acceptance Criteria

**AC-1:** VPS curl verification (ops task) PASS
- Run from Vinahost VPS: `curl -H "type: HJ2HNS3SKICV4FNE" "https://api.hsx.vn/n/api/v1/news/securities/VNM/1?pageIndex=1&pageSize=5&startDate=2026-01-01&endDate=2026-05-15"`
- Response status: 200 (not 404)
- Response body: valid JSON with `{"data":[...], "success":true}` (at least 1 item)
- Result logged in `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` § Verification section

**AC-2:** `vps-scripts/fetch-hsx-bctc.py` exists and fetches BCTC URLs
- Accepts positional args: `ticker`, `year`, `quarter` (e.g., `./fetch-hsx-bctc.py VNM 2026 1`)
- Computes `startDate`/`endDate` correctly (Q1 → Jan 1 to Mar 31 + 60-day buffer for late filings)
- Calls `https://api.hsx.vn/n/api/v1/news/securities/{ticker}/1?...` with header `type: HJ2HNS3SKICV4FNE`
- Parses JSON response, extracts `filePath` + `fileName` fields
- Filters: only items where `fileName.endsWith('.pdf')` AND title contains BCTC keywords ("báo cáo tài chính", "BCTC", quarter/year match)
- Constructs full URL: `filePath.replace("~", "https://staticfile.hsx.vn")`
- Emits JSON: `{"results": [{"url": "...", "fileName": "...", "source": "hsx", "confidence": 0.9}], "error": null}`

**AC-3:** `vps-scripts/discover-bctc-urls-browser.py` integrates XHR as strategy 1
- Before launching Playwright, calls `fetch-hsx-bctc.py {ticker} {year} {quarter}`
- If `fetch-hsx-bctc.py` returns ≥1 result with confidence > 0.7, return early (skip Playwright)
- If zero results OR timeout (>5s), fall through to Playwright as fallback
- Return format: same `VpsPlaywrightResult` interface (`{"results": [...], "error": null}`)

**AC-4:** VPS proxy route updated (optional, depends on architecture choice)
- If route `/proxy/bctc-discover-hsx/:ticker` added to `vps-proxy-server.js`: route calls Python fetcher + normalizes response
- Callable from `apps/mcp-server/` as `GET http://vps-proxy:8765/proxy/bctc-discover-hsx/{ticker}?year=YYYY&quarter=Q`
- Otherwise, integration stays internal to `discover-bctc-urls-browser.py` (no route needed; simpler)

**AC-5:** End-to-end MCP tool test: `discover_bctc_urls` returns hsx.vn URLs for ≥1 HOSE ticker
- Test tickers: VNM, VEA, HPG (confirm Q1/2026 PDFs discovered)
- Source field populated: `source: "hsx"`
- URLs accessible: curl each URL → 200 (no redirect loops)

**AC-6:** Unit tests for XHR fetch logic
- `fetch-hsx-bctc.py`: test date range computation, JSON parsing, filePath normalization, keyword filtering
- Mock responses: 1 valid BCTC item, 1 non-BCTC item (should filter), 1 missing filePath (should skip)
- All tests pass locally before VPS deploy

**AC-7:** ZONE enforcement
- All code changes: `apps/mcp-server/` + `vps-scripts/` (no changes to `apps/*/` outside mcp-server)
- Dev-mcp-server owns `apps/mcp-server/src/` edits (if any)
- Dev-vps-crawls owns `vps-scripts/` edits

### Files to Read First

- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` — full spike findings, architecture choice guidance
- `vps-scripts/discover-bctc-urls-browser.py` — existing VPS discovery script (integration point)
- `vps-scripts/vps-proxy-server.js` — VPS proxy (route addition point, if needed)
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts:400-455` — Strategy 0 path (how VPS results are consumed)
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — HTTP fetcher (may need API key header injection)

### Files to Create

- `vps-scripts/fetch-hsx-bctc.py` — Pure Python XHR fetcher for hsx.vn API
- `vps-scripts/tests/test_fetch_hsx_bctc.py` — Unit tests (mocked HTTP responses)

### Files to Modify

- `vps-scripts/discover-bctc-urls-browser.py` — Add `_discover_hsx_xhr()` function, integrate as strategy 1 (before Playwright)
- `docs/vps-sources/hsx-bctc/triage.md` — Update with live probe results from VPS + final implementation notes
- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` § Verification — add VPS curl result (AC-1)

### Optional Files (depends on architecture)

- `vps-scripts/vps-proxy-server.js` — Add `/proxy/bctc-discover-hsx/:ticker` route (if choosing route-based integration)

### Dependencies

**Blocking prerequisite (ops task, runs in parallel):**
- **ops-vps-fetch:** Verify hsx.vn `/n/api/v1/` endpoints accessible from Vinahost VPS
  - Task: SSH to Vinahost, run curl verification (AC-1 spec above)
  - Expected: 200 + JSON response (not 404)
  - If FAIL → escalate BLOCKER to architect (geo-restriction extends to VPS)
  - If PASS → unblock dev-vps-crawls

**None** (after ops verification completes)

### Knowledge Needed

- `docs/policies/dev-standards.md` — code style, testing tier
- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` — complete spike findings
- `docs/vps-sources/hsx-bctc/triage.md` — prior recon notes
- `reference_vps_setup.md` — VPS connection + troubleshooting
- hsx.vn API analysis (spike § 1.2, § 2, § 3)

### Zone Ownership

| Zone | Owner | Files |
|------|-------|-------|
| `vps-scripts/` | dev-vps-crawls | fetch-hsx-bctc.py, discover-bctc-urls-browser.py, vps-proxy-server.js (optional) |
| `apps/mcp-server/` | dev-mcp-server | bctcDiscovery.ts (read-only; no changes if XHR internal to VPS script), bctcHttpFetcher.ts (may add header) |

---

## Subtask Decomposition

This task decomposes into **3 sequential subtasks:**

### TASK-BCTC-3a — ops-vps-fetch (prerequisite, runs in parallel with TASK-BCTC-3b planning)

**Objective:** Verify hsx.vn /n/ API accessible from VPS before dev begins coding

**Owner:** ops

**Acceptance Criteria (from AC-1):**
- SSH to Vinahost VPS (125.212.251.27)
- Run curl command (see AC-1 spec)
- Log result (curl output + HTTP status) in `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` § Verification
- Return: 200 + JSON → PASS (dev unblocked); 404 + error JSON → FAIL (escalate blocker)

**Effort:** S (1 curl command + log result)

**Handoff:** None (this is a verification task; result shared in spike doc)

---

### TASK-BCTC-3b — dev-vps-crawls: Implement fetch-hsx-bctc.py + unit tests

**Objective:** Create new Python XHR fetcher; integrate into discover script; unit test

**Owner:** dev-vps-crawls

**Blocks:** TASK-BCTC-3c

**Acceptance Criteria:**
- AC-2 (fetch-hsx-bctc.py exists + fetches correctly)
- AC-3 (discover-bctc-urls-browser.py integrates XHR as strategy 1)
- AC-6 (unit tests pass)
- All code in `vps-scripts/`

**Effort:** M (2h: script + tests + discover integration)

**Handoff:** docs/handoffs/TASK_BCTC-3b.md

---

### TASK-BCTC-3c — dev-mcp-server: MCP tool exposure + end-to-end test

**Objective:** Expose hsx.vn results through MCP `discover_bctc_urls` tool; test with live HOSE tickers

**Owner:** dev-mcp-server

**Depends on:** TASK-BCTC-3b (VPS script working)

**Acceptance Criteria:**
- AC-4 (VPS proxy route updated OR integration confirmed internal)
- AC-5 (end-to-end MCP test with VNM/VEA/HPG)
- AC-7 (zone enforcement)

**Effort:** M (2h: route/integration + MCP e2e test)

**Handoff:** docs/handoffs/TASK_BCTC-3c.md

---

## Architecture Guidance (from Spike § 4)

**Recommended approach: Option A (Python scraper)**
- Add `fetch-hsx-bctc.py` to `vps-scripts/`
- Integrate into `discover-bctc-urls-browser.py` as pre-Playwright step
- No changes to `bctcDiscovery.ts` or `bctcHttpFetcher.ts`
- Simpler, fewer moving parts

**Alternative: Option B (proxy route)**
- Add `/proxy/bctc-discover-hsx/:ticker` to `vps-proxy-server.js`
- Callable from `bctcDiscovery.ts` Strategy 0 path
- More plumbing, but allows A/B testing strategies at proxy level

**Recommended: Option A** — dev chooses implementation style during TASK-BCTC-3b.

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| **R-1:** /n/ API not accessible from VPS | ops-vps-fetch prerequisite verifies (AC-1) before dev codes |
| **R-2:** Some tickers have no PDF links | Confidence filtering (AC-2) + empty result handling (AC-3 fallback to Playwright) |
| **R-3:** Late BCTC filings miss date range | Extend `endDate` = +60 days beyond quarter end (AC-2 implementation detail) |
| **R-4:** filePath field absent for some items | Filter on `fileName.endswith('.pdf')` before mapping (AC-2) |
| **R-5:** Rate limiting from VPS | Monitor error rates during TASK-BCTC-3c MCP test; cadence is 1 call/ticker/15min (~30 req/15min, well under typical limits) |

---

## Success Metrics

- ✓ ops-vps-fetch AC-1 PASS (HTTP 200 from VPS)
- ✓ fetch-hsx-bctc.py handles VNM/VEA/HPG without error
- ✓ End-to-end: `discover_bctc_urls("VNM", "2026", "1")` returns ≥1 hsx.vn URL with source="hsx"
- ✓ All unit tests green
- ✓ No changes to `bctcDiscovery.ts` (strategy chain remains unchanged)

---

## Related Docs

- **Spike findings:** `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md` (complete API analysis)
- **Prior recon:** `docs/vps-sources/hsx-bctc/triage.md` + `recon.md`
- **BCTC pipeline context:** `docs/ARCHITECTURE.md` § BCTC Extraction (high-level flow)
- **VPS runbook:** `docs/protocols/bctc-extraction-runbook.md`
- **Previous BCTC fixes:** Commits `b029167c` (1916a-fix), `3732bcd9` (1916b-fix), `66275c67` (1915-fix-part1), `6fead90d` (1915-fix-part2)

---

## Next Steps (for dev-team sprint planning)

1. **ops-vps-fetch** — runs in parallel with TASK-BCTC-3b planning
2. **TASK-BCTC-3b** — dev-vps-crawls starts (independent of AC-1 result, but carries risk if AC-1 FAIL)
3. **TASK-BCTC-3c** — dev-mcp-server starts after TASK-BCTC-3b working + AC-1 verified

---

## PM Notes

- **WIP:** Current WIP = 0/2 (cycle complete as of 2026-05-15). TASK-BCTC-3 ready to assign.
- **Prerequisite status:** ops-vps-fetch is small (S) and critical. If FAIL, escalate blocker immediately.
- **Timeboxing:** Total effort ~4h (ops 0.5h + dev-vps 2h + dev-mcp 2h). Estimated completion 2026-05-17 assuming VPS access clear.
- **Handoff delivery:** After TASK-BCTC-3c ships, update `docs/spikes/` verification note + docs/TASKS.md → Done.
