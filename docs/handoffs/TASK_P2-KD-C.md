# TASK_P2-KD-C — G4 Deliberate-Violation Proof (Fence-A/B/C Test)

**Pilot:** kinh-dich-service (fleet pilot 4)  
**Phase:** 2  
**Owner:** dev-kinh-dich + qa (QA reproduces independently)  
**Status:** READY  
**Blocked by:** P2-KD-B DONE (eslint.config.mjs exists, bunx eslint passes clean)  
**Blocks:** P2-KD-D (G4 freeze anchor confirmation)  
**Estimated effort:** 30 minutes  
**Acceptance criteria count:** 5 (AC-1 through AC-5)  
**G-goals advanced:** G4 (full — R-FENCE gate proof)

---

## Background

AC-4b requires proof that the fence CATCHES a real violation on kinh-dich's actual `.js`-suffixed ESM import style. The violation is a controlled local experiment ONLY. It MUST be reverted before any commit is made. `git status` must be clean after revert. 

This is the **R-FENCE gate** — the binding proof that `eslint-plugin-boundaries` works on this service's real import style.

**Critical constraint:** NO violation is committed. This task creates zero lasting code changes. Evidence (ESLint output logs) is committed, but the violations are reverted.

---

## Files Touched

**NONE committed.** Violation is local-only, reverted before any commit. Only the handoff evidence document is staged and committed.

---

## Violation Procedure (dev-kinh-dich executes)

### Step 1 — Inject Fence-A Violation

Append ONE temporary Fence-A violation to `hexagram-resolver`:

```bash
echo "" >> apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
echo "// DELIBERATE FENCE-A VIOLATION — DO NOT COMMIT" >> apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
echo "import type { ReadingRequest } from '../../application/dtos.js'; // Fence-A breach" >> apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
```

**Do NOT stage or commit** — keep the edit local only.

### Step 2 — Run Linter on Violation

```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

**Expected:** Exit code non-zero. Output contains "Fence-A" in error message.

Paste the full output here (for AC-1 evidence):

```
[PASTE LINTER OUTPUT WITH FENCE-A ERROR]
```

### Step 3 — Revert Violation Immediately

```bash
git checkout apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
```

### Step 4 — Confirm Clean Linter Run

```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

**Expected:** Exit code 0. No boundary errors.

Paste output here (for AC-2 evidence):

```
[PASTE CLEAN LINTER OUTPUT]
```

### Step 5 — Confirm Git Status Clean

```bash
git status --short | grep "hexagram-resolver"
```

**Expected:** Returns empty (no changes). Violation was NEVER staged, NEVER committed.

---

## R-2 Fallback (if needed)

If Step 2 fails to produce "Fence-A" in the ESLint output (R-2 pattern matching fails on `.js`-suffixed imports):

1. Add to `apps/kinh-dich-service/package.json` devDependencies:
   ```json
   "@typescript-eslint/parser": "^7.0.0"
   ```
   **Note:** This may already be present from P2-KD-B signal `r2_fallback_applied: true`.

2. Ensure `eslint.config.mjs` includes:
   ```javascript
   import tsParser from "@typescript-eslint/parser";
   // ... in the config object:
   languageOptions: { parser: tsParser },
   ```

3. Rerun Steps 2-5.

Record the R-2 resolution in the §R-FENCE Resolution section below. This fallback stays within Option A and does NOT require a new task — apply it inline.

---

## QA Independent Reproduction

**Owner:** qa  
**Procedure:** Independently reproduce the violation proof using a DIFFERENT primitive file.

Example: Use `src/primitive/ngu-hanh-classifier/index.ts` instead of hexagram-resolver:

```bash
# Step 1: Inject violation on ngu-hanh-classifier
echo "" >> apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts
echo "// DELIBERATE FENCE-A VIOLATION — QA PROOF" >> apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts
echo "import type { ReadingRequest } from '../../application/dtos.js'; // Fence-A breach" >> apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts

# Step 2: Run linter
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
# Expected: non-zero exit + "Fence-A" in output

# Step 3: Revert
git checkout apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts

# Step 4: Confirm clean
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
# Expected: exit 0

# Step 5: Confirm git clean
git status --short | grep "ngu-hanh-classifier"
# Expected: empty
```

