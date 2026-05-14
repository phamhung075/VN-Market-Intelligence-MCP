# dev-mcp-server — Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1907a-digest-predict-silence — diagnostic (2026-05-14, DONE)

**Mission:** Identify why digest-predict notebook has been silent for 3 days (last entry 2026-05-11 21:38 UTC).

**Finding:** Root cause (a) — digest-predict is a cowork/Claude Desktop agent, NOT a server-side cron. Zero registration in cronConfig.ts, startScheduler.ts, or cron-registry.json. Silence is a cowork-layer invocation failure (iTerm2/manual trigger stopped). Secondary: 2026-05-12 and 2026-05-13 session stubs exist (agent opened but wrote nothing = class c partial).

**No code change made.** Report: `reports/TASK_REPORT_1907a-digest-predict-silence.md`. Remediation is ops/cowork-layer (verify iTerm2 trigger + investigate why agent exited silently).

---

### Task 1881a-impl-mcp — source_tier retrofit 16 tool handlers (2026-05-14, DONE)

**Mission:** Retrofit `source_tier: 1|2|3` compile-time literal to 16 MCP tool handlers per architect brief (option a: JSON wrapper). AC-1 through AC-9.

**Scope:** 15 interface/mcp/tools files + 1 new contract test file.

**Tool tier assignments:**
- Tier 1 (official): `get_imf_signals` (IMF REST), `get_fed_liquidity_spread` (FRED), `get_insider_transactions` (SSC)
- Tier 2 (aggregator): `get_macro_snapshot`, `get_market_snapshot`, `get_foreign_flow`, `get_market_context`, `get_investment_clock_phase`, `get_ticker_intelligence`, `fetch_and_analyze`
- Tier 3 (derived): `get_carry_trade_signal`, `get_macro_calendar`, `get_yield_spread_signal`, `get_policy_signals`, `get_sentiment_trend`, `get_technical_indicators`

**Pattern used (per brief option a):**
- JSON-output tools: `{ source_tier: T as const, ...existingFields }`
- Text-output tools: `{ source_tier: T as const, text: existingString, fetchedAt }`
- Error paths: `{ source_tier: T as const, error: "..." }`
- `get_imf_signals`: + `indicators[].source_tier = 1` per-record
- `get_foreign_flow`: + `source_note: "fallback:cache"|"fallback:sse"|"fallback:none"` when not primary

**Test file:** `apps/mcp-server/src/__tests__/1881a-source-tier.test.ts` (196L, 20 tests)
- AC-2: JSON-output tools have source_tier at root
- AC-3: Text-output tools use JSON wrapper with source_tier + text + fetchedAt
- AC-4: get_imf_signals per-record source_tier=1
- AC-5: get_foreign_flow fallback source_note
- AC-8: source_tier is first key in serialized JSON

**Results:** 20/20 contract tests pass. tsc 0 errors. 9234/9268 suite pass (34 pre-existing fails unchanged).

**Commit:** `6dd412bd` on branch `task/1881a-impl-mcp`.

**Key patterns:**
- `as const` on tier literal enforces compile-time check (FR-5 / AC-7)
- Source_tier is first key — object literal ordering in V8 preserves insertion order
- `get_foreign_flow` `_testFallback` param added (z.string().optional()) to inject fallback path in tests — clean test injection pattern consistent with existing `_testCommodityClient` pattern
- DDD boundary: all 15 changed files are in interface/mcp/tools/ — zero domain/infra imports added

Zone health: 16 tool handlers retrofitted, all contract tests pass, no domain/infra boundary violations. 34 pre-existing failures (watchlist count, cron registry, stale build) unchanged and unrelated to this task.

---

### Task 1903a — MCP dispatch collision investigation (2026-05-13, STALE)

**Mission:** Re-verify Bug A (write_alert_verdict returns string) and Bug B (get_macro_snapshot returns portfolio data).

**Re-verification result: BOTH BUGS STALE.**

