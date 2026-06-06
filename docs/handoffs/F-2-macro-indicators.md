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
- [x] `totalLatencyMs` removed from summary map in handlers_external.go:161
- [x] All hardcoded `latencyMs: 0` removed from per-source entries
- [x] Unit test added/updated to verify absence
- [x] `GET :5004/external` verified (no latency fields in response)
- [x] macro-indicators container REBUILT (dev-team ops)

---

## [QA] Review Record — 2026-06-06T23:50Z

**Reviewer:** qa  
**Sprint:** FETCH-OPS-PAGE-TRUTH  
**Task:** F-2  
**Verdict: APPROVED**

### Test Results

| Suite | Result |
|---|---|
| `pkg/interface/http` (11 tests) | 11/11 PASS |
| `pkg/application` | PASS |
| `pkg/infrastructure` | PASS |
| `pkg/module/macro_signals` | PASS |
| `pkg/primitive/*` (5 packages) | PASS |
| `go vet ./...` | 0 errors |
| Full suite (`go test ./...`) | 11/11 packages PASS, 0 failures |

**Key tests verified:**
- `TestHandlersExternalLatencyRemoved` — PASS: `summary["totalLatencyMs"]` absent, no `latencyMs` in any source entry.
- `TestExternalBodyContract` — PASS: AC-3 assertion (`totalLatencyMs` must be absent) satisfied.
- `TestSnapshotBodyContract`, `TestSnapshotBodyIsNotArray` — PASS (no regression).

### AC Verification

| AC | Check | Result |
|---|---|---|
| AC-1 | `GET :5004/external` summary has NO `totalLatencyMs` | PASS — live response confirms absence |
| AC-2 | Per-source entries have NO `latencyMs` | PASS — all 3 sources clean |
| AC-3 | `TestHandlersExternalLatencyRemoved` asserts absence | PASS — test exists + passes |
| AC-4 | Container REBUILT | PASS — image `13d25c69b3e4` built 2026-06-06 23:46:16, running container uses this image |

### Live Endpoint Verification

`GET :5004/external` response (2026-06-06T21:47:52Z):
- `summary`: `{"failed":0,"ok":3}` — no `totalLatencyMs` key present.
- Sources (`vn-market`, `commodity-prices`, `macro-signals`): no `latencyMs` key in any source object.
- `status`: `"ok"`, `fetchedAt`: `"2026-06-06T21:47:52Z"` (live data).

### Container Image Verification

- Running container: `vn-market-intelligence-mcp-macro-indicators-1`
- Container image SHA: `sha256:13d25c69b3e4...`
- Latest built image: `13d25c69b3e4` (created 2026-06-06 23:46:16)
- Match: YES — container is running the freshly built image.

### DDD Layering

Change is interface-layer only (`pkg/interface/http/handlers_external.go` + corresponding test). No domain imports added. No cross-layer violations. DDD: PASS.

### Security

No `process.env`, no hardcoded secrets, no parameterized SQL changes. Security: PASS.

### Summary

Dev removed `"totalLatencyMs": 0` from the `summary` map and added `TestHandlersExternalLatencyRemoved` asserting its absence. The fix is minimal, correct, and live-verified. Container rebuilt and running the new image. All 11 Go packages pass. No regressions detected.
