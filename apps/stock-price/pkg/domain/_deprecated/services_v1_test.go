// DEPRECATED — superseded by pkg/module/price_resolution tests (G5a, P2-F).
// Kept for history; excluded from compilation via build constraint.
// Do NOT run or reference. Archive only.
//
//go:build ignore

// Unit tests — ResolvePriceService (7 cases, ported from resolve-price-service.test.ts)
package domain_test

import (
	"errors"
	"testing"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// ── helpers ─────────────────────────────────────────────────────────────────

func makeQuote(code string, source domain.PriceSource) *domain.PriceQuote {
	return &domain.PriceQuote{
		Code:          code,
		Price:         75000,
		Volume:        1000000,
		Change:        500,
		ChangePercent: 0.67,
		Source:        source,
		LatencyMs:     50,
		FetchedAt:     time.Now().Format(time.RFC3339),
	}
}

// mockFetcher returns a fixed quote (or nil) every call.
type mockFetcher struct {
	quote *domain.PriceQuote
	err   error
}

func (m *mockFetcher) FetchPrice(_ string) (*domain.PriceQuote, error) {
	return m.quote, m.err
}

// trackingHistory records SaveQuote calls.
type trackingHistory struct {
	saved []*domain.PriceQuote
}

func (h *trackingHistory) GetHistory(_ string, _ int) ([]domain.DailyOHLCV, error) {
	return nil, nil
}

func (h *trackingHistory) SaveQuote(q *domain.PriceQuote) error {
	h.saved = append(h.saved, q)
	return nil
}

// ── tests ─────────────────────────────────────────────────────────────────────

func TestResolvePriceService_Tier1Wins(t *testing.T) {
	svc := domain.NewResolvePriceService(
		&mockFetcher{quote: makeQuote("VCB", domain.SourceHOSE)},
		&mockFetcher{quote: makeQuote("VCB", domain.SourceHNX)},
		&mockFetcher{quote: makeQuote("VCB", domain.SourceCache)},
		&trackingHistory{},
	)
	result, err := svc.FetchPrice("VCB")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Source != domain.SourceHOSE {
		t.Errorf("expected source=hose, got %s", result.Source)
	}
}

func TestResolvePriceService_Tier2Fallback(t *testing.T) {
	svc := domain.NewResolvePriceService(
		&mockFetcher{quote: nil},
		&mockFetcher{quote: makeQuote("VCB", domain.SourceHNX)},
		&mockFetcher{quote: makeQuote("VCB", domain.SourceCache)},
		&trackingHistory{},
	)
	result, err := svc.FetchPrice("VCB")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Source != domain.SourceHNX {
		t.Errorf("expected source=hnx, got %s", result.Source)
	}
}

func TestResolvePriceService_Tier3Fallback(t *testing.T) {
	svc := domain.NewResolvePriceService(
		&mockFetcher{quote: nil},
		&mockFetcher{quote: nil},
		&mockFetcher{quote: makeQuote("VCB", domain.SourceCache)},
		&trackingHistory{},
	)
	result, err := svc.FetchPrice("VCB")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Source != domain.SourceCache {
		t.Errorf("expected source=cache, got %s", result.Source)
	}
}

func TestResolvePriceService_AllNilThrows(t *testing.T) {
	svc := domain.NewResolvePriceService(
		&mockFetcher{quote: nil},
		&mockFetcher{quote: nil},
		&mockFetcher{quote: nil},
		&trackingHistory{},
	)
	_, err := svc.FetchPrice("UNKNOWN")
	if err == nil {
		t.Fatal("expected PriceNotAvailableError, got nil")
	}
	var notAvail *domain.PriceNotAvailableError
	if !errors.As(err, &notAvail) {
		t.Errorf("expected PriceNotAvailableError, got %T: %v", err, err)
	}
}

func TestResolvePriceService_AllThrowThrows(t *testing.T) {
	throwing := &mockFetcher{err: errors.New("network error")}
	svc := domain.NewResolvePriceService(throwing, throwing, throwing, &trackingHistory{})
	_, err := svc.FetchPrice("VCB")
	if err == nil {
		t.Fatal("expected PriceNotAvailableError, got nil")
	}
	var notAvail *domain.PriceNotAvailableError
	if !errors.As(err, &notAvail) {
		t.Errorf("expected PriceNotAvailableError, got %T", err)
	}
}

func TestResolvePriceService_SaveQuoteCalled(t *testing.T) {
	h := &trackingHistory{}
	svc := domain.NewResolvePriceService(
		&mockFetcher{quote: makeQuote("VCB", domain.SourceHOSE)},
		&mockFetcher{quote: nil},
		&mockFetcher{quote: nil},
		h,
	)
	_, err := svc.FetchPrice("VCB")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// SaveQuote is fire-and-forget — give goroutine time to complete
	time.Sleep(20 * time.Millisecond)
	if len(h.saved) == 0 {
		t.Error("expected SaveQuote to have been called")
	}
	if h.saved[0].Code != "VCB" || h.saved[0].Source != domain.SourceHOSE {
		t.Errorf("SaveQuote called with wrong data: %+v", h.saved[0])
	}
}

func TestResolvePriceService_CorrectCodeReturned(t *testing.T) {
	svc := domain.NewResolvePriceService(
		&mockFetcher{quote: makeQuote("HPG", domain.SourceHOSE)},
		&mockFetcher{quote: nil},
		&mockFetcher{quote: nil},
		&trackingHistory{},
	)
	result, err := svc.FetchPrice("HPG")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Code != "HPG" {
		t.Errorf("expected code=HPG, got %s", result.Code)
	}
}
