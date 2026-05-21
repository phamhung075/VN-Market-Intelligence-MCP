# Architecture Brief — Token & Tool-Call Economy
<!-- slug: token-toolcall-economy | authored: agents-architect 2026-05-21T19:06Z -->
<!-- target: agent-father (implementation) + po (Phase 1 sprint) -->
<!-- constraints: no cloud migration, no DB change, no 4-layer breach, tree-map DAG respected -->

---

## 1. CURRENT-STATE BASELINE

### 1.1 Per-cycle context load (lines ingested before first MCP call)

| Agent | always_load (lines) | lazy_load triggered at startup | Notebook read | Flow files read | Total est. context lines |
|---|---|---|---|---|---|
| news-scout | fail-loud(~97L) + mcp-tools(143L) = **~240L** | agent-roster(153L) + GLOSSARY_VI(48L) triggered `startup` → always fires | ~137L | stage-bootstrap(44L) + stage-fetch(25L) + stage-sentiment(37L) + stage-signals(156L) + cycle(23L) = **285L** | ~858L |
| alert-commander | fail-loud(97L) + alert-policy(95L) + alert-message-format(123L) = **~315L** | mcp-tools(143L) triggered `startup` → always fires | ~153L | stage-bootstrap(28L) + stage-signals(48L) + stage-dispatch-log(91L) + cycle(40L) = **207L** | ~818L |
| market-watcher | fail-loud(97L) + mcp-tools(143L) = **~240L** | (none at startup) | ~99L | cycle(135L) + eod(67L) + main(24L) = **226L** | ~565L |
| financial-analyst | fail-loud(97L) + … = **~150L est.** | GLOSSARY_VI(48L) triggered `startup` | ~150L | (multi-stage est. 200L) | ~548L |
| qa | fail-loud(97L) = **~97L** | (task-assigned trigger — conditional) | **1149L** (CRITICAL violation) | multi-stage | ~1400L+ |
| pm | fail-loud(97L) | — | **269L** (above 200L cap) | — | ~450L+ |
| architect | fail-loud(97L) | — | **310L** (above 200L cap) | — | ~500L+ |
| dev-frontend | fail-loud(97L) | — | **384L** (critical violation) | — | ~600L+ |

### 1.2 MCP tool calls per cycle (market-hours, 15-min tick)

Three agents fire concurrently every 15 min during VN market hours (02:00–08:59 UTC Mon–Fri):
`news-scout`, `market-watcher`, `alert-commander`.

| Agent | Calls per cycle (estimate from flow audit) |
|---|---|
| news-scout | get_cycle_bootstrap(1) + get_macro_snapshot(1) + get_agent_signals × 3 (feedback + dedup + legal_dedup) + get_news_items(1) + get_patterns/historical(1–3) + post_agent_signal(2–5) + log_agent_work(1) = **11–16 calls** |
| market-watcher | get_cycle_bootstrap(1) + get_macro_snapshot(1) + get_price_history × N_anomalies(1–6) + get_sector_comparison × N(1–6) + get_patterns × N(1–6) + get_technical_indicators × N(1–6) + get_sector_rotation(1) + get_supply_chain_exposure(1) + get_open_chain_findings(1) + post_agent_signal × M(1–5) + log_agent_work(1) = **16–40 calls** (scales with anomaly count) |
| alert-commander | get_cycle_bootstrap(1) + get_macro_snapshot(1) + get_market_context(1) + get_alerts(1) + get_legal_risk_signals(1) + get_crisis_early_warning(1) + get_agent_signals × 3 (price_anomaly, chain_catalyst, kinh_dich) + write_alert_verdict(0–2) + log_agent_work(1) = **11–13 calls** |

**Combined 15-min cycle: ~38–69 MCP calls, three agents, each calling `get_cycle_bootstrap` and `get_macro_snapshot` independently.**

### 1.3 Waste taxonomy (ranked by magnitude)

