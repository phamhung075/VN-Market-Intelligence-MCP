package alertpipeline

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
	cg "github.com/vn-market-intelligence/alert-engine/pkg/primitive/cooldown-gate"
	dkb "github.com/vn-market-intelligence/alert-engine/pkg/primitive/dedup-key-builder"
	sc "github.com/vn-market-intelligence/alert-engine/pkg/primitive/signal-classifier"
)

// Pipeline composes the three primitives via injected ports. It owns no I/O of
// its own — every external effect crosses one of the three port interfaces.
type Pipeline struct {
	repo     AlertRepositoryPort
	mute     MutePort
	telegram TelegramPort
	cfg      domain.CooldownConfig
}

// New builds a Pipeline from injected ports and a cooldown config. The config
// defaults to domain.DefaultCooldownConfig when zero-valued.
func New(repo AlertRepositoryPort, mute MutePort, telegram TelegramPort, cfg domain.CooldownConfig) *Pipeline {
	if cfg.CooldownMinutes == 0 && cfg.MaxAlertsPerStockPerDay == 0 {
		cfg = domain.DefaultCooldownConfig
	}
	return &Pipeline{repo: repo, mute: mute, telegram: telegram, cfg: cfg}
}

// Result is the outcome of a single pipeline run.
type Result struct {
	Fired       bool
	Fingerprint string
	Channel     domain.TelegramChannel
	Reason      string
	// CooldownSec is the configured cooldown window in seconds, always populated
	// (constant per Pipeline instance — mirrors api/openapi.yaml
	// EvaluateAlertResponse.cooldown_sec: "Cooldown window in seconds applied to
	// this stock", not a per-branch value).
	CooldownSec int
	// AlertID is the persisted row ID from AlertRepositoryPort.StoreAlert.
	// Zero when Fired is false (nothing was stored).
	AlertID int64
	// TelegramSent reports whether TelegramPort.Send actually dispatched the
	// message. False whenever req.SendTelegram is false (routing was never
	// attempted) or the port reported a skip/failure. Decoupled from Fired —
	// per api/openapi.yaml: "fired: True if the alert passed all gates and was
	// recorded" vs "telegram_sent: True if the alert was dispatched to Telegram".
	TelegramSent bool
}

