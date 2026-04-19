# Task Context — 1495_a: RED tradingeconomics-vps-push

## TLDR
change: src/__tests__/1495-tradingeconomics-vps-push.test.ts — write failing tests only
test: src/__tests__/1495-tradingeconomics-vps-push.test.ts — 5 assertions
branch: task/1495-tradingeconomics-vps-push
depends: none

---

sprint: 189
branch: task/1495-tradingeconomics-vps-push
status: todo
req_ref: REQ-189
tech_ref: TECH-189

---

## [PM] Planning Context

layer: interface
depends_on: none

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts   # macro_indicators current cols

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1495-tradingeconomics-vps-push.test.ts   # CREATE

files_to_modify: none (RED phase)

test_file: src/__tests__/1495-tradingeconomics-vps-push.test.ts

acceptance_criteria:
- Given POST /api/push-tradingeconomics {country:"VN", indicators:[{name:"unemployment_rate",value:2.1,unit:"%",fetched_at:"..."}]}
  When handler runs
  Then 200 + {ok:true, country:"VN", updated_cols:1}
- Given indicator name not in TE_COLUMN_MAP allowlist
  When pushed
  Then col ignored (no SQL error, updated_cols excludes it)
- Given bad X-API-Key
  When POST sent
  Then 401
- Given valid push with 3 known indicators
  When runs
  Then macro_indicators row updated with 3 cols, updated_cols:3
- All assertions FAIL before prod code added (RED confirmed)

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1495-tradingeconomics-vps-push.test.ts   # created: 8 RED assertions across 4 AC groups

tests_written:
- src/__tests__/1495-tradingeconomics-vps-push.test.ts   # 8 assertions, all FAIL (RED confirmed)

tests_skipped: []

tsc_clean: n/a (RED phase — no prod code)
full_suite_pass: n/a (RED phase)
