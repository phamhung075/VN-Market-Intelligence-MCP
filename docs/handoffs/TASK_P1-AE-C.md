---
task_id: "P1-AE-C"
task_title: "Module Stub: alert_pipeline"
pilot: "alert-engine"
phase: "1"
phase_task_plan: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-C"
owner: "dev-alert-engine"
zone: "apps/alert-engine/"
blocked_by: "P1-B3 DONE (core-3 primitives complete + sandbox green with 9 scenarios — commit 251071bd). P1-B4 SKIPPED (optional flex; core-3 satisfies G1 minimum per plan §P1-B4)."
blocks: "P1-D"
goal_track: "A — Trust Foundation"
goals_advanced: ["G2 — Module composes primitives via ports", "G12 — Dev flow requires dashboard-green before done"]
estimated_effort: "1.5h"
ac_count: 7
wip: 1
---

# P1-C — Module Stub: `pkg/module/alert_pipeline/`

**Dispatched:** 2026-05-24 PM (after P1-B3 DONE signal verified — commit 251071bd; G1 core-3 band + G12 streak #3 COMPLETE)
**Owner:** dev-alert-engine
**Zone:** `apps/alert-engine/`
**Language:** Go (go1.22+cgo)
**Scope:** Build the single module `alert_pipeline` composing the 3 primitives via dependency-injected ports (`AlertRepositoryPort`, `MutePort`, `TelegramPort`). Module imports primitives + domain + stdlib ONLY (Fence-B). All I/O via injected port interfaces; in-memory mock ports in test/sandbox — no real SQLite, no real Telegram API.

## Background

`alert_pipeline` is the single module composing the primitives via dependency-injected ports. The pipeline story (from charter §G2):
1. classify severity → `signal-classifier` primitive
2. build fingerprint → `dedup-key-builder` primitive
3. check duplicate → via `AlertRepositoryPort` (injected infra impl in production; mock port in sandbox)
4. check cooldown → `cooldown-gate` primitive + via `AlertRepositoryPort` for recent alerts data
5. check mute → via `MutePort` (injected infra impl in production; mock port in sandbox)
6. format message → inline in module (or `alert-formatter` if extracted)
7. route to channel → via `TelegramPort` (injected infra impl in production; mock port in sandbox)

**Fence-B rule:** `pkg/module/alert_pipeline/` MUST NOT import `pkg/infrastructure/`, `mattn/go-sqlite3`, or any Telegram client package. All I/O is via the injected port interfaces defined in `ports.go`. Module may import primitives + `pkg/domain` + stdlib only.

**`ports.go` — Port interfaces (re-use existing domain port definitions or define slim interfaces):**
The existing `pkg/domain/ports.go` already defines `AlertRepositoryPort`, `MutePort`, and `TelegramPort`. Dev-alert-engine may:
- **Option A:** Import and re-export the domain ports (Fence-B allows importing `pkg/domain` since domain is not infrastructure, application, or interface). Simpler.
- **Option B:** Define slim module-local interfaces in `ports.go` with only the methods needed by the pipeline (Go structural interface satisfaction).

Dev-alert-engine documents the chosen option in this handoff's RETURN block.

---

## Files to Create

1. `apps/alert-engine/pkg/module/alert_pipeline/ports.go`
2. `apps/alert-engine/pkg/module/alert_pipeline/pipeline.go`
3. `apps/alert-engine/pkg/module/alert_pipeline/pipeline_test.go`
4. `docs/scenarios/alert-engine/module/alert-pipeline-golden.json`
5. `docs/scenarios/alert-engine/module/alert-pipeline-edge.json`

(Sandbox `cmd/sandbox/main.go` may need a `-tier=module` loader for `docs/scenarios/alert-engine/module/` if not already wired in P1-A — modify only if required to satisfy AC-6/AC-7.)

---

## Acceptance Criteria (transcribed verbatim from plan §P1-C)

### AC-1: Ports defined/re-exported, zero infra imports
`ports.go` defines or re-exports `AlertRepositoryPort` (with `GetRecentAlerts(stock string, minutes int) ([]domain.StoredAlert, error)` and `StoreAlert(alert domain.StoredAlert) (int64, error)`), `MutePort` (with `IsStockMuted(stock string) (bool, error)`), and `TelegramPort` (with `Send(ctx context.Context, channel TelegramChannel, text string) (bool, error)`). Zero infrastructure imports.

### AC-2: Fence-B (critical)
```bash
grep -rn "pkg/infrastructure\|mattn/go-sqlite3\|pkg/application\|pkg/interface" \
  apps/alert-engine/pkg/module/alert_pipeline/
```
Must return 0. Module never imports infrastructure, application, or interface layers. Paste grep output to RETURN.

### AC-3: No cross-module imports
```bash
grep -rn "pkg/module/" apps/alert-engine/pkg/module/alert_pipeline/
```
Must return 0 (G2 QA check pattern — no module-to-module imports). Paste grep output to RETURN.

### AC-4: ZERO-CREDS in module (inherited)
```bash
grep -rniE "telegram|bot_token|chat_id|token|secret|api_key" \
  apps/alert-engine/pkg/module/alert_pipeline/
```
Must return 0. The module knows about `TelegramPort` (interface) but must NOT contain any token value, chat ID, or other credential-shaped string. Paste grep output to RETURN.

> **Note:** A `TelegramPort` interface type name or a `channel`-shaped enum constant is NOT a credential. If the grep matches an interface/type name (e.g. `TelegramPort`) rather than a literal token/chat-id value, document the false-positive context in RETURN — the gate intent is zero credential *values*, never the port abstraction.

### AC-5: Unit test with mock ports (pipeline story)
Unit test uses mock implementations of `AlertRepositoryPort`, `MutePort`, and `TelegramPort` (in-memory stubs — no real SQLite, no real Telegram API). Test covers the pipeline story:
- **Happy path:** classify → fingerprint → no-dedup → no-cooldown → format → route (mock telegram.Send called with correct channel and text).
- **Dedup hit:** fingerprint found in recent fingerprints → pipeline short-circuits, returns fired=false.
- **Mute hit:** mute=true → pipeline short-circuits, returns fired=false.

```bash
cd apps/alert-engine && go test ./pkg/module/alert_pipeline/
```
Exits 0. Paste test output to RETURN.

### AC-6: Module sandbox (multi-primitive scenario)
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=alert-engine -scenario=all
```
Exits 0. Both module scenarios pass. Paste output to RETURN.

### AC-7: All-tier sandbox (G12 DoD Gate)
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. All primitive + module scenarios green (9 primitive + 2 module = 11). Paste output to RETURN.

---

## Module Scenario JSON Spec (2 in `docs/scenarios/alert-engine/module/`)

### alert-pipeline-golden.json
Full pipeline story: input alert with severity="high", signalTypes=["MACD_CROSS"], stock="VCB", recent alerts=[] (empty — no dedup/cooldown hit), mute=false → expected output:
```json
{ "fired": true, "fingerprint": "<computed>", "channel": "market", "reason": "alert fired" }
```

### alert-pipeline-edge.json
Pipeline with cooldown suppression: same stock + overlapping signal within 30min → expected output:
```json
{ "fired": false, "reason": "cooldown: same signal within 30min" }
```

> **Module scenario ZERO-CREDS constraint:** Scenario JSON contains only alert-domain data (tickers, severities, signal types, fingerprints, timestamps, mute=true/false). Zero credential-shaped fields. Reason strings and `fingerprint` value must match the module's emitted output verbatim (derive `fingerprint` from `dedup-key-builder`).

---

## Constraints & Gates

**Fence-B (HARD):**
- `pkg/module/alert_pipeline/` imports primitives + `pkg/domain` + stdlib ONLY. AC-2 + AC-3 + AC-4 enforce.

**G12 DoD Gate:**
- Sandbox must run `CGO_ENABLED=0` and pass AC-6 (module tier) AND AC-7 (all tier) BEFORE the RETURN block is written. Paste both outputs to RETURN. (P1-C is NOT a streak member — streak #1/#2/#3 = P1-B1/P1-B2/P1-B3 — but the DoD sandbox-green-before-RETURN rule still binds every sandbox-runnable task.)

**Charter binding (Charter §4.5 + §ZERO-CREDS + L-series):**
- §G2 calibration: ONE module `alert_pipeline` composing primitives via injected ports; multi-primitive scenario = the alert pipeline story. `mute_gate` module deferred post-pilot.
- §ZERO-CREDS Boundary Clause (TELEGRAM_* values never in module path).
- §4.5 matrix authorship: `goalsEarned` stays 0; decisionMatrix untouched by dev. **NO goal flips.** dm-TBD.
- L84 explicit-file staging — `git add <path>` per file, NEVER `-A` or `.`.
- No `--force`/`--no-verify`/`--no-gpg-sign`/`git push`; no destructive git; all work on `main`, NO branches.
- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor of HEAD.
- Do NOT touch other pilots, SI-2 (`docs/dashboards/index.html`), or DORMANT/CLOSED zones (apps/technical-analysis/**, apps/macro-indicators/**, apps/stock-price/**).
- Fleet-wide single-committer serialization active — verify `git diff --cached --name-only` clear of foreign paths before staging.

---

## RETURN Block

When dev-alert-engine marks this task DONE, include:

```
[TASK_P1-AE-C RETURN]
Ports option chosen: A (re-export domain ports) | B (slim module-local interfaces) — <state which + why>
AC-1: Ports defined/re-exported, zero infra imports ✓
AC-2: Fence-B grep = 0 ✓
AC-3: Cross-module imports grep = 0 ✓
AC-4: ZERO-CREDS module grep = 0 ✓ (note any port-name false-positive context)
AC-5: Unit test mock ports (happy/dedup-hit/mute-hit) exit 0 ✓
AC-6: Module-tier sandbox exit 0 (2 module scenarios pass) ✓
AC-7: All-tier sandbox exit 0 (9 primitive + 2 module green) ✓

Unit test output:
<paste go test ./pkg/module/alert_pipeline/ output>

Module sandbox output:
<paste CGO_ENABLED=0 go run ./cmd/sandbox -tier=module ... output>

All-tier sandbox output:
<paste CGO_ENABLED=0 go run ./cmd/sandbox -tier=all ... output>

Fence-B grep output:
<paste — should be empty / line-count 0>

Cross-module grep output:
<paste — should be empty / line-count 0>

ZERO-CREDS module grep output:
<paste — should be empty / line-count 0>

G12 DoD: all-tier sandbox green BEFORE RETURN written.
```

---

## Signal

After DONE, emit `docs/signals/dev-alert-engine-P1-C-done-<UTCstamp>.json`:
```json
{
  "signal": "P1-C-done",
  "agent": "dev-alert-engine",
  "task": "P1-AE-C",
  "timestamp": "<ISO8601 UTC>",
  "commit": "<SHA first 7>",
  "anchor_intact": "debba8eaff0724d1fb32fc9d28640201cc32d1cc",
  "gates": {
    "AC1_ports_zero_infra": "PASS",
    "AC2_fence_b_grep_0": "PASS",
    "AC3_cross_module_grep_0": "PASS",
    "AC4_zero_creds_module_grep_0": "PASS",
    "AC5_unit_test_mock_ports_exit0": "PASS",
    "AC6_module_sandbox_exit0": "PASS",
    "AC7_all_tier_sandbox_exit0": "PASS"
  },
  "ports_option": "A|B",
  "sandbox_result": {
    "total": 11,
    "pass": 11,
    "fail": 0,
    "status": "OK"
  },
  "next_actor": "pm",
  "next_action": "verify P1-C (alert_pipeline module stub, G2 + Fence-B), then sequence P1-D (dashboard stub 3-panel)"
}
```

---

## Dependencies

- **Charter:** docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md
- **Phase 1 Task Plan:** docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-C
- **Previous task DONE signal:** docs/signals/dev-alert-engine-P1-B3-done-20260524T054219Z.json (commit 251071bd)
- **SSOT:** docs/data/pilot-status-alert-engine.json (phase1.current_task = P1-C)
