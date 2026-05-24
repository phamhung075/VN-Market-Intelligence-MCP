---
title: "Pilot Charter — alert-engine microservice refactor (Factory v2 — fleet pilot 5)"
date: "2026-05-24"
author: "architect"
status: "ACTIVE"
pilot: "alert-engine"
fleet_pilot_number: 5
deadline_sprints: 6
deadline_iso: "2026-07-05"
version: "2.0"
parent_factory_close: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (v1.0, CLOSED 2026-05-23 verdict=scale)"
sibling_pilot_references:
  - "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md (v2.0, CLOSED 2026-05-24 verdict=scale — fleet pilot 3)"
  - "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md (v2.0, ACTIVE — fleet pilot 4)"
authorization_signal: "docs/signals/po-20260524T023538Z-alert-engine-pilot5-charter.json"
schema_source: "docs/data/pilot-status-schema.json (SI-1 fleet schema v1.0, agent-father 2026-05-23T22:01:07Z)"
language: "Go"
language_lock_source: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md §Q2 — user 'B' verdict; Go is the implementation language for all Go microservice fractals; alert-engine is natively Go (runtime go1.22+cgo per system-map.json)"
service_facts_source: "docs/data/system-map.json (jq, never hardcoded): port 5006 (internal==external), zone apps/alert-engine/, specialist dev-alert-engine, runtime go1.22+cgo, DB alert_engine.db"
fleet_serialization_note: "INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION active at charter creation. All commits on main serialized; no concurrent pilots stage simultaneously."
---

# Pilot Charter — `alert-engine` Microservice Refactor (Factory v2 — fleet pilot 5)

**Binding contract for the FIFTH factory pilot. Inherits the 12-G-goal factory pattern proven across `technical-analysis` (closed 2026-05-23, verdict=`scale`), `macro-indicators` (closed 2026-05-23, verdict=`scale`), `stock-price` (closed 2026-05-24, verdict=`scale`), and concurrently active `kinh-dich` (pilot 4, ACTIVE).**

**Scope:** `apps/alert-engine` only. No other microservice is in scope during this pilot.

---

## Why This Pilot Exists

Four prior factory pilots have all scored 12/12 with verdict=`scale`. alert-engine is the **fifth** service to undergo the factory pattern, and its domain warrants this pilot for a specific structural reason: **it is the Telegram signal distribution engine** — every alert fired across the entire product eventually passes through this service. Primitives extracted here (dedup, cooldown, channel-routing) are among the highest-trust functions in the system.

alert-engine's domain is small but critically correct-by-construction:
- `ComputeFingerprint` (djb2 hash — must match TS port byte-for-byte)
- `IsDuplicate` (pure set membership)
- `ShouldSuppressAlert` (cooldown + daily-cap decision)
- `SeverityChannelRouter` (severity → Telegram channel mapping — currently inlined in use-case)

This makes it an ideal factory pilot: the primitives are pure, testable, and high-stakes. The factory pattern's scenario-JSON + sandbox trust contract provides exactly the reproducibility guarantee needed here.

**Critical distinction from stock-price:** where stock-price's hard gate was the CGO boundary (`mattn/go-sqlite3` must not leak into primitive/module/sandbox), alert-engine's hard gate is the **Telegram credentials boundary**. The sandbox must build and run with **zero bot tokens, zero chat IDs, zero TELEGRAM_* env vars**. This is the G7 ZERO-CREDS gate — the hardest architectural constraint for this pilot.

**Pilot gate:** if all 12 goals pass the decision matrix → scale continues to pilot 6 (news-fetch, TS/Bun, gated on SI-3 proven by kinh-dich). See §Decision Matrix.

---

## Language Lock (Day 0)

**Implementation language is Go.** Locked at charter creation; not subject to mid-pilot pivot.

**Authority:** User verdict 2026-05-22 ("B" on the language-pivot evaluation). PO decision doc `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md §Q2` makes Go the implementation language for all Go microservice fractals. alert-engine is **already Go** (`runtime go1.22+cgo` per system-map) — there is no rewrite-from-TS step here. The lock simply forbids any mid-pilot pivot.

**Carry-over lesson L1:** the TA pilot lost 6 commits and ~3 days to a mid-Phase-1 language pivot. Impossible here — language locked Day 0 AND the service is natively Go.

**Current state (brownfield scan 2026-05-24):**
`apps/alert-engine/` has all 4 DDD layers in `pkg/` (`domain/`, `application/`, `infrastructure/`, `interface/http/`) and `cmd/server/main.go`. Domain layer is already remarkably clean — `domain/services.go` contains three pure functions (`ComputeFingerprint`, `IsDuplicate`, `ShouldSuppressAlert`) with ZERO infra imports, exactly matching the factory primitive pattern. It has **NO `pkg/primitive/`, NO `pkg/module/`, NO `cmd/sandbox/`, NO `dashboard/`** — RED verdict. dev-alert-engine confirms exact primitive/module targets in Phase 0 (§Phase 0).

---

## Refactor Targets (recommended candidates — dev-alert-engine confirms in Phase 0)

The factory decomposes **pure decision/transformation logic** into primitives and **composition/orchestration** into a module. I/O (SQLite read/write, Telegram HTTP dispatch) stays in infrastructure and **must not leak into the fences**.

