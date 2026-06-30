package infrastructure_test

import (
	"database/sql"
	"os"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	"github.com/vn-market-intelligence/stock-price/pkg/infrastructure"
)

func TestSQLiteRoomEventRepository_GetLatestRoomEvent(t *testing.T) {
	// Create temp DB
	f, err := os.CreateTemp("", "test_room_event_*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	dbPath := f.Name()
	f.Close()
	defer os.Remove(dbPath)

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	// RISK-2: event_type enum is ('ROOM_FULL', 'ROOM_REOPEN')
	_, err = db.Exec(`
		CREATE TABLE foreign_room_events (
			code TEXT NOT NULL,
			event_date TEXT NOT NULL,
			event_type TEXT NOT NULL,
			PRIMARY KEY (code, event_date)
		)
	`)
	if err != nil {
		t.Fatalf("failed to create table: %v", err)
	}

	// Insert test events
	_, err = db.Exec(`INSERT INTO foreign_room_events (code, event_date, event_type) VALUES ('VNM', '2026-06-30', 'ROOM_FULL')`)
	if err != nil {
		t.Fatalf("failed to insert VNM event: %v", err)
	}

	_, err = db.Exec(`INSERT INTO foreign_room_events (code, event_date, event_type) VALUES ('VIC', '2026-06-28', 'ROOM_FULL')`)
	if err != nil {
		t.Fatalf("failed to insert VIC event 1: %v", err)
	}
	_, err = db.Exec(`INSERT INTO foreign_room_events (code, event_date, event_type) VALUES ('VIC', '2026-06-30', 'ROOM_REOPEN')`)
	if err != nil {
		t.Fatalf("failed to insert VIC event 2: %v", err)
	}

	repo := infrastructure.NewSQLiteRoomEventRepository(dbPath)

	// Test VNM: ROOM_FULL (exhausted)
	event, err := repo.GetLatestRoomEvent("VNM")
	if err != nil {
		t.Fatalf("GetLatestRoomEvent VNM failed: %v", err)
	}
	if event == nil {
		t.Fatal("expected VNM event, got nil")
	}
	if event.EventType != domain.RoomEventFull {
		t.Errorf("expected VNM event_type=ROOM_FULL, got %v", event.EventType)
	}

	// Test VIC: ROOM_REOPEN (not exhausted)
	event, err = repo.GetLatestRoomEvent("VIC")
	if err != nil {
		t.Fatalf("GetLatestRoomEvent VIC failed: %v", err)
	}
	if event == nil {
		t.Fatal("expected VIC event, got nil")
	}
	if event.EventType != domain.RoomEventReopen {
		t.Errorf("expected VIC event_type=ROOM_REOPEN, got %v", event.EventType)
	}

	// Test FPT: no event row (honest-null)
	event, err = repo.GetLatestRoomEvent("FPT")
	if err != nil {
		t.Fatalf("GetLatestRoomEvent FPT failed: %v", err)
	}
	if event != nil {
		t.Errorf("expected FPT event=nil (honest-null), got %v", event)
	}
}

func TestSQLiteRoomEventRepository_TableNotExists(t *testing.T) {
	// Create temp DB with no tables
	f, err := os.CreateTemp("", "test_room_event_notable_*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	dbPath := f.Name()
	f.Close()
	defer os.Remove(dbPath)

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	db.Close()

	repo := infrastructure.NewSQLiteRoomEventRepository(dbPath)

	// Should return (nil, nil) for honest-null (table not exists)
	event, err := repo.GetLatestRoomEvent("VNM")
	if err != nil {
		t.Fatalf("GetLatestRoomEvent should not error when table missing: %v", err)
	}
	if event != nil {
		t.Errorf("expected nil event when table missing, got %v", event)
	}
}

func TestSQLiteRoomEventRepository_LatestEventOrder(t *testing.T) {
	// Ensure it returns the most recent event by date
	f, err := os.CreateTemp("", "test_room_event_order_*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	dbPath := f.Name()
	f.Close()
	defer os.Remove(dbPath)

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE foreign_room_events (
			code TEXT NOT NULL,
			event_date TEXT NOT NULL,
			event_type TEXT NOT NULL,
			PRIMARY KEY (code, event_date)
		)
	`)
	if err != nil {
		t.Fatalf("failed to create table: %v", err)
	}

	// Insert events out of order
	_, err = db.Exec(`INSERT INTO foreign_room_events (code, event_date, event_type) VALUES ('VNM', '2026-06-25', 'ROOM_FULL')`)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}
	_, err = db.Exec(`INSERT INTO foreign_room_events (code, event_date, event_type) VALUES ('VNM', '2026-06-30', 'ROOM_REOPEN')`)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}
	_, err = db.Exec(`INSERT INTO foreign_room_events (code, event_date, event_type) VALUES ('VNM', '2026-06-28', 'ROOM_FULL')`)
	if err != nil {
		t.Fatalf("insert failed: %v", err)
	}

	repo := infrastructure.NewSQLiteRoomEventRepository(dbPath)
	event, err := repo.GetLatestRoomEvent("VNM")
	if err != nil {
		t.Fatalf("GetLatestRoomEvent failed: %v", err)
	}

	// Should return the 2026-06-30 ROOM_REOPEN event (most recent)
	if event.EventDate != "2026-06-30" {
		t.Errorf("expected event_date=2026-06-30, got %s", event.EventDate)
	}
	if event.EventType != domain.RoomEventReopen {
		t.Errorf("expected event_type=ROOM_REOPEN, got %v", event.EventType)
	}
}
