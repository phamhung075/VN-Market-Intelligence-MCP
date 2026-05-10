# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-10 22:30 UTC (Cycle 9 close) | **ctx at checkpoint:** post-/compact

## Cycle 9 shipped (2026-05-10)

| Task | Type | Result |
|------|------|--------|
| 1862i | CHORE-LOW project-stats refresh | merged (b27e1b11/59e2a639/2b4b9c3c/500e14fd) — QA conditional fix applied (future-date timestamp corrected to 2026-05-10T22:00:20Z) |
| 1868c | CHORE-LOW B8-gap migration | merged (0dea2b68 + ad1de769 fixer commit + 6f314b3e tasks close) — 9 flow files, fixer restored 2 tran-ngoc-bau descriptor regressions |

## Cycle 9 reports drained (all → monitoring)

- 2841/2842 BCTC-1345b FPT+VNM Q4 OCR low-conf — known pattern
- 2843 get_system_status EOF — not reproducible on direct call
- 2844 price_drop precision 50% — needs backtest analysis, not quick FIX
- 2845 news freshness 2.5h — tied to Reuters/TE container rebuild gate

## Cycle 9 branch CLEAN

- DELETED: task/1863c-reconcile-cron-wiring (100% dup of merged work)
- DELETED: task/1863d-write-alert-verdict-tool (PATH-A abandoned, reshipped via RECONCILE)
- RETAINED: task/1863b-reconcile-verdict-job (has unmerged `eb1c469f` handoff sweep, 73 files — tracked as 1868d in Todo)

## Current baseline

- **8804 pass / 1 fail** (per project-stats.json testBaselinePass)
- toolCount=132, totalTasksDone=555, knowledgeFileCount=25
- currentSprint=1867 closed (Cycle 8 1863a-h-RECONCILE) → 1868 next
- pipeline-state: idle

## Carry-over to Cycle 10

### Blockers/escalations
1. **1862c FIX-HIGH Cowork MCP access** — 2nd cycle blocked on architect RCA. **Action**: if no brief in `docs/architecture-briefs/` by next cycle, spawn agents-architect with deadline.
2. **Container rebuild (ops scope)** — still gates 4 merged fixes (1862f, 1862j, 1865a, σ data). Monday 02:00 UTC open already passed. Single WORK telegram sent cycle 8. Don't re-spam ops unless escalation tier change.
3. **1868d CHORE-LOW handoff sweep** — Todo. Cherry-pick eb1c469f from task/1863b, verify 73 files have no active signal/brief refs, then CLEAN branch.

### Patterns to watch (3rd cycle = action)
- 2843 get_system_status EOF — if 3rd occurrence, file FIX task
- 2844 price_drop precision <60% — 2nd cycle persistent; if 3rd, schedule SPRINT-S with backtest
- 2845 news freshness >2h — likely will resolve when container rebuild ships 1862f

### TNB Cycle 31 still open (gated on ops)
- σ data 2/30 for most stocks
- Reuters/TE 80+ errors, "Ngưng"
- DB queue: 18 critical warnings unprocessed (was 18 at c30, no progress — investigate why downstream consumer not draining)

## Architecture state (unchanged from cycle 8)

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP (uptime 2h 55m at cycle close)
- alertVerdictStore (file-backed) + verdictResolutionJob (cron `7 * * * *`) live since cycle 8
- All 16 circuit breakers OK in DB; source health shows Reuters/TE Ngưng (1862f undeployed)

## Cycle 9 process notes

- HEAD.lock stale state during 1868c dev caused 1862i project-stats.json to leak into 1868c initial commit attempt — dev caught + reset HEAD~1 + selective re-stage. Lesson: parallel dev work on overlapping branches needs explicit branch checkout verification before commit.
- QA caught future-date timestamp in 1862i (`lastSuccessfulCycle = 2026-05-11T...` while UTC was 2026-05-10T22:09). Lesson: don't paste system-reminder dates into commits without sanity-checking against actual `date -u`.
- Cherry-pick from 30-file commit when 21 already on main → 9 gap files. Process: `--theirs` for genuine gaps, `--ours` for overlap. Worked but caused 2 descriptor regressions in tran-ngoc-bau requiring fixer round.

## Next-cycle intent (Cycle 10)

1. Drain any new signals + reports
2. 1868d — handoff sweep cherry-pick + branch CLEAN
3. 1862c escalation if architect brief still missing
4. Watch the 3 monitoring patterns for 3rd-cycle triggers
5. Possibly Sprint 1868 will start formally with 1868d
