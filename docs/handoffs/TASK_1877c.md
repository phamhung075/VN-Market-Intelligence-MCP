# TASK_1877c — C4 Scope-Vocab Remediation (Day-7 Gate)

**Brief:** docs/architecture-briefs/2026-05-17-c4-vocab-remediation.md
**Gate deadline:** 2026-05-17 (bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z --emit-signal)
**Target:** C4 ≥ 0.95 on the 2026-05-10..2026-05-17 window
**Files:** 2 (.claude/knowledge/commit-convention.md + scripts/audits/commit-convention-audit.sh)
**Type:** SPRINT-S (hybrid vocab expansion + C4 sprint-ID exemption)
**Projected Outcome:** C4 = 145/148 = 97.97% (on current 170-commit window, passes 95% threshold)

---

## Acceptance Criteria (from brief §5, numbered)

1. **C4 threshold pass:** Re-running `bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z` on 2026-05-17 produces `C4_scope_vocab.actual >= 0.95` in the JSON report.

2. **VOCAB completeness:** The VOCAB string on the single-variable line in the script contains all 52 tokens listed in brief §4.1 and no others.
   - Required tokens (brief §4.1): `agent-doc`, `agents`, `agents-architect`, `alert-accuracy`, `alerts`, `api-gateway`, `arch`, `architecture`, `audit`, `cleanup`, `commit-convention`, `crons`, `cycle`, `data`, `db`, `deploy-verification`, `dev-team`, `docker`, `flow`, `flows`, `infra`, `janitor`, `knowledge`, `market-watcher`, `mcp`, `mcp-server`, `mcp-tool`, `memory`, `merge`, `microservice`, `notebooks`, `pm`, `qa`, `rag`, `readme`, `registry`, `routing`, `scan-market`, `scheduler`, `sessions`, `signals`, `skill`, `skills`, `ssot`, `state`, `system-auditor`, `ta-alert-notifier`, `tasks`, `telegram`, `tree-map`, `types`, `vps` (52 total, alphabetically ordered).

3. **POSIX/bash 3.2 syntax:** `bash scripts/audits/commit-convention-audit.sh --help 2>&1 || bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z` exits without syntax error on bash 3.2 (macOS default). No `local -n`, no `declare -A`, no `[ \>= ]` syntax.

4. **Sprint-ID exemption (pass):** A commit with scope `fix(1872a): subject` is counted as C4 pass (sprint-ID exempt), not a violation, when the script runs.

5. **Non-digit sprint-like (still fail):** A commit with scope `chore(cycle-28): subject` is still counted as C4 violation (area token `cycle-28` does not start with 4 digits and is not in VOCAB).

6. **Knowledge file update:** The `.claude/knowledge/commit-convention.md` Scope Rules section lists the canonical area token vocabulary (all 52 tokens) and explicitly notes the sprint-ID-as-area exemption pattern.

---

## Test Plan

### Functional Tests

- **AC1 / Threshold Pass:**
  1. Edit both files per brief §4.1 and §4.2 (VOCAB expansion + sprint-ID exemption block).
  2. Run `bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z` (no --emit-signal).
  3. Verify JSON report `docs/signals/processed/commit-convention-audit-*.json` shows `C4_scope_vocab.actual >= 0.95`.
  4. Verify `verdict` = "PASS" (all four criteria C1–C4 ≥ thresholds).

- **AC2 / VOCAB Completeness:**
  1. Extract VOCAB string from line 34 of script.
  2. Verify token count = 52 (grep `"${VOCAB}"` → wc -w).
  3. Verify all 52 required tokens present (none missing, none added).
  4. Alphabetically sorted (for clarity in diffs).

- **AC3 / Bash 3.2 Syntax:**
  1. Run `bash -n scripts/audits/commit-convention-audit.sh` — verify clean exit (no syntax error).
  2. Verify no forbidden patterns: `[[`, `declare -A`, `local -n`, `+=` on strings, `[ x \>= y ]`.
  3. Run on macOS default bash (3.2.57): `bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z` — verify clean exit.

- **AC4 / Sprint-ID as area (pass):**
  1. Search git log for commits with sprint-ID-only scope: `git log --all --grep="fix(1872a)" --oneline` (or similar).
  2. If none exist in window, manually check script logic: the sprint-ID block (lines 173–182 in new code) should detect 4+ leading digits and increment `c4_pass`.
  3. Verify early `return` in sprint-ID case prevents fallthrough to vocab loop.

- **AC5 / Non-digit fail:**
  1. Confirm `cycle-28` commit exists in window (brief §2 says yes, 3 true violations listed).
  2. Re-run audit; verify `cycle-28` listed in C4 violations array.
  3. Verify area token `cycle-28` does not start with 4 digits (first 4 = "cycl") → fails sprint-ID match.
  4. Verify `cycle-28` not in VOCAB → fails vocab loop.
  5. Result: marked as violation ✓.

