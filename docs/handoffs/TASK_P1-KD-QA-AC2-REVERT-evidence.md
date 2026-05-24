---
task_id: P1-KD-QA-AC2-REVERT
title: "AC-2 only spot re-verify — kinh-dich Phase-1 close-gate (fix-then-clean-GO loop)"
date: "2026-05-24"
pilot: "kinh-dich"
phase: "1"
qa_agent: "qa"
dev_fix_commit: "b7cb55bc"
dev_fix_signal: "docs/signals/dev-kinh-dich-P1-KD-H-done-20260524T011108Z.json"
prior_gate: "P1-G (CONDITIONAL-GO — AC-2 honest-RED at 5/6)"
verdict: "AC-2 PASS — Phase-1 clean full GO"
---

# P1-KD-QA-AC2-REVERT — AC-2 Spot Re-verify Evidence

## Context

Prior P1-G gate (cycle-61) gave CONDITIONAL-GO because AC-2 was honest-RED at 5/6 card groups
(83% < 90% threshold). The reading-scorer 4th primitive was absent from `window.__PRIMITIVES_DATA__`.
PO authorized fix-then-clean-GO. Dev-kinh-dich executed P1-KD-H (commit `b7cb55bc`), adding
the reading-scorer card group. This gate re-checks AC-2 only. The other 5 P1-G ACs already
PASSED and are not re-litigated.

## Pre-flight

| Check | Result |
|-------|--------|
| Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` | INTACT — `git merge-base --is-ancestor` → exit 0 |
| dev commit `b7cb55bc` present | CONFIRMED — `git log --oneline -10` shows at position 2 |
| Staged index before QA work | EMPTY — `git diff --cached --name-only` → no output |
| P1-KD-H signal filed | CONFIRMED — `docs/signals/dev-kinh-dich-P1-KD-H-done-20260524T011108Z.json` |

## AC-2 Verification — 6/6 Card Groups

### 1. reading-scorer present in `window.__PRIMITIVES_DATA__`

| Sub-check | Result | Evidence |
|-----------|--------|----------|
| `reading-scorer` occurrences in HTML | 8 | `grep -c "reading-scorer" dashboard/index.html` → 8 |
| Distinct primitives in `window.__PRIMITIVES_DATA__` | 4 | hao-encoder, hexagram-resolver, ngu-hanh-classifier, reading-scorer |
| reading-scorer scenario count | 3 | golden / edge / failure |
| reading-scorer has real `input` fields | YES | outcomeTexts, trendTexts, actionTexts, voteInput — all present |
| reading-scorer has real `expectedOutput` fields | YES | outcomeScores, trendScores, actions, majorityAction — all present |
| Placeholder / TODO / TBD in reading-scorer block | NONE | scan shows no placeholder tokens |
| reading-scorer status values | `"not-run"` x3 | Lines 1222, 1241, 1260 confirmed |

### 2. Total card groups = 6/6

| Level | Card groups | Detail |
|-------|-------------|--------|
| Level 1 — Primitives | 4 | hao-encoder, hexagram-resolver, ngu-hanh-classifier, reading-scorer |
| Level 2 — Module | 1 | reading_composer |
| Level 3 — Microservice | 1 | kinh-dich-service panel (present in HTML at lines 895-909) |
| **Total** | **6/6** | **100% ≥ 90% threshold — PASS** |

Label at line 855: `4 pure TypeScript functions: hao-encoder, hexagram-resolver, ngu-hanh-classifier, reading-scorer` — CONFIRMED.

### 3. Honesty preserved — cold-open NOT-RUN

| Sub-check | Result | Evidence |
|-----------|--------|----------|
| Total `"status": "not-run"` entries in HTML | 14 | python3 count across all lines |
| Primitive not-run chip | `12 NOT-RUN` (line 864) | `id="prim-notrun-chip"` text = "12 NOT-RUN" |
| Module not-run chip | `2 NOT-RUN` (line 886) | `id="mod-notrun-chip"` text = "2 NOT-RUN" |
| Any false-green (status != "not-run") in embedded data | NONE | All 14 entries are "not-run" |

### 4. Dashboard self-contained — zero external network calls

| Sub-check | Result | Evidence |
|-----------|--------|----------|
| `fetch()` calls | 0 | `re.findall(r'fetch\s*\(', content)` → 0 |
| `XMLHttpRequest` | 0 | regex scan → 0 |
| External `src/href/url` references | 0 | regex scan → 0 |
| CDN references (non-comment) | 0 | no jsdelivr/unpkg/cdn. matches outside comments |
| External `<script src="https://...">` | 0 | regex scan → 0 |
| External `<link href="https://...">` | 0 | regex scan → 0 |

Dashboard opens via `file://`, zero production credentials, zero external fetch. Self-contained CONFIRMED.

