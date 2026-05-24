---
title: "Phase 2 Task Plan (Go) — alert-engine Pilot (fleet pilot 5)"
date: "2026-05-24"
author: "architect (Phase 2 dispatch)"
pilot: "alert-engine"
fleet_pilot_number: 5
phase: "2"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/p0-brownfield-inventory.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md"
ssot_ref: "docs/data/pilot-status-alert-engine.json"
language: "Go (go1.22+cgo)"
runtime: "go1.22+cgo"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc (INTACT — do NOT retag/rewrite/push)"
inbound_signal: "docs/signals/pm-alert-engine-phase1-closed-20260524T082000Z.json"
phase1_gate: "GO — all 5 close-gate criteria PASS (sandbox 11/11, dashboard 100%, G12 3/3, G7 ALL-4-PASS, gateCommit 4e756d40)"
service_port: 5006
service_port_note: "internal == external per system-map.json — never hardcode"
service_zone: "apps/alert-engine"
service_specialist: "dev-alert-engine"
structural_template: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md + docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md"
---

# Phase 2 Task Plan (Go) — alert-engine Pilot (fleet pilot 5)

**Generated:** 2026-05-24 by architect (Phase 2 dispatch)
**Phase 1 Gate:** GO — all 5 criteria PASS (sandbox 11/11, dashboard 100%, G12 3/3, G7 ALL-4-PASS, gateCommit 4e756d40, gateVerifiedAt 2026-05-24T082000Z)
**Phase 2 Goal scope:** G3, G4, G5, G9, G10, G11 (G1, G2, G6, G7, G8, G12 = EARNED-PENDING from Phase 1)
**WIP:** 1 sequential (charter wip_limit — no parallel dispatch within Phase 2)

> **IMPORTANT — no goal flips in Phase 2:** Task completion does NOT flip any G-goal state.
> All goal flips (including EARNED-PENDING → YES) are PO-only, in one atomic Phase-3 commit,
> after ALL 12 goals reach terminal state simultaneously. Every task in this plan says so explicitly.
> `goalsEarned` stays 0 throughout Phase 2. §4.5 matrix-authorship rule is binding and inviolable.
> **No task in this plan instructs anyone to flip G-goals or write decisionMatrix values.**

---

## Service Facts (verified via jq on docs/data/system-map.json — never hardcode)

```
id: alert-engine | language: go | runtime: go1.22+cgo
port: 5006 (internal == external) | zone: apps/alert-engine
specialist: dev-alert-engine | DB: alert_engine.db
```

---

## Phase 1 Artefacts Baseline (Phase 2 inherits — do NOT re-earn)

The following Phase-1 artefacts exist in the repository and are the Phase-2 starting baseline:

- `apps/alert-engine/pkg/primitive/signal-classifier/` — 3 scenario JSONs, unit tests (P1-B1)
- `apps/alert-engine/pkg/primitive/dedup-key-builder/` — 3 scenario JSONs, unit tests (P1-B2; djb2 seed=5381 byte-identical)
- `apps/alert-engine/pkg/primitive/cooldown-gate/` — 3 scenario JSONs, unit tests (P1-B3; `now time.Time` injected)
- `apps/alert-engine/pkg/module/alert_pipeline/` — module stub, ports (AlertRepositoryPort/MutePort/TelegramPort), 2 module scenarios (P1-C)
- `apps/alert-engine/cmd/sandbox/main.go` — sandbox runner, CGO_ENABLED=0 + zero-creds proven (P1-A)
- `apps/alert-engine/dashboard/index.html` — 3-panel dashboard with edit-rerun handler, SI-2 disavowal comment baked (P1-D + P1-E)
- `docs/scenarios/alert-engine/primitives/` — 9 scenario files (3 primitives × 3 each)
- `docs/scenarios/alert-engine/module/` — 2 module scenarios

**Sandbox baseline command (G12 DoD gate — applies to every dev task in Phase 2):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Currently: **11/11 PASS** (9 primitive + 2 module scenarios). This must never regress. G12 DoD gate fires on every dev task that produces sandbox-runnable artefacts.

**ZERO-CREDS + CGO baseline (inherited from Phase 1 — re-confirmed at P2-Z):**
- `env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"` returns empty.
- `grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/` returns 0.
- `CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/` exits 0.

---

## Phase 2 Summary

Phase 2 closes the 6 still-unmet goals (G3, G4, G5, G9, G10, G11). The 6 EARNED-PENDING goals
(G1, G2, G6, G7, G8, G12) require no new code tasks — they carry forward with their Phase-1
evidence and are re-confirmed at the Phase-2 close-gate (P2-Z).

**Total atomic tasks:** 14 (P2-A through P2-Z)
**Total AC count:** 69
**Critical path (sequenced by pre-revert tag discipline):**

```
P2-A (alert-engine-pre-ci tag)
  ↓
P2-B (.golangci.yml Fence-A/B/C + CI job wiring)
  ↓
P2-C (G4 deliberate-violation proof — AC-4b — reverted, NEVER committed)
  ↓
P2-D (G4 freeze anchor confirmation AC-4c)
  ↓
P2-E (alert-engine-pre-delete tag)
  ↓
P2-F (G5a — git mv superseded domain/services.go functions to pkg/domain/_deprecated/)
  ↓
P2-G (G5b/G5c — MCP handler HTTP-port audit + zero TODO.*migrat)
  ↓
P2-H (G3 — composition root rewire to alert_pipeline module + OpenAPI contract)
  ↓
P2-I (G6 finalization — dashboard deprecated-notice + wired-state display)
  ↓
P2-J (G8 honest-red deliberate-break proof)
  ↓
P2-K (G9 PO Playwright Path B — chromium-headless-shell, TCC-staged)
  ↓
P2-L (alert-engine-pre-inject tag + G10 bug injection — QA ONLY; specifics REDACTED from fixer)
  ↓
P2-M (G10 AI-fixability fix ≤2 cycles + G11 2-trial coupling proof)
  ↓
P2-Z (Phase 2 close-gate — QA)
```

**WIP=1 enforced throughout.** PM dispatches ONE task at a time. Next task dispatched only after
current task DONE signal is received and recorded.

---

## Pre-Revert Tags (Phase 2 — binding creation sequence)

Tags are created IN THE TASK THAT GATES THEM, BEFORE any mutation. No retag, no `--force`, no push.

| Tag | Created in | Step within task | Protects |
|-----|-----------|------------------|---------|
| `alert-engine-pre-ci` | **P2-A** | Step 0 (first action of P2-A) | Rollback point before G4 golangci.yml + CI work |
| `alert-engine-pre-delete` | **P2-E** | Step 0 (first action of P2-E) | Rollback point before G5a git mv to _deprecated/ |
| `alert-engine-pre-inject` | **P2-L** | Step 0 (first action of P2-L) | Rollback point before G10 bug-injection commit |

None of these tags exist yet in the repository at Phase-2 kickoff. All three are created in the
designated Phase-2 task, never early, never retrofitted.

---

## G4 Fence Proof Obligation (Charter §G4 — Baked Here)

**CRITICAL: a `.golangci.yml` depguard config can report exit 0 while silently checking NOTHING
if the rule name is deprecated, the glob patterns do not match actual import paths, or the linter
version does not support the config format.**

**"golangci-lint exit 0" alone does NOT prove the fence enforces.**

Task P2-C exists specifically to prove the fence by injecting a DELIBERATE Fence-A violation
and confirming golangci-lint exits NON-ZERO with the fence name in the output. Only after that
confirmed non-zero exit does P2-C revert the violation and verify the clean run exits 0 again.

