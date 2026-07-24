// exec_module.go — module-tier scenario executor: sandbox mock ports
// (AlertRepositoryPort, MutePort, TelegramPort) + the alert_pipeline module
// dispatcher/executor. Extracted from main.go per FACTORY-ALERT-split-sandbox
// (mechanical move, behavior unchanged).
//
// size-justification: ~180L — the module dispatcher, the 3 in-memory mock
// ports it wires the real alert_pipeline module against, and the single
// executeAlertPipeline executor (whose scenario-shape doc comment is the only
// spec for the module's JSON envelope) form one cohesive "run alert_pipeline
// against fixtures, zero DB/network" concern; splitting the mocks away from
// the executor that constructs them would scatter one wiring story across two
// files without reducing complexity.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
	ap "github.com/vn-market-intelligence/alert-engine/pkg/module/alert_pipeline"
)

// ---------------------------------------------------------------------------
// Execution — module dispatcher (P1-A framework; executors wired P1-C+)
// ---------------------------------------------------------------------------

// executeModule dispatches a module scenario to the correct handler
// based on the "module" field in the scenario JSON.
// P1-A: no modules exist yet — unknown module returns graceful warning (not panic).
// P1-C+: case blocks are added per module as they are implemented.
func executeModule(s Scenario) (bool, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", s.Path, err)
	}

	// Peek at the "module" field to dispatch.
	var envelope struct {
		Module string `json:"module"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return false, fmt.Errorf("peek module field in %s: %w", s.Name, err)
	}

	switch envelope.Module {
	case "alert_pipeline":
		return executeAlertPipeline(data)
	case "":
		return false, fmt.Errorf("scenario %q: missing 'module' field", s.Name)
	default:
		return false, fmt.Errorf("module %q in %s not yet wired (add executor in P1-C+)", envelope.Module, s.Name)
	}
}

// ---------------------------------------------------------------------------
// Module executor — alert_pipeline (P1-C)
// ---------------------------------------------------------------------------

// sandboxRepo is an in-memory AlertRepositoryPort. No SQLite, no network.
// Recent alerts and the duplicate flag are seeded from the scenario JSON.
type sandboxRepo struct {
	recent    []domain.StoredAlert
	duplicate bool
}

func (r *sandboxRepo) GetRecentAlerts(stock string, withinMinutes int) ([]domain.StoredAlert, error) {
	return r.recent, nil
}
func (r *sandboxRepo) HasDuplicateFingerprint(fingerprint string, withinMinutes int) (bool, error) {
	return r.duplicate, nil
}
func (r *sandboxRepo) StoreAlert(alert domain.StoredAlert) (int64, error) { return 1, nil }

// sandboxMute is an in-memory MutePort seeded from the scenario JSON.
type sandboxMute struct{ muted bool }

func (m *sandboxMute) IsStockMuted(stock string) (bool, error) { return m.muted, nil }

// sandboxTelegram is an in-memory TelegramPort. It never calls a real API and
// holds no credential — it only records the channel it would have routed to.
type sandboxTelegram struct{ lastChannel domain.TelegramChannel }

func (t *sandboxTelegram) Send(ctx context.Context, channel domain.TelegramChannel, text string) (bool, error) {
	t.lastChannel = channel
	return true, nil
}

// executeAlertPipeline runs an alert_pipeline module scenario (P1-C) through the
// real module composed over in-memory mock ports.
//
// Scenario JSON shape:
//
//	{
//	  "module": "alert_pipeline",
//	  "input": {
//	    "alert": {"stock","severity","message","signalTypes":[...],"actionCode"},
//	    "recentAlerts": [{"stocks","signalTypes","triggeredAt"}...],
//	    "duplicate": <bool>,
//	    "muted": <bool>,
//	    "cfg": {"cooldownMinutes","maxAlertsPerStockPerDay"},
//	    "now": "<RFC3339>"
//	  },
//	  "expected": {"fired": <bool>, "fingerprint": "<8-hex>", "channel": "<string>", "reason": "<string>"}
//	}
//
// fingerprint and channel are only asserted when fired=true (a suppressed alert
// routes nothing). now is injected so the cooldown decision is deterministic.
func executeAlertPipeline(data []byte) (bool, error) {
	var s struct {
		Input struct {
			Alert struct {
				Stock       string   `json:"stock"`
				Severity    string   `json:"severity"`
				Message     string   `json:"message"`
				SignalTypes []string `json:"signalTypes"`
				ActionCode  string   `json:"actionCode"`
			} `json:"alert"`
			RecentAlerts []struct {
				Stocks      string `json:"stocks"`
				SignalTypes string `json:"signalTypes"`
				TriggeredAt string `json:"triggeredAt"`
			} `json:"recentAlerts"`
			Duplicate bool `json:"duplicate"`
			Muted     bool `json:"muted"`
			Cfg       struct {
				CooldownMinutes         int `json:"cooldownMinutes"`
				MaxAlertsPerStockPerDay int `json:"maxAlertsPerStockPerDay"`
			} `json:"cfg"`
			Now string `json:"now"`
		} `json:"input"`
		Expected struct {
			Fired       bool   `json:"fired"`
			Fingerprint string `json:"fingerprint"`
			Channel     string `json:"channel"`
			Reason      string `json:"reason"`
		} `json:"expected"`
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("alert-pipeline: unmarshal scenario: %w", err)
	}

	now, err := time.Parse(time.RFC3339, s.Input.Now)
	if err != nil {
		return false, fmt.Errorf("alert-pipeline: parse now %q: %w", s.Input.Now, err)
	}

	recent := make([]domain.StoredAlert, len(s.Input.RecentAlerts))
	for i, r := range s.Input.RecentAlerts {
		recent[i] = domain.StoredAlert{
			Stocks:      r.Stocks,
			SignalTypes: r.SignalTypes,
			TriggeredAt: r.TriggeredAt,
		}
	}

	repo := &sandboxRepo{recent: recent, duplicate: s.Input.Duplicate}
	mute := &sandboxMute{muted: s.Input.Muted}
	tg := &sandboxTelegram{}

	pipeline := ap.New(repo, mute, tg, domain.CooldownConfig{
		CooldownMinutes:         s.Input.Cfg.CooldownMinutes,
		MaxAlertsPerStockPerDay: s.Input.Cfg.MaxAlertsPerStockPerDay,
	})

	res, err := pipeline.Run(context.Background(), domain.AlertRequest{
		Stock:       s.Input.Alert.Stock,
		Severity:    domain.AlertSeverity(s.Input.Alert.Severity),
		Message:     s.Input.Alert.Message,
		SignalTypes: s.Input.Alert.SignalTypes,
		ActionCode:  s.Input.Alert.ActionCode,
		// SendTelegram: true to exercise the full pipeline story (fingerprint →
		// dedup → cooldown → mute → route), matching the harness's intent
		// ("route to market, fired=true" in alert-pipeline-golden.json).
		// FACTORY-ALERT-consolidate-dual-engines: firing itself no longer
		// depends on this flag or on delivery outcome.
		SendTelegram: true,
	}, now)
	if err != nil {
		return false, fmt.Errorf("alert-pipeline: run: %w", err)
	}

	if res.Fired != s.Expected.Fired {
		return false, fmt.Errorf("alert-pipeline: Fired=%v want=%v (reason=%q)", res.Fired, s.Expected.Fired, res.Reason)
	}
	if res.Reason != s.Expected.Reason {
		return false, fmt.Errorf("alert-pipeline: Reason=%q want=%q", res.Reason, s.Expected.Reason)
	}
	if s.Expected.Fired {
		if res.Fingerprint != s.Expected.Fingerprint {
			return false, fmt.Errorf("alert-pipeline: Fingerprint=%q want=%q", res.Fingerprint, s.Expected.Fingerprint)
		}
		if string(res.Channel) != s.Expected.Channel {
			return false, fmt.Errorf("alert-pipeline: Channel=%q want=%q", res.Channel, s.Expected.Channel)
		}
	}
	return true, nil
}
