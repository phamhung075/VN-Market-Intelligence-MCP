## Task Report TSU-DEV-U5
date: 2026-06-07
outcome: APPROVED (code gate — live-verify pending sprint-final rebuild)

changed:
- apps/mcp-server/src/domain/services/foreignFlowAnalyzer.ts:39-40, 108-113, 154-157 (is_holding_ratio_fabricated flag + holdingRatioChange5d gate + reasoning guard)
- apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:60-119, 138-147 (formatForeignFlowOutput holding-ratio column gate, tool description updated)
- apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts:170-178 (foreign_holding_ratio null-when-0 DSI gate)
- apps/mcp-server/src/__tests__/TSU-DEV-U5-foreign-flow-null-holding-ratio.test.ts (10 test assertions)

tests: 10 pass / 0 fail (TSU-DEV-U5 suite, QA-reproduced) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: exit 0

## DSI Edge-Case Verdict
Heuristic `history.every(r => r.holdingRatio === 0)` correctly identifies fabricated data.
VPS API bgapidatafeed.vps.com.vn never returns the holding_ratio field; vnstockStore fills ?? 0 for all tickers.
A ticker with genuinely 0% foreign ownership would also trigger is_holding_ratio_fabricated=true (false-null).
This is the correct conservative DSI posture: a false-null is safer than a false-real (displaying 0.00% as genuine data is the DSI violation). Reasoning string is honest — no foreign ownership delta is appended when fabricated.

## AC Verification
- AC-U5-1: formatForeignFlowOutput omits Holding Ratio column when fabricated — PASS (foreignFlowTools.ts:98-117)
- AC-U5-2: omits Holding ratio change (5d) line when fabricated — PASS (foreignFlowTools.ts:84-88)
- AC-U5-3: tool description does not mention "holding ratio change" — PASS (foreignFlowTools.ts:138-147)
- AC-U5-4: is_holding_ratio_fabricated=true when all holdingRatio=0 — PASS (foreignFlowAnalyzer.ts:108, T-U5-4)
- AC-U5-5: foreign_holding_ratio=null when current_holding_ratio=0 — PASS (companyProfileTools.ts:173-178, T-U5-6)
- AC-U5-6: Holding Ratio column present when holdingRatio>0 — PASS (T-U5-3)
- AC-U5-7: existing columns Net Vol + Foreign Room present after fix — PASS (T-U5-7)

## Live-Verify Status
Code gate: APPROVED. Live-verify deferred to sprint-final rebuild per handoff policy.
QA-U5-1/U5-2/U5-3 live calls (get_foreign_flow/get_company_profile) pending container rebuild.

## Merge Status
Commits c21cec46 + 43894aaf already on main (branch merged by developer).
No additional merge action required.
