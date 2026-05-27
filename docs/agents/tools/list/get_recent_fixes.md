# get_recent_fixes

**Category:** Briefings / Changelog

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/changelogTools.ts`

## Purpose

Analysis Team checks recently-fixed issues before re-reporting. Avoids duplicate work and prevents noisy Report Channel traffic. Returns fixes newest first (DESC order).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `limit` | number | No | 10 | Max fixes to return (1-50, default 10) |

## Return Format

```
=== 5 sửa lỗi gần nhất (mới nhất trước) ===

1. [HOTFIX] SQLite corruption recovery
   fixed_at: 2026-05-05T16:00:00Z
   detail: Recovered alert-engine.db by renaming SHM file and restarting container
   files: docker-compose.yml, ops/recovery-script.sh
   commit: abc1234d
   feedback_id: 12
   superseded: none

2. [BUGFIX] Signal validation schema update
   fixed_at: 2026-05-05T14:30:00Z
   detail: Updated chain_catalyst validator to allow optional event_type field
   files: src/interface/mcp/tools/news-analysis/agentSignalTools.ts
   commit: def5678e
   feedback_id: 11
   superseded: alert_id=342, alert_id=343, alert_id=344

3. [FEATURE] Recency weighting in RAG search
   fixed_at: 2026-05-04T10:15:00Z
   detail: Added recency_days parameter to search_similar_context tool (Task 1107)
   files: src/domain/services/recencyWeighter.ts
   commit: ghi9012f
   feedback_id: —
   superseded: none

4. [DOCS] Tool documentation update
   fixed_at: 2026-05-03T09:30:00Z
   detail: Added parameter tables and examples to 8 tool docs
   files: docs/agents/tools/list/*.md
   commit: jkl3456g
   feedback_id: —
   superseded: none

5. [REFACTOR] Simplify alert filtering logic
   fixed_at: 2026-05-02T15:45:00Z
   detail: Consolidated 3 redundant filter conditions into single expression
   files: src/application/usecases/getAlerts.ts
   commit: mno7890h
   feedback_id: 8
   superseded: none
```

**Empty State:**
```
Chưa có sửa lỗi nào được ghi lại.
```

## Fix Entry Fields

| Field | Definition |
|-------|-----------|
| **Type** | bugfix, hotfix, feature, docs, refactor |
| **Title** | Short description |
| **fixed_at** | ISO timestamp when fix was logged |
| **detail** | Extended explanation |
| **files** | Modified file paths (relative) |
| **commit** | Git commit hash (if provided) |
| **feedback_id** | Related telegram_reports ID (if provided) |
| **superseded** | Alert IDs made obsolete by this fix |

## Use Cases

- **News Scout** before posting urgent signal: `get_recent_fixes(10)` → check if issue already fixed
- **Report Analyzer** before submitting bug: calls tool → sees fix already logged
- **System Auditor** reviews fix history to identify patterns
- **Market Watcher** verifies known issues are resolved before trading

## Query Pattern (Recommended)

```
1. call get_recent_fixes(limit=10)
2. scan titles/detail for keyword match to current issue
3. if match found → issue already fixed, skip reporting
4. if no match → report new bug via send_telegram(channel="bug")
```

## Related Tools

- `log_fix` — Dev Team logs fix
- `send_telegram` — report bug to BUG channel
- `process_telegram_report` → `log_fix` (typical dev workflow)

## Notes

- Returns newest fixes first (DESC by fixed_at)
- Default limit 10; increase to 50 for deeper history
- Chained to `process_telegram_report` workflow (dev logs fix after processing report)
- Plain text format (no Markdown, no emojis)
- Timestamps in ISO 8601 format with UTC zone
- Missing fields show "—" (dashes)
- Superseded alerts show count + individual IDs
- Title-first display for quick scanning
