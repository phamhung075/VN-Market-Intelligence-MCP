# REQ_NEWS-CMD — Requirement Spec: `/news` On-demand Telegram Pull Command

**Sprint:** NEWS-CMD
**BA author:** ba
**Status:** APPROVED — PO approval gate passed 2026-05-27T20:01:02Z. See § 11 PO RULING.
**Date:** 2026-05-27
**Sprint goal SSOT:** `docs/SPRINT_GOAL.md § Sprint NEWS-CMD`

---

## 1. Codebase Verification Summary

Before finalising this spec, the following claims from the PO handoff were verified against the live codebase.

**CONFIRMED — webhookHandler.ts sync command path exists and is correct.**
File: `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts`
The webhook handler calls `handleTelegramCommand(body, db)` and passes the result to `sendTelegramMarket(result.text, { parseMode: "", chatId: result.chatId, persist: { from_agent: "mcp-user", message_type: "user_ask_reply" } })`. This is the established in-production reply path for `/watchlist`, `/price`, `/health`, `/check_position`, `/set_position`, `/ask`, `/report`, `/fix`. The function signature returns a single `CommandResult { text: string; chatId: number }` — currently one message per command invocation.

**CONFIRMED — telegramCommands.ts switch is the correct insertion point.**
File: `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`
The `handleTelegramCommand` function dispatches on `cmd` (lowercased first token). `/news` is NOT present in the switch — confirmed grep-clean. `HELP_TEXT` is a `const` string defined at the top of the file. Both must be updated. The router contract: never throws — all errors return a `CommandResult` with a user-friendly Vietnamese message.

**CONFIRMED — newsFetchLiveHandler.ts query shape is reusable.**
File: `apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts`
The query selects these columns from `rag_analyses`: `source_title`, `source_url`, `published_at`, `sentiment`, `impact_direction`, `impact_score`, `created_at`. The handler orders by `created_at DESC`. The `/news` handler MUST order by `impact_score DESC` then `created_at DESC` (established by `assembleEveningSummary.ts` L454-460) and filter for today since midnight GMT+7.

**CONFIRMED — rag_analyses table schema.**
File: `apps/mcp-server/src/infrastructure/db/schema-news.ts`
Full column set: `id, created_at, level, source_url, source_title, source_type, published_at, sentiment, impact_score, impact_direction, confidence, time_horizon, summary, reasoning, affected_countries, affected_domains, affected_actions, parent_ids, tags, embedding_text`. The `summary` column IS present in the table (NOT exposed by `newsFetchLiveHandler.ts`). The `/news` command SHOULD query `summary` as the one-line gist per story.

**CONFIRMED — midnight-GMT+7 pattern.**
File: `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` L238-253
The `midnightVietnamAsUtc()` function is the established utility: adds `VN_OFFSET_MS` (+7h) to `Date.now()`, extracts the UTC date at VN midnight, then subtracts the offset back to get an ISO timestamp. This exact pattern must be replicated inline in the new handler (not imported — the handler is an infrastructure file; it should not import from application layer).

**CONFIRMED — chunking implication is a real architectural design point.**
The webhook handler currently sends ONE message per `CommandResult`. A full-day digest (e.g. 20+ stories) can exceed Telegram's 4096-character limit. How chunking is implemented — either by splitting inside the handler and sending multiple Telegram messages inside `handleNews` itself, or by changing the `CommandResult` contract to support an array of texts — is a genuine architect design decision. BA flags this without pre-deciding.

---

## 2. Functional Requirements

### FR-1 — New `/news` Telegram command (pull-only, synchronous)

The system SHALL add a `/news` command to `handleTelegramCommand` in `telegramCommands.ts`. The command is synchronous: the handler queries `rag_analyses` directly and returns a formatted string without spawning any sub-agent or enqueue operation.

**Acceptance Criteria:**
- AC-FR1-1: The switch in `handleTelegramCommand` has a `case "/news":` branch that calls `handleNews(db, args)`.
- AC-FR1-2: `handleNews` is a synchronous function with signature `function handleNews(db: Database, args: string[]): string`.
- AC-FR1-3: The `/help` command output (`HELP_TEXT`) includes a line for `/news` describing it in plain Vietnamese (e.g. `/news                  Tin tức hôm nay`).
- AC-FR1-4: `/news` does NOT enqueue anything in `ask_queue`. It does NOT call `spawnQaResponder()`. It does NOT push to any channel unsolicited.
- AC-FR1-5: The handler never throws — all errors (DB failure, unexpected exception) are caught and returned as a user-friendly Vietnamese string (consistent with the existing router contract).

