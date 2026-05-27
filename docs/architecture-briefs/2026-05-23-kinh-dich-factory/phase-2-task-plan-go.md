---
title: "Phase 2 Task Plan (Go) — kinh-dich-service Pilot (fleet pilot 4)"
date: "2026-05-24"
author: "architect (Phase 2 dispatch)"
pilot: "kinh-dich-service"
fleet_pilot_number: 4
phase: "2"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-go.md"
ssot_ref: "docs/data/pilot-status-kinh-dich.json"
language: "Go (mcp-server zone stays TypeScript — handler-only G5b audit)"
phase1_gate: "CONDITIONAL-GO (PO ratified 2026-05-24T08:18:35Z — 7/12 goals Phase-1 evidence, conditional = scope boundary only, NOT a quality defect)"
service_port_internal: 5005
service_port_external: 5005
service_zone: "apps/kinh-dich-service"
service_specialist: "dev-kinh-dich"
inbound_signal: "docs/signals/po-20260524T081835Z.json"
---

# Phase 2 Task Plan (Go) — `kinh-dich-service` Pilot (fleet pilot 4)

**Generated:** 2026-05-24 by architect (Phase 2 dispatch)
**Phase 1 Gate:** CONDITIONAL-GO (PO, 2026-05-24T08:18:35Z — sandbox 17/17 GREEN, 7 goals Phase-1 evidence, G8 honest-RED QA re-verified)
**Phase 2 Goal scope:** G4, G5, G9, G10, G11 (G1, G2, G3, G6, G7, G8, G12 = EARNED-PENDING from Phase 1)
**WIP:** 1 sequential (charter wip_limit — no parallel dispatch within Phase 2)

> **IMPORTANT — no goal flips in Phase 2:** Task completion does NOT flip any G-goal state.
> All goal flips (including EARNED-PENDING → YES) are PO-only, in one atomic Phase-3 commit,
> after ALL 12 goals reach terminal state simultaneously. Every task in this plan says so explicitly.
> §4.5 matrix-authorship rule is binding and inviolable.

---

## Service Facts (verified via jq on docs/data/system-map.json — never hardcode)

```
id: kinh-dich-service | language: go | runtime: go1.22+ (CGO_ENABLED=0)
port: 5005 (internal == external) | zone: apps/kinh-dich-service
specialist: dev-kinh-dich
primitives: hao_encoder, hexagram_resolver, ngu_hanh_classifier, reading_scorer, nuclear_hexagram
module: reading_composer (MarkovPort boundary)
mcp_tools: get_kinhdich_reading, get_market_hexagram, get_hexagram_history,
           get_transition_probabilities, run_hexagram_backtest, explain_hexagram (6 tools)
```

---

## Phase 1 State (verified — do not redo)

| Artefact | State |
|---|---|
| `apps/kinh-dich-service/go.mod` + `go.sum` | COMMITTED on main |
| `apps/kinh-dich-service/pkg/primitive/` (5 packages) | hao_encoder, hexagram_resolver, ngu_hanh_classifier, reading_scorer, nuclear_hexagram — all with table-driven tests |
| `apps/kinh-dich-service/pkg/module/reading_composer/` | MarkovPort Go interface + ComposeReading |
| `apps/kinh-dich-service/cmd/server/main.go` | 46 lines — pure DI wiring |
| `apps/kinh-dich-service/cmd/sandbox/main.go` | Go sandbox runner |
| `apps/kinh-dich-service/api/openapi.yaml` | 7 endpoints — HTTP contract |
| `apps/kinh-dich-service/dashboard/index.html` | 3-panel trust dashboard |
| Go test suite | 39 PASS / 0 FAIL (`go test ./...`) |
| Go sandbox | 17/17 GREEN (15 primitive + 2 module) |
| TS source | STILL PRESENT in `apps/kinh-dich-service/src/` — G5 removes it in Phase 2 |
| TS pre-revert tags | `kinh-dich-pre-ci`, `kinh-dich-pre-delete`, `kinh-dich-pre-inject` exist but point to TS-pilot commits — **Go Phase 2 uses `-go` suffix tags (see §Pre-Revert Tags)** |

---

## Phase 2 Summary

Phase 2 closes the 5 still-unmet goals (G4, G5, G9, G10, G11) plus the dashboard stale-comment
cleanup. The 7 EARNED-PENDING goals (G1, G2, G3, G6, G7, G8, G12) require no new code tasks —
they carry forward with their Phase-1 Go evidence and are re-confirmed at the Phase-2 close-gate (P2-Z).

**Total tasks:** 13 atomic tasks (P2-A through P2-Z)
**Total AC count:** 61
**Critical path (sequenced by pre-revert tag discipline):**

```
P2-A (kinh-dich-pre-ci-go tag)
  ↓
P2-B (.golangci.yml Fence-A/B/C + CI wiring + sister-primitive allowlist)
  ↓
P2-C (G4 deliberate-violation proof — AC-4b — reverted, NEVER committed)
  ↓
P2-D (G4 freeze anchor AC-4c confirmed)
  ↓
P2-E (kinh-dich-pre-delete-go tag)
  ↓
P2-F (G5a — git mv superseded TS domain/service code to src/_deprecated/)
  ↓
P2-G (G5b/G5c — MCP handler HTTP-port audit + zero TODO.*migrat)
  ↓
P2-H (dashboard stale-comment cleanup — remove language=ts, runtime=bun)
  ↓
P2-I (G9 PO Playwright Path B — re-confirm on rebuilt Go dashboard)
  ↓
P2-J (kinh-dich-pre-inject-go tag + G10 bug injection)
  ↓
P2-K (G10 AI-fixability blind-fix ≤2 cycles + G11 2-trial coupling proof)
  ↓
P2-Z (Phase-2 close-gate — QA)
```

**WIP=1 enforced throughout.** PM dispatches ONE task at a time. Next task dispatched only after
current task DONE signal is received and recorded.

---

## Pre-Revert Tags (Phase 2 — binding creation sequence)

> **CRITICAL — naming convention:** The TS pilot already used and committed `kinh-dich-pre-ci`,
> `kinh-dich-pre-delete`, and `kinh-dich-pre-inject` (pointing to TS-era commits from
> the TS Phase-2, now in `tsCompletionArchive`). These tags CANNOT be reused or force-moved
> (charter §Constraints: no `--force` on tags, no destructive git operations). Go Phase 2
> uses a **`-go` suffix** to create unambiguous Go-era anchors: `kinh-dich-pre-ci-go`,
> `kinh-dich-pre-delete-go`, `kinh-dich-pre-inject-go`.

Tags are created IN THE TASK THAT GATES THEM, BEFORE any mutation. No retag, no `--force`, no push.

| Tag | Created in | Step within task | Protects |
|-----|-----------|------------------|---------|
| `kinh-dich-pre-ci-go` | **P2-A** | Step 0 (first action of P2-A) | Rollback point before G4 `.golangci.yml` work |
| `kinh-dich-pre-delete-go` | **P2-E** | Step 0 (first action of P2-E) | Rollback point before G5a `git mv` to `src/_deprecated/` |
| `kinh-dich-pre-inject-go` | **P2-J** | Step 0 (first action of P2-J) | Rollback point before G10 bug-injection commit |

---

## Hard Constraints (every task inherits all)

