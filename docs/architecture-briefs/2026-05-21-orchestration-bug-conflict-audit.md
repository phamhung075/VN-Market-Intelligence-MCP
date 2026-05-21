# Orchestration Bug & Conflict Audit — Sprint 1967a Brief

> **STATUS — SUPERSEDED 2026-05-21T19:19:20Z (po c236):** This brief was authored pre-BA scope (direct dispatch) and covers ~50% of the testable check-lists in `docs/REQ_1967.md`. The canonical 1967b architect brief MUST re-run against REQ_1967 — using this document as **evidence input only**, not as authoritative output. Re-run dispatch signal: `docs/signals/po-1967b-rerun.json`. Re-run gaps to close: REQ-1967-1b (signal-file naming contract), -1d (caveman ≤120 char compliance), -2a (per-flow JUMP-TO/RETURN table), -2b (recursive-spawn guard dev-team/cowork-team), -2d (cowork-flow idempotency), -3a..-3e (per-dispatch-site task-lock symmetry table), -4a/-4d (writer-prune vs reader-scan race window + processed/ migration atomicity), -5b/-5c/-5e (isRunning guard audit, watchdog start_period vs cron tick, OBSERVE-1955d gate status), -6a/-6c/-6d/-6e (full 35-agent capability/always_load/identity/count audit), -7e (11-field per-finding invariant), -7f (BCTC-gated finding enumeration). The 13 ITEM rows below remain valid as evidence and may be ratified into the canonical brief verbatim.

**Author:** agents-architect | **Date:** 2026-05-21T19:08:39Z | **Task:** 1967a (superseded — see notice above)
**Scope:** Read-only scan across 6 surfaces: inter-agent comms, flow files, dispatch routing, signal bus + DASHBOARD, cron + cowork dispatcher, agent definitions.
**AC-7 Cross-links:** 1963-MW-IDENTITY · OBSERVE-1955d · 1962-B-01 · 1964-AC-ENUM · 1965-COVERAGE-SWEEP · cowork-team-20260521T185005Z · recurring-bug-freeze-policy

---

## Surface 1 — Inter-Agent Comms (Signal Bus, MCP Tool Enums, DASHBOARD, Caveman Handoff)

### ITEM-01 · alertSource enum gap in `write_alert_verdict` (Evidence: 1964-AC-ENUM)

| Field | Value |
|---|---|
| id | ITEM-01 |
| surface | 1 — inter-agent comms |
| severity | HIGH |
| repro_or_evidence_pointer | alert-commander notebook cycles 2026-05-20 04:37 + 2026-05-21 04:39: "write_alert_verdict rejected `legal_risk` alertSource — used `urgent_news`/`position_danger` fallback". Tool spec at `.claude/tools/list/write_alert_verdict.md` line 19: enum = `urgent_news, verified_chain, chain_catalyst, price_anomaly, position_danger, watchlist_opportunity`. `legal_risk` absent. |
| current_behaviour | alert-commander fires CRITICAL `legal_risk` alert → calls `write_alert_verdict(alertSource="legal_risk")` → server rejects (enum violation) → agent silently falls back to `urgent_news` or `position_danger`. Verdict row is mis-categorised, corrupting alertSource analytics. |
| expected_behaviour | `legal_risk` is a valid alertSource. Verdict row written with correct source type. |
| suggested_fix_design | Add `legal_risk` and `crisis_velocity` to the `alertSource` enum in the Zod schema backing `write_alert_verdict`. Matching enum extension in `post_agent_signal` `signal_type` is already confirmed to accept `legal_risk` (mcp-tools.md Signal Bus table) — only `write_alert_verdict` is missing it. |
| suggested_fix_owner | dev-mcp-server |
| suggested_fix_size | XS |
| depends_on | — |

### ITEM-02 · `verified_decision` / `signal_feedback` signal types undeclared in `post_agent_signal` schema (Evidence: 1964-AC-ENUM)

