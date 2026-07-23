# PO decision journal — 2026-07-23 signal-queue triage (dev-team Step-1 slot)

**Context:** dev-team dispatcher tick 2026-07-23T17:37Z, rare non-preempted Step-1 slot. Triaged 17 NEW signal_queue rows to:po + 1 pendingSignal (digest-predict.md context-bloat) + 1 mid-task dispatcher input (quality-checklist fabricated-PASS). All writes via `scripts/orch-apply.sh`; commit local-only (fleet-push launchd dead, branch intentionally ahead of origin).

## Non-obvious decisions

1. **BOUNDED-1 gate signals 8 + 15 CONSOLIDATED into ONE row** (`FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE`, 3 AC clauses), NOT 3 separate tasks. Rationale: all three land on the SAME file `scripts/lib/devteam-eligibility.jq`; the existing MAINTLANE row's own note warns separate dispatch = concurrent-edit commit race. This row is the durable fix that was referenced in prose across 3 rows' `supervised_note` but never actually minted. Minting it makes those "SUPERSEDED-BY" references resolve. `supervised:true` so BOUNDED-1 cannot idle-auto-pick its own gate-fix.

2. **janitor health-recheck RemoteTrigger → DECISION=RETIRE, not replace-with-cron.** Writer silent 1 month (killed 06-22 by no-RemoteTrigger directive) with zero observed incident. A replacement local cron adds host-load for a function nobody has missed; memory-prune-sweep's 30d rule already drains the dir. Cheapest-correct = retire. RESOLVED, no board task.

3. **quality-checklist.json fabricated-PASS producer (mid-task dispatcher input) → NET-NEW mint** `FIX-QUALITY-CHECKLIST-GENERATOR-FABRICATED-PASS-EVIDENCE` (P1/architect). Prior-art grep: OBS rows (BCT-OBS-01/02, DS-OBS-01) are CONSUMERS that discovered the fabrication; SPIKE-EVIDENCE-SCORE-CACHE is a different surface (get_evidence_summary). NO producer row existed. RAW-confirmed byte-identical evidence in the live file: "WORK-channel msg IDs 2743-2766" x4, "CI green commit fc28bf41" x4, "HTTP 200" x7. Recurring 2x this session → recurring-bug policy. zone=cross-service (generator is a system-auditor artifact; durable fix = per-check real evidence + a duplicate-evidence validator). Did NOT reopen BCT-OBS-02-FIX/DS-OBS-01-FIX.

4. **digest-predict.md pendingSignal → NO fold.** RAW-scan: 198L < 200 SSOT cap (only agent-father.md at 303L is over-cap). Under the umbrella CLEAN row's cap. "Do NOT over-escalate a routine notebook-size breach." Noted only.

5. **Notebook context-bloat (agent-father.md) FOLDED, not per-notebook mint** — po-s92 precedent: refresh `CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614` `.targets`, code-janitor OVERWRITE-trims (also repairs the unparseable breach), never dispatch claude-manager-helper per item.

6. **Dedups (no mint):** cold-evict swept-board-flip (signal 7) → FIX-COLDEVICT-WITHIN-FILE-PEER-CONTENT-CAPTURE (READY/P1, 3rd occurrence, AC covers it); DGC corruption (signal 13) → DGC is in the 15-ticker cohort owned by FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T; fleet-push (11/17-ask2) → existing row unblocked (next_agent=ops).

7. **3 data_stale (prices 48h, sbv-vps x2) FOLDED into OPS-FFLOW ops task ask(3)** rather than separate rows — all are the same Vinahost VM clock-drift symptom; the vn-price/vn-sbv E2E re-verify was already the residual ask not covered by FFLOW-STALE-0723-A/B.

## Tally
minted=7 · resolved(decision)=1 (janitor RETIRE) · deferred/under-cap=1 (digest-predict) · duplicate/covered-skip=3 (cold-evict, DGC, fleet-push) · folded=5 (2 notebook, 3 data_stale) · benign=1 (SIGTERM slot-firer). All 17 NEW rows → triaged (anti-burial: only rows actioned this run).
