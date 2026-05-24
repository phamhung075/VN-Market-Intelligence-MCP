<!-- size-justification: 138L — thin pointer + pilot enforcement content (Language Mode, Smoke Checks, G12 DoD, Security Clause, Fence Rules A/B/C, Pre-Revert Tag Protocol, References); identical structure to dev-stock-price — schedule for split when macro-indicators pilot reaches Phase 2 (same pass as S4) -->
# dev-macro-indicators — Main (Pointer)

**Zone:** `apps/macro-indicators/`
**Specialist for:** SBV FX rates, commodity prices, macro regime classification, carry-trade/yield-spread signals

Thin pointer — shared flow for all dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `macro-indicators`
- `<agent-id>` = `dev-macro-indicators`
- zone restriction: only `apps/macro-indicators/` files

---

## Language Mode

Detect language from the task spec before running any step of the shared flow. Do NOT assume a language.

| Signal in task spec | Mode | Primary reference |
|---|---|---|
| Files contain `*.go`, `go.mod`, `cmd/`, `pkg/` | **Go** (active pilot — primary mode) | `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` §8 |
| Files contain `*.ts`, `*.tsx`, `bun`, `package.json` | **TS** (legacy scrapers only — no new pilot work in TS) | historical; do not drive new pilot work from it |
| Both or ambiguous | **Go** (default for macro-indicators pilot per `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` §Q2) | same Go ref above |

**Go is primary for the 6-sprint pilot window (through 2026-07-04).** All P1-A1..E2, P2-A..F tasks are Go.

When in **Go mode**, load the brownfield inventory before touching code:
→ `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` (lazy-load: trigger = Go task assigned)

When in **TS mode**, that mode is for legacy scraper files in `src/infrastructure/scrapers/` only. No new TS files for the pilot domain.

---

## Smoke Checks

Run the column matching your Language Mode before every commit. Both columns mandatory for tasks touching language-agnostic files (scenario JSON, dashboard HTML).

| Check | Go mode | TS mode |
|---|---|---|
| Unit tests | `cd apps/macro-indicators && go test ./...` | `cd apps/macro-indicators && bun test` |
| Static analysis | `go vet ./...` | `bun tsc --noEmit` |
| Lint / extra | `golangci-lint run` (or offline per architect spec) | — |
| Compile check | `go build ./cmd/...` | — |
| Scenario JSON validity | `find docs/scenarios/macro-indicators -name '*.json' -exec jq . {} \; > /dev/null` | same |
| Sandbox runner (primitive) | `go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all` | N/A |
| Sandbox runner (module) | `go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all` | N/A |

---

## Pilot Hard Rule (G12 — blocking)

### G12 DoD Gate (mandatory — blocking from Day 0)

**Do not mark task DONE until sandbox dashboard shows all macro scenarios green.**

Run both tiers before declaring complete:

```bash
cd apps/macro-indicators
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.

This rule is non-negotiable. It applies to every task cycle in the `macro-indicators` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` §G12

---

## Security Rule (§Security Clause — blocking)

**Sandbox process MUST have zero DB credentials and zero external API keys at all times.**

Before declaring any sandbox-related task DONE, verify:

```bash
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD|FRED_API_KEY"
# Must return empty when running inside the sandbox process context
```

`FRED_API_KEY` is explicitly named — it is used by the TS `fred-macro.ts` scraper and MUST NOT leak into the Go sandbox process. Sandbox runs against scenario JSON fixtures, NOT live FRED API.

If any credential appears in sandbox env, the task is blocked — it does not pass.

---

## Fence Rules (Depguard — G4 pre-check before commit)

Three architectural fences must hold on every commit touching Go files:

- **Fence-A:** `pkg/primitive/*/` MUST NOT import anything from `pkg/application/`, `pkg/interface/`, or `pkg/module/`. Check: `grep -rn "application\|interface\|module" pkg/primitive/` returns 0.
- **Fence-B:** `pkg/module/*/` MUST NOT import anything from `pkg/infrastructure/`. Check: `grep -rn "infrastructure" pkg/module/` returns 0.
- **Fence-C:** `pkg/infrastructure/` MUST NOT be imported by any file except `cmd/server/main.go`. Check: `grep -rn "infrastructure" pkg/domain/ pkg/application/ pkg/primitive/ pkg/module/ pkg/interface/` returns 0.

Fence violations = task not done. Fix and re-run.

---

## Pre-Revert Tag Protocol (Phase 2 tasks)

Before Phase 2 mutation sequences:

| Pre-step | Tag to create | Before |
|---|---|---|
| Before G4 CI job activation in `.github/workflows/ci.yml` | `macro-pre-ci` | P2-A2 commit |
| Before `git mv src/ src/_deprecated/` (G5) | `macro-pre-delete` | P2-B2 commit |
| Before bug injection commit (G10) | `macro-pre-inject` | P2-D2 commit |

Create with: `git tag macro-pre-<name> HEAD` — NO `--force`, NO push.

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` | **PRIMARY** | Brownfield scan: 6 primitives selected, DDD assessment, scraper status, R-1 Math.random risk |
| `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` | **Active** | Go task ledger P1-A1..E2 with per-task AC |
| `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` | **Binding** | G1-G12 goals + constraints + security clause |
| `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` | **Binding** | §Q2 verdict generalizes Go to macro-indicators |
| `docs/data/pilot-status-macro-indicators.json` | **Live SSOT** | Goal tracking — PO reads; dev-macro-indicators does not write |

---

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/macro-indicators/`. Agent definition: `.claude/agents/dev-macro-indicators.md`.
