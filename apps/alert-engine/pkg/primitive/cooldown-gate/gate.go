// Package cooldowngate is a pure primitive deciding whether an alert should be
// suppressed given recent fires, a cooldown window, and a daily cap.
//
// Fence-A: imports only stdlib (fmt, strings, time). No infrastructure, no
// application, no interface, no CGO extensions, no credential values of any kind.
//
// Determinism (HARD): Check NEVER reads the wall clock internally. The caller
// injects the reference instant `now`, so identical inputs always yield identical
// output — every scenario becomes reproducible. This is the key change from the
// brownfield domain.ShouldSuppressAlert, which read the wall clock at L77.
//
// Logic mirrors brownfield domain.ShouldSuppressAlert (pkg/domain/services.go
// L71-138) exactly, with two rules and one bypass:
//   - Bypass:  SeverityCritical + actionCode != "MACRO" → never suppress.
//   - Rule 1 (cooldown): same stock + overlapping signal type within CooldownMinutes.
//   - Rule 2 (daily cap): MaxAlertsPerStockPerDay already fired for the stock today.
//
// Reason strings are byte-identical to the brownfield output so downstream
// consumers and scenario fixtures remain stable.
package cooldowngate

import (
	"fmt"
	"strings"
	"time"
)

// severityCritical is the local copy of the critical severity sentinel.
// Kept local (not imported from domain) so the primitive stays self-contained
// and stdlib-only per Fence-A.
const severityCritical = "critical"

// SuppressResult is the output of Check.
type SuppressResult struct {
	Suppress bool
	Reason   string
}

// AlertInput is the minimal inbound data needed for the cooldown check.
type AlertInput struct {
	Stock       string
	Severity    string // "low" | "medium" | "high" | "critical"
	SignalTypes []string
	ActionCode  string
}

// CooldownConfig holds cooldown and daily-cap parameters.
type CooldownConfig struct {
	// CooldownMinutes is the window to suppress same stock+signal combo.
	CooldownMinutes int
	// MaxAlertsPerStockPerDay is the daily cap per stock.
	MaxAlertsPerStockPerDay int
}

// RecentAlert is the minimal stored alert data needed for the check.
type RecentAlert struct {
	Stocks      string
	SignalTypes string // comma-separated
	TriggeredAt string // RFC3339 ISO 8601
}

// parseTriggeredAt parses an RFC3339(Nano) timestamp, returning ok=false when
// the value is unparseable so the caller can skip the record (matching the
// brownfield continue-on-error behaviour).
func parseTriggeredAt(ts string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		t, err = time.Parse(time.RFC3339, ts)
		if err != nil {
			return time.Time{}, false
		}
	}
	return t, true
}

// sameCalendarDay reports whether a and b fall on the same Y/M/D. Both are
// compared in their own locations exactly as the brownfield isToday did against
// the injected `now` (which carries the reference day).
func sameCalendarDay(a, b time.Time) bool {
	return a.Year() == b.Year() && a.Month() == b.Month() && a.Day() == b.Day()
}

// Check returns whether the alert should be suppressed.
//
// now is injected for determinism (the function NEVER reads the wall clock
// internally). It serves as both the reference instant for the cooldown window
// (Rule 1) and the reference day for the daily cap (Rule 2).
//
// Pure function — no I/O, no env reads, no network, no DB.
func Check(alert AlertInput, recentAlerts []RecentAlert, cfg CooldownConfig, now time.Time) SuppressResult {
	// Bypass: critical severity skips cooldown EXCEPT for MACRO action codes.
	if alert.Severity == severityCritical && alert.ActionCode != "MACRO" {
		return SuppressResult{Suppress: false, Reason: "critical severity bypasses cooldown"}
	}

	cooldownDur := time.Duration(cfg.CooldownMinutes) * time.Minute

	// Rule 1: cooldown window for same stock + signal overlap.
	for _, recent := range recentAlerts {
		if recent.Stocks != alert.Stock {
			continue
		}
		recentTs, ok := parseTriggeredAt(recent.TriggeredAt)
		if !ok {
			continue
		}
		if now.Sub(recentTs) > cooldownDur {
			continue
		}

		recentTypes := strings.Split(recent.SignalTypes, ",")
		for i, rt := range recentTypes {
			recentTypes[i] = strings.TrimSpace(rt)
		}

		hasOverlap := len(alert.SignalTypes) == 0
		if !hasOverlap {
			for _, st := range alert.SignalTypes {
				for _, rt := range recentTypes {
					if st == rt {
						hasOverlap = true
						break
					}
				}
				if hasOverlap {
					break
				}
			}
		}

		if hasOverlap {
			return SuppressResult{
				Suppress: true,
				Reason:   fmt.Sprintf("cooldown: same signal within %dmin", cfg.CooldownMinutes),
			}
		}
	}

	// Rule 2: daily cap — count today's alerts for the stock relative to `now`.
	todayCount := 0
	for _, r := range recentAlerts {
		if r.Stocks != alert.Stock {
			continue
		}
		ts, ok := parseTriggeredAt(r.TriggeredAt)
		if !ok {
			continue
		}
		if sameCalendarDay(ts, now) {
			todayCount++
		}
	}
	if todayCount >= cfg.MaxAlertsPerStockPerDay {
		return SuppressResult{
			Suppress: true,
			Reason:   fmt.Sprintf("daily cap: %d/%d alerts for %s", todayCount, cfg.MaxAlertsPerStockPerDay, alert.Stock),
		}
	}

	return SuppressResult{Suppress: false, Reason: ""}
}
