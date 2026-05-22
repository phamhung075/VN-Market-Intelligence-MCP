---
task_id: P2-A2
title: "Add `go-lint` CI job to `.github/workflows/ci.yml`"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G4"]
files_touched:
  - ".github/workflows/ci.yml (MODIFY — add parallel go-lint job)"
status: "PENDING"
blocked_by: ["P2-A1"]
unblocks: ["P2-A3"]
estimate_hours: 0.333
ac_count: 6
---

# P2-A2 — Add `go-lint` CI job to `.github/workflows/ci.yml`

**Goal:** G4 (Architecture fence enforced in CI)

**Description:**
Add a parallel GitHub Actions job to run golangci-lint against the technical-analysis service. This job validates the depguard fence rules on every push/PR, enforcing architectural boundaries in continuous integration.

---

## Files Touched

- `.github/workflows/ci.yml` (MODIFY — add parallel `go-lint` job)

---

## Acceptance Criteria

1. **AC-1**: A new job named `go-lint` added to `.github/workflows/ci.yml`
2. **AC-2**: Job uses `ubuntu-latest`, `timeout-minutes: 10`
3. **AC-3**: Job installs golangci-lint via the official GitHub Action (`golangci/golangci-lint-action@v6`), pinned to a specific version
4. **AC-4**: Job runs `cd apps/technical-analysis && golangci-lint run --config .golangci.yml`
5. **AC-5**: Job runs in parallel with (not dependent on) the existing `bun test` job — no `needs:` clause pointing to `test`
6. **AC-6**: The job is named `go-lint` in the workflow so GitHub Actions displays it as a required check

---

## Smoke Check

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
```

Plus push to `main` and observe CI results.

---

## Atomic Commit Format

```
chore(arch/ci): P2-A2 — add go-lint CI job for technical-analysis fence enforcement

Adds parallel golangci-lint job to CI. Runs Fence-A/B/C depguard rules on every push/PR.
Gate: CI fails if any import violates fence rules.

Sprint: <sprint>
Task: P2-A2
AC: go-lint job added / parallel (no needs dependency on bun test) / golangci-lint-action pinned / YAML valid
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G4   | IN-PROGRESS (gate on P2-A3 green verification) |

---

## Dependencies

**Upstream:** P2-A1 (`.golangci.yml` config must exist)
**Downstream:** P2-A3 (CI green verification)

---

## Notes

- The job should run **in parallel** with `bun test`, not sequentially. Use no `needs:` clause.
- Pinning the golangci-lint-action version ensures reproducible CI behavior.
- Action location: https://github.com/golangci/golangci-lint-action
