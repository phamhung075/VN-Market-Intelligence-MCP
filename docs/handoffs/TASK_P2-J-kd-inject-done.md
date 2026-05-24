---
task: P2-J
owner: qa
status: DONE
completed_at: "2026-05-24"
next: P2-K (dev-kinh-dich — BLIND dispatch)
---

# P2-J — QA Handoff: G10 Bug Injection Complete

## Dispatcher Instructions (CRITICAL — read before dispatching P2-K)

Dispatch dev-kinh-dich for P2-K with ONLY the following information:

> "The `hao_encoder` dashboard card is RED. The sandbox shows FAIL for `hao-encoder-golden.json`
> and `hao-encoder-edge.json`. Fix it. You have ≤2 dispatch cycles. Verify sandbox exits 0
> (17/17 GREEN) and dash-check reports dotsRed=0, verdict=PASS."

DO NOT reveal: the injected literal, the threshold value, the constant name, or the file line number.
The fixer must rediscover the bug from the RED dashboard and failing sandbox output alone.

---

## P2-J Verdict: PASS

All ACs confirmed.

---

## AC Evidence

### AC-1 — Tag created before injection

`kinh-dich-pre-inject-go` tag exists at `10ef7fdd` (the P2-I evidence commit).
Injection commit `234c0bef` sits on top — tag is on the commit BEFORE the injection. CONFIRMED.

```
234c0bef  ← injection commit (on top)
10ef7fdd  ← kinh-dich-pre-inject-go tag (before injection) CONFIRMED
```

### AC-2 — Sandbox shows RED after injection

```
cd apps/kinh-dich-service && go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=all

[RED]  hao-encoder-edge.json: output mismatch
[GREEN] hao-encoder-failure.json
[RED]  hao-encoder-golden.json: output mismatch
... (13 other GREEN scenarios)

=== SANDBOX SUMMARY ===
Tier: primitive
Passed: 13/15
Failed: [hao-encoder-edge.json hao-encoder-golden.json]
exit status 1
```

Full tier also shows module coupling (reading-composer-golden + reading-composer-edge RED):
```
Tier: all | Passed: 13/17
Failed: [hao-encoder-edge.json hao-encoder-golden.json reading-composer-edge.json reading-composer-golden.json]
exit status 1
```

### AC-3 — Dashboard RED confirmed (dash-check)

```json
{"service":"kinh-dich","dotsGreen":13,"dotsRed":4,"dotsPending":0,"jsErrors":0,"pageErrors":0,
 "categoryChips":{"Valid Input":6,"Edge Case":6,"Bad Input -> Error":5},"badLabels":[],"verdict":"FAIL"}
```

dotsRed=4, verdict=FAIL. Dashboard traces regenerated with `-emit-traces` flag.

### AC-4 — Injection commit subject correct

```
test(kinh-dich): P2-J — deliberate bug injection for G10 AI-fixability proof (kinh-dich-pre-inject-go tagged)
```

SHA: `234c0bef`

TS-era `kinh-dich-pre-inject` tag INTACT at `b4cdb1db` (verified, untouched).

---

## Build + Vet Confirmation

```
CGO_ENABLED=0 go build ./...  → exit 0 (compiles cleanly)
CGO_ENABLED=0 go vet ./...    → exit 0 (vet clean)
```

The injected bug is a pure threshold value change — no syntax errors, no type errors.

---

## Tag Summary

| Tag | SHA | Status |
|-----|-----|--------|
| `kinh-dich-pre-inject-go` (Go-era, created P2-J Step 0) | `10ef7fdd` | CREATED — points to pre-injection HEAD |
| `kinh-dich-pre-inject` (TS-era, from TS pilot) | `b4cdb1db` | INTACT — untouched |

---

## Which Scenario is RED

**Primitive:** `hao_encoder` — scenarios `hao-encoder-golden.json` and `hao-encoder-edge.json` are RED.
**Module (coupling):** `reading-composer-golden.json` and `reading-composer-edge.json` are RED (G11 Trial-1 evidence).

The fixer should diagnose from the RED `hao_encoder` dashboard card and the failing sandbox output.

---

## Sealed Evidence Location

The exact injected literal is recorded in:
`docs/qa-sealed-evidence/P2-J-kd-injection-literal.md`

This file is for QA post-fix verification ONLY. Do NOT include this path in the P2-K dispatch to dev-kinh-dich.

---

## G12 DoD Exception

This is the ONLY task where a RED sandbox after completion is CORRECT and required.
The RED state is the G10 baseline — it is NOT a P2-J failure.

---

## Next Task

**P2-K** — dev-kinh-dich + qa
Dispatch dev-kinh-dich BLIND with only: "hao_encoder dashboard card is RED. Fix it in ≤2 cycles."
