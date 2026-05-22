package moving_average_test

import (
	"math"
	"testing"

	ma "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/moving_average"
)

const tol = 1e-4 // tolerance for float comparisons

func approxEq(a, b float64) bool {
	return math.Abs(a-b) <= tol
}

func slicesApproxEq(a, b []float64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if !approxEq(a[i], b[i]) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// SMA tests
// ---------------------------------------------------------------------------

func TestCalculateSMA(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		closes  []float64
		period  int
		wantErr error
		want    []float64
	}{
		// --- Period validation ---
		{
			name:    "period zero returns ErrInvalidPeriod",
			closes:  []float64{1, 2, 3},
			period:  0,
			wantErr: ma.ErrInvalidPeriod,
		},
		{
			name:    "period negative returns ErrInvalidPeriod",
			closes:  []float64{1, 2, 3},
			period:  -1,
			wantErr: ma.ErrInvalidPeriod,
		},
		// --- Insufficient data ---
		{
			name:    "empty slice returns ErrInsufficientData",
			closes:  []float64{},
			period:  3,
			wantErr: ma.ErrInsufficientData,
		},
		{
			name:    "len < period returns ErrInsufficientData",
			closes:  []float64{1, 2},
			period:  3,
			wantErr: ma.ErrInsufficientData,
		},
		// --- NaN / negative price ---
		{
			name:    "NaN price returns ErrInvalidPrice",
			closes:  []float64{1, math.NaN(), 3},
			period:  2,
			wantErr: ma.ErrInvalidPrice,
		},
		{
			name:    "negative price returns ErrInvalidPrice",
			closes:  []float64{1, -2, 3},
			period:  2,
			wantErr: ma.ErrInvalidPrice,
		},
		// --- Flat input: SMA equals the constant ---
		{
			name:   "flat input: all 5.0, period 3",
			closes: []float64{5, 5, 5, 5, 5},
			period: 3,
			want:   []float64{5, 5, 5},
		},
		// --- Period == 1: output equals input ---
		{
			name:   "period 1: output equals input",
			closes: []float64{3, 7, 2, 9},
			period: 1,
			want:   []float64{3, 7, 2, 9},
		},
		// --- Golden vector: [1,2,3,4,5] period 3 -> [2,3,4] ---
		{
			name:   "golden: [1,2,3,4,5] period 3",
			closes: []float64{1, 2, 3, 4, 5},
			period: 3,
			want:   []float64{2, 3, 4},
		},
		// --- period == len(closes): single output ---
		{
			name:   "period == len: single SMA value",
			closes: []float64{2, 4, 6, 8},
			period: 4,
			want:   []float64{5},
		},
		// --- Golden reference: non-trivial series ---
		// closes = [10,11,12.5,13,11.5,12,14,13.5,12,13], period=4
		// SMA: windows of 4 → [11.625, 12.0, 12.25, 12.625, 12.75, 12.875, 13.125]
		{
			name:   "golden reference: 10-value series period 4",
			closes: []float64{10, 11, 12.5, 13, 11.5, 12, 14, 13.5, 12, 13},
			period: 4,
			want:   []float64{11.625, 12.0, 12.25, 12.625, 12.75, 12.875, 13.125},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := ma.CalculateSMA(tc.closes, tc.period)
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
			if tc.want != nil && !slicesApproxEq(got, tc.want) {
				t.Fatalf("SMA mismatch:\n  want %v\n  got  %v", tc.want, got)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// EMA tests
// ---------------------------------------------------------------------------

func TestCalculateEMA(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		closes  []float64
		period  int
		wantErr error
		want    []float64
		wantLen int
	}{
		// --- Period validation ---
		{
			name:    "period zero returns ErrInvalidPeriod",
			closes:  []float64{1, 2, 3},
			period:  0,
			wantErr: ma.ErrInvalidPeriod,
		},
		{
			name:    "period negative returns ErrInvalidPeriod",
			closes:  []float64{1, 2, 3},
			period:  -5,
			wantErr: ma.ErrInvalidPeriod,
		},
		// --- Insufficient data ---
		{
			name:    "empty slice returns ErrInsufficientData",
			closes:  []float64{},
			period:  5,
			wantErr: ma.ErrInsufficientData,
		},
		{
			name:    "len < period returns ErrInsufficientData",
			closes:  []float64{1, 2, 3},
			period:  5,
			wantErr: ma.ErrInsufficientData,
		},
		// --- NaN / negative price ---
		{
			name:    "NaN price returns ErrInvalidPrice",
			closes:  []float64{1, 2, math.NaN(), 4},
			period:  2,
			wantErr: ma.ErrInvalidPrice,
		},
		{
			name:    "negative price returns ErrInvalidPrice",
			closes:  []float64{1, 2, -3, 4},
			period:  2,
			wantErr: ma.ErrInvalidPrice,
		},
		// --- EMA seed == SMA of first period values ---
		// closes=[10,11,12.5,13,11.5,...], period=4
		// seed = (10+11+12.5+13)/4 = 11.625  → ema[0] must equal SMA of first 4.
		{
			name:    "EMA seed equals SMA of first period values",
			closes:  []float64{10, 11, 12.5, 13, 11.5},
			period:  4,
			wantLen: 2, // len=5, period=4 → 2 values
			// ema[0] = 11.625 (seed); ema[1] = (11.5-11.625)*0.4+11.625 = 11.575
			want: []float64{11.625, 11.575},
		},
		// --- Golden reference: 10-value series, period 4 ---
		// alpha = 2/(4+1) = 0.4
		// seed = 11.625
		// [11.625, 11.575, 11.745, 12.647, 12.9882, 12.59292, 12.755752]
		{
			name:    "golden reference: 10-value series period 4",
			closes:  []float64{10, 11, 12.5, 13, 11.5, 12, 14, 13.5, 12, 13},
			period:  4,
			wantLen: 7,
			want:    []float64{11.625, 11.575, 11.745, 12.647, 12.9882, 12.59292, 12.755752},
		},
		// --- period == len(closes): single output = SMA ---
		{
			name:    "period == len: single EMA value equals SMA",
			closes:  []float64{2, 4, 6, 8},
			period:  4,
			wantLen: 1,
			want:    []float64{5},
		},
		// --- period == 1: EMA equals input ---
		{
			name:    "period 1: EMA equals input (alpha=1)",
			closes:  []float64{3, 7, 2, 9},
			period:  1,
			wantLen: 4,
			want:    []float64{3, 7, 2, 9},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := ma.CalculateEMA(tc.closes, tc.period)
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
			if tc.wantLen > 0 && len(got) != tc.wantLen {
				t.Fatalf("EMA length: want %d, got %d", tc.wantLen, len(got))
			}
			if tc.want != nil && !slicesApproxEq(got, tc.want) {
				t.Fatalf("EMA mismatch:\n  want %v\n  got  %v", tc.want, got)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// SMA and EMA output length parity
// ---------------------------------------------------------------------------

func TestSMAEMAOutputLengthParity(t *testing.T) {
	t.Parallel()
	closes := make([]float64, 20)
	for i := range closes {
		closes[i] = float64(i + 1)
	}
	period := 5

	smaOut, err := ma.CalculateSMA(closes, period)
	if err != nil {
		t.Fatalf("SMA error: %v", err)
	}
	emaOut, err := ma.CalculateEMA(closes, period)
	if err != nil {
		t.Fatalf("EMA error: %v", err)
	}
	if len(smaOut) != len(emaOut) {
		t.Fatalf("length mismatch: SMA=%d, EMA=%d", len(smaOut), len(emaOut))
	}
	expected := len(closes) - period + 1
	if len(smaOut) != expected {
		t.Fatalf("output length: want %d, got %d", expected, len(smaOut))
	}
}

// ---------------------------------------------------------------------------
// Dispatcher tests
// ---------------------------------------------------------------------------

func TestCalculateMovingAverage(t *testing.T) {
	t.Parallel()

	closes := []float64{1, 2, 3, 4, 5}
	period := 3

	tests := []struct {
		name    string
		maType  string
		wantErr error
	}{
		{name: "SMA uppercase", maType: "SMA"},
		{name: "sma lowercase", maType: "sma"},
		{name: "EMA uppercase", maType: "EMA"},
		{name: "ema lowercase", maType: "ema"},
		{name: "unknown type returns ErrUnknownMAType", maType: "WMA", wantErr: ma.ErrUnknownMAType},
		{name: "empty type returns ErrUnknownMAType", maType: "", wantErr: ma.ErrUnknownMAType},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := ma.CalculateMovingAverage(closes, period, tc.maType)
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
			if len(got) == 0 {
				t.Fatal("got empty output slice")
			}
		})
	}
}

// TestDispatcherSMAMatchesDirect verifies the dispatcher routes SMA correctly.
func TestDispatcherSMAMatchesDirect(t *testing.T) {
	t.Parallel()
	closes := []float64{10, 11, 12.5, 13, 11.5, 12, 14}
	period := 3

	direct, _ := ma.CalculateSMA(closes, period)
	via, _ := ma.CalculateMovingAverage(closes, period, "SMA")
	if !slicesApproxEq(direct, via) {
		t.Fatalf("dispatcher SMA != direct SMA:\n  direct=%v\n  via=%v", direct, via)
	}
}

// TestDispatcherEMAMatchesDirect verifies the dispatcher routes EMA correctly.
func TestDispatcherEMAMatchesDirect(t *testing.T) {
	t.Parallel()
	closes := []float64{10, 11, 12.5, 13, 11.5, 12, 14}
	period := 3

	direct, _ := ma.CalculateEMA(closes, period)
	via, _ := ma.CalculateMovingAverage(closes, period, "EMA")
	if !slicesApproxEq(direct, via) {
		t.Fatalf("dispatcher EMA != direct EMA:\n  direct=%v\n  via=%v", direct, via)
	}
}
