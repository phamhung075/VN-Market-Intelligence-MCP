// Package domain — Foreign Accumulation Rank ports (dependency inversion).
package domain

// ForeignFlowRepository reads foreign flow data from daily_ohlcv.
type ForeignFlowRepository interface {
	// GetForeignFlow fetches trailing daily bars for the given codes.
	// Returns map[code][]ForeignFlowBar sorted by date DESC (most recent first).
	// Limit is the max number of bars per code (e.g., 20 for 20-day window).
	GetForeignFlow(codes []string, limit int) (map[string][]ForeignFlowBar, error)
}

// RoomEventRepository reads room events from foreign_room_events.
type RoomEventRepository interface {
	// GetLatestRoomEvent returns the most recent room event for the given code.
	// Returns (nil, nil) if no event row exists (honest-null handling).
	// Returns (nil, err) only on infrastructure failure.
	GetLatestRoomEvent(code string) (*RoomEvent, error)
}
