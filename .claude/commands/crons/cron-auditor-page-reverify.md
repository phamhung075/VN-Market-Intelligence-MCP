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
each, 7-day full-coverage window) plus `docs/data/frontend-data-coverage-map.json` page
rows (`cksum(page) mod 7`). Detect-only: BOTH source files stay fully read-only — never
writes `quality-checklist.json` (qa remains sole writer) or the coverage map (an earlier
design stamped `verified_at` onto the map directly and self-triggered qa's mtime-based
re-sync check; confirmation-recency now lives only in this dimension's own
`docs/data/auditor-page-reverify-ledger.json`). Findings route through the existing
`data_stale`/`system_issue` → `anomaly-task-bridge` → PO pipeline, unchanged — including a
new scoped trigger in `docs/agents/qa/flow/quality-audit.md` so a D-PAGE finding actually
reaches a qa re-sync.

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

**Prerequisite before arming:** confirm (1) `.claude/agents/system-auditor.md` frontmatter
write-contract lists `docs/data/auditor-page-reverify-ledger.json` and explicitly states
BOTH `quality-checklist.json` and `frontend-data-coverage-map.json` are read-only; (2)
`docs/agents/qa/flow/quality-audit.md` Trigger includes the D-PAGE signal-based trigger
(`PG-DRIFT`/`PG-STALE`/`PG-MAP-SELF` dedup suffixes) — otherwise a D-PAGE finding never
reaches a re-sync and capability #2 of the original demand stays unclosed. Both landed in
the same coordination_session=93587c5d-9135-42df-a0e7-170d0f8358b2 (2026-07-25, incl. same-day
coordinator-review revision). If either is not live, arming this cron either produces a
runtime refusal that reads as a false "limitation" or ships a detector nothing consumes.

## Manage
`CronList` | `CronDelete <id>`
