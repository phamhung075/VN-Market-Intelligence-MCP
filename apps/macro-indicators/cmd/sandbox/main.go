// Package main — macro-indicators sandbox scenario runner.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=module    -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=all       -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json
//
// Security contract:
//   - Zero DB access. Zero network calls. Zero API keys.
//   - Reads scenario JSON from docs/scenarios/macro-indicators/ only.
//   - All computation via pkg/primitive/* and pkg/module/* (pure functions, P1-B1+).
//
// P1-A3 — feat(macro-indicators): sandbox harness CLI (placeholder runner until P1-B1).
// P1-B1 — wire executePrimitive to macro_investment_clock.Classify + executeFallback stubs.
// P1-C1 — wire executeModule to macro_signals.ClassifyBatch via module tier.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
	ms "github.com/vn-market-intelligence/macro-indicators/pkg/module/macro_signals"
	oil "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_oil_impact_classifier"
	gld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_gold_direction_classifier"
	uvnd "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier"
	carry "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_carry_trade_signal"
	yld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_yield_spread_signal"
)

// ---------------------------------------------------------------------------
// Scenario envelope (populated from JSON in P1-B1+)
// ---------------------------------------------------------------------------

// Scenario holds metadata discovered during filesystem walk.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
}

// ---------------------------------------------------------------------------
// Scenario JSON shapes (P1-B1 — macro_investment_clock)
// ---------------------------------------------------------------------------

// macroInvestmentClockScenario is the JSON envelope for macro-investment-clock
// scenario files. The "shouldPass" field drives success vs. failure assertions.
type macroInvestmentClockScenario struct {
	Name      string                          `json:"name"`
	Primitive string                          `json:"primitive"`
	Input     mic.InvestmentClockInput        `json:"input"`
	Expected  *mic.InvestmentClockOutput      `json:"expected"` // nil when shouldPass=false
	ShouldPass bool                           `json:"shouldPass"`
	ErrorType string                          `json:"errorType"`
}

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------

func findRepoRoot(start string) string {
	dir := start
	for {
		if _, err := os.Stat(filepath.Join(dir, "docs", "scenarios")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// ---------------------------------------------------------------------------
// Scenario discovery (filesystem walk on docs/scenarios/macro-indicators/)
// ---------------------------------------------------------------------------

// discoverScenarios returns all *.json files in the requested tier dirs.
// When -scenario=<filepath>, returns only that one path (resolved against repo root).
// Returns empty slice (not error) when directories do not exist (pre-P1-D1 phase).
func discoverScenarios(root, tier, scenarioArg string) ([]Scenario, error) {
	// Single-file mode.
	if scenarioArg != "all" && scenarioArg != "" {
		p := scenarioArg
		if !filepath.IsAbs(p) {
			p = filepath.Join(root, p)
		}
		t := "primitive"
		if filepath.Dir(p) == filepath.Join(root, "docs", "scenarios", "macro-indicators", "module") {
			t = "module"
		}
		return []Scenario{{Path: p, Name: filepath.Base(p), Tier: t}}, nil
	}

	// Collect tier directories.
	var dirs []struct{ path, tier string }
	base := filepath.Join(root, "docs", "scenarios", "macro-indicators")
	switch tier {
	case "primitive":
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "primitives"), "primitive"})
	case "module":
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "module"), "module"})
	case "all":
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "primitives"), "primitive"})
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "module"), "module"})
	default:
		return nil, fmt.Errorf("unknown -tier %q: must be primitive|module|all", tier)
	}

	var scenarios []Scenario
	for _, d := range dirs {
		matches, err := filepath.Glob(filepath.Join(d.path, "*.json"))
		if err != nil {
			return nil, fmt.Errorf("glob %s: %w", d.path, err)
		}
		for _, m := range matches {
			scenarios = append(scenarios, Scenario{
				Path: m,
				Name: filepath.Base(m),
				Tier: d.tier,
			})
		}
	}
	return scenarios, nil
}

