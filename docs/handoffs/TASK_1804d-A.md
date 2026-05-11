# TASK 1804d-A — PriceAnomalyFindingData Zod schema + price_anomaly validator

## Wave
Wave 1 (parallel — no dependencies)

## Scope
- `apps/mcp-server/src/domain/signals/signalTypes.ts`
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

## What to build

### 1. signalTypes.ts
Add `PriceAnomalyFindingData` Zod schema alongside existing finding_data schemas:

```typescript
export const PriceAnomalyFindingDataSchema = z.object({
  move_pct: z.number(),      // raw price move in %
  move_sigma: z.number(),    // move expressed in sigma (std-dev units)
  ref_price: z.number(),     // reference price used (VND, million scale)
  window_days: z.number().int().positive(), // rolling window used for sigma calc
});
export type PriceAnomalyFindingData = z.infer<typeof PriceAnomalyFindingDataSchema>;
```

### 2. agentSignalTools.ts
Register `price_anomaly` as a valid `finding_type` value in the postSignal tool validator. The existing validator likely has a `z.enum([...])` or similar — add `"price_anomaly"` to that list and wire `PriceAnomalyFindingDataSchema` as the expected shape when `finding_type === "price_anomaly"`.

## Acceptance criteria
- `PriceAnomalyFindingDataSchema` exported from signalTypes.ts
- `price_anomaly` accepted by postSignal without Zod validation error
- No existing finding types broken
- No `any` types introduced
- `domain/` imports nothing from `infrastructure/`
- TypeScript compiles clean (`bun run typecheck` or equivalent)

## Commit format
```
task(1804d-A): add PriceAnomalyFindingData schema + price_anomaly validator
```
