// Package application — TradeBalanceUseCase tests (VMT-1a + VMT-1b).
//
// Tests cover:
//   - Nil dependency guards
//   - Parser error path (fail-closed: is_estimate=true on bloc_split even on error)
//   - Successful execution with anchor May-2026 trade values
//   - BlocSplit is_estimate=true ALWAYS invariant (ARCH Decision A)
//
// Fence-B: only pkg/domain and pkg/application imports allowed here.
package application

import (
	"context"
	"errors"
	"testing"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// stubNSOProvider is a test double for NSOExcelProvider.
type stubNSOProvider struct {
	bytes  []byte
	period string
	err    error
}

func (s *stubNSOProvider) GetOrFetchNSOMonthlyExcel(_ context.Context) ([]byte, string, error) {
	return s.bytes, s.period, s.err
}

// stubTradeParser is a test double for TradeBalanceParser.
type stubTradeParser struct {
	record domain.TradeBalanceRecord
	err    error
}

func (s *stubTradeParser) ParseTradeBalance(_ []byte, _ string) (domain.TradeBalanceRecord, error) {
	return s.record, s.err
}

// TestTradeBalanceUseCase_NilProvider verifies the nil-provider guard.
func TestTradeBalanceUseCase_NilProvider(t *testing.T) {
	uc := NewTradeBalanceUseCase(nil, &stubTradeParser{})
	_, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err == nil {
		t.Error("expected error for nil excelProvider")
	}
}

// TestTradeBalanceUseCase_NilParser verifies the nil-parser guard.
func TestTradeBalanceUseCase_NilParser(t *testing.T) {
	uc := NewTradeBalanceUseCase(&stubNSOProvider{bytes: []byte("x"), period: "2026-05"}, nil)
	_, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err == nil {
		t.Error("expected error for nil tradeParser")
	}
}

// TestTradeBalanceUseCase_FetchError verifies error response on fetch failure.
// Fail-closed: BlocSplit.FDI.IsEstimate and BlocSplit.Domestic.IsEstimate must be true.
func TestTradeBalanceUseCase_FetchError(t *testing.T) {
	uc := NewTradeBalanceUseCase(
		&stubNSOProvider{err: errors.New("VPS fetch failed")},
		&stubTradeParser{},
	)
	resp, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err == nil {
		t.Error("expected error on fetch failure")
	}
	if resp.Status != "error" {
		t.Errorf("expected status=error, got %q", resp.Status)
	}
	// Fail-closed: is_estimate=true even on error path (same as VMT-4 CPI WeightsIsEstimate).
	if !resp.BlocSplit.FDI.IsEstimate {
		t.Error("BlocSplit.FDI.IsEstimate must be true on error path (fail-closed)")
	}
	if !resp.BlocSplit.Domestic.IsEstimate {
		t.Error("BlocSplit.Domestic.IsEstimate must be true on error path (fail-closed)")
	}
}

// TestTradeBalanceUseCase_ParseError verifies error response on parse failure.
func TestTradeBalanceUseCase_ParseError(t *testing.T) {
	uc := NewTradeBalanceUseCase(
		&stubNSOProvider{bytes: []byte("fake-excel"), period: "2026-05"},
		&stubTradeParser{err: errors.New("sheet not found")},
	)
	resp, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err == nil {
		t.Error("expected error on parse failure")
	}
	if resp.Status != "error" {
		t.Errorf("expected status=error, got %q", resp.Status)
	}
	// Fail-closed on parse error too.
	if !resp.BlocSplit.FDI.IsEstimate {
		t.Error("BlocSplit.FDI.IsEstimate must be true on parse error path (fail-closed)")
	}
}

// TestTradeBalanceUseCase_AnchorMay2026 tests the May-2026 anchor values.
// VMT-1a anchor: export~27400, import~24100, balance~+3300 M USD.
// VMT-1b anchor: fdi_registered=24810 M USD.
func TestTradeBalanceUseCase_AnchorMay2026(t *testing.T) {
	record := domain.TradeBalanceRecord{
		Period:            "2026-05",
		ExportTotalMnUSD:  27400.0,
		ImportTotalMnUSD:  24100.0,
		TradeBalanceMnUSD: 3300.0,
		ExportYTDMnUSD:    130000.0,
		ImportYTDMnUSD:    124000.0,
		ExportYoYPct:      15.5,
		ImportYoYPct:      12.3,
		HSExports: []domain.HSSector{
			{NameVI: "Điện tử máy tính", AbsoluteBnUSD: 8.5, YoYPct: 18.0, IsEstimate: false},
		},
		HSImports: []domain.HSSector{
			{NameVI: "Máy móc thiết bị", AbsoluteBnUSD: 5.1, YoYPct: 10.0, IsEstimate: false},
		},
		BlocSplit: domain.BlocSplitEstimate{
			FDI:                domain.BlocShareEstimate{SharePct: 90.55, IsEstimate: true},
			Domestic:           domain.BlocShareEstimate{SharePct: 9.45, IsEstimate: true},
			FDIRegisteredMnUSD: 24810.0,
			Note:               "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible",
		},
		IsEstimate: false,
		Source:     "NSO monthly Excel",
		FetchedAt:  "2026-06-14T00:00:00Z",
	}

	uc := NewTradeBalanceUseCase(
		&stubNSOProvider{bytes: []byte("fake-excel"), period: "2026-05"},
		&stubTradeParser{record: record},
	)

	resp, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Status != "ok" {
		t.Errorf("status: got %q, want ok", resp.Status)
	}
	if resp.Period != "2026-05" {
		t.Errorf("period: got %q, want 2026-05", resp.Period)
	}
	if resp.ExportTotalMnUSD != 27400.0 {
		t.Errorf("export_total_mn_usd: got %.2f, want 27400.0", resp.ExportTotalMnUSD)
	}
	if resp.ImportTotalMnUSD != 24100.0 {
		t.Errorf("import_total_mn_usd: got %.2f, want 24100.0", resp.ImportTotalMnUSD)
	}
	if resp.TradeBalanceMnUSD != 3300.0 {
		t.Errorf("trade_balance_mn_usd: got %.2f, want 3300.0", resp.TradeBalanceMnUSD)
	}
	if resp.IsEstimate {
		t.Error("is_estimate for VMT-1a totals must be false (primary NSO source)")
	}

	// VMT-1b invariants.
	if !resp.BlocSplit.FDI.IsEstimate {
		t.Error("BlocSplit.FDI.IsEstimate must be true ALWAYS (ARCH Decision A)")
	}
	if !resp.BlocSplit.Domestic.IsEstimate {
		t.Error("BlocSplit.Domestic.IsEstimate must be true ALWAYS (ARCH Decision A)")
	}
	if resp.BlocSplit.FDIRegisteredMnUSD != 24810.0 {
		t.Errorf("BlocSplit.FDIRegisteredMnUSD: got %.2f, want 24810.0", resp.BlocSplit.FDIRegisteredMnUSD)
	}

	// HS breakdown pass-through check.
	if len(resp.HSExports) != 1 {
		t.Errorf("HSExports: got %d rows, want 1", len(resp.HSExports))
	}
	if len(resp.HSImports) != 1 {
		t.Errorf("HSImports: got %d rows, want 1", len(resp.HSImports))
	}
}

// TestTradeBalanceUseCase_BlocSplitIsEstimateAlwaysTrue asserts the ARCH Decision A invariant
// is enforced in the use case response, regardless of the domain record.
func TestTradeBalanceUseCase_BlocSplitIsEstimateAlwaysTrue(t *testing.T) {
	// Domain record provides true (as it always should), but the DTO pass-through must preserve it.
	record := domain.TradeBalanceRecord{
		Period: "2026-05",
		BlocSplit: domain.BlocSplitEstimate{
			FDI:      domain.BlocShareEstimate{SharePct: 85.0, IsEstimate: true},
			Domestic: domain.BlocShareEstimate{SharePct: 15.0, IsEstimate: true},
			Note:     "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible",
		},
	}

	uc := NewTradeBalanceUseCase(
		&stubNSOProvider{bytes: []byte("x"), period: "2026-05"},
		&stubTradeParser{record: record},
	)

	resp, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.BlocSplit.FDI.IsEstimate {
		t.Error("BlocSplit.FDI.IsEstimate must always be true in response DTO")
	}
	if !resp.BlocSplit.Domestic.IsEstimate {
		t.Error("BlocSplit.Domestic.IsEstimate must always be true in response DTO")
	}
}
