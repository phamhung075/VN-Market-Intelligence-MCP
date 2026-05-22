# dev-technical-analysis — Main (Pointer)

**Zone:** `apps/technical-analysis/`
**Specialist for:** RSI, MACD, Bollinger Bands, indicator math

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `technical-analysis`
- `<agent-id>` = `dev-technical-analysis`
- zone restriction: only `apps/technical-analysis/` files

---

## Language Mode

Detect language from the task spec before running any step of the shared flow. Do NOT assume a language.

| Signal in task spec | Mode | Primary reference |
|---|---|---|
| Files contain `*.go`, `go.mod`, `cmd/`, `internal/` | **Go** (active pilot — primary mode) | `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan-go.md` |
| Files contain `*.ts`, `*.tsx`, `bun`, `package.json` | **TS** (legacy — other parts of repo still TS) | historical; do not drive new pilot work from it |
| Both or ambiguous | **Go** (default for `technical-analysis` pilot per `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md`) | same Go ref above |

**Go is primary for the next 6-sprint pilot window (through 2026-07-03).** All P1-A1g..A5g, P1-B1g..B5g, P1-C1g, P1-D1g..D2g tasks are Go.

When in **Go mode**, read the composition-root spec before touching code:
→ `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan-go.md` (lazy-load: trigger = Go task assigned)

When in **TS mode**, that mode is for non-pilot zones of the repo only. The TS plan `docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan.md` is an obsolete reference — do not drive new `technical-analysis` work from it.

---

## Smoke Checks

Run the column matching your Language Mode before every commit. Both columns are mandatory for tasks that touch shared language-agnostic files (scenario JSON, dashboard HTML).

| Check | Go mode | TS mode |
|---|---|---|
| Unit tests | `cd apps/technical-analysis && go test ./...` | `cd apps/technical-analysis && bun test` |
| Static analysis | `go vet ./...` | `bun tsc --noEmit` |
| Lint / extra | `staticcheck ./...` (or `golangci-lint run` — per architect spec) | — |
| Compile check | `go build ./cmd/...` | — |
| Scenario JSON validity | `find docs/scenarios/technical-analysis -name '*.json' -exec jq . {} \; > /dev/null` | same |
| Sandbox runner | `go run ./cmd/sandbox -tier=all -module=technical-analysis -scenario=all` | `bun run sandbox --tier=all --module=technical-analysis` |

---

## Pilot Hard Rule (G12 — blocking)

> MUST run pilot scenarios + verify dashboard green before reporting task complete

**Enforcement:** Before writing the RETURN block or marking any task DONE, run the sandbox command for your Language Mode (see Smoke Checks table above).

Open `apps/technical-analysis/dashboard/index.html` and verify ALL scenario cards show green. If ANY card is red, the task is NOT done — fix the failing scenario first.

This rule is non-negotiable. It applies to every task cycle in the `technical-analysis` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan-go.md` | **PRIMARY** (Go pilot) | Go composition root: `cmd/server/main.go`, `internal/` DDD layout, `go.mod`, Dockerfile multi-stage |
| `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` | **BINDING** | Option B verdict; authority for Go pivot |
| `docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md` | Active stub | Go task ledger P1-A1g..E2 |
| `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` | Active | G1–G12 goals (language-agnostic) |
| `docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan.md` | OBSOLETE reference | Historical TS plan — do not drive new work from it |

---

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/technical-analysis/`. Agent definition: `.claude/agents/dev-technical-analysis.md`.
