// Package application_test — table tests for ComputeTAUseCase.Execute.
// FACTORY-TECHANALYSIS-go-livepath-tests: backstops the live/deployed Go request
// path (application layer) so the dead src/ TS shadow service can be safely
// deleted in a follow-up task.
package application_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// ── fakes (satisfy application.TACalculator / application.PriceRepo) ─────────

// fakeCalculator is a controllable stand-in for the infrastructure TACalculator.
// Records the closes/period it was invoked with for assertion.
type fakeCalculator struct {
	calls     int
	gotCloses []float64
	gotPeriod int
	result    *domain.TechnicalIndicators
	err       error
}

func (f *fakeCalculator) Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error) {
	f.calls++
	f.gotCloses = closes
	f.gotPeriod = period
	if f.err != nil {
		return nil, f.err
	}
	if f.result != nil {
		return f.result, nil
	}
	return &domain.TechnicalIndicators{RSI: []float64{50.0}}, nil
}

// fakePriceRepo is a controllable stand-in for the infrastructure SQLitePriceRepository.
// Records the symbol/limit it was invoked with for assertion.
type fakePriceRepo struct {
	calls     int
	gotSymbol string
	gotLimit  int
	candles   []domain.CandleStick
	err       error
}

func (f *fakePriceRepo) GetCandles(symbol string, limit int) ([]domain.CandleStick, error) {
	f.calls++
	f.gotSymbol = symbol
	f.gotLimit = limit
	if f.err != nil {
		return nil, f.err
	}
	return f.candles, nil
}

// ── table tests ────────────────────────────────────────────────────────────

func TestComputeTAUseCase_Execute_PureComputePath(t *testing.T) {
	calc := &fakeCalculator{result: &domain.TechnicalIndicators{RSI: []float64{62.5, 64.7}}}
	repo := &fakePriceRepo{}
	uc := application.NewComputeTAUseCase(calc, repo)

	req := application.ComputeTARequest{
		Symbol: "VCB",
		Period: 14,
		Closes: []float64{44.34, 44.09, 44.15, 43.61, 44.33},
	}
	resp, err := uc.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Symbol != "VCB" {
		t.Errorf("symbol: want VCB, got %s", resp.Symbol)
	}
	if len(resp.RSI) != 2 || resp.RSI[0] != 62.5 {
		t.Errorf("rsi: want [62.5 64.7], got %v", resp.RSI)
	}
	// Pure-compute path: closes supplied directly, DB must never be consulted.
	if repo.calls != 0 {
		t.Errorf("priceRepo.GetCandles calls: want 0 (pure-compute path), got %d", repo.calls)
	}
	if calc.calls != 1 {
		t.Errorf("calculator.Calculate calls: want 1, got %d", calc.calls)
	}
	if len(calc.gotCloses) != len(req.Closes) {
		t.Errorf("calculator received closes len %d, want %d", len(calc.gotCloses), len(req.Closes))
	}
	if calc.gotPeriod != 14 {
		t.Errorf("calculator received period %d, want 14", calc.gotPeriod)
	}
}

func TestComputeTAUseCase_Execute_DBBackedPath(t *testing.T) {
	calc := &fakeCalculator{}
	repo := &fakePriceRepo{
		candles: []domain.CandleStick{
			{Symbol: "VCB", Date: "2026-07-01", Close: 88000},
			{Symbol: "VCB", Date: "2026-07-02", Close: 88500},
			{Symbol: "VCB", Date: "2026-07-03", Close: 89000},
		},
	}
	uc := application.NewComputeTAUseCase(calc, repo)

	req := application.ComputeTARequest{Symbol: "VCB", Period: 14}
	resp, err := uc.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Symbol != "VCB" {
		t.Errorf("symbol: want VCB, got %s", resp.Symbol)
	}
	// DB-backed path: symbol only, closes empty → GetCandles must be invoked once,
	// mirroring the mcp-server defaultComputeTa query (limit=60).
	if repo.calls != 1 {
		t.Fatalf("priceRepo.GetCandles calls: want 1 (DB-backed path), got %d", repo.calls)
	}
	if repo.gotSymbol != "VCB" {
		t.Errorf("priceRepo received symbol %q, want VCB", repo.gotSymbol)
	}
	if repo.gotLimit != 60 {
		t.Errorf("priceRepo received limit %d, want 60", repo.gotLimit)
	}
	// Closes extracted from candles (in order) must be forwarded to the calculator.
	wantCloses := []float64{88000, 88500, 89000}
	if len(calc.gotCloses) != len(wantCloses) {
		t.Fatalf("calculator received closes len %d, want %d", len(calc.gotCloses), len(wantCloses))
	}
	for i, c := range wantCloses {
		if calc.gotCloses[i] != c {
			t.Errorf("calculator gotCloses[%d] = %v, want %v", i, calc.gotCloses[i], c)
		}
	}
}

