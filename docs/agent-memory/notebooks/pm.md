# PM — Notebook

## c332 COWORK-GUARANTEED-SLOT-CATCHUP · Decomposition + Board Setup · 2026-07-22T22:12Z

**MANDATE:** Decompose architect brief (10 FR) into atomic dev tasks. Sequence 5 consolidated board rows. True up row types. Set up developer handoff.

**PRE-CONDITIONS VERIFIED:**
- Architect design READY_FOR_PM: `docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md` — 10 FR broken into single shared-module zone `cross-service/`, sequential cascade (not parallel-dispatch).
- 5 consolidated rows pre-identified by architect (§10): all reassigned owner:developer/next_agent:pm, zone:cross-service/ (except zone:multi on one row, will auto-correct).
- Board row types flagged for upgrade (SPIKE-S/FIX-? → SPRINT-M/L given 10-FR/5-row scope).

**DECOMPOSITION APPLIED:**
- Architect's 7 files-to-create, 8 files-to-modify mapped to 10 atomic dev tasks:
  1. **TASK-COWORK-CATCHUP-1** (M): Domain module + config skeleton (FR-1, FR-2)
  2. **TASK-COWORK-CATCHUP-2** (S): Extend matcher CLI (FR-9a)
  3. **TASK-COWORK-CATCHUP-3** (M): Dispatcher sub-flow + main.md wiring (FR-9b, FR-3, FR-5)
  4. **TASK-COWORK-CATCHUP-4** (M): tick-preflight.sh Step 6.5 (FR-9c)
  5. **TASK-COWORK-CATCHUP-5** (M): firer.sh MCP + catch-up wiring (FR-9d)
  6. **TASK-COWORK-CATCHUP-6** (M): last-fired.md reconciliation (FR-7)
  7. **TASK-COWORK-CATCHUP-7** (S): Timeout config tuning (FR-8)
  8. **TASK-COWORK-CATCHUP-8** (M): Test suite extension (AC-1..AC-12)
  9. **TASK-COWORK-CATCHUP-9** (S): Documentation (FR-10 partial)
  10. **TASK-COWORK-CATCHUP-10** (S): Cron runbook doc → agent-father (FR-10 partial, routed)

**BOARD MUTATIONS APPLIED:**
1. Added 10 new tasks to backlog (TASK-COWORK-CATCHUP-1..10), all sprint=COWORK-GUARANTEED-SLOT-CATCHUP, status=BACKLOG, with explicit depends_on chains (Tier 1→2→3→4→5)
2. Updated 5 consolidated rows: type=SPIKE-S/FIX-?→SPRINT-M, added sequencing notes mapping FR coverage
3. True-up: 5 rows now type=SPRINT-M (matching 10-FR/5-row scope, not SPRINT-S)
4. **WIP DECISION:** Current in_progress=0, ready=0, WIP limit=2 → promoted TASK-COWORK-CATCHUP-1 to ready lane (1 of 2 slots used)

**HANDOFF FILES CREATED:**
- docs/handoffs/TASK-COWORK-CATCHUP-{1..10}.md (9 for developer sequential flow, 1 routed to agent-father)
- Each handoff: clear AC per test strategy (§8 brief), file modifications listed, dependencies explicit

**VERIFICATION:**
- orch-apply.sh: Stage 0+1 PASS, conservation check PASSED (task_total: 618→628, signal_total: 104 stable), atomic rename applied ✓
- Post-apply jq confirms: all 10 new rows status=BACKLOG, 5 consolidated rows type=SPRINT-M + notes added ✓
- TASK-COWORK-CATCHUP-1 promoted to ready[] (first dependency-free task, no blockers, sequential first-to-run) ✓

**BOARD STATE AFTER:**
- in_progress: 0 → 0 (no change, TASK-1 moved to ready, not in_progress)
- ready: 0 → 1 (TASK-COWORK-CATCHUP-1 promoted)
- backlog: 443 → 452 (added 10 new tasks, 5 consolidated rows updated in place)
- WIP usage: 1 of 2 slots (one slot free for parallel/urgent work if needed)
- Consolidated rows: all sequenced into dev plan with FR mapping notes

**NEXT:** Developer picks up TASK-COWORK-CATCHUP-1 from ready lane. Sequential tier advancement as each tier completes. Router routes next; agent-father awaits TASK-10 coordination signal after dev completes TASK-9.

---

## c331 FLOW-PRICE-ALPHA-LOOP · Wave-1 Readiness Gate + Dev Handoff · 2026-07-13T04:42Z

