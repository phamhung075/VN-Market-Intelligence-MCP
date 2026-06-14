// Package http — VMT-8-MACRO-GRACEFUL-FAILCLOSE handler-layer gate tests (G2 + G3 HTTP).
//
// G2: Handler path — when the use-case returns (degradedResponse, nil), the thin HTTP
//
//	handler MUST emit HTTP 200 (not 500) with is_estimate=true and blocked_reason in body.
//
// G3 HTTP: Handler path — when the use-case returns (errorResponse, err), the thin HTTP
//
//	handler MUST emit HTTP 500 (genuine wiring fault path preserved).
//
// Strategy: exercise handlers through a real chi router wired with forced-failure
// use-case instances (nil-provider for wiring fault; bad-provider for upstream failure).
// Uses net/http/httptest — no live network, no VPS proxy.
//
// Fence-C: this test file is in pkg/interface/http — imports pkg/application only.
package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ---------------------------------------------------------------------------
// Forced-failure provider stubs (upstream-fetch failure — not nil, just broken)
// ---------------------------------------------------------------------------

// brokenNSOProvider simulates an upstream NSO Excel fetch failure.
// The provider is wired (non-nil) but returns a fetch error — mimics the VPS proxy dark scenario.
type brokenNSOProvider struct{}

func (b *brokenNSOProvider) GetOrFetchNSOMonthlyExcel(_ context.Context) ([]byte, string, error) {
	return nil, "", errors.New("VPS proxy 125.212.251.27:3128: connection refused (forced-failure fixture)")
}

// brokenVpsFetcher simulates an upstream VPS fetch failure for BOP use case.
type brokenVpsFetcher struct{}

func (b *brokenVpsFetcher) Fetch(_ context.Context, _ string, _ domain.VpsFetchOptions) ([]byte, error) {
	return nil, errors.New("dial tcp 125.212.251.27:3128: connect: connection refused (forced-failure fixture)")
}

// noopTradeParser is a stub that should never be called (fetch fails before parse).
type noopTradeParser struct{}

func (p *noopTradeParser) ParseTradeBalance(_ []byte, _ string) (domain.TradeBalanceRecord, error) {
	return domain.TradeBalanceRecord{}, errors.New("should not be called")
}

// noopBOPParser is a stub that should never be called (fetch fails before parse).
type noopBOPParser struct{}

func (p *noopBOPParser) Parse(_ []byte) (domain.BOPRecord, error) {
	return domain.BOPRecord{}, errors.New("should not be called")
}

// noopIIPParser is a stub that should never be called (fetch fails before parse).
type noopIIPParser struct{}

func (p *noopIIPParser) ParseIIP(_ []byte, _ string) (domain.MacroIndicatorsGSORecord, error) {
	return domain.MacroIndicatorsGSORecord{}, errors.New("should not be called")
}

// noopCPIParser is a stub that should never be called (fetch fails before parse).
type noopCPIParser struct{}

func (p *noopCPIParser) ParseCPI(_ []byte, _ string) (domain.CPIRecord, error) {
	return domain.CPIRecord{}, errors.New("should not be called")
}

// ---------------------------------------------------------------------------
// concreteBOPURLBuilderHTTP satisfies application.BOPURLBuilder with time.Time.
type concreteBOPURLBuilderHTTP struct{}

func (b *concreteBOPURLBuilderHTTP) BuildURL(start, end string) string {
	return fmt.Sprintf("https://stub.sbv.vn/bop?from=%s&to=%s", start, end)
}

func (b *concreteBOPURLBuilderHTTP) QuarterWindow(_ time.Time) (string, string) {
	return "2026-01-01", "2026-03-31"
}

func (b *concreteBOPURLBuilderHTTP) PrevQuarterWindow(_ time.Time) (string, string) {
	return "2025-10-01", "2025-12-31"
}

// ---------------------------------------------------------------------------
// Build routers wired for forced-failure (upstream error) and wiring fault (nil provider)
// ---------------------------------------------------------------------------