| # | Waste type | Evidence | Est. token cost |
|---|---|---|---|
| W-1 | **Notebook size violations** | qa=1149L, dev-frontend=384L, architect=310L, pm=269L, dev-team=286L, ba=234L, system-auditor=211L — all above 200L cap, qa is 5.7× over | At 4 chars/token: qa notebook alone = ~1150 tokens per cycle read | W-2 |
| W-2 | **Bootstrap triplicate** | news-scout + market-watcher + alert-commander each call `get_cycle_bootstrap` independently in the same 15-min cron tick. The call returns identical market context (regime, macro, prices). | 3 MCP round-trips returning near-identical payload each 15-min cycle during 7h market window = ~84 redundant calls/trading-day |
| W-3 | **`get_macro_snapshot` called separately** | Both news-scout (stage-bootstrap.md Step 0b) and alert-commander (stage-bootstrap.md Step 0b) call `get_macro_snapshot` independently per cycle. market-watcher derives regime from bootstrap but alert/news both call macro directly. Same data, two calls per tick. | ~2 redundant macro calls per 15-min tick = ~56/trading-day |
| W-4 | **`trigger: startup` lazy-loads that always fire** | news-scout loads `agent-roster.md`(153L) + `GLOSSARY_VI.md`(48L) at startup every cycle — not conditionally. alert-commander loads `mcp-tools.md`(143L) at startup. These are not conditional on a runtime event — `startup` semantics = always. | ~344L extra read per cycle for news-scout; 143L for alert-commander — per the waterfall lazy-load policy, `trigger: startup` was explicitly banned (audit 2026-05-12) |
| W-5 | **Signal payload bloat** | pm-1960-sprint-plan.json = 21KB; po-1962-signoff.json = 12KB. These signals embed full plan JSON in payload instead of a pointer to a handoff file. DASHBOARD.md rows carry 200–900 char inline summaries that duplicate TASKS.md content. | Every DASHBOARD read pulls 472+ processed entries worth of context |
| W-6 | **`get_agent_signals` called multiple times per cycle by same agent** | news-scout calls `get_agent_signals` three separate times per cycle: once for feedback tuning (stage-bootstrap), once for inter-cycle dedup (stage-signals), once for legal_risk dedup (stage-signals). Same API, overlapping time windows, no local cache. | 3 calls → 1 call with client-side filter would save 2 calls per cycle = ~56/trading-day |
| W-7 | **Caveman compression gaps** | news-scout (model=haiku), market-watcher, and financial-analyst produce session logs and WORK channel messages that read FULL-tier instead of LITE/ULTRA where appropriate. No audit evidence these three agents apply ULTRA for inter-agent pings. | ~20–30% token overhead on session writes |
| W-8 | **Notebook commit triggers extra git IO** | market-watcher and news-scout each do a `git add + git commit` per cycle during market hours (every 15 min). During 7h market window: ~56 separate notebook commits from 2 agents alone. | Git lock contention risk + unnecessary filesystem churn |
| W-9 | **Flow files read redundantly per stage** | news-scout reads 5 separate stage files (stage-bootstrap, stage-fetch, stage-sentiment, stage-signals, stage-log-notify) that have no jump-to anchors from the main.md dispatcher. The agent reads the full dispatcher + each stage sequentially. | ~300L of navigation overhead per cycle |

---

## 2. OPTIMIZATION LEVERS (ranked by token-saved / risk-of-regression)

### TIER 1 — Zero implementation risk (agent-father edits only)

#### L-1: Fix `trigger: startup` to actual conditional triggers
**Files:** `.claude/agents/news-scout.md`, `.claude/agents/alert-commander.md`, `.claude/agents/financial-analyst.md`, `.claude/agents/report-analyzer.md`
- news-scout: `agent-roster.md` trigger `startup` → change to `system_routing_question` (news-scout never needs the roster in its signal chain). `GLOSSARY_VI.md` trigger `startup` → change to `vn_financial_terms` (already used elsewhere — matches convention).
- alert-commander: `mcp-tools.md` trigger `startup` → change to `mcp_tool_unavailable` OR promote to `always_load` only if the 1963-MW-IDENTITY fix (agent-father commit 2026-05-21) shows `mcp-tools.md` must always be present. If always needed: promote to `always_load` and document the justification. If conditional: give it a real trigger.
- financial-analyst: `GLOSSARY_VI.md` trigger `startup` → `vn_financial_terms`.
- report-analyzer: `GLOSSARY_VI.md` trigger `startup` → `vn_financial_terms`.
**Est. saving:** 201–344 fewer lines loaded per cycle for news-scout + alert-commander.
**Risk:** LOW. SSOT knowledge is not removed — just loaded conditionally.

