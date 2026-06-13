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

## Live-Verify Gate (cycle-258 · 2026-06-13 · commit 2d2a0bc5)
Container rebuilt: image 302d5cb6→1042a2a9, toolCount 157, DB intact.
- UNIT UNCACHED: bun test TSU-DEV-U5 + vnstock-foreign-flow --no-cache → 28/0 (488ms)
- TSC: exit 0 (clean)
- FENCE RED PROOF: hasRealHoldingData=true break → T-U5-1 RED (0.00% fabricated column appeared) + T-U5-FENCE nullOutput RED. 9/2 fail. Restore → 11/0 GREEN. Gate is real.
- LIVE FPT: table = "Date | Net Vol (daily) | Foreign Room" — Holding Ratio column ABSENT. No fabricated 0.00%.
- LIVE VNM: same — Holding Ratio column ABSENT.
- LIVE HPG: same — Holding Ratio column ABSENT.
- COMPANY PROFILE FPT: foreign_holding_ratio: null (not fabricated 0).
- RESIDUAL ?? 0 AUDIT: foreignFlowTools.ts:105 inside if(hasRealHoldingData); foreignFlowAnalyzer.ts:115 inside isHoldingRatioFabricated ? null : guard. Both real-data-only paths. Not fabrication.
- MOCK-GUARD: exit 0. DDD: PASS. SECURITY: PASS.
- DSI INVARIANT: live-confirmed. "no data" = column omitted across all 3 tickers. Never 0%-everywhere fabrication.

verdict: APPROVED (live-verify complete)

## Merge Status
Commit 2d2a0bc5 on main (branch task/TSU-DEV-U5 merged by developer before QA live-verify gate, confirmed scope-clean).
No additional merge action required.
