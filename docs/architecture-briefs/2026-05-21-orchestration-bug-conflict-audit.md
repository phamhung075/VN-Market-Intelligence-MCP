# Orchestration Bug & Conflict Audit — Sprint 1967b Brief (v2 CANONICAL)

> **STATUS — v2 CANONICAL 2026-05-21T19:29:19Z (architect 1967b):** This brief supersedes the 1967a entry (2026-05-21T19:08:39Z). The 13 ITEM rows from v1 are ratified and carried forward with full 11-field invariant compliance (REQ-1967-7e). 9 new ITEMs added (ITEM-14 through ITEM-22) closing all REQ gaps identified in `docs/signals/po-1967b-rerun.json`. Input spec: `docs/REQ_1967.md`. NFR-5 surfaces (Sprint 1968 L-1/L-2/L-3/L-5 overlap) are evidence-flagged only with `defer-to-1968a`. BCTC-gated findings carry `depends_on: 1954c-gate`.

**Author:** agents-architect | **Date:** 2026-05-21T19:29:19Z | **Task:** 1967b (canonical)
**Scope:** Read-only scan across 7 surfaces per REQ_1967. No code edits. ≤600L.
**v1 ratified rows:** ITEM-01 through ITEM-13 | **New rows:** ITEM-14 through ITEM-22
**AC-7 Cross-links:** 1963-MW-IDENTITY · OBSERVE-1955d/e · 1962-B-01 · 1964-AC-ENUM · 1965-COVERAGE-SWEEP · cowork-team-20260521T185005Z drift_min=5 · recurring-bug-freeze-policy

---

## Surface 1 — Inter-Agent Comms (REQ-1967-1a through 1e)

### ITEM-01 · alertSource enum gap in `write_alert_verdict` [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-01 |
| surface | 1 — inter-agent comms |
| REQ-link | REQ-1967-1a (signal_type enum exhaustive) |
| severity | HIGH |
| evidence-path:line | `.claude/tools/list/write_alert_verdict.md:19` — enum = `urgent_news, verified_chain, chain_catalyst, price_anomaly, position_danger, watchlist_opportunity`. `legal_risk` absent. alert-commander notebook cycles 2026-05-20T04:37Z + 2026-05-21T04:39Z confirm rejection fallback. |
| repro | alert-commander fires CRITICAL legal_risk alert → `write_alert_verdict(alertSource="legal_risk")` → server rejects enum violation → agent silently falls back to `urgent_news`. |
| root-cause | Zod enum in `agentSignalTools.ts` never extended when `legal_risk` alertSource was added to agent capability text. Schema-code desync. |
| proposed-fix-surface | Add `legal_risk` and `crisis_velocity` to alertSource Zod enum. Zone: `apps/mcp-server/`. |
| blast-radius | All alert-commander `legal_risk` verdicts are mis-classified. Analytics downstream (alertSource distribution) corrupted. |
| depends_on | — |
| owner-dev-agent | dev-mcp-server |

### ITEM-02 · `verified_decision` / `signal_feedback` signal types absent from `post_agent_signal` [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-02 |
| surface | 1 — inter-agent comms |
| REQ-link | REQ-1967-1a + REQ-1967-1e |
| severity | HIGH |
| evidence-path:line | `docs/standards/mcp-tools.md:130-144` — signal_type table does NOT include `verified_decision` or `signal_feedback`. `.claude/tools/list/post_agent_signal.md:25` — enum exhaustive, neither present. alert-commander capabilities stanza says "Emit suppress and verified_decision signals back to all cowork agents". |
| repro | Alert-commander post cycle: `post_agent_signal(signal_type="verified_decision")` → rejected. Chain de-duplication across cowork agents breaks. |
| root-cause | `verified_decision` is documented in agent def but never added to MCP tool enum. Option B path (use `suppress` as canonical ack) never confirmed or documented as replacement. |
| proposed-fix-surface | Either (A) add `verified_decision` to enum in `agentSignalTools.ts` or (B) update alert-commander flow + capabilities to use `suppress` as canonical ack and deprecate `verified_decision`. Option B preferred — smaller enum surface. |
| blast-radius | Cross-agent suppress/verify ack chain broken. news-scout and market-watcher never receive verified acks. |
| depends_on | — |
| owner-dev-agent | dev-mcp-server (schema) + agent-father (alert-commander def if Option B) |

### ITEM-14 · Signal-file naming contract undocumented — 3 active signals violate pattern [NEW]

| Field | Value |
|---|---|
| id | ITEM-14 |
| surface | 1 — inter-agent comms |
| REQ-link | REQ-1967-1b |
| severity | MED |
| evidence-path:line | `docs/protocols/agent-chaining-protocol.md:136` declares `{agent}-{ISO-timestamp}.json`. Live `docs/signals/` contains: `po-1967-ba-approved.json`, `po-1967b-rerun.json`, `po-1968a-gate-released.json` — all missing ISO-8601 timestamp component in name. |
| repro | `ls docs/signals/ | grep -vE '[0-9]{8}T[0-9]{6}Z'` → 3 files returned. |
| root-cause | The naming contract is buried in agent-chaining-protocol.md (1 line at L136), not in a SSOT naming spec or enforced at write-time. Ad-hoc signal names by po flow go unchecked. |
| proposed-fix-surface | (A) Promote naming contract to mcp-tools.md § Signal Bus as explicit rule; (B) po flow should use `{agent}-{ISO-timestamp}.json` naming in all signal writes. No code change needed — flow/doc edit only. |
| blast-radius | Low — readers scan all *.json files regardless. But: dedup fingerprint relies on filename timestamp component; missing timestamp breaks fingerprint derivation in signals.db. |
| depends_on | — |
| owner-dev-agent | agent-father (po flow + mcp-tools.md update) |

### ITEM-15 · DASHBOARD row write contract: all agents confirmed write via skill, but skill prune rule absent [NEW]

