# TASK REPORT 1304 — feat(briefing): integrate TA signals (RSI/SMA) into morning briefing

**Status:** PASS — merged to main
**Date:** 2026-04-16
**Branch:** `task/1304-ta-morning-briefing` (deleted)
**Merge commit:** `merge(1304): integrate TA signals (RSI/SMA) into morning briefing`

---

## QA Results

| Check | Result |
|---|---|
| `bun test src/__tests__/1304-ta-morning-briefing.test.ts` | 10 pass / 0 fail |
| Briefing regression (101, 1159, 1137, 172, 1254) | 72 pass / 0 fail |
| Full suite (`bun test`) | 4793 pass / 4 fail (all pre-existing, unrelated to 1304) |
| `bun tsc --noEmit` | 0 errors |
| DDD: `domain/` imports | `technicalIndicators.ts` has zero imports — clean |
| DDD: `assembleBriefing.ts` in `application/` imports `domain/services/technicalIndicators` | Allowed (application → domain) |
| DDD: no `infrastructure/` in `domain/` (new code) | Pass |
| Security: no `process.env` in changed files | Pass |
| `taSummary` optional in `DailyBriefing` | Confirmed (`taSummary?: TaSignal[]`) |
| RSI thresholds strict `> 70` / `< 30` | Confirmed (lines 524–525 of assembleBriefing.ts) |
| Step 17 wrapped in `try/catch` | Confirmed — outer catch logs warn, `taSummary` stays `[]` |

---

## Pre-existing failures (not introduced by this task)

| Test | File |
|---|---|
| Task 1221 — Scheduler DB lock > runWeeklyPortfolioReport skips when DB lock is fresh | pre-existing |
| 296 OCR pipeline e2e smoke test | pre-existing (timeout) |
| Task 297 — computeForeignFlowScore fix | pre-existing |
| Task 308 — Dynamic Tool Registry (tool count mismatch) | pre-existing |

---

## Acceptance Criteria Verification

| AC | Description | Result |
|---|---|---|
| AC-2 | `formatBriefingMessage` renders "📡 TA Tín hiệu:" section when `taSummary` has entries | Pass |
| AC-3 | Section absent when `taSummary` is empty or undefined | Pass |
| AC-4 | `computeTaFn` is injectable; neutral-only tickers excluded from `taSummary` | Pass |
| AC-5 | Throwing `computeTaFn` does not reject; briefing returns with `taSummary = []` | Pass |
| AC-7 | RSI = 70.0 treated as neutral (strict `>` threshold); no "quá mua" label for boundary value | Pass |

---

## Files Changed

| File | Change |
|---|---|
| `src/__tests__/1304-ta-morning-briefing.test.ts` | New — 10 tests for all ACs |
| `src/application/usecases/assembleBriefing.ts` | Step 17 added: `computeTaFn` injectable, `TaSignal` type, `taSummary` field on `DailyBriefing` |
| `src/scheduler/morningBriefingJob.ts` | TA section in `formatBriefingMessage`; imports `TaSignal` |
| `TASKS.md` | Task 1304 → Done |

---

## Post-merge

- Local branch deleted: `task/1304-ta-morning-briefing`
- Remote branch deleted: `origin/task/1304-ta-morning-briefing`
- Server restarted: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`
- Health check: `{"status":"ok","toolCount":98}`
- `bun tsc --noEmit` post-merge: 0 errors