// newDegradedTradeRouter wires a trade-balance handler with a broken upstream provider.
// Use-case.Execute will return (degradedResp, nil) → handler must emit HTTP 200.
func newDegradedTradeRouter() http.Handler {
	uc := application.NewTradeBalanceUseCase(&brokenNSOProvider{}, &noopTradeParser{})
	return NewRouter(RouterConfig{TradeBalance: uc, Logger: nil})
}

// newNilTradeRouter wires a trade-balance handler with a nil provider (wiring fault).
// Use-case.Execute will return (resp, err) → handler must emit HTTP 500.
func newNilTradeRouter() http.Handler {
	uc := application.NewTradeBalanceUseCase(nil, &noopTradeParser{})
	return NewRouter(RouterConfig{TradeBalance: uc, Logger: nil})
}

// newDegradedMacroRouter wires a macro-indicators handler with a broken upstream provider.
func newDegradedMacroRouter() http.Handler {
	uc := application.NewMacroIndicatorsGSOUseCase(&brokenNSOProvider{}, &noopIIPParser{})
	return NewRouter(RouterConfig{MacroIndicatorsGSO: uc, Logger: nil})
}

// newNilMacroRouter wires a macro-indicators handler with nil provider (wiring fault).
func newNilMacroRouter() http.Handler {
	uc := application.NewMacroIndicatorsGSOUseCase(nil, &noopIIPParser{})
	return NewRouter(RouterConfig{MacroIndicatorsGSO: uc, Logger: nil})
}

// newDegradedCPIRouter wires a CPI handler with a broken upstream provider.
func newDegradedCPIRouter() http.Handler {
	uc := application.NewCPIComponentsUseCase(&brokenNSOProvider{}, &noopCPIParser{})
	return NewRouter(RouterConfig{CPIComponents: uc, Logger: nil})
}

// newNilCPIRouter wires a CPI handler with nil provider (wiring fault).
func newNilCPIRouter() http.Handler {
	uc := application.NewCPIComponentsUseCase(nil, &noopCPIParser{})
	return NewRouter(RouterConfig{CPIComponents: uc, Logger: nil})
}

// newDegradedBOPRouter wires a BOP handler with a broken upstream VPS fetcher.
// Use-case.Execute will return (degradedResp, nil) → handler must emit HTTP 200.
func newDegradedBOPRouter() http.Handler {
	uc := application.NewBOPUseCase(&brokenVpsFetcher{}, &noopBOPParser{}, &concreteBOPURLBuilderHTTP{})
	return NewRouter(RouterConfig{BOP: uc, Logger: nil})
}

// newNilBOPRouter wires a BOP handler with nil fetcher (wiring fault).
// Use-case.Execute will return (resp, err) → handler must emit HTTP 500.
func newNilBOPRouter() http.Handler {
	uc := application.NewBOPUseCase(nil, &noopBOPParser{}, &concreteBOPURLBuilderHTTP{})
	return NewRouter(RouterConfig{BOP: uc, Logger: nil})
}

// ---------------------------------------------------------------------------
// G2: Degraded upstream failure → HTTP 200 + is_estimate=true + blocked_reason
// ---------------------------------------------------------------------------

// TestG2_TradeBalance_DegradedUpstream_HTTP200 verifies that when the NSO Excel upstream
// is unreachable, the /trade-balance handler returns HTTP 200 (not 500) with an honest
// degraded JSON payload carrying is_estimate=true and blocked_reason.
func TestG2_TradeBalance_DegradedUpstream_HTTP200(t *testing.T) {
	srv := httptest.NewServer(newDegradedTradeRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/trade-balance", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /trade-balance failed: %v", err)
	}
	defer resp.Body.Close()

	// G2: HTTP status MUST be 200 (not 500) on upstream failure.
	if resp.StatusCode != http.StatusOK {
		t.Errorf("G2 FAIL: POST /trade-balance upstream failure: expected HTTP 200, got %d", resp.StatusCode)
	}

	var body map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("G2 FAIL: POST /trade-balance: decode body: %v", err)
	}

	// G2: status field must be "degraded".
	assertJSONStringField(t, body, "status", "degraded", "/trade-balance G2")

	// G2: is_estimate must be true in body.
	assertJSONBoolField(t, body, "is_estimate", true, "/trade-balance G2")

	// G2: blocked_reason must be present and non-empty.
	assertJSONNonEmptyStringField(t, body, "blocked_reason", "/trade-balance G2")

	// G4 check: bloc_split.fdi.is_estimate must be true (ARCH Decision A permanent invariant).
	if raw, ok := body["bloc_split"]; ok {
		var blocSplit map[string]json.RawMessage
		if err := json.Unmarshal(raw, &blocSplit); err == nil {
			if fdiRaw, ok := blocSplit["fdi"]; ok {
				var fdi map[string]json.RawMessage
				if err := json.Unmarshal(fdiRaw, &fdi); err == nil {
					assertJSONBoolField(t, fdi, "is_estimate", true, "/trade-balance G4 bloc_split.fdi")
				}
			}
		}
	}
}

