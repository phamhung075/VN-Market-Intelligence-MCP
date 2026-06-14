// Package domain — table-driven tests for BOP domain service functions (VMT-2).
//
// Test anchors are derived from the LIVE Q4-2025 probe payload in
// scripts/probes/vmt-2-sample.json (CONTRACT-FROM-LIVE-PAYLOAD rule GA-7).
//
// Q4-2025 live anchors:
//   loiVaSaiSot     = "-12.375" → ParseVNNumber → -12375.0
//   canCanVangLai   = "7.654"   → ParseVNNumber → 7654.0
//   canCanTongThe   = "2.355"   → ParseVNNumber → 2355.0
//   hangHoaRong     = "9.135"   → ParseVNNumber → 9135.0
//   dichVuRong      = "-2.287"  → ParseVNNumber → -2287.0
//   FXIncidence: loiVaSaiSot = -12375 < -1000 → FDI_BENIGN
//   OffshoreParked: E&O=-12375 <0 AND overall_balance=2355 >0 → parked=12375 M USD
//
// Fence-A: this test file is in package domain — zero infrastructure imports.
package domain

import (
	"testing"
)

// ---------------------------------------------------------------------------
// TestParseVNNumber — Vietnamese number format parser
// ---------------------------------------------------------------------------

func TestParseVNNumber(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantVal   float64
		wantOK    bool
	}{
		// Q4-2025 live anchors from scripts/probes/vmt-2-sample.json
		{
			name:    "live Q4-2025 loiVaSaiSot=-12.375 → -12375",
			input:   "-12.375",
			wantVal: -12375.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 canCanVangLai=7.654 → 7654",
			input:   "7.654",
			wantVal: 7654.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 hangHoaRong=9.135 → 9135",
			input:   "9.135",
			wantVal: 9135.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 dichVuRong=-2.287 → -2287",
			input:   "-2.287",
			wantVal: -2287.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 canCanTongThe=2.355 → 2355",
			input:   "2.355",
			wantVal: 2355.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 hangHoaXuatKhau=126.318 → 126318",
			input:   "126.318",
			wantVal: 126318.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 hangHoaNhapKhau=117.183 → 117183",
			input:   "117.183",
			wantVal: 117183.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 canCanVon=0 → 0",
			input:   "0",
			wantVal: 0.0,
			wantOK:  true,
		},
		{
			name:    "live Q4-2025 duTruVaCacHangMucLien=-2.355 → -2355",
			input:   "-2.355",
			wantVal: -2355.0,
			wantOK:  true,
		},
		// Empty-string rule: empty fields → omit/null (ok=false)
		{
			name:    "empty string → ok=false (tinDungVaVayNoTuIMF empty in live payload)",
			input:   "",
			wantVal: 0.0,
			wantOK:  false,
		},
		{
			name:    "whitespace only → ok=false",
			input:   "   ",
			wantVal: 0.0,
			wantOK:  false,
		},
		// Additional correctness cases
		{
			name:    "integer zero with no separators",
			input:   "0",
			wantVal: 0.0,
			wantOK:  true,
		},
		{
			name:    "small negative with comma decimal",
			input:   "-1,5",
			wantVal: -1.5,
			wantOK:  true,
		},
		{
			name:    "large value with period thousands",
			input:   "1.000.500",
			wantVal: 1000500.0,
			wantOK:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := ParseVNNumber(tc.input)
			if ok != tc.wantOK {
				t.Errorf("ParseVNNumber(%q): ok=%v, want %v", tc.input, ok, tc.wantOK)
			}
			if ok && got != tc.wantVal {
				t.Errorf("ParseVNNumber(%q): value=%v, want %v", tc.input, got, tc.wantVal)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestComputeFXIncidence — DD-5 discriminator (table-driven)
// ---------------------------------------------------------------------------

func TestComputeFXIncidence(t *testing.T) {
	tests := []struct {
		name           string
		eoMnUSD        float64
		isKnown        bool
		wantLabel      FXIncidenceLabel
		wantIsEstimate bool
	}{
		// Live Q4-2025 anchor: loiVaSaiSot = -12375 M USD → FDI_BENIGN
		{
			name:           "Q4-2025 live anchor: E&O=-12375 → FDI_BENIGN",
			eoMnUSD:        -12375.0,
			isKnown:        true,
			wantLabel:      FXIncidenceFDIBenign,
			wantIsEstimate: false,
		},
		// Threshold boundary: exactly at threshold (< -1000) → FDI_BENIGN
		{
			name:           "threshold boundary: E&O=-1001 → FDI_BENIGN",
			eoMnUSD:        -1001.0,
			isKnown:        true,
			wantLabel:      FXIncidenceFDIBenign,
			wantIsEstimate: false,
		},
		// Exactly at threshold: -1000 is NOT < -1000, should be NEUTRAL
		{
			name:           "threshold edge: E&O=-1000 (not < -1000) → NEUTRAL",
			eoMnUSD:        -1000.0,
			isKnown:        true,
			wantLabel:      FXIncidenceNeutral,
			wantIsEstimate: false,
		},
		// Small negative E&O within noise band → NEUTRAL
		{
			name:           "small negative E&O=-500 → NEUTRAL",
			eoMnUSD:        -500.0,
			isKnown:        true,
			wantLabel:      FXIncidenceNeutral,
			wantIsEstimate: false,
		},
		// Zero E&O → NEUTRAL
		{
			name:           "zero E&O → NEUTRAL",
			eoMnUSD:        0.0,
			isKnown:        true,
			wantLabel:      FXIncidenceNeutral,
			wantIsEstimate: false,
		},
		// Large positive E&O → CAPITAL_FLIGHT_SIGNAL
		{
			name:           "large positive E&O=+5000 → CAPITAL_FLIGHT_SIGNAL",
			eoMnUSD:        5000.0,
			isKnown:        true,
			wantLabel:      FXIncidenceCapitalFlight,
			wantIsEstimate: false,
		},
		// Positive threshold edge: +1001 → CAPITAL_FLIGHT_SIGNAL
		{
			name:           "positive threshold: E&O=+1001 → CAPITAL_FLIGHT_SIGNAL",
			eoMnUSD:        1001.0,
			isKnown:        true,
			wantLabel:      FXIncidenceCapitalFlight,
			wantIsEstimate: false,
		},
		// isKnown=false → UNKNOWN (fail-closed)
		{
			name:           "unknown/empty E&O → UNKNOWN (fail-closed)",
			eoMnUSD:        0.0,
			isKnown:        false,
			wantLabel:      FXIncidenceUnknown,
			wantIsEstimate: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ComputeFXIncidence(tc.eoMnUSD, tc.isKnown)
			if got.Label != tc.wantLabel {
				t.Errorf("ComputeFXIncidence(%.1f, %v): label=%q, want %q",
					tc.eoMnUSD, tc.isKnown, got.Label, tc.wantLabel)
			}
			if got.IsEstimate != tc.wantIsEstimate {
				t.Errorf("ComputeFXIncidence(%.1f, %v): is_estimate=%v, want %v",
					tc.eoMnUSD, tc.isKnown, got.IsEstimate, tc.wantIsEstimate)
			}
			// Traceability: ErrorsOmissionsMnUSD must match input when isKnown=true.
			if tc.isKnown && got.ErrorsOmissionsMnUSD != tc.eoMnUSD {
				t.Errorf("ComputeFXIncidence: ErrorsOmissionsMnUSD=%v, want %v",
					got.ErrorsOmissionsMnUSD, tc.eoMnUSD)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestComputeOffshoreParked — heuristic estimate (always is_estimate=true)
// ---------------------------------------------------------------------------

func TestComputeOffshoreParked(t *testing.T) {
	tests := []struct {
		name              string
		eoMnUSD           float64
		overallBalMnUSD   float64
		wantParkedNil     bool
		wantParkedApprox  float64 // only checked when wantParkedNil=false
		wantIsEstimate    bool    // always true
	}{
		// Q4-2025 live anchor: E&O=-12375, overall_balance=2355 → parked≈12375
		{
			name:             "Q4-2025 live anchor: E&O=-12375 overall=2355 → parked=12375",
			eoMnUSD:          -12375.0,
			overallBalMnUSD:  2355.0,
			wantParkedNil:    false,
			wantParkedApprox: 12375.0,
			wantIsEstimate:   true,
		},
		// E&O >= 0 → nil (precondition: E&O must be negative)
		{
			name:            "E&O=0 → nil (precondition not met)",
			eoMnUSD:         0.0,
			overallBalMnUSD: 2355.0,
			wantParkedNil:   true,
			wantIsEstimate:  true,
		},
		// E&O > 0 → nil
		{
			name:            "E&O=+500 → nil (E&O positive, no outflow)",
			eoMnUSD:         500.0,
			overallBalMnUSD: 100.0,
			wantParkedNil:   true,
			wantIsEstimate:  true,
		},
		// overall_balance <= 0 → nil (precondition: overall balance must be positive)
		{
			name:            "E&O=-5000 but overall_balance=-100 → nil (overall not positive)",
			eoMnUSD:         -5000.0,
			overallBalMnUSD: -100.0,
			wantParkedNil:   true,
			wantIsEstimate:  true,
		},
		// overall_balance = 0 → nil
		{
			name:            "E&O=-500 overall=0 → nil",
			eoMnUSD:         -500.0,
			overallBalMnUSD: 0.0,
			wantParkedNil:   true,
			wantIsEstimate:  true,
		},
		// Small negative E&O with positive balance → parked estimate
		{
			name:             "E&O=-200 overall=100 → parked=200",
			eoMnUSD:          -200.0,
			overallBalMnUSD:  100.0,
			wantParkedNil:    false,
			wantParkedApprox: 200.0,
			wantIsEstimate:   true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ComputeOffshoreParked(tc.eoMnUSD, tc.overallBalMnUSD)

			// is_estimate MUST always be true.
			if !got.IsEstimate {
				t.Errorf("ComputeOffshoreParked: is_estimate=%v, want true (always)", got.IsEstimate)
			}

			if tc.wantParkedNil {
				if got.OffshoreParkedMnUSD != nil {
					t.Errorf("ComputeOffshoreParked: expected nil OffshoreParkedMnUSD, got %v", *got.OffshoreParkedMnUSD)
				}
			} else {
				if got.OffshoreParkedMnUSD == nil {
					t.Errorf("ComputeOffshoreParked: expected non-nil OffshoreParkedMnUSD (want %.1f), got nil", tc.wantParkedApprox)
				} else if *got.OffshoreParkedMnUSD != tc.wantParkedApprox {
					t.Errorf("ComputeOffshoreParked: OffshoreParkedMnUSD=%.1f, want %.1f",
						*got.OffshoreParkedMnUSD, tc.wantParkedApprox)
				}
			}

			// Note must be non-empty.
			if got.Note == "" {
				t.Errorf("ComputeOffshoreParked: Note is empty — methodology note required for traceability")
			}
		})
	}
}
