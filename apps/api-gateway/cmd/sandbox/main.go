// Package main — api-gateway sandbox scenario runner.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=api-gateway -scenario=all
//	go run ./cmd/sandbox -tier=module    -module=api-gateway -scenario=all
//	go run ./cmd/sandbox -tier=all       -module=api-gateway -scenario=all
//	go run ./cmd/sandbox -tier=primitive -module=api-gateway -scenario=apps/api-gateway/pkg/primitive/overall-status-computer/scenarios/golden-all-ok.json
//
// Security contract:
//   - Zero DB access. Zero network calls. Zero API keys.
//   - Reads scenario JSON from pkg/primitive/*/scenarios/ and pkg/module/gateway/scenarios/ only.
//   - All computation via pkg/primitive/* and pkg/module/gateway (pure functions).
//
// Scenario fixture types:
//   - verdict="PASS"             → golden scenario; expected == correct output.
//   - verdict="FAILURE_SCENARIO" → intentional-failure fixture; documents what breaks when a
//     bug is injected. Against the CORRECT implementation, expected still matches actual (the
//     function handles the edge-case properly). The runner marks these with
//     intentional_failure_fixture=true in the trace so QA recognises them.
//   - verdict="G11_CANARY"       → cascade canary; same treatment as FAILURE_SCENARIO.
//   - verdict="CASCADE_PROOF"    → cascade proof; same treatment.
//
// P1-AG-E2 — feat(api-gateway): sandbox harness CLI — scenario execution foundation.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	gw "github.com/vn-market-intelligence/api-gateway/pkg/module/gateway"
	osc "github.com/vn-market-intelligence/api-gateway/pkg/primitive/overall-status-computer"
	ppr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/proxy-path-resolver"
	rsm "github.com/vn-market-intelligence/api-gateway/pkg/primitive/route-service-matcher"
)

// ---------------------------------------------------------------------------
// Scenario discovery types
// ---------------------------------------------------------------------------

// Scenario holds metadata discovered during filesystem walk.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
}

// ---------------------------------------------------------------------------
// Trace output
// ---------------------------------------------------------------------------

// TraceResult is the per-scenario trace emitted to sandbox/traces/.
type TraceResult struct {
	Scenario               string      `json:"scenario"`
	ScenarioFile           string      `json:"scenario_file"`
	Tier                   string      `json:"tier"`
	Primitive              string      `json:"primitive,omitempty"`
	Module                 string      `json:"module,omitempty"`
	Status                 string      `json:"status"` // "PASS" | "FAIL"
	IntentionalFailFixture bool        `json:"intentional_failure_fixture"`
	DocOnly                bool        `json:"doc_only,omitempty"` // true when scenario has no executable assertions (documentation artefact)
	Inputs                 interface{} `json:"inputs"`
	Expected               interface{} `json:"expected"`
	Actual                 interface{} `json:"actual"`
	ErrorMsg               string      `json:"error,omitempty"`
	RunAt                  string      `json:"run_at"`
}

func writeTrace(traceDir string, t TraceResult) {
	name := filepath.Base(t.ScenarioFile)
	ext := filepath.Ext(name)
	base := name[:len(name)-len(ext)]

	// Qualify with primitive or module name to avoid filename collisions when
	// two primitives share a scenario name (e.g. g11-canary-cascade.json).
	qualifier := t.Primitive
	if qualifier == "" {
		qualifier = t.Module
	}
	if qualifier != "" {
		base = qualifier + "-" + base
	}

	outPath := filepath.Join(traceDir, base+"-trace.json")
	data, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(outPath, data, 0o644)
}

// ---------------------------------------------------------------------------
// Repo root + scenario discovery
// ---------------------------------------------------------------------------

