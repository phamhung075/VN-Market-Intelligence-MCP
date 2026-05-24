---
task_id: "P2-L"
title: "Create stock-price-pre-inject tag + G10 bug injection"
authored_by: "pm"
authored_at: "2026-05-24T02:59:00Z"
pilot: "stock-price"
phase: "2"
owner: "qa"
blocked_by: "P2-K (DONE 2026-05-24T01:56:55Z — G9 verified)"
blocks: "P2-M (G10 fix ≤2 cycles + G11 coupling proof)"
---

# P2-L — Create `stock-price-pre-inject` Tag + G10 Bug Injection

## Task Overview

**G-goal:** G10 setup — deliberate bug injection for AI-fixability proof

**Owner:** qa

**Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §G10, §Phase 2 §P2-L

**Rationale:** L5 pre-revert tag discipline (binding). The `stock-price-pre-inject` tag MUST be created at HEAD (after P2-K close-gate) BEFORE any bug injection commit. This tag marks the byte-identical baseline that P2-M will compare against when fixing the bug (G10 criterion: "byte-identical restore ≤2 cycles" = revert-to-tag OR single-edit fix that equals revert).

The injected bug is a SINGLE-LITERAL deliberate defect. It must be committed (a real git commit, not just staged) because:
1. The bug must be discoverable via `git diff` between clean HEAD and bug-injected HEAD.
2. The P2-M fix cycle will measure cycles-to-FIX starting from this injected commit.
3. The dashboard will show RED state after sandbox run with the injected bug (G10/G12 DoD contract: sandbox RED when code is broken).

---

## Pre-Revert Tag Creation (BINDING SEQUENCE)

**Step 0 — BEFORE ANY FILE EDIT:**

```bash
git tag stock-price-pre-inject HEAD
git log --oneline stock-price-pre-inject
```

The tag must resolve to the P2-K evidence commit (the most recent commit on main after P2-K PO decision completion). STOP if tag creation fails.

**Verify:**
```bash
git tag | grep stock-price-pre-inject
```

Must return `stock-price-pre-inject` (tag exists in local git repo).

---

## Bug Injection Procedure

**CRITICAL:** The injected bug is a SINGLE-LITERAL defect in a stock-price primitive. After injection and sandbox run, the dashboard will show RED for that primitive (G12 DoD contract: sandbox RED is expected/intended for injection task; see AC-3 and G12 DoD note below).

### Target Selection

**Primitive:** `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go`

**Rationale:** This primitive has a golden scenario in `docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json` with clear boundary conditions (fresh vs stale threshold). An off-by-one or literal-swap injection in the staleness logic will cause a predictable failure detectable by the sandbox.

### Injection Type

**Pattern:** Off-by-one or wrong literal (deterministic, one-character/one-literal fix).

**Example injections** (pick ONE):

1. **Off-by-one comparison:** Change the staleness threshold check from `>= freshThresholdSeconds` to `> freshThresholdSeconds` (OR the opposite direction).
   
2. **Flip constant:** If a constant like `STALE_THRESHOLD = 60` exists, change it to `STALE_THRESHOLD = 600` (tenfold).

3. **Flip return value:** Change a return from `return FRESH` to `return STALE` in a boundary case (or vice versa).

4. **Wrong field assignment:** Assign the wrong field to an output struct (e.g., `result.Status = STALE` → `result.Status = FRESH`).

**Requirement:** The fix must be a single edit (one literal, one comparison operator, one return statement, one field). After fix, sandbox exits 0 and dashboard GREEN.

### Step 1 — Inject the Bug

Edit `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go`. Make ONE literal change that causes the golden scenario to fail.

**Example (Option 1):**
```go
// Before:
if ageSeconds >= freshnessThresholdSeconds {
    return STALE
}

// After (bug injected):
if ageSeconds > freshnessThresholdSeconds {  // ← changed >= to >
    return STALE
}
```

Save the file.

### Step 2 — Verify Bug Effect

Run sandbox to confirm the bug is detectable:

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

**Expected:** Exit code non-zero. Output shows FAIL for `price-staleness-classifier`:
```
✗ price-staleness-classifier-golden — expected FRESH but got STALE (or vice versa)
```

Paste this output to the handoff AC-2 section.

### Step 3 — Verify Dashboard RED

Open `apps/stock-price/dashboard/index.html` in a browser (after sandbox run populates results, if the dashboard reads sandbox output):

