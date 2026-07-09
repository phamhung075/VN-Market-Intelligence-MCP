// module.go — macro_signals module-tier scenario executors + concreteClock adapter.
//
// Split from cmd/sandbox/main.go (FACTORY-MACRO-split-sandbox, 2026-07-09) — see
// main.go's package doc comment for the full file map. Reuses primitives.go's
// fieldDiff/compareFields helper (same-package visibility) for the same comparator
// collapse: executeMacroSignalsBatch's per-item loop and executeMacroSignalsBuild
// now only build a []fieldDiff slice instead of hand-rolling their diff loops.
//
// size-justification: ~250L — one module today (macro_signals) has 2 scenario
// shapes (legacy classify_batch, P2-X2 build_macro_signals) wired through all 6
// primitive input/output DTOs; concreteClock, both executors, executeMacroSignals'
// scenario_type dispatch, and executeModule's module-field dispatch all share that
// DTO surface. Splitting the two scenario shapes into separate files would
// duplicate the concreteClock adapter and fragment each dispatch switch from the
// functions it routes to.
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

	ms "github.com/vn-market-intelligence/macro-indicators/pkg/module/macro_signals"
)

// ---------------------------------------------------------------------------
// Module scenario JSON shapes (P1-C1 — macro_signals, updated P2-X2)
// ---------------------------------------------------------------------------

// macroSignalsClassification is one entry in the expected_output.classifications array.
// Retained for backward-compat with classify_batch scenario type.
type macroSignalsClassification struct {
	Indicator string `json:"indicator"`
	Tier      string `json:"tier"`
	Score     int    `json:"score"`
	Phase     string `json:"phase"`
}

// macroSignalsScenario is the JSON envelope for macro-signals module scenario files
// using the legacy classify_batch shape (indicator_names input).
type macroSignalsScenario struct {
	ScenarioName string `json:"scenario_name"`
	Module       string `json:"module"`
	ScenarioType string `json:"scenario_type"`
	Input        struct {
		IndicatorNames []string `json:"indicator_names"`
	} `json:"input"`
	ExpectedOutput struct {
		BatchCount      int                          `json:"batch_count"`
		Classifications []macroSignalsClassification `json:"classifications"`
	} `json:"expected_output"`
}

// macroSignalsBuildScenario is the JSON envelope for the P2-X2 build_macro_signals
// scenario type — wires all 6 primitives in a single call.
type macroSignalsBuildScenario struct {
	ScenarioName string `json:"scenario_name"`
	Module       string `json:"module"`
	ScenarioType string `json:"scenario_type"`
	Input        struct {
		InvestmentClock mic.InvestmentClockInput  `json:"investmentClock"`
		OilImpact       oil.OilImpactInput        `json:"oilImpact"`
		GoldDirection   gld.GoldDirectionInput    `json:"goldDirection"`
		UsdVndDirection uvnd.UsdVndDirectionInput `json:"usdVndDirection"`
		CarryTrade      carry.CarryTradeInput     `json:"carryTrade"`
		YieldSpread     yld.YieldSpreadInput      `json:"yieldSpread"`
	} `json:"input"`
	ExpectedOutput struct {
		InvestmentClock struct {
			Tier  string `json:"tier"`
			Score int    `json:"score"`
			Phase string `json:"phase"`
		} `json:"investmentClock"`
		OilImpact struct {
			Impact   string  `json:"impact"`
			PriceUSD float64 `json:"priceUSD"`
		} `json:"oilImpact"`
		GoldDirection struct {
			Direction string  `json:"direction"`
			PriceUSD  float64 `json:"priceUSD"`
		} `json:"goldDirection"`
		UsdVndDirection struct {
			Direction string  `json:"direction"`
			RateVND   float64 `json:"rateVND"`
		} `json:"usdVndDirection"`
		CarryTrade struct {
			Regime         string  `json:"regime"`
			CarrySpread    float64 `json:"carrySpread"`
			VNDDepositRate float64 `json:"vndDepositRate"`
			FedFundsRate   float64 `json:"fedFundsRate"`
			ComputedAt     string  `json:"computedAt"`
		} `json:"carryTrade"`
		YieldSpread struct {
			Label        string  `json:"label"`
			Spread       float64 `json:"spread"`
			EarningYield float64 `json:"earningYield"`
			DepositRate  float64 `json:"depositRate"`
			ComputedAt   string  `json:"computedAt"`
		} `json:"yieldSpread"`
	} `json:"expected_output"`
}

// concreteClock wraps the macro_investment_clock.Classify function to satisfy
// the macro_signals.Classifier interface — allows the sandbox to wire the real
// primitive without importing a mock or changing the module's public API.
type concreteClock struct{}

func (c *concreteClock) Classify(input mic.InvestmentClockInput) mic.InvestmentClockOutput {
	return mic.Classify(input)
}

