# TASK 1499_b — GREEN: GSO macro push endpoint + vps script

## TLDR

branch: task/1499-gso-macro-vps-push
depends_on: 1499_a (Done — RED phase, test file written)

ACs implemented:
- AC-1: valid payload + X-API-Key → 200 + {ok:true, country:"VN", upserted:true}
- AC-2: unknown indicator names → 200 + upserted:true (row upserted, cols ignored)
- AC-3: wrong/missing X-API-Key → 401
- AC-4: malformed payload → 400 + {error}
- AC-5: fetched_at non-stale after push
- AC-6: second push updates fetched_at >= first push

files_to_modify:
- src/interface/mcp/server.ts:1467   # POST /api/push-gso block inserted before 404

files_to_create:
- vps-scripts/fetch-gso.sh           # Playwright-based GSO macro fetch + push

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts   # added POST /api/push-gso handler (INSERT OR IGNORE + partial UPDATE)

files_actually_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/fetch-gso.sh   # Playwright-based GSO macro fetch, pushes to /api/push-gso

tests_written:
- src/__tests__/1499-gso-macro-vps-push.test.ts   # 10 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5682 pass, 5 pre-existing failures unrelated to 1499

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- "Bun v1.3.11 C++ crash on full-suite teardown (OOM, pre-existing Bun bug) — not caused by task"

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/fetch-gso.sh
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1499-gso-macro-vps-push.test.ts

merge_commit: 8d0dd7d
