Create system-auditor's D-PAGE (Tier-5) cron with CronCreate.

**NOT YET ARMED.** This file documents the cron so the router can register it later via
`CronCreate` — agent-father authors the spec, never arms it. Do NOT call `CronCreate` from
this doc. Do NOT add to any live cron config as part of authoring this file.

---

## Tier-5 — Quality-Audit Freshness Rotation (daily 03:30 UTC)

**Dimension:** D-PAGE — see `docs/agents/system-auditor/audit-dimensions.md` §D-PAGE and
handler `docs/agents/system-auditor/flow/page-freshness.md`.

Rotating, partitioned re-verification of `docs/data/quality-checklist.json`'s Data
Freshness/SLA checks (74 at authoring time, `cksum(check_id) mod 7` partition — one weekday
each, 7-day full-coverage window) plus per-page `verified_at` stamping on
`docs/data/frontend-data-coverage-map.json`. Detect-only: never writes
`quality-checklist.json` itself (qa remains sole writer); findings route through the
existing `data_stale`/`system_issue` → `anomaly-task-bridge` → PO pipeline, unchanged.

- **cron**: `30 3 * * *`
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
  AUDIT_TIER=5
  MCP: https://zenmidi.com/vn-market/mcp
  ```

**Offset rationale:** 03:30 UTC sits 90min after Tier-3's `0 2 * * *` and 30min after D4/D-N's
`03:00Z` — avoids I/O contention on `orch-state.json`/the shared notebook file, same
convention D4/D-N already use relative to Tier-3.

**Prerequisite before arming:** confirm `.claude/agents/system-auditor.md` frontmatter write-
contract already lists `docs/data/auditor-page-reverify-ledger.json` and the narrow
`frontend-data-coverage-map.json .verified_at`-only write (both landed in the same edit pass
as this cron doc — see agent-father dispatch coordination_session=93587c5d-9135-42df-a0e7-170d0f8358b2,
2026-07-25). If that edit is not live yet, arming this cron produces a runtime refusal that
reads as a false "limitation".

## Manage
`CronList` | `CronDelete <id>`
