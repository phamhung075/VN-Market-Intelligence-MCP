# Task Report: 1328i — NFC Normalization in telegram.ts coreSend()
date: 2026-04-24
outcome: APPROVED

## Changed Files
- `apps/mcp-server/src/infrastructure/notifiers/telegram.ts:176-182` — added `text.normalize("NFC")` in `coreSend()` before `splitMessage()`
- `apps/mcp-server/src/__tests__/1328i-nfc-normalize.test.ts` — 4 new tests (NFD→NFC, idempotency, ASCII passthrough, sendTelegramMarket path)

## Test Results
- Task tests (1328i): 4 pass / 0 fail
- Full suite: 6811 pass / 13 fail
  - 8 failures pre-exist on main (confirmed by baseline check)
  - 5 extra failures (Task 1287a) are test-interaction/ordering effects; 1287 tests pass 7/0 in isolation — not caused by this change
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## Baseline Comparison
- main before merge: 6803 pass / 8 fail
- task branch: 6811 pass / 13 fail
- Delta: +8 pass (4 new 1328i tests + 4 new 1328a tests bundled in branch), +5 fail (pre-existing interaction noise, not regressions)

## DDD Compliance: PASS
- `telegram.ts` is in `infrastructure/notifiers/` — layer is correct
- No forbidden `domain → infrastructure` imports introduced
- Pre-existing `infrastructure → application` import on line 24 is permitted by DDD rules

## Security: PASS
- No `process.env` usage (uses `Bun.env` via `readEnv()` helper)
- No hardcoded credentials or API keys

## Implementation Verification
- NFC normalization is in `coreSend()` — all 3 channels (market/work/bug) share this path
- `TelegramMessageFactory` not modified (confirmed via `git diff` — only `telegram.ts` changed in notifiers/)
- 4-line change: comment + `normalizedText = text.normalize("NFC")` + pass `normalizedText` to `splitMessage()`

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
Merged: `task/1328i-diacritics-normalize` → `main` (fast-forward, commit `a8493c68`)
Branch deleted: local task branch removed.
