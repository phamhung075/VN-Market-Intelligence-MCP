package main

import "encoding/json"

// ---------------------------------------------------------------------------
// Module runner — scenario JSON shapes
// ---------------------------------------------------------------------------

type moduleInput struct {
	ClosesLength int             `json:"closes_length"`
	Description  string          `json:"description"`
	Params       json.RawMessage `json:"params"`
}

type moduleParams struct {
	RSIPeriod  int     `json:"RSIPeriod"`
	MACDFast   int     `json:"MACDFast"`
	MACDSlow   int     `json:"MACDSlow"`
	MACDSignal int     `json:"MACDSignal"`
	BBPeriod   int     `json:"BBPeriod"`
	BBMult     float64 `json:"BBMultiplier"`
	MAPeriod   int     `json:"MAPeriod"`
	MAType     string  `json:"MAType"`
}

type moduleExpected struct {
	RSIPopulated      *bool     `json:"RSI_populated"`
	RSILength         *int      `json:"RSI_length"`
	RSIFirst          *float64  `json:"RSI_first"`
	RSILastApprox     *float64  `json:"RSI_last_approx"`
	RSILastTolerance  *float64  `json:"RSI_last_tolerance"`
	RSIRange          []float64 `json:"RSI_range"`
	MACDLinePopulated *bool     `json:"MACDLine_populated"`
	MACDLineLength    *int      `json:"MACDLine_length"`
	MACDLineLastPos   *bool     `json:"MACDLine_last_positive"`
	SignalPopulated   *bool     `json:"SignalLine_populated"`
	HistPopulated     *bool     `json:"Histogram_populated"`
	EMAPopulated      *bool     `json:"EMA_populated"`
	CrossNonNil       *bool     `json:"CrossSignals_non_nil"`
	Error             *string   `json:"error"`

	// edge scenario nils
	RSINil      *bool `json:"RSI_nil"`
	MACDNil     *bool `json:"MACDLine_nil"`
	SignalNil   *bool `json:"SignalLine_nil"`
	HistNil     *bool `json:"Histogram_nil"`
	BBUpperNil  *bool `json:"BBUpper_nil"`
	BBMiddleNil *bool `json:"BBMiddle_nil"`
	BBLowerNil  *bool `json:"BBLower_nil"`
	SMANil      *bool `json:"SMA_nil"`
	EMANil      *bool `json:"EMA_nil"`
	CrossNil    *bool `json:"CrossSignals_nil"`
}