### 5. Browser-only checks — honest defer

- "Zero console errors at runtime" — browser-only. CANNOT claim PASS headlessly.
  Deferred to G9 PO Playwright (as in prior P1-G gate).
- "Post-sandbox GREEN status update" — browser JavaScript interaction required.
  Deferred to G9 PO Playwright.

These two sub-checks were already deferred in P1-G. No new degradation.

### AC-2 Verdict

**PASS** — 6/6 card groups rendered (100% ≥ 90%); reading-scorer present in `window.__PRIMITIVES_DATA__`
with 3 real scenarios; honesty contract intact (all 14 status = "not-run" on cold-open); dashboard
self-contained (zero external fetch/XHR/network calls). Browser-only sub-checks deferred to G9 PO
Playwright (unchanged from prior gate — not a regression).

## G12 DoD Re-confirm — Sandbox 14/14

QA-independent run:

```
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

Output (verbatim):

```
[PASS] hao-encoder-edge.json
[PASS] hao-encoder-failure.json
[PASS] hao-encoder-golden.json
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] hexagram-resolver-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] ngu-hanh-classifier-golden.json
[PASS] reading-scorer-edge.json
[PASS] reading-scorer-failure.json
[PASS] reading-scorer-golden.json
[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json

[sandbox] PASS 14/14 scenarios (0 failed, 0 skipped)
```

**G12 DoD: 14/14 PASS — CONFIRMED GREEN**

## Hard Constraints Audit

| Constraint | Status |
|-----------|--------|
| Charter §4.5 — no G-goal flips | HONORED — no goal state modified |
| SSOT `docs/data/pilot-status-kinh-dich.json` | NOT TOUCHED — read-only gate |
| No branch created — main only | CONFIRMED |
| L84 explicit-path staging — no `-A`/`.` | ENFORCED |
| Frozen anchor `debba8eaff0` | INTACT — exit 0 |
| Foreign pilots untouched (TA, macro, stock-price) | CONFIRMED — QA touched only evidence file + signal |
| No `--force`/`--no-verify`/`--no-gpg-sign`/`git push` | NOT USED |
| No destructive git | CONFIRMED |

## Phase-1 Verdict

**Phase-1 = clean full GO.**

All 4 P1-G exit criteria now met:

| Criterion | Prior P1-G | Now |
|-----------|-----------|-----|
| Criterion 1 — time to first primitive (≤4 agent-hours) | PASS | PASS (unchanged) |
| Criterion 2 — sandbox all-green | PASS (14/14) | PASS — 14/14 QA-independent re-run |
| Criterion 3 — dashboard ≥90% | FAIL (83%, 5/6) | **PASS (100%, 6/6)** |
| Criterion 4 — G12 3/3 streak | PASS | PASS (unchanged) |

**Result: 4/4 exit criteria met → Phase-1 = clean full GO.**

## Next Actor

Signal: `docs/signals/qa-kinh-dich-P1-KD-QA-AC2-REVERT-done-20260524T070000Z.json`
next_actor: pm
next_action: on AC-2 PASS, flip phase1 → APPROVED (clean full GO) in SSOT `docs/data/pilot-status-kinh-dich.json`
