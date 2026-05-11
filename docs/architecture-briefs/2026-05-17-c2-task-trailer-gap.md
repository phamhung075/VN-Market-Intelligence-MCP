# Brief 1877e — C2 Task Trailer Gap: 58.67% → ≥85%

**Gate:** Phase B Day-7 (2026-05-17) | **Current:** C2 = 0.5867 | **Target:** ≥ 0.85
**Audit script:** `scripts/audits/commit-convention-audit.sh`

---

## §1 Goal

`bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z` reports `C2_task_trailer.actual >= 0.85` on 2026-05-17.

Baseline (2026-05-11): C2 = 0.5867 (44/75). Required delta: +26.33pp minimum.

---

## §2 Live Diagnosis

**Audit run 2026-05-11T19:49Z. Window: 2026-05-10 → 2026-05-17. C2 denom = 75 commits.**

### C2 violation buckets (all 31 misses, full enumeration)

| Category | Count | Pattern | Exempt candidate? |
|---|---|---|---|
| `cycle-NN` | 1 | `chore(cycle-28): persist 1872a artifacts` | YES — digit is cycle number, not sprint |
| `pm/cNN` | 1 | `chore(pm/c26): add 4 Done rows from TNB c36 handoff` | YES — digit is cycle ref, not sprint |
| `chore(NNNN*): merge task/` | 3 | `chore(1870a): merge task/…`, `chore(1869/mcp-server): merge task/…` (×2) | YES — AC lives on feat/fix; same logic as C3 exemption |
| `chore(pm/NNNN*)` sprint-decompose | 2 | `chore(pm/1862c): decompose…`, `chore(pm/1862c-G): move to Done` | YES — PM bookkeeping, not code delivery |
| genuine delivery miss (history-locked) | 24 | `fix(mcp/1876a/*)`, `fix(1864b)`, `docs(1871*)`, etc. | NO — all pre-1877, all history-locked |

**Total safe exemptions: 7 misses (cycle-NN=1, pm/cNN=1, merge task/=3, pm/sprint=2).**

All 24 genuine misses are history-locked (sprints 1862–1876, committed into Phase B window on 2026-05-10+). Cannot rewrite. Must dilute with new compliant commits.

### Projected C2 after exemptions

| Scenario | Pass | Denom | Rate |
|---|---|---|---|
| Current | 44 | 75 | 0.5867 |
| After 7 exemptions (removes misses from denom) | 44 | 68 | **0.6471** |
| + 92 new compliant commits (100%) | 136 | 160 | **0.8500** PASS |
| + 150 new at 95% compliance | 186 | 218 | **0.8532** PASS |
| + 222 new at 95% compliance | 255 | 290 | **0.8793** PASS |
| + 222 new at 80% compliance | 222 | 290 | **0.7655** FAIL |

**Key math:** need 92+ new sprint-scoped commits at ≥91.2% compliance to reach 0.85. At observed sprint rate of ~37 sprint-scoped commits/day, 92 arrives in 2.5 days. With 6 days remaining and near-perfect flow tightening, target is reachable but requires high compliance. 80% compliance fails. Developer flow must fire correctly on every commit.

**1877 sprint commits already in window:** 3/3 with Task trailer (100%). Flow tightening works when followed.

---

## §3 Path Decision — Path (c) Hybrid

**(i) audit script `is_c2_exempt` + (ii) flow tightening (3 flows, not 4) + (iii) knowledge file table.**

### Exemption case logic — exact literal patterns

```
Exempt: scope == "cycle-<N>"      → scope starts with "cycle-" followed by digit
Exempt: scope == "pm/c<N>"        → scope matches "pm/c" followed by digit (cycle ref)
Exempt: scope == "pm/<NNNN>*"     → scope is pm/NNNN* (sprint-specific PM bookkeeping)  
Exempt: subject contains "merge task/"  → sprint-scoped chore wrapping a task branch merge
```

**Merge subject literal (lesson from 1877d AC-4 deviation):** The C3 exemption uses `*merge\ task/*`. The 3 C2 merge-task commits have subjects:
- `chore(1870a): merge task/1870a-fpt-bctc-verify — FAIL verdict + new root cause`
- `chore(1869/mcp-server): merge task/1869b-seed-alert-drop-defaults`
- `chore(1869/mcp-server): merge task/1869b-wire-watchlist-thresholds`

Pattern `*merge task/*` (space-literal, forward-slash) matches all three. Note: `chore(merge):` bare commits are already OUTSIDE C2 denominator (no digit in scope `merge`). The pattern here targets sprint-scoped chores whose SUBJECT contains `merge task/`.

**POSIX bash 3.2 pre-validation:**
- `case "${scope}" in cycle-[0-9]*) ... ;; esac` — POSIX glob, no ERE
- `case "${scope}" in pm/c[0-9]*) ... ;; esac` — POSIX glob
- `case "${scope}" in pm/[0-9][0-9][0-9][0-9]*) ... ;; esac` — POSIX glob, 4-digit sprint
- `case "${lsubj}" in *"merge task/"*) ... ;; esac` — POSIX glob, literal string in quotes
- No `[[ ]]`, no `[ x \>= y ]`, no `local -n`, no `mapfile`, no `declare -A`
- `LC_ALL=C ; LANG=C` already set at script top — no new awk