**MANDATE:** Complete PM wave-1 readiness gate: validate architect design, move 3 wave-1 rows backlog→ready, set up dev-mcp-server handoff.

**PRE-CONDITIONS VERIFIED:**
- Architect design READY_FOR_PM: `docs/handoffs/ALPHA-S1-architect-design.md` — 3 rows confirmed single-zone `apps/mcp-server/`, no further TASK_2xxx fan-out needed (S-size/atomic).
- Field corrections already applied (2026-07-13T04:34Z): zone=apps/mcp-server/, depends for STARTUP-CANDLE-GUARD=[ALPHA-S1-CANDLE-RECOVER] (shares recoverMissingOhlcvSession).
- All 3 rows supervised:false (USER-authorized via dev-team dispatcher coordination_session 69b0312e, commit 4e4210e0e).

**BOARD MUTATIONS APPLIED:**
1. Moved ALPHA-S1-CANDLE-RECOVER from backlog→ready (status=BACKLOG→READY, all fields preserved)
2. Moved ALPHA-S1-STARTUP-CANDLE-GUARD from backlog→ready (status=BACKLOG→READY, depends=[ALPHA-S1-CANDLE-RECOVER] intact)
3. Moved ALPHA-S1-OHLCV-BACKFILL-DONE-BUG from backlog→ready (status=BACKLOG→READY, all fields preserved)
4. Updated .head: status=in_progress, active_task_id=ALPHA-S1-CANDLE-RECOVER, **next_agent=dev-mcp-server**, next_action="wave-1 readied; dev-mcp-server executes CANDLE-RECOVER first (VPS-relay, deadline Mon 02:15Z), then STARTUP-CANDLE-GUARD, then OHLCV-BACKFILL-DONE-BUG"
5. Added decision_journal entry documenting wave-1 readiness gate complete, architect design verified, dev handoff.

**VERIFICATION:**
- orch-apply.sh: Stage 0+1 PASS, conservation check PASSED (task_total=504 preserved), atomic rename applied ✓
- Post-apply jq confirms: all 3 rows status=READY, supervised=false, zone=apps/mcp-server/, depends intact, note fields (USER-GO annotations) preserved ✓
- .head next_agent=dev-mcp-server for dispatcher-driven dev handoff ✓

**NEXT:** dev-team dispatcher spawns dev-mcp-server for ALPHA-S1-CANDLE-RECOVER (P0, VPS-relay recovery, deadline Mon 02:15Z open). After dev completion, gates will auto-advance STARTUP-CANDLE-GUARD (P1, dep on CANDLE-RECOVER done_verified), then OHLCV-BACKFILL-DONE-BUG (P1, parallel-safe).

---

## c330 FLOW-PRICE-ALPHA-LOOP · Architect Corrections · Wave-1 Release · 2026-07-12T19:45Z

**MANDATE:** Apply architect-verified zone/supervision corrections to the 3 ALPHA-S1 wave-1 rows (ALPHA-S1-CANDLE-RECOVER, ALPHA-S1-STARTUP-CANDLE-GUARD, ALPHA-S1-OHLCV-BACKFILL-DONE-BUG) and release them into the live BOUNDED-1 dev loop. Handoff: `docs/handoffs/ALPHA-S1-architect-design.md` (READY_FOR_PM commit c8a73aa42).

**PRE-CONDITIONS VERIFIED:**
- Architect design ready: all 3 rows pre-verified single-zone (`apps/mcp-server/`), disjoint file sets, parallel-safe via `isolation:"worktree"`.
- No further decomposition needed: each row already S-size/atomic, no TASK_2xxx fan-out.
- Design decision journal: `docs/agent-memory/decisions/sprint-FLOW-PRICE-ALPHA-LOOP-architect.md` (STEP architect-S1/S2/S3).

