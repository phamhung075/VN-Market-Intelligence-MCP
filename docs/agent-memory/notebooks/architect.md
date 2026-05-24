# Architect — Notebook

**Last updated:** 2026-05-24 05:30 UTC (alert-engine pilot-5 Phase-1 task plan) | **Sprint:** fleet-factory-rollout program

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

**Task:** Author Phase-2 atomic task plan for kinh-dich factory pilot (fleet pilot 4, TS/Bun), per PO
authorization signal `po-20260524T023538Z-kinh-dich-phase2-authorize.json`. Phase-1 gate = clean full GO
(QA commit 34205c87, 6/6 dashboard cards, 14/14 sandbox, G12 streak 6/6).

**Key decisions:**
- 14 tasks (P2-KD-A through P2-KD-Z), 77 ACs total. WIP=1 sequential throughout.
- G-goal posture: EARNED-PENDING = G1 (carry-forward 4 prim, +1 in J), G2, G6, G7, G12.
  STILL-UNMET (Phase-2 work) = G3, G4, G5, G8, G9, G10, G11. goalsEarned=0. NO flips in Phase 2.
- G4 fence: ESLint eslint-plugin-boundaries (SI-3 Option A), NOT Go depguard. 4-task split:
  P2-KD-A (tag) + P2-KD-B (eslint.config.mjs + devDeps) + P2-KD-C (AC-4b violation proof, NEVER committed)
  + P2-KD-D (AC-4c freeze anchor). R-FENCE gate = AC-4b on real .js-suffixed ESM imports.
  R-2 fallback: @typescript-eslint/parser in-Option-A (5-min fix; NOT Option C).
- G5b scope: WIDE (brownfield §5 HIGH-RISK) — 6 MCP tools in kinhDichTools.ts use DIRECT domain imports
  from mcp-server parallel copy (apps/mcp-server/src/domain/services/kinhDich/). Full rewire needed:
  6 tools → HTTP port 5005 + 4 new kinh-dich-service endpoints. Score helpers stay in mcp-server.
  P2-KD-G is the largest single task (~3h).
- G6 finalization: kinh-dich dashboard already EXISTS (Phase-1 DONE, 6/6 cards). P2-KD-J adds
  nuclear-hexagram-computer (5th primitive, deferred from Phase-1 OQ-1) + OpenAPI link + deprecated notice.
  SI-2 boundary HARD: kinh-dich MUST NOT touch docs/dashboards/index.html (stock-price exclusive).
- G8: honest-red via bun sandbox (not Go binary). Pattern: non-zero exit on corrupted scenario + zero on revert.
- G9: PO Playwright Path B Day-0 default (L6; Playwright 1.60.0 + cached chromium confirmed available).
- G10/G11: bug target = hao-encoder (threshold constant off-by-one). Pre-inject tag = P2-KD-M.
- Pre-revert tags: kinh-dich-pre-ci (P2-KD-A) → kinh-dich-pre-delete (P2-KD-E) → kinh-dich-pre-inject (P2-KD-M).
- Commits: 18b04bf5 (plan file) + 481b1bdc (signal). Only kinh-dich-factory dir touched. Anchor intact.

---

## stock-price Phase-2 task plan cycle (2026-05-24T00:00Z) — fleet pilot 3 Phase 2 dispatch

**Task:** Author Phase-2 atomic task plan for stock-price factory pilot (fleet pilot 3), per PO
authorization signal `po-stock-price-phase2-authorize-20260523T234647Z.json`. Phase-1 gate was GO.

**Key decisions:**
- 14 tasks (P2-A through P2-Z), 66 ACs total. WIP=1 sequential throughout.
- G-goal posture at Phase-1 close carried forward exactly: EARNED-PENDING = G1,G2,G6,G7,G8,G12;
  STILL-UNMET (Phase-2 work) = G3,G4,G5,G9,G10,G11; goalsEarned=0. NO flips in Phase 2.
- Pre-revert tags sequenced as standalone tasks: P2-A (stock-price-pre-ci before G4), P2-E
  (stock-price-pre-delete before G5a), P2-L (stock-price-pre-inject before G10 injection).
- G4 split across 4 tasks: P2-A (tag) + P2-B (.golangci.yml + CI job) + P2-C (AC-4b violation
  proof — reverted, NEVER committed) + P2-D (AC-4c freeze anchor confirmation). Mirrors macro pilot
  P2-A1/A2 structure, adapted for stock-price.
- G5a: git mv `pkg/domain/services.go` (ResolvePriceService) → `pkg/domain/_deprecated/services_v1.go`
  under stock-price-pre-delete tag. FetchPriceUseCase rewired to call price_resolution module.
- G5b: scope confirmed NARROW (brownfield §5) — HTTP client already present at port 5000 in
  clients.ts. No direct stock-price domain imports in any mcp-server tool handler. Audit only (P2-G).
- G5c: zero TODO.*migrat verification at P2-G.
- G3: composition root cleanup + OpenAPI YAML at P2-H. Fence-C: CGO SQLite wired at cmd/server/main.go.
- G6/SI-2: dashboard finalization + SI-2 fleet index docs/dashboards/index.html created at P2-I.
  stock-price is EXCLUSIVE owner of that file (first fleet pilot at G6, ratification Decision 3).
- G8: honest-red deliberate-break proof at P2-J (re-confirm of EARNED-PENDING from Phase 1).
- G9: PO Playwright Path B at P2-K (Day-0 default per L6; no synchronous user wait).
- G10/G11: bug injection (P2-L) then fix + 2-trial coupling proof (P2-M). Bug target =
  price-staleness-classifier (single-literal off-by-one). G11 Trial-1 from G10 injection +
  Trial-2 from a different primitive mutation.
- P2-Z: QA close-gate verifies 10 exit criteria. NO goal flips. PM transitions SSOT, PO does Phase 3.
- CGO constraint baked into every dev task: Fence-A/B/C in every primitive/module task;
  CGO_ENABLED=0 sandbox build checked in G12 DoD gate on every task.
- G12 DoD gate applied on P2-B, P2-F, P2-H, P2-I, P2-M (all dev tasks producing sandbox artefacts).
- Anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc: INTACT check baked into constraints table.
- .git/index.lock contention guidance explicit (kinh-dich pilot concurrently active).

