---
task_id: P2-KD-K
title: G8 Honest-Red Deliberate-Break Proof — Evidence Log
date: 2026-05-24
author: qa
---

# G8 Evidence Log — P2-KD-K

## §Test A — Corrupted Scenario (hexagram-resolver-golden)

**Corruption:** `docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json`
Changed `"hexagram": 1` → `"hexagram": 99`

**Sandbox run:** `--tier=primitive --module=kinh-dich --scenario=all`

```
[FAIL] hexagram-resolver-golden.json | Expected hexagram 99 but got 1
[sandbox] FAIL 14/15 scenarios (1 failed, 0 skipped)
EXIT_CODE=1
```

**Verdict:** Sandbox exits non-zero (1). Affected scenario: `hexagram-resolver-golden.json`.
Dashboard state: `hexagram-resolver` primitive card shows FAIL/RED (dashboard reads runner output JSON).

**Revert:** `git checkout -- docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json`

---

## §Test B — Golden Scenario After Revert

**Sandbox run:** `--tier=all --module=kinh-dich --scenario=all`

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
[PASS] nuclear-hexagram-computer-edge.json
[PASS] nuclear-hexagram-computer-failure.json
[PASS] nuclear-hexagram-computer-golden.json
[PASS] reading-scorer-edge.json
[PASS] reading-scorer-failure.json
[PASS] reading-scorer-golden.json
[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json

[sandbox] PASS 17/17 scenarios (0 failed, 0 skipped)
EXIT_CODE=0
```

**Verdict:** Sandbox exits 0. All 17/17 scenarios PASS. Dashboard: all 5 primitive cards + module card + microservice card GREEN. No false greens on NOT-RUN items.

---

## §AC-3 Evidence — 2 Additional Known-Bad Runs

### Run 2a: ngu-hanh-classifier-golden corruption

**Corruption:** `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json`
Changed `"dynamic": "TUONG_SINH"` → `"dynamic": "TUONG_KHAC"`

```
[FAIL] ngu-hanh-classifier-golden.json | Expected dynamic=TUONG_KHAC but got TUONG_SINH
[sandbox] FAIL 14/15 scenarios (1 failed, 0 skipped)
EXIT_CODE=1
```

Reverted: `git checkout -- docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json`

### Run 2b: hao-encoder-golden corruption

**Corruption:** `docs/scenarios/kinh-dich/primitives/hao-encoder-golden.json`
Changed first state `"LAO_DUONG"` → `"LAO_AM"` in expected states array.

```
[FAIL] hao-encoder-golden.json | result[0].state: expected LAO_AM but got LAO_DUONG
[sandbox] FAIL 14/15 scenarios (1 failed, 0 skipped)
EXIT_CODE=1
```

Reverted: `git checkout -- docs/scenarios/kinh-dich/primitives/hao-encoder-golden.json`

---

## §AC-4 — Reverted Files Clean

```
git status --short | grep "scenarios/kinh-dich"
(empty — no output)
```

All 3 corruption edits reverted. Zero scenario files remain modified.

---

## G8 Assessment

**Dashboard is HONEST.**

- RED on corrupted scenario: CONFIRMED (exit 1, FAIL line printed for each corruption)
- GREEN on golden scenarios after revert: CONFIRMED (exit 0, 17/17 PASS)
- No false greens on NOT-RUN items: CONFIRMED (dashboard only shows GREEN where sandbox-run with PASS)

Three distinct primitives tested: `hexagram-resolver`, `ngu-hanh-classifier`, `hao-encoder` — all turned sandbox RED independently. Each revert restored GREEN.

G8 honest-red contract: SATISFIED.

---

## Anchor Integrity

Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD. No branches created. No scenario files committed. SSOT untouched.
