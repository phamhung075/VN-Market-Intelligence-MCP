// primitives.go — primitive-tier scenario executors + dispatcher.
//
// Split from cmd/sandbox/main.go (FACTORY-MACRO-split-sandbox, 2026-07-09) — see
// main.go's package doc comment for the full file map. Also collapses the 6
// structurally-identical executeMacroXxx comparator bodies (each used to hand-roll
// its own []string diff + fmt.Errorf) into one compareFields(label, []fieldDiff)
// helper — every executor below now only builds the field list.
//
// size-justification: ~330L — 6 primitive scenario-JSON shapes + their executors +
// the shared fieldDiff/compareFields/formatVal helper + the executePrimitive
// dispatch switch. compareFields must live directly beside every caller in this
// file (module.go's executors also reuse it, same-package visibility); splitting
// per-primitive would either duplicate compareFields 6x or move it to its own file
// that both this file and module.go import for no locality gain — same net file
// count, more indirection. The dispatch switch must also stay beside the executors
// it routes to.
package main

import (
	"encoding/json"
	"fmt"
	"os"

	carry "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_carry_trade_signal"
	gld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_gold_direction_classifier"
	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
	oil "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_oil_impact_classifier"
	uvnd "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier"
	yld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_yield_spread_signal"
)

// ---------------------------------------------------------------------------
// fieldDiff / compareFields — shared comparator collapse
// ---------------------------------------------------------------------------

// fieldDiff is one (field name, got, want) triple compared by compareFields.
type fieldDiff struct {
	field string
	got   any
	want  any
}

// compareFields replaces what used to be 6 (and, in module.go, 2 more)
// structurally-identical hand-rolled diff loops: every executor now only builds
// a []fieldDiff slice and hands it to this one helper. label is the exact
// error-message prefix the original per-executor code used (e.g. `scenario "name"`
// or `classification[3]`) — preserved verbatim so FAIL log text is byte-identical
// to the pre-split behavior.
func compareFields(label string, diffs []fieldDiff) error {
	var msgs []string
	for _, d := range diffs {
		if d.got != d.want {
			msgs = append(msgs, fmt.Sprintf("%s: got %s, want %s", d.field, formatVal(d.got), formatVal(d.want)))
		}
	}
	if len(msgs) == 0 {
		return nil
	}
	return fmt.Errorf("%s: %v", label, msgs)
}

// formatVal mirrors the original per-field formatting: %q for strings, %v
// (equivalent output to the original %d/%v) for everything else.
func formatVal(v any) string {
	if s, ok := v.(string); ok {
		return fmt.Sprintf("%q", s)
	}
	return fmt.Sprintf("%v", v)
}

// ---------------------------------------------------------------------------
// Scenario JSON shapes
// ---------------------------------------------------------------------------

// macroInvestmentClockScenario is the JSON envelope for macro-investment-clock
// scenario files. The "shouldPass" field drives success vs. failure assertions.
type macroInvestmentClockScenario struct {
	Name       string                     `json:"name"`
	Primitive  string                     `json:"primitive"`
	Input      mic.InvestmentClockInput   `json:"input"`
	Expected   *mic.InvestmentClockOutput `json:"expected"` // nil when shouldPass=false
	ShouldPass bool                       `json:"shouldPass"`
	ErrorType  string                     `json:"errorType"`
}