// findRepoRoot walks up from start looking for docs/scenarios OR go.work OR .git.
func findRepoRoot(start string) string {
	dir := start
	for {
		// api-gateway uses in-package scenarios; look for the monorepo .git root.
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
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

// findServiceRoot walks up from start looking for the api-gateway service root (go.mod).
func findServiceRoot(start string) string {
	dir := start
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
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

// discoverScenarios returns scenario paths for the requested tier.
// Scenarios live in-package:
//   - primitive: apps/api-gateway/pkg/primitive/*/scenarios/*.json
//   - module:    apps/api-gateway/pkg/module/gateway/scenarios/*.json
//
// When -scenario=<filepath>, returns only that one path (resolved against repo root).
func discoverScenarios(serviceRoot, tier, scenarioArg string) ([]Scenario, error) {
	// Single-file mode.
	if scenarioArg != "all" && scenarioArg != "" {
		p := scenarioArg
		if !filepath.IsAbs(p) {
			repoRoot := findRepoRoot(serviceRoot)
			if repoRoot != "" {
				p = filepath.Join(repoRoot, p)
			}
		}
		t := "primitive"
		if filepath.Base(filepath.Dir(filepath.Dir(p))) == "gateway" {
			t = "module"
		}
		return []Scenario{{Path: p, Name: filepath.Base(p), Tier: t}}, nil
	}

	var scenarios []Scenario

	collectPrimitive := func() error {
		primBase := filepath.Join(serviceRoot, "pkg", "primitive")
		entries, err := os.ReadDir(primBase)
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return fmt.Errorf("readdir primitives: %w", err)
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			scenDir := filepath.Join(primBase, e.Name(), "scenarios")
			matches, err := filepath.Glob(filepath.Join(scenDir, "*.json"))
			if err != nil {
				return fmt.Errorf("glob %s: %w", scenDir, err)
			}
			for _, m := range matches {
				scenarios = append(scenarios, Scenario{
					Path: m,
					Name: filepath.Base(m),
					Tier: "primitive",
				})
			}
		}
		return nil
	}

	collectModule := func() error {
		moduleScenDir := filepath.Join(serviceRoot, "pkg", "module", "gateway", "scenarios")
		matches, err := filepath.Glob(filepath.Join(moduleScenDir, "*.json"))
		if err != nil {
			return fmt.Errorf("glob %s: %w", moduleScenDir, err)
		}
		for _, m := range matches {
			scenarios = append(scenarios, Scenario{
				Path: m,
				Name: filepath.Base(m),
				Tier: "module",
			})
		}
		return nil
	}

	switch tier {
	case "primitive":
		if err := collectPrimitive(); err != nil {
			return nil, err
		}
	case "module":
		if err := collectModule(); err != nil {
			return nil, err
		}
	case "all":
		if err := collectPrimitive(); err != nil {
			return nil, err
		}
		if err := collectModule(); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unknown -tier %q: must be primitive|module|all", tier)
	}

	return scenarios, nil
}

// ---------------------------------------------------------------------------
// Scenario JSON envelope peek
// ---------------------------------------------------------------------------

type scenarioEnvelope struct {
	Primitive string `json:"primitive"`
	Module    string `json:"module"`
	Verdict   string `json:"verdict"`
}

func peekEnvelope(data []byte) (scenarioEnvelope, error) {
	var e scenarioEnvelope
	if err := json.Unmarshal(data, &e); err != nil {
		return e, fmt.Errorf("peek envelope: %w", err)
	}
	return e, nil
}

// isIntentionalFixture returns true for scenarios that document intentional
// failure / injection behaviour. Against the correct implementation these
// scenarios still PASS (the expected output matches correct behaviour), but
// they are annotated in the trace for QA clarity.
func isIntentionalFixture(verdict string) bool {
	switch verdict {
	case "FAILURE_SCENARIO", "G11_CANARY", "CASCADE_PROOF":
		return true
	}
	return false
}

// ---------------------------------------------------------------------------
// Primitive: overall-status-computer
// ---------------------------------------------------------------------------

type oscScenario struct {
	Scenario  string `json:"scenario"`
	Primitive string `json:"primitive"`
	Verdict   string `json:"verdict"`
	Input     struct {
		Statuses map[string]string `json:"statuses"`
	} `json:"input"`
	Expected struct {
		Overall string `json:"overall"`
	} `json:"expected"`
}

func executeOverallStatusComputer(data []byte, name string) (TraceResult, error) {
	var s oscScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return TraceResult{}, fmt.Errorf("unmarshal overall-status-computer scenario: %w", err)
	}

	actual := osc.ComputeOverallStatus(s.Input.Statuses)

	status := "PASS"
	errMsg := ""
	if actual != s.Expected.Overall {
		status = "FAIL"
		errMsg = fmt.Sprintf("overall: got %q, want %q", actual, s.Expected.Overall)
	}

	return TraceResult{
		Scenario:               s.Scenario,
		Primitive:              s.Primitive,
		Status:                 status,
		IntentionalFailFixture: isIntentionalFixture(s.Verdict),
		Inputs:                 s.Input,
		Expected:               s.Expected,
		Actual:                 map[string]string{"overall": actual},
		ErrorMsg:               errMsg,
	}, nil
}

// ---------------------------------------------------------------------------
// Primitive: proxy-path-resolver
// ---------------------------------------------------------------------------

type pprScenario struct {
	Scenario  string `json:"scenario"`
	Primitive string `json:"primitive"`
	Verdict   string `json:"verdict"`
	Input     struct {
		ReqPath string `json:"reqPath"`
		NoProbe bool   `json:"noProbe"`
	} `json:"input"`
	Expected struct {
		ResolvedPath string `json:"resolvedPath"`
	} `json:"expected"`
}

func executeProxyPathResolver(data []byte, name string) (TraceResult, error) {
	var s pprScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return TraceResult{}, fmt.Errorf("unmarshal proxy-path-resolver scenario: %w", err)
	}

	actual := ppr.ResolveProxyPath(s.Input.ReqPath, s.Input.NoProbe)

	status := "PASS"
	errMsg := ""
	if actual != s.Expected.ResolvedPath {
		status = "FAIL"
		errMsg = fmt.Sprintf("resolvedPath: got %q, want %q", actual, s.Expected.ResolvedPath)
	}

	return TraceResult{
		Scenario:               s.Scenario,
		Primitive:              s.Primitive,
		Status:                 status,
		IntentionalFailFixture: isIntentionalFixture(s.Verdict),
		Inputs:                 s.Input,
		Expected:               s.Expected,
		Actual:                 map[string]string{"resolvedPath": actual},
		ErrorMsg:               errMsg,
	}, nil
}

