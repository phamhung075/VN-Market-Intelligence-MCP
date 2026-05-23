---
task_id: "P2-B2"
phase: "2"
title: "Pre-Delete Tag + git mv src/ src/_deprecated/ (G5a TS Deprecation)"
owner: "dev-macro-indicators"
goal: "G5 progress (legacy TS purge / deprecation marker)"
priority: "HIGH — critical path, unblocks P2-B3 verification"
estimated_hours: "0.5"
acceptance_criteria_count: "5"
date_authored: "2026-05-23"
authored_by: "pm c282-cycle-44"
---

# TASK P2-B2 — Pre-Delete Tag + `git mv src/ src/_deprecated/` (G5a)

**Blocked by:** P2-A2 DONE (G4 must be green before deletion; fence proves deletion doesn't bypass architecture)  
**Blocks:** P2-B3 (G5 verification)  
**Unblocks:** P2-X1 (remaining 5 primitives extraction — safe to expand)  
**WIP claim:** dev-macro-indicators  
**Anchor (binding pre+post):** 1776df8e (must remain ancestor throughout)  

---

## Context

G5 goal requires:
- **G5a:** apps/macro-indicators/src/ TS files → _deprecated/ (git mv, preserves history for rollback)
- **G5b:** MCP tool handlers in apps/mcp-server HTTP-routed to Go service port 5004 (DONE in P2-B1)
- **G5c:** Zero TODO.*migrat references (verified in P2-B3 QA task)

Phase 2 task plan (architect) specifies **pre-delete tag protocol**: `git tag macro-pre-delete HEAD` BEFORE any `git mv` commit, on the commit PRECEDING the deprecation move. This tag serves as a rollback anchor if the move causes unforeseen cascade failures.

---

## Acceptance Criteria (Machine-Verifiable)

### AC-1: Pre-Delete Tag Created (Rollback Safety)

**Step 0 (before any file edits):** Place git tag on the current HEAD:
```bash
git tag macro-pre-delete HEAD
git log --oneline macro-pre-delete | head -1  # confirm tag placement
```

**Requirement:** `git log --oneline macro-pre-delete` outputs the commit SHA matching the current HEAD at tag time (should be P2-A2's commit or a PM dispatch commit). Tag is NOT pushed to remote (local-only for rollback safety).

**Evidence to record:** Paste the `git log --oneline macro-pre-delete` output to the completion signal.

---

### AC-2: TS Files Identified & Moved (git mv, NOT deleted)

**Specification (per architect task plan):**

Move all non-scraper TypeScript files from `apps/macro-indicators/src/` to `apps/macro-indicators/src/_deprecated/`:

```bash
git mv apps/macro-indicators/src/<each-non-scraper-file-or-dir> apps/macro-indicators/src/_deprecated/
```

**Files to move:**
- All `.ts` files in `apps/macro-indicators/src/` **EXCEPT** `apps/macro-indicators/src/infrastructure/scrapers/`
- The scrapers directory STAYS IN PLACE (brownfield §9 Option A: TS scrapers remain as live sidecar per Phase 0 charter)

**Important:** Use `git mv` (preserves git history) — do NOT use `rm` + manual `mv`. History preservation is critical for rollback.

**Requirement (AC-2):** After all moves staged, `find apps/macro-indicators/src -path "*_deprecated*" -prune -o -type f -name "*.ts" -print | grep -v scraper` returns **0 results** (all non-scraper TS files moved out).

**Evidence to record:**
- List of all files moved (use `git status` output showing renamed files)
- Count of files in `_deprecated/`: `find apps/macro-indicators/src/_deprecated -type f -name "*.ts" | wc -l` (should be ≥10)

---

### AC-3: Scrapers Directory Preserved (Live Sidecar Intact)

**Requirement:** `ls apps/macro-indicators/src/infrastructure/scrapers/*.ts | wc -l` returns **≥7** (confirming 7 live scrapers are still in place, not moved).

**Rationale:** The TS scrapers (`sbvScraper.ts`, `yahooFinanceScraper.ts`, etc.) remain as a sidecar service providing live data to the Go service via HTTP adapter pattern. They are OUT OF SCOPE for this deprecation task.

**Evidence to record:** Paste the scraper count output.

---

### AC-4: Go Build Not Broken (Regression Guard)

**Requirement:** `cd apps/macro-indicators && go build ./...` exits 0 (zero build errors after TS files moved).

**Rationale:** TS deprecation should not cascade to Go build failures (Go imports are already routed via HTTP to the service, not direct TS imports).

**Evidence to record:** Paste the `go build ./...` exit code + any warnings (should be clean).

---

### AC-5: G12 DoD Gate — Sandbox Green (BINDING)

**Requirement (HARD GATE — must PASS before commit):**
```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
```
Must exit **0** with `total=5 pass=5 fail=0 status=OK` (or equivalent PASS count — do not reduce pass count).

**Rationale:** Sandbox must remain green throughout; TS deprecation is a pure refactoring move, not a logic change.

**Evidence to record:** Paste full sandbox output (last 5 lines showing `total=X pass=Y fail=Z status=OK`).

---

### AC-6: R-1 Determinism Guard (Regression Check)

**Requirement:**
```bash
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/
```
Must exit **1** (zero matches). R-1 must hold post-move.

**Evidence to record:** Paste the grep exit code.

---

### AC-7: Anchor Held Pre+Post (Integrity Check)

**Pre-move (before commit):**
```bash
git merge-base --is-ancestor 1776df8e HEAD && echo "HOLD" || echo "BREAK"
```

**Post-move (after commit):**
```bash
git merge-base --is-ancestor 1776df8e HEAD && echo "HOLD" || echo "BREAK"
```

Both must exit **0** (anchor 1776df8e remains an ancestor).

**Evidence to record:** Paste both results.

---

### AC-8: Completion Signal with Metadata

**Requirement:** Before marking DONE, create file `docs/signals/dev-macro-p2-b2-done-<UTC>.json` with the following structure:

```json
{
  "agent": "dev-macro-indicators",
  "cycle": "c282-cycle-??",
  "timestamp": "<ISO-8601-UTC>",
  "task_id": "P2-B2",
  "status": "DONE",
  "ac_results": {
    "AC-1_tag_created": "PASS",
    "pre_delete_tag_sha": "<output of git log --oneline macro-pre-delete>",
    "AC-2_files_moved": "PASS",
    "files_moved_list": ["<list of git mv operations>"],
    "ts_files_in_deprecated_count": "<output of find ... wc -l>",
    "AC-3_scrapers_preserved": "PASS",
    "scrapers_count": "<output of ls ... wc -l>",
    "AC-4_go_build_clean": "PASS",
    "go_build_exit_code": 0,
    "AC-5_g12_sandbox": "PASS",
    "sandbox_output_tail": "total=5 pass=5 fail=0 status=OK",
    "AC-6_r1_determinism": "PASS",
    "r1_grep_exit_code": 1,
    "AC-7_anchor_pre": "PASS (exit 0)",
    "AC-7_anchor_post": "PASS (exit 0)"
  },
  "deprecated_ts_files": ["<list of deprecated TS files moved>"],
  "git_mv_method": "used",
  "macro_pre_delete_tag_sha": "<tag SHA>",
  "downstream_callers_audit_result": "G5b verify by P2-B3 QA task",
  "sandbox_status": "GREEN (exit 0)",
  "r1_exit_code": 1,
  "anchor_held_pre": true,
  "anchor_held_post": true
}
```

---

## Out of Scope (Explicit Bans per Charter §4.5)

- Do NOT modify `apps/technical-analysis/*` (TA pilot CLOSED/DORMANT, out-of-zone)
- Do NOT modify `.github/workflows/ci.yml` (frozen at P2-A2)
- Do NOT modify `.golangci.yml` (frozen at P2-A1, anchor for fence config)
- Do NOT add new Go code (this is a deprecation/refactoring task only)
- Do NOT modify `docs/data/pilot-status-macro-indicators.json` (SSOT — PM/QA owned)
- Do NOT touch `decisionMatrix` fields (PO-only at 12/12 terminal per Charter §4.5)

---

## Git Discipline (L84 + Anchor Binding)

### Staging

Use **explicit-file staging** per L84 (no `git add -A`, no `git add .`):

```bash
# Stage each moved file explicitly (git mv already stages them, but verify):
git status  # should show "renamed" entries for all TS files
git add apps/macro-indicators/src/_deprecated/  # add the new deprecated dir
git add -u apps/macro-indicators/src/  # update removals in old locations (from git mv)
```

Or, more safely:
```bash
git add apps/macro-indicators/src/
git status  # verify only TS moves are staged, no unintended changes
```

### Commit Message

**Subject line pattern:**
```
chore(macro-indicators): P2-B2 — git mv src/ src/_deprecated/ (G5a TS deprecation, macro-pre-delete tagged)
```

**Optional body:**
```
- Pre-delete tag macro-pre-delete placed before deprecation move (rollback safety)
- All non-scraper TS files moved to src/_deprecated/ via git mv (history preserved)
- Scrapers directory (infrastructure/scrapers/) kept in place as live sidecar
- Go build clean post-move (no cascading failures)
- G12 sandbox all-tier green (5/5 pass)
- R-1 determinism clean (exit 1)
- Anchor 1776df8e held pre+post (exit 0)
```

### Push

**NO git push of source changes** (user owns push). Local commit only.

---

## Hard Gate Verification Commands

Embed these verbatim into your testing:

```bash
# 1. Anchor pre (before any git mv)
git merge-base --is-ancestor 1776df8e HEAD && echo "ANCHOR_PRE: exit 0" || echo "ANCHOR_PRE: exit 1"

# 2. Pre-delete tag placement (BEFORE git mv commit)
git tag macro-pre-delete HEAD
git log --oneline macro-pre-delete | head -1

# 3. TS files moved, not deleted
find apps/macro-indicators/src -path "*_deprecated*" -prune -o -type f -name "*.ts" -print | grep -v scraper
# must return 0 results

# 4. TS files in _deprecated dir
find apps/macro-indicators/src/_deprecated -type f -name "*.ts" | wc -l
# must return ≥10

# 5. Scrapers preserved
ls apps/macro-indicators/src/infrastructure/scrapers/*.ts | wc -l
# must return ≥7

# 6. Go build not broken
cd apps/macro-indicators && go build ./...
# must exit 0

# 7. G12 DoD gate (BINDING — do not commit if RED)
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# must exit 0, total=5 pass=5 fail=0 status=OK

# 8. R-1 determinism guard
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/
# must exit 1 (zero matches)

# 9. Anchor post (after commit)
git merge-base --is-ancestor 1776df8e HEAD && echo "ANCHOR_POST: exit 0" || echo "ANCHOR_POST: exit 1"
```

---

## Downstream Handoff After Completion

1. **PM (cycle-45)** reads completion signal → verifies all ACs PASS
2. **PM dispatches P2-B3 (QA verification task)** → QA confirms G5b/G5c clean
3. **On P2-B3 QA GREEN** → PM flips G5 status to YES per architect spec, atomic with dispatch commit

---

## R-11 Status Check

If no completion signal within dispatch_timestamp + 1h, PM will spawn R-11 status-check.

---

## References

- **Architect task plan:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` (§P2-B2)
- **Brownfield:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` (§9 Option A — scrapers sidecar)
- **SSOT:** `docs/data/pilot-status-macro-indicators.json` (phase2.tasks.P2-B2)
- **Pre-revert tag protocol:** phase-2-task-plan-go.md §Pre-Revert Tags
- **Charter binding:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` (§4.5 matrix-authorship)
