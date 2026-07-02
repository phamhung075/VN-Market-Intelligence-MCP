# PO Notebook

_Last: 2026-07-02T10:37Z_

## Tick 2026-07-02T09:37Z — dev-team triage (coord d3292ca4): board-hygiene, NO dispatch (return NOTHING)

**Inputs clean:** read_telegram_reports(new)=none; list_unresolved_reports=[]; git branch=main only; head=idle (qa 09:38Z); WIP=1 (FIX-BCTC-ENRICHER-STUCK-BACKLOG, PARKED user-gated rebuild — untouched, no container actions).

**Signal #2 rag-restart-churn (file disposition only):** already fully triaged at 08:07Z tick — backlog `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` (ops, apps/rag-service/) carries the 245-restart + A-12-false-alarm corroboration in status_note; signal_queue row `rtr-20260702-rag-churn` already TRIAGED; ZERO NEW signal rows. NO new mint (dedup, memory feedback_auditor_reemit_clobbers_router_triage). Disposition: moved orphan `docs/signals/rag-restart-churn-20260702.json` → `processed/` (non-envelope shape, drain skipped it → stop re-surfacing). Evidence preserved + referenced by the backlog row.

**Signal #3 duplicate head keys (board hygiene, po-s138):** top-level `.head` idle=CORRECT (left untouched). `.task_board.head` had been RE-INFLATED with routing fields (active_task_id=BA-PREDICTION-EVIDENCE-REVIVAL, next_agent=architect) by updated_by=dev-team 2026-07-01T06:26:45Z — a RECURRENCE (po-s66 collapsed it 06-15). Collapsed back to non-routing deprecated stub via `scripts/po-s138-...jq | orch-apply.sh` (rc=0; 102 pre-existing SHG coherence warns, non-blocking). (a) BA-PREDICTION-EVIDENCE-REVIVAL = ABANDONED/SUPERSEDED: no real board row ever existed; concrete work spun out to `FIX-EVIDENCE-PIPELINE-STARVED` (real root: evidence_fragments=0→accumulator false-success) + `FIX-VPS-SSC-INSIDER-502` (decoupled VPS dep, 07-01T06:49Z) — do NOT resurrect. (b) dup key removed (collapsed to redirect stub, not deleted, per schema G-7 + po-s66 precedent).

**Recurring-bug-escalation (2nd head re-inflation):** root gap = `DeprecatedHeadStubSchema` uses `.passthrough()` → routing keys pass Zod silently → orch-apply never blocked the write. Minted PLAN-ONLY backlog `FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD` (architect, apps/mcp-server/, medium) to enforce G-7 at the write gate. backlog 385→386. NO dispatch pre-approved. RETURN=NOTHING (nothing dispatch-ready this tick).

## Tick 2026-07-02T10:37Z — dev-team triage (coord d3292ca4): WEDGE REPAIR + B-05/A-21 report triage → BATCH(2 FIX)

**[WEDGE — repaired FIRST]** signal_queue write-wedge: `.signal_queue.rows[id=rtr-20260702-rag-churn].payload_ref` pointed at moved file `docs/signals/rag-restart-churn-20260702.json` (disposed to `processed/` at 09:37Z tick, commit 51cd99c0) → orch-apply.sh runs dangling-ref validation on the POST-transform doc, so EVERY signal_queue write was rejected (both Tier-1/Tier-2 auditors had to DEFER dashboard rows; signals 8280/8281 in DB but no queue rows). Fixed via select-by-id repairing transform → `processed/rag-restart-churn-20260702.json` (orch-apply rc=0, 1-line diff, 102 pre-existing SHG coherence warns non-blocking). Scanned ALL queue payload_refs: ZERO other dangling. Future signal_queue writes unblocked.

**Report 3391 (B-05 bctc-discover STALE, CRITICAL):** claimed po → processed resolution=monitoring (kept TG msg 3137 — incident still open). Dispatcher RAW-verified: VPS last bctc push 2026-06-16T18:02:24Z (384h), prices/news/sbv legs healthy → transport ALIVE, bctc FETCH leg DEAD (isolated, NOT a monitor false-alarm like a44bc74a AGM). No existing open task covers the fetch-leg-dead incident (BCTC-HIST-VPS-BACKFILL=hist cache; B-05-FU-SSC-503-RETRY=SSC retry only). → BATCH **FIX-BCTC-VPS-FETCH-LEG-DEAD** (recon-FIRST: ops SSH-probe + raw-trigger ONE on-demand fetch to isolate discovery/transport/fetch; likely June-1 HNX TLS chain repeat — owa.hnx.vn incomplete chain, hotfix `curl -k` in vps-scripts/fetch-bctc.sh via scripts/deploy-vinahost.sh, commit e22427aa) + follow-up **BCTC-HNX-SSL-HARDEN** (HNX leaf cert expires 2026-07-07 → 2nd break due in ~5d; replace `-k` with `--cacert` pinning). zone cross-service.

**Report 3392 (A-21 mcp-server restart=3, WARN):** claimed po → processed resolution=duplicate (kept TG msg 3138). Already covered by open backlog: `FIX-MCP-MEMORY-CODE-LEAK` (TODO — the runtime code leak) + `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` (BACKLOG — churn/OOM). Immediate remedy = mcp-server rebuild = USER-GATED + classifier-denied → ask already standing (carry-over FIX-BCTC-ENRICHER-STUCK-BACKLOG park). NO new task, NO rebuild/docker-cp/restart-substitute attempted. Restart masks stale-image leak, does NOT fix.

**Dashboard queue-row backfill (8280/8281):** DEFERRED to auditors' next tick — wedge now clear so their re-emit succeeds; re-minting here risks feedback_auditor_reemit_clobbers_router_triage. Both anomalies fully dispositioned above.

## Carry-over
- WIP 1: `FIX-BCTC-ENRICHER-STUCK-BACKLOG` PARKED on user-gated mcp-server rebuild (also clears A-30 mem 85.66%+ stale-image scar). Do NOT unpark / plan container actions.
- `ready[]` = `TOKEN-ECONOMY-TICK-PREFLIGHT` (architect SPRINT-S, user_prioritized) — router dispatches when a WIP slot frees.
- New backlog guard `FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD` — architect groom (durable fix for repeat head-drift; find the dev-team writer that re-inflated too).
- `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` (ops, backlog) = rag churn root-cause, PLAN-ONLY.
- Size-cap breach root (cold-evict not clearing terminal done[] rows) still DEFERRED while board in-flight.
