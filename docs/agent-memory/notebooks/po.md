# PO Notebook

**Cycle:** :07-HOLD 2026-05-26T16:23Z — triage verdict = NOTHING (one quiet tick to let FA rebuild settle).
**Last update:** 2026-05-26T16:26Z
**Status:** WIP 0/2. apps/mcp-server zone FREE but DELIBERATELY HELD this tick. Host stable, 30m post-FA-rebuild.

---

## 2026-05-26T16:23Z — :07-HOLD (verdict NOTHING)

**VERDICT: NOTHING.** FA-FIX closed last tick (`3c00c17a` → ops `c41efb94` → PO sign-off). The only dev-team-dispatchable backlog is UX/hardening, all in `apps/mcp-server/`, all forcing ANOTHER ops rebuild:
- NEWS-INGEST-2b (UX display filter, P3) — `newsFetchLiveHandler.ts`
- MZH-1 (write-path trust, P2) — `pushBctcTableHandler.ts` returns DB-verified rows_stored
- MZH-2 (test isolation, P2) — no test writes to live market.db; test-only, no rebuild

**Why HOLD, not dispatch:**
1. Rebuild amortization — mcp-server rebuilt 15:54Z (30m ago) this hour. 16GB/8GB-capped panic-prone host; rag still flaky (ragInsert timing out, embeddings dark). A 2nd rebuild before the FA rebuild proves durable risks a swap-exhaustion event.
2. mcp-server charter = SCHEDULE-LAST/anti-churn — zone churned all last tick; back-to-back dispatch contradicts the rule that avoids the SSOT-dup-key + git-index-race class.
3. Priority: reliability→coverage→UX→arch. These are UX/hardening, below reliability. Nothing reliability-grade is dev-team-dispatchable (DEPLOY-DRIFT = ops/architect lane).
4. BCTC session HOT in apps/pdf-extractor/ (MD-EXTRACT-8, `40d23490` LIVE-VERIFY FAIL → architect) — different zone, shares git index on main.

**Batch directive recorded (for next tick):** NEWS-INGEST-2b + MZH-1 + MZH-2 dispatch as ONE coherent apps/mcp-server batch so a single rebuild covers all three. `ops_rebuild_required: true`.

**Signals drained (all non-dev-actionable):** 2× cowork-team LOW ticks (16:18 silent, 16:03 fan-out 2/2 genuine; NEWSSCOUT-MACRO-MISVALIDATE self-resolved); 3× context-bloat pings + price_anomaly (janitor/cowork lane); my own FA close signals (processed last tick); 958-file backlog (claude-manager-helper lane).

**Edits (working tree, NOTHING staged — no commit-mutex/task_claim in subagent harness; dispatcher commits on main, EXPLICIT git add per file, never -A):**
- docs/TASKS.md (FA section net-reduced ~10L; NEWS-INGEST-2b held-rationale refreshed to :07-HOLD + batch directive; 420→412L)
- docs/signals/po-20260526T162611Z.json (triage verdict signal)
- docs/agent-memory/notebooks/po.md (this)

## Carry-over
- **NEXT tick (apps/mcp-server, when zone quiet + FA rebuild confirmed durable):** dispatch ONE batch = NEWS-INGEST-2b + MZH-1 + MZH-2 → single ops rebuild. Reliability sequence first, then UX, then hardening within the batch. State `ops_rebuild_required: true` to ops.
- **Confirm FA rebuild holds:** the 15:54Z rebuild needs ≥1 full cron cycle clean before re-touching the zone. Watch get_system_status for the FA regression tripwire (return to 60s wall) — clear so far.
- **MARKET-SLOTS-DARK:** Option B (recreate 4 dark cowork RemoteTriggers) UNCHANGED — main-terminal `/cron-cowork-team` re-arm. NOT a dev-team spawn. Follow up that it landed.
- **FETCH-ANALYZE-2 (backlog, NOT dispatched):** REC-4 P2 `use_ingested` SQLite read-path. Reopen only on user request.
- **RELIABILITY WATCH:** macro/rag OOM-flap class still real — a 3rd macro/kinh-dich drift OR ingestion/safety-layer red → architect memory-budget rethink (recurring-bug-escalation). DRIFT-3 image-drift CI guard = architect lane.
- **DO NOT TOUCH:** any pilot-status-*.json (all CLOSED); BCTC parallel session (apps/pdf-extractor/, HOT).
- **JANITOR (not mine):** TASKS.md 412L (cap 80) — net-reduced this tick; deeper trim is claude-manager-helper's lane.
- **Dispatcher commits all 3 in-tree docs** — EXPLICIT git add per file, no -A/./-am, no push, on main. Watch index.lock (BCTC session may be on main — NEVER rm a peer's lock).
