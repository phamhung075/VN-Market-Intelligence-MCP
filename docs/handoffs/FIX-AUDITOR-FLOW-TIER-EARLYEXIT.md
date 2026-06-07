# Handoff — FIX-AUDITOR-FLOW-TIER-EARLYEXIT

**Type:** FIX  
**Zone:** docs/agents/system-auditor/  
**Completed:** 2026-06-07  
**Agent:** agent-father  
**Status:** REVIEW

---

## Implementation Record

### Files Changed

- `docs/agents/system-auditor/flow/main.md` — both fixes applied

---

### DEFECT 1 — AUDIT_TIER not honored natively

**Root cause:** The "Tier Dispatch" section said `Read AUDIT_TIER (default 3 if not set)` but gave no mechanism for HOW to extract the value from the spawn prompt. The agent inferred the tier from context or dispatcher text injection rather than reading a structured token. Past cycles (c058/c059) only labeled tier-1 correctly because the dispatcher manually injected reminder text into the spawn prompt; without that injection the label defaulted to the flow's own chosen value (typically 3).

**Fix applied (lines 62–76 of main.md):** Added an explicit AUDIT_TIER extraction block under "Tier Dispatch" that:
1. Instructs the agent to scan the spawn prompt verbatim for the token `AUDIT_TIER=<value>`.
2. Defines integer extraction for values 1, 2, 3.
3. Defines the default (3) when absent, with a mandatory log line.
4. Mandates propagation of the extracted value to: the tier-dispatch branch, the notebook cycle entry heading (`### Audit Run Tier-N`), and the RETURN line token.

**Default when absent:** AUDIT_TIER=3 (Tier 3 = full audit; stated explicitly in the new extraction block).

---

### DEFECT 2 — False "no commits in 24h" early-exit

**Root cause (two sub-causes):**

1. **Invalid git date string:** The command was `git log --since="24h" --oneline`. The string `"24h"` is not a recognized git date format. Git's date parser accepts forms like `"24 hours ago"`, `"1 day ago"`, `"yesterday"` — not bare abbreviations. When given an unrecognized string, git silently returns 0 results (no error, empty output). This caused every doc-audit pass to see "0 commits" and early-exit.

2. **Missing branch ref:** The command had no ref argument so it queried local state only (`HEAD`). If the local repo was behind `origin/main` (e.g. a cowork agent checkout), commits visible on the remote would be invisible to the check.

3. **No fail-loud on git error:** The original form had no exit-code check. Any git failure (wrong CWD, no upstream configured, detached HEAD) silently produced empty output, which was indistinguishable from a genuine "0 commits" result.

**Fix applied (lines 285–293 of main.md):** Replaced the early-exit block with:
```bash
git -C "$PROJECT_ROOT" log origin/main --since="24 hours ago" --oneline 2>/tmp/sau_gitlog_err; GITLOG_EXIT=$?
```
- `$PROJECT_ROOT` — uses the resolved project root from Step 0a, not CWD.
- `origin/main` — explicit ref prevents stale local state from masking new commits.
- `--since="24 hours ago"` — valid git date string (replaces broken `"24h"`).
- `GITLOG_EXIT` check:
  - Non-zero exit: fail-loud log + WARN signal + BUG-channel Telegram; continue as if commits exist (safe side — runs doc audit rather than skipping it).
  - Zero exit + empty output: genuine no-commits; applies the original early-exit condition (last audit < 12h AND no new commits → skip steps 1–6).
  - Zero exit + non-empty output: commits exist; runs doc audit steps 1–6.

---

## Dry-Run Trace

### Trace A — AUDIT_TIER=1 spawn

Spawn prompt token: `AUDIT_TIER=1`

```
[TIER-DISPATCH] Scanning spawn prompt... found AUDIT_TIER=1
[TIER-DISPATCH] Extracted AUDIT_TIER=1
[TIER-DISPATCH] Branch: TIER=1 → run Tier-1 Runtime Ping only
[TIER-DISPATCH] Notebook label will be: ### Audit Run Tier-1
... (Tier-1 probe runs, Tier-2 and Tier-3 skipped)
[NOTEBOOK] Writing: ### Audit Run Tier-1 (HH:MM–HH:MM UTC 2026-06-07)
- Tier: 1 | Services: N checked | ...
[RETURN] DONE: Audit complete tier-1 — N anomalies ...
```

Acceptance criteria met:
- AUDIT_TIER=1 → Tier-1 checks only (Tier-2 and Tier-3 skipped)
- Notebook entry labeled "Tier-1" (not Tier-3 default)
- RETURN line contains "tier-1"

### Trace B — doc-audit branch with commits on main

Setup: `git -C $PROJECT_ROOT log origin/main --since="24 hours ago" --oneline` returns non-empty (commits exist).

```
[DOC-AUDIT] git log origin/main --since="24 hours ago": exit=0, output=3 lines
[DOC-AUDIT] Commits found in last 24h — proceeding with steps 1–6 (no early exit)
... (doc audit steps 1–6 run)
```

