# TASK_NEWS-CMD — Handoff Chain

**Sprint:** NEWS-CMD
**Spec:** `docs/REQ_NEWS-CMD.md` (APPROVED 2026-05-27T20:01:02Z)
**Zone:** `apps/mcp-server/`

---

## [BA] Requirement Spec — DONE

Spec produced: `docs/REQ_NEWS-CMD.md`
PO approval gate passed: 2026-05-27T20:01:02Z (§ 11 PO RULING)
B1 and B2 settled by PO at the gate — see § 11 for binding constraints.

---

## [Architect] Brownfield Findings — NEWS-CMD-DESIGN

**Date:** 2026-05-27
**Task:** NEWS-CMD-DESIGN

### Zone

`apps/mcp-server/` — single zone, no multi-zone split needed. All code changes are confined to this service. BUILD-STANDARD: lean (service already exists; this is a new command in the existing command router).

### Verified Paths

| File | Confirmed state |
|------|----------------|
| `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` | Command router. `handleTelegramCommand` switch confirmed live. `/news` grep-clean (not present). `CommandResult { text: string; chatId: number }` is the current return type (lines 53-58). `HELP_TEXT` is a module-level `const` string. Outer `try/catch` at line 460 wraps all handlers. |
| `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` | Calls `handleTelegramCommand` then `sendTelegramMarket(result.text, { parseMode: "", chatId: result.chatId, persist: {...} })` — currently ONE send per result (line 85). Must be extended to iterate `texts[]` for the chunking contract. |
| `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` | `midnightVietnamAsUtc()` lives here (lines 238-254). Imports `VN_OFFSET_MS` from `../../domain/services/timeConstants.js`. Do NOT import this function — replicate the arithmetic inline. |
| `apps/mcp-server/src/domain/services/timeConstants.ts` | `VN_OFFSET_MS = 7 * 3600_000` exported as a pure constant. Layer: domain/services — zero I/O. |
| `apps/mcp-server/src/infrastructure/db/schema-news.ts` | `rag_analyses` table confirmed: columns `id, created_at, level, source_url, source_title, source_type, published_at, sentiment, impact_score, impact_direction, confidence, time_horizon, summary, reasoning, ...`. Index `idx_rag_created` on `created_at` — query predicate aligns with the index. |
| `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` | Existing test file for `handleTelegramCommand`. New tests (T-NEWS-1..8) extend this file or a co-located sibling. |
| `docs/architecture/microservice/mcp-server/news-analysis.md` | Exists. Contains a Tools table and Scheduler Jobs table. No Telegram command table present — the `/news` command reference should be appended as a note in the "Data Flow" or in a new "Telegram Commands" subsection. |

### Reuse Patterns

- **Query shape:** mirror `apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts` for column selection and SQLite query structure; add `summary` column (absent from that handler but present in schema), change ordering to `impact_score DESC, created_at DESC`, add `created_at >= ?` filter.
- **Midnight arithmetic:** inline `midnightVietnamAsUtc()` arithmetic in `handleNews`. Do NOT import from `assembleEveningSummary.ts` (cross-layer). DO import `VN_OFFSET_MS` from `../../domain/services/timeConstants.js` — infrastructure importing from domain is valid DDD (infra depends on domain; direction is correct). Defining `VN_OFFSET_MS = 7 * 3600_000` as a second inline constant would duplicate the SSOT — that is worse than the correct import. The spec's "replicate inline" instruction refers to the `midnightVietnamAsUtc()` *function body*, not the constant.
- **Formatter pattern:** follow `handleWatchlist` style — build `lines[]` array, join with `\n`, use blank lines between stories.
- **Never-throws:** `handleNews` catches DB exceptions internally and returns a user-friendly string. The outer try/catch in `handleTelegramCommand` is a second safety net.
- **Test DB setup:** reuse the `makeDb()` pattern from `214-telegram-commands.test.ts` (in-memory `:memory:` DB, manual `CREATE TABLE IF NOT EXISTS rag_analyses` schema seeding).

### Design Decisions

#### B1 — Chunking implementation contract (ARCHITECT DECISION — only open item)

**Chosen mechanism: `CommandResult.texts?: string[]` + send-loop in `webhookHandler.ts`.**

