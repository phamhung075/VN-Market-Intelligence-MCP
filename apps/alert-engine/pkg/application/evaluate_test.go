// Package application — tests for EvaluateAlertUseCase (AC-9).
// FACTORY-ALERT-consolidate-dual-engines: EvaluateAlertUseCase is now a thin
// adapter over alertpipeline.Pipeline (the tested module). These tests verify
// the adapter's DTO mapping + reconciled response fields (alert_id,
// cooldown_sec, telegram_sent, code) — dedup/cooldown/mute/classify logic
// itself is covered exhaustively in pkg/module/alert_pipeline/pipeline_test.go.
package application

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
	alertpipeline "github.com/vn-market-intelligence/alert-engine/pkg/module/alert_pipeline"
	dkb "github.com/vn-market-intelligence/alert-engine/pkg/primitive/dedup-key-builder"
)

// ── fake port implementations (satisfy domain ports; structurally satisfy the
//    slimmer alertpipeline ports too) ────────────────────────────────────────

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

// newUseCase wires a Pipeline over the given fakes and returns the thin
// adapter under test — mirrors how cmd/server/main.go composes it.
func newUseCase(repo alertpipeline.AlertRepositoryPort, mute alertpipeline.MutePort, tg alertpipeline.TelegramPort) *EvaluateAlertUseCase {
	pipeline := alertpipeline.New(repo, mute, tg, domain.DefaultCooldownConfig)
	return NewEvaluateAlertUseCase(pipeline)
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
	uc := newUseCase(repo, &fakeMutePort{muted: false}, tg)

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
	if result.Code != "VCB" {
		t.Errorf("expected code=VCB (echo of stock), got %q", result.Code)
	}
	if result.AlertID != "1" {
		t.Errorf("expected alert_id=%q (stringified row id), got %q", "1", result.AlertID)
	}
	if result.CooldownSec != 1800 {
		t.Errorf("expected cooldown_sec=1800, got %d", result.CooldownSec)
	}
	if !result.TelegramSent {
		t.Error("expected telegram_sent=true when SendTelegram requested and port succeeds")
	}
	if tg.sentCount != 1 {
		t.Errorf("expected exactly one telegram send, got %d", tg.sentCount)
	}
}

func TestEvaluateUseCase_DoesNotFireWhenMuted(t *testing.T) {
	uc := newUseCase(&fakeAlertRepo{}, &fakeMutePort{muted: true}, &fakeTelegram{})
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
	if result.AlertID != "" {
		t.Errorf("expected alert_id='' when not fired, got %q", result.AlertID)
	}
}

func TestEvaluateUseCase_DoesNotFireWhenDuplicate(t *testing.T) {
	fp := dkb.BuildKey("VCB", []string{}, "test")
	repo := &fakeAlertRepo{
		hasDuplicateFingerprintFunc: func(fingerprint string, withinMinutes int) (bool, error) {
			return fingerprint == fp, nil
		},
	}
	uc := newUseCase(repo, &fakeMutePort{}, &fakeTelegram{})
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

// ── reconciliation coverage (FACTORY-ALERT-consolidate-dual-engines) ────────

// TestEvaluateUseCase_SendTelegramFalse_FiresWithoutDispatch verifies the
// adapter preserves the sendTelegram opt-in contract (api/openapi.yaml
// default: false) — a fired+stored alert with telegram_sent=false.
func TestEvaluateUseCase_SendTelegramFalse_FiresWithoutDispatch(t *testing.T) {
	tg := &fakeTelegram{}
	uc := newUseCase(&fakeAlertRepo{}, &fakeMutePort{}, tg)

	result, err := uc.Execute(context.Background(), EvaluateAlertRequest{
		Stock:    "VCB",
		Severity: "high",
		Message:  "test",
		// SendTelegram omitted → false (contract default)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Fired {
		t.Fatal("expected fired=true — firing does not depend on Telegram dispatch")
	}
	if result.TelegramSent {
		t.Error("expected telegram_sent=false when sendTelegram was not requested")
	}
	if tg.sentCount != 0 {
		t.Errorf("expected zero telegram sends, got %d", tg.sentCount)
	}
	if result.AlertID == "" {
		t.Error("expected non-empty alert_id — the alert was still recorded")
	}
}

// TestEvaluateUseCase_ChannelRouting_CriticalGoesToMarket verifies channel
// routing (now sourced from signal-classifier, not an inline switch) matches
// the documented critical/high→market, medium/low→work contract.
func TestEvaluateUseCase_ChannelRouting_CriticalGoesToMarket(t *testing.T) {
	var capturedChannel domain.TelegramChannel
	tg := &fakeTelegramCapture{onSend: func(ch domain.TelegramChannel) { capturedChannel = ch }}
	uc := newUseCase(&fakeAlertRepo{}, &fakeMutePort{}, tg)

	result, err := uc.Execute(context.Background(), EvaluateAlertRequest{
		Stock:        "VCB",
		Severity:     "critical",
		Message:      "test",
		SendTelegram: true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Fired {
		t.Fatalf("expected fired=true, got reason=%q", result.Reason)
	}
	if capturedChannel != domain.ChannelMarket {
		t.Errorf("expected routing to market channel for critical severity, got %q", capturedChannel)
	}
}

type fakeTelegramCapture struct {
	onSend func(channel domain.TelegramChannel)
}

func (tg *fakeTelegramCapture) Send(_ context.Context, channel domain.TelegramChannel, _ string) (bool, error) {
	if tg.onSend != nil {
		tg.onSend(channel)
	}
	return true, nil
}
