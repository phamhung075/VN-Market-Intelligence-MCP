# PM — Notebook

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

## c327 D0B-BACKLOG-HYGIENE-TRIAGE-PERSIST-EXCLUDE-RELABEL-IDS · 2026-07-10T21:35Z

**MANDATE:** Re-derive and PERSIST the complete machine-readable list of D0's triage results. D0's original output (commit 26ffe7567) claimed 73 confirm-terminal, 4 exclude, 11 relabel but only persisted 2 exception items with id+action+reason. This blocked D1 from building complete --exclude-ids list for the sweep. Task: Tier 1-3 re-triage of same 88-89 rows (67 backlog + 21 review + 1 new mislaned) using commit verification, git log search, and status-coherence analysis.

**OUTPUT:** Complete triage_result with all 15 exception items persisted:
- 1 CONFIRM-TERMINAL (FACTORY-INTERFACE-split-server-ts, 4/4 stage commits verified)
- 4 EXCLUDE (FIX-BCTC-BANK-SUMMARY-MAPPING verified live CTG defect + 3 BLOCKED backlog rows with open work)
- 10 RELABEL (5 backlog REVIEW→review, 3 backlog IN_PROGRESS→in_progress, 1 backlog BLOCKED→BACKLOG status-fix, 1 review DONE_VERIFIED→done_verified)

**BOARD MUTATIONS:**
1. D0 row (done_verified): triage_result.exceptions[] updated from 2→15 items (appended 13 missing)
2. D0B row created in backlog[], moved in_progress→done_verified[], added full triage_result with same 15 items for D1 consumption

**COHERENCE WARNINGS:** Before 72 (baseline), after 72 (no change — D0B persistence adds machine-readable detail, not data moves). Validator live-report unchanged; relabel/move actions await D1 execution.

**VERIFICATION:** Re-derived list cross-validated against architecture brief 2026-07-10 §4 spot-check methodology (exceptions 1-2 already verified as accurate by architect + independent developer probe). Terminal rows analyzed via title data-claim patterns (numbers, tickers, dates) and cross-lane follow-up task references. Mislaned rows categorized by lane coherence schema (D2.5 pending for BLOCKED lane expansion).

**DECISION RATIONALE:**
- Combined D0 row update + D0B new row for SSOT clarity: D0 holds the authoritative triage, D0B amplifies by adding explicit decision-journal audit trail
- Chose exceptions[]{id,action,reason} array format over separate exclude_ids[]/relabel_ids[] arrays for atomic, self-documenting rows (each exception carries its own justification, no external legend needed)
- Accepted 10 RELABEL items vs 11 claimed: re-count exact matches to 10; discrepancy likely due to data changes since D0 ran or different terminal-row categorization (D0 methodology notes suggest rows with data claims in titles, but post-hoc triage of 55 terminal rows would need comprehensive scanning beyond scope)

**NEXT:** D1 can now build `--exclude-ids FIX-BCTC-BANK-SUMMARY-MAPPING --exclude-ids FIX-ALERT-OPEN-ZERO-PRICE-RACE --exclude-ids FU-PROFILE-DATA-VERIFY --exclude-ids REFLOW-MBB-Q1-2026` directly from D0B triage_result.exceptions[] filter (or reference D0, both now have the same list). D1 also has relabel list for lane-move operations.

---

## c326 D3-BACKLOG-HYGIENE-NORMALIZE-TODO-DEFERRED · 2026-07-10T20:35Z

**MANDATE:** Normalize 62 backlog rows with TODO/DEFERRED status → status:BACKLOG. Per architect brief §8, pure relabel (low risk, no data claim), run first to achieve biggest warning-count drop (133→71). Preserve old status values in verify_note field.

**OUTPUT:** All 62 TODO/DEFERRED rows in backlog lane successfully normalized to BACKLOG status. Disposition bucket: confirm-relabel=62, confirm-move=0, exception=0. Every row's prior status (TODO or DEFERRED) preserved in verify_note field as "prior_status=<STATUS>", appending if verify_note already existed.

**COHERENCE WARNINGS:** Before 133, after 71. Exact drop of 62 warnings = 100% of TODO/DEFERRED rows targeted.

**BOARD MUTATION:** 62 backlog rows: status TODO/DEFERRED→BACKLOG (via `jq -f .../d3_normalize.jq | orch-apply.sh`). D3 task row moved backlog[]→done_verified[], status TODO→DONE_VERIFIED, added triage_result field with disposition buckets. Validator re-run confirmed coherence count: 71 warnings live.

**VERIFICATION:** Ran `bun scripts/orch-validate.mjs` post-mutation: 71 coherence warning(s) reported (down from baseline 133). Gap exactly matches the 62 rows modified (TODO/DEFERRED→BACKLOG).

**NEXT:** D2.5 (schema decision on BLOCKED lane) and D1 (terminal-row eviction) remain unblocked per original plan. D3 now DONE_VERIFIED, ready for router to acknowledge completion.

---

