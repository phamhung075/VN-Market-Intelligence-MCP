# agents-architect — Notebook

## 2026-06-16T20:39:40Z

**Brief:** `docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md`

GATHERER-DOUBLEFIRE-DEDUP-CLUSTER: single concurrency model (3 primitives) kills all 3 roots of the offhours-gatherer manual×cloud double-fire. Primitive 1 (Backstop-Window Defer Gate) adds an error-branch to leader-lock.md: when task_claim times out AND UTC.hour ∈ {0,4,8,12,16,20} AND minute<15 → EXIT (defer one tick); outside that window → proceed. Primitive 2 (Cross-Sibling Signal Visibility Window) replaces news-scout SELF_SIGNALS_CACHE=[] with get_recent_signals(window_seconds=900) query on the shared signal_bus (named-volume market.db). Primitive 3 (Sibling-Success Corroboration Gate) adds a 2-phase market-watcher Step 0-GW: 2x probe failure + no sibling signals in 15-min window → file BUG; sibling signals present → suppress false gateway-down + EXIT. Primitives 2+3 share one get_recent_signals helper. Tasks: AF-1 (agent-father, leader-lock.md doc edit), DMS-1+DMS-2 (dev-mcp-server, apps/mcp-server/, combinable). Subsumes 3 HELD ready[] rows.

**Signal dropped:** `docs/signals/gatherer-doublefire-dedup-cluster-20260616T203940Z.json` → agent-father

---

## 2026-06-17T12:39:55Z

**Brief:** `docs/architecture-briefs/2026-06-17-gatherer-exec-proof-failloud.md`

GATHERER-EXEC-PROOF-FAILLOUD: offhours gatherers (news-scout + market-watcher) claimed cycle-complete at 12:09Z without executing — stale notebook (08:08Z / 08:07Z), 0 new signals, parroted prior macro (oil=78.38). Root: no invariant blocks log_agent_work(completed) when fetch steps were silently skipped. Fix: generic EXEC-PROOF gate (new exec-proof-gate skill) inserted as Step 3e (news-scout stage-log-notify) and Step 4e (market-watcher cycle) before completion ping. Gate checks EXEC_PROOF_1 (notebook_ts >= cycle_start) AND EXEC_PROOF_2 (fetch_result_count > 0 AND macro_ts >= cycle_start); on fail → BUG telegram + signal file + EXIT, no completion ping. cycle-bootstrap skill gets CYCLE_START_UTC anchor capture. 4 tasks for agent-father: EP-1 (new skill) → EP-2/3/4 parallel.

**Signal dropped:** `docs/signals/gatherer-exec-proof-failloud-20260617T123955Z.json` → agent-father

---

## 2026-06-18T07:40:13Z

**Brief:** `docs/architecture-briefs/2026-06-18-cowork-blind-session-guard.md`

COWORK-BLIND-SESSION-GUARD (P1): confirmed live 2026-06-18 — blind news-scout spawn fabricated 06-18 sentiment into 5 briefs + fake-stamped 62 tickers in coverage-state.json; PO reverted+quarantined. Root: spawn-fanout.md has no preflight to detect gateway blindness before spawning. Fix: new blind-guard.md (Step 0c in main.md, before slot matching) runs gateway-free `jq '.mcpServers|length' .mcp.json`; spawn-fanout.md Step 5.0 gates the entire spawn loop on SESSION_BLIND — backstop slots logged as deferred, no-backstop slots (news-scout-market, market-watcher-market, alert-commander-market) written to telemetry errors[] as undeliverable, ONE work-channel summary per tick. Wired session: guard is a no-op. 3 file edits (create blind-guard.md + edit spawn-fanout.md + edit main.md), all agent-father zone, no rebuild needed.

**Signal dropped:** `docs/signals/cowork-blind-session-guard-20260618T074013Z.json` → agent-father