This inject-and-revert proof is the R-FENCE gate for alert-engine (Go depguard analog of the
R-FENCE gate for kinh-dich's ESLint-plugin-boundaries). It is non-negotiable — the AC is the
proof, not the config file's existence.

---

## G10 Inject/Fix Blind-Split Obligation (Charter §G10)

**CRITICAL: the fixer (P2-M owner: dev-alert-engine) must stay BLIND to the specific bug injected
in P2-L. The handoff from P2-L to P2-M must REDACT the exact injection site and the exact literal
change. P2-M instructions tell dev-alert-engine only:**
1. A bug has been injected into one alert-engine primitive.
2. The sandbox shows at least 1 FAIL.
3. The dashboard shows RED for at least 1 card.
4. Fix the bug, verify sandbox green and dashboard green.

**QA owns P2-L (injection). dev-alert-engine owns P2-M (blind fix). These are SEPARATE tasks
with a deliberately opaque handoff. QA does NOT reveal the target file, the target function,
or the changed literal to dev-alert-engine at P2-M dispatch time.**

This blind-split design is the only way to prove G10 (AI agent diagnoses and fixes from symptoms).
If the fix agent sees the injection spec, G10 proves nothing.

---

## Hard Constraints (every task inherits all)

| Constraint | Rule |
|---|---|
| **G12 DoD gate** | `cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all` exits 0 BEFORE DONE on every task that produces sandbox-runnable artefacts. Baseline: 11/11. |
| **Fence-A** | `pkg/primitive/*/` imports stdlib only — no module, application, interface, infrastructure imports, no `mattn/go-sqlite3`, no Telegram client |
| **Fence-B** | `pkg/module/*/` imports primitives + stdlib + domain only — no application, infrastructure, interface, no `mattn/go-sqlite3`, no Telegram credential strings |
| **Fence-C** | `mattn/go-sqlite3` + Telegram infra (`TelegramClient`) importable ONLY from `cmd/server/main.go` (composition root). Exclusions: `!**/cmd/server/main.go`, `!**/*_test.go` |
| **ZERO-CREDS** | TELEGRAM_BOT_TOKEN, TELEGRAM_INFO_MARKET_GROUP_ID, TELEGRAM_INFO_WORK_CHANNEL_ID, TELEGRAM_REPORT_BUG_CHANNEL_ID must NEVER appear in primitive/module/sandbox/scenario paths. Any hit = G7 BLOCKED. |
| **CGO sandbox fence** | `CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/` exits 0 on every task that touches sandbox |
| **SI-2 boundary** | `docs/dashboards/index.html` MUST NOT be created, modified, or read by alert-engine. alert-engine G6 = `apps/alert-engine/dashboard/index.html` only. |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source/CI files |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor before AND after every commit. Verify: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD \| tail -1` must return non-empty |
| **SSOT freeze** | Do NOT modify `docs/data/pilot-status-alert-engine.json` goal fields or decisionMatrix — PM-owned. Do NOT flip any G-goal field. `goalsEarned` stays 0. |
| **Charter §4.5** | `decisionMatrix.{speed,trust,scale}` stays `TBD`. PO-only authorship at 12/12 terminal in Phase 3. |
| **DORMANT/CLOSED freeze** | Do NOT touch `apps/technical-analysis/`, `apps/macro-indicators/`, `apps/stock-price/`, `apps/kinh-dich-service/`, their closed/active SSOTs, or any zone other than `apps/alert-engine/` and the mcp-server tool handlers strictly scoped to G5b. |
| **Single-committer serialization** | INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION active. Before staging: `git diff --cached --name-only`. If a FOREIGN path appears, WAIT. NEVER `git reset HEAD` a foreign path. |

---

## Task Ledger

| ID | Title | Owner | G-goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-----------------|--------|------------|-----|----------|
| **P2-A** | Create `alert-engine-pre-ci` tag (pre-revert anchor before G4 work) | dev-alert-engine | G4 (setup) | P2-B | — | 5m | 3 |
| **P2-B** | `apps/alert-engine/.golangci.yml` Fence-A/B/C creation + CI job wiring | dev-alert-engine | G4 partial | P2-C | P2-A | 1h | 5 |
| **P2-C** | G4 deliberate-violation proof (AC-4b) — Fence-A violation, non-zero exit proven, reverted, NEVER committed | dev-alert-engine + qa | G4 full | P2-D | P2-B | 30m | 5 |
| **P2-D** | G4 freeze anchor confirmation (AC-4c) | qa | G4 finalized | P2-E | P2-C | 10m | 3 |
| **P2-E** | Create `alert-engine-pre-delete` tag (pre-revert anchor before G5a work) | dev-alert-engine | G5 (setup) | P2-F | P2-D | 5m | 3 |
| **P2-F** | G5a — `git mv` superseded domain functions to `pkg/domain/_deprecated/` + application layer rewire | dev-alert-engine | G5a | P2-G | P2-E | 1.5h | 7 |
| **P2-G** | G5b/G5c — MCP handler HTTP-port audit + zero `TODO.*migrat` verification | qa | G5b, G5c | P2-H | P2-F | 30m | 5 |
| **P2-H** | G3 — composition root rewire to `alert_pipeline` module + OpenAPI contract | dev-alert-engine | G3 | P2-I | P2-G | 2h | 7 |
| **P2-I** | G6 finalization — dashboard deprecated-notice + Phase-2 wired-state display | dev-alert-engine | G6 | P2-J | P2-H | 1h | 5 |
| **P2-J** | G8 honest-red deliberate-break proof (Test A corrupted + Test B golden) | qa | G8 | P2-K | P2-I | 30m | 5 |
| **P2-K** | G9 PO Playwright Path B (chromium-headless-shell, TCC-staged via Terminal.app) | po | G9 | P2-L | P2-J | 30m | 4 |
| **P2-L** | Create `alert-engine-pre-inject` tag + G10 bug injection (QA only — bug specifics REDACTED from fixer) | qa | G10 setup | P2-M | P2-K | 20m | 4 |
| **P2-M** | G10 AI-fixability fix ≤2 cycles (blind fix from symptoms) + G11 2-trial coupling proof | dev-alert-engine (fix) + qa (count + Trial-2) | G10, G11 | P2-Z | P2-L | 1.5h | 6 |
| **P2-Z** | Phase 2 close-gate verification (QA) — all Phase-2 goal evidence chain confirmed | qa | (no flip) | Phase 3 | P2-M | 30m | 6 |

**Total atomic tasks:** 14 (P2-A through P2-Z)
**Total AC count:** 69
**Total estimated effort:** ~10 hours (dev-alert-engine + qa + po combined, WIP=1 sequential)
**G12:** EARNED-PENDING (carry-forward — no new task; QA re-confirms streak at P2-Z)

---

## Per-Task Acceptance Criteria

---

### P2-A — Create `alert-engine-pre-ci` Tag

**Owner:** dev-alert-engine
**Blocked by:** — (first Phase 2 task)
**Files touched:** none (tag only)

**Background:** L5 lesson baked Day 0. The pre-revert tag MUST exist BEFORE any `.golangci.yml`
or CI job work lands. Standalone task so PM can verify the tag before dispatching P2-B.

**Step 0 (only action):**
```bash
git tag alert-engine-pre-ci HEAD
```
Confirm with:
```bash
git log --oneline alert-engine-pre-ci
```
Must return the current HEAD commit SHA + subject (the Phase-1 close-gate commit or a commit after it —
specifically `d6eab5bf` or later).

**AC-1:** `git log --oneline alert-engine-pre-ci` returns exactly one line referencing a Phase-1 commit.
No `--force`, no push.

**AC-2:** `git tag | grep alert-engine-pre-ci` returns `alert-engine-pre-ci` (tag exists in local repo).

**AC-3:** Anchor still INTACT: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` returns non-empty output.

**Commit:** No commit required for tag creation. Dev creates a signal file documenting the tag SHA,
stages with L84 explicit path, and commits it as the evidence record.

**Signal file:** `docs/signals/dev-ae-P2-A-done-<UTC>.json` (fields: task=P2-A,
tag=alert-engine-pre-ci, tagged_sha=<sha>, anchor_intact=true, next=pm).

**G-goal posture:** NO goal flips. Tag is infrastructure only. §4.5 SSOT untouched.

---

### P2-B — `apps/alert-engine/.golangci.yml` Fence-A/B/C Creation + CI Job Wiring

**Owner:** dev-alert-engine
**Blocked by:** P2-A DONE (tag exists)
**Files touched:**
- `apps/alert-engine/.golangci.yml` (CREATE)
- `.github/workflows/ci.yml` (MODIFY — add `alert-engine-go-lint` job; OR document offline proof if CI billing block persists)

**Background:** alert-engine is Go — same proven depguard path as TA + macro + stock-price. Three
Fence rules mirror the stock-price `.golangci.yml` structure, adapted for alert-engine primitive/module paths.
The config is created AFTER the pre-ci tag (P2-A) so the freeze anchor is unambiguous.

**`.golangci.yml` spec (alert-engine calibration — three named depguard rules):**

```yaml
run:
  timeout: 120s

linters:
  enable:
    - depguard

linters-settings:
  depguard:
    rules:
      fence-a:
        # Fence-A: pkg/primitive/ must not import application, infrastructure,
        # interface, mattn/go-sqlite3, or any Telegram client package.
        files:
          - "**/pkg/primitive/**/*.go"
        deny:
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/application"
            desc: "Fence-A: primitive must not import application layer"
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/infrastructure"
            desc: "Fence-A: primitive must not import infrastructure layer"
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/interface"
            desc: "Fence-A: primitive must not import interface layer"
          - pkg: "github.com/mattn/go-sqlite3"
            desc: "Fence-A: primitive must not import mattn/go-sqlite3 (CGO)"
      fence-b:
        # Fence-B: pkg/module/ must not import infrastructure, mattn/go-sqlite3,
        # or any Telegram client. Domain and primitive imports are allowed.
        files:
          - "**/pkg/module/**/*.go"
        deny:
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/infrastructure"
            desc: "Fence-B: module must not import infrastructure layer"
          - pkg: "github.com/mattn/go-sqlite3"
            desc: "Fence-B: module must not import mattn/go-sqlite3 (CGO)"
      fence-c:
        # Fence-C: mattn/go-sqlite3 + TelegramClient (infra) importable ONLY
        # from cmd/server/main.go. All other Go files are barred.
        files:
          - "!**/cmd/server/main.go"
          - "!**/*_test.go"
          - "**/*.go"
        deny:
          - pkg: "github.com/mattn/go-sqlite3"
            desc: "Fence-C: mattn/go-sqlite3 only importable from cmd/server/main.go"
```

**CI job spec (add to `.github/workflows/ci.yml`, if file exists):**
```yaml
alert-engine-go-lint:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: apps/alert-engine
  steps:
    - uses: actions/checkout@v4
    - uses: golangci/golangci-lint-action@v6
      with:
        version: latest
        working-directory: apps/alert-engine
```
If CI billing block prevents workflow changes, offline proof (golangci-lint run locally) is the equivalent.

**AC-1:** `apps/alert-engine/.golangci.yml` exists and contains THREE named depguard rules: `fence-a`,
`fence-b`, `fence-c` — matching the spec above. Config is ≤80 lines.

**AC-2:** `cd apps/alert-engine && golangci-lint run` exits 0 on the CURRENT Phase-1 codebase
(no fence violations exist in existing primitives, module, or sandbox — they are already stdlib-only/domain-only).
Evidence pasted to handoff.

**AC-3:** `.github/workflows/ci.yml` includes a job named `alert-engine-go-lint` with
`working-directory: apps/alert-engine` — OR offline proof documented if CI billing block persists.
Evidence:
```bash
grep -n "alert-engine-go-lint\|alert-engine" .github/workflows/ci.yml
```
Returns ≥1 match, OR offline-proof paragraph appears in handoff.

**AC-4:** `git log --oneline apps/alert-engine/.golangci.yml` shows ONLY P2-B as the most recent
commit on that file (establishes the freeze anchor path for AC-4c in P2-D).

**AC-5 — G12 DoD gate:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. Paste output summary to handoff doc (≥11 scenarios PASS).

**Commit subject pattern:**
```
feat(alert-engine): P2-B — .golangci.yml Fence-A/B/C + CI go-lint job (G4 partial)
```

**G-goal posture:** NO goal flips. G4 advances but does NOT flip to YES here. §4.5 SSOT untouched.

---

### P2-C — G4 Deliberate-Violation Proof (AC-4b) — Reverted, NEVER Committed

**Owner:** dev-alert-engine + qa (QA reproduces independently)
**Blocked by:** P2-B DONE (`.golangci.yml` exists and golangci-lint exits 0 on clean source)
**Files touched:** NONE committed — violation is local-only, reverted before any commit

**Background:** THIS IS THE R-FENCE GATE. A lint config that exits 0 while checking nothing is a
false-green. P2-C proves the fence catches a REAL violation on the ACTUAL `pkg/primitive/` import style.
The violation is a controlled local experiment. It MUST be reverted before any commit. `git status`
must be clean after revert. "golangci-lint exit 0" on the violation run = BLOCKER (fence is broken;
investigate depguard rule syntax and path globs before proceeding to P2-D).

**Violation procedure (dev-alert-engine executes; QA reproduces independently on a DIFFERENT primitive file):**

Step 1 — Add ONE temporary Fence-A violation. Open
`apps/alert-engine/pkg/primitive/signal-classifier/classifier.go`. Add one import line that imports
`github.com/mattn/go-sqlite3` or any path from `pkg/infrastructure/`. Do NOT save a commit — keep local only.

Step 2 — Run the linter:
```bash
cd apps/alert-engine && golangci-lint run
```
Must exit non-zero. Output must contain `fence-a` or `Fence-A` in the depguard diagnostic and name
the violating file.

Step 3 — Revert the violation immediately:
```bash
git checkout apps/alert-engine/pkg/primitive/signal-classifier/classifier.go
```

Step 4 — Confirm clean linter run:
```bash
cd apps/alert-engine && golangci-lint run
```
Must exit 0.

Step 5 — Confirm git status is clean:
```bash
git status --short | grep "signal-classifier"
```
Must show no changes.

**If Step 2 exits 0 (fence did NOT catch the violation):** P2-C is BLOCKED. Investigate:
(a) verify `golangci-lint --version` matches a version that supports the depguard config format used,
(b) verify the `files` glob patterns in `.golangci.yml` match actual Go file paths under `pkg/primitive/`,
(c) verify the `deny.pkg` entries exactly match the Go module import paths (not filesystem paths).
Fix the config in-place (do NOT retag `alert-engine-pre-ci`), re-run the whole procedure from Step 1.
Do NOT proceed to P2-D until golangci-lint exits non-zero on the violation run.

**AC-1:** Linter exits non-zero on the violation run. Output contains `fence-a` (or `Fence-A`) and
names the violating file. Full linter output pasted to handoff doc section `§Evidence — AC-4b Violation Run`.
Expected output resembles:
```
apps/alert-engine/pkg/primitive/signal-classifier/classifier.go:N:N:
  import "github.com/mattn/go-sqlite3" is not allowed (Fence-A: primitive must not import mattn/go-sqlite3 (CGO))
```

**AC-2:** Linter exits 0 after revert. Evidence pasted to `§Evidence — AC-4b Clean Run`.

**AC-3:** `git status --short | grep "pkg/primitive"` returns empty after revert. Violation was
NEVER staged, NEVER committed.

**AC-4:** QA independently reproduces the violation proof on a DIFFERENT primitive file
(e.g. `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go` with a `pkg/infrastructure`
import). QA pastes their own evidence (non-zero exit + `fence-a` in output). QA's reproduction
must use the SAME `.golangci.yml` that P2-B committed — no config changes permitted.

**AC-5 — G12 DoD gate:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0 (sandbox still green after AC-4b exercise — no committed code changed).

**Commit:** No violation committed. Dev-alert-engine commits the HANDOFF EVIDENCE ONLY
(handoff doc update with pasted linter outputs). QA commits their reproduction evidence similarly.

**G-goal posture:** NO goal flips. AC-4b is the R-FENCE gate arm of G4; G4 is not yet terminal.
§4.5 SSOT untouched.

---

### P2-D — G4 Freeze Anchor Confirmation (AC-4c)

**Owner:** qa
**Blocked by:** P2-C DONE (violation reverted, handoff evidence complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** AC-4c confirms the `.golangci.yml` freeze anchor. The freeze anchor is the P2-B
commit — the MOST RECENT commit on `.golangci.yml`. No subsequent commit should have touched it
(the violation proof in P2-C deliberately produces no committed changes to `.golangci.yml`).

**AC-1 — Freeze anchor verification:**
```bash
git log --oneline apps/alert-engine/.golangci.yml
```
The MOST RECENT commit on that file must be the P2-B commit. Record the commit SHA as
`golangci_freeze_sha` in the G4 evidence.

**AC-2 — `alert-engine-pre-ci` tag ancestry:**
```bash
git merge-base alert-engine-pre-ci HEAD
```
Returns a non-empty SHA. The `alert-engine-pre-ci` tag points at a commit BEFORE the
P2-B `.golangci.yml` creation commit.

**AC-3 — G4 evidence compilation:**
QA writes a G4 evidence summary to `docs/handoffs/TASK_P2-D-ae-g4-evidence.md` containing:
- `ac_4a_ci_job_wired: YES` (from P2-B AC-3 evidence, or `offline_proof: YES` if billing block)
- `ac_4b_violation_proof: YES` (from P2-C — linter caught Fence-A violation, violation reverted)
- `ac_4c_freeze_sha: <sha>` (the P2-B commit SHA)
- `alert_engine_pre_ci_tag_sha: <sha>` (the P2-A tag SHA)
- `r_fence_gate: PASS` (AC-4b proof succeeded with non-zero exit + fence-a in output)
- `g4_ready_to_grade: YES`

QA emits `docs/signals/qa-ae-P2-D-g4-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G4 evidence complete but PO flips G4 only at 12/12 terminal
Phase-3 close. §4.5 SSOT untouched.

---

### P2-E — Create `alert-engine-pre-delete` Tag

**Owner:** dev-alert-engine
**Blocked by:** P2-D DONE (G4 evidence confirmed — fence proven before deletion)
**Files touched:** none (tag only)

**Background:** L5 discipline. The `alert-engine-pre-delete` tag MUST exist BEFORE any `git mv`
of superseded domain logic. This sequencing ensures the G4 fence is proven on the pre-deletion
codebase, so any fence violation introduced during the `git mv` operation is immediately detectable.

**Step 0 (only action):**
```bash
git tag alert-engine-pre-delete HEAD
```
Confirm:
```bash
git log --oneline alert-engine-pre-delete
```
Must return the HEAD commit at P2-D close (the G4 evidence commit).

**AC-1:** `git log --oneline alert-engine-pre-delete` returns the commit at or immediately after P2-D.

**AC-2:** `git tag | grep alert-engine-pre-delete` returns `alert-engine-pre-delete`.

**AC-3:** Anchor still INTACT: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` non-empty.

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-F — G5a: `git mv` Superseded Domain Functions to `pkg/domain/_deprecated/`

**Owner:** dev-alert-engine
**Blocked by:** P2-E DONE (`alert-engine-pre-delete` tag confirmed)
**Files touched:**
- `apps/alert-engine/pkg/domain/services.go` → `apps/alert-engine/pkg/domain/_deprecated/services_v1.go` (MOVE via `git mv`)
- `apps/alert-engine/pkg/application/evaluate.go` (MODIFY — rewire `EvaluateAlertUseCase.Execute` to call `alert_pipeline` module instead of importing `domain.ComputeFingerprint` / `domain.IsDuplicate` / `domain.ShouldSuppressAlert` directly)

**Background:** Per brownfield scan and Phase-1 ledger:

- `pkg/domain/services.go` (ComputeFingerprint/djb2Hash + IsDuplicate + ShouldSuppressAlert + isToday helper, 151 lines)
  is the Phase-1 predecessor of the `alert_pipeline` module. When the module is validated
  (Phase 1 DONE), these three pure functions are superseded by the extracted primitives
  (`dedup-key-builder`, `duplicate-checker` absent, `cooldown-gate`). The file moves to
  `pkg/domain/_deprecated/services_v1.go`.
- `pkg/application/evaluate.go` currently calls `domain.ComputeFingerprint` (L47),
  `domain.IsDuplicate` (L73), and `domain.ShouldSuppressAlert` (L88) directly. After the move,
  `EvaluateAlertUseCase.Execute()` must call the `alert_pipeline` module's composition logic
  instead of those direct domain function calls. The `alert_pipeline` module already provides
  the full pipeline via injected ports — the use case becomes a thin orchestrator that delegates.
- The existing unit test file `apps/alert-engine/pkg/domain/services_test.go` (if present) moves
  alongside the deprecated service file to `_deprecated/services_v1_test.go`. It remains compilable
  as deprecated tests and is NOT deleted.
- **scope clarification:** `pkg/domain/models.go`, `pkg/domain/ports.go`, `pkg/domain/config.go`
  are NOT deprecated — they define types, ports, and config constants still used by infrastructure
  and the module. ONLY `services.go` (the pure functions now superseded by primitives) is deprecated.

**Pre-condition (mandatory — verify before any `git mv`):**
```bash
git log --oneline alert-engine-pre-delete
```
Must return the P2-E commit. If tag is missing, STOP and notify PM.

**AC-1 — G5a file moved:**
```bash
test -f apps/alert-engine/pkg/domain/_deprecated/services_v1.go && echo FOUND
test -f apps/alert-engine/pkg/domain/services.go && echo STILL_EXISTS
```
First command echoes FOUND. Second command echoes nothing (original path is gone).

**AC-2 — Application use case rewired (zero direct calls to deprecated functions):**
```bash
grep -n "domain\.ComputeFingerprint\|domain\.IsDuplicate\|domain\.ShouldSuppressAlert" \
  apps/alert-engine/pkg/application/evaluate.go
```
Must return 0 matches. The use case no longer imports the deprecated domain service functions directly.
It delegates through the `alert_pipeline` module ports.

**AC-3 — Build clean:**
```bash
cd apps/alert-engine && go build ./...
```
Exits 0 (the deprecation move did not break compilation; deprecated service compiles under its new path).

**AC-4 — Fence-A/B clean post-move:**
```bash
cd apps/alert-engine && golangci-lint run
```
Exits 0 (no new fence violations introduced by the `git mv` or the use-case rewire).

**AC-5 — G12 DoD gate:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. Sandbox still green after deprecation move (≥11 scenarios PASS). Paste output to handoff.

**AC-6 — `_deprecated/` directory exists with moved file:**
```bash
find apps/alert-engine/pkg -path "*_deprecated*" -type f | sort
```
Output includes `services_v1.go` under the `_deprecated/` path.

**AC-7 — Fence-C still holds (infra not imported outside composition root):**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure" \
  apps/alert-engine/pkg/domain/ \
  apps/alert-engine/pkg/application/ \
  apps/alert-engine/pkg/module/ \
  apps/alert-engine/pkg/primitive/
```
Must return 0 matches. Infra imports exist only in `cmd/server/main.go` (composition root).

**Commit subject pattern:**
```
chore(alert-engine): P2-F — git mv domain/services.go → _deprecated/ + evaluate.go rewire to alert_pipeline (G5a)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-G — G5b/G5c: MCP Handler HTTP-Port Audit + Zero `TODO.*migrat`

**Owner:** qa
**Blocked by:** P2-F DONE (G5a move complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** Per brownfield scan, alert-engine G5b scope is NARROW — the MCP server's HTTP
client `clients.ts` already declares `alertEngine: Bun.env.ALERT_ENGINE_URL ?? 'http://localhost:5006'`
(line 28). The alert-engine is called via HTTP in production (cron scheduler dispatches to the Go
service at port 5006). The MCP Telegram tools (`telegramTools.ts`) call the mcp-server's own
Telegram infrastructure directly — they do NOT import alert-engine domain logic. No direct
domain import from any mcp-server tool handler into alert-engine Go packages exists (confirmed:
the mcp-server and alert-engine are separate Docker containers; no cross-service Go import is
possible). G5b confirmation is therefore a grep-only audit proving zero direct cross-service
domain imports. G5c clears TODO migration debt.

**AC-1 — Zero direct alert-engine domain imports in mcp-server:**
```bash
grep -rn "vn-market-intelligence/alert-engine\|apps/alert-engine/pkg" \
  apps/mcp-server/src/ --include="*.ts"
```
Must return 0 matches. No TypeScript file may cross-import a Go package path.

**AC-2 — HTTP client confirmed at correct port:**
```bash
grep -n "5006\|alert-engine\|alertEngine" \
  apps/mcp-server/src/infrastructure/microservices/clients.ts
```
Must return ≥1 match showing `5006` or `alertEngine` (confirming HTTP integration address is declared).

**AC-3 — Zero `TODO.*migrat` markers in alert-engine zone (G5c):**
```bash
grep -rn "TODO.*migrat" apps/alert-engine/ --include="*.go"
```
Must return 0 matches.

**AC-4 — Zero `TODO.*migrat` in deprecated path:**
```bash
grep -rn "TODO.*migrat" apps/alert-engine/pkg/domain/_deprecated/ 2>/dev/null
```
Must return 0 matches.

**AC-5 — G5 evidence compiled:**
QA writes G5 grade evidence to `docs/handoffs/TASK_P2-G-ae-g5-evidence.md`:
- `g5a_deprecated_path: apps/alert-engine/pkg/domain/_deprecated/services_v1.go`
- `g5b_zero_direct_domain_imports: YES`
- `g5b_http_client_present: YES (port 5006 in clients.ts)`
- `g5b_scope: NARROW (HTTP client declared; no tool handler imports alert-engine Go pkg)`
- `g5c_zero_todo_migrat: YES`
- `g5_ready_to_grade: YES`

QA emits `docs/signals/qa-ae-P2-G-g5-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G5 evidence complete. §4.5 SSOT untouched.

---

### P2-H — G3: Composition Root Rewire to `alert_pipeline` Module + OpenAPI Contract

**Owner:** dev-alert-engine
**Blocked by:** P2-G DONE (G5 chain confirmed clean — safe to finalize composition root)
**Files touched:**
- `apps/alert-engine/cmd/server/main.go` (MODIFY — wire the `alert_pipeline` module as the
  primary orchestrator; confirm port 5006 wiring from env-var, NOT hardcoded; ensure
  `mattn/go-sqlite3` + `TelegramClient` remain wired HERE as infra impls of `AlertRepositoryPort`,
  `MutePort`, `TelegramPort`)
- `apps/alert-engine/api/openapi.yaml` (CREATE — OpenAPI contract documenting all HTTP endpoints)

**Background:** G3 requires the composition root to be a pure wiring file (no business logic,
no domain calculations, no cooldown checks, no fingerprint operations) AND an HTTP contract document.

**Current state:** `cmd/server/main.go` is 95 lines and already wires infra ports cleanly
(it wires `alertRepo`, `muteRepo`, `telegram` and injects them into `application.NewEvaluateAlertUseCase`).
Phase-2 G3 rewires the use case to delegate through the `alert_pipeline` module, so business-logic
references to `ComputeFingerprint` / `IsDuplicate` / `ShouldSuppressAlert` are no longer in
the application layer (they moved to primitives + module in Phase 1). The composition root
should remain ≤120 lines after this change (it is already close to the target).

The CGO SQLite repo (`mattn/go-sqlite3` in `infrastructure.NewSQLiteAlertRepository`) and the
TelegramClient (`infrastructure.NewTelegramClient`) remain wired at the composition root —
this is correct per Fence-C (they are infra adapters injected as port implementations).

**AC-1 — Zero domain-operation references in composition root:**
```bash
grep -c "ComputeFingerprint\|IsDuplicate\|ShouldSuppressAlert\|joinSignalTypes\|isToday\|djb2Hash" \
  apps/alert-engine/cmd/server/main.go
```
Must return 0. Logic lives in primitives/module, not the composition root.

**AC-2 — `alert_pipeline` module wired at composition root:**
```bash
grep -n "alert_pipeline\|alertpipeline\|AlertPipeline" apps/alert-engine/cmd/server/main.go
```
Must return ≥1 match (the module is instantiated/wired here — with the infra adapters injected
as port implementations satisfying `AlertRepositoryPort`, `MutePort`, `TelegramPort`).

**AC-3 — Infra adapters still injected at composition root (Fence-C confirmed):**
```bash
grep -n "infrastructure\|SQLite\|mattn\|Telegram" apps/alert-engine/cmd/server/main.go
```
Must return ≥1 match per infra adapter (CGO SQLite repo + TelegramClient both wired here).

**AC-4 — OpenAPI contract exists and covers live endpoints:**
```bash
test -f apps/alert-engine/api/openapi.yaml && echo FOUND
```
Echoes FOUND. The YAML must document at minimum:
- `GET /health` → `{ status, service, port }`
- `POST /evaluate` → request: `EvaluateAlertRequest` shape, response: `EvaluateAlertResponse` shape
- Any other live endpoints (mute management, etc. — dev-alert-engine discovers from `pkg/interface/http/router.go`)

Validation: `python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)" < apps/alert-engine/api/openapi.yaml` exits 0.

**AC-5 — Build + lint still clean:**
```bash
cd apps/alert-engine && go build ./... && golangci-lint run
```
Both exit 0.

**AC-6 — Composition root ≤120 lines:**
```bash
wc -l apps/alert-engine/cmd/server/main.go
```
Must return ≤120. If it exceeds 120 lines, extract DI wiring into `cmd/server/wire.go`
(pure wiring helper, no business logic).

**AC-7 — G12 DoD gate:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. Paste output to handoff doc (≥11 scenarios PASS).

**Commit subject pattern:**
```
feat(alert-engine): P2-H — composition root rewire to alert_pipeline module + OpenAPI contract (G3)
```

**G-goal posture:** NO goal flips. G3 advances. §4.5 SSOT untouched.

---

### P2-I — G6 Finalization: Dashboard Deprecated-Notice + Phase-2 Wired-State Display

**Owner:** dev-alert-engine
**Blocked by:** P2-H DONE (composition root wired — microservice panel can now show real Phase-2 state)
**Files touched:**
- `apps/alert-engine/dashboard/index.html` (MODIFY — add G5a `_deprecated/` notice + update
  microservice panel to reflect Phase-2 wired state; NO SI-2 touch)

**Background:** G6 dashboard stub exists from Phase-1 (P1-D). Phase-2 finalization adds:
1. A "Deprecated" notice section listing `pkg/domain/_deprecated/services_v1.go` (G5a transparency).
2. Microservice panel update: note that `alert_pipeline` module is now wired in the composition
   root (G3 wired state — trust layer shows the Phase-2 change).
3. All existing panel cards and the SI-2 disavowal HTML comment remain untouched.

**SI-2 boundary (MANDATORY):** alert-engine MUST NOT create or modify `docs/dashboards/index.html`
under any circumstances. The SI-2 disavowal HTML comment already baked in P1-D must remain present.

**AC-1 — Dashboard file exists and opens via `file://`:**
```bash
test -f apps/alert-engine/dashboard/index.html && echo FOUND
```
Echoes FOUND. File opens via `file://` with zero network calls (QA verifies cold open).

**AC-2 — Deprecated notice present:**
```bash
grep -c "_deprecated\|services_v1\|deprecated" apps/alert-engine/dashboard/index.html
```
Must return ≥1 (the G5a notice mentions the deprecated file path).

**AC-3 — SI-2 disavowal comment still present:**
```bash
grep -c "SI-2 NOTE\|docs/dashboards/index.html.*stock-price-EXCLUSIVE" \
  apps/alert-engine/dashboard/index.html
```
Must return ≥1 (the Phase-1 baked disavowal comment is intact).

**AC-4 — Zero credentials still clean:**
```bash
grep -c "TELEGRAM\|BOT_TOKEN\|CHAT_ID\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" \
  apps/alert-engine/dashboard/index.html
```
Must return 0.

**AC-5 — G12 DoD gate:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. All ≥11 scenarios PASS. Paste output to handoff doc.

**Commit subject pattern:**
```
feat(alert-engine): P2-I — dashboard G6 finalization (deprecated-notice + Phase-2 wired-state) (G6)
```

**G-goal posture:** NO goal flips. G6 evidence advances. §4.5 SSOT untouched.

---

### P2-J — G8 Honest-Red Deliberate-Break Proof

**Owner:** qa
**Blocked by:** P2-I DONE (dashboard finalized — honest-red test requires a working dashboard)
**Files touched:** none committed (test edits to scenario JSON are reverted; handoff doc is committed)

**Background:** G8 honest-red contract. Two tests prove the dashboard is not a false-green machine.
Pattern inherited verbatim from stock-price P2-J — scenario JSON corruption + revert.

**Test A — Corrupted scenario:**
1. Edit one golden scenario JSON (e.g. `docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json`).
   Change one expected output field to a wrong value (e.g. flip `suppress: false` to `suppress: true`).
2. Run sandbox:
   ```bash
   cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
   ```
   Must exit non-zero with ≥1 FAIL for `cooldown-gate`.
3. Open `apps/alert-engine/dashboard/index.html` — `cooldown-gate` card must show RED / FAIL status.
4. Capture terminal output + dashboard state description in handoff.
5. Revert: `git checkout docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json`

**Test B — Golden scenario (after revert):**
1. Run sandbox:
   ```bash
   cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
   ```
   Must exit 0 with all scenarios PASS.
2. Open dashboard — all cards show GREEN (after sandbox run). No false greens on NOT-RUN items.

**AC-1 (Test A):** Sandbox exits non-zero on corrupted scenario AND dashboard shows non-green for the
affected card. Evidence (terminal output) pasted to handoff `§Evidence — G8 Test A`.

**AC-2 (Test B):** Sandbox exits 0 after revert AND dashboard shows green for all cards.
Evidence pasted to `§Evidence — G8 Test B`.

**AC-3 — 2 additional known-bad runs:**
QA runs 2 more deliberately corrupted scenario invocations using different primitives
(e.g. `signal-classifier-golden.json` then `dedup-key-builder-golden.json`). Both return
exit non-zero. Evidence: paste exit codes.

**AC-4 — Reverted files clean:**
```bash
git status --short | grep "scenarios"
```
Returns empty (no staged or unstaged changes to any scenario file after all reverts).

**AC-5 — G8 evidence compiled:**
QA writes `docs/handoffs/TASK_P2-J-ae-g8-evidence.md` and emits
`docs/signals/qa-ae-P2-J-g8-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G8 evidence complete. §4.5 SSOT untouched.

---

### P2-K — G9 PO Playwright Path B (Chromium-Headless-Shell, TCC-Staged)

**Owner:** po
**Blocked by:** P2-J DONE (dashboard honest-red proven — trust contract can now be verified)

**Background:** Charter §G9 Path B is the Day-0 default (L6 lesson). No synchronous user wait
required. PO runs Playwright chromium-headless-shell against the per-service dashboard
(`apps/alert-engine/dashboard/index.html`). Path B carries equal weight to Path A (user verbal
YES). If user is available at this point, PO may substitute Path A — either path satisfies G9.

**AC-1:** PO runs Playwright headless chromium against `file://apps/alert-engine/dashboard/index.html`
(TCC-staged via Terminal.app per L87 precedent). All 3 panels (primitives, module, microservice)
are rendered in the DOM.

**AC-2:** ZERO console errors, ZERO pageerrors, ZERO requestfailed in Playwright log.

**AC-3:** All primitive cards (≥3: signal-classifier, dedup-key-builder, cooldown-gate) + module
card (alert_pipeline) + microservice card (alert-engine) are visible in the DOM. Status displayed
honestly (cards show state from last sandbox run; NOT-RUN cards do not show false GREEN).

**AC-4:** PO records verdict in `docs/po-decisions/<date>-g9-alert-engine-user-confirmation.md`
per charter §G9 Path B template. Fields: `pilot: alert-engine`, `path: B (PO Playwright)`,
`verdict: PASS` (or FAIL if any AC fails). Emits `docs/signals/po-ae-P2-K-g9-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G9 evidence complete. §4.5 SSOT untouched.

---

### P2-L — Create `alert-engine-pre-inject` Tag + G10 Bug Injection

**Owner:** qa
**Blocked by:** P2-K DONE (G9 confirmed — trust layer proven before deliberately breaking things)
**Files touched:** 1 committed injection file (deliberate bug in ONE primitive)

**Background:** L5 tag discipline + G10 bug injection spec from charter §G10. The pre-inject tag
MUST exist BEFORE the injection commit. QA injects a SINGLE-LITERAL bug into one alert-engine
primitive. **The fixer (dev-alert-engine, dispatched in P2-M) must stay BLIND — the P2-M
handoff must REDACT the target file, the target function, and the exact literal change.**
The fixer receives only: "a bug is in a primitive, sandbox shows FAIL, dashboard is RED; fix it."

**Step 0 (mandatory — before any file edit):**
```bash
git tag alert-engine-pre-inject HEAD
git log --oneline alert-engine-pre-inject
```
Must return the P2-K evidence commit. STOP if tag creation fails.

**Bug injection spec (calibrated for alert-engine, single-literal — DETAILS KEPT SECRET from P2-M fixer):**

QA selects ONE of the following targets (QA's choice — the selected target is documented in
`docs/handoffs/TASK_P2-L-ae-injection-spec.md` which PM holds but does NOT include in the P2-M
handoff to dev-alert-engine):

- **Target option 1 (recommended):** `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`
  — Change the djb2 seed constant from `5381` to `5382` (one digit off). Effect: all fingerprints
  produced by `BuildKey` are wrong → `dedup-key-builder-golden.json` fails (expected fingerprint
  does not match). Dashboard `dedup-key-builder` card RED.

- **Target option 2:** `apps/alert-engine/pkg/primitive/cooldown-gate/gate.go`
  — Flip the cooldown window comparison from `<` to `<=` (or `>` to `>=`) in the suppression
  condition. Effect: `cooldown-gate-edge.json` scenario produces wrong suppress result.
  Dashboard `cooldown-gate` card RED.

- **Target option 3:** `apps/alert-engine/pkg/primitive/signal-classifier/classifier.go`
  — Change the `SeverityHigh` → `ChannelMarket` mapping to `ChannelWork` (wrong channel for
  "high" severity). Effect: `signal-classifier-golden.json` fails (expected channel: market, got: work).
  Dashboard `signal-classifier` card RED.

**The injection must be a SINGLE literal/operator change with a deterministic correct fix.**

**AC-1:** `alert-engine-pre-inject` tag exists on the commit BEFORE the injection:
```bash
git log --oneline -2
```
Shows injection commit on top, `alert-engine-pre-inject` tag on the commit below it.

**AC-2:** After injection commit, sandbox shows at least 1 FAIL:
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```
Exits non-zero. Paste output (evidence of FAIL state) to handoff doc `§Evidence — G10 Injection`.

**AC-3:** Dashboard shows RED for the affected primitive card after sandbox run. QA describes
dashboard state in handoff `§Evidence — G10 Dashboard RED`.

**AC-4 — Injection commit subject (do NOT reveal the primitive name in the subject line):**
```
test(alert-engine): P2-L — deliberate bug injection for G10 AI-fixability proof (alert-engine-pre-inject tagged)
```
Note: the commit body may contain details (QA documents for audit trail), but the P2-M HANDOFF
to dev-alert-engine must not include the commit SHA, the target file, or the changed literal.

**HANDOFF TO P2-M (PM assembles this for dev-alert-engine):**
```
A deliberate bug has been injected into one of the alert-engine primitives.
The sandbox shows at least 1 FAIL scenario. The dashboard shows RED for at least 1 primitive card.
Your task (P2-M): diagnose the failing primitive from the sandbox output and dashboard RED state,
fix the bug (single-literal change), verify sandbox exits 0 and dashboard shows GREEN.
You have at most 2 dispatch cycles to find and fix the bug.
Do NOT look at the P2-L injection commit details or ask QA for the target — diagnose from symptoms only.
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-M — G10 AI-Fixability Fix (≤2 Cycles, Blind) + G11 2-Trial Coupling Proof

**Owner:** dev-alert-engine (fix) + qa (cycle count + Trial-2)
**Blocked by:** P2-L DONE (bug injected, dashboard RED, pre-inject tag confirmed, HANDOFF text assembled)

**Background:** G10 and G11 are proven in sequence within this task. The fix is BLIND — dev-alert-engine
diagnoses from the failing sandbox output and RED dashboard without access to the injection spec.

#### G10 — Blind Fix of the Injected Bug (≤2 Dispatch Cycles)

dev-alert-engine receives the redacted P2-M handoff (symptoms only). The workflow:
1. Read sandbox output to identify which primitive scenario is FAILING (name + expected vs actual).
2. Inspect the failing primitive's source to find the single-literal error.
3. Fix the literal, re-run sandbox, verify exit 0.
4. Verify dashboard shows GREEN for the repaired card.

**Cycle counting:** QA counts from receipt of the redacted P2-L DONE signal to sandbox-exit-0 again.
Each dev-alert-engine dispatch = 1 cycle. Target: ≤2 cycles.

**AC-1 (G10):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0 after fix. Paste full output to handoff (≥11 scenarios PASS).

**AC-2 (G10):** Dashboard shows GREEN for the previously RED primitive card after fix and sandbox run.
Dev-alert-engine pastes dashboard state description to handoff.

**AC-3 (G10 cycle count):** QA records cycle count in `docs/handoffs/TASK_P2-M-ae-g10-g11.md`:
- Cycle count = 1 → G10 EXCEEDS baseline (1.5 system-wide per bug-inventory.json fallback)
- Cycle count = 2 → G10 MEETS baseline
- Cycle count > 2 → G10 FAILS — PM escalates to architect before Phase 3

**AC-4 — G12 DoD gate (dev-alert-engine, before RETURN block):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. Evidence pasted to handoff.

#### G11 — 2-Trial Regression Alarm Coupling Proof

**Trial-1** uses the G10 fix sequence already completed:
- QA verifies: during the G10 bug injection, ≥1 OTHER scenario (a scenario from a different
  primitive or the module tier) also went RED if the injected primitive's output feeds the module.
  Specifically: if `dedup-key-builder` was the target, the `alert-pipeline-golden.json` module
  scenario (which calls the pipeline including fingerprinting) should also FAIL — proving coupling.
- If no coupled scenario went RED (the module scenario does not exercise the affected path),
  QA notes this and uses Trial-2 to prove coupling on a different primitive pair.
- Single-edit fix (the one-literal revert) must repair ALL coupled REDs simultaneously.
- Outcome-(a): ≥1 coupled scenario went RED alongside the injected bug; single-edit fix restored
  all to GREEN. PASS.

**Trial-2** (a different primitive mutation + coupling proof — QA's choice, kept local-only or committed-then-reverted):
1. QA injects a DIFFERENT one-literal mutation into a second alert-engine primitive
   (e.g. if Trial-1 used `dedup-key-builder`, use `signal-classifier` or `cooldown-gate`).
2. Confirm: the mutated primitive's golden scenario FAILS AND ≥1 module-level or coupled scenario
   also fails (coupling proof — the `alert_pipeline` module exercises all 3 primitives).
3. Dev-alert-engine reverts the mutation in 1 edit (or QA reverts if Trial-2 is QA-only local).
4. Sandbox exits 0 after fix. All coupled REDs resolved.
5. QA reverts Trial-2 injection (local-only or committed-then-reverted — either is acceptable as
   long as git is clean at P2-M completion).

**AC-5 (G11):** QA records both trials in `docs/handoffs/TASK_P2-M-ae-g10-g11.md`:
- `trial_1_outcome: outcome-(a)` or `trial_1_outcome: no-coupling-found + Trial-2-redone`
- `trial_2_outcome: outcome-(a)` (coupled REDs from second primitive mutation + single-edit fix)
- `g11_verdict: PASS`

QA emits `docs/signals/qa-ae-P2-M-g10-g11-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G10 and G11 evidence complete. §4.5 SSOT untouched.

---

### P2-Z — Phase 2 Close-Gate Verification (QA)

**Owner:** qa
**Blocked by:** P2-M DONE (G10 + G11 chain complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** Final Phase-2 gate. QA verifies the complete goal evidence chain before emitting
the signal that authorizes PM to transition SSOT to phase2=CLOSED and notify PO for Phase 3.
NO goal flips in this task — that is a Phase-3 PO-only event. `goalsEarned` stays 0.

**AC-1 — Sandbox all-green (Phase-2 terminal state):**
```bash
cd apps/alert-engine
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=alert-engine -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
All three exit 0. QA pastes all three outputs to close-gate doc.

**AC-2 — All 6 Phase-2 goal evidence files present:**
```bash
ls docs/handoffs/TASK_P2-D-ae-g4-evidence.md \
   docs/handoffs/TASK_P2-G-ae-g5-evidence.md \
   docs/handoffs/TASK_P2-J-ae-g8-evidence.md \
   docs/handoffs/TASK_P2-M-ae-g10-g11.md
```
All 4 files exist. G3 evidence: composition root clean per P2-H handoff. G9 evidence: PO decision
doc from P2-K. G6 evidence: finalized dashboard from P2-I handoff.

**AC-3 — G12 streak carry-forward (EARNED-PENDING re-confirmed):**
QA re-verifies: the 3 Phase-1 streak tasks (P1-B1, P1-B2, P1-B3) each have sandbox-green evidence
in their Phase-1 handoff docs. Every Phase-2 dev task (P2-B, P2-F, P2-H, P2-I, P2-M) has
sandbox-green evidence pasted to its handoff. G12 DoD gate was applied on every qualifying task.
Records `g12_streak_carryforward: CONFIRMED` in close-gate doc.

**AC-4 — Pre-revert tags all present and ordered correctly:**
```bash
git log --oneline alert-engine-pre-ci alert-engine-pre-delete alert-engine-pre-inject 2>/dev/null
```
All three tags resolve to commits (no "unknown revision" error). Tag ancestry order must be:
`alert-engine-pre-ci` ≤ `alert-engine-pre-delete` ≤ `alert-engine-pre-inject`
(each tags a commit no newer than the next in the sequence).

**AC-5 — Frozen anchor INTACT and SSOT not mutated:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```
Non-empty output (anchor is still a proper ancestor of HEAD).
```bash
jq '{phase,goalsEarned,decisionMatrix}' docs/data/pilot-status-alert-engine.json
```
`goalsEarned` must still be 0. `decisionMatrix.speed`, `.trust`, `.scale`, `.verdict` must all be
`"TBD"`. `phase` must be `"1"` or updated to `"2"` by PM transition only. §4.5 untouched.

**AC-6 — ZERO-CREDS baseline re-confirmed:**
```bash
env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"
```
Empty output. Sandbox cred-free baseline is unchanged from Phase-1 close.

**Signal:**
QA emits `docs/signals/qa-ae-phase2-close-gate-<UTC>.json` with fields:
```json
{
  "pilot": "alert-engine",
  "phase": "2",
  "gate": "CLOSE-GATE",
  "sandbox_all_green": true,
  "goals_evidence_complete": ["G3","G4","G5","G6","G8","G9","G10","G11"],
  "g12_streak_carryforward": "CONFIRMED",
  "pre_revert_tags": ["alert-engine-pre-ci","alert-engine-pre-delete","alert-engine-pre-inject"],
  "anchor_intact": true,
  "ssot_not_mutated": true,
  "goals_earned": 0,
  "decision_matrix": "TBD",
  "zero_creds_baseline": "CONFIRMED",
  "next_actor": "pm",
  "next_action": "transition pilot-status-alert-engine.json phase2=CLOSED, notify PO for Phase-3 atomic close"
}
```

**G-goal posture:** NO goal flips in P2-Z. This close-gate signal authorizes PM to transition
the SSOT phase field only. PO then executes the 12/12 terminal atomic close (Phase 3) at their cadence.

---

## Goal Coverage Matrix

| G-goal | Phase-1 status | Phase-2 task(s) | Phase-2 evidence location |
|--------|---------------|-----------------|--------------------------|
| G1 | EARNED-PENDING | (no task — carry-forward) | P1-G + P2-Z AC-1 sandbox re-confirm |
| G2 | EARNED-PENDING | (no task — carry-forward) | P1-G + P2-Z AC-1 sandbox re-confirm |
| G3 | STILL-UNMET | P2-H | P2-H handoff + P2-Z AC-2 |
| G4 | STILL-UNMET | P2-A, P2-B, P2-C, P2-D | TASK_P2-D-ae-g4-evidence.md |
| G5 | STILL-UNMET | P2-E, P2-F, P2-G | TASK_P2-G-ae-g5-evidence.md |
| G6 | EARNED-PENDING | P2-I (finalization) | P2-I handoff + P2-Z AC-2 |
| G7 | EARNED-PENDING | (no task — carry-forward) | P1-E all-4-PASS + P2-Z AC-6 re-confirm |
| G8 | EARNED-PENDING | P2-J (deliberate-break proof) | TASK_P2-J-ae-g8-evidence.md |
| G9 | STILL-UNMET | P2-K | docs/po-decisions/<date>-g9-alert-engine-user-confirmation.md |
| G10 | STILL-UNMET | P2-L, P2-M | TASK_P2-M-ae-g10-g11.md |
| G11 | STILL-UNMET | P2-M | TASK_P2-M-ae-g10-g11.md |
| G12 | EARNED-PENDING | (DoD gate re-applied on each dev task) | P2-Z AC-3 streak carry-forward |

> **No goal flips are authorized by any task in this table. 12/12 terminal is a Phase-3 PO-only event.
> `goalsEarned` stays 0. `decisionMatrix` stays all-TBD. Any agent other than PO writing these fields
> is a charter §4.5 VIOLATION.**

---

## Phase 2 Exit Criteria (for QA close-gate P2-Z)

| # | Criterion | Measurement | PASS threshold |
|---|---|---|---|
| 1 | Sandbox all-green | `CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -scenario=all` exit code | 0 (≥11 scenarios PASS) |
| 2 | G4 evidence complete | AC-4a (CI job) + AC-4b (violation proof + revert) + AC-4c (freeze anchor) | All 3 present in TASK_P2-D-ae |
| 3 | G5 chain complete | G5a `_deprecated/` + G5b zero-domain-imports + G5c zero-TODO-migrat | All 3 present in TASK_P2-G-ae |
| 4 | G3 composition root clean | zero business logic, module wired, OpenAPI exists, ≤120 lines | All 3 in P2-H handoff |
| 5 | G6 dashboard finalized | deprecated notice + Phase-2 wired-state, file:// works, zero creds | P2-I handoff |
| 6 | G9 PO Playwright | ZERO console errors, all cards rendered | docs/po-decisions from P2-K |
| 7 | G10 ≤2 cycles | dev-alert-engine fixed injected bug in ≤2 dispatches (blind) | cycle_count ≤ 2 in TASK_P2-M-ae |
| 8 | G11 2-trial proof | Both trials show outcome-(a) coupling | g11_verdict=PASS in TASK_P2-M-ae |
| 9 | G12 streak carry | All Phase-2 dev tasks have sandbox-green evidence | g12_streak_carryforward=CONFIRMED |
| 10 | Anchor INTACT | debba8ea is ancestor of HEAD | git log ancestry check non-empty |

**All 10 criteria PASS → PM transitions SSOT phase2=CLOSED → PO executes Phase-3 atomic close.**

---

## G4 Fence Proof Summary (plan-level confirmation)

**The P2-C task is the G4 fence proof task.** It satisfies the requirement that the plan includes
a deliberate-violation step that proves golangci-lint exits NON-ZERO on a Fence-A violation, and
that removing the violation returns to green. Specifically:
- P2-C Step 2 = deliberate Fence-A violation injected (import of `mattn/go-sqlite3` or `pkg/infrastructure` in a primitive file)
- P2-C Step 2 = golangci-lint runs and MUST exit non-zero (if it exits 0, P2-C is BLOCKED)
- P2-C Step 3 = violation reverted immediately, `git status` clean
- P2-C Step 4 = golangci-lint runs and exits 0 (green confirmed)

"lint exit 0" alone (from P2-B) does NOT prove the fence. P2-C provides the proof.

---

## G10 Inject/Fix Blind Split Summary (plan-level confirmation)

**P2-L = injection task (QA only). P2-M = blind fix task (dev-alert-engine, symptoms only).**

The split is enforced by:
1. P2-L owns the injection and holds the injection spec in a QA-only handoff doc.
2. The P2-M handoff dispatched to dev-alert-engine contains ONLY: "a bug is in a primitive, sandbox FAIL, dashboard RED — find and fix."
3. PM assembles the P2-M handoff and must NOT include: the target file, the target function, or the changed literal.
4. QA does NOT hint at the target in any channel visible to dev-alert-engine before P2-M is complete.

---

## §4.5 Compliance Confirmation (plan-level)

**This plan does NOT instruct any agent to:**
- Flip any G-goal field in `docs/data/pilot-status-alert-engine.json`
- Write any value to `decisionMatrix.{speed,trust,scale,verdict}`
- Increment `goalsEarned`
- Populate `closedAt`, `closedBy`, or `closureSignal` on the phase2 block

All of the above are PO-only operations at Phase-3 terminal atomic close. This plan's scope ends at
P2-Z close-gate signal emission. PM transitions the SSOT `phase2.status` only (not G-goal fields).

---

## WIP Policy

**WIP=1 sequential.** PM dispatches ONE task at a time. No parallel dispatches within Phase 2.

**Rationale:** Pre-revert tags (P2-A, P2-E, P2-L) require that previous work is cleanly committed
before the tag is created. Running tasks in parallel would break the tag sequence discipline.
G10 blind-split requires that P2-L (injection) is fully committed and DONE before P2-M (blind fix)
is dispatched — any overlap would leak injection info to the fixer.

**Fleet concurrency note:** `dev-kinh-dich` (pilot 4) may be concurrently active in `apps/kinh-dich-service/`.
If `dev-alert-engine` encounters a `.git/index.lock` error: verify no git process is running across
both zones, wait 4s, retry. NEVER blindly delete the lock — confirm it is orphaned first.

---

## Open Questions (for PM)

**OQ-1 — G5a scope: `evaluate.go` rewire depth:**
`EvaluateAlertUseCase.Execute()` in `pkg/application/evaluate.go` currently calls
`domain.ComputeFingerprint`, `domain.IsDuplicate`, and `domain.ShouldSuppressAlert`. For G5a,
these calls must be replaced with `alert_pipeline` module delegation. Two options:
- **Option A:** `EvaluateAlertUseCase` is REPLACED by a thin adapter that wraps the `alert_pipeline` module.
  The application layer becomes a thin HTTP-to-module bridge. Simpler post-G3.
- **Option B:** `EvaluateAlertUseCase` is KEPT but its internal calls to deprecated domain functions
  are replaced by calls to the extracted primitive functions in `pkg/primitive/`. More surgical but
  leaves duplicate orchestration logic.

Architect recommendation: **Option A**. After G3 wires the `alert_pipeline` module in the composition
root, the `EvaluateAlertUseCase` is redundant — the module IS the use case. Option A removes the
layer confusion. Dev-alert-engine documents the decision in P2-F handoff. PM does not need to resolve
this before P2-F dispatch — dev decides at task time.

**OQ-2 — G11 Trial-2 injection: commit vs local-only:**
The Trial-2 mutation in P2-M can be local-only (never committed) or committed-then-reverted.
QA decides at task time. Either is acceptable per the grading rubric as long as git is clean
at P2-M DONE and the coupling proof is documented with evidence.

**OQ-3 — G3 composition root size:**
`cmd/server/main.go` is currently 95 lines. G3 rewire adds wiring for the `alert_pipeline` module
import. If the result exceeds 120 lines, dev-alert-engine extracts DI wiring into `cmd/server/wire.go`.
This is an execution decision — no PM action needed before P2-H dispatch.

---

## Signal to Emit on Completion (Architect → PM)

**File:** `docs/signals/architect-alert-engine-phase2-plan-done-<UTC>.json`

**Fields:**
```json
{
  "from": "architect",
  "to": "pm",
  "via": "handoff",
  "type": "phase2-task-plan-done",
  "priority": "high",
  "createdAt": "<UTC ISO>",
  "payload": {
    "pilot": "alert-engine",
    "fleet_pilot_number": 5,
    "phase": "2",
    "file": "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md",
    "task_count": 14,
    "ac_count": 69,
    "goals_advanced_map": {
      "G3": "P2-H (composition root rewire + OpenAPI)",
      "G4": "P2-A (tag) + P2-B (.golangci.yml + CI) + P2-C (fence proof) + P2-D (freeze anchor)",
      "G5": "P2-E (tag) + P2-F (git mv + rewire) + P2-G (HTTP audit)",
      "G9": "P2-K (PO Playwright Path B)",
      "G10": "P2-L (injection) + P2-M (blind fix ≤2 cycles)",
      "G11": "P2-M (2-trial coupling proof)"
    },
    "g4_fence_proof_task_id": "P2-C",
    "g4_fence_proof_description": "Deliberate Fence-A violation in pkg/primitive/ → golangci-lint must exit NON-ZERO with fence-a in output → revert → exit 0 confirmed. P2-C BLOCKED if linter exits 0 on violation (fence not enforcing).",
    "g10_inject_task_id": "P2-L",
    "g10_fix_task_id": "P2-M",
    "g10_blind_split": "P2-L injection spec REDACTED from P2-M handoff. Fixer (dev-alert-engine) receives symptoms only: sandbox FAIL + dashboard RED. No target file, no target function, no changed literal disclosed.",
    "pre_revert_tag_schedule": {
      "alert-engine-pre-ci": "P2-A Step 0 — before .golangci.yml lands",
      "alert-engine-pre-delete": "P2-E Step 0 — before git mv to _deprecated/",
      "alert-engine-pre-inject": "P2-L Step 0 — before G10 bug-injection commit"
    },
    "no_goal_flips_in_phase2": true,
    "goals_earned": 0,
    "decision_matrix": "TBD",
    "section_45_compliant": true,
    "si2_exclusion_confirmed": "docs/dashboards/index.html is stock-price-EXCLUSIVE. alert-engine MUST NOT touch. G6 = apps/alert-engine/dashboard/index.html ONLY.",
    "anchor_intact": true,
    "frozen_anchor": "debba8eaff0724d1fb32fc9d28640201cc32d1cc",
    "fleet_serialization_active": true,
    "next_actor": "pm",
    "next_action": "open alert-engine Phase 2 at its first task (P2-A) per phase-2-task-plan-go.md — dispatch dev-alert-engine for P2-A"
  }
}
```
