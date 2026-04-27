# BA Handoff — Sprint 1344: Fix 9 Pre-existing Test Failures

**Date:** 2026-04-27
**BA:** Business Analyst agent
**Sprint:** 1344
**Input:** 4 test files, live `bun test` output, filesystem inspection

---

## Executive Summary

9 pre-existing test failures fall into 3 independent fix groups. All failures are caused by missing data files or stale documentation values — no logic bugs in the implementation code itself. The implementation files (`agentMemoryTools.ts`, `agentMemoryUpdateTools.ts`) are correct. The agent .md file (`developer.md`, `ops.md`, `qa.md`) are missing one section. Two JSON/MD doc values are stale.

---

## Failure Group A — Missing memory filesystem artifacts (5 failures)

### Tests
- `1300a-agent-memory-tools.test.ts` — 2 failures
- `1300b-agent-memory-update-tools.test.ts` — 3 failures

### Root Cause (confirmed from live `bun test` output)

The `agentMemoryTools.ts` and `agentMemoryUpdateTools.ts` tools resolve their data directory as:
```
resolve(process.cwd(), "docs/agent-memory")
```
When `bun test` runs from `apps/mcp-server/`, `process.cwd()` = `/…/apps/mcp-server`. The resolved path becomes `/…/apps/mcp-server/docs/agent-memory/`.

That directory exists (`apps/mcp-server/docs/agent-memory/`) but is missing three required subdirectories:
- `manifests/` — entirely absent
- `issues/` — entirely absent
- `patterns/` — entirely absent

Additionally, the file `issues/WAL-checkpoint.md` was deleted in commit `ef824832` (cleanup sprint) and no longer exists anywhere on disk.

### Exact ENOENT errors

**1300a failure 1 — `get_memory_files`:**
```
ENOENT: no such file or directory,
open '.../apps/mcp-server/docs/agent-memory/manifests/ops.md'
```
Test expects `result` to contain `"issues/WAL-checkpoint.md"`.

**1300a failure 2 — `search_memory_by_trigger`:**
`issues/` subdirectory missing → no files scanned → returns "No files found" instead of "WAL-checkpoint".

**1300b failure 1 — `update_memory_file` creates issue file:**
```
ENOENT: .../apps/mcp-server/docs/agent-memory/issues/test-memory-issue.md
```
`writeFileSync` fails because `issues/` directory does not exist.

**1300b failure 2 — `update_memory_file` creates pattern file:**
```
ENOENT: .../apps/mcp-server/docs/agent-memory/patterns/test-memory-pattern.md
```
`patterns/` directory does not exist.

**1300b failure 3 — `update_memory_file` sanitizes filename:**
Same as failure 1 — `issues/` directory missing; sanitized filename `test-memory-issue` still cannot be written.

### Requirements for Group A to pass

**FR-A1:** `apps/mcp-server/docs/agent-memory/manifests/` directory must exist and contain `ops.md` manifest file with a markdown table mapping `server-restart` task type to `issues/WAL-checkpoint.md`.

**FR-A2:** `apps/mcp-server/docs/agent-memory/issues/` directory must exist and contain `WAL-checkpoint.md` with YAML front-matter `trigger: server-restart, health-check, db-maintenance`.

**FR-A3:** `apps/mcp-server/docs/agent-memory/patterns/` directory must exist (even empty) so `writeFileSync` can create pattern files.

**FR-A4 (1300b write tests):** `update_memory_file` must call `mkdirSync(dir, { recursive: true })` before `writeFileSync` so it creates missing parent directories rather than crashing with ENOENT. This is a one-line code fix in `agentMemoryUpdateTools.ts` at the write step.

**NFR-A:** Test isolation — these memory artifacts must not bleed between test runs. The 1300b tests create real files on disk (they are not mocked). The fixture files (`WAL-checkpoint.md`, `ops.md`) must persist across runs.

**DDD layer:** Infrastructure (filesystem access) + Interface (tool registration). No domain changes.

---

## Failure Group B — Missing `## Step 0-b` section in agent .md files (1 failure)

### Test
- `230-bootstrap-verify.test.ts` — AC-4c: "All 7 Cowork agent .md files include Step 0-b decision tree block"

### Root Cause

The test reads three agent files:
```
.claude/agents/developer.md
.claude/agents/ops.md
.claude/agents/qa.md
```
and asserts each contains the exact string `"## Step 0-b: Handle Bootstrap Errors"`.

Live inspection confirms none of the three files contain this section. The developer.md contains a `## KNOWLEDGE LOAD FAILURE PROTOCOL` section but not the bootstrap error decision tree section.

### Requirements for Group B to pass

**FR-B1:** Each of `.claude/agents/developer.md`, `.claude/agents/ops.md`, `.claude/agents/qa.md` must contain a section with the exact heading:
```
## Step 0-b: Handle Bootstrap Errors
```

**FR-B2:** The section content must describe the fail-loud decision tree: if `bootstrap.error.market_context` is present → STOP; if only `bootstrap.error.agent_signals` → CONTINUE. (This matches the bootstrap contract tested in AC-4a and AC-4b of the same file.)

**FR-B3:** The section must not break existing agent behavior — it is documentation, not executable code.

**DDD layer:** Interface (agent prompt files). No code changes.

**Scope note:** The test originally said "7 Cowork agent files" but the actual `agentFiles` array in the test only checks 3: `developer.md`, `ops.md`, `qa.md`. Fix only needs to target these 3.

---

## Failure Group C — Stale documentation values (3 failures)