Bug A: `alertVerdictTools.ts:86-91` returns `{success, id, ticker, verdict}` — correct in source. No string literal return present.
Bug B: `macroTools.ts` formatMacroSnapshot emits `=== Macro Snapshot ===` block — correct. No portfolio/electricity bleed in source.

Root cause (from REQ_1903a.md + TASK_REPORT_1903a.md): stale-build artifact. Container ran old `.js` before c73 restart. Same pattern as 1898a. Both healed post-c73 restart.

Prior cycle work (commit `4833b052` via branch `task/1903a-regression-shape`, QA-approved at c77):
- NEW `apps/mcp-server/src/__tests__/1903a-dispatch-regression.test.ts` (199L, 10 tests)
- Suite A (WAV-REG-01..07): write_alert_verdict shape guard — all 7 pass
- Suite B (GMS-REG-02..04): get_macro_snapshot shape guard — all 3 pass
- No production code changes (test-only patch, stale-build fix not requiring source change)

Current state on main (c908475a): 10/10 pass, tsc 0 errors. No further action required.

**Pattern to remember:** Stale-build dispatch collisions always clear on container rebuild. Guard with regression shape tests (not prod code changes). Test file within 200L split-policy cap avoids follow-up split task.

---

### Task 1899a-cron — newsHeadlinesRefresh scheduler wiring (2026-05-13, DONE)

**Mission:** XS wiring task. Job body shipped in c80 (1899a-tests). Wire it into the scheduler.

**3 changes:**
1. NEW `apps/mcp-server/src/scheduler/news-analysis/index.ts` — single-line barrel: `export { newsHeadlinesRefreshJob } from './newsHeadlinesRefreshJob'`
2. `apps/mcp-server/src/scheduler/cronConfig.ts` — added `newsHeadlinesRefresh: Bun.env['CRON_NEWS_HEADLINES_REFRESH'] ?? '*/30 * * * *'`
3. `apps/mcp-server/src/scheduler/startScheduler.ts` — import from `./news-analysis/index.js` + `cron.schedule(CRONS.newsHeadlinesRefresh, ...)` with `jobRunRepo.wrapRun`
4. `mcp.config.json` — added `"scheduler": { "newsHeadlinesRefresh": { "cadence": "*/30 * * * *", "enabled": true, ... } }`

**Worktree base:** Was d532495b (stale vs main 2afd9533). Merged main first before branching — per c80 lesson.

**TSC:** 0 errors. Tests: 9210 pass / 137 fail (pre-existing worktree env failures: ENOENT test data dirs, network errors).

**Commit:** `40514118` on branch `task/1899a-cron-scheduler`.

**Pattern note:** cronConfig.ts uses `Bun.env['KEY']` bracket notation (consistent with existing entries using bracket notation for dynamic keys). startScheduler.ts uses `jobRunRepo.wrapRun()` pattern (not `recordJobRun(getDb(), ...)`).

---

### push-path-fix — VPS push path failures (2026-05-13, DONE)

**Mission:** Fix two MCP-side push path failures flagged by dev-vps-crawls recon.

**Failure 1 (vps-prices):** fetch-prices.sh posting to `__MCP_BASE__/api/push-prices` → 404.
**Failure 2 (vn-news-rss):** fetch-vn-news.sh posting to `__MCP_BASE__/api/push-news` → 404.

**Investigation outcome:**
- Both `/api/push-prices` (server.ts:317) and `/api/push-news` (server.ts:387) ARE registered and correctly handled.
- Root cause: Cloudflare tunnel had no `/api/*` ingress rule — all `/api/` traffic hit catch-all `http_status:404` before reaching mcp-server. Config fix was already applied (`~/.cloudflared/config.yml` has `path: ^/api/` rule). Tunnel restart needed (ops task).
- VPS body shapes confirmed: stock price unit conversion (×1000) correct; index/global_index as-is correct; news body `{title, url, publishedAt, content, source}` matches handler exactly.

