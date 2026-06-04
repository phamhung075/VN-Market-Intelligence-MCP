// Integration tests — FetchPriceUseCase + PriceHistoryUseCase (6 cases)
// Ported from fetch-price-usecase.test.ts
// Fixture values identical: VCB price=88000, change=-1000, changePercent=-1.12
package application_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/application"
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

// ── mock helpers ──────────────────────────────────────────────────────────────

// mockResolver implements application.PriceResolverPort for test injection.
// It wraps a domain.PriceQuote (or nil) and returns it as a ResolvedQuote.
type mockResolver struct {
	quote *domain.PriceQuote
	err   error
	// captureCode records the last code passed to Resolve
	captureCode *string
}

func (m *mockResolver) Resolve(code string) (*priceresolution.ResolvedQuote, error) {
	if m.captureCode != nil {
		*m.captureCode = code
	}
	if m.err != nil {
		return nil, m.err
	}
	if m.quote == nil {
		return nil, &domain.PriceNotAvailableError{Code: code}
	}
	q := *m.quote
	q.Code = code
	return &priceresolution.ResolvedQuote{PriceQuote: q, Staleness: "FRESH"}, nil
}

type mockHistory struct {
	rows []domain.DailyOHLCV
}

func (h *mockHistory) GetHistory(_ string, _ int) ([]domain.DailyOHLCV, error) {
	return h.rows, nil
}

func (h *mockHistory) SaveQuote(_ *domain.PriceQuote) error { return nil }

// ptr returns a pointer to v. Helper to create *float64 values inline.
func ptr(v float64) *float64 { return &v }

func makeVCBQuote() *domain.PriceQuote {
	return &domain.PriceQuote{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        ptr(-1000), // DSI-INV-1: pointer for nullable change
		ChangePercent: ptr(-1.12), // DSI-INV-1: pointer for nullable change
		Source:        domain.SourceHOSE,
		LatencyMs:     45,
		FetchedAt:     time.Now().Format(time.RFC3339),
	}
}

func makeHistoryRows(days int) []domain.DailyOHLCV {
	rows := make([]domain.DailyOHLCV, days)
	for i := range rows {
		rows[i] = domain.DailyOHLCV{
			Date:   fmt.Sprintf("2026-01-%02d", i+1),
			Open:   85000,
			High:   87000,
			Low:    84000,
			Close:  86000,
			Volume: 1000000,
		}
	}
	return rows
}

// ── FetchPriceUseCase tests ────────────────────────────────────────────────────

func TestFetchPriceUseCase_CorrectShape(t *testing.T) {
	resolver := &mockResolver{quote: makeVCBQuote()}
	uc := application.NewFetchPriceUseCase(resolver)

	result, err := uc.Execute(application.FetchPriceRequest{Code: "VCB"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Code != "VCB" {
		t.Errorf("code: want VCB, got %s", result.Code)
	}
	if result.Price != 88000 {
		t.Errorf("price: want 88000, got %f", result.Price)
	}
	if result.Source != domain.SourceHOSE {
		t.Errorf("source: want hose, got %s", result.Source)
	}
	if result.LatencyMs < 0 {
		t.Error("latencyMs must be >= 0")
	}
	if result.FetchedAt == "" {
		t.Error("fetchedAt must not be empty")
	}
}

func TestFetchPriceUseCase_CodeUppercased(t *testing.T) {
	var captured string
	resolver := &mockResolver{quote: makeVCBQuote(), captureCode: &captured}
	uc := application.NewFetchPriceUseCase(resolver)

	_, err := uc.Execute(application.FetchPriceRequest{Code: "vcb"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if captured != "VCB" {
		t.Errorf("expected code uppercased to VCB, got %s", captured)
	}
}

func TestFetchPriceUseCase_PriceNotAvailablePropagated(t *testing.T) {
	resolver := &mockResolver{quote: nil}
	uc := application.NewFetchPriceUseCase(resolver)

	_, err := uc.Execute(application.FetchPriceRequest{Code: "UNKNOWN"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var notAvail *domain.PriceNotAvailableError
	if !errors.As(err, &notAvail) {
		t.Errorf("expected PriceNotAvailableError, got %T", err)
	}
}

// ── PriceHistoryUseCase tests ─────────────────────────────────────────────────

func TestPriceHistoryUseCase_CorrectShape(t *testing.T) {
	h := &mockHistory{rows: makeHistoryRows(30)}
	uc := application.NewPriceHistoryUseCase(h)

	result, err := uc.Execute(application.PriceHistoryRequest{Code: "VCB", Days: 30})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Code != "VCB" {
		t.Errorf("code: want VCB, got %s", result.Code)
	}
	if len(result.History) != 30 {
		t.Errorf("history len: want 30, got %d", len(result.History))
	}
}

func TestPriceHistoryUseCase_CodeUppercased(t *testing.T) {
	h := &mockHistory{rows: makeHistoryRows(5)}
	uc := application.NewPriceHistoryUseCase(h)

	result, err := uc.Execute(application.PriceHistoryRequest{Code: "hpg", Days: 5})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Code != "HPG" {
		t.Errorf("code: want HPG, got %s", result.Code)
	}
}

func TestPriceHistoryUseCase_EmptyForUnknown(t *testing.T) {
	h := &mockHistory{rows: []domain.DailyOHLCV{}}
	uc := application.NewPriceHistoryUseCase(h)

	result, err := uc.Execute(application.PriceHistoryRequest{Code: "UNKNOWN", Days: 30})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.History) != 0 {
		t.Errorf("expected empty history, got %d rows", len(result.History))
	}
}