// ---------------------------------------------------------------------------
// Primitive: route-service-matcher
// ---------------------------------------------------------------------------

type rsmScenario struct {
	Scenario  string `json:"scenario"`
	Primitive string `json:"primitive"`
	Verdict   string `json:"verdict"`
	// Input and Expected may be absent in doc-only scenarios (e.g. g11-canary-cascade
	// for route-service-matcher which documents cascade proof without executable assertions).
	Input    *struct {
		Path          string `json:"path"`
		PrefixToStrip string `json:"prefixToStrip"`
	} `json:"input"`
	Expected *struct {
		ServiceName string `json:"serviceName"`
	} `json:"expected"`
}

func executeRouteServiceMatcher(data []byte, name string) (TraceResult, error) {
	var s rsmScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return TraceResult{}, fmt.Errorf("unmarshal route-service-matcher scenario: %w", err)
	}

	// Doc-only scenario: no input/expected fields — pass trivially as documentation artefact.
	if s.Input == nil || s.Expected == nil {
		return TraceResult{
			Scenario:               s.Scenario,
			Primitive:              s.Primitive,
			Status:                 "PASS",
			IntentionalFailFixture: isIntentionalFixture(s.Verdict),
			DocOnly:                true,
			Inputs:                 nil,
			Expected:               nil,
			Actual:                 nil,
		}, nil
	}

	actual := rsm.ExtractServiceName(s.Input.Path, s.Input.PrefixToStrip)

	status := "PASS"
	errMsg := ""
	if actual != s.Expected.ServiceName {
		status = "FAIL"
		errMsg = fmt.Sprintf("serviceName: got %q, want %q", actual, s.Expected.ServiceName)
	}

	return TraceResult{
		Scenario:               s.Scenario,
		Primitive:              s.Primitive,
		Status:                 status,
		IntentionalFailFixture: isIntentionalFixture(s.Verdict),
		Inputs:                 s.Input,
		Expected:               s.Expected,
		Actual:                 map[string]string{"serviceName": actual},
		ErrorMsg:               errMsg,
	}, nil
}

// ---------------------------------------------------------------------------
// Primitive dispatcher
// ---------------------------------------------------------------------------

func executePrimitive(s Scenario, traceDir string) (bool, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", s.Path, err)
	}

	env, err := peekEnvelope(data)
	if err != nil {
		return false, fmt.Errorf("peek %s: %w", s.Name, err)
	}

	var tr TraceResult
	switch env.Primitive {
	case "overall-status-computer":
		tr, err = executeOverallStatusComputer(data, s.Name)
	case "proxy-path-resolver":
		tr, err = executeProxyPathResolver(data, s.Name)
	case "route-service-matcher":
		tr, err = executeRouteServiceMatcher(data, s.Name)
	default:
		return false, fmt.Errorf("unknown primitive %q in %s (not yet wired)", env.Primitive, s.Name)
	}
	if err != nil {
		return false, err
	}

	tr.ScenarioFile = s.Path
	tr.Tier = "primitive"
	tr.RunAt = time.Now().UTC().Format(time.RFC3339)
	writeTrace(traceDir, tr)

	return tr.Status == "PASS", nil
}

