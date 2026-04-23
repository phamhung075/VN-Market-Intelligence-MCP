# Task 1300a: Create TelegramMessageFactory Service (RED Phase)

## Context
Systematic codebase audit discovered **7 truncation bugs** caused by scattered, ad-hoc message formatting with hard-coded `.slice(0, N)` limits. Solution: **centralized TelegramMessageFactory singleton service** that enforces consistent, intelligent truncation globally.

## Architecture: TelegramMessageFactory

**File to create:** `src/infrastructure/notifiers/telegramMessageFactory.ts`

**Purpose:** Singleton service that all briefing jobs, analysis functions, and storage layers call to format messages for Telegram.

### Factory Methods (minimum)

```typescript
class TelegramMessageFactory {
  /**
   * Format alert message for briefing output.
   * Smart truncation: max 100 chars, break at word boundary, preserve meaning.
   */
  static formatAlertMessage(msg: string): string

  /**
   * Format story/news title for briefing output.
   * Smart truncation: max 100 chars, break at word boundary.
   */
  static formatStoryTitle(title: string): string

  /**
   * Format signal reasoning for storage in analysis_entries.
   * Smart truncation: max 1000 chars, preserve complete thoughts.
   */
  static formatSignalReasoning(reasoning: string): string

  /**
   * Format news summary for storage in analysis_entries.
   * Smart truncation: max 1000 chars, preserve context.
   */
  static formatNewsSummary(summary: string): string

  /**
   * Format policy summary for storage.
   * Smart truncation: max 500 chars.
   */
  static formatPolicySummary(summary: string): string
}
```

## Smart Truncation Rules (Shared across all methods)

1. **Respect API limits:**
   - Telegram max: 4096 chars per message (already handled by `splitMessage()`)
   - Brief display: 60–100 chars (alert in briefing)
   - Storage: 1000+ chars (complete reasoning/summary)

2. **Word-aware truncation:**
   - Don't cut at mid-word
   - If `text.length > limit`, find last space before limit
   - Append "…" only if truncated

3. **Vietnamese diacritics handling:**
   - Respect diacritical marks (à, á, ả, ã, ạ are one grapheme each)
   - Use `Intl.Segmenter` or equivalent to count graphemes correctly

4. **Pattern:**
   ```typescript
   static smartTruncate(text: string, maxLen: number): string {
     if (!text || text.length <= maxLen) return text;
     const truncated = text.slice(0, maxLen);
     const lastSpace = truncated.lastIndexOf(' ');
     if (lastSpace > 0) {
       return truncated.slice(0, lastSpace) + '…';
     }
     return truncated + '…';
   }
   ```

## Current Bugs Being Fixed

| Bug | Location | Current | New | Type |
|-----|----------|---------|-----|------|
| 1 | morningBriefingJob.ts:123 | `.slice(0, 60)` | `formatAlertMessage()` | USER-FACING |
| 2 | eveningSummaryJob.ts:203 | `.slice(0, 80)` | `formatAlertMessage()` | USER-FACING |
| 3 | eveningSummaryJob.ts:211 | `.slice(0, 80)` | `formatStoryTitle()` | USER-FACING |
| 4 | franceSummaryJob.ts:406 | `.slice(0, 100)` | `formatAlertMessage()` | USER-FACING |
| 5 | runPredictionImpactChain.ts:113 | `.slice(0, 500)` | `formatSignalReasoning()` | STORAGE |
| 6 | newsNormalizer.ts:854 | `.slice(0, 500)` | `formatNewsSummary()` | STORAGE |
| 7 | policyImpactMapper.ts:233 | `.slice(0, 80)` | `formatPolicySummary()` | STORAGE |

## Acceptance Criteria (RED Phase)

- [ ] Create `src/infrastructure/notifiers/telegramMessageFactory.ts` (singleton)
- [ ] Implement all 5 factory methods with smart truncation + Vietnamese diacritics handling
- [ ] Create unit tests: `src/__tests__/1300a-telegram-message-factory.test.ts`
  - [ ] Test smart word-boundary truncation
  - [ ] Test Vietnamese diacritical mark handling
  - [ ] Test "…" appending only when truncated
  - [ ] Test all 5 method signatures
- [ ] Migrate **briefing jobs only** to use factory:
  - [ ] morningBriefingJob.ts:123 → `formatAlertMessage()`
  - [ ] eveningSummaryJob.ts:203 → `formatAlertMessage()`
  - [ ] eveningSummaryJob.ts:211 → `formatStoryTitle()`
  - [ ] franceSummaryJob.ts:406 → `formatAlertMessage()`
- [ ] Verify briefing JSON reports still valid (no schema changes)
- [ ] `bun test` ≥6508 tests passing
- [ ] `bun tsc --noEmit` clean

## Branch
`task/1300a-telegram-message-factory-red`

## Notes
- Factory is **infrastructure layer** (handles external communication formatting)
- **Singleton pattern** — call `TelegramMessageFactory.formatAlertMessage(msg)`
- All methods are **static** — no instantiation needed
- RED phase = create factory + migrate briefing jobs (user-facing high impact)
- GREEN phase (1300b) = migrate storage-layer functions + full regression

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/notifiers/telegramMessageFactory.ts   # created: TelegramMessageFactory singleton with 5 static methods + smartTruncate helper using Intl.Segmenter
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/briefings/morningBriefingJob.ts   # line 123: .slice(0,60) → formatAlertMessage(); added import
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/briefings/eveningSummaryJob.ts   # line 203: .slice(0,80) → formatAlertMessage(); line 211: .slice(0,80) → formatStoryTitle(); added import
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/briefings/franceSummaryJob.ts   # line 406: .slice(0,100) → formatAlertMessage(); added import

tests_written:
- src/__tests__/1300a-telegram-message-factory.test.ts   # 23 assertions, all GREEN

tests_skipped:
- storage-layer migrations (runPredictionImpactChain.ts:113, newsNormalizer.ts:854, policyImpactMapper.ts:233) deferred to task 1300b

tsc_clean: true
full_suite_pass: true   # 6573 tests pass (Bun runtime panic at teardown is known Bun bug, not a test failure)