| Field | Value |
|---|---|
| id | ITEM-02 |
| surface | 1 — inter-agent comms |
| severity | HIGH |
| repro_or_evidence_pointer | DASHBOARD.md 1964-AC-ENUM row: "alert-commander `verified_decision` signal rejected by `post_agent_signal` schema; fallback `signal_feedback` ALSO rejected". `post_agent_signal.md` enum: `urgent_news, price_anomaly, cross_validate, suppress, chain_catalyst, fundamental_validation, price_confirmation, verified_chain`. Neither `verified_decision` nor `signal_feedback` appears. alert-commander agent def (`capabilities`) says "Emit suppress and verified_decision signals back to all cowork agents". |
| current_behaviour | Alert-commander cannot emit its suppression acknowledgement via `post_agent_signal`. Downstream cowork agents (news-scout, market-watcher) never receive suppress/verified_decision acks. Chain de-duplication across agents is broken when these signals are the mechanism for marking signals consumed. |
| expected_behaviour | `verified_decision` is a valid signal type. `post_agent_signal` accepts it. Alert-commander emits it after firing or suppressing. |
| suggested_fix_design | Two options: (A) add `verified_decision` to the `signal_type` enum in agentSignalTools.ts Zod schema; or (B) confirm that `suppress` is the canonical ack and update alert-commander flow + capability text to drop `verified_decision`. Option B is safer — reduces enum surface — but requires aligning agent def + `stage-signals.md`. |
| suggested_fix_owner | dev-mcp-server (schema) + agent-father (alert-commander def + flow) |
| suggested_fix_size | S |
| depends_on | — |

### ITEM-03 · DASHBOARD.md writer/reader race — writer-prune vs reader-scan (Evidence: 1962-B-01)

| Field | Value |
|---|---|
| id | ITEM-03 |
| surface | 1 — inter-agent comms + 4 — signal bus |
| severity | HIGH |
| repro_or_evidence_pointer | 1962-B-01 DASHBOARD row: pm `plan_blocked` signal written at 22:30Z AFTER po had already closed sprint at 20:48Z. DASHBOARD.md row comment: "STALE RACE — Sprint 1962 closed before pm signal could resolve." No CAS/version-check exists on sprint-state transitions. |
| current_behaviour | pm reads TASKS.md snapshot → takes time to author plan_blocked signal → by the time pm writes the DASHBOARD row, po has already closed the sprint based on a stale read. The signal is valid but contextually orphaned. |
| expected_behaviour | Either (a) pm must re-read sprint state immediately before emitting plan_blocked, or (b) plan_blocked must carry a sprint-state version token that po checks before acting. |
| suggested_fix_design | Add a `sprint_version` or `closed_at` guard to pm's plan_blocked signal emission. pm reads `pipeline-state.json` `activeTaskId` / sprint status immediately before writing the DASHBOARD row. If sprint is already `idle` or task is `Done`, skip the signal. XS change to `pm` flow only — no schema change needed. |
| suggested_fix_owner | agent-father (pm flow edit) |
| suggested_fix_size | XS |
| depends_on | — |

---

## Surface 2 — Flow Files (Race/Idempotency, JUMP-TO/RETURN, Recursive Spawn, Identity)

### ITEM-04 · market-watcher identity regression — intermittent self-refusal post-fix (Evidence: 1963-MW-IDENTITY)

