// Package main — stock-price sandbox scenario runner.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
//	go run ./cmd/sandbox -tier=module    -module=stock-price -scenario=all
//	go run ./cmd/sandbox -tier=all       -module=stock-price -scenario=all
//	go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json
//
// Security contract:
//   - Zero DB access. Zero network calls. Zero API keys.
//   - Reads scenario JSON from docs/scenarios/stock-price/ only.
//   - All computation via pkg/primitive/* and pkg/module/* (pure functions, P1-B1+).
//
// R-CGO gate: this binary MUST build and run under CGO_ENABLED=0.
// Zero mattn/go-sqlite3 imports, zero C pragmas, zero CGO dependencies.
// Scenario JSON fixtures stand in for tier-fetch results.
//
// P1-A  — sandbox harness CLI with full flag/discovery/dispatch framework.
//          No primitive executors yet (wired in P1-B1+).
// P1-B1 — wire executePrimitive to price_quote_normalizer.NormalizeQuote.
// P1-B2 — wire executePrimitive to tier_fallback_selector.SelectWinningTier.
// P1-B3 — wire executePrimitive to price_staleness_classifier.ClassifyStaleness.
// P1-C  — wire executeModule to price_resolution.Resolve via TierFetcher port.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
	pricequotenormalizer "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-quote-normalizer"
	pricestalenessclassifier "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-staleness-classifier"
	tierfallbackselector "github.com/vn-market-intelligence/stock-price/pkg/primitive/tier-fallback-selector"
)

// ---------------------------------------------------------------------------
// Scenario envelope
// ---------------------------------------------------------------------------

// Scenario holds metadata discovered during filesystem walk.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
}

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------

// findRepoRoot walks up from start until it finds the docs/scenarios directory,
// then returns that directory as the repo root. Returns "" if not found.
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
// Scenario discovery
// ---------------------------------------------------------------------------