// Run executes the full pipeline story for one alert request:
//
//  1. classify severity     → signal-classifier primitive (invalid → not fired)
//  2. build fingerprint     → dedup-key-builder primitive
//  3. check duplicate       → AlertRepositoryPort.HasDuplicateFingerprint
//  4. check cooldown        → cooldown-gate primitive over AlertRepositoryPort.GetRecentAlerts
//  5. check mute            → MutePort.IsStockMuted
//  6. store the fired alert → AlertRepositoryPort.StoreAlert (fired = gates
//     passed AND recorded; does NOT depend on telegram delivery)
//  7. format message        → inline
//  8. route to channel      → TelegramPort.Send, only when req.SendTelegram
//
// now is injected for determinism — the cooldown primitive never reads the wall
// clock. Any short-circuit (invalid severity, dedup hit, cooldown suppression,
// mute) returns Fired=false with a reason and routes nothing.
//
// Store-before-route (reconciled from the retired EvaluateAlertUseCase inline
// orchestration, FACTORY-ALERT-consolidate-dual-engines): a fired alert is
// recorded regardless of whether Telegram delivery succeeds, so a Telegram
// outage or missing credentials (silent skip, AC-13) can never re-open the
// dedup/cooldown window for a signal that already fired. TelegramPort errors
// are treated the same as a false return (best-effort — never fails the whole
// evaluation over delivery mechanics).
func (p *Pipeline) Run(ctx context.Context, req domain.AlertRequest, now time.Time) (Result, error) {
	cooldownSec := p.cfg.CooldownMinutes * 60

	// 1. classify severity.
	cls := sc.Classify(string(req.Severity))
	if !cls.Valid {
		return Result{Fired: false, Reason: fmt.Sprintf("invalid severity: %q", req.Severity), CooldownSec: cooldownSec}, nil
	}
	channel := domain.TelegramChannel(cls.Channel)

	// 2. build fingerprint.
	fingerprint := dkb.BuildKey(req.Stock, req.SignalTypes, req.Message)

	// 3. check duplicate (dedup short-circuit).
	dup, err := p.repo.HasDuplicateFingerprint(fingerprint, p.cfg.CooldownMinutes)
	if err != nil {
		return Result{}, fmt.Errorf("dedup check: %w", err)
	}
	if dup {
		return Result{Fired: false, Fingerprint: fingerprint, Reason: "duplicate: fingerprint seen recently", CooldownSec: cooldownSec}, nil
	}

	// 4. check cooldown over recent alerts.
	recent, err := p.repo.GetRecentAlerts(req.Stock, p.cfg.CooldownMinutes)
	if err != nil {
		return Result{}, fmt.Errorf("recent alerts lookup: %w", err)
	}
	recentInputs := make([]cg.RecentAlert, len(recent))
	for i, r := range recent {
		recentInputs[i] = cg.RecentAlert{
			Stocks:      r.Stocks,
			SignalTypes: r.SignalTypes,
			TriggeredAt: r.TriggeredAt,
		}
	}
	gate := cg.Check(
		cg.AlertInput{
			Stock:       req.Stock,
			Severity:    string(req.Severity),
			SignalTypes: req.SignalTypes,
			ActionCode:  req.ActionCode,
		},
		recentInputs,
		cg.CooldownConfig{
			CooldownMinutes:         p.cfg.CooldownMinutes,
			MaxAlertsPerStockPerDay: p.cfg.MaxAlertsPerStockPerDay,
		},
		now,
	)
	if gate.Suppress {
		return Result{Fired: false, Fingerprint: fingerprint, Reason: gate.Reason, CooldownSec: cooldownSec}, nil
	}

	// 5. check mute.
	muted, err := p.mute.IsStockMuted(req.Stock)
	if err != nil {
		return Result{}, fmt.Errorf("mute check: %w", err)
	}
	if muted {
		return Result{Fired: false, Fingerprint: fingerprint, Reason: "muted: stock is muted", CooldownSec: cooldownSec}, nil
	}

	// 6. persist the fired alert BEFORE attempting delivery — fired+recorded is
	// the gate outcome, not a function of Telegram delivery (see doc comment).
	alertID, err := p.repo.StoreAlert(domain.StoredAlert{
		Stocks:      req.Stock,
		SignalTypes: joinSignals(req.SignalTypes),
		Message:     req.Message,
		Fingerprint: fingerprint,
		Severity:    req.Severity,
		TriggeredAt: now.Format(time.RFC3339),
		// SentToTelegram reflects the pre-send state (0) here; the fingerprint
		// and cooldown window are what matter for suppression — no second write
		// exists to flip this bit after a successful send (would re-introduce a
		// second I/O path the tested module doesn't own).
		SentToTelegram: 0,
	})
	if err != nil {
		return Result{}, fmt.Errorf("store alert: %w", err)
	}

	// 7. format message.
	text := formatMessage(req, cls.Severity)

	// 8. route to channel — opt-in via req.SendTelegram (mirrors
	// EvaluateAlertRequest.sendTelegram, default false). Best-effort: any error
	// from the port is treated as "not sent", never fails the evaluation.
	telegramSent := false
	if req.SendTelegram {
		sent, sendErr := p.telegram.Send(ctx, channel, text)
		telegramSent = sendErr == nil && sent
	}

	return Result{
		Fired:        true,
		Fingerprint:  fingerprint,
		Channel:      channel,
		Reason:       "alert fired",
		CooldownSec:  cooldownSec,
		AlertID:      alertID,
		TelegramSent: telegramSent,
	}, nil
}

// formatMessage produces the routed text. Inline per handoff (alert-formatter
// not extracted in P1-C). Contains no credential value.
func formatMessage(req domain.AlertRequest, sev sc.AlertSeverity) string {
	return fmt.Sprintf("[%s] %s — %s", sev, req.Stock, req.Message)
}

// joinSignals collapses signal types into the comma-separated form used by the
// stored-alert record, without importing strings just for one Join.
func joinSignals(signals []string) string {
	out := ""
	for i, s := range signals {
		if i > 0 {
			out += ","
		}
		out += s
	}
	return out
}
