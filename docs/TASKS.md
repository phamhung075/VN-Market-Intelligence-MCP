# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---

## Phase 0 Backlog (Stock-Price Fleet Pilot 3)

**Status:** Opened 2026-05-23 (PO dispatch signal po-pilot3-stock-price-chartered-20260523T220944Z.json). Phase 0 scope: 6 deliverables (brownfield inventory, R-CGO confirmation, bug-inventory entry, agent-flow + G12 DoD baking, anchor commit, phase-1 task plan). WIP limit enforced: max 2 In Progress. Sprint deadline: 1 sprint (2026-05-24 delivery expected). Exit gate: all 6 deliverables + architect verification signal before PO approval of Phase 0→Phase 1 transition.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| P0-SP-1 | Brownfield inventory of apps/stock-price (architecture audit + R-CGO feasibility) | HIGH | TASK | architect + system-auditor | docs/handoffs/TASK_P0-SP-1-brownfield-inventory.md | READY | — |
| P0-SP-2 | Bug-inventory entry: stock_price_baseline (G10 metric) | HIGH | TASK | system-auditor | docs/handoffs/TASK_P0-SP-2-bug-inventory-entry.md | READY | — |
| P0-SP-3 | Agent-father: confirm dev-stock-price.md + bake dev-stock-price flow with G12 DoD Gate + CGO/Fence rules | HIGH | TASK | agent-father | docs/handoffs/TASK_P0-SP-3-agent-flow-baking.md | READY | — |
| P0-SP-4 | Set anchor commit + update pilot-status SSOT | MEDIUM | TASK | pm | docs/handoffs/TASK_P0-SP-4-anchor-commit.md | READY | P0-SP-1, P0-SP-2, P0-SP-3 (all deliverables before anchor) |
| P0-SP-5 | R-CGO Confirmation: verify primitives + module + sandbox build CGO_ENABLED=0 (binding risk gate) | CRITICAL | TASK | dev-stock-price | docs/handoffs/TASK_P0-SP-5-r-cgo-confirmation.md | READY | P0-SP-1 (brownfield R-CGO feasibility) |
| P0-SP-6 | Phase-1 task plan authoring (architect) | HIGH | TASK | architect | docs/handoffs/TASK_P0-SP-6-phase1-task-plan.md | READY | P0-SP-1, P0-SP-2 (brownfield + bug-inventory inputs) |
| P0-EXIT-GATE | Phase 0 exit gate verification (architect signal) | CRITICAL | GATE | architect | — | READY | P0-SP-1..6 all DONE |

**Notes:**
- **WIP=2 cap (fleet pilot):** max 2 READY→IN-PROGRESS at once; stock-price + kinh-dich (pilot-4) capped together at WIP=2
- **Parallel dispatch eligible:** P0-SP-1 + P0-SP-2 + P0-SP-3 + P0-SP-5 + P0-SP-6 are independent; P0-SP-4 depends on all others (sequential last)
- **R-CGO critical:** P0-SP-5 is a BINDING risk gate (HIGH severity); if BLOCKED, Phase 1 cannot proceed without architect re-cut
- **Architect sign-off required:** P0-EXIT-GATE requires architect verification signal before PO approves Phase 0→Phase 1
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Phase 0 + §CGO Boundary Clause

---

## Phase 2 Backlog (Technical-Analysis Pilot)

