Create system-auditor crons with CronCreate (three tiers). Run all three.

---

## Tier-1 — Runtime Ping (every 30 min)

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
incorrect/out-of-range), logs a JSON history (`docs/signals/db-integrity-history.json`), and
signals genuine defects to `orch-state.json .signal_queue.rows[]` → dev-team. The
high-frequency complement to Tier-3's daily deep DB integrity. Same agent (system-auditor),
same signal contract; detection-only (read-only DB; fixes flow through dev-team).

## Manage
`CronList` | `CronDelete <id>`