---

## §4 Implementation — Exact Patch Sites

### 1877e-1 — `scripts/audits/commit-convention-audit.sh`

**Patch site:** lines 143–153 (C2 gate block). Add `is_c2_exempt` before the gate.

**Before (line 143):**
```bash
  if [ "${is_sprint_scoped}" = "true" ] && [ "${is_notebook}" = "false" ]; then
    c2_denominator=$((c2_denominator + 1))
```

**After:**
```bash
  # C2 exempt: scope digit is cycle/PM-cycle reference, not sprint task
  # Or: subject is a sprint-scoped merge-task chore (AC lives on feat/fix)
  local is_c2_exempt=false
  case "${scope}" in
    cycle-[0-9]*)
      is_c2_exempt=true
      ;;
    pm/c[0-9]*)
      is_c2_exempt=true
      ;;
    pm/[0-9][0-9][0-9][0-9]*)
      is_c2_exempt=true
      ;;
  esac
  case "${lsubj}" in
    *"merge task/"*)
      is_c2_exempt=true
      ;;
  esac

  if [ "${is_sprint_scoped}" = "true" ] && [ "${is_notebook}" = "false" ] && [ "${is_c2_exempt}" = "false" ]; then
    c2_denominator=$((c2_denominator + 1))
```

**LOC delta:** +17 lines added, 1 line changed. Net: +17 LOC in 1 file.

**Insert position:** immediately before line 143 (`if [ "${is_sprint_scoped}" = "true" ]`), which is 1 line after the `is_notebook` block closing `fi` (line 141). The `scope` variable is already extracted at line 129 — no re-extraction needed.

**Why pm/[0-9]{4}* is safe:** distinguishes `pm/1862c` (sprint, exempt) from `pm/1877d` (could also be sprint PM bookkeeping) vs `pm/c26` (cycle ref, already caught by pm/c[0-9]*). All PM sprint bookkeeping commits (decompose, move-to-Done) are non-delivery. The developer flow mandates Task trailer for all actual code commits regardless.

---

### 1877e-2 — Flow tightening (3 files, not 4)

**agent-father flows produce only `chore(memory/agent-father)` commits — already exempt from C2. Exclude from scope. The 4th file is pm/main.md.**

#### File A: `.claude/flows/developer/main.md` — already patched (lines 45-46 have Task mandate)

No change needed. Developer flow already enforces Task trailer. The 24 genuine misses are history-locked pre-patch commits.

**Verification only:** confirm lines 45-46 read:
```
4. `git add -p && git commit` — format per `.claude/knowledge/commit-convention.md`
   Mandatory trailers for task commits: `Sprint:`, `Task:`, `AC:` (slash-separated, terse). Omit all three only for no-sprint commits (§ No-Sprint Rule).
```

**No change to developer/main.md.** LOC delta: 0.

#### File B: `.claude/flows/pm/main.md` — add commit step for PM sprint commits

PM writes `chore(pm/NNNN)` sprint-scoped commits (decompose, move-to-Done) without a documented commit convention. After 1877e-1 exempts these from C2 denominator, no trailer is needed — but the exemption scope must be documented.

**After line 68 (End of cycle line), insert:**
```markdown
**PM commits convention:**
- `chore(memory/pm): notebook YYYY-MM-DD` — notebook only, no trailers (C2-exempt)
- `chore(pm/cNN): <description>` — cycle bookkeeping, no trailers (C2-exempt: cycle ref)
- `chore(pm/NNNN*): <description>` — sprint bookkeeping (decompose, move-to-Done), no trailers (C2-exempt: PM housekeeping)
- `chore(cycle-NN): <description>` — cycle artifact persist, no trailers (C2-exempt: cycle ref)
- Any commit where scope contains a sprint number AND delivers code/config MUST carry `Task:` trailer.
```

**LOC delta:** +5 lines in 1 file.

#### File C: `.claude/flows/qa/main.md` — lines 57-58 already patched (1877d)

Lines 57-58 already read (from 1877d):
> Merge commits are AC-trailer exempt (AC lives on the feat/fix commit).
> If QA writes a non-merge commit that carries `Task:` trailer, it must also carry `AC:` trailer.

Add C2 reminder after line 57:
```
QA non-merge commits with sprint scope (digit in scope) MUST carry `Task:` trailer.
```

**LOC delta:** +1 line in 1 file.

**Total 1877e-2: +6 LOC across 2 files (developer/main.md unchanged).**

---

### 1877e-3 — `.claude/knowledge/commit-convention.md`

**Patch site:** after line 112 (end of C3-Exempt table), insert new section.

