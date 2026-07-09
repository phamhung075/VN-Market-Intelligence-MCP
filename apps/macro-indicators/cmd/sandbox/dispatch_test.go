// dispatch_test.go — light coverage of the sandbox's dispatch logic: which
// executor a scenario JSON's "primitive" / "module" / "scenario_type" field
// routes to.
//
// FACTORY-MACRO-split-sandbox (2026-07-09): cmd/sandbox had zero test coverage
// pre-split. These tests exercise executePrimitive, executeModule, and
// executeMacroSignals' dispatch switches directly (not full round-trip numeric
// assertions against real fixtures — docs/scenarios/macro-indicators/**/*.json
// already covers that via the sandbox's own PASS/FAIL harness). Where a real
// computed value would be needed to prove a specific sub-executor ran, tests
// instead assert on the distinguishing shape of the returned error (each
// executor wraps errors differently — see compareFields callers in
// primitives.go/module.go) rather than hand-computing expected primitive output.
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeScenario(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatalf("write scenario %s: %v", p, err)
	}
	return p
}

// TestExecutePrimitive_DispatchesByPrimitiveField confirms each of the 6
// "primitive" field values routes to a working executor (shouldPass=false is a
// graceful-degradation PASS for every primitive — see primitives.go).
func TestExecutePrimitive_DispatchesByPrimitiveField(t *testing.T) {
	dir := t.TempDir()
	cases := []struct {
		name      string
		primitive string
	}{
		{"investment clock", "macro_investment_clock"},
		{"oil impact", "macro_oil_impact_classifier"},
		{"gold direction", "macro_gold_direction_classifier"},
		{"usdvnd direction", "macro_usdvnd_direction_classifier"},
		{"carry trade", "macro_carry_trade_signal"},
		{"yield spread", "macro_yield_spread_signal"},
	}
	for _, tc := range cases {
		t.Run(tc.primitive, func(t *testing.T) {
			body := `{"name":"dispatch-probe","primitive":"` + tc.primitive + `","shouldPass":false,"input":{}}`
			fileName := tc.primitive + "-dispatch.json"
			p := writeScenario(t, dir, fileName, body)

			ok, err := executePrimitive(Scenario{Path: p, Name: fileName, Tier: "primitive"})
			if err != nil {
				t.Fatalf("executePrimitive(%s) unexpected error: %v", tc.primitive, err)
			}
			if !ok {
				t.Fatalf("executePrimitive(%s) = false, want true (shouldPass=false must PASS via graceful degradation)", tc.primitive)
			}
		})
	}
}

func TestExecutePrimitive_UnknownPrimitiveErrors(t *testing.T) {
	dir := t.TempDir()
	p := writeScenario(t, dir, "unknown.json", `{"name":"x","primitive":"macro_does_not_exist","shouldPass":false}`)

	_, err := executePrimitive(Scenario{Path: p, Name: "unknown.json", Tier: "primitive"})
	if err == nil || !strings.Contains(err.Error(), "unknown primitive") {
		t.Fatalf("executePrimitive(unknown) error = %v, want 'unknown primitive'", err)
	}
}

func TestExecutePrimitive_MissingFieldInfersFromFilename(t *testing.T) {
	dir := t.TempDir()
	fileName := "macro-investment-clock-legacy.json"
	p := writeScenario(t, dir, fileName, `{"name":"x","shouldPass":false}`)

	ok, err := executePrimitive(Scenario{Path: p, Name: fileName, Tier: "primitive"})
	if err != nil || !ok {
		t.Fatalf("executePrimitive(legacy filename, no primitive field) = (%v, %v), want (true, nil)", ok, err)
	}
}

func TestExecutePrimitive_MissingFieldNoInferenceErrors(t *testing.T) {
	dir := t.TempDir()
	fileName := "unrelated-name.json"
	p := writeScenario(t, dir, fileName, `{"name":"x","shouldPass":false}`)

	_, err := executePrimitive(Scenario{Path: p, Name: fileName, Tier: "primitive"})
	if err == nil || !strings.Contains(err.Error(), "missing 'primitive' field") {
		t.Fatalf("executePrimitive(no field, unrecognized filename) error = %v, want missing-field error", err)
	}
}

// TestExecuteModule_DispatchesMacroSignalsToLegacyBatch confirms executeModule
// routes module="macro_signals" to executeMacroSignals, which in turn defaults
// to the legacy classify_batch executor when scenario_type is absent. An empty
// indicator_names list with expected batch_count=0 is a trivially-true
// comparison — nil error proves the batch executor ran and returned early
// rather than the build executor (which requires investmentClock/etc. keys).
func TestExecuteModule_DispatchesMacroSignalsToLegacyBatch(t *testing.T) {
	dir := t.TempDir()
	body := `{"scenario_name":"x","module":"macro_signals","input":{"indicator_names":[]},"expected_output":{"batch_count":0,"classifications":[]}}`
	fileName := "module-dispatch.json"
	p := writeScenario(t, dir, fileName, body)

	ok, err := executeModule(Scenario{Path: p, Name: fileName, Tier: "module"})
	if err != nil || !ok {
		t.Fatalf("executeModule(macro_signals, no scenario_type) = (%v, %v), want (true, nil)", ok, err)
	}
}

// TestExecuteMacroSignals_BuildScenarioTypeRoutesToBuildExecutor deliberately
// supplies a wrong expected value so the returned error's "scenario %q" wrap
// (unique to executeMacroSignalsBuild — the batch executor wraps with
// "batch_count:"/"classification[i]:" instead) proves scenario_type=
// "build_macro_signals" routed to the build executor, without needing to
// hand-compute real primitive output.
func TestExecuteMacroSignals_BuildScenarioTypeRoutesToBuildExecutor(t *testing.T) {
	body := `{"scenario_name":"build-dispatch-probe","module":"macro_signals","scenario_type":"build_macro_signals",` +
		`"input":{},"expected_output":{"investmentClock":{"tier":"__impossible_value__"}}}`

	_, err := executeMacroSignals([]byte(body))
	if err == nil || !strings.Contains(err.Error(), `scenario "build-dispatch-probe"`) {
		t.Fatalf("executeMacroSignals(build_macro_signals) error = %v, want scenario-name-wrapped error", err)
	}
}

func TestExecuteModule_UnknownModuleErrors(t *testing.T) {
	dir := t.TempDir()
	fileName := "unknown-module.json"
	p := writeScenario(t, dir, fileName, `{"module":"macro_does_not_exist"}`)

	_, err := executeModule(Scenario{Path: p, Name: fileName, Tier: "module"})
	if err == nil || !strings.Contains(err.Error(), "unknown module") {
		t.Fatalf("executeModule(unknown) error = %v, want 'unknown module'", err)
	}
}

func TestExecuteModule_MissingFieldInfersFromFilename(t *testing.T) {
	dir := t.TempDir()
	fileName := "macro-signals-legacy.json"
	body := `{"scenario_name":"x","input":{"indicator_names":[]},"expected_output":{"batch_count":0,"classifications":[]}}`
	p := writeScenario(t, dir, fileName, body)

	ok, err := executeModule(Scenario{Path: p, Name: fileName, Tier: "module"})
	if err != nil || !ok {
		t.Fatalf("executeModule(legacy filename, no module field) = (%v, %v), want (true, nil)", ok, err)
	}
}
