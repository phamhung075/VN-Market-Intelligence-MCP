# Architect Handoff — Sprint 1344: Fix 9 Pre-existing Test Failures

**Date:** 2026-04-27
**Architect:** Architect agent
**Sprint:** 1344
**Input:** TASK_1344-ba.md + live filesystem inspection + source reading

---

## Decision Log

### Group C — Option chosen: C-Option-1 (update test assertions)

The BA offered two options for 1338 stale assertions. This design selects **Option C-Option-1**:
update test assertions to match current reality, and rephrase the test as a
"current sprint documentation invariant" that stays valid across sprints.

Rationale:
- Option C-Option-2 would require updating `project-stats.json` and `SPRINT_GOAL.md` with
  historically inaccurate values, creating a maintenance trap every sprint.
- The test title "Sprint 1338 — documentation invariants" implies it was meant to be a
  current-state invariant, not an archaeological record.
- The SPRINT_GOAL.md retrospective section already covers "Sprint 1338-1342", so the
  `"1330"` assertion was never correct for the current retrospective block.
- The `currentSprint` assertion must be updated to `1344` (the sprint launching this fix).

---

## Parallel Safety Confirmation

File ownership is fully disjoint across all three groups:

| Group | Files Touched |
|-------|--------------|
| 1344a | `apps/mcp-server/docs/agent-memory/manifests/ops.md` (create), `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md` (create), `apps/mcp-server/docs/agent-memory/issues/` (mkdir), `apps/mcp-server/docs/agent-memory/patterns/` (mkdir), `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts` (edit line 21 + line 367) |
| 1344b | `.claude/agents/developer.md` (edit), `.claude/agents/ops.md` (edit), `.claude/agents/qa.md` (edit) |
| 1344c | `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts` (edit) |

**No shared files. All three tasks may be dispatched to developers in parallel.**

---

## Task 1344a — Missing filesystem artifacts + mkdirSync fix

### DDD Layer: Infrastructure (filesystem access) + Interface (tool handler)

### Sub-task A1: Create missing directories and fixture files

**Create directory:**
```
apps/mcp-server/docs/agent-memory/manifests/
apps/mcp-server/docs/agent-memory/issues/
apps/mcp-server/docs/agent-memory/patterns/
```
The `patterns/` directory only needs to exist; no file is required in it.

**Create file: `apps/mcp-server/docs/agent-memory/manifests/ops.md`**

Content must use the pipe-delimited table format that `parseManifestTable` in
`agentMemoryTools.ts` expects: column 0 = task types (comma-separated), column 1 = file paths
(comma-separated). The `server-restart` task type must appear in a task types cell.

Exact content to create:
```markdown
# Ops Memory Manifest

**Load when:** Health checks, incident response, or VPS troubleshooting.

| Task Type | Load |
|-----------|------|
| health-check, vps-status | issues/WAL-checkpoint.md, modules/scheduler.md |
| incident-response | issues/WAL-checkpoint.md |
| server-restart | issues/WAL-checkpoint.md |
```

This matches the fixture constant `FIXTURE_OPS_MANIFEST` defined in
`1300a-agent-memory-tools.test.ts` (lines 18-27). The tool reads the real file
from disk, not the fixture — the fixture is shown in the test only for documentation.
The real file must match what the tool's parser expects.

**Create file: `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md`**

YAML front-matter must include `trigger: server-restart, health-check, db-maintenance` as a
comma-separated value (matching how `search_memory_by_trigger` parses front-matter).

Exact content to create:
```markdown
---
agents: ops, developer, system-auditor
trigger: server-restart, health-check, db-maintenance
---

# Issue: WAL Checkpoint Missing on SIGTERM

**Status**: FIXED | **Severity**: Critical

## Summary

SQLite WAL checkpoint was not called on SIGTERM, causing potential data loss on container stop.
Fixed in Sprint 1336: named Docker volume replaces bind-mount. macOS Docker VirtualMachine
process no longer tears SHM on container stop.

## Trigger Conditions

- server-restart: Check WAL state before any restart
- health-check: Verify WAL file size is not growing unboundedly
- db-maintenance: Include WAL checkpoint in maintenance window

## Resolution

Sprint 1336 fix: docker-compose uses named volume for SQLite files. Alert-engine.db and
stock_price.db isolated to separate volumes.
```

### Sub-task A2: Add mkdirSync before writeFileSync in agentMemoryUpdateTools.ts

**File:** `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts`

**Change 1 — import line 21:** Add `mkdirSync` to the destructured import from `"fs"`:
```typescript
// Before
import { writeFileSync, readFileSync, existsSync } from "fs";

// After
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
```

**Change 2 — before line 367 (`writeFileSync(filePath, fileContent, "utf-8")`):**
Add `dirname` to path import and insert `mkdirSync` call:

