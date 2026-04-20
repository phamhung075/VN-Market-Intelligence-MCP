# TASK 1499_a — TDD RED: GSO macro VPS push endpoint

## TLDR

branch: task/1499-gso-macro-vps-push
test_file: src/__tests__/1499-gso-macro-vps-push.test.ts
endpoint: /api/push-gso
table: macro_indicators (existing)
depends_on: 1495 (Done — tradingeconomics push, same table)

ACs:
- AC-1: valid payload + X-API-Key → 200 + {ok:true, country:"VN", upserted:true}
- AC-2: unknown indicator names → still 200 + upserted:true (row upserted, cols ignored)
- AC-3: wrong/missing X-API-Key → 401
- AC-4: malformed payload (not-JSON / missing indicators / non-array indicators) → 400 + {error}
- AC-5: fetched_at in macro_indicators row is within last 10s after push (non-stale)
- AC-6: second push updates fetched_at to be >= first push timestamp

files_to_read:
- src/interface/mcp/server.ts:1389-1465   # push-tradingeconomics handler (pattern to follow)
- src/infrastructure/db/schema.ts:360-390 # macro_indicators schema

files_to_modify: []  # RED phase — no prod code written

files_to_create:
- src/__tests__/1499-gso-macro-vps-push.test.ts

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1499-gso-macro-vps-push.test.ts   # created: 10 RED assertions, 4 describe blocks

tests_written:
- src/__tests__/1499-gso-macro-vps-push.test.ts   # 10 assertions, all RED (0 pass, 10 fail)

tests_skipped: []

tsc_clean: true   # test file only imports existing types, no new prod code
full_suite_pass: N/A   # RED phase — task tests intentionally fail

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1499-gso-macro-vps-push.test.ts

merge_commit: 8d0dd7d
