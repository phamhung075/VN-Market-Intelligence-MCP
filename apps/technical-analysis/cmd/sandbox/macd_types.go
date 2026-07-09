package main

import "encoding/json"

// ---------------------------------------------------------------------------
// MACD runner — scenario JSON shapes + closes resolution
// ---------------------------------------------------------------------------

type macdInput struct {
	Closes        []float64       `json:"closes"`
	ClosesCount   *int            `json:"closes_count"`
	ClosesPattern string          `json:"closes_pattern"`
	PricesPattern string          `json:"prices_pattern"` // alternate field name in bearish/bullish scenarios
	Fast          int             `json:"fast"`
	Slow          int             `json:"slow"`
	SignalPeriod  int             `json:"signalPeriod"`
	Cases         json.RawMessage `json:"cases"`
}

type macdFirstTriple struct {
	MACDLine   float64 `json:"macdLine"`
	SignalLine float64 `json:"signalLine"`
	Histogram  float64 `json:"histogram"`
	Tolerance  float64 `json:"tolerance"`
}

type macdLastTriple struct {
	Index      int     `json:"index"`
	MACDLine   float64 `json:"macdLine"`
	SignalLine float64 `json:"signalLine"`
	Histogram  float64 `json:"histogram"`
	Tolerance  float64 `json:"tolerance"`
}

type macdExpected struct {
	OutputLength *int             `json:"outputLength"`
	FirstTriple  *macdFirstTriple `json:"firstTriple"`
	LastTriple   *macdLastTriple  `json:"lastTriple"`
	CrossAtIndex *int             `json:"crossAtIndex"`
	Error        *string          `json:"error"`
	Tolerance    float64          `json:"tolerance"`
	// MACDLine / SignalLine / Histogram can be either a []float64 (flat-zero scenario)
	// or a string narrative (bearish/bullish cross scenario). Use RawMessage to detect.
	MACDLineRaw   json.RawMessage `json:"macdLine"`
	SignalLineRaw json.RawMessage `json:"signalLine"`
	HistogramRaw  json.RawMessage `json:"histogram"`
}

// resolveMACDCloses derives the closes slice for a MACD scenario: a direct
// array takes priority, then closes_count+pattern, then prices_pattern with
// the count inferred from the expected outputLength (bearish/bullish cross
// scenarios that omit closes_count).
func resolveMACDCloses(inp macdInput, exp macdExpected) []float64 {
	if inp.Closes != nil {
		return inp.Closes
	}
	if inp.ClosesCount != nil {
		pattern := inp.ClosesPattern
		if pattern == "" {
			pattern = inp.PricesPattern
		}
		return generateFromPattern(*inp.ClosesCount, pattern)
	}
	if inp.PricesPattern != "" {
		count := 60 // canonical count for all 60-bar MACD cross scenarios
		if exp.OutputLength != nil {
			// Reverse: outputLen = count - slow - signalPeriod + 2
			// count = outputLen + slow + signalPeriod - 2
			count = *exp.OutputLength + inp.Slow + inp.SignalPeriod - 2
		}
		return generateFromPattern(count, inp.PricesPattern)
	}
	return nil
}
