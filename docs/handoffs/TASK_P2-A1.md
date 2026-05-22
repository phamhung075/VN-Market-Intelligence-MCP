---
task_id: P2-A1
title: "Author `.golangci.yml` with Fence-A/B/C depguard rules"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G4"]
files_touched:
  - "apps/technical-analysis/.golangci.yml (NEW)"
status: "PENDING"
blocked_by: []
unblocks: ["P2-A2"]
estimate_hours: 0.5
ac_count: 7
---

# P2-A1 — Author `.golangci.yml` with Fence-A/B/C depguard rules

**Goal:** G4 (Architecture fence enforced in CI)

**Description:**
Create the golangci-lint configuration file with three depguard fence rules (Fence-A, Fence-B, Fence-C) per the phase-2-task-plan-go.md §Fence Linter Decision. This establishes the architecture guardrails before CI integration in P2-A2.

---

## Files Touched

- `apps/technical-analysis/.golangci.yml` (NEW)

---

## Acceptance Criteria

1. **AC-1**: File created at `apps/technical-analysis/.golangci.yml`
2. **AC-2**: `run.go: "1.22"` matches the service's `go.mod` go directive
3. **AC-3**: Fence-A rule denies `pkg/module`, `pkg/application`, `pkg/interface` imports from any file under `pkg/primitive/`
4. **AC-4**: Fence-B rule denies `pkg/application` and `pkg/interface` imports from any file under `pkg/module/`
5. **AC-5**: Fence-C rule denies `pkg/infrastructure` imports from all files except `cmd/server/main.go`
6. **AC-6**: `cd apps/technical-analysis && golangci-lint run --config .golangci.yml` exits 0 on the current clean codebase (no violations)
7. **AC-7**: Config file is valid YAML: `python3 -c "import yaml; yaml.safe_load(open('.golangci.yml'))"` exits 0

---

## Smoke Check

```bash
cd apps/technical-analysis && golangci-lint run --config .golangci.yml
```

Must exit 0 on clean codebase.

---

## Atomic Commit Format

```
chore(arch/technical-analysis): P2-A1 — golangci-lint depguard Fence-A/B/C config

Implements G4 per pilot-charter.md. Three fence rules:
  Fence-A: pkg/primitive/* must not import pkg/{module,application,interface}
  Fence-B: pkg/module/* must not import pkg/{application,interface}
  Fence-C: pkg/infrastructure only importable from cmd/server/main.go

Linter choice: golangci-lint + depguard (rationale in phase-2-task-plan-go.md §Fence Linter Decision).

Sprint: <sprint>
Task: P2-A1
AC: .golangci.yml created / Fence-A/B/C rules present / golangci-lint exits 0 on clean codebase / YAML valid
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G4   | TBD (gate on P2-A2 CI integration) |

---

## Dependencies

**Upstream:** None (can start immediately)
**Downstream:** P2-A2 (CI job integration)

---

## Notes

- Fence-C test file exemption: developer may need to add `"!**/*_test.go"` exclusion in Fence-C files list if test files legitimately import pkg/infrastructure. Evaluate at config time.
- Reference: `docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md` §Fence Linter Decision (lines 25-84)
