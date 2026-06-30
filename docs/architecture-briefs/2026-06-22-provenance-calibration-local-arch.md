<!-- size-justification: 310L — three-pillar next-level architecture brief: gateway-registration design, provenance/calibration layer, local-only scheduling. Each pillar is load-bearing for PO sprint ordering; splitting would break the dependency graph that spans all three. -->
# Next-Level Architecture: Provenance-Calibration + Local-Only Scheduling
**Author:** architect
**Date:** 2026-06-22
**Status:** FINAL — hand-off to PO for sprint dispatch
**Charter:** PO + Architect next-level cycle — PROVENANCE-AND-CALIBRATION destination + local-server-only directive (2026-06-22)
**Depends on:** `docs/architecture-briefs/2026-06-22-next-level-blueprint.md` (structural constraints; this brief goes deeper on three specific pillars)

---

## Pillar 1 — .mcp.json Gateway Registration Design

### The central design problem

`CLAUDE.md` explicitly kept `vn-market` out of `.mcp.json` to avoid loading all 146 tools directly. Reversing that naively would flood the tool surface. The CONFIRMED failure mode (3/3 chef spawns blind, fabrication live 2026-06-18) is caused by locally-spawned Agent subagents having no `.mcp.json` to inherit — they see zero MCP tools, so they fabricate or no-op.

The constraint is: **register the gateway wrapper only** — one tool (`call_tool`) + one tool (`list_server_tools`) — not the 146 vn-market tools directly.

### Design decision: register `gateway` server, NOT `vn-market`

The `.mcp.json` registration must reference the **gateway** MCP server (`mcp__gateway__*` tools), not the `vn-market` server. The gateway exposes exactly 4 tools:
- `list_servers`
- `search_tools`
- `list_server_tools`
- `call_tool`

This preserves the call_tool indirection pattern (`mcp__gateway__call_tool(server="vn-market", tool=..., arguments=...)`) that the entire codebase already uses, while giving subagents real tool access.

### Exact `.mcp.json` registration schema

The gateway server is accessed via the `claude.ai` MCP connector that is already active in the main terminal session. The key insight is: the `.mcp.json` file controls which MCP servers are registered for **locally-spawned subagent sessions**. The router's own session has the gateway via the claude.ai connector (main-session-only). Subagents spawned by `Agent(...)` calls use the workspace `.mcp.json` instead.

The correct registration shape (to be confirmed by dev-team by reading the actual gateway server config in this workspace):

```json
{
  "mcpServers": {
    "gateway": {
      "type": "stdio",
      "command": "<gateway-server-command>",
      "args": ["<args>"]
    }
  }
}
```

**CRITICAL design task before implementing:** dev-team must read the current `.mcp.json` workspace config on the claude.ai side (via `list_servers` from the main session) to extract the actual `transport`, `command`, and `args` values for the gateway server. The shape above is the target structure; the values are runtime facts that must be probed, not guessed.

**Risk 1 — tool surface explosion (mitigated):** Registering `gateway` adds 4 tools. The 146 vn-market tools remain behind `call_tool` indirection. The only new direct-call surface is `mcp__gateway__list_servers`, `mcp__gateway__search_tools`, `mcp__gateway__list_server_tools`, `mcp__gateway__call_tool`. This is the same surface the router already uses. Mitigation: verify tool count via `list_server_tools("gateway")` immediately after registration.

**Risk 2 — intentional exclusion reversal:** The CLAUDE.md note says "vn-market intentionally NOT registered... to keep tool surface small." Registering the gateway (not vn-market directly) preserves that intent — vn-market tools are still not directly registered. The CLAUDE.md note should be updated to reflect the new posture: "gateway registered; vn-market reached via call_tool indirection only."

**Risk 3 — connection type mismatch:** The gateway may be running as an `sse` or `http` transport, not `stdio`. Probing before writing `.mcp.json` is mandatory (fail-loud if the transport type is wrong — subagents silently fail-closed).

**Risk 4 — reconnect required:** After writing `.mcp.json`, the main terminal session must be restarted for the change to take effect for newly-spawned subagents. This is a user action, not an agent action.

### Agent-father work required

