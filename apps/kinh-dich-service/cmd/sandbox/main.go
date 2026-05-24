// Package main provides the sandbox runner for kinh-dich-service scenario verification.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=<file|all>
//	go run ./cmd/sandbox -tier=module -module=kinh-dich -scenario=<file|all>
//
// The sandbox runner executes scenario JSON files against Go primitives/modules
// and verifies outputs match expected values.
//
// Security clause: This sandbox runs with ZERO DB credentials, ZERO API keys.
// CGO_ENABLED=0 enforced. Pure JSON-in -> trace-JSON-out.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/module/reading_composer"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hao_encoder"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hexagram_resolver"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/ngu_hanh_classifier"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/nuclear_hexagram"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/reading_scorer"
)

var (
	tier          = flag.String("tier", "primitive", "Tier to test: primitive, module, or all")
	module        = flag.String("module", "kinh-dich", "Module name (kinh-dich)")
	scenario      = flag.String("scenario", "all", "Scenario file name or 'all'")
	emitTraces    = flag.Bool("emit-traces", false, "Emit JSON traces to dashboard/sandbox-traces.js for dashboard loading")
	emitReference = flag.Bool("emit-reference", false, "Emit 64-que reference data to dashboard/que-reference.js")
)

// ScenarioTrace holds the result of a single scenario execution for dashboard rendering.
type ScenarioTrace struct {
	Scenario string `json:"scenario"`
	Tier     string `json:"tier"`
	Status   string `json:"status"` // "pass" or "fail"
	Error    string `json:"error,omitempty"`
}

// TraceOutput is the full trace artifact written for dashboard consumption.
type TraceOutput struct {
	GeneratedAt string          `json:"generatedAt"`
	CommitHash  string          `json:"commitHash"`
	Primitives  []ScenarioTrace `json:"primitives"`
	Modules     []ScenarioTrace `json:"modules"`
	Summary     struct {
		Total  int `json:"total"`
		Passed int `json:"passed"`
		Failed int `json:"failed"`
	} `json:"summary"`
}

