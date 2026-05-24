# Architect — Notebook

**Last updated:** 2026-05-24 06:26 UTC (alert-engine pilot-5 Phase-2 task plan) | **Sprint:** fleet-factory-rollout program

[3 most recent cycles retained below. Archive in git history.]

## alert-engine Phase-2 task plan cycle (2026-05-24T06:26Z) — fleet pilot 5 Phase 2 dispatch

**Task:** Author alert-engine Phase-2 atomic task plan (Go) for fleet pilot 5. Inbound: PM signal `pm-alert-engine-phase1-closed-20260524T082000Z.json` (Phase 1 DONE, all 5 gate criteria PASS, gateCommit 4e756d40). Structural template: stock-price `phase-2-task-plan-go.md` + kinh-dich `phase-2-task-plan-ts.md`.

**Key decisions:**
- 14 atomic tasks (P2-A through P2-Z), 69 ACs. WIP=1 sequential.
- G4 fence (4 tasks): P2-A (alert-engine-pre-ci tag) → P2-B (.golangci.yml Fence-A/B/C depguard + CI job) → P2-C (deliberate-violation proof — BLOCKER if linter exits 0 on violation) → P2-D (freeze anchor AC-4c). R-FENCE gate = P2-C: non-zero exit with "fence-a" in output REQUIRED.
- G5 chain (3 tasks): P2-E (alert-engine-pre-delete tag) → P2-F (git mv domain/services.go → _deprecated/ + evaluate.go rewire) → P2-G (HTTP-port audit + zero-migrat). G5b scope NARROW: alertEngine URL already declared in clients.ts; no direct Go domain imports from TS mcp-server possible.
- G3 composition root (P2-H): rewire cmd/server/main.go to wire alert_pipeline module ports instead of EvaluateAlertUseCase calling domain functions directly. Add api/openapi.yaml. Root currently 95 lines, target ≤120.
- G6 finalization (P2-I): add _deprecated/ notice + Phase-2 wired-state to dashboard. SI-2 disavowal comment stays untouched.
- G8 honest-red proof (P2-J): QA corrupts cooldown-gate-golden.json → non-zero sandbox exit + RED card confirmed → reverted → GREEN confirmed.
- G9 PO Playwright (P2-K): Path B Day-0 default (L6). chromium-headless-shell against file:// dashboard.
- G10/G11 blind split: P2-L (QA injection — target redacted from fixer) → P2-M (dev-alert-engine blind fix from symptoms ≤2 cycles + G11 2-trial coupling proof). Recommended injection target: dedup-key-builder djb2 seed 5381→5382.
- Pre-revert tags: alert-engine-pre-ci (P2-A) → alert-engine-pre-delete (P2-E) → alert-engine-pre-inject (P2-L).
- §4.5 compliance baked: NO goal flip instructions in any task. goalsEarned stays 0. decisionMatrix all TBD. Explicit §4.5 compliance section in plan.

**G-goal posture:**
- EARNED-PENDING (carry-forward, no Phase-2 task): G1, G2, G7, G12
- EARNED-PENDING advancing: G6 (P2-I finalization), G8 (P2-J honest-red proof)
- STILL-UNMET → Phase-2 work: G3 (P2-H), G4 (P2-A/B/C/D), G5 (P2-E/F/G), G9 (P2-K), G10 (P2-L/M), G11 (P2-M)
- goalsEarned: stays 0 throughout Phase 2. PO-only at 12/12 terminal Phase 3.

**ZERO-CREDS + CGO baseline (Phase-1 confirmed, Phase-2 carries forward):**
- env audit empty; sandbox source grep=0; CGO_ENABLED=0 build exit 0; edit→rerun cycle works.
- G7 EARNED-PENDING. No Phase-2 task re-earns it. P2-Z AC-6 re-confirms.

**Files authored this cycle (L84 — 2 files):**
1. `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md` (NEW)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal to emit after commit:** `docs/signals/architect-alert-engine-phase2-plan-done-<UTC>.json` (next_actor: pm)

**Anchor:** debba8eaff0724d1fb32fc9d28640201cc32d1cc — INTACT (verified before commit)

---

## alert-engine Phase-1 task plan cycle (2026-05-24T05:30Z) — fleet pilot 5 Phase 0 deliverable D6

**Task:** Author alert-engine Phase-1 task plan (Go) for fleet pilot 5. Authorization: charter-done signal `architect-alert-engine-charter-done-20260524T040000Z.json`. Structural template: stock-price `phase-1-task-plan-go.md` + kinh-dich `phase-1-task-plan-ts.md`.

