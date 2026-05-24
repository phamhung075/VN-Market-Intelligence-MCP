---
task_id: "P2-KD-F"
task_title: "G5a — git mv Superseded domain/services.ts to src/_deprecated/ + Usecases Rewire"
owner: "dev-kinh-dich"
phase: "2"
pilot: "kinh-dich-service"
status: "READY"
dispatched_at: "2026-05-24T23:59:00Z"
blocked_by: "P2-KD-E"
blocks: "P2-KD-G"
estimate_hours: 1.5
ac_count: 7
g_goals_advanced: ["G5a"]
---

# TASK P2-KD-F — G5a: `git mv` Superseded `domain/services.ts` → `src/_deprecated/` + Usecases Rewire

**Owner:** dev-kinh-dich  
**Blocked by:** P2-KD-E DONE (`kinh-dich-pre-delete` tag confirmed)  
**Blocks:** P2-KD-G (MCP HTTP rewire)  
**Estimate:** 1.5 hours  
**G-goals advanced:** G5a (PARTIAL toward G5 chain; G5a + G5b + G5c = G5 terminal)  

---

## Context

Per brownfield §5 and OQ-2 resolution: `apps/kinh-dich-service/src/domain/services.ts` (`computeReading()` + `classifyNguHanh()` + hexagram library data) was the Phase-1 predecessor of the `reading_composer` module. After Phase-1 validation (COMPLETE), these functions are superseded. This task **atomically moves** the file and rewires all callers in one commit, with explicit self-verification that the original is GONE and ONLY the deprecated copy remains.

**Hexagram library data** (`TRIGRAM_LINES`, `QUE_META`, `QUE_DATA`, etc.): dev-kinh-dich may move to a thin `src/domain/hexagram-data.ts` OR embed directly in relevant primitives. **Document the decision in the handoff evidence section below.**

---

## Pre-Condition (Mandatory)

Verify the pre-delete tag exists before any mutation:
```bash
git log --oneline kinh-dich-pre-delete
```
Must return the P2-KD-E commit. **STOP and notify PM if tag is missing.**

---

## Acceptance Criteria

### AC-1: G5a File Moved (Original GONE)

**Mandatory atomic-move self-verify:** The `git mv` MUST be staged and committed together with caller rewires in ONE atomic commit. After commit, **verify no orphaned originals**:

```bash
# After committing the move + rewires:
git show --stat <commit-sha>
```

**Evidence required in handoff:**
- Commit SHA showing `git show --stat` output
- Output must show **rename** (not add/delete) for `domain/services.ts` → `_deprecated/services_v1.ts`
- Verify original path is GONE:
```bash
test -f apps/kinh-dich-service/src/domain/services.ts && echo FAIL: STILL_EXISTS || echo PASS: GONE
test -f apps/kinh-dich-service/src/_deprecated/services_v1.ts && echo FOUND || echo FAIL: NOT_FOUND
```
Both lines must show PASS/FOUND (no orphaned original tracked alongside the moved copy).

**Final git-tree check:**
```bash
git ls-tree -r HEAD --name-only | grep "domain/services.ts"
```
Must return **empty** (original path has NO entry in the tree).

```bash
git ls-tree -r HEAD --name-only | grep "_deprecated/services_v1.ts"
```
Must return **exactly one** entry under `_deprecated/`.

---

### AC-2: Application Use Cases Rewired

The use cases in `src/application/usecases.ts` must no longer import `computeReading` or `classifyNguHanh` from the deprecated domain service. They must call `ReadingComposer.compose()` from the `reading_composer` module instead.

```bash
grep -n "computeReading\|classifyNguHanh" apps/kinh-dich-service/src/application/usecases.ts
```

Must return **0 matches** (no direct imports of the deprecated functions remain).

**Paste evidence into handoff §AC-2 Evidence.**

---

### AC-3: TypeScript Build Clean

```bash
cd apps/kinh-dich-service && bun run tsc --noEmit
```

Exits **0**. The deprecation move did not break TypeScript compilation — deprecated service compiles at new path, use cases now call the module.

**Paste full output (or "tsc --noEmit: OK").**

---

### AC-4: ESLint Fences Clean Post-Move

```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

Exits **0**. No new fence violations (Fence-A/B/C) introduced by the `git mv` or use-case rewire.

**Paste full output (or "eslint: OK, 0 warnings").**

---

### AC-5: G12 DoD Gate (Sandbox Green)

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

Exits **0**. Sandbox still green after deprecation move (≥14 scenarios PASS).

**Paste summary:** e.g., "14/14 PASS (12 primitives + 2 module scenarios)"

---

### AC-6: `_deprecated/` Directory Exists with Moved File

```bash
find apps/kinh-dich-service/src -path "*_deprecated*" -type f | sort
```

Output includes `services_v1.ts` (or `services_deprecated.ts`) under the `_deprecated/` path.

**Paste output.**

---

### AC-7: Fence-C Still Holds (Infra NOT Imported Outside Composition Root)

**Post-move verification that infrastructure imports remain isolated to `src/index.ts`:**

```bash
grep -rn "from.*infrastructure" \
  apps/kinh-dich-service/src/domain/ \
  apps/kinh-dich-service/src/application/ \
  apps/kinh-dich-service/src/module/ \
  apps/kinh-dich-service/src/primitive/
