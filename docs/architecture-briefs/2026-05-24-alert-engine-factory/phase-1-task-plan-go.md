---
title: "Phase 1 Task Plan — Alert-Engine Microservice (Go)"
date: "2026-05-24"
author: "architect (Phase 0, alert-engine pilot-5)"
pilot: "alert-engine"
fleet_pilot_number: 5
phase: "1"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/p0-brownfield-inventory.md"
ssot_ref: "docs/data/pilot-status-alert-engine.json"
language: "Go (go1.22+cgo)"
runtime: "go1.22+cgo"
deliverable: "PHASE0-D6 (phase_1_task_plan)"
parent_pattern: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md (stock-price pilot P0-SP-6)"
service_facts_source: "docs/data/system-map.json (jq verified, never hardcoded): zone=apps/alert-engine, port=5006 (internal==external), language=go, runtime=go1.22+cgo, specialist=dev-alert-engine, DB=alert_engine.db"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc (INTACT — do NOT retag/rewrite/push)"
charter_done_signal: "docs/signals/architect-alert-engine-charter-done-20260524T040000Z.json"
---

# Phase 1 Task Plan — Alert-Engine Microservice (Go)

**Generated:** 2026-05-24 by architect (Phase 0, alert-engine pilot-5)
**Pattern:** mirrored from stock-price `phase-1-task-plan-go.md` structure; specialized for alert-engine Go native service
**Language:** Go (locked at charter creation — service is already Go/go1.22+cgo; no rewrite step)
**Headline risk:** G7 ZERO-CREDS — all 4 sub-gates must PASS (env audit + scenario JSON grep + CGO_ENABLED=0 build + edit-rerun cycle). Baked into P1-A (hard gate) and P1-B1 (ZERO-CREDS gate).
**Status:** READY-FOR-DISPATCH to dev-alert-engine

---

## Phase 1 Overview

Phase 1 delivers the **Go scaffold additions** and the **first primitive end-to-end** (`signal-classifier`),
the **ZERO-CREDS + R-CGO gate** (alert-engine's equivalent of stock-price's R-CGO hard gate), the **remaining
primitives** (`dedup-key-builder`, `cooldown-gate`, `duplicate-checker`), the **module stub** (`alert_pipeline`),
the **dashboard stub**, the **edit-rerun handler with full G7 env audit**, and the **Phase 1 close-gate**.

**Key difference from stock-price Phase 1:** alert-engine's domain is narrower (151 lines in `pkg/domain/services.go`
with 3 already-pure functions) and its headline risk is the **ZERO-CREDS boundary** rather than CGO alone. The
sandbox must build under `CGO_ENABLED=0` AND run with zero Telegram credentials in the process environment.
Both gates are hard — if either fails, Phase 1 does not close.

**alert-engine is already a running Go service** (brownfield scan 2026-05-24 — charter notebook entry). Phase 1
does NOT recreate `go.mod`, `cmd/server/main.go`, or the `pkg/` DDD layers — they already exist and are clean.
Instead, Phase 1 **adds** the factory scaffolding on top of the existing service:

- `cmd/sandbox/` (new — sandbox runner, CGO_ENABLED=0, zero Telegram credentials)
- `pkg/primitive/` (new — 3–4 primitives)
- `pkg/module/alert_pipeline/` (new — module stub)
- `dashboard/` (new — HTML trust layer, alert-engine-local only)

**Phase 1 adds NO credentials to the service.** The sandbox runs zero Telegram API calls, zero SQLite reads,
zero environment variable lookups for TELEGRAM_* vars. Scenario JSON contains only alert-domain data (tickers,
severities, signal types, fingerprints, timestamps). The infra (TelegramClient + SQLiteAlertRepository) is
wired in `cmd/server/main.go` only (composition root) — never reached from the sandbox path.

---

## Phase 1 Scope vs Prior Pilots

| Item | TA Phase 1 | Macro Phase 1 | Stock-Price Phase 1 (Go) | Alert-Engine Phase 1 (Go) |
|---|---|---|---|---|
| `go.mod` creation | YES (rewrite) | YES (rewrite) | NO — exists | **NO** — exists (go1.22+cgo) |
| `cmd/server/main.go` creation | YES | YES | NO — exists | **NO** — exists (clean) |
| `pkg/` DDD scaffold | YES | YES | NO — exists | **NO** — exists (all 4 layers) |
| `cmd/sandbox/` creation | YES | YES | YES | **YES** — new addition |
| `pkg/primitive/` creation | YES (5 prims) | YES (1 prim) | YES (3 prims) | **YES** (3–4 prims — P1-B1..P1-B3 + optional P1-B4) |
| Module stub | YES | YES | YES (`price_resolution`) | **YES** (1 module: `alert_pipeline`) |
| Dashboard stub | YES | YES | YES | **YES** (alert-engine-local ONLY) |
| R-CGO gate | N/A | N/A | YES — HARD GATE | **YES** — same mechanism (mattn/go-sqlite3 in infra) |
| ZERO-CREDS gate | N/A | N/A | N/A | **YES — HEADLINE RISK** (Telegram credentials must not appear in sandbox env, scenario JSON, or primitive/module path) |
| Phase 2 pre-revert tags | deferred | deferred | deferred | **deferred** — Phase 2 creates alert-engine-pre-ci / -pre-delete / -pre-inject |
| Golangci depguard fences | deferred | deferred | deferred | **deferred** — Phase 2 enforces; Phase 1 scaffolds only |

**Duration:** 2–3 sprints (11–14 dev-hours estimated)
**Owner:** dev-alert-engine
**WIP:** 1 sequential (charter wip_limit)

---

## Pre-Revert Tags (Phase 1 scope)

Phase 1 only scaffolds new directories — no deletion, no CI activation, no fence enforcement. The three
pre-revert tags are Phase 2 responsibilities:

| Tag | Phase | Who creates | Purpose |
|---|---|---|---|
| `alert-engine-pre-ci` | Phase 2 — before `.golangci.yml` creation + CI job wiring | dev-alert-engine | G4 fence freeze anchor (L5) |
| `alert-engine-pre-delete` | Phase 2 — before `git mv` of superseded domain logic to `_deprecated/` | dev-alert-engine | G5a rollback anchor (L5) |
| `alert-engine-pre-inject` | Phase 2 — before G10 bug-injection commit | qa | G10 rollback anchor (L5) |

PM must reference these tags in all Phase 2 handoff specs. None are created in Phase 1.

**Note:** Phase 2 will author all three tags as the FIRST ACTION of the respective gate task (P2-A, P2-E, P2-L
in the stock-price Phase 2 pattern). Phase 1 task plan only documents their existence as a Phase 2 obligation.

---

## ZERO-CREDS + R-CGO Calibration (Binding for Every Phase 1 Task)

The charter §ZERO-CREDS Boundary Clause and §CGO Boundary Clause bind ALL Phase 1 tasks that produce
sandbox-runnable artefacts. Every such task must satisfy:

**ZERO-CREDS sub-gates (ALL four required for any task to declare DONE):**
1. `env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"` returns empty when
   run inside the sandbox process context.
2. `grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/` returns 0.
3. `CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/` exits 0.
4. Edit→rerun→updated-trace cycle works (proven in P1-E; subsequent tasks inherit).

**Fence-A pre-checks (every primitive task):**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface" \
  apps/alert-engine/pkg/primitive/
```
Must return 0.

**Fence-B pre-checks (module task):**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure" apps/alert-engine/pkg/module/alert_pipeline/
```
Must return 0.

**G12 DoD gate (every task producing sandbox-runnable artefacts):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0 BEFORE dev-alert-engine writes the RETURN block. Paste output to handoff doc.

---

## 3-Band Primitive Calibration

Charter §G1 calibration: **3-4 primitives** is the calibrated band for alert-engine (narrowest domain
in the fleet — `pkg/domain/services.go` is 151 lines with 3 pure functions). The selection below
maps directly from the brownfield scan and is confirmed by the charter's candidate list.

**Core 3 (mandatory — Phase 1 minimum):**

| # | Primitive | Extracted from | Pure logic |
|---|---|---|---|
| 1 | `signal-classifier` | `pkg/domain/models.go` `AlertSeverity.IsValid()` + severity→channel routing inlined in `application/evaluate.go` L126-130 | Given severity string → (AlertSeverity constant, TelegramChannel). Pure string/switch, zero I/O. |
| 2 | `dedup-key-builder` | `pkg/domain/services.go` `ComputeFingerprint` + `djb2Hash` (L17-42) | Given stock + signalTypes + message → deterministic fingerprint string. Already pure — extract verbatim. |
| 3 | `cooldown-gate` | `pkg/domain/services.go` `ShouldSuppressAlert` (L71-138) | Given AlertRequest + []StoredAlert + CooldownConfig + now (injected param) → SuppressResult{Suppress, Reason}. Inject `now time.Time` instead of `time.Now()` call for determinism. |