First, add `dirname` to the path import at line 22:
```typescript
// Before
import { resolve } from "path";

// After
import { resolve, dirname } from "path";
```

Then, immediately before `writeFileSync(filePath, fileContent, "utf-8")` (in the
`update_memory_file` tool handler, line 367), add:
```typescript
// Ensure parent directory exists before writing
mkdirSync(dirname(filePath), { recursive: true });
writeFileSync(filePath, fileContent, "utf-8");
```

Note: The `append_session_record` tool writes to `sessions/` which already exists. Only the
`update_memory_file` tool (which writes to `issues/`, `patterns/`, `modules/`) needs the
guard. The fix at line 367 covers all three paths.

### Acceptance criteria for 1344a

- `bun test --filter "1300a-agent-memory-tools"` → 5 pass, 0 fail
- `bun test --filter "1300b-agent-memory-update"` → 13 pass, 0 fail
- `apps/mcp-server/docs/agent-memory/manifests/ops.md` exists with table containing `server-restart`
- `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md` exists with YAML trigger front-matter
- `apps/mcp-server/docs/agent-memory/patterns/` directory exists
- `agentMemoryUpdateTools.ts` imports `mkdirSync` and `dirname`; has `mkdirSync(dirname(filePath), { recursive: true })` before the `update_memory_file` write call

---

## Task 1344b — Add `## Step 0-b: Handle Bootstrap Errors` to agent .md files

### DDD Layer: Interface (agent prompt files). No code changes.

**Files to modify:**
- `.claude/agents/developer.md`
- `.claude/agents/ops.md`
- `.claude/agents/qa.md`

**Exact heading required (test asserts this literal string):**
```
## Step 0-b: Handle Bootstrap Errors
```

**Section content** — must describe the fail-loud bootstrap decision tree:

```markdown
## Step 0-b: Handle Bootstrap Errors

If `getCycleBootstrap` returns an error object, apply this decision tree before any analysis:

| Error field | Action |
|-------------|--------|
| `error.market_context` present | STOP — do not proceed. Send bug alert and return early. |
| `error.agent_signals` only (no market_context error) | CONTINUE — proceed with available data. Log the signal gap. |
| No error field | CONTINUE — full data available. |

```

**Placement rule:** Insert the section at a logical position relative to existing step numbering.
If the agent file has a `## Step 0` or `## Step 0-a`, insert immediately after it. If no Step 0
section exists (which is the case for ops.md and qa.md that currently have no `## Step 0-b`
heading), append at the end of the existing "initial steps" block, or at the end of the file
before the RETURN section if no step block exists.

Developer.md already contains `## KNOWLEDGE LOAD FAILURE PROTOCOL`. The new section is
a separate, distinct section covering bootstrap errors (runtime fetch failures), not knowledge
file load failures.

**Constraint:** Do not alter any other existing content in these files.

### Acceptance criteria for 1344b

- `bun test --filter "230-bootstrap-verify"` → 13 pass, 0 fail (test AC-4c passes)
- All three agent files contain the literal string `## Step 0-b: Handle Bootstrap Errors`
- No other assertions in 230-bootstrap-verify.test.ts regress

---

## Task 1344c — Update stale assertions in 1338-sprint-goal-retrospective.test.ts

### DDD Layer: Test file only. No implementation or infrastructure changes.

**File:** `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts`

### Current state (all lines)

The file has 4 tests. 1 already passes (`sprintNum >= 1338` still true at 1343). 3 fail:

| Line | Current assertion | Problem |
|------|------------------|---------|
| 12 | `expect(stats.currentSprint).toBe(1338)` | `currentSprint` is now 1343 |
| 24-28 | `expect(content).toContain("1330")` + `toContain("1337")` | SPRINT_GOAL.md retrospective reads "Sprint 1338–1342", no "1330" |
| 35 | `expect(stats.sprintGoal).toContain("1338")` | `sprintGoal` field mentions sprint 1343 |

### Required changes

**Change the describe block title** from `"Sprint 1338 — documentation invariants"` to
`"Sprint 1344 — documentation invariants"` to reflect current sprint context.

**Test 1 — currentSprint assertion (line 8-13):**
```typescript
// Before
it("project-stats.json currentSprint equals 1338", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.currentSprint).toBe(1338);
});

// After
it("project-stats.json currentSprint equals 1344", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.currentSprint).toBe(1344);
});
```

Note: `project-stats.json` must also be updated to set `"currentSprint": 1344`. The PM
agent updates this file at sprint start — confirm PM does so, or include it in 1344c scope.
See risk note below.

