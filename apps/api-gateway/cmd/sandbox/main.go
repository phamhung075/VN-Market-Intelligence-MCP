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
//
// File layout (FACTORY-APIGW-split-sandbox):
//   - main.go           — flags, tier loop, summary (this file, entry point only)
//   - discover.go       — repo/service-root resolution + scenario discovery + envelope peek
//   - trace.go          — TraceResult type + writeTrace
//   - exec_primitive.go — primitive executors + buildPrimitiveTrace dedup + dispatcher
//   - exec_module.go    — sandboxService/sandboxPorts + gateway module executor + dispatcher
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

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
