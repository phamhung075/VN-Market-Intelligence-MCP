---
sprint: P2-J
task: P2-J
pilot: alert-engine
phase: 2
title: "G8 Honest-Red Deliberate-Break Proof — Evidence"
owner: qa
completedAt: "2026-05-24T08:00:02Z"
verdict: PASS
---

# G8 Honest-Red Evidence — alert-engine

## Summary

QA proved the alert-engine sandbox/dashboard does NOT show false-green. Three deliberately corrupted
scenario runs all produced honest non-zero exits and FAIL status. All corruptions were reverted; git
status confirms zero scenario files remain modified. Baseline 11/11 confirmed before and after.

---

## § Evidence — G8 Test A (Corrupted Scenario)

```
Scenario file edited: docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json
Expected field changed: suppress  from  false  to  true

Sandbox run (corrupted):
{"time":"2026-05-24T09:59:18.865121+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-edge.json"}
{"time":"2026-05-24T09:59:18.865862+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-failure.json"}
{"time":"2026-05-24T09:59:18.866997+02:00","level":"INFO","msg":"FAIL","scenario":"cooldown-gate-golden.json","reason":"cooldown-gate: Suppress=false want=true (reason=\"\")"}
{"time":"2026-05-24T09:59:18.867493+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-edge.json"}
{"time":"2026-05-24T09:59:18.867918+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-failure.json"}
{"time":"2026-05-24T09:59:18.868289+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-golden.json"}
{"time":"2026-05-24T09:59:18.868779+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-edge.json"}
{"time":"2026-05-24T09:59:18.869178+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-failure.json"}
{"time":"2026-05-24T09:59:18.869535+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-golden.json"}
{"time":"2026-05-24T09:59:18.870007+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-edge.json"}
{"time":"2026-05-24T09:59:18.870493+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-golden.json"}
total=11 pass=10 fail=1 status=FAIL
exit status 1   [EXIT CODE: 1]

Dashboard state (corrupted):
cooldown-gate card: RED / FAIL — status=FAIL, fail=1, total=11. Dashboard reads JSON output written
by sandbox; the summary line "status=FAIL" causes the cooldown-gate primitive card to render non-green.

File reverted: git checkout -- docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json
```

---

## § Evidence — G8 Test B (Golden Scenario After Revert)

```
Sandbox run (golden/reverted):
{"time":"2026-05-24T09:59:27.39634+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-edge.json"}
{"time":"2026-05-24T09:59:27.396886+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-failure.json"}
{"time":"2026-05-24T09:59:27.397024+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-golden.json"}
{"time":"2026-05-24T09:59:27.397461+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-edge.json"}
{"time":"2026-05-24T09:59:27.397878+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-failure.json"}
{"time":"2026-05-24T09:59:27.398203+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-golden.json"}
{"time":"2026-05-24T09:59:27.398575+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-edge.json"}
{"time":"2026-05-24T09:59:27.39893+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-failure.json"}
{"time":"2026-05-24T09:59:27.399235+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-golden.json"}
{"time":"2026-05-24T09:59:27.399652+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-edge.json"}
{"time":"2026-05-24T09:59:27.400085+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-golden.json"}
total=11 pass=11 fail=0 status=OK
exit 0   [EXIT CODE: 0]

Dashboard state (golden/reverted):
All 11 cards GREEN. status=OK, pass=11, fail=0. No false greens; dashboard honestly reflects
sandbox run results — every card passing the scenario suite shows green status.
```

---

## § Evidence — Additional Bad Runs (AC-3)

