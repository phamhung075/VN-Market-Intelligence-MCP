---
task_id: "P2-J"
evidence_type: "G8 honest-red deliberate-break proof"
authored_by: "qa"
authored_at: "2026-05-24T01:49:00Z"
pilot: "stock-price"
phase: "2"
---

# P2-J — G8 Honest-Red Evidence

## Baseline (pre-break confirmation)

Before any deliberate corruption, the full sandbox was run to confirm green baseline:

```
total=11 pass=11 fail=0 status=OK
EXIT_CODE=0
```

All 11 scenarios PASS. This is the known-good state that Test B must restore.

---

## AC-1 (Test A — Corrupted Scenario)

**Target file:** `docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json`

**Corruption applied:** Changed `expected.quote.source` from `"hose"` to `"hnx"` (wrong tier source — T2 instead of T1).

**Sandbox command:**
```
cd apps/stock-price && go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

**Terminal output (sandbox exit non-zero + FAIL):**
```
{"time":"2026-05-24T03:47:47.416114+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-edge.json"}
{"time":"2026-05-24T03:47:47.416376+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-failure.json"}
{"time":"2026-05-24T03:47:47.416451+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-golden.json"}
{"time":"2026-05-24T03:47:47.416551+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-edge.json"}
{"time":"2026-05-24T03:47:47.416659+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-failure.json"}
{"time":"2026-05-24T03:47:47.416728+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-golden.json"}
{"time":"2026-05-24T03:47:47.41689+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-edge.json"}
{"time":"2026-05-24T03:47:47.416965+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-failure.json"}
{"time":"2026-05-24T03:47:47.417065+02:00","level":"INFO","msg":"FAIL","scenario":"tier-fallback-selector-golden.json","reason":"scenario=\"tier-fallback-selector-golden\" field mismatches: [Source: got=\"hose\" want=\"hnx\"]"}
total=9 pass=8 fail=1 status=FAIL
exit status 1
EXIT_CODE=1
```

**Exit code:** 1 (non-zero — CONFIRMED)

**FAIL count:** 1 — `tier-fallback-selector-golden.json`

**FAIL reason:** `Source: got="hose" want="hnx"` — sandbox ran the real primitive (T1 hose wins), scenario expected the corrupted value (hnx), mismatch detected.

**Dashboard state (card showing RED):**
The dashboard's edit-rerun panel (`apps/stock-price/dashboard/index.html`) renders status from NDJSON output. When the sandbox NDJSON output above is pasted into the Apply panel:
- The `tier-fallback-selector-golden` scenario dot changes from `dot-green` to `dot-red` (CSS class `dot-red` = red fill, `--red: #b91c1c`).
- The `tier-fallback-selector` primitive group header transitions to `status-red-label` (red background badge showing "FAIL").
- The primitives panel summary shows `chip-red` with "1 failed" count.
- The `tier-fallback-selector-edge` and `tier-fallback-selector-failure` scenarios remain green (only golden scenario corrupted).
- This is the honest-red state: the dashboard reflects the actual sandbox failure, not a false green.

**Revert performed:**
```bash
git checkout docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json
```
Output: `1 chemin mis à jour depuis l'index` (1 path restored from index — clean revert confirmed).

---

## AC-2 (Test B — Golden Revert)

**After reverting Test A corruption, full sandbox run:**

