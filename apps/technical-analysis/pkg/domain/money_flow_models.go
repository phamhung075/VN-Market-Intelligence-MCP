// Package domain — value objects for MONEY-RADAR-P0-T1-OSCILLATORS.
//
// FIELD-CONSTRAINT C1 (money-radar brief §2, non-negotiable): daily_ohlcv exposes
// close+volume for this feature — never High/Low. Only the 4 Phase-0-shippable
// oscillators are implemented here: OBV, relative-volume z-score(20), up/down
// volume ratio, degraded close-only VWAP. MFI/CMF/A-D line/Chaikin Oscillator are
// FIELD-GATED (need H/L) — OUT OF SCOPE, do not add them to this file.
package domain

// MoneyFlowResult holds per-ticker Phase-0 money-flow oscillator values.
// HN-1 (honest-NULL): fields are nil — never a fabricated zero — when the
// underlying window has insufficient bars or is otherwise degenerate.
type MoneyFlowResult struct {
	Code string

	// OBV = cumulative sign(close_t - close_{t-1}) * volume_t over ALL available
	// bars (depth-independent, no window). Nil when <2 bars (BarsUsed < minBarsOBV).
	OBV *float64

	// RelVolZ20 = (vol_t - mean_20) / std_20 over the trailing 20-bar window
	// (including t). Nil when <21 bars, or when the window has zero variance
	// (constant volume — z-score undefined).
	RelVolZ20 *float64

	// UpDownVolRatio = sum(volume on up days) / sum(volume on down days) over the
	// trailing 20-bar window (21 bars needed: 20 + 1 prior close for direction).
	// Nil when <21 bars, or when the window has zero down-volume (division undefined).
	UpDownVolRatio *float64

	// DegradedVWAP = sum(close*volume) / sum(volume) over the trailing 20-bar
	// window. A close-only proxy — NOT a true typical-price VWAP (needs H/L, C1).
	// Nil when <21 bars, or when the window has zero total volume.
	DegradedVWAP *float64

	// IsProxy is always true — HN-5: degraded_vwap must never be presented as a
	// canonical VWAP.
	IsProxy bool

	// BarsUsed is the number of OHLCV bars actually available for this ticker.
	BarsUsed int

	// NullReason is set when OBV is unavailable ("insufficient_history", <2 bars)
	// or when only the windowed metrics are unavailable ("insufficient_window",
	// >=2 but <21 bars). Nil when at least OBV and the windowed metrics computed
	// (individual windowed fields may still be nil on their own degenerate case,
	// e.g. zero down-volume — see field comments above).
	NullReason *string
}

// MoneyFlowCrossSection is the full domain result for get_money_flow_oscillators.
type MoneyFlowCrossSection struct {
	Tickers []MoneyFlowResult
}
