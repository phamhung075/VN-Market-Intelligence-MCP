// Package domain — value objects for the technical-analysis service.
// Stubs only: fields will be populated in P1-B primitives bucket.
package domain

// CandleStick represents a single OHLCV candle from daily_ohlcv.
type CandleStick struct {
	Symbol    string
	Date      string
	Open      float64
	High      float64
	Low       float64
	Close     float64
	Volume    int64
}

// CrossSignal represents a detected crossover between two indicator lines.
// P1-B5g: populated by DetectCross (MACD line vs signal line).
type CrossSignal struct {
	Index     int    // bar index where the cross is confirmed
	Direction string // "bullish" or "bearish"
}

// TechnicalIndicators holds the computed output for a symbol.
type TechnicalIndicators struct {
	Symbol          string
	RSI             []float64
	MACDLine        []float64
	SignalLine       []float64
	Histogram       []float64
	BollingerUpper  []float64
	BollingerMiddle []float64
	BollingerLower  []float64
	SMA             []float64
	EMA             []float64
	CrossSignals    []CrossSignal // MACD line vs signal line crossovers (P1-B5g)
	// Fixed-period standard MAs — always computed independent of the request Period.
	MA5  []float64 // SMA(5)
	MA20 []float64 // SMA(20)
	MA50 []float64 // SMA(50)
}
