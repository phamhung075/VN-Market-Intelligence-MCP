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
}

// Run executes the full pipeline story for one alert request:
//
//  1. classify severity     → signal-classifier primitive (invalid → not fired)
//  2. build fingerprint     → dedup-key-builder primitive
//  3. check duplicate       → AlertRepositoryPort.HasDuplicateFingerprint
//  4. check cooldown        → cooldown-gate primitive over AlertRepositoryPort.GetRecentAlerts
//  5. check mute            → MutePort.IsStockMuted
//  6. format message        → inline
//  7. route to channel      → TelegramPort.Send
//
// now is injected for determinism — the cooldown primitive never reads the wall
// clock. Any short-circuit (invalid severity, dedup hit, cooldown suppression,
// mute) returns Fired=false with a reason and routes nothing.
func (p *Pipeline) Run(ctx context.Context, req domain.AlertRequest, now time.Time) (Result, error) {
	// 1. classify severity.
	cls := sc.Classify(string(req.Severity))
	if !cls.Valid {
		return Result{Fired: false, Reason: fmt.Sprintf("invalid severity: %q", req.Severity)}, nil
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
		return Result{Fired: false, Fingerprint: fingerprint, Reason: "duplicate: fingerprint seen recently"}, nil
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
		return Result{Fired: false, Fingerprint: fingerprint, Reason: gate.Reason}, nil
	}

	// 5. check mute.
	muted, err := p.mute.IsStockMuted(req.Stock)
	if err != nil {
		return Result{}, fmt.Errorf("mute check: %w", err)
	}
	if muted {
		return Result{Fired: false, Fingerprint: fingerprint, Reason: "muted: stock is muted"}, nil
	}

	// 6. format message.
	text := formatMessage(req, cls.Severity)

	// 7. route to channel.
	sent, err := p.telegram.Send(ctx, channel, text)
	if err != nil {
		return Result{}, fmt.Errorf("route to telegram: %w", err)
	}
	if !sent {
		return Result{Fired: false, Fingerprint: fingerprint, Channel: channel, Reason: "route skipped by telegram port"}, nil
	}

	// Persist the fired alert (best-effort record of state).
	_, err = p.repo.StoreAlert(domain.StoredAlert{
		Stocks:         req.Stock,
		SignalTypes:    joinSignals(req.SignalTypes),
		Message:        req.Message,
		Fingerprint:    fingerprint,
		Severity:       req.Severity,
		TriggeredAt:    now.Format(time.RFC3339),
		SentToTelegram: 1,
	})
	if err != nil {
		return Result{}, fmt.Errorf("store alert: %w", err)
	}

	return Result{
		Fired:       true,
		Fingerprint: fingerprint,
		Channel:     channel,
		Reason:      "alert fired",
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
