// Package application — tests for EvaluateAlertUseCase (AC-9).
// R5 mitigation: fixtures ported byte-identical from TS alert-engine.test.ts.
package application

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
	dkb "github.com/vn-market-intelligence/alert-engine/pkg/primitive/dedup-key-builder"
)

// ── fake port implementations ─────────────────────────────────────────────────

type fakeAlertRepo struct {
	getRecentAlertsFunc         func(stock string, withinMinutes int) ([]domain.StoredAlert, error)
	countTodayAlertsFunc        func(stock string) (int, error)
	storeAlertFunc              func(alert domain.StoredAlert) (int64, error)
	hasDuplicateFingerprintFunc func(fingerprint string, withinMinutes int) (bool, error)
}

func (r *fakeAlertRepo) GetRecentAlerts(stock string, withinMinutes int) ([]domain.StoredAlert, error) {
	if r.getRecentAlertsFunc != nil {
		return r.getRecentAlertsFunc(stock, withinMinutes)
	}
	return nil, nil
}

func (r *fakeAlertRepo) CountTodayAlerts(stock string) (int, error) {
	if r.countTodayAlertsFunc != nil {
		return r.countTodayAlertsFunc(stock)
	}
	return 0, nil
}

func (r *fakeAlertRepo) StoreAlert(alert domain.StoredAlert) (int64, error) {
	if r.storeAlertFunc != nil {
		return r.storeAlertFunc(alert)
	}
	return 1, nil
}

func (r *fakeAlertRepo) HasDuplicateFingerprint(fingerprint string, withinMinutes int) (bool, error) {
	if r.hasDuplicateFingerprintFunc != nil {
		return r.hasDuplicateFingerprintFunc(fingerprint, withinMinutes)
	}
	return false, nil
}

type fakeMutePort struct {
	muted bool
}

func (m *fakeMutePort) IsStockMuted(_ string) (bool, error) {
	return m.muted, nil
}

type fakeTelegram struct {
	sentCount int
}

func (tg *fakeTelegram) Send(_ context.Context, _ domain.TelegramChannel, _ string) (bool, error) {
	tg.sentCount++
	return true, nil
}

// ── tests (AC-9) ─────────────────────────────────────────────────────────────

func TestEvaluateUseCase_FiresAndStoresAlert(t *testing.T) {
	storeCallCount := 0
	repo := &fakeAlertRepo{
		storeAlertFunc: func(alert domain.StoredAlert) (int64, error) {
			storeCallCount++
			return 1, nil
		},
	}
	tg := &fakeTelegram{}
	uc := NewEvaluateAlertUseCase(repo, &fakeMutePort{muted: false}, tg)

	result, err := uc.Execute(context.Background(), EvaluateAlertRequest{
		Stock:        "VCB",
		Severity:     "high",
		Message:      "Price surge detected",
		SendTelegram: true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Fired {
		t.Error("expected fired=true")
	}
	fpRe := regexp.MustCompile(`^[0-9a-f]{8}$`)
	if !fpRe.MatchString(result.Fingerprint) {
		t.Errorf("expected 8-hex fingerprint, got %q", result.Fingerprint)
	}
	if storeCallCount != 1 {
		t.Errorf("expected storeAlert called once, got %d", storeCallCount)
	}
}

func TestEvaluateUseCase_DoesNotFireWhenMuted(t *testing.T) {
	uc := NewEvaluateAlertUseCase(&fakeAlertRepo{}, &fakeMutePort{muted: true}, &fakeTelegram{})
	result, err := uc.Execute(context.Background(), EvaluateAlertRequest{
		Stock:    "VCB",
		Severity: "high",
		Message:  "test",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Fired {
		t.Error("expected fired=false when muted")
	}
	// reason must contain "muted"
	if !strings.Contains(result.Reason, "muted") {
		t.Errorf("expected reason to contain 'muted', got %q", result.Reason)
	}
}

func TestEvaluateUseCase_DoesNotFireWhenDuplicate(t *testing.T) {
	fp := dkb.BuildKey("VCB", []string{}, "test")
	repo := &fakeAlertRepo{
		hasDuplicateFingerprintFunc: func(fingerprint string, withinMinutes int) (bool, error) {
			return fingerprint == fp, nil
		},
	}
	uc := NewEvaluateAlertUseCase(repo, &fakeMutePort{}, &fakeTelegram{})
	result, err := uc.Execute(context.Background(), EvaluateAlertRequest{
		Stock:    "VCB",
		Severity: "high",
		Message:  "test",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Fired {
		t.Error("expected fired=false when duplicate fingerprint")
	}
	if !strings.Contains(result.Reason, "duplicate") {
		t.Errorf("expected reason to contain 'duplicate', got %q", result.Reason)
	}
}