- **AC6 / Knowledge file update:**
  1. Read `.claude/knowledge/commit-convention.md` Scope Rules section.
  2. Verify area token list expanded from 20 to 52 tokens (covers agent names, micro-services, infrastructure, etc.).
  3. Verify explicit note: "Sprint/task IDs used as sole area token (e.g. `1872a`, `1864b`) are accepted but discouraged — prefer `<sprint>/<area>`".
  4. No syntax errors or Markdown corruption.

### Regression Tests

- **Idempotence:**
  1. Run audit once: capture `C4_scope_vocab.actual` and violation count.
  2. Run audit again (same inputs): verify identical output (pass count, violation array, rates).

- **True violations still flagged:**
  1. Verify 3 existing true violations (brief §2) still present:
     - `*` (wildcard in scope)
     - `c26` (letter prefix, not 4+ digits)
     - `cycle-28` (7-char token, first 4 = "cycl", not digits)
  2. Each should appear in C4 violations list.

- **Existing passing commits unchanged:**
  1. Verify commits with vocab-compliant areas (e.g. `fix(scheduler)`, `feat(mcp/docker)`) still counted as pass.
  2. Verify commits with valid `<sprint>/<area>` format not affected by sprint-ID exemption.

### Edge Cases

- **Area token extraction:**
  1. Scope `1872a` (no slash) → area token = `1872a` → matches `[0-9][0-9][0-9][0-9]` → pass ✓
  2. Scope `1872a/flows` → area token = `flows` (last segment) → vocab lookup → pass if in VOCAB ✓
  3. Scope `mcp/1872a` (sprint-ID after slash) → area token = `1872a` → sprint-ID match → pass ✓

- **Boundary cases:**
  1. Area token `123a` (3 digits + letter) → first 4 chars = "123a" → `case` pattern `[0-9][0-9][0-9][0-9]` doesn't match → fallthrough to vocab ✓
  2. Area token `1872` (exactly 4 digits) → first 4 = "1872" → matches pattern → pass ✓
  3. Area token `18720` (5+ digits) → first 4 = "1872" → matches pattern → pass ✓

---

## Implementation Notes

### File 1: scripts/audits/commit-convention-audit.sh

**Change A:** Replace VOCAB on line 34 with 52-token alphabetically-ordered string (brief §4.1).

**Change B:** Replace C4 block (lines 172–202 in current code) with sprint-ID exemption logic (brief §4.1, lines 158–202 in spec).
- New sprint-ID detection: `first4="$(echo "${area_token}" | cut -c1-4)"` + `case "${first4}" in [0-9][0-9][0-9][0-9]) ...` pattern.
- Early return on match → increment pass, skip vocab loop.
- Fallthrough to unmodified vocab loop if not sprint-ID.
- Net +8 LOC (sprint-ID block only; VOCAB line replacement is zero-delta).

### File 2: .claude/knowledge/commit-convention.md

**Change:** Expand Scope Rules section area token list (line 53) with all 52 canonical tokens + explicit sprint-ID exemption note.
- Multi-line format for readability (domain noun categories).
- End with: "Sprint/task IDs used as sole area token (e.g. `1872a`, `1864b`) are accepted but discouraged — prefer `<sprint>/<area>`."
- Net +8 LOC.

---

## Bash 3.2 / POSIX Portability Checklist

Per brief §7, all patterns pre-validated:

| Pattern | Used | Safe? | Notes |
|---------|------|-------|-------|
| `case "${first4}" in [0-9][0-9][0-9][0-9]) ... esac` | sprint-ID detect | YES | POSIX glob, no ERE |
| `cut -c1-4` | extract first 4 chars | YES | POSIX cut |
| `local first4=""` | var declaration | YES | bash 3.2 local |
| `return` inside function | early exit | YES | bash built-in |
| `for token in ${VOCAB}` | vocab loop | YES | word-split, POSIX |
| `echo "${area_token}" \| sed 's\|.*/\|\|'` | area extract | YES | unchanged from current |
| No `[[`, no `+=` strings, no `declare -n` | everywhere | YES | avoided |

**No forbidden patterns:** `[ x \>= y ]` (1877b lesson), `$((...))` with floats, nameref, brace expansion in case.

**LC_ALL/LANG guards:** Already present (line 10–11), no changes needed.

---

## LOC Budget

| File | Type | Net LOC | Constraint |
|------|------|---------|-----------|
| `scripts/audits/commit-convention-audit.sh` | Modify | +8 | ≤30 |
| `.claude/knowledge/commit-convention.md` | Modify | +8 | ≤30 |
| **Total** | | **+16** | **≤30** |

Margin: 14 LOC unused.

---

## Rollback

```bash
git revert HEAD
```

Single commit. Both files reverted to pre-1877c state. No downstream side effects, no service restarts, no schema migrations.

---

## Success Definition

On 2026-05-17, running the audit per brief gate spec produces:
- C4 actual ≥ 0.95 (AC1)
- Verdict = "PASS" (all four criteria)
- Zero new violations for vocab-compliant commits (AC2–AC6)
- Handbook page `.claude/knowledge/commit-convention.md` synced with script (AC6)
