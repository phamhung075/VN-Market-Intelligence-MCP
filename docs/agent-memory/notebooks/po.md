# PO Notebook

_Last: 2026-07-21T15:45Z (router signal-drain — 5 assigned rows triaged, 1 SPIKE minted, drain-dangle escalated BLOCKING)_

## Tick 2026-07-21T15:45Z — router signal-drain (5 NEW PO rows)

Triaged the 5 router-assigned NEW signal_queue rows across 2 orch-apply writes (both clean; conservation held; 12-key SSOT intact). Then the drain-dangle bug recurred post-write and I repaired it in a 3rd/4th write (see carry-over). Full trail → sprint-FLOW-PRICE-ALPHA-LOOP-po.md po-S151.

**BCTC scope escalation (devteam-…bctcscope, HIGH) = the actionable one.** Held FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP sharp (mode-1 reparse-corruption only, 16-ticker gate unchanged); REJECTED ops's SERVABLE column as baseline (self-contradictory 29+~40>58; wrong on 3/4 router-sampled — NVL/SSI/HCM empty via serving path, FPT holds). The 3 failure modes already have 3 homes (mode-1→REPARSE, mode-2→Q1-STORED-PDF-INGEST-STALL-15T, mode-3→VALIDATION-GATE-NONBANK). Minted the ONLY missing artifact: **SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS** (serving-path per-ticker census); epic-vs-fold decision DEFERRED to its output. No over-mint, no widen. Flagged SSI/NVL servable(07-15)→unservable(07-21) as possible mode-1 spread.

**A-30/A-20 FP cluster = FOLD, no new mint.** A-30→FIX-MCP-MEMORY-CODE-LEAK (high-water corroboration: 95.39–99.99% sawtooth WITH reclaim dips, VmHWM 2.95>VmRSS 2.77GiB, OOMKilled=false, floor crept 89.2→95.39%, rag co-pinned 99.8%). A-20→PDF-AVAIL-02-FIX (fix committed c78839c6c, deploy user-gated; re-emits ≠ failed fix, rbc held 6). Converge fix FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE already commissioned — did NOT re-mint. No ops escalation, no restart/rebuild.

**cowork tick-snapshot (MED) = FOLD → SPIKE-TICK-SNAPSHOT (now ANSWERED).** Writer wall-clock vs reader nominal 15-min key mismatch → promote only at drift=0; re-fix via fixed-filename cycle-snapshot-current.json, respect the sequencing guard. No new row (cowork confirmed prior-art).

**po-20260720T052606 (methodology-flag, to=unified-agent) = LEFT NEW** — delivery-blocked casualty of FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT; content tracked by SPIKE-CTG-FALSE-PRESENCE-BLINDSPOT. Not force-delivered, not re-minted.

## Carry-over
- **BLOCKING — FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (DIRECTLY OBSERVED):** my first 2 writes were clean (validator PASS at drain start), but the dangle then RECURRED live — a concurrent drain moved cowork-team-20260721T153000-…json to processed/ AFTER my writes, orphaning cow-20260721T153000.payload_ref; the live file failed Stage 1c (exit 2) and would have aborted the next fleet write. I repaired it in an orch-apply write (repoint→processed/, row left NEW). recurring_bug_count 3→4; this is a concrete PO-reproduced instance on top of the router's 14:51Z/15:2x ones. Unshipped code fix is BLOCKING — ship drain-signals.js payload_ref-repoint-in-same-commit.
- **MEASURE BEFORE SCOPE:** never size a remediation epic on self-contradictory ops classification — mint the census first, defer scope to real per-ticker numbers.
- **NEW≠MINE mid-cycle:** 4 fresh NEW rows landed 15:30/15:42 (3 = same A-20/A-30/api-gateway CURL_ERR FP cluster, 1 = new cowork telemetry-envelope-violation) AFTER my snapshot — left for next tick, did NOT chase the moving queue.
- **UC-ASL-P5 WATCH (carried):** residual 'triaged' rows grow until the emitter deploys; expedite the deploy-free half near queue ~185+.
