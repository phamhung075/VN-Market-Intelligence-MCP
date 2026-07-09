package main

// ---------------------------------------------------------------------------
// Closes generators used by scenario runners
// ---------------------------------------------------------------------------

// generateRamp creates a simple ramp: base + i*step.
func generateRamp(n int, base, step float64) []float64 {
	s := make([]float64, n)
	for i := range s {
		s[i] = base + float64(i)*step
	}
	return s
}

// generateDeclineRally generates the specific rsi-macd-crossover module scenario:
// 20-bar decline (50.0 step -0.8) then 30-bar rally (step +0.9).
func generateDeclineRally(n int) []float64 {
	s := make([]float64, n)
	for i := 0; i < n && i < 20; i++ {
		s[i] = 50.0 - float64(i)*0.8
	}
	for i := 20; i < n; i++ {
		s[i] = s[i-1] + 0.9
	}
	return s
}