**Files authored this cycle (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` (NEW)
2. `docs/signals/architect-sp-phase2-plan-done-20260523T235443Z.json` (NEW — PM pickup)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal for PM:** `docs/signals/architect-sp-phase2-plan-done-20260523T235443Z.json`

---

## P0-KD-4 phase-1-task-plan cycle (2026-05-23T23:12Z) — kinh-dich pilot-4 Phase 0 final deliverable

**Task:** Author Phase 1 task plan (TS/Bun) for kinh-dich factory pilot, mirroring stock-price Go sibling plan structure.

**Key decisions:**
- 9 tasks (P1-A through P1-G), 54 ACs total. WIP=1 sequential throughout.
- P1-A: Bun sandbox runner (zero-infra imports gate AC-6) + `config.ts` Bun.env one-liner fix (fold in as lowest-risk change).
- P1-B1: first primitive (`hexagram-resolver`) + R-FENCE discovery gate (AC-6+AC-7 — import style recorded, NOT AC-4b proof which is Phase 2 G4). R-FENCE discovery is the Phase 1 information gate; must be recorded before Phase 2 G4 is authored.
- P1-B2: second primitive (`ngu-hanh-classifier` — already exported, lowest complexity).
- P1-B3: third primitive (`hao-encoder` — threshold constants self-contained). G12 streak tasks = B1/B2/B3.
- P1-C: module stub (`reading_composer`) — MarkovPort reuse from existing `KinhDichRepositoryPort.getMarkovData()` (confirmed in brownfield §4, no new interface needed). `nuclear-hexagram-computer` deferred to Phase 2 (depends on hexagram-resolver stability).
- P1-D: dashboard stub (3-panel: primitives + module + microservice). Explicit SI-2 disavowal comment baked into HTML.
- P1-E: edit-rerun handler + env audit. No CGO_ENABLED=0 analog needed (pure TS/Bun).
- P1-F: optional `reading-scorer` 4th primitive (4 functions + 2 tables, medium leverage).
- P1-G: QA close-gate. Emits phase1 exit signal.
- NO P1 equivalent of R-CGO — no CGO in TypeScript. R-FENCE is discovery-only in Phase 1 (enforcement = Phase 2).
- G5b risk noted explicitly: 6 MCP tool rewires + 4 new HTTP endpoints = largest G5 in fleet to date. Phase 1 has ZERO G5b scope.

**Files authored this cycle (L84 — 2 files):**
1. `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md` (NEW — P0-KD-4)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal to emit after commit:** `docs/signals/architect-p0-kd-4-done-<UTC>.json`

---

## P0-KD-1 brownfield inventory cycle (2026-05-24T23:04Z) — kinh-dich pilot-4 Phase 0

**Task:** Read-only audit of apps/kinh-dich-service — DDD layer map, primitive candidates, module design, MCP handler audit, R-FENCE confirmation.

**Key findings:**
- All 4 DDD layers confirmed present and clean. domain/services.ts is the monolithic decomposition target (513 lines, all pure compute). Zero infra imports in domain or application layers.
- 5 primitive candidates all confirmed extractable from domain/services.ts (line numbers verified): hexagram-resolver (L272-281), hao-encoder (L245-266), ngu-hanh-classifier (L340-369, already exported), reading-scorer (L301-332), nuclear-hexagram-computer (L283-295).
- Module candidate: reading_composer. MarkovPort already exists as KinhDichRepositoryPort.getMarkovData() in domain/repositories.ts — no new interface needed.
- R-FENCE verdict: VIABLE. .js suffix confirmed in all domain/application/interface imports. eslint-plugin-boundaries element patterns will match resolved source paths. G4 deliberate-violation pair confirmed: hexagram-resolver (will exist) + ReadingRequest from src/application/dtos.ts (exists now).
- HIGH-RISK G5b finding: mcp-server has a PARALLEL COPY of kinhDich domain (apps/mcp-server/src/domain/services/kinhDich/, 11 files). All 6 MCP kinh-dich tools (get_kinhdich_reading, get_market_hexagram, get_hexagram_history, get_transition_probabilities, run_hexagram_backtest, explain_hexagram) use direct domain imports — NOT HTTP. 4 new endpoints needed on kinh-dich-service for full G5b rewire.
- Minor: config.ts uses process.env instead of Bun.env (dev-standards violation).

**Files authored this cycle (L84 — 2 files):**
1. `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` (NEW — in commit 7d5e8784 via PM co-commit)
2. `docs/signals/architect-kinh-dich-p0-kd-1-done-20260524T230418Z.json` (NEW — commit 335f037a)

**Commits:** brownfield doc: 7d5e8784 | signal: 335f037a

---

## kinh-dich pilot-4 charter cycle (2026-05-24T00:00Z) — pilot-4 Day 0

**Task:** Draft kinh-dich pilot-4 charter v2.0 and instantiate SSOT. Authorization: `po-pilot4-kinh-dich-open-20260523T223738Z.json`. Gate conditions met: SI-3 FINAL + stock-price cleared Phase 0.

**Service facts (jq verified):** port 5005 (internal==external), zone apps/kinh-dich-service, language ts, runtime bun, specialist dev-kinh-dich.

**Brownfield scan (Day 0):**
- All 4 DDD layers in src/: domain/, application/, infrastructure/, interface/ + composition root src/index.ts.
- NO src/primitive/, NO src/module/, NO sandbox/, NO dashboard/ — RED verdict, correct for Phase 0.
- domain/services.ts is the decomposition target: computeReading() (full reading orchestration) + classifyNguHanh() (exported) + 5 internal helpers (resolveHexagram, encodeHaos, computeHoQue, computeBienQue, extractOutcomeScore/TrendScore/majorityVote). Zero infra imports — pure compute.
- Embedded hexagram library (TRIGRAM_LINES, QUE_META 64 entries, QUE_DATA 64 entries) inside domain/services.ts.
- No ESLint config exists — clean slate for SI-3 Option A.
- package.json: dependencies={hono}, devDependencies={bun-types, typescript} — no eslint yet.
- Zero CGO/SQLite dependency in primitive/module path — naturally clean for G7 zero-creds.

**Primitive candidates confirmed:** hexagram-resolver (resolveHexagram), hao-encoder (classifyHao+encodeHaos), ngu-hanh-classifier (classifyNguHanh — already exported), reading-scorer (extractOutcomeScore+TrendScore+majorityVote), nuclear-hexagram-computer (computeHoQue+computeBienQue). Dev-kinh-dich confirms exact 3-5 subset in Phase 0.

**G4 transcription:** SI-3 §5 carried VERBATIM with <svc>→kinh-dich-service. Fence tool = eslint-plugin-boundaries (Option A) in eslint.config.mjs. AC-4a/4b/4c verbatim. Deliberate-violation path = src/primitive/hexagram-resolver/index.ts (real primitive, will exist at G4 time). G4 LOCKED at charter v1 (SI-3 §5 "spec is final at charter v1").

**R-FENCE gate:** novel-tooling risk (first TS service exercising eslint-plugin-boundaries). R-2 risk (.js-suffixed ESM imports) documented in charter §R-FENCE Boundary Clause. Phase-0/Phase-1 gate = AC-4b deliberate-violation proof. Fallback = add @typescript-eslint/parser (5-min in-Option-A, NOT Option C).

**SI-2 ownership:** confirmed NOT kinh-dich's. Charter §G6 + SSOT G6.calibration explicitly state SI-2 = stock-price's G6 deliverable. kinh-dich G6 = apps/kinh-dich-service/dashboard/index.html only.

**Files authored this cycle (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` (NEW — charter v2.0)
2. `docs/data/pilot-status-kinh-dich.json` (NEW — SSOT Day 0, requires git add -f)
3. `docs/signals/architect-kinh-dich-charter-draft-done-20260524T000005Z.json` (NEW — PO ratification signal)
4. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal for PO ratification:** `docs/signals/architect-kinh-dich-charter-draft-done-20260524T000005Z.json`

---

## P0-EXIT-GATE verification cycle (2026-05-23T22:33Z) — stock-price factory Phase 0

**Task:** Independent technical-completeness verification of all 6 Phase-0 deliverables before PO ratifies gate. Emit signal to docs/signals/.

**Verification outcome: GATE-PASS — all 6 deliverables verified PASS.**

- P0-SP-1 (brownfield, debba8ea): PASS. File exists (20795 bytes). R-CGO=FEASIBLE confirmed in §6 of inventory. Primitive candidates (3 primary + 1 optional), module=price_resolution, port=TierFetcher. G5b narrower than expected (HTTP clients already in place).
- P0-SP-2 (bug-inventory, 32d77e60): PASS. stock_price_baseline present with baselineCycleCount=1.5 (1 bug in 60d window, <2 threshold = system-wide fallback per charter). JSON valid (jq exit 0). Key in file is 'stock_price_baseline' (charter-aligned).
- P0-SP-3 (agent+flow baking, 4a04bb96): PASS. Both files on disk (agent 10638 bytes, flow 9245 bytes). G12 DoD Gate baked (§Pilot Hard Rule section). R-CGO Gate baked (§R-CGO Gate, 3-step sequence). Fence-A/B/C baked (§Fence Rules). Pre-revert tag protocol baked (stock-price-pre-ci/-delete/-inject). YAML valid per PM signal.
- P0-SP-4 (anchor commit, df7d3d7a): PASS. anchor=debba8eaff0724d1fb32fc9d28640201cc32d1cc (40-char hex valid). Ancestor of HEAD confirmed (git merge-base exit 0). SSOT phase=1, phase0.status=CLOSED. Zero tags pointing at anchor (frozen).
- P0-SP-5 (R-CGO, e9da9a7c): PASS. Verdict=CLEAR. CGO_ENABLED=0 build exit 0. grep mattn in domain/app/interface = 0 matches. cmd/sandbox stub exists with stdlib-only imports. Phase-1 gate template ACs ready for P1-B1.
- P0-SP-6 (phase-1 plan, debba8ea): PASS. File 34124 bytes, 9 tasks (P1-A..P1-G), 55 ACs. R-CGO gate baked into P1-B1 (AC-5/6/7/8, hard BLOCKER). G12 streak = P1-B1/B2/B3. Critical path documented. 7 OQs resolved.

**SSOT invariants:** decisionMatrix present-but-empty (speed/trust/scale/verdict all TBD, populatedAt=null) — correct per charter §4.5 (PO-only, 12/12 terminal only). No code in pkg/primitive or pkg/module yet.

**Signal emitted:** docs/signals/architect-p0-exit-gate-stock-price-20260523T223331Z.json (GATE-PASS, ready_for_po_review=true)

**Files written this cycle (L84 — 2 files):**
1. `docs/signals/architect-p0-exit-gate-stock-price-20260523T223331Z.json` (NEW — exit gate signal)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

---

## P0-SP-1 + P0-SP-6 cycle (2026-05-24) — stock-price factory Phase 0 deliverables

**Task:** Two sequential Phase 0 deliverables for stock-price factory pilot #3 (fleet pilot 1).

**Brownfield findings (P0-SP-1):**
- All 4 DDD layers already present and structurally clean. Total Go source LOC: ~734. Single CGO dependency (`mattn/go-sqlite3 v1.14.22`) isolated to `pkg/infrastructure/fetchers.go` L15 only.
- Domain layer (models.go, ports.go, services.go): ZERO infra imports. services.go uses only `sync` stdlib.
- Application layer (usecases.go): ZERO infra imports. Imports domain only.
- Interface layer (router.go): ZERO CGO. Imports application + domain (error type mapping only).
- Composition root (cmd/server/main.go): imports pkg/infrastructure but does NOT directly import mattn/go-sqlite3.
- R-CGO verdict: **FEASIBLE** — CGO strictly isolated to one file in infrastructure. Sandbox CGO_ENABLED=0 build viable.
- Primitive set confirmed: 3 primary (price-quote-normalizer ★★★, tier-fallback-selector ★★★, price-staleness-classifier ★★) + 1 optional (ohlcv-aggregator ★). exchange-code-router deferred (no ticker lookup table exists).
- Module candidate: `price_resolution` — port interface `TierFetcher{FetchPrice(code string) (*domain.PriceQuote, error)}`.
- G5a: ResolvePriceService in domain/services.go is the predecessor — defer _deprecated/ move to Phase 2.
- G5b: **Narrower than expected.** HTTP integration already in place: `fetchStockPrice` + `getPriceHistory` in clients.ts route to port 5000. No direct domain imports in any market-data tool handler. G5b is a Phase 2 routing decision (optional route of priceHistoryTools.ts + tickerIntelligenceTools.ts via Go service).

**Phase-1 plan decisions (P0-SP-6):**
- 9 tasks (P1-A through P1-G), 55 ACs total.
- P1-A: sandbox runner (CGO_ENABLED=0 pre-check as AC-5 = hard gate before P1-B1).
- P1-B1: first primitive (price-quote-normalizer) + R-CGO gate baked in (AC-5/6/7/8). R-CGO GATE is a BLOCKER.
- P1-B2/B3: 2nd and 3rd primitives (tier-fallback-selector, price-staleness-classifier). R-CGO inherited.
- P1-C: module stub (price_resolution) — TierFetcher port + composition. Fence-B baked in AC-2.
- P1-D: dashboard stub — 3-panel standard (primitives + module + microservice).
- P1-E: edit-rerun + env audit. CGO_ENABLED=0 rerun command explicit in AC-2.
- P1-F: optional ohlcv-aggregator 4th primitive (flex bucket).
- P1-G: QA close-gate verification.
- G12 streak: P1-B1 (#1), P1-B2 (#2), P1-B3 (#3). First 3 sandbox-green tasks.
- Critical path: P1-A → P1-B1 [R-CGO chokepoint] → P1-B2 → P1-B3 → P1-C → P1-D → P1-E → P1-G.
- WIP=1 sequential throughout.
- Key OQ resolved: G5b no mandatory rewire, ohlcv-aggregator optional P1-F, exchange-code-router deferred, no new go.mod deps needed.

**Files authored this cycle (L84 — 4 files):**
1. `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md` (NEW — P0-SP-1)
2. `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` (NEW — P0-SP-6)
3. `docs/signals/architect-p0sp1-p0sp6-done-20260523T222607Z.json` (NEW — completion signal)
4. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal for PM:** `docs/signals/architect-p0sp1-p0sp6-done-20260523T222607Z.json`

---

## SI-3 cycle (2026-05-24) — TS ESLint architecture-fence spike

**Task:** Design ESLint equivalent of Go depguard for TS services (kinh-dich + news-fetch). Output: `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md`.

**Decision: Option A — `eslint-plugin-boundaries` v6.0.2.** Within 1 sprint: YES. G4 AC text ready: YES. Option C NOT recommended.

**Brownfield findings:**
- kinh-dich and news-fetch have zero ESLint config today. Clean slate — no migration needed.
- Both use Bun 1.x runtime, `moduleResolution: "bundler"`, `.js` extension in relative imports.
- No `tsconfig.json` path aliases. Option B (tsconfig aliases + grep) was rejected as weaker than depguard.
- No `src/primitive/` or `src/module/` yet — config is authored at charter time, frozen at G4 close (same as golangci.yml).

**Design outcome:**
- Single `eslint.config.mjs` per service using flat config API.
- Three rules via `boundaries/element-types`: Fence-A (primitive→no module/app/interface/infra), Fence-B (module→no app/interface/infra), Fence-C (any non-composition-root→no infrastructure).
- CI command: `bunx eslint src/ --max-warnings 0` (exits non-zero on any violation).
- Violation proof recipe (AC-4b): inject a Fence-A import in a primitive file, confirm "Fence-A" in output + non-zero exit, revert, confirm exit 0 + git clean.

**Key risk:** R-2 — `.js`-suffixed import strings and plugin pattern matching. Confirmed mitigation: fallback is adding `@typescript-eslint/parser` (5-min change, stays Option A). Dev must confirm empirically in AC-4b before G4 closes.

**PO action:** Transcribe §5 of `00-design.md` verbatim into pilot-4 kinh-dich charter G4 section. Same text applies to pilot-6 news-fetch.

**Files authored this cycle (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` (NEW — full design + violation recipe + AC text)
2. `docs/signals/architect-si3-ts-fence-done-20260523T220332Z.json` (NEW — PO pickup signal)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

---

**Last updated:** 2026-05-23 (fleet-factory-rollout roadmap) | **Sprint:** fleet-factory-rollout program brief

## Fleet-Factory-Rollout cycle (2026-05-23) — program roadmap brief

**Task:** Author fleet-factory-rollout brief (user goal: complete factory for all microservices, each with working dashboard). READ-ONLY brownfield survey + brief authoring only. No apps/** modified.

**Brownfield findings:**
- 11 services total; 3 excluded from factory scope (api-gateway=pure router, mcp-server=orchestrator, frontend=UI)
- 2 GREEN (TA+macro — both pilots DONE 2026-05-23)
- 5 RED (kinh-dich, stock-price, alert-engine, pdf-extractor, rag-service)
- 1 YELLOW (news-fetch — DDD exists, no primitives, no dedicated dev agent)
- Go services (stock-price, alert-engine): depguard fence proven, zero new tooling needed
- TS services (kinh-dich, news-fetch): ESLint fence rule NOT YET DESIGNED — SI-3 spike needed before G4 credible
- Python services (pdf-extractor, rag-service): Python fence tool UNDEFINED — SI-4 spike needed; defer to pilots 7+8
- news-fetch zone specialist = `developer` (generic) — SI-5 agent file creation needed

**Pilot sequence: 3=kinh-dich (TS), 4=stock-price (Go), 5=alert-engine (Go), 6=news-fetch (TS), 7=pdf-extractor (Python), 8=rag-service (Python)**

**Shared infra prework (SI-1..SI-5):**
- SI-1: fleet SSOT schema (agent-father, ~1-2h, do now)
- SI-2: fleet dashboard index (dev-kinh-dich at G6 of pilot 3)
- SI-3: TS ESLint fence design (architect spike, before pilot 3 charter)
- SI-4: Python fence tool decision (architect spike, before pilot 7)
- SI-5: dev-news-fetch agent file (agent-father, before pilot 6)

**Key risk flags:**
- SI-3 HIGH: TS fence rule is the G4 gate for 2 services (kinh-dich + news-fetch). Must be designed before pilot 3 charter locks G4 criteria.
- alert-engine G7: Telegram credentials MUST NEVER appear in sandbox environment. Hard gate.
- Python trace JSON format: Python narrator equivalent must be designed in SI-4 spike.
- WIP=2 max: no more than 2 pilot charters ACTIVE simultaneously.

**Files authored this cycle (4 files — L84):**
1. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/00-roadmap.md` (NEW)
2. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/01-service-inventory.md` (NEW)
3. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/02-phasing.md` (NEW)
4. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/03-dashboard-standard.md` (NEW)

**Next dispatch:** PO to ratify brief → author pilot 3 (kinh-dich) charter. Architect spike on SI-3 (TS fence) should be scheduled first or in parallel with PO ratification.

---

## Cycle-22 entry (2026-05-23T12:22Z) — macro-indicators Phase 2 task plan

**Task:** Author Phase 2 task plan for macro-indicators pilot (c282-cycle-22), per PO dispatch signal `po-cycle21-dispatch-architect-phase2-spec-20260523T121526Z.json`. Phase 1 gate was GO (4/4 criteria PASS, G12 EARNED-PENDING, 2026-05-23T12:15:26Z).

**Brownfield pre-read (confirms prior Phase 0 findings):**
- 4 MCP tool files read: `macroTools.ts` (668L), `carryTools.ts` (199L), `dinhGiaTools.ts` (162L)
- R-3 confirmed HIGH: `macroTools.ts` imports `fetchYahooFinancePrices`, `fetchSbvRates`, `computeCarryTradeSignal`, `computeYieldSpreadSignal` directly. `carryTools.ts` imports `computeCarryTradeSignal`, `getMacroCalendar` directly. `dinhGiaTools.ts` imports `computeYieldSpreadSignal` directly.
- Go router (`router.go`) has only `/health` + `/snapshot` (501 stub). Needs 3 new routes for P2-B1.
- Existing Go primitive: `macro_investment_clock/` only. Phase 2 adds 5 more.
- `api/openapi.yaml` documents `/health` + `/snapshot` only (needs extension for new routes).
- Anchor `1776df8e` confirmed ancestor via `git log --ancestry-path` check.

**Phase 2 plan decisions:**
- **WIP=1** (no parallel P2-A + P2-B) — R-3 unblock is highest priority; splitting focus before R-3 clears risks errors. P2-A1 follows P2-B1.
- **14 tasks** across 6 logical buckets (B, A, X, G, F, C, D, E).
- **G6/G7 treated as DONE** from Phase 1 (P1-E1/P1-E2 QA-verified GREEN) — no Phase 2 task needed. QA re-confirms at P2-G1.
- **P2-B1 scope clarified:** dev-mcp-server agent (not dev-macro-indicators) — it touches the mcp-server TS zone. Go handler stubs (handlers_carry.go, handlers_yield.go, handlers_calendar.go) are co-delivered in P2-B1 to avoid zombie stub period.
- **Pre-revert tags:** macro-pre-ci (before P2-A2), macro-pre-delete (before P2-B2), macro-pre-inject (before P2-D1) — all explicitly wired into task specs.
- **Critical path:** P2-B1 → P2-A1 → P2-A2 → P2-B2 → P2-B3 → P2-X1 → P2-X2 → P2-X3 → P2-G1 → P2-F1 → P2-C1 → P2-D1 → P2-D2 → P2-E1 → Phase 3.
- **OQ-7..OQ-10** authored for PM (scraper strategy, stub vs real impl, calendar port scope).

**Risk flags surfaced for PM:**
- P2-B1 requires both TS handler rewire AND new Go HTTP endpoints in same task — scope is larger than TA's equivalent P2-B1 (which only rewired TS, Go endpoint was already live). Dev agent must not split these across commits.
- Scraper sidecar (Option A from brownfield §9): TS scrapers stay in place providing data to Go service. P2-X3 snapshot endpoint implementation will need to call scrapers via some mechanism — PM must clarify in OQ-8.
- G6/G7 no-task assumption: if dashboard regresses during P2-X1..X3 (primitive cards added), QA must catch at P2-G1. The assumption is safe but PM should make it explicit in P2-G1 handoff.

**Files authored this cycle (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` (NEW — 14 tasks, per-task AC, sequencing diagram, goal coverage matrix, WIP decision)
2. `docs/signals/architect-cycle22-phase2-plan-ready-20260523T122207Z.json` (NEW — PM pickup signal)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal for PM:** `docs/signals/architect-cycle22-phase2-plan-ready-20260523T122207Z.json`

---

## Cycle-29 entry (2026-05-23T10:30Z) — macro-indicators Phase 0 deliverables

**Task:** Execute Phase 0 for macro-indicators factory v2 (5 deliverables per po-macro-pilot-kickoff-20260523T093857Z.json).

**Brownfield findings (D1):**
- Total LOC: 1 936 (934 core src + 1 002 scrapers)
- DDD layers: MOSTLY CLEAN — `domain/` has zero infra imports (golden rule holds)
- Critical finding: `scoreIndicator()` uses `Math.random()` — non-deterministic, must fix in P1-B1
- Critical finding: 4 of 7 MCP tools (get_macro_snapshot, get_carry_trade_signal, get_yield_spread_signal, get_macro_calendar) bypass the macro-indicators HTTP layer entirely — direct domain imports in mcp-server (G5b is more extensive than a simple HTTP swap)
- 8 scrapers: 7 live, 1 WONTFIX null-stub (investing-economic-calendar)
- No `pkg/` directory exists — Phase 0 exit gate confirmed clean

**Primitive selection (D1 §7):** 6 primitives selected:
1. macro-investment-clock (first — pure classifier, no live data)
2. macro-oil-impact-classifier (pure threshold function)
3. macro-gold-direction-classifier (same shape)
4. macro-usdvnd-direction-classifier (same shape)
5. macro-carry-trade-signal (ported from mcp-server domain)
6. macro-yield-spread-signal (ported from mcp-server domain)
Module: macro-signals only (defer macro-core to post-pilot per charter §G2 calibration)

**Bug inventory (D2):** Zero macro-specific bugs in 60-day window. Baseline falls back to system-wide 1.3 cycles. R-1 Math.random() risk documented in macro_indicators_baseline knownRiskPre_pilot.

**Agent + flow (D3/D4):** dev-macro-indicators.md updated to version 2026-05-23 (Go primary mode, G12 DoD Gate constraint, 3 new lazy_load entries). Flow main.md updated with Language Mode table + Smoke Checks + G12 DoD Gate + Security Rule + Fence Rules + Pre-revert tag protocol — verbatim TA pilot flow shape per cc7578f1 pattern.

**Phase 1 task plan (D5):** 11 atomic tasks (P1-A1..A5 + B1 + C1 + D1 + D2 + E1 + E2). First primitive = macro-investment-clock. WIP=1. Phase 1 exit gate: ≤4h to first primitive, sandbox green, dashboard render ≥90%. OQ-4 flagged: no dev-frontend in Phase 1 — dev-macro-indicators owns dashboard stub.

**Key risk flags for PM/PO:**
- R-3 (HIGH): MCP tool G5b rewire is deeper than TA's — 4 tools must shift from direct domain calls to HTTP. Phase 2 P2-B must include mcp-server rewire spec, not just `git mv` on macro-indicators src.
- R-1 (HIGH): Math.random() fix required in P1-B1 before any stable scenario JSON can be authored.
- Scraper strategy: Option A (keep TS scrapers side-car in Phase 1). Phase 2 P2-B decides whether to port or deprecate.

**Files authored this cycle (L84 — 6 files):**
1. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` (NEW — D1)
2. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` (NEW — D5)
3. `.claude/agents/dev-macro-indicators.md` (MODIFIED — D3 Go pilot update)
4. `.claude/flows/dev-macro-indicators/main.md` (MODIFIED — D4 G12 DoD Gate + Language Mode + Security)
5. `docs/data/bug-inventory.json` (MODIFIED — D2 macro baseline entry)
6. `docs/agent-memory/notebooks/architect.md` (this entry)

**Completion signal:** `docs/signals/architect-macro-phase0-done-<UTC>.json` (to be written after commit)

---

## Cycle-22 amendment entry (2026-05-23T08:30Z) — AC-4c freeze-anchor path-B decision

**Task:** Resolve AC-4c collision: freeze-anchor `9561fee9` vs cycle-20 commit `9d364329` on `.golangci.yml`.

**Decision: Path B — amend AC-4c, accept `9d364329` as new freeze anchor.**

**Evidence reviewed:**
- `git show 9d364329 -- apps/technical-analysis/.golangci.yml`: pure v2→v1 format key rename. All three fence rules (fence-a, fence-b, fence-c) + Main allow-list are semantically identical. No rule added, removed, weakened, or renamed.
- `git log --oneline apps/technical-analysis/.golangci.yml`: exactly two commits — `9561fee9` then `9d364329`. No other drift.
- `.github/workflows/ci.yml` line 70: confirms `golangci-lint-action@v6.1.1` (frozen, out of scope).

**PO's premise verified correct:** `golangci-lint-action@v6.1.1` installs v1.64.8 which exits code 3 on v2-format config. The v2→v1 conversion was a real tooling-compatibility necessity, not arbitrary config drift.

**Path A ruled out:** Reverting `9d364329` to v2 format and finding an alternate fix requires touching `ci.yml` (pin action to v2-compatible version). `ci.yml` is frozen by the same out-of-scope clause as `.golangci.yml`. Path A has no viable exit without a double scope violation.

**Amendment authored:**
- `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` — §Amendment 1 appended (collision evidence + tooling-compat justification + revised AC-4c text + TASK_P2-A4 re-edit requirements).
- `docs/signals/architect-g4-ac4c-amendment-20260523T083000Z.json` — architect signal to PO.
- `docs/agent-memory/notebooks/architect.md` — this entry.

**PO must re-edit TASK_P2-A4.md:** YES — replace freeze anchor `9561fee9` with `9d364329` in AC-4c prose + §Evidence to Record verdict guide + retract the "Known collision" warning note.

**No dev-ta re-dispatch needed:** `9d364329` is already on `main`. dev-ta cycle-22 fix work (lint findings → exit 0) proceeds under AC-1/2/3 unchanged.

**Files authored this amendment (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` (appended §Amendment 1)
2. `docs/signals/architect-g4-ac4c-amendment-20260523T083000Z.json` (PO pick-up signal)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

---

**Last updated:** 2026-05-23 07:28 UTC | **Sprint:** Phase 2 — G4 AC revision (cycle-22)

## Cycle-22 entry (2026-05-23T07:28Z) — G4 acceptance revision

**Task:** Re-plan G4 acceptance criteria to remove whole-CI dependency while preserving architecture-fence intent.

**Root cause of revision:** AC-4 in `po-cycle20-dispatch-dev-ta-fix-go-lint-20260523T064034Z.json` required `CI go-lint job exits 0 on rerun`. The `bun test` job is structurally red until G5 deletion chain (P2-B2..B4) completes — so the whole workflow run conclusion is `failure` regardless of `go-lint` exit code. The per-job JSON extraction path (`gh run view --json jobs --jq select(.name=="go-lint")`) is technically possible but fragile (3 independent failure surfaces: job name stability, API shape, agent correctly reading job-level vs run-level conclusion).

**Architectural decision:** Offline deliberate-violation proof is logically equivalent to CI-red proof for grading purposes. The charter's original G4 text says "proven by 1 deliberate violation in PR" — but the proof is the linter catching the violation, not the CI run URL. Local run achieves the same logical proof with zero external dependencies.

**Revised AC structure (7 criteria vs 5 original):**
- AC-1/2/3: unchanged (local golangci-lint + go test + sandbox)
- AC-4a: verify go-lint job wiring in `.github/workflows/ci.yml` by file read (deterministic, no API)
- AC-4b: run deliberate Fence-A violation locally, confirm depguard blocks it, revert, confirm exit 0 — paste linter output to `TASK_P2-A4.md §Evidence to Record`
- AC-4c: confirm `.golangci.yml` frozen post-P2-A1 via `git log --oneline apps/technical-analysis/.golangci.yml`
- AC-5: completion signal with new field `g4_ci_dependency_dropped: true`

**Migration recommendation to PO:** SUPERSEDE (not amend). Clean supersede avoids stale AC-4 text confusing cycle-21 grading agent. PO re-dispatches dev-ta for fix work (AC-1/2/3 unchanged) and re-dispatches QA for P2-A4 with revised AC-4a/4b/4c.

**G5 chain impact:** None — gate rule unchanged. G4=YES unblocks P2-B2 deletion dispatch as before. Fence proven earlier because offline proof has no CI billing dependency.

**Files authored this cycle (L84 — 3 files max):**
1. `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` (revised spec)
2. `docs/signals/architect-g4-revision-20260523T072817Z.json` (PO pick-up signal)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal for PO:** `docs/signals/architect-g4-revision-20260523T072817Z.json`

---

**Last updated:** 2026-05-23 22:18 UTC | **Sprint:** Phase 2 kickoff (technical-analysis pilot)

> Archive: `docs/archive/notebooks/architect-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current session (2026-05-23 — Phase 2 task plan expansion)

Phase 2 skeleton (PO) expanded into 20 atomic per-task specs across 6 buckets (P2-A through P2-F). Key decisions:

**Fence linter (G4/P2-A):** `golangci-lint + depguard` selected. Config at `apps/technical-analysis/.golangci.yml`. Three rules: Fence-A (primitive must not import module/application/interface), Fence-B (module must not import application/interface), Fence-C (infrastructure only importable from cmd/server/main.go). CI job `go-lint` added as parallel job in `.github/workflows/ci.yml`. Deliberate-violation proof: P2-A4 commits a Fence-A violation, confirms CI red, reverts, confirms CI green.

**P0-1 bug-inventory (G10/P2-D):** `docs/data/bug-inventory.json` EXISTS (created 2026-05-22). 2 TA-specific bugs. `baselineCycleCount = 1.5` (TA-specific measured average — replaces charter's system-wide 4-6 estimate). P2-D0 is a 10-min verification only. No system-auditor preflight needed.

**Brownfield scan (G5/P2-B):** 3 TS files confirmed as targets in mcp-server: `technicalIndicators.ts` (domain service, delete target), `technicalIndicatorTools.ts` (MCP tool handler, rewire to HTTP port 5003), `1302-technical-indicators.test.ts` (quarantine). The HTTP client infrastructure is ALREADY in `clients.ts` (port 5003 entry). P2-B1 rewire is low-risk. Rollback strategy: tag `p2-b-pre-delete` before deletion commits.

**Flow rule (G12/P2-F):** Flow-rule brief authored at `docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md`. Targets the existing "Pilot Hard Rule" section in `dev-technical-analysis/main.md` — surgical upgrade to a numbered step block with exact sandbox commands. agent-father implements P2-F2. G12 streak: 1/3 complete (QA-P1-closure), tasks #2+#3 come from P2-D3 + P2-E3.

**Sequencing:** P2-F2 (agent-father) is critical path — must land before P2-D2 + P2-E2 dispatch so streak tasks accrue under the rule. P2-A1 + P2-B0 can run in parallel with P2-F2 (independent). P2-E gates on P2-F2 + P2-D3 pattern stabilization.

**Signal to PM:** `docs/signals/architect-20260523T221805Z.json` — first dev tasks: P2-F2 (agent-father) + P2-A1 (dev-technical-analysis) in parallel.

## Previous session (2026-05-22 — TASK_P0-2 pilot-status.json seed)

`docs/data/pilot-status.json` created as SSOT for PO pilot tracker. Valid JSON, 12 goals (G1–G12), all status=TBD. Track A = G1–G5 (Trust Foundation), Track B = G6–G9 (Dashboard Trust), Track C = G10–G12 (AI-Fixability Proof). decisionMatrix seeded with speed/trust/scale (all TBD) plus outcome labels (scale/rescope/stop-MVR). Status=ACTIVE, verdict=TBD. sprintKickoff/sprintDeadline left as "TBD" for PO to fill at kickoff. charterVersion=1.0, charterRef points to pilot-charter.md.

## Previous session (2026-05-22 — technical-analysis pilot charter v1.0)

Pilot charter created at `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`. Binding contract for the `technical-analysis` microservice refactor pilot. 12 goals across 3 tracks: Track A (trust foundation: G1–G5), Track B (dashboard trust layer: G6–G9), Track C (AI-fixability proof: G10–G12). Decision matrix: 3-YES → scale to macro-indicators, 2-YES → re-scope, 0-1 YES → MVR fallback. Hard deadline: 6 sprints from kickoff. Security clause: sandbox process env audit required at G7 — zero DB creds / zero API keys. `docs/data/bug-inventory.json` flagged as non-existent; creating it is a Phase 0 deliverable. `docs/data/pilot-status.json` nominated as runtime tracking SSOT for PO pilot tracking step. PO flow (`flows/po/main.md`) updated with lazy-load-guarded "Pilot Tracking" section (22 lines): reads pilot-status.json, blocks sprint planning if 4+ goals NO past sprint 3, triggers review prompt when all 12 YES. Master brief index (v2.3) updated: scope column added (PILOT/Scale/Both), pilot-charter.md entry at top, PILOT GATE note added to Phase Summary. Brownfield scan confirmed: `apps/technical-analysis/` already has 9 source files with DDD structure (domain/app/infra/interface layers present but composition-root.ts does not yet exist); `apps/mcp-server/src/domain/services/technicalIndicators.ts` is the canonical G5 deletion target.

## Previous session (2026-05-22 — QA gate checklists v1.0)

QA gate checklists created for all 25 metrics (7P + 7M + 6S + 5X). 100 metric gates + 9 phase exit gates + 4 standing-rule checks. 10 NEEDS SHARPENING flags across P-4 L2 (scenario type field), P-4 L3 (sandbox-kit CLI), P-7 L2/L3 (dashboard render CLI + browser interaction), M-1 L0 (domain label in contract.md), M-2 L1 (business logic definition), M-2 L3 (bun test mock syntax), M-2 L4 (custom inline-logic lint rule), M-3 L3 (standalone module build), M-4 L2/L3 (scenario type field + primitiveTrace), M-5 L0 (naming convention), M-7 L2/L3 (same as P-7), S-1 L3 (port satisfaction test), S-2 L3 (module boundary mock), S-3 L2 (adapterType field), S-3 L3 (3-level zoom browser), S-4 L4 (15-min health polling), S-5 L3 (tsconfig path restriction), S-6 L2/L3/L4 (dashboard CLI + browser), X-1 L1 (bug inventory JSON), X-2 L2 (debt retirement condition field), X-4 L1 (bun run dashboard command), X-4 L3 (coverage badge data-attribute), Phase 5 exit (PO approval artifact), Phase 6 exit (branch protection via gh API), SR-1 (task type tagging), SR-3 (stale grep cross-platform). Master brief bumped to v2.2. `docs/data/metric-ladder.json` nominated as SSOT for artifact levels. 10 flags total requiring metric-definition refinement before those specific QA items can be mechanically verified. Files: qa-gates/ (10 files). Pointer: `docs/architecture-briefs/2026-05-22-refactor/qa-gates/00-index.md`.

## Previous session (2026-05-22 — Deep Module DDD v2.1 — constraints + mitigations amendment)

Pre-PO review surfaced 7 constraints + 4 mitigations. Brief amended in-place across 6 files (no rewrites, surgical additions only). New metric X-5 (Architectural Fence Enforcement) added — total now 25 auditable metrics. P-2 gains trivial-primitive exemption for pure functions (3-question test). `07-phases.md` gains Standing Rules section (70/30 capacity, module-freeze, phase-exit gates), Phase 1→2 go/no-go gate with 4 measurable criteria, and Phase 1 dogfood-first ordering. `10-validation-rituals.md` gains Scenario-Refresh Ritual (monthly per module, quarterly system-auditor scan). `11-open-questions.md` extended with accepted-by-default mitigations M-1–M-4. Master index bumped to v2.1 with new §9 constraints/mitigations table and updated metric counts. `08-sandbox-dashboards.md` gains build-sequence constraint note. All 7 constraints addressed, all 4 mitigations baked in.

## Previous session (2026-05-22 — Deep Module DDD v2 complete plan)

Three-tier refactor plan completed. Master brief at `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` + 11 sub-documents in `2026-05-22-refactor/`. Key numbers: 24 auditable metrics (7P+7M+6S+4X), 48 proposed primitives, 11 proposed modules, 7 phases, 14-18 sprints total (parallel tracks). 10 bugs mapped with structural kill conditions. 10 open questions for PO — all have recommended defaults; approving defaults unblocks Phase 0+1 immediately. Critical DDD violation: interface layer imports from domain/services/index.ts in 10+ tool handler files — root cause of entire refactor. sandbox-kit placed in `packages/primitives/sandbox-kit/` (eats own dogfood). `sector` split into sector-analytics + market-context recommended. `analysis` module reclassified as application use case.

## Previous session (2026-05-21 — Sprint 1967 orchestration audit)

Brief commissioned by BA/PO. Surface coverage: 7 REQs, evidence-only on surfaces overlapping 1968 (L-1/L-2/L-3). No fix authority in 1967 for those surfaces — defer to 1968.

## Previous session (2026-05-21 — Token/tool-call economy brief)

Brief: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md`. 9 waste types (W-1..W-9), 9 levers (L-1..L-9) in 3 tiers. Phase 1 (L-1..L-5) = zero-risk, agent-father only. Phase 2 (L-4/L-7) = moderate. Phase 3 (L-6/L-8/L-9) = PM→dev-team.

## Previous session (2026-05-21 — 1962 task_id format audit)

16-site read-only audit. WARN: 0 FAILs, 5 WARNs. Two-tier defense structurally intact.
5 WARNs (auto-fixable): WARN-1 C5 sprint-signoff no explicit release; WARN-2..5 abbreviated task_claim() syntax. WARN-1 highest risk if sprint >3600s.
Brief: `docs/architecture-briefs/2026-05-21-task-id-format-audit.md`

## Previous session (2026-05-20 — Phase 3 task-lock dev-team wiring brief)

Brief: `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md`. Model 2 self-claim chosen. Developer = PRIMARY claimer (2b pre-code). QA inherits lock, releases at git push. 12 tool-package edits only (dev-* inherit developer.md). 9 flow edits with insertion points. Test plan: 7 scenarios T1-T7.

## Patterns noticed

- Reuters fallback split is confirmed working precedent for Bun test split pattern
- hsx.vn Envoy route-block: `x-envoy-upstream-service-time: 2ms` + empty body = edge rejection (no backend contact)
- Backtesting: `Option C equity curve` = direct copy lines 302-307 in backtestEngine.ts

## Carry-over (next session)

- **Pilot Charter is ACTIVE.** Next session = Phase 0 kickoff for technical-analysis pilot: (1) create `docs/data/bug-inventory.json` with TA bug baseline, (2) create `docs/data/pilot-status.json` with all 12 goals TBD, (3) sandbox-kit prereq check (must be at L3+ before pilot work starts).
- G12 requires authoring `flows/dev-technical-analysis/main.md` — if that flow file does not exist, Architect must create it (within pilot scope). Check at pilot Phase 0.
- QA gates: 10 NEEDS SHARPENING flags still open from 1973. PM creates "metric sharpening" sprint task before Phase 2+ scale work.
- `docs/data/metric-ladder.json` must be created in Phase 0 (does not yet exist). SSOT for level transitions.
- PO sign-off on 11-open-questions.md (Q-1 through Q-10 + mitigations M-1–M-4). Unblocks Phase 0.
- DEBT-001: WARN-1..5 auto-fix (from 1962 audit) — Phase 0 clean-up item.
- TASK-BCTC-1: HIGH ops — fix `TasksMax=512` + `MemoryMax=512M` in systemd service (BUG-BCTC-1, Phase 4 S-4).
- SPIKE_006 c61: scoring unification (confirm 60% threshold denominator with user).
- Phase 6 scope addition: implement X-5 Fence-A/B/C ESLint rules.
