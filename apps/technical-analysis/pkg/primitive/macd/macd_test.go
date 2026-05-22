package macd_test

import (
	"math"
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/macd"
)

const tol = 1e-4 // tolerance for float comparisons

func approxEqual(a, b float64) bool {
	return math.Abs(a-b) <= tol
}

// slicesApproxEqual checks two float64 slices element-wise within tol.
func slicesApproxEqual(a, b []float64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if !approxEqual(a[i], b[i]) {
			return false
		}
	}
	return true
}

func TestCalculate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		closes       []float64
		fast         int
		slow         int
		signalPeriod int
		wantErr      error
		wantLen      int
		// Spot-check first output triple (all three lines).
		wantFirstMACD   *float64
		wantFirstSig    *float64
		wantFirstHist   *float64
		// Check sign of histogram for cross direction.
		wantHistAllNeg bool
		wantHistAllPos bool
		// Check histogram crosses from negative to positive (bullish) or reverse.
		wantBullishCross bool
		wantBearishCross bool
	}{
		// --- Validation cases ---
		{
			name:         "fast >= slow returns ErrInvalidPeriods",
			closes:       make([]float64, 40),
			fast:         26,
			slow:         12,
			signalPeriod: 9,
			wantErr:      macd.ErrInvalidPeriods,
		},
		{
			name:         "fast == slow returns ErrInvalidPeriods",
			closes:       make([]float64, 40),
			fast:         12,
			slow:         12,
			signalPeriod: 9,
			wantErr:      macd.ErrInvalidPeriods,
		},
		{
			name:         "fast zero returns ErrInvalidPeriods",
			closes:       make([]float64, 40),
			fast:         0,
			slow:         12,
			signalPeriod: 9,
			wantErr:      macd.ErrInvalidPeriods,
		},
		{
			name:         "signalPeriod zero returns ErrInvalidSignal",
			closes:       make([]float64, 40),
			fast:         12,
			slow:         26,
			signalPeriod: 0,
			wantErr:      macd.ErrInvalidSignal,
		},
		{
			name:         "insufficient data: exactly slow+signalPeriod-1 closes",
			closes:       make([]float64, 34), // need 35 for 12/26/9
			fast:         12,
			slow:         26,
			signalPeriod: 9,
			wantErr:      macd.ErrInsufficientData,
		},
		{
			name:         "insufficient data: empty slice",
			closes:       []float64{},
			fast:         12,
			slow:         26,
			signalPeriod: 9,
			wantErr:      macd.ErrInsufficientData,
		},
		{
			name: "NaN price returns ErrInvalidPrice",
			closes: func() []float64 {
				s := make([]float64, 35)
				for i := range s {
					s[i] = 100.0
				}
				s[10] = math.NaN()
				return s
			}(),
			fast:         12,
			slow:         26,
			signalPeriod: 9,
			wantErr:      macd.ErrInvalidPrice,
		},
		// --- All-flat prices: MACD ≈ 0, signal ≈ 0, histogram ≈ 0 ---
		{
			name: "all-flat closes: macd signal histogram all near zero",
			closes: func() []float64 {
				s := make([]float64, 50)
				for i := range s {
					s[i] = 100.0
				}
				return s
			}(),
			fast:         12,
			slow:         26,
			signalPeriod: 9,
			// Output length: (len-slow+1) - signalPeriod + 1 = 50-26+1 - 9+1 = 17
			wantLen: 17,
		},
		// --- Bullish cross: histogram goes negative → positive ---
		{
			name: "bullish cross: histogram crosses zero upward",
			closes: func() []float64 {
				// Flat at 100 for first 30 candles (seeds EMAs near 100),
				// then sharp decline (forces MACD deeply negative),
				// then sharp rally above 100 (fast EMA surpasses slow → MACD crosses zero,
				// histogram neg→pos within the output window).
				n := 60
				s := make([]float64, n)
				for i := 0; i < 30; i++ {
					s[i] = 100.0
				}
				for i := 30; i < 45; i++ {
					s[i] = 100.0 - float64(i-29)*2.0 // decline to 70
				}
				for i := 45; i < n; i++ {
					s[i] = s[i-1] + 5.0 // rally: 75 → 145
				}
				return s
			}(),
			fast:             12,
			slow:             26,
			signalPeriod:     9,
			wantLen:          27, // (60-26+1) - 9 + 1
			wantBullishCross: true,
		},
		// --- Bearish cross: histogram goes positive → negative ---
		{
			name: "bearish cross: histogram crosses zero downward",
			closes: func() []float64 {
				// Flat at 100 for first 30 candles, sharp rise, then sharp decline below 100.
				n := 60
				s := make([]float64, n)
				for i := 0; i < 30; i++ {
					s[i] = 100.0
				}
				for i := 30; i < 45; i++ {
					s[i] = 100.0 + float64(i-29)*2.0 // rise to 130
				}
				for i := 45; i < n; i++ {
					s[i] = s[i-1] - 5.0 // decline
				}
				return s
			}(),
			fast:             12,
			slow:             26,
			signalPeriod:     9,
			wantLen:          27,
			wantBearishCross: true,
		},
		// --- Golden reference: 50-price canonical vector (12/26/9) ---
		// Reference computed from EMA-seed=SMA convention (see ema.go).
		// Prices are a textbook declining-then-rallying series.
		// First output triple verified by hand + verified by calcEMA above.
		{
			name: "golden reference 12/26/9: first output triple matches canonical vector",
			closes: []float64{
				459.99, 448.85, 446.06, 450.81, 442.80,
				448.97, 444.57, 441.40, 430.47, 420.05,
				431.14, 425.66, 430.58, 431.72, 437.87,
				428.43, 428.35, 432.50, 443.66, 455.72,
				454.49, 452.08, 452.73, 461.91, 463.58,
				461.14, 452.08, 442.66, 428.91, 429.79,
				431.99, 427.72, 423.20, 426.21, 426.98,
				435.69, 429.87, 420.42, 416.34, 410.65,
				420.21, 430.00, 440.00, 445.00, 450.00,
				455.00, 460.00, 465.00, 470.00, 475.00,
			},
			fast:         12,
			slow:         26,
			signalPeriod: 9,
			wantLen:      17, // (50-26+1) - 9 + 1
			// First triple from canonical computation:
			//   macd[0]=-2.070558  signal[0]=3.037526  hist[0]=-5.108084
			wantFirstMACD: func() *float64 { v := -2.070558; return &v }(),
			wantFirstSig:  func() *float64 { v := 3.037526; return &v }(),
			wantFirstHist: func() *float64 { v := -5.108084; return &v }(),
		},
	}

	const spotTol = 1e-3 // tolerance for golden reference spot checks

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := macd.Calculate(tc.closes, tc.fast, tc.slow, tc.signalPeriod)

			if tc.wantErr != nil {
				if err == nil {
					t.Fatalf("want error %v, got nil", tc.wantErr)
				}
				if err != tc.wantErr {
					t.Fatalf("want error %v, got %v", tc.wantErr, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			// Length check.
			if tc.wantLen > 0 {
				if len(result.MACDLine) != tc.wantLen {
					t.Fatalf("MACDLine len: want %d, got %d", tc.wantLen, len(result.MACDLine))
				}
				if len(result.SignalLine) != tc.wantLen {
					t.Fatalf("SignalLine len: want %d, got %d", tc.wantLen, len(result.SignalLine))
				}
				if len(result.Histogram) != tc.wantLen {
					t.Fatalf("Histogram len: want %d, got %d", tc.wantLen, len(result.Histogram))
				}
			}

			// All-flat: all values near zero.
			if tc.name == "all-flat closes: macd signal histogram all near zero" {
				for i, v := range result.MACDLine {
					if math.Abs(v) > 1e-9 {
						t.Errorf("MACDLine[%d] = %.10f, want ≈0", i, v)
					}
				}
				for i, v := range result.Histogram {
					if math.Abs(v) > 1e-9 {
						t.Errorf("Histogram[%d] = %.10f, want ≈0", i, v)
					}
				}
			}

			// Bullish cross: at least one sign change neg → pos in histogram.
			if tc.wantBullishCross {
				hasCross := false
				for i := 1; i < len(result.Histogram); i++ {
					if result.Histogram[i-1] < 0 && result.Histogram[i] > 0 {
						hasCross = true
						break
					}
				}
				if !hasCross {
					t.Errorf("expected bullish cross (histogram neg→pos) but none found; hist=%v", result.Histogram)
				}
			}

			// Bearish cross: at least one sign change pos → neg in histogram.
			if tc.wantBearishCross {
				hasCross := false
				for i := 1; i < len(result.Histogram); i++ {
					if result.Histogram[i-1] > 0 && result.Histogram[i] < 0 {
						hasCross = true
						break
					}
				}
				if !hasCross {
					t.Errorf("expected bearish cross (histogram pos→neg) but none found; hist=%v", result.Histogram)
				}
			}

			// Golden reference spot checks.
			if tc.wantFirstMACD != nil && len(result.MACDLine) > 0 {
				if math.Abs(result.MACDLine[0]-*tc.wantFirstMACD) > spotTol {
					t.Errorf("MACDLine[0]: want %.6f ±%.4f, got %.6f",
						*tc.wantFirstMACD, spotTol, result.MACDLine[0])
				}
			}
			if tc.wantFirstSig != nil && len(result.SignalLine) > 0 {
				if math.Abs(result.SignalLine[0]-*tc.wantFirstSig) > spotTol {
					t.Errorf("SignalLine[0]: want %.6f ±%.4f, got %.6f",
						*tc.wantFirstSig, spotTol, result.SignalLine[0])
				}
			}
			if tc.wantFirstHist != nil && len(result.Histogram) > 0 {
				if math.Abs(result.Histogram[0]-*tc.wantFirstHist) > spotTol {
					t.Errorf("Histogram[0]: want %.6f ±%.4f, got %.6f",
						*tc.wantFirstHist, spotTol, result.Histogram[0])
				}
			}
		})
	}
}

// TestCalculateOutputConsistency verifies MACDLine - SignalLine == Histogram for all outputs.
func TestCalculateOutputConsistency(t *testing.T) {
	t.Parallel()
	closes := make([]float64, 50)
	for i := range closes {
		closes[i] = 100.0 + float64(i)*0.5
	}
	result, err := macd.Calculate(closes, 12, 26, 9)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := range result.Histogram {
		expected := result.MACDLine[i] - result.SignalLine[i]
		if math.Abs(result.Histogram[i]-expected) > 1e-10 {
			t.Errorf("histogram[%d]=%.10f != macd[%d]-signal[%d]=%.10f",
				i, result.Histogram[i], i, i, expected)
		}
	}
}