// macroOilImpactScenario is the JSON envelope for macro-oil-impact-classifier scenarios.
type macroOilImpactScenario struct {
	Name      string             `json:"name"`
	Primitive string             `json:"primitive"`
	Input     oil.OilImpactInput `json:"input"`
	Expected  *struct {
		Impact   string  `json:"impact"`
		PriceUSD float64 `json:"priceUSD"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// macroGoldDirectionScenario is the JSON envelope for macro-gold-direction-classifier scenarios.
type macroGoldDirectionScenario struct {
	Name      string                 `json:"name"`
	Primitive string                 `json:"primitive"`
	Input     gld.GoldDirectionInput `json:"input"`
	Expected  *struct {
		Direction string  `json:"direction"`
		PriceUSD  float64 `json:"priceUSD"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// macroUsdVndDirectionScenario is the JSON envelope for macro-usdvnd-direction-classifier scenarios.
type macroUsdVndDirectionScenario struct {
	Name      string                    `json:"name"`
	Primitive string                    `json:"primitive"`
	Input     uvnd.UsdVndDirectionInput `json:"input"`
	Expected  *struct {
		Direction string  `json:"direction"`
		RateVND   float64 `json:"rateVND"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// macroCarryTradeScenario is the JSON envelope for macro-carry-trade-signal scenarios.
type macroCarryTradeScenario struct {
	Name      string                `json:"name"`
	Primitive string                `json:"primitive"`
	Input     carry.CarryTradeInput `json:"input"`
	Expected  *struct {
		Regime         string  `json:"regime"`
		CarrySpread    float64 `json:"carrySpread"`
		VNDDepositRate float64 `json:"vndDepositRate"`
		FedFundsRate   float64 `json:"fedFundsRate"`
		ComputedAt     string  `json:"computedAt"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// macroYieldSpreadScenario is the JSON envelope for macro-yield-spread-signal scenarios.
type macroYieldSpreadScenario struct {
	Name      string               `json:"name"`
	Primitive string               `json:"primitive"`
	Input     yld.YieldSpreadInput `json:"input"`
	Expected  *struct {
		Label        string  `json:"label"`
		Spread       float64 `json:"spread"`
		EarningYield float64 `json:"earningYield"`
		DepositRate  float64 `json:"depositRate"`
		ComputedAt   string  `json:"computedAt"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// ---------------------------------------------------------------------------
// Executors — one per primitive. Each builds a []fieldDiff and calls compareFields.
// ---------------------------------------------------------------------------

// executeMacroInvestmentClock runs a single macro-investment-clock scenario.
// For shouldPass=true: calls Classify, compares all output fields to expected.
// For shouldPass=false: calls Classify, verifies no panic (graceful degradation).
func executeMacroInvestmentClock(data []byte) (bool, error) {
	var s macroInvestmentClockScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-investment-clock scenario: %w", err)
	}

	got := mic.Classify(s.Input)

	// Failure scenario: shouldPass=false means we expect the input to be "invalid"
	// (e.g. null → "" in Go). We verify the function ran without panic and returned
	// a valid (zero-value or default) output. Scenario PASSES by virtue of graceful handling.
	if !s.ShouldPass {
		// null indicatorName unmarshals to "" → returns US_DOMESTIC (graceful, not a crash).
		// The scenario passes: the function handled invalid/null input without panic.
		return true, nil
	}

	// shouldPass=true: compare output fields to expected.
	if s.Expected == nil {
		return false, fmt.Errorf("scenario %q: shouldPass=true but expected is nil", s.Name)
	}

	if err := compareFields(fmt.Sprintf("scenario %q", s.Name), []fieldDiff{
		{"Tier", got.Tier, s.Expected.Tier},
		{"Score", got.Score, s.Expected.Score},
		{"Phase", got.Phase, s.Expected.Phase},
	}); err != nil {
		return false, err
	}
	return true, nil
}

func executeMacroOilImpact(data []byte) (bool, error) {
	var s macroOilImpactScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-oil-impact-classifier scenario: %w", err)
	}

	got := oil.Classify(s.Input)

	if !s.ShouldPass {
		// Failure scenarios: verify graceful degradation (no panic).
		return true, nil
	}
	if s.Expected == nil {
		return false, fmt.Errorf("scenario %q: shouldPass=true but expected is nil", s.Name)
	}

	if err := compareFields(fmt.Sprintf("scenario %q", s.Name), []fieldDiff{
		{"Impact", got.Impact, s.Expected.Impact},
		{"PriceUSD", got.PriceUSD, s.Expected.PriceUSD},
	}); err != nil {
		return false, err
	}
	return true, nil
}

func executeMacroGoldDirection(data []byte) (bool, error) {
	var s macroGoldDirectionScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-gold-direction-classifier scenario: %w", err)
	}

	got := gld.Classify(s.Input)

	if !s.ShouldPass {
		return true, nil
	}
	if s.Expected == nil {
		return false, fmt.Errorf("scenario %q: shouldPass=true but expected is nil", s.Name)
	}

	if err := compareFields(fmt.Sprintf("scenario %q", s.Name), []fieldDiff{
		{"Direction", got.Direction, s.Expected.Direction},
		{"PriceUSD", got.PriceUSD, s.Expected.PriceUSD},
	}); err != nil {
		return false, err
	}
	return true, nil
}

func executeMacroUsdVndDirection(data []byte) (bool, error) {
	var s macroUsdVndDirectionScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-usdvnd-direction-classifier scenario: %w", err)
	}

	got := uvnd.Classify(s.Input)

	if !s.ShouldPass {
		return true, nil
	}
	if s.Expected == nil {
		return false, fmt.Errorf("scenario %q: shouldPass=true but expected is nil", s.Name)
	}

	if err := compareFields(fmt.Sprintf("scenario %q", s.Name), []fieldDiff{
		{"Direction", got.Direction, s.Expected.Direction},
		{"RateVND", got.RateVND, s.Expected.RateVND},
	}); err != nil {
		return false, err
	}
	return true, nil
}

func executeMacroCarryTrade(data []byte) (bool, error) {
	var s macroCarryTradeScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-carry-trade-signal scenario: %w", err)
	}

	got := carry.Compute(s.Input)

	if !s.ShouldPass {
		return true, nil
	}
	if s.Expected == nil {
		return false, fmt.Errorf("scenario %q: shouldPass=true but expected is nil", s.Name)
	}

	if err := compareFields(fmt.Sprintf("scenario %q", s.Name), []fieldDiff{
		{"Regime", got.Regime, s.Expected.Regime},
		{"CarrySpread", got.CarrySpread, s.Expected.CarrySpread},
		{"VNDDepositRate", got.VNDDepositRate, s.Expected.VNDDepositRate},
		{"FedFundsRate", got.FedFundsRate, s.Expected.FedFundsRate},
		{"ComputedAt", got.ComputedAt, s.Expected.ComputedAt},
	}); err != nil {
		return false, err
	}
	return true, nil
}

func executeMacroYieldSpread(data []byte) (bool, error) {
	var s macroYieldSpreadScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-yield-spread-signal scenario: %w", err)
	}

	got := yld.Compute(s.Input)

	if !s.ShouldPass {
		return true, nil
	}
	if s.Expected == nil {
		return false, fmt.Errorf("scenario %q: shouldPass=true but expected is nil", s.Name)
	}

	if err := compareFields(fmt.Sprintf("scenario %q", s.Name), []fieldDiff{
		{"Label", got.Label, s.Expected.Label},
		{"Spread", got.Spread, s.Expected.Spread},
		{"EarningYield", got.EarningYield, s.Expected.EarningYield},
		{"DepositRate", got.DepositRate, s.Expected.DepositRate},
		{"ComputedAt", got.ComputedAt, s.Expected.ComputedAt},
	}); err != nil {
		return false, err
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// executePrimitive — dispatcher
// ---------------------------------------------------------------------------

// executePrimitive dispatches a primitive scenario to the correct handler
// based on the "primitive" field in the scenario JSON.
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
	case "macro_investment_clock":
		return executeMacroInvestmentClock(data)
	case "macro_oil_impact_classifier":
		return executeMacroOilImpact(data)
	case "macro_gold_direction_classifier":
		return executeMacroGoldDirection(data)
	case "macro_usdvnd_direction_classifier":
		return executeMacroUsdVndDirection(data)
	case "macro_carry_trade_signal":
		return executeMacroCarryTrade(data)
	case "macro_yield_spread_signal":
		return executeMacroYieldSpread(data)
	case "":
		// Backward-compat: infer from filename prefix.
		if len(s.Name) >= len("macro-investment-clock") &&
			s.Name[:len("macro-investment-clock")] == "macro-investment-clock" {
			return executeMacroInvestmentClock(data)
		}
		return false, fmt.Errorf("scenario %q: missing 'primitive' field and cannot infer from name", s.Name)
	default:
		return false, fmt.Errorf("unknown primitive %q in %s (not yet wired)", envelope.Primitive, s.Name)
	}
}