| Field | Value |
|---|---|
| id | ITEM-04 |
| surface | 2 — flow files / agent identity |
| severity | HIGH |
| repro_or_evidence_pointer | DASHBOARD.md 1963-MW-IDENTITY row: "163840Z=SUCCESS, 170504Z=FAILURE (simulated cycle, 'cannot directly call MCP tools through the gateway')." Cowork telemetry confirms 163840Z spawned market-watcher successfully; 165007Z was silent (no match); 170504Z spawned again → failure observed in session. Fix was applied (agent-father strengthened YAML description, promoted `mcp-tools.md` to `always_load`, added identity constraints). However the intermittent pattern persists: SUCCESS → FAILURE alternation across spawned sessions suggests the fix is structurally incomplete. |
| current_behaviour | market-watcher spawned at 170504Z executed the flow but reported it "cannot directly call MCP tools through the gateway" — a claim contradicted by `mcp_tool_available: true` in its own agent def. Fix landed but the next failure appeared in the same session window. |
| expected_behaviour | market-watcher always calls `call_tool(server="vn-market", ...)` without self-refusal on any spawn. Zero consecutive-failure pairs over ≥7 scheduled fires after fix. |
| suggested_fix_design | Root cause is model-level context construction at spawn time: the `always_load` promotion (mcp-tools.md) adds ~140 tokens of tool context to every session, but if the haiku model's context window is close to limit (e.g. large notebook file read at Step 0), the tail of always_load content can be truncated. Recommendation: (1) audit market-watcher notebook file size — if >200L, enforce ≤150L truncation rule; (2) move identity assertion to YAML `description` first-sentence (already done) AND to the flow's Step 0 as an explicit echo: `assert: I am market-watcher. I call tools via call_tool(server="vn-market")` — making identity self-check idempotent regardless of truncation. (3) agent-father to add notebook size guard to market-watcher cycle.md. |
| suggested_fix_owner | agent-father |
| suggested_fix_size | S |
| depends_on | — |

### ITEM-05 · market-watcher/cycle.md notebook Step 5 — append/overwrite discipline drift (Evidence: notebook audit 2026-05-19)

| Field | Value |
|---|---|
| id | ITEM-05 |
| surface | 2 — flow files |
| severity | MED |
| repro_or_evidence_pointer | agents-architect notebook 2026-05-19T04:50:00Z carry-over: "market-watcher/cycle.md Step 5 says 'APPEND ONLY' but canonical skill mandates overwrite — flow-level drift." The fix was flagged but not confirmed applied by agent-father (the carry-over note still exists unresolved in the architect notebook). |
| current_behaviour | market-watcher/cycle.md Step 5 tells the agent to append to its notebook. The canonical notebook-write skill mandates full overwrite (≤200L). If the agent appends, the notebook grows unbounded and the ≤200L cap is never enforced. Long notebooks increase context load each cycle — feeding ITEM-04 identity truncation risk. |
| expected_behaviour | cycle.md Step 5 says "overwrite notebook per skill: `.claude/skills/notebook-write/SKILL.md`". |
| suggested_fix_design | Agent-father edits market-watcher/cycle.md Step 5 to use OVERWRITE semantics and reference the notebook-write skill. Confirm in the same PR as ITEM-04 fix. |
| suggested_fix_owner | agent-father |
| suggested_fix_size | XS |
| depends_on | ITEM-04 (same PR) |

### ITEM-06 · Capability text vs execution truth — news-scout + market-watcher claim "all watchlist tickers" but cover ~5/34 (Evidence: 1965-COVERAGE-SWEEP)

| Field | Value |
|---|---|
| id | ITEM-06 |
| surface | 2 — flow files + 6 — agent defs |
| severity | MED |
| repro_or_evidence_pointer | DASHBOARD.md 1965-COVERAGE-SWEEP: "Observed: watchlist=34 tickers, recent 2 cowork cycles surfaced only 5/34 tickers (PC1/GAS/PLX/VIC/VPB). news-scout.md + market-watcher.md claim 'all watchlist tickers' in capabilities text." news-scout.md capabilities line 3: "Analyze sentiment and legal/crisis signals per ticker." market-watcher.md capabilities line 1: "Track HOSE/HNX/UPCOM prices every 15 min during market hours" — implies all, delivers event-reactive subset. |
| current_behaviour | Capability claims are documentation intent; flow execution is event-driven and reactive. No rotation/sweep mechanism exists. Quiet-period tickers can go weeks without analysis. |
| expected_behaviour | Capabilities text accurately describes what the flow actually does, OR a rotation sweep is added so the claim becomes true. |
| suggested_fix_design | Two parallel fixes: (A) immediate: update agent def capabilities text to say "reactive coverage of event-driven tickers" instead of implying full sweep; (B) follow-on (Sprint 1965-COVERAGE-SWEEP scope): add a quiet-ticker probe pass per cycle (e.g. market-watcher checks K lowest-coverage tickers each cycle regardless of sigma). Fix A is XS agent-father action. Fix B is a separate brief (1965-COVERAGE-SWEEP already open in DASHBOARD). |
| suggested_fix_owner | agent-father (Fix A) + agents-architect/PM for Fix B scoping |
| suggested_fix_size | XS (Fix A) / S (Fix B) |
| depends_on | — |

