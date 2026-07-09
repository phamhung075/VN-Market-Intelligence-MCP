package main

import "encoding/json"

// ---------------------------------------------------------------------------
// Service tier — scenario JSON shapes
// ---------------------------------------------------------------------------

// serviceScenario is the JSON shape for service-tier scenarios.
type serviceScenario struct {
	Service  string          `json:"service"`
	Category string          `json:"category"`
	Input    serviceInput    `json:"input"`
	Expected serviceExpected `json:"expectedOutput"`
}

type serviceInput struct {
	Method string          `json:"method"`
	Path   string          `json:"path"`
	Body   json.RawMessage `json:"body"` // may be null (GET) or an object (POST)
}

type serviceExpected struct {
	StatusCode        int   `json:"statusCode"`
	RSIPopulated      *bool `json:"rsi_populated"`
	RSILengthMin      *int  `json:"rsi_length_min"`
	MACDLinePopulated *bool `json:"macdLine_populated"`
	BBUpperPopulated  *bool `json:"bollingerUpper_populated"`
	SMAPopulated      *bool `json:"sma_populated"`
	EMAPopulated      *bool `json:"ema_populated"`
	ErrorPresent      *bool `json:"error_present"`
	// health-ok body assertion
	Body map[string]interface{} `json:"body"`
	// P0-1 volatility assertions
	RV10dPctNull        *bool `json:"rv_10d_pct_null"`
	RV20dPctNull        *bool `json:"rv_20d_pct_null"`
	RV60dPctNull        *bool `json:"rv_60d_pct_null"`
	RV20dPercentileNull *bool `json:"rv_20d_percentile_null"`
	Drawdown252dPctNull *bool `json:"drawdown_252d_pct_null"`
	VolRegimePresent    *bool `json:"vol_regime_present"`
	GKVolNull           *bool `json:"gk_vol_20d_pct_null"`
}

// serviceInputBody is the decoded POST body shape.
type serviceInputBody struct {
	Closes        []float64 `json:"closes"`
	ClosesCount   *int      `json:"closes_count"`
	ClosesPattern string    `json:"closes_pattern"`
	Period        int       `json:"period"`
	Symbol        string    `json:"symbol"`
}
