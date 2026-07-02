# PO Notebook

_Last: 2026-07-02T17:28Z_

## Tick 2026-07-02T17:07Z — dev-team triage (coord d3292ca4): 8 signals, 0 new tasks → NOTHING

**RAW-verify (17:20-21Z):** all containers healthy; mcp-server:4000/health=200(0.005s), api-gw=200, frontend:3001=200; mcp-server StartedAt=10:15:34Z, RestartCount=3, OOMKilled=false, ExitCode=0; mem 59.05%→59.26% (1.181→1.185GiB).
- **S1/2/3 health CURL_ERR (a01-mcp CRIT / a02-api / a12-fe):** RESOLVED false-positive. StartedAt 10:15Z PREDATES the 14:14Z window → no crash/restart at outage time; endpoints all 200 now. Auditor-FP probe-artifact class (same as archived 06:16/06:17Z rows).
- **S4 restart count=3 (a21-mcp):** TRIAGED dup → OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN. RestartCount resets ONLY on user-gated recreate → persists regardless of code; container stable 7h, ExitCode=0. Not independently actionable.
- **S5 mem 99.67% (sau-1783012565):** TRIAGED dup → FIX-MCP-MEMORY-CODE-LEAK. Corroborated 99.67%@17:16Z but RAW re-probe @17:20Z = 59% → 812MiB RECLAIMED w/o restart → refutes hard leak, = transient spike+GC. Folded reclaim datapoint into existing task (diag: leak→transient/cap-tight). Near-OOM on 2GB cap still a watch.
- **S8 cycle-snapshot promotion (file sig):** dup → SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED, ENRICHED note w/ root cause. emitPressureStateTool.ts snapPath=cycle-snapshot-<tickHHMM>.json, tick_id defaults to 15-min FLOOR (16:30); flow names by ACTUAL minute (16:34 on disk) → never matches → latest.json frozen (mtime 08:35Z). Alt server-side zone apps/mcp-server/.
- **S6/S7 cowork telemetry:** informational, no action.
Committed orch-state (2982bcba, explicit path). RETURN=NOTHING (no new/promotable task; WIP still parked, ready empty after prior HNX dispatch).

## Tick 2026-07-02T13:07Z — dev-team triage (coord d3292ca4): re-rank + promote → BATCH(1 FIX)

**Inputs clean:** pendingSignals=EMPTY; read_telegram_reports(new)=none; list_unresolved_reports=[]; CI GREEN (HEAD 238de3a2, run 28562309347); git=main only; head=idle (leave idle); WIP=1 = FIX-BCTC-ENRICHER-STUCK-BACKLOG (PARKED user-gated rebuild — untouched); ready[] was EMPTY → 1 free slot.

**Decision — BCTC-HNX-SSL-HARDEN re-rank on corrected premise:** router recon (docs/vps-sources/hnx-tls-chain-2026-07-02.txt) FALSIFIED the 2026-07-07 expiry cliff — HNX renewed leaf Jun 18 2026, NotAfter 2027-01-03. Deadline urgency GONE → priority **high→medium**. REAL remaining driver = HNX server omits GlobalSign RSA OV SSL CA 2018 intermediate (openssl verify 21) so the June-1 hotfix `curl -k` (cert-verify OFF = MITM) is still live in /root/fetch-bctc.sh. Still worth doing = pure security-debt reduction (standing mandate).

**Fills the free slot?** YES. Scanned backlog: no competing groomed candidate — the P0/P1 mass is the FACTORY maintainability epic (held PLAN-ONLY, needs architect sequencing) + dep-chained F1-*/SHG-*/CCATO-* clusters. HNX is the cleanest: deps satisfied (FIX-BCTC-VPS-FETCH-LEG-DEAD DONE), recon complete, size S, ops-route, zone cross-service/ (DISJOINT from in_progress apps/mcp-server task → no collision). Promoted backlog→ready via inline jq|orch-apply.sh: CORRECTED title (dropped false expiry claim) + desc/AC (real driver) + priority medium + next_agent=ops + promote stamps. Conservation OK (backlog 387→386, ready 0→1, others byte-stable; rc=0, 102 pre-existing SHG coherence warns non-blocking). RETURN=BATCH(1) → router dispatches ops. head left idle.

## Carry-over
- WIP 1: `FIX-BCTC-ENRICHER-STUCK-BACKLOG` PARKED on user-gated mcp-server rebuild — do NOT unpark / plan container actions.
- `ready[]` = `BCTC-HNX-SSL-HARDEN` (ops, medium, size S) — router dispatches to ops this tick.
- Sibling `FIX-BCTC-VPS-FETCH-LEG-DEAD` DONE (revived the fetch leg); HNX-HARDEN is its hardening follow-up.
- Prior ticks (T09:37/T10:37): head-dup collapse (po-s138) + signal_queue wedge repair + FIX-BCTC-VPS-FETCH-LEG-DEAD mint — all shipped.
- Guards standing: `FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD` (architect groom), `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` (ops). Size-cap breach root (cold-evict not clearing terminal done[]) still DEFERRED while board in-flight.
