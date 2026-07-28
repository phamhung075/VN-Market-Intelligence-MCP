# PO Notebook

_Last: 2026-07-28T17:04Z (triage tick) · 3 `orch-apply.sh` writes, all Zod+conservation clean · 664 ids · `.head` untouched · nothing pushed, no agent spawned, no container touched._

## Shipped

| What | State |
|---|---|
| `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` BACKLOG→READY | mid-tick coordinator finding (83 PRIMARY review rows, 3-5d old, growing; ~33 SECONDARY next_agent≠qa rows, up to 18d, zero drain). Mechanism confirmed live this tick (UC-GCP-P8 drained) but throughput insufficient. 2 remedy shapes handed to architect, PO does not pick. |
| `FIX-BDI-SHIPPING-STALE-404-GUARD` next_agent qa→dev-mcp-server + note | ci_red CI-RED-289a9d8e is a re-observation of the SAME 3-day-old defect this row already root-caused (1408-tool-diacritics.test.ts stale `"ổn định"` assertion vs the guard's own deliberate fix). Did NOT mint a duplicate. It was buried ~76/83 deep in the QA-drain queue; rerouted + UNBLOCK-batched for immediate dispatch instead of waiting. |
| **MINT** `FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H` | P2 · `apps/mcp-server/` · →developer. Telegram 3838 CRITICAL + 36 hourly repeats, all unresolved. Root cause read at source: monthly cron (`0 0 1 * *`) graded against a 48h "event-driven" SLA (freshnessSlaMonitorJob.ts) — near-permanent false CRITICAL, PLUS staleness (52.8d, climbing) exceeds even a working monthly cadence, so the job may also be genuinely dead since ~06-06 (`recoverMissedExecutions:false`, no catch-up). |
| cowork-tick telemetry signal | INFO, routine, no action |
| 20 BCTC guard-firing telegram reports (07-26) | write-blocked-zero-extraction + low-confidence-skip guards firing correctly across 10 tickers; consistent with already-tracked OCR/period-identity issue classes (FIX-BCTC-INGEST-PERIOD-IDENTITY now REVIEW, FIX-PDFX-TESSERACT-CONCURRENCY shipped). Steady-state, no new FIX. |

## BATCH → dev-team

```
BATCH([{ type: "UNBLOCK", id: "FIX-BDI-SHIPPING-STALE-404-GUARD", route_to: "dev-mcp-server",
  desc: "Apply the already-prescribed 1-line test fix (swap 'ổn định' assertion for 'Không đủ dữ liệu'
  in 1408-tool-diacritics.test.ts), then hand to qa per row's existing close-gate.",
  zone: "apps/mcp-server/", baseline_pass: "cd apps/mcp-server && bun test src/__tests__/1408-tool-diacritics.test.ts" }])
```

## Lessons

- **Re-observed ≠ new.** A ci_red signal with a fresh head_sha can still be the identical defect if nothing was pushed between — checked `git fetch` + `origin/main` HEAD before triaging as open, not just the signal's own head_sha string-match dedup (which would have missed it and re-minted a duplicate).
- **Queue position can be the actual blocker.** A fully-diagnosed, fully-remedied row can sit unfixed for days not because nobody knows the answer, but because the drain mechanism serving it is 1/tick against an 80+ backlog — escalation (UNBLOCK) was the correct lever, not another triage pass.

## Carry-over

- `review`=~118 (83 qa-PRIMARY + ~33 SECONDARY) / `qa`=0 — capacity decision now on architect via re-promoted `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`, not mine to design.
- 12 local commits ahead of `origin/main`, unpushed — once ci_red clears, push-backstop should catch this; watch next tick.
- `FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT` was dispatch-held on the SAME ci_red baseline — recheck once 1408 lands, no re-triage needed.