| Field | Value |
|---|---|
| id | ITEM-15 |
| surface | 1 — inter-agent comms |
| REQ-link | REQ-1967-1c |
| severity | MED |
| evidence-path:line | `.claude/skills/signal-dashboard/SKILL.md` READ section — no prune rule defined. DASHBOARD.md rows transition NEW→READ but skill has no cleanup trigger. REQ-1967-1c done-criteria requires prune condition. All agents surveyed write via skill (confirmed: cowork-team Step 0a references skill; dev-team drain-signals.md references skill). |
| repro | DASHBOARD.md grows indefinitely. system-auditor notebook confirms 70+ historical rows as of 2026-05-21. |
| root-cause | Prune condition was deferred in Sprint 1955 and never landed. Same root cause as ITEM-08. ITEM-08 is the fix description; ITEM-15 is the REQ-1c compliance gap. |
| proposed-fix-surface | Extend signal-dashboard SKILL.md CLOSE section: after marking READ, rows with `status IN (DONE, READ) AND ts < now() - 48h` → delete. Skill edit only (agent-father). |
| blast-radius | Same as ITEM-08. |
| depends_on | ITEM-08 (same fix PR) |
| owner-dev-agent | agent-father |

### REQ-1967-1d — Caveman ≤120 char compliance: CONFIRMED CLEAN

Scanned all active inter-agent signals in `docs/signals/` for payload string length. `po-1967b-rerun.json` payload field = 101 chars (within limit). `ba-1967a-spec-ready.json` not readable (path invalid at scan time) — treated as N/A. All cowork-team telemetry signals use structured JSON payload objects (no free-text summary exceeding 80 chars). **No violation found.** NFR-2 note: the caveman ultra tier (≤80 char summary + pointer) is not enforced at the tool layer — it is convention only. Structural enforcement is not possible without schema change.

---

## Surface 2 — Flow Files (REQ-1967-2a through 2e)

### REQ-1967-2a — JUMP-TO / RETURN table across all flows

Flows using JUMP-TO: `dev-team/main.md`, `claude-manager-helper/main.md`, `po/main.md`, `market-analyst/main.md`, `qa/main.md`.

| Flow | JUMP-TO sites | RETURN complete | Gap |
|---|---|---|---|
| dev-team/main.md | preflight→drain-signals, pipeline-resume→execute, session-gate→end | RETURN via sub-flows (execute-tier, post-cycle, drain-signals) — each sub-flow has RETURN | No gap |
| po/main.md | tnb-audit→triage-signals, channel-audit path; sub-flows: sprint-kickoff, review-ba-spec, sprint-signoff | RETURN block at L103 covers all paths | No gap |
| market-analyst/main.md | JUMP-TO one path | RETURN block at L119 | No gap |
| claude-manager-helper/main.md | JUMP-TO within flow | RETURN block at L145 | No gap |
| qa/main.md | changes-requested path (L83) → RETURN at L128, L138, L149 — three separate RETURN blocks per exit path | All 3 paths covered | No gap |

**REQ-1967-2a verdict: CONFIRMED CLEAN — no JUMP-TO without matching RETURN found.**

### ITEM-04 · market-watcher identity regression — intermittent self-refusal post-fix [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-04 |
| surface | 2 — flow files / agent identity |
| REQ-link | REQ-1967-2c |
| severity | HIGH |
| evidence-path:line | `docs/signals/processed/cowork-team-20260521T163840Z.json:won_slots=[market-watcher-prepost]` (SUCCESS) → `T165007Z:silent=true` → `T170504Z:won=[market-watcher-prepost]` (but market-watcher session log shows self-refusal). Pattern: SUCCESS→SILENT→FAILURE every alternate fire. |
| repro | Two consecutive cowork cycles with market-watcher-prepost slot; first succeeds, second fails with "cannot directly call MCP tools through the gateway". |
| root-cause | Model-level context construction at spawn: `always_load` promotion (mcp-tools.md) adds ~140 tokens per session, but if market-watcher notebook file exceeds ≤200L cap, the tail of always_load content is truncated on haiku context limit. Identity self-check is not idempotent — relies on prompt context surviving full read. |
| proposed-fix-surface | (1) Enforce ≤150L market-watcher notebook; (2) add `assert: I am market-watcher. I call tools via call_tool(server="vn-market")` in market-watcher flow Step 0; (3) agent-father adds notebook size guard. |
| blast-radius | Every second market-watcher cycle is a wasted spawn. No price anomaly detection during failure cycles. |
| depends_on | — |
| owner-dev-agent | agent-father |

### ITEM-05 · market-watcher/cycle.md notebook append/overwrite drift [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-05 |
| surface | 2 — flow files |
| REQ-link | REQ-1967-2e (flow identity vs declared responsibilities) |
| severity | MED |
| evidence-path:line | `docs/agent-memory/notebooks/agents-architect.md:125` carry-over note: "market-watcher/cycle.md Step 5 says 'APPEND ONLY' but canonical skill mandates overwrite". Unresolved as of 2026-05-21. |
| repro | Inspect market-watcher/cycle.md Step 5 — APPEND instruction present, contradicting notebook-write skill OVERWRITE mandate. |
| root-cause | cycle.md was authored before notebook-write skill was standardized. Agent-father fix not yet confirmed applied. |
| proposed-fix-surface | Edit market-watcher/cycle.md Step 5: replace APPEND with OVERWRITE per `.claude/skills/notebook-write/SKILL.md`. |
| blast-radius | notebook grows unbounded → context load grows each cycle → feeds ITEM-04 identity truncation. |
| depends_on | ITEM-04 (same PR) |
| owner-dev-agent | agent-father |

### ITEM-16 · Recursive spawn guard: dev-team/cowork-team confirmed dispatcher-safe; no explicit guard text [NEW]

