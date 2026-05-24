// Package reading_scorer provides pure functions for extracting numeric scores
// from I-Ching outcome strings, trend text, and action text, plus majority voting.
//
// Fence-A: pure compute only — all lookup tables embedded inline, no I/O.
// Zero imports from application, interface, infrastructure, or module layers.
//
// Input Validation Strategy (Decision 2 — Option A):
//
//	Unknown/unrecognised strings -> return default value (0.0 for scores, 'GIU' for actions).
//	This mirrors the original domain implementation exactly.
//
// CRITICAL CONTRACT (Key Risk 2):
//
//	ExtractAction(actionText string) string — parameter is ACTION TEXT (string),
//	NOT a float score. The handoff spec listed `extractAction(score float64)` which was WRONG.
//	Authentic contract sourced from TS domain implementation at L88.
package reading_scorer

import (
	"strings"
)

// outcomeScores maps I-Ching outcome keywords (Vietnamese) to numeric scores.
var outcomeScores = map[string]float64{
	"CAT":    0.3,
	"HUNG":   -0.3,
	"VO CUU": 0.0,
	"HOI":    -0.15,
	"LAN":    -0.2,
	"LE":     -0.1,
	// With diacritics
	"CÁT":    0.3,
	"VÔ CỬU": 0.0,
	"HỐI":    -0.15,
	"LẬN":    -0.2,
	"LỆ":     -0.1,
}

// trendScoreMap maps trend keywords to numeric scores (ordered for first-match).
var trendScoreMap = []struct {
	keyword string
	score   float64
}{
	{"THUAN LOI", 0.5},
	{"THUẬN LỢI", 0.5},
	{"BAT LOI", -0.5},
	{"BẤT LỢI", -0.5},
	{"TRUNG TINH", 0.0},
	{"TRUNG TÍNH", 0.0},
}

// actionKeywords maps action keywords to canonical action strings.
var actionKeywords = []struct {
	keywords []string
	action   string
}{
	{[]string{"TIẾN", "TIEN"}, "MUA"},
	{[]string{"LUI"}, "BAN"},
	{[]string{"GIỮ", "GIU"}, "GIU"},
	{[]string{"CHỜ", "CHO"}, "CHO"},
	{[]string{"THẬN", "THAN"}, "THAN TRONG"},
}

// ExtractOutcomeScore extracts a numeric score from an I-Ching line outcome text.
//
// Scans the uppercase form of outcomeText for known keyword entries.
// The first keyword match determines the score.
//
// Returns score in range [-0.3, 0.3]; defaults to 0.0 for unknown text.
func ExtractOutcomeScore(outcomeText string) float64 {
	upper := strings.ToUpper(outcomeText)
	for kw, score := range outcomeScores {
		if strings.Contains(upper, kw) {
			return score
		}
	}
	return 0.0
}

// ExtractTrendScore extracts a numeric score from a trend/market-direction text.
//
// Scans the uppercase form of trendText for known trend keywords.
//
// Returns score in {-0.5, 0.0, 0.5}; defaults to 0.0 for unknown text.
func ExtractTrendScore(trendText string) float64 {
	upper := strings.ToUpper(trendText)
	for _, entry := range trendScoreMap {
		if strings.Contains(upper, entry.keyword) {
			return entry.score
		}
	}
	return 0.0
}

// ExtractAction classifies action text into a canonical trading action string.
//
// AUTHENTIC CONTRACT: parameter is actionText (string), NOT a float score.
// The handoff spec error `extractAction(score float64)` is REJECTED.
// This authentic contract is string-based, sourced from TS domain implementation at L88.
//
// Matches Vietnamese action keywords to one of: 'MUA', 'BAN', 'GIU', 'CHO', 'THAN TRONG'.
// Defaults to 'GIU' for unknown text.
func ExtractAction(actionText string) string {
	upper := strings.ToUpper(actionText)
	for _, entry := range actionKeywords {
		for _, kw := range entry.keywords {
			if strings.Contains(upper, kw) {
				return entry.action
			}
		}
	}
	return "GIU"
}

// MajorityVote computes the majority action from a list of action strings.
//
// Counts occurrences of each action and returns the most frequent.
// Ties are broken by the first action that appears in the input array
// (preserves insertion order, matching JS Object.entries behavior).
//
// Returns 'GIU' when the array is empty.
func MajorityVote(actions []string) string {
	if len(actions) == 0 {
		return "GIU"
	}

	counts := make(map[string]int)
	order := []string{} // Preserve insertion order for tie-breaking

	for _, a := range actions {
		if counts[a] == 0 {
			order = append(order, a)
		}
		counts[a]++
	}

	// Find max count
	maxCount := 0
	for _, c := range counts {
		if c > maxCount {
			maxCount = c
		}
	}

	// Return first action with max count (in insertion order)
	for _, a := range order {
		if counts[a] == maxCount {
			return a
		}
	}

	return "GIU"
}