// TestG2_MacroIndicators_DegradedUpstream_HTTP200 verifies that when the NSO Excel upstream
// is unreachable, /macro-indicators returns HTTP 200 with degraded payload.
func TestG2_MacroIndicators_DegradedUpstream_HTTP200(t *testing.T) {
	srv := httptest.NewServer(newDegradedMacroRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/macro-indicators", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /macro-indicators failed: %v", err)
	}
	defer resp.Body.Close()

	// G2: HTTP status MUST be 200.
	if resp.StatusCode != http.StatusOK {
		t.Errorf("G2 FAIL: POST /macro-indicators upstream failure: expected HTTP 200, got %d", resp.StatusCode)
	}

	var body map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("G2 FAIL: POST /macro-indicators: decode body: %v", err)
	}

	assertJSONStringField(t, body, "status", "degraded", "/macro-indicators G2")
	assertJSONBoolField(t, body, "is_estimate", true, "/macro-indicators G2")
	assertJSONNonEmptyStringField(t, body, "blocked_reason", "/macro-indicators G2")
}

// TestG2_BOP_DegradedUpstream_HTTP200 verifies that when the SBV Liferay BOP API is
// unreachable via VPS proxy, /bop returns HTTP 200 with degraded payload.
func TestG2_BOP_DegradedUpstream_HTTP200(t *testing.T) {
	srv := httptest.NewServer(newDegradedBOPRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/bop", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /bop failed: %v", err)
	}
	defer resp.Body.Close()

	// G2: HTTP status MUST be 200 (not 500) on upstream failure.
	if resp.StatusCode != http.StatusOK {
		t.Errorf("G2 FAIL: POST /bop upstream failure: expected HTTP 200, got %d", resp.StatusCode)
	}

	var body map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("G2 FAIL: POST /bop: decode body: %v", err)
	}

	assertJSONStringField(t, body, "status", "degraded", "/bop G2")
	assertJSONBoolField(t, body, "is_estimate", true, "/bop G2")
	assertJSONNonEmptyStringField(t, body, "blocked_reason", "/bop G2")
}

// TestG3_BOP_NilFetcher_HTTP500 verifies that a nil-fetcher wiring fault → HTTP 500.
func TestG3_BOP_NilFetcher_HTTP500(t *testing.T) {
	srv := httptest.NewServer(newNilBOPRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/bop", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /bop (nil fetcher) failed: %v", err)
	}
	defer resp.Body.Close()

	// G3: wiring fault MUST return HTTP 500.
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("G3 FAIL: POST /bop nil fetcher: expected HTTP 500, got %d", resp.StatusCode)
	}
}

// TestG2_CPIComponents_DegradedUpstream_HTTP200 verifies that when the NSO Excel upstream
// is unreachable, /cpi-components returns HTTP 200 with degraded payload.
func TestG2_CPIComponents_DegradedUpstream_HTTP200(t *testing.T) {
	srv := httptest.NewServer(newDegradedCPIRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/cpi-components", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /cpi-components failed: %v", err)
	}
	defer resp.Body.Close()

	// G2: HTTP status MUST be 200.
	if resp.StatusCode != http.StatusOK {
		t.Errorf("G2 FAIL: POST /cpi-components upstream failure: expected HTTP 200, got %d", resp.StatusCode)
	}

	var body map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("G2 FAIL: POST /cpi-components: decode body: %v", err)
	}

	assertJSONStringField(t, body, "status", "degraded", "/cpi-components G2")
	assertJSONBoolField(t, body, "is_estimate", true, "/cpi-components G2")
	assertJSONNonEmptyStringField(t, body, "blocked_reason", "/cpi-components G2")

	// G4: weights_is_estimate must be true ALWAYS.
	assertJSONBoolField(t, body, "weights_is_estimate", true, "/cpi-components G4")
}