**Optional 4th (P1-B4, if Phase 1 time allows):**

| # | Primitive | Extracted from | Pure logic |
|---|---|---|---|
| 4 | `duplicate-checker` | `pkg/domain/services.go` `IsDuplicate` (L143-150) | Given fingerprint string + []string → bool. 8 lines — trivially pure. Wrap for scenario coverage. |

`alert-formatter` (the `fmt.Sprintf("[%s] %s: %s", ...)` inlined in `evaluate.go` L130) is DEFERRED
to Phase 2 if the core-3 band is sufficient for G1 calibration. dev-alert-engine picks the final set
in Phase 0 brownfield confirmation and documents the decision in the `p0-brownfield-inventory.md`.

**Minimum scenario count (core-3 band):** 3 primitives × 3 scenarios each = 9 files minimum.
Charter requires ≥1 failure scenario per primitive.

---

## Task Ledger

| ID | Title | Owner | Goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|----------------|--------|------------|-----|----------|
| **P1-A** | `cmd/sandbox/main.go` — sandbox runner (CGO_ENABLED=0, zero-creds, flags: -tier, -module, -scenario) + **ZERO-CREDS hard gate** | dev-alert-engine | G7, G12 | P1-B1 | — | 1h | 7 |
| **P1-B1** | Extract first primitive: `pkg/primitive/signal-classifier/` + 3 scenario JSONs + **ZERO-CREDS gate** (G7 sub-gate-1/2/3) | dev-alert-engine | G1, G7, G12 | P1-B2 | P1-A | 1.5h | 8 |
| **P1-B2** | Extract second primitive: `pkg/primitive/dedup-key-builder/` + 3 scenario JSONs | dev-alert-engine | G1, G7, G12 | P1-B3 | P1-B1 | 1h | 6 |
| **P1-B3** | Extract third primitive: `pkg/primitive/cooldown-gate/` + 3 scenario JSONs | dev-alert-engine | G1, G7, G12 | P1-C | P1-B2 | 1.5h | 7 |
| **P1-B4** | (Optional flex) Extract fourth primitive: `pkg/primitive/duplicate-checker/` + 3 scenario JSONs | dev-alert-engine | G1 | P1-C | P1-B3 | 45m | 4 |
| **P1-C** | Module stub: `pkg/module/alert_pipeline/` — ports + composition (AlertRepositoryPort, MutePort, TelegramPort injected; primitives called) | dev-alert-engine | G2, G12 | P1-D | P1-B3 (or P1-B4) | 1.5h | 7 |
| **P1-D** | Dashboard stub: `apps/alert-engine/dashboard/index.html` — 3 panels (primitives, module, microservice), NOT-RUN state | dev-alert-engine | G6, G8, G9, G12 | P1-E | P1-C | 2h | 7 |
| **P1-E** | Edit-rerun handler + full G7 env audit (zero Telegram creds, zero CGO in sandbox — all 4 G7 sub-gates) | dev-alert-engine | G7, G8, G12 | P1-G | P1-D | 1.5h | 7 |
| **P1-G** | Phase 1 close-gate verification (QA) — sandbox all-green, dashboard ≥90%, G12 streak confirmed, ZERO-CREDS audit clean | qa | G1, G2, G6, G7, G8, G12 | — | P1-E | 30m | 6 |

**Total atomic tasks:** 9 (P1-A through P1-G; P1-B4 is optional)
**Total estimated effort:** ~11–13 dev-hours (single agent, WIP=1)
**Total AC count: 59** (A:7 + B1:8 + B2:6 + B3:7 + B4:4 + C:7 + D:7 + E:7 + G:6)
*(If P1-B4 is skipped: 55 ACs across 8 tasks)*

---

## Goals Advanced Map (Phase 1)

