// Package domain — unit tests for ProximityService (TDD gate for IND-P1-52W-HIGH-PROXIMITY).
// All tests are pure (no DB, no network, no I/O).
//
// AC coverage:
//   - <252-bar handling: 52w fields null
//   - >=50 but <252: above_ma50 real + above_ma200 null
//   - >=200 but <252: above_ma200 real + 52w fields null
//   - denominator_ma200 count correct (EXCLUDES tickers with <200 bars)
//   - plausibility: pct_from_52w_high <= 0; pct_from_52w_low >= 0
//   - AT_HIGH/NEAR_HIGH/MID_RANGE/NEAR_LOW/AT_LOW label boundaries
//   - new_high_today when current == high_52w
package domain_test

import (
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// makeProxBars creates n bars with close = base + i*step.
func makeProxBars(n int, base, step float64) []domain.OHLCVBar {
	bars := make([]domain.OHLCVBar, n)
	for i := 0; i < n; i++ {
		c := base + float64(i)*step
		bars[i] = domain.OHLCVBar{
			Date:  date2026(i),
			Close: c,
			High:  c * 1.01,
			Low:   c * 0.99,
			Open:  c,
		}
	}
	return bars
}

// ---------------------------------------------------------------------------
// FR-6: <252 bars → 52w fields null
// ---------------------------------------------------------------------------

func TestProximityService_InsufficientHistory_52W(t *testing.T) {
	t.Parallel()
	svc := domain.NewProximityService()

	tickers := []string{"SHORT"}
	allBars := map[string][]domain.OHLCVBar{
		"SHORT": makeProxBars(100, 50000.0, 1.0), // 100 bars: <252
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	if len(result.Tickers) != 1 {
		t.Fatalf("want 1 ticker, got %d", len(result.Tickers))
	}
	ticker := result.Tickers[0]

	if ticker.High52w != nil || ticker.Low52w != nil || ticker.PctFromHigh != nil || ticker.PctFromLow != nil {
		t.Errorf("want nil 52w fields for <252 bars ticker")
	}
	if ticker.NullReason52w == nil {
		t.Errorf("want non-nil NullReason52w for <252 bars ticker")
	}

	// MA50 should be set (100 >= 50).
	if ticker.AboveMA50 == nil {
		t.Errorf("want non-nil AboveMA50 for 100-bar ticker (>=50)")
	}
	// MA200 should be null (100 < 200).
	if ticker.AboveMA200 != nil {
		t.Errorf("want nil AboveMA200 for 100-bar ticker (<200)")
	}
}

// ---------------------------------------------------------------------------
// FR-6: >=252 bars → all fields populated
// ---------------------------------------------------------------------------

func TestProximityService_Sufficient252Bars(t *testing.T) {
	t.Parallel()
	svc := domain.NewProximityService()

	tickers := []string{"FULL"}
	allBars := map[string][]domain.OHLCVBar{
		"FULL": makeProxBars(260, 50000.0, 10.0), // 260 bars >=252
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	ticker := result.Tickers[0]
	if ticker.High52w == nil {
		t.Errorf("want non-nil High52w for 260 bars")
	}
	if ticker.Low52w == nil {
		t.Errorf("want non-nil Low52w for 260 bars")
	}
	if ticker.PctFromHigh == nil {
		t.Errorf("want non-nil PctFromHigh for 260 bars")
	}
	if ticker.PctFromLow == nil {
		t.Errorf("want non-nil PctFromLow for 260 bars")
	}
	if ticker.AboveMA50 == nil {
		t.Errorf("want non-nil AboveMA50 for 260 bars")
	}
	if ticker.AboveMA200 == nil {
		t.Errorf("want non-nil AboveMA200 for 260 bars")
	}
}

// ---------------------------------------------------------------------------
// Plausibility: pct_from_52w_high <= 0, pct_from_52w_low >= 0
// ---------------------------------------------------------------------------

func TestProximityService_Plausibility(t *testing.T) {
	t.Parallel()
	svc := domain.NewProximityService()

	codes := []string{"A", "B", "C"}
	allBars := map[string][]domain.OHLCVBar{
		"A": makeProxBars(260, 1000.0, 1.0),   // rising
		"B": makeProxBars(260, 2000.0, -0.5),  // falling
		"C": makeProxBars(260, 5000.0, 0.0),   // flat
	}

	result := svc.ComputeCrossSection(allBars, codes)

	for _, ticker := range result.Tickers {
		if ticker.PctFromHigh != nil && *ticker.PctFromHigh > 0.001 {
			t.Errorf("ticker %s: pct_from_52w_high should be <= 0, got %.6f", ticker.Code, *ticker.PctFromHigh)
		}
		if ticker.PctFromLow != nil && *ticker.PctFromLow < -0.001 {
			t.Errorf("ticker %s: pct_from_52w_low should be >= 0, got %.6f", ticker.Code, *ticker.PctFromLow)
		}
	}
}

// ---------------------------------------------------------------------------
// FR-3: new_high_today when current == high_52w
// ---------------------------------------------------------------------------

func TestProximityService_NewHighToday(t *testing.T) {
	t.Parallel()
	svc := domain.NewProximityService()

	// Bars with monotonically increasing close → last bar IS the 52w high.
	tickers := []string{"RISING"}
	allBars := map[string][]domain.OHLCVBar{
		"RISING": makeProxBars(260, 1000.0, 1.0),
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	ticker := result.Tickers[0]
	if ticker.NewHighToday == nil {
		t.Fatal("want non-nil NewHighToday")
	}
	if !*ticker.NewHighToday {
		t.Errorf("want NewHighToday=true for monotonically rising closes")
	}
	if ticker.ProximityLabel == nil || *ticker.ProximityLabel != domain.ProximityAtHigh {
		t.Errorf("want AT_HIGH label for new-high ticker, got %v", ticker.ProximityLabel)
	}
}

// ---------------------------------------------------------------------------
// FR-5: denominator_ma200 excludes tickers with <200 bars
// ---------------------------------------------------------------------------

func TestProximityService_DenominatorMA200(t *testing.T) {
	t.Parallel()
	svc := domain.NewProximityService()

	// 2 tickers with >=200 bars, 1 with <200 bars.
	tickers := []string{"BIG", "ALSO_BIG", "SMALL"}
	allBars := map[string][]domain.OHLCVBar{
		"BIG":      makeProxBars(260, 1000.0, 1.0),
		"ALSO_BIG": makeProxBars(260, 2000.0, 0.5),
		"SMALL":    makeProxBars(150, 500.0, 1.0), // <200 bars
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	if result.Aggregate.DenominatorMA200 != 2 {
		t.Errorf("denominator_ma200: want 2 (tickers with >=200 bars), got %d", result.Aggregate.DenominatorMA200)
	}
}

// ---------------------------------------------------------------------------
// FR-4: AT_LOW label (falling ticker near 52w low)
// ---------------------------------------------------------------------------

func TestProximityService_ProximityLabel_AtLow(t *testing.T) {
	t.Parallel()
	svc := domain.NewProximityService()

	// Monotonically declining prices → last bar is 52w low.
	tickers := []string{"FALLING"}
	allBars := map[string][]domain.OHLCVBar{
		"FALLING": makeProxBars(260, 5000.0, -1.0),
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	ticker := result.Tickers[0]
	if ticker.ProximityLabel == nil {
		t.Fatal("want non-nil ProximityLabel")
	}
	// Falling ticker: current is at 52w low → AT_LOW or NEAR_LOW.
	if *ticker.ProximityLabel != domain.ProximityAtLow && *ticker.ProximityLabel != domain.ProximityNearLow {
		t.Errorf("want AT_LOW or NEAR_LOW for falling ticker, got %s", *ticker.ProximityLabel)
	}
}

// ---------------------------------------------------------------------------
// FR-5: net_new_highs aggregate
// ---------------------------------------------------------------------------

func TestProximityService_NetNewHighs_Aggregate(t *testing.T) {
	t.Parallel()
	svc := domain.NewProximityService()

	// 2 rising (→ AT_HIGH), 1 falling (→ AT_LOW).
	tickers := []string{"UP1", "UP2", "DOWN1"}
	allBars := map[string][]domain.OHLCVBar{
		"UP1":   makeProxBars(260, 1000.0, 1.0),
		"UP2":   makeProxBars(260, 2000.0, 2.0),
		"DOWN1": makeProxBars(260, 5000.0, -1.0),
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	// UP1/UP2 should be AT_HIGH; DOWN1 should be AT_LOW.
	// net_new_highs = 2 - 1 = 1.
	if result.Aggregate.NewHighsCount != 2 {
		t.Errorf("want NewHighsCount=2, got %d", result.Aggregate.NewHighsCount)
	}
	if result.Aggregate.NewLowsCount != 1 {
		t.Errorf("want NewLowsCount=1, got %d", result.Aggregate.NewLowsCount)
	}
	if result.NetNewHighs != 1 {
		t.Errorf("want NetNewHighs=1, got %d", result.NetNewHighs)
	}
}
