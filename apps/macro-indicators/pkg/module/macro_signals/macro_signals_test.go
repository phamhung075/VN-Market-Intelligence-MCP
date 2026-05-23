package macro_signals_test

import (
	"testing"

	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
	"github.com/vn-market-intelligence/macro-indicators/pkg/module/macro_signals"
)

// ---------------------------------------------------------------------------
// Mock — implements Classifier interface with deterministic, name-based dispatch.
// ---------------------------------------------------------------------------

// mockClassifier satisfies macro_signals.Classifier using the real primitive's
// Classify function — no randomness, fully deterministic (R-1 compliant).
type mockClassifier struct{}

func (m *mockClassifier) Classify(input mic.InvestmentClockInput) mic.InvestmentClockOutput {
	return mic.Classify(input)
}

// ---------------------------------------------------------------------------
// Table-driven tests (AC-4 — ≥3 rows)
// ---------------------------------------------------------------------------

func TestMacroSignalsClassifyBatch_ResultCount(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    []string
		wantLen  int
	}{
		{
			name:    "batch_vn_single",
			input:   []string{"VN_CPI"},
			wantLen: 1,
		},
		{
			name:    "batch_us_single",
			input:   []string{"Unemployment_Rate"},
			wantLen: 1,
		},
		{
			name:    "batch_empty",
			input:   []string{},
			wantLen: 0,
		},
		{
			name:    "batch_multi_mixed",
			input:   []string{"VN_CPI", "Unemployment_Rate", "OIL_PRICE"},
			wantLen: 3,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			sigs := macro_signals.New(&mockClassifier{})
			got := sigs.ClassifyBatch(tt.input)
			if len(got) != tt.wantLen {
				t.Fatalf("ClassifyBatch(%v): got %d results, want %d", tt.input, len(got), tt.wantLen)
			}
		})
	}
}

func TestMacroSignalsClassifyBatch_ClassificationValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		indicator     string
		wantTier      string
		wantScore     int
		wantPhase     string
	}{
		{
			name:      "vn_cpi_direct_tier",
			indicator: "VN_CPI",
			wantTier:  mic.VN_DIRECT_TIER,
			wantScore: mic.VN_DIRECT_SCORE,
			wantPhase: "CORE_VN",
		},
		{
			name:      "unemployment_rate_us_domestic",
			indicator: "Unemployment_Rate",
			wantTier:  mic.US_DOMESTIC_TIER,
			wantScore: mic.US_DOMESTIC_SCORE,
			wantPhase: "US_DOMESTIC",
		},
		{
			name:      "oil_price_regional",
			indicator: "OIL_PRICE",
			wantTier:  mic.REGIONAL_TIER,
			wantScore: mic.REGIONAL_SCORE,
			wantPhase: "REGIONAL",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			sigs := macro_signals.New(&mockClassifier{})
			results := sigs.ClassifyBatch([]string{tt.indicator})
			if len(results) != 1 {
				t.Fatalf("expected 1 result, got %d", len(results))
			}
			r := results[0]
			if r.Indicator != tt.indicator {
				t.Errorf("Indicator: got %q, want %q", r.Indicator, tt.indicator)
			}
			if r.Tier != tt.wantTier {
				t.Errorf("Tier: got %q, want %q", r.Tier, tt.wantTier)
			}
			if r.Score != tt.wantScore {
				t.Errorf("Score: got %d, want %d", r.Score, tt.wantScore)
			}
			if r.Phase != tt.wantPhase {
				t.Errorf("Phase: got %q, want %q", r.Phase, tt.wantPhase)
			}
		})
	}
}

func TestMacroSignalsClassifyBatch_NilInputReturnsEmpty(t *testing.T) {
	t.Parallel()
	sigs := macro_signals.New(&mockClassifier{})
	got := sigs.ClassifyBatch(nil)
	if len(got) != 0 {
		t.Fatalf("nil input: expected 0 results, got %d", len(got))
	}
}

func TestMacroSignalsClassifyBatch_IndicatorNamePreserved(t *testing.T) {
	t.Parallel()
	sigs := macro_signals.New(&mockClassifier{})
	names := []string{"VN_CPI", "Unemployment_Rate", "Unknown_XYZ"}
	results := sigs.ClassifyBatch(names)
	if len(results) != len(names) {
		t.Fatalf("result count mismatch: got %d, want %d", len(results), len(names))
	}
	for i, r := range results {
		if r.Indicator != names[i] {
			t.Errorf("result[%d].Indicator: got %q, want %q", i, r.Indicator, names[i])
		}
	}
}
