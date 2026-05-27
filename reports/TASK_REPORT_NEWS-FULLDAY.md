## Task Report NEWS-FULLDAY — /news full-day coverage + dedup + HTML-strip
date: 2026-05-28
outcome: APPROVED

changed:
  - apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts (handleNews refactor, stripHtml added, HELP_TEXT updated)
  - apps/mcp-server/src/__tests__/214-telegram-commands.test.ts (T-NEWS-9..12, T-STRIP-1..7 added)

tests: 60 pass / 0 fail (214-telegram-commands.test.ts, independently re-run) | tsc: 0 errors | ddd: PASS | security: PASS

### AC Results

- AC-FR1-1 (no-arg uncapped): PASS — no LIMIT on default primary query (L597-606)
- AC-FR1-2 (/news N explicit cap): PASS — LIMIT MIN(200,N) (L586-596)
- AC-FR1-4 (HELP_TEXT updated): PASS — "Tất cả tin quan trọng hôm nay (hoặc N bài gần nhất)"
- AC-FR1-5 (header uses post-dedup count): PASS — L668
- AC-FR2-1..7 (dedup): PASS — normalizeTitle + Map<string,true>, first-wins, T-NEWS-9/10 validate
- AC-FR3-1..10 (stripHtml): PASS — T-STRIP-1..7 all pass; module-level export; one definition
- AC-FR4-2 (no impact_score in output): PASS — field read-only in NewsRow interface, never emitted
- AC-FR5-1 (empty-DB fallback): PASS — "Chưa có tin hôm nay."
- AC-FR5-2 (fallback header "gần đây"): PASS
- T-NEWS-1..8 regression: all 8 PASS unmodified

### Live E2E (binding done-bar)

POST synthetic update_id:99001 /news to https://zenmidi.com/vn-market/webhook:
- HTTP 200 ok
- Container log: [telegram] sendMessage failed status:400 channel:market chatId:99999999
- Handler ran, reply targeted originating chatId (not hardcoded channel). 400 = fake chat, expected.

### Issues Found
#### Blocking
None.
#### Non-Blocking
None.

### Merge Status
APPROVED — code already on main (commit 99f433ec). No branch to merge.
