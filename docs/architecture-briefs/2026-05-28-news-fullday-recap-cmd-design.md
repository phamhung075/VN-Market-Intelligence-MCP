# Architecture Brief — NEWS-FULLDAY + RECAP-CMD (combined)

**Date:** 2026-05-28
**Architect:** architect
**Sprints:** NEWS-FULLDAY, RECAP-CMD
**Zone:** `apps/mcp-server/` only
**Dev owner:** dev-mcp-server (one pass, one ops rebuild)
**Refs:** `docs/REQ_NEWS-FULLDAY.md`, `docs/REQ_RECAP-CMD.md`, `docs/handoffs/TASK_NEWS-FULLDAY.md`, `docs/handoffs/TASK_RECAP-CMD.md`

---

## 1. Scope

Two sibling sprints, one file, one dev pass, one ops rebuild. Both touch only `telegramCommands.ts` and the test file `214-telegram-commands.test.ts`. No schema change, no new service, no new cron, no `docker-compose.yml` change.

The combined [Architect] sections in the two handoff files are the authoritative design source. This brief captures only the cross-sprint shared decisions and the rationale for the four deferred items.

---

## 2. Shared asset: `stripHtml`

`stripHtml` is confirmed greenfield — absent from all of `apps/mcp-server/src/` (grep-verified 2026-05-28). It is defined exactly once in `telegramCommands.ts` (NEWS-FULLDAY sprint) as a module-level export. RECAP-CMD reuses it with no second definition.

Signature: `export function stripHtml(raw: string | null | undefined): string`

Implementation: regex-based, dependency-free. Two-pass: first remove void elements (img, br, hr, input, meta, link, area, base, col, embed, param, source, track, wbr) entirely; then strip all remaining tag brackets. Collapse whitespace. Wrapped in try/catch — never throws on malformed input. Returns empty string for null/undefined.

---

## 3. NEWS-FULLDAY resolved decisions

### B1 — Full-day cap: REMOVE the LIMIT clause

The primary query (no-arg `/news`) drops the `LIMIT ?` clause entirely. `DEFAULT_LIMIT` constant is removed. `MAX_LIMIT` is renamed `MAX_LIMIT_EXPLICIT` and raised to **200**.

`FALLBACK_LIMIT = 20` is a new named constant for the degraded-fallback path (today=0 rows → most-recent 20 across all dates).

Rationale: removing LIMIT is self-documenting (no hidden assumption); `chunkStories` is the length safety-valve; SQLite full-scan on a time-bounded ~200-row table is not a performance risk; the explicit `/news N` path is unaffected.

### B2 — Fallback cap: `FALLBACK_LIMIT = 20`

PO ruled the fallback must be capped. The architect picks **20**. Named constant. Applies regardless of user's explicit N argument (the fallback is degraded stale data — user's N request is inapplicable).

---

## 4. RECAP-CMD resolved decisions

### B1 — Section-block overflow strategy

Pre-split section blocks at newline boundaries before passing to `chunkStories`. Helper: `splitBlockAtNewlines(block, maxLen=4096)`. Appends `\n(tiếp theo…)` to non-final sub-blocks.

Maximum realistic block size assessment:
- Section 3 watchlist movers (30 tickers): `~950 chars` — well under 4096.
- Section 4 (periodic) stock performance (30 tickers): `~950 chars` — well under 4096.
- Section 5 alert breakdown with 3 top-alert messages (100 chars each): `~400 chars` — safe.

The 30-ticker watchlist does NOT realistically hit the overflow limit. The `splitBlockAtNewlines` helper is defensive infrastructure for future growth and for contrived test cases (T-RECAP-3 seeds 30 movers with long codes).

### B2 — Test injection: `assembleFn` wrapper

The `assembleFn` optional parameter is the correct approach. The real assembly functions have side effects (`writeFileSync` for evening summary, DB upsert for periodic summary) and depend on many DB tables. Injecting a hardcoded typed object via `assembleFn` isolates the handler's render logic from the use-case internals — this is what the tests are actually testing. The routing tests (T-RECAP-RT-*) use real handlers with minimal DB and verify only that commands are recognised.

The `assembleEveningSummary({ db, reportsDir: "/tmp/test-reports" })` path with the real function and in-memory DB is a valid alternative but is ruled out because: (a) it couples test output to assembly logic internals, (b) it requires seeding many additional tables to produce predictable output, (c) the `writeFileSync` side-effect, while caught, still creates `/tmp/test-reports/` entries in the test runner — minor but unclean.

---

## 5. DDD import direction confirmation

`telegramCommands.ts` (infrastructure/notifiers) calling `assembleEveningSummary` and `generatePeriodicSummary` (application/usecases) is a valid DDD direction. Infrastructure may call application use-cases. The handlers read domain value objects returned by those use-cases — they do not call domain services directly. The `summaryText` and `recommendation` fields exist on `PeriodicSummary` but are provably unreachable from the render path (enforced by NFR-1-AC-6 grep mandate in tests).

---

## 6. One-pass implementation order

Within `telegramCommands.ts` (single commit after all changes):

1. Add `stripHtml` export (NEWS-FULLDAY)
2. Refactor `handleNews` — constants + uncapped query + dedup + strip (NEWS-FULLDAY)
3. Update HELP_TEXT `/news` line (NEWS-FULLDAY)
4. Add imports for `assembleEveningSummary` + `generatePeriodicSummary` (RECAP-CMD)
5. Add `splitBlockAtNewlines` helper (RECAP-CMD)
6. Add `handleRecap`, `handleRecapWeek`, `handleRecapMonth` (RECAP-CMD)
7. Add three router branches in `handleTelegramCommand` (RECAP-CMD)
8. Add three HELP_TEXT lines (RECAP-CMD)

Then all tests in `214-telegram-commands.test.ts`:
- T-STRIP-1..7 (stripHtml unit tests)
- T-NEWS-9..12 (handleNews: dedup, HTML strip, full-day coverage)
- T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4 (recap handlers)

One `tsc` check. One ops rebuild + force-recreate. One QA live pass at `zenmidi.com/vn-market/webhook`.

---

## 7. Frozen surfaces (must not change)

- `chunkStories` — called unchanged by both `handleNews` and recap handlers.
- `sentimentLabel`, `fmtNum`, `midnightVietnamAsUtcInline` — reused unchanged.
- `webhookHandler.ts` — already iterates `result.texts ?? [result.text]`. No change.
- `assembleEveningSummary.ts`, `generatePeriodicSummary.ts` — called as-is. No modification.
- `schema-news.ts` — read-only. No modification.
- `docker-compose.yml` — no change.
- Any file outside `apps/mcp-server/`.

---

## 8. Risk summary

| Risk | Level | Mitigation |
|---|---|---|
| `stripHtml` defined twice (one per sprint) | LOW | Both sprints land in one dev pass; grep before commit; NFR-5-AC-4 bans second definition |
| Dedup null-title handling (Symbol key) | LOW | AC-FR2-4 test case (T-NEWS-9 seeds null title) |
| SQL two-branch uncapped/capped queries | LOW | Two separate `db.prepare()` calls; no user input in SQL string |
| `assembleEveningSummary` Telegram side-effect in handler | LOW | `sendTelegramFn` not passed from handler; tests use `assembleFn` wrapper |
| Section block overflow in production | INFO | 30-ticker watchlist = ~950 chars, well under 4096; `splitBlockAtNewlines` is defensive |
| `globalSnapshot` rendered accidentally | INFO | Field not in §3-A spec; dev must not add it; NFR-1-AC-2 bans English field names |
