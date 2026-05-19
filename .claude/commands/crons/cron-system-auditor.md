Create system-auditor crons with CronCreate (three tiers). Run all three.

---

## Tier-1 — Runtime Ping (every 30 min)

- **cron**: `*/30 * * * *`
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute .claude/flows/system-auditor/main.md
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
  Launch subagent (subagent_type=system-auditor). Read and execute .claude/flows/system-auditor/main.md
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
  Launch subagent (subagent_type=system-auditor). Read and execute .claude/flows/system-auditor/main.md
  AUDIT_TIER=3
  MCP: https://zenmidi.com/vn-market/mcp
  ```

---

## Note on Existing Crons

`dataAuditDaily` (23:00 VN) and `dataAuditWeekly` (01:00 VN Sunday) overlap with Tier-3 coverage.
Review with developer before decommissioning to confirm no unique checks remain in those crons.
Until confirmed safe: run in parallel (duplicate doc/memory pass is acceptable overhead).

## Manage
`CronList` | `CronDelete <id>`