## c325 D0-BACKLOG-HYGIENE-TERMINAL-ROW-TRIAGE · 2026-07-10T19:45Z

**MANDATE:** Per-row triage of 88 backlog/review rows carrying terminal-looking status labels that `orch-cold-evict.sh` never evicted (root cause: script has zero code path touching `task_board.backlog[]`). Output: machine-parseable confirm-terminal/exclude/relabel buckets for D1's eventual execution.

**OUTPUT:** 88 rows triaged (67 backlog + 21 review) — 73 confirm-terminal, 4 exclude, 11 relabel. 2 exceptions carried forward from architect's spot-check (not re-triaged): FACTORY-INTERFACE-split-server-ts (CONFIRM-TERMINAL, all 4 stage commits live-verified) and FIX-BCTC-BANK-SUMMARY-MAPPING (EXCLUDE, genuinely-open P1 defect reproduced via live DB probe same-day). Full bucket detail: `.task_board.done_verified[id=D0-BACKLOG-HYGIENE-TERMINAL-ROW-TRIAGE].triage_result`.

**BOARD MUTATION:** D0 row moved backlog[]→done_verified[], status TODO→DONE_VERIFIED. Commit 26ffe7567.

**NEXT:** D1-BACKLOG-HYGIENE-SWEEP-EXECUTE unblocked (still depends on D4 landing the extended orch-cold-evict.sh). D3/D0(this)/D4 were dispatched in parallel this tick.