| Constraint | Rule |
|---|---|
| **G12 DoD gate** | `cd apps/kinh-dich-service && go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all` exits 0 BEFORE DONE on every task that produces sandbox-runnable artefacts |
| **Fence-A** | `pkg/primitive/*/` imports stdlib only; sister-primitive imports (`pkg/primitive/*` → `pkg/primitive/*`) ARE allowed (OQ-6: `nuclear_hexagram` → `hexagram_resolver` + `hao_encoder`) |
| **Fence-B** | `pkg/module/*/` imports primitives + stdlib only — no application, infrastructure, interface, no direct SQLite |
| **Fence-C** | `modernc.org/sqlite` importable ONLY from `cmd/server/main.go` (composition root). Exclusions: `!**/cmd/server/main.go`, `!**/*_test.go` |
| **CGO_ENABLED=0** | All Go builds must use `CGO_ENABLED=0`. No `mattn/go-sqlite3` anywhere in `apps/kinh-dich-service/`. |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source/CI files |
| **SSOT freeze** | Do NOT modify `docs/data/pilot-status-kinh-dich.json` — PM-owned. Do NOT flip any G-goal field |
| **Charter §4.5** | `decisionMatrix.{speed,trust,scale}` stays `TBD`. PO-only authorship at 12/12 terminal in Phase 3 |
| **SI-2 boundary** | Do NOT touch `docs/dashboards/index.html` — stock-price owns that file. kinh-dich G6 = `apps/kinh-dich-service/dashboard/index.html` only |
| **Anti-scope** | ONLY `apps/kinh-dich-service/` + the kinh-dich MCP handlers in `apps/mcp-server/src/interface/mcp/tools/kinhdich/` (G5b audit only, no code changes expected). NOTHING ELSE |
| **TS tag disambiguation** | NEVER `--force` the existing TS-era tags. Use `-go` suffix tags throughout Go Phase 2 |
| **Out-of-zone ban** | Do NOT modify `apps/stock-price/`, `apps/technical-analysis/`, `apps/macro-indicators/`, or any closed/dormant microservice zone |

---

## Task Ledger

| ID | Title | Owner | G-goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-----------------|--------|------------|-----|----------|
| **P2-A** | Create `kinh-dich-pre-ci-go` tag (pre-revert anchor before G4 work) | dev-kinh-dich | G4 (setup) | P2-B | — | 5m | 3 |
| **P2-B** | `.golangci.yml` Fence-A/B/C + sister-primitive allowlist + CI job wiring | dev-kinh-dich | G4 partial | P2-C | P2-A | 1h | 5 |
| **P2-C** | G4 deliberate-violation proof (AC-4b) — Fence-A violation, non-zero exit, reverted | dev-kinh-dich + qa | G4 full | P2-D | P2-B | 30m | 5 |
| **P2-D** | G4 freeze anchor confirmation (AC-4c) | qa | G4 finalized | P2-E | P2-C | 10m | 3 |
| **P2-E** | Create `kinh-dich-pre-delete-go` tag (pre-revert anchor before G5a work) | dev-kinh-dich | G5 (setup) | P2-F | P2-D | 5m | 3 |
| **P2-F** | G5a — `git mv` superseded TS domain/service code to `src/_deprecated/` | dev-kinh-dich | G5a | P2-G | P2-E | 1h | 6 |
| **P2-G** | G5b/G5c — MCP handler HTTP-port audit + zero `TODO.*migrat` verification | qa | G5b, G5c | P2-H | P2-F | 30m | 5 |
| **P2-H** | Dashboard stale-comment cleanup — remove `language=ts, runtime=bun` at ~L13 and ~L1578 | dev-kinh-dich | G6 (honest-green) | P2-I | P2-G | 15m | 4 |
| **P2-I** | G9 PO Playwright Path B — re-confirm on rebuilt Go dashboard (sandbox-populated state) | po | G9 | P2-J | P2-H | 30m | 4 |
| **P2-J** | Create `kinh-dich-pre-inject-go` tag + G10 bug injection | qa | G10 setup | P2-K | P2-I | 20m | 4 |
| **P2-K** | G10 AI-fixability proof (≤2 cycles) + G11 2-trial coupling proof | dev-kinh-dich + qa | G10, G11 | P2-Z | P2-J | 1.5h | 5 |
| **P2-Z** | Phase 2 close-gate verification (QA) — all Phase-2 goals chain confirmed | qa | (no flip) | Phase 3 | P2-K | 30m | 14 |

**Total atomic tasks:** 12 (P2-A through P2-Z)
**Total AC count:** 61
**Total estimated effort:** ~5.5 hours (dev-kinh-dich + qa + po combined, WIP=1 sequential)
**G12:** EARNED-PENDING (carry-forward — no new task; QA re-confirms streak at P2-Z)

---

## Per-Task Acceptance Criteria

---

### P2-A — Create `kinh-dich-pre-ci-go` Tag

**Owner:** dev-kinh-dich
**Blocked by:** — (first Phase 2 task)
**Files touched:** none (tag only)

**Background:** L5 lesson baked Day 0. The pre-revert tag MUST exist BEFORE any `.golangci.yml` or
CI work lands. The TS-era `kinh-dich-pre-ci` tag already exists and points to a TS-pilot commit
(2d245200) — it CANNOT be moved or force-retagged. This task creates the Go-era equivalent:
`kinh-dich-pre-ci-go`, which tags the current HEAD (the Phase-1 Go close-gate commit or later).

**Step 0 (only action):**
```bash
git tag kinh-dich-pre-ci-go HEAD
```
Confirm with:
```bash
git log --oneline kinh-dich-pre-ci-go
```
Must return the current HEAD commit SHA + subject.

**Disambiguation verification (mandatory):**
```bash
git tag | grep "kinh-dich-pre-ci"
```
Must show BOTH `kinh-dich-pre-ci` (TS-era, untouched) AND `kinh-dich-pre-ci-go` (Go-era, just created).

**AC-1:** `git log --oneline kinh-dich-pre-ci-go` returns one line referencing a Go Phase-1 or later
commit (ancestor of HEAD at Phase-2 kickoff). No `--force`, no push.

**AC-2:** `git tag | grep "kinh-dich-pre-ci-go"` returns `kinh-dich-pre-ci-go`.
`git tag | grep "kinh-dich-pre-ci$"` still returns the TS-era tag unchanged (not overwritten).

**AC-3:** The TS-era `kinh-dich-pre-ci` tag is INTACT:
```bash
git log --oneline kinh-dich-pre-ci | head -1
```
Must return `2d245200` as the beginning of the commit SHA (TS-era anchor untouched).

**Signal file:** `docs/signals/dev-kd-P2-A-done-<UTC>.json` (fields: task=P2-A,
tag=kinh-dich-pre-ci-go, tagged_sha=<sha>, ts_era_tag_intact=true, next=pm).

**G-goal posture:** NO goal flips. Tag is infrastructure only. §4.5 SSOT untouched.

---

### P2-B — `.golangci.yml` Fence-A/B/C + Sister-Primitive Allowlist + CI Job Wiring

**Owner:** dev-kinh-dich
**Blocked by:** P2-A DONE (tag exists)
**Files touched:**
- `apps/kinh-dich-service/.golangci.yml` (CREATE)
- `.github/workflows/ci.yml` (MODIFY — add `kinh-dich-go-lint` job)

**Background:** kinh-dich uses `depguard` via `golangci-lint` (Go fleet standard — NOT
`eslint-plugin-boundaries`, which was the TS pilot path). Three depguard fences mirror the
TA + macro + stock-price `.golangci.yml` pattern, adapted for kinh-dich paths.

**Critical kinh-dich difference — Fence-A sister-primitive allowlist:**
`pkg/primitive/nuclear_hexagram` imports `pkg/primitive/hexagram_resolver` AND
`pkg/primitive/hao_encoder`. This is a legitimate cross-primitive import (OQ-6, documented in
Phase-1 P1-B5g source comment). The depguard Fence-A rule must explicitly ALLOW
`pkg/primitive/*` → `pkg/primitive/*` imports; if the rule is written without this allowlist,
`nuclear_hexagram` will produce a false-positive Fence-A violation. The allowlist is NOT a
fence weakening — application/module/infra/interface imports from primitive remain forbidden.