After the `.mcp.json` registration is confirmed live:
- Remove the Step 0c blind-guard from `docs/agents/cowork-team/flow/blind-guard.md` (it was a workaround; the root fix is `.mcp.json`)
- Update `spawn-fanout.md` Step 5.0 to remove the "check if gateway is available" branch — once `.mcp.json` is registered, all local spawns have real access
- Update `CLAUDE.md` footnote on the vn-market exclusion to reflect new posture

### Owner: dev-mcp-server (probe + write .mcp.json) + agent-father (flow doc updates)

---

## Pillar 2 — PROVENANCE-AND-CALIBRATION Architecture

### Where provenance attaches (DB schema layer)

Provenance is already partially present in the codebase:
- `rag_analyses`: has `source_url`, `source_title`, `source_type`, `published_at` — this is the deepest raw-provenance anchor
- `agent_signals`: has `finding_data TEXT DEFAULT '{}'`, `from_agent`, `causal_ref`, `causal_root_id`, `causal_root_label` — this is the signal-layer provenance chain
- `cascade_rule_hits`: has `source_rag_id` — this links cascade rules back to their RAG source

**Gap:** the `agent_signals.finding_data` column holds raw JSON provenance per signal but is stripped to a `detail` string by `cascade-signals` endpoint (confirmed in FIX-CASCADE-MACRO-CARD-REAL-DETAIL brief). This is the primary provenance gap in the served layer.

**Gap:** `prediction_claims` table has `agent_id`, `confidence`, `brier_score`, `resolution_outcome` — the calibration loop machinery exists but is disconnected from the served signal layer. `calibration_snapshots` exists. `signal_outcomes` table is populated via `seedSignalOutcome()`. The gap is that neither the dashboard cards nor the FB poster read back from calibration output to adjust conviction display.

### Design: provenance lineage as envelope, not schema overhaul

**Do NOT redesign the DB schema.** The provenance chain already exists in `agent_signals` rows. The work is to **stop stripping it** at the serve layer.

#### Sub-task P1: cascade-signals endpoint — stop flattening finding_data

File: `apps/mcp-server/src/interface/mcp/tools/news-analysis/` (the tool that feeds `cascade-signals`)
Change: pass `finding_data` as a parsed JSON object in the tool response instead of converting to `detail: string`. The field name in the response envelope becomes `finding_data: object` (not `detail`). Frontend must read `finding_data.detail` for text display, `finding_data.source_url` for link, etc.
DDD layer: interface layer only — no domain change.

#### Sub-task P2: agent_signals — source_url field exposure

Current schema has no `source_url` column directly on `agent_signals`. The URL lives in `finding_data` (JSON blob) or in the parent `rag_analyses` row reachable via `causal_ref → rag_analyses.id`. 

Design decision: add a denormalized `source_url TEXT` column to `agent_signals` via `ALTER TABLE ADD COLUMN` (plain, no UNIQUE — per lesson `feedback_sqlite_add_column_unique_silent_noop`). Writers that set `finding_data` must also populate `source_url` from `finding_data.source_url` if present. This avoids a JOIN at serve time and makes the provenance field first-class in the API response.

#### Sub-task P3: provenance lineage display (response envelope pattern)

Every MCP tool that returns a signal, alert, or cascade row should include a `provenance` sub-object in its response:
```json
{
  "signal_id": 1234,
  "stock_code": "VCB",
  "signal_type": "chain_catalyst",
  "confidence_score": 72,
  "finding_data": { "…full object…" },
  "provenance": {
    "source_url": "https://cafef.vn/…",
    "source_title": "VCB Q2 earnings exceed estimate",
    "source_type": "news",
    "rag_id": "abc123",
    "from_agent": "alert-commander",
    "causal_root_label": "earnings_beat"
  }
}
```
This is an **additive envelope extension** — no existing consumer breaks. The `provenance` sub-object is new; existing consumers that expect `{ signal_id, stock_code, … }` continue to work.

DDD layer for P3: `interface/mcp/tools/` layer (tool formatters). The domain model does not change.

### Calibration back-scoring: how it plugs in