#### L-2: Enforce notebook trim — 120L hard cap with archive
**Current policy:** ≤200L (from waterfall lazy-load audit 2026-05-12).
**Proposed policy:** Target ≤100L, hard cap 120L. Anything above → archive to `docs/archive/notebooks/<agent-id>-<date>.md` before overwrite. Archive on every overwrite cycle, not only when over limit.
**Files requiring immediate trim by agent-father:**
- `docs/agent-memory/notebooks/qa.md` (1149L → ≤120L, archive remainder)
- `docs/agent-memory/notebooks/dev-frontend.md` (384L)
- `docs/agent-memory/notebooks/architect.md` (310L)
- `docs/agent-memory/notebooks/dev-team.md` (286L)
- `docs/agent-memory/notebooks/pm.md` (269L)
- `docs/agent-memory/notebooks/ba.md` (234L)
- `docs/agent-memory/notebooks/system-auditor.md` (211L)
**notebook-write/SKILL.md:** update "hard cap 80" → "hard cap 120L" to align with cowork (market-watcher already targets ≤50L/hard cap 80L — deviation is fine, the key is enforcement).
**Est. saving:** ~1030L reduction on qa notebook read alone. System-wide: ~1800L reduction.
**Risk:** LOW. Archived content is still recoverable. The `## Carry-over` discipline already defines what survives.

#### L-3: Signal payload pointer discipline
**Current state:** pm sprint-plan signals embed 21KB of full JSON. po signoff signals embed 12KB. These are `processed/` signals — already consumed — but DASHBOARD.md rows carry inline 200–900 char summaries that duplicate TASKS.md.
**Rule to add to `.claude/skills/signal-dashboard/SKILL.md`:** When summary column would exceed 120 chars, truncate to 80 chars + pointer: `→ docs/handoffs/TASK_NNN.md`. Full details live in the handoff file, not the signal.
**Rule for pm sprint signals:** payload body must be ≤800 chars JSON (title + scope + task list of IDs only). Full plan goes in `docs/handoffs/SPRINT_NNN.md`.
**Est. saving:** 60–80% reduction in signal payload size for pm/po sprint signals. DASHBOARD.md stays readable without carrying full context.
**Risk:** LOW. Handoff files are already SSOT; signals becoming pointers is additive.

#### L-4: Consolidate `get_agent_signals` calls in news-scout
**Current:** news-scout calls `get_agent_signals` 3× per cycle (feedback tuning, inter-cycle dedup, legal_risk dedup), each fetching overlapping time windows from the same agent=news-scout scope.
**Fix:** Single call at stage-bootstrap Step 0c fetching `status="all"` (last 6h window) stored as `SELF_SIGNALS_CACHE`. Subsequent dedup checks in stage-signals read from the in-context cache instead of re-querying MCP. Client-side filter by `signal_type` to split into feedback-eligible and dedup-eligible subsets.
**File to update:** `.claude/flows/news-scout/stage-bootstrap.md` Step 0c (one consolidated call), `.claude/flows/news-scout/stage-signals.md` (remove duplicate `call_tool` for dedup + legal_risk, replace with cache lookup).
**Est. saving:** 2 fewer MCP calls per news-scout cycle = ~56 fewer calls per trading-day.
**Risk:** LOW-MEDIUM. Must ensure the `status="all"` window covers the 360-min legal_risk lookback. Confirm with dev-mcp-server that `get_agent_signals` supports `from_agent + status=all` with sufficient default look-back (or add `hours_back=7` parameter).

#### L-5: Caveman tier for inter-agent status pings
**Current:** news-scout, market-watcher, and alert-commander WORK channel messages and session log headers are FULL-tier prose. These are cycle status notifications, not handoffs.
**Fix:** `.claude/skills/caveman/SKILL.md` already defines ULTRA tier for "inter-agent pings / blocker escalations / WIP state changes." These map exactly. Apply ULTRA to:
- `send_telegram(channel="work")` cycle-status lines in news-scout + market-watcher flows.
- Session log headers (cycle summary line before detail).
**Est. saving:** ~20–25% token reduction on cycle-end write steps. Across 3 agents × 7h × 4 cycles/h: significant cumulative reduction.
**Risk:** VERY LOW. ULTRA format is already defined and enforced elsewhere. No logic change.

---

