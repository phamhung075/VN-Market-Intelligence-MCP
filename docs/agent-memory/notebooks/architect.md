# Architect — Notebook

**Last updated:** 2026-05-24 14:00 UTC | **Sprint:** fleet-factory-rollout program

[3 most recent cycles retained below. Archive in git history.]

## commit-mutex structural-fix design brief (2026-05-24T14:00Z) — PO commission

**Task:** Author design-only brief for commit-mutex / advisory lock on main. Commission:
`docs/signals/po-20260524T023538Z-commit-mutex-structural-fix-commission.json`.

**Problem confirmed:** 7 bundling incidents this session from verify→commit race window.
Interim whole-worker serialization safe but over-serializes (blocks build/test phases that have
no index conflict). Commit-mutex serializes ONLY the commit critical section (seconds).

**Core mechanism:** Extend `coordination.db` with a new `task_kind: "commit-mutex"` singleton
row (`task_id: "commit-mutex:main"`, TTL=60s). Each agent's flow commit step acquires this row
via existing `task_claim` MCP tool before staging. Release via `task_release` after commit.
Race window is closed: only one agent inside `git add → git diff --cached verify → git commit`
at any time. Everything before (build/test/generate) and after (signal emit) is lock-free.

**Stale-lock reclaim:** TTL=60s. Crashed holder's row expires; next `task_claim` wins. No
heartbeat needed (commit completes in 2–10s, well within TTL). Existing mechanism covers it.

**Cron agent enforcement:** Lock enforced at the shared commit step in each agent flow, not
politely. Shared `.claude/skills/commit-mutex/SKILL.md` invoked from every flow commit step.
Cron agents load their flow at runtime — skill update propagates automatically next tick.

**Migration:** Additive. Interim whole-worker serialization stays in force until commit-mutex
is wired in ALL flows AND one clean cycle observed. PO lifts interim policy by separate signal.
Zero history rewrite. Zero branches. Anchor debba8ea intact.

**Risk flags:** R-2 (MCP down → skip commit, don't bypass mutex); R-1 (bypass via out-of-flow
commit — detectable in post-merge review).

**Files authored this cycle (2):**
1. `docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md` (NEW)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal emitted:** `docs/signals/architect-commit-mutex-brief-done-<UTC>.json` (next_actor: po)
**Anchor:** debba8eaff0724d1fb32fc9d28640201cc32d1cc — INTACT (verified before commit)

---

## pdf-extractor Phase-2 task plan (2026-05-24) — 24-task plan covering G1-full through G5b-clearance

**Task:** Author Phase-2 task plan for pdf-extractor SCALE pilot. Authorization: po-20260524T083616Z.json; Phase-1 gate APPROVED @7247fd08 (po cycle-292). Phase-2 AWAITING-PLAN.

**Inputs loaded:** pilot-status-pdf-extractor.json (phase2 block + goals + bctc_freeze_gate + g5_split) + phase-1-task-plan-python.md + p0-brownfield-inventory.md + po-decisions/2026-05-24-pdf-extractor-g5b-freeze-ruling.md + pyproject.toml (no importlinter section yet) + scenario directory (9 JSON files: 6 real + 3 echo_identity scaffold) + main.py (88L raw, LOC re-verify in P2-D) + bug-inventory pdf_extractor_baseline (baselineCycleCount=1.5, 2 g10 candidates).