**Code changes:**
- NEW `src/__tests__/1892b-vps-contract-push.test.ts` — 10 tests, 0 fail (P1-P6 prices, N1-N4 news)
- UPDATED `docs/vps-sources/vps-prices/recon.md` — root cause + contract confirmation
- UPDATED `docs/vps-sources/vn-news-rss/recon.md` — root cause + contract confirmation
- NEW `docs/signals/qa-2026-05-13T09-32-54Z.json` — QA signal with ops action required

**No mcp-server route/handler changes needed. Zone is healthy.**

SHA: 3d6383a2. tsc clean. 10 new tests pass.

Zone health: both push routes healthy and contract-verified; Cloudflare tunnel restart still pending (ops dependency); no code drift detected.

---

### Task 1879b — get_fed_liquidity_spread MCP tool (#130) (2026-05-12, DONE)

**Files:** 4 new, 3 modified
- NEW `domain/services/macro/computeFedLiquiditySpread.ts` — pure fn, OLS slope, InsufficientDataError
- NEW `infrastructure/db/fredQueries.ts` — fetchEffrIorbSamples (INNER JOIN EFFR+IORB on date)
- NEW `interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts` — registerFedLiquiditySpreadTool, tool #130
- NEW `src/__tests__/1879b-fed-liquidity-spread.test.ts` — 10 tests (5 describes × 2 its each)
- `domain/services/macro/index.ts` — barrel export for computeFedLiquiditySpread
- `interface/mcp/tools/macro/index.ts` — barrel export for registerFedLiquiditySpreadTool
- `interface/mcp/tools/registry.ts` — registered as tool #130

**Key decisions:**
- OLS slope over last 30 samples (not all samples) — per spec
- slope > 0.01 = widening, < -0.01 = narrowing, else stable
- InsufficientDataError thrown on empty input (spec requirement)
- trend30d=null when < 30 samples (not error — valid partial data state)
- T5 DDD audit: strips comment lines before checking for banned patterns (Date.now() appeared in JSDoc comment)
- fredQueries.ts uses `date('now', '-' || ? || ' days')` — SQLite dynamic date math
- `window` renamed to `window30` to avoid JS reserved word collision

**Results:** 10/10 pass. tsc clean. SHA a6d4b555.
Note: worktree branch does NOT include 1879a (sha 4e4aaf5e not in history). fred_series_daily schema
created in test in-memory DB; prod schema created by 1879a when it merges.

---

### Task 1880b — get_pyramid_tier MCP tool (#128) (2026-05-12, DONE)

**Domain:** `classifyPyramidTier(assetClass: string): PyramidTierResult` — pure static Map lookup, 18 entries covering VN + global asset classes, 5 tiers (cash/bonds/equity/alt/speculative).
**Normalization:** `.toLowerCase().trim()` before lookup. Unknown → `{ tier: null, reason: "unknown_asset_class" }`. Never throws.
**MCP handler:** `registerPyramidTierTool` appended to `investmentClockTools.ts`. Input schema `{ asset_class: z.string() }`. Output `{ asset_class, tier, tier_description }`.
**Registry:** tool #128, `registerPyramidTierTool` in `registry.ts`.
**Tests:** 23 pass / 0 fail in `1880b-pyramid-tier.test.ts`. Full suite 9273 pass. tsc clean.
**Commit:** `d73e70f7` on branch `task/1880b-pyramid-tier`.

Key patterns:
- Domain fn has zero imports (no infra, no schema). Arch brief §4 R4 maintained.
- handler imports domain fn from `../../../../domain/services/macro/pyramidTier.js`
- `tier_description` omitted from unknown-input return shape (undefined, not null)

---

### Task 1878b — compute_accruals MCP tool (#129) (2026-05-12, DONE)

**Domain:** `computeAccrualPoint(input: AccrualsInput): AccrualPointResult` — pure function in `domain/services/financial-reports/accruals.ts`. Zero infrastructure imports. Formula: `(NetIncome - OCF) / TotalAssets`.
**Tests:** 12 pass / 0 fail in `1878b-compute-accruals.test.ts`. T1-T6 domain unit (no SQLite), T7-T12 tool integration (in-memory SQLite). tsc clean. SHA 4d7ab740.
