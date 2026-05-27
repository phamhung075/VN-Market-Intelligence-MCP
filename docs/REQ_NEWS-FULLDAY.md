# REQ_NEWS-FULLDAY — Requirement Spec: Refine `/news` to Full-day Deduped Importance-ranked Digest (+ HTML strip)

**Sprint:** NEWS-FULLDAY
**BA author:** ba
**Status:** READY FOR PO SPEC-REVIEW
**Date:** 2026-05-27
**Sprint goal SSOT:** `docs/SPRINT_GOAL_NEWS-FULLDAY.md`
**Handoff:** `docs/handoffs/TASK_NEWS-FULLDAY.md`
**Predecessor spec (reuse pattern):** `docs/REQ_NEWS-CMD.md`

---

## 1. Codebase Verification Summary

All claims verified against live code before finalising this spec.

**CONFIRMED — `handleNews` location and current behaviour.**
File: `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` L510-600
Current state: queries `rag_analyses WHERE created_at >= midnight-VN ORDER BY impact_score DESC, created_at DESC LIMIT 20` (DEFAULT_LIMIT=20, MAX_LIMIT=50). Falls back to most-recent N rows when today is empty. Renders title + 200-char summary + plain-VN sentiment. Chunks via `chunkStories` (L480) into ≤4096-char messages. Returns `{ texts: string[] }`.

**CONFIRMED — `chunkStories` already handles multi-chunk output.**
L480-500. Takes header + `storyBlocks: string[]`, splits at story boundaries, returns `string[]`. Already in use. The refinement reuses this function unchanged. No webhook change needed — `webhookHandler.ts` already iterates `result.texts`.

**CONFIRMED — `rag_analyses` schema.**
File: `apps/mcp-server/src/infrastructure/db/schema-news.ts`
Columns relevant to this spec: `id`, `source_url`, `source_title`, `summary`, `sentiment`, `impact_score`, `created_at`, `published_at`. Production schema has a UNIQUE index on `source_url WHERE source_url IS NOT NULL AND source_url != ''` — this prevents exact-URL duplicates at INSERT time but does NOT prevent same-story duplicates that arrive from different feed URLs (cafef vs vnexpress vs reuters covering the same event with different URLs and slightly different titles). Render-time dedup is therefore required.

**CONFIRMED — existing T-NEWS suite (T-NEWS-1..8) is in `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts`.**
Tests use in-memory Bun SQLite DB with `seedNewsToday` / `seedNewsOld` helpers. Test IDs T-NEWS-1 through T-NEWS-8 are defined at L427-560. The new tests (T-NEWS-9 through T-NEWS-12) extend this file, reuse those helpers (adding `source_url` seeding where needed), and follow the same describe/it structure.

**CONFIRMED — HTML present in live `rag_analyses.summary`.**
PO confirmed live rows contain `<a href=…>`, `<img …>` fragments from the news ingestion pipeline (RSS/scraper). Not stripped at ingestion (upstream fix is OUT of scope per PO — render-time strip in `handleNews` only). The `source_title` column may also contain HTML from malformed feed entries and must be stripped before display.

**CONFIRMED — `HELP_TEXT` references "mặc định 20 bài".**
L72 (approximate). If the full-day coverage mechanism removes the silent 20-cap default, this line must be updated. The PO locked the mechanism to "full day, chunked" — see FR-1 below — so the "20 bài" claim becomes incorrect and HELP_TEXT must be updated.

**CONFIRMED — sibling sprint RECAP-CMD shares the same HTML display path.**
`/recap` will also render `rag_analyses.summary`. HTML-strip must be implemented as a standalone helper function (`stripHtml`) that can be called from `handleNews` now and from the future `handleRecap` without duplication. The function must not be defined inside `handleNews` body — it must be a module-level helper in `telegramCommands.ts` so both handlers can call it.

---

## 2. Functional Requirements

### FR-1 — Full-day Coverage: remove the silent 20-cap default