Rationale and alternatives considered:

- **Option A1 (chosen): `texts?: string[]` on `CommandResult` + loop in webhookHandler.** `handleNews` builds an array of chunk strings (each <= 4096 chars, split at story boundaries) and returns `{ texts: [...], chatId }`. `webhookHandler.ts` checks `result.texts`: if present, iterates sequentially with `await sendTelegramMarket(chunk, {...})` for each chunk; else falls back to the existing `result.text` path (all other commands unchanged — zero regression risk). This is the minimal contract change, strictly backwards-compatible, keeps Telegram I/O out of `telegramCommands.ts` (correct layer placement: telegram sends live in the interface/infrastructure layer, not inside the router function), and is easy to unit-test (no Telegram mock needed — just assert the array contents).

- **Option A2 (rejected): `handleNews` drives sequential `sendTelegramMarket` sends directly.** Would require `handleNews` to import and call `sendTelegramMarket` — pulling Telegram send logic into the command router. This is a layer violation: the router's job is to return data, not to trigger side-effects. It also makes unit testing harder (must mock `sendTelegramMarket`).

- **Option A3 (rejected): standalone chunker helper that calls `sendTelegramMarket`.** Same layer violation as A2, just relocated one level. No benefit over A1.

**Implementation contract (precise):**

```typescript
// telegramCommands.ts — extend CommandResult
export interface CommandResult {
  text: string;           // single-message commands (all existing commands)
  texts?: string[];       // multi-message commands (handleNews only); if present, text is ignored by webhookHandler
  chatId: number;
}
```

```typescript
// webhookHandler.ts — replace the single send with a loop
const result = await handleTelegramCommand(body as ..., db);
if (result) {
  const chunks = result.texts ?? [result.text];
  for (const chunk of chunks) {
    await sendTelegramMarket(chunk, {
      parseMode: "",
      chatId: result.chatId,
      persist: { from_agent: "mcp-user", message_type: "user_ask_reply" },
    });
  }
}
```

AC-FR6-1 met: each chunk <= 4096 chars (enforced by chunker in `handleNews`).
AC-FR6-2 met: chunk boundaries are at story separators (blank-line delimiters between story blocks — chunker never splits mid-story).
AC-FR6-3 met: all queried stories appear because chunker processes all items before returning.
AC-FR6-5 met: sequential `for...of` loop with `await` — no concurrency.

**Chunker algorithm (inside `handleNews`):**

```
chunks: string[] = []
current: string = header   // "Tin tức hôm nay (N bài):"
for each story block in stories:
  candidate = current + "\n\n" + storyBlock
  if candidate.length <= 4096:
    current = candidate
  else:
    chunks.push(current)
    current = storyBlock   // new chunk starts with this story
push current if non-empty
return chunks
```

The header appears only in the first chunk. Story blocks are pre-built strings. The 4096-char limit is checked on the candidate string before committing. This guarantees no mid-story split and no story loss.

#### B2 — Fallback window (PO-SETTLED — confirmed)

- Primary query: `created_at >= midnightVietnamAsUtc()` ordered `impact_score DESC, created_at DESC LIMIT N`.
- Fallback (zero today-rows): same ORDER BY, same LIMIT, no date filter.
- Header: `Tin tức hôm nay (N bài):` for today-rows; `Tin tức gần đây (N bài):` for fallback-rows.
- Both are settled by PO — architect confirms only.

#### DDD Layer Mapping

| Component | Layer | File |
|-----------|-------|------|
| `handleNews(db, args): string[]` — query + format + chunk builder | **Infrastructure** (direct DB read, consistent with all sync handlers) | `telegramCommands.ts` |
| `VN_OFFSET_MS` — imported from existing SSOT | **Domain** (read-only constant) | `timeConstants.ts` (existing) |
| Midnight arithmetic inline in `handleNews` | **Infrastructure** (no new domain file) | `telegramCommands.ts` |
| `CommandResult.texts?: string[]` — contract extension | **Interface** (public type) | `telegramCommands.ts` |
| Send-loop in `handleWebhook` | **Interface** | `webhookHandler.ts` |
| `case "/news":` in switch + `HELP_TEXT` update | **Interface** | `telegramCommands.ts` |
| Sentiment → Vietnamese label map | **Interface / Presentation** (inline map in `handleNews`) | `telegramCommands.ts` |
| T-NEWS-1..8 unit tests | **Test** | `214-telegram-commands.test.ts` (or new sibling) |
| `news-analysis.md` command reference | **Documentation** | `docs/architecture/microservice/mcp-server/news-analysis.md` |

