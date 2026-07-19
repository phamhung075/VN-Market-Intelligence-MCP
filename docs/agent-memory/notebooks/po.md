# PO Notebook

_Last: 2026-07-19T07:54Z (Step-1 triage — A-21 mcp-server RestartCount=7 FOLD false-positive, RAW-verified 3x, no mint / no ops)_

## Tick 2026-07-19T07:54Z — A-21 mcp-server RestartCount=7 triage (cumulative-counter FP → FOLD)

ONE system-auditor finding on TWO planes: Telegram 3508 (msg 3573) + UNCOMMITTED signal_queue row `sys-20260719T074117-22be` (auditor atomic write, orch-state dirty — PO owns the commit). Did NOT trust A-2x text (frequent FP class) — RAW-verified container 3x (all consistent):
- **healthy+serving**: `vn-market-intelligence-mcp-mcp-server-1` (real name, not bare `mcp-server`) Running=true Health=healthy 3x; health-log all Exit=0; gateway served live tool calls this tick → no live outage.
- **RestartCount=7 = CUMULATIVE**: Created 2026-07-15 (~4d) reset the counter; current instance StartedAt 2026-07-18T15:56:50Z = **16h continuous healthy uptime**; last restart 16h ago; decelerating not accelerating → NOT a live crashloop.
- **restarts CLEAN**: LastExitCode=0, OOMKilled=false. Contrast GENUINE 07-02 episode (3→4 WITH mem-collapse 95→16% OOM, drove 2g→3g cap). This = graceful dev-env deploy churn, no OOM.
- **mem stable near cap**: 90.32%→85.63% of 3GB (oscillating, not climbing). 3GB cap-bump mitigation ALREADY landed (limit /3GiB).
- **precedent**: rag-service=100 + prior mcp-server A-21(=3/=4) all folded as cumulative-counter FP; auditor-dedup-ledger holds this key (fresh re-emit of chronic class).

VERDICT **FOLD** (false positive). NO mint, NOT route-to-ops (healthy, no crashloop, no rebuild needed).

### Disposition
- report 3508 → process_telegram_report(3508, wontfix, delete=true) ⇒ processed:true, delete_success:true, msg 3573 deleted.
- signal_queue row → NEW→triaged via `jq --arg … | bash scripts/orch-apply.sh` (Zod Stage0+1 PASS; conservation CONSERVED 546↔546 / signals 3↔3; CAS clean; atomic). 0 NEW rows remain.

## Carry-over
- **PLAN-ONLY (no mint) — auditor A-21 predicate-tune candidate**: system-auditor A-21 tier reads cumulative `docker inspect .RestartCount` vs tight threshold=2; mcp-server's OWN `restartCadenceAlertJob.ts` already does it right (windowed WINDOW_HOURS + crash-filtered, returns 0 for clean restarts). A-21 should adopt windowed/crash-only OR honor auditor-dedup-ledger board-tracked DEDUP (rag=100 precedent). Detector-FP, not infra → not minted.
- **mem WATCH**: mcp-server 85-90% of 3GB cap = known parked `FIX-MCP-MEMORY-CODE-LEAK` (pm); already backlogged, not new. If mem monotonically climbs to OOM (OOMKilled=true) on a future probe → that WOULD be genuine → escalate to ops.
- TRIPWIRE STANDING (from 07-18): once `FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS` DEPLOYS, further OHLCV-BACKFILL report = GENUINE regression → escalate.
- Session 69b0312e-df43-43a9-9e0b-bddf66d374e3 (po triage). Commit MY scoped paths only; do NOT push (fleet-push launchd owns push).