**Status:** Expanded 2026-05-23 by architect. WIP limit enforced: max 2 In Progress. Sprint deadline: 2026-07-03 (6 sprints from kickoff 2026-05-23).

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| P2-F2 | agent-father inserts dashboard-green DoD step in dev-technical-analysis flow | HIGH | TASK | agent-father | docs/handoffs/TASK_P2-F2.md | IN-PROGRESS (dispatch signal pm-P2-F2-dispatch-20260523T222530Z.json) | — |
| P2-A1 | Author `.golangci.yml` with Fence-A/B/C depguard rules | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-A1.md | IN-PROGRESS (dev-technical-analysis dispatched) | — |
| P2-B0 | Brownfield inventory scan: all TS TA callers in mcp-server | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B0.md | DONE 2026-05-23 (c175f745) | — |
| P2-B1 | Rewire TA callers to HTTP (assembleBriefing + tool handler + type fixes) — SCOPE EXPANDED per B0 audit | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B1.md | READY (P2-B0 done — next-up after A1/F2 land per WIP=2 rule) | P2-B0 (done) |
| P2-A2 | Add `go-lint` CI job to `.github/workflows/ci.yml` | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-A2.md | PENDING | P2-A1 |
| P2-A3 | Verify CI green on clean codebase (no violations) | HIGH | TASK | qa | docs/handoffs/TASK_P2-A3.md | PENDING | P2-A2 |
| P2-B2 | Move `technicalIndicators.ts` domain service to `_deprecated/` | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B2.md | PENDING | P2-B1 |
| P2-D0 | Preflight: verify bug-inventory.json has ≥1 TA candidate | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-D0.md | PENDING | — |
| P2-A4 | Deliberate-violation artifact: prove CI red/green cycle | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-A4.md | PENDING | P2-A3 |
| P2-B3 | Remove all "TODO: migrate" comments from mcp-server + technical-analysis | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B3.md | PENDING | P2-B2 |
| P2-D1 | Design and document bug-injection spec | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-D1.md | PENDING | P2-D0, P2-F1 |
| P2-B4 | Integration test: TA MCP tool end-to-end via Go service | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-B4.md | PENDING | P2-B3 |
| P2-D2 | QA injects bug; dispatches dev-technical-analysis with dashboard scenario only | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-D2.md | PENDING | P2-D1 |
| P2-E1 | QA designs scenario pair A + B (shared input shape, regression canary) | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-E1.md | PENDING | P2-F1 |
| P2-D3 | dev-technical-analysis fixes bug (≤2 cycles); dashboard GREEN | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-D3.md | PENDING | P2-D2 |
| P2-E2 | QA injects bug A; dispatches dev-technical-analysis | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-E2.md | PENDING | P2-E1 |
| P2-C | G9 async user verification gate (PO-owned) | LOW | TASK | po | docs/handoffs/TASK_P2-C.md | PENDING | — |
| P2-E3 | dev-technical-analysis fixes A (triggers B red); fixes B in same cycle; both GREEN | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-E3.md | PENDING | P2-E2 |
| P2-F3 | QA reads flow file, confirms DoD step, counts 3-streak tasks | LOW | TASK | qa | docs/handoffs/TASK_P2-F3.md | PENDING | P2-D3, P2-E3 |

**Notes:**
- P2-F1 (architect brief) completed 2026-05-23 — not included in dispatch queue (architect-owned, non-delegable)
- P2-F2 (agent-father flow edit) IN-PROGRESS — critical path; must complete before P2-D2 + P2-E2 dispatch so streak tasks accrue under the rule
- P2-A1 IN-PROGRESS (dev-technical-analysis); P2-B0 DONE
- **PO next-dispatch gates (updated 2026-05-23 cycle 2):**
  - After P2-F2 lands → dispatch P2-D1 + P2-E1 to qa
  - After P2-A1 lands → dispatch P2-A2 to dev-technical-analysis (sequential)
  - After P2-A3 green → dispatch P2-B2 chain (deletion can proceed once fence proven)
  - **P2-B1 is READY now (P2-B0 done) but PO is holding it back** to keep dev-technical-analysis WIP ≤ 2; will dispatch when P2-A1 lands
  - **P2-B1 SCOPE EXPANDED (PM 2026-05-23T22:35Z):** Based on P2-B0 audit finding (signal file main-router-P2-B0-finding-20260523T223500Z.json), B1 now includes assembleBriefing.ts rewire (SEV-2 gap) + DailyCandle type fixes (SEV-3). Handoff updated: docs/handoffs/TASK_P2-B1.md. AC count 6→10, estimate 45min→1h. Pre-step: git tag p2-b-pre-delete before P2-B2 deletion commit.
  - After P2-D3 lands → dispatch P2-E1/E2 (regression pair needs G10 fix pattern visible)
  - After P2-D3 + P2-E3 → dispatch P2-F3 to qa (streak verification)