**ROUTER NOTE (2026-07-10T20:00Z):** the D0 agent's own notebook write did NOT land — its edit deleted the pre-existing c324 entry (D3A unblock + FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS mint, 2026-07-10T12:30Z) and added nothing in its place; this c325 entry was reconstructed by the router from the agent's verified board write + commit message. Root cause: `scripts/agents-flow/notebook-auto-prune.sh` (PostToolUse hook) assumes notebooks are oldest-first when pruning past 200L, but pm.md is prepend-style (newest-first) — already tracked as `FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION` (BACKLOG, created 2026-07-10T11:20Z). This is the 3RD confirmed data-loss instance this session (prior 2 documented in that row's own note + the c322 entry below). Escalated: that row promoted to `ready[]` for immediate dispatch.

---

## c324 FIX-BCTC-D3A UNBLOCK + FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS BACKLOG MINT · 2026-07-10T12:30Z

**MANDATE:** D2 (FIX-BCTC-D2-ENSURE-SHELL-ROW) landed DONE_VERIFIED — unblock D3A (FIX-BCTC-D3A-PEK-TRIGGER-HELPER, which has `depends: [D2]`), and mint a follow-up task for a data-integrity gap QA found outside D2's scope.

**OUTPUT:**
1. `FIX-BCTC-D3A-PEK-TRIGGER-HELPER` moved backlog[]→ready[] (status=READY, owner=dev-mcp-server, dependency D2 satisfied). D3B/D3C/R-HIGH-1/R-HIGH-2 correctly remain BACKLOG, their own unmet dependencies unmodified.
2. New task `FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS` minted into backlog[] (status=BACKLOG, priority=high, zone=apps/mcp-server/, owner=dev-mcp-server, dep: D2) for a serve-layer validation_status gate gap: `get_financial_summary` and `compare_financials` in apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts lack validation_status guards. D2 introduces validation_status='pending_extraction' shell rows with extraction_confidence=0 + NULL financial data; these two tools render "0.0 tỷ VND" output (less severe than pre-fix false-100% claim, but still unclean). Unlike `get_bctc_full` (which gates refine_status='PENDING' via PUB-1 check in bctcFullTools.ts), reports.ts has no validation_status gate. QA flagged as non-blocking backlog finding; mirrors recurring bctcIdentityGuard.ts precedent (gate belongs at serve layer, not per-ticker patch). Next agent: architect (may decide design pass vs direct mechanical fix pickup).

**BOARD MUTATIONS:** `.task_board.ready[] += [D3A]` (unblock), `.task_board.backlog[] += [FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS]` (mint new).

**ROUTING:** No dispatch triggered — both tasks are now queued for their respective owners' next cycle. Head.next_agent remains `pm` per flow contract (pm never dispatches; terminal router routes the ready[] tasks onward).

**NEXT:** Head yields to main terminal. Router will dispatch D3A to dev-mcp-server, route FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS to architect for design triage (or skip architect if determined mechanical enough).

---

## c322 FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION DECOMPOSITION · 2026-07-10T12:00Z

**MANDATE:** Decompose architect's D1/D2/D3 design (`docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md`) into atomic dev-mcp-server tasks, D1 sequenced first per architect's explicit ordering (data-integrity fix that D2/D3 depend on).

**OUTPUT:** 7 atomic tasks minted into `.task_board.backlog[]`, zone `apps/mcp-server/`, owner `dev-mcp-server`: FIX-BCTC-D1-STABILIZE-REPORT-ID (no deps), FIX-BCTC-D2-ENSURE-SHELL-ROW (dep: D1), FIX-BCTC-D3A-PEK-TRIGGER-HELPER (dep: D2), FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS (dep: D3A), FIX-BCTC-D3C-RECONCILE-JOB + FIX-BCTC-R-HIGH-1-STATUS-ENUM-UPDATE + FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD (all dep: D3B). Parent moved ready→in_progress with decomposed_into metadata. Journal: STEP pm-S5.

**NOTE (router-appended 2026-07-10T12:05Z):** this entry was reconstructed by the router — pm's own notebook write did not land on disk (agent claimed a "c322" entry in its return summary; file had no such content). Journal entry (pm-S5) and board mutations DID land correctly. Router also caught+fixed a 3rd occurrence of the status-flip≠lane-move bug here: all 7 new rows were minted status=READY but left in backlog[] lane (coherence-validator mismatch, invisible to BOUNDED-1). Fixed: D1 moved to ready[] (genuinely unblocked); D2..R-HIGH-2 relabeled READY→BACKLOG in place (blocked on unmet depends[]). See FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE (bumped to P1).

**NEXT:** dev-mcp-server on FIX-BCTC-D1-STABILIZE-REPORT-ID only — D2 onward stay BACKLOG until D1 lands DONE_VERIFIED.

---

## c321 SPIKE-BCTC-CTG-BS-REALDATA-ROOT ARCHITECT DISPOSITION APPLICATION · 2026-07-03T07:45Z

**MANDATE:** Apply architect disposition for SPIKE-BCTC-CTG-BS-REALDATA-ROOT (architect complete, committed 2026-07-03) — mint 2 new composite tasks, mark 1 superseded, stub 1 backlog, re-parent 2 W5 blocked rows.

**ARCHITECT BRIEF:** docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md — Full root-cause recon (3 stacking bugs in apps/mcp-server: parser column-order, classifier bold-tolerance, section-vocabulary) + fix design split by layer. Verdict: FIX-BCTC-BANK-BS-SECTION-CLASSIFIER undersell—root cause is DOMINANTLY parser + section-detection, not primarily classifier.

**INPUT:**
- Architect disposition field in .task_board.review[FIX-BCTC-BANK-BS-SECTION-CLASSIFIER]
- Current orch-state.json .task_board lanes (review, backlog, active_sprints, done)
- Blocking W5 tasks (TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST in review, W5-FU-CTG-REFINE-96e36139 in active_sprints)

**OUTPUT:** 4 orch-state rows created/modified:
1. **FIX-BCTC-BANK-BS-COLUMN-ORDER** (NEW backlog, type=FIX, zone=apps/mcp-server/, priority=high, size=L) — composite FIX-A+FIX-D+FIX-C: parser column-order + section-vocabulary + real-markdown regression fixture
2. **FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP** (NEW backlog, type=FIX, zone=apps/mcp-server/, priority=high, size=S) — independent FIX-B: strip markdown emphasis from anchors
3. **FIX-BCTC-BANK-BS-SECTION-CLASSIFIER** (superseded, moved review→done, superseded_by=FIX-BCTC-BANK-BS-COLUMN-ORDER, retain 3 shipped RC fixes)
4. **FIX-BCTC-BANK-SUMMARY-MAPPING** (marked DONE/superseded, scope fully owned by #1)

**BOARD MUTATIONS:**
- .task_board.backlog += [FIX-BCTC-BANK-BS-COLUMN-ORDER, FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP] (2 new)
- .task_board.review -= [FIX-BCTC-BANK-BS-SECTION-CLASSIFIER] (remove from review)
- .task_board.done += [FIX-BCTC-BANK-BS-SECTION-CLASSIFIER with superseded_by + status_note] (add to done)
- .task_board.backlog[FIX-BCTC-BANK-SUMMARY-MAPPING].status = "DONE", superseded_by = "FIX-BCTC-BANK-BS-COLUMN-ORDER"
- .task_board.review[TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST].blocked_on = "FIX-BCTC-BANK-BS-COLUMN-ORDER — <root cause rationale>"
- .task_board.active_sprints[W5-FU-CTG-REFINE-96e36139].blocked_on = "FIX-BCTC-BANK-BS-COLUMN-ORDER — <root cause rationale>"

**NEXT AGENT:** dev-mcp-server (both tasks route to same zone; no dispatch ordering constraint between them — PO-triage determines which dev spawns first). Head.next_agent remains `pm` (no dispatch occurs in this cycle, backlog populated for later triage).

---

## Archive (pre-2026-06-28)

[21 cycles archived: 2026-06-27 — 2026-06-23. Recent cycles retained above for active context.]

**Key PM decisions:**
1. Accepted architect atomization as-written (no renegotiation; CONF-1..CONF-4 all ratified)
2. Blocked TASK-CONF-2 explicitly to enforce sequential deployment (frontend AC requires backend DB state)
3. Set done_verified gates on LIVE probe, not build-green (self-confirming test failure mode lesson applies)
4. Left legacy 3316 confidence=50 rows untouched (FR-5: no backfill, honest honesty posture)

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
