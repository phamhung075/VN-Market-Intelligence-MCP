// Command composition-root-logic-gate — FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL
//
// CI-time zero-tolerance guardrail: no receiver method on a composition-root
// adapter/shim type (cmd/server/**/*.go) may embed business-logic branching.
// Closes the gap identified in
// docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md
// §3: depguard (existing Fence-A/B/C, .golangci.yml) is import-based only and
// cannot express "composition-root tiers contain no logic belonging in
// pkg/module" — a decision (fallback selection, an IsEstimate/ParseOK-style
// confidence flag, a parse-result transform loop) hiding inside a shim type
// that nominally just bridges an application-layer port to an infrastructure
// function. Live scan at design time (2026-07-24) found exactly 2 real
// offenders, both in apps/macro-indicators/cmd/server/adapters.go
// (policyRatesAdapter.FetchPolicyRates, omoAdapter.FetchOMO) — see the brief
// for the full method-by-method count.
//
// Mechanism (go/ast + go/parser, Go stdlib only — no new go.mod dep):
//   - Scope: RECEIVER METHODS ONLY (ast.FuncDecl with Recv != nil) inside
//     cmd/server/**/*.go, excluding *_test.go. This automatically excludes
//     func main() and every free (non-receiver) helper function — env*/
//     getenv/splitCSV/parseWatchlist/readWatchlistFromDB and any DI-wiring
//     branching inside main() are legitimate startup/config-parsing/wiring
//     and are structurally out of scope (they have no receiver), not a
//     special-cased allowlist.
//   - Threshold: a receiver method is flagged when it contains
//     if-count >= 2 OR any for/range statement, counted anywhere in its body
//     (including inside nested func literals) — grep-verified 2026-07-24 to
//     cleanly separate the 2 real offenders from all other checked
//     receiver-method shims across all 7 Go services (zero false positives).
//   - Escape hatch: an inline `composition-root-logic-allow: <reason>`
//     comment in the method's doc-comment block (the comment lines
//     immediately preceding the `func` line, go/ast's FuncDecl.Doc — same
//     "immediately preceding" contract as size-lint's `size-justification:`
//     and metric-mask-lint's `metric-mask-allow:`) suppresses that one
//     method.
//
// Usage:
//
//	go run scripts/audits/composition-root-logic-gate.go --check <dir> [<dir> ...]
//
// Exit 0 = zero violations across every given dir. Exit 1 = --check mode and
// at least one violation found (violations are printed to stdout regardless
// of exit code). Exit 2 = usage/parse error (bad args, unreadable dir,
// unparseable .go file — a syntax error in scanned code is a build-breaking
// bug in its own right, not a gate finding).
//
// Owning flow: docs/policies/dev-standards.md § Script Persistence
// Detail ref: docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md
// Test: scripts/audits/composition-root-logic-gate.test.go
package main

import (
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// allowMarker is the escape-hatch comment keyword. Mirrors the repo-wide
// `size-justification:` / `metric-mask-allow:` convention.
const allowMarker = "composition-root-logic-allow:"

// ifThreshold: a receiver method is flagged when its if-count reaches this
// value, OR it contains any for/range statement (forThreshold is implicitly 1).
const ifThreshold = 2

// violation describes one flagged composition-root receiver method.
type violation struct {
	file     string
	line     int
	recv     string
	method   string
	ifCount  int
	forCount int
}

func (v violation) String() string {
	return fmt.Sprintf(
		"%s:%d: receiver method (%s).%s has %d if(s) + %d for/range — "+
			"composition-root receiver methods must not embed branching business "+
			"logic (move it to pkg/application; escape hatch: `// %s <reason>` "+
			"on the line(s) immediately preceding the method)",
		v.file, v.line, v.recv, v.method, v.ifCount, v.forCount, allowMarker,
	)
}

func main() {
	checkMode := flag.Bool("check", false, "check mode: exit 1 if any violation is found")
	flag.Parse()
	dirs := flag.Args()
	if !*checkMode || len(dirs) == 0 {
		fmt.Fprintln(os.Stderr, "usage: composition-root-logic-gate --check <dir> [<dir> ...]")
		os.Exit(2)
	}

	violations, err := scanDirs(dirs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "composition-root-logic-gate: %v\n", err)
		os.Exit(2)
	}

	for _, v := range violations {
		fmt.Println(v.String())
	}

	if len(violations) > 0 {
		fmt.Fprintf(os.Stderr, "composition-root-logic-gate: %d violation(s) across %d dir(s)\n",
			len(violations), len(dirs))
		os.Exit(1)
	}
	fmt.Printf("composition-root-logic-gate: 0 violations across %d dir(s)\n", len(dirs))
}

