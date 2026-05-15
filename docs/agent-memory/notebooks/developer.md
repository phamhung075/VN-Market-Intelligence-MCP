# Developer — Notebook

**Last updated:** 2026-05-15 | **Sprint:** 1914b

## Last session summary

Task 1914b — Fix `log_agent_work` two-call pattern documentation in all 10 agent package files.

**Root cause:** All 10 `.claude/tools/package/*.md` files documented `log_agent_work` with a fictitious single-call signature (`action/context/signal_ids`). The actual MCP API (`agentWorkLogTools.ts`) requires: Call 1 (`status: "running"` → `{ id }`), Call 2 (`id + status: "completed"|"error"`).

**What was done:** Docs-only. Table rows corrected, two-call recipe block added to each file. Broken example snippets in `report-analyzer.md` and `po.md` also fixed. All 10 files `Last Updated` bumped to 2026-05-15. `TASK_1914b.md` handoff written. 1914b moved to Done in TASKS.md.

**Commit:** `3b68df2c docs(1914b/agent-doc): 1914b fix log_agent_work two-call pattern in all 10 package files`

**Branch:** main

## Previous last session summary

Task 1915-fix-part2 — `scanDiskForStrandedPdfs()` filename fallback for non-watchlist tickers.

**Root cause:** The `else` branch (watchlist populated) had `if (!matched) continue` with no fallback. VEA/VNM PDFs on disk but absent from the 38-entry production watchlist were silently skipped every cycle.

**Fix:** Single block replacement in `bctcReparseJob.ts` lines 481-488: `if (matched) { ticker = matched.toUpperCase(); } else { tickerFromFilename fallback }`. `tickerFromFilename()` already existed from part1 — this wires the populated-watchlist miss path to it.

**Test updates:**
- DSE-09 added (RED → GREEN): watchlist `["HPG","VCB"]` + `VNM_Q4_2025.pdf` → VNM returned.
- DSE-06 updated: was "returns only VNM (VEA ignored)", now "returns both VNM + VEA via fallback". Both change is intentional — old assertion tested the bug.
- 1416c "regression guard" test updated: was "HPG skipped when not in watchlist", now "HPG picked up via filename fallback". WATCHLIST_SEED fix remains the canonical solution for #2682; filename fallback is additional safety net.

**Total: 15/15 GREEN (9 DSE + 6 1416c). tsc 0 errors.**

**Commits:** `6fead90d fix(1915/scheduler): 1915-fix-part2 scanDiskForStrandedPdfs filename fallback for non-watchlist tickers`
**Branch:** main (per CLAUDE.md: no branches for dev)
**Runtime AC pending:** ops redeploy + `financial_reports` VEA/VNM row count > 0.

## Previous last session summary

Task 1916a-vps-part — add `GET /proxy/bctc-discover/:ticker` route to `vps-scripts/vps-proxy-server.js`.

**Root cause (from SPIKE 1916):** `bctcQueueEnricherJob` Strategy 0 has always returned HTTP 404 because the `/proxy/bctc-discover` route was never deployed on `vps-proxy-server.js`. The route was referenced in docker-compose.yml (`BCTC_DISCOVER_URL`) and in `bctcHttpFetcher.ts` but did not exist on the VPS.

**What was done:**
- `vps-scripts/vps-proxy-server.js`:
  - Added `require("child_process").spawn` import
  - Added `BCTC_DISCOVER_SCRIPT` + `BCTC_DISCOVER_PREFIX` config constants
  - Added `runDiscoverScript(ticker, year, quarter, timeoutMs)` helper — spawns `python3 /root/discover-bctc-urls-browser.py` with validated args, parses `{"results":[{"url":"..."}]}` JSON, returns `string[]`, always resolves (never rejects)
  - Added `GET /proxy/bctc-discover/:ticker[?year=YYYY&quarter=Q]` route handler — validates ticker (alphanumeric, 1-10 chars), extracts optional year/quarter from query string, calls `runDiscoverScript`, returns `HTTP 200 + string[]` always
  - Updated startup log lines to advertise new route
  - Updated file header comment
- Deployed to VPS via SCP + `systemctl restart vn-vps-proxy.service`

**Verification results:**
- `curl -H 'X-API-Key: <key>' http://125.212.251.27:8765/proxy/bctc-discover/VCB?year=2025&quarter=4` → HTTP 200 `[]` (script ran in ~11s, no PDFs found for VCB Q4-2025 in HNX/UPCOM/SSC-NS)
- `curl http://125.212.251.27:8765/proxy/bctc-discover/VCB` → HTTP 401
- `/health` still → HTTP 200
- `/bctc-files/VCB/nonexistent.pdf` (with key) → HTTP 404 (no regression)

