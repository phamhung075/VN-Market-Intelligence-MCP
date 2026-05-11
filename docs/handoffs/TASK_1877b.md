# TASK_1877b Handoff — Commit Convention Audit Script Signal Guard

**Brief:** `docs/architecture-briefs/2026-05-17-commit-convention-audit-guard.md`  
**Sprint:** SPRINT-S-1877b  
**Owner:** developer  
**Branch:** `task/1877b-audit-script-emit-signal-guard`  
**Base:** main (commit 20005b95 = SPRINT-S-1877a merged state)  

---

## Context

SPRINT-S-1877a shipped `scripts/audits/commit-convention-audit.sh` as a one-shot Day-7 gate tool (trigger 2026-05-17). The script currently emits signal files unconditionally on every run, creating risk: any test invocation (dev/QA) that produces a PASS verdict writes a real signal to `docs/signals/`, which agent-father reads and routes — potentially triggering false C1+C2 greenlight before the audit window closes.

**Root cause:** signal emission has no guard against non-authoritative invocations. This task adds an explicit opt-in flag + date-range window guard (belt-and-suspenders).

---

## Acceptance Criteria

**AC-1 — Default safe:**  
Running `bash scripts/audits/commit-convention-audit.sh` (or with `SINCE_DATE` arg only) without `--emit-signal` produces a report at `docs/signals/processed/commit-convention-audit-<YYYYMMDD>.json` and exits with correct code, but writes **zero files** to `docs/signals/` at root level.

**AC-2 — Flag + window = emit:**  
Running with `--emit-signal` flag AND `SINCE_DATE=2026-05-10T00:00:00Z` on any date between 2026-05-10 and 2026-05-17 (UTC, inclusive) writes exactly one signal file to `docs/signals/` matching the schema from parent brief §4.

**AC-3 — Flag without window = warning, no signal:**  
Running with `--emit-signal` and a SINCE_DATE other than canonical (`2026-05-10T00:00:00Z`), OR on a date outside the Phase B window (2026-05-10..2026-05-17 UTC), prints a `WARNING:` line to stdout and writes **no** file to `docs/signals/`.

**AC-4 — Report always written:**  
Under **all invocations** (with/without `--emit-signal`, regardless of window guard outcome), `docs/signals/processed/commit-convention-audit-<YYYYMMDD>.json` is always written with valid JSON containing correct verdict.

**AC-5 — Exit code unaffected:**  
Script exit code (0=PASS, 1=FAIL) is determined **solely** by audit verdict. Signal emission suppression does not change exit code.

**AC-6 — Bash 3.2 compat:**  
Script runs under `bash --version` check for 3.2 (macOS system bash). No `local -n`, no `declare -A`, no `[[` with `<`/`>` string comparison without escaping, no `mapfile`.

---

## Implementation Spec (from Brief §3)

### CLI signature (unchanged from 1877a)

```bash
bash scripts/audits/commit-convention-audit.sh [SINCE_DATE] [--emit-signal]
```

- `SINCE_DATE` — positional arg (default: `2026-05-10T00:00:00Z`), unchanged.
- `--emit-signal` — optional flag, any position after `SINCE_DATE`.

### Canonical Phase B constants

Add near top of script, after existing vars (after line 25):

```bash
PHASE_B_SINCE_CANONICAL="2026-05-10T00:00:00Z"
PHASE_B_UNTIL_DATE_CANONICAL="2026-05-17"   # inclusive end, UTC date only
```

### Flag parsing

Add after SINCE_DATE assignment (after line 16):

```bash
EMIT_SIGNAL=false
for arg in "$@"; do
  [ "${arg}" = "--emit-signal" ] && EMIT_SIGNAL=true
done
```

### Signal emission block replacement

Replace the current unconditional signal-drop block (lines 347–386) with the guard block in brief §3 signal-emission-block-replacement. Key points:

- Wrap existing signal logic in `if [ "${EMIT_SIGNAL}" = "true" ]; then ... fi`.
- Inside, compute `window_ok` via date comparisons:
  - `SINCE_DATE` must equal `PHASE_B_SINCE_CANONICAL`
  - `TODAY_UTC="$(date -u +%Y-%m-%d)"`
  - Must be `>= "2026-05-10"` AND `<= "2026-05-17"`
- If window fails: print `WARNING: --emit-signal ignored. ...` to stdout, then skip signal file write (report and exit code are unaffected).
- If window passes: emit signal file as before (both PASS and FAIL cases).
- If `EMIT_SIGNAL=false`: skip entire block, print `Signal emission skipped (no --emit-signal flag). Report at: ${REPORT_FILE}`.

**LOC constraint:** net addition ≤ 10 LOC (flag parse ~4 + constants ~2 + guard logic is net-neutral vs existing block).

---

## Test Plan

Run these 4-6 scenarios (use `date -u +%Y-%m-%d` to confirm "today" for window checks):

### Scenario 1: Test run, no flag (safe, baseline)
```bash
bash scripts/audits/commit-convention-audit.sh
```
**Expected:** Report written to `docs/signals/processed/`, exit 0 or 1. Zero new files in `docs/signals/` root.

### Scenario 2: Test run with canonical SINCE_DATE, no flag
```bash
bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z
```
**Expected:** Same as Scenario 1. No signal emission.

### Scenario 3: Test run with flag, canonical SINCE_DATE, within window (today >= 2026-05-10 AND <= 2026-05-17)
```bash
bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z --emit-signal
```
**Expected (if today in window):** Report written, signal file written to `docs/signals/` (PASS or FAIL). Exit 0 or 1 per verdict.

### Scenario 4: Test run with flag, non-canonical SINCE_DATE
```bash
bash scripts/audits/commit-convention-audit.sh 2026-05-09T00:00:00Z --emit-signal
```
**Expected:** Report written, `WARNING: --emit-signal ignored...` printed. Zero signal files.

### Scenario 5: Test run with flag, canonical SINCE_DATE, but run on date outside window (if applicable)
```bash
# Mock by testing script logic (can't change system date in test)
# OR defer to Scenario 3 if today is still in window
```
**Expected:** Warning printed, no signal file, report written.

### Scenario 6: Verify bash 3.2 compat
```bash
bash --version  # confirm 3.2 on macOS
bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z
# Run and verify no syntax errors, correct exit
```

---

## Files to Edit

| File | Change | Notes |
|------|--------|-------|
| `scripts/audits/commit-convention-audit.sh` | Add flag parse (4 LOC), constants (2 LOC), replace signal block (~40→~37 LOC). Net ~6 LOC addition. | Single file. See impl spec above. |

No doc/README updates required for this task.

---

## Rollback

If a regression is discovered (e.g., window guard date logic fails and suppresses legitimate 2026-05-17 gate signal):

```bash
git revert <1877b-commit-sha>
```

Single commit, single file. No cascade. Revert restores original unconditional signal-drop from 1877a.

---

## Dependencies

- **Blocked by:** None.
- **Blocks:** None. (1877c and later audit work depend on 1877b; this is pure addition.)
- **Related brief:** `docs/architecture-briefs/2026-05-17-commit-convention-audit.md` (parent audit, not a blocker).

---

## Done Criteria

- Branch `task/1877b-audit-script-emit-signal-guard` created from main.
- 6 ACs verified via test plan above.
- Commit message includes `AC-1 AC-2 AC-3 AC-4 AC-5 AC-6`.
- PR merged to main; signal-rotated phase-b artifact cleaned up (if any).
- PM moves task from Todo → In Progress → Review → Done in docs/TASKS.md.

---

**Duration estimate:** 30 min (edit + test). **Ready to start:** Yes.
