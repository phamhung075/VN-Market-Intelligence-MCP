// Package infrastructure — SQLite integration tests (AC-10, AC-11).
// Uses in-memory SQLite (":memory:") to mirror TS freshDb() pattern.
package infrastructure

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
)

// ── helpers ──────────────────────────────────────────────────────────────────

func freshDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:?_journal=WAL&_busy_timeout=5000&_foreign_keys=on")
	if err != nil {
		t.Fatalf("open in-memory DB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func mustInitTables(t *testing.T, db *sql.DB) {
	t.Helper()
	if err := InitAlertTables(db); err != nil {
		t.Fatalf("InitAlertTables: %v", err)
	}
}

func insertTestAlert(t *testing.T, db *sql.DB, stock string, triggeredAt string) int64 {
	t.Helper()
	res, err := db.Exec(`
		INSERT INTO alert_engine_records
			(stocks, signal_types, message, fingerprint, severity, triggered_at, sent_telegram)
		VALUES (?, 'price_surge', 'test msg', 'fp1', 'medium', ?, 0)
	`, stock, triggeredAt)
	if err != nil {
		t.Fatalf("insert test alert: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

// ── AC-10: InitAlertTables idempotent ────────────────────────────────────────

func TestInitAlertTables_Idempotent(t *testing.T) {
	db := freshDB(t)
	if err := InitAlertTables(db); err != nil {
		t.Fatalf("first InitAlertTables: %v", err)
	}
	// Second call must not error
	if err := InitAlertTables(db); err != nil {
		t.Fatalf("second InitAlertTables (idempotent): %v", err)
	}
}

// ── AC-10: GetRecentAlerts ────────────────────────────────────────────────────

func TestSQLiteAlertRepository_GetRecentAlerts(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)
	repo := NewSQLiteAlertRepository(db)

	now := time.Now().UTC()
	recent := now.Add(-5 * time.Minute).Format(time.RFC3339Nano)
	old := now.Add(-60 * time.Minute).Format(time.RFC3339Nano)

	insertTestAlert(t, db, "VCB", recent)
	insertTestAlert(t, db, "VCB", old)

	alerts, err := repo.GetRecentAlerts("VCB", 30)
	if err != nil {
		t.Fatalf("GetRecentAlerts: %v", err)
	}
	if len(alerts) != 1 {
		t.Errorf("expected 1 recent alert (within 30min), got %d", len(alerts))
	}
	if alerts[0].Stocks != "VCB" {
		t.Errorf("expected stock VCB, got %q", alerts[0].Stocks)
	}
}

func TestSQLiteAlertRepository_GetRecentAlerts_Empty(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)
	repo := NewSQLiteAlertRepository(db)

	alerts, err := repo.GetRecentAlerts("VCB", 30)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts, got %d", len(alerts))
	}
}

// ── AC-10: CountTodayAlerts ───────────────────────────────────────────────────

func TestSQLiteAlertRepository_CountTodayAlerts(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)
	repo := NewSQLiteAlertRepository(db)

	todayISO := time.Now().UTC().Format(time.RFC3339Nano)
	yesterday := time.Now().UTC().Add(-25 * time.Hour).Format(time.RFC3339Nano)

	insertTestAlert(t, db, "VCB", todayISO)
	insertTestAlert(t, db, "VCB", todayISO)
	insertTestAlert(t, db, "VCB", yesterday)

	cnt, err := repo.CountTodayAlerts("VCB")
	if err != nil {
		t.Fatalf("CountTodayAlerts: %v", err)
	}
	if cnt != 2 {
		t.Errorf("expected 2 today alerts, got %d", cnt)
	}
}

// ── AC-10: StoreAlert ────────────────────────────────────────────────────────

func TestSQLiteAlertRepository_StoreAlert(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)
	repo := NewSQLiteAlertRepository(db)

	alert := domain.StoredAlert{
		Stocks:      "VCB",
		SignalTypes: "price_surge",
		Message:     "test message",
		Fingerprint: "abc12345",
		Severity:    domain.SeverityHigh,
		TriggeredAt: time.Now().UTC().Format(time.RFC3339Nano),
	}

	id, err := repo.StoreAlert(alert)
	if err != nil {
		t.Fatalf("StoreAlert: %v", err)
	}
	if id <= 0 {
		t.Errorf("expected positive row ID, got %d", id)
	}
}

