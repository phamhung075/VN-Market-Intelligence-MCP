// Package infrastructure contains the infrastructure layer implementations.
package infrastructure

import (
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// SQLiteMarkovAdapter implements MarkovPort using modernc.org/sqlite.
// Stub implementation - real DB access in Phase 2.
type SQLiteMarkovAdapter struct {
	repo *SQLiteReadingRepository
}

// NewSQLiteMarkovAdapter creates a new SQLiteMarkovAdapter.
func NewSQLiteMarkovAdapter() *SQLiteMarkovAdapter {
	return &SQLiteMarkovAdapter{
		repo: NewSQLiteReadingRepository(),
	}
}

// GetMarkovData implements MarkovPort interface.
// Returns Markov transition data for a hexagram number.
// Stub implementation - always returns nil (no Markov data).
func (a *SQLiteMarkovAdapter) GetMarkovData(hexagramNumber int) *domain.MarkovData {
	// Stub: return nil
	// Real implementation will query hexagram_transitions table
	return nil
}

// Ensure SQLiteMarkovAdapter implements MarkovPort.
var _ domain.MarkovPort = (*SQLiteMarkovAdapter)(nil)