### FR-2 — Query scope: today's stories since midnight GMT+7

The handler SHALL query `rag_analyses` for rows created since midnight today in Vietnam time (UTC+7), ordered by `impact_score DESC, created_at DESC`.

**Acceptance Criteria:**
- AC-FR2-1: The query uses `created_at >= ?` with a midnight-GMT+7 UTC timestamp computed inline using the same arithmetic as `midnightVietnamAsUtc()` in `assembleEveningSummary.ts` (add 7h, snap to midnight UTC date, subtract 7h to get UTC ISO string). The constant `VN_OFFSET_MS = 7 * 60 * 60 * 1000` must be defined inline or as a module-level constant in `telegramCommands.ts`.
- AC-FR2-2: Rows are ordered `ORDER BY impact_score DESC, created_at DESC`.
- AC-FR2-3: Default count cap is 20 stories (same as `newsFetchLiveHandler.ts` default). The cap is applied via SQL `LIMIT ?`.
- AC-FR2-4: The columns selected are `source_title, summary, sentiment, impact_direction, created_at` — specifically including `summary` (the one-line gist) and excluding `impact_score` (never surfaced in output; see NFR-1).
- AC-FR2-5: If the `created_at >= midnight` filter returns zero rows, the handler falls back to the N most-recent rows in the table regardless of date (same `ORDER BY impact_score DESC, created_at DESC LIMIT ?`). This fallback is used only when today is genuinely empty; a non-zero today-result NEVER triggers the fallback.

### FR-3 — Optional count argument `/news N`

The handler SHALL accept an optional numeric argument `N` as the first token of `args`.

**Acceptance Criteria:**
- AC-FR3-1: `/news` with no argument uses the default cap of 20.
- AC-FR3-2: `/news 5` caps the result to 5 stories.
- AC-FR3-3: `/news 0` and `/news -1` are treated as the default cap (not zero/negative).
- AC-FR3-4: `/news abc` (non-numeric) is treated as the default cap; no error is returned.
- AC-FR3-5: N is clamped to the range `[1, 50]` server-side (mirrors `newsFetchLiveHandler.ts` `MIN_LIMIT`/`MAX_LIMIT`).

### FR-4 — Output format: plain Vietnamese digest

Each story in the output SHALL be formatted as a Vietnamese-readable block.

**Acceptance Criteria:**
- AC-FR4-1: Each story block contains: (a) headline from `source_title`, (b) one-line gist from `summary` (truncated at 200 characters if longer; trailing ellipsis if truncated), (c) plain-Vietnamese sentiment label derived from `sentiment` column.
- AC-FR4-2: Sentiment column value is mapped to output label as follows:
  - `"positive"` or `"tích cực"` → `tích cực`
  - `"negative"` or `"tiêu cực"` → `tiêu cực`
  - `"neutral"` or `"trung tính"` → `trung tính`
  - `null` or any unrecognised value → `trung tính`
- AC-FR4-3: The `impact_direction` column SHALL NOT appear verbatim in output. It MAY be combined with the sentiment label only if it adds plain-Vietnamese meaning (architect and developer discretion), but must not surface as a raw English string.
- AC-FR4-4: The `impact_score` numeric value SHALL NEVER appear in the output (hard constraint from `feedback_market_report_plain_vietnamese`).
- AC-FR4-5: A header line is present indicating the story count and date context, e.g. `Tin tức hôm nay (N bài):` or `Tin tức gần đây (N bài):` (for fallback mode). Plain Vietnamese, no English.
- AC-FR4-6: Stories are separated by a blank line or a clear visual delimiter (consistent with the spacing style in `handleWatchlist`).
- AC-FR4-7: No analyst jargon, no citation references, no Layer numbers, no sigma/basis-point notation, no hexagram terms.
- AC-FR4-8: `source_url` SHALL NOT appear in the individual story blocks (URLs do not render usefully in plain Telegram text). This is a design choice to keep output readable; architect may revisit.

### FR-5 — Empty-database fallback

