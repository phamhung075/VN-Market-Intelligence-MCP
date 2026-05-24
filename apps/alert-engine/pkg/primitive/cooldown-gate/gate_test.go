package cooldowngate_test

import (
	"testing"
	"time"

	cg "github.com/vn-market-intelligence/alert-engine/pkg/primitive/cooldown-gate"
)

// mustTime parses an RFC3339 string or fails the test.
func mustTime(t *testing.T, s string) time.Time {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse time %q: %v", s, err)
	}
	return ts
}

var defaultCfg = cg.CooldownConfig{CooldownMinutes: 30, MaxAlertsPerStockPerDay: 3}

// AC-2 case 1: Empty recentAlerts → suppress=false.
func TestCheck_EmptyRecent(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "high", SignalTypes: []string{"MACD_CROSS"}, ActionCode: "TA"},
		nil, defaultCfg, now,
	)
	if got.Suppress {
		t.Errorf("empty recent: Suppress=%v want false (reason=%q)", got.Suppress, got.Reason)
	}
}

// AC-2 case 2: Same stock, overlapping signal, within cooldown window → suppress=true (Rule 1).
func TestCheck_CooldownWindowFires(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "medium", SignalTypes: []string{"MACD_CROSS"}, ActionCode: "TA"},
		[]cg.RecentAlert{{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T09:45:00Z"}},
		defaultCfg, now,
	)
	if !got.Suppress {
		t.Fatalf("cooldown window: Suppress=%v want true", got.Suppress)
	}
	const wantReason = "cooldown: same signal within 30min"
	if got.Reason != wantReason {
		t.Errorf("cooldown reason = %q, want %q", got.Reason, wantReason)
	}
}

// AC-2 case 3: Same stock, non-overlapping signal, within cooldown window → suppress=false.
func TestCheck_NonOverlappingSignal(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "medium", SignalTypes: []string{"RSI_OVERSOLD"}, ActionCode: "TA"},
		[]cg.RecentAlert{{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T09:45:00Z"}},
		defaultCfg, now,
	)
	if got.Suppress {
		t.Errorf("non-overlapping signal: Suppress=%v want false (reason=%q)", got.Suppress, got.Reason)
	}
}

// AC-2 case 4: Same stock, daily cap exhausted (3/3 alerts today) → suppress=true (Rule 2).
// Recent alerts are placed OUTSIDE the cooldown window so only the daily-cap rule can fire.
func TestCheck_DailyCapExhausted(t *testing.T) {
	now := mustTime(t, "2026-05-24T23:00:00Z")
	recent := []cg.RecentAlert{
		{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T08:00:00Z"},
		{Stocks: "VCB", SignalTypes: "BB_BREAK", TriggeredAt: "2026-05-24T10:00:00Z"},
		{Stocks: "VCB", SignalTypes: "RSI_OVERSOLD", TriggeredAt: "2026-05-24T12:00:00Z"},
	}
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "medium", SignalTypes: []string{"VOLUME_SPIKE"}, ActionCode: "TA"},
		recent, defaultCfg, now,
	)
	if !got.Suppress {
		t.Fatalf("daily cap: Suppress=%v want true", got.Suppress)
	}
	const wantReason = "daily cap: 3/3 alerts for VCB"
	if got.Reason != wantReason {
		t.Errorf("daily cap reason = %q, want %q", got.Reason, wantReason)
	}
}

// AC-2 case 5: severity="critical", actionCode="TA" → suppress=false (bypass).
func TestCheck_CriticalBypass(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "critical", SignalTypes: []string{"MACD_CROSS"}, ActionCode: "TA"},
		[]cg.RecentAlert{{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T09:55:00Z"}},
		defaultCfg, now,
	)
	if got.Suppress {
		t.Fatalf("critical bypass: Suppress=%v want false", got.Suppress)
	}
	const wantReason = "critical severity bypasses cooldown"
	if got.Reason != wantReason {
		t.Errorf("critical bypass reason = %q, want %q", got.Reason, wantReason)
	}
}

// AC-2 case 6: severity="critical", actionCode="MACRO" → normal cooldown rules apply.
func TestCheck_CriticalMacroNoBypass(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "critical", SignalTypes: []string{"MACD_CROSS"}, ActionCode: "MACRO"},
		[]cg.RecentAlert{{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T09:55:00Z"}},
		defaultCfg, now,
	)
	if !got.Suppress {
		t.Fatalf("critical MACRO: Suppress=%v want true (bypass must NOT fire)", got.Suppress)
	}
	const wantReason = "cooldown: same signal within 30min"
	if got.Reason != wantReason {
		t.Errorf("critical MACRO reason = %q, want %q", got.Reason, wantReason)
	}
}

// AC-2 case 7: Recent alert outside cooldown window → suppress=false (window expired).
func TestCheck_OutsideCooldownWindow(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	// Recent fire at 09:00 → 60 min ago, beyond the 30-min window.
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "medium", SignalTypes: []string{"MACD_CROSS"}, ActionCode: "TA"},
		[]cg.RecentAlert{{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T09:00:00Z"}},
		defaultCfg, now,
	)
	if got.Suppress {
		t.Errorf("expired window: Suppress=%v want false (reason=%q)", got.Suppress, got.Reason)
	}
}

// Extra: different stock never suppresses (isolation across tickers).
func TestCheck_DifferentStock(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	got := cg.Check(
		cg.AlertInput{Stock: "FPT", Severity: "medium", SignalTypes: []string{"MACD_CROSS"}, ActionCode: "TA"},
		[]cg.RecentAlert{{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T09:55:00Z"}},
		defaultCfg, now,
	)
	if got.Suppress {
		t.Errorf("different stock: Suppress=%v want false", got.Suppress)
	}
}

// Extra: daily cap counts only alerts on the same calendar day as `now`.
// Alerts from a prior day must not count toward today's cap.
func TestCheck_DailyCapIgnoresPriorDay(t *testing.T) {
	now := mustTime(t, "2026-05-24T23:00:00Z")
	recent := []cg.RecentAlert{
		{Stocks: "VCB", SignalTypes: "A", TriggeredAt: "2026-05-23T08:00:00Z"},
		{Stocks: "VCB", SignalTypes: "B", TriggeredAt: "2026-05-23T10:00:00Z"},
		{Stocks: "VCB", SignalTypes: "C", TriggeredAt: "2026-05-24T12:00:00Z"},
	}
	got := cg.Check(
		cg.AlertInput{Stock: "VCB", Severity: "low", SignalTypes: []string{"D"}, ActionCode: "TA"},
		recent, defaultCfg, now,
	)
	if got.Suppress {
		t.Errorf("prior-day count: Suppress=%v want false (only 1 today, cap 3)", got.Suppress)
	}
}

// Determinism: identical inputs always yield identical output across iterations.
func TestCheck_Determinism(t *testing.T) {
	now := mustTime(t, "2026-05-24T10:00:00Z")
	alert := cg.AlertInput{Stock: "VCB", Severity: "medium", SignalTypes: []string{"MACD_CROSS"}, ActionCode: "TA"}
	recent := []cg.RecentAlert{{Stocks: "VCB", SignalTypes: "MACD_CROSS", TriggeredAt: "2026-05-24T09:45:00Z"}}
	first := cg.Check(alert, recent, defaultCfg, now)
	for i := 0; i < 100; i++ {
		got := cg.Check(alert, recent, defaultCfg, now)
		if got != first {
			t.Fatalf("non-deterministic on iteration %d: %+v != %+v", i, got, first)
		}
	}
}
