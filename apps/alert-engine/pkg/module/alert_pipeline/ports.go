// Package alertpipeline composes the three alert-engine primitives
// (signal-classifier, dedup-key-builder, cooldown-gate) into the single
// end-to-end pipeline: classify → fingerprint → dedup → cooldown → mute →
// format → route.
//
// Fence-B (HARD): this module imports primitives + pkg/domain + stdlib ONLY.
// It MUST NOT import pkg/infrastructure, pkg/application, pkg/interface, any
// SQLite driver, or any Telegram client. All I/O crosses the slim port
// interfaces declared below; concrete implementations are injected by the
// (future) composition root in production and by in-memory mocks in tests and
// the sandbox harness. The module knows ports as interfaces — never concretes.
//
// ZERO-CREDS: this package contains no token, chat-id, or other credential
// value. TelegramPort is an abstraction over the wire; the credential lives in
// the injected infrastructure implementation, never here.
//
// Ports option (per handoff RETURN): Option B — slim module-local interfaces.
// We declare interfaces carrying only the methods the pipeline actually calls
// (structural subset of the broader domain ports). Domain's concrete
// repository/mute/telegram adapters satisfy these by structural typing, so the
// composition root can inject the real adapters without any explicit coupling
// from this module to the domain port *interfaces*. We still depend on
// pkg/domain for the shared value types (StoredAlert, TelegramChannel), which
// Fence-B permits since domain is neither infrastructure, application, nor
// interface.
package alertpipeline

import (
	"context"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
)

// AlertRepositoryPort is the slim repository port the pipeline depends on.
// It carries only the methods needed to resolve dedup state and recent-alert
// history for the cooldown decision, plus persistence of a fired alert.
type AlertRepositoryPort interface {
	// GetRecentAlerts returns alerts for stock fired within the last withinMinutes.
	GetRecentAlerts(stock string, withinMinutes int) ([]domain.StoredAlert, error)

	// HasDuplicateFingerprint reports whether fingerprint was seen within withinMinutes.
	HasDuplicateFingerprint(fingerprint string, withinMinutes int) (bool, error)

	// StoreAlert persists a new alert record. Returns the new row ID.
	StoreAlert(alert domain.StoredAlert) (int64, error)
}

// MutePort is the slim mute port the pipeline depends on.
type MutePort interface {
	// IsStockMuted reports whether the stock is currently muted.
	IsStockMuted(stock string) (bool, error)
}

// TelegramPort is the slim outbound routing port the pipeline depends on.
// It is an abstraction only — it holds no credential, channel id, or token.
type TelegramPort interface {
	// Send posts text to the given channel. Returns false on skip/error.
	Send(ctx context.Context, channel domain.TelegramChannel, text string) (bool, error)
}