| G-goal | Touched in Phase 1 | Expected end-of-Phase-1 posture | Phase 2 scope |
|--------|-------------------|--------------------------------|---------------|
| G1 — Primitives ship with scenarios | P1-B1, P1-B2, P1-B3 (P1-B4 optional) | EARNED-PENDING (≥3 primitives, ≥9 scenarios, sandbox green) | Possible 4th–5th primitive addition if Phase 0 confirms alert-formatter |
| G2 — Module composes primitives via ports | P1-C | EARNED-PENDING (alert_pipeline stub, multi-primitive scenario, Fence-B clean) | Module wired into composition root (Phase 2 G3) |
| G3 — Clean composition root | — | STILL-UNMET | Phase 2 task (P2-H equivalent) |
| G4 — Architecture fence enforced | — | STILL-UNMET | Phase 2 tasks (P2-A pre-ci tag, P2-B .golangci.yml, P2-C violation proof, P2-D freeze anchor) |
| G5 — Domain leak deleted + HTTP rewire | — | STILL-UNMET | Phase 2 tasks (P2-E pre-delete tag, P2-F git mv, P2-G MCP audit) |
| G6 — 3-level dashboard renders | P1-D | EARNED-PENDING (stub with 3 panels, NOT-RUN state honest) | Phase 2 finalization (add deprecated notice, G5a note) |
| G7 — Edit-JSON-and-rerun (ZERO CREDS, ZERO CGO) | P1-A (sub-gates 1+2+3), P1-E (all 4 sub-gates) | EARNED-PENDING (all 4 G7 sub-gates demonstrated) | Phase 2 re-confirm at close-gate |
| G8 — Honest-red contract | P1-D + P1-E | EARNED-PENDING (NOT-RUN honest at stub phase; deliberate-corrupt proof = Phase 2 P2-J) | Phase 2 deliberate-break proof (P2-J) |
| G9 — Dashboard trust contract | P1-D | NOT-STARTED (dashboard must exist and be finalised first) | Phase 2 PO Playwright (P2-K) |
| G10 — AI fixes primitive bug ≤2 cycles | — | STILL-UNMET | Phase 2 (P2-L bug injection, P2-M fix + 2-trial) |
| G11 — Regression alarm bell | — | STILL-UNMET | Phase 2 (P2-M trial coupling) |
| G12 — Dev flow requires dashboard-green before done (3-task streak) | P1-B1 (#1), P1-B2 (#2), P1-B3 (#3) | EARNED-PENDING after 3-task streak | QA re-confirms streak at Phase 2 P2-Z close-gate |

> **NO goal flips in Phase 1.** Task completion marks goals as EARNED-PENDING posture (internal tracking
> only). `goalsEarned` stays 0. All G-goal fields in `docs/data/pilot-status-alert-engine.json` stay `TBD`.
> PO flips goals to YES only at 12/12 terminal atomic close in Phase 3. §4.5 matrix-authorship rule is
> binding and inviolable. Any agent other than PO touching G-goal fields or `decisionMatrix` is a
> charter §4.5 VIOLATION.

---

## Per-Task Acceptance Criteria

---

### P1-A — `cmd/sandbox/main.go` + ZERO-CREDS Hard Gate

**Owner:** dev-alert-engine
**Blocked by:** — (first Phase 1 task)
**Files touched:**
- `apps/alert-engine/cmd/sandbox/main.go` (CREATE)

**Background:** The sandbox runner drives all G7, G8, G12 verification. It MUST build under `CGO_ENABLED=0`
AND run with zero Telegram credentials in process env. The sandbox imports ONLY `pkg/primitive/*` and
`pkg/module/*` — never `pkg/infrastructure/` (which contains `telegram.go` with `net/http` client calls
and `sqlite.go` with `mattn/go-sqlite3`). Scenario JSON files stand in for all live data (alert payloads
and recent-alerts state). No real SQLite reads, no real Telegram dispatches.

The sandbox flags mirror the proven stock-price / kinh-dich pattern:
```
-tier   : primitive | module | all
-module : alert-engine
-scenario: all | <path-to-json>
```

**AC-1:** Sandbox accepts three flags: `-tier` (values: `primitive` | `module` | `all`),
`-module` (value: `alert-engine`), `-scenario` (values: `all` | path to a specific JSON file).
Evidence: run `cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox --help` (or equivalent)
and paste flag description to handoff.

**AC-2:** Scenario JSON files are loaded from `docs/scenarios/alert-engine/primitives/` (for
`-tier=primitive`) or `docs/scenarios/alert-engine/module/` (for `-tier=module`). Zero live HTTP
calls, zero SQLite connections, zero Telegram API calls.

**AC-3:** Exits 0 if all loaded scenarios pass; exits non-zero if any scenario fails. Prints per-scenario
PASS/FAIL summary to stdout.

**AC-4 — Zero-credential audit (ZERO-CREDS sub-gate-2: sandbox source grep):**
```bash
grep -c "TELEGRAM\|BOT_TOKEN\|CHAT_ID\|TOKEN\|SECRET\|API_KEY\|PASSWORD" \
  apps/alert-engine/cmd/sandbox/main.go
```
Must return 0. Evidence pasted into handoff.

**AC-5 — Zero-infra import audit (Fence-A pre-check, sandbox):**
```bash
grep -rn "pkg/infrastructure\|mattn/go-sqlite3\|pkg/application\|pkg/interface" \
  apps/alert-engine/cmd/sandbox/
```
Must return 0. Evidence pasted into handoff.

**AC-6 — R-CGO hard gate (CGO_ENABLED=0 build — ZERO-CREDS sub-gate-3):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/
```
Exits 0. If this fails (because a transitive import reaches `mattn/go-sqlite3`), P1-A is BLOCKED —
investigate the import chain. Do NOT proceed to P1-B1 until this passes. Paste build output to handoff.

**AC-7 — Env audit baseline (ZERO-CREDS sub-gate-1):**
```bash
env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"
```
Run in the same shell context that runs the sandbox. Must return empty. Paste output (or confirmation
of empty output) to handoff. This is the baseline proof that the dev environment does not leak
Telegram credentials into the sandbox process.

**Hard gate:** AC-6 (CGO_ENABLED=0 build) AND AC-7 (env audit empty) MUST BOTH PASS before P1-B1
is dispatched. If either fails, P1-A is BLOCKED. Report BLOCKED status to PM immediately.

**Commit subject pattern:**
```
feat(alert-engine): P1-A — cmd/sandbox/main.go scaffold (CGO_ENABLED=0 + zero-creds gate)
```

**G-goal posture:** NO goal flips. G7 sub-gates 1+2+3 are set up but not yet EARNED-PENDING (that
requires the edit→rerun cycle in P1-E). §4.5 SSOT untouched.

---

### P1-B1 — First Primitive: `signal-classifier` + ZERO-CREDS Gate

**Owner:** dev-alert-engine
**Blocked by:** P1-A DONE (sandbox exists, R-CGO + env audit passed)
**Files touched:**
- `apps/alert-engine/pkg/primitive/signal-classifier/classifier.go` (CREATE)
- `apps/alert-engine/pkg/primitive/signal-classifier/classifier_test.go` (CREATE)
- `docs/scenarios/alert-engine/primitives/signal-classifier-golden.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/signal-classifier-edge.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/signal-classifier-failure.json` (CREATE)

**Background:** `signal-classifier` extracts the severity→channel routing currently inlined in
`application/evaluate.go` L126-130 PLUS the `AlertSeverity.IsValid()` method in `domain/models.go`.
These are logically one primitive: given a severity string, validate it as an `AlertSeverity` constant
AND map it to the correct `TelegramChannel`. Pure string/switch, zero I/O, zero Telegram API calls.

Source locations:
- `pkg/domain/models.go` — `AlertSeverity` type + 4 constants (low/medium/high/critical) + channel
  constants (market/work/bug) + `IsValid()` method
- `pkg/application/evaluate.go` L126-130 — `channel := domain.ChannelWork; if severity == SeverityCritical || severity == SeverityHigh { channel = domain.ChannelMarket }` (inlined, no existing function)

**Exported interface:**
```go
// pkg/primitive/signal-classifier/classifier.go
package signalclassifier

// ClassifyResult holds the output of Classify.
type ClassifyResult struct {
    Severity AlertSeverity
    Channel  TelegramChannel
    Valid    bool
}

// Classify maps a severity string to its AlertSeverity constant and target TelegramChannel.
// Returns Valid=false if the severity string is not one of the four known values.
// Pure function — no I/O, no env reads.
func Classify(severityStr string) ClassifyResult
```

The `AlertSeverity` and `TelegramChannel` types and their constants are re-declared (or imported via
`pkg/domain` — Fence-A permits importing from the same service's `pkg/domain` package as it is NOT
infrastructure, application, interface, or `mattn/go-sqlite3`). Dev-alert-engine decides: if importing
`pkg/domain` keeps the primitive clean of infra, it is permitted; otherwise re-declare the tiny
constants inline. Document the decision in P1-B1 handoff.

Channel routing rule (mirror from `evaluate.go` L126-130):
- `SeverityCritical` or `SeverityHigh` → `ChannelMarket`
- `SeverityMedium` → `ChannelWork`
- `SeverityLow` → `ChannelWork`
- (BUG channel is infrastructure-side routing only — not in the pure classifier)

**Scenario JSON spec (all 3 in `docs/scenarios/alert-engine/primitives/`):**
- `signal-classifier-golden.json` — input: `{"severity": "high"}` → expected: `{"valid": true, "severity": "high", "channel": "market"}`
- `signal-classifier-edge.json` — input: `{"severity": "low"}` → expected: `{"valid": true, "severity": "low", "channel": "work"}`
- `signal-classifier-failure.json` — input: `{"severity": "INVALID"}` → expected: `{"valid": false}` (error captured in trace, not a process crash)

**AC-1:** `pkg/primitive/signal-classifier/classifier.go` exports `ClassifyResult` struct and `Classify(severityStr string) ClassifyResult`. Channel routing matches `evaluate.go` L126-130 exactly.

**AC-2:** Unit test with `go test`, ≥5 test cases:
- `"high"` → `{Severity: SeverityHigh, Channel: ChannelMarket, Valid: true}`
- `"critical"` → `{Severity: SeverityCritical, Channel: ChannelMarket, Valid: true}`
- `"low"` → `{Severity: SeverityLow, Channel: ChannelWork, Valid: true}`
- `"medium"` → `{Severity: SeverityMedium, Channel: ChannelWork, Valid: true}`
- `"INVALID"` → `{Valid: false}` (channel and severity fields set to zero values)

**AC-3:** `cd apps/alert-engine && go test ./pkg/primitive/signal-classifier/` exits 0.

**AC-4 — Fence-A: zero infra/CGO imports in primitive:**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface\|TELEGRAM\|BOT_TOKEN" \
  apps/alert-engine/pkg/primitive/signal-classifier/
```
Must return 0. Evidence pasted into handoff.

**AC-5 (sandbox green — G12 DoD Gate streak #1):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```
Exits 0. All 3 signal-classifier scenarios PASS. Paste output to handoff.

**AC-6 — ZERO-CREDS sub-gate-2 (scenario JSON grep):**
```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" \
  docs/scenarios/alert-engine/primitives/signal-classifier-golden.json \
  docs/scenarios/alert-engine/primitives/signal-classifier-edge.json \
  docs/scenarios/alert-engine/primitives/signal-classifier-failure.json
```
Must return 0. Scenario files contain only alert-domain data (severity string, expected channel, validity flag). Zero credential-shaped fields. Evidence pasted into handoff.

**AC-7 — ZERO-CREDS sub-gate-3 (CGO_ENABLED=0 build still passes after adding primitive):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/
```
Exits 0. The newly added primitive did not pull in a CGO import.

**AC-8 — G12 DoD Gate (streak task #1):** Sandbox all-green (signal-classifier tier) BEFORE RETURN
block is written. Evidence: AC-5 output pasted to handoff.

**Hard gate:** AC-4 (Fence-A clean) AND AC-6 (scenario JSON cred-free) MUST BOTH PASS before P1-B2
is dispatched. ZERO-CREDS is the HEADLINE RISK — any credential-shaped string in scenario JSON blocks
P1-B1.

**Commit subject pattern:**
```
feat(alert-engine): P1-B1 — signal-classifier primitive + 3 scenarios (G1, ZERO-CREDS gate)
```

**G-goal posture:** NO goal flips. G1 advances (first primitive landed). §4.5 SSOT untouched.

---

### P1-B2 — Second Primitive: `dedup-key-builder`

**Owner:** dev-alert-engine
**Blocked by:** P1-B1 DONE (ZERO-CREDS gate passed, sandbox green)
**Files touched:**
- `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go` (CREATE)
- `apps/alert-engine/pkg/primitive/dedup-key-builder/builder_test.go` (CREATE)
- `docs/scenarios/alert-engine/primitives/dedup-key-builder-golden.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/dedup-key-builder-edge.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/dedup-key-builder-failure.json` (CREATE)

**Background:** `dedup-key-builder` extracts `ComputeFingerprint` + `djb2Hash` from
`pkg/domain/services.go` L17-42 as a standalone primitive. The function is already pure (stdlib only:
`fmt`, `sort`, `strings`). Extract verbatim — the djb2 seed (`5381`) is a critical constant that
must match the TS port byte-for-byte per the charter. The `djb2Hash` internal helper may be made
package-private (unexported) in the primitive package; `ComputeFingerprint` (or a renamed exported
equivalent) is the public API.

**Exported interface:**
```go
// pkg/primitive/dedup-key-builder/builder.go
package dedupkeybuilder

// BuildKey produces a stable dedup fingerprint for an alert.
// stock + sorted(signalTypes) + message prefix (50 chars) → djb2 8-hex lowercase.
// Must produce byte-identical output to the TS computeFingerprint for the same inputs.
func BuildKey(stock string, signalTypes []string, message string) string
```

**djb2 constant discipline:** The seed `5381` in `djb2Hash` is a load-bearing constant — wrong seed
= wrong fingerprint = dedup failures in production. Scenario `dedup-key-builder-golden.json` uses a
known input with a pre-computed expected fingerprint (dev-alert-engine pre-computes it from the TS
implementation or from the existing Go implementation).

**Scenario JSON spec:**
- `dedup-key-builder-golden.json` — input: `{"stock": "VCB", "signalTypes": ["MACD_CROSS", "BB_BREAK"], "message": "Stop-loss triggered at 85,000"}` → expected fingerprint (pre-computed 8-hex string)
- `dedup-key-builder-edge.json` — input: `{"stock": "HPG", "signalTypes": [], "message": ""}` → expected fingerprint for empty arrays/message
- `dedup-key-builder-failure.json` — input: `{"stock": "", "signalTypes": null, "message": "test"}` → expected fingerprint for empty stock (or error captured in trace if dev decides to validate input)

**AC-1:** `pkg/primitive/dedup-key-builder/builder.go` exports `BuildKey(stock string, signalTypes []string, message string) string`. `djb2Hash` is unexported. The djb2 seed is `5381` (uint32). Sorting of signalTypes is stable (alphabetical). Message prefix = first 50 runes (Unicode-aware, matching the existing Go implementation).

**AC-2:** Unit test, ≥5 test cases:
- Known input with pre-computed expected fingerprint → output matches (golden contract)
- Signals in different order → same fingerprint as sorted order (sort-stability check)
- Empty signalTypes → known fingerprint
- Empty message → known fingerprint
- Long message (>50 runes) → fingerprint matches 50-rune prefix truncation

**AC-3:** `cd apps/alert-engine && go test ./pkg/primitive/dedup-key-builder/` exits 0.

**AC-4 — Fence-A:**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface\|TELEGRAM\|BOT_TOKEN" \
  apps/alert-engine/pkg/primitive/dedup-key-builder/
```
Must return 0.

**AC-5 — Scenario JSON cred-free (ZERO-CREDS inherited):**
```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" \
  docs/scenarios/alert-engine/primitives/dedup-key-builder-golden.json \
  docs/scenarios/alert-engine/primitives/dedup-key-builder-edge.json \
  docs/scenarios/alert-engine/primitives/dedup-key-builder-failure.json
```
Must return 0.

**AC-6 (sandbox green — G12 DoD Gate streak #2):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```
Exits 0. All scenarios across signal-classifier (P1-B1) AND dedup-key-builder (P1-B2) PASS (minimum 6 files). Paste output to handoff.

**G-goal posture:** NO goal flips. G1 advances (second primitive). §4.5 SSOT untouched.

**Commit subject pattern:**
```
feat(alert-engine): P1-B2 — dedup-key-builder primitive + 3 scenarios (G1)
```

---

### P1-B3 — Third Primitive: `cooldown-gate`

**Owner:** dev-alert-engine
**Blocked by:** P1-B2 DONE (two primitives landed, sandbox green with 6 scenarios)
**Files touched:**
- `apps/alert-engine/pkg/primitive/cooldown-gate/gate.go` (CREATE)
- `apps/alert-engine/pkg/primitive/cooldown-gate/gate_test.go` (CREATE)
- `docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/cooldown-gate-edge.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/cooldown-gate-failure.json` (CREATE)

**Background:** `cooldown-gate` extracts `ShouldSuppressAlert` from `pkg/domain/services.go` L71-138.
The key determinism issue: the existing function calls `time.Now()` internally (L77). For the primitive
to be scenario-testable (deterministic), inject `now time.Time` as a parameter instead.

The logic has two rules:
1. Cooldown window — suppress if same stock + overlapping signal type exists within `CooldownMinutes`.
2. Daily cap — suppress if `MaxAlertsPerStockPerDay` alerts have already fired for the stock today.

CRITICAL bypass: `SeverityCritical` + `ActionCode != "MACRO"` bypasses cooldown entirely.

**Exported interface:**
```go
// pkg/primitive/cooldown-gate/gate.go
package cooldowngate

// SuppressResult is the output of Check.
type SuppressResult struct {
    Suppress bool
    Reason   string
}

// AlertInput is the minimal inbound data needed for the cooldown check.
type AlertInput struct {
    Stock       string
    Severity    string  // "low" | "medium" | "high" | "critical"
    SignalTypes []string
    ActionCode  string
}

// CooldownConfig holds cooldown and daily-cap parameters.
type CooldownConfig struct {
    CooldownMinutes         int
    MaxAlertsPerStockPerDay int
}

// RecentAlert is the minimal stored alert data needed for the check.
type RecentAlert struct {
    Stocks      string
    SignalTypes  string // comma-separated
    TriggeredAt string // RFC3339 ISO 8601
}

// Check returns whether the alert should be suppressed.
// now is injected for determinism (never calls time.Now() internally).
func Check(alert AlertInput, recentAlerts []RecentAlert, cfg CooldownConfig, now time.Time) SuppressResult
```

**Scenario JSON spec (critical domain test cases):**
- `cooldown-gate-golden.json` — input: alert=`{stock:"VCB", severity:"high", signalTypes:["MACD_CROSS"], actionCode:"TA"}`, recentAlerts=`[]`, cfg=`{cooldownMinutes:30, maxAlertsPerStockPerDay:3}`, now=`"2026-05-24T10:00:00Z"` → expected: `{suppress: false, reason: ""}` (no recent alerts → pass)
- `cooldown-gate-edge.json` — input: alert with same stock + overlapping signal + recentAlert within 30min → expected: `{suppress: true, reason: "cooldown: same signal within 30min"}` (cooldown rule fires)
- `cooldown-gate-failure.json` — input: alert with `severity:"critical"` + `actionCode:"TA"` (non-MACRO) + recent alerts → expected: `{suppress: false, reason: "critical severity bypasses cooldown"}` (critical bypass fires)

**AC-1:** `pkg/primitive/cooldown-gate/gate.go` exports `SuppressResult`, `AlertInput`, `CooldownConfig`, `RecentAlert`, and `Check(...)`. `now time.Time` is a parameter (never calls `time.Now()` internally). Stdlib only: `strings`, `time`, `fmt`.

**AC-2:** Unit test, ≥7 test cases:
- Empty recentAlerts → suppress=false
- Same stock, overlapping signal, within cooldown window → suppress=true (Rule 1)
- Same stock, non-overlapping signal, within cooldown window → suppress=false (signals don't overlap)
- Same stock, daily cap exhausted (3/3 alerts today) → suppress=true (Rule 2)
- `severity="critical"`, `actionCode="TA"` → suppress=false (bypass)
- `severity="critical"`, `actionCode="MACRO"` → normal cooldown rules apply (bypass does NOT fire)
- Recent alert outside cooldown window → suppress=false (window expired)

**AC-3:** `cd apps/alert-engine && go test ./pkg/primitive/cooldown-gate/` exits 0.

**AC-4 — Fence-A:**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface\|TELEGRAM\|BOT_TOKEN\|time\.Now" \
  apps/alert-engine/pkg/primitive/cooldown-gate/
```
Must return 0 (especially `time.Now` — confirms `now` is injected, not called internally).

**AC-5 — Scenario JSON cred-free (ZERO-CREDS inherited):**
```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" \
  docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json \
  docs/scenarios/alert-engine/primitives/cooldown-gate-edge.json \
  docs/scenarios/alert-engine/primitives/cooldown-gate-failure.json
```
Must return 0. Note: scenario JSON may contain `triggeredAt` RFC3339 timestamps — these are NOT credentials.

**AC-6 — All-primitive sandbox (G12 DoD Gate streak #3):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```
Exits 0. All scenarios across signal-classifier + dedup-key-builder + cooldown-gate (minimum 9 files). Paste output to handoff. This task completes the G12 streak #3 — QA must verify this task follows the DoD rule for the third consecutive time.

**AC-7 — CGO_ENABLED=0 build still passes (third check):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/
```
Exits 0.

**G-goal posture:** NO goal flips. G1 advances (third primitive — minimum band satisfied). G12 streak #3 candidate. §4.5 SSOT untouched.

**Commit subject pattern:**
```
feat(alert-engine): P1-B3 — cooldown-gate primitive + 3 scenarios (G1 min-band, G12 streak #3)
```

---

### P1-B4 — (Optional Flex) Fourth Primitive: `duplicate-checker`

**Owner:** dev-alert-engine
**Blocked by:** P1-B3 DONE (core-3 band complete, sandbox green with 9 scenarios)
**Decision gate:** PM decides at P1-B3 close whether to dispatch P1-B4 or proceed to P1-C.

**Files touched:**
- `apps/alert-engine/pkg/primitive/duplicate-checker/checker.go` (CREATE)
- `apps/alert-engine/pkg/primitive/duplicate-checker/checker_test.go` (CREATE)
- `docs/scenarios/alert-engine/primitives/duplicate-checker-golden.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/duplicate-checker-edge.json` (CREATE)
- `docs/scenarios/alert-engine/primitives/duplicate-checker-failure.json` (CREATE)

**Background:** `IsDuplicate` from `pkg/domain/services.go` L143-150 is 8 lines. Wrapping it as a
standalone primitive adds scenario coverage for the dedup membership check, complementing the
`dedup-key-builder` (which builds the key) with a primitive that checks if a key is already known.

**Exported interface:**
```go
// pkg/primitive/duplicate-checker/checker.go
package duplicatechecker

// IsKnown returns true if fingerprint is found in recentFingerprints.
func IsKnown(fingerprint string, recentFingerprints []string) bool
```

**Scenario JSON spec:**
- `duplicate-checker-golden.json` — fingerprint in recentFingerprints → `{"is_duplicate": true}`
- `duplicate-checker-edge.json` — empty recentFingerprints → `{"is_duplicate": false}`
- `duplicate-checker-failure.json` — fingerprint is empty string + recentFingerprints contains empty string → `{"is_duplicate": true}` (or error trace if empty string is treated as invalid)

**AC-1:** `checker.go` exports `IsKnown(fingerprint string, recentFingerprints []string) bool`. Stdlib only (no imports needed for 8-line pure membership check). Zero infra, zero Telegram.

**AC-2:** Unit test, ≥4 test cases: present case, absent case, empty slice, empty string fingerprint.

**AC-3:** `cd apps/alert-engine && go test ./pkg/primitive/duplicate-checker/` exits 0.

**AC-4 — Fence-A + scenario cred-free (inherited):**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|TELEGRAM\|BOT_TOKEN" \
  apps/alert-engine/pkg/primitive/duplicate-checker/
grep -rniE "token|chat_id|bot|secret|api_key|password" \
  docs/scenarios/alert-engine/primitives/duplicate-checker-*.json
```
Both return 0.

**Note:** P1-B4 is OPTIONAL for Phase 1. If Phase 1 time is consumed by B1/B2/B3 + C/D/E, P1-B4
defers to Phase 2. PM decides at P1-B3 close. The 3-primitive core band satisfies G1 calibration.

**G-goal posture:** NO goal flips. G1 advances (optional 4th primitive). §4.5 SSOT untouched.

---

### P1-C — Module Stub: `pkg/module/alert_pipeline/`

**Owner:** dev-alert-engine
**Blocked by:** P1-B3 DONE (core-3 primitives complete + sandbox green); P1-B4 if dispatched
**Files touched:**
- `apps/alert-engine/pkg/module/alert_pipeline/ports.go` (CREATE)
- `apps/alert-engine/pkg/module/alert_pipeline/pipeline.go` (CREATE)
- `apps/alert-engine/pkg/module/alert_pipeline/pipeline_test.go` (CREATE)
- `docs/scenarios/alert-engine/module/alert-pipeline-golden.json` (CREATE)
- `docs/scenarios/alert-engine/module/alert-pipeline-edge.json` (CREATE)

**Background:** `alert_pipeline` is the single module composing the primitives via dependency-injected
ports. The pipeline story (from charter §G2):
1. classify severity → `signal-classifier` primitive
2. build fingerprint → `dedup-key-builder` primitive
3. check duplicate → via `AlertRepositoryPort` (injected infra impl in production; mock port in sandbox)
4. check cooldown → `cooldown-gate` primitive + via `AlertRepositoryPort` for recent alerts data
5. check mute → via `MutePort` (injected infra impl in production; mock port in sandbox)
6. format message → inline in module (or `alert-formatter` if extracted)
7. route to channel → via `TelegramPort` (injected infra impl in production; mock port in sandbox)

**Fence-B rule:** `pkg/module/alert_pipeline/` MUST NOT import `pkg/infrastructure/`,
`mattn/go-sqlite3`, or any Telegram client package. All I/O is via the injected port interfaces
defined in `ports.go`.

**`ports.go` — Port interfaces (re-use existing domain port definitions or define slim interfaces):**

The existing `pkg/domain/ports.go` already defines `AlertRepositoryPort`, `MutePort`, and `TelegramPort`.
Dev-alert-engine may:
- **Option A:** Import and re-export the domain ports (Fence-B allows importing `pkg/domain` since
  domain is not infrastructure, application, or interface). Simpler.
- **Option B:** Define slim module-local interfaces in `ports.go` with only the methods needed by
  the pipeline. TypeScript structural typing analog — Go uses structural interface satisfaction.

Dev-alert-engine documents the decision in the P1-C handoff.

**Module scenario JSON spec (2 in `docs/scenarios/alert-engine/module/`):**
- `alert-pipeline-golden.json` — full pipeline story: input alert with severity="high", signalTypes=["MACD_CROSS"], stock="VCB", recent alerts=[] (empty — no dedup/cooldown hit), mute=false → expected output: `{fired: true, fingerprint: "<computed>", channel: "market", reason: "alert fired"}`
- `alert-pipeline-edge.json` — pipeline with cooldown suppression: same stock + overlapping signal within 30min → expected output: `{fired: false, reason: "cooldown: same signal within 30min"}`

**Module scenario ZERO-CREDS constraint:** Scenario JSON contains only alert-domain data (tickers, severities, signal types, fingerprints, timestamps, mute=true/false). Zero credential-shaped fields.

**AC-1:** `ports.go` defines or re-exports `AlertRepositoryPort` (with `GetRecentAlerts(stock string, minutes int) ([]domain.StoredAlert, error)` and `StoreAlert(alert domain.StoredAlert) (int64, error)`), `MutePort` (with `IsStockMuted(stock string) (bool, error)`), and `TelegramPort` (with `Send(ctx context.Context, channel TelegramChannel, text string) (bool, error)`). Zero infrastructure imports.

**AC-2 — Fence-B (critical):**
```bash
grep -rn "pkg/infrastructure\|mattn/go-sqlite3\|pkg/application\|pkg/interface" \
  apps/alert-engine/pkg/module/alert_pipeline/
```
Must return 0. Module never imports infrastructure, application, or interface layers.

**AC-3 — No cross-module imports:**
```bash
grep -rn "pkg/module/" apps/alert-engine/pkg/module/alert_pipeline/
```
Must return 0 (G2 QA check pattern — no module-to-module imports).

**AC-4 — ZERO-CREDS in module (inherited):**
```bash
grep -rniE "telegram|bot_token|chat_id|token|secret|api_key" \
  apps/alert-engine/pkg/module/alert_pipeline/
```
Must return 0. The module knows about `TelegramPort` (interface) but must NOT contain any token value,
chat ID, or other credential-shaped string.

**AC-5:** Unit test uses mock implementations of `AlertRepositoryPort`, `MutePort`, and `TelegramPort`
(in-memory stubs — no real SQLite, no real Telegram API). Test covers the pipeline story:
- Happy path: classify → fingerprint → no-dedup → no-cooldown → format → route (mock telegram.Send
  called with correct channel and text).
- Dedup hit: fingerprint found in recent fingerprints → pipeline short-circuits, returns fired=false.
- Mute hit: mute=true → pipeline short-circuits, returns fired=false.

`cd apps/alert-engine && go test ./pkg/module/alert_pipeline/` exits 0.

**AC-6 — Module sandbox (multi-primitive scenario):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=alert-engine -scenario=all
```
Exits 0. Both module scenarios pass.

**AC-7 — All-tier sandbox (G12 DoD Gate):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. All primitive + module scenarios green. Paste output to handoff.

**Commit subject pattern:**
```
feat(alert-engine): P1-C — alert_pipeline module stub + 2 scenarios (G2, Fence-B)
```

**G-goal posture:** NO goal flips. G2 advances (module stub landed). §4.5 SSOT untouched.

---

### P1-D — Dashboard Stub: `apps/alert-engine/dashboard/index.html`

**Owner:** dev-alert-engine
**Blocked by:** P1-C DONE (module stub exists — all 3 panel tiers can be represented)
**Files touched:** `apps/alert-engine/dashboard/index.html` (CREATE)

**Background:** Three-panel HTML dashboard (the 3-panel standard per charter §G6). Renders from
scenario trace JSON. `file://` works with zero network calls, zero CDN, zero live DB.

**SI-2 boundary (MANDATORY):** `apps/alert-engine/dashboard/index.html` is the ONLY dashboard file
alert-engine creates. `docs/dashboards/index.html` is stock-price-EXCLUSIVE (per fleet ratification
Decision 3 and charter §Anti-Scope-Creep Clause). An explicit HTML comment to this effect MUST appear
in the dashboard source (see AC-6). alert-engine MUST NOT touch `docs/dashboards/index.html` during
any phase of this pilot.

**Three panels:**
1. **Primitives panel** — one card per extracted primitive (minimum 3: signal-classifier, dedup-key-builder,
   cooldown-gate; 4 if P1-B4 shipped)
2. **Module panel** — one card for `alert_pipeline`
3. **Microservice panel** — one card for the alert-engine service (port 5006 per system-map.json;
   displayed as a label, never hardcoded in fetch logic)

**AC-1:** File opens via `file://` in a browser without any web server. Zero external CDN requests
(no `<script src="https://...">`, no `<link rel="stylesheet" href="https://">`). Zero fetch calls
to port 5006 or any HTTP endpoint. Zero `<img src="...">` to external URLs.

**AC-2:** Three panels visible with the correct card set:
- Primitives panel: cards for `signal-classifier`, `dedup-key-builder`, `cooldown-gate` (and
  `duplicate-checker` if P1-B4 shipped) — all in NOT-RUN state
- Module panel: card for `alert_pipeline` — NOT-RUN state
- Microservice panel: card for `alert-engine` service, port 5006 cited as sourced from system-map.json

**AC-3:** Status display is honest — NOT-RUN when sandbox has not been executed. No false greens.
QA verifies by opening the HTML file cold (no prior sandbox run in the same browser session).

**AC-4 — PO Playwright pre-compatibility:**
Dashboard renders correctly when opened via `file://`:
- ZERO console errors (verified manually or via Playwright dry-run)
- All cards (3–4 primitive + 1 module + 1 microservice) are present in the DOM
- NOT-RUN status is displayed honestly

**AC-5 — Zero credentials in dashboard HTML:**
```bash
grep -c "TELEGRAM\|BOT_TOKEN\|CHAT_ID\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" \
  apps/alert-engine/dashboard/index.html
```
Must return 0.

**AC-6 — SI-2 disavowal comment baked in:**
The following HTML comment (verbatim or equivalent) MUST appear in `apps/alert-engine/dashboard/index.html`:
```html
<!-- SI-2 NOTE: This is apps/alert-engine/dashboard/index.html — alert-engine local service dashboard.
     SI-2 fleet index (docs/dashboards/index.html) is stock-price's G6 deliverable and is stock-price-EXCLUSIVE.
     alert-engine MUST NOT create or modify docs/dashboards/index.html. Do NOT merge. -->
```

**AC-7 — G12 DoD Gate:** Sandbox all-green (all scenarios: B1+B2+B3 primitives + C module) before
any primitive card is allowed to show GREEN status in the HTML. Dashboard stub shows NOT-RUN for all
cards — green state is only shown AFTER the sandbox runs and produces trace output.

**Commit subject pattern:**
```
feat(alert-engine): P1-D — dashboard stub 3-panel (G6 stub, SI-2 disavowal baked)
```

**G-goal posture:** NO goal flips. G6, G8, G9 advance (stub exists). §4.5 SSOT untouched.

---

### P1-E — Edit-Rerun Handler + Full G7 Env Audit (All 4 ZERO-CREDS Sub-Gates)

**Owner:** dev-alert-engine
**Blocked by:** P1-D DONE (dashboard exists — rerun handler is wired into dashboard HTML)
**Files touched:** `apps/alert-engine/dashboard/index.html` (MODIFY — add rerun handler button/script)

**Background:** G7 trust contract — user edits a scenario JSON (e.g., changes `cooldownMinutes` or
`signalTypes` in `cooldown-gate-golden.json`), triggers the rerun from the dashboard, sees the updated
result. The rerun handler invokes the `CGO_ENABLED=0` sandbox binary against the edited fixtures.

This task proves ALL FOUR G7 sub-gates simultaneously — it is the definitive G7 evidence collection
task for Phase 1.

**HEADLINE RISK calibration:** If any of the 4 sub-gates fail, G7 is blocked and Phase 1 cannot
close. The four sub-gates:
1. `env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"` returns empty.
2. `grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/` returns 0.
3. Sandbox compiles under `CGO_ENABLED=0`.
4. Edit→rerun→updated-trace cycle works end-to-end.

**AC-1:** User can edit any scenario JSON (e.g., change `cooldownMinutes` from 30 to 60 in
`cooldown-gate-golden.json`), trigger the rerun from the dashboard, and see the updated sandbox output
reflected in the corresponding card. Sub-gate-4 proven.

**AC-2 — Rerun command (CGO_ENABLED=0 — sub-gate-3 re-confirmed in rerun path):**
The rerun handler invokes:
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
(or the pre-built `./bin/ae-sandbox` binary). Zero Telegram credentials in the command, zero SQLite
in the sandbox binary. Evidence: paste the exact shell command invoked by the rerun handler.

**AC-3 — Env audit (sub-gate-1 — MANDATORY G7 gate):**
```bash
env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"
```
Executed in the sandbox process context. Must return empty. Dev-alert-engine confirms and pastes the
empty output (or the raw command run + its absence of output) into the handoff. This is the PRIMARY G7
env audit proof.

**AC-4 — Sandbox source grep (sub-gate-2 — re-confirmed on complete cmd/sandbox/ dir):**
```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/
```
Must return 0 on the entire `cmd/sandbox/` directory (not just `main.go`). Evidence pasted.

**AC-5 — Zero-infra audit (Fence-A in sandbox path — end-to-end):**
```bash
grep -rn "pkg/infrastructure\|mattn/go-sqlite3\|TELEGRAM_BOT_TOKEN\|TELEGRAM_INFO" \
  apps/alert-engine/pkg/primitive/ \
  apps/alert-engine/pkg/module/ \
  apps/alert-engine/cmd/sandbox/
```
Must return 0 matches.

**AC-6:** QA verifies the edit-rerun cycle independently: QA edits `cooldown-gate-edge.json` (changes
the `stock` field to a different ticker), triggers the rerun, confirms the sandbox re-runs with the
modified fixture and the dashboard reflects the change. Evidence: QA pastes the before/after terminal
output to the handoff.

**AC-7 — G12 DoD Gate (all-tier, end-of-phase check):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. All primitive + module scenarios green after the rerun handler edit. No false greens. Evidence
pasted to handoff.

**Commit subject pattern:**
```
feat(alert-engine): P1-E — edit-rerun handler + G7 env audit (ZERO-CREDS all 4 sub-gates)
```

**G-goal posture:** NO goal flips. G7 = all 4 sub-gates EARNED-PENDING (definitive Phase 1 evidence).
G8 evidence advances (honest-red will be fully proven in Phase 2 P2-J). §4.5 SSOT untouched.

---

### P1-G — Phase 1 Close-Gate Verification (QA)

**Owner:** qa
**Blocked by:** P1-E DONE (edit-rerun handler + G7 all-4 sub-gates proven)
**Files touched:** none (read-only audit + signal emit)

**Background:** QA verifies the complete Phase 1 evidence chain before emitting the close-gate signal
that authorizes PM to transition SSOT to phase1=READY_FOR_CLOSE_GATE and notify PO. NO goal flips
in this task — the SSOT stays unchanged. PO dispatches Phase 2 based on the exit criteria below.

**AC-1 — Sandbox all-green (Phase 1 terminal state):**
```bash
cd apps/alert-engine
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=alert-engine -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
All three exit 0. QA pastes all three outputs to the close-gate evidence doc.

**AC-2 — Dashboard ≥90%:**
QA opens `apps/alert-engine/dashboard/index.html` via `file://`. Confirms all primitive cards
(3 or 4) + module card + microservice card are rendered with expected states.
- If P1-B4 shipped (4 primitives): 4 + 1 + 1 = 6 cards expected; ≥90% = ≥5/6 rendered.
- If P1-B4 skipped (3 primitives): 3 + 1 + 1 = 5 cards expected; ≥90% = ≥5/5 rendered.
Zero console errors. Dashboard opens cold (no prior sandbox run in session).

**AC-3 — G12 streak confirmed (3/3 tasks):**
QA verifies that P1-B1, P1-B2, and P1-B3 each have sandbox-green evidence in their handoff docs.
Each of the three tasks must have followed the DoD Gate rule (sandbox all-green before RETURN block).
Records `g12_streak: 3/3 CONFIRMED` in the P1-G signal.

**AC-4 — G7 ZERO-CREDS chain verified:**
QA confirms that the handoff for P1-E contains all 4 G7 sub-gate proofs:
- Sub-gate-1: env audit output (empty)
- Sub-gate-2: sandbox grep output (zero credential strings)
- Sub-gate-3: CGO_ENABLED=0 build exit code 0
- Sub-gate-4: edit→rerun cycle QA verification output
Records `g7_zero_creds: ALL-4-PASS` in the close-gate signal.

**AC-5 — Fence-A clean across all primitives:**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface" \
  apps/alert-engine/pkg/primitive/
```
Must return 0. QA pastes output as evidence.

**AC-6 — Phase 1 close-gate signal emitted:**
QA emits `docs/signals/qa-alert-engine-phase1-close-gate-<UTC>.json` with fields:
```json
{
  "pilot": "alert-engine",
  "phase": "1",
  "gate": "CLOSE-GATE",
  "sandbox_all_green": true,
  "dashboard_render_pct": 100,
  "g12_streak": "3/3 CONFIRMED",
  "g7_zero_creds": "ALL-4-PASS",
  "fence_a_clean": true,
  "p1b4_shipped": true_or_false,
  "primitive_count": 3_or_4,
  "scenario_count": 9_or_12,
  "anchor_intact": true,
  "phase1_gate": "GO",
  "next_actor": "pm",
  "next_action": "transition pilot-status-alert-engine.json phase1=READY_FOR_CLOSE_GATE, notify PO for Phase-2 authorization"
}
```

**G-goal posture:** NO goal flips. The close-gate signal authorizes PM to transition the SSOT phase
field. PO authorizes Phase 2 based on the exit criteria verdict.

---

## Phase 1 Exit Criteria

| # | Criterion | Measurement | GO threshold |
|---|---|---|---|
| 1 | **Time to first primitive** | Wall-clock from P1-A dispatch to P1-B1 DONE signal | ≤ 4 agent-hours |
| 2 | **Sandbox all-green** | `CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -scenario=all` exit code | 0 (all scenarios PASS) |
| 3 | **Dashboard ≥90%** | Panels rendered / panels expected × 100 | ≥ 90% |
| 4 | **G12 earned (3/3 streak)** | QA counts consecutive DoD-Gate-satisfied tasks | 3/3 verified (P1-B1/B2/B3) |
| 5 | **G7 ZERO-CREDS all-4 pass** | All 4 sub-gates proven in P1-E handoff | env audit empty + scenario grep 0 + CGO_ENABLED=0 build exit 0 + edit→rerun cycle works |

**GO** = all 5 criteria met → PO authorizes Phase 2.
**CONDITIONAL GO** = 4 of 5 met (except criterion 5) → BLOCKED — G7 is a hard gate; Phase 2 cannot
start until all 4 ZERO-CREDS sub-gates are proven. Architect re-investigates sandbox design.
**NO-GO** = ≤3 criteria met → architect re-plans Phase 2 scope. Do not start Phase 2.

> **G7 is non-negotiable.** If any ZERO-CREDS sub-gate fails at Phase 1 close, Phase 1 is CONDITIONAL-HOLD
> regardless of all other criteria passing.

---

## Critical Path

```
P1-A (sandbox runner — CGO_ENABLED=0 hard gate + env audit baseline — BLOCKER)
  ↓  [AC-6 + AC-7 MUST PASS before P1-B1 dispatched]
P1-B1 (first primitive: signal-classifier + ZERO-CREDS gate — G12 streak #1)
  ↓  [ZERO-CREDS AC-4 + AC-6 MUST PASS before P1-B2 dispatched]
P1-B2 (second primitive: dedup-key-builder — G12 streak #2)
  ↓
P1-B3 (third primitive: cooldown-gate — G12 streak #3, core-3 band complete)
  ↓  [PM decision: dispatch P1-B4 or skip to P1-C]
[P1-B4] (optional: duplicate-checker 4th primitive)
  ↓
P1-C (module stub: alert_pipeline — AlertRepositoryPort + MutePort + TelegramPort ports, Fence-B)
  ↓
P1-D (dashboard stub — 3 panels, NOT-RUN, SI-2 disavowal comment baked in)
  ↓
P1-E (edit-rerun handler + G7 env audit — all 4 ZERO-CREDS sub-gates proven)
  ↓
P1-G (QA close-gate verification — 5 exit criteria, phase1 gate signal)
```

**WIP=1 enforced throughout.** PM dispatches ONE task at a time. Next task dispatched only after
current task DONE signal received and recorded. No parallel dispatches within Phase 1.

**ZERO-CREDS is the Phase 1 critical information gate.** If P1-A's env audit or CGO_ENABLED=0 build
fails, the entire Phase 1 is BLOCKED. Report BLOCKED immediately; do NOT continue to P1-B1.

---

## G12 DoD Gate Rule (Day-0 — from TA pilot cc7578f1 + macro + stock-price + kinh-dich carry-over)

**Hard rule — blocks DONE declaration on every task that produces sandbox-runnable artefacts.**

Do not mark task DONE until sandbox shows all scenarios green:
```bash
cd apps/alert-engine
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=alert-engine -scenario=all
```
Both must exit 0 with all scenarios GREEN (run whichever tiers exist at that task's point in the
sequence — P1-B1 runs primitive tier only; P1-C runs both). Paste sandbox output summary into handoff
doc before writing RETURN block.

**G12 streak tasks** (first 3 qualifying tasks after DoD Gate installed):
- Streak #1 = P1-B1 (first primitive — sandbox primitive tier green)
- Streak #2 = P1-B2 (second primitive — all primitive scenarios green, 6 files)
- Streak #3 = P1-B3 (third primitive — all 9+ primitive scenarios green, G12 streak complete candidate)

QA verifies all 3 handoff docs contain sandbox-green evidence before declaring G12=EARNED-PENDING.

---

## Hard Constraints (Every Task Inherits All)

| Constraint | Rule |
|---|---|
| **G12 DoD gate** | `CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all` exits 0 BEFORE DONE on every task that produces sandbox-runnable artefacts |
| **Fence-A** | `pkg/primitive/*/` imports stdlib only — no module, application, interface, infrastructure, no `mattn/go-sqlite3`, no Telegram client |
| **Fence-B** | `pkg/module/*/` imports primitives + stdlib + domain only — no application, infrastructure, interface, no `mattn/go-sqlite3`, no credential-shaped strings |
| **ZERO-CREDS boundary** | TELEGRAM_BOT_TOKEN, TELEGRAM_INFO_MARKET_GROUP_ID, TELEGRAM_INFO_WORK_CHANNEL_ID, TELEGRAM_REPORT_BUG_CHANNEL_ID MUST NOT appear in primitive/module/sandbox paths or scenario JSON. Any hit blocks G7. |
| **CGO sandbox fence** | `CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/` exits 0 on every task that touches sandbox |
| **SI-2 boundary** | `docs/dashboards/index.html` MUST NOT be created, modified, or read by alert-engine. alert-engine's G6 = `apps/alert-engine/dashboard/index.html` only. |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source/CI files |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor before AND after every commit. Verify with `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD \| tail -1` |
| **SSOT freeze** | Do NOT modify `docs/data/pilot-status-alert-engine.json` goal fields or decisionMatrix — PM-owned transition only |
| **Charter §4.5** | `decisionMatrix.{speed,trust,scale}` stays `TBD`. PO-only authorship at 12/12 terminal in Phase 3 |
| **Fleet serialization** | INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION — verify `git diff --cached --name-only` clear of foreign paths before staging. NEVER `git reset HEAD` a foreign path. |
| **Out-of-zone ban** | Do NOT modify `apps/technical-analysis/`, `apps/macro-indicators/`, `apps/stock-price/`, `apps/kinh-dich-service/`, their closed/active SSOTs, or any other microservice zone |

---

## WIP Policy

**WIP=1 sequential.** PM dispatches ONE task at a time. dev-alert-engine works through P1-A → P1-G
in the order above. No parallel dispatches within Phase 1.

**Rationale:** The primitive extraction tasks are a learning + validation sequence. Running them in
parallel would mask ZERO-CREDS violations in scenario JSON and make fence-breach discovery harder.
The G12 streak requires sequential task completion — tasks must be discrete to count as streak entries.

**Fleet concurrency note:** `dev-kinh-dich` (pilot 4) and `dev-stock-price` (pilot 3) may be
concurrently active in their respective zones. If `dev-alert-engine` encounters a `.git/index.lock`
error: verify no git process is running across zones, wait 4s, retry. NEVER blindly delete the lock —
confirm it is orphaned first (check `ls -la .git/index.lock` modtime vs running processes).

---

## Execution Notes (Fleet-Wide Serialization)

**INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION is active at Phase 1 dispatch.** This means:
- Only ONE pilot's developer may stage and commit at any given moment.
- Before staging any file, run `git diff --cached --name-only` and confirm it is empty (no foreign
  staged paths from another pilot's concurrent work).
- NEVER run `git reset HEAD <foreign-path>` — if a foreign path appears staged, STOP and signal the
  PM immediately. The main-router coordinates serialization.
- All dev-alert-engine commits must be on `main` (NO branches — per CLAUDE.md).

**Pre-revert tags are Phase 2 (not created in Phase 1).** PM must reference the Phase 2 tag schedule
when authoring the Phase 2 plan:
- `alert-engine-pre-ci` — created at the start of the Phase 2 G4 fence task
- `alert-engine-pre-delete` — created at the start of the Phase 2 G5a deletion task
- `alert-engine-pre-inject` — created at the start of the Phase 2 G10 bug injection task

---

## Open Questions (for PM at Phase 1 kickoff)

**OQ-1 — `signal-classifier`: import `pkg/domain` or re-declare types inline?**

Two options, both Fence-A compliant:
- **Option A:** Import `pkg/domain` package types (AlertSeverity, TelegramChannel) from the domain layer.
  Since `pkg/domain` has zero infra imports (confirmed by brownfield scan), this does not violate Fence-A.
- **Option B:** Re-declare the 4 severity constants + 3 channel constants inline in the primitive package.
  Avoids any cross-package import entirely; primitive is fully standalone.

Option A is simpler (no duplication). Option B is cleaner for true isolation. Dev-alert-engine decides
and documents in P1-B1 handoff. PM does not need to resolve this before dispatch.

**OQ-2 — P1-B4 dispatch decision:**
After P1-B3 DONE, PM decides whether to dispatch `duplicate-checker` (P1-B4) or proceed directly to
the module stub (P1-C). Criteria: (a) is Phase 1 time budget within 2–3 sprints? (b) does the 4th
primitive add meaningful scenario coverage beyond what `dedup-key-builder` already covers? Architect
recommendation: proceed to P1-C if Phase 1 is at sprint 2+ — `duplicate-checker` is trivial and can
be extracted in Phase 2 if needed. Core-3 band satisfies G1 calibration.

**OQ-3 — `cooldown-gate` RecentAlert struct: re-use `domain.StoredAlert` or define slim struct?**

The `ShouldSuppressAlert` function in `domain/services.go` takes `[]StoredAlert` (domain type). For
the primitive:
- **Option A:** Import `pkg/domain.StoredAlert` in the primitive (same reasoning as OQ-1 Option A — domain
  is not infra).
- **Option B:** Define a slim `RecentAlert{Stocks, SignalTypes, TriggeredAt string}` inline in the
  primitive (the only fields needed for the cooldown check — ID, Fingerprint, Severity, SentToTelegram
  are not needed by the pure logic).

Option B is recommended: the primitive should only depend on what it actually needs, which is 3 fields.
This makes the scenario JSON fixture format minimal. Dev-alert-engine documents in P1-B3 handoff.

**OQ-4 — Sandbox trace JSON format:**
The sandbox reads scenario JSON files and compares actual output to expected output. What is the
exact trace format? Architect recommendation: mirror the stock-price sandbox pattern — each scenario
JSON has:
```json
{
  "primitive": "signal-classifier",
  "input": { ... },
  "expected": { ... }
}
```
The sandbox reads `input`, calls the primitive function, compares output to `expected`, prints PASS/FAIL.
Dev-alert-engine owns the exact format; it must be consistent across all primitives and the module.

---

## Goal Coverage Matrix (Phase 1 Posture at Close-Gate)

| G-goal | Phase 1 task(s) | End-of-Phase-1 posture | Phase 2 tasks (planned) |
|--------|----------------|------------------------|-------------------------|
| G1 | P1-B1, P1-B2, P1-B3 (P1-B4 opt.) | EARNED-PENDING | alert-formatter optional 5th prim |
| G2 | P1-C | EARNED-PENDING | G3 composition root wiring |
| G3 | — | STILL-UNMET | Phase 2 composition root task |
| G4 | — | STILL-UNMET | Phase 2 pre-ci tag + .golangci.yml + violation proof + freeze anchor |
| G5 | — | STILL-UNMET | Phase 2 pre-delete tag + git mv + MCP audit |
| G6 | P1-D | EARNED-PENDING (stub) | Phase 2 finalization (deprecated notice) |
| G7 | P1-A + P1-E | EARNED-PENDING (all 4 sub-gates) | Phase 2 re-confirm at P2-Z |
| G8 | P1-D + P1-E | EARNED-PENDING (honest NOT-RUN; deliberate-break proof = Phase 2) | Phase 2 P2-J honest-red proof |
| G9 | — | NOT-STARTED | Phase 2 P2-K PO Playwright |
| G10 | — | STILL-UNMET | Phase 2 P2-L injection + P2-M fix |
| G11 | — | STILL-UNMET | Phase 2 P2-M 2-trial coupling proof |
| G12 | P1-B1, P1-B2, P1-B3 | EARNED-PENDING (3/3 streak) | QA re-confirms at P2-Z close-gate |

**No goal flips are authorized by any task in this table. 12/12 terminal is a Phase-3 PO-only event.**

---

## Signal to Emit on Completion (Architect → PM)

**File:** `docs/signals/architect-alert-engine-phase1-plan-done-<UTC>.json`

**Fields:**
```json
{
  "from": "architect",
  "to": "pm",
  "via": "handoff",
  "type": "phase1-task-plan-done",
  "priority": "high",
  "createdAt": "<UTC ISO>",
  "payload": {
    "pilot": "alert-engine",
    "fleet_pilot_number": 5,
    "phase": "1",
    "file": "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md",
    "task_count": 9,
    "ac_count": 59,
    "goals_advanced_map": {
      "G1": "P1-B1+B2+B3 (core-3 band) → EARNED-PENDING",
      "G2": "P1-C (alert_pipeline stub) → EARNED-PENDING",
      "G6": "P1-D (dashboard stub) → EARNED-PENDING",
      "G7": "P1-A+P1-E (all 4 sub-gates) → EARNED-PENDING",
      "G8": "P1-D+P1-E (honest NOT-RUN) → EARNED-PENDING",
      "G12": "P1-B1+B2+B3 (3-task streak) → EARNED-PENDING"
    },
    "goals_still_unmet_phase1": ["G3", "G4", "G5", "G9", "G10", "G11"],
    "goals_earned": 0,
    "decision_matrix": "TBD",
    "headline_risk": "G7 ZERO-CREDS — all 4 sub-gates required; P1-A hard gate (env audit + CGO_ENABLED=0) must pass before P1-B1",
    "wip_policy": "WIP=1 sequential",
    "g12_streak_tasks": ["P1-B1", "P1-B2", "P1-B3"],
    "primitive_extraction_order": [
      "signal-classifier (mandatory — severity validation + channel routing)",
      "dedup-key-builder (mandatory — djb2 fingerprint)",
      "cooldown-gate (mandatory — suppress decision, inject now param)",
      "duplicate-checker (optional P1-B4)"
    ],
    "module_name": "alert_pipeline",
    "si2_exclusion_confirmed": "docs/dashboards/index.html is stock-price-EXCLUSIVE. alert-engine G6 = apps/alert-engine/dashboard/index.html ONLY.",
    "phase2_pre_revert_tags": ["alert-engine-pre-ci", "alert-engine-pre-delete", "alert-engine-pre-inject"],
    "anchor_intact": true,
    "frozen_anchor": "debba8eaff0724d1fb32fc9d28640201cc32d1cc",
    "fleet_serialization_active": true,
    "next_actor": "pm",
    "next_actor_router": "main-router",
    "next_action": "open alert-engine Phase 1 at its first task (P1-A) per phase-1-task-plan-go.md — dispatch dev-alert-engine"
  }
}
```
