## Task Report TSU-DEV-U2-GEN
date: 2026-06-07
sprint: TOOL-SURFACE-UPGRADE
changed: [scripts/gen-tool-registry.ts (177L), apps/mcp-server/src/__tests__/tool-registry-parity.test.ts (269L), docs/data/tool-registry.json (regenerated 125→162 tools), docs/data/project-stats.json (toolCount synced to 162), scripts/gen-project-stats.ts (readToolCountFromRegistry() added)]
tests: 8 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS
anti-false-green: VERIFIED — __test_fake_tool__ injection caused T-U2-5 + T-U2-6 to FAIL (RC=1); revert → 8 pass (RC=0)
generator-dry-run: totalCount=162, 12 groups, idempotent
verdict: APPROVED
commits: a5b34816 / 2069158c / 5c63741b
