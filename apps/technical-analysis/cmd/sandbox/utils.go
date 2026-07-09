package main

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

func errStr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func safeIdx(s []float64, i int) float64 {
	if len(s) == 0 {
		return 0
	}
	if i < 0 {
		i = len(s) + i
	}
	if i < 0 || i >= len(s) {
		return 0
	}
	return s[i]
}
