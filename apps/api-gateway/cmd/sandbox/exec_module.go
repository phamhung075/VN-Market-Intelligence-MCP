// exec_module.go — module-tier (gateway) scenario executor + the sandbox port
// stub it runs against. Extracted from main.go per FACTORY-APIGW-split-sandbox;
// sandboxService is the named type that replaces the anonymous
// `struct{targetURL, noProbe, preservePath}` literal that was declared 3x in the
// pre-split sandboxPorts (dedup only — assertion logic is unchanged).
//
// size-justification: ~220L — sandboxService/sandboxPorts (the RoutingPorts stub),
// the moduleRouteStoryScenario JSON shape, executeGatewayModule (5-field diff
// comparison), and the executeModule dispatcher are one cohesive "run the gateway
// module against a route-story fixture" concern; the diff comparison in
// executeGatewayModule cannot be shortened without changing which fields are
// asserted, which this task forbids.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	gw "github.com/vn-market-intelligence/api-gateway/pkg/module/gateway"
)

// ---------------------------------------------------------------------------
// Module: gateway
// ---------------------------------------------------------------------------

// sandboxService describes one upstream service's routing config in the sandbox
// registry — the named type that replaces the 3x-repeated anonymous struct in the
// pre-split sandboxPorts (single source of truth for the shape).
type sandboxService struct {
	targetURL    string
	noProbe      bool
	preservePath bool
}

// sandboxPorts is a pure in-memory implementation of gateway.RoutingPorts used
// exclusively by the sandbox. No net/http, no DB, no credentials.
type sandboxPorts struct {
	services map[string]sandboxService
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
		services: map[string]sandboxService{},
		statuses: map[string]string{},
	}

	// Populate the service registry from routing_result.
	if s.RoutingResult.ServiceName != "" {
		ports.services[s.RoutingResult.ServiceName] = sandboxService{
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