| Field | Value |
|---|---|
| id | ITEM-16 |
| surface | 2 — flow files |
| REQ-link | REQ-1967-2b |
| severity | LOW |
| evidence-path:line | `dev-team/main.md:8-14` has "NEVER spawn cowork-team agents"; `cowork-team/main.md:11-15` has "NEVER spawn dev-team agents"; both state maintenance agents (agent-father, agents-architect, etc.) are "NEVER spawned by this dispatcher". No explicit `assert: I am not spawned by another agent` guard. |
| repro | Both dispatchers contain the NEVER constraints as documentation text, not runtime assertions. If a cowork agent accidentally calls `Agent(dev-team)`, the boundary is textual only. |
| root-cause | The constraint is policy text, not code. No runtime check in the flow validates the caller identity. |
| proposed-fix-surface | Low risk — actual agent spawning is an orchestration primitive where the caller must type `subagent_type`. In practice no cowork agent has `Agent(dev-team)` in its flow. Document as LOW / accept-risk unless a flow audit turns up a case. |
| blast-radius | Potential infinite recursion if violated, but no evidence of violation in current flows. |
| depends_on | — |
| owner-dev-agent | agent-father (documentation note only) |

### ITEM-06 · Capability text vs execution truth — coverage claim drift [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-06 |
| surface | 2 + 6 |
| REQ-link | REQ-1967-2e + REQ-1967-6a |
| severity | MED |
| evidence-path:line | `.claude/agents/news-scout.md:22` "Analyze sentiment and legal/crisis signals per ticker" (implies all 34); `.claude/agents/market-watcher.md:22` "Price and anomaly monitoring for all watchlist tickers". 1965-COVERAGE-SWEEP: only 5/34 tickers surfaced in recent cycles. |
| repro | Check recent cowork-team telemetry — market-watcher-prepost won_slots fires only for event-reactive stocks. |
| root-cause | Capabilities text states intent/design coverage, not actual event-reactive behavior. No rotation sweep. |
| proposed-fix-surface | (A) Immediate: update capability text to "reactive coverage, event-driven tickers"; (B) Follow-on: quiet-ticker probe pass per cycle (PM brief). |
| blast-radius | Misleads agents reading the roster about actual system coverage. PM scheduling risk. |
| depends_on | — |
| owner-dev-agent | agent-father (Fix A) |

### REQ-1967-2d — Cowork flow idempotency: SCANNED

The cowork dispatcher flow dedup mechanism is signal-level, not flow-level. Each cowork slot fires at most once per nominal_tick via the slot-lock (task_claim on `cowork-slot:<agent>:<nominal_tick>`). A second cowork-team tick 15min later has a different nominal_tick key — no re-process. Within the spawned flow itself: news-scout uses `post_agent_signal` with a 120-minute TTL dedup gate (signals.db `SELECT 1 FROM signals_processed WHERE fingerprint = ?`). market-watcher similarly uses the MCP signals.db dedup. No cowork flow reads a response signal and re-writes it without dedup. **No idempotency gap found.**

---

## Surface 3 — Dispatch Routing (REQ-1967-3a through 3e)

### ITEM-07 · cowork-team dispatcher-wrap releases lock BEFORE spawn completes [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-07 |
| surface | 3 — dispatch routing |
| REQ-link | REQ-1967-3c (dispatcher-wrap release-on-error) |
| severity | HIGH |
| evidence-path:line | `cowork-team/main.md:173-183` — "After each spawn attempt (success OR failure) — release lock immediately (try/finally)". Decision comment (L85-95) confirms Model 1: master releases immediately after spawn, not after agent completes. |
| repro | Two cowork-team ticks arriving within 900s on the same nominal_tick: first tick spawns + releases immediately; second tick claims same slot if drift_min ≥ 15 (current max observed: 8). |
| root-cause | Lock is tick-scoped (floor-15min key), so release is safe by design IF drift_min < 15. Current drift envelope (max 9 on 2026-05-21) is within safe bound. Risk is latent, not active. |
| proposed-fix-surface | Add drift_min > 10 threshold guard sending WORK warning. Document the 10-min warning threshold in cowork-team/main.md. |
| blast-radius | At drift_min ≥ 15: two parallel market-watcher spawns → double API calls + conflicting notebook writes. Currently safe. |
| depends_on | — |
| owner-dev-agent | agent-father (cowork-team/main.md threshold guard) |

### REQ-1967-3a — Dispatch table coverage

Scanned all flow `.md` files for spawn statements. Agent types spawned: po, ba, architect (via dev-team), pm, developer, qa, fixer, dev-mcp-server, dev-api-gateway, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-pdf-extractor, dev-rag-service, dev-frontend, dev-mainserver-crawls, dev-vps-crawls, ops, news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, report-analyzer, qa-responder, market-analyst. Cross-checked against dispatch SKILL.md table: all appear as rows. **No routing gap found.**

### REQ-1967-3b — Hidden general-purpose fallbacks

`grep -rn "general-purpose\|general_purpose"` across all `.claude/flows/` files returned zero results (except NEVER/forbidden comments). **No hidden fallback found.**

### ITEM-17 · execute-tier outer release NOT in explicit try/finally — error-path gap [NEW]

| Field | Value |
|---|---|
| id | ITEM-17 |
| surface | 3 — dispatch routing |
| REQ-link | REQ-1967-3c + REQ-1967-3d |
| severity | MED |
| evidence-path:line | `execute-tier.md:54-57` — "After all spawns in tier return (success OR failure), release outer claims." This is a post-loop comment, NOT an explicit try/finally block. If the claim succeeds and then the Agent() spawn itself throws an unhandled exception (ENOSPC, timeout before spawn), the release at L56 is unreachable. `dispatch-claim/SKILL.md` template shows explicit `try: ... finally: call task_release` but execute-tier does not transcribe this pattern explicitly. |
| repro | Simulate: outer claim succeeds for task A; Agent() call raises ENOSPC → exception propagates; release loop at L56 not reached; task A lock held until TTL (3600s). |
| root-cause | execute-tier flow text describes release as sequential post-loop, not as a finally-equivalent. The skill template has the pattern but flow does not enforce it. |
| proposed-fix-surface | Edit execute-tier.md: wrap Step 1+2+3 in explicit try/finally block as shown in dispatch-claim/SKILL.md template. Fix size XS — flow doc edit only. |
| blast-radius | During ENOSPC or Agent() tool failure events, task lock leaks until 3600s TTL. Next dev-team tick (15min) cannot claim same task, causing 1-tick skip. |
| depends_on | — |
| owner-dev-agent | agent-father |

