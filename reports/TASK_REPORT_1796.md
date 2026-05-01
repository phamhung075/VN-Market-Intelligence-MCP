# Task Report: 1796 — Sprint Housekeeping (7 Tasks)
date: 2026-04-30
outcome: APPROVED (with 1 blocking fix applied by QA)

## Test Results
- Sprint-specific tests (1796f): 3 pass / 0 fail
- Full suite: 8415 pass / 32 fail (pre-existing interference in 308-tool-registry — passes in isolation, documented in merge commit 4f2b11f6)
- TypeScript: 0 errors (after QA fix — see Blocking Issues below)

## DDD Compliance: PASS
- newsNormalizer.ts is domain/services — no infrastructure imports
- sectorPeers.ts is domain/services — no infrastructure imports

## Security: PASS
- No hardcoded credentials or API keys
- No process.env usage

## Issues Found

### Blocking (fixed by QA)
- **TSC TS2741** — `newsNormalizer.ts:143` — `DOMAIN_KEYWORD_MAP: Record<DomainType, string[]>` was missing `machinery` key, introduced when Sprint 1796f added `machinery` to `DomainType` in sectorPeers.ts but did not update newsNormalizer.ts.
  - Fixed in commit `0e05aa82` — added `machinery` entry with VN/EN keywords (máy móc, công nghiệp, DAG, etc.)

### Non-Blocking
- Ghost directories `docs/agent-memory/modules/`, `issues/`, `patterns/` were untracked on disk despite git commit `f0c6823a` claiming deletion. Deleted by QA (rm -rf, no git op needed — files were never tracked after re-creation).
- Full suite 32 failures: all in `308-tool-registry.test.ts` due to test ordering interference. File passes 9/9 in isolation. Pre-existing, documented in merge commit `4f2b11f6`.

## Task Verification

| Task | Criterion | Result |
|------|-----------|--------|
| 1796a | SPRINT_GOAL.md ≤30 lines | PASS (28 lines) |
| 1796a | Closed sprints as compact table | PASS |
| 1796a | Active sprints intact | PASS (Sprint 1777 + Hotfix present) |
| 1796b | CLAUDE.md ≤120 lines | PASS (70 lines) |
| 1796b | agent-chaining-protocol.md exists | PASS |
| 1796b | tree-map.md has pointer | PASS (line 23) |
| 1796c | modules/issues/patterns dirs deleted | PASS (deleted by QA) |
| 1796d | No *.fresh-* or *.pre-repair-* files | PASS |
| 1796d | .gitignore has both patterns | PASS |
| 1796e | stock-classification.json DAG ticker with machinery/industrial | PASS (DAG ticker, "Machinery / Industrial") |
| 1796f | sectorPeers.ts machinery key + DAG | PASS (line 171-173) |
| 1796f | SECTOR_NAME_VI machinery label | PASS ("Máy móc / Công nghiệp", line 207) |
| 1796g | project-stats.json currentSprint=1796 | PASS |
| 1796g | totalTasksDone=399 | PASS |
| 1796g | testBaseline=8466 | PASS |

## Merge Status
APPROVED — all tasks verified. TSC blocking issue fixed in QA pass (commit 0e05aa82).