**Sandbox command:**
```
cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

**Terminal output (sandbox exit 0 + all PASS):**
```
{"time":"2026-05-24T03:48:04.435577+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-edge.json"}
{"time":"2026-05-24T03:48:04.435831+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-failure.json"}
{"time":"2026-05-24T03:48:04.435906+02:00","level":"INFO","msg":"PASS","scenario":"price-quote-normalizer-golden.json"}
{"time":"2026-05-24T03:48:04.436009+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-edge.json"}
{"time":"2026-05-24T03:48:04.436122+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-failure.json"}
{"time":"2026-05-24T03:48:04.436189+02:00","level":"INFO","msg":"PASS","scenario":"price-staleness-classifier-golden.json"}
{"time":"2026-05-24T03:48:04.436361+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-edge.json"}
{"time":"2026-05-24T03:48:04.436436+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-failure.json"}
{"time":"2026-05-24T03:48:04.436518+02:00","level":"INFO","msg":"PASS","scenario":"tier-fallback-selector-golden.json"}
{"time":"2026-05-24T03:48:04.436662+02:00","level":"INFO","msg":"PASS","scenario":"price-resolution-edge.json"}
{"time":"2026-05-24T03:48:04.436768+02:00","level":"INFO","msg":"PASS","scenario":"price-resolution-golden.json"}
total=11 pass=11 fail=0 status=OK
EXIT_CODE=0
```

**Exit code:** 0 (CONFIRMED)

**All 11 scenarios PASS.**

**Dashboard state (all cards GREEN):**
When the all-PASS NDJSON output is pasted into the dashboard edit-rerun Apply panel:
- All 9 primitive scenario dots show `dot-green` (CSS class `dot-green` = green fill).
- All 3 primitive group headers show `status-green-label` (green badge "PASS").
- Both module scenario dots show `dot-green`.
- Primitives panel summary: `chip-green` "9 passed" — no red chips.
- Module panel summary: `chip-green` "2 passed".
- Microservice panel: NOT-RUN (static — sandbox does not run HTTP integration tests, correct behavior per G8 honest cold-start).
- No false greens on cold-open items: microservice cards remain NOT-RUN as per design.

---

## AC-3 (Run 1 — Different Primitive: price-quote-normalizer)

**Target file:** `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json`

**Corruption applied:** Changed `expectedOutput.changePercent` from `0.59` to `9.99` (wrong percentage value).

**Terminal output:**
```
{"time":"2026-05-24T03:48:11.426249+02:00","level":"INFO","msg":"FAIL","scenario":"price-quote-normalizer-golden.json","reason":"scenario=\"price-quote-normalizer-golden\" field mismatches: [ChangePercent: got=0.59 want=9.99]"}
total=9 pass=8 fail=1 status=FAIL
exit status 1
EXIT_CODE=1
```

**Exit code:** 1 (non-zero — CONFIRMED)

**Reverted:** YES — `git checkout docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json` — 1 path restored.

---

## AC-3 (Run 2 — Different Primitive: price-staleness-classifier)

**Target file:** `docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json`

**Corruption applied:** Changed `expected.label` from `"FRESH"` to `"STALE"` (wrong staleness label for a 30s-old quote within 60s threshold).

**Terminal output:**
```
{"time":"2026-05-24T03:48:24.414347+02:00","level":"INFO","msg":"FAIL","scenario":"price-staleness-classifier-golden.json","reason":"scenario=\"price-staleness-classifier-golden\": got label=\"FRESH\", want label=\"STALE\""}
total=9 pass=8 fail=1 status=FAIL
exit status 1
EXIT_CODE=1
```

**Exit code:** 1 (non-zero — CONFIRMED)

**Reverted:** YES — `git checkout docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json` — 1 path restored.

---

## AC-4 (Clean Status)

**Command run:**
```bash
git status --short | grep "scenarios"
```

**Output:** (empty — no output)

No staged or unstaged changes to any scenario file. All 3 deliberate-break scenario files were reverted cleanly with `git checkout`. The scenario tree is pristine.

---

## Summary

All 5 ACs PASS. G8 honest-red contract proven.

| AC | Verdict | Detail |
|----|---------|--------|
| AC-1 | PASS | Test A: tier-fallback-selector-golden corrupted (source hnx) → sandbox exit 1, 1 FAIL, dashboard card RED |
| AC-2 | PASS | Test B: full sandbox after revert → exit 0, total=11 pass=11 fail=0 status=OK, dashboard all GREEN |
| AC-3 | PASS | Run 1 (price-quote-normalizer) exit 1, reverted YES. Run 2 (price-staleness-classifier) exit 1, reverted YES. |
| AC-4 | PASS | `git status --short | grep scenarios` = empty (no scenario mutations remaining) |
| AC-5 | PASS | This evidence file + signal emitted |

**G8 honest-red verdict:** PROVEN. The sandbox correctly rejects corrupted scenarios (non-zero exit, FAIL lines in output) and the dashboard renders RED for the affected card when that output is applied. Reverting restores exit 0 and all-green dashboard. The dashboard is NOT a false-green machine.

**Anchor:** `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD (verified pre-task).

**SSOT not mutated:** `docs/data/pilot-status-stock-price.json` not touched.

**No goal flips:** Per Charter §4.5, G8 remains EARNED-PENDING. PO flips all goals at 12/12 terminal Phase-3 close.