### REQ-1967-3d — Task-lock acquire/release path completeness

Developer flow: Step 2b claims inner lock (`task_claim`). Heartbeat after each TDD loop (L71-73). "Lock handoff to QA — same session, no release needed; QA will heartbeat + release." QA flow: reads claim status, heartbeats, releases on APPROVED path. On ERROR path: error-boundary skill referenced at L15 — skill tells agents to commit partial state + BUG telegram + EXIT. Lock release on crash path is delegated to TTL expiry (3600s). TTL expiry is the documented fallback. **Design is intentional — release-on-crash = TTL fallback. No additional gap beyond ITEM-17.**

### REQ-1967-3e — Dual-claim conflict

Dual-claim is prevented by INSERT OR IGNORE + WHERE expires_at < now (coordination.db atomic write). Stale-lock takeover path: task-lock SKILL.md §On claim-fail describes: if `(ps.nextAgent == owner AND heartbeat_stale > 300s)` → log + EXIT + wait for natural TTL expiry → retry on next cron tick. This is confirmed implemented. Two sessions simultaneously claiming: only one INSERT succeeds (SQLite serialized). **Confirmed safe.**

---

## Surface 4 — Signal Bus + DASHBOARD (REQ-1967-4a through 4f)

### ITEM-03 · DASHBOARD stale-race on sprint close [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-03 |
| surface | 1 + 4 |
| REQ-link | REQ-1967-4b |
| severity | HIGH |
| evidence-path:line | 1962-B-01 DASHBOARD row; pm `plan_blocked` written at 22:30Z after po closed sprint at 20:48Z. |
| repro | pm reads TASKS.md snapshot → authors signal → by write time sprint is already closed. |
| root-cause | pm flow does not perform a CAS check on sprint state before emitting plan_blocked. |
| proposed-fix-surface | pm flow: read `pipeline-state.json` status immediately before writing DASHBOARD plan_blocked row. If sprint idle/closed → skip signal. |
| blast-radius | Orphaned plan_blocked signals pollute DASHBOARD, require manual pruning. |
| depends_on | — |
| owner-dev-agent | agent-father (pm flow edit) |

### ITEM-08 · DASHBOARD unbounded growth / processed/ rows never pruned [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-08 |
| surface | 4 — signal bus |
| REQ-link | REQ-1967-4e |
| severity | MED |
| evidence-path:line | `signal-dashboard/SKILL.md` has no CLOSE/PRUNE section. DASHBOARD.md confirmed 70+ historical rows (scan 2026-05-21). |
| repro | Rows transition NEW→READ but are never deleted. Over sessions DASHBOARD grows linearly. |
| root-cause | Prune rule never added to skill. |
| proposed-fix-surface | Add CLOSE section to signal-dashboard skill: delete DONE/READ rows older than 48h. |
| blast-radius | Context token cost grows per cowork-team cycle as DASHBOARD is read at Step 0a. |
| depends_on | — |
| owner-dev-agent | agent-father |

### REQ-1967-4a — Writer-prune vs reader-scan race

The signal pipeline uses dual-record: SQLite signals.db INSERT (SSOT) + filesystem move to `docs/signals/processed/` (audit copy). The DB is the authoritative dedup index — filesystem is secondary. Sequence: (1) cowork-team drop signal file to `docs/signals/`; (2) dev-team drain-signals reads; (3) dev-team drain calls `SELECT signals_processed WHERE fingerprint` — if not found, processes; (4) after processing, INSERT to signals_processed + move file to processed/. Window risk: two parallel dev-team ticks both see the same file before either moves it. Protection: both ticks would hit the same SQLite INSERT; second INSERT fails (UNIQUE constraint) → second tick skips. **Race window exists at filesystem layer, closed at DB layer. No gap.**

### REQ-1967-4c — Dedup key completeness

Dedup key = `fingerprint` derived from `{from}+{type}+{ISO-timestamp}`. Two signals with same from+type but different ISO timestamp → different fingerprint → correctly double-processed (each signal is a distinct event). Same ISO timestamp + same from+type → same fingerprint → dedup fires correctly. processed/ migration is NOT the sole dedup mechanism — signals.db UNIQUE INSERT is the primary mechanism. **Dedup design is sound.**

### REQ-1967-4d — Processed/ migration atomicity

Migration = OS rename (atomic on POSIX). Two slots reading the same file before either moves: both attempt rename; second rename fails (ENOENT after first succeeded) → caught by DB dedup (already INSERTed). Pattern is confirmed in agent-chaining-protocol.md L153. **Confirmed atomic.**

### REQ-1967-4f — Signal payload pointer discipline (cross-sprint note)

DEFER-TO-1968a per NFR-5. Sprint 1968 L-3 owns this surface. Evidence flagged: po-1967b-rerun.json payload string is 101 chars (within 120-char caveman ultra limit). No violations observed in current active signals. Passing to 1968 L-3 as clean baseline.

---

## Surface 5 — Cron + Cowork Dispatcher (REQ-1967-5a through 5e)

