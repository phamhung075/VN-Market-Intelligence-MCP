// Package infrastructure — SQLite repository implementations.
// Implements domain ports using database/sql + mattn/go-sqlite3 (CGO).
// WAL mode, single connection opened at startup, closed on shutdown.
package infrastructure

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
)

// outcomeLookbackDays bounds ReadPendingOutcomeAlerts to alerts triggered
// within the last N days.
const outcomeLookbackDays = 90

// defaultPendingLimit is the fallback row limit for ReadPendingOutcomeAlerts
// when the caller passes limit<=0.
const defaultPendingLimit = 100

// OpenAlertDB opens (or creates) the alert_engine.db with WAL mode.
// DSN per NFR-2: file:<path>?_journal=WAL&_busy_timeout=5000&_foreign_keys=on
func OpenAlertDB(path string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_journal=WAL&_busy_timeout=5000&_foreign_keys=on", path)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open alert DB: %w", err)
	}
	// Single writer — no parallel writers for this DB.
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping alert DB: %w", err)
	}
	return db, nil
}

// InitAlertTables runs idempotent DDL to create tables + indexes + outcome columns.
// Mirrors TS initAlertTables + runAlertOutcomeMigration (AC-10, AC-11).
//
// DDL is split into three ordered phases to guarantee correct ordering on
// pre-migration (TS-era) DBs where alert_engine_records exists WITHOUT outcome
// columns. Mixing CREATE INDEX referencing outcome with the base CREATE TABLE
// block would fail on those DBs because the partial index is evaluated before
// ALTER TABLE can add the column.
//
// Phase 1: base tables + non-outcome indexes
// Phase 2: ALTER TABLE to add outcome columns (idempotent, ignores duplicate-column error)
// Phase 3: partial index referencing outcome — safe only after Phase 2 ensures column exists
func InitAlertTables(db *sql.DB) error {
	// Phase 1 — base schema (no outcome columns, no outcome index).
	phase1 := `
	CREATE TABLE IF NOT EXISTS alert_engine_records (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		stocks        TEXT NOT NULL,
		signal_types  TEXT NOT NULL DEFAULT '',
		message       TEXT NOT NULL DEFAULT '',
		fingerprint   TEXT NOT NULL DEFAULT '',
		severity      TEXT NOT NULL DEFAULT 'medium',
		triggered_at  TEXT NOT NULL,
		sent_telegram INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_alert_engine_stocks
		ON alert_engine_records(stocks, triggered_at);
	CREATE INDEX IF NOT EXISTS idx_alert_engine_fingerprint
		ON alert_engine_records(fingerprint, triggered_at);
	CREATE TABLE IF NOT EXISTS alert_mutes (
		stock      TEXT PRIMARY KEY,
		muted_until TEXT NOT NULL
	);
	`
	if _, err := db.Exec(phase1); err != nil {
		return fmt.Errorf("init alert tables phase1: %w", err)
	}

	// Phase 2 — idempotent ALTER TABLE for outcome columns.
	// SQLite returns "duplicate column name" if already present; we ignore that.
	alterCols := []struct {
		col string
		def string
	}{
		{"outcome", "TEXT"},
		{"outcome_at", "TEXT"},
		{"outcome_detail", "TEXT"},
	}
	for _, ac := range alterCols {
		_, err := db.Exec(fmt.Sprintf(
			"ALTER TABLE alert_engine_records ADD COLUMN %s %s", ac.col, ac.def,
		))
		if err != nil {
			// Ignore "duplicate column name" (column already exists)
			if sqliteIsDuplicateColumn(err) {
				continue
			}
			// Any other error is real
			return fmt.Errorf("alter column %s: %w", ac.col, err)
		}
	}

	// Phase 3 — partial index on outcome, safe now that outcome column exists.
	// "already exists" is benign (idempotent on fresh DBs).
	if _, err := db.Exec(
		`CREATE INDEX IF NOT EXISTS idx_alerts_outcome_pending ON alert_engine_records(outcome) WHERE outcome IS NULL`,
	); err != nil {
		return fmt.Errorf("init alert tables phase3 outcome index: %w", err)
	}

	return nil
}

// sqliteIsDuplicateColumn returns true if err is a "duplicate column name" SQLite error.
func sqliteIsDuplicateColumn(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "duplicate column name")
}

// ── SQLiteAlertRepository ────────────────────────────────────────────────────

// SQLiteAlertRepository implements domain.AlertRepositoryPort via SQLite.
type SQLiteAlertRepository struct {
	db *sql.DB
}

// NewSQLiteAlertRepository creates a new repository backed by db.
func NewSQLiteAlertRepository(db *sql.DB) *SQLiteAlertRepository {
	return &SQLiteAlertRepository{db: db}
}

