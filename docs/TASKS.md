# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---

## Sprint PDF-INSPECT — Side-by-Side PDF / Extracted-Text Inspector (NEW FEATURE)

**Status:** OPEN 2026-05-24T17:19Z (PO self-initiated from explicit user feature request via main terminal). Goal: `docs/SPRINT_GOAL.md` (Sprint PDF-INSPECT). Spec + ACs: `docs/handoffs/TASK_PDF-INSPECT.md`. Zone: `apps/pdf-extractor/` (single; +≤1 read-only mcp-server route IFF architect proves required, R4). **WIP=1 strictly sequential.** POST-PILOT feature — pdf-extractor SCALE pilot stays DONE 12/12 + frozen; sandbox dashboard surface UNTOUCHED.

**Delivery model (FORK RESOLVED, R1):** SERVED FastAPI viewer (port 5001), NOT `file://` — container PDFs + extraction store live in the `market_data:/app/data` named volume a `file://` page cannot reach. **Acceptance (user's real path, L9):** user opens served viewer in browser → list of PDFs → select one → LEFT = rendered PDF, RIGHT = extracted text/fields, side-by-side.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| PI-1 | Design served viewer: 3 GET routes + PDF→file mapping (real unknown) + data-source ruling + render approach + DDD placement + SI-2 boundary. DESIGN ONLY. | HIGH | TASK | architect | docs/handoffs/TASK_PDF-INSPECT.md | READY | — |
| PI-2 | Implement served viewer per PI-1: 3 GET routes (list / pdf-bytes / extracted) + viewer page (LEFT=pdf.js render, RIGHT=text/tables) + honest-degrade. Sandbox surface untouched; fence green; pytest green. | HIGH | TASK | dev-pdf-extractor | docs/handoffs/TASK_PDF-INSPECT.md | BLOCKED | PI-1 |
| PI-3 | Verify under USER's real served-URL-in-browser path (L9): list→select→PDF-left/text-right side-by-side; honest-degrade; SI-2/pilot freeze not regressed; smoke green. Emit `qa-pdf-inspect-<UTC>.json`. | HIGH | TASK | qa | docs/handoffs/TASK_PDF-INSPECT.md | BLOCKED | PI-2 |
| PI-EXIT | PO sign-off against user acceptance condition + PI-3 ACs | CRITICAL | GATE | po | docs/handoffs/TASK_PDF-INSPECT.md | BLOCKED | PI-1..3 |

**Notes:**
- **Binding (Day-0, every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` shows zero foreign files (heavy fleet commit-race). Never ask user to run/deploy — spawn agents.
- **Frozen (R6):** `pilot-status-pdf-extractor.json`, sandbox runner, `dashboard/traces.js`, the 3 sandbox panels, `trust-contract.spec.js` — NOT touched by this sprint.
- **Security-Clause distinction:** the viewer is a REAL served surface that legitimately reads `/app/data` PDFs + extraction store via the app process — by design, NOT a sandbox zero-credential violation.
- **R4 zone-gate:** default single zone. One read-only SELECT-only mcp-server route allowed ONLY if architect proves the user-meaningful parsed fields live exclusively in mcp-server's BCTC DB; if added, zone=`multi`, dev unstages any other mcp-server file.

---

## Follow-On Enhancement — Kinh-Dich 64-Quẻ Trading Reference (KD-QREF)

**Status:** Opened 2026-05-24 (PO dispatch signal `po-kinh-dich-que-reference-20260524T170814Z.json`). POST-PILOT ENHANCEMENT — kinh-dich pilot stays DONE 12/12 + frozen; does NOT reopen any goal. User request: add a browsable 64-Quẻ reference with market-trading descriptions (translated from `kinhdich_logic/que_convert/`) to `apps/kinh-dich-service/dashboard/index.html`. Decision: `docs/po-decisions/2026-05-24-kinh-dich-que-reference-dashboard.md`. Spec + ACs: `docs/handoffs/TASK_KD-QREF.md`. Zone: `apps/kinh-dich-service/` (single). Binding trust gate: `dash-check.mjs` must stay exit-0 (no red dots / JS errors / category-chip leaks).

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| KD-QREF-1 | Design data asset (Go SSOT) + dashboard integration + render contract (trust-gate safe) | HIGH | TASK | architect | docs/handoffs/TASK_KD-QREF.md | DONE | — |
| KD-QREF-2 | Implement: populate 64-que `queReference` Go asset (translate/reframe) + emit `que-reference.js` + dashboard section | HIGH | TASK | dev-kinh-dich | docs/handoffs/TASK_KD-QREF.md | DONE | — |
| KD-QREF-3 | Verify: 64 que render + detail views + `dash-check.mjs` exit-0 + source spot-check + diff-scope | HIGH | TASK | qa | docs/handoffs/TASK_KD-QREF.md | DONE | — |
| KD-QREF-EXIT | PO sign-off vs spec; main terminal commits (commit-mutex enum defect — dev agents can't acquire) | HIGH | GATE | po | docs/handoffs/TASK_KD-QREF.md | DONE | — |

**Notes:**
- **CLOSED 2026-05-24T17:39Z** — PO signed off (DoD met, all 5 ACs + 8 QA checks PASS). Pilot stays DONE 12/12 frozen (no goal reopened). Main terminal commits the in-tree work. Sign-off record: TASK_KD-QREF.md `[PO]` section.
- WIP=2 fleet cap still applies (stock-price + kinh-dich pilots). This enhancement is a SINGLE-ZONE chain, not a pilot; dispatch KD-QREF-1 when capacity allows.
- Ambiguities resolved by PO: (A1) bilingual English-primary, VN name/glyph verbatim; (A2) one fixed shape for all 64 = summary + detail w/ 6-phase; (A3) Go data asset SSOT, emitted to dashboard (never hand-typed HTML); (A4) additive panel, honest-green preserved.

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

## Phase 2 Backlog (News-Fetch SCALE Pilot) — CLOSED / PILOT DONE 2026-05-24

**Status:** CLOSED 2026-05-24T09:45Z. QA P2-NF-Z close-gate APPROVED @41e4b2ce (signal `qa-news-fetch-p2-close-20260524T000003Z.json`: sandbox 16/16 PASS exit 0, env audit empty-of-credentials, source-clean / published-at-parser fix e5e78e54 at HEAD) → **PO TERMINAL 12/12 atomic close** (single commit on `pilot-status-news-fetch.json`). **All 12 goals YES, goalsEarned=12, decisionMatrix verdict=`scale` (3×YES: speed/trust/scale).** Pilot top-level `status=DONE`, `phase=terminal`. **6th pilot to SCALE** — smallest brownfield service, generic `developer` owner (no specialist), proves AI-fixability (1-cycle fix vs 1.5 baseline) + regression-alarm + dashboard-trust-contract under the cheapest staffing model. Closure signal `docs/signals/po-news-fetch-closure-20260524T094500Z.json`. SI-3 fence (eslint-plugin-boundaries Option A, 388703b7) consumed for G4.

| Task ID | Title | Goals | Owner | Status | Blocked by |
|---------|-------|-------|-------|--------|-----------|
| P2-NF-A | Create `news-fetch-pre-ci` tag (pre-revert anchor before G4 fence) | G4-setup | developer | DONE 2026-05-24 (8f366a06) | — |
| P2-NF-B | `eslint.config.mjs` Fence-A/B/C (verbatim SI-3 §3.2) + `eslint`+`eslint-plugin-boundaries` devDep + `lint:ci` | G4-partial | developer | DONE 2026-05-24 (893b17ee) | P2-NF-A |
| P2-NF-C | G4 deliberate-violation proof (AC-4b) — Fence-A breach → exit non-zero + "Fence-A" → revert → exit 0, NEVER committed | G4-full | developer + qa | DONE 2026-05-24 (8f366a06) | P2-NF-B |
| P2-NF-D | G4 freeze anchor confirm (AC-4c) + QA G4 evidence + signal | G4-finalized | qa | DONE 2026-05-24 (ea6da821) | P2-NF-C |
| P2-NF-E | G8 honest-red — 1 deliberate broken primitive + 5 known-bad scenarios → 6 RED cards → revert GREEN; QA honesty_table | G8 | qa + developer | DONE 2026-05-24 (ca448f6b) | P2-NF-D |
| P2-NF-F | G9 dashboard trust contract — Path B PO Playwright headless (file://, 3 panels + 6 cards + honest status + console_errors=0) | G9 | po | DONE 2026-05-24 (PASS; po-news-fetch-g9-g6-20260524T085930Z.json) | — |
| P2-NF-G | Create `news-fetch-pre-inject` tag + G10 bug injection in `published-at-parser` (RFC-date timezone/off-by-one); card RED before dispatch | G10-setup | qa | DONE 2026-05-24 (bug c2ca404a) | P2-NF-D |
| P2-NF-H | G10 AI-fix ≤2 cycles (baseline 1.5) from dashboard-RED signal only; dashboard GREEN; G12 DoD enforced | G10 | developer + qa | DONE 2026-05-24 (fix e5e78e54, cycle_count=1) | P2-NF-G |
| P2-NF-I | G11 regression 2-trial — Trial-1 published-at-parser, Trial-2 headline-normalizer; Outcome-(a) × 2 = PASS | G11 | qa + developer | DONE 2026-05-24 (cd8d0146) | P2-NF-H |
| P2-NF-Z | Phase 2 close-gate (QA) — confirm G4+G8+G10+G11 chains; re-confirm 7 EARNED-PENDING + G12 streak; sandbox all-green; signal. NO flips | close-gate | qa | DONE 2026-05-24 — APPROVED (41e4b2ce) → PO terminal 12/12 close | P2-NF-F, P2-NF-I |

**Notes:**
- **WIP=1 sequential.** Dispatch P2-NF-A first (G4 chain). P2-NF-F (G9 PO Playwright) is the async PO track — runs in parallel, no blocking dependency.
- **§4.5 compliance:** NO task flips any goal. `goalsEarned` stays 0, `decisionMatrix` stays TBD. PO-only atomic flip at 12/12 terminal Phase 3.
- **Pre-revert tags:** `news-fetch-pre-ci` (P2-NF-A Step 0) + `news-fetch-pre-inject` (P2-NF-G Step 0). `news-fetch-pre-delete` NOT needed — G5 done in Phase 1.
- **G4 element-pattern gotcha:** src dirs are SINGULAR (src/primitive/, src/module/) — use SI-3 §5 singular patterns. The dev-flow Fence note plural (src/primitives/) is STALE.
- **R-2 fallback:** `.js`-suffix match failure → add `@typescript-eslint/parser` inline (stays Option A, no new task).
- **Hard scope fence:** `apps/news-fetch/` ONLY. No cowork-agent coverage-sweep work (charter §Risk 4).
- **Constraints Day 0:** L84 explicit staging, no --force/--no-verify, no push of source/CI, all on main, anchor `news-fetch-pre-refactor @ 31483c8c` INTACT.

---

## Follow-On Enhancement (news-fetch live-data inspection view) — OPEN 2026-05-24

**Status:** OPEN 2026-05-24T17:02Z (PO self-initiated from user request, signal `po-news-fetch-livedata-20260524T170200Z.json`). User (config admin, France/GMT+7) wants to eyeball the actual fetched article rows per source pulled from the DB, on the news-fetch dashboard, to judge whether the live pipeline output is correct. **NOT a pilot reopen** — the SCALE pilot stays DONE (12/12, verdict=scale). This is a small additive feature behind the closed pilot. Owner = generic `developer`. Handoff chain: **architect → developer → qa** (NO `pm`/`ba` agent in this harness — PO absorbs close-out: TASKS.md, handoffs, exit gate).

**CRITICAL ARCHITECTURE FINDING (binding, drives the whole design):** `apps/news-fetch/` is a STATELESS scraper. It has NO database, NO repository in `src/domain/repositories.ts` (only scraper ports). Verified end-to-end: news-fetch (port 5008) scrapes → returns JSON over HTTP → `newsHeadlinesRefreshJob.ts` (in mcp-server) POSTs to `/api/push-news` (auth: `x-api-key` = `VPS_PUSH_API_KEY`) → `pushNewsHandler.ts` runs `pollNews` → rows persist in **mcp-server's `rag_analyses` table** (`apps/mcp-server/src/infrastructure/db/schema-news.ts`). Therefore the live-DB view **CANNOT** be served by news-fetch (would require giving the stateless scraper DB creds it has never had — a design regression). It MUST be a read-only endpoint on **mcp-server (port 3000 / `/api/*`)**, which legitimately owns `rag_analyses` and has DB access. The news-fetch dashboard's new live section fetches from that mcp-server endpoint over http.

**SECURITY CLAUSE (binding, carried from pilot):** The sandbox process AND the existing sandbox dashboard panels (Primitives / Module / Microservice, fed by `data.js` under `file://`) MUST stay zero-DB-creds / zero-API-keys and MUST NOT be touched. G6/G8/G9 honest-green sandbox panel is frozen. The live view is a SEPARATE, clearly-labelled dashboard section that talks http to mcp-server only — it never runs in the credential-free sandbox harness and never reads a DB directly. The `data.js` / `file://` sidecar mechanism is for the sandbox panels ONLY; the live section is http-fetch (works only when served, degrades honestly to "live view unavailable — open via served dashboard" under `file://`, never fakes data).

**PRODUCT SHAPE (PO decision):**
- **Source of truth:** mcp-server `rag_analyses` rows where `source_type`/`source` ∈ {reuters, bloomberg} (the two news-fetch sources). Per-source grouping; user can eyeball each source independently.
- **Fields per row (from `rag_analyses`):** source (reuters/bloomberg), headline (`source_title`), url (`source_url`), published-at (`published_at`, parsed/ISO), relevance/sentiment verdict (`sentiment` + `impact_direction`/`impact_score` if present), fetched/ingested-at (`created_at`). Dedup-key is computed in news-fetch and NOT persisted in `rag_analyses` — architect decides whether to surface a derived dedup hint or omit (do not fabricate a stored column).
- **Row count:** last **N=20** rows per source (most-recent-first by `created_at`). Cheap query, enough to eyeball correctness.
- **Live vs cached:** **live query** on each section load (read-only `SELECT … ORDER BY created_at DESC LIMIT 20`). No caching layer — the whole point is "see live data". Endpoint is read-only (SELECT only; never writes).

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| NF-LD-1 | Architect: Security-Clause-safe design of read-only live endpoint on **mcp-server** (`GET /api/news-fetch/live?source=&limit=`, SELECT-only on `rag_analyses`, no new write path) + the SEPARATED news-fetch dashboard live section (http-fetch, honest degrade under `file://`, sandbox panels untouched). Confirm exact `rag_analyses` columns → display fields mapping; decide dedup-key surface or omit. Output: design notes appended to handoff + per-task ACs for NF-LD-2/NF-LD-3. | HIGH | TASK | architect | docs/handoffs/TASK_NF-LD.md | READY | — |
| NF-LD-2 | Developer: implement per architect design — (a) mcp-server read-only `/api/news-fetch/live` route (SELECT-only, source filter, LIMIT 20, no creds in response beyond data) + (b) news-fetch `dashboard/index.html` NEW live section (separate panel, http-fetch the endpoint, render rows table per source, honest "unavailable under file://" degrade). Sandbox panels + `data.js` path UNTOUCHED. Smoke: `bun test` + `bun tsc --noEmit` green; sandbox still 16/16 green (no regression). | HIGH | TASK | developer | docs/handoffs/TASK_NF-LD.md | DONE | NF-LD-1 |
| NF-LD-3 | QA: verify — (1) endpoint is SELECT-only / read-only (no INSERT/UPDATE/DELETE; grep + behavior), (2) Security Clause intact: sandbox env audit still empty-of-credentials, sandbox panels still render honest-green via `data.js` under `file://` (G6/G8/G9 NOT regressed), (3) live section degrades honestly under `file://` (no fake rows), renders real rows when served, (4) full smoke green. Emit `qa-news-fetch-livedata-<UTC>.json`. | HIGH | TASK | qa | docs/handoffs/TASK_NF-LD.md | READY | — |
| NF-LD-EXIT | PO sign-off against acceptance criteria | CRITICAL | GATE | po | — | BLOCKED | NF-LD-3 |

**Notes:**
- **Scope fence:** touches `apps/news-fetch/dashboard/` (new live section only) + `apps/mcp-server/` (one new read-only route — precedent: G5 already established exactly-one mcp-server task is allowed for the HTTP boundary). Do NOT touch the sandbox runner, `data.js`, or the existing 3 sandbox panels. Do NOT absorb cowork-agent (news-scout/market-watcher) work.
- **Constraints binding Day 0 (verbatim):** L84 explicit-file staging (`git add <path>` per file; NEVER `-A` or `.`); no `--force`/`--no-verify`/`--no-gpg-sign`; local-only — do NOT git push source/CI (user owns push); all work on `main` (NO branches); ESM `.js` import suffixes; `Bun.env` not `process.env`; never ask the user — PO decides and continues.
- **Anti-regression:** the SCALE pilot is DONE and stays DONE. This enhancement must NOT flip/alter any pilot goal or `decisionMatrix` in `pilot-status-news-fetch.json` (that file is frozen at 12/12). The live view is product surface, not a pilot goal.
- **Honest-degrade rule (G8 spirit carried forward):** the live section must NEVER fabricate rows. Under `file://` (no server) it shows an explicit "live view requires the served dashboard" message; when served and the endpoint errors it shows the error, not stale/fake data.

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
