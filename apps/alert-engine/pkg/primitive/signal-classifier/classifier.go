// Package signalclassifier is a pure primitive that validates a severity string
// and maps it to the correct TelegramChannel.
//
// Fence-A: imports only stdlib. No infrastructure, no application, no interface,
// no CGO extensions, no credential values of any kind.
//
// Channel routing mirrors evaluate.go L126-130 exactly:
//   - critical | high → market
//   - medium | low    → work
//   - unknown         → Valid=false, zero-value channel
package signalclassifier

// AlertSeverity is the severity level of an alert (re-declared inline;
// Fence-A permits importing pkg/domain, but re-declaring 4 constants keeps
// the primitive fully self-contained and avoids any transitive import risk).
type AlertSeverity string

const (
	SeverityLow      AlertSeverity = "low"
	SeverityMedium   AlertSeverity = "medium"
	SeverityHigh     AlertSeverity = "high"
	SeverityCritical AlertSeverity = "critical"
)

// TelegramChannel identifies the destination Telegram channel.
type TelegramChannel string

const (
	ChannelMarket TelegramChannel = "market"
	ChannelWork   TelegramChannel = "work"
)

// ClassifyResult is the output of Classify.
type ClassifyResult struct {
	Severity AlertSeverity
	Channel  TelegramChannel
	Valid    bool
}

// Classify maps a severity string to its AlertSeverity constant and target
// TelegramChannel. Returns Valid=false if the severity string is not one of
// the four known values (low, medium, high, critical).
//
// Pure function — no I/O, no env reads, no network, no DB.
func Classify(severityStr string) ClassifyResult {
	s := AlertSeverity(severityStr)
	switch s {
	case SeverityCritical, SeverityHigh:
		return ClassifyResult{
			Severity: s,
			Channel:  ChannelMarket,
			Valid:    true,
		}
	case SeverityMedium, SeverityLow:
		return ClassifyResult{
			Severity: s,
			Channel:  ChannelWork,
			Valid:    true,
		}
	default:
		return ClassifyResult{
			Severity: "",
			Channel:  "",
			Valid:    false,
		}
	}
}