```
Run 1 — signal-classifier-golden.json corruption:
Field changed: valid  from  true  to  false

{"time":"2026-05-24T09:59:35.966005+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-edge.json"}
{"time":"2026-05-24T09:59:35.966266+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-failure.json"}
{"time":"2026-05-24T09:59:35.966363+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-golden.json"}
{"time":"2026-05-24T09:59:35.966504+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-edge.json"}
{"time":"2026-05-24T09:59:35.966631+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-failure.json"}
{"time":"2026-05-24T09:59:35.966721+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-golden.json"}
{"time":"2026-05-24T09:59:35.966836+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-edge.json"}
{"time":"2026-05-24T09:59:35.966913+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-failure.json"}
{"time":"2026-05-24T09:59:35.967008+02:00","level":"INFO","msg":"FAIL","scenario":"signal-classifier-golden.json","reason":"signal-classifier: Valid=true want=false (severity=\"high\")"}
{"time":"2026-05-24T09:59:35.967171+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-edge.json"}
{"time":"2026-05-24T09:59:35.967279+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-golden.json"}
total=11 pass=10 fail=1 status=FAIL
Sandbox exit code: 1 (NON-ZERO)
Reverted: git checkout -- docs/scenarios/alert-engine/primitives/signal-classifier-golden.json

Run 2 — dedup-key-builder-golden.json corruption:
Field changed: fingerprint  from  "4c79b07f"  to  "deadbeef"

{"time":"2026-05-24T09:59:48.62833+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-edge.json"}
{"time":"2026-05-24T09:59:48.628575+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-failure.json"}
{"time":"2026-05-24T09:59:48.628667+02:00","level":"INFO","msg":"PASS","scenario":"cooldown-gate-golden.json"}
{"time":"2026-05-24T09:59:48.628815+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-edge.json"}
{"time":"2026-05-24T09:59:48.628902+02:00","level":"INFO","msg":"PASS","scenario":"dedup-key-builder-failure.json"}
{"time":"2026-05-24T09:59:48.629138+02:00","level":"INFO","msg":"FAIL","scenario":"dedup-key-builder-golden.json","reason":"dedup-key-builder: fingerprint=\"4c79b07f\" want=\"deadbeef\" (stock=\"VCB\" signals=[MACD_CROSS BB_BREAK])"}
{"time":"2026-05-24T09:59:48.629284+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-edge.json"}
{"time":"2026-05-24T09:59:48.629407+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-failure.json"}
{"time":"2026-05-24T09:59:48.629504+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-golden.json"}
{"time":"2026-05-24T09:59:48.629679+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-edge.json"}
{"time":"2026-05-24T09:59:48.629795+02:00","level":"INFO","msg":"PASS","scenario":"alert-pipeline-golden.json"}
total=11 pass=10 fail=1 status=FAIL
Sandbox exit code: 1 (NON-ZERO)
Reverted: git checkout -- docs/scenarios/alert-engine/primitives/dedup-key-builder-golden.json
```

---

## § Evidence — Git Status After All Reverts (AC-4)

```bash
$ git status --short | grep "scenarios"
 D apps/pdf-extractor/scenarios/primitives/validate_financial_figures/.gitkeep
 M docs/scenarios/kinh-dich/module/reading-composer-edge.json
 M docs/scenarios/kinh-dich/module/reading-composer-golden.json
?? apps/pdf-extractor/scenarios/primitives/validate_financial_figures/edge_vnm_val01.json
?? apps/pdf-extractor/scenarios/primitives/validate_financial_figures/failure_negative_assets.json
?? apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
?? docs/scenarios/news-fetch/module/

[RESULT: Zero alert-engine scenario files present — all from other pilots (kinh-dich, pdf-extractor,
news-fetch). No alert-engine corruption remains. AC-4 PASS.]
```

---

## § AC Summary Table

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 (Test A) | PASS | cooldown-gate-golden suppress flipped → exit 1, fail=1, dashboard RED |
| AC-2 (Test B) | PASS | after revert → exit 0, total=11 pass=11 fail=0 status=OK, all-green |
| AC-3 Run 1 | PASS | signal-classifier-golden valid flipped → exit 1, fail=1 |
| AC-3 Run 2 | PASS | dedup-key-builder-golden fingerprint wrong → exit 1, fail=1 |
| AC-4 | PASS | git status grep scenarios = zero alert-engine modifications |
| AC-5 | PASS | evidence file + signal emitted |

**G8 contract verdict: PASS — dashboard is NOT false-green. Honest-red proven on 3 distinct primitives.**

---

## § Signal Emission (AC-5)

File created: `docs/signals/qa-ae-P2-J-g8-done-20260524T080002Z.json`