func TestComputeTAUseCase_Execute_PeriodLessThanOrEqualZero_DefaultsTo14(t *testing.T) {
	cases := []struct {
		name   string
		period int
	}{
		{"zero", 0},
		{"negative", -5},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			calc := &fakeCalculator{}
			repo := &fakePriceRepo{}
			uc := application.NewComputeTAUseCase(calc, repo)

			req := application.ComputeTARequest{
				Closes: []float64{1, 2, 3},
				Period: c.period,
			}
			if _, err := uc.Execute(context.Background(), req); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if calc.gotPeriod != 14 {
				t.Errorf("period %d: calculator received period %d, want default 14", c.period, calc.gotPeriod)
			}
		})
	}
}

func TestComputeTAUseCase_Execute_EmptyClosesAndEmptySymbol_ReturnsError(t *testing.T) {
	calc := &fakeCalculator{}
	repo := &fakePriceRepo{}
	uc := application.NewComputeTAUseCase(calc, repo)

	req := application.ComputeTARequest{Period: 14} // no Closes, no Symbol
	_, err := uc.Execute(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for empty closes + empty symbol, got nil")
	}
	if err.Error() != "closes or symbol required" {
		t.Errorf("error message: want %q, got %q", "closes or symbol required", err.Error())
	}
	// Neither dependency should be touched — request is rejected before any I/O.
	if calc.calls != 0 {
		t.Errorf("calculator.Calculate calls: want 0, got %d", calc.calls)
	}
	if repo.calls != 0 {
		t.Errorf("priceRepo.GetCandles calls: want 0, got %d", repo.calls)
	}
}

func TestComputeTAUseCase_Execute_PriceRepoError_WrappedAndPropagated(t *testing.T) {
	calc := &fakeCalculator{}
	repo := &fakePriceRepo{err: fmt.Errorf("db unavailable")}
	uc := application.NewComputeTAUseCase(calc, repo)

	req := application.ComputeTARequest{Symbol: "VCB"}
	resp, err := uc.Execute(context.Background(), req)
	if err == nil {
		t.Fatal("expected error when priceRepo.GetCandles fails, got nil")
	}
	if resp.Symbol != "VCB" {
		t.Errorf("error response symbol: want VCB (preserved), got %s", resp.Symbol)
	}
	if calc.calls != 0 {
		t.Errorf("calculator must not be invoked when GetCandles fails, calls=%d", calc.calls)
	}
}

func TestComputeTAUseCase_Execute_CalculatorError_Propagated(t *testing.T) {
	calc := &fakeCalculator{err: fmt.Errorf("calculator boom")}
	repo := &fakePriceRepo{}
	uc := application.NewComputeTAUseCase(calc, repo)

	req := application.ComputeTARequest{Closes: []float64{1, 2, 3}}
	resp, err := uc.Execute(context.Background(), req)
	if err == nil {
		t.Fatal("expected error when calculator.Calculate fails, got nil")
	}
	if resp.RSI != nil {
		t.Errorf("error response should have zero-value indicators, got RSI=%v", resp.RSI)
	}
}