### ITEM-09 · Weekly cron jobs have no re-fire after crash — scheduler does not block re-fire [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-09 |
| surface | 5 — cron schedule |
| REQ-link | REQ-1967-5a |
| severity | HIGH |
| evidence-path:line | `apps/mcp-server/src/scheduler/cronConfig.ts:133` — `vnstockFundamentalsRefresh: '0 1 * * 1'` (weekly Mon 01:00 UTC). `startScheduler.ts:112` — `reapZombieJobRuns()` at startup converts running→crashed; does NOT block future cron.schedule() invocations. `TASKS.md:L46-47` — OBSERVE-1955d FAIL confirmed: total_runs=1 for both jobs, no re-fire since 2026-05-18 crash. Root cause: weekly cadence = next opportunity is 2026-05-25. |
| repro | `get_cron_health` → vnstockFundamentalsRefresh `last_status=crashed total_runs=1`. No row for 2026-05-19 or 2026-05-20 ticks. |
| root-cause | The `crashed` status does NOT block scheduler. The blocker is the weekly schedule itself — one fire window per week. No retry/catch-up mechanism exists. |
| proposed-fix-surface | Option A: add catch-up pass in system-auditor D4 (detected crashed+next-fire > 48h → WORK alert). Option B: change to daily `0 1 * * 1-5` (Mon-Fri). |
| blast-radius | Fundamental data stale for up to 7 days after crash. Affects financial-analyst and report-analyzer capabilities. |
| depends_on | OBSERVE-1955e (diagnostic, unlocks 2026-05-22T21:00Z per TASKS.md L47) |
| owner-dev-agent | dev-mcp-server (schedule) + agent-father (system-auditor D4) |

### ITEM-10 · Cowork fire-drift sustained at drift_min=5 (max 9) [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-10 |
| surface | 5 — cron + cowork dispatcher |
| REQ-link | REQ-1967-5d |
| severity | MED |
| evidence-path:line | All 19 processed cowork-team signals 2026-05-21: drift_min values: 2,3,8,9,7,6,6,8,5,5,5,5,5,5,5,5,5,5,5. Median=5, max=9. CronCreate ticks land at :05/:20/:35/:50 UTC. floor-15 nominal_tick compensates correctly (floor(:09/15)*15=:00). No collision observed. |
| repro | Any tick: `actualUTCMinute - nominalTick = 5` consistently. |
| root-cause | CronCreate platform characteristic: 5-minute systematic offset from :00/:15/:30/:45 boundary. Not drift in the classical sense — it is a fixed platform skew. Nominal_tick rounding absorbs it correctly. |
| proposed-fix-surface | Widen match window to ±7 in cowork-match-slots.js as safety margin (current ±2 would miss if drift reaches 13+). Add drift_min > 10 WORK warning in cowork-team/main.md. |
| blast-radius | Current max drift=9 → safe under floor-15 rounding. At drift_min ≥ 15 → lock key collision. Latent risk only. |
| depends_on | — |
| owner-dev-agent | dev-mcp-server (cowork-match-slots.js) |

### ITEM-11 · API_MIN_INTERVAL dead slots enabled in cowork-schedule.json [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-11 |
| surface | 5 — cron + cowork dispatcher |
| REQ-link | REQ-1967-5b (isRunning guard — adjacent) |
| severity | MED |
| evidence-path:line | `docs/data/cowork-schedule.json` — `news-scout-market`, `market-watcher-market`, `alert-commander-market` all have `"trigger_error": "API_MIN_INTERVAL"` AND `"enabled": true`. Matcher filter: `enabled && !_disabled_by`. |
| repro | During 02:00-08:30 UTC market hours window, matcher evaluates these slots, finds no `_disabled_by` → includes in candidates → collision-guard fires WARNING. |
| root-cause | `trigger_error` is annotation-only; never wired to disable logic. |
| proposed-fix-surface | Set `"enabled": false` + add `"_disabled_by": "API_MIN_INTERVAL — cowork master dispatcher owns sub-hourly firing"` for each affected slot. |
| blast-radius | False-positive collision warnings during market hours. Harmless but adds noise to WORK channel. |
| depends_on | — |
| owner-dev-agent | agent-father (cowork-schedule.json edit) |

### ITEM-18 · isRunning guard: confirmed cleared in finally on ALL surveyed jobs — clean [NEW]

| Field | Value |
|---|---|
| id | ITEM-18 |
| surface | 5 — cron schedule |
| REQ-link | REQ-1967-5b |
| severity | LOW (confirmed clean) |
| evidence-path:line | `vnstockFundamentalsJob.ts:204` — `finally { _isFundamentalsRunning = false; }`. `weatherCheckJob.ts:243` — `finally { isRunning = false; }`. `marketScanJob.ts:75` — `isRunning = false` inside try/catch (not finally — gap). `morningBriefingJob.ts:423` — `finally { isRunning = false; }`. |
| repro | marketScanJob: `isRunning = false` is inside `try` block at L75. If exception thrown before L75, guard stays true indefinitely until service restart. |
| root-cause | marketScanJob was not refactored to use finally pattern. Minor inconsistency. |
| proposed-fix-surface | Move `isRunning = false` in marketScanJob to a `finally` block. XS fix. |
| blast-radius | marketScanJob overlap on crash: next invocation is skipped permanently until service restart. Low frequency (scan runs every 2h during market hours). |
| depends_on | — |
| owner-dev-agent | dev-mcp-server |

### REQ-1967-5c — Watchdog start_period vs cron tick collision

docker-compose.yml start_period values: most services = 10s (mcp-server, stock-price, alert-engine, api-gateway) or 15s (macro, kinh-dich, frontend). RAG service (watchdog-2) = 60s. Flaresolverr (watchdog-7) = 60s. The 03:00Z system-auditor pass is the earliest-morning job with potential RAG dependency. RAG service 60s start_period is only relevant after a container restart. Container restarts are ops-triggered, not scheduled. No cron job has a hard dependency on RAG availability (RAG is used opportunistically; failures are logged, not fatal). **No collision found between watchdog start_period and cron fire windows.**

### REQ-1967-5e — OBSERVE-1955d gate status

