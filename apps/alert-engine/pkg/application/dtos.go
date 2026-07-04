// Package application — DTOs for alert evaluation.
package application

// EvaluateAlertRequest is the inbound request body for POST /evaluate.
type EvaluateAlertRequest struct {
	Stock        string   `json:"stock"`
	Severity     string   `json:"severity"`
	Message      string   `json:"message"`
	SignalTypes  []string `json:"signalTypes,omitempty"`
	ActionCode   string   `json:"actionCode,omitempty"`
	SendTelegram bool     `json:"sendTelegram,omitempty"`
}

// EvaluateAlertResponse is the JSON response for POST /evaluate.
// Satisfies BOTH the internal DTO shape AND clients.ts AlertEvaluateResponse.
//
// Internal DTO fields: fired, cooldown_sec, reason, fingerprint
// clients.ts fields:   alert_id, code, fired, reason, telegram_sent
//
// All fields present on every 200 response (AC-5).
type EvaluateAlertResponse struct {
	// Internal DTO fields
	Fired       bool   `json:"fired"`
	CooldownSec int    `json:"cooldown_sec"`
	Reason      string `json:"reason"`
	Fingerprint string `json:"fingerprint"`
	// clients.ts compatibility fields (D-1 reconciliation)
	AlertID      string `json:"alert_id"`
	Code         string `json:"code"`
	TelegramSent bool   `json:"telegram_sent"`
}
