// Package domain contains pure domain types for alert-engine.
// No I/O, no infrastructure imports.
package domain

// AlertSeverity represents the severity level of an alert.
type AlertSeverity string

const (
	SeverityLow      AlertSeverity = "low"
	SeverityMedium   AlertSeverity = "medium"
	SeverityHigh     AlertSeverity = "high"
	SeverityCritical AlertSeverity = "critical"
)

// IsValid returns true if s is one of the four valid severity values.
func (s AlertSeverity) IsValid() bool {
	switch s {
	case SeverityLow, SeverityMedium, SeverityHigh, SeverityCritical:
		return true
	}
	return false
}

// TelegramChannel identifies the destination Telegram channel.
type TelegramChannel string

const (
	ChannelMarket TelegramChannel = "market"
	ChannelWork   TelegramChannel = "work"
	ChannelBug    TelegramChannel = "bug"
)

// AlertRequest is the inbound request to evaluate an alert.
type AlertRequest struct {
	Stock       string
	Severity    AlertSeverity
	Message     string
	SignalTypes []string
	ActionCode  string
	// SendTelegram opts into Telegram routing when the alert fires. Mirrors
	// EvaluateAlertRequest.SendTelegram (default false — matches api/openapi.yaml
	// EvaluateAlertRequest.sendTelegram default). When false, the pipeline still
	// evaluates + stores a fired alert; it just never calls TelegramPort.Send.
	SendTelegram bool
}

// CooldownConfig holds cooldown, dedup-window, and daily-cap parameters.
type CooldownConfig struct {
	// CooldownMinutes is the window to suppress same stock+signal combo
	// (cooldown-gate primitive). Mirrors mcp.config.json alertQuality.cooldownMinutes.
	CooldownMinutes int
	// MaxAlertsPerStockPerDay is the daily cap per stock.
	MaxAlertsPerStockPerDay int
	// DedupWindowMinutes is the window (minutes) for exact-duplicate
	// fingerprint detection (AlertRepositoryPort.HasDuplicateFingerprint) —
	// a named field distinct from CooldownMinutes, not a reuse of the
	// cooldown window. Mirrors mcp.config.json alertQuality.dedupWindowMinutes
	// (FACTORY-ALERT-dedup-window-config).
	DedupWindowMinutes int
}

// DefaultCooldownConfig mirrors the live mcp.config.json `alertQuality` block
// (apps/mcp-server/src/infrastructure/config.ts AlertQualityConfig defaults):
// cooldownMinutes=30, maxAlertsPerStockPerDay=3, dedupWindowMinutes=60.
var DefaultCooldownConfig = CooldownConfig{
	CooldownMinutes:         30,
	MaxAlertsPerStockPerDay: 3,
	DedupWindowMinutes:      60,
}

// StoredAlert is a persisted alert record.
type StoredAlert struct {
	ID             int64
	Stocks         string
	SignalTypes    string // comma-separated
	Message        string
	Fingerprint    string
	Severity       AlertSeverity
	TriggeredAt    string // ISO 8601
	SentToTelegram int    // 0 | 1
}