**Background:** `DEFAULT_LIMIT=20` silently returns at most 20 stories with no indication more exist. On a busy trading day (174 today-rows confirmed by QA of News-CMD) the user sees a 20-story slice. This is the primary "just new info" perception defect.

**PO decision (locked):** the default behaviour must return ALL of today's stories (post-dedup), not a fixed-count slice. The `LIMIT` clause remains in the SQL query to support the `/news N` explicit override, but the default query must fetch the full day's set. Chunking via `chunkStories` is the length safety-valve — no story is silently dropped.

**Acceptance Criteria:**

- AC-FR1-1: When the user types `/news` with no argument, `handleNews` queries today's rows with NO effective hard cap (i.e. the SQL LIMIT for the no-argument case is removed or set to a value large enough to cover any realistic trading day — architect decides the exact value: BA recommendation is to remove LIMIT entirely from the primary query when no `/news N` argument is given, or use a very large constant such as 9999 that no real trading day will hit).
- AC-FR1-2: When the user types `/news N`, the explicit `N` is honored as before — the SQL LIMIT is applied as `MIN(MAX_LIMIT_EXPLICIT, N)`. The PO has NOT removed the user's ability to explicitly cap; the change is to the DEFAULT behaviour only.
- AC-FR1-3: The architect must decide whether to remove LIMIT entirely (simplest) or replace DEFAULT_LIMIT=20 with a large ceiling constant. Either approach is acceptable provided AC-FR1-1 is satisfied. The architect documents the chosen approach in the design note.
- AC-FR1-4: `HELP_TEXT` line for `/news` must NOT claim "mặc định 20 bài" if the default is now uncapped. The new wording must reflect full-day coverage in plain Vietnamese, e.g. `/news [N]       Tất cả tin quan trọng hôm nay (hoặc N bài gần nhất)`. Developer updates HELP_TEXT if and only if the default behaviour changes (it does in this sprint).
- AC-FR1-5: The header line now reads `Tin tức hôm nay (N bài):` where N is the count of stories AFTER dedup — not the count of raw query rows. This makes the count accurate and meaningful.
- AC-FR1-6: When the full deduped day exceeds 4096 chars, `chunkStories` produces multiple messages. Every story appears exactly once across all chunks. No story is silently dropped.

**Ordering:** `impact_score DESC, created_at DESC` on the raw query rows; dedup then runs in application-layer (in-handler); final order in output is the first occurrence's order position (highest-impact surviving copy first).

---

### FR-2 — Dedup: collapse same-story duplicates before rendering

**Background:** the same story arrives from cafef + vnexpress + reuters with different `source_url` values. The production UNIQUE index on `source_url` does not prevent these multi-feed duplicates. Result: the list contains near-identical story blocks, padding the list and displacing distinct stories.

**Dedup key (BA decision — architect must confirm it is a pure in-handler transform):**

Primary key: **normalized `source_title`**.
Normalization steps (applied in order):
1. Trim leading/trailing whitespace.
2. Lowercase all characters.
3. Strip all HTML tags (same `stripHtml` helper as FR-3 — strip before normalizing so `<b>VN-Index</b>` and `VN-Index` are recognized as equal).
4. Collapse internal runs of whitespace to a single space.
5. Strip trailing punctuation: remove all `.` `,` `!` `?` `;` `:` characters from the end of the string.

Secondary key: **normalized `source_url`** (only used as a tie-breaker to identify which row to KEEP when two rows have different normalized titles but identical URLs — this case is prevented by the DB UNIQUE index, so in practice the secondary key serves as a fallback for future edge cases).

Full dedup rule:
- For each group of rows sharing the same normalized `source_title` (after the five normalization steps), keep EXACTLY ONE row.
- Tie-break within the group: keep the row with the highest `impact_score`. If two rows have equal `impact_score`, keep the row with the most recent `created_at`. If both are equal (identical row content from two feeds), keep the one with the longer non-null `summary` (more complete copy). If all three are equal, keep the first encountered (SQL ORDER BY impact_score DESC, created_at DESC provides a stable ordering from the query).

