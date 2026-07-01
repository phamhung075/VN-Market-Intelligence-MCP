// Package application — DTOs for the ComputeMoneyFlow use case.
// MONEY-RADAR-P0-T1-OSCILLATORS: request/response shapes for POST /ta/money-flow-oscillators.
package application

// MoneyFlowRequest is the inbound payload for POST /ta/money-flow-oscillators.
// All fields are optional — production callers leave empty to use the watchlist
// (system-map.json .project.watchlist, resolved at composition-root startup).
type MoneyFlowRequest struct {
	// Tickers overrides the watchlist when provided.
	Tickers []string `json:"tickers,omitempty"`
}

// MoneyFlowPerTickerDTO holds the 4 Phase-0 money-flow oscillator values for one
// ticker. FIELD-CONSTRAINT C1: close+volume only — no MFI/CMF/A-D-line/Chaikin
// fields exist here by design (they need High/Low, out of scope).
type MoneyFlowPerTickerDTO struct {
	Code string `json:"code"`

	// OBV: cumulative sign(close_t-close_{t-1})*volume_t over all available bars.
	// Null when <2 bars.
	OBV *float64 `json:"obv"`

	// RelVolZ20: (vol_t-mean_20)/std_20 over the trailing 20-bar window.
	// Null when <21 bars or the window has zero volume variance.
	RelVolZ20 *float64 `json:"rel_vol_z_20"`

	// UpDownVolRatio: sum(vol up days)/sum(vol down days) over the trailing 20-bar
	// window. Null when <21 bars or zero down-volume in the window.
	UpDownVolRatio *float64 `json:"up_down_vol_ratio"`

	// DegradedVWAP: sum(close*vol)/sum(vol) over the trailing 20-bar window — a
	// close-only proxy (no true typical price without High/Low, C1).
	// Null when <21 bars or zero total volume in the window.
	DegradedVWAP *float64 `json:"degraded_vwap"`

	// IsProxy is always true (HN-5) — degraded_vwap MUST never be presented as a
	// canonical VWAP.
	IsProxy bool `json:"is_proxy"`

	// BarsUsed is the number of OHLCV bars actually available for this ticker.
	BarsUsed int `json:"bars_used"`

	// NullReason: "insufficient_history" (<2 bars, everything null) |
	// "insufficient_window" (>=2 but <21 bars, OBV real / windowed fields null).
	NullReason *string `json:"null_reason,omitempty"`
}

// MoneyFlowResponse is the outbound payload for POST /ta/money-flow-oscillators.
type MoneyFlowResponse struct {
	Tickers []MoneyFlowPerTickerDTO `json:"tickers"`
}