---

## Surface 3 — Dispatch Routing (Skill Table, Dispatcher-Wrap vs Self-Claim, Task-Lock)

### ITEM-07 · cowork-team dispatcher-wrap releases lock BEFORE spawn completes — premature slot unlock

| Field | Value |
|---|---|
| id | ITEM-07 |
| surface | 3 — dispatch routing |
| severity | HIGH |
| repro_or_evidence_pointer | cowork-team/main.md Step 5: "After each spawn attempt (success OR failure) — release lock immediately (try/finally)." The lock (TTL=900s) is released right after Agent() call returns (which is ~synchronous with spawn submission, NOT completion). cowork-team-20260521T183505Z and T185005Z both show drift_min=5 with alternating spawn/silent pattern every 15min — the same slot (`market-watcher-prepost`) fires at T163840Z, T170504Z, T173508Z, T180504Z, T183505Z, T185005Z but silent ticks (T165007Z, T172005Z, T175004Z, T182005Z) interleave correctly. However the lock release-before-complete means a second cowork-team tick arriving within 900s could re-claim the same slot if the spawned agent is still running. |
| current_behaviour | Lock is released immediately after Agent() spawn call, not after the spawned agent's cycle completes. This is correct by design (cowork-team Step 4.6 comment: "Model 1 — Master holds lock 900s TTL, agents do NOT heartbeat") but the nominal_tick key scoping means a new cowork-team tick 15min later generates a DIFFERENT key, making re-claim safe. However: if the node clock or CronCreate tick drifts by >15min (drift_min=5 today, could be larger), two ticks could share the same floor-15 nominal_tick and the premature release creates a re-claim window. |
| expected_behaviour | Within a single nominal_tick, no second claim can succeed. This is currently safe only because drift_min < 15. If drift_min ever reaches 15, the lock key collides across two ticks. |
| suggested_fix_design | Add a drift_min > 10 guard: if `drift_min >= 10`, send WORK warning "cowork-team fire-drift approaching collision threshold — investigate CronCreate schedule stability." This is purely observational (no spawn change). Structural fix: always use `datetime+floor-15` as lock key (already done) but document the 10-min warning threshold in the flow. |
| suggested_fix_owner | agent-father (cowork-team/main.md) |
| suggested_fix_size | XS |
| depends_on | — |

### Surface 3 — Clean surface note

Dispatch table coverage in `.claude/skills/dispatch/SKILL.md` was scanned. All 22 agent types map to a row in the dispatch table. No hidden `general-purpose` fallback was found. Dispatcher-wrap vs inner self-claim symmetry (Phase 3+4) was verified: 7 sites wired per task-lock Phase 4 records (1962c commits). No missing sites detected from this read-only scan.

---

## Surface 4 — Signal Bus + DASHBOARD (Race, Stale, Dedup, processed/ Migration)

### ITEM-08 · processed/ migration race — signals consumed by cowork-team Step 0a are marked READ but never pruned or moved to processed/

