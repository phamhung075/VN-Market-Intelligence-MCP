// Package domain — tests for domain services (AC-6, AC-7, AC-8).
// R5 mitigation: test stubs committed before implementation.
// Fixtures ported byte-identical from TS alert-engine.test.ts.
package domain

import (
	"strings"
	"testing"
	"time"
)

// ── computeFingerprint tests (AC-6) ──────────────────────────────────────────

func TestComputeFingerprint_Deterministic(t *testing.T) {
	fp1 := ComputeFingerprint("VCB", []string{"price_surge"}, "test")
	fp2 := ComputeFingerprint("VCB", []string{"price_surge"}, "test")
	if fp1 != fp2 {
		t.Errorf("expected deterministic: %s != %s", fp1, fp2)
	}
	if len(fp1) != 8 {
		t.Errorf("expected 8-char hex, got %q (len=%d)", fp1, len(fp1))
	}
	for _, ch := range fp1 {
		if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f')) {
			t.Errorf("expected lowercase hex, got char %q in %q", ch, fp1)
		}
	}
}

func TestComputeFingerprint_OrderIndependent(t *testing.T) {
	fp1 := ComputeFingerprint("VCB", []string{"a", "b"}, "x")
	fp2 := ComputeFingerprint("VCB", []string{"b", "a"}, "x")
	if fp1 != fp2 {
		t.Errorf("expected order-independent: %s != %s", fp1, fp2)
	}
}

func TestComputeFingerprint_DifferentStocks(t *testing.T) {
	fp1 := ComputeFingerprint("VCB", []string{}, "test")
	fp2 := ComputeFingerprint("TCB", []string{}, "test")
	if fp1 == fp2 {
		t.Errorf("expected different fingerprints for different stocks, got same: %s", fp1)
	}
}

// ── shouldSuppressAlert tests (AC-7) ─────────────────────────────────────────

func makeStoredAlert(t *testing.T, stocks, signalTypes string, minsAgo int) StoredAlert {
	t.Helper()
	triggeredAt := time.Now().Add(-time.Duration(minsAgo) * time.Minute).UTC().Format("2006-01-02T15:04:05.999Z07:00")
	return StoredAlert{
		ID:          1,
		Stocks:      stocks,
		SignalTypes: signalTypes,
		Message:     "test",
		Fingerprint: "abc123",
		Severity:    SeverityMedium,
		TriggeredAt: triggeredAt,
	}
}

func TestShouldSuppressAlert_NoSuppressFirstAlert(t *testing.T) {
	result := ShouldSuppressAlert(
		AlertRequest{Stock: "VCB", Severity: SeverityHigh, Message: "test"},
		[]StoredAlert{},
		DefaultCooldownConfig,
	)
	if result.Suppress {
		t.Errorf("expected no suppress for first alert, got suppress=true reason=%q", result.Reason)
	}
}

func TestShouldSuppressAlert_SuppressWithinCooldown(t *testing.T) {
	recent := makeStoredAlert(t, "VCB", "price_surge", 10) // 10min ago
	result := ShouldSuppressAlert(
		AlertRequest{Stock: "VCB", Severity: SeverityMedium, Message: "test", SignalTypes: []string{"price_surge"}},
		[]StoredAlert{recent},
		CooldownConfig{CooldownMinutes: 30, MaxAlertsPerStockPerDay: 3},
	)
	if !result.Suppress {
		t.Errorf("expected suppress=true for same signal within cooldown")
	}
	if result.Reason == "" || len(result.Reason) < 4 {
		t.Errorf("expected reason to contain 'cooldown', got %q", result.Reason)
	}
	// verify reason contains "cooldown"
	if !strings.Contains(result.Reason, "cooldown") {
		t.Errorf("reason should contain 'cooldown', got %q", result.Reason)
	}
}

func TestShouldSuppressAlert_NoCriticalNonMacro(t *testing.T) {
	recent := makeStoredAlert(t, "VCB", "stop_loss", 5)
	result := ShouldSuppressAlert(
		AlertRequest{Stock: "VCB", Severity: SeverityCritical, Message: "stop loss hit", SignalTypes: []string{"stop_loss"}},
		[]StoredAlert{recent},
		DefaultCooldownConfig,
	)
	if result.Suppress {
		t.Errorf("expected no suppress for critical non-MACRO, got suppress=true")
	}
}

func TestShouldSuppressAlert_SuppressCriticalMacro(t *testing.T) {
	recent := makeStoredAlert(t, "VCB", "MACRO", 5) // 5min ago
	result := ShouldSuppressAlert(
		AlertRequest{Stock: "VCB", Severity: SeverityCritical, Message: "macro alert", SignalTypes: []string{"MACRO"}, ActionCode: "MACRO"},
		[]StoredAlert{recent},
		CooldownConfig{CooldownMinutes: 30, MaxAlertsPerStockPerDay: 5},
	)
	if !result.Suppress {
		t.Errorf("expected suppress=true for critical MACRO")
	}
}

func TestShouldSuppressAlert_DailyCap(t *testing.T) {
	// 3 alerts fired today (within 1min of each other so Rule1 doesn't fire on "other_signal")
	alerts := []StoredAlert{
		makeStoredAlert(t, "VCB", "other_signal", 0),
		makeStoredAlert(t, "VCB", "other_signal", 1),
		makeStoredAlert(t, "VCB", "other_signal", 2),
	}
	result := ShouldSuppressAlert(
		AlertRequest{Stock: "VCB", Severity: SeverityMedium, Message: "test", SignalTypes: []string{"new_signal"}},
		alerts,
		CooldownConfig{CooldownMinutes: 5, MaxAlertsPerStockPerDay: 3},
	)
	if !result.Suppress {
		t.Errorf("expected suppress=true when daily cap reached")
	}
	if !strings.Contains(result.Reason, "daily cap") {
		t.Errorf("reason should contain 'daily cap', got %q", result.Reason)
	}
}

// ── isDuplicate tests (AC-8) ─────────────────────────────────────────────────

func TestIsDuplicate_FalseEmpty(t *testing.T) {
	if IsDuplicate("abc123", []string{}) {
		t.Error("expected false for empty list")
	}
}

func TestIsDuplicate_TrueWhenPresent(t *testing.T) {
	if !IsDuplicate("abc123", []string{"xyz", "abc123", "def"}) {
		t.Error("expected true when fingerprint is in list")
	}
}