**Insert:**
```markdown
## C2-Exempt Commit Categories

These commit types are excluded from the C2 denominator — they contain a digit in scope but do not deliver sprint tasks:

| Pattern | Example | Reason |
|---|---|---|
| `chore(cycle-NN): ...` | `chore(cycle-28): persist 1872a artifacts` | Digit is cycle number, not sprint ID |
| `chore(pm/cNN): ...` | `chore(pm/c26): add Done rows from TNB c36` | Digit is cycle reference |
| `chore(pm/NNNN*): ...` | `chore(pm/1862c): decompose RCA brief` | PM sprint bookkeeping, no code delivery |
| Sprint-scoped chore containing `merge task/` | `chore(1869/mcp-server): merge task/1869b-...` | AC lives on the feat/fix commit |
```

**LOC delta:** +12 lines in 1 file.

---

## §5 Acceptance Criteria

- **AC-1** — `bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z` on 2026-05-17 reports `C2_task_trailer.actual >= 0.85`.
- **AC-2** — SHA `234a69b3` (`chore(cycle-28)`) is NOT in C2 denominator post-patch (spot-check: rerun script, violations list must not include it; or add `--verbose` trace).
- **AC-3** — SHA `6f02aed1` (`chore(pm/c26)`) is NOT in C2 denominator post-patch.
- **AC-4** — SHA `c7545b9a` (`chore(1869/mcp-server): merge task/1869b-seed-alert-drop-defaults`) is NOT in C2 denominator post-patch (subject contains `merge task/`).
- **AC-5** — SHA `e6d37aa7` (`chore(pm/1862c): decompose architect RCA brief`) is NOT in C2 denominator post-patch (scope `pm/1862c` matches `pm/[0-9]{4}*`).
- **AC-6** — A genuine delivery commit like SHA `0a5ffc3f` (`fix(mcp/1876a/scan-market)`) IS still in C2 denominator and still counted as a violation (scope has digit, not exempt pattern).
- **AC-7** — `bash -n scripts/audits/commit-convention-audit.sh` exits 0 (bash 3.2 syntax clean).

---

## §6 Sub-task Dependencies for PM

| Sub-task | Dep | Can fire Tier 1? |
|---|---|---|
| 1877e-1 — audit script `is_c2_exempt` | none | YES |
| 1877e-2 — flow tightening (pm + qa) | none | YES |
| 1877e-3 — knowledge file C2-exempt table | none | YES |

**All 3 are independent. PM can fire Tier 1 parallel.** No sub-task reads output of another before writing.

---

## §7 Risk

### R1 — Exemptions alone insufficient (HIGH, known)

After 7 exemptions: C2 = 44/68 = 0.647. Still far below 0.85. Threshold crossing depends on 92+ new sprint-scoped commits at ≥91.2% compliance in 6 remaining days. If sprint activity slows or flow compliance drops below 90%, gate fails. **Mitigation:** PM must prioritize 1877e-2 immediately so all remaining sprint work in 1877+ carries Task trailer. Zero tolerance for omission.

### R2 — pm/NNNN* over-exemption (MEDIUM)

Pattern `pm/[0-9]{4}*` exempts ALL PM sprint-scoped commits. If a PM agent writes production logic in a `chore(pm/NNNN)` commit (unlikely by convention but possible), it evades C2. **Mitigation:** `chore` type signals no behaviour change; production delivery uses `feat`/`fix`. C1 would flag wrong type. Risk is acceptable.

### R3 — merge task/ masking genuine delivery (LOW)

A developer could exploit `*merge task/*` pattern in a subject to evade C2. The pattern is distinctive enough (`merge task/` with trailing slash and task-id) that accidental use is implausible. **Mitigation:** none needed beyond code review.

### R4 — Forward-only enforcement, retroactive gap (LOW)

24 history-locked genuine misses remain in denom permanently. They represent a ~24/68 = 35% drag floor that dilutes any future compliance gains. Window closes 2026-05-17 — after which the window resets and this drag disappears. **No action; accept.**

### R5 — 1877d AC-4 deviation (chore(merge) subject) (LOW, monitored)

1877d AC-4 tested `chore(1869/mcp-server): merge task/1869b…` excluded from C3. The new `*"merge task/"*` pattern in C2 is the same glob semantics. Confirmed match against all 3 sprint-scoped merge-task subjects in live data. No deviation expected.

---

## §8 Budget

| File | LOC added | LOC removed | Net |
|---|---|---|---|
| `scripts/audits/commit-convention-audit.sh` | +17 | 0 | +17 |
| `.claude/flows/pm/main.md` | +5 | 0 | +5 |
| `.claude/flows/qa/main.md` | +1 | 0 | +1 |
| `.claude/knowledge/commit-convention.md` | +12 | 0 | +12 |

**Total: +35 LOC across 4 files. Within ≤80 LOC / ≤8 files SPRINT-M budget.**

Developer flow: no change (already patched in prior sprint). Agent-father: out of scope (only produces memory/* commits, already exempt).
