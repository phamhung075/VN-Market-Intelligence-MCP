// Package main — alert-engine sandbox scenario runner.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
//	go run ./cmd/sandbox -tier=module    -module=alert-engine -scenario=all
//	go run ./cmd/sandbox -tier=all       -module=alert-engine -scenario=all
//	go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=docs/scenarios/alert-engine/primitives/signal-classifier-golden.json
//
// Security contract:
//   - Zero DB access. Zero network calls. Zero API keys. Zero Telegram credentials.
//   - Reads scenario JSON from docs/scenarios/alert-engine/ only.
//   - All computation via pkg/primitive/* and pkg/module/* (pure functions, P1-B1+).
//
// ZERO-CREDS gate: this binary MUST build and run with zero Telegram credentials
// in the process environment. No live credentials, no channel IDs, no API keys.
//
// R-CGO gate: this binary MUST build and run under CGO_ENABLED=0.
// No C-extension imports, no C pragmas, no CGO dependencies.
// Scenario JSON fixtures stand in for all live data.
//
// P1-A  — sandbox harness CLI with full flag/discovery/dispatch framework.
//
//	No primitive executors yet (wired in P1-B1+).
//
// P1-B1 — wire executePrimitive to signal-classifier.Classify.
// P1-B2 — wire executePrimitive to dedup-key-builder.BuildKey.
// P1-B3 — wire executePrimitive to cooldown-gate.Check.
// P1-C  — wire executeModule to alert_pipeline.Run via port mocks.
//
// File layout (FACTORY-ALERT-split-sandbox):
//   - main.go           — flags, tier loop, summary (this file, entry point only)
//   - discovery.go      — Scenario type + repo-root resolution + scenario discovery
//   - exec_primitive.go — primitive executors + dispatcher
//   - exec_module.go    — sandbox mock ports + alert_pipeline executor + dispatcher
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	tierFlag := flag.String("tier", "", "primitive | module | all")
	moduleFlag := flag.String("module", "", "module identifier, e.g. alert-engine")
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
