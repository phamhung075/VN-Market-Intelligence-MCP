// cmd/sandbox — unit tests for the runner diff logic.
// Tests the comparison helpers independent of file I/O.
//
// P1-E2 — feat(ta-sandbox): credential-free scenario runner
package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// floatEq / diffFloat tests
// ---------------------------------------------------------------------------

func TestFloatEq(t *testing.T) {
	cases := []struct {
		a, b, tol float64
		want      bool
	}{
		{1.0, 1.0, 1e-3, true},
		{1.0, 1.0005, 1e-3, true},  // within tolerance
		{1.0, 1.002, 1e-3, false},  // outside tolerance
		{0.0, 0.0, 1e-10, true},
		{100.0, 100.0001, 1e-3, true},
		{66.6667, 66.6666, 1e-3, true},  // diff = 0.0001 < 0.001 = within tolerance
	}
	for _, c := range cases {
		got := floatEq(c.a, c.b, c.tol)
		if got != c.want {
			t.Errorf("floatEq(%.6f, %.6f, %.0e) = %v, want %v", c.a, c.b, c.tol, got, c.want)
		}
	}
}

func TestDiffFloat_NoDiff(t *testing.T) {
	var diffs []string
	diffFloat("label", 66.6667, 66.6667, 1e-3, &diffs)
	if len(diffs) != 0 {
		t.Errorf("expected no diff, got %v", diffs)
	}
}

func TestDiffFloat_WithDiff(t *testing.T) {
	var diffs []string
	diffFloat("rsi[0]", 66.0, 70.0, 1e-3, &diffs)
	if len(diffs) != 1 {
		t.Errorf("expected 1 diff, got %d: %v", len(diffs), diffs)
	}
	if !strings.Contains(diffs[0], "rsi[0]") {
		t.Errorf("diff should contain label, got: %s", diffs[0])
	}
}

func TestDiffLen(t *testing.T) {
	var diffs []string
	diffLen("rsi", 6, 6, &diffs)
	if len(diffs) != 0 {
		t.Errorf("expected no diff for equal lengths, got %v", diffs)
	}

	diffLen("rsi", 5, 6, &diffs)
	if len(diffs) != 1 {
		t.Errorf("expected 1 diff for unequal lengths, got %d", len(diffs))
	}
}

// ---------------------------------------------------------------------------
// generateFromPattern tests
// ---------------------------------------------------------------------------

func TestGenerateFromPattern_FlatRamp(t *testing.T) {
	closes := generateFromPattern(60, "flat[0..29]=100.0; ramp[30..59]=100.0+(i-29)*2.0")
	if len(closes) != 60 {
		t.Fatalf("expected 60 closes, got %d", len(closes))
	}
	// First 30 should be 100
	for i := 0; i < 30; i++ {
		if closes[i] != 100.0 {
			t.Errorf("closes[%d] = %.2f, want 100.0", i, closes[i])
		}
	}
	// Bar 30 should be 100.0 + 1*2.0 = 102.0
	if closes[30] != 102.0 {
		t.Errorf("closes[30] = %.2f, want 102.0", closes[30])
	}
	// Bar 59 should be 100.0 + 30*2.0 = 160.0
	if closes[59] != 160.0 {
		t.Errorf("closes[59] = %.2f, want 160.0", closes[59])
	}
}

func TestGenerateFromPattern_BullishCross(t *testing.T) {
	// Bullish cross: flat 100 (30), decline -2/bar (15), rally +5/bar (15)
	closes := generateFromPattern(60, "flat[0..29]=100; decline[30..44]=100-2*(i-29); rally[45..59]=prev+5")
	if len(closes) != 60 {
		t.Fatalf("expected 60 closes, got %d", len(closes))
	}
	// Flat portion
	if closes[0] != 100.0 || closes[29] != 100.0 {
		t.Errorf("flat portion wrong: closes[0]=%.2f, closes[29]=%.2f", closes[0], closes[29])
	}
	// Decline: bar 30 = 100 - 2*1 = 98
	if closes[30] != 98.0 {
		t.Errorf("decline bar 30: got %.2f, want 98.0", closes[30])
	}
	// Rally: bar 45 = closes[44] + 5
	if closes[45] != closes[44]+5.0 {
		t.Errorf("rally bar 45: got %.2f, want %.2f", closes[45], closes[44]+5.0)
	}
}

func TestGenerateFromPattern_BearishCross(t *testing.T) {
	// Bearish cross: flat 100 (30), rise +2/bar (15), decline -5/bar (15)
	closes := generateFromPattern(60, "flat[0..29]=100; rise[30..44]=100+2*(i-29); decline[45..59]=prev-5")
	if len(closes) != 60 {
		t.Fatalf("expected 60 closes, got %d", len(closes))
	}
	if closes[30] != 102.0 {
		t.Errorf("rise bar 30: got %.2f, want 102.0", closes[30])
	}
	if closes[45] != closes[44]-5.0 {
		t.Errorf("decline bar 45: got %.2f, want %.2f", closes[45], closes[44]-5.0)
	}
}