**Expected:** `price-staleness-classifier` card shows RED / FAIL status.

Describe dashboard state in AC-3 section.

### Step 4 — Commit the Injection

**Commit subject pattern:**
```
test(stock-price): P2-L — deliberate bug injection for G10 AI-fixability proof (stock-price-pre-inject tagged)
```

**Commit body:** Include:
- Description of the injection (which file, which literal, what effect)
- Reference to `stock-price-pre-inject` tag (created at HEAD before this commit)
- Note that dashboard will show RED after this injection (expected/intended for G10 test cycle)

**Command:**
```bash
git add apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go
git commit -m "test(stock-price): P2-L — deliberate bug injection for G10 AI-fixability proof (stock-price-pre-inject tagged)"
```

**Verify tag ancestry:**
```bash
git log --oneline -2
# Should show: (HEAD) bug injection commit on top, (parent) commit tagged with stock-price-pre-inject below
```

---

## Acceptance Criteria (AC)

### AC-1: Pre-Inject Tag Exists

**Criterion:** `stock-price-pre-inject` tag is created and resolves to the commit BEFORE the injection.

**Verification:**
```bash
git log --oneline stock-price-pre-inject
```

Must return a commit SHA (the P2-K evidence commit or a commit after P2-K close-gate). The tag must NOT error.

**Verify ancestry:**
```bash
git log --oneline -2 | head -1  # Shows injection commit
git tag stock-price-pre-inject --contains | wc -l  # Should be 1 (tag points to parent)
```

Or manually inspect:
```bash
git log --oneline stock-price-pre-inject..HEAD
# Must show exactly 1 commit: the injection commit
```

**Status:** PASS if tag exists and is ancestor of current HEAD; FAIL if tag missing or newer than HEAD.

---

### AC-2: Injection Causes Sandbox Failure

**Criterion:** After injection, `go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` exits non-zero with ≥1 FAIL for the affected primitive.

**Verification:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

**Expected output pattern:**
```
✗ price-staleness-classifier-golden — [error message or expected vs actual comparison]
total: 9, pass: 8, fail: 1, status: FAIL
exit code: 1
```

**Status:** PASS if exit code 1 and ≥1 primitive scenario fails; FAIL if exit code 0 (injection had no effect).

Paste FULL terminal output to this AC section.

---

### AC-3: Dashboard Shows RED for Affected Primitive

**Criterion:** After sandbox run (with injected bug), opening `apps/stock-price/dashboard/index.html` in a browser shows RED or FAIL status for the `price-staleness-classifier` card.

**Verification (manual):**
1. Run sandbox: `cd apps/stock-price && go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` (exits 1)
2. Open dashboard: `open apps/stock-price/dashboard/index.html`
3. Inspect `price-staleness-classifier` card: Should show RED / FAIL badge

**Verification (automated — optional Playwright check):**
```bash
# Query DOM for price-staleness-classifier card status
npx playwright install chromium
# [run Playwright script to check card color/status]
```

**Status:** PASS if card displays RED/FAIL; FAIL if still shows GREEN or NOT-RUN.

Describe or screenshot the dashboard state showing the RED card.

---

### AC-4: Injection Commit Created with Correct Message

**Criterion:** The injection is committed with the specified subject pattern and contains reference to the pre-inject tag.

**Verification:**
```bash
git log --oneline -1
# Should show: test(stock-price): P2-L — deliberate bug injection for G10 AI-fixability proof (stock-price-pre-inject tagged)
```

**Commit body should include:**
- Injected file path: `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go`
- Change type: e.g., "off-by-one comparison operator change" or "constant value swap"
- Pre-inject tag reference: `stock-price-pre-inject`
- Note: "Dashboard shows RED — expected for G10 injection task"

**Status:** PASS if commit subject matches pattern and body documents injection; FAIL if missing details.

---

## G12 DoD Note (Dashboard RED is Expected/Intended)

**Charter §Phase 2 Task Plan §P2-L:**

> The injected bug is COMMITTED (it must be a real defect for the G10 fix-cycle to find/fix in P2-M), and the pre-inject tag marks the clean byte-identical baseline the P2-M fix will be compared against. **Include the G12 DoD note (the injected-bug commit itself will make the sandbox RED — that is expected/intended for the injection task; capture exactly how the plan wants the RED state evidenced vs. the normal green DoD).**

**Translation for this task:**

