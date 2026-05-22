package bollinger_bands_test

import (
	"math"
	"testing"

	bb "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/bollinger_bands"
)

const tol = 1e-4 // ±0.01% tolerance for golden reference checks

func approxEqual(a, b float64) bool {
	return math.Abs(a-b) <= tol
}

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
		name           string
		closes         []float64
		period         int
		multiplier     float64
		wantErr        error
		wantLen        int
		wantFirstUpper *float64
		wantFirstMid   *float64
		wantFirstLower *float64
		wantFlat       bool // upper == middle == lower for all outputs
	}{
		// --- Validation: period ---
		{
			name:       "period < 2 returns ErrInvalidPeriod",
			closes:     []float64{10, 11, 12, 13, 14},
			period:     1,
			multiplier: 2.0,
			wantErr:    bb.ErrInvalidPeriod,
		},
		{
			name:       "period == 0 returns ErrInvalidPeriod",
			closes:     []float64{10, 11, 12},
			period:     0,
			multiplier: 2.0,
			wantErr:    bb.ErrInvalidPeriod,
		},
		{
			name:       "negative period returns ErrInvalidPeriod",
			closes:     []float64{10, 11, 12},
			period:     -1,
			multiplier: 2.0,
			wantErr:    bb.ErrInvalidPeriod,
		},
		// --- Validation: multiplier ---
		{
			name:       "multiplier == 0 returns ErrInvalidMultiplier",
			closes:     make([]float64, 25),
			period:     20,
			multiplier: 0,
			wantErr:    bb.ErrInvalidMultiplier,
		},
		{
			name:       "negative multiplier returns ErrInvalidMultiplier",
			closes:     make([]float64, 25),
			period:     20,
			multiplier: -1.5,
			wantErr:    bb.ErrInvalidMultiplier,
		},
		// --- Validation: insufficient data ---
		{
			name:       "len(closes) < period returns ErrInsufficientData",
			closes:     []float64{10, 11, 12, 13, 14},
			period:     20,
			multiplier: 2.0,
			wantErr:    bb.ErrInsufficientData,
		},
		{
			name:       "empty slice returns ErrInsufficientData",
			closes:     []float64{},
			period:     20,
			multiplier: 2.0,
			wantErr:    bb.ErrInsufficientData,
		},
		// --- Validation: invalid prices ---
		{
			name: "NaN price returns ErrInvalidPrice",
			closes: func() []float64 {
				s := make([]float64, 25)
				for i := range s {
					s[i] = 100.0
				}
				s[10] = math.NaN()
				return s
			}(),
			period:     20,
			multiplier: 2.0,
			wantErr:    bb.ErrInvalidPrice,
		},
		{
			name: "negative price returns ErrInvalidPrice",
			closes: func() []float64 {
				s := make([]float64, 25)
				for i := range s {
					s[i] = 100.0
				}
				s[5] = -1.0
				return s
			}(),
			period:     20,
			multiplier: 2.0,
			wantErr:    bb.ErrInvalidPrice,
		},
		// --- Flat prices: stdDev = 0, bands collapse ---
		{
			name: "flat closes: upper == middle == lower",
			closes: func() []float64 {
				s := make([]float64, 25)
				for i := range s {
					s[i] = 100.0
				}
				return s
			}(),
			period:     20,
			multiplier: 2.0,
			wantLen:    6, // 25 - 20 + 1
			wantFlat:   true,
		},
		// --- Minimum valid: exactly period closes returns 1 output ---
		{
			name: "exactly period closes: output length == 1",
			closes: func() []float64 {
				s := make([]float64, 20)
				for i := range s {
					s[i] = float64(100 + i)
				}
				return s
			}(),
			period:     20,
			multiplier: 2.0,
			wantLen:    1,
		},
		// --- High volatility: bands widen ---
		{
			name: "high volatility: upper significantly above middle, lower significantly below",
			closes: func() []float64 {
				// Alternating spike pattern — high variance
				s := make([]float64, 25)
				for i := range s {
					if i%2 == 0 {
						s[i] = 200.0
					} else {
						s[i] = 100.0
					}
				}
				return s
			}(),
			period:     20,
			multiplier: 2.0,
			wantLen:    6,
		},
		// --- Output length for 100 closes ---
		{
			name: "100 closes period 20: output length == 81",
			closes: func() []float64 {
				s := make([]float64, 100)
				for i := range s {
					s[i] = 100.0 + math.Sin(float64(i)*0.3)*5.0
				}
				return s
			}(),
			period:     20,
			multiplier: 2.0,
			wantLen:    81, // 100 - 20 + 1
		},
		// --- Golden reference: 20/2 canonical vector cross-checked with Python numpy ---
		// Prices: textbook rising series (Apple-like). Population std dev (ddof=0).
		// Cross-verified: numpy.std(window, ddof=0) for each window.
		// First output (window closes[0:20], mean=88.7085, stdDev=1.291705):
		//   upper = 88.7085 + 2*1.291705 = 91.291910
		//   middle= 88.7085
		//   lower = 88.7085 - 2*1.291705 = 86.125090
		{
			name: "golden reference 20/2: first output matches Python numpy population stdDev",
			closes: []float64{
				86.16, 89.09, 88.78, 90.32, 89.07,
				91.15, 89.44, 89.18, 86.93, 87.68,
				86.96, 89.43, 89.32, 88.72, 87.45,
				87.26, 89.50, 87.90, 89.13, 90.70,
				92.90, 92.98, 91.80, 92.66, 92.68,
			},
			period:     20,
			multiplier: 2.0,
			wantLen:    6,
			wantFirstUpper: func() *float64 { v := 91.291911; return &v }(),
			wantFirstMid:   func() *float64 { v := 88.708500; return &v }(),
			wantFirstLower: func() *float64 { v := 86.125089; return &v }(),
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := bb.Calculate(tc.closes, tc.period, tc.multiplier)

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

			if tc.wantLen > 0 && len(result.Upper) != tc.wantLen {
				t.Fatalf("Upper len: want %d, got %d", tc.wantLen, len(result.Upper))
			}
			if tc.wantLen > 0 && len(result.Middle) != tc.wantLen {
				t.Fatalf("Middle len: want %d, got %d", tc.wantLen, len(result.Middle))
			}
			if tc.wantLen > 0 && len(result.Lower) != tc.wantLen {
				t.Fatalf("Lower len: want %d, got %d", tc.wantLen, len(result.Lower))
			}

			// Flat test: upper == middle == lower for all points.
			if tc.wantFlat {
				for i := range result.Upper {
					if result.Upper[i] != result.Middle[i] || result.Middle[i] != result.Lower[i] {
						t.Errorf("flat[%d]: upper=%.6f middle=%.6f lower=%.6f — expected all equal",
							i, result.Upper[i], result.Middle[i], result.Lower[i])
					}
				}
			}

			// High volatility: bands should be meaningfully wide (upper - lower > multiplier * something reasonable).
			if tc.name == "high volatility: upper significantly above middle, lower significantly below" {
				for i := range result.Upper {
					if result.Upper[i]-result.Middle[i] < 10.0 {
						t.Errorf("high-vol[%d]: band width too narrow: upper-middle=%.4f, expected >10",
							i, result.Upper[i]-result.Middle[i])
					}
				}
			}

			// Golden reference spot checks.
			if tc.wantFirstUpper != nil && len(result.Upper) > 0 {
				if math.Abs(result.Upper[0]-*tc.wantFirstUpper) > tol {
					t.Errorf("Upper[0]: want %.6f ±%.4f, got %.6f",
						*tc.wantFirstUpper, tol, result.Upper[0])
				}
			}
			if tc.wantFirstMid != nil && len(result.Middle) > 0 {
				if math.Abs(result.Middle[0]-*tc.wantFirstMid) > tol {
					t.Errorf("Middle[0]: want %.6f ±%.4f, got %.6f",
						*tc.wantFirstMid, tol, result.Middle[0])
				}
			}
			if tc.wantFirstLower != nil && len(result.Lower) > 0 {
				if math.Abs(result.Lower[0]-*tc.wantFirstLower) > tol {
					t.Errorf("Lower[0]: want %.6f ±%.4f, got %.6f",
						*tc.wantFirstLower, tol, result.Lower[0])
				}
			}
		})
	}
}

// TestCalculateBandSymmetry verifies upper - middle == middle - lower for all outputs.
func TestCalculateBandSymmetry(t *testing.T) {
	t.Parallel()
	closes := func() []float64 {
		s := make([]float64, 50)
		for i := range s {
			s[i] = 100.0 + math.Sin(float64(i)*0.4)*3.0
		}
		return s
	}()
	result, err := bb.Calculate(closes, 20, 2.0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := range result.Upper {
		halfUpper := result.Upper[i] - result.Middle[i]
		halfLower := result.Middle[i] - result.Lower[i]
		if math.Abs(halfUpper-halfLower) > 1e-10 {
			t.Errorf("asymmetry at [%d]: upper-middle=%.10f != middle-lower=%.10f",
				i, halfUpper, halfLower)
		}
	}
}
