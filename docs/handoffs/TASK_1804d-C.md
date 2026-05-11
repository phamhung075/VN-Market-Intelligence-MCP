# TASK 1804d-C — getPriceAnomalySignals() store query helper

## Wave
Wave 1 (parallel — no dependencies)

## Scope
- `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`

## What to build

Add a new exported query function to the existing `agentSignalStore.ts`:

```typescript
/**
 * Returns recent price_anomaly signals for a given ticker.
 *
 * @param db      - Better-SQLite3 Database instance
 * @param ticker  - Stock ticker (e.g. "VNM")
 * @param windowHours - look-back window in hours (default 24)
 * @returns Array of rows with { id, ticker, confidence, finding_data, created_at }
 *          finding_data is already parsed JSON (PriceAnomalyFindingData shape)
 */
export function getPriceAnomalySignals(
  db: Database,
  ticker: string,
  windowHours = 24
): PriceAnomalySignalRow[]
```

- Query the `agent_signals` table (or equivalent) filtering `finding_type = 'price_anomaly'` and `ticker = ?` and `created_at >= now - windowHours`
- Parse `finding_data` JSON before returning — do not return raw string
- Return `[]` on empty result, never throw on no-rows
- Use parameterized queries only (no string interpolation)

## Acceptance criteria
- Function exported from agentSignalStore.ts
- Parameterized SQL (no injection surface)
- finding_data parsed as JSON in return type
- Empty array on no results
- Does not break existing exports in the file
- TypeScript compiles clean

## Commit format
```
task(1804d-C): add getPriceAnomalySignals() store query helper
```