**Key decisions:**
- 9 atomic tasks (P1-A through P1-G; P1-B4 optional), 59 ACs total (55 if P1-B4 skipped). WIP=1 sequential.
- P1-A: sandbox runner (cmd/sandbox/main.go, CGO_ENABLED=0 hard gate + env audit — HEADLINE RISK gate). 7 ACs.
- P1-B1: first primitive (`signal-classifier` — severity→AlertSeverity+TelegramChannel) + ZERO-CREDS gate (AC-4 Fence-A + AC-6 scenario JSON grep). 8 ACs. G12 streak #1.
- P1-B2: second primitive (`dedup-key-builder` — ComputeFingerprint/djb2, seed=5381 load-bearing). 6 ACs. G12 streak #2.
- P1-B3: third primitive (`cooldown-gate` — ShouldSuppressAlert; inject now time.Time for determinism). 7 ACs. G12 streak #3 — core-3 band complete.
- P1-B4: optional 4th primitive (`duplicate-checker` — IsDuplicate, 8 lines). 4 ACs. PM decides at P1-B3 close.
- P1-C: module stub (`alert_pipeline`) — ports (AlertRepositoryPort, MutePort, TelegramPort), composition of all 3 primitives, mock ports in tests. Fence-B baked. 7 ACs.
- P1-D: dashboard stub (3-panel: primitives + module + microservice). SI-2 disavowal HTML comment baked in. 7 ACs.
- P1-E: edit-rerun handler + G7 all-4 sub-gates (env audit + scenario grep + CGO build + edit→rerun cycle). 7 ACs.
- P1-G: QA close-gate. 5-criterion exit gate (adds G7 ZERO-CREDS as criterion 5, unique to alert-engine). 6 ACs. Emits phase1 close-gate signal.

**ZERO-CREDS headline risk baked into plan:**
- P1-A: AC-6 (CGO_ENABLED=0 build) + AC-7 (env audit) = BLOCKER before P1-B1.
- P1-B1: AC-6 (scenario JSON grep) = BLOCKER before P1-B2.
- P1-E: all 4 sub-gates proven simultaneously = definitive G7 evidence for Phase 1.
- P1-G: criterion 5 = G7 all-4 sub-gates must be CONFIRMED in close-gate signal.

**Goals advanced map:**
- G1: P1-B1+B2+B3 → EARNED-PENDING (core-3 band)
- G2: P1-C → EARNED-PENDING (alert_pipeline stub)
- G6: P1-D → EARNED-PENDING (dashboard stub, SI-2 disavowal)
- G7: P1-A+P1-E → EARNED-PENDING (all 4 sub-gates)
- G8: P1-D+P1-E → EARNED-PENDING (honest NOT-RUN)
- G12: P1-B1+B2+B3 → EARNED-PENDING (3-task streak)
- G3/G4/G5/G9/G10/G11: STILL-UNMET, Phase 2 work
- goalsEarned: stays 0; decisionMatrix stays TBD; §4.5 inviolable

**Phase 2 pre-revert tags noted (Phase 1 does NOT create them):**
- alert-engine-pre-ci (Phase 2 before .golangci.yml)
- alert-engine-pre-delete (Phase 2 before git mv to _deprecated/)
- alert-engine-pre-inject (Phase 2 before G10 bug injection)

**SI-2 boundary:** docs/dashboards/index.html is stock-price-EXCLUSIVE. alert-engine MUST NOT touch it. HTML comment baked into dashboard source (P1-D AC-6). Baked into Hard Constraints table.

**Fleet serialization:** INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION noted in Execution Notes + Hard Constraints. git diff --cached --name-only must be clear before staging.

**Files authored this cycle (L84 — 2 files):**
1. `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md` (NEW — D6 deliverable)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal to emit after commit:** `docs/signals/architect-alert-engine-phase1-plan-done-<UTC>.json` (next_actor: pm, next_actor_router: main-router)

**Anchor:** debba8eaff0724d1fb32fc9d28640201cc32d1cc — INTACT (verified before commit)

---

## alert-engine pilot-5 charter cycle (2026-05-24T04:00Z) — fleet pilot 5 Day 0

**Task:** Author alert-engine factory charter v2.0 and instantiate Day-0 SSOT. Authorization: `po-20260524T023538Z-alert-engine-pilot5-charter.json`.

**Service facts (jq-verified):** port=5006 (internal==external), zone=apps/alert-engine/, language=Go, runtime=go1.22+cgo, specialist=dev-alert-engine, DB=alert_engine.db.

**Brownfield scan findings:**
- All 4 DDD layers present. `domain/services.go` is 151 lines — already remarkably clean: 3 pure functions (ComputeFingerprint/djb2, IsDuplicate, ShouldSuppressAlert). Zero infra imports in domain or application layers.
- Infrastructure: sqlite.go uses mattn/go-sqlite3 (CGO), telegram.go uses net/http Telegram Bot API with 4 env vars (TELEGRAM_BOT_TOKEN + 3 chat IDs loaded from config.go).
- NO pkg/primitive/, NO pkg/module/, NO cmd/sandbox/, NO dashboard/ — RED verdict.
- G7 ZERO-CREDS is the headline risk: Telegram credentials must never appear in sandbox environment, scenario JSON, or primitive/module path.
- CGO boundary identical to stock-price: mattn/go-sqlite3 must not leak into primitive/module/sandbox; CGO_ENABLED=0 sandbox build proves fences.