// ---------------------------------------------------------------------------
// G3 HTTP: Nil-provider wiring fault → HTTP 500 (genuine fault path preserved)
// ---------------------------------------------------------------------------

// TestG3_TradeBalance_NilProvider_HTTP500 verifies that a nil-provider wiring fault
// in the trade-balance handler emits HTTP 500 (genuine internal fault preserved).
func TestG3_TradeBalance_NilProvider_HTTP500(t *testing.T) {
	srv := httptest.NewServer(newNilTradeRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/trade-balance", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /trade-balance (nil provider) failed: %v", err)
	}
	defer resp.Body.Close()

	// G3: wiring fault MUST return HTTP 500.
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("G3 FAIL: POST /trade-balance nil provider: expected HTTP 500, got %d", resp.StatusCode)
	}
}

// TestG3_MacroIndicators_NilProvider_HTTP500 verifies nil-provider fault → HTTP 500.
func TestG3_MacroIndicators_NilProvider_HTTP500(t *testing.T) {
	srv := httptest.NewServer(newNilMacroRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/macro-indicators", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /macro-indicators (nil provider) failed: %v", err)
	}
	defer resp.Body.Close()

	// G3: wiring fault MUST return HTTP 500.
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("G3 FAIL: POST /macro-indicators nil provider: expected HTTP 500, got %d", resp.StatusCode)
	}
}

// TestG3_CPIComponents_NilProvider_HTTP500 verifies nil-provider fault → HTTP 500.
func TestG3_CPIComponents_NilProvider_HTTP500(t *testing.T) {
	srv := httptest.NewServer(newNilCPIRouter())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/cpi-components", "application/json", bytes.NewBufferString("{}"))
	if err != nil {
		t.Fatalf("POST /cpi-components (nil provider) failed: %v", err)
	}
	defer resp.Body.Close()

	// G3: wiring fault MUST return HTTP 500.
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("G3 FAIL: POST /cpi-components nil provider: expected HTTP 500, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

func assertJSONStringField(t *testing.T, body map[string]json.RawMessage, field, want, context string) {
	t.Helper()
	raw, ok := body[field]
	if !ok {
		t.Errorf("%s: body missing %q field", context, field)
		return
	}
	var val string
	if err := json.Unmarshal(raw, &val); err != nil {
		t.Errorf("%s: %q field is not a string: %v", context, field, err)
		return
	}
	if val != want {
		t.Errorf("%s: %q=%q, want %q", context, field, val, want)
	}
}

func assertJSONBoolField(t *testing.T, body map[string]json.RawMessage, field string, want bool, context string) {
	t.Helper()
	raw, ok := body[field]
	if !ok {
		t.Errorf("%s: body missing %q field", context, field)
		return
	}
	var val bool
	if err := json.Unmarshal(raw, &val); err != nil {
		t.Errorf("%s: %q field is not a bool: %v", context, field, err)
		return
	}
	if val != want {
		t.Errorf("%s: %q=%v, want %v", context, field, val, want)
	}
}

func assertJSONNonEmptyStringField(t *testing.T, body map[string]json.RawMessage, field, context string) {
	t.Helper()
	raw, ok := body[field]
	if !ok {
		t.Errorf("%s: body missing %q field", context, field)
		return
	}
	var val string
	if err := json.Unmarshal(raw, &val); err != nil {
		t.Errorf("%s: %q field is not a string: %v", context, field, err)
		return
	}
	if val == "" {
		t.Errorf("%s: %q field is empty — must name the unreachable source", context, field)
	}
}
