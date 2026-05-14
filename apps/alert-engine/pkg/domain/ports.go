// Package domain — repository port interfaces.
// These are the only I/O abstractions in the domain layer.
package domain

import "context"

// AlertRepositoryPort is the port for alert storage (dedup + cooldown state).
type AlertRepositoryPort interface {
	// GetRecentAlerts returns alerts for stock fired within the last withinMinutes.
	GetRecentAlerts(stock string, withinMinutes int) ([]StoredAlert, error)

	// CountTodayAlerts returns how many alerts fired for this stock today.
	CountTodayAlerts(stock string) (int, error)

	// StoreAlert persists a new alert record. Returns the new row ID.
	StoreAlert(alert StoredAlert) (int64, error)

	// HasDuplicateFingerprint returns true if fingerprint was seen within withinMinutes.
	HasDuplicateFingerprint(fingerprint string, withinMinutes int) (bool, error)
}

// MutePort is the port for mute state.
type MutePort interface {
	// IsStockMuted returns true if the stock is currently muted.
	IsStockMuted(stock string) (bool, error)
}

// TelegramPort is the port for sending Telegram messages.
type TelegramPort interface {
	// Send posts a message to the specified channel. Returns false on skip/error.
	Send(ctx context.Context, channel TelegramChannel, text string) (bool, error)
}
