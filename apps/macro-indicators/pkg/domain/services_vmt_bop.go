// Package domain — BOP domain service functions for VMT-2.
//
// Pure functions: no imports from application, infrastructure, or interface layers.
// All BOP domain logic lives here; use cases call these functions after fetching data.
//
// Key functions:
//   - ComputeFXIncidence: DD-5 discriminator (FDI_BENIGN / CAPITAL_FLIGHT / NEUTRAL / UNKNOWN)
//   - ComputeOffshoreParked: offline-parked heuristic (always is_estimate=true)
//   - ParseVNNumber: Vietnamese number-format parser (period=thousands, comma=decimal)
//
// Fence-A: zero imports from application, infrastructure, or interface layers.
package domain

import (
	"strconv"
	"strings"
)

// fxIncidenceThresholdMnUSD is the E&O magnitude threshold for the FX-incidence discriminator.
// Derived from architect DD-5: FDI_BENIGN when E&O < -1000 M USD.
// Note: the constant is in M USD (not B USD); the probe Q4-2025 E&O = -12375 M USD.
const fxIncidenceThresholdMnUSD = -1000.0

// fxIncidencePositiveThresholdMnUSD is the positive E&O threshold for CAPITAL_FLIGHT_SIGNAL.
// Symmetric counterpart: positive E&O > +1000 M USD signals unexplained inflows.
const fxIncidencePositiveThresholdMnUSD = 1000.0

// ComputeFXIncidence classifies the BOP FX-incidence signal from the E&O residual.
//
// Discriminator logic (DD-5, architect decision confirmed by PROBE-2 BPM6 sign):
//   - errorsOmissionsMnUSD < -1000 → FDI_BENIGN (large unexplained outflows: FDI-related)
//   - errorsOmissionsMnUSD > +1000 → CAPITAL_FLIGHT_SIGNAL (large unexplained inflows)
//   - otherwise                    → NEUTRAL (within measurement-noise band)
//
// The isKnown parameter must be true for the discriminator to produce a non-UNKNOWN label.
// When isKnown=false (empty/unparseable E&O field), returns FXIncidenceUnknown.
//
// is_estimate is always false for VMT-2 (E&O is a primary SBV field, PROBE-2 confirmed).
func ComputeFXIncidence(errorsOmissionsMnUSD float64, isKnown bool) FXIncidenceResult {
	if !isKnown {
		return FXIncidenceResult{
			Label:                FXIncidenceUnknown,
			ErrorsOmissionsMnUSD: 0,
			IsEstimate:           false,
		}
	}

	var label FXIncidenceLabel
	switch {
	case errorsOmissionsMnUSD < fxIncidenceThresholdMnUSD:
		label = FXIncidenceFDIBenign
	case errorsOmissionsMnUSD > fxIncidencePositiveThresholdMnUSD:
		label = FXIncidenceCapitalFlight
	default:
		label = FXIncidenceNeutral
	}

	return FXIncidenceResult{
		Label:                label,
		ErrorsOmissionsMnUSD: errorsOmissionsMnUSD,
		IsEstimate:           false,
	}
}

// ComputeOffshoreParked computes the offshore-parking heuristic estimate.
//
// Definition: offshore_parked ≈ ABS(E&O) when E&O < 0 AND overall_balance > 0.
// Rationale: a large negative E&O (unexplained outflows) co-existing with a positive
// overall balance suggests flows parked offshore before formal repatriation.
//
// ALWAYS returns is_estimate=true — this is a heuristic, never a primary measurement.
// Fail-closed: if preconditions not met → OffshoreParkedMnUSD = nil.
func ComputeOffshoreParked(errorsOmissionsMnUSD, overallBalanceMnUSD float64) OffshoreParkedEstimate {
	const note = "Heuristic: |E&O| when E&O<0 AND overall_balance>0 — offshore-parking estimate; " +
		"is_estimate=true always; never a primary measurement (BPM6 residual)"

	if errorsOmissionsMnUSD >= 0 || overallBalanceMnUSD <= 0 {
		// Preconditions not met — no estimate warranted.
		return OffshoreParkedEstimate{
			OffshoreParkedMnUSD: nil,
			IsEstimate:          true,
			Note:                note,
		}
	}

	parked := -errorsOmissionsMnUSD // ABS(E&O)
	return OffshoreParkedEstimate{
		OffshoreParkedMnUSD: &parked,
		IsEstimate:          true,
		Note:                note,
	}
}

// ParseVNNumber parses a Vietnamese-formatted number string to float64.
//
// Vietnamese number format: period = thousands separator, comma = decimal point.
// Examples (confirmed by PROBE-2 live Q4-2025 payload):
//   "7.654"   → 7654.0   (NOT 7.654 — see number_parse note in handoff)
//   "-12.375" → -12375.0
//   "9.135"   → 9135.0
//   "-2.287"  → -2287.0
//   "0"       → 0.0
//   ""        → 0.0, ok=false (empty string → omit/null per parse_rules)
//
// Returns (value, true) on success, (0, false) on empty string or parse error.
func ParseVNNumber(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}

	// Step 1: remove thousands separators (periods).
	s = strings.ReplaceAll(s, ".", "")
	// Step 2: replace decimal comma with standard decimal point.
	s = strings.ReplaceAll(s, ",", ".")

	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}