Empty or null `source_title` rows: each null/empty title is treated as a unique key (they do not merge with each other). A title that normalizes to an empty string (e.g. a title consisting only of HTML tags and punctuation) is treated as null — kept individually, rendered as `(không có tiêu đề)`.

**Acceptance Criteria:**

- AC-FR2-1: Given two rows with `source_title` = `"VN-Index tăng mạnh"` and `"vn-index tăng mạnh."` (different case and trailing period), normalize both → `"vn-index tăng mạnh"` → they are the same key → only one story block appears in the output.
- AC-FR2-2: The surviving row from the duplicate group is the one with the higher `impact_score`. If `impact_score` is equal, the one with the more recent `created_at` survives.
- AC-FR2-3: Given three rows with three distinct normalized titles, all three appear in the output.
- AC-FR2-4: A row with `source_title = NULL` is treated as unique and appears in the output as `(không có tiêu đề)`. Two rows with `source_title = NULL` each appear separately (null is not a dedup key).
- AC-FR2-5: Dedup runs AFTER the SQL query returns rows ordered by `impact_score DESC, created_at DESC`. The in-handler dedup pass iterates rows in that order; the first time a normalized key is seen, that row is kept; subsequent rows with the same normalized key are discarded. This ensures the highest-impact copy is always kept without needing a second sort pass.
- AC-FR2-6: Dedup is a pure in-memory transform (no SQL GROUP BY, no schema change, no new DB index). The query fetches all columns needed (`source_title`, `source_url`, `summary`, `sentiment`, `impact_direction`, `impact_score`, `created_at`) and dedup operates on the returned array. Architect confirms this is feasible.
- AC-FR2-7: The header count `N bài` reflects the count AFTER dedup.

---

### FR-3 — HTML strip: remove raw tags from `source_title` and `summary` before display

**Background:** live `rag_analyses.summary` contains `<a href="…">link text</a>` and `<img …>` fragments. `source_title` may also be affected. A non-technical user must never see angle-bracket markup. This folds in the backlogged NEWS-CMD-HTML-STRIP item.

**Strip rule:**

Strip all HTML tags from a string. For the visible text of an anchor tag, preserve the inner text. For self-closing or void elements (`<img>`, `<br>`, `<hr>`, `<input>` etc.), discard the element entirely — do not emit a replacement character. Result is plain text with no `<` or `>` characters remaining.

Specifically:
- `<a href="https://cafef.vn/…">VN-Index tăng</a>` → `VN-Index tăng` (inner text preserved; URL dropped — consistent with existing AC-FR4-8 of REQ_NEWS-CMD which excludes URLs from display).
- `<img src="…" alt="chart">` → `` (empty — void element discarded).
- `<b>Tiêu đề</b>` → `Tiêu đề` (inner text preserved).
- `<br>` or `<br/>` → `` (discarded, surrounding whitespace handles spacing).
- Nested tags: `<p><b>text</b></p>` → `text` (inner text of all nested elements preserved).
- Consecutive whitespace that results from stripping → collapsed to a single space and trimmed.

Implementation constraint: **dependency-free** — the `stripHtml` helper must be implemented using a regular-expression approach (or manual string scanning) in pure TypeScript, with zero new `npm` / `bun` package dependencies. If the architect believes a lightweight dependency (e.g. `striptags`) is preferable for correctness and security, the architect must name the specific package and version in the design note; BA does not pre-approve any dependency. Without explicit architect approval, the implementation must be dependency-free.

Placement: `stripHtml` is a standalone module-level function in `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`. It is called from both `handleNews` (this sprint) and — after the RECAP-CMD sprint — from `handleRecap`. Its signature must be exportable for unit testing: `export function stripHtml(raw: string | null | undefined): string` (returns empty string for null/undefined input).

**Acceptance Criteria:**

