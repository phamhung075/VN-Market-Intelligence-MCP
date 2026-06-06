## Task Report FIX-ORCH-DONE-GRID-COLS
changed: [apps/frontend/app/routes/dashboard.orchestration.tsx:509-706 (+39/-11)]
tests: 363 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS
verdict: APPROVED

### Verification
- Vitest 363/363 GREEN (28 test files)
- tsc --noEmit: exit 0
- DDD scan: no domain←infrastructure imports in diff
- Security: process.env at L171-172 is pre-existing SSR-origin pattern; NOT introduced by this commit (zero +/- lines touching process.env in diff)
- mock-guard.sh: exit 0 — no fabricated-data patterns
- Container: a7209d98af4c running, matches most-recent build (2026-06-06 22:39:28), layer-cache confirms same source
- HTTP live: localhost:3001/dashboard/orchestration → 200
- Commit diff: exactly 1 file, no force-adds (new file mode absent)
- scope: DONE_GRID constant, DecisionAccordion statusNote prop, Title min-w-0/break-words, note line-clamp-2, fixed-cell truncate, status_note moved to accordion banner