The calibration machinery is **already deployed and running**:
- `prediction_claims` table stores per-agent forward claims with `confidence`, `brier_score`, `resolution_outcome`
- `calibrationReportJob` fires Sunday 13:00 UTC, produces `calibration_snapshots` + Telegram WORK digest
- `predictionResolutionJob` fires daily 16:30 UTC, resolves expired claims + computes Brier scores
- `signal_outcomes` table + `signalOutcomeResolutionJob` + `accuracyDigestJob` are live

**Gap:** the calibration output (Brier scores per agent, per signal type) is NOT fed back into signal confidence display or conviction scores. A calibrated signal from agent X with Brier 0.18 (well-calibrated) is displayed identically to one from agent Y with Brier 0.45 (overconfident). The user has no visibility into which agents/signal types are reliable.

#### Sub-task C1: calibration modifier on conviction display

Add a `calibration_modifier` field to the `get_agent_signals` tool response. Value = latest `avg_brier_by_agent[agent_id]` from `calibration_snapshots` (cached in memory, refreshed on Sunday by calibrationReportJob). Display: `confidence_score: 72, calibration_modifier: "well_calibrated (Brier 0.18)"` or `"overconfident (Brier 0.45)"`.

Implementation: the domain layer already has `convictionScorer.ts`. Add a `getCalibrationModifier(agentId: string): CalibrationModifier` method to it (reads from `calibration_snapshots` — infrastructure boundary is OK here via repository pattern).

DDD layer: domain service (`convictionScorer.ts`), infrastructure reader (`calibrationSnapshotStore.ts`), interface (tool formatter adds `calibration_modifier` to response).

#### Sub-task C2: prediction-claim auto-log from FB poster

The FB poster currently does NOT log its forward claims to `prediction_claims`. Each daily post makes 2–5 ticker calls with direction + implied confidence. These are exactly the inputs for a Brier-scored calibration ledger.

The fb-market-poster flow must write a `prediction_claims` row for each conviction call (ticker, direction, confidence, target date = T+5 trading days). The `predictionResolutionJob` already resolves these automatically.

