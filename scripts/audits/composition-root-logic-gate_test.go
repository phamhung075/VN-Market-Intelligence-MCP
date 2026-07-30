// scripts/audits/composition-root-logic-gate.test.go — smoke test for
// composition-root-logic-gate.go (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL).
//
// Covers the 4 DoD cases from
// docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md §3/§4:
//  1. --check exits 0 (0 violations) across all 7 real Go services' cmd/server/
//     post-fix (live regression, not just a synthetic fixture).
//  2. A synthetic new offending receiver method (2 ifs, no allow-comment) fails.
//  3. An annotated method (with the composition-root-logic-allow comment) passes.
//  4. main()/free-function branching never flags (false-positive guard).
//
// Cases 2-4 use in-memory synthetic source via go/parser — no fixture files
// written to disk, no dependency on any package/module resolution (the tool
// itself is syntax-only, go/ast + go/parser, never type-checks).
//
// Run: go test scripts/audits/composition-root-logic-gate.go scripts/audits/composition-root-logic-gate.test.go
package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"runtime"
	"testing"
)

// parseSrc parses an in-memory Go source snippet with comments retained
// (required for the composition-root-logic-allow escape-hatch check).
func parseSrc(t *testing.T, src string) (*token.FileSet, *ast.File) {
	t.Helper()
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "synthetic.go", src, parser.ParseComments)
	if err != nil {
		t.Fatalf("parseSrc: %v", err)
	}
	return fset, file
}

// repoRoot resolves the repository root relative to this test file's own
// on-disk location (runtime.Caller), independent of the `go test` invocation
// cwd — scripts/audits/ carries no go.mod, so it cannot rely on module-root
// discovery.
func repoRoot(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("repoRoot: runtime.Caller(0) failed")
	}
	// thisFile = <repo>/scripts/audits/composition-root-logic-gate.test.go
	return filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
}

// --- Case 2: synthetic offending receiver method (2 ifs, no allow-comment) fails. ---

func TestOffendingReceiverMethod_TwoIfsNoAllowComment_IsFlagged(t *testing.T) {
	src := `package main

type fooAdapter struct{}

func (a *fooAdapter) Fetch(x int) (int, error) {
	if x > 0 {
		x++
	}
	if x > 10 {
		x += 2
	}
	return x, nil
}
`
	fset, file := parseSrc(t, src)
	vs := scanFuncDecls(fset, file, "synthetic.go")
	if len(vs) != 1 {
		t.Fatalf("want 1 violation, got %d: %+v", len(vs), vs)
	}
	if vs[0].recv != "fooAdapter" || vs[0].method != "Fetch" || vs[0].ifCount != 2 || vs[0].forCount != 0 {
		t.Fatalf("unexpected violation shape: %+v", vs[0])
	}
}

// Any for/range alone (even 0 ifs) must also flag — not just the if-count>=2 branch.
func TestOffendingReceiverMethod_SingleForNoIfs_IsFlagged(t *testing.T) {
	src := `package main

type barAdapter struct{}

func (b *barAdapter) Convert(rows []int) []int {
	out := make([]int, 0, len(rows))
	for _, r := range rows {
		out = append(out, r)
	}
	return out
}
`
	fset, file := parseSrc(t, src)
	vs := scanFuncDecls(fset, file, "synthetic.go")
	if len(vs) != 1 {
		t.Fatalf("want 1 violation, got %d: %+v", len(vs), vs)
	}
	if vs[0].ifCount != 0 || vs[0].forCount != 1 {
		t.Fatalf("unexpected violation shape: %+v", vs[0])
	}
}

// --- Case 3: an annotated method (with the allow-comment) passes. ---

func TestAnnotatedReceiverMethod_AllowComment_Passes(t *testing.T) {
	src := `package main

type fooAdapter struct{}

// Fetch intentionally carries a fallback decision, architect sign-off recorded.
// composition-root-logic-allow: architect-approved, see brief 2026-07-24 §3.
func (a *fooAdapter) Fetch(x int) (int, error) {
	if x > 0 {
		x++
	}
	if x > 10 {
		x += 2
	}
	return x, nil
}
`
	fset, file := parseSrc(t, src)
	vs := scanFuncDecls(fset, file, "synthetic.go")
	if len(vs) != 0 {
		t.Fatalf("want 0 violations (allow-comment escape hatch), got %d: %+v", len(vs), vs)
	}
}

