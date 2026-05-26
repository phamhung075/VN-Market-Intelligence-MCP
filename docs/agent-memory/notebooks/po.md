# PO Notebook

**Cycle:** :07 2026-05-26T17:23Z — triage verdict = BATCH (MCPZONE-BATCH-1, apps/mcp-server, 3 tasks, ONE ops rebuild).
**Last update:** 2026-05-26T17:23Z
**Status:** WIP 0/2 → dispatching 1 batch (counts as fleet work). apps/mcp-server zone HELD-condition CLEARED this tick.

---

## 2026-05-26T17:23Z — :07 (verdict BATCH)

**VERDICT: BATCH MCPZONE-BATCH-1** = NEWS-INGEST-2b + MZH-1 + MZH-2, zone `apps/mcp-server/`, owner dev-mcp-server, `ops_rebuild_required: true` (ONE shared rebuild). The 16:23Z HOLD's two re-eval conditions are now MET.

**Why dispatch now (prior-tick condition came due):**
1. **FA rebuild DURABLE** — mcp-server uptime 1h31m (15:54Z FA-OPS rebuild), survived the 16:00Z 2/2-GENUINE cowork fan-out + every silent tick since; 0 open / 0 half-open across all 16 breakers; DB 173MB/WAL 2.77MB; rag-insert timeout CLEAR. The FA tripwire (return to 60s wall) never tripped.
2. **CONTENTION RESOLVED (fresher evidence than dispatcher had):** dispatcher feared BCTC MD-DEPLOY-9 ops rebuild "may SOON" fire → two concurrent rebuilds → swap/panic. But HEAD advanced 2 commits past dispatcher snapshot (b3de804c→818910a9): **MD-DEPLOY-9 ALREADY COMPLETE** (ops `a448aa84` ~17:17:48Z; fresh re-extract row id=11 17:21:28Z; LIVE-VERIFY-9 `818910a9` PASS all 5 ACs). The pdf-extractor rebuild is DONE, not pending → mcp-server rebuild will be SEQUENTIAL, not concurrent. No two-rebuild collision.
3. **Safest window** — host idle/stable at 17:25Z probe AFTER both this-hour rebuilds (FA + pdf-extractor) settled; next cowork fan-out 20:00Z (~2.7h off-hours quiet). A single mcp-server rebuild into an idle host with a long quiet window is the best slot before live traffic.
4. Holding a 3rd tick would defer past the resolution of the exact blocker I named last tick. Condition met ⇒ dispatch.

**Batch sequence:** MZH-1 (write-path trust) → MZH-2 (test isolation+prod-db guard, test-only no own rebuild) → NEWS-INGEST-2b (UX VN-source display). ONE dev cycle, ONE commit set, ONE ops rebuild (MCPZONE-DEPLOY-1 follow-on: build+force-recreate per RESTART≠REBUILD gate 6a919ea4, prove code live in-container, no 60s-wall regression).

**Priority caveat:** all 3 are UX+hardening (below reliability in reliability→coverage→UX→arch). Dispatchable-highest only because nothing reliability-grade is in the dev lane (DEPLOY-DRIFT = ops/architect).

**Real file paths verified:** newsFetchLiveHandler.ts + pushBctcTableHandler.ts both at `apps/mcp-server/src/interface/mcp/routes/`; test at `apps/mcp-server/src/__tests__/pushBctcTableHandler.test.ts`.

**Standing items re-confirmed routed (NOT re-dispatched):** HSG-FIRE-SEVERITY-RECAL (alert-commander), MARKET-SLOTS-DARK (Option B main-terminal /cron-cowork-team re-arm), HOLLOW-RUN-20260525 (agent-father), RESTART≠REBUILD gate (done 6a919ea4), CHEF-EOD-MACRO-MISATTRIB + cow schedule-drift (cowork/schedule LOW), context-bloat TASKS.md pings (janitor lane), 4x cowork-fire (expected-silent off-hours).

**Edits (working tree, NOTHING staged — no commit-mutex/task_claim in subagent harness):**
- docs/TASKS.md (held-rationale collapsed → DISPATCHED on NEWS-INGEST-2b/MZH-1/MZH-2 + line 9 backlog note; 412L held, net-neutral)
- docs/signals/po-20260526T172300Z.json (BATCH verdict signal)
- docs/agent-memory/notebooks/po.md (this)

## Carry-over
- **NEXT (after dev lands MCPZONE-BATCH-1 on main):** dispatch ops MCPZONE-DEPLOY-1 — single mcp-server rebuild (build + up -d --no-deps --force-recreate), prove new handler code live in-container, /health 200 + 146 tools, dead-Reuters probe no 60s-wall regression. Then NEWS-INGEST-3 (qa) unblocks → ops PROVES LIVE (VN articles in /api/news-fetch/live; inserted>0 cursor proof).
- **NEWS-INGEST-3 (qa) is the gate** for both -2 (cursor fix `9711ca72`) and -2b (this batch). Stays BLOCKED until -2b lands.
- **MD-* BCTC chain is NOT mine** — apps/pdf-extractor/ HOT, MD-DEPLOY-9 DONE, now → qa MD-QA-9 (read-only live re-read row id=11) → po MD-EXIT + user verbal G9 sign-off. Goal STILL ARMED until user confirms. Watch for MD-EXIT request to land in MY lane.
- **MARKET-SLOTS-DARK:** Option B unchanged — main-terminal /cron-cowork-team re-arm. Follow up it landed.
- **FETCH-ANALYZE-2 (backlog, NOT dispatched):** REC-4 P2 use_ingested SQLite read-path. Reopen only on user request.
- **RELIABILITY WATCH:** macro/rag OOM-flap class still real; a 3rd macro/kinh-dich drift OR ingestion/safety-layer red → architect memory-budget rethink (recurring-bug-escalation). DRIFT-3 image-drift CI guard = architect lane.
- **DO NOT TOUCH:** any pilot-status-*.json (all CLOSED); BCTC parallel session (apps/pdf-extractor/, HOT — never rm its index.lock on main).
- **JANITOR (not mine):** TASKS.md 412L (cap 80) — held this tick; deeper trim = claude-manager-helper lane.
- **Dispatcher commits all 3 in-tree docs** — EXPLICIT git add per file, no -A/./-am, index.lock retry (NEVER rm BCTC's lock), no push, main only. Leave dev code edits UNSTAGED for the dev cycle.
