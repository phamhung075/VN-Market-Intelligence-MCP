# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-mcp-server

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract, not a false promise (see orch-state sprint_goal.entries[COWORK-GUARANTEED-SLOT-CATCHUP]).
**Agent:** dev-mcp-server
**Started:** 2026-07-23T08:57:56Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T08:57:56Z
**task-id:** BCTC-REPORT-ID-LOOKUP-TOOL
**what-done:** Added `get_bctc_report_id` MCP tool (ticker[+year][+quarter] -> financial_reports.id, restricted to refine_status='DONE'); wired into registry.ts + regenerated docs/data/project-stats.json#toolCount (183->184) + docs/data/tool-registry.json via the existing bun scripts/gen-tool-registry.ts + gen-project-stats.ts generators; updated bctc-analyst flow/main.md ESC-5 Step 5d to resolve report_id before calling get_bctc_refined; 5-case bun test (DONE match, not-yet-refined typed-null, no-report typed-null, non-DONE-status exclusion, multi-match ordering).
**what-considered:**
- Name `get_bctc_report_lookup` (per backlog AC-1 alt wording) vs `get_bctc_report_id` — chose the latter: matches the `get_bctc_<noun>` convention of every sibling BCTC tool (get_bctc_full/ocf/series/refined/page_text/page_image/pending_refine).
- Extend get_bctc_full's own response to also carry report_id vs a standalone lookup tool — chose standalone: get_bctc_full's JSON is publishability-gated (PUB-1..8), so a report stuck below the publish bar would still need a raw lookup path; a dedicated tool is also independently callable by ESC-5 without re-running the whole compound tool.
- Error-shape on zero matches: `{error}` (like get_bctc_refined) vs typed-absent `{report_id:null}` — chose typed-absent per task AC ("empty/typed-absent for a not-yet-refined one") + it mirrors ESC-5's own graceful "no rows = FALSE, not an error" precedent.
**why-decision:** Root cause was structural (no tool anywhere surfaced report_id by ticker+period — confirmed by reading get_bctc_full's full JSON output, which omits report_id from structured_data); a dedicated, DONE-restricted lookup tool is the minimal fix that unblocks all 4 downstream report_id-consuming tools without touching their contracts.
**why-change:** no change from task brief.
---

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-23T15:01:12Z
**task-id:** MD-FUNC-01-FIX
**what-done:** Verified `get_market_snapshot` (marketTools.ts) already emits a `vn_index{price,change_pct,direction}` struct from live `fetchVnIndex()` data (VNDirect vnmarket_prices), fixed under commit 815ccaedd/ddc36452e; confirmed by live gateway call (`mcp_call get_market_snapshot {}`) returning `vn_index:{price:1699.38, change_pct:1.85, direction:"up"}` — non-null, plausible, matches breadth block (189 adv/122 dec). No code change needed.
**what-considered:**
- Re-implement fix from scratch vs verify existing implementation — chose verify-only after `git log -- marketTools.ts` showed the exact "MD-FUNC-01 FIX" comment already committed 2026-06-16, predating the currently-running container image (built 2026-07-22), so the fix is live, not stale.
- Trust schema comment vs re-derive from a live payload — per task directive, called the live tool through gateway (not just reading the test file) to authoritatively confirm all 3 fields non-null.
**why-decision:** Root-cause check confirmed no defect exists (field present, correctly mapped, dynamically derived from live changePct sign — not hardcoded); re-doing the fix would be redundant churn.
**why-change:** no change from task brief — outcome is "no fix needed", documented per dispatch instructions.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-23T15:35:00Z
**task-id:** ALT-FUNC-02-FIX
**what-done:** Verified `get_alert_accuracy` already emits top-level `accuracy_rate:number|null in [0,1]`, fixed under commit `815ccaedd` (2026-06-10, comment "ALT-FUNC-02 FIX"); live gateway call (`mcp_call get_alert_accuracy {}`) returned `accuracy_rate:1, insufficientSample:false, scored_pct:19, total:628, hits:110`. `docs/data/quality-checklist.json` ALT-FUNC-02 already `status:"PASS"` since 2026-06-10T18:00Z citing this same fix commit — backlog row `ALT-FUNC-02-FIX` was created 09:27 UTC same day, ~10h BEFORE the fix landed at 17:24 UTC, and was never pruned. No code change.
**what-considered:**
- Re-derive/patch accuracy_rate vs verify existing contract — chose verify-only: `git log -- alertAccuracy.ts` shows the exact null-when-insufficient contract already shipped and covered by 3 dedicated tests (`1982-quality-burndown-CHIJ.test.ts` "FIX 3 — ALT-FUNC-02").
- Treat live `insufficientSample:false`+`accuracy_rate:1` as sufficient AC proof vs demanding a non-null value under ALL conditions — chose the former: AC only requires the *available* rate be in [0,1]; null-on-zero-scoreable is the documented, tested, already-QA-passed contract for the data-gap case.
**why-decision:** Stale-signal orphan backlog row (BOUNDED-1 auto-picked a pre-fix snapshot 6 weeks old); re-implementing would be redundant churn against an already-PASS, already-tested contract.
**why-change:** no change from task brief — outcome is "no fix needed, stale backlog row", documented per dispatch instructions (route data-gap distinctly per task's own fallback clause; here there IS no data gap live).

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-23T15:55:00Z
**task-id:** BCT-OBS-01-FIX
**what-done:** Live-probed (not self-report) whether `dataAuditDaily` (`runDailyAudit`, `dataAuditJob.ts`) produces a WORK-channel report. Traced code: unconditional `writeSystemLog`/`upsertAuditState`, then `maybeSendTelegram` gates `sendTelegramWork` on `hasIssues`. Live `cron_job_runs`: 4 consecutive real daily fires (07-19..07-22) all `success`, each `system_logs` row nonzero cleaned+warnings -> `hasIssues=true` every day. Live `get_system_status` (fresh gateway call) confirms `TELEGRAM_BOT_TOKEN`/`TELEGRAM_INFO_WORK_CHANNEL_ID` SET + `TELEGRAM_ENABLED=true` in the running container. No code change.
**what-considered:**
- Trust checklist PASS alone vs re-derive live — chose live re-derivation: checklist recheck_how (`read_telegram_reports`) is itself proven wrong by source read (`telegram.ts`): that table only persists BUG-channel sends (`sendTelegramBug`->`insertReport`); `sendTelegramWork` has zero DB persistence by design, so a DB-only recheck can never observe WORK delivery — confirms the checklist's own "original FAIL was wrong recheck_how" annotation.
- Wait for the imminent 16:00 UTC tick for a byte-for-byte fresh send vs close on the 4-day unbroken streak + fresh env-probe — chose close now: the extra tick would only add one more `success` row (near-certain given the streak), not a new delivery-observability channel (no message-id persisted anywhere for WORK sends either way) — marginal evidence for wall-clock cost.
**why-decision:** All 3 preconditions (cron fires, hasIssues true, Telegram env live+enabled) independently confirmed via real runtime state, not the checklist row alone; AC-6/AC-7 unit tests (157-data-audit-job.test.ts, 18/18) match live behavior.
**why-change:** no change from task brief — outcome is "no fix needed", verification-only per dispatch instructions.

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-07-24T21:20:00Z
**task-id:** FIX-OHLCV-CORP-ACTION-CONTINUITY
**what-done:** Added domain service `ohlcvContinuityGuard.ts` (per-exchange board-limit resolution + adjacent-bar discontinuity detector + reconcile-or-flag) and application usecase `getContinuityCheckedOhlcvSeries.ts`; wired both `daily_ohlcv` read sites in `get_technical_indicators` (technicalIndicatorTools.ts) through it so a corp-action-discontinuous bar can no longer feed RSI/MACD/BB.
**what-considered:**
- Hardcode a single board-limit % (rejected — ticket explicitly requires resolving the real per-exchange limit HOSE/HNX/UPCOM, not one value)
- Build a full corp-action calendar/adjustment-factor source to always auto-reconcile (rejected — no such live data source exists in this pipeline; left as a pluggable extension point `ReconcileOptions.knownAdjustmentFactor` for a future source)
- Guard at write-time (ohlcvWriteService) vs read/serving-time — chose read-time: a boundary is only detectable once the NEXT bar exists (need the post-boundary close to compute the move), so it cannot run at single-row write time; must scan the served series.
**why-decision:** Read-time guard placed in the exact path the 2026-06-16 behavioral gate (Class 4, real VJC -24.87% HOSE move) identified as the poisoning point (get_technical_indicators local closes) directly closes the documented live incident with a generic (no ticker/date literal) mechanism; tests use the REAL VJC 2026-06-08..19 series fetched live from the production DB (no fabricated bars).
**why-change:** no change from plan — ticket's file target ("apps/mcp-server OHLCV continuity/adjustment layer (new)") matched this design 1:1.

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-07-24T22:05:11Z
**task-id:** FIX-AGENTSIGNALS-FROMAGENT-SCHEMA
**what-done:** Verified `agent` is already schema-optional on `get_agent_signals` (landed by 8a6b798ce FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT, 2026-06-19 — 2 days after this ticket was minted against the same root cause, never reconciled). Extracted the inline zod shape to exported `GetAgentSignalsShape` (agentSignalTools.ts) so tests assert the REAL runtime schema, not a hand-mirrored copy; added `FIX-AGENTSIGNALS-FROMAGENT-SCHEMA.test.ts` (8 tests: schema-level + real McpServer/handler/DB end-to-end) proving `{from_agent:'news-scout'}` returns rows/empty-array, never -32602.
**what-considered:**
- Reintroduce a zod `.refine()` to hard-reject "neither present" per fix_spec's literal wording — rejected: that would surface as an MCP protocol-level parse failure (the same -32602 class this ticket exists to eliminate), regressing the already-shipped Direction-A design (handler-level readable-error guard, tested by FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts AC-1).
- Skip new tests since the fix pre-exists — rejected: no test in the repo asserted against the REAL exported shape (existing precedent test hand-mirrors the schema, a drift risk) or drove the literal news-scout repro call through a real McpServer end-to-end.
**why-decision:** Closing a duplicate/stale backlog row correctly means proving the ALREADY-LANDED fix against this task's own literal verification_gate with non-redundant, drift-proof coverage — not re-implementing or reverting a shipped design.
**why-change:** No production behavior change — this is a stale-backlog-row closure (dedup gap), not a functional fix; only export+test additions, zero handler/schema semantics changed.
