---
task_id: P2-KD-M
title: "Create kinh-dich-pre-inject Tag + G10 Deliberate Bug Injection"
owner: qa
phase: 2
goal_advanced: ["G10 setup"]
date_created: 2026-05-24
blocked_by: P2-KD-L
blocks: P2-KD-N
est_hours: 0.33
ac_count: 4
---

# TASK_P2-KD-M: Create `kinh-dich-pre-inject` Tag + G10 Bug Injection

**Owner:** qa  
**Blocked by:** P2-KD-L DONE (G9 confirmed — trust layer proven before deliberately breaking things)  
**Blocks:** P2-KD-N  
**Est:** 20m  
**ACs:** 4

---

## Background

L5 tag discipline + G10 bug injection spec from charter §G10. The `kinh-dich-pre-inject` tag MUST exist BEFORE the injection commit, providing a rollback anchor. QA injects a SINGLE-LITERAL bug into a kinh-dich primitive that IS exercised by at least one scenario, causing that scenario (and potentially coupled scenarios) to fail. The bug compiles (tsc exit 0) but fails at runtime.

**Key discipline:**
- Tag created FIRST (Step 0)
- Bug injected SECOND
- Bug is committed as a real defect (P2-KD-N fixer must rediscover from RED sandbox, stays BLIND to the literal)
- G12 DoD EXCEPTION applies: RED sandbox after P2-KD-M is CORRECT and required (G10 baseline)

---

## Acceptance Criteria

### AC-1: `kinh-dich-pre-inject` Tag Exists Before Injection

**Step 0 (ONLY action before file edit):**

```bash
git tag kinh-dich-pre-inject HEAD
git log --oneline kinh-dich-pre-inject
```