| Field | Value |
|---|---|
| id | ITEM-08 |
| surface | 4 — signal bus + DASHBOARD |
| severity | MED |
| repro_or_evidence_pointer | docs/signals/processed/ contains 11+ files from 2026-05-21. Live docs/signals/ contains cowork-team-20260521T183505Z.json, T185005Z.json, T190506Z.json — these are unprocessed telemetry signals from cowork-team itself. DASHBOARD.md row for 1963-MW-IDENTITY has status=DONE but the signal payload is still in the `## agent-father` section as a DONE row (not pruned). cowork-team/main.md Step 0a: "Mark each processed row NEW → READ" — it never moves the row to `processed/` section or deletes it. DASHBOARD grows unbounded over time. |
| current_behaviour | DASHBOARD.md rows transition NEW→READ but never get pruned unless po manually purges them each cycle. This creates a reader-scan cost growth: each cowork-team cycle reads an ever-larger DASHBOARD.md. Today the file has 70+ lines of historical rows (ops section alone has 15 rows). |
| expected_behaviour | DASHBOARD rows marked READ or DONE should be pruned by a periodic janitor (or by the same agent that marks them READ). |
| suggested_fix_design | Extend signal-dashboard skill's READ protocol: after reading + marking READ, rows with status=DONE or status=READ older than 48h are deleted from the DASHBOARD.md section. This is a 1-line prune rule in the skill. Sprint 1965 janitor (system-auditor 03:00Z cron) could also sweep DASHBOARD as dimension D5. |
| suggested_fix_owner | agent-father (signal-dashboard/SKILL.md edit) |
| suggested_fix_size | XS |
| depends_on | — |

### Surface 4 — Dedup coverage note