### Test
- `1338-sprint-goal-retrospective.test.ts` — 3 failures (1 passes: SPRINT_GOAL.md first H2 sprint number check passes because 1343 >= 1338)

### Root Cause

The test was written for Sprint 1338 and hard-codes expectations that are now stale. The project has advanced to Sprint 1343.

**Failure C1 — `project-stats.json currentSprint equals 1338`:**
`currentSprint` is `1343`. Test expects `1338`.

**Failure C2 — `SPRINT_GOAL.md contains retrospective section for sprint 1330-1337`:**
`SPRINT_GOAL.md` retrospective section reads "Sprint 1338–1342" and does not contain the literal string `"1330"`.

**Failure C3 — `project-stats.json sprintGoal mentions 1338`:**
`sprintGoal` field contains `"Sprint 1343 — CRITICAL: Fix BCTC PDF pipeline…"`. Does not mention `1338`.

### Requirements for Group C to pass

Two options exist. The architect must choose one:

**Option C-Option-1 (preferred — update test assertions):** Treat the test as a "current sprint documentation invariant" test and update the expected values to match reality:
- `currentSprint` assertion: change `toBe(1338)` to `toBe(1344)` (or match actual sprint after 1344 starts)
- `sprintGoal` assertion: change `toContain("1338")` to check current sprint number
- retrospective assertion: change `toContain("1330")` to check a range that actually exists in SPRINT_GOAL.md

**Option C-Option-2 (avoid test churn):** Add `"1330"` mention to the SPRINT_GOAL.md retrospective section and add `"1338"` to `sprintGoal` field in project-stats.json. This is documentation-only but risks making tests a maintenance burden every sprint.

**Recommendation:** Option C-Option-1. Rephrase the test to be "current sprint documentation invariant" — verify `currentSprint` matches the actual sprint number at time of running, verify `sprintGoal` string is non-empty and mentions the current sprint, verify retrospective contains immediately prior sprint ranges. This makes the test forward-compatible.

**DDD layer:** Test file only. No implementation or infrastructure changes.

---

## Failure Count Verification

| Group | Test File | Failures | Root Cause |
|-------|-----------|----------|------------|
| A | 1300a-agent-memory-tools.test.ts | 2 | Missing manifests/ and issues/ dirs + WAL-checkpoint.md |
| A | 1300b-agent-memory-update-tools.test.ts | 3 | Missing issues/ and patterns/ dirs; no mkdirSync before write |
| B | 230-bootstrap-verify.test.ts | 1 | Missing `## Step 0-b` section in 3 agent .md files |
| C | 1338-sprint-goal-retrospective.test.ts | 3 | Stale sprint number in project-stats.json + SPRINT_GOAL.md |
| **Total** | | **9** | |

---

## Dependency Analysis — Can fixes be parallelized?

```
Group A (5 failures)
  ├── A1/A2/A3: Create fixture dirs + files (no code touch) — developer task
  └── A4: Add mkdirSync in agentMemoryUpdateTools.ts — developer task
      → A1-A4 are independent of B and C

Group B (1 failure)
  └── Add ## Step 0-b section to 3 agent .md files — developer/ops/qa .md files only
      → Independent of A and C

Group C (3 failures)
  └── Update 1338-sprint-goal-retrospective.test.ts assertions — test file only
      → Independent of A and B
```

**All 3 groups can be assigned in parallel to one or more developers.** No shared files between groups.

---

## Affected Files

### Group A — must create or modify
- `apps/mcp-server/docs/agent-memory/manifests/ops.md` (create)
- `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md` (create)
- `apps/mcp-server/docs/agent-memory/issues/` (mkdir)
- `apps/mcp-server/docs/agent-memory/patterns/` (mkdir)
- `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts` (add mkdirSync before writeFileSync at line ~367)

### Group B — must modify
- `.claude/agents/developer.md`
- `.claude/agents/ops.md`
- `.claude/agents/qa.md`

### Group C — must modify
- `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts`

---

## Blockers

None. All fixes are unambiguous. No PO input required.

**Open choice for architect:** Option C-Option-1 vs C-Option-2 for the 1338 test. Recommendation above favors Option 1.

---

## Edge Cases

- **1300b test isolation:** `update_memory_file` creates real files in `apps/mcp-server/docs/agent-memory/issues/` and `patterns/`. These persist. If tests run twice, the second run hits the `create` action on an existing file (overwriting). This is acceptable — tests pass either way since they only check for `✅` in the response.
- **WAL-checkpoint.md content:** Must include YAML front-matter with `trigger: server-restart, health-check, db-maintenance` for the `search_memory_by_trigger` test to find it. The `get_memory_files` test only needs the manifest to reference the filename; the file itself need not be fully populated as long as it exists (the tool reads front-matter but returns the path).
- **manifests/ops.md table format:** Must follow the exact markdown table format the `parseManifestTable` parser expects — pipe-delimited, task types in column 0, file paths in column 1. The `server-restart` task type must appear as a comma-separated value in the task types cell.

---

## Acceptance Criteria (for architect to pass to developer)

- [ ] `bun test --filter "1300a-agent-memory-tools"` → 5 pass, 0 fail
- [ ] `bun test --filter "1300b-agent-memory-update"` → 13 pass, 0 fail
- [ ] `bun test --filter "230-bootstrap-verify"` → 13 pass, 0 fail
- [ ] `bun test --filter "1338-sprint-goal"` → 4 pass, 0 fail
- [ ] Total test baseline does not regress (currently 9 known failures; after this sprint: 0)
- [ ] No new files outside the affected list above are modified
