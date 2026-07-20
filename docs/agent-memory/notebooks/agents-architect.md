# agents-architect — Notebook

## 2026-07-11T07:45:55Z

**Brief:** `docs/architecture-briefs/2026-07-11-analysis-quality-convergence-lanes.md`

ANALYSIS-QUALITY-CONVERGENCE (BA handoff, 7 FRs) split into 6 lanes: A=FR-1+FR-2 (cowork-refactory-expert, atomic CHEF-leg+gate-ext requirement flagged — not in BA's NFRs, load-bearing add), B=FR-5/C=FR-4 (both ALREADY EXIST as `CCATO-T3-FLOW-WIRING-6PT`/`CCATO-T2-CLAIM-TRUTH-SKILL` BACKLOG rows from sprint NARRATIVE-TRUTH-CCATO-GATE — pm dispatches those, does not re-mint), D=FR-3 (dev-mcp-server+dev-frontend split specced, still hard-gated on `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` REVIEW→DONE_VERIFIED), E=FR-7 recon SPIKE (fully specced in brief §6, architect did NOT write orch-state.json — task's explicit write-boundary constraint overrides BA cascade-table phrasing "architect mints"; pm executes via orch-apply.sh), F=FR-6 passthrough. Critical collision flagged: `IND-P1-MOMENTUM-CONSUMER-WIRING` (BACKLOG, held_by:po-s135) is SUPERSEDED by FR-1's fresh §0.4 matrix (stale row targets alert-commander/TNB, over-assigns foreign_accum_rank, wrongly excludes market-analyst) — pm must supersede-and-close or merge-in-place, not dispatch as-is. Resolved BA's one open item: bctc-analyst insider_sentiment anchor = stage-analyze.md E1+E3 pre-pass fetch + stage-consolidate.md Step 5 citation.

**Signal dropped:** `docs/signals/analysis-quality-convergence-lanes-20260711T074555Z.json` → pm

---

## 2026-07-18T19:34:15Z

**Brief:** `docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md`

CRON-WORKFLOW-OPTIMIZE: designed Tier-4 "D-FLEET" fleet-performance/cooperation dimension bolted onto system-auditor (no new agent/cron), per 4 pre-resolved axes. Corrected a false task premise on the way in: notebook cycle-telemetry (`cycles_run`/`exit_status`) is structured in only 2/45 notebooks (market-watcher, qa-responder), not 46/46 — rollup designed tolerant of this. Flagged 2 of the 4 mandated data sources as real LANE-B code prerequisites out of agent-father's zone: (c) per-agent `tool-usage-stats.json` breakdown needs `apps/mcp-server` caller-identity threading (none exists today — SSE-per-call model has no agent dimension), (d) full alert-accuracy generalization needs a new `alertSource` enum value (server-validated) — pilot v1 avoids new server code via existing generic tools (`create_prediction_claim`/disposition-proxy reusing task_board data) instead. On-demand pilot only (1-2 manual `AUDIT_TIER=4` runs, zero cron registration), 6 graduation criteria gate any future permanent-cadence ask to PO. Output routes through the existing D-IMPROVE/improvement-proposal pipeline verbatim — zero new signal type, zero new PO-flow row.

**Signal dropped:** `docs/signals/cron-workflow-optimize-tier4-fleet-audit-20260718T192722Z.json` → agent-father

---

## 2026-07-20T05:51:07Z

**Brief:** `docs/architecture-briefs/2026-07-20-signalqueue-persistent-finding-collapse-and-tally-accuracy.md`

Batched non-urgent design: (1) collapse 26 live append-always pdf-extractor A-11/A-20 rows (one persistent condition) → new downstream compaction pass modeled on `orch-cold-evict.sh`, status=NEW-only (frozen once triaged), never touches append-always E-3 emit path; found `check_id`/`dedup_key` are never persisted onto the row today (`emit-audit-signal.sh` discards them) — schema-blocker for any collapse design. (2) OUTPUT-CONTRACT `signal_queue_rows_written` 0/2/2 flakiness root-caused to a `flow/main.md` instruction gap, NOT a script bug — `emit-audit-signal.sh` is deterministic (a `SKIP-dedup` marker still means E-3 wrote a row; only `ABORT` means it didn't). Fix: doc-only counting-rule edit (agent-father, ship now) + optional `E3-ROW-WRITTEN` marker (developer, batched with the schema work). FOLD-vs-FRESH: fresh — `FIX-SIGNALQUEUE-DUP-ID-GUARD` is a distinct id-collision/ts-format class (no id collisions found live); `FU-AUDITOR-D4-SIGNAL-ID` cross-referenced as related-but-narrower prior art, not folded, not mutated.

**Signal dropped:** `docs/signals/signalqueue-persistent-finding-collapse-and-tally-accuracy-20260720T055107Z.json` → agent-father
