# alert-engine — Use Cases

**Language:** Go 1.22 | **Package:** `pkg/application/`

## EvaluateAlertUseCase
- **File:** `apps/alert-engine/pkg/application/evaluate.go`
- **DTOs:** `apps/alert-engine/pkg/application/dtos.go`
- **Input:** `EvaluateAlertRequest`
- **Output:** `EvaluateAlertResponse`

### DTOs

```go
type EvaluateAlertRequest struct {
    Stock        string   `json:"stock"`
    Severity     string   `json:"severity"`
    Message      string   `json:"message"`
    SignalTypes  []string `json:"signalTypes,omitempty"`
    ActionCode   string   `json:"actionCode,omitempty"`
    SendTelegram bool     `json:"sendTelegram,omitempty"`
}

type EvaluateAlertResponse struct {
    Fired       bool   `json:"fired"`
    CooldownSec int    `json:"cooldown_sec"`
    Reason      string `json:"reason"`
    Fingerprint string `json:"fingerprint"`
}
```

### Execution Flow

1. **Compute fingerprint** from stock + signalTypes + message prefix (8-char DJB2 hex)
2. **Mute check:** `muteRepo.IsStockMuted(stock)` → fired=false, reason="stock muted"
3. **Dedup check:** Get alerts from last 60 min, check fingerprint → fired=false, reason="duplicate fingerprint"
4. **Cooldown/Cap check:** `domain.ShouldSuppressAlert()` → fired=false if suppressed
5. **Store alert:** Insert into DB with triggered_at=now, sent_telegram=0
6. **Send Telegram** (if sendTelegram=true):
   - Channel: `"market"` if severity in [critical, high], else `"work"`
   - Text format: `[SEVERITY] STOCK: message`
7. **Return:** fired=true, fingerprint, cooldown_sec=1800
