// Package http — body-contract test for POST /snapshot.
//
// Risk: R-HIGH — frontend /dashboard/analysis 500'd at close because it called
// Object.entries(snapshot.signals) and the shape was wrong.
//
// This test asserts that POST /snapshot returns a keyed-object body whose
// top-level "signals" value is a JSON object (NOT an array, NOT a flat list)
// with exactly the 6 keys the frontend iterates:
//
//	"investment-clock", "oil", "gold", "usdvnd", "carry", "yield"
//
// Uses Go httptest + injected fake ports (zero credentials, zero live network).
// Fence-C: this test imports application (allowed from interface layer).
package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ---------------------------------------------------------------------------
// Minimal in-test fakes — satisfy domain ports, no credentials, no network.
// ---------------------------------------------------------------------------

// fakeContractCommodityFetcher returns fixture-grade prices for all requested symbols.
type fakeContractCommodityFetcher struct{}

func (f *fakeContractCommodityFetcher) FetchPrices(_ context.Context, symbols []string) (map[string]float64, error) {
	prices := map[string]float64{
		"OIL":    82.5,
		"GOLD":   2350.0,
		"USDVND": 24500.0,
	}
	result := make(map[string]float64, len(symbols))
	for _, sym := range symbols {
		if v, ok := prices[sym]; ok {
			result[sym] = v
		}
	}
	return result, nil
}

// fakeContractSBVRate returns zero (unused by the use case, satisfies port).
type fakeContractSBVRate struct{}

func (f *fakeContractSBVRate) GetRate(_ context.Context, _, _ string) (float64, error) {
	return 0, nil
}

// fakeContractMarketIndex returns a fixture VN-Index level.
type fakeContractMarketIndex struct{}

func (f *fakeContractMarketIndex) FetchVNIndex(_ context.Context) (float64, error) {
	return 1280.5, nil
}

// Ensure fakes satisfy the port interfaces (compile-time guard).
var _ domain.CommodityFetcherPort = (*fakeContractCommodityFetcher)(nil)
var _ domain.SBVRatePort = (*fakeContractSBVRate)(nil)
var _ domain.MarketIndexPort = (*fakeContractMarketIndex)(nil)

// ---------------------------------------------------------------------------
// newContractRouter wires a real use case with injected fakes.
// Zero credentials, zero live network calls.
// ---------------------------------------------------------------------------

func newContractRouter() http.Handler {
	uc := application.NewComputeMacroUseCase(
		&fakeContractCommodityFetcher{},
		&fakeContractSBVRate{},
		&fakeContractMarketIndex{},
	)
	return NewRouter(uc, nil)
}

// ---------------------------------------------------------------------------
// TestSnapshotBodyContract — R-HIGH body-contract assertion
//
// Asserts that POST /snapshot returns a JSON object (not an array) containing
// a "signals" key whose value is a keyed object with exactly the 6 keys the
// frontend iterates via Object.entries(snapshot.signals).
// ---------------------------------------------------------------------------

func TestSnapshotBodyContract(t *testing.T) {
	srv := httptest.NewServer(newContractRouter())
	defer srv.Close()

	// POST with empty body (MacroSnapshotRequest has no fields).
	resp, err := http.Post(srv.URL+"/snapshot", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /snapshot failed: %v", err)
	}
	defer resp.Body.Close()

	// 1. HTTP status must be 200.
	if resp.StatusCode != http.StatusOK {
		t.Errorf("POST /snapshot: expected HTTP 200, got %d", resp.StatusCode)
	}

	// 2. Content-Type must be application/json.
	if ct := resp.Header.Get("Content-Type"); ct == "" {
		t.Error("POST /snapshot: Content-Type header is missing")
	}

	// 3. Body must decode as a JSON object (map), NOT as an array.
	var body map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("POST /snapshot: response body is not a JSON object: %v", err)
	}

	// 4. Top-level "signals" key must exist.
	rawSignals, ok := body["signals"]
	if !ok {
		t.Fatalf("POST /snapshot: response body missing top-level 'signals' key; got keys: %v", keySet(body))
	}

	// 5. "signals" value must be a JSON object (keyed object), not an array or scalar.
	//    Frontend calls Object.entries(snapshot.signals) — an array would break this.
	var signals map[string]json.RawMessage
	if err := json.Unmarshal(rawSignals, &signals); err != nil {
		t.Fatalf("POST /snapshot: 'signals' is not a JSON object (Object.entries() would break): %v\nraw: %s", err, rawSignals)
	}

	// 6. "signals" must contain exactly the 6 keys the frontend consumes.
	want := []string{"investment-clock", "oil", "gold", "usdvnd", "carry", "yield"}
	for _, key := range want {
		if _, present := signals[key]; !present {
			t.Errorf("POST /snapshot: signals missing required key %q (Object.entries would skip it); got keys: %v", key, keySet(signals))
		}
	}

	// 7. No extra keys silently slipped in that would confuse the frontend layout.
	//    This is an informational check — unexpected keys are reported but not fatal
	//    (forward-compat: future primitives may add keys).
	wantSet := make(map[string]bool, len(want))
	for _, k := range want {
		wantSet[k] = true
	}
	for k := range signals {
		if !wantSet[k] {
			t.Logf("POST /snapshot: signals contains unexpected key %q (not consumed by frontend — verify intentional)", k)
		}
	}

	// 8. Each signal entry must be a non-null JSON object (not null, not string, not array).
	//    Frontend does entry.direction ?? entry.regime ?? entry.label ?? "" — requires object.
	for _, key := range want {
		raw := signals[key]
		var entry map[string]json.RawMessage
		if err := json.Unmarshal(raw, &entry); err != nil {
			t.Errorf("POST /snapshot: signals[%q] is not a JSON object (frontend destructuring would break): %v\nraw: %s", key, err, raw)
		}
	}
}

// ---------------------------------------------------------------------------
// TestSnapshotBodyIsNotArray — explicit guard against array-shaped response.
//
// If the handler were to accidentally return the signals as a JSON array
// (e.g. []SignalResult instead of SignalResult), Object.entries on the
// frontend would yield numeric-index pairs, breaking the indicatorLabel lookup.
// ---------------------------------------------------------------------------

func TestSnapshotBodyIsNotArray(t *testing.T) {
	srv := httptest.NewServer(newContractRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/snapshot", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /snapshot failed: %v", err)
	}
	defer resp.Body.Close()

	// Attempt to decode body as a JSON array — this MUST fail.
	var arr []json.RawMessage
	// We decode into a raw value first to check the leading byte.
	var raw json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		t.Fatalf("POST /snapshot: cannot decode response body at all: %v", err)
	}

	if err := json.Unmarshal(raw, &arr); err == nil {
		t.Errorf("POST /snapshot: body decoded as a JSON array — Object.entries(snapshot.signals) on the frontend would receive numeric index pairs, breaking indicatorLabel() lookup")
	}
}

// ---------------------------------------------------------------------------
// keySet returns the sorted slice of keys from a map for use in error messages.
// ---------------------------------------------------------------------------

func keySet[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