**Test 3 — retrospective assertion (lines 24-29):**
```typescript
// Before
it("SPRINT_GOAL.md contains retrospective section for sprint 1330-1337", () => {
  const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
  expect(content).toContain("1330");
  expect(content).toContain("1337");
});

// After
it("SPRINT_GOAL.md contains retrospective section for prior sprints", () => {
  const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
  // Retrospective block references the most recent completed sprint range
  // Current SPRINT_GOAL.md retrospective: "Sprint 1338–1342"
  expect(content).toContain("1338");
  expect(content).toContain("1342");
});
```

**Test 4 — sprintGoal assertion (lines 31-36):**
```typescript
// Before
it("project-stats.json sprintGoal mentions 1338", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.sprintGoal).toContain("1338");
});

// After
it("project-stats.json sprintGoal mentions current sprint", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.sprintGoal).toContain("1344");
});
```

### Risk: project-stats.json currentSprint update

The test for `currentSprint` now asserts `1344`. For this test to pass, `project-stats.json`
must have `"currentSprint": 1344`. The PM agent is responsible for updating this file at
sprint start. Confirm PM sets it to `1344` when creating TASKS.md entries, or include a
`project-stats.json` edit in this task's scope (safe — 1344c only touches test file and
project-stats.json, no overlap with 1344a or 1344b).

**Recommendation:** Include the `project-stats.json` update in 1344c scope. One additional
field change: `"currentSprint": 1343` → `"currentSprint": 1344`. The developer should also
update `"sprintGoal"` to reference Sprint 1344 (e.g., "Sprint 1344 — Fix 9 pre-existing test
failures").

### Acceptance criteria for 1344c

- `bun test --filter "1338-sprint-goal"` → 4 pass, 0 fail
- Test describe block title updated to reference Sprint 1344
- `project-stats.json` `currentSprint` = 1344
- `project-stats.json` `sprintGoal` contains "1344"
- No other test files modified

---

## Architecture Risk Flags

### RISK-1 (Low): Test isolation for 1300b real filesystem writes

The `update_memory_file` tool writes real files to `apps/mcp-server/docs/agent-memory/issues/`
and `patterns/`. The tests create `test-memory-issue.md` and `test-memory-pattern.md`.
These files persist across test runs. This is by design per the BA spec (second run overwrites,
tests still pass). No mitigation needed. Document it here as a known behavior.

### RISK-2 (Low): project-stats.json owned by PM + developer in same sprint

Both PM (sprint init) and 1344c developer touch `project-stats.json`. Schedule: PM updates
the file first (adding TASKS.md entries and setting `currentSprint: 1344`), then 1344c
developer adjusts `sprintGoal` string if PM did not. Coordination: PM handoff must include
the current `project-stats.json` values so 1344c developer does not overwrite PM's changes.
If tasks run truly in parallel, give 1344c developer explicit field-level instructions rather
than full-file replace.

### RISK-3 (None): DDD violations

All changes are strictly in the correct layers:
- Filesystem fixture files: infrastructure data, not domain
- `agentMemoryUpdateTools.ts` edit: interface layer, no domain imports added
- Agent `.md` files: interface/prompt layer
- Test file: test layer
No DDD violations.

---

## Baseline Verification

Current baseline from `project-stats.json`:
- `testBaseline`: 7362
- `testBaselinePass`: 7362
- `testBaselineFail`: 9
- `testFailures`: 9

Post-sprint 1344 expectation: 9 failures → 0 failures. All 9 targeted failures are from the
four test files listed below. No other test files are touched.

Target test commands:
```bash
bun test --filter "1300a-agent-memory-tools"    # 5 pass, 0 fail
bun test --filter "1300b-agent-memory-update"   # 13 pass, 0 fail
bun test --filter "230-bootstrap-verify"        # 13 pass, 0 fail
bun test --filter "1338-sprint-goal"            # 4 pass, 0 fail
```

---

## Summary Task Table for PM

| Task ID | Parallel? | Assignee | Files |
|---------|-----------|----------|-------|
| 1344a | Yes | developer | `apps/mcp-server/docs/agent-memory/manifests/ops.md` (create), `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md` (create), `apps/mcp-server/docs/agent-memory/issues/` (mkdir), `apps/mcp-server/docs/agent-memory/patterns/` (mkdir), `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts` (edit) |
| 1344b | Yes | developer | `.claude/agents/developer.md`, `.claude/agents/ops.md`, `.claude/agents/qa.md` |
| 1344c | Yes | developer | `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts`, `docs/data/project-stats.json` |

All three tasks are independent and can be dispatched in a single parallel spawn.

---

## RETURN

DONE: Architectural design complete for Sprint 1344 — 3 parallel tasks specified with exact file paths, content, and diff-level changes; Option C-Option-1 selected for 1338 stale assertions; no DDD violations; all 3 groups confirmed file-disjoint and parallel-safe.
NEXT: pm | create TASKS.md entries and developer handoff files for 1344a, 1344b, 1344c (all parallel)
HANDOFF: docs/handoffs/TASK_1344-arch.md
PIPELINE: continue