Acceptance criteria met: doc-audit branch runs when commits exist.

### Trace C — git failure → fail-loud, no early-exit

Setup: `git -C $PROJECT_ROOT log origin/main ...` exits non-zero (e.g., no upstream).

```
[DOC-AUDIT] git log FAILED (exit 128): fatal: ambiguous argument 'origin/main'...
[DOC-AUDIT] Emitting WARN signal check_id=DOC-AUDIT-GIT-ERR
[DOC-AUDIT] Sending BUG-channel Telegram: git log check failed
[DOC-AUDIT] Continuing with doc audit (safe-side — treat as commits exist)
... (doc audit steps 1–6 run)
```

Acceptance criteria met: git failure → loud error + BUG alert, NOT early-exit.

---

---

## Correction Record — CHANGES_REQUESTED Round (2026-06-07)

**Issue:** Commit c8703aea's fix (using `origin/main` in the git log command) re-introduced the false "no commits in 24h" early-exit on this repo because:
- This repo enforces a NO-branches policy: all commits land directly on local `main`.
- `origin/main` lags behind local HEAD (verified: `origin/main` is 6 days stale, local HEAD has 164 commits in last 24h).
- Querying the stale `origin/main` ref produces 0 commits, triggering the exact bug the task was opened to fix.

**Correction applied (2026-06-07):**
- Changed git log command from `git -C "$PROJECT_ROOT" log origin/main --since="24 hours ago" --oneline` to `git -C "$PROJECT_ROOT" log --since="24 hours ago" --oneline` (removed `origin/main` ref, query local HEAD).
- Updated NOTE paragraph to document the NO-branches policy as the reason local HEAD is the correct ref, not `origin/main`.
- Verified: `git log --since="24 hours ago" --oneline | wc -l` → 164 (correct), `git log origin/main --since="24 hours ago" --oneline | wc -l` → 0 (regression proof).

**Status:** DEFECT 1 (AUDIT_TIER extraction) remains valid. DEFECT 2 fully corrected.

---

## Board State

| Field | Value |
|---|---|
| Task | FIX-AUDITOR-FLOW-TIER-EARLYEXIT |
| Status | DONE |
| Head | idle |
| Files touched | docs/agents/system-auditor/flow/main.md, docs/data/orch/orch-state.json |
| PLAN-ONLY invariant | Unchanged — no destructive ops added |

---

## [QA] Review Record — 2026-06-07

**Reviewer:** qa  
**Verdict:** APPROVED  
**Commit:** 7c8a0511 (correction round, final)

### AC Results

| AC | Result | Evidence |
|---|---|---|
| AC-1: AUDIT_TIER=1 → Tier-1 only, notebook label Tier-1, RETURN tier-1 token, default=3 logged | PASS | flow/main.md lines 62–76: explicit extraction block scans spawn prompt for `AUDIT_TIER=<value>`; found=1 → TIER=1 dispatch; not-found → default 3 with mandatory log; propagation mandated to dispatch branch + `### Audit Run Tier-N` heading + RETURN `tier-N` token |
| AC-2: doc-audit uses `"24 hours ago"` (valid), queries local HEAD (not origin/main) | PASS | flow/main.md line 287: `git -C "$PROJECT_ROOT" log --since="24 hours ago" --oneline`; no `origin/main` ref. NOTE at line 293 documents NO-branches policy rationale. Live proof: `git log --since="24h" --oneline \| wc -l` → 0 (broken); `git log --since="24 hours ago" --oneline \| wc -l` → 165 (correct); `git log origin/main --since="24 hours ago" --oneline \| wc -l` → 0 (regression proof) |
| AC-3: git failure → fail-loud (logged error + WARN signal + BUG-channel Telegram), doc audit CONTINUES | PASS | flow/main.md line 289: `GITLOG_EXIT != 0` branch reads error, emits WARN signal check_id=DOC-AUDIT-GIT-ERR, sends BUG-channel Telegram, explicitly states "do NOT early-exit — continue with doc audit as if commits exist (safe-side)" |
| AC-4: PLAN-ONLY invariant (AUD-ND-1) untouched | PASS | Lines 4–26 unchanged; no docker stop/kill/rm/restart or container management commands added anywhere in the flow body |
| AC-5: commit scope clean — c8703aea: auditor flow + orch-state + handoff only; 7c8a0511: auditor flow + handoff only | PASS | `git show --name-only`: c8703aea touches 3 files (docs/agents/system-auditor/flow/main.md, docs/data/orch/orch-state.json, docs/handoffs/FIX-AUDITOR-FLOW-TIER-EARLYEXIT.md); 7c8a0511 touches 2 files (docs/agents/system-auditor/flow/main.md, docs/handoffs/FIX-AUDITOR-FLOW-TIER-EARLYEXIT.md) |

All 5 ACs PASS. No blocking issues found.