Paste QA's own violation-run output here (for AC-4 evidence):

```
[PASTE QA'S LINTER VIOLATION OUTPUT]
```

---

## Acceptance Criteria

### AC-1 — Linter exits non-zero on violation; "Fence-A" in output

**Verification:**

Dev-kinh-dich runs Step 2 (linter on injected violation) and captures output. Output must show:
- Exit code: non-zero
- Message: contains "Fence-A: primitive must not import application layer"
- File: `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts`

Expected output format:
```
apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
  N:N  error  Fence-A: primitive must not import application layer  boundaries/element-types

1 problem (1 error, 0 warnings)
```

**Evidence pasted above in Step 2.**

**Status:** __ PASS __ FAIL

---

### AC-2 — Linter exits 0 after revert

**Verification:**

Dev-kinh-dich runs Step 4 (linter after revert) and confirms exit 0.

Expected output: No errors, no warnings.

**Evidence pasted above in Step 4.**

**Status:** __ PASS __ FAIL

---

### AC-3 — Git status clean after revert (hexagram-resolver)

**Verification:**

```bash
git status --short | grep "hexagram-resolver"
```

Must return empty (no changes staged or unstaged).

**Status:** __ PASS __ FAIL

---

### AC-4 — QA independently reproduces violation (different primitive)

**Verification:**

QA executes the same violation procedure on a DIFFERENT primitive file (e.g., ngu-hanh-classifier).

Output must show:
- Violation run: non-zero exit + "Fence-A" in message
- Clean run (after revert): exit 0
- Git status clean (no changes)

**Evidence pasted above in QA Independent Reproduction section.**

**Status:** __ PASS __ FAIL

---

### AC-5 — G12 DoD gate: sandbox all-green (14/14 baseline)

**Verification:**

After all violations are reverted and git status is clean, run:

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

**Expected:** Exit code 0, all scenarios PASS (≥14).

**Paste output here:**

```
[PASTE SANDBOX OUTPUT]
```

**Status:** __ PASS __ FAIL

---

## Evidence Summary

| AC | Evidence | Status |
|----|----------|--------|
| AC-1 | Linter violation-run output (non-zero exit + "Fence-A" in message) | __ |
| AC-2 | Linter clean-run output (exit 0 after revert) | __ |
| AC-3 | `git status --short` showing no hexagram-resolver changes | __ |
| AC-4 | QA violation-run output (different primitive, non-zero + "Fence-A") | __ |
| AC-5 | Sandbox 14/14 PASS output (exit 0) | __ |

---

## R-FENCE Resolution

**If R-2 fallback was needed in P2-KD-B or here:**

- **Detected at:** [P2-KD-B | P2-KD-C]
- **Symptom:** `eslint-plugin-boundaries` did not match `.js`-suffixed ESM imports
- **Root cause:** ESLint 9 flat config does not parse .ts-suffixed imports without explicit parser
- **Fix applied:** Added `@typescript-eslint/parser` + `languageOptions: { parser: tsParser }` to `eslint.config.mjs`
- **Status:** Option A (stays within charter boundary)
- **Result:** Linter now catches Fence-A violations on real import style ✓

---

## Commit Message

**No violation code is committed.** Only the handoff document with evidence is staged and committed.

Dev-kinh-dich commits the handoff update:
```
chore(kinh-dich): P2-KD-C — G4 deliberate-violation proof (R-FENCE gate) handoff complete
```

QA commits their reproduction evidence in the same or separate commit (optional, may be combined if both authors use same branch).

---

## G-Goal Posture

NO goal flips. AC-4b is the R-FENCE gate arm of G4. G4 is not yet terminal. SSOT remains untouched (no `goalsEarned` increment; no `status` flip).

All goal flips are **PO-only**, in one atomic Phase-3 commit at 12/12 terminal close (Charter §4.5).

---

## Next Task

After P2-KD-C DONE signal is received and verified:
- PM sequences P2-KD-D (G4 freeze anchor confirmation — QA owns)

---

**Charter references:**  
- Pilot charter: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` §G4  
- Phase-2 task plan: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md` §P2-KD-C  
- SI-3 fence spike: `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` (Option A final)  
- P2-KD-B handoff: `docs/handoffs/TASK_P2-KD-B.md`
