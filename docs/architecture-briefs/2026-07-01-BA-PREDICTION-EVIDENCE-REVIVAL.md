# Architecture Brief — BA-PREDICTION-EVIDENCE-REVIVAL

**Date:** 2026-07-01 | **Architect cycle:** 2026-07-01T06:38Z | **Sprint:** PREDICTION-EVIDENCE-REVIVAL
**Input:** `docs/handoffs/BA-PREDICTION-EVIDENCE-REVIVAL.md` (BA §1-9 + PO Review §10, APPROVED-RESHAPED)
**BUILD-STANDARD:** not-applicable (bug-fix/refactor + docs-only flow wiring — no new microservice, no new primitives)

**Zone:** multi — 2 parallel-safe hops, NO file overlap (confirmed live below):
- **Hop 1** — `apps/mcp-server/` → specialist `dev-mcp-server`
- **Hop 2** — `docs/agents/` → specialist **`agent-father`** (not a dev-* zone; corrects BA §6's tentative "agents-architect" — per `.claude/skills/dispatch/SKILL.md` line 47: "create / edit / review / maintain agent → `agent-father` — All agent-file lifecycle." `docs/agents/**` is not in `system-map.json .project.zones[]` at all, so PM must NOT let zone-detect Tier-3 fall through to generic `developer`.)

This brief does NOT re-litigate the root cause (settled, BA+PO live-verified). It brownfield-verifies every file path BA cited, corrects several path/naming errors found live, and — critically — **completes the FR-2.2 mandatory diagnostic probe at design time** (I ran it live; verdict below), which changes hop-1's FR-2.2 deliverable from open-ended "diagnose" to a concrete, bounded fix.

---

## 0. Corrections to BA/PO spec (live-verified — read before assigning tasks)

| # | BA/PO said | Live reality | Impact |
|---|---|---|---|
| C1 | `insider_accumulation` root cause lives in `domain/services/leadershipSignal.ts::detectAccumulationStreaks` (BA §9 DDD map) | `detectAccumulationStreaks` is a **module-private function inside `apps/mcp-server/src/scheduler/market-data/insiderCheckJob.ts:78-107`** (raw SQL query, scheduler layer). It does NOT exist in `leadershipSignal.ts` (that file only has `classifyInsiderTransaction` + `detectMassInsiderBuy`, domain-pure, no DB access). | Dev must not go hunting in `leadershipSignal.ts` — the bug is not there at all (see §2 below, real root cause is upstream of this function entirely). |
| C2 | FR-2.1 tools_package doc paths: `docs/agents/tools/package/news-analysis.md`, `financial-analysis.md`, `report-analysis.md`, `market-analysis.md` | **These files do not exist.** Actual files (verified `ls docs/agents/tools/package/`): `news-scout.md`, `bctc-analyst.md`, `market-watcher.md` (convention = `<agent-id>.md`). `market-analysis.md` doesn't exist; `market-analyst.md` exists but belongs to a **different agent** (`market-analyst`, not `market-watcher`) — do not touch it. | If dev had followed BA's literal paths it would create 4 phantom files nothing ever loads, silently failing FR-2.1. |
| C3 | ARCH-RATIFY-PER-3 / PO reshape: reuse seeded strings "e.g. `bctc_revenue_growth`, `price_momentum_5d`, `news_sentiment_stock`" | Live `evidence_likelihood_ratios` (47 rows) does **NOT** contain `bctc_revenue_growth`, `bctc_pe_ratio`, or `bctc_debt_equity` anywhere. These three strings are the tool-docstring *example* list in `evidenceTools.ts:83-84,94-96` — BA copied illustrative examples, not the actually-seeded set. The real seeded BCTC types are: `bctc_net_profit`, `bctc_regulatory_compliance`, `bctc_report_overdue`, `bctc_roe_ratio`, `bctc_roe_strong`, `bctc_valuation_premium` (all frozen `sample_size` 1-2, `last_updated=2026-05-24`). `price_momentum_5d` IS seeded (bullish+bearish, n=1 each); `price_momentum_20d` is **not** seeded (would start genuinely cold). | §4 below redesigns FR-2.1's bctc-analyst wiring against the REAL seeded types so PER-3's actual intent (avoid fragmenting into brand-new cold types) is honored. `price_momentum_20d` is still fine to add (honest cold-start ramp per BA §6), just flagged as new. |
| C4 | FR-2.2 "probe conditional, fix if silent-bug" — probe deferred to dev | **Probe is DONE (architect ran it live, see §2).** Verdict: confirmed silent-bug, root cause fully traced to a specific line. Dev does not need to re-diagnose — just implement §2's fix. |

All four corrections are load-bearing — PM should propagate this table verbatim into the two task specs so dev doesn't rediscover them the hard way.

---

## 1. Hop 1 — `apps/mcp-server/` (dev-mcp-server)

### FR-1.1 — `get_evidence_summary` direction+horizon bug [QUICK WIN]

**File:** `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:172-311` (tool `get_evidence_summary`)
**DDD layer:** interface (unchanged)

**Verified bug (exact lines):**
- L238-244: raw SQL `SELECT likelihood_ratio, sample_size FROM evidence_likelihood_ratios WHERE evidence_type = ? AND direction = ? AND horizon_days = ?` called with **hardcoded literals `"bullish", 10`** — ignores `f.direction` entirely, and this raw SQL duplicates the existing `getLikelihoodRatioStore.ts` query logic instead of reusing it (pre-existing minor DDD violation — interface layer hand-rolling infrastructure SQL).
- L249-254: `getLikelihoodRatio(database, f.evidence_type, "bullish", 10)` — same hardcode, second call site.
- L177: tool docstring itself claims "for the bullish direction at 10-day horizon" — misleading, must be corrected too.

**Why horizon must ALSO not stay hardcoded at 10** (this is the subtlety PO's ARCH-RATIFY-PER-1 flagged): the live TRUSTED row PO wants surfaced is `foreign_flow_institutional / bearish / horizon_days=5, sample_size=18`. A fix that only swaps `"bullish"` → `f.direction` but keeps `horizon_days=10` fixed would still miss it (the `bearish/10` row for that pair is a *different*, untrusted/absent row). `evidence_fragments` has **no horizon column** — horizon is purely an `evidence_likelihood_ratios` dimension (5/10/20, one row each per `(type,direction)` pair, computed by `baseRateComputationJob` for all 3 horizons whenever fragments are resolvable — verified in `baseRateComputationJob.ts:75,193`).

**Design — horizon selection algorithm** (resolves ARCH-RATIFY-PER-1, PO-concurred "honest UNTRUSTED, no interpolation"):
1. Call **`getLikelihoodRatios(db, f.evidence_type, f.direction)`** (existing exported function, `likelihoodRatioStore.ts:126-142` — reuse, do not re-duplicate raw SQL; this also fixes the pre-existing DDD violation noted above). Returns 0-3 rows ordered by `horizon_days ASC`.
2. If empty → honest UNTRUSTED, `sampleSize=0`, `likelihoodRatio=1.0`, `horizonDays=null` ("no data").
3. Else: pick the **first row with `sample_size >= 10`** (TRUSTED) if any exists, ascending horizon order (prefers the shortest resolvable horizon).
4. Else (no horizon is trusted): pick the row with the **largest `sample_size`** among the available rows (ties broken by smallest horizon) — display it honestly as UNTRUSTED with its real `n`. **Never blend/average two horizons' ratios into a synthetic number** (= "no interpolation").
5. Add `horizon_days` to the displayed line for transparency: `... | LR=X.XX (n=Y, horizon=Zd) [TRUSTED|UNTRUSTED]`.

This is deterministic, reuses existing store functions (no new SQL), and is exactly what surfaces the `bearish/5d/n=18` row for `foreign_flow_institutional` fragments while still reporting `bullish/10d/n=4` (untrusted) fragments honestly if no trusted alternative exists at any horizon for them.

**Regression test (BA §6 edge case, mandatory):** new test file (or extend nearest existing `evidenceTools`/`evidenceSummary` test) asserting:
- Bearish fragment + trusted bearish/5d row → surfaces TRUSTED, not the old hardcoded bullish/10d value.
- A ticker whose fragments are ALL bullish and only a bullish/10d row exists → output unchanged from pre-fix behavior (no regression for the previously-correct case).
- No horizon at all for a (type,direction) pair → honest UNTRUSTED n=0, not a crash / not silently defaulting to some other pair's row.

### FR-2.2 — `insider_accumulation` zero-yield — PROBE DONE, verdict: **SILENT BUG (confirmed)**

**Live probe run 2026-07-01 (docker exec, named-volume `market.db`, read-only):**
```
insider_transactions: 0 rows EVER (MAX/MIN(from_date) = null, COUNT(*) = 0, all-time — not just the 30d streak window)
cron_job_runs (job_name='insiderCheckJob'): status='success', rows_written=0 on 100% of runs (checked last 15 runs back to 06-23; DISTINCT rows_written ever = {0})
docker logs (last 72h): every single run logs
  "[fetchInsiderTransactions] Failed to fetch SSC insider data: ... error: HTTP 502 for http://125.212.251.27:8765/proxy/ssc-insider"
  at apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts:140
direct curl to the VPS proxy route confirms it is live (returns 401 without API key — route exists, not DNS/network-dead)
```

**Full root-cause chain (all 3 hops live-verified, not inferred):**
1. `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts:131-168` — `fetchInsiderTransactions()` calls the VPS proxy at `/proxy/ssc-insider`, gets HTTP 502, and **by design "never throws — returns [] on any error"** (its own docstring, line 13) — logs via `console.error` and swallows.
2. `vps-scripts/vps-proxy-server.js:743-765` — the VPS-side proxy route itself: `fetchUpstream(SSC_INSIDER_UPSTREAM)` (upstream = `https://congbothongtin.ssc.gov.vn/...ketquagiaodich.jspx`) is throwing on every request, which the proxy correctly reports as `502 Bad Gateway`. This means the SSC government portal is unreachable/erroring **from the Vietnam-based VPS itself** — not a geo-block issue (the whole point of routing through the VPS is to be inside VN), so this is either an upstream outage, a URL/structure change on the SSC side, or a VPS-side network/TLS issue. This is genuinely a **third zone** (`vps-scripts/`, not `system-map.json` zone-mapped, same "developer" generic specialist as the prior `FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS` precedent) and requires **live SSH probing of the VPS** (`ssh root@$VINAHOST_IP` + `curl` directly to `congbothongtin.ssc.gov.vn`) that I cannot do from this sandbox and that may not even be fixable by a code change (external government portal could genuinely be down/restructured — same failure class as the `project_bctc_hnx_ssl_outage` precedent in memory).
3. `apps/mcp-server/src/scheduler/market-data/insiderCheckJob.ts:131-279` — `runInsiderCheck()` receives `[]` from the fetcher (step 1 always empty), so `rowsStored=0`, `streaks=0` (nothing to detect — `detectAccumulationStreaks` at line 78-107 has literally never had a single row to query), `alertsInserted=0`, and `recordJobRun` wraps this as `status='success'` because **no exception was ever thrown at any layer** — this is the exact "silent-empty-success" class the sprint's own precedent (`EVIDENCE-ACCUM-SILENT-CRON`, 53d00955) fixed for a different job.

**Verdict: NOT honest-zero.** `insider_transactions` has never received a single row in ~2 months of "successful" daily runs — this is not "genuinely no qualifying accumulation streaks," it's "the raw disclosure fetch has been failing on every single run and nothing surfaces that fact."

**Fix design — scoped to stay IN apps/mcp-server (no scope balloon, per PO B2 decision):**

Per PO's explicit "no scope balloon" instruction and the fact the deeper root (§chain step 2, VPS↔SSC connectivity) needs live VPS SSH access outside this sprint's bounded scope, the correct minimal in-zone fix is **closing the observability gap**, not chasing the external portal. This directly matches two standing project lessons (`feedback_passive_health_masks_dead_data`, `feedback_silent_swallow_serial_bugs`) and reuses an existing, exact-fit pattern already in the codebase:

- **Extend `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts`** (do NOT create a new watchdog — this file already implements the identical pattern for 4 other VPS-fed data streams: `market_prices`, `rag_analyses`, `daily_ohlcv`, foreign-flow). Add:
  - `readLatestInsiderTimestamp(): Date | null` — `SELECT MAX(fetched_at) FROM insider_transactions` (mirrors `readLatestPriceTimestamp` etc., same try/catch-null pattern).
  - A new `INSIDER_STALE_MS` threshold (job is daily, not intraday — recommend ~4 days / `4 * 24 * 60 * 60 * 1000`, generous enough to allow occasional legitimate zero-new-disclosure days but tight enough to have caught the real ~2-month silence within the first week).
  - Add to the `stale[]` collection + Telegram message body (reuse existing `service: "vn-ssc-insider-fetch"` style label + existing cooldown/dedup — this job already runs `*/10 2-8 * * 1-5`, i.e., only during VN market hours; that's fine since `insiderCheckJob` itself runs at 01:00 UTC = 08:00 VN, inside that window).
  - This makes the failure **visible in WORK Telegram** on the very next watchdog tick after the daily job silently no-ops, instead of running silent for 2 months.
- **Do NOT attempt to fix the VPS↔SSC connectivity itself in this sprint.** Flag it as a new independent BACKLOG item (same decoupling pattern PO already used for B3/`FIX-PREDICTION-SIGNALS-EMPTY`): e.g. `FIX-VPS-SSC-INSIDER-502` — zone `vps-scripts/`, specialist `developer` (generic, matches `FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS` precedent), requires live VPS SSH diagnosis, root may be an external-site outage that isn't fixable by VN-Market code at all.

  **UPDATE 2026-07-29 (`FIX-VPS-SSC-INSIDER-502` closed CLOSED-NO-FIX):** live SSH was not even needed — direct HTTP reproduction sufficed. `congbothongtin.ssc.gov.vn` returns HTTP 503 "No server is available to handle this request" on EVERY path (including domain root), reproduced identically both directly (non-VN egress) and via the VPS proxy (VN egress) — rules out geo-block and VPS/proxy misconfig. Parent `ssc.gov.vn` front (nginx) is healthy, but the WebCenter/WebLogic application tier itself (`ssc.gov.vn/webcenter/portal/ubck`) times out entirely — same app tier `congbothongtin` runs on. Confirmed genuine external SSC outage, not code-fixable. Explicitly did NOT add retry/backoff to `vps-proxy-server.js`'s `fetchUpstream()` for this route — that exact fix was already tried and reverted for the sibling SSC endpoint (`B-05-FU-SSC-503-RETRY`, commit `a817b5139`, `vps-scripts/discover-bctc-urls-browser.py`) because it blew the mcp-server caller's timeout budget and caused a 17-day queue freeze; same caller-budget mismatch applies here (`sscInsider.ts` `withDeadline(30_000)` vs. any useful backoff window). Documented both findings as an in-code comment at `vps-scripts/vps-proxy-server.js` `SSC_INSIDER_UPSTREAM` so a future agent doesn't re-discover and re-revert the same retry. No code fix applied; the FR-2.2 watchdog above remains the correct operator-facing signal for a prolonged outage.

**DoD for FR-2.2 (dev deliverable):** (a) verdict already recorded above — dev cites this brief, does not need to re-probe; (b) implement the watchdog extension; (c) file the new BACKLOG signal for the VPS-side chase. No change to `detectAccumulationStreaks` logic itself — it is correct code that has simply never been exercised (0 input rows), so "fixing" it would be fixing something that isn't broken.

### FR-1.2 — `baseRateComputationJob` cadence weekly → daily (B4, in-scope)

**Two files must change TOGETHER — this is a critical coupling BA/PO did not surface:**

1. `apps/mcp-server/src/scheduler/cronConfig.ts:62` — `baseRateComputation: Bun.env.CRON_BASE_RATE_COMPUTATION ?? '7 19 * * 0'` → change day-of-week `0` (Sunday-only) → `*` (daily): **`'7 19 * * *'`**. Same minute:hour (19:07 UTC), no collision with neighboring jobs at hour 19 (`macroIndicatorRefresh` is `13 19 * * *`, `sscCheck` is `0 20 * * *`, `cascadeBacktest` is `37 20 * * *` — all different minutes).
2. `apps/mcp-server/src/scheduler/macro/baseRateComputationJob.ts:299` — **`WEEKLY_CADENCE_MS = 604_800_000`** is a SEPARATE constant feeding `shouldSkipRecoveryReplay(db, "baseRateComputationJob", WEEKLY_CADENCE_MS)` (line 300), the T4 idempotency dedup guard (`startupHelpers.ts:160-222`) that skips the run if a `status='success'` row exists within the last `cadenceMs * 0.9`. **If only the cron expression is changed and this constant is left at 7 days, the daily cron tick will fire but `shouldSkipRecoveryReplay` will silently skip every run except the first one each week** — a second silent-empty-success bug, self-inflicted by this very fix if the constant is missed. Rename to `DAILY_CADENCE_MS = 86_400_000` and pass it through unchanged at the call site.
3. Update jsdoc header comments in `baseRateComputationJob.ts` (lines 1-21 module doc "Weekly scheduler job (Sunday 19:00 UTC..." and line 294 "@idempotency ... 90% of weekly cadence (604.8s window = 6 days 1h12m)") to daily language (90% of 1 day = 21.6h window).
4. `docs/standards/cron-jobs.md:38` — update the Evidence & Prediction Pipeline Jobs table row from "19:00 UTC Sunday (02:00 VN Mon) | `baseRateComputationJob` — weekly recompute..." to "19:00 UTC daily (02:00 VN) | `baseRateComputationJob` — daily recompute...".

No test-strategy risk beyond the coupling above — `baseRateComputer.ts` (domain, pure calc) is completely unaffected; this is purely a scheduling-cadence change.

---

## 2. Hop 2 — `docs/agents/` (agent-father)

### FR-2.1 — Wire `record_evidence_fragment` into producer flows [PRIMARY monoculture fix]

`record_evidence_fragment` tool contract (verified `evidenceTools.ts:77-122`): `stock, evidence_type, direction (bullish|bearish|neutral), magnitude (0-1), confidence (0-1), source_agent, ttl_days?(default 30)`. No production code change needed — confirmed `evidence_type` has zero enum/allowlist constraint anywhere in the write path (`evidenceFragmentStore.ts` — plain TEXT column, only `direction` has a CHECK constraint), so any new type string flows through cleanly.

**news-scout** — `docs/agents/news-scout/flow/stage-sentiment.md`, insert after the "Score each article: -1.0 (bearish) to +1.0 (bullish)" step (line 36) and the impact-chain trace (lines 38-49):
- For each watchlist ticker with a scored article: `record_evidence_fragment(stock=<ticker>, evidence_type="news_sentiment_stock", direction=score>0.15→bullish|score<-0.15→bearish|else neutral, magnitude=min(1.0,abs(score)), confidence=clamp(impact_score/10, 0.3, 0.95) if impact_score available else 0.5, source_agent="news-scout", ttl_days=7)`.
- For macro-wide (non-ticker-specific) news (PMI, commodity chain, Brent/Gold triggers already computed at lines 51-66): `evidence_type="news_sentiment_macro"`, same direction/magnitude logic, `stock="MARKET"` or the nearest existing macro-fragment convention (verify against the 3 existing frozen `news_sentiment_macro` rows for the `stock` value convention used — same table, do not guess a new convention).
- Both `news_sentiment_stock` and `news_sentiment_macro` are **already-seeded types** (confirmed live) — this is the single highest-value wiring since `news_sentiment_stock` already has a `bullish/n=16` frozen TRUSTED-adjacent row waiting to be topped up.
- Tools_package doc: add a new "### Evidence Pipeline (Prediction Engine)" table section to **`docs/agents/tools/package/news-scout.md`** (correcting BA's wrong filename `news-analysis.md` — see §0 C2) with a `record_evidence_fragment` row, mirroring the existing table format (e.g. the "Inter-Agent Communication" section at line 54-57).

**bctc-analyst** — `docs/agents/bctc-analyst/flow/stage-analyze.md`, insert after Step 2 "Analyze" (`get_bctc_full(code)` call, line 12-13, runs for ALL watchlist tickers every routine cycle — prefer this over the Release-mode-only R1 block at line 64 to maximize fragment volume/coverage, matching the sprint's monoculture-fix goal):
- Redesigned against the REAL seeded types (§0 C3), reusing signals `stage-analyze.md` **already computes** — zero new BCTC parsing:
  - `bctc_valuation_premium` (bearish only, matches seeded direction exactly) — from the already-computed `valuation_verdict` (line 32): `EXPENSIVE` or `AVOID` → bearish fragment; `CHEAP`/`FAIR` → skip (don't force a mismatched direction on a "premium" type).
  - `bctc_roe_ratio` / `bctc_roe_strong` (bullish, matches seeded direction) — from `get_bctc_full(code).roe` (confirmed live field, `bctcFullTools.ts:80,248`): strong ROE (e.g. >15%, dev to pick exact cutoff against `TA_MIN_ROWS`-style existing conventions) → `bctc_roe_strong` bullish; moderate positive ROE → `bctc_roe_ratio` bullish.
  - `bctc_regulatory_compliance` (bearish, matches seeded direction) — from Step 3's already-called `get_legal_risk_signals()` (line 49): any flagged legal/regulatory risk → bearish fragment.
  - `bctc_report_overdue` (bearish, matches seeded direction) — from Step 1's already-computed overdue check (`get_earnings_calendar()` / `list_stored_pdfs()` "missing reports", line 8-10): overdue ticker → bearish fragment.
  - `bctc_net_profit` (seeded bearish only today) — from R4's `beat_miss`/`net_profit_delta_pct` (release mode, line 86-88): `miss` → bearish (matches seed); `beat` → bullish (net-new direction pair, acceptable honest cold-start per BA §6 ramp rule).
- Tools_package doc: **`docs/agents/tools/package/bctc-analyst.md`** (not BA's `financial-analysis.md`/`report-analysis.md` — see §0 C2).

**market-watcher** — `docs/agents/market-watcher/flow/cycle.md`, insert after Step 1 "Price analysis" (`get_technical_indicators(code)` call, line 77):
- `evidence_type="price_momentum_5d"` (seeded, PRIMARY — reuses existing frozen bullish+bearish/n=1 rows) derived from RSI/MACD direction agreement on the technical-indicators response (dev to verify exact live JSON field names before wiring — `get_technical_indicators` returns "RSI/BB/MACD... with signals" per `docs/agents/tools/list/get_technical_indicators.md`, exact key spelling not yet nailed down in this brief; a quick live tool call during implementation resolves it in under a minute).
- `evidence_type="price_momentum_20d"` (net-new, cold-start-acceptable per BA §6) — same derivation over the longer lookback (`get_technical_indicators(code, days=60)` already available per the tool's own `days` param).
- Tools_package doc: **`docs/agents/tools/package/market-watcher.md`** (not BA's `market-analysis.md`, which doesn't exist — see §0 C2; do not confuse with the unrelated pre-existing `market-analyst.md`).

### FR-3 — Strip false "Sharpe>1.0 hard gate" language (B1 = design B, docs-only)

**File:** `docs/agents/digest-predict/init.md:60-67` (identity-level `workflows.validate_prediction_claims` block) + line 13 (`capabilities` list).

Verified: this `workflows` block is never referenced by any flow step in `daily-predict.md` or `monday.md` (no `compare_backtest_runs` call anywhere in either file) — it is pure dead-narrative that the agent has been reading and mis-narrating as a live blocker for 12 consecutive notebook cycles (per BA). The ACTUAL coded gate is `daily-predict.md` P-5 (line 57-58): `sample_size<10 → top_likelihood_ratio=1.0` (neutralizes the multiplier, does not block claim creation).

**Design (PO B1 concurred):**
1. Rewrite `workflows.validate_prediction_claims.steps` (lines 63-67) — remove the "Only create_prediction_claim if... Sharpe > 1.0..." hard-gate-sounding line entirely. Replace with an accurate advisory-only framing, e.g.:
   ```
   steps:
     - "compare_backtest_runs is OPTIONAL supplementary color for the notebook narrative — it is NOT a precondition for create_prediction_claim."
     - "The actual coded gate is daily-predict.md P-5: sample_size < 10 → likelihood_ratio neutralized to 1.0 (no directional edge from evidence), NOT a block. Claims are still created at reduced confidence."
     - "Do not narrate 'blocked by Sharpe gate' or similar — no such hard gate exists in shipped code."
   ```
   (Or delete the `workflows` block outright if PM/agent-father judges the advisory value not worth keeping — either satisfies B1; rewrite is my recommendation since the backtest-comparison capability description still has legitimate informational value once decoupled from the false "hard gate" framing.)
2. Line 13 `capabilities`: "Validate predictions against backtest evidence before publishing" also overstates a hard gate — soften to "Optionally reference backtest evidence for calibration color" or remove, for consistency with #1.

No flow-file changes needed (nothing calls the workflow today) — this is purely an `init.md` identity-block correction. Tools_package doc unaffected (no new tool usage).

---

## 3. Risk flags

- **RISK-1 [HIGH, self-inflicted-avoidance]:** FR-1.2's two-file coupling (cron expression + `WEEKLY_CADENCE_MS`/`shouldSkipRecoveryReplay` window) — missing either half silently defeats the cadence upgrade. Both must land in the SAME commit/task.
- **RISK-2 [MEDIUM]:** FR-1.1's horizon-selection algorithm changes displayed LR values for tickers that previously showed a (wrong but stable) bullish/10d number — any downstream consumer treating that old number as a stable reference is now seeing a different (correct) one. BA already flagged this (§6); regression test above covers it.
- **RISK-3 [MEDIUM]:** FR-2.2's watchdog extension only makes the failure *visible* — it does not restore insider evidence flow. If PO/PM expect `insider_accumulation` fragments to actually start appearing this sprint, that expectation must be corrected now: it depends entirely on the decoupled VPS-side backlog item, timeline unknown, possibly not fixable via code at all (external portal).
- **RISK-4 [LOW]:** FR-2.1's `bctc_net_profit` bullish direction is net-new (seed only has bearish) — same honest cold-start ramp as `price_momentum_20d`, not a defect, just flagged so QA doesn't mistake `sample_size<10` there for a bug.
- **RISK-5 [LOW]:** hop-2 tools_package doc edits + flow-doc edits are NOT in `system-map.json .project.zones[]` — PM must route to `agent-father`, not let zone-detect Tier-3 fall through to generic `developer` (which would still work mechanically but breaks the dispatch table's own stated ownership rule and skips agent-father's agent-file-lifecycle checks).

## 4. Test strategy

- **Hop 1:** `bun test` — new/extended unit test for `get_evidence_summary` horizon-selection (3 cases in §1 FR-1.1); existing `insiderCheckJob`/`vpsProxyWatchdogJob` test suites extended with the new `readLatestInsiderTimestamp` reader + stale-branch (injectable reader pattern already established in `vpsProxyWatchdogJob.ts` — follow it, do not reinvent); no test needed for the pure cron-string change (config-only) beyond confirming `shouldSkipRecoveryReplay` unit tests (if any exist) still pass with the renamed constant.
- **Hop 2:** docs-only — no `bun test`. Verification = a live cowork-agent dry-run cycle (or manual `call_tool` invocation) confirming each of the 3 producer agents actually calls `record_evidence_fragment` with valid params against the live MCP server, plus a follow-up live probe (`evidence_fragments` row count + `evidence_type` diversity) 24-48h post-deploy to confirm the monoculture actually breaks. QA should gate on: `evidence_fragments` distinct `evidence_type` count > 1 within one digest-predict cycle window.

## 5. DDD layer map (corrected, supersedes BA §9)

- **domain:** `baseRateComputer.ts` (pure calc, unaffected — confirmed).
- **infrastructure:** `evidenceFragmentStore.ts` (unaffected, reused as-is), `likelihoodRatioStore.ts` (FR-1.1 reuses `getLikelihoodRatios`, no changes needed to the store itself), `insiderCheckJob.ts` (FR-2.2 — `detectAccumulationStreaks` lives HERE, not in `leadershipSignal.ts`), `vpsProxyWatchdogJob.ts` (FR-2.2 fix target — extend, don't duplicate), `baseRateComputationJob.ts` + `cronConfig.ts` (FR-1.2), `sscInsider.ts` (read-only reference, no change this sprint), `vps-scripts/vps-proxy-server.js` (read-only reference, decoupled backlog).
- **interface:** `evidenceTools.ts::get_evidence_summary` (FR-1.1).
- **application/agent-flow (`docs/agents/**`):** `news-scout/flow/stage-sentiment.md`, `bctc-analyst/flow/stage-analyze.md`, `market-watcher/flow/cycle.md` + their 3 correctly-named tools_package docs (FR-2.1); `digest-predict/init.md` (FR-3).

---

**Scan clean:** true ✓ (both zones brownfield-indexed; all cited paths live-verified via direct file reads + one live docker-exec DB/log probe; no DDD violations introduced by this design — one PRE-EXISTING minor violation identified and fixed as a byproduct of FR-1.1, see §1).

**Standard Detection tag:** `BUILD-STANDARD: not-applicable` (bug-fix/refactor + docs-only flow wiring, no new microservice, no new primitives) — applies to both hops.

**Next:** pm — decompose into 2 tasks (hop1 → dev-mcp-server, hop2 → agent-father), no `blocks_on` between them (parallel-safe, zero file overlap confirmed).
