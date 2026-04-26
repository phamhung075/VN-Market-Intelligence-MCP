# TASK 1338b — GREEN Phase: Update SPRINT_GOAL.md + project-stats.json

## Prerequisite

Task 1338a RED tests written and confirmed failing. This task makes them pass.

---

## Files to Modify

| File | Change |
|------|--------|
| `SPRINT_GOAL.md` | Rewrite top section with Sprint 1338 Vision/Scope/Success + retrospective 1330-1337 |
| `docs/data/project-stats.json` | Set `currentSprint=1338`, update `sprintGoal`, `previousSprint`, `lastUpdated` |

---

## SPRINT_GOAL.md — Target Content (top of file, lines 1-70)

Replace the current top section (Sprint 1327 header) with:

```markdown
# Sprint Goal

## Sprint 1338 — Retrospective Documentation: Sprints 1330–1337 (2026-04-25)

**Goal:** Consolidate Vision/Scope/Success for Sprints 1330–1337. Update project-stats.json. Unblock Sprint 1339 planning.

**Vision:** Eight consecutive sprints (1330–1337) delivered the Value Investor System foundation, SQLite integrity hardening, signal enrichment, and infrastructure resilience. This retrospective locks those deliverables into institutional memory so the next sprint starts from a verified baseline.

**Scope:**
- IN: Write failing tests (1338a) that enforce SPRINT_GOAL.md + project-stats.json invariants
- IN: Rewrite SPRINT_GOAL.md top section with consolidated 1330-1337 retrospective
- IN: Update project-stats.json (currentSprint=1338, sprintGoal, previousSprint, lastUpdated)
- OUT: New domain logic, new MCP tools, infrastructure changes

**Success Metrics:**
- `currentSprint === 1338` in project-stats.json
- SPRINT_GOAL.md first H2 references sprint >= 1338
- 1338a test suite: 4/4 pass
- Test baseline stable (6520 pass / 213 fail — no regressions)

**Size:** S (documentation only, ~1h)

**Blockers:** None.

---

## Retrospective: Sprints 1330–1337 (2026-04-25)

### Sprint 1330 — Test Regression Fixes Post-Phase-0-Merge

**Delivered:**
- Fixed 7 failing test regressions introduced by Phase 0 merge
- 1289c: fallback field normalization
- 1476: WAL threshold message text
- 240: Alert Commander cooldown reset
- 1551: DB isolation assertion

**Result:** 26/26 target tests pass. Baseline restored to 6520 pass / 213 fail.

---

### Sprint 1331 — Single-Writer SQLite Isolation

**Delivered:**
- Isolated `alert-engine.db` and `stock_price.db` to single-writer pattern
- RED tests (1331a) + GREEN implementation (1331b)
- Root cause: macOS Docker VM process tearing SHM on container stop → WAL corruption

**Result:** SQLite corruption eliminated. Named volume replaces bind-mount. 6 recurring corruption reports closed.

---

### Sprint 1332 — Insider Governance Sell-High-Buy-Low Signal

**Delivered:**
- New domain signal: insider governance sell-high-buy-low pattern detection
- RED tests (1332a) + domain implementation (1332b)
- Enriches Alert Commander conviction scoring for value investor workflow

**Result:** Signal added to conviction pipeline. All existing tests stable.

---

### Sprint 1333 — Source Attribution Suffix Stripping

**Delivered:**
- Fix: strip source attribution suffixes before ticker match (e.g., "[VnExpress]" trailing tokens)
- Prevents false-negative ticker detection when news sources append attribution to headlines
- RED tests (1333a) + fix implementation (1333b)

**Result:** Ticker match accuracy improved. Regression locked in test suite.

---

### Sprint 1334 — stock_code Sentinel + CEO Analyst Warning Broadcast

**Delivered:**
- Normalized `stock_code` sentinel values (null/"" coercion)
- CEO analyst warning broadcast to Alert Commander
- TypeScript type errors in signal-filter tests resolved (1334a fix)
- RED tests (1334a) + GREEN implementation (1334b)

**Result:** Sentinel normalization prevents downstream null-coercion bugs. CEO signal reaches market channel.

---

### Sprint 1335 — VPBankS/OKX Crypto Cascade Rules

**Delivered:**
- FR-1: VPBankS crypto exposure cascade rule (banking + fintech)
- FR-2: OKX VN market entry cascade rule (securities sector signal)
- FR-3: Crypto regulatory signal → broad market impact cascade
- Rules BA-approved (FR-1/FR-2/FR-3 APPROVED)
- RED tests (1335a) + GREEN rules (1335b)

**Result:** 3 new cascade rules active in cascadeEngine.ts. Merged to main.

---

### Sprint 1336 — Value Investor Analysis System

**Delivered:**
- 30 analysis ledger files (sectioned by stock/sector)
- New agent: Report Analyzer
- 4 agent modifications: News Scout, Market Watcher, Alert Commander, Unified Agent
- Quarterly conviction synthesis workflow
- `analysis_mode: value_investor` flag in project config
- Phase 2 + Phase 3 implementation documentation

**Result:** Value investor daily batch logging + quarterly synthesis operational. Baseline: 6520 pass / 213 fail.

---

### Sprint 1337 — Infrastructure Hardening

**Delivered:**
- `hour_bucket` migration guard (idempotent schema migration protection)
- Foreign flow circuit breaker timeout tuning
- Polymarket CLOB endpoint circuit breaker bypass (non-critical data source)
- Merged via `merge(1337): infra-db-cb-fixes`

**Result:** Production infrastructure more resilient. 3 failure modes closed.

---
```

Then keep the existing Sprint 1327/1326/1311/1299/1298 sections below (unchanged).

---

## project-stats.json — Target Values

```json
{
  "currentSprint": 1338,
  "previousSprint": {
    "number": 1337,
    "status": "DONE",
    "progressTasks": "Sprint 1337: Infra hardening — hour_bucket migration guard, foreignFlow CB timeout, polymarket CLOB CB bypass. All merged to main 2026-04-25."
  },
  "sprintGoal": "Sprint 1338 — Retrospective documentation for sprints 1330-1337. Update SPRINT_GOAL.md + project-stats.json. Unblock Sprint 1339 planning.",
  "lastUpdated": "2026-04-25T20:00:00Z"
}
```

All other fields in project-stats.json remain unchanged (toolCount=108, schedulerFileCount=42, testBaseline=6520, etc.).

---

## GREEN Confirmation

After edits: `bun test 1338-sprint-goal-retrospective.test.ts` must show 4/4 pass.

Then: `bun test` full suite must show baseline stable (6520 pass / 213 fail, no regressions).

---

## Commit Message

```
docs(1338): retrospective SPRINT_GOAL 1330-1337 + advance currentSprint to 1338

- SPRINT_GOAL.md: new Sprint 1338 header + 8-sprint retrospective (1330-1337)
- project-stats.json: currentSprint=1338, sprintGoal, previousSprint updated
- 4/4 validation tests pass (1338a suite)
```