**Note on `[]` result:** `discover-bctc-urls-browser.py VCB 2025 4` returned empty — HNX/UPCOM showed no results for VCB (listed on HOSE, not HNX/UPCOM), and SSC-NS ticker input selector was not found. This is expected behaviour — VCB's PDFs come via HOSE/congbothongtin paths that the push pipeline handles separately. The route is functionally correct. The bctcQueueEnricherJob will now reach Strategy 0 and get a valid HTTP 200 response instead of 404.

**Commits:** `1b8f8cd5 feat(1916a/vps): add GET /proxy/bctc-discover/:ticker route to vps-proxy-server.js`
**Branch:** `task/1916a-vps-discover-route`
**No tests written:** VPS JS file, no test harness available locally for Node VPS scripts.
**tsc:** N/A (pure JS, not TypeScript).

## Previous last session summary

Task 1910b-effr-package-reg — zero-build: register `get_fed_liquidity_spread` in 3 agent packages.

**What was done:**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts`: added `"get_fed_liquidity_spread"` to `news_scout` (L45), `financial_analyst` (L77), `unified_coordinator` (L271)
- `.claude/tools/package/financial-analyst.md`: +1 row in Macro Intelligence section
- `.claude/tools/package/news-scout.md`: +1 row, new "US Monetary Chain" section; Last Updated bumped
- `.claude/tools/package/unified-agent.md`: +1 row in new "Macro Intelligence (COC)" section; Last Updated bumped
- `docs/SKILL_MANIFEST.md`: JSON arrays updated for all 3 agents; "Recently registered tools" table +1 row; Last updated bumped
- tsc: 0 errors (config-only, no code)
- No code changes — pure config + docs

**Commits:** c6981eb7 feat(1910/bootstrap): 1910b register get_fed_liquidity_spread in 3 agent packages
**Branch:** `task/1910b-effr-package-registration`
**Flag for ops:** agentBootstrap.ts edited — container rebuild required in next ops cycle.

## Previous previous last session summary

Task 1906a-headlock-cure-permanent — doc-only reclassification of HEAD.lock PREFLIGHT self-cure.

**What was done:**
- `docs/protocols/head-lock-self-cure.md` +13L net:
  - Status line added to header: PERMANENT OPERATIONAL POLICY (reclassified 2026-05-14)
  - New `§ (f) Policy Classification` — rationale, c87/c88/c89 3-cycle evidence, F1 structural cure cross-ref, `1897b-carry` tracking pointer
- `reports/TASK_HANDOFF_1906a-headlock-cure-permanent.md` created (ULTRA)
- No code changed, no tests, tsc gate N/A (doc-only)

**Commits:** (see SHA in branch task/c89-1906a-headlock-cure-permanent)
**Branch:** `task/c89-1906a-headlock-cure-permanent`

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- docs/data/ is gitignored — use `git add -f docs/data/*.json` for stats files.
- Semble search before grep for exploration.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.
- NEVER use `git commit -am` — greedily absorbs staged index content (C2 atomicity violation, c47 incident SHA 8bec73d3).
- `mock.calls[0]` TS type is `[]` (empty tuple) — cast via `as unknown as Array<[T]>` for tsc compliance.
- HEAD.lock from dead Spotlight process: verify no git process running, then `rm .git/HEAD.lock`.

## Carry-over for next session

- toolCount in tool-registry.json = 125 (categories sum). Source code has ~137 server.tool() calls — categories list is stale by ~12 tools. Future task should add missing tools to categories.
- Branch `task/1881a-impl-ssot` awaiting QA gate — do NOT merge until QA approves.
- Branch `task/c86-autocure-mw-dedup` awaiting QA gate.
- Branch `task/c87-1903-doc-pair` awaiting QA gate.
- Branch `task/c88-1905a-news-fetch-stealth-fix` awaiting QA gate.
- Branch `task/c89-1906a-headlock-cure-permanent` awaiting QA gate.
- Branch `task/1916a-vps-discover-route` awaiting QA gate (VPS-side of 1916a).
- 1916a dev-mcp-server part (bctcHttpFetcher.ts X-API-Key injection) is the parallel sibling task — see untracked `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` and `apps/mcp-server/src/__tests__/1916a-bctc-http-fetcher-api-key.test.ts` in git status.
- VCB returns [] from discover script because it is listed on HOSE, not HNX/UPCOM. Test with DPM (listed on HOSE but enricher has it as NULL) to verify full Strategy 0 path once bctcHttpFetcher.ts X-API-Key injection is also deployed.
