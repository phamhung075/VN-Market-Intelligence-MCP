# alert-engine — Domain Model

**Language:** Go 1.22 | **Package:** `pkg/domain/`

## Types

### AlertSeverity & TelegramChannel
```go
type AlertSeverity string  // "low" | "medium" | "high" | "critical"
type TelegramChannel string // "market" | "work" | "bug"
```

### AlertRequest
```go
type AlertRequest struct {
    Stock        string
    Severity     AlertSeverity
    Message      string
    SignalTypes  []string
    ActionCode   string
    SendTelegram bool // added FACTORY-ALERT-consolidate-dual-engines — opt-in
                       // Telegram routing, default false; mirrors
                       // EvaluateAlertRequest.sendTelegram (openapi.yaml)
}
```

### CooldownConfig
```go
type CooldownConfig struct {
    CooldownMinutes         int // default 30 — cooldown-gate window
    MaxAlertsPerStockPerDay int // default 3
    DedupWindowMinutes      int // default 60 — HasDuplicateFingerprint window;
                                // named field, distinct from CooldownMinutes
                                // (FACTORY-ALERT-dedup-window-config). Mirrors
                                // mcp.config.json alertQuality.dedupWindowMinutes.
}
```

### StoredAlert (DB record)
```go
type StoredAlert struct {
    ID             int64
    Stocks         string
    SignalTypes    string        // comma-separated
    Message        string
    Fingerprint    string        // 8-char hex (DJB2 hash)
    Severity       AlertSeverity
    TriggeredAt    string        // ISO 8601
    SentToTelegram int           // 0 | 1
}
```

## Repository Ports

### AlertRepositoryPort
```go
type AlertRepositoryPort interface {
    GetRecentAlerts(stock string, withinMinutes int) ([]StoredAlert, error)
    CountTodayAlerts(stock string) (int, error)
    StoreAlert(alert StoredAlert) (int64, error)
    HasDuplicateFingerprint(fingerprint string, withinMinutes int) (bool, error)
}
```

### MutePort
```go
type MutePort interface {
    IsStockMuted(stock string) (bool, error)
}
```

### TelegramPort
```go
type TelegramPort interface {
    Send(ctx context.Context, channel TelegramChannel, text string) (bool, error)
}
```

## Domain Service Functions — superseded by primitives

The original inline domain functions (`computeFingerprint`, `shouldSuppressAlert`,
`IsDuplicate`) were extracted into deterministic, wall-clock-free primitives and
are no longer on the live path:

| Old function | Live replacement |
|---|---|
| `computeFingerprint` | `pkg/primitive/dedup-key-builder.BuildKey` |
| `shouldSuppressAlert` | `pkg/primitive/cooldown-gate.Check` (+ `pkg/primitive/signal-classifier.Classify` for severity) |
| `IsDuplicate` | `AlertRepositoryPort.HasDuplicateFingerprint` (dedup check moved to the repository) |

The originals lived at `apps/alert-engine/pkg/domain/_deprecated/services_v1.go`
(a build-excluded, zero-non-test-import dead package per
FACTORY-ALERT-consolidate-dual-engines) and were deleted
2026-07-24 (FACTORY-ALERT-delete-deprecated-domain, maintainability audit
2026-06-15) — superseded primitives above are the sole live implementation;
history is in git, not on disk.

## Error Types
- `AlertEngineError` (base, `pkg/domain/errors.go`)
- `AlertSuppressedError{Reason string}` — message: "Alert suppressed: {reason}"
