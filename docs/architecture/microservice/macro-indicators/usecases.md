# macro-indicators — Use Cases

## ComputeMacroUseCase
- **File:** `apps/macro-indicators/src/application/usecases.ts`
- **Input:** `MacroSnapshotRequest {}` (empty, future extensibility)
- **Output:** `MacroSnapshotResponse`

```typescript
interface MacroSnapshotResponse {
  vnIndex: number | null
  oilUsd: number | null
  goldUsd: number | null
  usdVnd: number | null
  signals: PriceSignal[]
  fetchedAt: string
}
```

**Flow:** Orchestrates `MacroScoreService.buildSnapshot()`, maps all fields through as-is.