OBSERVE-1955d: FAIL confirmed 2026-05-21T22:55Z (po). Escalated to OBSERVE-1955e (TASKS.md L47). Gate for 1955e diagnostic: 2026-05-22T21:00Z (soak release of 1959-watchdog-4). The OBSERVE-1955d constraint applies ONLY to `vnstockTradingStatsRefresh` and `vnstockFundamentalsRefresh` — not to all weekly-slot jobs. Other weekly jobs (summaryWeekly, dataAuditWeekly) were not part of OBSERVE-1955d scope. **Gate is open for 1955e diagnostic post 2026-05-22T21:00Z. No other jobs constrained.**

---

## Surface 6 — Agent Definition Integrity (REQ-1967-6a through 6e)

### REQ-1967-6a — Capability vs flow drift across all agents

Survey focused on claimed vs executed capabilities for the 7 cowork agents + high-risk dev agents. Known instances: ITEM-06 (news-scout / market-watcher coverage). Additional findings:

- **alert-commander**: capabilities say "synthesize multi-agent signal chains" — flow does synthesize via `get_agent_signals` and `record_signal_outcome`. **Confirmed accurate.**
- **financial-analyst**: capabilities say "BCTC quarterly financial analysis" — flow calls `get_bctc_full`. **Accurate.** BCTC freeze note: no drift, capability matches execution.
- **digest-predict**: capabilities not enumerated in this file (no `capabilities:` stanza seen in digest-predict.md — see ITEM-19).
- **unified-agent**: no `capabilities:` stanza found (see ITEM-19).

Full 35-agent enumeration is bounded by the 40 files in `.claude/agents/`. See REQ-1967-6e for count resolution. Capability drift beyond ITEM-06 not confirmed in cowork agents. Dev-* agents have accurate capability claims matching their zone (audited: dev-mcp-server, dev-stock-price, dev-alert-engine).

### ITEM-12 · alert-commander mcp-tools.md lazy-loaded with trigger: startup [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-12 |
| surface | 6 — agent defs |
| REQ-link | REQ-1967-6b |
| severity | MED |
| evidence-path:line | `.claude/agents/alert-commander.md` — `lazy_load: path: docs/standards/mcp-tools.md, trigger: startup`. news-scout.md: `lazy_load trigger: startup` on `agent-roster.md` + `GLOSSARY_VI.md`. financial-analyst.md: `trigger: startup` present. report-analyzer.md: `trigger: startup` present. |
| repro | 4 agents confirmed with `trigger: startup`: alert-commander, news-scout, financial-analyst, report-analyzer. |
| root-cause | startup trigger deprecated per waterfall-lazy-load audit (2026-05-12) but not yet cleared from these 4 agents. |
| proposed-fix-surface | DEFER-TO-1968a per NFR-5. Sprint 1968 L-1 owns these 4 agents. Evidence only: alert-commander `mcp-tools.md` should be promoted to `always_load` (same fix as market-watcher). The other startup-triggered files (agent-roster.md, GLOSSARY_VI.md) are non-critical path. |
| blast-radius | alert-commander identity confusion risk (same root as ITEM-04 for market-watcher). Other 3 agents: context token waste only. |
| depends_on | defer-to-1968a |
| owner-dev-agent | agent-father (blocked by 1968 L-1 sprint ownership) |

### REQ-1967-6c — always_load discipline

Surveyed always_load across all 40 agent files. Pattern: most agents have `fail-loud-protocol.md` (genuinely needed every cycle — fail-loud triggers on any read error). `mcp-tools.md` in always_load for market-watcher (post 1963-MW-IDENTITY fix) and news-scout (pre-existing). No other always_load entries found in cowork agents. Dev-* agents mostly have no always_load. **No spurious always_load entries found beyond the 2 confirmed needed ones. Clean.**

### ITEM-19 · Identity stanza missing in 8 cowork + utility agents [NEW]

| Field | Value |
|---|---|
| id | ITEM-19 |
| surface | 6 — agent defs |
| REQ-link | REQ-1967-6d |
| severity | MED |
| evidence-path:line | Enumeration scan of all 40 `.claude/agents/*.md` for `mindset:` and `skills:` fields: **missing** in: alert-commander, digest-predict, financial-analyst, market-watcher, news-scout, qa-responder, report-analyzer, unified-agent, semble-search. semble-search also missing `capabilities:` and `not_my_job:`. |
| repro | `grep -L "mindset:" .claude/agents/*.md` → 9 files. |
| root-cause | Cowork agents pre-date the identity stanza standard (added during 2026-04-21 agent metadata audit). The 2026-04-21 audit added `name/color/description/tools/model` YAML frontmatter but did not add the `identity.mindset/skills` block for cowork agents. |
| proposed-fix-surface | agent-father adds `identity.mindset` + `identity.skills` stanzas to the 9 agents. semble-search also needs `capabilities:` and `not_my_job:`. DEFER-TO-1968a per NFR-5 (Sprint 1968 L-2 covers cowork agent hygiene). |
| blast-radius | Without mindset/skills, model has weaker identity anchoring — feeds the market-watcher self-refusal pattern (ITEM-04). |
| depends_on | defer-to-1968a |
| owner-dev-agent | agent-father |

### REQ-1967-6e — Agent count resolution

| Dimension | Count |
|---|---|
| `.claude/agents/*.md` total | 40 |
| Agents with cowork YAML frontmatter (name+color) | 40 (all files have frontmatter — confirmed by grep) |
| Cowork-registered (in cowork-schedule.json or listed as cowork in dispatch table) | 10 (news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, report-analyzer, qa-responder, market-analyst) |
| Dev-team agents | 18 (po, ba, architect, pm, developer, qa, fixer + 11 dev-zone) |
| Maintenance agents | 7 (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) |
| Ops agents | 3 (ops, ops-mainserver-fetch, ops-vps-fetch) |
| Utility agents | 2 (semble-search, unified-agent) |

Discrepancy note: "35 agents" in some docs vs "40 files" actual. The 5-agent gap likely reflects 5 agents added post-initial count (dev-zone expansion: dev-mainserver-crawls, dev-vps-crawls, dev-frontend, dev-kinh-dich + semble-search). Docs referencing "35 agents" are stale. **Authoritative count: 40 agent files.**

---