**BOARD CORRECTIONS APPLIED:**
1. **Zone correction** (all 3 rows): `zone: "multi"` → `zone: "apps/mcp-server/"` (verified single-zone, route → dev-mcp-server BOUNDED-1 dispatcher).
2. **Supervision clear** (all 3 rows): `supervised: true` → `supervised: false` (supervision gate's purpose "zone=multi → architect splits" satisfied; rows now eligible for dev-team auto-drain).
3. **Dependency add** (ALPHA-S1-STARTUP-CANDLE-GUARD): `depends: []` → `depends: ["ALPHA-S1-CANDLE-RECOVER"]` (shares new recovery function per §2 design; CANDLE-RECOVER picks P0-first so low sequencing cost).

**VERIFICATION:**
- orch-apply.sh: Stage 0+1 PASS, conservation check PASSED (task_total=503 stable), atomic rename applied.
- Post-apply jq query confirms all 3 rows: zone="apps/mcp-server/", supervised=false, STARTUP row depends on CANDLE-RECOVER.

**BOARD MUTATIONS:** Backlog state updated, 3 rows now unsupervised + correct zone, ready for BOUNDED-1 auto-dispatch on next ~30-min tick.

**NEXT:** dev-mcp-server BOUNDED-1 dispatcher picks up eligible rows. Router routes next.

---

## c329 MONEY-RADAR-P0 · Idle-Slot Fill · Task Pull · 2026-07-11T10:40Z

**MANDATE:** Router-initiated idle-slot fill for WIP=1/2 (OPS-BCTC-REFINE-REPASS-NONBANK-5T peer-owned, untouchable). PO pre-verified two unblocked mission-aligned candidates: CONTAM-11-REMEDIATE (primary) and WATCHLIST-DB-SYSMAP-DRIFT-FIX (alternate). Task: pull the valid candidate into ready[], verify pre-conditions, create handoff doc.

**PRE-VERIFY FINDINGS:**
- **CONTAM-11-REMEDIATE (primary):** STALE-PICK HAZARD — live daily_ohlcv contamination (sub-1000 close) = 4 rows (BMP/HGM/KSV/MCH × 1 each), NOT 3023 claimed in task description. Evidence: pre-verified via `sqlite3 data/market.db` query on 9 target tickers (BMP/MCH/HGM/PMC/KSV/TOS/AGX/TBD/STS); 5 tickers have 0 rows. Conclusion: contamination already 99.9% fixed (prior agent or abandoned midway). Stale-pick rule applied → SKIP.
- **WATCHLIST-DB-SYSMAP-DRIFT-FIX (alternate):** LIVE DRIFT CONFIRMED — live SQLite watchlist=52 rows vs SSOT system-map.json=34 items. Delta: 18 rows (VEA inactive present, VNH mis-seeded, 17+ active missing). Pre-verify: PASSED ✓

**OUTPUT:**
1. CONTAM-11-REMEDIATE: SKIPPED (stale-pick, task remains BACKLOG for root-cause triage by dev-team/ops)
2. WATCHLIST-DB-SYSMAP-DRIFT-FIX: PULLED into ready[] lane, status BACKLOG→READY
3. Handoff doc: docs/handoffs/TASK_WATCHLIST-DB-SYSMAP-DRIFT-FIX.md (acceptance criteria, known hazards, execution steps)
4. Decision journal: docs/agent-memory/decisions/sprint-MONEY-RADAR-P0-pm.md § STEP pm-S1

**BOARD MUTATIONS:** task_board.backlog→ready move (backlog=315→314, ready=0→1, in_progress=1 stable). Task conservation check PASSED (task_total=458 maintained). Terminal-lane bloat noted (done[]=22 > 10 threshold HSC-3); deferred to next PM cycle.

**NEXT:** dev-cross-service to pick up WATCHLIST-DB-SYSMAP-DRIFT-FIX from ready[]. Router routes next.

---

## c328 BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP · Epic Wrapper Closeout · 2026-07-10T21:50Z

**MANDATE:** Close epic wrapper row after all 11 sub-tasks (D0, D0B, D1, D2.5, D3, D4, D5, SHG-2, SHG-3, SHG-4, SHG-5) verified DONE_VERIFIED. Flip row status from ready[] to done_verified[], flag open follow-up.

**OUTPUT:** 
1. BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP row moved ready[]→done_verified[], status READY→DONE_VERIFIED (via jq + orch-apply.sh, atomic).
2. Open follow-up FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE flagged in backlog[] (genuine loose-end: latent conflict between orch-cold-evict.sh --exclude-ids flag and the now-hardened lane-coherence gate in D2.5/D5; mirrors ADD-1 READY precedent for LANE_ALLOWED_STATUSES design debt).
3. Decision journal STEP pm-S3 added documenting closeout rationale.

**BOARD MUTATIONS:** Epic wrapper row: ready[]→done_verified[], status flip. No new backlog row minted (FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE already exists, status backlog[], priority P2, owner developer).

**VERIFICATION:** All 11 children confirmed DONE_VERIFIED (8 in live board, 3 in archive/2026-07.json). Epic decomposition complete per architect brief. No regressions: coherence validator unchanged since D3+D5 landing.

**NEXT:** Head yields to main terminal. FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE queued for next developer/architect cycle (depends on orch-cold-evict.sh redesign + LANE_ALLOWED_STATUSES schema decision).

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