```

Must return **0 matches**. All infrastructure (SQLite via `SQLiteKinhDichRepository`) is importable **only** from `src/index.ts` (composition root).

**Paste output (or "0 matches").**

---

## Implementation Checklist

- [ ] **Pre-condition verified:** `git log --oneline kinh-dich-pre-delete` returns P2-KD-E commit
- [ ] **`git mv` executed atomically:**
  ```bash
  git mv apps/kinh-dich-service/src/domain/services.ts \
      apps/kinh-dich-service/src/_deprecated/services_v1.ts
  ```
- [ ] **Usecases rewired** in `src/application/usecases.ts` to call `reading_composer` module
- [ ] **Hexagram library data decision documented** (move to thin `hexagram-data.ts` OR embed in primitives)
- [ ] **Move + rewires staged together:**
  ```bash
  git add apps/kinh-dich-service/src/_deprecated/services_v1.ts
  git add apps/kinh-dich-service/src/application/usecases.ts
  git add docs/handoffs/TASK_P2-KD-F.md
  ```
- [ ] **Atomic commit (move + rewires + handoff in one commit):**
  ```bash
  git commit -m "chore(kinh-dich): P2-KD-F — git mv domain/services.ts → _deprecated/ + usecases rewire to reading_composer (G5a)"
  ```
- [ ] **Self-verify no orphaned originals:**
  - `git show --stat <sha>` shows rename (not add/delete)
  - `test -f apps/kinh-dich-service/src/domain/services.ts` returns GONE
  - `git ls-tree -r HEAD --name-only | grep "domain/services.ts"` returns empty
- [ ] **Run all ACs (1-7) and paste evidence into §Evidence section below**

---

## Evidence

### AC-1 Evidence — Atomic Move Self-Verify

**Commit SHA:** (to be filled after commit)

**`git show --stat` output:**
```
(paste here)
```

**Original file gone check:**
```
(paste here)
```

**git-tree verification:**
```
(paste here)
```

---

### AC-2 Evidence — Use Cases Rewired

**grep output (must show 0 matches):**
```
(paste here)
```

---

### AC-3 Evidence — TypeScript Clean

**tsc --noEmit output:**
```
(paste here)
```

---

### AC-4 Evidence — ESLint Clean

**eslint output:**
```
(paste here)
```

---

### AC-5 Evidence — G12 DoD (Sandbox Green)

**Sandbox summary:**
```
(paste here)
```

---

### AC-6 Evidence — `_deprecated/` Directory

**find output:**
```
(paste here)
```

---

### AC-7 Evidence — Fence-C Integrity

**grep output (must show 0 matches):**
```
(paste here)
```

---

## Hexagram Data Decision

**Decision:** (document whether hexagram library data moves to `src/domain/hexagram-data.ts` OR is embedded in primitives)

**Reasoning:**

(justify choice in 1-2 sentences)

**Implementation:** (note any code changes made to handle the data migration)

---

## G-Goal Posture

**NO goal flips.** This task advances G5a toward the G5 terminal (G5a + G5b + G5c = full G5). Goal status remains TBD per §4.5 SSOT freeze. The `docs/data/pilot-status-kinh-dich.json` SSOT is PM-owned; dev NEVER modifies it.

---

## Return

When all ACs pass and evidence is pasted:

**SIGNAL FILE:** Create `docs/signals/dev-kinh-dich-P2-KD-F-done-<UTC>.json`:
```json
{
  "agent": "dev-kinh-dich",
  "task_id": "P2-KD-F",
  "status": "DONE",
  "timestamp": "<ISO-8601>",
  "commit_sha": "<sha>",
  "evidence": {
    "atomic_move_verified": true,
    "usecases_rewired": true,
    "sandbox_green": true,
    "fence_integrity_intact": true
  },
  "hexagram_data_location": "(documented above)",
  "next_actor": "pm",
  "next_action": "verify P2-KD-F atomicity self-check, then sequence P2-KD-G (G5b MCP HTTP rewire)"
}
```

**RETURN to PM:** In caveman chat or direct message.

---

## Notes

- **L84 staging:** Stage only the moved file + rewired usecases + this handoff, together in ONE atomic commit
- **Anchor integrity:** Verify `debba8eaff0724d1fb32fc9d28640201cc32d1cc` is still ancestor after commit
- **R-FENCE gate:** Fence-C integrity is binding; infra imports outside `src/index.ts` = task FAIL
- **G12 DoD:** Sandbox baseline 14/14 must not regress
- **No goal flips:** This task does NOT flip goalsEarned or any G-goal state in SSOT