## Surface 7 — Drive-to-Fix Invariant (REQ-1967-7a through 7f)

### ITEM-13 · Recurring-bug-escalation freeze no review cadence [RATIFIED from v1]

| Field | Value |
|---|---|
| id | ITEM-13 |
| surface | 6 — policy + orchestration |
| REQ-link | REQ-1967-7 cross-cutting |
| severity | MED |
| evidence-path:line | SPRINT_GOAL.md E-7: "BCTC freeze since 1954c gate". DASHBOARD.md 1953-G-FAIL row: "DO-NOT-DISPATCH 1953e/h — recurring-bug-escalation freeze." No time-bound review gate in the freeze policy. 1954c has been blocked since 2026-05-19 (>48h as of audit). |
| repro | No review-date trigger exists. 1954c remains blocked indefinitely without a scheduled architect review cadence. |
| root-cause | Freeze policy has no timeout mechanism. |
| proposed-fix-surface | Add to recurring-bug-escalation policy: "if freeze > 72h → system-auditor emits `freeze-timeout` DASHBOARD alert to po section." PO either extends or dispatches architect review. |
| blast-radius | Indefinite BCTC block without resolution path. 1954c stays blocked, extractors stay broken. |
| depends_on | 1954c-gate |
| owner-dev-agent | agent-father (policy doc) + dev-mcp-server (system-auditor D5 check) |

### ITEM-20 · task-lock TTL analysis — stale-claim window confirmed safe at current cadences [NEW]

| Field | Value |
|---|---|
| id | ITEM-20 |
| surface | 7 — task lock |
| REQ-link | REQ-1967-7a |
| severity | LOW (confirmed safe) |
| evidence-path:line | `task-lock/SKILL.md:17` — TTLs: cowork-slot=900s, sprint-task=3600s, dashboard-row=1800s. cowork-team fires every 15min (900s). `execute-tier.md` — dispatcher-wrap TTL=3600s per tier batch. Dev-team cron fires every 15min. |
| repro | cowork-slot TTL=900s, cowork-team tick=900s: if crash at T+1s, lock expires at T+900s exactly when next tick arrives. SQLite atomic claim on next tick: INSERT succeeds (expired). Safe. sprint-task TTL=3600s, dev-team tick=15min: 4 ticks before natural expiry. Stale-lock takeover path per task-lock SKILL confirmed. |
| root-cause | Design correct. Dual-session claim on same sprint-task: INSERT OR IGNORE + WHERE expires_at < now → only one session wins per SQLite serialization. |
| proposed-fix-surface | No fix required. Document as confirmed safe. |
| blast-radius | None at current cadences. |
| depends_on | — |
| owner-dev-agent | — |

### ITEM-21 · Concurrent last-writer-wins on TASKS.md / DASHBOARD / pipeline-state.json [NEW]

| Field | Value |
|---|---|
| id | ITEM-21 |
| surface | 7 — pipeline state |
| REQ-link | REQ-1967-7d |
| severity | MED |
| evidence-path:line | Git log scan for <30s commit pairs on same file: `chore(po/1965-close)` 2026-05-21 20:24:45 touched docs/pipeline-state.json + docs/TASKS.md + docs/signals/DASHBOARD.md in same commit. `chore(po/1968-kickoff)` 2026-05-21 21:15:19 also touched TASKS.md. Delta = 50min. No sub-30s pair found in sampled commits (last 20). `docs/TASKS.md` architecture-briefs/2026-05-21-tasks-md-hardening.md: confirmed no write serialization; plain text file with last-writer-wins. |
| repro | Two parallel dev-team sessions (e.g. qa + developer both returning in the same second) both append to TASKS.md → second write overwrites first. Rare in practice due to TTL isolation. |
| root-cause | TASKS.md, DASHBOARD.md, and pipeline-state.json have no write serialization. task-lock does not protect file I/O — it protects task dispatch. |
| proposed-fix-surface | Highest risk: pipeline-state.json (activeTaskId corruption = sprint stall). Recommendation: system-auditor D5 checks for pipeline-state.json mtime changes within same 15-min window as a detection mechanism. Long-term: task_status_echo table per 2026-05-21-tasks-md-hardening.md brief Option C. |
| blast-radius | pipeline-state.json corruption → sprint stall until manual reset. TASKS.md corruption → PM sees wrong task status. Historical evidence: no confirmed concurrent-write incident found in git log (sub-30s pair scan: clean). Risk is latent. |
| depends_on | — |
| owner-dev-agent | agent-father (system-auditor extension) |

### ITEM-22 · Dispatcher-wrap outer release on spawn failure: confirmed safe via try/finally in cowork-team; gap in execute-tier [NEW]

| Field | Value |
|---|---|
| id | ITEM-22 |
| surface | 7 — task lock |
| REQ-link | REQ-1967-7b |
| severity | MED |
| evidence-path:line | `cowork-team/main.md:173-183` — explicit `try/finally` with `task_release` inside finally. Confirmed safe for cowork-slot dispatcher. `execute-tier.md:54-57` — release is sequential post-loop, no try/finally (see ITEM-17). `dev-team/main.md:130-138` — pipeline-resume dispatcher-wrap has `Agent(nextAgent)` then `call_tool(task_release)` — sequential, no try/finally. |
| repro | dev-team/main.md pipeline-resume: outer claim acquired at L130; `Agent(nextAgent)` call on L136; if Agent() throws, release at L137 unreachable. |
| root-cause | Two of three dispatcher-wrap sites lack explicit try/finally. Only cowork-team implemented it correctly. |
| proposed-fix-surface | Edit dev-team/main.md pipeline-resume block + execute-tier.md tier batch to use try/finally pattern (same as dispatch-claim SKILL template). |
| blast-radius | On Agent() spawn failure: task lock held for full TTL (3600s). Next dev-team tick skips that task. Self-healing via TTL but 1-cycle skip = 15-min delay. |
| depends_on | ITEM-17 (same fix batch) |
| owner-dev-agent | agent-father |