- G4 (fence): P2-A1 → P2-A2 → P2-A3 → P2-A4 (sequential, same owner, ~45 min)
- G5 (deletion): P2-B0 ✓ → P2-B1 → P2-B2 → P2-B3 → P2-B4 (sequential, same owner + QA, ~2.5 hours)
- G10 (AI-fix): P2-D0 → P2-D1 → P2-D2 → P2-D3 (sequential, ~2 hours + 1h agent fix)
- G11 (regression): P2-E1 → P2-E2 → P2-E3 (sequential, ~2 hours + 1h agent fix)
- G12 (flow rule): P2-F2 → (gates P2-D2/E2) → P2-F3 after P2-D3+E3 complete
- G9 (async): P2-C independent, no blocker on dev work — send DEFERRED-CYCLE-2 (ops blocker; signal po-20260522T225100Z.json)

---

## Phase 0 Backlog (News-Fetch SCALE Pilot) — CLOSED 2026-05-24

**Status:** CLOSED 2026-05-24T07:34Z by PO (P0-NF-EXIT sign-off; PO absorbed P0-NF-4 anchor + close-out mechanics — no `pm` agent in this harness). All 5 deliverables verified DONE + architect verification signal present. Anchor tag `news-fetch-pre-refactor` set local-only @ 31483c8c (clean pre-refactor main commit, no Phase 1 scaffolding). pilot-status SSOT: status=ACTIVE, phase=1, phase0=CLOSED, phase1=ACTIVE. Phase 1 now OPEN (see below). Owner = generic `developer` (NO dev-news-fetch specialist). Charter: thin `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-charter.md` → canonical G1–G12 in `pilot-charter.md`. Port 5008. Sprint deadline: 2026-07-05 (kickoff + 6 sprints).

**BROWNFIELD DRIFT (binding for P0-NF-1):** `apps/news-fetch/src/` ALREADY has DDD layering (`domain/ application/ infrastructure/ interface/`). Charter §Deltas describes it as flat `src/` — that is STALE. This is **rewire + light extract**: thin primitive set + single `news-ingest` module. Architect must reconcile this drift in the brownfield doc.

**DEV-AGENT DECISION (PO, 2026-05-24):** `dev_agent_file` = **N/A** (no new agent .md — generic developer owns; new agent would be agent-md-factory scope and adds roster surface for the smallest service). `dev_agent_flow_file` = thin **`.claude/flows/dev-news-fetch/main.md`** carrying the G12 DoD gate, zone=apps/news-fetch/, owned by generic developer (matches stock-price/macro per-service-flow precedent; keeps `flows/developer/main.md` clean).

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| P0-NF-1 | Brownfield inventory of apps/news-fetch — RECONCILE DDD-drift (src/ already layered, not flat), identify primitive set + news-ingest module + adapter boundary | HIGH | TASK | architect | docs/handoffs/TASK_P0-NF-1-brownfield-inventory.md | DONE 2026-05-24 | — |
| P0-NF-2 | Bug-inventory entry: news_fetch_baseline (G10 metric) — B-10 is I/O/adapter, NOT primitive-class; pick/synthesize primitive baseline | HIGH | TASK | architect | docs/handoffs/TASK_P0-NF-2-bug-inventory-entry.md | DONE 2026-05-24 (baseline 1.5) | — |
| P0-NF-3 | Agent-father: create thin flows/dev-news-fetch/main.md with G12 DoD gate + ESLint-fence note (NO new agent .md) | HIGH | TASK | agent-father | docs/handoffs/TASK_P0-NF-3-flow-baking.md | DONE 2026-05-24 (bca30508) | — |
| P0-NF-5 | Phase-1 task plan authoring — MORE explicit than specialist pilots (charter §Deltas pt3, generic developer carries less context) | HIGH | TASK | architect | docs/handoffs/TASK_P0-NF-5-phase1-task-plan.md | DONE 2026-05-24 (10 tasks, 68 ACs) | P0-NF-1, P0-NF-2 |
| P0-NF-4 | Set anchor commit (news-fetch-pre-refactor tag) + update pilot-status SSOT deliverable flags | MEDIUM | TASK | po (pm absorbed) | docs/handoffs/TASK_P0-NF-4-anchor-commit.md | DONE 2026-05-24 (tag @ 31483c8c, local-only) | P0-NF-1, P0-NF-2, P0-NF-3 |
| P0-NF-EXIT | Phase 0 exit gate verification (architect signal) | CRITICAL | GATE | architect+po | — | PASS 2026-05-24T07:34Z (PO sign-off) | P0-NF-1..5 all DONE |

