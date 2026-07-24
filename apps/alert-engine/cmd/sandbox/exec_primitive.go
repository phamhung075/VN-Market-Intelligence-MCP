// exec_primitive.go — primitive-tier scenario executors + dispatcher.
// Extracted from main.go per FACTORY-ALERT-split-sandbox (mechanical move,
// behavior unchanged).
//
// size-justification: ~190L — the primitive-scenario dispatcher and its 3
// executors (signal-classifier, dedup-key-builder, cooldown-gate) must stay
// together: the dispatcher's switch references each executor by name, and each
// executor's scenario-shape doc comment is load-bearing (the only spec for
// that primitive's JSON envelope); splitting further (one file per primitive)
// would triple the import boilerplate for ~30L of logic each.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	cg "github.com/vn-market-intelligence/alert-engine/pkg/primitive/cooldown-gate"
	dkb "github.com/vn-market-intelligence/alert-engine/pkg/primitive/dedup-key-builder"
	sc "github.com/vn-market-intelligence/alert-engine/pkg/primitive/signal-classifier"
)

// ---------------------------------------------------------------------------
// Execution — primitive dispatcher (P1-A framework; executors wired P1-B1+)
// ---------------------------------------------------------------------------

// executePrimitive dispatches a primitive scenario to the correct handler
// based on the "primitive" field in the scenario JSON.
// P1-B1+: case blocks are added per primitive as they are extracted.
func executePrimitive(s Scenario) (bool, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", s.Path, err)
	}

	// Peek at the "primitive" field to dispatch.
	var envelope struct {
		Primitive string `json:"primitive"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return false, fmt.Errorf("peek primitive field in %s: %w", s.Name, err)
	}

	switch envelope.Primitive {
	case "signal_classifier":
		return executeSignalClassifier(data)
	case "dedup_key_builder":
		return executeDedupKeyBuilder(data)
	case "cooldown_gate":
		return executeCooldownGate(data)
	case "":
		return false, fmt.Errorf("scenario %q: missing 'primitive' field", s.Name)
	default:
		return false, fmt.Errorf("primitive %q in %s not yet wired (add executor in P1-B1+)", envelope.Primitive, s.Name)
	}
}

// executeSignalClassifier runs a signal-classifier scenario (P1-B1).
// Scenario JSON shape:
//
//	{
//	  "primitive": "signal_classifier",
//	  "input":    {"severity": "<string>"},
//	  "expected": {"valid": <bool>, "severity": "<string>", "channel": "<string>"}
//	}
func executeSignalClassifier(data []byte) (bool, error) {
	var s struct {
		Input struct {
			Severity string `json:"severity"`
		} `json:"input"`
		Expected struct {
			Valid    bool   `json:"valid"`
			Severity string `json:"severity"`
			Channel  string `json:"channel"`
		} `json:"expected"`
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("signal-classifier: unmarshal scenario: %w", err)
	}

	got := sc.Classify(s.Input.Severity)

	if got.Valid != s.Expected.Valid {
		return false, fmt.Errorf("signal-classifier: Valid=%v want=%v (severity=%q)", got.Valid, s.Expected.Valid, s.Input.Severity)
	}
	if s.Expected.Valid {
		if string(got.Severity) != s.Expected.Severity {
			return false, fmt.Errorf("signal-classifier: Severity=%q want=%q", got.Severity, s.Expected.Severity)
		}
		if string(got.Channel) != s.Expected.Channel {
			return false, fmt.Errorf("signal-classifier: Channel=%q want=%q", got.Channel, s.Expected.Channel)
		}
	}
	return true, nil
}

// executeDedupKeyBuilder runs a dedup-key-builder scenario (P1-B2).
// Scenario JSON shape:
//
//	{
//	  "primitive": "dedup_key_builder",
//	  "input":    {"stock": "<string>", "signalTypes": ["<string>"...], "message": "<string>"},
//	  "expected": {"fingerprint": "<8-hex lowercase>"}
//	}
func executeDedupKeyBuilder(data []byte) (bool, error) {
	var s struct {
		Input struct {
			Stock       string   `json:"stock"`
			SignalTypes []string `json:"signalTypes"`
			Message     string   `json:"message"`
		} `json:"input"`
		Expected struct {
			Fingerprint string `json:"fingerprint"`
		} `json:"expected"`
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("dedup-key-builder: unmarshal scenario: %w", err)
	}

	got := dkb.BuildKey(s.Input.Stock, s.Input.SignalTypes, s.Input.Message)

	if got != s.Expected.Fingerprint {
		return false, fmt.Errorf("dedup-key-builder: fingerprint=%q want=%q (stock=%q signals=%v)",
			got, s.Expected.Fingerprint, s.Input.Stock, s.Input.SignalTypes)
	}
	return true, nil
}

// executeCooldownGate runs a cooldown-gate scenario (P1-B3).
// Scenario JSON shape:
//
//	{
//	  "primitive": "cooldown_gate",
//	  "input": {
//	    "alert":        {"stock", "severity", "signalTypes": [...], "actionCode"},
//	    "recentAlerts": [{"stocks", "signalTypes", "triggeredAt"}...],
//	    "cfg":          {"cooldownMinutes", "maxAlertsPerStockPerDay"},
//	    "now":          "<RFC3339>"
//	  },
//	  "expected": {"suppress": <bool>, "reason": "<string>"}
//	}
//
// now is an RFC3339 string parsed into time.Time and injected into Check —
// the primitive never reads the wall clock, so the scenario is deterministic.
func executeCooldownGate(data []byte) (bool, error) {
	var s struct {
		Input struct {
			Alert struct {
				Stock       string   `json:"stock"`
				Severity    string   `json:"severity"`
				SignalTypes []string `json:"signalTypes"`
				ActionCode  string   `json:"actionCode"`
			} `json:"alert"`
			RecentAlerts []struct {
				Stocks      string `json:"stocks"`
				SignalTypes string `json:"signalTypes"`
				TriggeredAt string `json:"triggeredAt"`
			} `json:"recentAlerts"`
			Cfg struct {
				CooldownMinutes         int `json:"cooldownMinutes"`
				MaxAlertsPerStockPerDay int `json:"maxAlertsPerStockPerDay"`
			} `json:"cfg"`
			Now string `json:"now"`
		} `json:"input"`
		Expected struct {
			Suppress bool   `json:"suppress"`
			Reason   string `json:"reason"`
		} `json:"expected"`
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("cooldown-gate: unmarshal scenario: %w", err)
	}

	now, err := time.Parse(time.RFC3339, s.Input.Now)
	if err != nil {
		return false, fmt.Errorf("cooldown-gate: parse now %q: %w", s.Input.Now, err)
	}

	recent := make([]cg.RecentAlert, len(s.Input.RecentAlerts))
	for i, r := range s.Input.RecentAlerts {
		recent[i] = cg.RecentAlert{Stocks: r.Stocks, SignalTypes: r.SignalTypes, TriggeredAt: r.TriggeredAt}
	}

	got := cg.Check(
		cg.AlertInput{
			Stock:       s.Input.Alert.Stock,
			Severity:    s.Input.Alert.Severity,
			SignalTypes: s.Input.Alert.SignalTypes,
			ActionCode:  s.Input.Alert.ActionCode,
		},
		recent,
		cg.CooldownConfig{
			CooldownMinutes:         s.Input.Cfg.CooldownMinutes,
			MaxAlertsPerStockPerDay: s.Input.Cfg.MaxAlertsPerStockPerDay,
		},
		now,
	)

	if got.Suppress != s.Expected.Suppress {
		return false, fmt.Errorf("cooldown-gate: Suppress=%v want=%v (reason=%q)", got.Suppress, s.Expected.Suppress, got.Reason)
	}
	if got.Reason != s.Expected.Reason {
		return false, fmt.Errorf("cooldown-gate: Reason=%q want=%q", got.Reason, s.Expected.Reason)
	}
	return true, nil
}