// executeMacroSignalsBatch runs a legacy classify_batch macro-signals module scenario.
// It wires the concrete macro_investment_clock primitive (via concreteClock adapter),
// calls ClassifyBatch, then compares results to expected_output.classifications.
func executeMacroSignalsBatch(data []byte) (bool, error) {
	var s macroSignalsScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-signals classify_batch scenario: %w", err)
	}

	sigs := ms.New(&concreteClock{})
	results := sigs.ClassifyBatch(s.Input.IndicatorNames)

	// Validate batch count.
	if len(results) != s.ExpectedOutput.BatchCount {
		return false, fmt.Errorf("batch_count: got %d, want %d", len(results), s.ExpectedOutput.BatchCount)
	}

	// Validate each classification against the expected list (positional).
	for i, exp := range s.ExpectedOutput.Classifications {
		if i >= len(results) {
			return false, fmt.Errorf("classification[%d]: no result (got only %d)", i, len(results))
		}
		got := results[i]
		if err := compareFields(fmt.Sprintf("classification[%d]", i), []fieldDiff{
			{"Indicator", got.Indicator, exp.Indicator},
			{"Tier", got.Tier, exp.Tier},
			{"Score", got.Score, exp.Score},
			{"Phase", got.Phase, exp.Phase},
		}); err != nil {
			return false, err
		}
	}

	return true, nil
}

// executeMacroSignalsBuild runs a P2-X2 build_macro_signals scenario.
// It calls BuildMacroSignals with all 6 primitive inputs and validates each signal field.
func executeMacroSignalsBuild(data []byte) (bool, error) {
	var s macroSignalsBuildScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-signals build_macro_signals scenario: %w", err)
	}

	sigs := ms.New(&concreteClock{})
	input := ms.MacroSignalsInput{
		InvestmentClock: s.Input.InvestmentClock,
		OilImpact:       s.Input.OilImpact,
		GoldDirection:   s.Input.GoldDirection,
		UsdVndDirection: s.Input.UsdVndDirection,
		CarryTrade:      s.Input.CarryTrade,
		YieldSpread:     s.Input.YieldSpread,
	}
	got := sigs.BuildMacroSignals(input)
	exp := s.ExpectedOutput

	err := compareFields(fmt.Sprintf("scenario %q", s.ScenarioName), []fieldDiff{
		{"investmentClock.tier", got.InvestmentClock.Tier, exp.InvestmentClock.Tier},
		{"investmentClock.score", got.InvestmentClock.Score, exp.InvestmentClock.Score},
		{"investmentClock.phase", got.InvestmentClock.Phase, exp.InvestmentClock.Phase},
		{"oilImpact.impact", got.OilImpact.Impact, exp.OilImpact.Impact},
		{"oilImpact.priceUSD", got.OilImpact.PriceUSD, exp.OilImpact.PriceUSD},
		{"goldDirection.direction", got.GoldDirection.Direction, exp.GoldDirection.Direction},
		{"goldDirection.priceUSD", got.GoldDirection.PriceUSD, exp.GoldDirection.PriceUSD},
		{"usdVndDirection.direction", got.UsdVndDirection.Direction, exp.UsdVndDirection.Direction},
		{"usdVndDirection.rateVND", got.UsdVndDirection.RateVND, exp.UsdVndDirection.RateVND},
		{"carryTrade.regime", got.CarryTrade.Regime, exp.CarryTrade.Regime},
		{"carryTrade.carrySpread", got.CarryTrade.CarrySpread, exp.CarryTrade.CarrySpread},
		{"carryTrade.vndDepositRate", got.CarryTrade.VNDDepositRate, exp.CarryTrade.VNDDepositRate},
		{"carryTrade.fedFundsRate", got.CarryTrade.FedFundsRate, exp.CarryTrade.FedFundsRate},
		{"carryTrade.computedAt", got.CarryTrade.ComputedAt, exp.CarryTrade.ComputedAt},
		{"yieldSpread.label", got.YieldSpread.Label, exp.YieldSpread.Label},
		{"yieldSpread.spread", got.YieldSpread.Spread, exp.YieldSpread.Spread},
		{"yieldSpread.earningYield", got.YieldSpread.EarningYield, exp.YieldSpread.EarningYield},
		{"yieldSpread.depositRate", got.YieldSpread.DepositRate, exp.YieldSpread.DepositRate},
		{"yieldSpread.computedAt", got.YieldSpread.ComputedAt, exp.YieldSpread.ComputedAt},
	})
	if err != nil {
		return false, err
	}
	return true, nil
}

// executeMacroSignals dispatches a macro-signals scenario to the correct executor
// based on the scenario_type field (build_macro_signals or classify_batch legacy).
func executeMacroSignals(data []byte) (bool, error) {
	// Peek at scenario_type to dispatch.
	var envelope struct {
		ScenarioType string `json:"scenario_type"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return false, fmt.Errorf("peek scenario_type in macro-signals scenario: %w", err)
	}

	switch envelope.ScenarioType {
	case "build_macro_signals":
		return executeMacroSignalsBuild(data)
	default:
		// Backward-compat: legacy classify_batch format (no scenario_type or explicit classify_batch).
		return executeMacroSignalsBatch(data)
	}
}

// executeModule runs a module scenario against pkg/module/* (wired in P1-C1).
// Dispatches on the "module" field in the scenario JSON.
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
	case "macro_signals":
		return executeMacroSignals(data)
	case "":
		// Backward-compat: infer from filename prefix.
		if len(s.Name) >= len("macro-signals") && s.Name[:len("macro-signals")] == "macro-signals" {
			return executeMacroSignals(data)
		}
		return false, fmt.Errorf("scenario %q: missing 'module' field and cannot infer from name", s.Name)
	default:
		return false, fmt.Errorf("unknown module %q in %s (not yet wired)", envelope.Module, s.Name)
	}
}
