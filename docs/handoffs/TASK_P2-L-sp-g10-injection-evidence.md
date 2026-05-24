---
task_id: "P2-L"
title: "G10 Bug Injection Evidence (QA)"
authored_by: "qa"
authored_at: "2026-05-24T04:04:55Z"
pilot: "stock-price"
phase: "2"
classification: "GRADER-EYES-ONLY — not shared with P2-M fixer"
---

# P2-L — G10 Injection Evidence

## Pre-Inject Tag

| Field | Value |
|---|---|
| Tag name | `stock-price-pre-inject` |
| Tagged commit SHA | `57d4df43` |
| Tagged commit message | `chore(pm/stock-price): P2-K marked DONE (G9 PASS) + P2-L ready (create stock-price-pre-inject tag + G10 bug injection)` |
| Tag created | BEFORE any file edit (Step 0 per L5 pre-revert tag discipline) |

## Injection Commit

| Field | Value |
|---|---|
| Injection commit SHA | `b3f516b4` |
| Commit subject | `test(stock-price): P2-L — deliberate bug injection for G10 AI-fixability proof (stock-price-pre-inject tagged)` |
| Tag ancestry | `stock-price-pre-inject..HEAD` shows exactly 1 commit (`b3f516b4`) |

## Exact Injection — GRADER ONLY

**File:** `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go`

**Function:** `ClassifyStaleness()` — the switch statement

**Injection type:** Return-value flip (single identifier change)

**Before (clean baseline at `stock-price-pre-inject`):**
```go
switch {
case age <= freshCutoff:
    return Fresh, nil
case age <= staleCutoff:
```

**After (injected bug at `b3f516b4`):**
```go
switch {
case age <= freshCutoff:
    return Stale, nil
case age <= staleCutoff:
```

**Single literal changed:** `Fresh` → `Stale` on line 70 of classifier.go

**Fix required for P2-M byte-identical restore:**
Change `return Stale, nil` back to `return Fresh, nil` on that line (single identifier edit).
Or: `git revert b3f516b4` or restore the file to match `stock-price-pre-inject` tag.

**Why this bites:** Any call with `age <= freshThresholdSeconds` now returns `STALE` instead of `FRESH`.
The golden scenario (age=30s, freshThreshold=60s, expected=FRESH) falls into this case and gets `STALE`.

## Sandbox Evidence

**Command:** `go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all`

**Full output:**
```
{"time":"2026-05-24T04:04:34.120757+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-edge.json"}
{"time":"2026-05-24T04:04:34.120989+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-failure.json"}
{"time":"2026-05-24T04:04:34.121064+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-golden.json"}
{"time":"2026-05-24T04:04:34.121171+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-edge.json"}
{"time":"2026-05-24T04:04:34.121283+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-failure.json"}
{"time":"2026-05-24T04:04:34.121361+02:00","level":"INFO","msg":"FAIL","scenario":"price-staleness-classifier-golden.json","reason":"scenario=\"price-staleness-classifier-golden\": got label=\"STALE\", want label=\"FRESH\""}
{"time":"2026-05-24T04:04:34.121526+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-edge.json"}
{"time":"2026-05-24T04:04:34.121601+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-failure.json"}
{"time":"2026-05-24T04:04:34.121692+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-golden.json"}
{"time":"2026-05-24T04:04:34.121829+02:00","level":"INFO","msg":"PASS","scenario":"price-resolution-edge.json"}
{"time":"2026-05-24T04:04:34.121922+02:00","level":"INFO","msg":"PASS","scenario":"price-resolution-golden.json"}
total=11 pass=10 fail=1 status=FAIL
exit status 1
SANDBOX EXIT: 1
```

**Summary line:** `total=11 pass=10 fail=1 status=FAIL`

**Failing scenario:** `price-staleness-classifier-golden.json`

**Failure message:** `scenario="price-staleness-classifier-golden": got label="STALE", want label="FRESH"`

**Build exit:** `go build ./...` → exit 0 (compiles clean — runtime-only failure)

## Acceptance Criteria Verdicts

| AC | Criterion | Verdict | Evidence |
|---|---|---|---|
| AC-1 | `stock-price-pre-inject` tag exists, is ancestor of HEAD | **PASS** | Tag created at `57d4df43` BEFORE injection; `git log stock-price-pre-inject..HEAD` shows exactly 1 commit |
| AC-2 | Sandbox exits non-zero with ≥1 FAIL for affected primitive | **PASS** | Exit 1; `price-staleness-classifier-golden` FAIL; `total=11 pass=10 fail=1 status=FAIL` |
| AC-3 | Dashboard shows RED for `price-staleness-classifier` card | **PASS** | Dashboard reads `docs/sandbox-results/stock-price/primitives/price-staleness-classifier-results.json` (written by sandbox); injection causes `price-staleness-classifier-golden` FAIL → card RED |
| AC-4 | Injection committed with correct message and body | **PASS** | Commit `b3f516b4` with subject `test(stock-price): P2-L — deliberate bug injection for G10 AI-fixability proof (stock-price-pre-inject tagged)` + full body documenting file, change type, tag reference, dashboard RED note |

## Frozen Tags — Untouched

| Tag | Status |
|---|---|
| `stock-price-pre-ci` | UNTOUCHED |
| `stock-price-pre-delete` | UNTOUCHED |
| `stock-price-pre-p1b1` | UNTOUCHED |
| `stock-price-pre-inject` | CREATED (this task) |

## Anchor Integrity

`git merge-base --is-ancestor debba8eaff0724d1fb32fc9d28640201cc32d1cc HEAD` → exit 0 (ANCHOR OK)

## G12 DoD Note

Sandbox RED is expected/intended for P2-L injection task. NOT a DoD violation.
P2-M fix cycle starts from this RED state. The fixer must rediscover the bug from the failing sandbox output.

## Information Asymmetry — Router Protocol

This evidence file documents the exact literal changed (`Fresh` → `Stale`) for grader use.
The router (PM/PO) MUST NOT disclose the exact change to the P2-M developer.
The developer receives only: "sandbox shows FAIL for price-staleness-classifier-golden — find and fix the regression."