// A comment block separated from the func by a blank line is NOT a doc
// comment per go/ast — the allow marker must NOT suppress in that case
// (matches size-justification/metric-mask-allow's "immediately preceding" contract).
func TestAllowComment_SeparatedByBlankLine_DoesNotSuppress(t *testing.T) {
	src := `package main

type fooAdapter struct{}

// composition-root-logic-allow: this comment is NOT immediately preceding.

func (a *fooAdapter) Fetch(x int) (int, error) {
	if x > 0 {
		x++
	}
	if x > 10 {
		x += 2
	}
	return x, nil
}
`
	fset, file := parseSrc(t, src)
	vs := scanFuncDecls(fset, file, "synthetic.go")
	if len(vs) != 1 {
		t.Fatalf("want 1 violation (allow-comment not immediately preceding, must not suppress), got %d: %+v", len(vs), vs)
	}
}

// --- Case 4: main()/free-function branching never flags (false-positive guard). ---

func TestMainAndFreeFunctionBranching_NeverFlagged(t *testing.T) {
	src := `package main

func main() {
	x := 0
	if x == 0 {
		x = 1
	}
	if x == 1 {
		x = 2
	}
	for i := 0; i < 3; i++ {
		x += i
	}
}

// envStr mirrors the real repo's free helper functions (technical-analysis,
// stock-price, news-fetch cmd/server/main.go) — legitimate startup/config
// branching+looping, structurally out of scope (no receiver).
func envStr(key, fallback string) string {
	if key == "" {
		return fallback
	}
	for range []int{1, 2, 3} {
		fallback += "x"
	}
	return fallback
}
`
	fset, file := parseSrc(t, src)
	vs := scanFuncDecls(fset, file, "synthetic.go")
	if len(vs) != 0 {
		t.Fatalf("want 0 violations (main/free-function out of scope by construction), got %d: %+v", len(vs), vs)
	}
}

// Positive control: a pure-delegation receiver method (the shim shape that
// must NEVER flag) stays clean.
func TestPureDelegationShim_ZeroBranching_Passes(t *testing.T) {
	src := `package main

type bopParserAdapter struct{}

func (a *bopParserAdapter) Parse(body []byte) (int, error) {
	return infrastructure.ParseBOPResponse(body)
}
`
	fset, file := parseSrc(t, src)
	vs := scanFuncDecls(fset, file, "synthetic.go")
	if len(vs) != 0 {
		t.Fatalf("want 0 violations (pure delegation), got %d: %+v", len(vs), vs)
	}
}

// --- Case 1: --check exits 0 (0 violations) across all 7 real Go services'
// cmd/server/ post-fix. Live regression against the actual repo tree, not a
// fixture — this is the same set of dirs wired into the composition-root-logic-gate
// CI job (.github/workflows/ci.yml). If someone re-introduces branching logic
// into a composition-root shim later without the escape-hatch comment, this
// test fails locally before CI ever runs.

func TestAllSevenGoServices_ZeroViolations_PostFix(t *testing.T) {
	root := repoRoot(t)
	services := []string{
		"technical-analysis",
		"macro-indicators",
		"stock-price",
		"alert-engine",
		"api-gateway",
		"kinh-dich-service",
		"news-fetch",
	}
	var dirs []string
	for _, s := range services {
		dirs = append(dirs, filepath.Join(root, "apps", s, "cmd", "server"))
	}
	vs, err := scanDirs(dirs)
	if err != nil {
		t.Fatalf("scanDirs: %v", err)
	}
	if len(vs) != 0 {
		t.Fatalf("want 0 violations across all 7 services post-fix, got %d:\n%s", len(vs), joinViolations(vs))
	}
}

func joinViolations(vs []violation) string {
	s := ""
	for _, v := range vs {
		s += v.String() + "\n"
	}
	return s
}
