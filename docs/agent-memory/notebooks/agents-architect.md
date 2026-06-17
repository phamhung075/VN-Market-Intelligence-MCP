# agents-architect — Notebook

## 2026-06-16T16:50:57Z

**Brief:** `docs/architecture-briefs/2026-06-16-fb-poster-tnb-upgrade.md`

FB-POSTER-TNB-UPGRADE: fb-market-poster degrades to generic recap when CHEF is silent (confirmed 2026-06-16 intraday, 0 clusters). Root cause is a synthesis gap not a data gap — all live tools returned real data. Fix: insert STEP 2b (TNB 6-layer top-down walk with CHEF-shortcut branch and $tnb_synthesis schema) and STEP 2c (T-45 adversarial gate with 5 hard-fail rules: cross-ticker contamination, false-precision levels, is_estimate-cited-as-fact, noise-scale flow, internal contradiction) between STEP 1b and STEP 3 in fb-market-poster flow. Widen STEP 1b to pull all watchlist tickers + TA + legal/earnings tools. Revise STEP 3 to read from $tnb_synthesis. 4 tasks for agent-father (A+B parallel, C after B, D after C). Jargon gate, 3-section structure, 16 validation checks, STEP 0/5-8 untouched.

**Signal dropped:** `docs/signals/fb-poster-tnb-upgrade-20260616T165057Z.json` → agent-father

---

## 2026-06-16T20:39:40Z

**Brief:** `docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md`

GATHERER-DOUBLEFIRE-DEDUP-CLUSTER: single concurrency model (3 primitives) kills all 3 roots of the offhours-gatherer manual×cloud double-fire. Primitive 1 (Backstop-Window Defer Gate) adds an error-branch to leader-lock.md: when task_claim times out AND UTC.hour ∈ {0,4,8,12,16,20} AND minute<15 → EXIT (defer one tick); outside that window → proceed. Primitive 2 (Cross-Sibling Signal Visibility Window) replaces news-scout SELF_SIGNALS_CACHE=[] with get_recent_signals(window_seconds=900) query on the shared signal_bus (named-volume market.db). Primitive 3 (Sibling-Success Corroboration Gate) adds a 2-phase market-watcher Step 0-GW: 2x probe failure + no sibling signals in 15-min window → file BUG; sibling signals present → suppress false gateway-down + EXIT. Primitives 2+3 share one get_recent_signals helper. Tasks: AF-1 (agent-father, leader-lock.md doc edit), DMS-1+DMS-2 (dev-mcp-server, apps/mcp-server/, combinable). Subsumes 3 HELD ready[] rows.

**Signal dropped:** `docs/signals/gatherer-doublefire-dedup-cluster-20260616T203940Z.json` → agent-father

---

## 2026-06-17T12:39:55Z

**Brief:** `docs/architecture-briefs/2026-06-17-gatherer-exec-proof-failloud.md`

GATHERER-EXEC-PROOF-FAILLOUD: offhours gatherers (news-scout + market-watcher) claimed cycle-complete at 12:09Z without executing — stale notebook (08:08Z / 08:07Z), 0 new signals, parroted prior macro (oil=78.38). Root: no invariant blocks log_agent_work(completed) when fetch steps were silently skipped. Fix: generic EXEC-PROOF gate (new exec-proof-gate skill) inserted as Step 3e (news-scout stage-log-notify) and Step 4e (market-watcher cycle) before completion ping. Gate checks EXEC_PROOF_1 (notebook_ts >= cycle_start) AND EXEC_PROOF_2 (fetch_result_count > 0 AND macro_ts >= cycle_start); on fail → BUG telegram + signal file + EXIT, no completion ping. cycle-bootstrap skill gets CYCLE_START_UTC anchor capture. 4 tasks for agent-father: EP-1 (new skill) → EP-2/3/4 parallel.

**Signal dropped:** `docs/signals/gatherer-exec-proof-failloud-20260617T123955Z.json` → agent-father