Normally, the G12 DoD gate requires `sandbox all-green BEFORE DONE` on every task. **P2-L is an EXCEPTION:** The sandbox WILL show RED after this task's DONE signal. This is intentional and required for G10 proof.

- **Normal DoD:** sandbox exits 0, all scenarios PASS, dashboard GREEN.
- **P2-L DoD:** sandbox exits 1, ≥1 scenario FAIL (the injected primitive), dashboard RED for that primitive.

This RED state is the "starting point" for P2-M fix cycle (QA documents "cycle 1" = P2-M receives RED sandbox, starts debugging).

**Ratification:** The injected RED state is NOT a defect in P2-L; it is the correct deliverable (a "broken" state for testing). P2-M will restore GREEN by fixing the single-literal bug.

---

## Hard Gates & Constraints

| Gate | Requirement | Status |
|------|-------------|--------|
| **L5 pre-revert tag** | `stock-price-pre-inject` created BEFORE injection commit | Must pass AC-1 |
| **Single-literal injection** | Bug is one character / one literal change | Must pass AC-2 (deterministic sandbox failure) |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD | Must verify: `git merge-base --is-ancestor debba8eaff0724d1fb32fc9d28640201cc32d1cc HEAD` exits 0 |
| **L84 explicit staging** | `git add` explicit path only (the modified .go file), NOT `git add -A` or `git add .` | Must use: `git add apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` | Follow git atomicity rules |
| **Zone discipline** | ONLY modify `apps/stock-price/pkg/primitive/` — NEVER touch other zones or SSOTs | AC-1..AC-4 scope verified |

---

## Signal Emission

**After AC-1..AC-4 all PASS and injection commit created:**

QA emits signal: `docs/signals/qa-sp-P2-L-bug-injection-done-<UTC>.json`

**Signal template:**
```json
{
  "signal": "qa-sp-P2-L-bug-injection-done",
  "task": "P2-L",
  "pilot": "stock-price",
  "phase": "2",
  "emitted_by": "qa",
  "emitted_at": "<ISO-UTC>",
  "pre_inject_tag": "stock-price-pre-inject",
  "tag_sha": "<SHA of tagged commit>",
  "injection_commit_sha": "<SHA of injection commit>",
  "injection_file": "apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go",
  "injection_type": "off-by-one comparison" | "constant swap" | "return flip" | "field assignment",
  "sandbox_effect": "exit 1, price-staleness-classifier scenario FAIL",
  "dashboard_effect": "price-staleness-classifier card RED",
  "ac_verdicts": {
    "AC-1": "PASS (tag exists, ancestor of HEAD)",
    "AC-2": "PASS (sandbox exit 1, ≥1 scenario fail)",
    "AC-3": "PASS (dashboard RED for affected primitive)",
    "AC-4": "PASS (injection commit created with correct message)"
  },
  "g12_dod_note": "Sandbox RED is expected/intended for P2-L injection task. Not a DoD violation. P2-M fix cycle starts from this RED state.",
  "next_actor": "pm",
  "next_action": "verify P2-L, update SSOT, dispatch P2-M (G10 fix ≤2 cycles + G11 coupling proof)"
}
```

---

## Summary

| Item | Value |
|---|---|
| Task ID | P2-L |
| Title | Create `stock-price-pre-inject` tag + G10 bug injection |
| Owner | qa |
| Blocked by | P2-K (G9 verified, PO decision doc completed) |
| Blocks | P2-M (G10 AI-fix proof) |
| AC count | 4 |
| Est effort | 20 min |
| Pre-inject tag | `stock-price-pre-inject` (created at Step 0, BEFORE injection) |
| Injection target | `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go` |
| Injection type | Single-literal (off-by-one, constant swap, return flip, or field assignment) |
| Expected sandbox effect | Exit 1, ≥1 primitive scenario FAIL |
| Expected dashboard effect | `price-staleness-classifier` card RED |
| Charter binding | L5 tag discipline, G10 bug-injection spec, G12 DoD exception (RED is OK for this task) |
| Anchor | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor |

---

## Next Step (PM)

After QA signals P2-L DONE with all AC verdicts PASS:
1. Verify signal + injection commit.
2. Confirm pre-inject tag exists and is tagged correctly.
3. Mark P2-L DONE in SSOT.
4. Dispatch P2-M (dev-stock-price + qa — fix injected bug ≤2 cycles + prove G11 coupling on 2 trials).

**If any AC fails:** QA and PM coordinate to remediate before P2-M dispatch.