// ── AC-10: HasDuplicateFingerprint ───────────────────────────────────────────

func TestSQLiteAlertRepository_HasDuplicateFingerprint(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)
	repo := NewSQLiteAlertRepository(db)

	fp := "abc12345"
	now := time.Now().UTC().Format(time.RFC3339Nano)

	// No duplicate yet
	dup, err := repo.HasDuplicateFingerprint(fp, 60)
	if err != nil {
		t.Fatalf("HasDuplicateFingerprint: %v", err)
	}
	if dup {
		t.Error("expected false for empty DB")
	}

	// Insert alert with that fingerprint
	_, err = db.Exec(`
		INSERT INTO alert_engine_records
			(stocks, signal_types, message, fingerprint, severity, triggered_at, sent_telegram)
		VALUES ('VCB', '', 'test', ?, 'medium', ?, 0)
	`, fp, now)
	if err != nil {
		t.Fatalf("insert: %v", err)
	}

	dup, err = repo.HasDuplicateFingerprint(fp, 60)
	if err != nil {
		t.Fatalf("HasDuplicateFingerprint after insert: %v", err)
	}
	if !dup {
		t.Error("expected true after inserting same fingerprint")
	}
}

// ── AC-10: IsStockMuted ──────────────────────────────────────────────────────

func TestSQLiteMuteRepository_IsStockMuted(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)
	repo := NewSQLiteMuteRepository(db)

	// Not muted
	muted, err := repo.IsStockMuted("VCB")
	if err != nil {
		t.Fatalf("IsStockMuted: %v", err)
	}
	if muted {
		t.Error("expected false for unmuted stock")
	}

	// Insert future mute
	future := time.Now().UTC().Add(1 * time.Hour).Format(time.RFC3339)
	_, err = db.Exec(`INSERT INTO alert_mutes (stock, muted_until) VALUES (?, ?)`, "VCB", future)
	if err != nil {
		t.Fatalf("insert mute: %v", err)
	}

	muted, err = repo.IsStockMuted("VCB")
	if err != nil {
		t.Fatalf("IsStockMuted after insert: %v", err)
	}
	if !muted {
		t.Error("expected true for stock with future mute_until")
	}
}

func TestSQLiteMuteRepository_IsStockMuted_Expired(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)
	repo := NewSQLiteMuteRepository(db)

	// Insert expired mute (past)
	past := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339)
	_, err := db.Exec(`INSERT INTO alert_mutes (stock, muted_until) VALUES (?, ?)`, "TCB", past)
	if err != nil {
		t.Fatalf("insert expired mute: %v", err)
	}

	muted, err := repo.IsStockMuted("TCB")
	if err != nil {
		t.Fatalf("IsStockMuted expired: %v", err)
	}
	if muted {
		t.Error("expected false for expired mute")
	}
}

// ── AC-11: ReadPendingOutcomeAlerts ──────────────────────────────────────────

func TestReadPendingOutcomeAlerts_NullOutcomeOnly(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	id1 := insertTestAlert(t, db, "VCB", now) // NULL outcome — should appear
	id2 := insertTestAlert(t, db, "TCB", now)
	// mark id2 as scored
	_, err := db.Exec(`UPDATE alert_engine_records SET outcome = 'HIT' WHERE id = ?`, id2)
	if err != nil {
		t.Fatalf("update outcome: %v", err)
	}

	rows, err := ReadPendingOutcomeAlerts(db, 0)
	if err != nil {
		t.Fatalf("ReadPendingOutcomeAlerts: %v", err)
	}
	if len(rows) != 1 {
		t.Errorf("expected 1 pending alert, got %d", len(rows))
	}
	if rows[0].ID != id1 {
		t.Errorf("expected id %d, got %d", id1, rows[0].ID)
	}
}

func TestReadPendingOutcomeAlerts_ExcludesOlderThan90Days(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)

	old := time.Now().UTC().Add(-91 * 24 * time.Hour).Format(time.RFC3339Nano)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	insertTestAlert(t, db, "OLD", old)
	insertTestAlert(t, db, "RECENT", now)

	rows, err := ReadPendingOutcomeAlerts(db, 0)
	if err != nil {
		t.Fatalf("ReadPendingOutcomeAlerts: %v", err)
	}
	if len(rows) != 1 {
		t.Errorf("expected 1 result (RECENT only), got %d", len(rows))
	}
	if rows[0].Stocks != "RECENT" {
		t.Errorf("expected RECENT, got %q", rows[0].Stocks)
	}
}