**Primitive candidates (pure, stdlib-only — Fence-A):**

| # | Primitive (proposed) | Pure logic extracted from | Why it is pure |
|---|---|---|---|
| 1 | `signal-classifier` | `domain/models.go` `AlertSeverity.IsValid()` + the severity→channel mapping currently inlined in `application/evaluate.go` L126-130 | Given a severity string → valid severity constant + canonical channel selection (market/work/bug). No I/O — pure string/switch logic. |
| 2 | `dedup-key-builder` | `domain/services.go` `ComputeFingerprint` (djb2Hash + field composition) | Given stock + signalTypes + message → deterministic fingerprint string. Already pure — extract verbatim as a standalone primitive with its own scenarios. |
| 3 | `cooldown-gate` | `domain/services.go` `ShouldSuppressAlert` (cooldown window + daily cap rules) | Given an alert request + recent alerts list + cooldown config → suppress:bool + reason:string. Pure decision — no DB, no clock (inject `now` as parameter for determinism). |
| 4 | `duplicate-checker` | `domain/services.go` `IsDuplicate` | Given a fingerprint + recent fingerprints slice → bool. Already 6 lines — trivially pure. Wrap in a primitive for scenario coverage. |
| 5 | `alert-formatter` | Telegram message assembly currently inlined in `application/evaluate.go` L130 (`fmt.Sprintf("[%s] %s: %s", severity, stock, message)`) | Given severity + stock + message → formatted string. Pure transformation. |

**Target: 3-5 primitives** — the alert-engine domain is narrow (the brownfield shows the domain/services.go is only 151 lines). Primitives 1-4 are high-leverage. Primitive 5 (`alert-formatter`) is optional depending on Phase 0 brownfield confirmation — dev-alert-engine picks the final set. The minimum viable set is primitives 1-3 (signal-classifier, dedup-key-builder, cooldown-gate) covering the three distinct decision axes.

**Module candidate (Fence-B):**

- `pkg/module/alert_pipeline/` — composes the primitives via ports (DI). The alert PIPELINE STORY: classify severity → build fingerprint → check duplicate (via `AlertRepositoryPort` port, infra impl) → check cooldown (via `AlertRepositoryPort` port) → check mute (via `MutePort` port) → format message → route to channel (via `TelegramPort` port, infra impl). **The module owns the orchestration; the actual SQLite read/write and Telegram HTTP dispatch are injected ports (infra impls), never imported directly by the module.**

> **dev-alert-engine Phase 0 confirmation required:** the candidates above are derived from a read-only brownfield scan of `domain/services.go` + `application/evaluate.go`. dev-alert-engine MUST confirm or refine the exact primitive set + module name in the Phase 0 brownfield inventory before any code lands. The charter does not freeze the primitive names — only the decomposition principle (pure → primitive, orchestration → module, I/O → infra).

---

## ZERO-CREDS Boundary Clause (Phase-0 RISK — alert-engine's hard gate, analogous to CGO gate on stock-price)

