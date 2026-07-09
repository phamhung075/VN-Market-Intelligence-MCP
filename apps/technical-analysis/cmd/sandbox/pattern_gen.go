package main

import "strings"

// ---------------------------------------------------------------------------
// generateFromPattern
// ---------------------------------------------------------------------------

// generateFromPattern handles the MACD golden scenario pattern string:
// "flat[0..29]=100.0; ramp[30..59]=100.0+(i-29)*2.0"
// and the MACD bullish cross pattern:
// "flat[0..29]=100; decline[30..44]=100-2*(i-29); rally[45..59]=prev+5"
func generateFromPattern(count int, pattern string) []float64 {
	closes := make([]float64, count)
	// Detect pattern type by keywords.
	if strings.Contains(pattern, "decline") && strings.Contains(pattern, "rally") {
		// Bullish cross pattern: flat 100 for 30, decline 2/bar for 15, rally +5/bar for 15.
		for i := 0; i < count && i < 30; i++ {
			closes[i] = 100.0
		}
		for i := 30; i < count && i < 45; i++ {
			closes[i] = 100.0 - 2.0*float64(i-29)
		}
		// rally starts from last decline value.
		for i := 45; i < count; i++ {
			closes[i] = closes[i-1] + 5.0
		}
		return closes
	}
	if strings.Contains(pattern, "rise") && strings.Contains(pattern, "decline") {
		// Bearish cross pattern: flat 100 for 30, rise 2/bar for 15, decline -5/bar for 15.
		for i := 0; i < count && i < 30; i++ {
			closes[i] = 100.0
		}
		for i := 30; i < count && i < 45; i++ {
			closes[i] = 100.0 + 2.0*float64(i-29)
		}
		for i := 45; i < count; i++ {
			closes[i] = closes[i-1] - 5.0
		}
		return closes
	}
	if strings.Contains(pattern, "ramp") && strings.Contains(pattern, "flat") {
		// MACD golden: flat[0..29]=100.0, ramp[30..59]=100.0+(i-29)*2.0
		for i := 0; i < count && i < 30; i++ {
			closes[i] = 100.0
		}
		for i := 30; i < count; i++ {
			closes[i] = 100.0 + float64(i-29)*2.0
		}
		return closes
	}
	// RSI-MACD module scenario: 20-bar decline then 30-bar rally.
	if strings.Contains(pattern, "decline") {
		// 20-bar decline (50.0 down to 34.2, step -0.8) then 30-bar rally (step +0.9).
		// Total = 50 candles.
		for i := 0; i < count && i < 20; i++ {
			closes[i] = 50.0 - float64(i)*0.8
		}
		for i := 20; i < count; i++ {
			closes[i] = closes[i-1] + 0.9
		}
		return closes
	}
	// Fallback: flat 100.
	for i := range closes {
		closes[i] = 100.0
	}
	return closes
}
