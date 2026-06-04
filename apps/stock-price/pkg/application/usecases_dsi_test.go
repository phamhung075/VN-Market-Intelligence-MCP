// DSI-S2-PRICE tests — staleness propagation + null serialization for Change/ChangePercent.
// AC-PRICE-1 through AC-PRICE-5.
package application_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/application"
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

// mockResolverDSI returns a ResolvedQuote with configurable Staleness.
type mockResolverDSI struct {
	quote     *domain.PriceQuote
	staleness string
}

func (m *mockResolverDSI) Resolve(code string) (*priceresolution.ResolvedQuote, error) {
	if m.quote == nil {
		return nil, &domain.PriceNotAvailableError{Code: code}
	}
	q := *m.quote
	q.Code = code
	return &priceresolution.ResolvedQuote{PriceQuote: q, Staleness: m.staleness}, nil
}

// ── AC-PRICE-1: Staleness in response ─────────────────────────────────────────

func TestFetchPriceUseCase_StalenessPropagated(t *testing.T) {
	// Construct a ResolvedQuote with Staleness="STALE"
	price := 88000.0
	quote := &domain.PriceQuote{
		Code:          "VCB",
		Price:         price,
		Volume:        2000000,
		Change:        nil, // unavailable
		ChangePercent: nil,
		Source:        domain.SourceCache,
		LatencyMs:     10,
		FetchedAt:     "2026-06-01T10:00:00Z",
	}
	resolver := &mockResolverDSI{quote: quote, staleness: "STALE"}
	uc := application.NewFetchPriceUseCase(resolver)

	result, err := uc.Execute(application.FetchPriceRequest{Code: "VCB"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Assert Staleness is propagated
	if result.Staleness != "STALE" {
		t.Errorf("Staleness: want STALE, got %s", result.Staleness)
	}
	// Assert IsEstimate is true for STALE
	if !result.IsEstimate {
		t.Error("IsEstimate: want true for STALE, got false")
	}
}

func TestFetchPriceUseCase_IsEstimateTrueForExpired(t *testing.T) {
	price := 88000.0
	quote := &domain.PriceQuote{
		Code:          "VCB",
		Price:         price,
		Volume:        2000000,
		Change:        nil,
		ChangePercent: nil,
		Source:        domain.SourceCache,
		LatencyMs:     10,
		FetchedAt:     "2026-05-01T10:00:00Z", // very old
	}
	resolver := &mockResolverDSI{quote: quote, staleness: "EXPIRED"}
	uc := application.NewFetchPriceUseCase(resolver)

	result, err := uc.Execute(application.FetchPriceRequest{Code: "VCB"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Staleness != "EXPIRED" {
		t.Errorf("Staleness: want EXPIRED, got %s", result.Staleness)
	}
	if !result.IsEstimate {
		t.Error("IsEstimate: want true for EXPIRED, got false")
	}
}

func TestFetchPriceUseCase_FreshNotEstimate(t *testing.T) {
	change := -1000.0
	pct := -1.12
	quote := &domain.PriceQuote{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        &change,
		ChangePercent: &pct,
		Source:        domain.SourceHOSE,
		LatencyMs:     45,
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	resolver := &mockResolverDSI{quote: quote, staleness: "FRESH"}
	uc := application.NewFetchPriceUseCase(resolver)

	result, err := uc.Execute(application.FetchPriceRequest{Code: "VCB"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Staleness != "FRESH" {
		t.Errorf("Staleness: want FRESH, got %s", result.Staleness)
	}
	if result.IsEstimate {
		t.Error("IsEstimate: want false for FRESH, got true")
	}
}

// ── AC-PRICE-3: Change nil on cache miss ──────────────────────────────────────

func TestFetchPriceUseCase_ChangeNilForCachePath(t *testing.T) {
	// Tier-3 cache path: Change and ChangePercent are nil
	quote := &domain.PriceQuote{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        nil, // unavailable from cache
		ChangePercent: nil, // unavailable from cache
		Source:        domain.SourceCache,
		LatencyMs:     5,
		FetchedAt:     "2026-06-01T10:00:00Z",
	}
	resolver := &mockResolverDSI{quote: quote, staleness: "STALE"}
	uc := application.NewFetchPriceUseCase(resolver)

	result, err := uc.Execute(application.FetchPriceRequest{Code: "VCB"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Change != nil {
		t.Errorf("Change: want nil, got %v", *result.Change)
	}
	if result.ChangePercent != nil {
		t.Errorf("ChangePercent: want nil, got %v", *result.ChangePercent)
	}
}

// ── AC-PRICE-4: Real zero preserved ───────────────────────────────────────────

func TestFetchPriceUseCase_RealZeroPreserved(t *testing.T) {
	// Tier-1 live fetch returns Change: 0.0 (genuine flat day)
	zero := 0.0
	quote := &domain.PriceQuote{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        &zero, // genuine flat day
		ChangePercent: &zero,
		Source:        domain.SourceHOSE,
		LatencyMs:     45,
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	resolver := &mockResolverDSI{quote: quote, staleness: "FRESH"}
	uc := application.NewFetchPriceUseCase(resolver)

	result, err := uc.Execute(application.FetchPriceRequest{Code: "VCB"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Change should be non-nil with value 0.0
	if result.Change == nil {
		t.Fatal("Change: want non-nil (0.0), got nil")
	}
	if *result.Change != 0.0 {
		t.Errorf("Change: want 0.0, got %f", *result.Change)
	}
	if result.ChangePercent == nil {
		t.Fatal("ChangePercent: want non-nil (0.0), got nil")
	}
	if *result.ChangePercent != 0.0 {
		t.Errorf("ChangePercent: want 0.0, got %f", *result.ChangePercent)
	}
}

// ── AC-PRICE-5: JSON null serialization ───────────────────────────────────────

func TestFetchPriceResponse_JSONNullSerialization(t *testing.T) {
	// When Change/ChangePercent are nil, JSON output must be "change":null not "change":0
	resp := &application.FetchPriceResponse{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        nil, // unavailable
		ChangePercent: nil, // unavailable
		Source:        domain.SourceCache,
		LatencyMs:     5,
		FetchedAt:     "2026-06-01T10:00:00Z",
		Staleness:     "STALE",
		IsEstimate:    true,
	}

	jsonBytes, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	jsonStr := string(jsonBytes)

	// Assert JSON contains "change":null not "change":0
	if !contains(jsonStr, `"change":null`) {
		t.Errorf("JSON should contain \"change\":null, got: %s", jsonStr)
	}
	if !contains(jsonStr, `"changePercent":null`) {
		t.Errorf("JSON should contain \"changePercent\":null, got: %s", jsonStr)
	}
	// Verify staleness fields are present
	if !contains(jsonStr, `"staleness":"STALE"`) {
		t.Errorf("JSON should contain staleness, got: %s", jsonStr)
	}
	if !contains(jsonStr, `"isEstimate":true`) {
		t.Errorf("JSON should contain isEstimate, got: %s", jsonStr)
	}
}

func TestFetchPriceResponse_JSONZeroSerialization(t *testing.T) {
	// When Change/ChangePercent are 0.0 (genuine flat day), JSON output must be "change":0
	zero := 0.0
	resp := &application.FetchPriceResponse{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        &zero,
		ChangePercent: &zero,
		Source:        domain.SourceHOSE,
		LatencyMs:     45,
		FetchedAt:     time.Now().UTC().Format(time.RFC3339),
		Staleness:     "FRESH",
		IsEstimate:    false,
	}

	jsonBytes, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	jsonStr := string(jsonBytes)

	// Assert JSON contains "change":0 (real zero, not null)
	if !contains(jsonStr, `"change":0`) {
		t.Errorf("JSON should contain \"change\":0, got: %s", jsonStr)
	}
	if !contains(jsonStr, `"changePercent":0`) {
		t.Errorf("JSON should contain \"changePercent\":0, got: %s", jsonStr)
	}
}

// ── AC-PRICE-2: Tier-3 true FetchedAt ─────────────────────────────────────────

func TestFetchPriceUseCase_FetchedAtFromSource(t *testing.T) {
	// Verify FetchedAt is the source timestamp, not time.Now()
	dbTimestamp := "2026-06-01T10:00:00Z"
	quote := &domain.PriceQuote{
		Code:          "VCB",
		Price:         88000,
		Volume:        2000000,
		Change:        nil,
		ChangePercent: nil,
		Source:        domain.SourceCache,
		LatencyMs:     5,
		FetchedAt:     dbTimestamp, // from DB row
	}
	resolver := &mockResolverDSI{quote: quote, staleness: "STALE"}
	uc := application.NewFetchPriceUseCase(resolver)

	result, err := uc.Execute(application.FetchPriceRequest{Code: "VCB"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// FetchedAt must match the DB row timestamp exactly
	if result.FetchedAt != dbTimestamp {
		t.Errorf("FetchedAt: want %s, got %s", dbTimestamp, result.FetchedAt)
	}
}

// contains checks if s contains substr
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
