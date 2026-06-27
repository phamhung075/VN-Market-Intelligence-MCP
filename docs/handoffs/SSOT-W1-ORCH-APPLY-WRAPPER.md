---
task_id: SSOT-W1-ORCH-APPLY-WRAPPER
sprint: SSOT-INTEGRITY-PERIMETER
wave: 1
rank: 5
type: dev
size: S
zone: scripts/
priority: high
owner: dev-mcp-server
depends_on:
  - SSOT-W1-ZOD-VALIDATOR-CLI
created_at: 2026-06-27T16:50:00Z
---

# SSOT-W1-ORCH-APPLY-WRAPPER

**Current state:** `scripts/orch-apply.sh` is ~85% complete. Wrapper exists with all required mechanics.

**What's shipped:**
- CAS-mtime capture: `stat` live file mtime BEFORE reading stdin (earliest snapshot)
- Stdin → temp file: `mktemp` under docs/data/orch/ (same filesystem for POSIX-atomic mv(2))
- Empty-stdin guard: exit 3 if temp file empty (broken pipe / upstream error)
- Zod validation: `bun scripts/orch-validate.mjs <temp>` (Stage-0 + Stage-1)
- CAS re-check: compare mtime-before vs mtime-after; mismatch → exit 2 (concurrent write, caller retries)
- Atomic rename: `mv <temp> <live>` (POSIX rename(2) — readers see old XOR new, never partial)
- Exit codes: 0=success, 1=validation fail, 2=CAS mismatch (retry), 3=usage error
- Trap cleanup: `trap cleanup EXIT` removes temp file on any non-zero exit, live file left untouched
- Canonical call pattern documented: `jq '<filter>' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`

**Delta — what this task hardens:**
1. **Codebase audit — find all ~290/tick jq-patch writers:**
   - Search codebase for patterns: `jq.*>.*orch-state.json` or `jq.*|.*orch-state` or direct `mv`/`cp` of orch-state
   - Categorize findings:
     - Writers that already route through orch-apply.sh (good)
     - Writers that go direct-Bash (will be guarded by PostToolUse backstop in SSOT-W1-HOOK-ENFORCE)
     - Writers that break the pattern (must be documented or refactored)
   - Document findings in a section of this handoff or a companion audit file (e.g., `docs/signals/orch-state-writer-audit.json`)

2. **Add CANONICAL pointer in dev-standards.md:**
   - Open `docs/policies/dev-standards.md`
   - Find or create a section titled "CANONICAL Pointers" or "Script Persistence"
   - Add entry: `CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER = scripts/orch-apply.sh — canonical hot-file write wrapper (SSOT-INTEGRITY-PERIMETER sprint 2026-06-27)`
   - Link to this handoff and/or the architecture brief

3. **QA-2 gate (dup-key in candidate rejected before rename):**
   - Write test that pipes a candidate JSON with a duplicate key through orch-apply.sh
   - Verify wrapper exits 1 (validation fail) and live orch-state.json is UNCHANGED
   - (This test overlaps with orch-validate.mjs QA-2 but validates the full wrapper path)

4. **QA-1 gate (bad status in candidate rejected before rename):**
   - Write test that pipes a candidate JSON with an invalid status ("PARKED") through orch-apply.sh
   - Verify wrapper exits 1 (validation fail) and live orch-state.json is UNCHANGED
   - (This test overlaps with orch-validate.mjs QA-1 but validates the full wrapper path)

5. **Verify CAS-mtime mechanics:**
   - Test concurrent write scenario: start orch-apply.sh with a long validation, meanwhile another process touches orch-state.json
   - Verify wrapper detects mtime mismatch and exits 2 (caller should retry)
   - Verify temp file is cleaned up and live file is left untouched

**Acceptance criteria:**
- Codebase audit complete: all ~290/tick jq writers categorized (through wrapper, direct-Bash, other)
- CANONICAL pointer added to dev-standards.md (or equivalent canonical reference location)
- QA-2 test passes (dup-key rejected before rename)
- QA-1 test passes (bad status rejected before rename)
- CAS-mtime mechanics verified with concurrent write test
- Full orch-apply.sh integration test green (from jq input to atomic output)
- Exit codes 0/1/2/3 all verified with appropriate test scenarios

**Files touched:**
- `scripts/orch-apply.sh` (review, no edits needed if already wired; add inline test cases or documentation if helpful)
- `docs/policies/dev-standards.md` (add CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER pointer)
- `docs/signals/orch-state-writer-audit.json` (audit findings, optional companion artifact)

**Depends on:** SSOT-W1-ZOD-VALIDATOR-CLI (validator must be present and working).

**Time estimate:** 1.5h (codebase audit for ~290 writers, CANONICAL pointer, CAS test, verification).
