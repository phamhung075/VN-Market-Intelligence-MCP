package dedupkeybuilder_test

import (
	"testing"

	dkb "github.com/vn-market-intelligence/alert-engine/pkg/primitive/dedup-key-builder"
)

// TestBuildKey_Golden — known input with pre-computed expected fingerprint.
func TestBuildKey_Golden(t *testing.T) {
	got := dkb.BuildKey("VCB", []string{"MACD_CROSS", "BB_BREAK"}, "Stop-loss triggered at 85,000")
	const want = "4c79b07f"
	if got != want {
		t.Errorf("BuildKey golden = %q, want %q", got, want)
	}
}

// TestBuildKey_SortStability — signals in different order must yield the same
// fingerprint as the sorted order.
func TestBuildKey_SortStability(t *testing.T) {
	ascending := dkb.BuildKey("VCB", []string{"BB_BREAK", "MACD_CROSS"}, "Stop-loss triggered at 85,000")
	descending := dkb.BuildKey("VCB", []string{"MACD_CROSS", "BB_BREAK"}, "Stop-loss triggered at 85,000")
	if ascending != descending {
		t.Errorf("BuildKey not order-stable: %q != %q", ascending, descending)
	}
	const want = "4c79b07f"
	if ascending != want {
		t.Errorf("BuildKey sort-stability = %q, want %q", ascending, want)
	}
}

// TestBuildKey_EmptySignals — empty signalTypes array yields a known fingerprint.
func TestBuildKey_EmptySignals(t *testing.T) {
	got := dkb.BuildKey("FPT", []string{}, "hello")
	const want = "a4b7e605"
	if got != want {
		t.Errorf("BuildKey empty-signals = %q, want %q", got, want)
	}
	// nil signals must equal empty-slice signals (defensive determinism).
	gotNil := dkb.BuildKey("FPT", nil, "hello")
	if gotNil != got {
		t.Errorf("BuildKey nil signals = %q, want %q (must equal empty slice)", gotNil, got)
	}
}

// TestBuildKey_EmptyMessage — empty message string yields a known fingerprint.
func TestBuildKey_EmptyMessage(t *testing.T) {
	got := dkb.BuildKey("FPT", []string{"RSI"}, "")
	const want = "9b78e7af"
	if got != want {
		t.Errorf("BuildKey empty-message = %q, want %q", got, want)
	}
}

// TestBuildKey_LongMessageTruncation — a message >50 runes must produce the same
// fingerprint as its 50-rune prefix.
func TestBuildKey_LongMessageTruncation(t *testing.T) {
	long := "0123456789012345678901234567890123456789012345678901234567890123456789" // 70 runes
	trunc := "01234567890123456789012345678901234567890123456789"                    // 50 runes
	gotLong := dkb.BuildKey("SSI", []string{"RSI"}, long)
	gotTrunc := dkb.BuildKey("SSI", []string{"RSI"}, trunc)
	if gotLong != gotTrunc {
		t.Errorf("BuildKey not truncating to 50 runes: long=%q trunc=%q", gotLong, gotTrunc)
	}
	const want = "2baadea5"
	if gotLong != want {
		t.Errorf("BuildKey long-message = %q, want %q", gotLong, want)
	}
}

// TestBuildKey_Edge — empty signals + empty message edge case (matches scenario).
func TestBuildKey_Edge(t *testing.T) {
	got := dkb.BuildKey("HPG", []string{}, "")
	const want = "0d4096ba"
	if got != want {
		t.Errorf("BuildKey edge = %q, want %q", got, want)
	}
}

// TestBuildKey_Determinism — identical inputs always yield identical output.
func TestBuildKey_Determinism(t *testing.T) {
	for i := 0; i < 100; i++ {
		got := dkb.BuildKey("VCB", []string{"MACD_CROSS", "BB_BREAK"}, "Stop-loss triggered at 85,000")
		if got != "4c79b07f" {
			t.Fatalf("BuildKey non-deterministic on iteration %d: %q", i, got)
		}
	}
}