**AC-1:** `apps/kinh-dich-service/.golangci.yml` exists and contains a `depguard` linter config
with THREE named rules:

- **fence-a**: `pkg/primitive/` — deny imports of `pkg/module`, `pkg/application`,
  `pkg/interface`, `pkg/infrastructure`, and `modernc.org/sqlite`. Allow: stdlib +
  `pkg/primitive/*` (sister-primitive allowlist — OQ-6).
- **fence-b**: `pkg/module/` — deny imports of `pkg/application`, `pkg/interface`,
  `pkg/infrastructure`, and `modernc.org/sqlite`. Allow: stdlib + `pkg/primitive/*`.
- **fence-c**: `modernc.org/sqlite` (and `pkg/infrastructure`) importable only from
  `cmd/server/` (deny from primitive, module, and interface zones).

Config includes `run.timeout: 120s`. File is ≤90 lines (extra lines for sister-primitive
allowlist comments compared to stock-price template). File header comment must document the
Fence-A sister-primitive exception and cite OQ-6 from the phase-1-task-plan-go.md.

**AC-2:** `cd apps/kinh-dich-service && golangci-lint run` exits 0 on the current Go codebase
(no false-positive Fence-A violations from `nuclear_hexagram` sister-primitive imports).
This is the critical pass that proves the allowlist is correct.

**AC-3:** `.github/workflows/ci.yml` includes a job named `kinh-dich-go-lint` with
`working-directory: apps/kinh-dich-service` that runs `golangci-lint run`. Evidence:
```bash
grep -n "kinh-dich-go-lint\|kinh-dich" .github/workflows/ci.yml
```
Returns ≥1 match containing the job name.

**AC-4:** `git log --oneline apps/kinh-dich-service/.golangci.yml` shows ONLY P2-B as the most
recent commit on that file (establishes the freeze anchor for AC-4c in P2-D).

**AC-5 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service
go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all
```
Exits 0 (all 17 scenarios GREEN). Paste output summary to handoff.

**Commit subject pattern:**
```
feat(kinh-dich): P2-B — .golangci.yml Fence-A/B/C + sister-primitive allowlist + CI go-lint job (G4 partial)
```

**G-goal posture:** NO goal flips. G4 advances but does NOT flip to YES here. §4.5 SSOT untouched.

---

### P2-C — G4 Deliberate-Violation Proof (AC-4b) — Reverted, NEVER Committed

**Owner:** dev-kinh-dich + qa (QA reproduces independently)
**Blocked by:** P2-B DONE (golangci.yml exists, passes clean run including sister-primitive allowlist)
**Files touched:** NONE committed — violation is local-only, reverted before any commit

**Background:** AC-4b requires proof that the fence CATCHES a real violation. The violation is a
controlled local experiment on a file where the violation is unambiguous (i.e. NOT a sister-primitive
import which is allowlisted). Choose any primitive OTHER than `nuclear_hexagram` to avoid
allowlist confusion. `hao_encoder` or `hexagram_resolver` are the cleanest targets. The violation
MUST be reverted before any commit. `git status` must be clean after revert.

The fence-false-green lesson is binding: "lint exit 0" does not prove enforcement — only a
deliberate non-zero exit on a real violation, with the fence name in the output, proves it.

**Violation procedure (dev-kinh-dich executes, qa reproduces on a different primitive file):**

Step 1 — Add ONE temporary Fence-A violation:
Open `apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go`.
Add one import line that imports `pkg/module/reading_composer` or `pkg/infrastructure`.
Do NOT stage or commit — keep the edit local only.

Example injection:
```go
import (
    // DELIBERATE FENCE-A VIOLATION — DO NOT COMMIT
    _ "github.com/vn-market-intelligence/kinh-dich-service/pkg/module/reading_composer"
)
```

Step 2 — Run the linter:
```bash
cd apps/kinh-dich-service && golangci-lint run
```
Must exit non-zero. The output must contain the fence name (`fence-a` or `Fence-A`) and
name the violating file (`hao_encoder.go`).

Step 3 — Revert the violation immediately:
```bash
git checkout apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go
```

Step 4 — Confirm clean linter run:
```bash
cd apps/kinh-dich-service && golangci-lint run
```
Must exit 0.

Step 5 — Confirm `git status` clean:
```bash
git status --short | grep "pkg/primitive"
```
Must return empty. Violation was NEVER staged.

**AC-1:** Linter exits non-zero on the violation run. Output contains fence name. Evidence (full
linter output) pasted into handoff `§Evidence — AC-4b Violation Run`.

**AC-2:** Linter exits 0 after revert. Evidence pasted into `§Evidence — AC-4b Clean Run`.

**AC-3:** `git status --short | grep "pkg/primitive"` returns empty after revert. Violation was
NEVER staged, NEVER committed.

**AC-4:** QA independently reproduces the violation proof using the same procedure on a different
primitive file (e.g. `hexagram_resolver/hexagram_resolver.go` — safe to target since it has no
sister-primitive imports). QA pastes their own evidence in `§Evidence — AC-4b QA Reproduction`.

**AC-5 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service
go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all
```
Exits 0 (sandbox still 17/17 GREEN — no code changed).

**Commit:** No violation committed. Dev-kinh-dich commits the handoff evidence update only.
QA commits their reproduction evidence similarly.

**G-goal posture:** NO goal flips. AC-4b is the deliberate-violation arm of G4; G4 is not yet
terminal. §4.5 SSOT untouched.

---

### P2-D — G4 Freeze Anchor Confirmation (AC-4c)

