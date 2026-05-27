## Task Report RECAP-CMD — /recap /recapw /recapm Telegram commands
date: 2026-05-28
outcome: APPROVED

changed:
  - apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts (handleRecap/Week/Month added, router wiring, HELP_TEXT, imports)
  - apps/mcp-server/src/__tests__/214-telegram-commands.test.ts (T-RECAP-1..7, T-RECAPW-1..4, T-RECAPM-1..3, T-RECAP-RT-1..4 added, makeRecapDb() helper)

tests: 60 pass / 0 fail (214-telegram-commands.test.ts, independently re-run) | tsc: 0 errors | ddd: PASS | security: PASS

### AC Results

- Handlers present: handleRecap (L751), handleRecapWeek (L865), handleRecapMonth (L883) — all async, all return { texts: string[] }, all have try/catch
- Router branches: /recap, /recapw, /recapm wired at L1005-1016 before switch block
- HELP_TEXT: L82-84 all 3 commands listed
- assembleFn injectable wrapper: PASS — production omits it, tests inject fakes (zero side-effects)
- stripHtml reused: PASS — 1 definition at L113, called at L796 + L923 in recap handlers
- summaryText/buildSummaryText never in output: PASS (grep-verified, NFR-1-AC-6)
- AC-CHUNK-1/2/3: PASS — splitBlockAtNewlines at L711 + chunkStories called in all handlers
- Empty-state strings: "Lỗi khi tổng kết ngày/tuần/tháng. Vui lòng thử lại sau." confirmed in handlers
- T-NEWS-1..8 regression: all 8 PASS unmodified

### DDD

- Import direction: telegramCommands.ts (infra) → assembleEveningSummary.ts (app) → domain types: LEGAL
- Domain value objects (EveningSummary, PeriodicSummary) read-only, never mutated
- No domain→infra violations

### Security

- Zero process.env in telegramCommands.ts
- No hardcoded secrets
- No raw SQL in recap handlers (delegates to existing use-cases)

### Live E2E (binding done-bar)

All 4 commands probed with synthetic updates (chat_id:99999999) to https://zenmidi.com/vn-market/webhook:

/recap (update_id:99002):
  - HTTP 200 ok
  - Log: [assembleEveningSummary] summary persisted filePath:reports/2026-05-28-evening.json
  - Log: [telegram] sendMessage failed status:400 chatId:99999999
  - Real assembly ran without error; reply targeted originating chatId

/recapw (update_id:99003):
  - HTTP 200 ok
  - Log: [generatePeriodicSummary] stored id:weekly-2026-05-25 periodType:weekly
  - Log: [telegram] sendMessage failed status:400 chatId:99999999
  - Weekly summary assembled; reply targeted originating chatId

/recapm (update_id:99004):
  - HTTP 200 ok
  - Log: [generatePeriodicSummary] stored id:monthly-2026-05-01 periodType:monthly
  - Log: [telegram] sendMessage failed status:400 chatId:99999999
  - Monthly summary assembled; reply targeted originating chatId

All handlers: reached handleTelegramCommand, correct handler ran without throwing, reply to originating chatId. 400 = fake chat, expected.

### Issues Found
#### Blocking
None.
#### Non-Blocking
None.

### Merge Status
APPROVED — code already on main (commit 99f433ec). No branch to merge.