### TIER 2 — Moderate risk (needs implementation + testing)

#### L-6: Bootstrap dedup — shared tick snapshot file
**Problem:** news-scout, market-watcher, and alert-commander each independently call `get_cycle_bootstrap` at the start of every 15-min cycle. The three agents fire concurrently (cron: `*/15 2-8 * * 1-5`). The bootstrap payload (market context, regime snapshot, prices) is identical for all three within the same tick window.
**Proposed pattern:** Cowork-team dispatcher (`.claude/commands/cowork-team.md`) writes a shared JSON snapshot file `docs/data/cycle-snapshot-<TICK>.json` immediately after matching slots. Each spawned agent reads this file instead of calling `get_cycle_bootstrap` if the file's timestamp is within ±5 min of current UTC.
- File format: `{ "tick": "HH:MM", "created_at": ISO, "market_context": {...}, "macro_snapshot": {...} }` — both bootstrap + macro in one file.
- File is overwritten each tick, not accumulated.
- Agents fall back to direct `get_cycle_bootstrap` if file is absent or stale (>7 min).
**Files to modify:**
- `.claude/commands/cowork-team.md` (add snapshot write step before agent spawn)
- `.claude/skills/cycle-bootstrap/SKILL.md` (add Step -1: check for tick snapshot)
- `.claude/flows/news-scout/stage-bootstrap.md` + alert-commander's + market-watcher's cycle.md (add snapshot read with fallback)
**Est. saving:** 2 fewer `get_cycle_bootstrap` + 2 fewer `get_macro_snapshot` calls per 15-min tick = ~6 calls saved per tick = ~168 calls/trading-day.
**Risk:** MEDIUM. Snapshot file becomes a single-writer / multi-reader synchronization point. If cowork-team crashes before writing the snapshot, agents correctly fall back to direct call. File must be written atomically (write to tmp then rename). Implementation work required — route to dev-team via pm after brief.
**Context-tracking safeguard:** Snapshot file is ephemeral (overwritten each tick). If absent → agents still function normally. No audit trail is altered.

#### L-7: Notebook commit batching — end-of-market-session only
**Current:** market-watcher and news-scout each commit their notebook every 15-min cycle. During 7h market: ~56 git commits from two agents.
**Proposed:** During market hours, Write notebook file but skip `git commit` until market close (08:59 UTC). At market close, a single commit covers all in-session writes: `git add docs/agent-memory/notebooks/market-watcher.md docs/agent-memory/notebooks/news-scout.md && git commit`.
- EOD commit step already exists in market-watcher (`eod.md`). Expand to cover news-scout and fold notebook commit there.
- Off-hours cycles (every 4h) retain their own commit (one per cycle — acceptable since rare).
**Files to modify:** `.claude/flows/market-watcher/cycle.md` Step 5 (remove commit, leave write), `.claude/flows/market-watcher/eod.md` (add notebook commits for self + news-scout), `.claude/flows/news-scout/stage-log-notify.md` or equivalent (remove per-cycle commit).
**Est. saving:** Reduces git lock contention. ~54 fewer git commits per trading-day.
**Risk:** MEDIUM. If a session crashes mid-market, the last notebook write is still on disk (just not committed). Recovery: next cycle's pre-write Read recovers carry-over. Git loss window is bounded by market session (max ~7h), acceptable given the notebook's ephemeral nature.
**Context-tracking safeguard:** Notebook write (file on disk) still happens every cycle. Only the git commit is deferred. Audit trail recoverable from filesystem if needed.

---

### TIER 3 — Needs PM sprint + dev-team implementation

#### L-8: Skill consolidation — composite Step 0
**Observation:** Every cowork agent executes the same 3-step preamble: (1) notebook-read skill, (2) cycle-bootstrap skill, (3) regime-extraction skill. These three skills are loaded separately (3 file reads) and their logic has no inter-dependencies that require separation.
**Proposed:** A composite `step-0-cowork.md` skill combining: notebook-read → cycle-bootstrap (with tick-snapshot check from L-6) → regime-extraction → SELF_SIGNALS_CACHE population. Single read, single logical unit.
**Files to create:** `.claude/skills/step-0-cowork/SKILL.md` (~60L).
**Files to update:** All 7 cowork agent flows that reference these three skills separately.
**Est. saving:** 3 skill file reads → 1 per cycle per agent. Saves 2 Read calls per agent cycle.
**Risk:** MEDIUM. Consolidation must preserve all error boundaries from each constituent skill (fail-loud, retry logic, shape validation). Requires careful merge by agent-father + qa ratification.

