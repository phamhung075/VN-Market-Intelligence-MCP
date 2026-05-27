---
sprint: pilot-p0
branch: task/p0-1-bug-inventory
size: M
zone: docs/data/
depends_on: []
blocks: ["TASK_P0-2", "TASK_P0-3", "TASK_P0-4"]
pilot: technical-analysis
phase: 0
---

## TLDR
Create `docs/data/bug-inventory.json` as a baseline snapshot of recent bug history. This metric establishes the "before" state for G10 (AI agent fix-cycle reduction proof). Scan git log + signal files + agent notebooks for the last 60 days to extract bug-id, module, fix-cycle-count, and status.

## [PM] Planning Context
- **Zone:** `docs/data/`
- **Acceptance Criteria:**
  - [ ] File `docs/data/bug-inventory.json` created with schema: `{ generatedAt, bugs: [{ id, module, fixCycles, status, date }], baselineCycleCount }`
  - [ ] Minimum 20 bugs extracted from last 60 days (git log + docs/signals + docs/agent-memory/)
  - [ ] `baselineCycleCount` field populated (average fix cycles for technical-analysis bugs, or system-wide 4-6 if no TA-specific bugs found)
  - [ ] All bugs have valid `status` field: `open | resolved`
  - [ ] File is valid JSON and conforms to charter §Baseline Metric Capture schema
- **Files to read first:**
  - `docs/TASKS.md` (historical task records, fix cycles)
  - `docs/TASKS_ARCHIVE.md` (older completed tasks)
  - `git log --since='60 days ago' --format=fuller` (recent commits + fix messages)
  - `docs/agent-memory/notebooks/*.md` (agent cycle entries, bug fixes mentioned)
  - `docs/signals/*.json` (recent signals, anomalies, bugs)
- **Files to create:**
  - `docs/data/bug-inventory.json` (SSOT baseline for G10)
- **Files to modify:** None
- **Dependencies:** None
- **Knowledge needed:**
  - Charter: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §Baseline Metric Capture
  - Bug categorization standard (by module name from system-map.json)

## Details
This task is **owned by system-auditor** because it already scans memory, signals, and anomalies as part of its regular audit cycle. The inventory serves as the baseline for G10: "AI agent fixes a primitive bug without looping" (≤2 cycles vs 4-6 baseline).

**Definition of fix-cycle:** the number of sequential agent attempts (commit + test cycle) until the bug is marked resolved in TASKS.md or git history. Example: a bug fix that required 3 commit attempts = `fixCycles: 3`.

Use the charter's minimum schema — do NOT invent extra fields. The file must be committable and read-loadable by the pilot-status verification flow.

## RETURN block
When task is complete:
```
DONE: docs/data/bug-inventory.json created
  - Generated at: <ISO-8601 timestamp>
  - Bug count: <N>
  - Baseline cycle count: <M>
  - Coverage: last 60 days from <date> to <date>
FILES:
  - docs/data/bug-inventory.json
NEXT: po
```
