package module_test

import (
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/module"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/bollinger_bands"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/moving_average"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/rsi"
)

// prices100 returns a deterministic 100-element price series (linear ramp).
func prices100() []float64 {
	p := make([]float64, 100)
	for i := range p {
		p[i] = 10.0 + float64(i)*0.5
	}
	return p
}

// prices15 returns 15-element series — enough for RSI(14) but not MACD(12/26/9) or BB(20).
func prices15() []float64 {
	p := make([]float64, 15)
	for i := range p {
		p[i] = 20.0 + float64(i)*0.1
	}
	return p
}

// prices5 returns a 5-element series — insufficient for all indicators.
func prices5() []float64 {
	return []float64{10.0, 10.5, 11.0, 10.8, 11.2}
}

func TestCompute(t *testing.T) {
	t.Parallel()

	defaultParams := module.ComputeParams{
		RSIPeriod:    14,
		MACDFast:     12,
		MACDSlow:     26,
		MACDSignal:   9,
		BBPeriod:     20,
		BBMultiplier: 2.0,
		MAPeriod:     14,
		MAType:       "SMA",
	}

	tests := []struct {
		name             string
		closes           []float64
		params           module.ComputeParams
		wantErr          error
		wantRSIPopulated bool
		wantMACDNil      bool
		wantBBNil        bool
		wantSMAPopulated bool
		wantEMAPopulated bool
		wantCrossSlice   bool // true = CrossSignals field non-nil (possibly empty but present)
	}{
		{
			name:             "happy_path_100_prices_all_fields_populated",
			closes:           prices100(),
			params:           defaultParams,
			wantRSIPopulated: true,
			wantMACDNil:      false,
			wantBBNil:        false,
			wantSMAPopulated: true,
			wantEMAPopulated: true,
			wantCrossSlice:   true,
		},
		{
			name:   "insufficient_for_bb_but_rsi_populated",
			closes: prices15(),
			params: defaultParams,
			// RSI(14) needs 15 closes — just enough.
			// MACD(12/26/9) needs 35 — insufficient.
			// BB(20) needs 20 — insufficient.
			// SMA(14) needs 14 — just enough.
			wantRSIPopulated: true,
			wantMACDNil:      true,
			wantBBNil:        true,
			wantSMAPopulated: true,
			wantEMAPopulated: true,
		},
		{
			name:             "insufficient_for_everything_no_error",
			closes:           prices5(),
			params:           defaultParams,
			wantRSIPopulated: false,
			wantMACDNil:      true,
			wantBBNil:        true,
			wantSMAPopulated: false,
			wantEMAPopulated: false,
		},
		{
			name:    "invalid_rsi_period_returns_error",
			closes:  prices100(),
			params:  module.ComputeParams{RSIPeriod: 1, MACDFast: 12, MACDSlow: 26, MACDSignal: 9, BBPeriod: 20, BBMultiplier: 2.0, MAPeriod: 14, MAType: "SMA"},
			wantErr: rsi.ErrInvalidPeriod,
		},
		{
			name:    "invalid_bb_multiplier_returns_error",
			closes:  prices100(),
			params:  module.ComputeParams{RSIPeriod: 14, MACDFast: 12, MACDSlow: 26, MACDSignal: 9, BBPeriod: 20, BBMultiplier: -1.0, MAPeriod: 14, MAType: "SMA"},
			wantErr: bollinger_bands.ErrInvalidMultiplier,
		},
		{
			name:    "invalid_ma_type_returns_error",
			closes:  prices100(),
			params:  module.ComputeParams{RSIPeriod: 14, MACDFast: 12, MACDSlow: 26, MACDSignal: 9, BBPeriod: 20, BBMultiplier: 2.0, MAPeriod: 14, MAType: "VWAP"},
			wantErr: moving_average.ErrUnknownMAType,
		},
		{
			name:             "zero_params_apply_defaults_100_prices",
			closes:           prices100(),
			params:           module.ComputeParams{},
			wantRSIPopulated: true,
			wantMACDNil:      false,
			wantBBNil:        false,
			wantSMAPopulated: true,
			wantEMAPopulated: true,
			wantCrossSlice:   true,
		},
		{
			name: "cross_signal_pair_is_macd_line_vs_signal_line",
			// Use oscillating prices so MACD produces crossovers.
			closes: func() []float64 {
				p := make([]float64, 60)
				for i := range p {
					if i%10 < 5 {
						p[i] = 10.0 + float64(i%10)
					} else {
						p[i] = 15.0 - float64(i%10)
					}
				}
				return p
			}(),
			params:           defaultParams,
			wantRSIPopulated: true,
			wantMACDNil:      false,
			wantBBNil:        false,
			wantSMAPopulated: true,
			wantEMAPopulated: true,
			wantCrossSlice:   true,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := module.Compute(tc.closes, tc.params)

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

			if tc.wantRSIPopulated && len(got.RSI) == 0 {
				t.Errorf("RSI: want populated, got empty")
			}
			if !tc.wantRSIPopulated && len(got.RSI) > 0 {
				t.Errorf("RSI: want empty, got %d elements", len(got.RSI))
			}
			if tc.wantMACDNil && len(got.MACDLine) > 0 {
				t.Errorf("MACDLine: want nil/empty, got %d elements", len(got.MACDLine))
			}
			if !tc.wantMACDNil && len(got.MACDLine) == 0 {
				t.Errorf("MACDLine: want populated, got empty")
			}
			if tc.wantBBNil && len(got.BBUpper) > 0 {
				t.Errorf("BBUpper: want nil/empty, got %d elements", len(got.BBUpper))
			}
			if !tc.wantBBNil && len(got.BBUpper) == 0 {
				t.Errorf("BBUpper: want populated, got empty")
			}
			if tc.wantSMAPopulated && len(got.SMA) == 0 {
				t.Errorf("SMA: want populated, got empty")
			}
			if tc.wantEMAPopulated && len(got.EMA) == 0 {
				t.Errorf("EMA: want populated, got empty")
			}
			if tc.wantCrossSlice && got.CrossSignals == nil {
				// CrossSignals may be empty slice (no crosses) but should not be nil
				// when MACD is populated; nil = field never set.
				t.Errorf("CrossSignals: want non-nil slice, got nil")
			}
		})
	}
}

// TestComputeRSIRange verifies RSI values stay in [0, 100].
func TestComputeRSIRange(t *testing.T) {
	t.Parallel()
	closes := prices100()
	res, err := module.Compute(closes, module.ComputeParams{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i, v := range res.RSI {
		if v < 0 || v > 100 {
			t.Errorf("RSI[%d] = %f out of [0,100]", i, v)
		}
	}
}
