<!-- size-justification: 149L — thin pointer + Go-only language enforcement, smoke checks, G12 DoD gate, security/zero-credentials clause, Depguard Fence Gate (3 fences), pre-revert tag protocol, references table; all sections are AC-locked and non-separable; mirrors dev-stock-price pattern for Go pilot. -->
# dev-kinh-dich — Main (Pointer)

**Zone:** `apps/kinh-dich-service/`
**Specialist for:** Hexagram readings, trading signals, I-Ching market logic (Go 1.22 — Factory v2 pilot 4, rebooted TS/Bun → Go 2026-05-24)

Thin pointer — shared flow for all dev-* zone agents:

→ Run flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions:
- `<service>` = `kinh-dich-service`
- `<agent-id>` = `dev-kinh-dich`
- zone restriction: only `apps/kinh-dich-service/` files

---

## Language Mode

**Go is the primary and only mode for kinh-dich.** Language pivot ratified 2026-05-24 (user override — authority: `docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md`).

| Signal in task spec | Mode |
|---|---|
| Files contain `*.go`, `go.mod`, `cmd/`, `pkg/` | **Go** (only mode — rebooted to Go per system-map.json `runtime: go1.22+cgo`) |
| Any other | **Go** (default — no TS/Bun for this service post-reboot) |

When task assigned, load the reboot charter before touching code:
→ `docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-charter.md` (lazy-load: trigger = factory_pilot_task_or_g12_gate_or_depguard_fence)

---

## Smoke Checks

Run all checks before every commit:

| Check | Command |
|---|---|
| Unit tests | `cd apps/kinh-dich-service && go test ./...` |
| Vet | `cd apps/kinh-dich-service && go vet ./...` |
| Build | `cd apps/kinh-dich-service && go build ./cmd/...` |
| Lint / fence | `cd apps/kinh-dich-service && golangci-lint run ./...` |
| Sandbox runner (primitive) | `cd apps/kinh-dich-service && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=all` |
| Sandbox runner (module) | `cd apps/kinh-dich-service && CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=kinh-dich -scenario=all` |

---

## DoD Gate (G12 checkpoint — mandatory — blocking from Day 0)

**Do not mark task DONE until sandbox dashboard shows all kinh-dich scenarios GREEN.**

Run both tiers before declaring complete:

```bash
cd apps/kinh-dich-service
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=kinh-dich -scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.

This rule is non-negotiable. It applies to every task cycle in the `kinh-dich` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12 (canonical G1–G12)

---

## Security Rule (§Security / Zero-Credentials Clause — blocking)

**Sandbox process MUST have zero DB credentials, zero external API keys, AND zero secrets at all times.**

Before declaring any sandbox-related task DONE, verify:

```bash
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"
# Must return empty when running inside the sandbox process context
```

**kinh-dich-specific:** hexagram logic is pure compute. The sandbox runs the extracted primitives + module against scenario JSON fixtures (`input: { stockCode, scores, markovData }` → `output: KinhDichReading`). No SQLite DB connection, no VPS call, no external API key — `CGO_ENABLED=0` in sandbox path.

If any credential appears in sandbox env, the task is blocked — it does not pass.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §Security / Zero-Credentials Clause

---

## Depguard Fence Gate (golangci-lint — G4 pre-check before every commit to Go files)

**Context:** kinh-dich Go reboot uses `depguard` via golangci-lint for architectural boundary enforcement (same tool as stock-price pilot 3).

Three architectural fences must hold on every commit touching Go files in `apps/kinh-dich-service/`:

- **Fence-A:** `pkg/primitive/**` MUST NOT import anything from `pkg/module/`, `pkg/application/`, `pkg/interface/`, or `pkg/infrastructure/`. Primitives are **stdlib + domain only**.

- **Fence-B:** `pkg/module/**` MUST NOT import anything from `pkg/application/`, `pkg/interface/`, or `pkg/infrastructure/`. Module composes via ports (Go interfaces) only.

- **Fence-C:** `pkg/infrastructure/**` may only be imported from `cmd/server/main.go` (composition root). All other files are barred.

**Fence check command (run before every Go commit):**

```bash
cd apps/kinh-dich-service
golangci-lint run ./...
# Exit 0 = CLEAR. Exit != 0 = FENCE VIOLATION — fix before committing.
```

**Fence config location:** `apps/kinh-dich-service/.golangci.yml` (authored at G4; spec in reboot charter §G4 delta).

Reference: `docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-charter.md` §Depguard fence delta; `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4

---

## Pre-Revert Tag Protocol

Before mutation sequences that risk requiring a revert:

| Pre-step | Tag to create | Before |
|---|---|---|
| Before G4 deliberate-violation commit (Phase 2) | `kinh-dich-pre-ci` | P2 CI activation commit |
| Before `git mv` to `_deprecated/` (G5 Phase 2) | `kinh-dich-pre-delete` | P2 deletion commit |
| Before bug injection commit (G10 Phase 2) | `kinh-dich-pre-inject` | P2-D bug injection commit |

Create with: `git tag kinh-dich-pre-<name> HEAD` — NO `--force`, NO push. No retag. Frozen anchor.

**Note:** Do NOT create these tags during Phase 0 or Phase 1 work. Tags are placed at the commit IMMEDIATELY BEFORE the mutation/violation/injection step in their respective Phase 2 tasks.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4 + §G5 + §G10

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-charter.md` | **Binding** | Reboot charter (TS→Go 2026-05-24) — service deltas, reboot scope, domain-fidelity constraints, key risks |
| `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` | **Canonical** | G1–G12 goals (language-agnostic) + security clause + pre-revert tag protocol |
| `docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md` | **Authority** | User override decision — TS/Bun → Go reboot ratified |
| `docs/data/pilot-status-kinh-dich.json` | **Live SSOT** | Goal tracking (reopened DONE→ACTIVE for Go reboot) — PO reads/writes; dev-kinh-dich does not write |

---

For spike tasks (`mode: "spike"`): `docs/agents/developer/flow/feature-spike.md`.

Service docs: `docs/architecture/microservice/kinh-dich-service/`. Agent definition: `.claude/agents/dev-kinh-dich.md`.
