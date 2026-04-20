# Task Context — 1504_b: GREEN — schema + stores + MCP tool for cascade outcome tracking

## TLDR (read this first — complete for simple tasks)
change: schema.ts (2 injection points) + cascadeHitStore.ts (extend recordHit + add updateOutcome) + marketMessageStore.ts (add updateImpact) + cascadeOutcomeTools.ts (NEW) + registry.ts (register tool)
test: src/__tests__/1504-cascade-outcome.test.ts — 11 assertions must all PASS
branch: task/1504b-cascade-outcome-green
depends: 1504_a ✓
knowledge_needed: [bundle-developer]

---

sprint: 191
branch: task/1504b-cascade-outcome-green
status: todo
req_ref: REQ-191
tech_ref: TECH-191

---

## [PM] Planning Context

layer: infrastructure + interface
depends_on: [1504_a ✓ merged]

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_191.md   # exact injection points + interface contracts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts   # lines 1082, 1491 injection points
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/cascadeHitStore.ts   # recordHit() at line 42; insert after line 54
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/marketMessageStore.ts   # append updateImpact after batchReviewMarketMessages
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/registry.ts   # line 144 — add registerCascadeOutcomeTools entry
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1504-cascade-outcome.test.ts   # 11 assertions to satisfy

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/cascadeOutcomeTools.ts   # CREATE: registerCascadeOutcomeTools + get_cascade_outcomes tool

files_to_modify:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts   # MODIFY: inject ALTER blocks at lines 1082 and 1491
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/cascadeHitStore.ts   # MODIFY: extend recordHit() + add updateOutcome()
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/marketMessageStore.ts   # MODIFY: add updateImpact()
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/registry.ts   # MODIFY: import + register cascadeOutcomeTools

test_file: src/__tests__/1504-cascade-outcome.test.ts

acceptance_criteria:
- Given schema.ts is run with ALTER injections for cascade_rule_hits (+5 cols) and market_messages (+3 cols)
- When bun test src/__tests__/1504-cascade-outcome.test.ts is run
- Then all 11 assertions PASS (GREEN phase)
- And bun tsc --noEmit shows 0 errors
- And updateOutcome() returns false when id not found (no rows changed)
- And updateImpact() returns false when id not found
- And all-undefined outcome passed to updateOutcome() is a no-op (no SQL run)
- And get_cascade_outcomes tool registered in registry.ts (tool count → 101 per TECH doc note)
- And migrations are idempotent (try/catch per ALTER, no throw on re-run)
- And SQL queries use parameterized bindings only (no string interpolation)

## Key implementation details (from TECH-191)

schema.ts injection 1 — after line 1082 (idx_cascade_hits_at index):
  try/catch loop for 5 ALTERs on cascade_rule_hits

schema.ts injection 2 — after closing `);` of CREATE TABLE market_messages (line 1491):
  try/catch loop for 3 ALTERs on market_messages

recordHit() new optional params: sourceRagId?, confidence? — undefined becomes NULL via ?? null

updateOutcome() — dynamic SET clause, parameterized, returns changes > 0

updateImpact() — same partial-update pattern as reviewMarketMessage()

get_cascade_outcomes query:
  SELECT id, rule_key, hit_at, affected_stocks, price_impact_3d, price_impact_7d,
         outcome_correct, confidence, source_rag_id
  FROM cascade_rule_hits
  WHERE hit_at >= datetime('now', '-' || ? || ' days')
  [AND affected_stocks LIKE ?]
  ORDER BY hit_at DESC LIMIT 200

Output: formatted text table + JSON rows; confidence as percentage; empty array (not error) on 0 rows
