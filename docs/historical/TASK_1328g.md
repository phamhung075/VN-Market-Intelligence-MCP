# TASK 1328g — logPolicySuppression in signalRejectionStore

**Sprint:** 1328 | **Phase:** 2 | **Layer:** infrastructure/db | **Size:** S
**Status:** Todo | **Depends on:** 1328f merged | **Blocks:** 1328h

---

## TLDR

Add `logPolicySuppression()` function to `signalRejectionStore.ts`. Re-uses the existing `signal_rejections` table with `signal_type = "policy_suppressed"`. No new table needed (PO decision 5).

---

## File to modify

`apps/mcp-server/src/infrastructure/db/signalRejectionStore.ts`

---

## Change — Add function after logSignalRejection (after line 62)

```typescript
/**
 * Log a policy suppression event (alert fired=false) to the audit table.
 *
 * Re-uses signal_rejections with signal_type="policy_suppressed".
 * The `reason` column stores JSON-serialized failed_conditions array.
 *
 * NOTE: getSignalRejectionSummary() will include these rows in its count.
 * Callers that want only validation failures should add:
 *   WHERE signal_type != 'policy_suppressed'
 *
 * @param db - Database instance
 * @param params - Suppression details from AlertCheckResult.suppressionReasons
 */
export function logPolicySuppression(
  db: Database,
  params: {
    from_agent: string;
    stock_code?: string;
    rule: "position_danger_3and" | "watchlist_opportunity_4and";
    failed_conditions: string[];
    payload_preview?: string;
  },
): void {
  const reason = JSON.stringify(params.failed_conditions);
  const stmt = db.prepare(`
    INSERT INTO signal_rejections
      (from_agent, signal_type, stock_code, reason, payload_preview, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    params.from_agent,
    "policy_suppressed",
    params.stock_code ?? null,
    reason,
    params.payload_preview ?? null,
  );
}
```

---

## How callers use this

After calling `checkPositionDanger()` or `checkWatchlistOpportunity()`, when `result.fire === false`:

```typescript
if (!result.fire && result.suppressionReasons) {
  logPolicySuppression(db, {
    from_agent: "alert-commander",
    stock_code: stockCode,
    rule: result.suppressionReasons.rule,
    failed_conditions: result.suppressionReasons.failedConditions,
    payload_preview: JSON.stringify(input).slice(0, 200),
  });
}
```

Then send summary to WORK channel (handled by 1328h cowork agent update).

---

## Test file

`apps/mcp-server/src/__tests__/1328g-suppression-log.test.ts`

- Call `logPolicySuppression` with 3AND rule → query `signal_rejections WHERE signal_type='policy_suppressed'` → row exists
- `reason` column is valid JSON array matching `failed_conditions`
- `stock_code` stored correctly when provided
- `stock_code` is NULL when not provided
- Multiple calls → multiple rows (no dedup, audit log semantics)

---

## Acceptance criteria

- [ ] `logPolicySuppression` exported from `signalRejectionStore.ts`
- [ ] Uses parameterized binding (no SQL injection risk)
- [ ] `signal_type = "policy_suppressed"` in all rows written
- [ ] JSDoc documents the filter caveat for `getSignalRejectionSummary`
- [ ] `bun test --grep "1328g"` passes
- [ ] `bun tsc --noEmit` clean