// ---------------------------------------------------------------------------
// Module: gateway
// ---------------------------------------------------------------------------

// sandboxPorts is a pure in-memory implementation of gateway.RoutingPorts used
// exclusively by the sandbox. No net/http, no DB, no credentials.
type sandboxPorts struct {
	services map[string]struct {
		targetURL    string
		noProbe      bool
		preservePath bool
	}
	statuses map[string]string
}

func (p *sandboxPorts) LookupService(name string) (string, bool, bool, bool) {
	svc, ok := p.services[name]
	if !ok {
		return "", false, false, false
	}
	return svc.targetURL, svc.noProbe, svc.preservePath, true
}

func (p *sandboxPorts) ServiceStatuses() map[string]string {
	return p.statuses
}

// moduleRouteStoryScenario is the JSON shape of module-route-story.json.
type moduleRouteStoryScenario struct {
	Scenario string `json:"scenario"`
	Module   string `json:"module"`
	Verdict  string `json:"verdict"`
	Steps    []struct {
		Step      int    `json:"step"`
		Primitive string `json:"primitive"`
		Function  string `json:"function"`
		Input     struct {
			// route-service-matcher inputs
			Path          string `json:"path"`
			PrefixToStrip string `json:"prefixToStrip"`
			// proxy-path-resolver inputs
			ReqPath string `json:"reqPath"`
			NoProbe bool   `json:"noProbe"`
			// overall-status-computer inputs
			Statuses map[string]string `json:"statuses"`
		} `json:"input"`
		Expected struct {
			ServiceName    string `json:"serviceName"`
			DownstreamPath string `json:"downstreamPath"`
			Overall        string `json:"overall"`
		} `json:"expected"`
	} `json:"steps"`
	RoutingResult struct {
		ServiceName    string `json:"serviceName"`
		TargetURL      string `json:"targetURL"`
		DownstreamPath string `json:"downstreamPath"`
		Found          bool   `json:"found"`
	} `json:"routing_result"`
	HealthResult struct {
		Overall string `json:"overall"`
	} `json:"health_result"`
}

