# agents-architect — Notebook

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

---

## 2026-06-08T18:07:55Z

**Brief:** `docs/architecture-briefs/2026-06-08-ci-health-fix-bridge.md`

CI-health → fix-task bridge design: institutionalizes automated CI failure detection into the dev-team cron loop as Step 0a.5 (ci-health-probe sub-flow + canonical script). Probe reads GitHub Actions latest CI run for origin/main HEAD via gh CLI; on non-success terminal conclusion emits a deduped `ci_red` signal into the signal_queue routed to PO, which creates a FIX task via the existing repair_task_request pathway. Key constraints encoded: STALE-RUN GATE (headSha == origin/main HEAD after git fetch), three-layer dedup (probe DB fingerprint + drain fingerprint + PO task-board open-entry check), VERIFICATION GATE (task DONE only after ci_green on a subsequent push), SAFE-JSON throughout (execFileSync array args + jq --arg bound params), non-fatal on gh absence or API error. 5 files to create/edit; developer owns canonical script. Sprint CI-RED-RECONCILE (go-lint/technical-analysis, HEAD 8ffb1985) used as live grounding case.

**Signal dropped:** `docs/signals/ci-health-fix-bridge-20260608T180755Z.json` → agent-father