**Notes:**
- **Planning sequence (SPRINT-L):** BA = N/A for Phase 0 (no user-facing requirement to decompose — structural refactor). Sequence is **architect → agent-father → pm**. architect leads (brownfield + bug-inventory + explicit phase-1 plan), agent-father bakes G12 DoD gate, pm sets anchor + sequences.
- **Parallel dispatch eligible:** P0-NF-1 + P0-NF-2 + P0-NF-3 are independent (architect ×2 + agent-father). P0-NF-5 depends on NF-1+NF-2. P0-NF-4 depends on NF-1+NF-2+NF-3 (anchor last). WIP=2 cap.
- **Anti-over-extract (charter §Risk 1):** mostly-I/O service. Genuine pure-function surface = headline-normalizer, source-dedup-key, article-relevance-filter, ticker-tagger, published-at-parser. RSS/API fetch + flaresolverr + VPS push = adapters, keep OUT of primitives.
- **Anti-scope-creep:** `apps/news-fetch/` ONLY. Do NOT absorb cowork-agent coverage-sweep work (news-scout/market-watcher) per charter §Risk 4.
- **Exit gate:** PASSED — all 5 deliverables + architect verification signal verified before PO approved Phase 0→Phase 1.
- **Charter reference:** `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-charter.md` + canonical `pilot-charter.md` G1–G12.
- **Graphify decision (this cycle):** full graphify DEFERRED until Phase 2 closure. Per-task incremental `/graphify docs --update --no-viz` already enforced by `flows/developer/main.md`. Decision doc: `docs/po-decisions/2026-05-23-graphify-scope.md`.

---

## Phase 1 Backlog (News-Fetch SCALE Pilot) — CLOSED/APPROVED 2026-05-24

**Status:** CLOSED/APPROVED 2026-05-24T08:39Z by PO (P1-NF close-gate sign-off). All 10 tasks DONE. QA close-gate APPROVED Round 2 @c8a2f7cb (sandbox 13/13 PASS exit 0, bun test 233 pass, bun tsc --noEmit exit 0 [fixed models.ts:43 FetchResult.method union +'module'], DDD fence PASS, security/env-audit PASS, G12 streak 3/3 P1-B1+P1-C+P1-D). Signal `docs/signals/qa-news-fetch-p1-approved-20260524T000001Z.json`; handoff `docs/handoffs/TASK_P1-NF-QA.md`. **7 goals EARNED-PENDING** (G1/G2/G3/G5/G6/G7/G12 — evidence in `pilot-status-news-fetch.json` goals[].phase1_state; G8 PARTIAL); NOT flipped to YES per §4.5 (PO-only atomic at 12/12 Phase 3). Top-level phase 1→2. Plan: `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-phase-1-task-plan.md`.

