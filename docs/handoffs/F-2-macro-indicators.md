# F-2: macro-indicators — remove fake latency field

**Sprint:** FETCH-OPS-PAGE-TRUTH  
**Owner:** dev-macro-indicators  
**Size:** XS  
**Created:** 2026-06-06T21:35:00Z  
**Depends:** None  
**Blocks:** None (frontend F-3 benefit from removal, but can proceed in parallel)

---

## Summary

Remove hardcoded `totalLatencyMs: 0` from the macro-indicators external handler response. The handler reads from cached SQLite only, not live HTTP sources, so zero latency is a fabrication. Removing the field unblocks frontend render guards.

---

## Files to Modify

- `apps/macro-indicators/pkg/interface/http/handlers_external.go:161` (approx) — remove `"totalLatencyMs": 0` from summary map; remove any per-source `latencyMs` fields that are hardcoded 0.

---

## Acceptance Criteria

1. **AC-1:** `GET :5004/external` response: `summary` object does NOT contain `totalLatencyMs` field.
2. **AC-2:** Per-source entries under `sources` do NOT contain `latencyMs` field (or contain it only when a real measured value exists — which currently never happens; remove entirely).
3. **AC-3:** Unit test `handlers_snapshot_contract_test.go` updated to assert absence of `totalLatencyMs`.
4. **AC-4:** macro-indicators container REBUILT (dev-team ops).

---

## Implementation Notes

**File:** `apps/macro-indicators/pkg/interface/http/handlers_external.go`

**Current pattern (approx line 161):**
```go
summary := map[string]interface{}{
  "totalLatencyMs": 0,
  "fetchedAt": time.Now(),
  ...
}
```

**Replace with:**
```go
summary := map[string]interface{}{
  "fetchedAt": time.Now(),
  ...
}
```

Scan the entire `handlers_external.go` file for any other hardcoded `latencyMs: 0` or similar fake-zero latency fields and remove them.

---

## Frontend Impact

Frontend `apps/frontend/app/domain/market.ts` already types `MacroSummary.totalLatencyMs` as `optional`. The render guard in dashboard.fetch.tsx:
```typescript
{summary.totalLatencyMs !== undefined && (<span>Total latency: {(summary.totalLatencyMs / 1000).toFixed(1)}s</span>)}
```

When `totalLatencyMs` is absent from the response, the conditional evaluates to false and the span does NOT render. This is the correct and desired behavior.

---

## Risk Flags

- **R-3 (breaking schema change):** Removal is safe because the frontend already guards with `!== undefined` check. Verify the conditional render guard is in place before shipping.

---

## Testing

Add or update unit test in `handlers_snapshot_contract_test.go`:

```go
func TestHandlersExternalLatencyRemoved(t *testing.T) {
  resp := handlers.GetExternalHandler()
  // Assert totalLatencyMs is NOT in summary
  assert.NotContains(t, resp["summary"], "totalLatencyMs")
  // Assert no source has latencyMs
  for _, source := range resp["sources"] {
    assert.NotContains(t, source, "latencyMs")
  }
}
```

---

## Handoff Acceptance

This task is complete when:
- [ ] `totalLatencyMs` removed from summary map in handlers_external.go:161
- [ ] All hardcoded `latencyMs: 0` removed from per-source entries
- [ ] Unit test added/updated to verify absence
- [ ] `GET :5004/external` verified (no latency fields in response)
- [ ] macro-indicators container REBUILT (dev-team ops)