// ---------------------------------------------------------------------------
// generateDeclineRally tests
// ---------------------------------------------------------------------------

func TestGenerateDeclineRally(t *testing.T) {
	closes := generateDeclineRally(50)
	if len(closes) != 50 {
		t.Fatalf("expected 50 closes, got %d", len(closes))
	}
	// First bar: 50.0
	if closes[0] != 50.0 {
		t.Errorf("closes[0] = %.2f, want 50.0", closes[0])
	}
	// Bar 19: 50.0 - 19*0.8 = 34.8
	want19 := 50.0 - 19.0*0.8
	if closes[19] != want19 {
		t.Errorf("closes[19] = %.2f, want %.2f", closes[19], want19)
	}
	// Bar 20: rally starts = closes[19] + 0.9
	if closes[20] != closes[19]+0.9 {
		t.Errorf("closes[20] = %.2f, want %.2f (rally start)", closes[20], closes[19]+0.9)
	}
	// Rally: each bar increases by 0.9
	for i := 21; i < 50; i++ {
		if closes[i] != closes[i-1]+0.9 {
			t.Errorf("closes[%d] = %.4f, want %.4f (rally step)", i, closes[i], closes[i-1]+0.9)
			break
		}
	}
}

// ---------------------------------------------------------------------------
// safeIdx tests
// ---------------------------------------------------------------------------

func TestSafeIdx(t *testing.T) {
	s := []float64{1.0, 2.0, 3.0}
	if safeIdx(s, 0) != 1.0 {
		t.Error("safeIdx(s, 0) should be 1.0")
	}
	if safeIdx(s, -1) != 3.0 {
		t.Error("safeIdx(s, -1) should be last element 3.0")
	}
	if safeIdx(nil, 0) != 0.0 {
		t.Error("safeIdx(nil, 0) should be 0.0")
	}
	if safeIdx(s, 10) != 0.0 {
		t.Error("safeIdx out of range should return 0.0")
	}
}

// ---------------------------------------------------------------------------
// RSI scenario runner integration tests
// ---------------------------------------------------------------------------

func TestRunRSI_Golden(t *testing.T) {
	raw := &RawScenario{
		Primitive: "CalculateRSI",
	}
	inputJSON := `{"closes":[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.15,43.61,44.33,44.83,45.85,46.08,45.89,46.03,46.41,45.98,45.77,45.35,46.03],"period":14}`
	expectedJSON := `{"rsi":[62.5557,64.7021,60.4775,58.4697,54.5677,59.3031],"tolerance":1.0,"length":6,"rangeMin":0,"rangeMax":100}`
	raw.Input = json.RawMessage(inputJSON)
	raw.Expected = json.RawMessage(expectedJSON)

	_, diffs, err := runRSI(raw)
	if err != nil {
		t.Fatalf("runRSI error: %v", err)
	}
	if len(diffs) > 0 {
		t.Errorf("expected green, got diffs: %v", diffs)
	}
}

func TestRunRSI_HonestRed(t *testing.T) {
	// Test A: honest red — deliberately wrong expected RSI value.
	raw := &RawScenario{
		Primitive: "CalculateRSI",
	}
	inputJSON := `{"closes":[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.15,43.61,44.33,44.83,45.85,46.08,45.89,46.03,46.41,45.98,45.77,45.35,46.03],"period":14}`
	// Corrupted expected: first RSI value should be ~62.5 but we put 0.0
	corruptedJSON := `{"rsi":[0.0,64.7021,60.4775,58.4697,54.5677,59.3031],"tolerance":1.0,"length":6}`
	raw.Input = json.RawMessage(inputJSON)
	raw.Expected = json.RawMessage(corruptedJSON)

	_, diffs, err := runRSI(raw)
	if err != nil {
		t.Fatalf("runRSI error: %v", err)
	}
	if len(diffs) == 0 {
		t.Error("expected RED (diffs) on corrupted expected RSI, got GREEN")
	}
	if !strings.Contains(diffs[0], "rsi[0]") {
		t.Errorf("diff should mention rsi[0], got: %v", diffs)
	}
}

func TestRunRSI_Failure_ErrorExpected(t *testing.T) {
	raw := &RawScenario{
		Primitive: "CalculateRSI",
	}
	// Only 3 closes with period 14 — should return error.
	inputJSON := `{"closes":[44.34,44.09,44.15],"period":14}`
	errorStr := "ErrInsufficientData"
	expectedJSON := `{"rsi":null,"error":"` + errorStr + `"}`
	raw.Input = json.RawMessage(inputJSON)
	raw.Expected = json.RawMessage(expectedJSON)

	_, diffs, err := runRSI(raw)
	if err != nil {
		t.Fatalf("runRSI error: %v", err)
	}
	// Expect error → GREEN (error occurred as expected)
	if len(diffs) > 0 {
		t.Errorf("expected GREEN when error is expected and produced, got diffs: %v", diffs)
	}
}

