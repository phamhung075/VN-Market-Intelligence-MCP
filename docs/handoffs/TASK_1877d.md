# TASK_1877d — C3 AC Trailer Gap: 77.2% → ≥80%

**Sprint:** 1877d (Phase B Day-7, 2026-05-17 gate)
**Type:** SPRINT-S (≤30 LOC, ≤5 files)
**Owner:** developer
**Handoff from:** PM (2026-05-11 19:22:58Z)

---

## Brief

See `docs/architecture-briefs/2026-05-17-c3-ac-trailer-gap.md` for full diagnostic, risk analysis, and rationale.

**Summary:** Raise C3 (AC trailer presence when Task trailer present) from 0.7654 to ≥ 0.80 by 2026-05-17 gate.

**Path:** (c) Hybrid — Exempt 3 structurally-wrong commit categories from C3 denominator + tighten agent flows.

---

## Files & Patch Sites

### Patch Site 1: `scripts/audits/commit-convention-audit.sh` (lines 155–166)

**Change:** Add `is_c3_exempt` flag detection for:
- Memory/notebook commits (`is_notebook=true`)
- State-bookkeeping commits (`chore(state*)`)
- Merge-task bundle commits (subject contains `merge task/`)

Skip C3 denominator for these commits.

**POSIX bash 3.2 critical:**
- Use `case ... in` branching (no `[[ ]]`, no `=~`)
- Pattern `chore\(state*\):*` — backslash-escape literal parens
- Pattern `*merge\ task/*` — escape literal space
- `is_notebook` already computed (reuse, don't duplicate)
- `LC_ALL=C ; LANG=C` already set at top (no new awk calls)

**LOC delta:** +12 lines (conditional blocks + is_c3_exempt logic)

**Reference:** Brief §4 Patch Site 1 has exact before/after code.

---

### Patch Site 2: `.claude/flows/developer/main.md` (line 45)

**Change:** Add mandatory-trailer reminder to Step 4 (`git add -p && git commit`):

```
Mandatory trailers for task commits: `Sprint:`, `Task:`, `AC:` (slash-separated, terse).
Omit all three only for no-sprint commits (§ No-Sprint Rule).
```

**LOC delta:** +1 line

---

### Patch Site 3: `.claude/flows/qa/main.md` (line 57, Approval section)

**Change:** Add clarification after merge-commit block that:
- Merge commits are AC-exempt (AC lives on the feat/fix commit)
- If QA writes a non-merge commit with `Task:` trailer, it must carry `AC:` trailer

**LOC delta:** +1 line

---

### Patch Site 4: `.claude/knowledge/commit-convention.md` (after line 99, end of No-Sprint Rule section)

**Change:** Insert new section `## C3-Exempt Commit Categories` documenting the exemption inventory:

| Pattern | Example | Reason |
|---|---|---|
| `chore(memory/<id>): ...` | `chore(memory/qa): notebook 2026-05-11` | Notebook commit, no task delivery |
| `chore(state...): ...` | `chore(state): 1877c → In Progress` | Pipeline bookkeeping |
| Subject contains `merge task/` | `chore(1869/mcp-server): merge task/1869a-...` | AC lives on the feat/fix commit |

**LOC delta:** +10 lines

---

## Acceptance Criteria

1. **AC-1:** `bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z` reports C3 ≥ 0.80 after patch applied.

2. **AC-2:** `chore(memory/qa): notebook 2026-05-11 | Task=1862i` no longer counted in C3 denominator.

3. **AC-3:** `chore(state): 1877c → In Progress | Task=1877c` no longer counted in C3 denominator.

4. **AC-4:** `chore(1869/mcp-server): merge task/1869a-... | Task=1869a` no longer counted in C3 denominator.

5. **AC-5:** A genuine `feat(1877d/audit): Task=1877d` commit WITHOUT AC trailer IS still counted as a violation (not exempt).

6. **AC-6:** `bash -n scripts/audits/commit-convention-audit.sh` exits 0 (no syntax errors). Script runs under `/usr/bin/env bash` version 3.2 (macOS system bash).

---

## Dependencies

- None (atomic change)

---

## Notes for Developer

### Commit Message & Trailers

This sprint carries its own C3 AC-trailer responsibility. Your final commit demonstrating the patch must include:
- `Task: 1877d`
- `AC: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6` (comma-separated, or one per line)

Example:
```
chore(1877d/audit): C3 exemption policy — notebook/state/merge commits

Path (c) Hybrid: exempt 3 structurally-wrong categories from C3 denominator.
- memory/* → no task delivery
- chore(state*) → pipeline bookkeeping
- merge task/* subject → AC on feat/fix

Net +24 LOC across 4 files. C3 target ≥0.80 by 2026-05-17 gate.

Sprint: 1877d
Task: 1877d
AC: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
```

### Test/Verification

After local edits, run the audit script to confirm C3 ≥ 0.80:

```bash
bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z
```

Check the JSON output `c3` field. If JSON syntax fails, run:

```bash
bash -n scripts/audits/commit-convention-audit.sh
```

Both must exit 0.

### Brief Reference

For rationale, violation inventory, risk mitigation, and bash 3.2 validation details, see:
- Brief §2 (Diagnosis — bucket breakdown)
- Brief §3 (Path Decision — why Hybrid)
- Brief §4 (Implementation — exact patch code + LOC delta)
- Brief §7 (Risk — false-positive masking + scope creep + bash 3.2 compat)

---

## Archive (if needed)

This task handoff does not require archival of prior versions — it is the single decomposition from architect brief 1877d.
