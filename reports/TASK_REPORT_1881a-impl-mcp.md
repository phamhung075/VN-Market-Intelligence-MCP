# Task Report: 1881a-impl-mcp — source_tier retrofit 16 MCP tools + contract tests
date: 2026-05-14
outcome: APPROVED

## Test Results
- Contract tests (1881a-source-tier.test.ts): 20 pass / 0 fail
- Full suite: 9234 pass / 34 fail (34 pre-existing, unchanged baseline — developer confirmed)
- TypeScript: 0 errors (tsc --noEmit clean)

## DDD Compliance: PASS
grep `from '@/domain` / `from '@/infra` on all changed interface/* files — 0 new violations.
Existing imports in foreignFlowTools.ts and macroTools.ts pre-date this task (unchanged paths).

## Security: PASS
- No hardcoded secrets or API keys introduced.
- No process.env usage (Bun.env only in test file line 16).
- All SQL in this diff: no new raw SQL in interface layer.

## Zone Check: PASS
All 16 modified tool files are within `apps/mcp-server/src/interface/mcp/tools/{macro,news-analysis,market-data}/`.
Test file in `apps/mcp-server/src/__tests__/`. No leakage into other apps/* or docs/standards/.

## Tier Spot-checks (3 tools vs REQ_1881a.md)
- `get_imf_signals` (imfSignals.ts): tier 1 envelope + per-record tier 1 — CORRECT (IMF DataMapper).
- `get_macro_snapshot` (macroTools.ts): tier 2 text-wrap — CORRECT (Yahoo Finance + VCB XML proxy).
- `get_insider_transactions` (insiderTools.ts): tier 1 — CORRECT (SSC official portal).

## Tier Note (non-blocking)
TASK_1881a-impl-mcp.md tier table shows `get_sentiment_trend` = 2 and `get_policy_signals` = 2.
REQ_1881a.md (authoritative spec) assigns both as tier 3 (derived from rag_analyses).
Developer used tier 3 matching the spec. Task handoff table was stale for these 2 tools.
Contract tests assert tier 3 and pass. No blocking issue.

## AC Checklist
- AC-1: source_tier on every path including errors — PASS (all 16 tools verified via test + spot-check)
- AC-2: JSON-output tools → source_tier first root field — PASS (AC-8 first-key tests green)
- AC-3: Text-output tools → JSON wrapper {source_tier, text, fetchedAt} — PASS (4 tools tested)
- AC-4: get_imf_signals indicators[].source_tier=1 — PASS (2 test assertions green)
- AC-5: get_foreign_flow source_note="fallback:cache" on _testFallback="cache" — PASS
- AC-6: DDD boundary — 0 new domain/infra imports in interface/* — PASS
- AC-7: tsc --noEmit 0 errors; source_tier T as const — PASS
- AC-8: Error envelopes include {source_tier: T, error: "..."} — PASS (imfSignals.ts L113, macroTools.ts L657-661)
- AC-9: 34 pre-existing fails unchanged, 20/20 new contract tests green — PASS

## Issues Found
### Blocking
None.

### Non-Blocking
- TASK handoff tier table (get_sentiment_trend, get_policy_signals): stale — shows tier 2, spec says tier 3. Informational only; dev correctly followed spec.

## Merge Status
Merged: task/1881a-impl-mcp → main (--no-ff)
Branch deleted: local + remote
