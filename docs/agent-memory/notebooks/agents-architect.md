# agents-architect — Notebook

## 2026-06-14T18:06:57Z

**Brief:** `docs/architecture-briefs/2026-06-14-07-06-methodology-upgrade.md`

07-06-METHODOLOGY-UPGRADE: full macro/top-down layer implementation from 07-06 expert roundtable (T-15..T-45). Created 2 new cowork skills: macro-health-read (Báu "two trucks → six tracks" — 6-track JSON, degraded→live upgrade path) and trade-fx-pressure-decomp (Thành BOP anatomy — FX-incidence verdict, NEGATIVE-MARGIN-TRAP flag, duration prior). Extended 2 existing skills: regime-extraction (PMI MA3 T-16) and four-factor-synthesis (decompose-before-conclude 3-question gate T-44). Upgraded 6 agent flows: market-watcher (T-20/21/27/28/32/41/43), unified-agent/CHEF (T-31 fiscal-trap, T-39 BOP walk, macro-health-read as Layer-1 source), digest-predict (T-23 bank-survey, T-42 duration prior), bctc-analyst (T-19 price_driven, T-37 intercompany-loss), news-scout (T-41 fake-FDI), tran-ngoc-bau (T-45 adversarial gate). Tree-map updated with both new skills + TNB skill backfill. All files implemented directly. PO owns the 5 new MCP tools in parallel lane.

**Signal dropped:** `docs/signals/07-06-methodology-upgrade-20260614T180657Z.json` → agent-father

---

## 2026-06-16T16:50:57Z

**Brief:** `docs/architecture-briefs/2026-06-16-fb-poster-tnb-upgrade.md`

FB-POSTER-TNB-UPGRADE: fb-market-poster degrades to generic recap when CHEF is silent (confirmed 2026-06-16 intraday, 0 clusters). Root cause is a synthesis gap not a data gap — all live tools returned real data. Fix: insert STEP 2b (TNB 6-layer top-down walk with CHEF-shortcut branch and $tnb_synthesis schema) and STEP 2c (T-45 adversarial gate with 5 hard-fail rules: cross-ticker contamination, false-precision levels, is_estimate-cited-as-fact, noise-scale flow, internal contradiction) between STEP 1b and STEP 3 in fb-market-poster flow. Widen STEP 1b to pull all watchlist tickers + TA + legal/earnings tools. Revise STEP 3 to read from $tnb_synthesis. 4 tasks for agent-father (A+B parallel, C after B, D after C). Jargon gate, 3-section structure, 16 validation checks, STEP 0/5-8 untouched.

**Signal dropped:** `docs/signals/fb-poster-tnb-upgrade-20260616T165057Z.json` → agent-father

---

## 2026-06-16T20:39:40Z

**Brief:** `docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md`

GATHERER-DOUBLEFIRE-DEDUP-CLUSTER: single concurrency model (3 primitives) kills all 3 roots of the offhours-gatherer manual×cloud double-fire. Primitive 1 (Backstop-Window Defer Gate) adds an error-branch to leader-lock.md: when task_claim times out AND UTC.hour ∈ {0,4,8,12,16,20} AND minute<15 → EXIT (defer one tick); outside that window → proceed. Primitive 2 (Cross-Sibling Signal Visibility Window) replaces news-scout SELF_SIGNALS_CACHE=[] with get_recent_signals(window_seconds=900) query on the shared signal_bus (named-volume market.db). Primitive 3 (Sibling-Success Corroboration Gate) adds a 2-phase market-watcher Step 0-GW: 2x probe failure + no sibling signals in 15-min window → file BUG; sibling signals present → suppress false gateway-down + EXIT. Primitives 2+3 share one get_recent_signals helper. Tasks: AF-1 (agent-father, leader-lock.md doc edit), DMS-1+DMS-2 (dev-mcp-server, apps/mcp-server/, combinable). Subsumes 3 HELD ready[] rows.

**Signal dropped:** `docs/signals/gatherer-doublefire-dedup-cluster-20260616T203940Z.json` → agent-father