**G1 primitives (3-5 band — narrowest domain yet):**
1. `signal-classifier` — severity string → AlertSeverity + channel selection (inlined in evaluate.go L126-130)
2. `dedup-key-builder` — ComputeFingerprint extracted as standalone primitive with scenarios
3. `cooldown-gate` — ShouldSuppressAlert extracted; inject `now` as param for determinism
4. `duplicate-checker` — IsDuplicate wrapper (6 lines, needs scenario coverage)
5. `alert-formatter` — Sprintf formatter inlined in evaluate.go L130 (optional, Phase 0 confirms)

**G7 zero-creds calibration (HEADLINE RISK):**
- Env audit: `env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"` must return empty.
- Scenario JSON grep: `grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/` must return 0.
- Sandbox: CGO_ENABLED=0 build exits 0.
- Edit→rerun cycle: works end-to-end.
- All 4 sub-gates required for G7 PASS.

**Key design decisions:**
- Module: `alert_pipeline` (single module, mute_gate deferred post-pilot).
- SI-2 boundary HARD: alert-engine builds ONLY apps/alert-engine/dashboard/index.html. docs/dashboards/index.html is stock-price-EXCLUSIVE. HTML comment baked into dashboard source.
- Pre-revert tags: alert-engine-pre-ci → alert-engine-pre-delete → alert-engine-pre-inject.
- Frozen anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc must remain ancestor of HEAD.
- Fleet-wide single-committer serialization noted in charter Execution Notes.
- Next actor = architect (Phase-1 task plan). main-router fans out via signal.

**SSOT check:** python3 dup-key check → "OK — day-0 scaffold clean: goalsEarned=0, 12 goals TBD, dm all-TBD"

**Files authored this cycle (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md` (NEW)
2. `docs/data/pilot-status-alert-engine.json` (NEW — git add -f for gitignored SSOT)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal to emit after commit:** `docs/signals/architect-alert-engine-charter-done-<UTC>.json`

---

## kinh-dich Phase-2 task plan cycle (2026-05-24T03:00Z) — fleet pilot 4 Phase 2 dispatch

**Task:** Author Phase-2 atomic task plan for kinh-dich factory pilot (fleet pilot 4, TS/Bun), per PO authorization signal `po-20260524T023538Z-kinh-dich-phase2-authorize.json`. Phase-1 gate = clean full GO (QA commit 34205c87, 6/6 dashboard cards, 14/14 sandbox, G12 streak 6/6).

**Key decisions:**
- 14 tasks (P2-KD-A through P2-KD-Z), 77 ACs total. WIP=1 sequential throughout.
- G-goal posture: EARNED-PENDING = G1 (carry-forward 4 prim, +1 in J), G2, G6, G7, G12. STILL-UNMET (Phase-2 work) = G3, G4, G5, G8, G9, G10, G11. goalsEarned=0. NO flips in Phase 2.
- G4 fence: ESLint eslint-plugin-boundaries (SI-3 Option A), NOT Go depguard. 4-task split: P2-KD-A (tag) + P2-KD-B (eslint.config.mjs + devDeps) + P2-KD-C (AC-4b violation proof, NEVER committed) + P2-KD-D (AC-4c freeze anchor). R-FENCE gate = AC-4b on real .js-suffixed ESM imports. R-2 fallback: @typescript-eslint/parser in-Option-A (5-min fix; NOT Option C).
- G5b scope: WIDE (brownfield §5 HIGH-RISK) — 6 MCP tools in kinhDichTools.ts use DIRECT domain imports from mcp-server parallel copy (apps/mcp-server/src/domain/services/kinhDich/). Full rewire needed: 6 tools → HTTP port 5005 + 4 new kinh-dich-service endpoints. Score helpers stay in mcp-server. P2-KD-G is the largest single task (~3h).
- G6 finalization: kinh-dich dashboard already EXISTS (Phase-1 DONE, 6/6 cards). P2-KD-J adds nuclear-hexagram-computer (5th primitive, deferred from Phase-1 OQ-1) + OpenAPI link + deprecated notice. SI-2 boundary HARD: kinh-dich MUST NOT touch docs/dashboards/index.html (stock-price exclusive).
- G8: honest-red via bun sandbox (not Go binary). Pattern: non-zero exit on corrupted scenario + zero on revert.
- G9: PO Playwright Path B Day-0 default (L6; Playwright 1.60.0 + cached chromium confirmed available).
- G10/G11: bug target = hao-encoder (threshold constant off-by-one). Pre-inject tag = P2-KD-M.
- Pre-revert tags: kinh-dich-pre-ci (P2-KD-A) → kinh-dich-pre-delete (P2-KD-E) → kinh-dich-pre-inject (P2-KD-M).
- Commits: 18b04bf5 (plan file) + 481b1bdc (signal). Only kinh-dich-factory dir touched. Anchor intact.
