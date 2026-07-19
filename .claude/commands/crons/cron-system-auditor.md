Create system-auditor crons with CronCreate (three tiers). Run all three.

---

## Tier-1 — Runtime Ping (every 30 min)

> Manual/ad-hoc reference only. `.claude/skills/cron-detect-loop/SKILL.md` (Job 2) is the
> operational SSOT for the prompt actually registered by `/cron-detect-loop` — it has run a pure
> shell pre-gate (`scripts/agents-flow/auditor-tier1-probe.sh`) + stale-heartbeat guard since
> 2026-07-02 (TOKEN-ECONOMY-TICK-PREFLIGHT WU-3) that the plain form below intentionally omits
> (keeps this file simple for one-off manual setup). The `cron` cadence below stays in sync with
> SKILL.md; only the prompt body differs. Tier-2/Tier-3 below remain byte-identical to SKILL.md.

- **cron**: `*/30 * * * *`
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
  AUDIT_TIER=1
  MCP: https://zenmidi.com/vn-market/mcp
  ```

---

## Tier-2 — Freshness Sweep (every 4h)

- **cron**: `0 */4 * * *`
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
  AUDIT_TIER=2
  MCP: https://zenmidi.com/vn-market/mcp
  ```

---

## Tier-3 — Deep DB Integrity (daily 02:00 UTC)

- **cron**: `0 2 * * *`
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
  AUDIT_TIER=3
  MCP: https://zenmidi.com/vn-market/mcp
  ```

---

## Note on Existing Crons

`dataAuditDaily` (23:00 VN) and `dataAuditWeekly` (01:00 VN Sunday) overlap with Tier-3 coverage.
Review with developer before decommissioning to confirm no unique checks remain in those crons.
Until confirmed safe: run in parallel (duplicate doc/memory pass is acceptable overhead).

## Sibling — Frequent Data-Anomaly Sweep

`cron-db-data-integrity.md` (`15,45 * * * *`, offset from this cron's `:00/:30`) runs a
30-min, data-VALUE-focused pass on the live market DB (missing/failed, stale, duplicate,
incorrect/out-of-range), logs a JSON history (`docs/data/db-integrity-history.json`), and
signals genuine defects to `orch-state.json .signal_queue.rows[]` → dev-team. The
high-frequency complement to Tier-3's daily deep DB integrity. Same agent (system-auditor),
same signal contract; detection-only (read-only DB; fixes flow through dev-team).

## Manual Tier-4 Pilot Invocation (D-FLEET, on-demand only)

**NOT a cron.** Never register via `CronCreate`, never add to `cronConfig.ts` or any cron
config. `docs/agents/system-auditor/flow/main.md:67` states `AUDIT_TIER=4` is "PILOT ONLY —
manual invocation only; never present in any cron config."

- **Invocation pattern** (spawn `system-auditor`, one-off, user/PO/agents-architect triggered):
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
  AUDIT_TIER=4
  MCP: https://zenmidi.com/vn-market/mcp
  ```

**Authoritative specs (do not re-derive — read these before invoking):**
- `docs/agents/system-auditor/handlers.md` §Step D-FLEET — full FA-1..FA-6 execution spec
  (notebook rollup, task_board/signal_queue metrics, tool-usage-stats read, accuracy/disposition
  scoring, proposal synthesis, notebook append + pilot-run counter).
- `docs/agents/system-auditor/audit-dimensions.md` — D-FLEET dimension entry (check IDs T4-A..T4-E,
  scope, dedup namespace).
- `docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md` §5 (pilot
  cadence + trigger/claim spec) and §7 (G1–G6 graduation criteria — conditions under which this
  might eventually become a real cron; PO-gated, cannot self-promote).

**Per-run counter:** run number `N` is read from the `Tier-4 pilot runs: N` line in the most recent
`Tier-4-PILOT` entry in `docs/agent-memory/notebooks/system-auditor.md` — increment for the next
manual run. Pilot Run #1 already executed 2026-07-18 (commit `791f3fcb2`, `Tier-4 pilot runs: 1`).

## Manage
`CronList` | `CronDelete <id>`