- AC-FR3-1: `stripHtml('<a href="https://example.com">VN-Index tăng</a>')` returns `'VN-Index tăng'` (no angle brackets, no URL).
- AC-FR3-2: `stripHtml('<img src="chart.png" alt="biểu đồ">')` returns `''` (empty string — void element).
- AC-FR3-3: `stripHtml('<b>Tiêu đề <i>quan trọng</i></b>')` returns `'Tiêu đề quan trọng'` (inner text of nested tags).
- AC-FR3-4: `stripHtml(null)` returns `''` and does not throw.
- AC-FR3-5: `stripHtml(undefined)` returns `''` and does not throw.
- AC-FR3-6: `stripHtml('Văn bản thường không có thẻ')` returns the input unchanged (no-tag passthrough).
- AC-FR3-7: After `stripHtml` is applied to `source_title` and `summary`, the rendered output of `handleNews` contains no `<` or `>` characters in any story block.
- AC-FR3-8: The function is called on `source_title` before dedup normalization (stripping before normalizing ensures that `<b>VN-Index</b>` and `VN-Index` are recognized as the same title in FR-2).
- AC-FR3-9: The function is called on `summary` before the 200-char truncation (so the character count reflects plain text, not HTML markup).
- AC-FR3-10: `stripHtml` is a module-level export (or at minimum an exported named function), not a closure inside `handleNews`, so that the RECAP-CMD sprint can reuse it without duplication.

---

### FR-4 — Importance order preserved post-dedup

**Background:** the existing `ORDER BY impact_score DESC, created_at DESC` in the SQL query produces the right ordering. Dedup must not re-sort the output — it must preserve the query order.

**Acceptance Criteria:**

- AC-FR4-1: After dedup, the surviving stories are emitted in the order they were first seen in the query result (which is `impact_score DESC, created_at DESC`). No secondary sort is applied after dedup.
- AC-FR4-2: The `impact_score` numeric value is never present in any output string. Neither `impact_score`, nor any floating-point number that could be confused for it, appears in the rendered story blocks or header.
- AC-FR4-3: Sentiment is rendered as plain Vietnamese: `tích cực`, `tiêu cực`, or `trung tính`. No English sentiment string (`positive`, `negative`, `neutral`) appears. No unrecognized sentiment value is surfaced raw — it defaults to `trung tính`.

---

### FR-5 — Existing behaviours preserved unchanged

The following behaviours from `REQ_NEWS-CMD.md` are carried forward without modification. Developer must verify each survives the refinement.

**Acceptance Criteria:**

- AC-FR5-1: Empty-DB path: when `rag_analyses` is empty or the table does not exist, the handler returns `{ texts: ["Chưa có tin hôm nay."] }`. This string is never empty, never `null`, never a stack trace.
- AC-FR5-2: Fallback path: when today returns zero rows but the table has older rows, the handler queries the most-recent N rows without a date constraint and returns them under the header `Tin tức gần đây (N bài):`. N in this context is the explicit `/news N` argument if given, or the full uncapped set if no argument. The `Tin tức hôm nay` header is NOT used for the fallback. (BA note: the fallback, unlike the primary query, may reasonably retain a practical cap — architect confirms whether the fallback should also be uncapped or retain a sensible default like 20. This is the only open question for the architect.)
- AC-FR5-3: The `/news N` explicit argument still clamps to `[1, MAX_LIMIT_EXPLICIT]`. The architect decides the value of MAX_LIMIT_EXPLICIT now that the default is uncapped — it may remain 50, or be raised. BA recommendation: raise to 200 so an explicit request can still reach a large set. Architect decides.
- AC-FR5-4: `chunkStories` is reused unchanged. It receives the header string and the array of story blocks; it returns `string[]`. No modification to `chunkStories` itself.
- AC-FR5-5: The handler never throws — all exceptions are caught and return `{ texts: ["Lỗi khi tải tin tức."] }` or equivalent plain-Vietnamese error message.
- AC-FR5-6: `webhookHandler.ts` is NOT modified in this sprint. It already iterates `result.texts ?? [result.text]` (shipped in NEWS-CMD). No change needed there.

