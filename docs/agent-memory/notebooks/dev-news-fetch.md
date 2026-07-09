# dev-news-fetch — Notebook

## c001 · 2026-07-09T21:52Z

Task: FACTORY-NEWS-dedup-normalizeDate (BOUNDED-1 idle-capacity pickup, P1/S/low-risk).

Deduped the two byte-identical `normalizeDate` copies in `bloomberg-stealth.ts`/`reuters-stealth.ts` into
`src/primitive/published-at-parser/index.ts` (`parsePublishedAt` core + new null-tolerant `normalizeDate`
wrapper). Stale-premise catch: router's dispatch note claimed no test imports the stealth `normalizeDate`
directly — FALSE, 2 test files (`1899a-bloomberg-normalize-date.test.ts`,
`1899a-reuters-fallback-lifecycle.test.ts`) import it by name from the stealth infra files. Fixed by
re-exporting the primitive symbol from both stealth files instead of a bare deletion. Full trail:
`docs/agent-memory/decisions/dev-news-fetch-20260709T2152Z-FACTORY-NEWS-dedup-normalizeDate.md`.

Verification: `bun test` 233 pass/6 skip/0 fail; `bun tsc --noEmit` clean; G12 sandbox 16/16 PASS; direct
before/after comparison script (12 date-format inputs, 3 post-edit call sites) = 0 mismatches vs
pre-edit inlined implementation. Line counts: bloomberg-stealth.ts 151→142L, reuters-stealth.ts 134→125L.

Closed to `task_board.review[]` (not `done_verified`) — `news-fetch` is a `docker-compose` service, live
container still runs pre-change image, rebuild is user-gated to ops. Deferred RAW-verify signal:
`docs/signals/ops-rebuild-verify-news-fetch-20260709T2152Z.json`.

Zone health: no drift detected — `apps/news-fetch/` primitive/infra split is clean; this was the last
remaining date-normalization duplication in the zone (RSS-side `normalizeRfcDate` dupe was already
deduped in a prior task per the primitive's own header comment).
