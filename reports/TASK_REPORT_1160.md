# Task Report — Task 1160: GREEN Phase — Extend DailyBriefing + 3 Query Steps

> **Branch**: `task/1159-morning-briefing-enrichment`
> **Date reviewed**: 2026-04-13
> **Final status**: APPROVED
> **DDD layer**: application (assembleBriefing.ts) + interface/scheduler (morningBriefingJob.ts)

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-13 | Sprint 067 kicked off |
| Todo → In Progress | 2026-04-13 | Developer assigned |
| In Progress → Review | 2026-04-13 | Developer submitted (commit a5d178c) |
| Review → Done | 2026-04-13 | QA approved — no changes requested |

---

## Role Activity Log

### Developer
- Files modified:
  - `src/application/usecases/assembleBriefing.ts` — BEARISH_WARNING_THRESHOLD export, 3 new public types (InsiderBriefingRow, ForeignFlowBriefingRow, EvidenceScoreBriefingRow), 3 internal SQLite row types, DailyBriefing 3 new optional fields, 3 query helpers (queryInsiderRecent, queryForeignFlowSummary, queryEvidenceTopScores), Steps 14-16 in assembleBriefing()
  - `src/scheduler/morningBriefingJob.ts` — formatBriefingMessage() extracted as named export, 3 new Telegram sections (Insider Moi, Dong Tien Ngoai, Tich Luy Bang Chung), BEARISH_WARNING_THRESHOLD imported
- TDD cycle followed: YES — red phase committed in tasks 0c87a43 + a466dcb before green phase a5d178c
- Tests written: `src/__tests__/1159-morning-briefing-enrichment.test.ts`, 31 tests

### QA — Review 1
- Date: 2026-04-13
- Outcome: APPROVED
- `bun test src/__tests__/1159-morning-briefing-enrichment.test.ts` result: PASS (31/31)
- `bun test` (full regression) result: 4069 pass / 33 fail (33 failures are pre-existing, confirmed against last main commit cedfd25; none relate to task 1160)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test src/__tests__/1159-morning-briefing-enrichment.test.ts

  Task 1159 — Morning Briefing Intelligence Enrichment
  AC-1: insiderRecent — watchlist filtering + ordering
    ✓ includes only watchlist stocks (VCB, FPT) — excludes non-watchlist ACB
    ✓ returns at most 3 rows ordered by executedVolume DESC
    ✓ each row carries all required fields: code, type, executedVolume, insiderName, fromDate
    ✓ excludes rows where fetched_at is older than 24h
  AC-2: insiderRecent empty-state
    ✓ insiderRecent is [] when no rows match (empty table)
    ✓ insiderRecent is [] when watchlist is empty
    ✓ briefing is still returned (no exception) when insiderRecent is empty
  AC-3: foreignFlowSummary — net-buy and net-sell classification
    (all 8 tests pass)
  AC-4: evidenceTopScores — bullish leaders + bearish warnings
    (all 6 tests pass)
  AC-5: Telegram sections
    (all 5 tests pass)
  AC-6: Complete empty-state
    (all 4 tests pass)

  31 pass / 0 fail
```

**Coverage notes**: All 6 acceptance criteria from REQ-067 have direct test coverage. Edge cases tested include: empty watchlist (SQL IN guard), 24h window boundary (fetched_at exclusion), zero foreign_volume exclusion, fragment_count = 0 filter, bearish deduplication from bullish leaders, phantom header suppression.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

### NON-BLOCKING Issues

None. One minor observation worth noting: the implementation uses `(string | number)[]` as SQL parameter type (stricter than the `unknown[]` suggested in TECH-067). This is correct and better — no issue.

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL Injection | queryInsiderRecent uses placeholders | None | `?` with `.all(since24h, ...watchlistCodes)` — parameterized |
| 2 | SQL Injection | queryForeignFlowSummary uses placeholders for 2 IN clauses | None | `.all(...watchlistCodes, ...watchlistCodes)` — parameterized |
| 3 | SQL Injection | queryEvidenceTopScores uses placeholders for 2 IN clauses | None | Same pattern — parameterized |
| 4 | process.env | Both modified files checked | None | Zero process.env usage |
| 5 | any types | Both modified files checked | None | Zero `any` type usage; SQL params typed as `(string | number)[]` |

**Security verdict**: CLEAN

---

## DDD Compliance

| Check | Result |
|-------|--------|
| `src/domain/` imports from `infrastructure/` | PASS (0 new violations introduced by this task) |
| `src/domain/` imports from `application/` | PASS (0 new violations) |
| assembleBriefing.ts is application layer | PASS — imports from domain/ and infrastructure/ only, as permitted |
| morningBriefingJob.ts is interface/scheduler layer | PASS — imports from application/usecases only |
| BEARISH_WARNING_THRESHOLD defined in application, imported in scheduler | PASS — correct direction |
| formatBriefingMessage extracted as named export | PASS — enables direct unit testing of Telegram formatting |

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: insiderRecent populated from insider_transactions (watchlist only, max 3, DESC) | PASS | |
| AC-2: insiderRecent empty-state — [], no crash, no phantom header | PASS | |
| AC-3: foreignFlowSummary — top 3 net-buy + top 3 net-sell, zero excluded | PASS | |
| AC-4: evidenceTopScores — bullish leaders + bearish warnings, dedup | PASS | |
| AC-5: Telegram message includes all 3 new sections when data present | PASS | formatBriefingMessage exported; tested directly |
| AC-6: Complete empty-state — all [], no crash, no phantom headers | PASS | |
| FR-1: DailyBriefing 3 new optional fields | PASS | insiderRecent?, foreignFlowSummary?, evidenceTopScores? |
| FR-2: queryInsiderRecent (Step 14) | PASS | Exact SQL from REQ-067; try/catch wrapping |
| FR-3: queryForeignFlowSummary (Step 15) | PASS | Exact SQL from REQ-067; net-buy/sell post-split |
| FR-4: queryEvidenceTopScores (Step 16) | PASS | BEARISH_WARNING_THRESHOLD = -2.0 exported; dedup correct |
| FR-5: Telegram section renderers | PASS | Vietnamese headers; typeLabel/dirLabel/icon per spec |
| FR-6: hasContent guard unchanged | PASS | 3 new arrays not added to hasContent |
| BEARISH_WARNING_THRESHOLD = -2.0 exported | PASS | Line 33, assembleBriefing.ts |
| TDD commit order (red before green) | PASS | Commits a466dcb (red) before a5d178c (green) |

---

## Merge Summary

Branch `task/1159-morning-briefing-enrichment` is ready for merge.

```bash
git checkout main
git merge --no-ff task/1159-morning-briefing-enrichment -m "merge(1160): green phase — extend DailyBriefing + 3 query helpers for briefing enrichment"
```

- Commits in branch: 4 (2 red phase, 1 green phase, 1 TASKS.md update)
- Files changed: assembleBriefing.ts, morningBriefingJob.ts (+ test file from task 1159)
- Type errors at merge: 0
- Tests added: 31 new tests (task 1159), all passing

---

## Notes for Next Tasks

- Task 1161 (Render 3 new Telegram sections in morningBriefingJob.ts) is already complete — the Developer bundled FR-5 into this task alongside FR-1 through FR-4. The `formatBriefingMessage()` export and all three Telegram sections are implemented and tested in this branch. Task 1161 can be marked Done without additional work.
- Task 1162 (Advance project-stats.json currentSprint) can proceed immediately after merge.
- The `formatBriefingMessage` export is new and fully tested via AC-5 and AC-6 tests — future changes to briefing formatting should add tests against this function directly.