// ---------------------------------------------------------------------------
// BB scenario runner integration test
// ---------------------------------------------------------------------------

func TestRunBB_Golden_FirstWindow(t *testing.T) {
	raw := &RawScenario{
		Primitive: "CalculateBollingerBands",
	}
	inputJSON := `{"closes":[10.0,11.0,12.0,10.5,11.5,13.0,12.5,11.0,10.0,12.0,13.5,14.0,13.0,12.5,11.5,12.0,13.0,14.5,15.0,14.0],"period":5,"multiplier":2.0}`
	expectedJSON := `{"upper":[12.414214,13.320465,13.620465,13.554724,13.735416,13.854066,14.216609,15.093326,15.328427,14.414214,14.620465,14.320465,13.566190,14.759126,15.927636,15.854066],"middle":[11.0,11.6,11.9,11.7,11.6,11.7,11.8,12.1,12.5,13.0,12.9,12.6,12.4,12.7,13.2,13.7],"lower":[9.585786,9.879535,10.179535,9.845276,9.464584,9.545934,9.383391,9.106674,9.671573,11.585786,11.179535,10.879535,11.233810,10.640874,10.472364,11.545934],"length":16,"tolerance":0.000001}`
	raw.Input = json.RawMessage(inputJSON)
	raw.Expected = json.RawMessage(expectedJSON)

	_, diffs, err := runBB(raw)
	if err != nil {
		t.Fatalf("runBB error: %v", err)
	}
	if len(diffs) > 0 {
		t.Errorf("expected GREEN for BB golden scenario, got diffs: %v", diffs)
	}
}

// ---------------------------------------------------------------------------
// DetectCross runner integration test
// ---------------------------------------------------------------------------

func TestRunDetectCross_Golden(t *testing.T) {
	raw := &RawScenario{
		Primitive: "DetectCross",
	}
	inputJSON := `{"fastLine":[1.0,2.0,4.0,4.0,4.0,2.0,1.0,1.0],"slowLine":[3.0,3.0,3.0,3.0,3.0,3.0,3.0,3.0]}`
	expectedJSON := `{"events":[{"index":2,"direction":"bullish"},{"index":5,"direction":"bearish"}],"eventCount":2}`
	raw.Input = json.RawMessage(inputJSON)
	raw.Expected = json.RawMessage(expectedJSON)

	_, diffs, err := runDetectCross(raw)
	if err != nil {
		t.Fatalf("runDetectCross error: %v", err)
	}
	if len(diffs) > 0 {
		t.Errorf("expected GREEN for cross golden scenario, got diffs: %v", diffs)
	}
}

// ---------------------------------------------------------------------------
// resolveScenarioPath tests
// ---------------------------------------------------------------------------

func TestResolveScenarioPath_AbsolutePath(t *testing.T) {
	// When an absolute path is given, resolveScenarioPath must return it as-is,
	// regardless of tier or repo-root resolution. This prevents path doubling
	// (e.g. /base/dir + /abs/path → /base/dir/abs/path was the old bug).
	absPath := "/tmp/my-scenario.json"
	got, err := resolveScenarioPath("primitive", absPath)
	if err != nil {
		t.Fatalf("resolveScenarioPath with absolute path returned error: %v", err)
	}
	if got != absPath {
		t.Errorf("resolveScenarioPath(%q) = %q, want %q (must be returned as-is)", absPath, got, absPath)
	}
}

func TestResolveScenarioPath_RelativePath(t *testing.T) {
	// A relative name (no leading /) must be prefixed with the base directory.
	// We call with a name that won't exist — we only verify the returned path
	// ends with the expected suffix (base is determined by tier + repo root).
	got, err := resolveScenarioPath("primitive", "rsi-golden")
	if err != nil {
		// Acceptable: repo root may not be found in the test environment.
		// The important thing is it did NOT return the bare "rsi-golden" unchanged.
		t.Logf("resolveScenarioPath (relative) returned err (acceptable in sandbox env): %v", err)
		return
	}
	// If resolution succeeded, the path must NOT equal the bare input.
	if got == "rsi-golden" || got == "rsi-golden.json" {
		t.Errorf("resolveScenarioPath(%q) = %q — relative path was not prefixed with base dir", "rsi-golden", got)
	}
	// Must have .json suffix.
	if len(got) < 5 || got[len(got)-5:] != ".json" {
		t.Errorf("resolveScenarioPath(%q) = %q — result must end in .json", "rsi-golden", got)
	}
}

// ---------------------------------------------------------------------------
// Env audit gate test
// ---------------------------------------------------------------------------

func TestForbiddenEnvPrefixes(t *testing.T) {
	// Verify the sentinel list covers required keywords from the security clause.
	required := []string{"DB_", "API_KEY", "SECRET", "TOKEN", "PASSWORD"}
	for _, req := range required {
		found := false
		for _, prefix := range forbiddenEnvPrefixes {
			if prefix == req {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("forbiddenEnvPrefixes missing required prefix %q", req)
		}
	}
}