**Key decisions:**
- 24 atomic tasks total (P2-B1/B2/B3/B4 + P2-C + P2-D + P2-E1/E2 + P2-F + P2-A1/A2/A3/A4 + P2-G + P2-J0/J1/J2/J3 + P2-K1/K2 + P2-G5a + P2-G5c + P2-G5b-clearance + P2-G5b-dispatch). WIP=1 sequential. 22 dispatchable immediately. G5b-clearance + G5b-dispatch HARD FROZEN.
- G4 fence: import-linter (locked SI-4, pyproject.toml [tool.importlinter], lint-imports CLI). Fence-A: domain.primitives must not import infrastructure/application/interface. Fence-B: domain.modules must not import infrastructure/interface.
- G1-full: 4 new primitives (confidence_scorer, low_confidence_gate, ratio_computer, field_extractor). P2-B4 field_extractor = READ-ONLY mcp-server archaeology, ZERO mcp-server write.
- G10 injection: decimal_normalizer scale literal (single-literal decimal-shift). pdf-extractor-pre-inject tag by qa.
- G11: Trial-1 = G10 alias (decimal_normalizer + multi_primitive_story module coupling). Trial-2 = low_confidence_gate threshold 0.2→0.3 + module coupling.
- G5b sequenced LAST. Clearance criteria: C1-C4 (both 1954c + 1953-G-FAIL resolved + BCTC path stable). Architect emits clearance signal → PO emits freeze-lift → PM dispatches G5b-dispatch.
- 12/12 explicitly blocked until G5b resolves (cleared + lifted + dispatched, or ruled MOOT).
- G7 canonical form baked: `env -i PYTHONPATH=. python3 <runner>` → forbidden-grep EMPTY. CTX_ADVISOR_* excluded.
- §4.5 compliance: ZERO goal-flip instructions. goalsEarned stays 0. decisionMatrix untouched. PO-only at 12/12 terminal.

**Risk flags raised:**
- R-1 Dashboard needs 4 new primitive card slots (PM must sequence dashboard update in P2-C or P2-D before P2-E1)
- R-5 G5b clearance timeline unknown — the ONE explicit 12/12 blocker

**Files authored this cycle (L84 — 1 file):**
1. `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-2-task-plan-python.md` (NEW — 24 tasks, 130+ ACs)

**Next actor:** pm (create handoff files + update pilot-status phase2.taskPlanStatus=READY-FOR-DISPATCH + dispatch P2-B1)

---

## kinh-dich-service Go Phase-2 task plan (2026-05-24) — Phase 2 dispatch after Phase-1 CONDITIONAL-GO

**Task:** Author Go Phase-2 task plan for kinh-dich-service (fleet pilot 4). Authorization: po-20260524T081835Z.json; Phase-1 CONDITIONAL-GO (qa conditional = scope boundary only, NOT quality defect). Phase-2 AWAITING-PLAN.

**Inputs loaded:** pilot-status-kinh-dich.json (phase2 block, goals, tsCompletionArchive) + pilot-charter.md (G1-G12 + R-FENCE clause) + phase-1-task-plan-go.md (primitives, module, fences) + stock-price phase-2-task-plan-go.md (structural template) + dashboard/index.html (stale-comment locations verified: L13 + L1578) + kinhDichTools.ts (6 tools confirmed HTTP-routed to port 5005, P2-KD-G already complete) + git tag scan (3 TS-era tags already exist — critical naming conflict resolved with -go suffix).

**Critical discovery — tag naming conflict:**
`kinh-dich-pre-ci` (2d245200), `kinh-dich-pre-delete` (fdaf4be3), `kinh-dich-pre-inject` (b4cdb1db) all exist from TS pilot. Cannot retag (charter constraint: no --force). Go Phase 2 uses `-go` suffix: `kinh-dich-pre-ci-go`, `kinh-dich-pre-delete-go`, `kinh-dich-pre-inject-go`. Each P2-A/P2-E/P2-J task verifies TS-era tags remain intact (SHAs unchanged).

**Key decisions:**
- 12 atomic tasks (P2-A through P2-Z), WIP=1.
- G4 fence: depguard via golangci-lint (NOT eslint-plugin-boundaries — that was TS pilot). Fence-A allowlist REQUIRED for `nuclear_hexagram` → `hexagram_resolver` + `hao_encoder` sister-primitive imports (OQ-6). P2-B AC-2 proves no false-positive on existing codebase.
- G5 determination: G5a may already be done from TS pilot (P2-KD-F commit 5641f2a1 moved services_v1.ts to _deprecated/). P2-F is a verification-if-done / move-if-not task. OQ-1 for PM.
- G5b: read-only audit only. All 6 MCP tools confirmed HTTP-routed to port 5005 by TS pilot. No rewire needed.
- G9: re-confirm on REBUILT Go dashboard (TS G9 evidence from P2-KD-L is superseded). Pre-condition: sandbox populated BEFORE Playwright runs.
- G10 injection: `THIEU_DUONG_THRESHOLD` 0.10→0.25 in hao_encoder.go. Single literal. Authentic contract (Phase-1 Key Risk 2). Blind fix target ≤2 cycles (baseline 1.5).
- G10 byte-identical restore: `git diff kinh-dich-pre-inject-go HEAD -- hao_encoder.go` = EMPTY.
- G11 coupling: Trial-1 hao_encoder→reading_composer module coupling; Trial-2 hexagram_resolver→reading_composer coupling.
- Dashboard cleanup: P2-H removes 2 stale CSS comments (`language=ts, runtime=bun`) at L13 + L1578.
- §4.5 compliance baked throughout. No goal flips in any task. goalsEarned stays 0.

