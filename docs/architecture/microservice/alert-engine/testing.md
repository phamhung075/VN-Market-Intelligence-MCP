# alert-engine — Testing

**Language:** Go 1.22 | **Test runner:** `go test`

## Unit Tests — Module (`alert_pipeline.Pipeline`) — single source of truth
**File:** `apps/alert-engine/pkg/module/alert_pipeline/pipeline_test.go`

The full evaluation story (classify→dedup→cooldown→mute→store→telegram) lives
here — `EvaluateAlertUseCase` (application layer) is a thin adapter over this
module and carries no evaluation logic of its own
(FACTORY-ALERT-consolidate-dual-engines, 2026-07-04).

| Test | Assertion |
|------|-----------|
| HappyPath fires | classify→fingerprint→no-dedup→no-cooldown→format→route, stores once, `AlertID`/`CooldownSec`/`TelegramSent` populated |
| DedupHit short-circuits | Duplicate fingerprint → fired=false, no route, no store. Pins `HasDuplicateFingerprint` called with `cfg.DedupWindowMinutes` (60, not the 30min `CooldownMinutes`) and the `"duplicate: fingerprint seen within 60min"` reason (FACTORY-ALERT-dedup-window-config) |
| MuteHit short-circuits | Muted stock → fired=false, no route, no store |
| CooldownSuppression | Same stock+signal within window → fired=false |
| InvalidSeverity | Unclassifiable severity → fired=false, no route |
| SendTelegramFalse fires without routing | `sendTelegram=false` → fired=true, stored, `TelegramSent=false`, `Send` never called |
| TelegramSkipped still fires+stores | Port returns `(false,nil)` (e.g. missing creds, AC-13) → fired=true, stored |
| TelegramError still fires+stores | Port returns an error → fired=true, stored, no error propagated |
| CooldownSec present on every branch | dedup / muted / invalid-severity branches all return the constant `cfg.CooldownMinutes*60` |
| ChannelRouting medium→work | Non-critical/high severities route to the work channel |

## Unit Tests — Application (adapter only)
**File:** `apps/alert-engine/pkg/application/evaluate_test.go`

Tests DTO mapping onto `Pipeline.Run`, not evaluation logic (covered above).

| Test | Assertion |
|------|-----------|
| FiresAndStoresAlert | fired=true, `alert_id`/`code`/`cooldown_sec`/`telegram_sent` all mapped correctly |
| DoesNotFireWhenMuted | Muted stock → fired=false, `alert_id=""` |
| DoesNotFireWhenDuplicate | Duplicate fingerprint → fired=false |
| SendTelegramFalse fires without dispatch | Adapter honors the `sendTelegram` opt-in default (false) |
| ChannelRouting critical→market | Adapter surfaces classifier-driven routing end-to-end |

## Unit Tests — Domain
**File:** `apps/alert-engine/pkg/domain/models_test.go`

| Test | Assertion |
|------|-----------|
| DefaultCooldownConfig DedupWindowMinutes | `DefaultCooldownConfig.DedupWindowMinutes == 60` (mirrors `mcp.config.json` `alertQuality.dedupWindowMinutes`) and stays distinct from `CooldownMinutes` (30) |

## Integration Tests — Infrastructure
**File:** `apps/alert-engine/pkg/infrastructure/sqlite_test.go` (incl. `TestTelegramClient_SilentSkipOnEmptyConfig`)

In-memory SQLite (`:memory:`) + Telegram client. Covers StoreAlert,
GetRecentAlerts, CountTodayAlerts, HasDuplicateFingerprint, IsStockMuted,
InitAlertTables idempotency, pending-outcome read/write, AC-13 silent skip.

## Integration Tests — Interface
**File:** `apps/alert-engine/pkg/interface/http/router_test.go`

`net/http/httptest`. Covers GET /health, POST /evaluate (fire, suppress,
validation, malformed JSON, stock normalisation, response shape).

## Primitive Tests
`pkg/primitive/{signal-classifier,dedup-key-builder,cooldown-gate}` — see each
primitive's own `*_test.go` (Fence-A pure-function coverage).

## Sandbox (G12 DoD Gate)
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
`docs/scenarios/alert-engine/module/alert-pipeline-golden.json` and
`alert-pipeline-edge.json` exercise `Pipeline.Run` directly through in-memory
mocks — zero DB, zero network, zero credentials.

## Run Commands
```bash
cd apps/alert-engine && go test ./pkg/... -count=1
cd apps/alert-engine && go vet ./...
cd apps/alert-engine && golangci-lint run ./...   # G4 depguard fences
```

## Test Counts (FACTORY-ALERT-dedup-window-config, 2026-07-28)
application: 5 | domain: 1 | infrastructure: 17 | interface/http: 9 | module/alert_pipeline: 10 |
primitive/cooldown-gate: 10 | primitive/dedup-key-builder: 7 | primitive/signal-classifier: 1 (7 subtests)
= **60 top-level tests (70 incl. subtests), 0 failing.** `go build ./...` clean, `go vet ./...` clean, sandbox 11/11 scenarios green.