**Owner:** qa
**Blocked by:** P2-C DONE (violation reverted, handoff evidence complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** AC-4c is a git-log check confirming the `.golangci.yml` freeze anchor. The freeze
anchor is the P2-B commit — the MOST RECENT commit on `.golangci.yml`. No subsequent commit should
have touched that file.

**AC-1 — Freeze anchor verification:**
```bash
git log --oneline apps/kinh-dich-service/.golangci.yml
```
The MOST RECENT commit on that file must be the P2-B commit. Record the commit SHA as
`golangci_freeze_sha` in the G4 evidence.

**AC-2 — `kinh-dich-pre-ci-go` tag ancestry:**
```bash
git log --oneline kinh-dich-pre-ci-go
```
Must return a commit that is an ancestor of HEAD (i.e., the tag is not newer than current HEAD).
Confirm: `git merge-base kinh-dich-pre-ci-go HEAD` returns a non-empty SHA.

**AC-3 — G4 evidence compilation:**
QA writes a G4 evidence summary to `docs/handoffs/TASK_P2-D-kd-g4-evidence.md` containing:
- `ac_4a_ci_job_wired: YES` (from P2-B AC-3 evidence)
- `ac_4b_violation_proof: YES` (linter caught Fence-A, violation reverted, NEVER committed)
- `ac_4b_sister_primitive_false_positive_check: PASS` (AC-2 P2-B proves `nuclear_hexagram` allowlist works)
- `ac_4c_freeze_sha: <sha>` (the P2-B commit SHA)
- `kinh_dich_pre_ci_go_tag_sha: <sha>` (the P2-A Go-era tag SHA)
- `ts_era_tag_intact: YES` (kinh-dich-pre-ci still points to 2d245200)
- `g4_ready_to_grade: YES`

QA emits `docs/signals/qa-kd-P2-D-g4-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G4 evidence is complete but PO flips G4 only at 12/12 terminal
Phase-3 close. §4.5 SSOT untouched.

---

### P2-E — Create `kinh-dich-pre-delete-go` Tag

**Owner:** dev-kinh-dich
**Blocked by:** P2-D DONE (G4 evidence confirmed — fence proven before deletion)
**Files touched:** none (tag only)

**Background:** L5 discipline. The `kinh-dich-pre-delete-go` tag must exist BEFORE any `git mv`
of superseded TS domain logic. The TS-era `kinh-dich-pre-delete` tag already exists (fdaf4be3)
and must NOT be touched. This task creates the Go-era equivalent with `-go` suffix.

**Step 0 (only action):**
```bash
git tag kinh-dich-pre-delete-go HEAD
```
Confirm:
```bash
git log --oneline kinh-dich-pre-delete-go
```
Must return the HEAD commit at P2-D close (the G4 evidence commit).

**Disambiguation verification:**
```bash
git tag | grep "kinh-dich-pre-delete"
```
Must show BOTH `kinh-dich-pre-delete` (TS-era, untouched) AND `kinh-dich-pre-delete-go` (Go-era).

**AC-1:** `git log --oneline kinh-dich-pre-delete-go` returns the commit at or after P2-D close.

**AC-2:** `git tag | grep "kinh-dich-pre-delete-go"` returns `kinh-dich-pre-delete-go`.
`git log --oneline kinh-dich-pre-delete | head -1` still begins with `fdaf4be3` (TS-era untouched).

**AC-3:** `git merge-base kinh-dich-pre-delete-go HEAD` returns a non-empty SHA (tag is proper ancestor).

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-F — G5a: `git mv` Superseded TS Domain/Service Code to `src/_deprecated/`

**Owner:** dev-kinh-dich
**Blocked by:** P2-E DONE (`kinh-dich-pre-delete-go` tag confirmed)
**Files touched:**
- `apps/kinh-dich-service/src/domain/services.ts` — MOVE via `git mv` to
  `apps/kinh-dich-service/src/_deprecated/services_v1.ts` (if not already in `_deprecated/`)
- Any additional TS domain/service files that are now fully superseded by Go primitives/module

**Background — current state of `src/_deprecated/`:**
Phase-1 Go reboot shows `apps/kinh-dich-service/src/_deprecated/` directory already exists with
`services_v1.ts` inside it (from the TS Phase-2 P2-KD-F move). The brownfield scan confirms the
TS application layer (`src/application/`) was rewired to use the `reading_composer` module via HTTP.

**Pre-condition check (mandatory — verify before any `git mv`):**
```bash
git log --oneline kinh-dich-pre-delete-go
```
Must return the P2-E commit. If tag is missing, STOP — do not proceed with this task.

```bash
ls apps/kinh-dich-service/src/_deprecated/
```
Confirm current `_deprecated/` state. If `services_v1.ts` is already there (moved in TS Phase-2),
this task confirms G5a is structurally complete from the TS pilot and focuses on verifying the
Go domain is not re-duplicating superseded domain logic. Dev documents this in the commit.

**G5a determination logic:**
1. If `src/domain/services.ts` still exists AND contains Go-superseded logic:
   - `git mv apps/kinh-dich-service/src/domain/services.ts apps/kinh-dich-service/src/_deprecated/services_v1_go_phase.ts`
   - Rewire `src/application/usecases.ts` to NOT import the moved service
   - Stage mv + rewire in ONE commit (atomic — `git show --stat` must show RENAME)
2. If `src/_deprecated/services_v1.ts` already exists (TS Phase-2 P2-KD-F completed this):
   - Confirm `src/domain/services.ts` is GONE from the tree: `git ls-tree -r HEAD apps/kinh-dich-service/src/domain/`
   - Confirm `_deprecated/services_v1.ts` contains the superseded domain logic
   - Document that G5a was completed in the TS pilot and confirm the Go service's own domain
     layer (`pkg/domain/`) has no duplicate of this logic
   - Commit a verification note; no file moves required in this case

**AC-1 — G5a state confirmed:**
One of:
- (a) `test -f apps/kinh-dich-service/src/_deprecated/services_v1.ts && echo FOUND` echoes FOUND,
  AND `git ls-tree -r HEAD apps/kinh-dich-service/src/domain/ | grep services.ts` returns empty
  (original path gone from tree).
- (b) Dev documents that G5a was already completed in TS Phase-2 (P2-KD-F commit 5641f2a1)
  and confirms the Go `pkg/domain/` has no duplicate of the superseded logic.

**AC-2 — Go domain has no duplicate of TS-superseded domain services:**
```bash
grep -rn "computeReading\|classifyNguHanh\|resolveHexagram\|encodeHaos" \
  apps/kinh-dich-service/pkg/domain/ \
  apps/kinh-dich-service/cmd/server/
```
Must return 0 matches. Business logic lives in `pkg/primitive/` and `pkg/module/`, not duplicated
in `pkg/domain/` or the composition root.

**AC-3 — Build + sandbox still clean:**
```bash
cd apps/kinh-dich-service && go build ./... && golangci-lint run
```
Both exit 0.

**AC-4 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service
go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all
```
Exits 0. Sandbox still 17/17 GREEN.

**AC-5 — `_deprecated/` path documented:**
```bash
find apps/kinh-dich-service/src/_deprecated -type f | sort
```
Output includes `services_v1.ts` (or equivalent). Document path in handoff.

**AC-6 — git mv self-verify (if move was performed this task):**
```bash
git show --stat HEAD
```
Must include at least one RENAME line (`src/domain/services.ts → src/_deprecated/...`).
If G5a was already complete from TS pilot (AC-1 path-b), this AC is N/A — document explicitly.

**Commit subject pattern (if move performed):**
```
chore(kinh-dich): P2-F — git mv superseded TS domain services → src/_deprecated/ + Go domain verified clean (G5a)
```

**Commit subject pattern (if TS pilot already complete):**
```
chore(kinh-dich): P2-F — G5a state confirmed (TS Phase-2 P2-KD-F complete) + Go domain clean (no duplicate)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-G — G5b/G5c: MCP Handler HTTP-Port Audit + Zero `TODO.*migrat`

**Owner:** qa
**Blocked by:** P2-F DONE (G5a state confirmed)
**Files touched:** none (read-only audit + signal emit)

**Background — G5b brownfield state (verified in Phase-1 brownfield scan + TS P2-KD-G):**
Per TS pilot P2-KD-G (commit 6fc7b6b3, AC-8), the 6 MCP kinh-dich tool handlers in
`apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` already route ALL 6 operations
to port 5005 via HTTP:
- `get_kinhdich_reading` → `getKinhDichReading()` from `clients.ts` (port 5005)
- `get_market_hexagram` → `getMarketHexagram()` from `clients.ts` (port 5005)
- `get_hexagram_history` → `getKinhDichHistory()` from `clients.ts` (port 5005)
- `get_transition_probabilities` → `getHexagramTransitions()` from `clients.ts` (port 5005)
- `run_hexagram_backtest` → `runKinhDichBacktest()` from `clients.ts` (port 5005)
- `explain_hexagram` → `explainHexagram()` from `clients.ts` (port 5005)

Score computation helpers (`computeHaoScores`, `computeSentimentScore`, etc.) remain in
`kinhDichTools.ts` as mcp-server integration glue — they are NOT domain imports from the
kinh-dich-service source tree; they are local mcp-server business logic. Per TS P2-KD-G AC-8,
this is the approved architecture. No rewire is needed.

The G5b task is therefore a grep-only audit confirming zero cross-service domain imports remain.

**AC-1 — Zero direct kinh-dich domain imports in mcp-server tool handlers:**
```bash
grep -rn "from.*apps/kinh-dich-service\|require.*kinh-dich-service" \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/
```
Must return 0 matches. (The score helpers import from `mcp-server` own domain — not from the
kinh-dich-service source tree — this is correct per AC-8 architecture.)

**AC-2 — HTTP client confirmed at port 5005:**
```bash
grep -n "5005\|kinhDich\|kinh.dich" \
  apps/mcp-server/src/infrastructure/microservices/clients.ts
```
Must return ≥1 match showing `5005` or `kinhDich` (confirming HTTP routing exists at port 5005).

**AC-3 — Zero `TODO.*migrat` markers (G5c):**
```bash
grep -rn "TODO.*migrat" \
  apps/kinh-dich-service/ \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/ \
  --include='*.ts' \
  --include='*.go'
```
Must return 0 matches.

**AC-4 — `_deprecated/` path free of `TODO.*migrat`:**
```bash
grep -rn "TODO.*migrat" apps/kinh-dich-service/src/_deprecated/
```
Must return 0 matches.

**AC-5 — G5 evidence compiled:**
QA writes G5 grade evidence to `docs/handoffs/TASK_P2-G-kd-g5-evidence.md`:
- `g5a_deprecated_path: apps/kinh-dich-service/src/_deprecated/services_v1.ts`
- `g5b_zero_direct_domain_imports: YES`
- `g5b_http_client_present: YES (port 5005 in clients.ts)`
- `g5b_6_tools_routed_via_http: YES (get_kinhdich_reading, get_market_hexagram, get_hexagram_history, get_transition_probabilities, run_hexagram_backtest, explain_hexagram)`
- `g5c_zero_todo_migrat: YES`
- `g5_ready_to_grade: YES`

QA emits `docs/signals/qa-kd-P2-G-g5-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G5 evidence complete. §4.5 SSOT untouched.

---

### P2-H — Dashboard Stale-Comment Cleanup

**Owner:** dev-kinh-dich
**Blocked by:** P2-G DONE (G5 chain confirmed clean — safe to finalize dashboard honesty)
**Files touched:**
- `apps/kinh-dich-service/dashboard/index.html` (MODIFY — remove two stale comments)

**Background:** Phase-1 close-gate evidence identified two stale CSS comments that reference the
TS/Bun service runtime that no longer exists. These are not user-visible but violate the
honest-green principle of the trust layer. They must be cleaned before G9 Playwright re-confirm
so the dashboard is fully honest when PO verifies it.

The two stale comments are:
- **~L13:** `/* Result: port=5005, external_port=5005, language=ts, runtime=bun */`
  (in the `<head>` CSS block, jq query result comment)
- **~L1578:** `/* Result: port=5005, external_port=5005, language="ts", runtime="bun" */`
  (in the service panel rendering CSS comment)

**Replacement text (for both lines):**
Replace each stale comment with the Go-correct equivalent:
`/* Result: port=5005, external_port=5005, language=go, runtime=go1.22+ (CGO_ENABLED=0) */`

**AC-1 — Stale TS/Bun comments removed:**
```bash
grep -c "language=ts\|runtime=bun" apps/kinh-dich-service/dashboard/index.html
```
Must return 0.

**AC-2 — Go-correct comments present:**
```bash
grep -c "language=go\|runtime=go" apps/kinh-dich-service/dashboard/index.html
```
Must return ≥2 (the two replacement comments).

**AC-3 — Dashboard still opens cleanly (file:// pre-check):**
```bash
grep -c "language=ts\|runtime=bun\|TypeScript.*functions\|Bun" \
  apps/kinh-dich-service/dashboard/index.html
```
Must return 0 for `language=ts`, `runtime=bun`, and any remaining visible TS/Bun labels that
would mislead the trust layer. (Note: the `<div class="service-card-meta">` line already reads
"Go 1.22 (CGO_ENABLED=0)" from the TS pilot's P2-KD-J update — preserve it.)

**AC-4 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service
go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all
```
Exits 0 (dashboard cleanup did not break sandbox).

**Commit subject pattern:**
```
chore(kinh-dich): P2-H — dashboard stale-comment cleanup (language=ts,runtime=bun → Go) for honest-green
```

**G-goal posture:** NO goal flips. G6 honest-green improved but no flip authorized. §4.5 SSOT untouched.

---

### P2-I — G9 PO Playwright Path B (Chromium-Headless-Shell, TCC-Staged)

**Owner:** po
**Blocked by:** P2-H DONE (dashboard stale-comments removed — trust layer honest before G9 verify)

**Background:** Charter §G9 Path B is the Day-0 default (L6 lesson baked in). The TS pilot's G9
Playwright run (P2-KD-L, commit a2a1002f) was performed against the TS dashboard and is NOT
valid for the Go-reboot dashboard. The Go dashboard in `apps/kinh-dich-service/dashboard/index.html`
was rebuilt from Go sandbox traces during Phase 1 — G9 must be re-confirmed on this new artefact.

**Pre-condition — sandbox population (REQUIRED for honest G9 verify):**
The G9 re-confirm must NOT be a cold-open test (which would only prove NOT-RUN status). The
dashboard honest-green contract requires that the sandbox was run BEFORE Playwright opens the file,
so cards show GREEN status (not NOT-RUN). Dev-kinh-dich runs the sandbox as a pre-step:

```bash
cd apps/kinh-dich-service
go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all
```

This populates the scenario traces the dashboard reads. PO opens the dashboard AFTER this run.

**AC-1:** PO runs Playwright chromium-headless-shell against
`file://apps/kinh-dich-service/dashboard/index.html`. All 3 panels (primitives, module,
microservice) are rendered in the DOM.

**AC-2:** ZERO console errors, ZERO pageerrors, ZERO requestfailed in Playwright log.

**AC-3:** All primitive cards (≥5: hao_encoder, hexagram_resolver, ngu_hanh_classifier,
reading_scorer, nuclear_hexagram) + module card (reading_composer) + microservice card rendered.
Status is honest: GREEN for sandbox-populated scenarios, NOT-RUN only for any not-yet-run
scenarios. Zero false greens (no card shows GREEN without a passing scenario backing it).
Zero stale `language=ts` or `runtime=bun` text visible in rendered DOM.

**AC-4:** PO records verdict in `docs/po-decisions/<date>-g9-kinh-dich-go-user-confirmation.md`
per charter §G9 Path B template. Fields: `pilot: kinh-dich-service`, `path: B (PO Playwright)`,
`dashboard_language: Go (rebuilt Phase-1 Go reboot)`, `ts_g9_evidence_superseded: YES`,
`verdict: PASS` (or FAIL if zero-console-errors not met). Emits
`docs/signals/po-kd-P2-I-g9-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G9 evidence complete. §4.5 SSOT untouched.

---

### P2-J — Create `kinh-dich-pre-inject-go` Tag + G10 Bug Injection

**Owner:** qa
**Blocked by:** P2-I DONE (G9 confirmed — trust layer proven before deliberately breaking things)
**Files touched:** 1 committed injection file (deliberate bug in Go primitive)

**Background:** L5 tag discipline + G10 bug injection spec from charter §G10. The pre-inject tag
MUST exist BEFORE the injection commit. QA injects a SINGLE-LITERAL bug into a Go primitive.
The TS-era `kinh-dich-pre-inject` tag (b4cdb1db) must NOT be touched — use `-go` suffix.

**Step 0 (mandatory — before any file edit):**
```bash
git tag kinh-dich-pre-inject-go HEAD
git log --oneline kinh-dich-pre-inject-go
```
Must return the P2-I evidence commit. STOP if tag fails.

**Disambiguation verification:**
```bash
git tag | grep "kinh-dich-pre-inject"
```
Must show BOTH `kinh-dich-pre-inject` (TS-era) AND `kinh-dich-pre-inject-go` (Go-era).

**Bug injection spec (calibrated for kinh-dich Go, off-by-one / wrong-literal pattern):**

**Target:** `apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go`

**Injection:** Change the `THIEU_DUONG_THRESHOLD` constant from `0.10` to `0.25`.

This is a single-literal change that:
- Compiles cleanly (`go build ./...` exits 0 — no syntax error)
- Fails at runtime: the hao-encoder-golden.json scenario expects scores at the 0.10 boundary to
  produce THIEU_DUONG but the injected constant returns THIEU_AM
- Flips the `hao_encoder` dashboard card RED after sandbox run
- Has a deterministic single-literal correct fix: restore `0.10`

This specific injection mirrors the authentic threshold contract documented in Phase-1 Key Risk 2
and P1-B1g AC-2. The fixer must rediscover the correct value from the domain without being told.

**G12 DoD gate EXCEPTION for P2-J:** After the injection commit, the sandbox MUST exit non-zero
(RED). This is the only task where a RED sandbox is the CORRECT and required outcome.
The RED state is the G10 baseline — it is NOT a P2-J failure.

**AC-1:** `kinh-dich-pre-inject-go` tag exists on the commit BEFORE the injection:
```bash
git log --oneline -2
```
Shows injection commit on top, `kinh-dich-pre-inject-go` tag on the commit below it.

**AC-2:** After injection commit, sandbox shows at least 1 FAIL:
```bash
cd apps/kinh-dich-service && go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=all
```
Exits non-zero. Paste output to handoff (evidence of FAIL state — `hao_encoder` fails).

**AC-3:** Dashboard shows RED for `hao_encoder` card after sandbox run.
QA describes dashboard state in handoff `§Evidence — G10 Injection`.

**AC-4:** Injection commit subject:
```
test(kinh-dich): P2-J — deliberate bug injection for G10 AI-fixability proof (kinh-dich-pre-inject-go tagged)
```
TS-era `kinh-dich-pre-inject` tag is INTACT (points to b4cdb1db).

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-K — G10 AI-Fixability Proof (≤2 Cycles) + G11 2-Trial Coupling Proof

**Owner:** dev-kinh-dich (fix) + qa (cycle count + Trial-2)
**Blocked by:** P2-J DONE (bug injected, dashboard RED, pre-inject-go tag confirmed)

**Background — fixer blindness requirement:**
Dev-kinh-dich MUST remain BLIND to the injected literal (`0.25`) and the target file. PM dispatches
the P2-K task with only: "The hao_encoder dashboard card is RED. Fix it. You have ≤2 cycles."
Dev-kinh-dich diagnoses from the RED dashboard and the failing sandbox output, fixes the bug,
verifies sandbox green, verifies dashboard green — all within ≤2 dispatch cycles.

**G10 fix spec:**

Dev-kinh-dich diagnoses the RED `hao_encoder` scenario failure (FAIL output from sandbox), reads
the hao-encoder golden scenario to understand the expected THIEU_DUONG boundary, and corrects
the wrong constant in `pkg/primitive/hao_encoder/hao_encoder.go`.

Cycle counting: QA counts from receipt of P2-J DONE signal to sandbox-exit-0 again.
Each dev-kinh-dich dispatch = 1 cycle. Target: ≤2 cycles (baseline 1.5 from bug-inventory).

**AC-1 (G10):**
```bash
cd apps/kinh-dich-service && go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all
```
Exits 0 (17/17 GREEN) after fix. Paste full output to handoff.

**AC-2 (G10):** Dashboard shows GREEN for `hao_encoder` card after fix and sandbox run.

**AC-3 (G10 cycle count):** QA records cycle count in `docs/handoffs/TASK_P2-K-kd-g10-g11.md`:
- Cycle count = 1 → G10 EXCEEDS baseline (1.5 system-wide, matches TS pilot P2-KD-N result)
- Cycle count = 2 → G10 MEETS baseline
- Cycle count > 2 → G10 FAILS — PM escalates to architect before Phase 3

**AC-4 (G10 byte-identical restore):**
```bash
git diff kinh-dich-pre-inject-go HEAD -- apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go
```
Must be EMPTY (diff shows no difference — the file is byte-identical to its pre-injection state,
no residue from the injection commit). This proves the single-literal restore discipline.

---

**G11 — 2-Trial Regression Alarm Coupling Proof**

**Trial-1** uses the G10 fix sequence already completed:
QA verifies: during the `hao_encoder` G10 injection, the `reading_composer` module-level scenario
(`docs/scenarios/kinh-dich/module/reading-composer-golden.json`) ALSO failed alongside
`hao_encoder-golden.json`. The module calls `EncodeHaos()` internally — a wrong threshold
in `hao_encoder` propagates to the module output. QA confirms this coupling:
- At injection state: both `hao_encoder` primitive scenario AND `reading_composer` module scenario
  show RED (or module scenario fails due to hao encoding mismatch).
- Single-edit fix (restore `0.10`) repairs ALL coupled REDs simultaneously.
- Outcome-(a): ≥1 coupled module scenario went RED; single-edit fix restored all GREEN. PASS.

If the module scenario did not go RED during G10 injection (edge case where the golden module
inputs happen to avoid the 0.10/0.25 boundary), QA notes this and proceeds to Trial-2 with
a mutation calibrated to trigger coupling.

**Trial-2** (a different primitive mutation + coupling proof):
1. QA injects a ONE-LITERAL mutation into `pkg/primitive/hexagram_resolver/hexagram_resolver.go`
   (e.g., swap two hexagram numbers in the `TRIGRAMS_TO_QUE` lookup for a common trigram pair
   such that the `hexagram-resolver-golden.json` expected output is wrong).
2. Confirm: `hexagram-resolver-golden.json` primitive scenario fails AND the
   `reading-composer-golden.json` module scenario also fails (coupling proof — the module calls
   `ResolveHexagram()` which uses the corrupted table).
3. Dev-kinh-dich reverts the mutation in 1 edit.
4. Sandbox exits 0 after fix. All coupled REDs resolved.
5. QA reverts the Trial-2 injection commit OR keeps it local-only (QA decides; either is
   acceptable as long as git is clean at P2-K completion and working tree shows no changes).

**AC-5 (G11):** QA records both trials in `docs/handoffs/TASK_P2-K-kd-g10-g11.md`:
- `trial_1_primitive: hao_encoder (THIEU_DUONG_THRESHOLD 0.10→0.25)`
- `trial_1_coupled_scenarios: reading_composer (module calls EncodeHaos)`
- `trial_1_outcome: outcome-(a)` (or document why coupling did not fire + Trial-2 used instead)
- `trial_2_primitive: hexagram_resolver (TRIGRAMS_TO_QUE swap)`
- `trial_2_coupled_scenarios: reading_composer (module calls ResolveHexagram)`
- `trial_2_outcome: outcome-(a)`
- `g11_verdict: PASS`

QA emits `docs/signals/qa-kd-P2-K-g10-g11-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G10 and G11 evidence complete. §4.5 SSOT untouched.

---

### P2-Z — Phase 2 Close-Gate Verification (QA)

**Owner:** qa
**Blocked by:** P2-K DONE (G10 + G11 chain complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** Final Phase-2 gate. QA verifies the complete goal evidence chain before emitting
the signal that authorizes PM to transition SSOT to phase2=CLOSED and notify PO for Phase 3.
NO goal flips in this task — that is a Phase-3 PO-only event.

**AC-1 — Sandbox all-green (Phase-2 state):**
```bash
cd apps/kinh-dich-service
go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=all
go run ./cmd/sandbox -tier=module -module=kinh-dich -scenario=all
go run ./cmd/sandbox -tier=all -module=kinh-dich -scenario=all
```
All three exit 0 (17/17 GREEN). QA pastes all three outputs to close-gate doc.

**AC-2 — All 5 Phase-2 goal evidence files present:**
```bash
ls docs/handoffs/TASK_P2-D-kd-g4-evidence.md \
   docs/handoffs/TASK_P2-G-kd-g5-evidence.md \
   docs/handoffs/TASK_P2-K-kd-g10-g11.md
```
All 3 files exist. G9 evidence: `docs/po-decisions/<date>-g9-kinh-dich-go-user-confirmation.md`.
Dashboard cleanup (G6 honest-green): P2-H commit on `dashboard/index.html` (grep-0 on language=ts).

**AC-3 — G12 streak carry-forward (EARNED-PENDING re-confirmed):**
QA re-verifies: the Phase-1 3-task streak (first 3 Go dev tasks — P1-KD-B1g/B2g/B3g or equivalent)
each have sandbox-green evidence in their Phase-1 handoff docs. Every Phase-2 dev task (P2-B, P2-F,
P2-H, P2-K) has sandbox-green evidence pasted to its handoff. G12 streak = EARNED-PENDING
(continuous, no task skipped the DoD gate). Records `g12_streak_carryforward: CONFIRMED` in
close-gate doc.

**AC-4 — Pre-revert Go-era tags all present and ordered correctly:**
```bash
git log --oneline kinh-dich-pre-ci-go kinh-dich-pre-delete-go kinh-dich-pre-inject-go 2>/dev/null
```
All three tags resolve to commits (no "unknown revision" error). Tag ancestry order must be:
`kinh-dich-pre-ci-go` ≤ `kinh-dich-pre-delete-go` ≤ `kinh-dich-pre-inject-go` (each tags a commit
no newer than the next in sequence).

**AC-5 — TS-era tags INTACT (not overwritten, not force-moved):**
```bash
git log --oneline kinh-dich-pre-ci | head -1
git log --oneline kinh-dich-pre-delete | head -1
git log --oneline kinh-dich-pre-inject | head -1
```
- `kinh-dich-pre-ci` begins with `2d245200` (TS-era — unchanged)
- `kinh-dich-pre-delete` begins with `fdaf4be3` (TS-era — unchanged)
- `kinh-dich-pre-inject` begins with `b4cdb1db` (TS-era — unchanged)

**AC-6 — Phase-1 approval commit ancestry intact:**
```bash
git log --oneline --ancestry-path 4a240f63..HEAD | tail -1
```
Non-empty output (Phase-1 approval commit `4a240f63` is still a proper ancestor of HEAD).

**AC-7 — Dashboard stale-comment cleanup confirmed:**
```bash
grep -c "language=ts\|runtime=bun" apps/kinh-dich-service/dashboard/index.html
```
Must return 0. No TS/Bun residue in the trust layer.

**AC-8 — SSOT not mutated:**
```bash
jq '{phase,goalsEarned,decisionMatrix}' docs/data/pilot-status-kinh-dich.json
```
`goalsEarned` must still be 0. `decisionMatrix.speed`, `.trust`, `.scale` must all be `"TBD"`.
`phase` must be `"1"` (the main phase field does not advance until PO's Phase-3 atomic close).
§4.5 untouched.

**AC-9 — No `TODO.*migrat` residue (G5c carry-forward confirmation):**
```bash
grep -rn "TODO.*migrat" \
  apps/kinh-dich-service/ \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/ \
  --include='*.ts' --include='*.go'
```
Must return 0 matches.

**AC-10 — `golangci-lint` still clean on final Go codebase:**
```bash
cd apps/kinh-dich-service && golangci-lint run
```
Exits 0. Fence-A/B/C all passing, sister-primitive allowlist working.

**AC-11 — G10 byte-identical restore confirmed:**
```bash
git diff kinh-dich-pre-inject-go HEAD -- apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go
```
Must be EMPTY.

**AC-12 — EARNED-PENDING goals carry-forward evidence present:**
QA confirms Phase-1 goal evidence exists in their close-gate doc for each EARNED-PENDING goal:
- G1 (5 primitives, 17 scenarios): P1-KD-B*g + P1-KD-D1 handoff evidence
- G2 (reading_composer MarkovPort): P1-KD-C1g handoff evidence
- G3 (composition root ≤80L): P1-KD-A3g AC evidence (cmd/server/main.go 46L)
- G6 (3-panel dashboard): P1-KD-E1 handoff evidence
- G7 (zero credentials, edit-rerun): P1-KD-E2 env audit
- G8 (honest-red): P1-KD-E2 honest-RED proof + QA Phase-1 re-verification
- G12 (streak): confirmed above (AC-3)

**AC-13 — phase2.tasks map complete (all 11 tasks DONE):**
QA lists all Phase-2 task completion signals in close-gate doc:
P2-A, P2-B, P2-C, P2-D, P2-E, P2-F, P2-G, P2-H, P2-I, P2-J, P2-K all have DONE signals
in `docs/signals/`.

**AC-14 — Phase-2 close-gate signal emitted:**
QA emits `docs/signals/qa-kd-phase2-close-gate-<UTC>.json` with fields:
```json
{
  "pilot": "kinh-dich-service",
  "phase": "2",
  "gate": "CLOSE-GATE",
  "sandbox_all_green": true,
  "sandbox_count": "17/17",
  "goals_evidence_complete": ["G4","G5","G9","G10","G11"],
  "earned_pending_carry_forward": ["G1","G2","G3","G6","G7","G8","G12"],
  "g12_streak_carryforward": "CONFIRMED",
  "pre_revert_go_tags": ["kinh-dich-pre-ci-go","kinh-dich-pre-delete-go","kinh-dich-pre-inject-go"],
  "ts_era_tags_intact": true,
  "dashboard_honest_green": true,
  "anchor_intact": true,
  "ssot_not_mutated": true,
  "goals_earned": 0,
  "decision_matrix": "TBD",
  "next_actor": "pm",
  "next_action": "transition pilot-status-kinh-dich.json phase2=CLOSED, notify PO for Phase-3 atomic close"
}
```

**G-goal posture:** NO goal flips in P2-Z. The close-gate signal authorizes PM to transition
the SSOT phase field. PO then executes the 12/12 terminal atomic close (Phase 3) at their cadence.

---

## Goal Coverage Matrix

| G-goal | Phase-1 status | Phase-2 task(s) | Phase-2 evidence location |
|--------|---------------|-----------------|--------------------------|
| G1 | EARNED-PENDING | (no task — carry-forward) | P1-KD-B*g + P1-KD-D1 + P2-Z AC-12 re-confirm |
| G2 | EARNED-PENDING | (no task — carry-forward) | P1-KD-C1g + P2-Z AC-12 re-confirm |
| G3 | EARNED-PENDING | (no task — carry-forward) | P1-KD-A3g + P2-Z AC-12 re-confirm |
| G4 | STILL-UNMET | P2-A, P2-B, P2-C, P2-D | TASK_P2-D-kd-g4-evidence.md |
| G5 | STILL-UNMET | P2-E, P2-F, P2-G | TASK_P2-G-kd-g5-evidence.md |
| G6 | EARNED-PENDING | P2-H (stale-comment cleanup for honest-green) | P2-H commit + P2-Z AC-7 grep |
| G7 | EARNED-PENDING | (no task — carry-forward) | P1-KD-E2 env audit + P2-Z AC-12 re-confirm |
| G8 | EARNED-PENDING | (no task — carry-forward) | P1-KD-E2 honest-RED + QA Phase-1 re-verification |
| G9 | STILL-UNMET | P2-I | docs/po-decisions/<date>-g9-kinh-dich-go-user-confirmation.md |
| G10 | STILL-UNMET | P2-J, P2-K | TASK_P2-K-kd-g10-g11.md |
| G11 | STILL-UNMET | P2-K | TASK_P2-K-kd-g10-g11.md |
| G12 | EARNED-PENDING | (DoD gate re-applied on each dev task) | P2-Z AC-3 streak carry-forward |

**No goal flips are authorized by any task in this table. 12/12 terminal is a Phase-3 PO-only event.**

---

## Phase 2 Exit Criteria (for QA close-gate P2-Z)

| # | Criterion | Measurement | PASS threshold |
|---|---|---|---|
| 1 | Sandbox all-green | `go run ./cmd/sandbox -tier=all -scenario=all` exit code | 0 (17/17) |
| 2 | G4 evidence complete | AC-4a + AC-4b (violation proof + revert) + AC-4c (freeze anchor) + sister-primitive allowlist clean | All 4 present in TASK_P2-D-kd-g4-evidence.md |
| 3 | G5 chain complete | G5a `_deprecated/` confirmed + G5b zero-domain-imports + G5c zero-TODO-migrat | All 3 in TASK_P2-G-kd-g5-evidence.md |
| 4 | G9 Go-dashboard PO Playwright | ZERO console errors, all 3 panels rendered, sandbox-populated GREEN state | docs/po-decisions from P2-I |
| 5 | G10 ≤2 cycles | dev-kinh-dich fixed injected hao_encoder bug in ≤2 dispatches | cycle_count ≤ 2 in TASK_P2-K |
| 6 | G10 byte-identical restore | `git diff kinh-dich-pre-inject-go HEAD -- hao_encoder.go` = EMPTY | EMPTY diff |
| 7 | G11 2-trial proof | Both trials show outcome-(a) coupling | g11_verdict=PASS in TASK_P2-K |
| 8 | G12 streak carry | All Phase-2 dev tasks have sandbox-green evidence | g12_streak_carryforward=CONFIRMED |
| 9 | Dashboard honest-green | Zero `language=ts\|runtime=bun` in dashboard/index.html | grep returns 0 |
| 10 | Go-era tags ordered | pre-ci-go ≤ pre-delete-go ≤ pre-inject-go in commit ancestry | All 3 resolve, ordered |
| 11 | TS-era tags intact | kinh-dich-pre-ci/delete/inject still point to TS-era SHAs | 3 SHAs unchanged |
| 12 | Phase-1 anchor intact | 4a240f63 is ancestor of HEAD | git ancestry check |

**All 12 criteria PASS → PM transitions SSOT phase2=CLOSED → PO executes Phase-3 atomic close.**

---

## WIP Policy

**WIP=1 sequential.** PM dispatches ONE task at a time. dev-kinh-dich works through P2-A → P2-Z
in the order above. No parallel dispatches within Phase 2.

**Rationale:** Pre-revert tags (P2-A, P2-E, P2-J) require that previous work is cleanly committed
before the tag is created. Running tasks in parallel would break the tag sequence discipline.

**Concurrent-pilot note:** Other fleet pilots (pdf-extractor, api-gateway) may be concurrently
active in their own zones. If dev-kinh-dich encounters a `.git/index.lock` error: verify no git
process is running, wait 4s, retry. NEVER blindly delete the lock — confirm it is orphaned first.

---

## Open Questions (for PM)

**OQ-1 — G5a determination at P2-F time:**
Phase-1 brownfield shows `src/_deprecated/services_v1.ts` may already exist from the TS Phase-2
P2-KD-F task (commit 5641f2a1). If so, P2-F becomes a verification-only task (no `git mv` needed).
PM instructs dev-kinh-dich to run the determination logic in P2-F AC-1 first before deciding
which commit path applies. The handoff doc for P2-F must clearly document which path was taken.

**OQ-2 — G11 Trial-2 injection: commit vs local-only:**
The Trial-2 `hexagram_resolver` mutation in P2-K can be local-only (never committed) or committed-
then-reverted. QA decides at task time. Either is acceptable per the grading rubric as long as git
is clean at P2-K DONE and the coupling proof is documented.

**OQ-3 — G11 Trial-1 coupling confirmation:**
If the `reading_composer` module scenario does NOT go RED during the G10 `hao_encoder` injection
(edge case: the golden module input's hao scores might not cross the 0.10/0.25 boundary), QA
must document this explicitly and ensure Trial-2 is calibrated to force module coupling. The G11
coupling proof requires ≥1 module scenario RED per trial — not just the primitive scenario.

---

## Risk Flags

**R-1 (MEDIUM) — Sister-primitive Fence-A false-green:**
The `nuclear_hexagram` package imports `hexagram_resolver` and `hao_encoder`. If the depguard
allowlist is authored incorrectly (e.g. missing the `pkg/primitive/*` → `pkg/primitive/*` permit),
P2-B AC-2 will fail (golangci-lint non-zero on a legitimate import). Mitigation: P2-B explicitly
requires AC-2 to pass on the current codebase including `nuclear_hexagram`, and the `.golangci.yml`
file header comment must document the OQ-6 allowlist rationale. If AC-2 fails at P2-B, dev-kinh-dich
must fix the allowlist config before proceeding to P2-C — never skip to the violation proof.

**R-2 (LOW) — G5b mcp-server rewire scope:**
The 6 kinh-dich MCP tools in `kinhDichTools.ts` import `computeHaoScores` and other score helpers
that are defined IN THE SAME FILE — they are mcp-server-local integration glue, not domain imports
from `apps/kinh-dich-service/src/`. QA must be careful in P2-G AC-1 to distinguish: imports from
`apps/kinh-dich-service/src/*` (forbidden — would be cross-service domain coupling) vs imports from
mcp-server's own domain layer (`mcp-server/src/domain/`) which are permitted. The TS Phase-2
P2-KD-G already resolved this; P2-G is a read-only confirmation audit, not a rewire task.

**R-3 (LOW) — G9 cold-open vs populated-state:**
The Phase-1 TS G9 (P2-KD-L) was a cold-open proof (honest NOT-RUN). The Go Phase-2 G9 re-confirm
requires a POPULATED state (sandbox run before Playwright opens). Dev-kinh-dich must run the sandbox
before handing off to PO for P2-I. If PO opens the dashboard in cold-open state, the trust layer
will show NOT-RUN for all cards — not a failure, but the evidence would be weaker than populated-
green. PM instruction: confirm with dev-kinh-dich that the sandbox run output is in the P2-I
handoff before dispatching PO.

**R-4 (LOW) — TS-era tag name collision prevention:**
Three tags (`kinh-dich-pre-ci`, `kinh-dich-pre-delete`, `kinh-dich-pre-inject`) are already in the
local git repo from the TS pilot. Dev-kinh-dich must NOT attempt to delete or force-move these.
The `-go` suffix pattern is the sanctioned disambiguation. If dev-kinh-dich accidentally creates a
tag WITHOUT the `-go` suffix (e.g. `git tag kinh-dich-pre-ci HEAD` when the tag already exists),
git will return an error — this is the correct behavior. Dev-kinh-dich must read the error and
use the `-go` suffix. Baked into P2-A AC-2 and P2-A AC-3.