**Risk flags raised:** R-1 sister-primitive Fence-A false-green (MEDIUM); R-2 G5b scope boundary confusion (LOW); R-3 G9 cold-open vs populated state (LOW); R-4 TS-era tag naming collision (LOW, mitigated by -go suffix).

**Files authored this cycle (1):**
1. `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-go.md` (NEW — 12 tasks, 61 ACs)

**Next actor:** PO — review plan, repoint `phase2.taskPlan` + install tasks map in SSOT, flip phase2.status AWAITING-PLAN→OPEN, dispatch P2-A to dev-kinh-dich.

---

## rag-service Phase-2 task plan (2026-05-24) — Phase 2 dispatch after Phase 1 APPROVED

**Task:** Author Phase-2 atomic task plan for rag-service SCALE pilot. Authorization: pilot-status-rag-service.json phase2.status=AWAITING-PLAN; Phase 1 gate APPROVED (qa cycle-74, commit 1823e716, po cycle-75). Prior attempt dropped on socket error — doc did not exist; authored clean.

**Inputs loaded:** pilot-status-rag-service.json (phase2 block + G1-G12 calibration) + brownfield-inventory.md (§3-6: primitives, module, G5 rewire surface, SI-4) + phase-1-task-plan.md (format mirror) + pilot-charter.md (G1-G12 verification) + TASK_P1-E QA Review Record (gate context).

**Key decisions:**
- 14 atomic tasks (P2-B1 through P2-K2), WIP=1 sequential throughout.
- 4 B-bucket primitives in dependency order: relevance-threshold-gate → top-k-selector → context-window-packer → temporal-decay-scorer (R-2 now-injection as `now: Optional[datetime] = None`).
- P2-C: G2 module-full — all 5 primitives wired via ports, Fence-B clean, `now` propagated through module.retrieve() for scenario determinism.
- P2-D: G3 composition-root verify — main.py ≤80L (from 113L), zero business logic grep, OpenAPI contract capture, port 5002 confirmed.
- P2-E: G6 dashboard-full — all 5 primitive cards GREEN + module-full trace + honest microservice card.
- P2-G7: G7 hard gate upgrade — env-audit warning→FAIL, forbidden key regex constant in sandbox runner, HF_HUB_OFFLINE=1 preserved (NOT forbidden), edit-JSON-rerun cycle proven.
- P2-G8: G8 deliberate-break proof — QA corrupts golden, 5 known-bad files (permanent artefacts) all RED.
- P2-A: G4 import-linter fence (SI-4 locked) — rag-pre-ci tag, 3 contracts (Fence-A independence, Fence-B forbidden, Fence-C layers), CI job rag-service-py-lint, R-FENCE gate (violation exits non-zero + "Fence-A" in output), QA co-sign. Ordered AFTER G8 (primitives stable).
- P2-F: G5 delete+rewire — rag-pre-delete tag, G5a git mv {embeddings,vectorstore,retriever}.ts → _deprecated/, G5b analysis.ts+dataAuditJob.ts+index.ts rewired to ragHttpClient.ts (existing), G5c grep=0, R-1 dual-writer resolved. mcp-server bun build exits 0.
- P2-J: G10 blind bug injection by QA (rag-pre-inject tag), dev-rag-service fixes from RED in ≤2 cycles. Recommended targets: temporal_decay_scorer exponent sign or top_k_selector slice direction.
- P2-K1: G11 2-trial coupling proof — Trial-1 reuses G10 evidence if module scenario was coupled RED; Trial-2 = different primitive, module scenario RED, single-edit fix green. Outcome-(a)×2 PASS.
- P2-K2: G9 Playwright headless — LAST task. playwright.config.js + trust-contract.spec.js, VERDICT JSON committed. 6 ACs: 3 panels, 5 cards, all GREEN, console_errors=0, network_calls=0.
- §4.5 compliance section baked. goalsEarned stays 0. decisionMatrix untouched. No goal flip instructions anywhere.

