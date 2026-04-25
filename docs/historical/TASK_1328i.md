# TASK 1328i — NFC normalization in telegram.ts

**Sprint:** 1328 | **Phase:** 2 | **Layer:** infrastructure/notifiers | **Size:** S
**Status:** Todo | **Depends on:** nothing (standalone) | **Blocks:** 1328j (deploy gate)

---

## TLDR

Add `text.normalize("NFC")` in `coreSend()` before `splitMessage()`. Vietnamese text in NFD form (common from macOS RSS feeds) must be normalized to NFC precomposed form before sending to Telegram to ensure consistent rendering across Android/iOS/Web clients.

---

## File to modify

`apps/mcp-server/src/infrastructure/notifiers/telegram.ts`

---

## Change — coreSend() function (line 178)

Locate line 178 inside `coreSend()`:
```typescript
// Before:
const chunks = splitMessage(text);

// After (1328i):
// Normalize Vietnamese diacritics to NFC before sending.
// NFD (decomposed) from macOS RSS feeds renders inconsistently in Telegram clients.
// NFC (precomposed) is the safe form — single codepoint per character.
const normalizedText = text.normalize("NFC");
const chunks = splitMessage(normalizedText);
```

That is the ONLY change. One line becomes two.

---

## Where NOT to add normalization

- Do NOT add to `TelegramMessageFactory` — `Intl.Segmenter` handles both NFD and NFC correctly. Adding there would normalize twice, which is harmless but creates confusion.
- Do NOT add to individual `sendTelegramMarket/Work/Bug` — they all call `coreSend`. The single injection point covers all three.

---

## Test file

`apps/mcp-server/src/__tests__/1328i-nfc-normalize.test.ts`

Required test:
```typescript
// "ă" in NFD = "a" + U+0306 (combining breve) = 2 codepoints
const nfdString = "a\u0306";
// "ă" in NFC = U+0103 (ă precomposed) = 1 codepoint
const nfcString = "\u0103";

// Call sendTelegramWork with NFD string, mock fetchFn, assert body contains NFC
```

Also: existing tests for `sendTelegramMarket/Work/Bug` must continue to pass unchanged.

---

## Acceptance criteria

- [ ] `coreSend()` normalizes text to NFC before `splitMessage()`
- [ ] NFD input arrives at Telegram API as NFC
- [ ] `TelegramMessageFactory` unchanged
- [ ] `bun test --grep "1328i"` passes
- [ ] `bun tsc --noEmit` clean
