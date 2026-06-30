// Package infrastructure — SQLite room event repository.
// CGO required: mattn/go-sqlite3.
package infrastructure

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// SQLiteRoomEventRepository reads room events from foreign_room_events.
// RISK-2: event_type enum is ('ROOM_FULL', 'ROOM_REOPEN') — NOT ROOM_LOCKED/FULL_ROOM_SELL.
type SQLiteRoomEventRepository struct {
	dbPath string // readonly — market.db
}

// NewSQLiteRoomEventRepository creates the repository.
func NewSQLiteRoomEventRepository(marketDBPath string) *SQLiteRoomEventRepository {
	return &SQLiteRoomEventRepository{dbPath: marketDBPath}
}

// GetLatestRoomEvent returns the most recent room event for the given code.
// Returns (nil, nil) if:
//   - No event row exists for the ticker (honest-null handling)
//   - The foreign_room_events table does not exist (pre-migration state)
//
// Returns (nil, err) only on infrastructure failure.
func (r *SQLiteRoomEventRepository) GetLatestRoomEvent(code string) (*domain.RoomEvent, error) {
	// Note: readonly mode (mode=ro) conflicts with WAL journal mode creation.
	// Use immutable=1 for truly readonly access, or skip mode=ro for test scenarios.
	// For production: market.db is expected to have WAL already enabled.
	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000", r.dbPath)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open market.db: %w", err)
	}
	defer db.Close()

	// First check if table exists
	var tableExists int
	err = db.QueryRow(`
		SELECT COUNT(*) FROM sqlite_master
		WHERE type='table' AND name='foreign_room_events'
	`).Scan(&tableExists)
	if err != nil {
		return nil, fmt.Errorf("failed to check table existence: %w", err)
	}
	if tableExists == 0 {
		// Table doesn't exist — honest-null (pre-migration state)
		slog.Debug("foreign_room_events table not found", "code", code)
		return nil, nil
	}

	// FR-9: SELECT event_type FROM foreign_room_events WHERE code = ? ORDER BY event_date DESC LIMIT 1
	var eventType string
	var eventDate string
	err = db.QueryRow(`
		SELECT code, event_date, event_type
		FROM foreign_room_events
		WHERE code = ?
		ORDER BY event_date DESC
		LIMIT 1
	`, code).Scan(&code, &eventDate, &eventType)

	if errors.Is(err, sql.ErrNoRows) {
		// No event row for this ticker — honest-null
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query room event: %w", err)
	}

	// Map event_type string to enum
	var roomEventType domain.RoomEventType
	switch eventType {
	case "ROOM_FULL":
		roomEventType = domain.RoomEventFull
	case "ROOM_REOPEN":
		roomEventType = domain.RoomEventReopen
	default:
		// Unknown event type — log but don't fail
		slog.Warn("unknown room event type", "code", code, "event_type", eventType)
		roomEventType = domain.RoomEventType(eventType)
	}

	return &domain.RoomEvent{
		Code:      code,
		EventDate: eventDate,
		EventType: roomEventType,
	}, nil
}