**Files authored this cycle (L84 — 1 plan file):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-phase-2-task-plan.md` (NEW)

**Commit SHA:** TBD — staged and committed immediately after notebook update.
**Next actor:** PO — flip phase2.status → OPEN, set taskPlan pointer, dispatch P2-B1 to dev-rag-service.

---

## pdf-extractor Phase-1 first dispatch (2026-05-24T07:44Z) — P1-A1 handoff + TASKS.md chain registration

**Task:** PM-stand-in bookkeeping (no pm agent in this fleet). Register 10-task Phase-1 chain in TASKS.md + create TASK_P1-A1.md handoff for dev-pdf-extractor.

**Key decisions:**
- TASKS.md Phase-1 section: P1-A1=Todo, P1-A2..P1-G=Blocked. Compact table (28 lines, ≤80 cap met).
- TASK_P1-A1.md: 7 ACs verbatim from task plan §P1-A1. Zero-creds gate evidence slots (AC-5+AC-6 paste zones) baked in. G12 DoD gate evidence slot baked. Architect design notes include composition root design (≤80L), sandbox runner contract, dynamic dispatch pattern, scenario dir layout.
- Hard gate restated: P1-B1 MUST NOT dispatch until AC-5 (env audit empty) + AC-6 (scenario grep 0) PASS evidence pasted into handoff.
- Commit: files included in fleet committer batch c8e29f08 (rag-service P1-A commit picked up my staged files).

**Files authored this cycle (2):**
1. `docs/TASKS.md` (MODIFIED — Phase-1 pdf-extractor section added, lines 132–159)
2. `docs/handoffs/TASK_P1-A1.md` (NEW — dev-pdf-extractor first dispatch handoff)

---

## pdf-extractor Phase-0 cycle (2026-05-24T09:10Z) — fleet pilot Phase 0 deliverables P0-PDF-1/2/3

**Task:** Author 3 Phase-0 deliverables for pdf-extractor factory pilot (Python). Authorization: pilot-status-pdf-extractor.json activatedAt=2026-05-24T07:18:11Z.

**Key decisions:**
- 6 primitives (added validate-financial-figures as #1 — already pure function in domain/services.py, already tested). Module name LOCKED: `financial-reports`.
- G4 fence tool: `import-linter` (Python analog of depguard/ESLint). Fence-A: primitives zero infra imports. Fence-B: module zero cross-module/infra.
- Sandbox tooling gap HEADLINE RISK: P1-A1 (sandbox runner) BLOCKER before P1-B1. ZERO-CREDS gate baked in.
- OCR/IO boundary CONFIRMED CLEAN: domain/ zero infra imports (golden rule PASS).
- G5b HTTP scope: existing `/extract` path already wired (pdfExtractorClient.ts). Phase-2 G5b = rewire BCTC domain-calling tools — ALL BCTC-freeze-gated.
- BCTC freeze: ALL 10 Phase-1 tasks CLEAR. Phase-2 G5b HARD FROZEN until PO 1954c lift signal.
- main.py 101 LOC (target ≤80): P1-A3 partial fix; full G3 in Phase 2.
- bug-inventory `pdf_extractor_baseline`: 2 bug classes (decimal-shift + confidence-threshold); baselineCycleCount=1.5; ZERO root dup-keys (python3 verified).
- 10 Phase-1 tasks, WIP=1, est 9.3h.

**Files authored this cycle (5):**
1. `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/p0-brownfield-inventory.md` (NEW — PHASE0-D1)
2. `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md` (NEW — PHASE0-D2a)
3. `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md` (NEW — PHASE0-D3)
4. `docs/data/bug-inventory.json` (MODIFIED — pdf_extractor_baseline added, PHASE0-D2b)
5. `docs/agent-memory/notebooks/architect.md` (this entry)

---

## news-fetch Phase-0 deliverables cycle (2026-05-24T07:30Z) — fleet pilot 6 Phase 0

**Task:** Author P0-NF-1 (brownfield), P0-NF-2 (bug-inventory baseline), P0-NF-5 (phase-1 plan) for news-fetch pilot (fleet pilot 6, TS/Bun). Authorization: INTENT from main terminal; PO opened Phase 0 at 2026-05-24T07:19Z.

**Charter DDD-drift reconcile (BINDING):** Charter §Deltas "flat src/" is STALE. All 4 DDD layers already exist. Work = rewire + light extract, not greenfield.

**Primitive set (4 confirmed):** published-at-parser, headline-normalizer, source-dedup-key, article-relevance-filter. Module: news_ingest. G5 active caller: analysis.ts in mcp-server.

**Bug baseline:** B-10 excluded (I/O adapter). baselineCycleCount=1.5 system-wide fallback. Consistent with fleet pattern.

**Phase-1 plan:** 10 tasks, 68 ACs, WIP=1. G12 streak: P1-B1+P1-C+P1-D. All scenario JSONs explicit in plan body.

**Files authored: brownfield.md, phase-1-task-plan.md, bug-inventory.json news_fetch_baseline, pilot-status SSOT, 3 handoff [Architect] sections, signal to pm.**

**Next actor:** pm (anchor + dispatch Phase 1)

---

## rag-service Phase-0 cycle (2026-05-24T08:45Z) — P0-RAG-1 + P0-RAG-2

**Task:** P0-RAG-1 (brownfield inventory + bug-inventory baseline + SI-4 fence decision) + P0-RAG-2 (Phase 1 task plan, Python B/C/E bucket pattern). Authorization: pilot-status-rag-service.json phase0 OPEN, openedBy po cycle-71.

**Service facts (verified):** port=5002 (system-map.json confirmed), language=Python (locked Day 0), zone=apps/rag-service/, DB=rag_service.db (SQLite) + LanceDB at ./data/lancedb.

**Brownfield scan key findings:**
- All 4 DDD layers present and CLEAN. domain/ has ZERO infra imports. Golden rule PASS.
- 5 primitive candidates confirmed as pure functions: similarity-scorer (1/(1+dist) formula), relevance-threshold-gate (distance filter), temporal-decay-scorer (compute_recency_score — NEEDS `now` injection for determinism), top-k-selector (ranked[:limit] slice in application layer), context-window-packer (_build_embedding_text() in application layer).
- Embedding model (SentenceTransformersEmbedder) + LanceDB (LanceDBVectorStore) correctly positioned as infrastructure ADAPTERS. Not primitives. Charter §Key risks #1 CONFIRMED SAFE.
- main.py: 113L composition root (target ≤80 in Phase 2; G3 verify-only in Phase 1 — no code change needed).

**G5 surface (CRITICAL FINDING — dual LanceDB + bypass):**
- `rag_analyses` SQLite table in mcp-server is a SEPARATE analysis log — not rag-service's DB. 10+ MCP tools read it via mcp-server's own DB. NOT a G5 violation.
- `apps/mcp-server/src/infrastructure/rag/` = parallel TS LanceDB stack (embeddings.ts + vectorstore.ts + retriever.ts). `analysis.ts` + `dataAuditJob.ts` call retriever.ts directly — G5b bypass. `ragHttpClient.ts` already exists with ragSearch()/ragIndex(); G5b rewire is surgical via this existing client.
- G5a candidates: {embeddings,vectorstore,retriever}.ts → _deprecated/ after rewire.
- R-1: Dual LanceDB writers (Python rag-service + TS mcp-server). Pre-existing. Resolves at G5b.

**SI-4 DECISION: `import-linter` (grimp backend)**
- Full layered + independence + forbidden contracts. pyproject.toml [tool.importlinter] or .importlinter.
- Offline-runnable, pure Python. Mirrors Go depguard offline pattern.
- GATE: deliberate-violation proof required before G4 ACs lock. Phase 2 gate.

**Bug-inventory baseline:** baselineCycleCount=1.5 (system-wide fallback; 0 domain bugs in 60-day window; 1 ops bug excluded). G10 target: ≤2 cycles.

**Phase 1 task plan:** 4 atomic tasks: P1-A (sandbox runner — shared with pdf-extractor, WIP=1 coordination), P1-B (similarity-scorer), P1-C (retrieval module stub), P1-E (dashboard stub). G12 streak = P1-B + P1-C + P1-E.

**Files authored this cycle (L84 — 4 files):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-brownfield-inventory.md` (NEW)
2. `docs/architecture-briefs/2026-05-22-refactor/scale/rag-service-phase-1-task-plan.md` (NEW)
3. `docs/data/bug-inventory.json` (MODIFIED — rag_service_baseline entry added)
4. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal to emit after commit:** `docs/signals/architect-rag-service-phase0-done-<UTC>.json` (next_actor: pm)

