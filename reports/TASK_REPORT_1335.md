# Task Report: 1335+1336 — fix(news-pipeline): extend VN_SOURCE_IDS + createdAt guard
date: 2026-04-16
outcome: APPROVED

## Tasks
| ID | Title |
|----|-------|
| 1335 | fix(news-pipeline): diagnose and fix zero rag_analyses rows in production |
| 1336 | test(news-pipeline): TDD test 1335-news-pipeline-rag-insert.test.ts |

## Root Cause
`isVnRelevant()` in `vnRelevanceFilter.ts` only had 3 sources in `VN_SOURCE_IDS` (cafef, vnexpress, vneconomy). Items pushed from VPS with `source: "vietstock"/"vietnambiz"/"vnbusiness"/"tuoitre"/"nhandan"/"nld"` and items with empty `content` were dropped before insertion. Result: `rag_analyses` accumulated no rows from VPS sources, `topStories` was always empty in evening summaries.

## Changes
| File | Change |
|------|--------|
| `src/domain/services/vnRelevanceFilter.ts` | `VN_SOURCE_IDS` extended: +vietstock, +vietnambiz, +vnbusiness, +tuoitre, +nhandan, +nld, +vps (10 entries total) |
| `src/application/usecases/pollNews.ts` | `tryInsertEntry`: added `createdAt` guard — substitutes `new Date().toISOString()` if missing, logs warn |
| `src/__tests__/1335-news-pipeline-rag-insert.test.ts` | New TDD file — 4 test cases, TC-1/TC-2/TC-3 were failing before fix |

## Test Results
| Suite | Pass | Fail |
|-------|------|------|
| Task-specific (`1335-news-pipeline-rag-insert.test.ts`) | 4 | 0 |
| Full regression (`bun test`) | 4911 | 0 |
| TypeScript (`bun tsc --noEmit`) | — | 0 errors |

## Test Cases
| TC | Description | Before fix | After fix |
|----|-------------|------------|-----------|
| TC-1 | 3 vietstock items → rag_analyses COUNT = 3 | FAIL | PASS |
| TC-2 | assembleEveningSummary returns newsCount=3, topStories.length=3 | FAIL | PASS |
| TC-3 | Same URL pushed twice → exactly 1 row (INSERT OR IGNORE) | FAIL | PASS |
| TC-4 | Empty rag_analyses → newsCount=0, topStories=[] (baseline) | PASS | PASS |

## Verification Checklist
| Check | Result |
|-------|--------|
| Line 1 of test file is `process.env["DB_PATH"] = ":memory:";` | PASS |
| VN_SOURCE_IDS has 10 entries including vietstock/vietnambiz/vnbusiness/tuoitre/nhandan/nld/vps | PASS |
| `tryInsertEntry` has createdAt guard | PASS |
| DDD: domain/ no imports from infrastructure/ | PASS |
| Security: no process.env in src/ (excluding tests) | PASS |
| Worktree `.claude/worktrees/agent-ab2f3ccc` removed | PASS |

## DDD Compliance: PASS
## Security: PASS

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
- Branch `task/1335-1336-news-pipeline-fix` merged to `main` via `--no-ff`
- Branch deleted local + remote
- `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` — server healthy (toolCount=98)
- Sprint 110 marked Complete in TASKS.md
- `docs/data/project-stats.json` updated: sprint 111, totalTasksDone=291