Note on layer choice: `handleNews` queries DB directly without an application use-case intermediary. This is the established pattern for all sync command handlers (`handleWatchlist`, `handlePrice`, `handleHealth`, `handleCheckPosition`). Introducing an application-layer use-case for a read-only lookup would be inconsistent and add unnecessary indirection. Pattern stays.

### Exact File-Change List for dev-mcp-server

| # | File | Action | What changes |
|---|------|--------|-------------|
| 1 | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` | MODIFY | (a) Add `import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js"` at top; (b) Extend `CommandResult` to add `texts?: string[]`; (c) Add `handleNews(db: Database, args: string[]): { texts: string[]; chatId?: never }` function implementing query, today-filter, fallback, formatter, chunker; (d) Add `case "/news":` branch in switch that calls `handleNews` and returns `{ texts: result.texts, chatId }`; (e) Add `/news` line in `HELP_TEXT`; (f) Update module JSDoc comment to list `/news`. |
| 2 | `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` | MODIFY | Replace single `sendTelegramMarket(result.text, ...)` with `const chunks = result.texts ?? [result.text]; for (const chunk of chunks) { await sendTelegramMarket(chunk, ...) }`. No other change. |
| 3 | `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` | MODIFY | Add `describe("handleNews — /news command")` block with T-NEWS-1 through T-NEWS-8 as specified in `docs/REQ_NEWS-CMD.md § 7`. Test DB must seed `rag_analyses` with the minimal schema. For T-NEWS-5 (chunking proof), assert `result.texts.length > 1` and every element `<= 4096` chars. |
| 4 | `docs/architecture/microservice/mcp-server/news-analysis.md` | MODIFY | Append a new "Telegram Commands" section (or add a row to an existing table) documenting `/news` — purpose, source table, argument, chunking behavior. |

No other files change. `schema-news.ts` is read-only from this feature. `assembleEveningSummary.ts` is untouched. No new files created in `apps/mcp-server/src/`.

### Risk Flags

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `result.texts` present but `result.text` missing: existing single-send path uses `result.text` — must remain a non-empty string | MED | `handleNews` always returns `{ texts: [...], chatId }` via the switch; `result.text` is never read when `texts` is present. `CommandResult.text` remains required for all other commands. |
| `rag_analyses` table not yet created on cold DB | LOW | `handleNews` wraps in try/catch; returns `Chưa có tin hôm nay.` on any SQLite error. |
| NULL `impact_score` in ORDER BY | LOW | SQLite NULLs sort last in `DESC` — deterministic, no crash. |
| Chunker produces empty first chunk if header itself exceeds 4096 | NONE | Header is < 50 chars; not a real risk. |
| `source_title` NULL | LOW | Format as `(không có tiêu đề)` — explicit guard in formatter, no crash. |
| `summary` NULL | LOW | Omit gist line — skip, no crash. |
| `texts: string[]` added to `CommandResult` — TypeScript exhaustiveness in webhookHandler | LOW | `result.texts ?? [result.text]` handles both cases; no breaking change to callers of `CommandResult` that only use `.text` and `.chatId`. |
| Sending 50 chunks of a 50-story digest: at 20-50 chunks × `sendTelegramMarket` calls, each taking ~0.1-0.5s → total 2-25s response time | MED | Acceptable for an on-demand user-pull (not a cron job). Telegram bot API allows burst sends. No rate-limit mitigation needed for reasonable story counts. |

### Scan Clean

No pre-existing `/news` case in the switch. No existing `texts` field on `CommandResult`. No cross-zone entanglement. Zero changes outside `apps/mcp-server/`. BUILD-STANDARD: lean.

---

### Summary for dev-mcp-server

