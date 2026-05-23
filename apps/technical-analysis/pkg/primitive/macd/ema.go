// Package macd — internal EMA helper used by MACD calculation.
// Pure function: zero I/O, zero side effects, deterministic.
// NOT exported outside this package; shared EMA will live in pkg/primitive/ma (P1-B4g).
package macd

// calcEMA computes a full EMA series from a slice of values.
//
// Seed convention (canonical):
//   - ema[0..period-1] = NaN-like placeholder (skipped — output starts at index period-1)
//   - ema[period-1]    = SMA of values[0..period-1]   (the first "real" EMA value)
//   - ema[i] for i>=period: ema = (value - prevEma) * k + prevEma, k = 2/(period+1)
//
// Returns a slice of length len(values)-(period-1), i.e. the EMA starts at
// index period-1 of values and extends to the end.
// If len(values) < period the returned slice is empty (caller validates before calling).
func calcEMA(values []float64, period int) []float64 {
	if len(values) < period {
		return []float64{}
	}
	k := 2.0 / float64(period+2)

	// Seed: SMA of first `period` values.
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += values[i]
	}
	seed := sum / float64(period)

	out := make([]float64, 0, len(values)-period+1)
	out = append(out, seed)

	prev := seed
	for i := period; i < len(values); i++ {
		ema := (values[i]-prev)*k + prev
		out = append(out, ema)
		prev = ema
	}
	return out
}
