// Package main — macro-indicators sandbox scenario runner.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=module    -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=all       -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json
//
// Security contract:
//   - Zero DB access. Zero network calls. Zero API keys.
//   - Reads scenario JSON from docs/scenarios/macro-indicators/ only.
//   - All computation via pkg/primitive/* and pkg/module/* (pure functions, P1-B1+).
//
// P1-A3 — feat(macro-indicators): sandbox harness CLI (placeholder runner until P1-B1).
// P1-B1 — wire executePrimitive to macro_investment_clock.Classify + executeFallback stubs.
// P1-C1 — wire executeModule to macro_signals.ClassifyBatch via module tier.
//
// File split (FACTORY-MACRO-split-sandbox, 2026-07-09): this file holds flags + the
// main scenario-run loop only. See the sibling files for the rest of package main:
//   - discovery.go  — Scenario type, findRepoRoot, discoverScenarios
//   - primitives.go — 6 primitive-tier executors, compareFields collapse helper, executePrimitive dispatcher
//   - module.go     — macro_signals module executors, concreteClock adapter, executeModule dispatcher
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
	moduleFlag := flag.String("module", "", "module name, e.g. macro-indicators")
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
		logger.Info("no scenarios discovered (expected during scaffold phase — P1-D1/D2 will create them)",
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
