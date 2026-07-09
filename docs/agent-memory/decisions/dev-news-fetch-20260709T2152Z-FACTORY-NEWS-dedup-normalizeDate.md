# Decision Journal — FACTORY-NEWS-dedup-normalizeDate

**Agent:** dev-news-fetch (generic `developer` owner — zone-routed per system-map.json, no dedicated Agent-tool subagent type for `apps/news-fetch/`)
**Task ID:** FACTORY-NEWS-dedup-normalizeDate
**Timestamp:** 2026-07-09T21:52Z

## Stale-Premise Correction (found live, before removing local definitions)

The router's dispatch note said: "No test currently imports the stealth normalizeDate, so no re-export
shim is needed — confirm this is still true before removing the local definitions." This was FALSE.

`grep -rln "bloomberg-stealth\|reuters-stealth" apps/news-fetch --include="*.ts" | grep -i test` surfaced
two tests that import `normalizeDate` **by name, directly from the stealth infra files**:
- `apps/news-fetch/__tests__/1899a-bloomberg-normalize-date.test.ts` —
  `const { normalizeDate } = await import('../src/infrastructure/scrapers/bloomberg-stealth.js')`
- `apps/news-fetch/__tests__/1899a-reuters-fallback-lifecycle.test.ts` —
  `const { ReutersStealthFallback, normalizeDate } = await import('../src/infrastructure/scrapers/reuters-stealth.js')`

Removing the local `export function normalizeDate` without a re-export would have broken both test files
(named-export not found). Fixed by re-exporting the imported primitive symbol from each stealth file
(`export { normalizeDate }` immediately after the import), so both call sites (internal usage +
test-file named imports) keep working unmodified.

## Decision

- Added `normalizeDate(dateStr: string | null | undefined): string | null` to
  `apps/news-fetch/src/primitive/published-at-parser/index.ts` — a null-tolerant wrapper: `if (!dateStr)
  return null; return parsePublishedAt(dateStr);`. `parsePublishedAt` (already-existing primitive,
  originally deduped from `reuters-rss.ts`/`bloomberg-rss.ts` normalizeRfcDate) is the core; the wrapper
  only adds the null/undefined short-circuit that DOM/JSON-extracted values from Playwright scrapers need
  but RSS-feed strings never do.
- `bloomberg-stealth.ts` and `reuters-stealth.ts`: removed the byte-identical local
  `export function normalizeDate` (lines 141-150 and 124-133 respectively, confirmed byte-identical by
  the router pre-dispatch), replaced with `import { normalizeDate } from
  '../../primitive/published-at-parser/index.js';` + `export { normalizeDate };` (re-export shim, see
  Stale-Premise Correction above).

## What Considered

1. **Delete local definitions, import primitive, no re-export (as router originally specced):**
   REJECTED — would break the two named-import tests above. Confirmed live via grep before acting, not
   assumed from the stale spec note.
2. **Delete local definitions, import primitive, re-export the symbol (chosen):** SELECTED — single home
   for the logic in the primitive, zero test churn, zero behavior change. Matches the existing
   `parsePublishedAt` re-use pattern already used by `bloomberg-rss.ts`/`reuters-rss.ts`
   (`import { parsePublishedAt } from '../../primitive/published-at-parser/index.js'`).
3. **Give `parsePublishedAt` itself a nullable signature instead of adding a separate wrapper:**
   REJECTED — `parsePublishedAt`'s existing signature (`(rfcDate: string): string | null`) and its 3
   existing call sites in `bloomberg-rss.ts`/`reuters-rss.ts` always guard with `pubDate ? parsePublishedAt(pubDate)
   : null` at the call site; widening the primitive's own signature would be an unrelated, unrequested API
   change to a function 2 other files already depend on. A thin `normalizeDate` wrapper is the minimal,
   additive change the DoD actually asked for ("Add a null-tolerant normalizeDate wrapper to the
   primitive").

## Why This Change

- Collapses the last duplicated date-normalization logic in `apps/news-fetch` into one primitive home;
  `parsePublishedAt` (RSS path) and `normalizeDate` (stealth/DOM path) now share the same core parse+
  format logic instead of three independently-maintained copies (2 byte-identical stealth copies + the
  RSS primitive).
- Zero behavior change intended or observed (see Verification).

## Verification

- `bun test` (full suite, `apps/news-fetch/`): 233 pass / 6 skip / 0 fail / 372 expect() calls, 26 files
  — includes both `1899a-bloomberg-normalize-date.test.ts` (7 tests) and
  `1899a-reuters-fallback-lifecycle.test.ts` (10 tests, 7 of which cover `normalizeDate`) unmodified and
  green.
- `bun tsc --noEmit`: 0 errors.
- `find docs/scenarios/news-fetch -name '*.json' -exec jq . {} \;` — all scenario JSON valid.
- G12 sandbox gate: `bun run sandbox --tier=all --module=news-fetch` → 16 PASS, 0 FAIL, 0 ERROR
  (includes `published-at-parser [golden/edge/failure]`).
- **Direct before/after comparison** (DoD explicitly requires more than "tests pass"): wrote a standalone
  script importing (a) the exact old inlined `normalizeDate` body (copied byte-for-byte from
  `git show HEAD:apps/news-fetch/src/infrastructure/scrapers/bloomberg-stealth.ts` pre-edit) and (b) the
  new primitive-backed `normalizeDate` from all three post-edit locations (bloomberg-stealth re-export,
  reuters-stealth re-export, primitive direct export). Ran both against 12 inputs: `null`, `undefined`,
  `''`, `'   '`, `'not-a-date'`, ISO-Z, ISO+07:00-offset, RFC 2822 GMT, RFC 2822+0700-offset, date-only
  `'2026-01-01'`, a malformed numeric-overflow date string, and the literal `'Invalid Date'`. Result:
  **0 mismatches across all 12 cases and all 3 post-edit call sites** — output is byte-identical to the
  pre-edit implementation.

## Deferred / Not Closed Here

`news-fetch` runs as a `docker-compose` service (`docker-compose.yml` service `news-fetch`, built from
`apps/news-fetch` context). The live container still runs the pre-change image. Per
`feedback_user_gates_delegate_to_ops.md` (container swaps/rebuilds are user-gated), this task is **kept
in `task_board.review[]`, not self-asserted `done_verified`**. Deferred live-container RAW-verification
tracked in `docs/signals/ops-rebuild-verify-news-fetch-20260709T2152Z.json` (non-blocking, P2) — ops
rebuilds `news-fetch`, then confirms a live/replayed Bloomberg-stealth + Reuters-stealth fetch produces
`publishedAt` values matching the pre-rebuild baseline.
