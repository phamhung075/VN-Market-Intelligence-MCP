// Package module composes all 5 primitives into a single Compute call.
// Owns non-fatal policy: one primitive failing does not abort the others.
// P1-C1g: module composition (RSI, MACD, BB, MA, DetectCross).
package module

import (
	bb "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/bollinger_bands"
	dc "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/detect_cross"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/macd"
	ma "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/moving_average"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/rsi"
)

// ComputeParams bundles all configuration knobs for Compute.
// Zero-valued fields fall back to defaults inside Compute.
type ComputeParams struct {
	RSIPeriod    int     // default 14
	MACDFast     int     // default 12
	MACDSlow     int     // default 26
	MACDSignal   int     // default 9
	BBPeriod     int     // default 20
	BBMultiplier float64 // default 2.0  (0 = use default; negative = error)
	MAPeriod     int     // default 14
	MAType       string  // "SMA" or "EMA", default "SMA"
}

// Result bundles all outputs. Any field is nil/empty when the corresponding
// primitive errors (e.g. insufficient data) — non-fatal by design.
type Result struct {
	RSI          []float64
	MACDLine     []float64
	SignalLine    []float64
	Histogram    []float64
	BBUpper      []float64
	BBMiddle     []float64
	BBLower      []float64
	SMA          []float64
	EMA          []float64
	CrossSignals []dc.CrossEvent // MACD line vs signal line crossovers
}

func defaults(p ComputeParams) ComputeParams {
	if p.RSIPeriod <= 0 {
		p.RSIPeriod = 14
	}
	if p.MACDFast <= 0 {
		p.MACDFast = 12
	}
	if p.MACDSlow <= 0 {
		p.MACDSlow = 26
	}
	if p.MACDSignal <= 0 {
		p.MACDSignal = 9
	}
	if p.BBPeriod <= 0 {
		p.BBPeriod = 20
	}
	if p.BBMultiplier == 0 {
		p.BBMultiplier = 2.0
	}
	if p.MAPeriod <= 0 {
		p.MAPeriod = 14
	}
	if p.MAType == "" {
		p.MAType = "SMA"
	}
	return p
}

// Compute runs all 5 primitives over closes with the supplied params.
// Returns error only for structurally invalid params (RSIPeriod < 2,
// BBMultiplier <= 0, unknown MAType). Data errors are non-fatal.
func Compute(closes []float64, p ComputeParams) (Result, error) {
	p = defaults(p)

	// Validate params that are always wrong regardless of data length.
	if p.RSIPeriod < 2 {
		return Result{}, rsi.ErrInvalidPeriod
	}
	if p.BBMultiplier <= 0 {
		return Result{}, bb.ErrInvalidMultiplier
	}
	if p.MAType != "SMA" && p.MAType != "EMA" {
		return Result{}, ma.ErrUnknownMAType
	}

	var res Result
	// Each block is non-fatal: error means insufficient data, fields stay nil.
	if rsiVals, err := rsi.Calculate(closes, p.RSIPeriod); err == nil {
		res.RSI = rsiVals
	}
	if macdRes, err := macd.Calculate(closes, p.MACDFast, p.MACDSlow, p.MACDSignal); err == nil {
		res.MACDLine = macdRes.MACDLine
		res.SignalLine = macdRes.SignalLine
		res.Histogram = macdRes.Histogram
	}
	if bbRes, err := bb.Calculate(closes, p.BBPeriod, p.BBMultiplier); err == nil {
		res.BBUpper = bbRes.Upper
		res.BBMiddle = bbRes.Middle
		res.BBLower = bbRes.Lower
	}
	if smaVals, err := ma.CalculateSMA(closes, p.MAPeriod); err == nil {
		res.SMA = smaVals
	}
	if emaVals, err := ma.CalculateEMA(closes, p.MAPeriod); err == nil {
		res.EMA = emaVals
	}

	// DetectCross: MACD line vs signal line. Non-nil empty slice when no cross found.
	if len(res.MACDLine) >= 2 && len(res.SignalLine) >= 2 {
		if events, err := dc.DetectCross(res.MACDLine, res.SignalLine); err == nil {
			if events == nil {
				events = []dc.CrossEvent{}
			}
			res.CrossSignals = events
		}
	}

	return res, nil
}