| Task ID | Title | Goals | Owner | Status | Blocked by |
|---------|-------|-------|-------|--------|-----------|
| P1-A | `src/sandbox/runner.ts` — Bun sandbox harness (--tier/--module/--scenario flags) | G7, G12 | developer | READY (FIRST — dispatch now) | — |
| P1-B1 | Primitive: `published-at-parser` + 3 scenario JSONs + R-FENCE discovery gate (G12 streak #1) | G1, G7, G12 | developer | BLOCKED | P1-A |
| P1-B2 | Primitive: `headline-normalizer` + 3 scenario JSONs | G1, G7, G12 | developer | BLOCKED | P1-B1 |
| P1-B3 | Primitive: `source-dedup-key` + 3 scenario JSONs | G1, G7, G12 | developer | BLOCKED | P1-B2 |
| P1-B4 | Primitive: `article-relevance-filter` + 3 scenario JSONs | G1, G7, G12 | developer | BLOCKED | P1-B3 |
| P1-C | Module stub: `src/module/news_ingest/` — ports + composition + fallback-chain + multi-primitive scenario (G12 streak #2) | G2, G12 | developer | BLOCKED | P1-B4 |
| P1-D | Dashboard stub: `dashboard/index.html` — 3 panels NOT-RUN (G12 streak #3) | G6, G8, G9, G12 | developer | BLOCKED | P1-C |
| P1-E | Edit-rerun handler + env audit (zero DB creds, zero API keys in sandbox) | G7, G8, G12 | developer | BLOCKED | P1-D |
| P1-G5 | G5 rewire: split `composition-root.ts`, HTTP-rewire `analysis.ts`, deprecate legacy `reuters.ts`, add `api/openapi.yaml` | G3, G5, G12 | developer | BLOCKED | P1-E |
| P1-QA | Phase 1 close-gate: sandbox 13/13 green, dashboard renders, G12 streak 3/3 confirmed | G1,G2,G6,G7,G8,G12 | qa | DONE 2026-05-24 — APPROVED (tsc exit 0, sandbox 13/13, G1/G2/G3/G5/G6/G7/G12 evidence-locked; see TASK_P1-NF-QA.md) | P1-G5 |

**Notes:**
- **WIP=1 sequential:** ONLY one task IN-PROGRESS at any time. Dispatch P1-A first; each subsequent task unblocks only when its predecessor is DONE with sandbox-green evidence in handoff. Sequencing chain: A → B1 → B2 → B3 → B4 → C → D → E → G5 → QA.
- **G12 streak tasks:** P1-B1 (#1) + P1-C (#2) + P1-D (#3). None marked DONE without `bun run sandbox` all-green + dashboard evidence pasted into handoff. Streak rule live since bca30508.
- **§4.5 compliance:** developer does NOT touch pilot-status goals/decisionMatrix. goalsEarned stays 0. PO-only flip at 12/12 terminal Phase 3. Phase 1 task "Goals" column is informational (goals advanced), not goal flips.
- **Hard scope fence:** `apps/news-fetch/` ONLY (P1-G5 is the ONLY task touching `apps/mcp-server/`, for the single G5 HTTP rewire). No cowork agents (news-scout/market-watcher) per charter §Risk 4.
- **Constraints binding Day 0:** L84 explicit-file staging (git add <path>), no --force/--no-verify, no push of source/CI, all on main, ESM `.js` import suffixes, `Bun.env` not `process.env`, sandbox exits non-zero on any FAIL.
- **Pre-revert tags are Phase 2 work** (news-fetch-pre-ci / pre-delete / pre-inject) — NOT created in Phase 1.

---

## Phase 2 Backlog (News-Fetch SCALE Pilot) — OPEN (AWAITING-PLAN) 2026-05-24

**Status:** OPEN 2026-05-24T08:39Z by PO (Phase-1 close-gate APPROVE → Phase-2 open). Plan: `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-phase-2-task-plan.md` (10 tasks, PO skeleton — dispatchable; architect AC-expansion optional/non-blocking). **WIP=1 strictly sequential.** Owner = generic `developer` (+ qa + po), routed via `.claude/flows/dev-news-fetch/main.md`, zone `apps/news-fetch/` ONLY. Closes the 5 remaining goals: **G4, G8, G9, G10, G11**. **SI-3 finding: LANDED** (eslint-plugin-boundaries Option A, commit 388703b7) — G4 fully unblocked, AC verbatim in SI-3 §5; NO architect re-design needed.

| Task ID | Title | Goals | Owner | Status | Blocked by |
|---------|-------|-------|-------|--------|-----------|
| P2-NF-A | Create `news-fetch-pre-ci` tag (pre-revert anchor before G4 fence) | G4-setup | developer | READY (FIRST — dispatch now) | — |
| P2-NF-B | `eslint.config.mjs` Fence-A/B/C (verbatim SI-3 §3.2) + `eslint`+`eslint-plugin-boundaries` devDep + `lint:ci` | G4-partial | developer | BLOCKED | P2-NF-A |
| P2-NF-C | G4 deliberate-violation proof (AC-4b) — Fence-A breach → exit non-zero + "Fence-A" → revert → exit 0, NEVER committed | G4-full | developer + qa | BLOCKED | P2-NF-B |
| P2-NF-D | G4 freeze anchor confirm (AC-4c) + QA G4 evidence + signal | G4-finalized | qa | BLOCKED | P2-NF-C |
| P2-NF-E | G8 honest-red — 1 deliberate broken primitive + 5 known-bad scenarios → 6 RED cards → revert GREEN; QA honesty_table | G8 | qa + developer | BLOCKED | P2-NF-D |
| P2-NF-F | G9 dashboard trust contract — Path B PO Playwright headless (file://, 3 panels + 6 cards + honest status + console_errors=0) | G9 | po | READY (async PO track — no blocking dep) | — |
| P2-NF-G | Create `news-fetch-pre-inject` tag + G10 bug injection in `published-at-parser` (RFC-date timezone/off-by-one); card RED before dispatch | G10-setup | qa | BLOCKED | P2-NF-D |
| P2-NF-H | G10 AI-fix ≤2 cycles (baseline 1.5) from dashboard-RED signal only; dashboard GREEN; G12 DoD enforced | G10 | developer + qa | BLOCKED | P2-NF-G |
| P2-NF-I | G11 regression 2-trial — Trial-1 published-at-parser, Trial-2 headline-normalizer; Outcome-(a) × 2 = PASS | G11 | qa + developer | BLOCKED | P2-NF-H |
| P2-NF-Z | Phase 2 close-gate (QA) — confirm G4+G8+G10+G11 chains; re-confirm 7 EARNED-PENDING + G12 streak; sandbox all-green; signal. NO flips | close-gate | qa | BLOCKED | P2-NF-F, P2-NF-I |

**Notes:**
- **WIP=1 sequential.** Dispatch P2-NF-A first (G4 chain). P2-NF-F (G9 PO Playwright) is the async PO track — runs in parallel, no blocking dependency.
- **§4.5 compliance:** NO task flips any goal. `goalsEarned` stays 0, `decisionMatrix` stays TBD. PO-only atomic flip at 12/12 terminal Phase 3.
- **Pre-revert tags:** `news-fetch-pre-ci` (P2-NF-A Step 0) + `news-fetch-pre-inject` (P2-NF-G Step 0). `news-fetch-pre-delete` NOT needed — G5 done in Phase 1.
- **G4 element-pattern gotcha:** src dirs are SINGULAR (src/primitive/, src/module/) — use SI-3 §5 singular patterns. The dev-flow Fence note plural (src/primitives/) is STALE.
- **R-2 fallback:** `.js`-suffix match failure → add `@typescript-eslint/parser` inline (stays Option A, no new task).
- **Hard scope fence:** `apps/news-fetch/` ONLY. No cowork-agent coverage-sweep work (charter §Risk 4).
- **Constraints Day 0:** L84 explicit staging, no --force/--no-verify, no push of source/CI, all on main, anchor `news-fetch-pre-refactor @ 31483c8c` INTACT.

---

## Phase 1 Backlog (pdf-extractor SCALE Pilot) — OPEN 2026-05-24

**Status:** OPEN 2026-05-24T09:30Z (PO Phase-0 exit gate close; pilot-status phase=1 ACTIVE). Plan: `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md` (10 tasks, est 9.3h). **WIP=1 strictly sequential** (pilot-status `phase1.wip_limit`). Owner = `dev-pdf-extractor`, zone `apps/pdf-extractor/` ONLY. Language Python (locked Day 0). G12 DoD gate effective for every streak task. BCTC freeze: all 10 tasks CLEAR.

**HARD GATE — P1-B1 (and all primitives) MUST NOT dispatch until:**
- AC-5 PASS: `env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"` returns EMPTY in sandbox process env.
- AC-6 PASS: `grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password" apps/pdf-extractor/sandbox/` returns 0 matches.
- dev-pdf-extractor pastes both AC-5 + AC-6 terminal output (literal) into `docs/handoffs/TASK_P1-A1.md` before any P1-B1 dispatch.

| Task ID | Title | Goals | Owner | Status | Blocked by |
|---------|-------|-------|-------|--------|-----------|
| **P1-A1** | Sandbox runner `apps/pdf-extractor/sandbox/runner.py` (JSON-in → trace-JSON-out, zero credentials, zero pdfplumber/pytesseract) + scenario dir layout. FastAPI composition root ≤80 logical lines. 7 ACs. **ZERO-CREDS gate before P1-B1.** | G7, G12 | dev-pdf-extractor | **Todo** | — |
| P1-A2 | Scenario directory layout: `scenarios/{primitives,modules,service}/` + README | G1, G7 | dev-pdf-extractor | Blocked | P1-A1 |
| P1-A3 | `main.py` shrink ≤80 logical lines (extract `os.makedirs` → `infrastructure/startup.py`, lifespan → `infrastructure/lifespan.py`) | G3 | dev-pdf-extractor | Blocked | P1-A2 |
| P1-B1 | First primitive `validate-financial-figures` — move from `domain/services.py`, 3 scenario JSONs. G12 streak #1. **Blocked until P1-A1 zero-creds gate (AC-5+AC-6) confirmed PASS.** | G1, G12 | dev-pdf-extractor | Blocked | P1-A3 + P1-A1-zero-creds-gate |
| P1-B2 | Second primitive `decimal-normalizer` — READ-ONLY mcp-server archaeology for fixture values, ZERO mcp-server write. 3 scenario JSONs. | G1, G12 | dev-pdf-extractor | Blocked | P1-B1 |
| P1-C | Module stub `financial-reports` — Protocol ports + `FinancialReportsModule` + mock ports in tests. G12 streak #2. | G2, G12 | dev-pdf-extractor | Blocked | P1-B2 |
| P1-D | Module scenario JSON `scenarios/modules/financial_reports/` — ≥1 multi-primitive story. | G2, G7, G12 | dev-pdf-extractor | Blocked | P1-C |
| P1-E1 | Dashboard stub `apps/pdf-extractor/dashboard/index.html` — 3 panels NOT-RUN, SI-2 boundary comment. G12 streak #3. | G6, G8, G9, G12 | dev-pdf-extractor | Blocked | P1-C, P1-D |
| P1-E2 | Edit-rerun handler + G7 all-4 sub-gates (env audit + scenario grep + zero-infra import + edit→rerun cycle). Evidence in handoff. | G7, G8, G12 | dev-pdf-extractor | Blocked | P1-E1 |
| P1-G | QA close-gate: sandbox all-green, zero-creds audit PASS, dashboard 3-panel PASS, G12 streak-3 confirmed. Emits `qa-pdf-extractor-phase1-gate-<UTC>.json`. | closes Phase 1 | qa | Blocked | P1-E2 |

**Notes:**
- **WIP=1 sequential:** dispatch one task at a time. Each unblocks only when predecessor is DONE with evidence in handoff.
- **G12 streak tasks:** P1-B1 (streak#1) + P1-C (streak#2) + P1-E1 (streak#3). None marked DONE without sandbox-green evidence pasted in handoff.
- **P1-B2 READ-ONLY rule:** if any `apps/mcp-server/` file appears in `git diff --cached`, task is BLOCKED — dev must unstage before commit.
- **Handoff:** `docs/handoffs/TASK_P1-A1.md` (created this cycle — full ACs + Architect design notes).
- **Charter ref:** `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md`. Plan: `phase-1-task-plan-python.md`.