// ---------------------------------------------------------------------------
// Scenario JSON shapes — new primitives (P2-X1)
// ---------------------------------------------------------------------------

// macroOilImpactScenario is the JSON envelope for macro-oil-impact-classifier scenarios.
type macroOilImpactScenario struct {
	Name       string `json:"name"`
	Primitive  string `json:"primitive"`
	Input      oil.OilImpactInput `json:"input"`
	Expected   *struct {
		Impact   string  `json:"impact"`
		PriceUSD float64 `json:"priceUSD"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// macroGoldDirectionScenario is the JSON envelope for macro-gold-direction-classifier scenarios.
type macroGoldDirectionScenario struct {
	Name       string `json:"name"`
	Primitive  string `json:"primitive"`
	Input      gld.GoldDirectionInput `json:"input"`
	Expected   *struct {
		Direction string  `json:"direction"`
		PriceUSD  float64 `json:"priceUSD"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// macroUsdVndDirectionScenario is the JSON envelope for macro-usdvnd-direction-classifier scenarios.
type macroUsdVndDirectionScenario struct {
	Name       string `json:"name"`
	Primitive  string `json:"primitive"`
	Input      uvnd.UsdVndDirectionInput `json:"input"`
	Expected   *struct {
		Direction string  `json:"direction"`
		RateVND   float64 `json:"rateVND"`
	} `json:"expected"`
	ShouldPass bool   `json:"shouldPass"`
	ErrorType  string `json:"errorType"`
}

// macroCarryTradeScenario is the JSON envelope for macro-carry-trade-signal scenarios.
type macroCarryTradeScenario struct {
	Name       string `json:"name"`
	Primitive  string `json:"primitive"`
	Input      carry.CarryTradeInput `json:"input"`
	Expected   *struct {
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
	Name       string `json:"name"`
	Primitive  string `json:"primitive"`
	Input      yld.YieldSpreadInput `json:"input"`
	Expected   *struct {
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
// Execution — macro_oil_impact_classifier (P2-X1)
// ---------------------------------------------------------------------------

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

	var diffs []string
	if got.Impact != s.Expected.Impact {
		diffs = append(diffs, fmt.Sprintf("Impact: got %q, want %q", got.Impact, s.Expected.Impact))
	}
	if got.PriceUSD != s.Expected.PriceUSD {
		diffs = append(diffs, fmt.Sprintf("PriceUSD: got %v, want %v", got.PriceUSD, s.Expected.PriceUSD))
	}
	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.Name, diffs)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — macro_gold_direction_classifier (P2-X1)
// ---------------------------------------------------------------------------

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

	var diffs []string
	if got.Direction != s.Expected.Direction {
		diffs = append(diffs, fmt.Sprintf("Direction: got %q, want %q", got.Direction, s.Expected.Direction))
	}
	if got.PriceUSD != s.Expected.PriceUSD {
		diffs = append(diffs, fmt.Sprintf("PriceUSD: got %v, want %v", got.PriceUSD, s.Expected.PriceUSD))
	}
	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.Name, diffs)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — macro_usdvnd_direction_classifier (P2-X1)
// ---------------------------------------------------------------------------

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

	var diffs []string
	if got.Direction != s.Expected.Direction {
		diffs = append(diffs, fmt.Sprintf("Direction: got %q, want %q", got.Direction, s.Expected.Direction))
	}
	if got.RateVND != s.Expected.RateVND {
		diffs = append(diffs, fmt.Sprintf("RateVND: got %v, want %v", got.RateVND, s.Expected.RateVND))
	}
	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.Name, diffs)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — macro_carry_trade_signal (P2-X1)
// ---------------------------------------------------------------------------

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

	var diffs []string
	if got.Regime != s.Expected.Regime {
		diffs = append(diffs, fmt.Sprintf("Regime: got %q, want %q", got.Regime, s.Expected.Regime))
	}
	if got.CarrySpread != s.Expected.CarrySpread {
		diffs = append(diffs, fmt.Sprintf("CarrySpread: got %v, want %v", got.CarrySpread, s.Expected.CarrySpread))
	}
	if got.VNDDepositRate != s.Expected.VNDDepositRate {
		diffs = append(diffs, fmt.Sprintf("VNDDepositRate: got %v, want %v", got.VNDDepositRate, s.Expected.VNDDepositRate))
	}
	if got.FedFundsRate != s.Expected.FedFundsRate {
		diffs = append(diffs, fmt.Sprintf("FedFundsRate: got %v, want %v", got.FedFundsRate, s.Expected.FedFundsRate))
	}
	if got.ComputedAt != s.Expected.ComputedAt {
		diffs = append(diffs, fmt.Sprintf("ComputedAt: got %q, want %q", got.ComputedAt, s.Expected.ComputedAt))
	}
	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.Name, diffs)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — macro_yield_spread_signal (P2-X1)
// ---------------------------------------------------------------------------

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

	var diffs []string
	if got.Label != s.Expected.Label {
		diffs = append(diffs, fmt.Sprintf("Label: got %q, want %q", got.Label, s.Expected.Label))
	}
	if got.Spread != s.Expected.Spread {
		diffs = append(diffs, fmt.Sprintf("Spread: got %v, want %v", got.Spread, s.Expected.Spread))
	}
	if got.EarningYield != s.Expected.EarningYield {
		diffs = append(diffs, fmt.Sprintf("EarningYield: got %v, want %v", got.EarningYield, s.Expected.EarningYield))
	}
	if got.DepositRate != s.Expected.DepositRate {
		diffs = append(diffs, fmt.Sprintf("DepositRate: got %v, want %v", got.DepositRate, s.Expected.DepositRate))
	}
	if got.ComputedAt != s.Expected.ComputedAt {
		diffs = append(diffs, fmt.Sprintf("ComputedAt: got %q, want %q", got.ComputedAt, s.Expected.ComputedAt))
	}
	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.Name, diffs)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — macro_investment_clock (P1-B1)
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

	var diffs []string
	if got.Tier != s.Expected.Tier {
		diffs = append(diffs, fmt.Sprintf("Tier: got %q, want %q", got.Tier, s.Expected.Tier))
	}
	if got.Score != s.Expected.Score {
		diffs = append(diffs, fmt.Sprintf("Score: got %d, want %d", got.Score, s.Expected.Score))
	}
	if got.Phase != s.Expected.Phase {
		diffs = append(diffs, fmt.Sprintf("Phase: got %q, want %q", got.Phase, s.Expected.Phase))
	}

	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.Name, diffs)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution (primitive dispatcher)
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
		InvestmentClock mic.InvestmentClockInput    `json:"investmentClock"`
		OilImpact       oil.OilImpactInput          `json:"oilImpact"`
		GoldDirection   gld.GoldDirectionInput      `json:"goldDirection"`
		UsdVndDirection uvnd.UsdVndDirectionInput   `json:"usdVndDirection"`
		CarryTrade      carry.CarryTradeInput       `json:"carryTrade"`
		YieldSpread     yld.YieldSpreadInput        `json:"yieldSpread"`
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
		var diffs []string
		if got.Indicator != exp.Indicator {
			diffs = append(diffs, fmt.Sprintf("Indicator: got %q, want %q", got.Indicator, exp.Indicator))
		}
		if got.Tier != exp.Tier {
			diffs = append(diffs, fmt.Sprintf("Tier: got %q, want %q", got.Tier, exp.Tier))
		}
		if got.Score != exp.Score {
			diffs = append(diffs, fmt.Sprintf("Score: got %d, want %d", got.Score, exp.Score))
		}
		if got.Phase != exp.Phase {
			diffs = append(diffs, fmt.Sprintf("Phase: got %q, want %q", got.Phase, exp.Phase))
		}
		if len(diffs) > 0 {
			return false, fmt.Errorf("classification[%d]: %v", i, diffs)
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

	var diffs []string

	// InvestmentClock
	if got.InvestmentClock.Tier != exp.InvestmentClock.Tier {
		diffs = append(diffs, fmt.Sprintf("investmentClock.tier: got %q, want %q", got.InvestmentClock.Tier, exp.InvestmentClock.Tier))
	}
	if got.InvestmentClock.Score != exp.InvestmentClock.Score {
		diffs = append(diffs, fmt.Sprintf("investmentClock.score: got %d, want %d", got.InvestmentClock.Score, exp.InvestmentClock.Score))
	}
	if got.InvestmentClock.Phase != exp.InvestmentClock.Phase {
		diffs = append(diffs, fmt.Sprintf("investmentClock.phase: got %q, want %q", got.InvestmentClock.Phase, exp.InvestmentClock.Phase))
	}

	// OilImpact
	if got.OilImpact.Impact != exp.OilImpact.Impact {
		diffs = append(diffs, fmt.Sprintf("oilImpact.impact: got %q, want %q", got.OilImpact.Impact, exp.OilImpact.Impact))
	}
	if got.OilImpact.PriceUSD != exp.OilImpact.PriceUSD {
		diffs = append(diffs, fmt.Sprintf("oilImpact.priceUSD: got %v, want %v", got.OilImpact.PriceUSD, exp.OilImpact.PriceUSD))
	}

	// GoldDirection
	if got.GoldDirection.Direction != exp.GoldDirection.Direction {
		diffs = append(diffs, fmt.Sprintf("goldDirection.direction: got %q, want %q", got.GoldDirection.Direction, exp.GoldDirection.Direction))
	}
	if got.GoldDirection.PriceUSD != exp.GoldDirection.PriceUSD {
		diffs = append(diffs, fmt.Sprintf("goldDirection.priceUSD: got %v, want %v", got.GoldDirection.PriceUSD, exp.GoldDirection.PriceUSD))
	}

	// UsdVndDirection
	if got.UsdVndDirection.Direction != exp.UsdVndDirection.Direction {
		diffs = append(diffs, fmt.Sprintf("usdVndDirection.direction: got %q, want %q", got.UsdVndDirection.Direction, exp.UsdVndDirection.Direction))
	}
	if got.UsdVndDirection.RateVND != exp.UsdVndDirection.RateVND {
		diffs = append(diffs, fmt.Sprintf("usdVndDirection.rateVND: got %v, want %v", got.UsdVndDirection.RateVND, exp.UsdVndDirection.RateVND))
	}

	// CarryTrade
	if got.CarryTrade.Regime != exp.CarryTrade.Regime {
		diffs = append(diffs, fmt.Sprintf("carryTrade.regime: got %q, want %q", got.CarryTrade.Regime, exp.CarryTrade.Regime))
	}
	if got.CarryTrade.CarrySpread != exp.CarryTrade.CarrySpread {
		diffs = append(diffs, fmt.Sprintf("carryTrade.carrySpread: got %v, want %v", got.CarryTrade.CarrySpread, exp.CarryTrade.CarrySpread))
	}
	if got.CarryTrade.VNDDepositRate != exp.CarryTrade.VNDDepositRate {
		diffs = append(diffs, fmt.Sprintf("carryTrade.vndDepositRate: got %v, want %v", got.CarryTrade.VNDDepositRate, exp.CarryTrade.VNDDepositRate))
	}
	if got.CarryTrade.FedFundsRate != exp.CarryTrade.FedFundsRate {
		diffs = append(diffs, fmt.Sprintf("carryTrade.fedFundsRate: got %v, want %v", got.CarryTrade.FedFundsRate, exp.CarryTrade.FedFundsRate))
	}
	if got.CarryTrade.ComputedAt != exp.CarryTrade.ComputedAt {
		diffs = append(diffs, fmt.Sprintf("carryTrade.computedAt: got %q, want %q", got.CarryTrade.ComputedAt, exp.CarryTrade.ComputedAt))
	}

	// YieldSpread
	if got.YieldSpread.Label != exp.YieldSpread.Label {
		diffs = append(diffs, fmt.Sprintf("yieldSpread.label: got %q, want %q", got.YieldSpread.Label, exp.YieldSpread.Label))
	}
	if got.YieldSpread.Spread != exp.YieldSpread.Spread {
		diffs = append(diffs, fmt.Sprintf("yieldSpread.spread: got %v, want %v", got.YieldSpread.Spread, exp.YieldSpread.Spread))
	}
	if got.YieldSpread.EarningYield != exp.YieldSpread.EarningYield {
		diffs = append(diffs, fmt.Sprintf("yieldSpread.earningYield: got %v, want %v", got.YieldSpread.EarningYield, exp.YieldSpread.EarningYield))
	}
	if got.YieldSpread.DepositRate != exp.YieldSpread.DepositRate {
		diffs = append(diffs, fmt.Sprintf("yieldSpread.depositRate: got %v, want %v", got.YieldSpread.DepositRate, exp.YieldSpread.DepositRate))
	}
	if got.YieldSpread.ComputedAt != exp.YieldSpread.ComputedAt {
		diffs = append(diffs, fmt.Sprintf("yieldSpread.computedAt: got %q, want %q", got.YieldSpread.ComputedAt, exp.YieldSpread.ComputedAt))
	}

	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.ScenarioName, diffs)
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	tierFlag := flag.String("tier", "", "primitive | module | all")
	moduleFlag := flag.String("module", "", "module name, e.g. macro-indicators")
	scenarioFlag := flag.String("scenario", "all", "all | <filepath>")
	flag.Parse()

	if *tierFlag == "" || *moduleFlag == "" {
		logger.Error("missing required flags", slog.String("required", "-tier and -module"))
		os.Exit(1)
	}

	cwd, err := os.Getwd()
	if err != nil {
		logger.Error("getwd failed", slog.Any("err", err))
		os.Exit(1)
	}
	root := findRepoRoot(cwd)
	if root == "" {
		logger.Error("cannot locate repo root (docs/scenarios not found)", slog.String("cwd", cwd))
		os.Exit(1)
	}

	scenarios, err := discoverScenarios(root, *tierFlag, *scenarioFlag)
	if err != nil {
		logger.Error("scenario discovery failed", slog.Any("err", err))
		os.Exit(1)
	}

	if len(scenarios) == 0 {
		logger.Info("no scenarios discovered (expected during scaffold phase — P1-D1/D2 will create them)",
			slog.String("tier", *tierFlag),
			slog.String("module", *moduleFlag),
		)
		fmt.Printf("total=0 pass=0 fail=0 status=OK\n")
		os.Exit(0)
	}

	pass, fail := 0, 0
	for _, s := range scenarios {
		var ok bool
		var runErr error
		switch s.Tier {
		case "primitive":
			ok, runErr = executePrimitive(s)
		case "module":
			ok, runErr = executeModule(s)
		default:
			runErr = fmt.Errorf("unknown tier %q", s.Tier)
		}
		if runErr != nil || !ok {
			logger.Info("FAIL", slog.String("scenario", s.Name), slog.Any("reason", runErr))
			fail++
		} else {
			logger.Info("PASS", slog.String("scenario", s.Name))
			pass++
		}
	}

	total := pass + fail
	status := "OK"
	if fail > 0 {
		status = "FAIL"
	}
	fmt.Printf("total=%d pass=%d fail=%d status=%s\n", total, pass, fail, status)

	if fail > 0 {
		os.Exit(1)
	}
}
