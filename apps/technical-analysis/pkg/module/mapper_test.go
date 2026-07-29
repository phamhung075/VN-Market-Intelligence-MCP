package module_test

import (
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/module"
)

// TestToDomainIndicators verifies the module.Result -> domain.TechnicalIndicators
// mapping used by both TACalculator (pkg/infrastructure) and sandboxCalculator
// (cmd/sandbox) — the shared mapper extracted per FACTORY-TECHANALYSIS-dedup-calculator
// to fix the MA5/MA20/MA50 drift between the two duplicated implementations.
func TestToDomainIndicators(t *testing.T) {
	t.Parallel()

	closes := prices100()
	res, err := module.Compute(closes, module.ComputeParams{RSIPeriod: 14, MAPeriod: 14})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := module.ToDomainIndicators(res)
	if got == nil {
		t.Fatal("ToDomainIndicators returned nil")
	}

	if len(got.RSI) != len(res.RSI) {
		t.Errorf("RSI: got len %d, want len %d", len(got.RSI), len(res.RSI))
	}
	if len(got.MACDLine) != len(res.MACDLine) {
		t.Errorf("MACDLine: got len %d, want len %d", len(got.MACDLine), len(res.MACDLine))
	}
	if len(got.SignalLine) != len(res.SignalLine) {
		t.Errorf("SignalLine: got len %d, want len %d", len(got.SignalLine), len(res.SignalLine))
	}
	if len(got.Histogram) != len(res.Histogram) {
		t.Errorf("Histogram: got len %d, want len %d", len(got.Histogram), len(res.Histogram))
	}
	if len(got.BollingerUpper) != len(res.BBUpper) {
		t.Errorf("BollingerUpper: got len %d, want len %d", len(got.BollingerUpper), len(res.BBUpper))
	}
	if len(got.BollingerMiddle) != len(res.BBMiddle) {
		t.Errorf("BollingerMiddle: got len %d, want len %d", len(got.BollingerMiddle), len(res.BBMiddle))
	}
	if len(got.BollingerLower) != len(res.BBLower) {
		t.Errorf("BollingerLower: got len %d, want len %d", len(got.BollingerLower), len(res.BBLower))
	}
	if len(got.SMA) != len(res.SMA) {
		t.Errorf("SMA: got len %d, want len %d", len(got.SMA), len(res.SMA))
	}
	if len(got.EMA) != len(res.EMA) {
		t.Errorf("EMA: got len %d, want len %d", len(got.EMA), len(res.EMA))
	}
	if len(got.CrossSignals) != len(res.CrossSignals) {
		t.Errorf("CrossSignals: got len %d, want len %d", len(got.CrossSignals), len(res.CrossSignals))
	}
	for i, e := range res.CrossSignals {
		if got.CrossSignals[i].Index != e.Index || got.CrossSignals[i].Direction != e.Direction {
			t.Errorf("CrossSignals[%d]: got %+v, want Index=%d Direction=%s", i, got.CrossSignals[i], e.Index, e.Direction)
		}
	}

	// Regression gate for the drift this task fixes: MA5/MA20/MA50 must be mapped.
	if len(got.MA5) != len(res.MA5) {
		t.Errorf("MA5: got len %d, want len %d", len(got.MA5), len(res.MA5))
	}
	if len(got.MA20) != len(res.MA20) {
		t.Errorf("MA20: got len %d, want len %d", len(got.MA20), len(res.MA20))
	}
	if len(got.MA50) != len(res.MA50) {
		t.Errorf("MA50: got len %d, want len %d", len(got.MA50), len(res.MA50))
	}
	if len(got.MA5) == 0 {
		t.Error("MA5: want populated for 100-close input, got empty")
	}
	if len(got.MA20) == 0 {
		t.Error("MA20: want populated for 100-close input, got empty")
	}
	if len(got.MA50) == 0 {
		t.Error("MA50: want populated for 100-close input, got empty")
	}

	// Symbol is intentionally left unset by the mapper — callers set it.
	if got.Symbol != "" {
		t.Errorf("Symbol: want empty (mapper does not set it), got %q", got.Symbol)
	}
}

// TestToDomainIndicators_EmptyResult verifies the mapper handles a zero-value
// Result (all primitives insufficient data) without panicking, returning a
// non-nil struct with empty/nil slices.
func TestToDomainIndicators_EmptyResult(t *testing.T) {
	t.Parallel()

	got := module.ToDomainIndicators(module.Result{})
	if got == nil {
		t.Fatal("ToDomainIndicators returned nil for empty Result")
	}
	if len(got.RSI) != 0 || len(got.MA5) != 0 || len(got.CrossSignals) != 0 {
		t.Errorf("want all-empty output for empty Result, got %+v", got)
	}
}