---

## kinh-dich-service Go Phase-1 task plan (2026-05-24) — task P1-KD-PLAN-GO

**Task:** Author Go Phase-1 task plan for kinh-dich-service TS→Go forced reboot. USER-DIRECTIVE (docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md). PO signal po-20260524T071919Z.json, commit ee7c8364.

**Brownfield scan:** 0 .go files, no go.mod. 5 TS primitives + 1 module + 17 scenario JSONs (preserved). OpenAPI 7 endpoints (preserved). Port 5005 confirmed system-map.

**Plan:** 14 atomic tasks WIP=1. `pkg/` layout, CGO_ENABLED=0, modernc.org/sqlite v1.29.9, chi v5.2.1. nuclear_hexagram Fence-A sister-primitive exception (OQ-6). Sandbox runner: `go run ./cmd/sandbox`. Domain contract guards baked: THIEU_DUONG_THRESHOLD=0.10 (P1-B1g), ExtractAction(actionText string) (P1-B4g).

**Output:** `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-go.md` (NEW)

**Next actor:** PM — update pilot-status-kinh-dich.json phase1.task_plan pointer + handoff files + dispatch P1-A1g.

---

## api-gateway SCALE pilot Phase 0 (2026-05-24T11:30Z) — P0-AG-1/2/4 complete