// GetRecentAlerts returns alerts for stock fired within the last withinMinutes.
// Mirrors TS getRecentAlerts SQL exactly.
func (r *SQLiteAlertRepository) GetRecentAlerts(stock string, withinMinutes int) ([]domain.StoredAlert, error) {
	cutoff := time.Now().UTC().Add(-time.Duration(withinMinutes) * time.Minute).Format(time.RFC3339Nano)
	rows, err := r.db.Query(`
		SELECT
			id,
			stocks,
			signal_types,
			message,
			fingerprint,
			severity,
			triggered_at,
			sent_telegram
		FROM alert_engine_records
		WHERE stocks = ? AND triggered_at >= ?
		ORDER BY triggered_at DESC
	`, stock, cutoff)
	if err != nil {
		return nil, fmt.Errorf("get recent alerts: %w", err)
	}
	defer rows.Close()

	var alerts []domain.StoredAlert
	for rows.Next() {
		var a domain.StoredAlert
		var sev string
		if err := rows.Scan(
			&a.ID,
			&a.Stocks,
			&a.SignalTypes,
			&a.Message,
			&a.Fingerprint,
			&sev,
			&a.TriggeredAt,
			&a.SentToTelegram,
		); err != nil {
			return nil, fmt.Errorf("scan alert row: %w", err)
		}
		a.Severity = domain.AlertSeverity(sev)
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}

// CountTodayAlerts returns how many alerts fired for this stock today.
func (r *SQLiteAlertRepository) CountTodayAlerts(stock string) (int, error) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Format(time.RFC3339Nano)
	var cnt int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM alert_engine_records
		WHERE stocks = ? AND triggered_at >= ?
	`, stock, todayStart).Scan(&cnt)
	if err != nil {
		return 0, fmt.Errorf("count today alerts: %w", err)
	}
	return cnt, nil
}

// StoreAlert persists a new alert record. Returns the new row ID.
func (r *SQLiteAlertRepository) StoreAlert(alert domain.StoredAlert) (int64, error) {
	res, err := r.db.Exec(`
		INSERT INTO alert_engine_records
			(stocks, signal_types, message, fingerprint, severity, triggered_at, sent_telegram)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
		alert.Stocks,
		alert.SignalTypes,
		alert.Message,
		alert.Fingerprint,
		string(alert.Severity),
		alert.TriggeredAt,
		alert.SentToTelegram,
	)
	if err != nil {
		return 0, fmt.Errorf("store alert: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("last insert id: %w", err)
	}
	return id, nil
}

// HasDuplicateFingerprint returns true if fingerprint was seen within withinMinutes.
func (r *SQLiteAlertRepository) HasDuplicateFingerprint(fingerprint string, withinMinutes int) (bool, error) {
	cutoff := time.Now().UTC().Add(-time.Duration(withinMinutes) * time.Minute).Format(time.RFC3339Nano)
	var cnt int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM alert_engine_records
		WHERE fingerprint = ? AND triggered_at >= ?
	`, fingerprint, cutoff).Scan(&cnt)
	if err != nil {
		return false, fmt.Errorf("has duplicate fingerprint: %w", err)
	}
	return cnt > 0, nil
}

// ── SQLiteMuteRepository ─────────────────────────────────────────────────────

// SQLiteMuteRepository implements domain.MutePort via SQLite.
type SQLiteMuteRepository struct {
	db *sql.DB
}

// NewSQLiteMuteRepository creates a new mute repository.
func NewSQLiteMuteRepository(db *sql.DB) *SQLiteMuteRepository {
	return &SQLiteMuteRepository{db: db}
}

// IsStockMuted returns true if the stock has an active (non-expired) mute.
func (r *SQLiteMuteRepository) IsStockMuted(stock string) (bool, error) {
	var mutedUntil string
	err := r.db.QueryRow(
		`SELECT muted_until FROM alert_mutes WHERE stock = ?`, stock,
	).Scan(&mutedUntil)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("is stock muted: %w", err)
	}
	// Parse ISO date and compare with now
	t, err := time.Parse(time.RFC3339, mutedUntil)
	if err != nil {
		t2, err2 := time.Parse(time.RFC3339Nano, mutedUntil)
		if err2 != nil {
			return false, nil
		}
		t = t2
	}
	return t.After(time.Now()), nil
}

// ── Alert outcome store (AC-11) ──────────────────────────────────────────────

// PendingOutcomeAlert is a raw alert row with NULL outcome.
type PendingOutcomeAlert struct {
	ID             int64
	Stocks         string
	SignalTypes    string
	Message        string
	Fingerprint    string
	Severity       string
	TriggeredAt    string
	SentToTelegram int
	Outcome        *string
	OutcomeAt      *string
	OutcomeDetail  *string
}

// ReadPendingOutcomeAlerts returns alerts with NULL outcome created within last 90 days.
// limit defaults to 100.
func ReadPendingOutcomeAlerts(db *sql.DB, limit int) ([]PendingOutcomeAlert, error) {
	if limit <= 0 {
		limit = defaultPendingLimit
	}
	cutoff := time.Now().UTC().Add(-outcomeLookbackDays * 24 * time.Hour).Format(time.RFC3339Nano)
	rows, err := db.Query(`
		SELECT
			id, stocks, signal_types, message, fingerprint, severity,
			triggered_at, sent_telegram, outcome, outcome_at, outcome_detail
		FROM alert_engine_records
		WHERE outcome IS NULL
		  AND triggered_at > ?
		ORDER BY triggered_at ASC
		LIMIT ?
	`, cutoff, limit)
	if err != nil {
		return nil, fmt.Errorf("read pending outcome alerts: %w", err)
	}
	defer rows.Close()

	var result []PendingOutcomeAlert
	for rows.Next() {
		var a PendingOutcomeAlert
		if err := rows.Scan(
			&a.ID, &a.Stocks, &a.SignalTypes, &a.Message, &a.Fingerprint, &a.Severity,
			&a.TriggeredAt, &a.SentToTelegram, &a.Outcome, &a.OutcomeAt, &a.OutcomeDetail,
		); err != nil {
			return nil, fmt.Errorf("scan pending outcome row: %w", err)
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

// WriteAlertOutcome scores an alert. Idempotent: second call returns false.
func WriteAlertOutcome(db *sql.DB, alertID int64, outcome string, detail string) (bool, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := db.Exec(`
		UPDATE alert_engine_records
		SET outcome = ?, outcome_at = ?, outcome_detail = ?
		WHERE id = ? AND outcome IS NULL
	`, outcome, now, detail, alertID)
	if err != nil {
		return false, fmt.Errorf("write alert outcome: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("rows affected: %w", err)
	}
	return affected > 0, nil
}
