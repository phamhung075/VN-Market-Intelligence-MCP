# Decision Journal — Sprint MONEY-RADAR-P0 · PM

**Sprint goal:** Money Radar (Radar Dòng Tiền) — fusion + DIVERGENCE layer over 9 live money-flow tools. Phase-0-first: no new crawls, real non-null readings day one.
**Agent:** pm
**Started:** 2026-07-01T00:00:00Z

---

### STEP pm-S1 · pm · 2026-07-11T10:40:00Z
**task-id:** WATCHLIST-DB-SYSMAP-DRIFT-FIX (pulled into idle WIP slot)
**what-done:** Pre-verified two PO-triaged backlog picks (CONTAM-11-REMEDIATE primary, WATCHLIST-DB-SYSMAP-DRIFT-FIX alternate); found stale-pick hazard on primary; successfully pulled WATCHLIST-DB-SYSMAP-DRIFT-FIX into ready[] lane with status=READY; created handoff doc TASK_WATCHLIST-DB-SYSMAP-DRIFT-FIX.md; updated orch-state.json atomically via orch-apply.sh; task_board conservation check PASSED (458 rows).

**what-considered:**
- **Primary candidate (CONTAM-11-REMEDIATE):** Router pre-verified as unblocked + mission-aligned. Pre-verify check against live daily_ohlcv table showed contamination mostly ALREADY FIXED: 3023 expected contaminated rows → 4 actual rows (BMP/HGM/KSV/MCH 1 row each), 5 tickers (PMC/TOS/AGX/TBD/STS) have 0 rows. Stale-pick hazard CONFIRMED — task description claims repair of 3023 rows, but live DB shows only 0.1% remain.
- **Alternate candidate (WATCHLIST-DB-SYSMAP-DRIFT-FIX):** Router pre-verified as unblocked + mission-aligned. Pre-verify check against live watchlist table and system-map.json SSOT showed ACTIVE DRIFT: live SQLite 52 rows vs SSOT 34 items = 18 row delta. Known issues: inactive VEA present in live, VNH mis-seeded, 17+ active items missing. Task is LIVE and execution-ready.

**why-decision:** Stale-pick hazard rule (docs/agents/pm/flow/main.md Step 1) mandates: "if contamination is already repaired, do NOT pull it — RETURN with evidence and pick WATCHLIST-DB-SYSMAP-DRIFT-FIX instead, same pre-verify." CONTAM-11-REMEDIATE shows 99.9% progress vs claim — evidence of prior completion (partial or full). WATCHLIST-DB-SYSMAP-DRIFT-FIX passes pre-verify (drift confirmed live, no dependencies, zone=cross-service).

**why-change:** Replaces primary pick per stale-pick gate. No backlog mutation on CONTAM-11-REMEDIATE (stays BACKLOG for later audit by dev-team or ops — contamination repair may be partially done by prior agent or abandoned midway; root-cause triage deferred to developer). WATCHLIST-DB-SYSMAP-DRIFT-FIX moved backlog[]→ready[], status BACKLOG→READY per PM flow Step 3.

**acceptance-for-developer:**
- Live SQLite watchlist table matches system-map.json .project.watchlist (34 active items)
- Removed 18 orphaned rows (inactive VEA + mis-seeded VNH)
- Restored all missing active items from SSOT
- TA endpoints (/ta/money-flow-oscillators, /ta/roc-momentum) return corrected universe
- Handoff doc: docs/handoffs/TASK_WATCHLIST-DB-SYSMAP-DRIFT-FIX.md

**notes:**
- Router context: idle-slot fill (WIP=1/2, only peer-owned OPS task); PO pre-verified CONTAM-11-REMEDIATE + WATCHLIST-DB-SYSMAP-DRIFT-FIX as two unblocked mission-aligned candidates.
- Terminal-lane bloat at task start: done[]=22 > 10 threshold (HSC-3). Task pull proceeded per router's explicit priority override (idle-slot fill > normal planning cadence). Recommend: archive/cold-evict sweep in next PM cycle.
- Dry-run diff: backlog=315→314, ready=0→1, in_progress=1 (stable, peer-owned), task_total conservation PASSED (458).
