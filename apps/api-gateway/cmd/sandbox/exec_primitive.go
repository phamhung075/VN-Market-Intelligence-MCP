// exec_primitive.go — primitive-tier scenario executors + dispatcher.
// Extracted from main.go per FACTORY-APIGW-split-sandbox; buildPrimitiveTrace
// collapses the compare-tail that was duplicated across the 3 primitive
// executors (dedup only — assertion logic is unchanged).
//
// size-justification: ~185L — the 3 primitive scenario shapes + their executors
// + the shared buildPrimitiveTrace helper + the executePrimitive dispatcher must
// stay together: the dispatcher's switch references all 3 executors by name, and
// splitting further (one file per primitive) would re-duplicate the imports and
// the isIntentionalFixture/TraceResult wiring this file exists to consolidate.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	osc "github.com/vn-market-intelligence/api-gateway/pkg/primitive/overall-status-computer"
	ppr "github.com/vn-market-intelligence/api-gateway/pkg/primitive/proxy-path-resolver"
	rsm "github.com/vn-market-intelligence/api-gateway/pkg/primitive/route-service-matcher"
)

// ---------------------------------------------------------------------------
// buildPrimitiveTrace — shared compare-tail for the 3 primitive executors below
// ---------------------------------------------------------------------------

// buildPrimitiveTrace compares actual against expectedField — the single string
// value each primitive executor asserts on — sets PASS/FAIL + a
// "<fieldName>: got %q, want %q" error message on mismatch, and stamps
// IntentionalFailFixture from the scenario verdict. This is the compare-tail
// shared verbatim (same comparison, same message format) by
// executeOverallStatusComputer, executeProxyPathResolver, and
// executeRouteServiceMatcher below — dedup only, assertion logic unchanged.
func buildPrimitiveTrace(scenario, primitive, verdict, fieldName, actual, expectedField string, inputs, expected interface{}, actualOut map[string]string) TraceResult {
	status := "PASS"
	errMsg := ""
	if actual != expectedField {
		status = "FAIL"
		errMsg = fmt.Sprintf("%s: got %q, want %q", fieldName, actual, expectedField)
	}

	return TraceResult{
		Scenario:               scenario,
		Primitive:              primitive,
		Status:                 status,
		IntentionalFailFixture: isIntentionalFixture(verdict),
		Inputs:                 inputs,
		Expected:               expected,
		Actual:                 actualOut,
		ErrorMsg:               errMsg,
	}
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

	return buildPrimitiveTrace(s.Scenario, s.Primitive, s.Verdict, "overall", actual, s.Expected.Overall,
		s.Input, s.Expected, map[string]string{"overall": actual}), nil
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

	return buildPrimitiveTrace(s.Scenario, s.Primitive, s.Verdict, "resolvedPath", actual, s.Expected.ResolvedPath,
		s.Input, s.Expected, map[string]string{"resolvedPath": actual}), nil
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
	Input *struct {
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

	return buildPrimitiveTrace(s.Scenario, s.Primitive, s.Verdict, "serviceName", actual, s.Expected.ServiceName,
		s.Input, s.Expected, map[string]string{"serviceName": actual}), nil
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