func TestReadPendingOutcomeAlerts_RespectsLimit(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	for i := 0; i < 5; i++ {
		insertTestAlert(t, db, "VCB", now)
	}

	rows, err := ReadPendingOutcomeAlerts(db, 2)
	if err != nil {
		t.Fatalf("ReadPendingOutcomeAlerts with limit: %v", err)
	}
	if len(rows) != 2 {
		t.Errorf("expected 2 (limit=2), got %d", len(rows))
	}
}

func TestReadPendingOutcomeAlerts_ReturnsRequiredFields(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	insertTestAlert(t, db, "VCB", now)

	rows, err := ReadPendingOutcomeAlerts(db, 0)
	if err != nil {
		t.Fatalf("ReadPendingOutcomeAlerts: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row")
	}
	r := rows[0]
	if r.ID <= 0 {
		t.Error("expected positive ID")
	}
	if r.Stocks != "VCB" {
		t.Errorf("expected VCB, got %q", r.Stocks)
	}
	if r.Outcome != nil {
		t.Error("expected outcome=nil")
	}
	if r.SignalTypes == "" {
		// signal_types is 'price_surge' from insertTestAlert
		t.Error("expected non-empty signal_types")
	}
}

// ── AC-11: WriteAlertOutcome ─────────────────────────────────────────────────

func TestWriteAlertOutcome_UpdatesAndReturnsTrue(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := insertTestAlert(t, db, "VCB", now)

	detail, _ := json.Marshal(map[string]interface{}{"price": 123})
	ok, err := WriteAlertOutcome(db, id, "HIT", string(detail))
	if err != nil {
		t.Fatalf("WriteAlertOutcome: %v", err)
	}
	if !ok {
		t.Error("expected true on first write")
	}

	// Verify in DB
	var outcome, outcomeAt, outcomeDetail string
	err = db.QueryRow(
		`SELECT outcome, outcome_at, outcome_detail FROM alert_engine_records WHERE id = ?`, id,
	).Scan(&outcome, &outcomeAt, &outcomeDetail)
	if err != nil {
		t.Fatalf("select outcome: %v", err)
	}
	if outcome != "HIT" {
		t.Errorf("expected outcome=HIT, got %q", outcome)
	}
	if outcomeAt == "" {
		t.Error("expected non-empty outcome_at")
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(outcomeDetail), &parsed); err != nil {
		t.Errorf("outcome_detail not valid JSON: %v", err)
	}
}

func TestWriteAlertOutcome_Idempotent(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := insertTestAlert(t, db, "VCB", now)

	d1, _ := json.Marshal(map[string]interface{}{"price": 100})
	WriteAlertOutcome(db, id, "HIT", string(d1))

	d2, _ := json.Marshal(map[string]interface{}{"price": 200})
	ok2, err := WriteAlertOutcome(db, id, "MISS", string(d2))
	if err != nil {
		t.Fatalf("second WriteAlertOutcome: %v", err)
	}
	if ok2 {
		t.Error("expected false on second write (idempotent)")
	}

	var outcome string
	db.QueryRow(`SELECT outcome FROM alert_engine_records WHERE id = ?`, id).Scan(&outcome)
	if outcome != "HIT" {
		t.Errorf("expected outcome=HIT (not overwritten), got %q", outcome)
	}
}

func TestWriteAlertOutcome_NonExistentID(t *testing.T) {
	db := freshDB(t)
	mustInitTables(t, db)

	ok, err := WriteAlertOutcome(db, 9999, "HIT", "{}")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("expected false for non-existent ID")
	}
}

// ── Telegram: silent skip on empty config ────────────────────────────────────

func TestTelegramClient_SilentSkipOnEmptyConfig(t *testing.T) {
	cfg := ServiceConfig{
		TelegramBotToken: "",
		TelegramMarketID: "",
		TelegramWorkID:   "",
		TelegramBugID:    "",
	}
	client := NewTelegramClient(cfg)

	// Should return false, no error, no HTTP call
	sent, err := client.Send(nil, domain.ChannelWork, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sent {
		t.Error("expected sent=false when config is empty")
	}
}

// Verify strings import used (suppress unused import if compiler detects)
var _ = strings.Contains
