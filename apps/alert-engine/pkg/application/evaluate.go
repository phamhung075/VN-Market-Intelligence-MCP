// Package application — EvaluateAlertUseCase orchestration.
package application

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
)

// EvaluateAlertUseCase orchestrates domain services + repository ports.
// No direct I/O — only ports (dependency injection).
type EvaluateAlertUseCase struct {
	alertRepo domain.AlertRepositoryPort
	mutePort  domain.MutePort
	telegram  domain.TelegramPort
}

// NewEvaluateAlertUseCase creates a new use case with injected ports.
func NewEvaluateAlertUseCase(
	alertRepo domain.AlertRepositoryPort,
	mutePort domain.MutePort,
	telegram domain.TelegramPort,
) *EvaluateAlertUseCase {
	return &EvaluateAlertUseCase{
		alertRepo: alertRepo,
		mutePort:  mutePort,
		telegram:  telegram,
	}
}

// Execute evaluates an alert request, applying mute/dedup/cooldown rules.
// Mirrors TS EvaluateAlertUseCase.execute exactly.
func (uc *EvaluateAlertUseCase) Execute(ctx context.Context, req EvaluateAlertRequest) (EvaluateAlertResponse, error) {
	stock := req.Stock
	severity := domain.AlertSeverity(req.Severity)
	message := req.Message
	signalTypes := req.SignalTypes
	if signalTypes == nil {
		signalTypes = []string{}
	}
	actionCode := req.ActionCode
	sendTelegram := req.SendTelegram

	cfg := domain.DefaultCooldownConfig
	fingerprint := domain.ComputeFingerprint(stock, signalTypes, message)

	// 1. Mute check
	muted, err := uc.mutePort.IsStockMuted(stock)
	if err != nil {
		return EvaluateAlertResponse{}, fmt.Errorf("mute check: %w", err)
	}
	if muted {
		return EvaluateAlertResponse{
			Fired:       false,
			CooldownSec: 0,
			Reason:      stock + " is muted",
			Fingerprint: fingerprint,
			Code:        stock,
		}, nil
	}

	// 2. Dedup check (last 60 min)
	recentAlerts60, err := uc.alertRepo.GetRecentAlerts(stock, 60)
	if err != nil {
		return EvaluateAlertResponse{}, fmt.Errorf("get recent alerts (60min): %w", err)
	}
	recentFingerprints := make([]string, len(recentAlerts60))
	for i, a := range recentAlerts60 {
		recentFingerprints[i] = a.Fingerprint
	}
	if domain.IsDuplicate(fingerprint, recentFingerprints) {
		return EvaluateAlertResponse{
			Fired:       false,
			CooldownSec: cfg.CooldownMinutes * 60,
			Reason:      "duplicate fingerprint within 60min",
			Fingerprint: fingerprint,
			Code:        stock,
		}, nil
	}

	// 3. Cooldown / daily cap check
	recentAlerts, err := uc.alertRepo.GetRecentAlerts(stock, cfg.CooldownMinutes)
	if err != nil {
		return EvaluateAlertResponse{}, fmt.Errorf("get recent alerts (cooldown): %w", err)
	}
	suppressResult := domain.ShouldSuppressAlert(
		domain.AlertRequest{
			Stock:       stock,
			Severity:    severity,
			Message:     message,
			SignalTypes: signalTypes,
			ActionCode:  actionCode,
		},
		recentAlerts,
		cfg,
	)
	if suppressResult.Suppress {
		return EvaluateAlertResponse{
			Fired:       false,
			CooldownSec: cfg.CooldownMinutes * 60,
			Reason:      suppressResult.Reason,
			Fingerprint: fingerprint,
			Code:        stock,
		}, nil
	}

	// 4. Store the alert
	now := time.Now().UTC().Format(time.RFC3339Nano)
	alertID, err := uc.alertRepo.StoreAlert(domain.StoredAlert{
		Stocks:      stock,
		SignalTypes: joinSignalTypes(signalTypes),
		Message:     message,
		Fingerprint: fingerprint,
		Severity:    severity,
		TriggeredAt: now,
	})
	if err != nil {
		return EvaluateAlertResponse{}, fmt.Errorf("store alert: %w", err)
	}

	// 5. Send to Telegram if requested
	telegramSent := false
	if sendTelegram {
		channel := domain.ChannelWork
		if severity == domain.SeverityCritical || severity == domain.SeverityHigh {
			channel = domain.ChannelMarket
		}
		text := fmt.Sprintf("[%s] %s: %s", string(severity), stock, message)
		sent, _ := uc.telegram.Send(ctx, channel, text)
		telegramSent = sent
	}

	return EvaluateAlertResponse{
		Fired:        true,
		CooldownSec:  cfg.CooldownMinutes * 60,
		Reason:       "alert fired",
		Fingerprint:  fingerprint,
		AlertID:      fmt.Sprintf("%d", alertID),
		Code:         stock,
		TelegramSent: telegramSent,
	}, nil
}

func joinSignalTypes(signalTypes []string) string {
	if len(signalTypes) == 0 {
		return ""
	}
	result := signalTypes[0]
	for _, s := range signalTypes[1:] {
		result += "," + s
	}
	return result
}