#### L-9: `get_agent_signals` with server-side filter
**Current limitation:** `get_agent_signals` returns all signals for an agent and clients filter client-side. This means full result set transferred over MCP even when only 1–2 types are needed.
**Proposed:** Add `signal_type` filter parameter to `get_agent_signals` MCP tool (or use existing `status` + `signal_type` compound filter if already implemented). Then news-scout, alert-commander, and market-watcher can call with precise filters, reducing payload size.
**Files to modify:** `apps/mcp-server/src/...` (dev-mcp-server zone), tool schema update, flow files to pass the filter.
**Est. saving:** 40–60% reduction in `get_agent_signals` payload size depending on signal bus volume.
**Risk:** LOW-MEDIUM. Additive API change (new parameter, default=all preserves backward compat). Dev-mcp-server zone.

---

## 3. CONTEXT-TRACKING SAFEGUARDS

For each optimization, the following invariants must not be broken:

| Lever | Invariant to preserve |
|---|---|
| L-1 (startup triggers) | `mcp-tools.md` for alert-commander must be loaded before first MCP call. If moved to `always_load`, this is safer than `trigger: startup`. Do not leave it as a genuine conditional that could miss. |
| L-2 (notebook trim) | `## Carry-over` section must survive every trim. Archive file is written BEFORE overwrite. system-auditor reads notebooks during Tier-2 pass — it needs current state, not archive. Archive path must be documented in the live notebook header. |
| L-3 (signal payload diet) | DASHBOARD.md pointer must resolve to an existing file. Signal writer must verify handoff file exists before truncating payload. No orphan pointers. |
| L-4 (`get_agent_signals` consolidation) | `SELF_SIGNALS_CACHE` must cover the full 360-min window needed by legal_risk dedup. If `get_agent_signals` default lookback is <360 min, an explicit `hours_back=7` parameter must be passed at the consolidated call. Cache must be scoped per-cycle (not persisted between cycles). |
| L-6 (tick snapshot) | Snapshot file must never block agent startup. Fallback path (direct `get_cycle_bootstrap`) must be exercised on every cache miss. Snapshot older than 7 min must be treated as absent. File must NOT be committed to git (add to `.gitignore`). |
| L-7 (commit batching) | Notebook file must be Written (not just committed) every cycle. If EOD flow fails, a recovery procedure must commit any uncommitted notebook writes. Recovery procedure pointer: `docs/protocols/head-lock-self-cure.md`. |
| L-8 (composite skill) | Error boundary of each constituent skill must be preserved. If notebook-read fails → stop. If bootstrap fails → stop. Regime-extraction fallback must still apply. The composite skill must not short-circuit error handling. |
| Fail-loud protocol | ALL optimizations must preserve the 5-step fail-loud protocol (docs/protocols/fail-loud-protocol.md). No knowledge load optimization removes a `fail_loud: true` file from the read path. |
| system-auditor audit trail | system-auditor's Tier-2 passes read notebooks + DASHBOARD.md to walk evidence chains. Notebook trim with archive preserves the audit trail. Pointer-only signals preserve the audit trail if pointers resolve. tran-ngoc-bau's NEEDS_ATTENTION/IMPROVING verdicts rely on notebook evidence — trim must preserve the last cycle's findings in the live file. |

---

## 4. ROLLOUT PLAN

### Phase 1 — Zero-risk wins (agent-father only, no tests required)
**Target: 1 sprint, ~1 day of agent-father work**

| Action | Lever | File(s) | Est. savings |
|---|---|---|---|
| Fix 4 `trigger: startup` lazy-loads | L-1 | agents/news-scout.md, alert-commander.md, financial-analyst.md, report-analyzer.md | ~344L/cycle for news-scout, ~143L/cycle for alert-commander |
| Archive + trim 7 oversize notebooks | L-2 | notebooks/qa.md, dev-frontend.md, architect.md, pm.md, dev-team.md, ba.md, system-auditor.md | ~1800L reduction in notebook context reads |
| Update notebook-write skill cap | L-2 | .claude/skills/notebook-write/SKILL.md | Enforces 120L going forward |
| Add signal payload pointer rule | L-3 | .claude/skills/signal-dashboard/SKILL.md | ~60–80% payload reduction on sprint signals |
| Apply ULTRA tier to cycle-status pings | L-5 | flows/news-scout/stage-log-notify.md, market-watcher/cycle.md Step 5b | ~20% token reduction on cycle-end write steps |