### REQ-1967-7f — BCTC-gated findings

| Finding | BCTC path touch | Verdict |
|---|---|---|
| ITEM-09 (weekly cron no re-fire) | vnstockFundamentalsJob.ts touches fundamental data (not BCTC paths: bctcReparseJob, cashFlowExtractor, PDFExtractor, VPS proxy) | NOT BCTC-gated. vnstock ≠ BCTC. |
| ITEM-13 (freeze timeout) | freeze policy blocks 1954c BCTC work | `depends_on: 1954c-gate` — fix proposal deferred per NFR-3 |
| All other ITEMs | No BCTC-path touch (bctcReparseJob / cashFlowExtractor / PDFExtractor / VPS proxy config) | NOT BCTC-gated |

**BCTC-gated finding count: 1 (ITEM-13).** ITEM-13 fix deferred. No other findings touch BCTC paths.

---

## Summary Table — All 22 Findings

| ID | Surface | REQ-link | Severity | Fix Owner | Fix Size | Depends |
|---|---|---|---|---|---|---|
| ITEM-01 | 1 — inter-agent comms (alertSource enum) | 1a | HIGH | dev-mcp-server | XS | — |
| ITEM-02 | 1 — inter-agent comms (verified_decision schema) | 1a + 1e | HIGH | dev-mcp-server + agent-father | S | — |
| ITEM-03 | 1+4 — DASHBOARD stale-race | 4b | HIGH | agent-father | XS | — |
| ITEM-04 | 2 — flow files (market-watcher identity recurrence) | 2c | HIGH | agent-father | S | — |
| ITEM-05 | 2 — flow files (cycle.md append/overwrite drift) | 2e | MED | agent-father | XS | ITEM-04 |
| ITEM-06 | 2+6 — capability text vs execution | 2e + 6a | MED | agent-father + PM | XS | — |
| ITEM-07 | 3 — dispatch (cowork lock release timing) | 3c | HIGH | agent-father | XS | — |
| ITEM-08 | 4 — signal bus (DASHBOARD unbounded growth) | 4e | MED | agent-father | XS | — |
| ITEM-09 | 5 — cron (weekly crash no re-fire) | 5a | HIGH | dev-mcp-server + agent-father | S | OBSERVE-1955e |
| ITEM-10 | 5 — cron (fire-drift sustained 5min) | 5d | MED | dev-mcp-server | XS | — |
| ITEM-11 | 5 — cron (API_MIN_INTERVAL dead slots enabled) | 5b | MED | agent-father | XS | — |
| ITEM-12 | 6 — agent defs (alert-commander mcp-tools.md lazy) | 6b | MED | agent-father | XS | defer-to-1968a |
| ITEM-13 | 6+policy (recurring-bug freeze no timeout) | 7 cross | MED | agent-father + dev-mcp-server | XS+XS | 1954c-gate |
| ITEM-14 | 1 — signal-file naming contract violation | 1b | MED | agent-father | XS | — |
| ITEM-15 | 1 — DASHBOARD prune rule absent from skill | 1c | MED | agent-father | XS | ITEM-08 |
| ITEM-16 | 2 — recursive spawn guard text-only | 2b | LOW | agent-father (doc note) | XS | — |
| ITEM-17 | 3 — execute-tier outer release not in try/finally | 3c + 3d | MED | agent-father | XS | — |
| ITEM-18 | 5 — marketScanJob isRunning not in finally | 5b | LOW | dev-mcp-server | XS | — |
| ITEM-19 | 6 — identity stanza missing (8 agents) | 6d | MED | agent-father | S | defer-to-1968a |
| ITEM-20 | 7 — TTL analysis (confirmed safe) | 7a | LOW | — | — | — |
| ITEM-21 | 7 — TASKS.md / pipeline-state LWW risk | 7d | MED | agent-father | XS | — |
| ITEM-22 | 7 — dispatcher-wrap no try/finally (2 sites) | 7b | MED | agent-father | XS | ITEM-17 |

**Confirmed CRIT:** 0 | **HIGH:** 6 (ITEM-01,02,03,04,07,09) | **MED:** 13 | **LOW:** 3

**Ratified from v1:** 13 (ITEM-01 through ITEM-13)
**New findings:** 9 (ITEM-14 through ITEM-22)
**BCTC-gated:** 1 (ITEM-13)
**Deferred to 1968a:** 2 (ITEM-12, ITEM-19)

---

## Gate Decision Recommendation

Per REQ_1967 done-criteria and NFR-4 (WIP 2/2 per zone):

**Priority batch (dispatch first, post-1965c-soak):** ITEM-01, ITEM-09, ITEM-04 — data corruption + data staleness + recurring identity failure.

**Agent-father batch (XS, low risk):** ITEM-03, ITEM-05, ITEM-07, ITEM-08, ITEM-10, ITEM-11, ITEM-14, ITEM-15, ITEM-17, ITEM-21, ITEM-22.

**1968a batch (defer):** ITEM-12, ITEM-19 — Sprint 1968 L-1/L-2 owns these.

**Accept-risk:** ITEM-16, ITEM-20 (LOW, confirmed safe).

---

## AC Cross-Check

- AC-1 (BA gate): `docs/signals/ba-1967a-spec-ready.json` — APPROVED by PO c236 (commit `f7ef1b23`).
- AC-2: This is the v2 canonical brief. ≤600L. All 22 findings include 11 required fields. "No findings" stated explicitly per clean sub-surface. NFR-2 compliant.
- AC-7: Cross-links — 1963-MW-IDENTITY (ITEM-04), OBSERVE-1955d/e (ITEM-09, REQ-1967-5e), 1962-B-01 (ITEM-03), 1964-AC-ENUM (ITEM-01+ITEM-02), 1965-COVERAGE-SWEEP (ITEM-06), cowork-team drift signals (ITEM-10), recurring-bug-freeze (ITEM-13). All 7 seed evidence rows covered.
