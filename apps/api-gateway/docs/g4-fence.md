# G4 Architecture Fence — api-gateway

**Goal:** G4 — Architecture fence enforced in CI
**Pilot:** api-gateway SCALE pilot
**Config:** `apps/api-gateway/.golangci.yml`
**Linter:** depguard via golangci-lint v2

---

## Deny Rules

Four fence rules protect the three-tier DDD architecture plus I/O purity in primitives.

### Fence-A — Primitive purity (zero I/O, zero upward imports)

Files: `**/pkg/primitive/**`

| Denied package | Reason |
|---|---|
| `github.com/vn-market-intelligence/api-gateway/pkg/module` | Primitive must not import module layer (upward dependency forbidden) |
| `github.com/vn-market-intelligence/api-gateway/pkg/application` | Primitive must not import application layer |
| `github.com/vn-market-intelligence/api-gateway/pkg/interface` | Primitive must not import interface layer |
| `github.com/vn-market-intelligence/api-gateway/pkg/infrastructure` | Primitive must not import infrastructure layer |
| `net/http` | Primitive must be pure-compute (zero I/O) — api-gateway brownfield charter §G4 |
| `net/http/httputil` | Primitive must be pure-compute (zero I/O) — api-gateway brownfield charter §G4 |

### Fence-B — Module isolation (compose via ports only)

Files: `**/pkg/module/**`

| Denied package | Reason |
|---|---|
| `github.com/vn-market-intelligence/api-gateway/pkg/application` | Module must not import application layer |
| `github.com/vn-market-intelligence/api-gateway/pkg/interface` | Module must not import interface layer |
| `github.com/vn-market-intelligence/api-gateway/pkg/infrastructure` | Module must not import infrastructure layer |

Modules compose primitives directly and communicate with infrastructure only via Go interface ports (RoutingPorts). No direct net/http dial in the module layer.

### Fence-C — Infrastructure wired at composition root only

Files: all except `**/cmd/server/main.go` and `**/*_test.go`

| Denied package | Reason |
|---|---|
| `github.com/vn-market-intelligence/api-gateway/pkg/infrastructure` | Infrastructure wiring only allowed in cmd/server/main.go (composition root) |

Test files (`*_test.go`) are exempt to allow infrastructure package self-tests.

---

## Fence Command

```bash
cd apps/api-gateway
golangci-lint run ./...
# Exit 0  = CLEAR — no fence violations.
# Exit != 0 = FENCE VIOLATION — fix before committing.
```

---

## Deliberate-Violation Protocol (Fence-A proof — QA executes)

**Purpose:** prove the fence is not a false-green (a config that checks nothing).

**Steps:**

1. **Introduce violation** — temporarily add a forbidden import to any primitive file.
   Example: open `pkg/primitive/overall-status-computer/compute.go` and add:
   ```go
   import _ "github.com/vn-market-intelligence/api-gateway/pkg/module/gateway"
   ```
   (Do NOT save this to git — work in working tree only.)

2. **Run lint** — must exit NON-ZERO with depguard rule named in output:
   ```bash
   cd apps/api-gateway && golangci-lint run ./...
   # Expected: exit 1, depguard "Fence-A: primitive must not import module layer"
   ```

3. **Revert violation** — restore the original file (`git checkout apps/api-gateway/pkg/primitive/overall-status-computer/compute.go`).

4. **Run lint again** — must exit 0:
   ```bash
   cd apps/api-gateway && golangci-lint run ./...
   # Expected: exit 0, no output
   ```

5. **Record both outputs** in the task handoff / signal file as BITES proof.

**NEVER commit the violation.** The proof is done in the local working tree only.

---

## CI Job

Job name: `API Gateway Go Lint` in `.github/workflows/ci.yml`
Triggers: push to main, PR targeting main
Working directory: `apps/api-gateway`
Config flag: `--config .golangci.yml`

CI fails (non-zero exit) on any fence violation, blocking merge.

---

## References

- Pilot charter: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4
- api-gateway charter: `docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-charter.md`
- Brownfield audit: `docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-brownfield.md`
- Canonical template: `apps/macro-indicators/.golangci.yml`