func executeGatewayModule(data []byte, name string) (TraceResult, error) {
	var s moduleRouteStoryScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return TraceResult{}, fmt.Errorf("unmarshal gateway module scenario: %w", err)
	}

	// Build sandbox ports from scenario routing_result (service registry) +
	// step-3 statuses (health statuses). No infrastructure imported.
	ports := &sandboxPorts{
		services: map[string]struct {
			targetURL    string
			noProbe      bool
			preservePath bool
		}{},
		statuses: map[string]string{},
	}

	// Populate the service registry from routing_result.
	if s.RoutingResult.ServiceName != "" {
		ports.services[s.RoutingResult.ServiceName] = struct {
			targetURL    string
			noProbe      bool
			preservePath bool
		}{
			targetURL:    s.RoutingResult.TargetURL,
			noProbe:      false,
			preservePath: false,
		}
	}

	// Populate statuses from step-3 (overall-status-computer step).
	for _, step := range s.Steps {
		if step.Primitive == "overall-status-computer" {
			ports.statuses = step.Input.Statuses
		}
	}

	mod := gw.New(ports)

	// Execute Route (steps 1+2: route-service-matcher → proxy-path-resolver).
	var routePrefixToStrip = "/"
	var routeReqPath = s.RoutingResult.DownstreamPath
	// Discover reqPath from step 1 input.
	for _, step := range s.Steps {
		if step.Primitive == "route-service-matcher" {
			routePrefixToStrip = step.Input.PrefixToStrip
			routeReqPath = step.Input.Path
		}
	}
	routeResult := mod.Route(routeReqPath, routePrefixToStrip)

	// Execute AggregateHealth (step 3: overall-status-computer).
	healthResult := mod.AggregateHealth()

	// Compare against expected.
	type actualOut struct {
		ServiceName    string `json:"serviceName"`
		DownstreamPath string `json:"downstreamPath"`
		TargetURL      string `json:"targetURL"`
		Found          bool   `json:"found"`
		Overall        string `json:"overall"`
	}

	actual := actualOut{
		ServiceName:    routeResult.ServiceName,
		DownstreamPath: routeResult.DownstreamPath,
		TargetURL:      routeResult.TargetURL,
		Found:          routeResult.Found,
		Overall:        healthResult.Overall,
	}

	type expectedOut struct {
		ServiceName    string `json:"serviceName"`
		DownstreamPath string `json:"downstreamPath"`
		TargetURL      string `json:"targetURL"`
		Found          bool   `json:"found"`
		Overall        string `json:"overall"`
	}

	expected := expectedOut{
		ServiceName:    s.RoutingResult.ServiceName,
		DownstreamPath: s.RoutingResult.DownstreamPath,
		TargetURL:      s.RoutingResult.TargetURL,
		Found:          s.RoutingResult.Found,
		Overall:        s.HealthResult.Overall,
	}

	var diffs []string
	if actual.ServiceName != expected.ServiceName {
		diffs = append(diffs, fmt.Sprintf("serviceName: got %q, want %q", actual.ServiceName, expected.ServiceName))
	}
	if actual.DownstreamPath != expected.DownstreamPath {
		diffs = append(diffs, fmt.Sprintf("downstreamPath: got %q, want %q", actual.DownstreamPath, expected.DownstreamPath))
	}
	if actual.TargetURL != expected.TargetURL {
		diffs = append(diffs, fmt.Sprintf("targetURL: got %q, want %q", actual.TargetURL, expected.TargetURL))
	}
	if actual.Found != expected.Found {
		diffs = append(diffs, fmt.Sprintf("found: got %v, want %v", actual.Found, expected.Found))
	}
	if actual.Overall != expected.Overall {
		diffs = append(diffs, fmt.Sprintf("overall: got %q, want %q", actual.Overall, expected.Overall))
	}

	status := "PASS"
	errMsg := ""
	if len(diffs) > 0 {
		status = "FAIL"
		errMsg = fmt.Sprintf("%v", diffs)
	}

	return TraceResult{
		Scenario:               s.Scenario,
		Module:                 s.Module,
		Status:                 status,
		IntentionalFailFixture: isIntentionalFixture(s.Verdict),
		Inputs: map[string]interface{}{
			"reqPath":       routeReqPath,
			"prefixToStrip": routePrefixToStrip,
			"statuses":      ports.statuses,
		},
		Expected: expected,
		Actual:   actual,
		ErrorMsg: errMsg,
	}, nil
}

// executeModule dispatches a module scenario.
func executeModule(s Scenario, traceDir string) (bool, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", s.Path, err)
	}

	env, err := peekEnvelope(data)
	if err != nil {
		return false, fmt.Errorf("peek %s: %w", s.Name, err)
	}

	var tr TraceResult
	switch env.Module {
	case "gateway":
		tr, err = executeGatewayModule(data, s.Name)
	default:
		return false, fmt.Errorf("unknown module %q in %s (not yet wired)", env.Module, s.Name)
	}
	if err != nil {
		return false, err
	}

	tr.ScenarioFile = s.Path
	tr.Tier = "module"
	tr.RunAt = time.Now().UTC().Format(time.RFC3339)
	writeTrace(traceDir, tr)

	return tr.Status == "PASS", nil
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	tierFlag := flag.String("tier", "", "primitive | module | all")
	moduleFlag := flag.String("module", "", "module name, e.g. api-gateway")
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

	serviceRoot := findServiceRoot(cwd)
	if serviceRoot == "" {
		logger.Error("cannot locate service root (go.mod not found)", slog.String("cwd", cwd))
		os.Exit(1)
	}

	traceDir := filepath.Join(serviceRoot, "sandbox", "traces")
	if err := os.MkdirAll(traceDir, 0o755); err != nil {
		logger.Error("cannot create trace dir", slog.String("dir", traceDir), slog.Any("err", err))
		os.Exit(1)
	}

	scenarios, err := discoverScenarios(serviceRoot, *tierFlag, *scenarioFlag)
	if err != nil {
		logger.Error("scenario discovery failed", slog.Any("err", err))
		os.Exit(1)
	}

	if len(scenarios) == 0 {
		logger.Info("no scenarios discovered",
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
			ok, runErr = executePrimitive(s, traceDir)
		case "module":
			ok, runErr = executeModule(s, traceDir)
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