**alert-engine uses Telegram bot credentials (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_INFO_MARKET_GROUP_ID`, `TELEGRAM_INFO_WORK_CHANNEL_ID`, `TELEGRAM_REPORT_BUG_CHANNEL_ID`) in `pkg/infrastructure/telegram.go` (TelegramClient) and `pkg/infrastructure/config.go` (LoadConfig).** This is the alert-engine analog of stock-price's `mattn/go-sqlite3` CGO gate.

**Hard rule:** Telegram credentials and any live API-dispatch MUST NOT appear in the sandbox environment.

- Primitives are **stdlib-only** (Fence-A) — they receive already-decoded data, never call the Telegram API or read env vars for credentials.
- The module (Fence-B) composes primitives + a `TelegramPort` **port (interface)** — the TelegramClient HTTP infra impl is wired in the composition root, never imported by the module.
- **The sandbox (`cmd/sandbox/`) MUST build and run the refactored primitives + module WITH ZERO CREDENTIALS.** Scenario JSON fixtures stand in for alert payloads and recent-alerts state. The sandbox must compile and execute with `CGO_ENABLED=0` (pure-Go, no `mattn/go-sqlite3`; the SQLite infra is real in production but the sandbox's mock ports need no SQLite). **AND the sandbox process env audit must return zero matches for any `TELEGRAM_*`, `BOT_TOKEN`, `CHAT_ID`, `TOKEN`, `SECRET`, `API_KEY`, `PASSWORD` pattern.**

**Why `CGO_ENABLED=0` applies here too:** alert-engine uses `mattn/go-sqlite3` for `alert_engine.db` (see `pkg/infrastructure/sqlite.go`). Exactly like stock-price, the CGO SQLite infra must not leak into the primitive/module/sandbox path. The sandbox injects in-memory mock ports (no real SQLite), so `CGO_ENABLED=0` build proves fence correctness.

**Phase-0 RISK (dev-alert-engine MUST confirm):** verify that the extracted primitives + module compile and the sandbox runs under `CGO_ENABLED=0`. If any extracted unit transitively pulls `mattn/go-sqlite3` or accesses Telegram env vars, the decomposition is wrong (I/O leaked into a fence). **Flag this exactly as stock-price flagged R-CGO at Phase 0** — it is the binding correctness gate for the fences.

**G7 is the HEADLINE RISK for this pilot.** If the sandbox scenario files contain any token placeholder strings, chat ID values, or credential-shaped data, G7 fails. Scenario JSON must contain only alert-domain data (tickers, severities, signal types, messages, fingerprints, timestamps) — zero credential fields.

---

## Kickoff Prerequisites

All of the following must be true before Phase 0 work begins on this pilot:

1. Authorization signal landed — `docs/signals/po-20260524T023538Z-alert-engine-pilot5-charter.json` (PO chartered this pilot; signal verified before charter authoring).
2. Fleet rollout RATIFIED — `docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md` status=DECIDED; alert-engine is fleet pilot 5.
3. SI-1 fleet schema LANDED — `docs/data/pilot-status-schema.json` exists (agent-father, 2026-05-23T22:01:07Z). This charter's SSOT (`docs/data/pilot-status-alert-engine.json`) is instantiated from it.
4. Pilot status SSOT created — `docs/data/pilot-status-alert-engine.json` exists with all 12 goals = `TBD`, decisionMatrix all `TBD` (present-but-empty), status `ACTIVE`, phase `0`, language `Go` locked (this charter creation cycle; architect authors per §4.5 SSOT-from-Day-0 rule).
5. `apps/alert-engine/` brownfield scan complete — confirm DDD layer state + exact primitive/module targets + ZERO-CREDS boundary (Phase 0 deliverable; architect or system-auditor owns; dev-alert-engine confirms CGO-free + creds-free sandbox feasibility).
6. Bug-inventory entry — `docs/data/bug-inventory.json` gets an `alert_engine_baseline` block for G10 baseline. If no alert-engine bugs exist in the 60d window, baselineCycleCount falls back to system-wide `1.5` (`bug-inventory.json.baselineCycleCount`).

---

## Anti-Scope-Creep Clause

**This pilot covers `apps/alert-engine/` only.** Forbidden while the pilot is active:

- Extracting primitives for any other bounded context (stock-price, kinh-dich, pdf-extractor, etc.)
- Rebuilding modules or rewiring composition roots for any service other than `apps/alert-engine/`
- Touching DORMANT closed-pilot app source (`apps/technical-analysis/**`, `apps/macro-indicators/**`, `apps/stock-price/**`) — all three are FROZEN post-close
- Touching CLOSED pilot SSOTs (`pilot-status.json`, `pilot-status-macro-indicators.json`, `pilot-status-stock-price.json`)
- Touching the SI-2 fleet dashboard index (`docs/dashboards/index.html`) — this file is **stock-price-EXCLUSIVE** (ratification Decision 3; alert-engine's G6 builds `apps/alert-engine/dashboard/index.html` ONLY; linkage into SI-2 is deferred and is stock-price's owner's call, NOT alert-engine's)
- Adding goals to this charter mid-pilot

**SI-2 boundary is HARD and FINAL:** alert-engine MUST NOT create, modify, or read `docs/dashboards/index.html` during any phase of this pilot. G6 for alert-engine is strictly `apps/alert-engine/dashboard/index.html`.

---

## Hard Deadline

**6 sprints from kickoff.** Kickoff date = 2026-05-24 (charter creation date). **Sprint-6 hard deadline = 2026-07-05.**

No silent extension. At sprint 6 end, PO calls the decision matrix regardless of goal state.

**Mechanically enforced (L3):** Status enum is strictly `ACTIVE | DONE | FAILED`. NO operational labels (`PHASE-2`, `WAITING-USER`) are valid terminal values. If a user-gated goal (G9) stays unresolved past hard deadline, status auto-flips to `FAILED` and PO calls matrix on whatever state exists (G9 → PARTIAL, Trust evaluated on G8 alone). Default G9 path is PO Playwright (Path B, L6) — so async-user-wait should not block.

---

## Security / ZERO-CREDS + CGO Clause

The sandbox process (used in G7 and throughout Track B) **MUST have zero Telegram credentials AND zero CGO (mattn/go-sqlite3) at all times.** Not optional.

Enforcement:
- **G7 env audit (HARD GATE):** run the sandbox process and confirm `env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"` returns empty. This is the PRIMARY G7 gate.
- **alert-engine-specific credential boundary:** scenario JSON files must contain ZERO credential-shaped fields. QA scans all scenario JSON with `grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/` → 0. Any hit blocks G7.
- **CGO gate (same as stock-price):** the sandbox binary builds and runs under `CGO_ENABLED=0`. `go build -tags ''` of `./cmd/sandbox` with `CGO_ENABLED=0` exits 0, and `grep -rn "mattn/go-sqlite3" apps/alert-engine/pkg/primitive apps/alert-engine/pkg/module apps/alert-engine/cmd/sandbox` returns 0.
- If any credential OR `mattn/go-sqlite3` import appears in the sandbox/primitive/module path, G7 (and G4 Fence-B) is blocked — it does not pass.

Rationale: sandbox is pure-function (JSON in → trace JSON out). Any credential, network call to Telegram, or CGO dependency destroys the security and reproducibility guarantee.

---

## 12 Completion Goals

All 12 goals are inherited verbatim from the proven v2 charter, with alert-engine-specific calibration on G1, G2, G3, G5, G7, G10, G11, G12. Track structure (A=Trust Foundation, B=Dashboard, C=AI-Fixability) is unchanged.

### Track A — Trust Foundation

---

**G1. Primitives ship with scenarios**

**3-5 alert-engine primitives extracted to Go** (`apps/alert-engine/pkg/primitive/`), each with ≥3 scenario JSON files (golden/happy + edge + failure). All scenarios pass.

**Recommended candidate list (architect/dev-alert-engine refine in Phase 0 — see §Refactor Targets):**
1. `signal-classifier` — severity string → valid AlertSeverity constant + Telegram channel selection
2. `dedup-key-builder` — stock + signalTypes + message → djb2 fingerprint string
3. `cooldown-gate` — alert request + recent alerts + cooldown config + now → suppress:bool + reason:string
4. `duplicate-checker` — fingerprint + recent fingerprints → bool
5. `alert-formatter` — severity + stock + message → formatted alert text (optional, Phase 0 confirmation)

**Calibration vs prior pilots:** TA had 5 primitives, macro 6, stock-price 3. alert-engine's domain is the narrowest yet — the entire `domain/services.go` is 151 lines with 3 pure functions. **3-4 primitives is the calibrated band.** dev-alert-engine picks the highest-leverage in Phase 0. **ZERO-CREDS gate binds (§ZERO-CREDS Boundary Clause):** every primitive must be stdlib-only, zero Telegram API imports, zero env var reads, zero `mattn/go-sqlite3`.

Verification method: `cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all`. All scenario files execute without error. QA counts scenario files: minimum 3 per primitive × 3 primitives = 9 files minimum. QA checks ≥1 file is a failure scenario. QA confirms `grep -rn "mattn/go-sqlite3" pkg/primitive/` = 0. QA confirms `grep -rniE "token|chat_id|bot|secret|api_key" pkg/primitive/ cmd/sandbox/` = 0.

Owner agent: `dev-alert-engine`

---

**G2. Module composes primitives via ports**

`apps/alert-engine/pkg/module/alert_pipeline/` exists. Imports primitives via interface; the SQLite repo I/O and Telegram dispatch are injected `AlertRepositoryPort` and `TelegramPort` ports (infra implements them), never reached into directly. Module never imports another module. Has its own multi-primitive scenarios (the PIPELINE STORY: incoming alert → classify → fingerprint → dedup check → cooldown check → format → route to channel).

**Calibration:** ONE module (`alert_pipeline`) — matches TA's single-module scope and stock-price's pilot-one-module discipline. A second module (e.g. `mute_gate`) is **deferred to post-pilot**. **Fence-B + ZERO-CREDS + CGO gate:** module imports zero infrastructure, zero `mattn/go-sqlite3`, zero Telegram client.

Verification method: QA runs `grep -rn "pkg/module/" apps/alert-engine/pkg/module/alert_pipeline/` → 0 cross-module imports. QA runs `grep -rn "mattn/go-sqlite3\|pkg/infrastructure" apps/alert-engine/pkg/module/alert_pipeline/` → 0. QA runs `grep -rniE "telegram|bot_token|chat_id" apps/alert-engine/pkg/module/` → 0. QA runs the module sandbox under `CGO_ENABLED=0` and verifies ≥1 multi-primitive scenario (e.g., a pipeline story: classify HIGH severity → fingerprint → no-dedup-hit → cooldown PASS → format "[high] VCB: Stop-loss triggered" → route to ChannelMarket).

Owner agent: `dev-alert-engine`

---

**G3. Microservice has clean composition root**

`apps/alert-engine/cmd/server/main.go` wires module + adapters (the CGO SQLite repo and TelegramClient are wired HERE as infra impls of `AlertRepositoryPort`, `MutePort`, and `TelegramPort`). No business logic in composition root. HTTP interface contract documented (OpenAPI YAML). **Port = 5006 (internal == external) per system-map.json — never hardcoded elsewhere.**

Verification method: QA reads `cmd/server/main.go` — only imports, DI wiring (including the SQLite repo injection and TelegramClient injection), and server startup. No `if` on data values, no calculations, no domain logic. QA checks `apps/alert-engine/` has an HTTP contract doc (OpenAPI YAML or equivalent). QA runs `grep -rn "ComputeFingerprint\|IsDuplicate\|ShouldSuppressAlert\|joinSignalTypes\|isToday" apps/alert-engine/cmd/server/main.go` → 0 (logic lives in module/primitives, not the root).

Owner agent: `dev-alert-engine`

---

**G4. Architecture fence enforced (offline depguard evidence)**

**Lesson burned in (L2):** whole-project CI is noisy from unrelated pre-existing failures. G4 evidence is offline `.golangci.yml` freeze + deliberate-violation depguard proof on the pilot zone only. **Go service → depguard via golangci-lint. SAME mechanism proven on TA + macro + stock-price. NO SI-3 (TS fence) dependency — alert-engine is Go.**

**alert-engine G4 spec (calibrated v2):**

`apps/alert-engine/.golangci.yml` exists, contains depguard rules for:
- **Fence-A** — primitive (`pkg/primitive/`) must not import application, infrastructure, interface, OR `mattn/go-sqlite3`, OR any Telegram client package (stdlib-only).
- **Fence-B** — module (`pkg/module/`) must not import infrastructure OR `mattn/go-sqlite3` (composes via ports only).
- **Fence-C** — infrastructure (`mattn/go-sqlite3`, Telegram net/http client) importable ONLY from `cmd/server/main.go` (composition root). Exclusions: `!**/cmd/server/main.go`, `!**/*_test.go`.

CI green-on-pilot-zone OR offline-evidence: `cd apps/alert-engine && golangci-lint run` exits 0; deliberate Fence-A violation (1 import in `pkg/primitive/` reaching `mattn/go-sqlite3` or `pkg/infrastructure`) reproduces depguard exit non-zero with "Fence-A" in output; violation reverted, never committed.

**Acceptance evidence (carried over verbatim from TA P2-A4 / macro P2-A2 / stock-price P2-B):**
- **AC-4a:** workflow file `.github/workflows/ci.yml` includes a `golangci-lint` job scoped `working-directory: apps/alert-engine` (job name e.g. `alert-engine-go-lint`) — OR offline-only proof if CI billing block persists.
- **AC-4b (deliberate-violation proof):** an intentional Fence-A violation (e.g. add `import "github.com/mattn/go-sqlite3"` or a `pkg/infrastructure` import to a primitive file) reproduces a non-zero golangci-lint exit with the fence name ("Fence-A") in output. The violation is then **reverted, `git status` is clean, and the violation is NEVER committed.** QA reproduces independently.
- **AC-4c:** `.golangci.yml` freeze anchor — `git log --oneline apps/alert-engine/.golangci.yml` shows the freeze commit as the most recent commit on that file at G4 close.

**Pre-revert tag (L5):** `alert-engine-pre-ci` MUST be created at the commit BEFORE the CI/violation work. No retag, no force, no push.

Owner agent: `dev-alert-engine` (fence impl) + `qa` (violation proof). NO architect Amendment — spec is final at charter v1 (Go path, no SI-3).

---

**G5. Old alert-engine domain leak deleted + HTTP rewire**

**Calibration:** alert-engine is its OWN Go service already (not a domain leak inside mcp-server). So G5 here is:

- **G5a:** any pre-refactor alert-engine logic that gets superseded by the new primitive/module decomposition is moved to `apps/alert-engine/pkg/_deprecated/` (or deleted with a pre-delete tag) after the new module ships — NOT left as dead duplicate domain logic. (Phase 0 brownfield confirms whether the existing `domain/services.go` functions are fully replaced by primitives or partially retained as thin domain models.)
- **G5b:** any `apps/mcp-server/src/` tool handlers that invoke alert-engine are verified routed via **HTTP to the Go service on port 5006**, with zero direct domain imports. Phase 0 identifies the exact MCP handlers that interact with the alert pipeline (candidates: `send_telegram` MCP tool + any alert-evaluation callers — dev-alert-engine confirms which actually reach into alert-engine domain vs already-HTTP).
- **G5c:** zero `TODO.*migrat` comments in alert-engine + the affected mcp-server tool dir.

Verification method: QA runs `grep -rn "TODO.*migrat" apps/alert-engine/ apps/mcp-server/src/` → 0. QA confirms superseded logic moved to `_deprecated/` (or deleted under tag). QA verifies the relevant MCP alert tool returns valid response via HTTP to the Go service.

**Tag-anchor discipline (L5):** Pre-delete tag `alert-engine-pre-delete` MUST be created at the commit BEFORE any `git mv` to `_deprecated/`. No retag, no force, no push.

Owner agent: `dev-alert-engine`

---

### Track B — Dashboard Trust Layer

---

**G6. Three-level dashboard renders from JSON traces (3-panel standard)**

`apps/alert-engine/dashboard/index.html` exists. **Three panels visible (the 3-panel standard):**
1. **Primitives panel** — one card per extracted primitive (3-5)
2. **Module panel** — one card for `alert_pipeline`
3. **Microservice panel** — one card for the alert-engine service composition

All open from one HTML index. **`file://` works with ZERO network calls, ZERO CGO, and ZERO Telegram credentials** (renders from scenario trace JSON, no live Telegram Bot API, no SQLite). No CDN, no build server required to view.

**SI-2 boundary (MANDATORY — bake into HTML comment Day 0):** `apps/alert-engine/dashboard/index.html` is the ONLY dashboard file alert-engine may create. `docs/dashboards/index.html` is stock-price-EXCLUSIVE and MUST NOT be touched by alert-engine during this pilot. An explicit HTML comment to this effect must appear in the dashboard source.

Owner agent: `dev-alert-engine`

---

**G7. Edit-JSON-and-rerun works (ZERO credentials, ZERO CGO in sandbox)**

User edits a scenario JSON (e.g. changes `cooldownMinutes` or `signalTypes`), refreshes the dashboard, sees the new result. **ZERO Telegram bot tokens, ZERO chat IDs, ZERO TELEGRAM_* env vars, ZERO `mattn/go-sqlite3` (CGO) in the sandbox process.** The rerun handler invokes the `CGO_ENABLED=0` sandbox binary against the edited fixtures.

**This is the HEADLINE RISK of the pilot.** The sandbox MUST NOT contain any credential-shaped data anywhere — not in scenario JSON, not in scenario runner config, not in environment. The env audit is: `env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"` returns empty.

**G7 PASS requires ALL of:**
1. Env audit returns empty for any credential pattern.
2. Scenario JSON grep returns zero for any token/credential field.
3. Sandbox compiles under `CGO_ENABLED=0`.
4. User edit → rerun → updated trace → dashboard reflects change — cycle works end-to-end.

Owner agent: `dev-alert-engine`

---

**G8. Red/green status is honest (honest-red contract)**

Dashboard shows RED when a scenario fails (proven by 1 deliberate broken primitive). No false greens (QA runs known-bad scenarios).

**Carry-over evidence pattern (the honest-red contract):**
- **Test A** = deliberate corruption of a golden scenario (e.g. flip an expected `suppress:false` to `suppress:true` in `cooldown-gate` golden) → dashboard renders RED, diff captured.
- **Test B** = known-good golden scenario → dashboard renders GREEN, diff = null.

Both proven before G8 grades YES. Pattern identical across all pilots — no false green tolerated.

Owner agent: `qa` (verification) + `dev-alert-engine` (dashboard honesty impl)

---

**G9. Dashboard is the trust contract — short-circuit via PO Playwright (Day-0 default, L6)**

**Lesson burned in (L6):** synchronous user verbal confirm blocked the TA pilot for cycles 15-18. Path B (PO Playwright short-circuit) is the Day-0 DEFAULT, equal weight to Path A.

G9 PASS = ONE of:
- **Path A (synchronous user verbal — preferred if user available):** user shown only the dashboard, answers YES to "Can you tell from this dashboard whether alert-engine's dedup/cooldown pipeline is working correctly?" PO records verbal YES in `docs/po-decisions/<date>-g9-alert-engine-user-confirmation.md`.
- **Path B (PO Playwright short-circuit — DEFAULT if user defers):** user directive delegates verification to PO. PO runs Playwright + chromium-headless-shell against `file://apps/alert-engine/dashboard/index.html` (TCC-staged via Terminal.app per L87). Acceptance: ZERO console errors, ZERO pageerrors, ZERO requestfailed, all primitive + module + microservice cards rendered, NOT-RUN status honestly displayed. PO records verdict in decision doc. SAME WEIGHT as user verbal per cycle-19 precedent.

**Either path satisfies G9.** No synchronous user wait required.

Owner agent: `po` (review facilitation + Playwright verification)

---

### Track C — AI-Fixability Proof

---

**G10. AI agent fixes a primitive bug without looping (≤2 cycles)**

QA injects 1 deliberate bug into an alert-engine primitive. `dev-alert-engine` fixes in ≤2 cycles (baseline was 4-6 system-wide). Dashboard turns green.

**Baseline source:** `docs/data/bug-inventory.json` — Phase 0 adds an `alert_engine_baseline` block. If no alert-engine bugs exist in the 60d window, falls back to system-wide `baselineCycleCount=1.5`.

**Bug-injection spec (proven on TA + macro + stock-price):** off-by-one / wrong-literal / wrong-operator single-literal injection. Calibrate to an alert-engine primitive (e.g. wrong djb2 seed constant in `dedup-key-builder`, or a flipped comparison in `cooldown-gate` — `>` vs `>=` on cooldown window). The bug must be a SINGLE literal/operator change with a deterministic correct fix.

Owner agent: `dev-alert-engine` (fix) + `qa` (injection + cycle count)

---

**G11. Regression alarm bell works**

AI fixes bug A, breaks scenario B → dashboard flips B RED → AI forced to fix B before "done".

**Grading rubric (2-trial coupling-proof, identical to TA/macro/stock-price):**
- **Trial-1** = the G10 primitive mutation + fix; verify ≥1 COUPLED scenario goes RED, single-edit fix repairs all coupled REDs.
- **Trial-2** = a DIFFERENT primitive mutation + fix; same coupling proof.
- Both showing outcome-(a) (coupled REDs from one mutation, single-edit fix repairs all) = PASS. Counts as alarm-mechanism-functional.

Owner agent: `dev-alert-engine` (flow rule compliance) + `qa` (scenario pair design)

---

**G12. Dev-alert-engine flow requires dashboard-green before "done" (3-task streak)**

`.claude/flows/dev-alert-engine/main.md` updated with the hard DoD-Gate rule (sandbox-green-before-RETURN). 3 consecutive dev tasks verified following the rule.

**Carry-over (L from TA/macro/stock-price):** the G12 DoD Gate rule lives in TA's flow (commit `cc7578f1`), cloned into macro's flow Day 0, and stock-price's flow at Phase 0. For alert-engine, `agent-father` updates/clones the `dev-alert-engine` flow at Phase 0 to bake the DoD Gate from Day 0 (no separate flow-edit task). Streak = the first 3 Phase 1 dev tasks (first-primitive + module-stub + dashboard-stub bucket pattern).

**Status candidacy:** may be held as EARNED-PENDING per §4.5 once the streak completes; PO flips YES only at 12/12 terminal atomic close.

Owner agent: `agent-father` (flow rule baking) + `qa` (3-task verification, using alert-engine's first 3 Phase 1 dev tasks)

---

## Phase 0 (exit gate)

**Owner:** architect + system-auditor + agent-father (+ dev-alert-engine for ZERO-CREDS + CGO feasibility confirmation).
**Duration:** 1 sprint.

Deliverables (per SI-1 schema `phase0.deliverables`):
1. `pilot_status_ssot` — `docs/data/pilot-status-alert-engine.json` (DONE this charter cycle, architect).
2. `brownfield_inventory` — `docs/architecture-briefs/2026-05-24-alert-engine-factory/p0-brownfield-inventory.md`. MUST confirm: exact primitive set + module name; which existing `domain/services.go` functions are superseded vs retained (G5a scope); the exact MCP handlers that reach alert-engine domain (G5b scope); **and the ZERO-CREDS + CGO-free sandbox feasibility — confirm primitives + module + sandbox build & run under `CGO_ENABLED=0` with zero TELEGRAM_* env vars.**
3. `bug_inventory_entry` — `docs/data/bug-inventory.json` `alert_engine_baseline` block (baselineCycleCount; fallback 1.5).
4. `dev_agent_file` — `.claude/agents/dev-alert-engine.md` updated/confirmed for factory mode (Go primary, G12 DoD constraint, ZERO-CREDS/Fence-A/B/C lazy-load). Confirm factory-readiness.
5. `dev_agent_flow_file` — `.claude/flows/dev-alert-engine/main.md` with G12 DoD Gate baked Day 0 + ZERO-CREDS fence + Fence-A/B/C + pre-revert tag protocol (`alert-engine-pre-ci`, `alert-engine-pre-delete`, `alert-engine-pre-inject`).
6. `phase_1_task_plan` — `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md` (atomic tasks, per-task AC, WIP=1, ZERO-CREDS gate baked into the first-primitive task AC exactly as stock-price baked R-CGO into P1-B1).

**Exit gate:** all 6 deliverables landed + SSOT phase-0 fields populated + no code in `pkg/primitive`/`pkg/module` yet + architect verification signal.

---

## Charter Inherited Lessons (from TA close + macro close + stock-price close 2026-05-23/24)

| # | Lesson source | Prior pain | alert-engine charter v1 fix |
|---|---|---|---|
| L1 | TA language pivot (6 reverted commits) | TS scaffold before user verdict; pivot cost 3-4 days | §Language Lock — Go Day 0, AND service is natively Go (no rewrite step) |
| L2 | TA G4 Amendment 1 | Whole-project CI noisy | §G4 — offline depguard evidence OR pilot-scoped CI; AC explicit at v1 |
| L3 | TA Q5 status-enum violation | `PHASE-2` label allowed silent escape | §Hard Deadline — enum strictly `ACTIVE\|DONE\|FAILED`; auto-FAILED on G9-blocked deadline |
| L4 | TA Q6 matrix authorship undefined | decisionMatrix set by wrong agent | §4.5 / §Constraints — PO-only, populate ONLY after 12/12 terminal in atomic commit |
| L5 | TA Q7 pre-revert tags missing | tags retrofitted | §G4 + §G5 + §G10 require pre-* tags Day 0 (`alert-engine-pre-ci/-delete/-inject`) |
| L6 | TA G9 cycle-19 user-delegation | Synchronous confirm blocked pilot | §G9 — Path B PO Playwright Day-0 default, equal weight |
| L7 | TA cycle-26+ SSOT discipline | Discovered mid-pilot | §Constraints — L84 / no-force / local-only / anchor-hold Day 0 |
| L-CREDS | NEW (alert-engine-specific, analog of stock-price CGO gate / macro FRED gate) | n/a — proactive | §ZERO-CREDS Boundary Clause — TELEGRAM_* vars must not appear in sandbox env; scenario JSON must contain zero credential fields; sandbox builds under CGO_ENABLED=0; Phase-0 confirmation gate |

Full carry-over chain: macro `01-lessons-from-ta-pilot.md` + stock-price charter §CGO Boundary Clause + this charter §ZERO-CREDS Boundary Clause.

---

## Constraints (binding from Day 0)

- **L84 explicit-file staging** — `git add <path>` per file. NEVER `git add -A` or `git add .`.
- **No `--force`, no `--no-verify`, no `--no-gpg-sign`** — ever. Hook fails → fix + NEW commit.
- **No `git push` of source/CI changes** — local-only. User owns push (CI billing block).
- **All work on `main`** — NO branches (CLAUDE.md).
- **SSOT: one active dispatch per task** — no shadow dispatches, no orphaned signals.
- **Anchor discipline** — frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor of HEAD throughout this pilot. Once a commit is a frozen anchor for a contract (`.golangci.yml` freeze, pre-revert tags), no retag, no rewrite, no push.
- **§4.5 matrix-authorship rule** — `decisionMatrix.{speed,trust,scale}` populates ONLY by PO, ONLY after 12/12 G-goals reach terminal grade, ONLY in atomic commit with the last G-goal flip + verdict signature. Block stays present-but-empty (`TBD`) the entire pilot until then.
- **DORMANT/CLOSED freeze** — do NOT touch `apps/technical-analysis/**`, `apps/macro-indicators/**`, `apps/stock-price/**` (dormant source), closed SSOTs (`pilot-status.json`, `pilot-status-macro-indicators.json`, `pilot-status-stock-price.json`).
- **ZERO-CREDS boundary** — TELEGRAM_* vars, bot tokens, chat IDs only in infra, wired only from `cmd/server/main.go`; never in primitive/module/sandbox.
- **SI-2 exclusion** — `docs/dashboards/index.html` is stock-price-EXCLUSIVE. alert-engine MUST NOT touch this file.
- **WIP=1 sequential within each phase** — PM dispatches ONE task at a time per the phase task plan.
- **System facts via jq on `system-map.json`** — never hardcode port/zone/agent.
- **Fleet-wide single-committer serialization** — INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION is active. Before staging, verify `git diff --cached --name-only` is clear of foreign paths. NEVER `git reset HEAD` a foreign path.
- **Notebook + signal hygiene** — notebooks ≤200 lines (waterfall lazy-load L); signals `{agent}-{ISO}.json`.

---

## Decision Matrix (§4.5)

Applied MECHANICALLY by PO after 12/12 terminal. Block stays empty (`TBD`) until then.

| Question | YES criteria | NO criteria |
|---|---|---|
| **Speed** — fewer fix loops vs baseline? | G10 confirmed ≤2 cycles vs baseline AND G11 regression alarm fired (proving it works) | G10 not met OR alarm never fired |
| **Trust** — user can verify pilot quality from dashboard alone? | G9 confirmed (Path A verbal YES OR Path B Playwright PASS) AND G8 red/green honesty proven | G9 not confirmed by either path OR G8 false-green found |
| **Scale** — worth doing for next microservice? | All 12 goals YES AND both tracks A+B delivered within 6 sprints | ≥2 goals still NO at deadline OR overran 6 sprints |

**Derivation (mechanical, per SI-1 schema `_criteria_source`):** Speed = G10 ∧ G11. Trust = G9 (PASS, not PARTIAL) ∧ G8. Scale = all-12 YES ∧ sprintCount ≤ 6.

**Outcome:**
- **3 YES** → `scale` → continue fleet to pilot 6 (news-fetch, TS/Bun, gated on SI-3 proven by kinh-dich) per ratification Decision 1.
- **2 YES** → `rescope` (max 2 additional sprints; do not start pilot 6 until 3 YES).
- **0-1 YES** → `stop-MVR`. Architect writes MVR brief within 1 sprint.

**Pilot review meeting:** PO schedules within 1 sprint of all 12 goals reaching terminal state.

---

## Status Tracking

Pilot goal state tracked in `docs/data/pilot-status-alert-engine.json` (NEW file, instantiated from SI-1 schema `docs/data/pilot-status-schema.json`). Separate from all closed pilot SSOTs — all untouched.

**Valid goal states:** `TBD | IN-PROGRESS | YES | NO | PARTIAL | DEFER`
**Valid top-level status:** `ACTIVE | DONE | FAILED` (L3 — no operational labels)
**Valid phase status:** `OPEN | CLOSED` (phase0), `NOT-STARTED | ACTIVE | READY_FOR_CLOSE_GATE | APPROVED | ARCHIVED` (phase1), `NOT-STARTED | AWAITING-PLAN | OPEN | CLOSED` (phase2).

Pilot is DONE when all 12 goals are YES and decisionMatrix is terminal.

---

## Phase Skeleton

| Phase | Goal | Duration | Owner |
|---|---|---|---|
| **Phase 0** | Brownfield + ZERO-CREDS-feasibility confirm + agent/flow + pilot-status SSOT + bug-inventory entry + phase-1 task plan | 1 sprint | architect + system-auditor + agent-father (+ dev-alert-engine ZERO-CREDS+CGO confirm) |
| **Phase 1** | Go scaffold: `cmd/sandbox` (CGO_ENABLED=0, zero-creds env) + first primitive extracted + module stub + dashboard stub + sandbox green | 2-3 sprints | dev-alert-engine |
| **Phase 2** | Remaining primitives + module wiring + composition root + `.golangci.yml` fence + dashboard + G5 rewire + G8/G9/G10/G11 chain | 2-3 sprints | dev-alert-engine + qa + po |
| **Phase 3** | Closure: 12/12 terminal + decisionMatrix populated atomically + charter CLOSES | atomic | po |

**Total:** 6 sprints (hard deadline 2026-07-05).

---

## Execution Notes

- **Fleet-wide single-committer serialization:** at charter creation, INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION is active across the fleet. alert-engine commits must not overlap with kinh-dich (pilot 4) or any other active pilot commits. Serialize by verifying `git diff --cached --name-only` clear of foreign paths before staging.
- **WIP=2 cap:** per fleet ratification, at most 2 pilot charters may be ACTIVE simultaneously. alert-engine (pilot 5) may open only after fleet WIP count allows. If kinh-dich (pilot 4) is still ACTIVE and another pilot is ACTIVE, alert-engine Phase 1 dispatch waits.
- **Next actor:** After this charter + SSOT commit, next actor is `architect` to author the Phase-1 task plan (mirroring stock-price/kinh-dich phase plans). Signal `architect-alert-engine-charter-done-<UTC>.json` routes via main-router.

---

## Amendments

(None at v1 — lessons L1-L7 + L-CREDS baked in. Future amendments require PO sign-off + signal trail.)
