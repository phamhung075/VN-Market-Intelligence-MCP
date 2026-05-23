// Package macro_investment_clock classifies a macro indicator name into a
// deterministic investment-clock tier and phase.
//
// Go rewrite of MacroScoreService.scoreIndicator() from
// apps/macro-indicators/src/domain/services.ts.
//
// Key change: the TS original used Math.random() to add variance to scores.
// This Go implementation uses a fixed-score lookup (deterministic) so that
// scenario JSON files always produce the same output — required by G7
// (edit-JSON-and-rerun) and G1 (primitives ship with stable scenarios).
//
// DDD Fence-A: this package imports ONLY standard library packages.
// No cross-layer imports (app/infra/iface layers are excluded per pilot charter).
package macro_investment_clock

import "strings"

// ---------------------------------------------------------------------------
// Tier + score constants (AC-1 — exported)
// ---------------------------------------------------------------------------

const (
	// VN_DIRECT_TIER labels indicators with direct Vietnam-market relevance.
	VN_DIRECT_TIER = "VN_DIRECT"
	// VN_DIRECT_SCORE is the fixed impact score for VN_DIRECT tier (replaces 8+rand).
	VN_DIRECT_SCORE = 8

	// REGIONAL_TIER labels indicators with regional (Asia-Pacific / global commodity) impact.
	REGIONAL_TIER = "REGIONAL"
	// REGIONAL_SCORE is the fixed impact score for REGIONAL tier (replaces 5+rand).
	REGIONAL_SCORE = 5

	// US_DOMESTIC_TIER labels indicators primarily affecting the US domestic market.
	US_DOMESTIC_TIER = "US_DOMESTIC"
	// US_DOMESTIC_SCORE is the fixed impact score for US_DOMESTIC tier (replaces 2+rand).
	US_DOMESTIC_SCORE = 2
)

// ---------------------------------------------------------------------------
// Indicator name lists (AC-1 — explicit named indicators)
// ---------------------------------------------------------------------------

// VN_DIRECT_INDICATORS is the canonical set of indicator names that map to
// the VN_DIRECT tier (score = 8). Names are upper-case; matching is
// case-insensitive via keyword lookup.
var VN_DIRECT_INDICATORS = []string{
	"VN_CPI",
	"VN_UNEMPLOYMENT",
	"VN_INTEREST_RATE",
	"VN_GDP",
	"VN_INFLATION",
	"VN_TRADE_BALANCE",
}

// REGIONAL_INDICATORS is the canonical set of indicator names that map to the
// REGIONAL tier (score = 5).
var REGIONAL_INDICATORS = []string{
	"ASEAN_GROWTH",
	"APAC_PMI",
	"CHINA_PMI",
	"OIL_PRICE",
	"GOLD_PRICE",
}

// ---------------------------------------------------------------------------
// VN keyword list (ported from TS scoreIndicator — for substring matching)
// ---------------------------------------------------------------------------

var vnKeywords = []string{
	"vietnam", "viet nam", "vn gdp", "vn cpi", "sbv", "nhnn", "vnd",
	"vnindex", "hose", "hnx", "vn_", // prefix for canonical VN indicator names
}

// regionalKeywords maps onto the TS REGIONAL branch.
var regionalKeywords = []string{
	"federal reserve", "fed rate", "fed fund",
	"oil", "crude", "gold",
	"china", "pboc",
	"asean", "apac",
}

// ---------------------------------------------------------------------------
// Input / Output types (AC-1 — exported)
// ---------------------------------------------------------------------------

// InvestmentClockInput is the request to the Classify function.
type InvestmentClockInput struct {
	IndicatorName string `json:"indicatorName"`
}

// InvestmentClockOutput is the deterministic result of the Classify function.
type InvestmentClockOutput struct {
	Tier  string `json:"tier"`
	Score int    `json:"score"`
	Phase string `json:"phase"`
}

// ---------------------------------------------------------------------------
// Classify — deterministic tier + phase assignment (AC-1, AC-2)
// ---------------------------------------------------------------------------

// Classify assigns a deterministic tier, fixed score, and phase to the given
// indicator name. Same input always produces the same output (no randomness).
//
// Classification order (mirrors TS scoreIndicator logic):
//  1. Check exact match against VN_DIRECT_INDICATORS (upper-case name)
//  2. Keyword substring match against vnKeywords (lower-case name)
//  3. Check exact match against REGIONAL_INDICATORS (upper-case name)
//  4. Keyword substring match against regionalKeywords (lower-case name)
//  5. Default → US_DOMESTIC
//
// Phase mapping (AC-2):
//   - Score ≥ 8  → "CORE_VN"
//   - Score ≥ 5  → "REGIONAL"
//   - Score < 5  → "US_DOMESTIC"
func Classify(input InvestmentClockInput) InvestmentClockOutput {
	upper := strings.ToUpper(strings.TrimSpace(input.IndicatorName))
	lower := strings.ToLower(strings.TrimSpace(input.IndicatorName))

	// --- VN_DIRECT exact match ---
	for _, ind := range VN_DIRECT_INDICATORS {
		if upper == ind {
			return newOutput(VN_DIRECT_TIER, VN_DIRECT_SCORE)
		}
	}

	// --- VN_DIRECT keyword match (ported from TS vnKeywords) ---
	for _, kw := range vnKeywords {
		if strings.Contains(lower, kw) {
			return newOutput(VN_DIRECT_TIER, VN_DIRECT_SCORE)
		}
	}

	// --- REGIONAL exact match ---
	for _, ind := range REGIONAL_INDICATORS {
		if upper == ind {
			return newOutput(REGIONAL_TIER, REGIONAL_SCORE)
		}
	}

	// --- REGIONAL keyword match (ported from TS regionalKeywords) ---
	for _, kw := range regionalKeywords {
		if strings.Contains(lower, kw) {
			return newOutput(REGIONAL_TIER, REGIONAL_SCORE)
		}
	}

	// --- Default: US_DOMESTIC ---
	return newOutput(US_DOMESTIC_TIER, US_DOMESTIC_SCORE)
}

// newOutput builds an InvestmentClockOutput applying the AC-2 phase mapping.
func newOutput(tier string, score int) InvestmentClockOutput {
	return InvestmentClockOutput{
		Tier:  tier,
		Score: score,
		Phase: scoreToPhase(score),
	}
}

// scoreToPhase converts a numeric score to a phase label (AC-2).
func scoreToPhase(score int) string {
	switch {
	case score >= VN_DIRECT_SCORE:
		return "CORE_VN"
	case score >= REGIONAL_SCORE:
		return "REGIONAL"
	default:
		return "US_DOMESTIC"
	}
}
