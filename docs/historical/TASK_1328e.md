# TASK 1328e — Conviction breakdown display in alerts

**Sprint:** 1328 | **Phase:** 1 | **Layer:** infrastructure/notifiers | **Size:** M
**Status:** Todo | **Depends on:** 1328d merged | **Blocks:** nothing

---

## TLDR

Add `formatConvictionBlock()` to `telegram.ts`. Extend `notifyTelegramAlert()` to accept an optional `ConvictionResult` and append the 6-dimension block to HIGH/CRITICAL alerts. Block must bypass `TelegramMessageFactory` (no 100-grapheme truncation).

---

## Files to modify

`apps/mcp-server/src/infrastructure/notifiers/telegram.ts`

---

## Change 1 — Import ConvictionResult (top of file)

Add to existing imports from `convictionScorer.ts`:
```typescript
import type { ConvictionResult } from "../../domain/services/convictionScorer.js";
```

## Change 2 — New exported function (insert after formatAlertMessage ends at line 458)

```typescript
/**
 * Format a 6-dimension conviction breakdown for Telegram output.
 *
 * IMPORTANT: Do NOT pass this through TelegramMessageFactory.formatAlertMessage()
 * (100-grapheme limit). Route directly to splitMessage() → sendTelegramMarket().
 *
 * @param result - ConvictionResult from computeConviction()
 * @param risks - Complete risk list (caller must pass ALL risks — no truncation)
 */
export function formatConvictionBlock(result: ConvictionResult, risks: string[] = []): string {
  const d = result.dimensions;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines = [
    `Tại sao: ${result.summary}`,
    `Xác nhận: Giá ${pct(d.priceAction)} | Khối lượng ${pct(d.volumeConfirmation)} | Ngành ${pct(d.sectorAlignment)}`,
    `Kinh Dịch: ${pct(d.kinhDich)} tin cậy`,
    `Tiếp theo: Vĩ mô ${pct(d.cascade)} | Cảm xúc ${pct(d.sentiment)}`,
  ];
  if (risks.length > 0) {
    lines.push(`Rủi ro:\n${risks.map(r => `• ${r}`).join("\n")}`);
  }
  return lines.join("\n");
}
```

## Change 3 — Extend NotifyOptions

Add optional field to `NotifyOptions` interface (line ~81):
```typescript
/** When present, appends 6-dimension conviction breakdown to HIGH/CRITICAL alert message. */
conviction?: ConvictionResult;
/** Complete risk list for conviction block. No truncation allowed. */
convictionRisks?: string[];
```

## Change 4 — Extend notifyTelegramAlert to use conviction block

Inside `notifyTelegramAlert()` (line ~481), after `let text = formatAlertMessage(alert);` and severity label prepend, add:
```typescript
if (options.conviction) {
  const convBlock = formatConvictionBlock(options.conviction, options.convictionRisks ?? []);
  text = `${text}\n\n${convBlock}`;
}
```

The `text` string then passes to `splitMessage()` as before. No `TelegramMessageFactory` call.

---

## Anti-truncation enforcement

The conviction block MUST NOT go through `TelegramMessageFactory.formatAlertMessage()`. The code path must be:
```
formatConvictionBlock() → string concat → splitMessage() → sendTelegramMarket()
```

Add a code comment above the conviction append: `// NOTE: conviction block bypasses TelegramMessageFactory — no truncation`.

---

## Test file

`apps/mcp-server/src/__tests__/1328e-conviction-display.test.ts`

- Alert with `ConvictionResult` in options → output contains `"Tại sao:"`, `"Xác nhận:"`, `"Kinh Dịch:"`, `"Tiếp theo:"`
- Alert with `convictionRisks: ["risk 1", "risk 2"]` → output contains both risks, no `"..."`
- Message over 4096 chars → `splitMessage()` splits into multiple chunks (mock fetchFn)
- Alert with no conviction option → output unchanged from pre-1328e baseline

---

## Acceptance criteria

- [ ] `formatConvictionBlock` exported from `telegram.ts`
- [ ] All 6 dimension labels appear in HIGH/CRITICAL alert output
- [ ] Risk section shows full text, no truncation
- [ ] `bun test --grep "1328e"` passes
- [ ] `bun tsc --noEmit` clean
