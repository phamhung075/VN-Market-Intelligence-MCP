// Package main — stock-price sandbox.
//
// R-CGO gate: this binary MUST build and run under CGO_ENABLED=0.
// Zero mattn/go-sqlite3 imports, zero C pragmas, zero CGO dependencies.
// Scenario JSON fixtures stand in for tier-fetch results.
// Phase 1 will expand this stub as primitives + module are extracted.
//
// Usage: CGO_ENABLED=0 go run ./cmd/sandbox [-help]
package main

import (
	"flag"
	"fmt"
)

func main() {
	help := flag.Bool("help", false, "Show usage")
	flag.Parse()

	if *help {
		fmt.Println("stock-price sandbox — R-CGO verified")
		fmt.Println("Usage: CGO_ENABLED=0 go run ./cmd/sandbox [-help]")
		fmt.Println()
		fmt.Println("Phase 0 stub: confirms zero CGO in primitive/module/sandbox layers.")
		fmt.Println("Phase 1 will add: -tier=primitive -module=stock-price -scenario=all")
		return
	}

	fmt.Println("Stock-price sandbox: R-CGO verified — no CGO dependencies")
}
