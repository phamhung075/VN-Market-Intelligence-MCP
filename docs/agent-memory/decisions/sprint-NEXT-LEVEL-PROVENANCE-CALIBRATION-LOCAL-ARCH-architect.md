# Decision Journal — Sprint NEXT-LEVEL-PROVENANCE-CALIBRATION-LOCAL-ARCH · architect

**Sprint goal:** Next-level architecture — PROVENANCE-AND-CALIBRATION destination + local-server-only scheduling directive
**Agent:** architect
**Started:** 2026-06-22T00:00:00Z

---

### STEP architect-S1 · architect · 2026-06-22T00:00:00Z
**task-id:** NEXT-LEVEL-PROVENANCE-CALIBRATION-LOCAL-ARCH
**what-done:** Delivered 3-pillar architecture brief at `docs/architecture-briefs/2026-06-22-provenance-calibration-local-arch.md`. Companion to existing `2026-06-22-next-level-blueprint.md` (which covers structural constraints + 8 capability moves).

**what-considered:**

PILLAR 1 — .mcp.json gateway registration:
- Option A (register `vn-market` directly): REJECTED. 146 tools loaded directly; defeats the original CLAUDE.md intent of keeping tool surface small; all 146 tools visible in every subagent's tool list.
- Option B (register nothing, fix via session-level env): REJECTED. The fabrication root is that `.mcp.json` is `{"mcpServers": {}}` for ALL local spawns — the main-session claude.ai connector is NOT inherited by subagents.
- Option C (register `gateway` server only): CHOSEN. Gateway exposes 4 tools only. All 146 vn-market tools remain behind `call_tool` indirection unchanged. Existing codebase call pattern (`mcp__gateway__call_tool(server="vn-market", tool=..., arguments=...)`) stays identical. Risk: transport type must be probed before writing — if type is wrong, subagents silently fail. Added mandatory probe step to design.

PILLAR 2 — PROVENANCE-AND-CALIBRATION layer:
- Option A (DB schema redesign — add provenance tables): REJECTED. The chain already exists: `rag_analyses.source_url`, `agent_signals.finding_data + causal_ref + causal_root_id`, `cascade_rule_hits.source_rag_id`. Redesign would duplicate existing data.
- Option B (serve-layer stop-stripping): CHOSEN for P1/P3. Provenance is already in DB; the problem is that `cascade-signals` endpoint converts `finding_data` to a `detail: string`, losing the URL and full object. Stop the stripping at the interface layer.
- Option C (denormalized `source_url` column on `agent_signals`): CHOSEN for P2. Avoids JOIN at serve time; safe `ALTER TABLE ADD COLUMN` (plain, no UNIQUE per lesson `feedback_sqlite_add_column_unique_silent_noop`); writers populate from `finding_data.source_url`.
- Calibration — Option A (full recalibration engine rewrite): REJECTED. `calibration_snapshots`, `prediction_claims`, `calibrationReportJob`, `predictionResolutionJob`, `signal_outcomes` are all deployed and running. Gap is serve-layer (C1) and claim-logging (C2).
- C1 calibration_modifier: additive field to `get_agent_signals` response. Reads latest `calibration_snapshots.avg_brier_by_agent` (already computed weekly). Domain change in `convictionScorer.ts` — appropriate DDD layer.
- C2 fb-poster claim log: `prediction_claims` UNIQUE constraint is `(stock, claim_text, resolution_date)`. Claim text must be a deterministic template, not free-form prose, or UNIQUE constraint will fail on re-run. Template chosen: `"{ticker} {direction} T+{N}d"`.

PILLAR 3 — Local-only scheduling:
- Option A (CronCreate session-only, no backstop): REJECTED. CronCreate `*/15` dispatcher is session-scoped — if CLI session dies, guaranteed slots go unfired. The 5 current cloud triggers exist precisely to prevent this.
- Option B (server-side Bun crons for cowork): REJECTED. Bun scheduler runs inside Docker mcp-server container. Cowork agent spawning requires the Claude Code CLI process (which is local, not in Docker). Container cannot spawn Claude Code agents.
- Option C (launchd timers as local backstop): CHOSEN. Proven pattern from `com.vn-market.fleet-push` (launchd timer for fleet-push, Sprint ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP, Option-A final choice). Each launchd timer checks if CronCreate session is alive before firing (no double-spawn). Collision safety via existing `task_claim` dedup. Scripts go to `scripts/cowork-launchers/` (dev-standards.md § Script Persistence).

Sequential decommission gate: launchd timer must log 2 successful fires before cloud RemoteTrigger is disabled. Cannot use `delete` action (platform has no delete — per `spike_1951a_oq3` note in cowork-schedule.json); use `trigger_status: decommissioned` + `enabled: false` via update.

**why-decision:**
- `.mcp.json` gateway-only registration is the minimal surface that fixes the fabrication root without violating the CLAUDE.md tool-surface intent.
- Provenance attaches to the serve layer, not the DB schema — the schema already has it; the stripping is the bug.
- launchd is the proven local backstop pattern (already used for fleet-push); no new primitives needed.