**Expected aggregate Phase 1 savings: ~25–35% reduction in per-cycle context size for all 3 concurrent market-hours agents.**

### Phase 2 — Notebook + always_load tightening (agent-father, 1-2 days)
**Target: same or next sprint**

| Action | Lever | File(s) | Est. savings |
|---|---|---|---|
| Consolidate news-scout `get_agent_signals` calls | L-4 | flows/news-scout/stage-bootstrap.md, stage-signals.md | 2 fewer MCP calls/cycle |
| Notebook commit batching (market session) | L-7 | flows/market-watcher/cycle.md + eod.md, news-scout/stage-log-notify.md | ~54 fewer git commits/trading-day |
| Review all remaining always_load files for size justification | audit | all .claude/agents/*.md | Catch any new always_load additions that lack justification comments |

**Expected aggregate Phase 1+2 savings: ~40–50% per-cycle token reduction, ~70 fewer MCP calls per trading-day.**

### Phase 3 — Bootstrap dedup + tool-call batching (dev-team via PM)
**Target: sprint after Phase 1 approval — requires dev-team implementation**

| Action | Lever | Owner | Est. savings |
|---|---|---|---|
| Tick snapshot file + cowork-team write step | L-6 | dev-mcp-server + agent-father | 6 fewer MCP calls/tick = ~168/trading-day |
| `get_agent_signals` server-side filter | L-9 | dev-mcp-server | 40–60% payload reduction |
| Composite Step-0 skill | L-8 | agent-father | 2 fewer Read calls/agent/cycle |

**Expected aggregate Phase 3 savings (on top of 1+2): additional ~15–20% MCP call reduction.**

---

## 5. CROSS-REFERENCE: Parallel Sprint 1967 (Orchestration Audit)

Sprint 1967 (orchestration bug audit, assigned 2026-05-21T19:01Z) covers overlapping surfaces. Points of intersection — do not duplicate:

- **1963-MW-IDENTITY:** alert-commander's `trigger: startup` for mcp-tools.md is the mechanism agent-father used to fix the identity confusion. Lever L-1 must coordinate with that fix — if mcp-tools.md is promoted to `always_load` as part of the MW-identity fix, L-1 for alert-commander becomes a no-op (already resolved). Verify before agent-father implements.
- **1964-AC-ENUM signal schema drift:** L-3 (signal payload diet) does not fix the enum schema problem — the enum fix is a dev-mcp-server task in Sprint 1967. L-3 targets payload size, not schema correctness. No conflict, no overlap.
- **Recursive spawn token waste:** If Sprint 1967 confirms recursive spawns (e.g., dev-team dispatcher wrapping itself), the token waste from phantom sessions compounds with all waste types identified here. Fixes are orthogonal — Sprint 1967 fixes the spawn correctness; this brief fixes the per-cycle steady-state cost.
- **Cowork dispatcher drift (drift_min=5 in cowork-team-20260521T185005Z.json):** The tick snapshot (L-6) assumes the dispatcher fires within ±7 min of the nominal tick. Drift_min=5 is within tolerance. If Sprint 1967 finds the drift grows beyond 7 min, L-6's fallback condition must be updated.

---

## 6. RETURN

```
PIPELINE: continue
NEXT: po — schedule Phase 1 quick wins as mini-sprint (agent-father implements L-1 through L-5 in one sprint, no code required). Phase 3 (L-6, L-8, L-9) requires PM conversion to TASK_NNN after Phase 1 lands.
HANDOFF: docs/architecture-briefs/2026-05-21-token-toolcall-economy.md
```

---

*Authors note: This brief does not implement. All file changes route to agent-father (Phase 1+2) or PM→dev-team (Phase 3). The tick-snapshot (L-6) introduces a new file path `docs/data/cycle-snapshot-<TICK>.json` — this must be added to `.gitignore` to avoid polluting the commit history with ephemeral data.*
