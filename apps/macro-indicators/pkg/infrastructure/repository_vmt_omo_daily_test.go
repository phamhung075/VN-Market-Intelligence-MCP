// Package infrastructure — tests for SQLiteOMODailyRepository (P0-3-OMO-CURVE).
//
// Uses a temp-file SQLite DB for each test.
// No live network calls; no external credentials.
// Covers: Persist (idempotent ON CONFLICT REPLACE), NetInjection5d (≤5 rows, skip gaps),
// PrevWeightedAvgRate (nil when empty / nil when no prior row).
package infrastructure

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
)

// newTestRepo creates a SQLiteOMODailyRepository backed by a temp file.
// Callers must defer repo.Close() and os.Remove(path).
func newTestRepo(t *testing.T) (*SQLiteOMODailyRepository, string) {
	t.Helper()
	f, err := os.CreateTemp("", "omo_daily_test_*.db")
	if err != nil {
		t.Fatalf("create temp DB: %v", err)
	}
	path := f.Name()
	f.Close()

	repo, err := NewSQLiteOMODailyRepository(path)
	if err != nil {
		os.Remove(path)
		t.Fatalf("NewSQLiteOMODailyRepository: %v", err)
	}
	return repo, path
}

func f64(v float64) *float64 { return &v }

// ---------------------------------------------------------------------------
// Persist tests
// ---------------------------------------------------------------------------

func TestSQLiteOMODailyRepository_Persist_Basic(t *testing.T) {
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	ctx := context.Background()
	row := application.OMODailyRow{
		AuctionDate:         "12/06/2026",
		AddBnVND:            1217.45,
		AbsorbBnVND:         0,
		NetOutstandingBnVND: 1217.45,
		WeightedAvgRatePct:  f64(4.5),
	}

	if err := repo.Persist(ctx, row); err != nil {
		t.Fatalf("Persist: %v", err)
	}

	// Verify via NetInjection5d.
	result, err := repo.NetInjection5d(ctx)
	if err != nil {
		t.Fatalf("NetInjection5d: %v", err)
	}
	if result.DaysInWindow != 1 {
		t.Errorf("DaysInWindow = %d; want 1", result.DaysInWindow)
	}
	if result.NetInjection5dBnVND == nil {
		t.Fatal("NetInjection5dBnVND should not be nil after insert")
	}
	if fmt.Sprintf("%.2f", *result.NetInjection5dBnVND) != "1217.45" {
		t.Errorf("NetInjection5dBnVND = %.2f; want 1217.45", *result.NetInjection5dBnVND)
	}
}

func TestSQLiteOMODailyRepository_Persist_Idempotent(t *testing.T) {
	// ON CONFLICT REPLACE: persisting the same auction_date twice rewrites with
	// the second row's values (idempotent per NFR-P03-3).
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	ctx := context.Background()
	row1 := application.OMODailyRow{
		AuctionDate:         "10/06/2026",
		AddBnVND:            500,
		AbsorbBnVND:         0,
		NetOutstandingBnVND: 500,
		WeightedAvgRatePct:  f64(4.5),
	}
	row2 := application.OMODailyRow{
		AuctionDate:         "10/06/2026", // same date
		AddBnVND:            600,
		AbsorbBnVND:         100,
		NetOutstandingBnVND: 500, // same net but different add/absorb
		WeightedAvgRatePct:  f64(4.75),
	}

	if err := repo.Persist(ctx, row1); err != nil {
		t.Fatalf("first Persist: %v", err)
	}
	if err := repo.Persist(ctx, row2); err != nil {
		t.Fatalf("second Persist (idempotent): %v", err)
	}

	// Only one row should exist; net is 500.
	result, err := repo.NetInjection5d(ctx)
	if err != nil {
		t.Fatalf("NetInjection5d: %v", err)
	}
	if result.DaysInWindow != 1 {
		t.Errorf("DaysInWindow = %d; want 1 (idempotent upsert)", result.DaysInWindow)
	}
	if result.NetInjection5dBnVND == nil || *result.NetInjection5dBnVND != 500 {
		t.Errorf("NetInjection5dBnVND = %v; want 500", result.NetInjection5dBnVND)
	}
}

// ---------------------------------------------------------------------------
// NetInjection5d tests
// ---------------------------------------------------------------------------

func TestSQLiteOMODailyRepository_NetInjection5d_Empty(t *testing.T) {
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	result, err := repo.NetInjection5d(context.Background())
	if err != nil {
		t.Fatalf("NetInjection5d on empty DB: %v", err)
	}
	if result.DaysInWindow != 0 {
		t.Errorf("DaysInWindow = %d; want 0", result.DaysInWindow)
	}
	if result.NetInjection5dBnVND != nil {
		t.Errorf("NetInjection5dBnVND should be nil for empty DB; got %v", *result.NetInjection5dBnVND)
	}
}