---

## 3. Non-Functional Requirements

### NFR-1 — Plain comprehensible Vietnamese only (hard, from `feedback_market_report_plain_vietnamese`)

- NFR-1-AC-1: No numeric `impact_score` value in output.
- NFR-1-AC-2: No raw English sentiment string (`positive`, `negative`, `neutral`) in output.
- NFR-1-AC-3: No analyst jargon (σ, bp, Layer #, citation brackets, hexagram terms).
- NFR-1-AC-4: No HTML tags — `<` and `>` characters are absent from all rendered output.
- NFR-1-AC-5: Developer verifies by reading the rendered output of the unit test that seeds a row with `sentiment = "positive"`, `impact_score = 0.85`, and `summary = '<a href="https://cafef.vn">Link</a> chi tiết'` — the output must contain `tích cực`, must not contain `positive`, must not contain `0.85`, must not contain `<a` or `href`.

### NFR-2 — No new push or cron (hard)

- NFR-2-AC-1: No new cron job, no new scheduled Telegram push, no call to any delivery cron function introduced.
- NFR-2-AC-2: Alert-commander, MARKET-group push lane, and delivery cron are untouched.

### NFR-3 — Zone isolation (hard)

- NFR-3-AC-1: All code changes reside in `apps/mcp-server/` only.
- NFR-3-AC-2: No change to `apps/news-fetch/` (upstream HTML sanitisation is explicitly OUT of scope per PO).
- NFR-3-AC-3: No new `docker-compose.yml` volume, no new DB table, no new MCP tool, no new microservice.

### NFR-4 — Never throws (existing router contract)

- NFR-4-AC-1: `handleNews` catches all exceptions internally. No exception escapes to the outer router.
- NFR-4-AC-2: `stripHtml` catches all exceptions internally (malformed input must not crash the handler).

### NFR-5 — Test baseline non-regression

Source: `docs/data/project-stats.json` (floor 9408 PASS / ceiling 348 FAIL; QA of NEWS-CMD measured 9873/0).

- NFR-5-AC-1: The net test count after adding T-NEWS-9..12 must not drop below the floor.
- NFR-5-AC-2: Existing T-NEWS-1..8 tests must still pass with zero modification.
- NFR-5-AC-3: `tsc` must report zero type errors after the change.

---

## 4. DDD Layer Mapping

| Requirement | Layer | Location |
|---|---|---|
| FR-1: Remove silent 20-cap default; update HELP_TEXT | **Interface** | `telegramCommands.ts` — argument parsing + query limit logic |
| FR-2: Dedup key normalization + tie-break in-handler | **Application** (in-handler transform — no domain entity, no DB write, pure data reduction) | `telegramCommands.ts` — post-query JS/TS array reduce |
| FR-3: `stripHtml` helper — render-time HTML strip | **Interface / Presentation** | `telegramCommands.ts` — module-level pure function, exportable |
| FR-4: Order preservation post-dedup; no impact_score in output | **Interface** | `telegramCommands.ts` — formatter |
| FR-5: Fallback, empty-DB, never-throws | **Interface + Infrastructure** | `telegramCommands.ts` — existing paths, preserved |
| NFR-1/2/3: Output constraints, no-push, zone isolation | Cross-cutting | Negative constraints; no new files outside `apps/mcp-server/` |
| NFR-4: Never-throws | **Interface** cross-cutting | `telegramCommands.ts` — try/catch blocks |
| Domain model: `rag_analyses` is SSOT for stored analyses | **Domain** | `schema-news.ts` — read-only; no change |
| Test extension T-NEWS-9..12 | **Testing** | `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` |

Note on dedup layer placement: the dedup transform operates on fetched rows in memory, reduces them to a deduplicated array, and has no side effects. It is not a domain rule (no business invariant being enforced across aggregates) and not a pure infrastructure concern (no I/O). The application layer classification is correct — it is a use-case-level data preparation step, executed inline in the handler for simplicity, consistent with the established pattern of other lightweight read-only handlers in this codebase.

---

## 5. Architect-Deferred Design Decisions

Two decisions remain open for the architect. Both are scoped and small. Neither is a PO product call.

### B1 — Full-day cap: remove LIMIT entirely or replace with large ceiling constant

**Question for architect:** when `/news` is called with no argument, the BA recommends removing the SQL LIMIT clause entirely from the primary (today) query. Alternatively, the architect may prefer to replace DEFAULT_LIMIT=20 with a large ceiling (e.g. 9999) so the query always has a LIMIT for SQLite stability.

Either approach satisfies AC-FR1-1. The architect picks one and documents it. The BA requires only that:
- The chosen approach provably returns ALL of today's distinct important stories (post-dedup) for a realistic trading day (the live data showed 174 rows today — the cap must cover at least that).
- The `/news N` explicit argument path is unaffected.

### B2 — Fallback path: uncapped or retain practical cap

**Question for architect:** the fallback path (zero today-rows → most-recent N rows across all dates) currently also uses the same LIMIT. Should it also be uncapped, or should it retain a sensible practical cap (e.g. 20)?

BA recommendation: retain a practical cap for the fallback (e.g. 20 or a configurable `FALLBACK_LIMIT` constant), because the fallback covers potentially stale data across many days and returning hundreds of old rows is not useful. The architect confirms or overrides.

The architect documents both B1 and B2 in the design note and communicates the final values to the developer.

---

## 6. Edge Cases

| Edge case | Expected behaviour |
|---|---|
| Today has 0 distinct rows → fallback active | Header reads `Tin tức gần đây (N bài):`. DB rows rendered using fallback cap (architect decides). Existing T-NEWS-8 covers this. |
| Today has 200 distinct rows after dedup | All 200 rows queried; dedup reduces to distinct set; `chunkStories` produces multiple chunks; all distinct stories delivered. |
| Two rows share a normalized title; one has `impact_score = NULL` | Row with non-null `impact_score` survives. If both are null, the one with more recent `created_at` survives. |
| `source_title` = `"<b>VN-Index tăng</b>"` | `stripHtml` yields `"VN-Index tăng"` before dedup normalization. Dedup key = `"vn-index tăng"`. Displayed as `VN-Index tăng` (strip is applied before dedup normalization but the display uses the stripped version of the surviving row's title). |
| `summary` = `"<img src='chart.png'> Thị trường hôm nay tăng điểm <a href='https://cafef.vn/...'>xem thêm</a>"` | `stripHtml` yields `" Thị trường hôm nay tăng điểm xem thêm"` → trimmed → `"Thị trường hôm nay tăng điểm xem thêm"`. No angle brackets in output. |
| `source_title` = `NULL`; `summary` has HTML | `stripHtml(null)` = `''`; title displays as `(không có tiêu đề)`. Summary stripped normally. |
| `/news 0` or `/news -1` | Treated as explicit `/news` with no argument (uncapped default). No error. |
| `/news 999` | Clamped to `MAX_LIMIT_EXPLICIT` (architect decides value; BA recommends 200). |
| All `impact_score` values are NULL | `ORDER BY impact_score DESC` produces NULLs-last in SQLite. Handler does not crash. All rows still processed. |
| `rag_analyses` table does not exist (cold DB) | SQLite exception caught; returns `{ texts: ["Chưa có tin hôm nay."] }`. |
| `stripHtml` receives malformed HTML (`<a href=">broken"`) | Must not throw. Returns best-effort plain text. No guarantee of correct parse for malformed input — just no crash and no raw `<` in output. |
| Dedup reduces 174 rows to 80 distinct stories | Header reads `Tin tức hôm nay (80 bài):`. Output shows 80 story blocks across N chunks. |

---

## 7. Test Matrix — T-NEWS-9 through T-NEWS-12 (extends `214-telegram-commands.test.ts`)

All tests follow the established pattern: in-memory Bun SQLite DB via `makeDb()`, no network, no credentials, no filesystem access outside memory. Extend the existing `describe("handleNews — /news command")` block or add a sibling describe block clearly labelled `NEWS-FULLDAY refinement`.

The `seedNewsToday` and `seedNewsOld` helper functions must be extended (or a new `seedNewsTodayWithUrl` variant added) to accept an optional `sourceUrl: string | null` parameter so dedup tests can seed rows with known URLs.

| Test ID | Scenario | Seed | Assertion |
|---------|----------|------|-----------|
| T-NEWS-9 | **Dedup — two feeds, one story.** Two today-rows with titles that normalize to the same key but differ in case and trailing period; one has `impact_score = 0.9`, the other `impact_score = 0.5`. | Row A: `source_title="VN-Index tăng mạnh."`, `impact_score=0.5`. Row B: `source_title="VN-Index tăng mạnh"`, `impact_score=0.9`. | Output contains exactly ONE occurrence of "VN-Index tăng mạnh". Output does NOT contain two story blocks with the same title. The surviving block comes from Row B (higher impact_score). |
| T-NEWS-10 | **Dedup — three distinct stories survive.** Three today-rows with three distinct normalized titles. | Three rows with titles "Cổ phiếu X tăng", "Lãi suất giảm", "VN-Index tăng". All `impact_score` distinct. | Output contains exactly three story blocks. All three titles appear. |
| T-NEWS-11 | **HTML strip — tags absent from output.** One today-row with HTML in both `source_title` and `summary`. | `source_title='<b>VN-Index tăng</b>'`, `summary='<a href="https://cafef.vn">Xem chi tiết</a> thị trường hôm nay tăng điểm'`. | Output does not contain `<`, `>`, `href`, `<b>`, `<a`. Output DOES contain `VN-Index tăng` and `Xem chi tiết` and `thị trường hôm nay tăng điểm`. |
| T-NEWS-12 | **Full-day coverage — more than old cap of 20 distinct stories all appear.** 25 distinct today-rows (no duplicates). `/news` with no argument. | 25 rows with distinct normalized titles, all with `created_at = now`. | Output (joined across all texts[]) contains all 25 distinct titles. No title is absent. `result.texts` array has length >= 1 (chunked as needed). Each element of `result.texts` is <= 4096 chars. |

**Regression guard (no new test required — must still pass):** T-NEWS-1..8 must pass without modification. Any change to `handleNews` or helpers that breaks T-NEWS-1..8 is a defect, not a test update.

Additionally, the developer must add a standalone unit test for `stripHtml` (may be in a separate describe block or in a co-located test file if preferred):

| Test ID | Scenario | Input | Expected Output |
|---------|----------|-------|-----------------|
| T-STRIP-1 | Anchor tag — inner text preserved, URL dropped | `'<a href="https://cafef.vn">VN-Index tăng</a>'` | `'VN-Index tăng'` |
| T-STRIP-2 | Void element — discarded | `'<img src="chart.png" alt="biểu đồ">'` | `''` |
| T-STRIP-3 | Bold tag — inner text preserved | `'<b>Tiêu đề quan trọng</b>'` | `'Tiêu đề quan trọng'` |
| T-STRIP-4 | Null input — no throw, empty string | `null` | `''` |
| T-STRIP-5 | Undefined input — no throw, empty string | `undefined` | `''` |
| T-STRIP-6 | Plain text passthrough — unchanged | `'Văn bản thường'` | `'Văn bản thường'` |
| T-STRIP-7 | Mixed content | `'Trước <b>đây</b> và <a href="x">sau</a> đó'` | `'Trước đây và sau đó'` |

---

## 8. Files to Create / Modify

| File | Action | Owner |
|---|---|---|
| `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` | MODIFY — (1) add module-level `export function stripHtml(...)` helper; (2) refactor `handleNews` to: remove or replace the silent DEFAULT_LIMIT=20 with uncapped behaviour for the no-arg case (architect decides exact approach per B1); apply dedup logic post-query per FR-2; apply `stripHtml` to `source_title` and `summary` per FR-3; update header count to reflect post-dedup count; update `HELP_TEXT` `/news` line to reflect uncapped default (remove "mặc định 20 bài" claim). | dev-mcp-server |
| `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` | MODIFY — add T-NEWS-9 through T-NEWS-12 + T-STRIP-1 through T-STRIP-7; extend `seedNewsToday` or add `seedNewsTodayWithUrl` variant as needed. | dev-mcp-server |
| `docs/architecture-briefs/` | CREATE — architect design note resolving B1 (cap mechanism) and B2 (fallback cap). Small scope — single function refinement, not an architecture overhaul. | architect |
| `docs/architecture/microservice/mcp-server/news-analysis.md` | MODIFY if it exists — update `/news` command entry to reflect uncapped full-day behaviour + dedup + HTML-strip. | dev-mcp-server |

No changes to:
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` — already iterates `result.texts` (shipped NEWS-CMD). No modification.
- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` functions `chunkStories`, `sentimentLabel`, `midnightVietnamAsUtcInline` — called unchanged.
- Any file outside `apps/mcp-server/`.

---

## 9. Out of Scope (do not implement)

- `/recap`, `/recapw`, `/recapm` — those are RECAP-CMD sprint's deliverable. Do not touch.
- Upstream HTML sanitisation in `apps/news-fetch/` — render-time strip only (single zone).
- New DB table, new MCP tool, new microservice, `docker-compose.yml` change.
- LLM call, async queue, new scheduled push.
- Translation of foreign-language headlines.
- `source_url` display in story output (excluded per REQ_NEWS-CMD AC-FR4-8, unchanged).
- Reading `docs/daily/` blackboard.
- Any change to `apps/news-fetch/`, `apps/stock-price/`, `apps/kinh-dich-service/`, or any other service.

---

## 10. Done Bar

| DoD item | Maps to |
|---|---|
| `/news` (no arg) returns ALL of today's distinct stories — no silent 20-slice | FR-1, AC-FR1-1 |
| `/news N` explicit cap still honoured | FR-1, AC-FR1-2 |
| Same-story duplicates from multiple feeds collapsed to one block | FR-2 |
| Highest-impact copy survives dedup; output order is impact_score DESC | FR-2, FR-4 |
| `source_title` and `summary` contain no `<` or `>` in rendered output | FR-3, NFR-1-AC-4 |
| `stripHtml` is module-level export, callable by future `handleRecap` | FR-3, AC-FR3-10 |
| HELP_TEXT `/news` line updated to reflect uncapped full-day default | FR-1, AC-FR1-4 |
| Empty-DB → `Chưa có tin hôm nay.` fallback intact | FR-5, AC-FR5-1 |
| Fallback-path → `Tin tức gần đây` header intact | FR-5, AC-FR5-2 |
| All output plain Vietnamese — no jargon, no impact_score numbers | NFR-1 |
| T-NEWS-1..8 still pass (zero regressions) | NFR-5-AC-2 |
| T-NEWS-9..12 and T-STRIP-1..7 all pass | Section 7 |
| `tsc` zero errors | NFR-5-AC-3 |
| ops REBUILD + FORCE-RECREATE mcp-server after code change (not restart) | NFR-3 |
| QA live-verifies on `zenmidi.com/vn-market/webhook`: full deduped day, no raw HTML | Sprint goal success metric |
| User verbal G9 sign-off on comprehensibility (lane-c, human-judged, ARMED until then) | Sprint goal ARMED axis |

---

## 11. Blockers — None

No PO-level blocker exists. All product decisions are locked in the sprint goal and handoff. The two open items (B1, B2) are architect-scoped design choices with BA recommendations provided. Coding must not start until the architect confirms both.

Pipeline is clean: BA → architect (B1+B2 confirmation) → pm → dev-mcp-server → ops → QA → PO.