**Tasks:** P0-AG-1 (brownfield spike), P0-AG-2 (bug-inventory entry), P0-AG-4 (Phase 1 task plan)

**Key findings:**
- Confirmed primitive band: HONEST 3 (overall-status-computer, proxy-path-resolver, route-service-matcher). No 4th/5th. PO's candidates validated against real code.
- overall-status-computer: unexported in `pkg/domain/services.go`, needs export + move to `pkg/primitive/`
- proxy-path-resolver: already exported as `ProxyPath` in interface layer — DDD violation (pure function in wrong layer), must migrate
- route-service-matcher: inline duplicate in HandleServiceHealth + HandleProxy (different prefix conventions); genuine dedup candidate
- Rejected: auth-header-validator (gateway does ZERO auth), statusClass/statusLabel (view formatting), BuildDashboardHTML (interface presentation)
- Single `gateway` module. Composition root (main.go 67L) already clean.
- Domain/application/infrastructure layers: all clean, no rewiring needed
- Interface layer: 2 misplaced pure functions (ProxyPath + inline service-name extraction) → migrate to primitives in Phase 1
- G5: trivially-YES, no legacy TS gateway (retired at 75d134a7)
- Port 4000, CGO_ENABLED=0, go.sum empty (zero external deps, stdlib only)
- go test ./... → 45 tests, 0 failures (P0-AG-1 baseline locked)
- Bug inventory: 1 gateway bug in 60d window (377aefbf), <2 threshold → system-wide fallback baselineCycleCount=1.5

**Phase 1 task plan:** 6 tasks B/C/E pattern. WIP=1. G11 blast-radius first (B1 includes coupled-cascade design). No A-bucket (composition root already clean). Commits: P0-AG-1 b3ae0568, P0-AG-2 d5e6ea22, P0-AG-4 d9a0b84e.

**Risk flags:**
- R-1 BLAST RADIUS HIGH: gateway routes all 9 services → proxy-path or route-matcher regression breaks all upstream routing → G11 coupling proof design is mandatory in B1, not deferred
- R-2: ProxyPath in wrong layer (interface), depguard Fence-A will catch it post-G4

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
