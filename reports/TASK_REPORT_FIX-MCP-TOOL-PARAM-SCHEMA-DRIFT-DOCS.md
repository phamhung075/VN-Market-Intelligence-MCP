# Task Report: FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS
date: 2026-06-14
outcome: APPROVED

## Summary

Pure docs/agents/*.md tool-package param-doc drift fix. 7 confirmed drifts corrected in commit
`0e81b642` by agent-father. No runtime/schema/DDL changes. No rebuild required.

## Verification Method

Live-schema evidence sourced from:
1. Server source Zod schemas in `apps/mcp-server/src/interface/mcp/tools/**/*.ts`
2. Canonical tool list docs `docs/agents/tools/list/<tool>.md`
3. Fix commit `0e81b642` diff (11 files, 36 insertions / 36 deletions)
4. Stale-zero grep across `docs/agents/` post-fix

---

## Per-B Verification Table

| B# | Tool | Fix | Packages Checked | Live-Schema Evidence | Result |
|----|------|-----|-----------------|---------------------|--------|
| B3 | `get_bctc_full` | `ticker` → `code` | bctc-analyst, digest-predict, qa-responder, unified-agent | `bctcFullTools.ts:877` `code: z.string().min(2).max(10)` required | PASS |
| B6 | `get_patterns` | `{stockCode, eventKeyword}` required | market-watcher.md | `marketTools.ts:378` `stockCode: z.string()` + `eventKeyword: z.string()` both required | PASS |
| B7 | `get_sentiment_trend` | add `stock_code` required | unified-agent.md | `sentimentTrendTools.ts:164` `stock_code: z.string().optional()` — semantically required (runtime guard at line 177: `if (!raw) return error`) | PASS |
| B8 | `get_kinhdich_reading` | `ticker` → `code` | market-watcher, unified-agent, bctc-analyst (alert-commander already had `code`) | `kinhDichTools.ts:447` `code: z.string().min(1).max(10)` required | PASS |
| B9 | `get_agent_signals` | add `agent` required | news-scout.md | `agentSignalTools.ts:443` `agent: z.string()` required (no `.optional()`) | PASS |
| B11 | `get_market_summary` | add `period` required | digest-predict.md | `summaryTools.ts:61` `period: z.enum([...])` required (no default, no optional) | PASS |
| B12 | `get_financial_summary` | `ticker` → `actionCode` + capability_manifest pdf probe | market-analyst.md + system-map.json | `reports.ts:234` `actionCode: z.string().min(2).max(10)` required; system-map `capability_manifest.pdf.probe = "get_financial_summary"` (set in commit `078fcc13`) | PASS |

---

## Stale-Zero Verification

Post-fix grep results across `docs/agents/`:
- `get_bctc_full` + `ticker` (as param, not description): 0 hits where param name = `ticker`
- `get_kinhdich_reading` + `ticker` (as param): 0 hits
- `get_financial_summary` + `ticker:` (as param): 0 hits
- All package files use `code`, `stockCode`, `stock_code`, `agent`, `period`, `actionCode` as documented

One benign "ticker" occurrence in market-analyst.md line 153 description text:
"Full quarterly financials for a ticker" — this is colloquial English in the purpose column,
NOT a param name. Param column shows `code` (req). Not a drift.

---

## Scope Verification

- **Docs-only**: All changes in `docs/agents/tools/package/*.md`, `docs/agents/tools/list/*.md`,
  `docs/agents/bctc-analyst/flow/deep-dive-opus.md`. Zero source file changes.
- **No rebuild required**: Confirmed. Pure doc edits.
- **No zone contention**: `zone_owner = cross-service/` — no overlap with sibling
  `T1-ARCH-CRON-T4-DEDUP-GUARDS` in `apps/mcp-server/`.
- **Generic fixes**: Param-name/requirement corrections apply to ALL tickers/agents.
  No per-instance hardcode introduced.

---

## Fix Commit

- SHA: `0e81b642`
- Files: 11 docs files changed (36 ins / 36 del)
- Message: `fix(agent-docs): FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS — correct 7 tool param schemas`

## Test Results

- Unit tests: N/A (docs-only task, no source changes)
- TypeScript: N/A
- bun test: N/A

## DDD Compliance: N/A (docs-only)
## Security: N/A (docs-only)

## Issues Found
### Blocking
None.

### Non-Blocking
- `get_sentiment_trend`: Zod schema uses `.optional()` but the runtime guard makes `stock_code`
  semantically required. Docs correctly say `(req)`. No action needed — aligns with server behavior.
- Structural DRY debt: package Key Params columns duplicate list/<tool>.md schema in short form.
  Pre-existing, out-of-scope for this task per agent-father's fix commit note.

## Merge Status

APPROVED — promote review[] → done_verified[].
