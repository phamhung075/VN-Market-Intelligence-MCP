---
title: "mcp-server P1-H — Sandbox Scenarios: signal-bus + sector-classifier (G7 honest-red)"
date: "2026-05-25"
task: "P1-H"
pilot: "mcp-server"
status: "DONE"
zone: "apps/mcp-server/"
commit: "a9212ad2"
---

# P1-H — Sandbox Scenarios: signal-bus + sector-classifier

## What was done

Added 6 new sandbox scenarios (3 golden + 3 failure) covering two primitives:
- `buildCrossValidateSignal` (signal-bus) — 2 golden + 1 failure
- `classifySectorMovement` (sector-classifier) — 2 golden + 1 failure

Extended `runner.ts` with `--emit-traces` flag that runs all scenarios in
`src/sandbox/scenarios/` and writes trace JSON to `dashboard/traces/`.

All 9 scenarios (including the 3 sparkline from P1-A) PASS with exit 0.

## G7 honest-red proof

Step 1: Mutated `signal-bus-golden-valid.json` expected `confidence: 0.99` (wrong).
Runner: `[FAIL] signal-bus-golden-valid` — exit 1, trace `"status": "fail"`.

Step 2: Restored correct `confidence: 0.8`.
Runner: `[PASS] signal-bus-golden-valid` — exit 0, trace `"status": "pass"`.

## Gate evidence

| Gate | Check | Result |
|---|---|---|
| G1 | AC-4: zero creds in runner.ts | PASS — grep process.env/API_KEY/SECRET = 0 hits |
| G1 | AC-5: zero infra imports in signalBuilders.ts + sectorPeers.ts | PASS — grep exit 1 (no matches) |
| G7 | Honest-red edit-JSON-rerun cycle | PASS — see above |
| G9 | 9/9 scenarios PASS, exit 0 | PASS |
| Tripwire | tsc --noEmit | EXIT:0 |
| Tripwire | bun test | 9412 pass / 344 fail (within ≥9408/≤348) |
| Tripwire | toolCount | 146 (from live Docker container) |
| Tripwire | scheduler .schedule() calls | 71 (≥68 baseline) |

## Files changed

- `apps/mcp-server/src/sandbox/runner.ts` (modified — --emit-traces flag + 2 new PRIMITIVES entries)
- `apps/mcp-server/src/sandbox/scenarios/signal-bus-golden-valid.json` (new)
- `apps/mcp-server/src/sandbox/scenarios/signal-bus-golden-minimal.json` (new)
- `apps/mcp-server/src/sandbox/scenarios/signal-bus-failure-missing-required.json` (new)
- `apps/mcp-server/src/sandbox/scenarios/sector-classifier-golden-known-ticker.json` (new)
- `apps/mcp-server/src/sandbox/scenarios/sector-classifier-golden-unknown-ticker.json` (new)
- `apps/mcp-server/src/sandbox/scenarios/sector-classifier-failure-null-input.json` (new)
- `apps/mcp-server/dashboard/traces/*.json` (9 trace files — all scenarios)

## What's next

- P1-EXIT: PO closes the Phase-1 scale pilot (verdict + notebook)
- BLOCKED-ON-DOCKER-SESSION: Docker rebuild + container re-verify + P1-QA
- G1-PRIMITIVE-CANDIDATEs noted in macro/local-computation and sector/cross-cutting
  sub-barrels — Phase 2 extraction backlog
