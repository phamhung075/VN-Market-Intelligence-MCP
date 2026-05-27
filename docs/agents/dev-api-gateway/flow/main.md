<!-- size-justification: 144L — thin pointer + pilot enforcement content (Three-Tier Ownership, Notebook Read, Smoke Checks, G12 DoD Gate, Security Clause, Depguard Fence, References); mirrors dev-kinh-dich pattern for SCALE Go pilot; all sections are blocking Day-0 gates non-separable from flow execution. -->
# dev-api-gateway — Main (Pointer)

**Zone:** `apps/api-gateway/`
**Specialist for:** Go 1.22 NO-CGO routing, health aggregation, service discovery — SCALE pilot three-tier refactor
**Pilot:** `docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-charter.md`

Thin pointer — shared flow for all dev-* zone agents:

→ Run flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions:
- `<service>` = `api-gateway`
- `<agent-id>` = `dev-api-gateway`
- zone restriction: only `apps/api-gateway/` files

---

## Three-Tier Ownership

| Tier | Path | Contents |
|---|---|---|
| Primitives | `pkg/primitive/` | HONEST 3: overall-status-computer, proxy-path-resolver, route-service-matcher |
| Module | `pkg/module/gateway/` | Single gateway module — composes 3 primitives via ports |
| Composition root | `cmd/server/main.go` | Wires module + adapters; zero domain logic; ≤80L |
| Sandbox runner | `cmd/sandbox/` | Scenario JSON execution (CGO_ENABLED=0) |
| Trust dashboard | `dashboard/` | Three-level HTML dashboard (file:// standalone) |

Do NOT manufacture a 4th primitive. Honest 3 is correct and expected (charter delta: lowest-domain-logic service).
Load charter before Phase 1 work → `docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-charter.md`

---

## Notebook Read (cycle start — mandatory)

→ skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `dev-api-gateway`)

---

## Smoke Checks

Run all checks before every commit:

| Check | Command |
|---|---|
| Unit tests | `cd apps/api-gateway && go test ./...` |
| Vet | `cd apps/api-gateway && go vet ./...` |
| Build | `cd apps/api-gateway && go build ./cmd/...` |
| Lint / fence | `cd apps/api-gateway && golangci-lint run ./...` |
| Sandbox runner (primitive) | `cd apps/api-gateway && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=api-gateway -scenario=all` |
| Sandbox runner (module) | `cd apps/api-gateway && CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=api-gateway -scenario=all` |

---

## DoD Gate (G12 checkpoint — mandatory — blocking from Day 0)

**Do not mark task DONE / do not RETURN until sandbox dashboard shows all api-gateway scenarios GREEN.**

Run both tiers before declaring complete:

```bash
cd apps/api-gateway
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=api-gateway -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=api-gateway -scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.

This rule is non-negotiable. It applies to every task cycle in the `api-gateway` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12 (canonical G1–G12)

---

## Security Rule (§Security / Zero-Credentials Clause — blocking)

**Sandbox process MUST have zero DB credentials, zero external API keys, AND zero secrets at all times.**

Before declaring any sandbox-related task DONE, verify:

```bash
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"
# Must return empty when running inside the sandbox process context
```

**api-gateway-specific:** routing/proxy logic is pure compute. The sandbox runs extracted primitives + module against scenario JSON fixtures. No SQLite DB, no VPS call, no external API key — `CGO_ENABLED=0` (api-gateway is go1.22 NO-CGO; stdlib only, empty go.sum). Zero credentials is trivially clean for this service.

Scenario JSON must also be credential-free:

```bash
grep -rniE 'token|secret|api_key|password' apps/api-gateway/cmd/sandbox/
# Must return empty
```

If any credential appears in sandbox env or scenario files, the task is blocked.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §Security / Zero-Credentials Clause

---

## Depguard Fence Gate (golangci-lint — G4 pre-check before every commit to Go files)

Three architectural fences must hold on every commit touching Go files in `apps/api-gateway/`:

- **Fence-A:** `pkg/primitive/**` MUST NOT import anything from `pkg/module/`, `pkg/application/`, `pkg/interface/`, or `pkg/infrastructure/`. Also MUST NOT import `net/http` or `net/http/httputil` (pure tier — stdlib + domain only).

- **Fence-B:** `pkg/module/**` MUST NOT import anything from `pkg/application/`, `pkg/interface/`, or `pkg/infrastructure/`. Module composes via ports (Go interfaces) only. No direct `net/http` dial.

- **Fence-C:** `pkg/infrastructure/**` may only be imported from `cmd/server/main.go` (composition root). All other files are barred.

**Fence check command (run before every Go commit):**

```bash
cd apps/api-gateway
golangci-lint run ./...
# Exit 0 = CLEAR. Exit != 0 = FENCE VIOLATION — fix before committing.
```

**Fence config location:** `apps/api-gateway/.golangci.yml` (authored at G4; spec in charter §G4 calibration).

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-charter.md` | **Binding** | Thin scale charter — service deltas, primitive band, blast-radius risks |
| `docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-brownfield.md` | **Binding** | HONEST 3 confirmation, DDD layer audit, port/CGO verification |
| `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` | **Canonical** | G1–G12 goals (language-agnostic) + security clause + pre-revert tag protocol |
| `docs/data/pilot-status-api-gateway.json` | **Live SSOT** | Goal tracking — PO reads/writes; dev-api-gateway does not write |

---

For spike tasks (`mode: "spike"`): `docs/agents/developer/flow/feature-spike.md`.

Service docs: `docs/architecture/microservice/api-gateway/`. Agent definition: `.claude/agents/dev-api-gateway.md`.
