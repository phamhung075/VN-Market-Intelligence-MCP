# alert-engine — Testing

**Language:** Go 1.22 | **Test runner:** `go test`

## Unit Tests — Domain
**File:** `apps/alert-engine/pkg/domain/services_test.go`

| Test | Assertion |
|------|-----------|
| ComputeFingerprint deterministic | Same input → same 8-char hex |
| ComputeFingerprint order-independent | SignalTypes sorted before hash |
| ComputeFingerprint stock-dependent | Different stock → different hash |
| ShouldSuppressAlert cooldown | Recent matching alert → suppress |
| ShouldSuppressAlert daily cap | 3+ alerts today → suppress |
| ShouldSuppressAlert critical bypass | Critical non-MACRO → no suppression |
| ShouldSuppressAlert MACRO rules | Critical MACRO → follows normal rules |
| IsDuplicate empty list | Returns false |
| IsDuplicate membership | Known fingerprint → true |

## Unit Tests — Application
**File:** `apps/alert-engine/pkg/application/evaluate_test.go`

| Test | Assertion |
|------|-----------|
| EvaluateAlertUseCase fire | Store + return fired=true |
| EvaluateAlertUseCase mute | Muted stock → fired=false |
| EvaluateAlertUseCase dedup | Duplicate fingerprint → fired=false |

## Integration Tests — Infrastructure
**File:** `apps/alert-engine/pkg/infrastructure/sqlite_test.go`

In-memory SQLite (`:memory:`). 16 tests covering StoreAlert, GetRecentAlerts, CountTodayAlerts, HasDuplicateFingerprint, IsStockMuted, InitAlertTables idempotency.

## Integration Tests — Interface
**File:** `apps/alert-engine/pkg/interface/http/router_test.go`

`net/http/httptest`. 8 tests covering GET /health, POST /evaluate (fire, suppress, validation, malformed JSON).

## Run Commands
```bash
cd apps/alert-engine && go test ./pkg/... -count=1
cd apps/alert-engine && go vet ./...
```

## Test Counts (c108 — QA APPROVED)
domain: 10 | application: 3 | infrastructure: 16 | interface/http: 8 = **37 total**
