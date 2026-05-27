# Architecture Brief: NEWS-CMD-DESIGN — `/news` Telegram Command

**Date:** 2026-05-27
**Sprint:** NEWS-CMD
**Task:** NEWS-CMD-DESIGN
**Zone:** `apps/mcp-server/` (single zone, lean build standard)
**Architect decision scope:** Chunking implementation contract only (B1). B2 is PO-settled.

---

## 1. Context

User request: `/news` Telegram bot command — synchronous pull that returns the full current day's news digest in plain Vietnamese on demand.

Spec: `docs/REQ_NEWS-CMD.md` (APPROVED 2026-05-27T20:01:02Z, § 11 PO RULING).

PO settled at the approval gate:
- B1 (chunking): Option A family mandated — all queried stories must be delivered, no silent truncation. Option B (single-message conservative cap) rejected.
- B2 (fallback): most-recent N rows, no date window; header switches to "Tin tức gần đây" when fallback active.

This brief covers the one remaining architect decision: the exact single-zone implementation contract for Option-A multi-message chunking.

---

## 2. Brownfield Scan Summary

**`telegramCommands.ts`:** `handleTelegramCommand` switch dispatches on `cmd`. `CommandResult { text: string; chatId: number }` — currently single text per result. `/news` is grep-clean (not present). Outer try/catch wraps all handlers.

**`webhookHandler.ts`:** Calls `handleTelegramCommand` then `sendTelegramMarket(result.text, { chatId })` — currently one send per result.

**`timeConstants.ts`:** `VN_OFFSET_MS = 7 * 3600_000` exported as a pure domain constant. Infrastructure importing domain constants is valid DDD (infra → domain direction).

**`assembleEveningSummary.ts`:** Contains `midnightVietnamAsUtc()` function that uses `VN_OFFSET_MS`. Do NOT import this function — it lives in the application layer. Replicate the arithmetic inline in `handleNews`.

**`schema-news.ts`:** `rag_analyses` columns confirmed include `summary` (the one-line gist). Index `idx_rag_created` on `created_at` aligns with the query predicate.

---

## 3. Chunking Contract Decision

### Chosen: `CommandResult.texts?: string[]` + sequential send-loop in `webhookHandler.ts`

**Rationale:**

The two alternative wiring points are (i) handle sends inside `handleNews` itself, (ii) add `texts[]` to the return contract and send in the caller. Option (i) requires `handleNews` to import `sendTelegramMarket`, pulling Telegram I/O into the command router — a layer violation. The router's responsibility is to return data; the interface layer (`webhookHandler.ts`) is the correct Telegram I/O site. Option (ii) keeps the separation clean and makes `handleNews` trivially unit-testable (no Telegram mock).

### Type change — `CommandResult`

```typescript
export interface CommandResult {
  /** Single-message text (all existing commands). */
  text: string;
  /**
   * Multi-message chunks (handleNews only).
   * When present, webhookHandler iterates this array instead of using text.
   * Each element is <= 4096 chars. Boundaries fall between story blocks.
   */
  texts?: string[];
  chatId: number;
}
```

`text` remains required — all existing commands are unaffected. `texts` is optional and only populated by `handleNews`.

### Send-loop — `webhookHandler.ts`

Replace the single `sendTelegramMarket(result.text, ...)` call with:

```typescript
const chunks = result.texts ?? [result.text];
for (const chunk of chunks) {
  await sendTelegramMarket(chunk, {
    parseMode: "",
    chatId: result.chatId,
    persist: { from_agent: "mcp-user", message_type: "user_ask_reply" },
  });
}
```

`for...of` with `await` guarantees sequential delivery (AC-FR6-5). When `texts` is absent (all existing commands), `[result.text]` produces a single-element array — behaviour identical to the current single-send path.

### Chunker algorithm — inside `handleNews`

Build story blocks first, then pack into chunks:

```
storyBlocks: string[] = stories.map(formatStory)
header: string = "Tin tức hôm nay (N bài):"  // or "gần đây" for fallback

chunks: string[] = []
current: string = header
for block of storyBlocks:
  candidate = current + "\n\n" + block
  if candidate.length <= 4096:
    current = candidate
  else:
    if current !== header:       // current has at least one story
      chunks.push(current)
    current = header_continuation + "\n\n" + block
                                 // start new chunk with this story
push current (always non-empty — at minimum header + one story)
return chunks
```

`header_continuation` can be omitted (chunks after the first have no header — acceptable) or carry a minimal continuation marker like `(tiếp theo...)` — developer discretion. The important invariant is that no story appears twice and no story is lost.

**Proof against AC-FR6-1/2/3:**
- AC-FR6-1: `candidate.length <= 4096` is checked before committing — each chunk is <= 4096 chars by construction.
- AC-FR6-2: The chunker splits only at the boundary between story blocks (at `"\n\n"` delimiters between pre-built `block` strings). A `block` is never split.
- AC-FR6-3: The `for...of` loop processes every `storyBlocks` element exactly once. No story is skipped.

---

## 4. `handleNews` Function Spec

**Signature:** `function handleNews(db: Database, args: string[]): { texts: string[]; chatId?: never }`

Actually: `handleNews` returns `string[]` (just the texts array). The switch in `handleTelegramCommand` wraps it into `CommandResult`:

```typescript
case "/news": {
  const texts = handleNews(db, args);
  return { text: texts[0] ?? "Chưa có tin hôm nay.", texts, chatId };
}
```

(`text` is populated with the first chunk so the type contract is satisfied. `webhookHandler` uses `texts` when present.)

**Argument parsing:**
- `args[0]` parsed as integer N. Non-numeric, missing, <= 0 → default 20. Clamped to `[1, 50]`.

**Query — today primary:**
```sql
SELECT source_title, summary, sentiment, impact_direction, created_at
FROM rag_analyses
WHERE created_at >= ?
ORDER BY impact_score DESC, created_at DESC
LIMIT ?
```
Bind: `[midnightVietnamAsUtcInline(), N]`

**Query — fallback (zero today-rows):**
```sql
SELECT source_title, summary, sentiment, impact_direction, created_at
FROM rag_analyses
ORDER BY impact_score DESC, created_at DESC
LIMIT ?
```
Bind: `[N]`

**Midnight arithmetic (inline — do NOT import from assembleEveningSummary):**
```typescript
const VN_OFFSET_MS = 7 * 3600_000;   // import from timeConstants.js instead
// ... or inline:
function midnightVietnamAsUtcLocal(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const midnight = new Date(
    Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 0, 0, 0, 0)
    - VN_OFFSET_MS,
  );
  return midnight.toISOString();
}
```

Prefer importing `VN_OFFSET_MS` from `../../domain/services/timeConstants.js` (existing SSOT, infra → domain is valid DDD) and defining only the function body inline.

**Sentiment label map:**
```typescript
function sentimentLabel(s: string | null): string {
  if (s === "positive" || s === "tích cực") return "tích cực";
  if (s === "negative" || s === "tiêu cực") return "tiêu cực";
  return "trung tính"; // neutral, null, unrecognised
}
```

**Story formatter:**
```
[source_title or "(không có tiêu đề)"]
[summary truncated at 200 chars + "…" if longer — omit line if summary is null]
[sentimentLabel(sentiment)]
```

No `impact_score`, no `impact_direction` verbatim, no English strings in output.

**Header:**
- Today rows: `Tin tức hôm nay (N bài):`
- Fallback rows: `Tin tức gần đây (N bài):`

**Empty case:** Both queries return zero rows → return `["Chưa có tin hôm nay."]`.

**Error case:** Any SQLite exception → catch, return `["Lỗi đọc tin tức. Vui lòng thử lại sau."]`.

---

## 5. DDD Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `handleNews` — query + format + chunk | Infrastructure (direct DB read) | `telegramCommands.ts` |
| `VN_OFFSET_MS` | Domain (pure constant) | `timeConstants.ts` (existing, imported) |
| Midnight arithmetic function (inline) | Infrastructure | `telegramCommands.ts` |
| `CommandResult.texts?: string[]` | Interface (public type) | `telegramCommands.ts` |
| Send-loop in `handleWebhook` | Interface | `webhookHandler.ts` |
| `case "/news":` + `HELP_TEXT` | Interface | `telegramCommands.ts` |
| Sentiment label map | Interface/Presentation (inline) | `telegramCommands.ts` |
| T-NEWS-1..8 unit tests | Test | `214-telegram-commands.test.ts` |

---

## 6. File Change List

| # | File | Action |
|---|------|--------|
| 1 | `apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts` | MODIFY |
| 2 | `apps/mcp-server/src/interface/mcp/routes/webhookHandler.ts` | MODIFY (3-line change) |
| 3 | `apps/mcp-server/src/__tests__/214-telegram-commands.test.ts` | MODIFY (add 8 test cases) |
| 4 | `docs/architecture/microservice/mcp-server/news-analysis.md` | MODIFY (append `/news` command reference) |

No new files in `apps/mcp-server/src/`. No changes outside `apps/mcp-server/`.

---

## 7. Risk Flags

| Risk | Level | Mitigation |
|------|-------|-----------|
| `texts` present but `text` also required by type | LOW | Switch always sets `text = texts[0] ?? fallback`. Type contract satisfied. |
| Cold DB (rag_analyses missing) | LOW | try/catch in `handleNews` returns friendly string. |
| NULL `impact_score` ORDER BY | LOW | SQLite NULLs last in DESC — deterministic, no crash. |
| NULL `source_title` or `summary` | LOW | Explicit null guards in formatter. |
| Slow send for 50 stories (many chunks) | MED | On-demand user-pull; acceptable latency. No rate-limit risk at typical usage. |
| Layer boundary: `telegramCommands.ts` imports from `domain/services/timeConstants.js` | NONE | Infrastructure → domain is correct DDD direction. |

---

## 8. Frozen Surfaces (do not touch)

- `apps/news-fetch/` — any file
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` — no import, no edit
- Any `pilot-status-*.json`
- Delivery cron functions, alert-commander, MARKET-group push lane
- `schema-news.ts` — read-only from this feature

---

## 9. Constraints

- NFR-2: No new cron job, no new scheduled push, no new `sendTelegramMarket` call in the scheduler layer.
- NFR-3: All code changes in `apps/mcp-server/` only.
- NFR-4: `handleNews` never throws — all errors return a user-friendly string.
- ops REBUILD (not restart) required after dev change — standard policy.