`post_agent_signal` has a 180-minute per-ticker dedup gate (visible in news-scout notebook cycles). This is confirmed working (VIC block-trade signal #3577 correctly deduplicated across cycles). No dedup gap found in the agent-bus layer. The only dedup gap is at the DASHBOARD row layer (ITEM-08 above).

---

## Surface 5 — Cron + Cowork Dispatcher (Overlap, Status=Crashed Re-fire, Fire-Drift)

### ITEM-09 · OBSERVE-1955d — crashed cron jobs do NOT re-fire: root cause is single weekly schedule window, not status guard

| Field | Value |
|---|---|
| id | ITEM-09 |
| surface | 5 — cron schedule |
| severity | HIGH |
| repro_or_evidence_pointer | SPRINT_GOAL.md E-2: "`vnstockTradingStatsRefresh` + `vnstockFundamentalsRefresh` crashed once on 2026-05-18, NEVER refired despite weekly schedule." Code audit: `cronJobRunStore.ts` `reapZombieJobRuns()` converts status=running→crashed at startup (no effect on job registration). Scheduler in `startScheduler.ts` uses `cron.schedule(CRONS.vnstockFundamentalsRefresh, ...)` — fresh registration, no prior-status check. The `crashed` status does NOT block re-fire at the scheduler level. |
| current_behaviour | `vnstockFundamentalsRefresh` fires Monday 01:00 UTC only (weekly cadence per scheduler comment line 904). It crashed on 2026-05-18 (Monday). The next scheduled fire is 2026-05-25 (Monday). There is no same-week retry mechanism. The OBSERVE-1955d conclusion "NEVER refired despite weekly schedule" is correct: the crashed status is NOT the blocker — the weekly schedule IS the blocker. The data will remain stale until 2026-05-25. |
| expected_behaviour | Either (a) a retry mechanism fires failed weekly jobs within 24h of first failure, or (b) the weekly schedule includes a mid-week catch-up window, or (c) system-auditor detects "job failed > N days ago, no re-fire pending" and alerts ops. |
| suggested_fix_design | Add a catch-up entry to `vnstockFundamentalsRefresh` + `vnstockTradingStatsRefresh` cron CRONS config: after a failure, system-auditor dimension D4 detects "last status=crashed/error AND next scheduled fire > 48h away" → sends WORK alert to ops for manual trigger. This is lighter than a full retry cron. Alternatively: change schedule from weekly to daily at off-peak time (01:00 UTC Mon-Fri) so crash impact is ≤24h. |
| suggested_fix_owner | dev-mcp-server (schedule change) + agent-father (system-auditor D4 extension) |
| suggested_fix_size | S |
| depends_on | — |

### ITEM-10 · Cowork dispatcher fire-drift sustained at drift_min=5 — structural skew in CronCreate tick vs slot window boundary

| Field | Value |
|---|---|
| id | ITEM-10 |
| surface | 5 — cron + cowork dispatcher |
| severity | MED |
| repro_or_evidence_pointer | All 9 cowork-team telemetry signals inspected (T043624Z through T190506Z) show drift_min=5 consistently. T163840Z shows drift_min=8 (one outlier). drift_min is defined as `actualUTCMinute - nominalTick` — a persistent drift of 5 means CronCreate ticks land at :05/:20/:35/:50 UTC rather than :00/:15/:30/:45. The fire-drift spike to 8 at T163840Z is 3min above baseline — within a single CronCreate cycle jitter window. |
| current_behaviour | Systematic 5-minute offset between CronCreate ticks and nominal :00/:15/:30/:45 boundaries. The nominal_tick rounding (floor-15min) compensates for this by design (architect brief 2026-05-18-spike-1951f-fire-drift-fix.md), so slot matching and lock keys are correct. However the sustained offset means: (a) cowork agents always fire 5min into their 15-min market window, losing 5min of cycle time; (b) the ±2min match window in cowork-match-slots.js may incorrectly miss or double-match under higher drift. |
| expected_behaviour | drift_min < 2 (near-zero jitter from CronCreate). Alternatively, document the sustained 5-min offset as a known CronCreate platform characteristic and confirm ±7min match window is safe (currently ±2min). |
| suggested_fix_design | (A) Confirm current match window (±2min) is wide enough for drift_min values seen (max 8): drift_min=8 → a slot at :00 fires at :08 → floor(:08/15)*15=:00, so match is correct. ±2min is actually the comparison window between actual fire minute and slot cron minute, not the drift window — recheck script logic. (B) If slot cron is `*/30` and fire is at :35, floor(:35/15)*15=:30, slot cron :30 matches :35 → delta=5, within ±2? Need to verify cowork-match-slots.js comparison. (C) Short-term: widen match window to ±7 in the script to absorb observed drift envelope safely. |
| suggested_fix_owner | dev-mcp-server (cowork-match-slots.js) |
| suggested_fix_size | XS |
| depends_on | — |

### ITEM-11 · `news-scout-market` + `market-watcher-market` + `alert-commander-market` slots have `trigger_error: API_MIN_INTERVAL` — slots are enabled but not firing via cowork dispatcher

| Field | Value |
|---|---|
| id | ITEM-11 |
| surface | 5 — cron + cowork dispatcher |
| severity | MED |
| repro_or_evidence_pointer | cowork-schedule.json: `news-scout-market` (cron `*/15 2-8 * * 1-5`), `market-watcher-market` (same), `alert-commander-market` (same), `market-watcher-prepost` (cron `*/30 * * * 1-5`) all have `"trigger_error": "API_MIN_INTERVAL: cron fires more than once/hour; API requires minimum 1h interval"` AND `"enabled": true`. The dispatcher (cowork-match-slots.js) reads `enabled && !_disabled_by` to filter slots. These slots are enabled but tagged with errors — they may still be evaluated by the matcher and produce spurious matches. |
| current_behaviour | Telemetry shows only `market-watcher-prepost` is being matched and spawned during the 16:00-19:00 UTC window (where prepost fires). The `market-watcher-market` slot (cron `*/15 2-8`) would not match during this window anyway. The `trigger_error` field is annotation-only — it does not disable the slot. If market hours ticks ever run, `market-watcher-market` and `news-scout-market` would double-match with their prepost counterparts for the same agent_id, triggering the collision-detection guard (Step 4b WARN). |
| expected_behaviour | Slots with `trigger_error` that cannot be fired via RemoteTrigger (API_MIN_INTERVAL) should be either (a) marked `"enabled": false` explicitly, or (b) given a `_disabled_by` note. They are dead registry entries causing schema drift. |
| suggested_fix_design | For each slot with `trigger_error: API_MIN_INTERVAL`: set `"enabled": false` and add `"_disabled_by": "API_MIN_INTERVAL — cowork master dispatcher (*/15 CronCreate) owns sub-hourly firing instead"`. This removes them from the matcher's candidate pool. No behaviour change — they were already not fired — but eliminates collision-guard false positives during market hours. |
| suggested_fix_owner | agent-father (cowork-schedule.json edit) |
| suggested_fix_size | XS |
| depends_on | — |

---

## Surface 6 — Agent Definitions (Capability Drift, always_load Discipline, Identity Stanza)

### ITEM-12 · alert-commander `mcp-tools.md` lazy-loaded with `trigger: startup` not `always_load` — identity/tool confusion risk

| Field | Value |
|---|---|
| id | ITEM-12 |
| surface | 6 — agent defs |
| severity | MED |
| repro_or_evidence_pointer | `.claude/agents/alert-commander.md` knowledge section: `lazy_load: path: docs/standards/mcp-tools.md, trigger: startup, fail_loud: true`. market-watcher fixed (ITEM-04 upstream): `mcp-tools.md` promoted to `always_load`. alert-commander still has `trigger: startup` — which per the waterfall lazy-load policy is deprecated (`"no trigger: startup"`). market-watcher's identity failure (1963-MW-IDENTITY) was traced partly to mcp-tools.md being lazy-loaded, creating a window where the agent started without tool context. alert-commander runs on haiku (actually sonnet per frontmatter — confirmed). |
| current_behaviour | alert-commander loads mcp-tools.md only on `startup` trigger, which is non-deterministic in lazy-load semantics. If the trigger condition is not met (e.g. the agent skips Step 0 bootstrap due to error), mcp-tools.md is never loaded. |
| expected_behaviour | `mcp-tools.md` is `always_load` for all cowork agents that call MCP tools — consistent with the market-watcher fix policy. |
| suggested_fix_design | Promote alert-commander's `mcp-tools.md` from `lazy_load(trigger: startup)` to `always_load` — same pattern applied to market-watcher. Also remove `trigger: startup` from news-scout's `agent-roster.md` and `GLOSSARY_VI.md` lazy loads (both are `trigger: startup` — audit needed). |
| suggested_fix_owner | agent-father |
| suggested_fix_size | XS |
| depends_on | — |

### ITEM-13 · Recurring-bug-escalation freeze policy effectiveness: 1954c BLOCKED while ≥3 parallel sprints proceed

| Field | Value |
|---|---|
| id | ITEM-13 |
| surface | 6 — agent defs + policy / orchestration |
| severity | MED |
| repro_or_evidence_pointer | SPRINT_GOAL.md E-7: "BCTC freeze in force since 1954c gate; multiple sprints (1965, 1959, 1967) running in parallel while 1954c sits BLOCKED." DASHBOARD.md 1953-G-FAIL row: "DO-NOT-DISPATCH 1953e/h — recurring-bug-escalation freeze." The freeze correctly blocks new BCTC work, but the policy has no time-bound review gate — 1954c remains blocked indefinitely without a scheduled architect review cadence. |
| current_behaviour | The freeze policy blocks BCTC-path work (correct) but has no automatic escalation if 1954c remains blocked beyond N days. 1954c has been blocked since 2026-05-19 (2+ days). Parallel sprints proceed safely in non-BCTC zones. The freeze policy IS working as intended — it IS preventing new BCTC code changes. The gap is absence of a review-trigger cadence. |
| expected_behaviour | recurring-bug-escalation freeze should include a review-date gate: "if freeze persists > 72h, PO + architect schedule a review session." This prevents indefinite freeze without resolution. |
| suggested_fix_design | Add to the recurring-bug-escalation policy (wherever it is defined — likely `.claude/skills/dispatch/SKILL.md` or `docs/policies/dev-standards.md`): "Freeze timeout: if same module frozen > 72h, system-auditor emits a `freeze-timeout` DASHBOARD alert to po section." PO then either extends the freeze (with a new timeout) or dispatches architect review. Lightweight: adds one audit check to system-auditor D5, zero code changes. |
| suggested_fix_owner | agent-father (policy doc edit) + dev-mcp-server (system-auditor D5 check) |
| suggested_fix_size | XS (policy) + XS (audit check) |
| depends_on | — |

### Surface 6 — Clean surface notes

- **always_load discipline:** market-watcher.md post-fix has `mcp-tools.md` as always_load. news-scout.md has `mcp-tools.md` as always_load. agent-roster.md and GLOSSARY_VI.md carry `trigger: startup` (deprecated) in news-scout — MED risk only (not identity-critical tools). ITEM-12 covers the critical case (alert-commander).
- **identity stanza completeness:** market-watcher.md has `identity_role`, `mcp_tool_available`, `no_self_abort`, `write_tool_available` — all present post-fix. news-scout.md and alert-commander.md do NOT have `identity_role` or `mcp_tool_available` fields. LOW risk for alert-commander (runs on sonnet, less prone to identity confusion). MED risk for news-scout (haiku).

---

## Summary Table

| ID | Surface | Severity | Fix Owner | Fix Size | Depends |
|---|---|---|---|---|---|
| ITEM-01 | 1 — inter-agent comms (alertSource enum) | HIGH | dev-mcp-server | XS | — |
| ITEM-02 | 1 — inter-agent comms (verified_decision schema) | HIGH | dev-mcp-server + agent-father | S | — |
| ITEM-03 | 1 — inter-agent comms (DASHBOARD stale race) | HIGH | agent-father | XS | — |
| ITEM-04 | 2 — flow files (market-watcher identity recurrence) | HIGH | agent-father | S | — |
| ITEM-05 | 2 — flow files (cycle.md append/overwrite drift) | MED | agent-father | XS | ITEM-04 |
| ITEM-06 | 2/6 — capability text vs execution (coverage claim) | MED | agent-father + PM | XS/S | — |
| ITEM-07 | 3 — dispatch (cowork lock release timing) | HIGH | agent-father | XS | — |
| ITEM-08 | 4 — signal bus (DASHBOARD unbounded growth) | MED | agent-father | XS | — |
| ITEM-09 | 5 — cron (weekly crash no re-fire) | HIGH | dev-mcp-server + agent-father | S | — |
| ITEM-10 | 5 — cron (fire-drift sustained 5min) | MED | dev-mcp-server | XS | — |
| ITEM-11 | 5 — cron (API_MIN_INTERVAL dead slots enabled) | MED | agent-father | XS | — |
| ITEM-12 | 6 — agent defs (alert-commander mcp-tools.md lazy) | MED | agent-father | XS | — |
| ITEM-13 | 6 — policy (recurring-bug freeze timeout absent) | MED | agent-father + dev-mcp-server | XS+XS | — |

**Confirmed CRIT:** 0 | **HIGH:** 5 (ITEM-01,02,03,04,07,09) | **MED:** 7 (ITEM-05,06,08,10,11,12,13)

---

## Gate Decision Recommendation

Per SPRINT_GOAL §Gate decision: all items are HIGH (no CRIT with live outage risk). Per gate rule: "all HIGH/MED → PM queues against current WIP, dispatch post-2026-05-23T18:00Z (1965c soak end)."

Exception: ITEM-01 (alertSource enum gap) and ITEM-09 (weekly cron no re-fire) warrant elevated urgency — data corruption and data staleness respectively. Recommend PM schedule ITEM-01 + ITEM-09 + ITEM-04 as priority batch for first sprint after 1965c soak. All others can batch into a second clean-up sprint.

---

## AC Cross-Check

- AC-1 (BA gate): Skipped per dispatch slate — 1967a was dispatched directly without BA gate (PO approved direct architect scan). REQ_1967.md not required per kickoff signal.
- AC-2: This brief. ≤600L. Each item has all required fields. ≥5 items (13 delivered). "No findings" explicitly stated per clean sub-surface.
- AC-7: Cross-links to 1963-MW-IDENTITY (ITEM-04), OBSERVE-1955d (ITEM-09), 1962-B-01 (ITEM-03), 1964-AC-ENUM (ITEM-01+ITEM-02), 1965-COVERAGE-SWEEP (ITEM-06), cowork-team-20260521T185005Z drift (ITEM-10), recurring-bug-freeze (ITEM-13). All 7 seed evidence rows covered.