func main() {
	flag.Parse()

	// Handle -emit-reference flag (generate que-reference.js)
	if *emitReference {
		if err := emitReferenceFile(); err != nil {
			fmt.Printf("ERROR: Failed to emit reference: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Find scenario directory relative to project root
	scenarioDir := findScenarioDir()
	if scenarioDir == "" {
		fmt.Println("ERROR: Could not find scenarios directory")
		os.Exit(1)
	}

	// Determine which tiers to run
	var tiersToRun []string
	switch *tier {
	case "primitive":
		tiersToRun = []string{"primitive"}
	case "module":
		tiersToRun = []string{"module"}
	case "all":
		tiersToRun = []string{"primitive", "module"}
	default:
		fmt.Printf("ERROR: Unknown tier %q (use primitive, module, or all)\n", *tier)
		os.Exit(1)
	}

	totalPassed := 0
	totalFailed := 0
	var allFailures []string
	var primitiveTraces []ScenarioTrace
	var moduleTraces []ScenarioTrace

	for _, currentTier := range tiersToRun {
		var subDir string
		if currentTier == "primitive" {
			subDir = "primitives"
		} else {
			subDir = "module"
		}

		scenarioPath := filepath.Join(scenarioDir, subDir)

		var files []string
		if *scenario == "all" {
			entries, err := os.ReadDir(scenarioPath)
			if err != nil {
				fmt.Printf("ERROR: Cannot read scenario directory: %v\n", err)
				os.Exit(1)
			}
			for _, e := range entries {
				if strings.HasSuffix(e.Name(), ".json") {
					files = append(files, filepath.Join(scenarioPath, e.Name()))
				}
			}
		} else {
			files = []string{filepath.Join(scenarioPath, *scenario)}
		}

		for _, f := range files {
			name := filepath.Base(f)
			scenarioName := strings.TrimSuffix(name, ".json")
			result, err := runScenario(f)

			trace := ScenarioTrace{
				Scenario: scenarioName,
				Tier:     currentTier,
			}

			if err != nil {
				fmt.Printf("  [RED]  %s: %v\n", name, err)
				totalFailed++
				allFailures = append(allFailures, name)
				trace.Status = "fail"
				trace.Error = err.Error()
			} else if result {
				fmt.Printf("  [GREEN] %s\n", name)
				totalPassed++
				trace.Status = "pass"
			} else {
				fmt.Printf("  [RED]  %s: output mismatch\n", name)
				totalFailed++
				allFailures = append(allFailures, name)
				trace.Status = "fail"
				trace.Error = "output mismatch"
			}

			if currentTier == "primitive" {
				primitiveTraces = append(primitiveTraces, trace)
			} else {
				moduleTraces = append(moduleTraces, trace)
			}
		}
	}

	fmt.Printf("\n=== SANDBOX SUMMARY ===\n")
	fmt.Printf("Tier: %s\n", *tier)
	fmt.Printf("Passed: %d/%d\n", totalPassed, totalPassed+totalFailed)
	if totalFailed > 0 {
		fmt.Printf("Failed: %v\n", allFailures)
	} else {
		fmt.Println("All scenarios GREEN")
	}

	// Emit traces if requested
	if *emitTraces {
		if err := emitTracesFile(primitiveTraces, moduleTraces, totalPassed, totalFailed); err != nil {
			fmt.Printf("ERROR: Failed to emit traces: %v\n", err)
			os.Exit(1)
		}
	}

	if totalFailed > 0 {
		os.Exit(1)
	}
}

// emitTracesFile writes sandbox-traces.js for dashboard loading
func emitTracesFile(primitives, modules []ScenarioTrace, passed, failed int) error {
	// Get commit hash
	commitHash := getCommitHash()

	traceOutput := TraceOutput{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		CommitHash:  commitHash,
		Primitives:  primitives,
		Modules:     modules,
	}
	traceOutput.Summary.Total = passed + failed
	traceOutput.Summary.Passed = passed
	traceOutput.Summary.Failed = failed

	jsonBytes, err := json.MarshalIndent(traceOutput, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal trace output: %w", err)
	}

	// Find dashboard directory
	dashboardDir := findDashboardDir()
	if dashboardDir == "" {
		return fmt.Errorf("could not find dashboard directory")
	}

	// Write as JS const for file:// loading (CORS-safe)
	jsContent := fmt.Sprintf(`// AUTO-GENERATED by: CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -scenario=all -emit-traces
// Generated at: %s
// Commit: %s
// DO NOT EDIT MANUALLY — re-run sandbox with -emit-traces to regenerate
// G8 honesty: this file reflects REAL sandbox execution results, not hardcoded values
window.__SANDBOX_TRACES__ = %s;
`, traceOutput.GeneratedAt, commitHash, string(jsonBytes))

	tracesPath := filepath.Join(dashboardDir, "sandbox-traces.js")
	if err := os.WriteFile(tracesPath, []byte(jsContent), 0644); err != nil {
		return fmt.Errorf("write traces file: %w", err)
	}

	fmt.Printf("\n=== TRACES EMITTED ===\n")
	fmt.Printf("File: %s\n", tracesPath)
	fmt.Printf("Scenarios: %d total (%d passed, %d failed)\n", passed+failed, passed, failed)
	fmt.Printf("Commit: %s\n", commitHash)
	fmt.Printf("Timestamp: %s\n", traceOutput.GeneratedAt)

	return nil
}

// emitReferenceFile writes que-reference.js for dashboard loading
func emitReferenceFile() error {
	// Get commit hash
	commitHash := getCommitHash()

	// Get all references
	refs := reading_composer.GetAllQueReferences()
	if len(refs) != 64 {
		return fmt.Errorf("expected 64 references, got %d", len(refs))
	}

	jsonBytes, err := json.MarshalIndent(refs, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal reference data: %w", err)
	}

	// Find dashboard directory
	dashboardDir := findDashboardDir()
	if dashboardDir == "" {
		return fmt.Errorf("could not find dashboard directory")
	}

	// Write as JS const for file:// loading (CORS-safe)
	generatedAt := time.Now().UTC().Format(time.RFC3339)
	jsContent := fmt.Sprintf(`// AUTO-GENERATED by: CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference
// Generated at: %s
// Commit: %s
// DO NOT EDIT MANUALLY — re-run: CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference
window.__QUE_REFERENCE__ = %s;
`, generatedAt, commitHash, string(jsonBytes))

	refPath := filepath.Join(dashboardDir, "que-reference.js")
	if err := os.WriteFile(refPath, []byte(jsContent), 0644); err != nil {
		return fmt.Errorf("write reference file: %w", err)
	}

	fmt.Printf("\n=== REFERENCE EMITTED ===\n")
	fmt.Printf("File: %s\n", refPath)
	fmt.Printf("Entries: %d hexagrams\n", len(refs))
	fmt.Printf("Commit: %s\n", commitHash)
	fmt.Printf("Timestamp: %s\n", generatedAt)

	return nil
}

// getCommitHash returns the current git commit hash (short form)
func getCommitHash() string {
	// Try to read from git
	cwd, _ := os.Getwd()
	dir := cwd
	for i := 0; i < 10; i++ {
		gitDir := filepath.Join(dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			// Found .git, try to read HEAD
			headPath := filepath.Join(gitDir, "HEAD")
			headBytes, err := os.ReadFile(headPath)
			if err == nil {
				head := strings.TrimSpace(string(headBytes))
				// If it's a ref, resolve it
				if strings.HasPrefix(head, "ref: ") {
					refPath := filepath.Join(gitDir, strings.TrimPrefix(head, "ref: "))
					refBytes, err := os.ReadFile(refPath)
					if err == nil {
						hash := strings.TrimSpace(string(refBytes))
						if len(hash) >= 8 {
							return hash[:8]
						}
					}
				} else if len(head) >= 8 {
					return head[:8]
				}
			}
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "unknown"
}

// findDashboardDir finds the dashboard directory relative to cwd
func findDashboardDir() string {
	cwd, _ := os.Getwd()

	// Walk up to find apps/kinh-dich-service/dashboard
	dir := cwd
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "apps", "kinh-dich-service", "dashboard")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		// Also check if we're already in kinh-dich-service
		candidate = filepath.Join(dir, "dashboard")
		if _, err := os.Stat(candidate); err == nil {
			// Verify it's the right dashboard by checking for index.html
			if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
				return candidate
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

func findScenarioDir() string {
	// Get the directory of the current working directory
	cwd, _ := os.Getwd()

	// Walk up the directory tree to find docs/scenarios/kinh-dich
	dir := cwd
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "docs", "scenarios", "kinh-dich")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	// Try relative paths from typical run locations
	candidates := []string{
		"docs/scenarios/kinh-dich",
		"../../docs/scenarios/kinh-dich",
		"../../../docs/scenarios/kinh-dich",
	}
	for _, c := range candidates {
		abs := filepath.Join(cwd, c)
		if _, err := os.Stat(abs); err == nil {
			return abs
		}
	}
	return ""
}

func runScenario(path string) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}

	var sc map[string]interface{}
	if err := json.Unmarshal(data, &sc); err != nil {
		return false, err
	}

	// Check if this is a module-tier scenario
	tierVal, _ := sc["tier"].(string)
	moduleVal, _ := sc["module"].(string)
	if tierVal == "module" && moduleVal == "reading_composer" {
		return runReadingComposerScenario(sc)
	}

	primitive, _ := sc["primitive"].(string)
	expectError, _ := sc["expect_error"].(bool)
	input, _ := sc["input"].(map[string]interface{})
	expected, _ := sc["expected"].(map[string]interface{})

	switch primitive {
	case "hao-encoder":
		return runHaoEncoderScenario(input, expected, expectError)
	case "hexagram-resolver":
		return runHexagramResolverScenario(input, expected, expectError)
	case "ngu-hanh-classifier":
		return runNguHanhClassifierScenario(input, expected, expectError)
	case "reading-scorer":
		return runReadingScorerScenario(input, expected, expectError)
	case "nuclear-hexagram-computer":
		return runNuclearHexagramScenario(input, expected, expectError)
	default:
		return false, fmt.Errorf("unknown primitive: %s", primitive)
	}
}

func runHaoEncoderScenario(input, expected map[string]interface{}, expectError bool) (bool, error) {
	scoresRaw, _ := input["scores"].([]interface{})
	scores := make([]float64, len(scoresRaw))
	for i, v := range scoresRaw {
		scores[i], _ = v.(float64)
	}

	result, err := hao_encoder.EncodeHaos(scores)

	if expectError {
		return err != nil, nil
	}
	if err != nil {
		return false, err
	}

	// Check expected length
	if expLen, ok := expected["length"].(float64); ok {
		if len(result) != int(expLen) {
			return false, nil
		}
	}

	// Check states
	if statesRaw, ok := expected["states"].([]interface{}); ok {
		for i, s := range statesRaw {
			if string(result[i].State) != s.(string) {
				return false, nil
			}
		}
	}

	// Check binaries
	if binariesRaw, ok := expected["binaries"].([]interface{}); ok {
		for i, b := range binariesRaw {
			if result[i].Binary != int(b.(float64)) {
				return false, nil
			}
		}
	}

	return true, nil
}

func runHexagramResolverScenario(input, expected map[string]interface{}, expectError bool) (bool, error) {
	signalsRaw, _ := input["signals"].([]interface{})
	signals := make([]int, len(signalsRaw))
	for i, v := range signalsRaw {
		signals[i] = int(v.(float64))
	}

	result, err := hexagram_resolver.ResolveHexagram(signals)

	if expectError {
		if err == nil {
			return false, nil
		}
		// Check error message if specified
		if expErr, ok := expected["error"].(string); ok {
			if err.Error() != expErr {
				return false, fmt.Errorf("expected error %q, got %q", expErr, err.Error())
			}
		}
		return true, nil
	}
	if err != nil {
		return false, err
	}

	// Check hexagram
	if expHex, ok := expected["hexagram"].(float64); ok {
		if result != int(expHex) {
			return false, nil
		}
	}

	return true, nil
}

func runNguHanhClassifierScenario(input, expected map[string]interface{}, expectError bool) (bool, error) {
	lower, _ := input["lower"].(string)
	upper, _ := input["upper"].(string)

	result := ngu_hanh_classifier.ClassifyNguHanh(lower, upper)

	// Check dynamic
	if expDyn, ok := expected["dynamic"].(string); ok {
		if string(result.Dynamic) != expDyn {
			return false, nil
		}
	}

	// Check score
	if expScore, ok := expected["score"].(float64); ok {
		if result.Score != expScore {
			return false, nil
		}
	}

	return true, nil
}

func runReadingScorerScenario(input, expected map[string]interface{}, expectError bool) (bool, error) {
	// Outcome texts
	if outcomeTextsRaw, ok := input["outcomeTexts"].([]interface{}); ok {
		expScores, _ := expected["outcomeScores"].([]interface{})
		for i, text := range outcomeTextsRaw {
			score := reading_scorer.ExtractOutcomeScore(text.(string))
			if score != expScores[i].(float64) {
				return false, nil
			}
		}
	}

	// Trend texts
	if trendTextsRaw, ok := input["trendTexts"].([]interface{}); ok {
		expScores, _ := expected["trendScores"].([]interface{})
		for i, text := range trendTextsRaw {
			score := reading_scorer.ExtractTrendScore(text.(string))
			if score != expScores[i].(float64) {
				return false, nil
			}
		}
	}

	// Action texts
	if actionTextsRaw, ok := input["actionTexts"].([]interface{}); ok {
		expActions, _ := expected["actions"].([]interface{})
		for i, text := range actionTextsRaw {
			action := reading_scorer.ExtractAction(text.(string))
			if action != expActions[i].(string) {
				return false, nil
			}
		}
	}

	// Majority vote
	if voteInputRaw, ok := input["voteInput"].([]interface{}); ok {
		voteInput := make([]string, len(voteInputRaw))
		for i, v := range voteInputRaw {
			voteInput[i] = v.(string)
		}
		majority := reading_scorer.MajorityVote(voteInput)
		expMajority, _ := expected["majorityAction"].(string)
		if majority != expMajority {
			return false, nil
		}
	}

	return true, nil
}

func runNuclearHexagramScenario(input, expected map[string]interface{}, expectError bool) (bool, error) {
	// HoQue test
	if signalsRaw, ok := input["signals"].([]interface{}); ok {
		signals := make([]int, len(signalsRaw))
		for i, v := range signalsRaw {
			signals[i] = int(v.(float64))
		}

		hoQue, err := nuclear_hexagram.ComputeHoQue(signals)

		if expectError {
			if err == nil {
				return false, nil
			}
			// Check error message if specified
			if expErr, ok := expected["error_hoQue"].(string); ok {
				if err.Error() != expErr {
					return false, nil
				}
			}
		} else {
			if err != nil {
				return false, err
			}
			if expHo, ok := expected["hoQue"].(float64); ok {
				if hoQue != int(expHo) {
					return false, nil
				}
			}
		}
	}

	// BienQue test
	if haosRaw, ok := input["haos"].([]interface{}); ok {
		haos := make([]nuclear_hexagram.HaoReading, len(haosRaw))
		for i, h := range haosRaw {
			haoMap := h.(map[string]interface{})
			haos[i] = nuclear_hexagram.HaoReading{
				State:      hao_encoder.HaoState(haoMap["state"].(string)),
				Binary:     int(haoMap["binary"].(float64)),
				IsChanging: haoMap["isChanging"].(bool),
				Label:      haoMap["label"].(string),
			}
		}

		bienQue, err := nuclear_hexagram.ComputeBienQue(haos)

		if expectError {
			if err == nil {
				return false, nil
			}
			// Check error message if specified
			if expErr, ok := expected["error_bienQue"].(string); ok {
				if err.Error() != expErr {
					return false, nil
				}
			}
		} else {
			if err != nil {
				return false, err
			}
			if expBien, ok := expected["bienQue"].(float64); ok {
				if bienQue != int(expBien) {
					return false, nil
				}
			}
		}
	}

	return true, nil
}

// stubMarkovPort implements MarkovPort for sandbox testing.
type stubMarkovPort struct {
	data *reading_composer.MarkovData
}

func (s *stubMarkovPort) GetMarkovData(hexagramNumber int) (*reading_composer.MarkovData, error) {
	return s.data, nil
}

func runReadingComposerScenario(sc map[string]interface{}) (bool, error) {
	input, _ := sc["input"].(map[string]interface{})
	expected, _ := sc["expected"].(map[string]interface{})

	// Extract input fields
	stockCode, _ := input["stockCode"].(string)
	scoresRaw, _ := input["scores"].([]interface{})
	scores := make([]float64, len(scoresRaw))
	for i, v := range scoresRaw {
		scores[i], _ = v.(float64)
	}

	// Build MarkovPort stub
	var markovPort reading_composer.MarkovPort = &stubMarkovPort{data: nil}
	if markovData, ok := input["markovData"].(map[string]interface{}); ok && markovData != nil {
		transitionProb, _ := markovData["transitionProb"].(float64)
		historicalConfidence, _ := markovData["historicalConfidence"].(float64)
		markovPort = &stubMarkovPort{
			data: &reading_composer.MarkovData{
				TransitionProb:       transitionProb,
				HistoricalConfidence: historicalConfidence,
			},
		}
	}

	deps := &reading_composer.ReadingComposerDependencies{
		Markov: markovPort,
	}

	reading, err := reading_composer.ComposeReading(stockCode, scores, deps)
	if err != nil {
		return false, err
	}

	// Verify queChinhNumber
	if expQueChiNh, ok := expected["queChinhNumber"].(float64); ok {
		if reading.QueChinh.Number != int(expQueChiNh) {
			return false, fmt.Errorf("queChinhNumber: got %d, want %d", reading.QueChinh.Number, int(expQueChiNh))
		}
	}

	// Verify hoQueNumber
	if expHoQue, ok := expected["hoQueNumber"].(float64); ok {
		if reading.HoQue.Number != int(expHoQue) {
			return false, fmt.Errorf("hoQueNumber: got %d, want %d", reading.HoQue.Number, int(expHoQue))
		}
	}

	// Verify bienQueNumber
	if expBienQue, ok := expected["bienQueNumber"].(float64); ok {
		if reading.BienQue.Number != int(expBienQue) {
			return false, fmt.Errorf("bienQueNumber: got %d, want %d", reading.BienQue.Number, int(expBienQue))
		}
	}

	// Verify haosLength
	if expHaosLen, ok := expected["haosLength"].(float64); ok {
		if len(reading.Haos) != int(expHaosLen) {
			return false, fmt.Errorf("haosLength: got %d, want %d", len(reading.Haos), int(expHaosLen))
		}
	}

	// Verify tradingSignalInSet (signal is in allowed set)
	if signalSet, ok := expected["tradingSignalInSet"].([]interface{}); ok {
		// Extract base signal (before space suffix)
		baseSignal := reading.QueChinh.TradingSignal
		for i, c := range baseSignal {
			if c == ' ' {
				baseSignal = baseSignal[:i]
				break
			}
		}
		found := false
		for _, s := range signalSet {
			if s.(string) == baseSignal {
				found = true
				break
			}
		}
		if !found {
			return false, fmt.Errorf("tradingSignal %q not in allowed set %v", baseSignal, signalSet)
		}
	}

	// Verify confidenceRange
	if confRange, ok := expected["confidenceRange"].([]interface{}); ok && len(confRange) == 2 {
		minConf, _ := confRange[0].(float64)
		maxConf, _ := confRange[1].(float64)
		if reading.QueChinh.Confidence < minConf || reading.QueChinh.Confidence > maxConf {
			return false, fmt.Errorf("confidence %f out of range [%f, %f]", reading.QueChinh.Confidence, minConf, maxConf)
		}
	}

	// Verify confidenceRangeWithMarkov
	if confRange, ok := expected["confidenceRangeWithMarkov"].([]interface{}); ok && len(confRange) == 2 {
		minConf, _ := confRange[0].(float64)
		maxConf, _ := confRange[1].(float64)
		if reading.QueChinh.Confidence < minConf || reading.QueChinh.Confidence > maxConf {
			return false, fmt.Errorf("confidence with Markov %f out of range [%f, %f]", reading.QueChinh.Confidence, minConf, maxConf)
		}
	}

	return true, nil
}
