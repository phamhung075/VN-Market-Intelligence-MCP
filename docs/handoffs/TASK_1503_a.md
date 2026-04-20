# Task Context — 1503_a: TDD RED — 5 failing assertions (ohlcv-foreign-flow)

## TLDR (read this first)
change: `src/__tests__/1503-ohlcv-foreign-flow.test.ts` — NEW, 5 failing assertions
test: `src/__tests__/1503-ohlcv-foreign-flow.test.ts` — 5 assertions, all must be RED
branch: task/1503a-ohlcv-foreign-flow-red
depends: none

knowledge_needed: [bundle-developer]

---

sprint: 190
branch: task/1503a-ohlcv-foreign-flow-red
status: todo
req_ref: REQ-190
tech_ref: TECH-190

---

## [PM] Planning Context

layer: test
depends_on: none

files_to_create:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1503-ohlcv-foreign-flow.test.ts`   # NEW — 5 TDD RED assertions

test_file: src/__tests__/1503-ohlcv-foreign-flow.test.ts

## Assertions to write (all must fail initially)

1. `daily_ohlcv` table has columns `foreign_buy_vol`, `foreign_sell_vol`, `foreign_net_vol`, `put_through_vol` after migration runs
2. `writeForeignFlowToOhlcv([{code:'VCB', date:'2026-04-19', foreignBuyVol:1000, foreignSellVol:600, putThroughVol:50}])` returns `changes >= 0` and the `daily_ohlcv` row for VCB/2026-04-19 has `foreign_net_vol = 400`
3. `writeForeignFlowToOhlcv` with no matching OHLCV row returns `0` (update-only, no stub rows)
4. `assembleEveningSummary` result includes `foreignFlowMovers: ForeignFlowMover[]` field; when data present, top entry has `|foreignNetVol|` largest
5. `eveningSummaryJob` formatter includes "Khối ngoại" block when `foreignFlowMovers.length > 0`

## Acceptance Criteria

**Given** no implementation code exists yet
**When** `bun test src/__tests__/1503-ohlcv-foreign-flow.test.ts` is run
**Then**
- All 5 assertions fail (RED)
- No TypeScript errors in the test file itself (imports may use `// @ts-expect-error` where types don't exist yet)
- `bun tsc --noEmit` passes (or only errors are in implementation files, not test file)

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1503-ohlcv-foreign-flow.test.ts   # NEW — 5 TDD RED assertions, all failing

tests_written:
- src/__tests__/1503-ohlcv-foreign-flow.test.ts   # 5 assertions, all RED

tests_skipped: []

tsc_clean: true
full_suite_pass: n/a (RED phase — implementation files don't exist yet)