func TestSQLiteOMODailyRepository_NetInjection5d_CapAt5(t *testing.T) {
	// Insert 7 rows: net_injection_5d should sum only the 5 most-recent.
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	ctx := context.Background()
	// Dates in DD/MM/YYYY; sorted by our YYYYMMDD conversion.
	dates := []struct {
		date string
		net  float64
	}{
		{"01/06/2026", 100},
		{"02/06/2026", 200},
		{"03/06/2026", 300},
		{"04/06/2026", 400},
		{"05/06/2026", 500},
		{"06/06/2026", 600},
		{"09/06/2026", 700}, // most recent (skip 07–08 as weekend)
	}

	for _, d := range dates {
		if err := repo.Persist(ctx, application.OMODailyRow{
			AuctionDate:         d.date,
			AddBnVND:            d.net,
			AbsorbBnVND:         0,
			NetOutstandingBnVND: d.net,
		}); err != nil {
			t.Fatalf("Persist %q: %v", d.date, err)
		}
	}

	result, err := repo.NetInjection5d(ctx)
	if err != nil {
		t.Fatalf("NetInjection5d: %v", err)
	}
	if result.DaysInWindow != 5 {
		t.Errorf("DaysInWindow = %d; want 5", result.DaysInWindow)
	}

	// 5 most recent: 09/06 (700) + 06/06 (600) + 05/06 (500) + 04/06 (400) + 03/06 (300) = 2500
	wantSum := 700.0 + 600.0 + 500.0 + 400.0 + 300.0
	if result.NetInjection5dBnVND == nil {
		t.Fatal("NetInjection5dBnVND nil")
	}
	if fmt.Sprintf("%.0f", *result.NetInjection5dBnVND) != fmt.Sprintf("%.0f", wantSum) {
		t.Errorf("NetInjection5dBnVND = %.0f; want %.0f", *result.NetInjection5dBnVND, wantSum)
	}
}

func TestSQLiteOMODailyRepository_NetInjection5d_PartialWindow(t *testing.T) {
	// 3 rows: DaysInWindow should be 3, not 5 (honest partial sum).
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	ctx := context.Background()
	for _, d := range []struct{ date string; net float64 }{
		{"01/06/2026", 100},
		{"02/06/2026", 200},
		{"03/06/2026", 300},
	} {
		_ = repo.Persist(ctx, application.OMODailyRow{
			AuctionDate: d.date, AddBnVND: d.net, NetOutstandingBnVND: d.net,
		})
	}

	result, err := repo.NetInjection5d(ctx)
	if err != nil {
		t.Fatalf("NetInjection5d: %v", err)
	}
	if result.DaysInWindow != 3 {
		t.Errorf("DaysInWindow = %d; want 3", result.DaysInWindow)
	}
	if result.NetInjection5dBnVND == nil || *result.NetInjection5dBnVND != 600 {
		t.Errorf("NetInjection5dBnVND = %v; want 600", result.NetInjection5dBnVND)
	}
}

// ---------------------------------------------------------------------------
// PrevWeightedAvgRate tests
// ---------------------------------------------------------------------------

func TestSQLiteOMODailyRepository_PrevWeightedAvgRate_Empty(t *testing.T) {
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	rate, err := repo.PrevWeightedAvgRate(context.Background(), "12/06/2026")
	if err != nil {
		t.Fatalf("PrevWeightedAvgRate on empty DB: %v", err)
	}
	if rate != nil {
		t.Errorf("rate should be nil for empty DB; got %v", *rate)
	}
}

func TestSQLiteOMODailyRepository_PrevWeightedAvgRate_Found(t *testing.T) {
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	ctx := context.Background()
	// Insert two rows: 10/06 (rate 4.5) and 12/06 (rate 4.75).
	_ = repo.Persist(ctx, application.OMODailyRow{
		AuctionDate: "10/06/2026", AddBnVND: 500, NetOutstandingBnVND: 500, WeightedAvgRatePct: f64(4.5),
	})
	_ = repo.Persist(ctx, application.OMODailyRow{
		AuctionDate: "12/06/2026", AddBnVND: 600, NetOutstandingBnVND: 600, WeightedAvgRatePct: f64(4.75),
	})

	// PrevRate before 12/06/2026 should return 4.5 (from 10/06).
	rate, err := repo.PrevWeightedAvgRate(ctx, "12/06/2026")
	if err != nil {
		t.Fatalf("PrevWeightedAvgRate: %v", err)
	}
	if rate == nil {
		t.Fatal("rate should not be nil (prior row exists)")
	}
	if fmt.Sprintf("%.2f", *rate) != "4.50" {
		t.Errorf("PrevWeightedAvgRate = %.2f; want 4.50", *rate)
	}
}

func TestSQLiteOMODailyRepository_PrevWeightedAvgRate_NilWhenNoRateStored(t *testing.T) {
	// Prev row exists but has weighted_avg_rate_pct = NULL → returns nil.
	repo, path := newTestRepo(t)
	defer repo.Close()
	defer os.Remove(path)

	ctx := context.Background()
	_ = repo.Persist(ctx, application.OMODailyRow{
		AuctionDate:         "10/06/2026",
		AddBnVND:            500,
		NetOutstandingBnVND: 500,
		WeightedAvgRatePct:  nil, // no rate stored
	})

	rate, err := repo.PrevWeightedAvgRate(ctx, "12/06/2026")
	if err != nil {
		t.Fatalf("PrevWeightedAvgRate: %v", err)
	}
	if rate != nil {
		t.Errorf("rate should be nil (prev row has NULL rate); got %v", *rate)
	}
}