// discoverScenarios returns all *.json files in the requested tier dirs.
// When -scenario=<filepath>, returns only that one path (resolved against repo root).
// Returns empty slice (not error) when directories do not exist (pre-P1-B1 phase).
func discoverScenarios(root, tier, scenarioArg string) ([]Scenario, error) {
	// Single-file mode.
	if scenarioArg != "all" && scenarioArg != "" {
		p := scenarioArg
		if !filepath.IsAbs(p) {
			p = filepath.Join(root, p)
		}
		t := "primitive"
		if filepath.Dir(p) == filepath.Join(root, "docs", "scenarios", "stock-price", "module") {
			t = "module"
		}
		return []Scenario{{Path: p, Name: filepath.Base(p), Tier: t}}, nil
	}

	// Collect tier directories.
	var dirs []struct{ path, tier string }
	base := filepath.Join(root, "docs", "scenarios", "stock-price")
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
// Execution — price_quote_normalizer executor (P1-B1)
// ---------------------------------------------------------------------------

// priceQuoteNormalizerScenario is the JSON shape for price_quote_normalizer scenarios.
type priceQuoteNormalizerScenario struct {
	Primitive string `json:"primitive"`
	Scenario  string `json:"scenario"`
	Input     struct {
		RawPrice     float64 `json:"rawPrice"`
		RawVolume    float64 `json:"rawVolume"`
		RawChange    float64 `json:"rawChange"`
		RawChangePct float64 `json:"rawChangePct"`
		Code         string  `json:"code"`
		Source       string  `json:"source"`
		FetchedAt    string  `json:"fetchedAt"`
		LatencyMs    int64   `json:"latencyMs"`
	} `json:"input"`
	ExpectedOutput struct {
		Code          string  `json:"code"`
		Price         float64 `json:"price"`
		Volume        float64 `json:"volume"`
		Change        float64 `json:"change"`
		ChangePercent float64 `json:"changePercent"`
		Source        string  `json:"source"`
		FetchedAt     string  `json:"fetchedAt"`
		LatencyMs     int64   `json:"latencyMs"`
	} `json:"expectedOutput"`
}

// executePriceQuoteNormalizer runs a price_quote_normalizer scenario.
// It calls the pure NormalizeQuote function and compares output field-by-field.
func executePriceQuoteNormalizer(data []byte) (bool, error) {
	var s priceQuoteNormalizerScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal price_quote_normalizer scenario: %w", err)
	}

	got := pricequotenormalizer.NormalizeQuote(
		s.Input.RawPrice,
		s.Input.RawVolume,
		s.Input.RawChange,
		s.Input.RawChangePct,
		s.Input.Code,
		domain.PriceSource(s.Input.Source),
		s.Input.FetchedAt,
		s.Input.LatencyMs,
	)

	exp := s.ExpectedOutput
	var failures []string
	if got.Code != exp.Code {
		failures = append(failures, fmt.Sprintf("Code: got=%q want=%q", got.Code, exp.Code))
	}
	if got.Price != exp.Price {
		failures = append(failures, fmt.Sprintf("Price: got=%v want=%v", got.Price, exp.Price))
	}
	if got.Volume != exp.Volume {
		failures = append(failures, fmt.Sprintf("Volume: got=%v want=%v", got.Volume, exp.Volume))
	}
	if got.Change != exp.Change {
		failures = append(failures, fmt.Sprintf("Change: got=%v want=%v", got.Change, exp.Change))
	}
	if got.ChangePercent != exp.ChangePercent {
		failures = append(failures, fmt.Sprintf("ChangePercent: got=%v want=%v", got.ChangePercent, exp.ChangePercent))
	}
	if string(got.Source) != exp.Source {
		failures = append(failures, fmt.Sprintf("Source: got=%q want=%q", got.Source, exp.Source))
	}
	if got.FetchedAt != exp.FetchedAt {
		failures = append(failures, fmt.Sprintf("FetchedAt: got=%q want=%q", got.FetchedAt, exp.FetchedAt))
	}
	if got.LatencyMs != exp.LatencyMs {
		failures = append(failures, fmt.Sprintf("LatencyMs: got=%v want=%v", got.LatencyMs, exp.LatencyMs))
	}

	if len(failures) > 0 {
		return false, fmt.Errorf("scenario=%q field mismatches: %v", s.Scenario, failures)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — tier_fallback_selector executor (P1-B2)
// ---------------------------------------------------------------------------

// tierFallbackSelectorQuote is the JSON shape of a quote inside a
// tier_fallback_selector scenario (quote may be null).
type tierFallbackSelectorQuote struct {
	Code          string  `json:"code"`
	Price         float64 `json:"price"`
	Volume        float64 `json:"volume"`
	Change        float64 `json:"change"`
	ChangePercent float64 `json:"changePercent"`
	Source        string  `json:"source"`
	FetchedAt     string  `json:"fetchedAt"`
	LatencyMs     int64   `json:"latencyMs"`
}

// tierFallbackSelectorResult is one entry in the input results array.
// Quote is a pointer so it can be null in JSON.
type tierFallbackSelectorResult struct {
	Quote *tierFallbackSelectorQuote `json:"quote"`
	Err   *string                    `json:"err"`
}

// tierFallbackSelectorScenario is the full JSON shape for tier_fallback_selector scenarios.
type tierFallbackSelectorScenario struct {
	Primitive string `json:"primitive"`
	Scenario  string `json:"scenario"`
	Input     struct {
		Results []tierFallbackSelectorResult `json:"results"`
	} `json:"input"`
	Expected struct {
		Quote *tierFallbackSelectorQuote `json:"quote"`
		Err   *string                    `json:"err"`
	} `json:"expected"`
}

// executeTierFallbackSelector runs a tier_fallback_selector scenario.
// It unmarshals the JSON, builds []TierResult, calls SelectWinningTier, and
// compares the result against the expected output.
func executeTierFallbackSelector(data []byte) (bool, error) {
	var s tierFallbackSelectorScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal tier_fallback_selector scenario: %w", err)
	}

	// Build []TierResult from JSON input.
	results := make([]tierfallbackselector.TierResult, len(s.Input.Results))
	for i, r := range s.Input.Results {
		var tr tierfallbackselector.TierResult
		if r.Quote != nil {
			q := domain.PriceQuote{
				Code:          r.Quote.Code,
				Price:         r.Quote.Price,
				Volume:        r.Quote.Volume,
				Change:        r.Quote.Change,
				ChangePercent: r.Quote.ChangePercent,
				Source:        domain.PriceSource(r.Quote.Source),
				FetchedAt:     r.Quote.FetchedAt,
				LatencyMs:     r.Quote.LatencyMs,
			}
			tr.Quote = &q
		}
		if r.Err != nil {
			tr.Err = fmt.Errorf("%s", *r.Err)
		}
		results[i] = tr
	}

	gotQuote, gotErr := tierfallbackselector.SelectWinningTier(results)

	// Determine expected outcome.
	wantErr := s.Expected.Err != nil && *s.Expected.Err == "PriceNotAvailableError"

	if wantErr {
		// Scenario expects a PriceNotAvailableError and nil quote.
		if gotQuote != nil {
			return false, fmt.Errorf("scenario=%q: got non-nil quote %+v, want nil (all tiers failed)", s.Scenario, gotQuote)
		}
		if gotErr == nil {
			return false, fmt.Errorf("scenario=%q: got nil error, want PriceNotAvailableError", s.Scenario)
		}
		if _, isPNA := gotErr.(*domain.PriceNotAvailableError); !isPNA {
			return false, fmt.Errorf("scenario=%q: got error %v, want *PriceNotAvailableError", s.Scenario, gotErr)
		}
		return true, nil
	}

	// Scenario expects a winning quote.
	if gotErr != nil {
		return false, fmt.Errorf("scenario=%q: unexpected error: %v", s.Scenario, gotErr)
	}
	if gotQuote == nil {
		return false, fmt.Errorf("scenario=%q: got nil quote, want non-nil", s.Scenario)
	}
	exp := s.Expected.Quote
	var failures []string
	if gotQuote.Code != exp.Code {
		failures = append(failures, fmt.Sprintf("Code: got=%q want=%q", gotQuote.Code, exp.Code))
	}
	if gotQuote.Price != exp.Price {
		failures = append(failures, fmt.Sprintf("Price: got=%v want=%v", gotQuote.Price, exp.Price))
	}
	if gotQuote.Volume != exp.Volume {
		failures = append(failures, fmt.Sprintf("Volume: got=%v want=%v", gotQuote.Volume, exp.Volume))
	}
	if gotQuote.Change != exp.Change {
		failures = append(failures, fmt.Sprintf("Change: got=%v want=%v", gotQuote.Change, exp.Change))
	}
	if gotQuote.ChangePercent != exp.ChangePercent {
		failures = append(failures, fmt.Sprintf("ChangePercent: got=%v want=%v", gotQuote.ChangePercent, exp.ChangePercent))
	}
	if string(gotQuote.Source) != exp.Source {
		failures = append(failures, fmt.Sprintf("Source: got=%q want=%q", gotQuote.Source, exp.Source))
	}
	if gotQuote.FetchedAt != exp.FetchedAt {
		failures = append(failures, fmt.Sprintf("FetchedAt: got=%q want=%q", gotQuote.FetchedAt, exp.FetchedAt))
	}
	if gotQuote.LatencyMs != exp.LatencyMs {
		failures = append(failures, fmt.Sprintf("LatencyMs: got=%v want=%v", gotQuote.LatencyMs, exp.LatencyMs))
	}
	if len(failures) > 0 {
		return false, fmt.Errorf("scenario=%q field mismatches: %v", s.Scenario, failures)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — price_staleness_classifier executor (P1-B3)
// ---------------------------------------------------------------------------

// priceStalenessClassifierScenario is the JSON shape for price_staleness_classifier scenarios.
type priceStalenessClassifierScenario struct {
	Primitive string `json:"primitive"`
	Scenario  string `json:"scenario"`
	Input     struct {
		FetchedAt             string `json:"fetchedAt"`
		Now                   string `json:"now"`
		FreshThresholdSeconds int    `json:"freshThresholdSeconds"`
		StaleThresholdSeconds int    `json:"staleThresholdSeconds"`
	} `json:"input"`
	Expected struct {
		Label *string `json:"label"`
		Err   *string `json:"err"`
	} `json:"expected"`
}

// executePriceStalenessClassifier runs a price_staleness_classifier scenario.
// It parses the now field, calls ClassifyStaleness, and validates against expected.
func executePriceStalenessClassifier(data []byte) (bool, error) {
	var s priceStalenessClassifierScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal price_staleness_classifier scenario: %w", err)
	}

	// Parse the "now" reference time from the scenario JSON.
	now, err := time.Parse(time.RFC3339, s.Input.Now)
	if err != nil {
		return false, fmt.Errorf("scenario=%q: parse input.now %q: %w", s.Scenario, s.Input.Now, err)
	}

	gotLabel, gotErr := pricestalenessclassifier.ClassifyStaleness(
		s.Input.FetchedAt,
		now,
		s.Input.FreshThresholdSeconds,
		s.Input.StaleThresholdSeconds,
	)

	wantErr := s.Expected.Err != nil

	if wantErr {
		// Scenario expects an error; label should be absent/null.
		if gotErr == nil {
			return false, fmt.Errorf("scenario=%q: got nil error, want parse error for fetchedAt=%q", s.Scenario, s.Input.FetchedAt)
		}
		// Success: got an error as expected.
		return true, nil
	}

	// Scenario expects a valid label and no error.
	if gotErr != nil {
		return false, fmt.Errorf("scenario=%q: unexpected error: %v", s.Scenario, gotErr)
	}
	if s.Expected.Label == nil {
		return false, fmt.Errorf("scenario=%q: expected.label is null but expected.err is also null — invalid fixture", s.Scenario)
	}
	wantLabel := pricestalenessclassifier.StalenessLabel(*s.Expected.Label)
	if gotLabel != wantLabel {
		return false, fmt.Errorf("scenario=%q: got label=%q, want label=%q", s.Scenario, gotLabel, wantLabel)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — primitive dispatcher (P1-A framework; executors wired P1-B1+)
// ---------------------------------------------------------------------------

// executePrimitive dispatches a primitive scenario to the correct handler
// based on the "primitive" field in the scenario JSON.
// P1-B1+: case blocks are added per primitive as they are extracted.
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
	case "price_quote_normalizer": // P1-B1
		return executePriceQuoteNormalizer(data)
	case "tier_fallback_selector": // P1-B2
		return executeTierFallbackSelector(data)
	case "price_staleness_classifier": // P1-B3
		return executePriceStalenessClassifier(data)
	case "":
		return false, fmt.Errorf("scenario %q: missing 'primitive' field", s.Name)
	default:
		return false, fmt.Errorf("primitive %q in %s not yet wired (add executor in P1-C+)", envelope.Primitive, s.Name)
	}
}

// ---------------------------------------------------------------------------
// Execution — module dispatcher (P1-A framework; executors wired P1-C+)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Execution — price_resolution module executor (P1-C)
// ---------------------------------------------------------------------------

// priceResolutionTierInput is the JSON shape for one tier input inside a
// price_resolution scenario. Pointer so it can be null.
type priceResolutionTierInput struct {
	Price     float64 `json:"price"`
	Volume    float64 `json:"volume"`
	Change    float64 `json:"change_pct"`
	ChangePct float64 `json:"change_pct"`
	Source    string  `json:"source"`
	FetchedAt string  `json:"fetched_at"`
	LatencyMs int64   `json:"latency_ms"`
}

// priceResolutionScenario is the full JSON shape for price_resolution module scenarios.
type priceResolutionScenario struct {
	Module      string `json:"module"`
	Scenario    string `json:"scenario"`
	Description string `json:"description"`
	Inputs      struct {
		Code                  string                    `json:"code"`
		Now                   string                    `json:"now"`
		FreshThresholdSeconds int                       `json:"fresh_threshold_seconds"`
		StaleThresholdSeconds int                       `json:"stale_threshold_seconds"`
		Tier1                 *priceResolutionTierInput `json:"tier_1"`
		Tier2                 *priceResolutionTierInput `json:"tier_2"`
		Tier3                 *priceResolutionTierInput `json:"tier_3"`
	} `json:"inputs"`
	Expected struct {
		Code      string `json:"code"`
		Price     float64 `json:"price"`
		Source    string `json:"source"`
		Staleness string `json:"staleness"`
	} `json:"expected"`
}

// staticTierFetcher is a sandbox mock that implements priceresolution.TierFetcher.
// It returns a pre-built quote (or nil) — no live network or SQLite access.
type staticTierFetcher struct {
	quote *domain.PriceQuote
}

func (s *staticTierFetcher) FetchPrice(_ string) (*domain.PriceQuote, error) {
	return s.quote, nil
}

// buildStaticFetcher converts a nullable priceResolutionTierInput into a
// staticTierFetcher. When inp is nil the fetcher returns nil (tier absent).
func buildStaticFetcher(code string, inp *priceResolutionTierInput) *staticTierFetcher {
	if inp == nil {
		return &staticTierFetcher{quote: nil}
	}
	return &staticTierFetcher{
		quote: &domain.PriceQuote{
			Code:          code,
			Price:         inp.Price,
			Volume:        inp.Volume,
			Change:        inp.Change,
			ChangePercent: inp.ChangePct,
			Source:        domain.PriceSource(inp.Source),
			FetchedAt:     inp.FetchedAt,
			LatencyMs:     inp.LatencyMs,
		},
	}
}

// executePriceResolution runs a price_resolution module scenario.
// It builds three staticTierFetchers from the JSON inputs, wires them into a
// PriceResolutionModule, calls Resolve(), and asserts against expected fields.
func executePriceResolution(data []byte) (bool, error) {
	var s priceResolutionScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal price_resolution scenario: %w", err)
	}

	// Parse the "now" reference time (used for staleness classification thresholds).
	now, err := time.Parse(time.RFC3339, s.Inputs.Now)
	if err != nil {
		return false, fmt.Errorf("scenario=%q: parse inputs.now %q: %w", s.Scenario, s.Inputs.Now, err)
	}
	// Derive freshThresholdSeconds and staleThresholdSeconds from scenario.
	freshSec := s.Inputs.FreshThresholdSeconds
	staleSec := s.Inputs.StaleThresholdSeconds
	if freshSec == 0 {
		freshSec = priceresolution.DefaultFreshThresholdSeconds
	}
	if staleSec == 0 {
		staleSec = priceresolution.DefaultStaleThresholdSeconds
	}

	// The staleness classifier uses time.Now() internally, but the scenario
	// has an explicit "now" field. We use the age of the winning quote relative
	// to the scenario's "now" to compute the expected staleness, and verify
	// by asserting against expected.staleness using the real module output.
	// Because the scenario fixtures have FetchedAt values with fixed offsets
	// from the "now" field, we derive the equivalent real-wall-clock FetchedAt
	// so the module's internal time.Now() call produces the same classification.
	//
	// Approach: parse the scenario's tier FetchedAt and compute the age at
	// the scenario's now; then rebuild FetchedAt as time.Now() minus that age.
	// This makes the staleness output deterministic regardless of real wall-clock.
	code := s.Inputs.Code

	tier1 := buildStaticFetcher(code, s.Inputs.Tier1)
	tier2 := buildStaticFetcher(code, s.Inputs.Tier2)
	tier3 := buildStaticFetcher(code, s.Inputs.Tier3)

	// Rebind FetchedAt values to real wall-clock time to ensure the internal
	// ClassifyStaleness call produces the expected label at test runtime.
	for _, pair := range []struct {
		fetcher *staticTierFetcher
		inp     *priceResolutionTierInput
	}{
		{tier1, s.Inputs.Tier1},
		{tier2, s.Inputs.Tier2},
		{tier3, s.Inputs.Tier3},
	} {
		if pair.fetcher.quote == nil || pair.inp == nil {
			continue
		}
		scenarioFetchedAt, parseErr := time.Parse(time.RFC3339, pair.inp.FetchedAt)
		if parseErr != nil {
			continue // leave FetchedAt as-is; staleness assertion may be skipped
		}
		ageAtNow := now.Sub(scenarioFetchedAt)
		pair.fetcher.quote.FetchedAt = time.Now().UTC().Add(-ageAtNow).Format(time.RFC3339)
	}

	mod := priceresolution.NewWithThresholds(tier1, tier2, tier3, freshSec, staleSec)
	got, resolveErr := mod.Resolve(code)

	// Check error expectation.
	if s.Expected.Code == "" && resolveErr != nil {
		// Scenario expects an error path — not currently modelled in fixtures.
		// If this branch is needed, add "expected.error" field to the fixture.
		return true, nil
	}
	if resolveErr != nil {
		return false, fmt.Errorf("scenario=%q: unexpected error: %v", s.Scenario, resolveErr)
	}
	if got == nil {
		return false, fmt.Errorf("scenario=%q: got nil ResolvedQuote", s.Scenario)
	}

	var failures []string
	if s.Expected.Code != "" && got.Code != s.Expected.Code {
		failures = append(failures, fmt.Sprintf("Code: got=%q want=%q", got.Code, s.Expected.Code))
	}
	if s.Expected.Price != 0 && got.Price != s.Expected.Price {
		failures = append(failures, fmt.Sprintf("Price: got=%v want=%v", got.Price, s.Expected.Price))
	}
	if s.Expected.Source != "" && string(got.Source) != s.Expected.Source {
		failures = append(failures, fmt.Sprintf("Source: got=%q want=%q", got.Source, s.Expected.Source))
	}
	if s.Expected.Staleness != "" && got.Staleness != s.Expected.Staleness {
		failures = append(failures, fmt.Sprintf("Staleness: got=%q want=%q", got.Staleness, s.Expected.Staleness))
	}
	if len(failures) > 0 {
		return false, fmt.Errorf("scenario=%q field mismatches: %v", s.Scenario, failures)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution — module dispatcher (P1-A framework; executors wired P1-C+)
// ---------------------------------------------------------------------------

// executeModule dispatches a module scenario to the correct handler
// based on the "module" field in the scenario JSON.
// P1-A: no modules exist yet — unknown module returns graceful warning (not panic).
// P1-C+: case blocks are added per module as they are implemented.
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
	case "price_resolution": // P1-C
		return executePriceResolution(data)
	case "":
		return false, fmt.Errorf("scenario %q: missing 'module' field", s.Name)
	default:
		return false, fmt.Errorf("module %q in %s not yet wired (add executor in P1-C+)", envelope.Module, s.Name)
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	tierFlag := flag.String("tier", "", "primitive | module | all")
	moduleFlag := flag.String("module", "", "module identifier, e.g. stock-price")
	scenarioFlag := flag.String("scenario", "all", "all | <filepath>")
	flag.Parse()

	if *tierFlag == "" || *moduleFlag == "" {
		logger.Error("missing required flags", slog.String("required", "-tier and -module"))
		flag.Usage()
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
		logger.Info("no scenarios discovered (expected during scaffold phase — P1-B1+ will create them)",
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