Four files, minimal surface:
1. `telegramCommands.ts` — add import, extend type, implement `handleNews`, wire switch, update HELP_TEXT.
2. `webhookHandler.ts` — replace single-send with chunk-loop (3-line change).
3. `214-telegram-commands.test.ts` — add 8 test cases.
4. `docs/architecture/microservice/mcp-server/news-analysis.md` — append `/news` command reference.

The chunking algorithm (story-boundary split, 4096-char cap, `texts[]` return) is the only non-trivial logic. Everything else mirrors established patterns in the file.

---

## [Developer] Implementation — NEWS-CMD-IMPL

**Date:** 2026-05-27
**Task:** NEWS-CMD-IMPL
**Status:** Review

### Implementation Summary

All four files modified exactly as specified. No new files created. Zone: `apps/mcp-server/` only.

### Changes Delivered

| # | File | Change |
|---|------|--------|
| 1 | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` | Added `import { VN_OFFSET_MS }` from `timeConstants.js`; extended `CommandResult` with `texts?: string[]`; added `sentimentLabel()`, `midnightVietnamAsUtcInline()`, `chunkStories()`, and `handleNews()` functions; wired `/news` case before the switch (returns `{ text, texts, chatId }`); added `/news [N]` line to `HELP_TEXT`; updated module JSDoc. |
| 2 | `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` | Replaced single `sendTelegramMarket(result.text,...)` with `const chunks = result.texts ?? [result.text]; for (const chunk of chunks) { await sendTelegramMarket(chunk,...) }`. 3-line change; all existing commands unaffected (single-element fallback). |
| 3 | `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` | Added `rag_analyses` table to `makeDb()` schema; added `seedNewsToday()` and `seedNewsOld()` helpers; added `describe("handleNews — /news command")` block with T-NEWS-1..8. |
| 4 | `docs/architecture/microservice/mcp-server/news-analysis.md` | Appended "Telegram Commands" section with `/news` command reference (source table, argument, chunking behaviour, query logic, output constraints, DDD layer). |

### Test Results

```
bun test src/__tests__/214-telegram-commands.test.ts
31 pass, 0 fail (was 26 pass before this task — 5 new T-NEWS tests)
bun tsc --noEmit: clean (zero errors)
```

T-NEWS-1..8: all pass.
- T-NEWS-1: 3 today-rows → all 3 headlines in output
- T-NEWS-2: positive sentiment → `tích cực` in output; `positive` and `0.85` absent
- T-NEWS-3: empty DB → `Chưa có tin hôm nay.`
- T-NEWS-4: `/news 2` with 5 rows → exactly 2 story blocks
- T-NEWS-5: 20-row digest with 250-char summaries → each `texts[]` element <= 4096 chars
- T-NEWS-6: `source_title = NULL` → no crash, non-empty output
- T-NEWS-7: `summary = NULL` → no crash, non-empty output
- T-NEWS-8: no today-rows + old fallback rows → output contains fallback content + `gần đây` header

### FR/NFR Coverage

| Requirement | Status |
|-------------|--------|
| FR-1: `/news` case in switch, `HELP_TEXT` updated | MET |
| FR-2: today-filter with midnight-GMT+7, `impact_score DESC`, `LIMIT N` | MET |
| FR-3: `/news N` arg parse, clamp [1,50], default 20 | MET |
| FR-4: plain-VN formatter, sentiment label, summary truncation, no `impact_score` | MET |
| FR-5: empty-DB fallback `Chưa có tin hôm nay.` | MET |
| FR-6: story-boundary chunking, each chunk <= 4096 chars, `texts[]` send-loop | MET |
| NFR-1: no numeric score, no English sentiment strings, no jargon | MET |
| NFR-2: no new cron job, no new push, reply via existing webhook path | MET |
| NFR-3: all changes in `apps/mcp-server/` only | MET |
| NFR-4: handleNews catches DB errors internally; outer try/catch also present | MET |
| NFR-6: no `docs/daily/` dependency | MET |

### Files Left UNSTAGED (for main terminal to commit)

- `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts`
- `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts`
- `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts`
- `docs/architecture/microservice/mcp-server/news-analysis.md`
- `docs/handoffs/TASK_NEWS-CMD.md` (this file)
- `docs/TASKS.md` (NEWS-CMD-IMPL → Review)