When no rows exist in `rag_analyses` at all (neither today's rows nor fallback rows), the handler SHALL return a friendly Vietnamese message.

**Acceptance Criteria:**
- AC-FR5-1: If both the today query and the fallback query return zero rows, the output is exactly: `Chưa có tin hôm nay.` (or a phrase of equivalent meaning; developer may choose a natural variant but the meaning must be "no news today").
- AC-FR5-2: The fallback message is NOT `null`, NOT `undefined`, NOT an empty string, NOT `N/A`.
- AC-FR5-3: The empty fallback does NOT show a stack trace, an error code, or any English error string.

### FR-6 — Telegram 4096-character chunking

The formatted digest MUST be sent in full — never silently truncated.

**Acceptance Criteria:**
- AC-FR6-1: If the formatted output exceeds 4096 characters, the output is chunked into multiple sequential messages each of at most 4096 characters.
- AC-FR6-2: Chunk boundaries MUST fall between story blocks — never mid-story, never mid-line.
- AC-FR6-3: Every story in the query result appears in the sent output (no silent drop).
- AC-FR6-4: The chunking mechanism is an **architect-deferred design decision** (see Section 5, blocker B1). Two candidate approaches are flagged for the architect: (i) `handleNews` builds multiple strings and the `CommandResult` contract is extended to support `texts: string[]`, with `webhookHandler.ts` iterating the array with sequential `sendTelegramMarket` calls; (ii) `handleNews` returns a single pre-built string with a story count cap chosen conservatively to stay under 4096, plus a "dùng /news N để xem thêm" affordance. The architect picks ONE approach and specifies it in the design note. The spec requires that whichever approach is chosen, AC-FR6-1 through AC-FR6-3 are provably satisfied.
- AC-FR6-5: Chunk sends are sequential (not concurrent) to preserve reading order.

---

## 3. Non-Functional Requirements

### NFR-1 — Plain comprehensible Vietnamese only (hard constraint)

Source: `feedback_market_report_plain_vietnamese`.

- NFR-1-AC-1: The handler output contains no numeric `impact_score` values.
- NFR-1-AC-2: No English sentiment strings (`positive`, `negative`, `neutral`) appear in the output.
- NFR-1-AC-3: No analyst jargon: no "σ", "bp", "Layer #", citation brackets, hexagram terms (Que, Hao, Lao Duong, etc.).
- NFR-1-AC-4: The developer SHALL verify this by reading the rendered output of the unit test for a seeded row with `sentiment = "positive"` and `impact_score = 0.85` — neither `positive` nor `0.85` should appear in the formatted string.

### NFR-2 — No new unsolicited push (hard constraint)

Source: `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md § C`.

- NFR-2-AC-1: The implementation introduces no new cron job, no new scheduled Telegram push, and no new call to any delivery cron function.
- NFR-2-AC-2: The `/news` reply is sent ONLY via the existing webhook request/response path — the same `sendTelegramMarket(result.text, { chatId })` call in `webhookHandler.ts` that handles every other sync command.
- NFR-2-AC-3: The alert-commander, delivery cron, and MARKET-group push lane are untouched.

### NFR-3 — Zone isolation (hard constraint)

- NFR-3-AC-1: All code changes reside in `apps/mcp-server/` only.
- NFR-3-AC-2: No changes to `apps/news-fetch/` or any other service.
- NFR-3-AC-3: The `rag_analyses` table is read-only from this handler — no insert, update, or delete.

### NFR-4 — Never throws (existing router contract)

- NFR-4-AC-1: `handleNews` is wrapped in the existing `try/catch` block in `handleTelegramCommand` (the outer `try` already wraps all handlers). Additionally, `handleNews` itself catches DB errors internally so that any SQLite exception returns a friendly string rather than propagating to the outer catch.
- NFR-4-AC-2: The handler returns a non-empty string in every code path.

### NFR-5 — Test baseline non-regression

Source: `docs/data/project-stats.json` (floor: 9408 PASS / ceiling: 348 FAIL).

- NFR-5-AC-1: The implementation adds unit tests for `handleNews`. Net test count must be >= the floor after the change.
- NFR-5-AC-2: No existing passing test is broken.

### NFR-6 — No `docs/daily/` blackboard dependency

Source: PO-settled scope (sprint goal § Out of Scope).

- NFR-6-AC-1: The handler does not read any file from `docs/daily/`.
- NFR-6-AC-2: The handler does not import or reference any daily-document blackboard module.

---

## 4. DDD Layer Mapping

| Requirement | Layer | Location |
|---|---|---|
| FR-1: `/news` command routing, never-throws contract, `HELP_TEXT` update | **Interface** | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` |
| FR-2: `rag_analyses` query, midnight-GMT+7 filter, fallback | **Infrastructure** | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` (direct DB access, consistent with all other sync handlers — no application use-case layer needed for a read-only lookup) |
| FR-3: `/news N` argument parsing and clamping | **Interface** | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` |
| FR-4: Plain-Vietnamese formatter (`sentiment` → label, `summary` truncation, header) | **Interface / Presentation** | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` (inline, same pattern as `handleWatchlist` and `handlePrice` formatters) |
| FR-5: Empty-DB fallback message | **Interface** | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` |
| FR-6: Telegram 4096-char chunking | **Interface** (single-message cap variant) or **Infrastructure** (multi-send variant) | Decision deferred to architect (see B1 below) |
| NFR-1/4: Output constraints, no-throw contract | **Interface** cross-cutting | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` |
| NFR-2: No new push | **Infrastructure** (delivery layer) | `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` — no change required; constraint is a negative |
| Domain model: `rag_analyses` is the SSOT for stored news analyses | **Domain** | `apps/mcp-server/src/infrastructure/db/schema-news.ts` (existing — no change) |
| Microservice doc update | **Documentation** | `docs/architecture/microservice/mcp-server/news-analysis.md` (add `/news` to command-list table if one exists in that file) |

Note on layer choice: all existing sync command handlers (`handleWatchlist`, `handlePrice`, `handleHealth`, `handleCheckPosition`) query the DB directly inside the infrastructure/interface file without an application use-case intermediary. This is the established pattern for lightweight read-only lookups. The `/news` handler follows the same pattern — introducing an application-layer use-case for a direct table read would be inconsistent and add unnecessary indirection.

---

## 5. Architect-Deferred Design Decisions (Blockers for Coding — PO has NOT resolved these)

These are the ONLY two open design questions. Neither is a PO decision — both are architect-scoped.

### B1 — Telegram chunking mechanism

**Question for architect:** `webhookHandler.ts` currently sends ONE message per `CommandResult`. A full digest of 20 stories with headlines + summaries can easily exceed 4096 characters. Two candidate approaches:

- **Option A (minimal contract extension):** `CommandResult` grows a `texts?: string[]` field. If present, `webhookHandler.ts` iterates `texts` with sequential `sendTelegramMarket` calls. `handleNews` builds multiple chunk strings, each at most 4096 chars, splitting at story boundaries. This is a single-zone change (all in `apps/mcp-server/`) but requires touching `webhookHandler.ts`.
- **Option B (single-message conservative cap):** `handleNews` returns a single string capped to a safe story count (e.g. 5-10 stories per default) that statistically fits under 4096 chars, with a footer `Dùng /news N để xem thêm.` affordance. No change to `CommandResult` or `webhookHandler.ts`. Simpler but does not guarantee "all content" for large digests.

The architect picks one option and specifies the exact implementation contract. BA requires that whichever option is chosen, AC-FR6-1 through AC-FR6-3 are explicitly addressed in the design note.

### B2 — Today-vs-recent fallback window

**Question for architect:** FR-2 specifies a today-since-midnight-GMT+7 primary query and a fallback to "most-recent N" when today is empty (FR-2, AC-FR2-5). The architect should confirm:

- Is "most-recent N" the correct fallback (no date constraint), or should the fallback be "last 24 hours" or "last 3 days"?
- Should the header text change when the fallback is active (e.g. `Tin tức gần đây` vs `Tin tức hôm nay`) so the user understands the data is not from today?

BA's recommendation: fallback = most-recent N with no date constraint (simplest, always returns something); header changes to indicate non-today context. Architect may override.

---

## 6. Edge Cases

| Edge case | Expected behaviour |
|---|---|
| `rag_analyses` table does not exist (cold DB) | Handler catches the SQLite exception; returns `Chưa có tin hôm nay.` or equivalent. Must not surface an error string. |
| `source_title` is NULL | Story rendered as `(không có tiêu đề)` or omitted from that field; handler must not crash on NULL. |
| `summary` is NULL | Story rendered without a gist line; headline + sentiment label still shown. Handler must not crash on NULL. |
| `sentiment` is NULL or unrecognised string | Renders as `trung tính` (see AC-FR4-2). |
| Very long `summary` (> 200 chars) | Truncated at 200 chars with `…` suffix (see AC-FR4-1). |
| `/news 0` or `/news -3` | Treated as default cap (20). |
| `/news 999` | Clamped to 50 (see AC-FR3-5). |
| All today's rows have `impact_score = NULL` | `ORDER BY impact_score DESC` produces consistent ordering (NULLs last in SQLite default ordering). Handler must not crash. |
| Digest of 50 stories all with 200-char summaries | Output can be ~15,000+ chars. Chunking (AC-FR6-1 through FR6-3) must handle this. |
| User types `/news` in a group chat (same chatId routing) | Existing `chatId` extraction from `message.chat.id` already handles groups. No special case needed. |

---

## 7. Unit Test Requirements (for developer)

The developer SHALL add the following test scenarios to the test suite for `telegramCommands.ts` (or a co-located test file):

| Test ID | Description | Assertion |
|---|---|---|
| T-NEWS-1 | Seeded DB with 3 today-rows. `/news` returns a string containing all 3 headlines. | Response contains each `source_title` value. |
| T-NEWS-2 | Seeded DB with 3 today-rows. Sentiment `positive` → output contains `tích cực`, NOT `positive`, NOT any numeric score. | String assertions on the output. |
| T-NEWS-3 | Empty `rag_analyses` table. `/news` returns `Chưa có tin hôm nay.` (or equivalent). | Exact match on fallback message. |
| T-NEWS-4 | `/news 2` with 5 today-rows. Output contains exactly 2 story blocks. | Count of delimiter pattern or headline occurrences. |
| T-NEWS-5 | Seeded DB with rows whose combined formatted output exceeds 4096 chars. | Output satisfies the chunking contract as resolved by the architect (either: all texts in `texts[]` are <= 4096 chars each; or the single returned string is <= 4096 chars and a "thêm" affordance is present). |
| T-NEWS-6 | `source_title = NULL` in a row. Handler does not throw; row is handled gracefully. | No exception; output is a non-empty string. |
| T-NEWS-7 | `summary = NULL` in a row. Handler does not throw. | No exception; output is a non-empty string. |
| T-NEWS-8 | Today's midnight filter returns 0 rows; fallback rows exist. Returns fallback content with appropriate header. | Output is non-empty; contains at least one story from the fallback set. |

---

## 8. Out of Scope (do not implement)

- Reading `docs/daily/` blackboard folder.
- Any new scraper, any new news-fetch job, any change to `apps/news-fetch/`.
- Any unsolicited MARKET-group push.
- The `/ask` async queue pattern.
- Translation of foreign-language headlines (render stored `source_title` and `summary` as-is; only framing text must be Vietnamese).
- `source_url` display in story blocks.
- Any multi-zone change (no `apps/news-fetch/`, no new service).

---

## 9. Files to Create / Modify

| File | Action | Owner |
|---|---|---|
| `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` | MODIFY — add `handleNews` function + `case "/news":` in switch + `/news` line in `HELP_TEXT` + `VN_OFFSET_MS` constant | dev-mcp-server |
| `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` | MODIFY only if architect chooses Option A chunking (loop over `texts[]`); NO change if Option B | dev-mcp-server |
| `apps/mcp-server/__tests__/telegramCommands.test.ts` (or equivalent) | MODIFY — add T-NEWS-1 through T-NEWS-8 | dev-mcp-server |
| `docs/architecture/microservice/mcp-server/news-analysis.md` | MODIFY — add `/news` command to the command table if that section exists; skip if the file does not exist | dev-mcp-server |
| `docs/architecture-briefs/` | CREATE — architect design note for NEWS-CMD-DESIGN | architect |

---

## 10. Done Bar (mapping to TASKS.md DoD)

| DoD item | Maps to |
|---|---|
| `/news` live in running container, returns plain-Vietnamese digest of today's `rag_analyses` | FR-1, FR-2, FR-4 |
| Over-4096-char output chunked, no silent truncation | FR-6 |
| Empty-table → friendly Vietnamese fallback | FR-5 |
| No `impact_score` numbers, no jargon | NFR-1 |
| Unit tests: digest from seeded rows + empty-DB + chunking proof | Section 7 |
| ops REBUILD (not restart) mcp-server after change | NFR-3 constraint |
| QA verifies live with real content (not stub / NOT-RUN) | NFR-5, NFR-4 |
| User confirms reads usefully (G9) | Sprint goal ARMED until then |

---

## 11. PO RULING (approval gate — 2026-05-27T20:01:02Z)

**VERDICT: APPROVED.** The spec faithfully covers the sprint scope and all 5 hard constraints (plain Vietnamese / FR-4+NFR-1; no silent truncation / FR-6; empty-DB fallback / FR-5; never throws / NFR-4; pull-reply only no new push / NFR-2+NFR-3). The codebase verification (§1) confirms my four kickoff handoff claims against live code, and the `summary`-column addition to the `/news` query (vs `newsFetchLiveHandler.ts`, which omits it) is a correct improvement — `summary` IS the "one-line gist" the Vision promises, and it already exists in `schema-news.ts`. ACCEPTED.

The two deferred questions are NOT both architect-scoped. I am settling the **product half of B1** and **all of B2** as product calls now; only the implementation contract of B1 stays with the architect.

### B1 — Chunking: PO MANDATES "deliver ALL content" (Option A family). Architect picks the contract ONLY.

**Binding constraint, no longer optional:** the binding session goal is verbatim *"get all content if user need"* and Hard Constraint 3 is *"No silent truncation."* **Option B (single-message conservative cap + "thêm" affordance) is REJECTED** — AC-FR6-4(ii) itself concedes it "does not guarantee all content for large digests," which directly violates the binding goal and Constraint 3. A user who types `/news` to get the full day's digest must receive the full digest, not a teaser that makes them paginate by hand.

- **AC-FR6-4 is AMENDED:** the architect MUST choose a mechanism in the **Option A family** — i.e. when the formatted digest exceeds 4096 chars it is split at story boundaries into multiple sequential Telegram messages, every story delivered. The architect's remaining freedom is the *exact implementation contract*: `CommandResult.texts?: string[]` + a loop in `webhookHandler.ts` is the obvious candidate, but the architect MAY pick an equivalent (e.g. `handleNews` itself drives the sequential `sendTelegramMarket` sends, or a small chunker helper) provided AC-FR6-1/2/3 are provably met and the change stays single-zone (`apps/mcp-server/`). The "how to wire the multi-send" is the genuine architect decision; "must it deliver everything" is settled — YES.
- AC-FR6-4(ii) (Option B) is struck. AC-FR6-1, AC-FR6-2, AC-FR6-3, AC-FR6-5 stand unchanged.
- Note for architect: the default cap of 20 (AC-FR2-3) and the `[1,50]` clamp (AC-FR3-5) stay — they cap how many stories are *queried*, not how the queried set is *delivered*. All queried stories must be delivered in full; chunking handles length. No conservative story-count reduction to dodge chunking.

### B2 — Fallback window: PO SETTLES as a product call (no longer architect-deferred).

This is a UX decision, not a technical one, so I settle it for consistency:

- **Fallback = most-recent N rows, NO date window.** REJECT "last 24h" and "last 3 days." Rationale: a date-windowed fallback can itself return zero on a quiet weekend/holiday (VN market closed → no fresh analyses), which re-introduces the empty-result problem the fallback exists to solve. "Most-recent N regardless of date" always returns something if the table is non-empty — that is the correct UX for an on-demand pull. AC-FR2-5 already specifies this; it is now CONFIRMED, not deferred.
- **Header MUST change when fallback is active.** AC-FR4-5 already provides `Tin tức gần đây (N bài):` for fallback vs `Tin tức hôm nay (N bài):` for today. CONFIRMED and now MANDATORY (not optional): when zero today-rows trigger the fallback, the header MUST read the "gần đây / recent" variant so a non-technical user understands the data is not from today. A silent "hôm nay" header over stale data would mislead the user — unacceptable.
- B2 is therefore CLOSED. The architect does NOT need to re-decide the window or the header; both are settled above. The architect's NEWS-CMD-DESIGN note should simply restate these as confirmed inputs.

### Net effect on architect scope (NEWS-CMD-DESIGN)

The architect's remaining real decision is **one item**: the exact single-zone implementation contract for Option-A multi-message chunking (CommandResult shape vs handler-driven sends vs chunker helper) — with AC-FR6-1/2/3 provably satisfied and zero change outside `apps/mcp-server/`, zero new push, zero delivery-cron/alert-commander touch. Everything else in this spec is locked. Keep the brief small — this is a single-command feature, not an architecture overhaul.

Nothing else in the spec is changed. All FRs, NFRs, edge cases (§6), test scenarios T-NEWS-1..8 (§7) and the file-change table (§9) stand as written, with T-NEWS-5 now necessarily exercising the multi-message path (since Option B is off the table).
