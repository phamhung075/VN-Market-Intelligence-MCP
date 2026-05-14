// Package domain — pure domain logic: fingerprint, cooldown, dedup.
// No I/O, no infrastructure imports.
package domain

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// ── Fingerprint (djb2 hash) ──────────────────────────────────────────────────

// djb2Hash implements the djb2 algorithm exactly matching the TS port:
//
//	seed=5381, hash = ((hash<<5)+hash) ^ charCode, unsigned 32-bit, 8-hex lowercase.
func djb2Hash(s string) string {
	hash := uint32(5381)
	for _, ch := range s {
		hash = ((hash << 5) + hash) ^ uint32(ch)
	}
	return fmt.Sprintf("%08x", hash)
}

// ComputeFingerprint produces a stable fingerprint for an alert.
// stock + sorted(signalTypes) + message prefix (50 chars).
// Must produce byte-identical output to the TS computeFingerprint for the same inputs.
func ComputeFingerprint(stock string, signalTypes []string, message string) string {
	sorted := make([]string, len(signalTypes))
	copy(sorted, signalTypes)
	sort.Strings(sorted)
	signalsPart := strings.Join(sorted, ",")

	messagePart := message
	if len([]rune(messagePart)) > 50 {
		runes := []rune(messagePart)
		messagePart = string(runes[:50])
	}

	raw := stock + "|" + signalsPart + "|" + messagePart
	return djb2Hash(raw)
}

// ── Today helper ─────────────────────────────────────────────────────────────

func isToday(isoDate string) bool {
	t, err := time.Parse(time.RFC3339Nano, isoDate)
	if err != nil {
		// fallback: try without nanoseconds
		t, err = time.Parse(time.RFC3339, isoDate)
		if err != nil {
			return false
		}
	}
	now := time.Now()
	return t.Year() == now.Year() && t.Month() == now.Month() && t.Day() == now.Day()
}

// ── Cooldown check ───────────────────────────────────────────────────────────

// SuppressResult holds the output of shouldSuppressAlert.
type SuppressResult struct {
	Suppress bool
	Reason   string
}

// ShouldSuppressAlert returns whether the alert should be suppressed.
//
// CRITICAL severity alerts bypass cooldown EXCEPT MACRO actionCode.
// Mirrors TS shouldSuppressAlert exactly.
func ShouldSuppressAlert(alert AlertRequest, recentAlerts []StoredAlert, cfg CooldownConfig) SuppressResult {
	if alert.Severity == SeverityCritical && alert.ActionCode != "MACRO" {
		return SuppressResult{Suppress: false, Reason: "critical severity bypasses cooldown"}
	}

	now := time.Now()
	cooldownDur := time.Duration(cfg.CooldownMinutes) * time.Minute

	// Rule 1: cooldown window for same stock + signal overlap
	for _, recent := range recentAlerts {
		if recent.Stocks != alert.Stock {
			continue
		}
		recentTs, err := time.Parse(time.RFC3339Nano, recent.TriggeredAt)
		if err != nil {
			recentTs, err = time.Parse(time.RFC3339, recent.TriggeredAt)
			if err != nil {
				continue
			}
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

	// Rule 2: daily cap
	todayCount := 0
	for _, r := range recentAlerts {
		if r.Stocks == alert.Stock && isToday(r.TriggeredAt) {
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

// ── Dedup check ──────────────────────────────────────────────────────────────

// IsDuplicate returns true if fingerprint is in recentFingerprints.
func IsDuplicate(fingerprint string, recentFingerprints []string) bool {
	for _, fp := range recentFingerprints {
		if fp == fingerprint {
			return true
		}
	}
	return false
}