// scanDirs walks every dir and returns all violations, sorted by file then line.
func scanDirs(dirs []string) ([]violation, error) {
	var out []violation
	for _, dir := range dirs {
		vs, err := scanDir(dir)
		if err != nil {
			return nil, err
		}
		out = append(out, vs...)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].file != out[j].file {
			return out[i].file < out[j].file
		}
		return out[i].line < out[j].line
	})
	return out, nil
}

// scanDir recursively walks dir, parsing every non-test *.go file.
func scanDir(dir string) ([]violation, error) {
	var out []violation
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk %s: %w", path, walkErr)
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		vs, err := scanFile(path)
		if err != nil {
			return err
		}
		out = append(out, vs...)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// scanFile parses one Go source file and returns violations for every
// offending receiver method (see package doc for the exact rule).
func scanFile(path string) ([]violation, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return scanFuncDecls(fset, file, path), nil
}

// scanFuncDecls inspects the top-level declarations of a parsed file for
// offending receiver methods. Free functions (func main included — it has
// no receiver) are never inspected: they are out of scope by construction.
func scanFuncDecls(fset *token.FileSet, file *ast.File, path string) []violation {
	var out []violation
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Recv == nil || fn.Body == nil {
			continue
		}
		if hasAllowComment(fn.Doc) {
			continue
		}
		ifCount, forCount := countBranches(fn.Body)
		if ifCount >= ifThreshold || forCount > 0 {
			out = append(out, violation{
				file:     path,
				line:     fset.Position(fn.Pos()).Line,
				recv:     receiverTypeName(fn.Recv),
				method:   fn.Name.Name,
				ifCount:  ifCount,
				forCount: forCount,
			})
		}
	}
	return out
}

// hasAllowComment reports whether doc (the comment block immediately
// preceding a FuncDecl, per go/ast — a blank line breaks the association)
// contains the escape-hatch marker.
func hasAllowComment(doc *ast.CommentGroup) bool {
	if doc == nil {
		return false
	}
	return strings.Contains(doc.Text(), allowMarker)
}

// countBranches counts if-statements and for/range statements anywhere in
// body, including inside nested func literals (a closure defined inside a
// receiver method is still that method's own logic).
func countBranches(body *ast.BlockStmt) (ifCount, forCount int) {
	ast.Inspect(body, func(n ast.Node) bool {
		switch n.(type) {
		case *ast.IfStmt:
			ifCount++
		case *ast.ForStmt, *ast.RangeStmt:
			forCount++
		}
		return true
	})
	return ifCount, forCount
}

// receiverTypeName extracts the bare (pointer-stripped) receiver type name,
// e.g. "*policyRatesAdapter" -> "policyRatesAdapter", for readable output.
func receiverTypeName(recv *ast.FieldList) string {
	if recv == nil || len(recv.List) == 0 {
		return "?"
	}
	expr := recv.List[0].Type
	if star, ok := expr.(*ast.StarExpr); ok {
		expr = star.X
	}
	if ident, ok := expr.(*ast.Ident); ok {
		return ident.Name
	}
	return "?"
}
