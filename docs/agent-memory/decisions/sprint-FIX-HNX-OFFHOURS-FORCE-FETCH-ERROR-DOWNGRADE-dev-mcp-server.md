# Decision Journal — FIX-HNX-OFFHOURS-FORCE-FETCH-ERROR-DOWNGRADE

**task-id:** FIX-HNX-OFFHOURS-FORCE-FETCH-ERROR-DOWNGRADE
**agent:** dev-mcp-server
**date:** 2026-07-25T03:21:21Z
**zone:** apps/mcp-server/

## Context
Backlog row (minted_by po, minted_at 2026-06-21T03:14:47Z, source "health-recheck 3275
BUG-2") targeting `force:true` HNX/UPCOM fetches at `sectorRotationTools.ts:181/188`,
`portfolioTools.ts:160/163`, `marketTools.ts` (forceOpts, used at 244/253) — claim: an
off-hours `force:true` bypass fires an upstream expected-rejection (closed-session/302)
that the fetch path logs at ERROR, polluting logs / false-alarming monitors.

## Finding (verify-live premise reconciliation)
The effective fix **already landed** under a differently-named task —
`FIX-HNX-OFFHOURS-ERROR-DOWNGRADE`, commit `93e9dbeb8` (2026-06-21T01:56:45Z UTC),
QA-approved `a73bf035d` (2026-06-21), rebuild CONFIRMED live `f0ac29998`
(2026-06-21T02:04:36Z UTC, "RAW marker hit both sites", `rebuild_required:false`).

**Timeline proves this row is a stale duplicate, not a new gap:**
- `93e9dbeb8` (fix landed) → 2026-06-21T01:56:45Z UTC
- `f0ac29998` (rebuild CONFIRMED live) → 2026-06-21T02:04:36Z UTC
- THIS row minted → 2026-06-21T03:14:47Z UTC — **78 min after the fix landed, ~70 min
  after the rebuild was confirmed live.** The row's own note admits the triage was
  file-grep-only: `"gateway-blind triage: file-confirmed force:true sites, live
  log-severity NOT probed"` — the filer saw the three `force:true` call sites in the
  tool files but never checked whether the underlying fetcher's log severity had
  already been fixed.

**Confirmed at source (HEAD, 2026-07-25):** `apps/mcp-server/src/infrastructure/fetchers/hnx.ts`
already gates BOTH ERROR emit sites (`fetchHnxPrices` L354, `fetchUpcomPrices` L436) on
`isVnTradingWindow(options?.now)` — imported from the shared SSOT
`domain/services/tradingWindow.ts` (same helper reused across `server-startup.ts`,
`pushPricesHandler.ts`, `foreignFlowFetcherJob.ts`, `dataFreshnessTools.ts`, etc. — this
IS "the shared session helper", not a new/separate one). Inside window → `logger.error`
(genuine in-hours failure stays loud). Outside window → `logger.debug` (expected
off-hours empty/rejection is silent). No hardcoded window — `isVnTradingWindow` owns the
Mon–Fri 02:00–08:59 UTC definition.

**Call-site audit** (all 3 named sites + generic-mandate sweep):
- `sectorRotationTools.ts:181/188` → calls `fetchHnxPrices`/`fetchUpcomPrices` directly,
  no additional error-log wrapper of its own around HNX/UPCOM.
- `portfolioTools.ts:160/163` → same; failures caught by outer try/catch → `logger.warn`
  (not error), and by the 8s `withDeadline` silent-fallback.
- `marketTools.ts` (`forceOpts={force:true}`, L218, used L244/L253) → `.catch()` on each
  fetch logs `logger.warn` (not error) — this path only fires on a thrown rejection;
  `fetchHnxPrices`/`fetchUpcomPrices` never throw (empty-array contract), so this catch is
  defensive and irrelevant to the ERROR-log complaint.
- The ONLY ERROR-level log anywhere in the off-hours `force:true` path is the "all
  sources failed" line INSIDE `hnx.ts` itself — already gated, as above.
- Repo-wide sweep for other HNX/UPCOM `force:true` call sites: `grep -rn
  "fetchHnxPrices\|fetchUpcomPrices" apps/mcp-server/src --include="*.ts" | grep -v
  __tests__` → exactly these 3 tool-file sites + 1 non-force call
  (`intelligenceCycle/defaults/defaultFetchPrices.ts:45`, `force` defaults false, already
  session-gated by the fetcher's own `!options?.force && !isTradingSession()` early
  return — out of scope, not force:true). **No missed site.**

**Test coverage already satisfies baseline_pass**: `FIX-HNX-OFFHOURS-ERROR-DOWNGRADE.test.ts`
(6 tests, pre-existing, not authored by this task) asserts exactly what this ticket's
verification requires — off-hours expected-rejection (empty-result + network-failure) →
non-ERROR (debug, filtered by minLevel=info) for both `fetchHnxPrices` and
`fetchUpcomPrices`, AND market-hours genuine failure → ERROR retained, using injected
`options.now` clock (open/closed-weekday/weekend instants). Per
`feedback_file_prior_art_check_before_minting_row`, adding a second duplicate test file
asserting the identical behavior would be prior-art-blind churn — not done.

## Change
**None — zero runtime-behavior delta, zero new test file.** This task ships no code.
Re-implementing an already-shipped, QA-approved, rebuild-confirmed-live fix under a new
name would be pure churn (ref: `feedback_bgfan_double_closeout_race_stale_snapshot` /
`FIX-AGENTSIGNALS-FROMAGENT-SCHEMA` precedent — identical shape: stale duplicate row
filed shortly after the real fix landed, before backlog reconciliation caught up).

## Fence (RAW, run 2026-07-25T03:21–03:22Z)
1. RED-baseline evidence (proves the offending pre-fix behavior existed and was fixed):
   `git show 93e9dbeb8 -- apps/mcp-server/src/infrastructure/fetchers/hnx.ts` — diff shows
   parent commit had unconditional `logger.error("[hnx] all HNX price sources failed")`
   / `logger.error("[hnx] all UPCOM price sources failed")` at both sites; `93e9dbeb8`
   wraps both in the `isVnTradingWindow` branch. Current HEAD retains this branch
   unmodified (confirmed by `Read` of `hnx.ts` L354/L436 today).
2. `bunx tsc --noEmit` (apps/mcp-server) → **exit 0**.
3. `bun test src/__tests__/FIX-HNX-OFFHOURS-ERROR-DOWNGRADE.test.ts
   src/__tests__/027-hnx-prices.test.ts src/__tests__/026-hose-prices.test.ts` →
   **50 pass / 0 fail / 6 skip** (101 expect calls). The 2 `level:"error"` log lines
   captured in output are the market-OPEN cases (`failingClient()`) — correctly still
   ERROR, proving the discrimination (expected off-hours rejection → non-ERROR; genuine
   failure → ERROR) holds today, not just at the original fix's landing.
4. `bun test src/__tests__/186-sector-rotation.test.ts
   src/__tests__/1059-sector-rotation-override.test.ts
   src/__tests__/TASK17-PAGE9-sector-rotation-endpoint.test.ts
   src/__tests__/283-portfolio-conviction-batch.test.ts
   src/__tests__/182-portfolio-risk.test.ts src/__tests__/084-tool-market.test.ts` →
   **91 pass / 0 fail** (245 expect calls) — sector/portfolio/market tool suites green,
   no regression.
5. Grep sweep (no missed force:true HNX/UPCOM site):
   `grep -rn "fetchHnxPrices\|fetchUpcomPrices" apps/mcp-server/src --include="*.ts" |
   grep -v __tests__` → only the 3 named tool-file sites + 1 non-force scheduler call.
   Confirmed exhaustive.

## Closeout
No code/test commit — nothing to ship. This journal is the only artifact. Task closes
as a **verified duplicate of already-completed, already-live work**
(`FIX-HNX-OFFHOURS-ERROR-DOWNGRADE`, commit `93e9dbeb8`, QA `a73bf035d`, rebuild-confirmed
`f0ac29998`). `rebuild_required: false` — nothing changed to rebuild; the fix has been
running in production since 2026-06-21. Orch-state flip: this row → DONE (not REVIEW/QA —
there is no diff for QA to review), `next_agent: null`, head → idle terminal. Left
uncommitted per closeout contract (dispatcher commits orch-state).