This is an **agent-father task** (modify `docs/agents/fb-market-poster/flow/main.md` to add a Step "log prediction claims") + a **dev-mcp-server task** (expose a `log_prediction_claim` MCP tool or use the existing `mcp__gateway__call_tool` on vn-market's prediction tools).

Check existing tools first: `search_tools("prediction_claim")` at design time. If `add_prediction_claim` or equivalent exists, no new dev work needed for the tool layer.

### Sequencing for PROVENANCE-AND-CALIBRATION

```
P1 (cascade-signals stop-flattening) — unblocks P3 (envelope display) — unblocks Goal 3 dashboard
P2 (agent_signals.source_url column) — parallel with P1 — unblocks frontend provenance links
C1 (calibration_modifier) — requires calibrationReportJob has ≥1 week of data (already running) — no code dep
C2 (fb-poster prediction log) — requires fb-poster TNB upgrade shipped first (see blueprint Move 5)
```

---

## Pillar 3 — Local-Only Scheduling Architecture (replaces cloud RemoteTriggers)

### Standing directive (2026-06-22): NO cloud RemoteTrigger jobs

The user directive is explicit and overrides all prior cloud-backstop architecture. The `cowork-schedule.json` currently has:
- 5 guaranteed slots with `trigger_status: active` (cloud RemoteTriggers): `chef-intraday`, `chef-evening`, `digest-sunday`, `tnb-audit`, `bctc-analyst-slot-1`
- 5 deleted triggers (previously guaranteed or backstop): `chef-eod`, `news-scout-sentiment`, `market-watcher-offhours`, `market-watcher-eod`, `refine-bctc-slot-1`

All 5 active cloud triggers must be **decommissioned** (set `trigger_status: decommissioned`, NOT deleted — the history must be preserved).

### What fills the guaranteed/backstop slots locally

The local scheduling architecture already has two layers:

**Layer 1 — CronCreate `*/15` master dispatcher** (`docs/.claude/skills/cron-cowork-team/SKILL.md`)
This is already the primary driver for all cowork slots. It fires every 15 minutes, reads `cowork-schedule.json`, matches `cron_expression` against current time (±2 min), and spawns due slots. This layer is re-armed via `/cron-cowork-team` after each session restart.

**Layer 2 — Server-side Bun scheduler** (`apps/mcp-server/src/scheduler/jobs.ts`)
The Bun process runs 62+ scheduled jobs directly. These never need a cloud trigger — they fire on the Docker container's cron schedule.

**What the cloud RemoteTriggers were providing that Layer 1 does NOT:**

The cloud backstops provided session-independent firing — they fire even when the local CLI session is offline/restarting. Layer 1 (CronCreate) is session-scoped: if the CLI session ends, `*/15` crons stop.

### Design: launchd as the local backstop for guaranteed slots

The same pattern proven for the fleet-push backstop (`com.vn-market.fleet-push` launchd timer, Sprint 1949) extends directly to cowork slot backstops.

For each of the 5 currently-active cloud-triggered guaranteed slots, create a **macOS launchd timer** in `~/Library/LaunchAgents/`:

| Slot | Cloud trigger cron | Proposed launchd timer | Script |
|---|---|---|---|
| `chef-intraday` | `13 2-8 * * 1-5` | `StartCalendarInterval` M-F 02:13–08:13 on :13 | `scripts/cowork-launchers/launch-chef-intraday.sh` |
| `chef-evening` | `45 19 * * *` | `StartCalendarInterval` 19:45 daily | `scripts/cowork-launchers/launch-chef-evening.sh` |
| `digest-sunday` | `47 13 * * 0` | `StartCalendarInterval` 13:47 Sunday | `scripts/cowork-launchers/launch-digest-sunday.sh` |
| `tnb-audit` | `13 20 * * *` | `StartCalendarInterval` 20:13 daily | `scripts/cowork-launchers/launch-tnb-audit.sh` |
| `bctc-analyst-slot-1` | (from schedule) | match schedule cron | `scripts/cowork-launchers/launch-bctc-analyst.sh` |

Each launcher script does:
1. Check if the CronCreate `*/15` session is alive (probe `ps aux | grep cron-cowork-team`)
2. If ALIVE: no-op (Layer 1 will fire the slot at its next `*/15` tick within ±2 min)
3. If NOT ALIVE (session dead): directly spawn the cowork agent via `claude --run docs/agents/<agent>/flow/main.md` with the appropriate prompt

**This is a pure-local, zero-cloud architecture**: the launchd timer is the backstop that fires when the CLI session is offline. When the CLI session is alive, Layer 1 (CronCreate dispatcher) handles firing. The launchd timer is the safety net.

### Collision safety

The existing cowork-team collision safety (`task_claim(task_kind=cowork-slot, ttl_seconds=900)`) already handles the case where both Layer 1 and the launchd backstop fire for the same slot within the same 15-minute window. The second spawn sees `claimed=false` and exits silently.

### Key constraint: re-arm after restart

The CLAUDE.md `/cron-cowork-team` skill re-arms Layer 1 after session restart. The launchd timers survive restarts automatically (they are registered as LaunchAgents). No re-arm needed for launchd. The `dev-team` and `ops` crons (Layer 1 for `7 * * * *` and `0 */6 * * *`) also need launchd backstops — or they remain session-scoped (acceptable since dev-team and ops are secondary triggers, not guaranteed slots).

### What decommissioning the cloud triggers means

For each of the 5 active RemoteTriggers:
1. Set `trigger_status: decommissioned` in `cowork-schedule.json`
2. The launchd timer for that slot is live and tested first (exit gate: 2 successful local fires logged)
3. Cloud trigger is NOT deleted (RemoteTrigger MCP has no delete action anyway per `spike_1951a_oq3` note in cowork-schedule.json) — set `enabled: false` via `RemoteTrigger action=update` if the platform supports it

**Risk:** if the launchd backstop launcher script is broken and the CLI session dies, the guaranteed slot goes unfired. Mitigation: the launcher scripts must be smoke-tested on the first install (same pattern as `fleet-worktree-push.sh`).

### Owner: agent-father (launchd plist templates + launcher script specs) + developer (write scripts to `scripts/cowork-launchers/`)

---

## Part 4 — Sequencing Dependencies (for PO sprint ordering)

### Hard prerequisites

```
.mcp.json gateway registration (Pillar 1) → ALL local subagent cowork work is unblocked
  └─ agent-father blind-guard removal (after .mcp.json confirmed live)

launchd cowork backstops (Pillar 3) → cloud trigger decommission
  └─ each launchd timer must log 2 successful fires before cloud trigger is disabled

P1 cascade-signals stop-flattening (Pillar 2) → P3 provenance envelope display
P2 agent_signals.source_url ADD COLUMN → frontend source-link display

C2 fb-poster prediction log (Pillar 2) → calibration loop closes (feeds Brier scores)
  └─ fb-poster TNB upgrade (blueprint Move 5) must ship before C2 log step is meaningful
```

### Parallelizable

- `.mcp.json` gateway registration (user action + dev-mcp-server probe): fully independent, execute immediately
- `launchd` backstop scripts (developer zone, `scripts/cowork-launchers/`): independent of all DB/code work
- P1 + P2 (cascade-signals + source_url column): different files, parallel with separate dev tasks
- C1 (calibration_modifier on conviction display): independent of P1/P2, requires only that `calibration_snapshots` has data (already running)
- C2 (fb-poster claim log): agent-father zone, independent of P1/P2/C1

---

## Part 5 — Agent-Father vs Dev-Zone Split

| Task | Owner | Zone |
|---|---|---|
| Probe gateway server config + write `.mcp.json` | dev-mcp-server | `infra/.mcp.json` |
| Update CLAUDE.md footnote on vn-market exclusion | agent-father | `CLAUDE.md` |
| Remove blind-guard from cowork flow (post-.mcp.json) | agent-father | `docs/agents/cowork-team/flow/blind-guard.md` + `spawn-fanout.md` |
| Cloud trigger decommission: set `trigger_status: decommissioned` in cowork-schedule.json | PO | `docs/data/cowork-schedule.json` |
| launchd plist templates for 5 slots | agent-father | `launchd/com.vn-market.cowork-*.plist` |
| Launcher scripts for 5 slots | developer | `scripts/cowork-launchers/*.sh` |
| Install / smoke-test launchd timers | ops | local LaunchAgents registration |
| cascade-signals stop-flattening (P1) | dev-mcp-server | `apps/mcp-server/src/interface/mcp/tools/news-analysis/` |
| `agent_signals.source_url ADD COLUMN` + writer update (P2) | dev-mcp-server | `apps/mcp-server/src/infrastructure/db/schema-news.ts` + writers |
| Provenance envelope in tool responses (P3) | dev-mcp-server | `apps/mcp-server/src/interface/mcp/tools/` (multiple tool formatters) |
| `calibration_modifier` on conviction display (C1) | dev-mcp-server | `apps/mcp-server/src/domain/services/convictionScorer.ts` + tool formatter |
| FB poster prediction claim logging (C2) | agent-father | `docs/agents/fb-market-poster/flow/main.md` (Step: log claims) |

---

## Part 6 — Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| `.mcp.json` transport type unknown — wrong type silently breaks subagents | HIGH | Probe `list_server_tools` from main session first; compare gateway transport type; verify with a test spawn before declaring done |
| launchd backstop fires while CLI session is alive → double-spawn | MEDIUM | Collision guard via `task_claim` already deployed; launchd launcher checks for alive session first (belt-and-suspenders) |
| `agent_signals.source_url ADD COLUMN` — live DB migration | LOW | `ALTER TABLE ADD COLUMN` is safe on live SQLite; writers that lack `source_url` leave it NULL (non-breaking); NULL-aware frontend render needed |
| Decommissioning cloud triggers before launchd is smoke-tested → missed guaranteed slots | HIGH | Sequential gate: launchd must log 2 successful fires first; PO owns the decommission step gate |
| C2 fb-poster prediction claim logging: claim format mismatch with `prediction_claims` schema (UNIQUE on stock+claim_text+resolution_date) | MEDIUM | Exact claim_text must be deterministic (not free-form prose); design claim_text as `"{ticker} {direction} T+{N}d"` template for dedup safety |
| P3 provenance envelope: frontend consumers may break if `detail` string disappears | MEDIUM | Keep `detail` string in response alongside `finding_data` object for backward compat; deprecate `detail` in a follow-on sprint |

---

*Authored: 2026-06-22 | Zone: docs/architecture-briefs/ | Hand-off: PO for sprint planning*
*Companion brief: `docs/architecture-briefs/2026-06-22-next-level-blueprint.md` (structural constraints + 8 capability moves)*
