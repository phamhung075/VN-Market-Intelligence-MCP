# Code Janitor Procedures

## Canonical Sources (three sources of truth)

| Data | Canonical source | Location |
|------|-----------------|----------|
| Ticker classification (sector, exchange) | `SECTOR_PEERS` | `src/domain/services/sectorPeers.ts` |
| Ticker display name + aliases | `STOCK_CATALOG` | `src/domain/services/stockAliases/catalog.ts` (re-exported unchanged from `stockAliases.ts`) |
| Default watchlist membership | `market.watchlist` | `mcp.config.json` |
| Cron expressions | `CRONS` map | `src/scheduler/jobs.ts` |
| Per-host timeout / retry / threshold values | `mcp.config.json` sections | `mcp.config.json` |
| DB schema (table definitions) | `initDatabase()` | `src/infrastructure/db/schema.ts` |

## Scan Checklist (run in order)

### Check 1 — Duplicate classification maps
Search for `Record<string,` and object literals keyed on uppercase ticker symbols outside canonical files. Flag any map that duplicates sector, exchange, or display-name data.

### Check 2 — Hard-coded ticker arrays
Search for array literals with 2+ uppercase ticker strings outside canonical files + tests. Classify: data duplication (flag) vs business rule (skip) vs config default (check staleness).

### Check 3 — Repeated magic numbers / cron expressions
Search for cron strings and timeout/threshold numbers. Flag any cron string also in `jobs.ts:CRONS`. Flag numeric thresholds appearing identically in 3+ files.

### Check 4 — Schema duplication
Search for `CREATE TABLE IF NOT EXISTS` in TypeScript files outside `schema.ts` and `src/__tests__/`. Production inline DDL = severity HIGH.

### Check 5 — Config drift
Search for `?? [` and `?? "` fallback patterns. Verify fallback matches actual `mcp.config.json` value.

## What NOT to flag
- `cascadeEngine.ts` keyword → sector rules (domain logic)
- `climateImpactMapper.ts` event → stocks maps (business rules)
- `src/__tests__/` files (test fixtures)
- Comments, doc strings, log messages
- Code style, naming, abstractions

## Output Contract (three sections, always present)

### Section 1 — Findings
```
FINDINGS (code-janitor <YYYY-MM-DD HH:mm VN>)
[HIGH|MEDIUM|LOW] <category> — <file>:<line>
  Duplicate: <what>  Canonical: <where>  Risk: <what breaks>
(0 findings — clean)
```
Severity: HIGH=production divergence, MEDIUM=two-edit maintenance, LOW=minor redundancy

### Section 2 — Fix candidates
```
FIX CANDIDATES (ranked)
1. <title> | Files: <list> | Change: <one sentence> | LOC: ~N removed | Risk: low|medium|high | Ship directly: yes|no | Reason: <why>
```
"Ship directly: yes" only when: single file, mechanical, existing test coverage, no schema/scheduler/MCP changes.

### Section 3 — Clean areas
List every check that found nothing (confirms scan ran).

## State File

`docs/data/code-janitor-known-findings.json`
- Fingerprint: `<check_category>:<relative_file_path>:<symbol_name>` (no line numbers)
- Skip known findings on subsequent runs
- Auto-expire after 30 days
- Remove fingerprint when finding disappears
