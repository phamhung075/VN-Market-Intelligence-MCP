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

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/module/reading_composer"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hao_encoder"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hexagram_resolver"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/ngu_hanh_classifier"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/nuclear_hexagram"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/reading_scorer"
)

var (
	tier     = flag.String("tier", "primitive", "Tier to test: primitive or module")
	module   = flag.String("module", "kinh-dich", "Module name (kinh-dich)")
	scenario = flag.String("scenario", "all", "Scenario file name or 'all'")
)

func main() {
	flag.Parse()

	// Find scenario directory relative to project root
	scenarioDir := findScenarioDir()
	if scenarioDir == "" {
		fmt.Println("ERROR: Could not find scenarios directory")
		os.Exit(1)
	}

	var subDir string
	switch *tier {
	case "primitive":
		subDir = "primitives"
	case "module":
		subDir = "module"
	default:
		fmt.Printf("ERROR: Unknown tier %q (use primitive or module)\n", *tier)
		os.Exit(1)
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

	passed := 0
	failed := 0
	var failures []string

	for _, f := range files {
		name := filepath.Base(f)
		result, err := runScenario(f)
		if err != nil {
			fmt.Printf("  [RED]  %s: %v\n", name, err)
			failed++
			failures = append(failures, name)
		} else if result {
			fmt.Printf("  [GREEN] %s\n", name)
			passed++
		} else {
			fmt.Printf("  [RED]  %s: output mismatch\n", name)
			failed++
			failures = append(failures, name)
		}
	}

	fmt.Printf("\n=== SANDBOX SUMMARY ===\n")
	fmt.Printf("Tier: %s\n", *tier)
	fmt.Printf("Passed: %d/%d\n", passed, passed+failed)
	if failed > 0 {
		fmt.Printf("Failed: %v\n", failures)
		os.Exit(1)
	}
	fmt.Println("All scenarios GREEN")
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
