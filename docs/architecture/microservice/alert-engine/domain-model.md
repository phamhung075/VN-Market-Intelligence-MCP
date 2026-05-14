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
    Stock       string
    Severity    AlertSeverity
    Message     string
    SignalTypes []string
    ActionCode  string
}
```

### CooldownConfig
```go
type CooldownConfig struct {
    CooldownMinutes         int // default 30
    MaxAlertsPerStockPerDay int // default 3
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

### EvaluateAlertResult
```go
type EvaluateAlertResult struct {
    Fired       bool
    CooldownSec int
    Reason      string
    Fingerprint string
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

## Domain Service Functions
- **File:** `apps/alert-engine/pkg/domain/services.go`

### computeFingerprint(alert)
- Uses DJB2 hash: `djb2(stock|sorted(signalTypes)|message[0:50])`
- Returns 8-char hex string (deterministic)

### shouldSuppressAlert(alert, recentAlerts, config)
**Suppression rules (checked in order):**

1. **Critical bypass:** severity='critical' AND actionCode!='MACRO' → **no suppression**
2. **Cooldown window:** For each recent alert in window (default 30 min):
   - If stocks match AND signal overlap → **suppress**
   - Signal overlap = empty signalTypes OR any signal in common
3. **Daily cap:** count >= maxAlertsPerStockPerDay (default 3) → **suppress**

Returns `SuppressResult{Suppress bool, Reason string}`

### IsDuplicate(fingerprint string, recentFingerprints []string) bool
Simple slice membership check within 60-minute window.

## Error Types
- `AlertEngineError` (base, `pkg/domain/errors.go`)
- `AlertSuppressedError{Reason string}` — message: "Alert suppressed: {reason}"
