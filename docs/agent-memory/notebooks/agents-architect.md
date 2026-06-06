# agents-architect — Notebook

## 2026-06-06T18:35:59Z

**Brief:** `docs/architecture-briefs/2026-06-06-workflow-fluidity-audit.md`

Full workflow-fluidity audit of the multi-agent pipeline: 7 dimensions (handoff chain liveness, orch-state contention, decision journal contention, lock liveness, cron overlap, WIP throughput, fail-loud dead-ends). Findings: 3 DEADLOCK-RISK — most critical is fail-loud STOP paths in developer/qa/fixer not releasing sprint-task lock nor resetting pipeline head, causing ≤24h futile pipeline-resume livelock; 3 CONFLICT — decision journal shared-file breaks when Phase 4 parallel spawns activate (fix: per-agent file), concurrent signal_queue writes at :00/4h overlap can silently drop rows (fix: retry-read-compare loop or SQLite row insert); 4 BOTTLENECK — WIP=2 by design, sequential mandate pending c44, signal drain 53-min max window, dual-layer claim model complexity. Top-3 fixes for agent-father: (1) add task_release+head-reset to all STOP paths in developer/qa/fixer; (2) per-agent decision journal files sprint-<id>-<agent-id>.md; (3) promote FU-ORCH-HEAD-CAS to sprint + add signal_queue concurrent-write retry.

**Signal dropped:** `docs/signals/workflow-fluidity-audit-20260606T183559Z.json` → agent-father

---

## 2026-06-05T16:37:44Z

**Brief:** `docs/architecture-briefs/2026-06-05-emit-dark-root-cause.md` (v1)

EMIT-DARK-RECURRING: H1 (stale session) + H3 (early-exit) both ruled out by post-fix telemetry evidence. H2 CONFIRMED — Steps 4.7+4.8 are agent-interpreted prose with fail-safe semantics; LLM agent narrates and skips, producing zero disk output while proceeding to spawn. Code fix required (not operator action): anchor pressure-state write to telemetry.md Step 6 (observable mandatory artifact) + optional pre-dispatch shell script for pure-bash fields. Priority: low (legacy cadence safe).

**Signal dropped:** `docs/signals/emit-dark-root-cause-20260605T163744Z.json` → agent-father

---

## 2026-06-05T18:09:00Z

**Brief:** `docs/architecture-briefs/2026-06-05-emit-dark-root-cause.md` (v2 — DEFINITIVE, supersedes v1 + Option B)

Option B (d6738df3) live-falsified: 18:01:29Z FIRE wrote signal JSON with resolved placeholder values but pressure-state.json still absent. Smoking gun: `"matched_slots": ["bctc-analyst-slot-2"]` in live signal vs literal `[<slot_ids from MATCHES>]` in telemetry.md template — proves LLM never ran bash, only narrated. Corrected root cause: cowork dispatcher is a pure narration engine; bash fences are never executed; LLM writes the signal file via Write-tool using in-context values and skips the pressure-state heredoc because its inputs (signal_backlog/dev_queue_depth/host_headroom_mb) require real shell. Three code fixes all failed same class. Fix: Option C — add emit_pressure_state MCP tool (server-side shell computation + atomic file write); replace bash fence in telemetry.md with call_tool instruction (LLM demonstrably executes call_tool). Option E (retirement) documented as contingency only.

**Signals dropped:** `docs/signals/emit-dark-option-c-20260605T180900Z.json` → developer; `docs/signals/emit-dark-telemetry-patch-20260605T180900Z.json` → agent-father (gated on tool deploy)

---

## 2026-06-06T18:46:34Z

**Brief:** `docs/architecture-briefs/2026-06-06-headroom-context-compression.md`

Headroom context compression integration design: evaluated 4 candidate points; selected gateway-side SmartCrusher middleware inside apps/mcp-server as primary (non-ML, zero new containers, fail-open, TypeScript-native). Rejected CLI wrap (fleet blast radius), MCP server mode (tool surface growth), and ML Kompress model (16GB host memory risk). Defined financial data exemption list (get_bctc_full, get_bctc_refined, FX, price history — passthrough required for numeric integrity). 3-phase rollout: Phase 1 = 3 high-volume non-financial tools (get_cycle_bootstrap, get_market_snapshot, fetch_news_batch) with golden-output validation gate; Phase 2 = full allowed list + CacheAligner; Phase 3 = metrics dashboard. Owner: dev-mcp-server. P3 improvement-proposal signal dropped to po.

**Signal dropped:** `docs/signals/headroom-context-compression-20260606T184634Z.json` → po