Must return the P2-KD-L evidence commit (PO's G9 verdict, commit a2a1002f or later).

Confirm tag exists:
```bash
git tag | grep kinh-dich-pre-inject
```
Must return `kinh-dich-pre-inject` (tag present in local repo).

**Evidence:** Paste output of both commands to handoff.

---

### AC-2: Injection Causes ≥1 Scenario Failure

**Bug injection target:** `apps/kinh-dich-service/src/primitive/hao-encoder/index.ts`

**Injection pattern (QA picks exact literal from these candidates):**

Option A: Threshold off-by-one
```typescript
// BEFORE: const LAO_DUONG_THRESHOLD = 0.75;
// AFTER:  const LAO_DUONG_THRESHOLD = 0.85;
```

Option B: Comparison flip
```typescript
// BEFORE: if (score > threshold) return 1;
// AFTER:  if (score >= threshold) return 1;
```

Option C: Mapping value flip
```typescript
// BEFORE: LAO_DUONG: 1
// AFTER:  LAO_DUONG: 0
```

**Effect:** `hao-encoder-golden.json` scenario fails (expected HaoReading states no longer match actual computed states for boundary-value inputs).

**Verification:** After injection, run:
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```

Must exit non-zero with ≥1 FAIL for `hao-encoder` scenario.

**Evidence:** Paste full sandbox output to handoff `§Evidence — G10 Injection (Pre-Fix)`. Exact failure text must be visible.

---

### AC-3: Dashboard Reflects Injected Failure

After sandbox runs with the injected bug, the `hao-encoder` card on the dashboard shows FAIL/RED status (not GREEN, not pending).

**Verification:** QA describes the dashboard state observed after running sandbox with the bug injected. Evidence can be a text description or screenshot showing the `hao-encoder` card status as RED/FAIL.

**Evidence:** Paste dashboard state description to handoff `§Evidence — G10 Dashboard RED`.

---

### AC-4: Injection Commit Message

Commit subject pattern (mandatory):
```
test(kinh-dich): P2-KD-M — deliberate bug injection for G10 AI-fixability proof (kinh-dich-pre-inject tagged)
```

Commit body includes:
- Which primitive was injected: `hao-encoder`
- Which option was chosen: (A: threshold, B: comparison, C: mapping)
- Exact literal that was changed: (e.g., `LAO_DUONG_THRESHOLD: 0.75 → 0.85`)
- Why this bug tests G10: single-literal defect, compiles clean, fails at runtime on boundary scenarios
- Dashboard impact: hao-encoder card RED after sandbox run
- G12 DoD EXCEPTION: RED sandbox is CORRECT here; this is the G10 baseline

**Evidence:** Commit message pasted to handoff.

---

## Files to Touch

- `apps/kinh-dich-service/src/primitive/hao-encoder/index.ts` — ONE literal changed (bug injection)
- `docs/handoffs/TASK_P2-KD-M.md` — This handoff file (evidence recorded)

---

## Commit Pattern

**ONE commit** with both changes:
1. Tag created (Step 0, before any file edits)
2. Bug injected (Step 1-onward, file edit + commit)

```bash
# Tag first
git tag kinh-dich-pre-inject HEAD

# Edit hao-encoder with one literal
# (exact change per AC-2 options)

# Stage explicitly (L84 discipline)
git add apps/kinh-dich-service/src/primitive/hao-encoder/index.ts
git add docs/handoffs/TASK_P2-KD-M.md

# Commit with pattern from AC-4
git commit -m "test(kinh-dich): P2-KD-M — deliberate bug injection for G10 AI-fixability proof (kinh-dich-pre-inject tagged)"
```

---

## Anchor & SSOT Integrity

**Anchor remains INTACT:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```
Must return non-empty (anchor is still a proper ancestor of HEAD).

**SSOT untouched:**
- `docs/data/pilot-status-kinh-dich.json` must NOT be edited by this task
- `goalsEarned` stays 0
- No goal state flips
- `phase2.current_task` = P2-KD-M (PM-set; QA does NOT edit SSOT)

---

## G-Goal Posture

**NO goal flips.** §4.5 SSOT untouched. G10 injection is infrastructure setup only.

**G12 DoD EXCEPTION:** RED sandbox after P2-KD-M is CORRECT and required. The sandbox failure is the baseline that P2-KD-N's fix cycle will remediate. No escalation.

---

## Next

**next_actor: dev-kinh-dich** — receive P2-KD-M DONE signal, diagnose RED sandbox from G10 injection, fix the single-literal bug, verify sandbox GREEN (≤2 cycles total).

---

## Evidence Sections

### Evidence — G10 Injection (Pre-Fix)

```
[FAIL] hao-encoder-edge.json | result[4].state: expected LAO_DUONG but got THIEU_DUONG
[PASS] hao-encoder-failure.json
[FAIL] hao-encoder-golden.json | result[0].state: expected LAO_DUONG but got THIEU_DUONG
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] hexagram-resolver-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] ngu-hanh-classifier-golden.json
[PASS] nuclear-hexagram-computer-edge.json
[PASS] nuclear-hexagram-computer-failure.json
[PASS] nuclear-hexagram-computer-golden.json
[PASS] reading-scorer-edge.json
[PASS] reading-scorer-failure.json
[PASS] reading-scorer-golden.json
[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json

[sandbox] FAIL 15/17 scenarios (2 failed, 0 skipped)
SANDBOX_EXIT=1

tsc exit 0 (compiles clean with injected bug)
```

### Evidence — G10 Dashboard RED

```
After running sandbox with injected bug, the hao-encoder card displays FAIL/RED status.
The sandbox runner exited non-zero (exit 1) with 2 scenarios failing:
- hao-encoder-golden.json: FAIL
- hao-encoder-edge.json: FAIL
The dashboard living-docs page (apps/kinh-dich-service/src/interface/dashboard/)
reflects the RED state for hao-encoder primitive. The LAO_DUONG_THRESHOLD bug
causes any score in range (0.75, 0.85] to be misclassified as THIEU_DUONG instead
of LAO_DUONG, producing wrong state + isChanging=false instead of true.
```

### Evidence — Tag Created

```
$ git tag | grep kinh-dich
kinh-dich-pre-ci
kinh-dich-pre-delete
kinh-dich-pre-inject

$ git log --oneline kinh-dich-pre-inject
b4cdb1db signal(pm/kinh-dich): P2-KD-M ready — kinh-dich-pre-inject tag + G10 bug injection handoff (next: qa)
(... full history follows)
```

### Evidence — Commit Message

```
test(kinh-dich): P2-KD-M — deliberate bug injection for G10 AI-fixability proof (kinh-dich-pre-inject tagged)

Injection details:
- Target: apps/kinh-dich-service/src/primitive/hao-encoder/index.ts
- Option chosen: A (threshold off-by-one)
- Literal changed: LAO_DUONG_THRESHOLD 0.75 → 0.85
- Effect: hao-encoder golden + edge scenarios fail (2 FAILs); scores in (0.75, 0.85]
  misclassified as THIEU_DUONG instead of LAO_DUONG; tsc exit 0 (runtime-only defect)
- Dashboard: hao-encoder card RED after sandbox run
- G12 DoD EXCEPTION: RED sandbox is required for G10 baseline
- kinh-dich-pre-inject tag created at b4cdb1db before this commit
```
