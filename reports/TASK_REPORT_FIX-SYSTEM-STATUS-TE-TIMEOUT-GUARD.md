## Task Report FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD
date: 2026-06-17
outcome: APPROVED (CODE gate only — done_verified WITHHELD pending ops rebuild + router live-verify)

changed:
- apps/mcp-server/src/interface/mcp/tools/system/systemTools.ts
- apps/mcp-server/src/__tests__/FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD.test.ts

tests: 6 pass / 0 fail (new AC tests) | 15 pass / 0 fail (234-system-status-merge regression) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS (exit 0)

verdict: APPROVED

### CI Full Suite (ci-per-file-isolation.sh P=8)
13145 pass / 42 skip / 17 fail

7 failing files — ALL disjoint from commit-touched files:
- src/__tests__/084-tool-market.test.ts
- src/__tests__/1324-push-news-all-sources.test.ts
- src/__tests__/1391-bb-stale-candle-skip.test.ts
- src/__tests__/1803-ta-candle-guard.test.ts
- src/__tests__/1898b-rss-degradation-regression.test.ts
- src/__tests__/FIX-ALERT-ENGINE-RSI-SINGLEDIGIT.test.ts
- src/__tests__/FIX-VPS-HEALTH-FRESHN.test.ts

Classification: pre-existing host-weather failures; last-commit on each file predates 09302e45; zero file overlap with this commit.

### Gate Results
- Genericness: PASS — withSectionDeadline applies identically to ALL 4 async sections (DB_STATUS / SOURCE_HEALTH / DATA_FRESHNESS / RECENT_ERRORS); no source allowlist; no date literal; SECTION_DEADLINE_MS constant is global, not per-source.
- Honesty: PASS — timeout text is "[LABEL] timeout/unknown — section exceeded Nms deadline"; AC-1/AC-4 verify no "ok" in timeout output.
- DDD: PASS — no new cross-layer imports; pre-existing interface→infrastructure pattern unchanged.
- Security: PASS — zero process.env; Bun.env used throughout; no hardcoded secrets; SQL parameterized.
- mock-guard: PASS (exit 0)
- DJ-GATE-1: PASS — sprint-FE-PAGE-REORG-dev-mcp-server.md §dev-mcp-server-S7 contains task-id: FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD.

### Rebuild Note
REBUILD_REQUIRED: YES. Live verification (getSystemStatus returns within 12s max even with a stalled source) requires ops to rebuild and deploy the mcp-server container. Router performs first-hand live probe post-rebuild. done_verified is NOT flipped by QA.

### Merge Status
NOT merged — no branch to merge (work landed on main per NO BRANCHES policy, commit 09302e45). Board update: review→done (code gate APPROVED), done_verified withheld.
