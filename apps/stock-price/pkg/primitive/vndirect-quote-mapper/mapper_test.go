package vndirectquotemapper_test

import (
	"fmt"
	"testing"

	vndirectquotemapper "github.com/vn-market-intelligence/stock-price/pkg/primitive/vndirect-quote-mapper"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// ptr returns a pointer to v. Helper to create *float64 values inline.
func ptr(v float64) *float64 { return &v }

// TestMapPayload_TableDriven covers all required cases from the task spec:
// 1. STOCK on HOSE -> asserts *1000 scale applied + correct source label
// 2. STOCK on HNX -> *1000 scale + correct source
// 3. STOCK on UPCOM -> *1000 scale + correct source
// 4. INDEX (and/or non-VN floor) -> asserts NO scale applied
// 5. empty data array -> returns nil quote (not an error, not a zero-value)
// 6. malformed JSON -> returns an error
// 7. null change / null pctChange -> nil pointers, NOT 0
func TestMapPayload_TableDriven(t *testing.T) {
	t.Parallel()

	const (
		testFetchedAt = "2026-05-24T10:30:00Z"
		testLatencyMs = 150
	)

	tests := []struct {
		name          string
		rawJSON       string
		wantQuote     *domain.PriceQuote // nil means we expect nil quote
		wantErr       bool               // true means we expect a non-nil error
		checkPointers bool               // true means check Change/ChangePercent pointer semantics
	}{
		// ── Case 1: STOCK on HOSE -> *1000 scale + SourceHOSE ──
		{
			name: "STOCK on HOSE applies 1000x scale",
			rawJSON: `{
				"data": [{
					"code": "VCB",
					"floor": "HOSE",
					"type": "STOCK",
					"close": 85.5,
					"nmVolume": 1000000,
					"change": 0.5,
					"pctChange": 0.59,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "VCB",
				Price:         85500, // 85.5 * 1000
				Volume:        1000000,
				Change:        ptr(0.5),
				ChangePercent: ptr(0.59),
				Source:        domain.SourceHOSE,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 2: STOCK on HNX -> *1000 scale + SourceHNX ──
		{
			name: "STOCK on HNX applies 1000x scale",
			rawJSON: `{
				"data": [{
					"code": "SHS",
					"floor": "HNX",
					"type": "STOCK",
					"close": 12.3,
					"nmVolume": 500000,
					"change": -0.2,
					"pctChange": -1.60,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "SHS",
				Price:         12300, // 12.3 * 1000
				Volume:        500000,
				Change:        ptr(-0.2),
				ChangePercent: ptr(-1.60),
				Source:        domain.SourceHNX,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 3: STOCK on UPCOM -> *1000 scale + SourceUPCOM ──
		{
			name: "STOCK on UPCOM applies 1000x scale",
			rawJSON: `{
				"data": [{
					"code": "BVB",
					"floor": "UPCOM",
					"type": "STOCK",
					"close": 8.9,
					"nmVolume": 250000,
					"change": 0.1,
					"pctChange": 1.14,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "BVB",
				Price:         8900, // 8.9 * 1000
				Volume:        250000,
				Change:        ptr(0.1),
				ChangePercent: ptr(1.14),
				Source:        domain.SourceUPCOM,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 4a: INDEX on HOSE -> NO scale applied ──
		{
			name: "INDEX on HOSE does NOT apply scale",
			rawJSON: `{
				"data": [{
					"code": "VNINDEX",
					"floor": "HOSE",
					"type": "INDEX",
					"close": 1250.55,
					"nmVolume": 0,
					"change": 5.2,
					"pctChange": 0.42,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "VNINDEX",
				Price:         1250.55, // NO scaling for INDEX
				Volume:        0,
				Change:        ptr(5.2),
				ChangePercent: ptr(0.42),
				Source:        domain.SourceHOSE,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 4b: INDEX on HNX -> NO scale applied ──
		{
			name: "INDEX on HNX does NOT apply scale",
			rawJSON: `{
				"data": [{
					"code": "HNXINDEX",
					"floor": "HNX",
					"type": "INDEX",
					"close": 230.12,
					"nmVolume": 0,
					"change": -1.5,
					"pctChange": -0.65,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "HNXINDEX",
				Price:         230.12, // NO scaling for INDEX
				Volume:        0,
				Change:        ptr(-1.5),
				ChangePercent: ptr(-0.65),
				Source:        domain.SourceHNX,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 4c: STOCK on non-VN floor -> NO scale applied (falls back to HOSE source) ──
		{
			name: "STOCK on non-VN floor does NOT apply scale",
			rawJSON: `{
				"data": [{
					"code": "AAPL",
					"floor": "BLOOMBERG",
					"type": "STOCK",
					"close": 175.50,
					"nmVolume": 50000000,
					"change": 2.3,
					"pctChange": 1.33,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "AAPL",
				Price:         175.50, // NO scaling for non-VN floor
				Volume:        50000000,
				Change:        ptr(2.3),
				ChangePercent: ptr(1.33),
				Source:        domain.SourceHOSE, // default source for unknown floor
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 5: empty data array -> returns nil quote (not an error) ──
		{
			name:          "empty data array returns nil quote not error",
			rawJSON:       `{"data": []}`,
			wantQuote:     nil,
			wantErr:       false,
			checkPointers: false,
		},

		// ── Case 6a: malformed JSON (syntax error) -> returns an error ──
		{
			name:          "malformed JSON syntax error returns error",
			rawJSON:       `{"data": [{"code": "VCB"`, // truncated JSON
			wantQuote:     nil,
			wantErr:       true,
			checkPointers: false,
		},

		// ── Case 6b: malformed JSON (wrong type) -> returns an error ──
		{
			name:          "malformed JSON wrong type returns error",
			rawJSON:       `"not an object"`, // JSON string instead of object
			wantQuote:     nil,
			wantErr:       true,
			checkPointers: false,
		},

		// ── Case 7a: null change / null pctChange -> nil pointers, NOT 0 ──
		{
			name: "null change and pctChange maps to nil pointers",
			rawJSON: `{
				"data": [{
					"code": "FPT",
					"floor": "HOSE",
					"type": "STOCK",
					"close": 92.0,
					"nmVolume": 800000,
					"change": null,
					"pctChange": null,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "FPT",
				Price:         92000, // 92.0 * 1000
				Volume:        800000,
				Change:        nil, // DSI-INV-1: nil means unavailable
				ChangePercent: nil, // DSI-INV-1: nil means unavailable
				Source:        domain.SourceHOSE,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 7b: zero change is NOT nil (genuine flat day) ──
		{
			name: "zero change is NOT nil genuine flat day",
			rawJSON: `{
				"data": [{
					"code": "MBB",
					"floor": "HOSE",
					"type": "STOCK",
					"close": 25.0,
					"nmVolume": 2000000,
					"change": 0,
					"pctChange": 0,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "MBB",
				Price:         25000, // 25.0 * 1000
				Volume:        2000000,
				Change:        ptr(0), // DSI-INV-1: 0 is a valid value (flat day)
				ChangePercent: ptr(0), // DSI-INV-1: 0 is a valid value (flat day)
				Source:        domain.SourceHOSE,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Case 7c: only change is null, pctChange has value ──
		{
			name: "partial null - only change is null",
			rawJSON: `{
				"data": [{
					"code": "TCB",
					"floor": "HOSE",
					"type": "STOCK",
					"close": 35.5,
					"nmVolume": 1500000,
					"change": null,
					"pctChange": 1.5,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "TCB",
				Price:         35500,
				Volume:        1500000,
				Change:        nil,       // null -> nil
				ChangePercent: ptr(1.5),  // has value
				Source:        domain.SourceHOSE,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},

		// ── Additional edge cases ──

		// Missing fields in JSON (omitted vs null)
		{
			name: "omitted change fields treated as nil",
			rawJSON: `{
				"data": [{
					"code": "HPG",
					"floor": "HOSE",
					"type": "STOCK",
					"close": 28.5,
					"nmVolume": 3000000,
					"date": "2026-05-24",
					"time": "14:45:00"
				}]
			}`,
			wantQuote: &domain.PriceQuote{
				Code:          "HPG",
				Price:         28500, // 28.5 * 1000
				Volume:        3000000,
				Change:        nil, // omitted = nil
				ChangePercent: nil, // omitted = nil
				Source:        domain.SourceHOSE,
				LatencyMs:     testLatencyMs,
				FetchedAt:     testFetchedAt,
			},
			wantErr:       false,
			checkPointers: true,
		},
	}

	for _, tt := range tests {
		tt := tt // capture range variable
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := vndirectquotemapper.MapPayload([]byte(tt.rawJSON), testFetchedAt, testLatencyMs)

			// Check error expectation
			if tt.wantErr {
				if result.Err == nil {
					t.Errorf("expected error but got nil")
				}
				return
			}
			if result.Err != nil {
				t.Errorf("unexpected error: %v", result.Err)
				return
			}

			// Check nil quote expectation
			if tt.wantQuote == nil {
				if result.Quote != nil {
					t.Errorf("expected nil quote but got: %+v", result.Quote)
				}
				return
			}
			if result.Quote == nil {
				t.Errorf("expected quote but got nil")
				return
			}

			got := result.Quote

			// Compare non-pointer fields
			if got.Code != tt.wantQuote.Code {
				t.Errorf("Code: got=%q want=%q", got.Code, tt.wantQuote.Code)
			}
			if got.Price != tt.wantQuote.Price {
				t.Errorf("Price: got=%v want=%v", got.Price, tt.wantQuote.Price)
			}
			if got.Volume != tt.wantQuote.Volume {
				t.Errorf("Volume: got=%v want=%v", got.Volume, tt.wantQuote.Volume)
			}
			if got.Source != tt.wantQuote.Source {
				t.Errorf("Source: got=%q want=%q", got.Source, tt.wantQuote.Source)
			}
			if got.FetchedAt != tt.wantQuote.FetchedAt {
				t.Errorf("FetchedAt: got=%q want=%q", got.FetchedAt, tt.wantQuote.FetchedAt)
			}
			if got.LatencyMs != tt.wantQuote.LatencyMs {
				t.Errorf("LatencyMs: got=%v want=%v", got.LatencyMs, tt.wantQuote.LatencyMs)
			}

			// DSI-INV-1: Check pointer fields carefully
			if tt.checkPointers {
				if !floatPtrEqual(got.Change, tt.wantQuote.Change) {
					t.Errorf("Change: got=%v want=%v", ptrStr(got.Change), ptrStr(tt.wantQuote.Change))
				}
				if !floatPtrEqual(got.ChangePercent, tt.wantQuote.ChangePercent) {
					t.Errorf("ChangePercent: got=%v want=%v", ptrStr(got.ChangePercent), ptrStr(tt.wantQuote.ChangePercent))
				}
			}
		})
	}
}

// TestMapItem verifies the MapItem function for pre-parsed items.
func TestMapItem(t *testing.T) {
	t.Parallel()

	item := vndirectquotemapper.VnDirectItem{
		Code:      "VNM",
		Floor:     "HOSE",
		Type:      "STOCK",
		Close:     75.5,
		NmVolume:  500000,
		Change:    ptr(1.2),
		PctChange: ptr(1.61),
		Date:      "2026-05-24",
		Time:      "14:45:00",
	}

	got := vndirectquotemapper.MapItem(item, "2026-05-24T10:30:00Z", 100)

	if got == nil {
		t.Fatal("expected non-nil quote")
	}
	if got.Code != "VNM" {
		t.Errorf("Code: got=%q want=%q", got.Code, "VNM")
	}
	if got.Price != 75500 { // 75.5 * 1000
		t.Errorf("Price: got=%v want=%v", got.Price, 75500)
	}
	if got.Source != domain.SourceHOSE {
		t.Errorf("Source: got=%q want=%q", got.Source, domain.SourceHOSE)
	}
}

// floatPtrEqual compares two *float64 pointers - both nil or both non-nil with equal values.
func floatPtrEqual(a, b *float64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// ptrStr formats a *float64 for error messages.
func ptrStr(p *float64) string {
	if p == nil {
		return "nil"
	}
	return formatFloat(*p)
}

// formatFloat formats a float64 for display.
func formatFloat(f float64) string {
	// Simple formatting for test error messages
	return fmt.Sprintf("%v", f)
}
