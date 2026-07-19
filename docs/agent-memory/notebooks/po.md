# PO Notebook

_Last: 2026-07-19T08:24Z (Step-1 triage — A-30 mem 97.80% FOLD = GC-sawtooth not monotonic-climb; A-21 re-emit DEDUP/FOLD; no mint / no ops)_

## Tick 2026-07-19T08:24Z — A-30 mcp-server MemPerc=97.80% + A-21 RestartCount=7 re-emit (both FOLD)

TWO system-auditor signal_queue NEW rows (UNCOMMITTED in orch-state `.signal_queue.rows` — PO owns+commits) + Telegram 3509 (msg 3574), all mcp-server. 97.80% crossed the mem TRIPWIRE I set last tick (band 85.63-90.32%) → did NOT trust the single snapshot; RAW-verified the TRAJECTORY.

**A-30 mem — RAW 6 probes / 65s @08:20-08:22Z:** 89.16 → 91.98 → 92.00 → 91.89(dip) → 93.01 → 92.05(dip) of 3GiB cap. Two intra-window GC-reclamation dips ⇒ OSCILLATING sawtooth, NOT monotonic climb.
- GC ceiling NOT breached: report-peak 97.80%@08:11 → 89.16%@08:20 = GC reclaimed 8.6pt (a climb-to-OOM does not drop). OOMKilled=false; Running/healthy; 16h uptime (StartedAt 07-18T15:56:50Z); gateway served router calls this tick.
- Baseline creep 85.63→89.16% over ~30min (~7pt/h) = the KNOWN slow leak, ~16h into rebuild-headroom cycle. Same mechanism as FIX-MCP-MEMORY-CODE-LEAK corroboration_20260626T15Z. NOT a new leak.
- **VERDICT FOLD** (oscillating-high-stable, GC reclaiming, no OOM). **NOT route-to-ops** (no live outage, 3GB cap landed, rebuild-cron already user-surfaced). DEDUP → FIX-MCP-MEMORY-CODE-LEAK; 97.80% HWM + trajectory recorded in backlog-detail corroboration_20260719T08Z. NO new mint.

**A-21 re-emit (sys-20260719T081102-4ff3):** IDENTICAL to sys-20260719T074117-22be folded @07:54Z (a35c5c1f0), evidence unchanged (RestartCount=7 cumulative, 16h healthy, OOMKilled=false, gateway serving). DEDUP/FOLD without re-investigation. ledger tracks microservice_degraded:mcp-server:A-21.

### Disposition
- report 3509 → process_telegram_report(3509, duplicate, delete=true) ⇒ processed:true, delete_success:true, msg 3574 deleted; cleared from BOTH sets (new=empty, unresolved=[]).
- both signal_queue rows NEW→triaged via `jq --arg … | bash scripts/orch-apply.sh` (Zod Stage0+1 PASS; conservation 546↔546 / signals 5↔5; CAS clean). 0 NEW remain.

## Carry-over
- **NEXT-TICK TRIPWIRE (STANDING):** escalate A-30 to ops ONLY if GC ceiling lost — baseline low >~93% no-dip across all samples, OR peak sustained >97% no-reclaim, OR OOMKilled=true. mcp-server is 16h deep in rebuild-headroom; re-probe next mem alert.
- **PLAN-ONLY (no mint):** (a) A-30 threshold=85% too tight for GC-sawtooth-near-cap service (fires every peak, A-21-class FP) → raise ~95% and/or gate on loss-of-reclamation/OOMKilled not single snapshot. (b) A-21 windowed/crash-only predicate note (unchanged from 07:54Z).
- **TRIPWIRE STANDING (07-18):** once FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS DEPLOYS, further OHLCV-BACKFILL report = genuine regression → escalate.
- Session 69b0312e-df43-43a9-9e0b-bddf66d374e3 (po triage). Commit MY scoped paths only; do NOT push (fleet-push launchd owns push).
