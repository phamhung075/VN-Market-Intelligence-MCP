# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---

## BUG DEPLOY-DRIFT — Deployed container images lag latest commit (MCP tools 404) — INCIDENT 2026-05-25

**Status:** OPEN 2026-05-25T07:08Z by PO (filed from user incident report via main terminal). **Incident origin:** 2026-05-25 macro + kinh-dich outage — both microservice containers were unreachable for MCP tool access. **The connectivity ROOT CAUSE is already FIXED + committed** (`a5b6203d` mcp-server Docker-network hostname env vars + `3bd9e6ae` corrected `MACRO_INDICATORS_URL`). These tasks are the **LEFTOVER deployment drift**, not the outage itself: with connectivity restored, two MCP tools still 404 because the deployed images are stale (older builds that predate routes which exist in the repo HEAD). **Priority: HIGH — reliability tier, top of PO order (reliability → coverage → UX → architecture). Dead/partially-dead MCP tools = production reliability.** NOT a SCALE pilot — does NOT consume the WIP=2 fleet cap; does NOT touch any `pilot-status-*.json`. Single-zone dev + ops deploy; the systemic guard may route to architect.

**Zones:** DRIFT-1 = `apps/macro-indicators/` (dev-macro-indicators) + ops (deploy); DRIFT-2 = `apps/kinh-dich-service/` rebuild only (ops; code already at HEAD); DRIFT-3 = `cross-service/` CI/CD (architect design → owner-zone or cross-service dev).

**DONE CONDITION:** (1) `get_macro_calendar` returns 200 with real calendar data end-to-end through mcp-server (not a direct-service bypass — the 3bd9e6ae lesson: direct `/snapshot` test gave a false green); (2) all 4 newer kinh-dich endpoints (`/readings/{code}/history`, `/hexagram/{number}/transitions`, `/backtest/{code}`, `/hexagram/{number}/explain`) return 200 end-to-end + basic tools still work (non-regression); (3) a CI/CD step verifies deployed image SHA matches latest commit before a deploy is declared complete, with a deliberate-drift proof that it catches a stale image.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| DRIFT-1 | **get_macro_calendar 404 — macro image drift.** `/macro-calendar` is NOT in the deployed macro-indicators image (older TS build); the route EXISTS in the Go rewrite at `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` (P2 macro pilot). **DECIDE + EXECUTE one path:** (a) deploy the Go macro-indicators image, OR (b) backport `/macro-calendar` to the deployed TS service. NOTE: the env-var connectivity bug is ALREADY fixed (`3bd9e6ae` set `MACRO_INDICATORS_URL`) — this task is ONLY the missing route. | HIGH | TASK | dev-macro-indicators (path decision + any backport) + ops (deploy) | docs/handoffs/TASK_DEPLOY-DRIFT.md | READY (dispatch NOW — zero contention with active sprints) | — |
| DRIFT-2 | **kinh-dich-service running stale May-20 TS image.** Predates the 2026-05-24 TS→Go reboot + P2-KD-G. Basic tools (`get_market_hexagram`, `get_kinhdich_reading`) work, but 4 newer endpoints 404. **FIX = rebuild + redeploy the container to repo HEAD** — the Go code is ALREADY on disk (`apps/kinh-dich-service/Dockerfile` = Go reboot, `cmd/server/main.go`, latest `746dee48`). This is a redeploy, NOT a code change. | HIGH | TASK | ops (rebuild + redeploy; dev-kinh-dich on standby only if rebuild surfaces a code defect) | docs/handoffs/TASK_DEPLOY-DRIFT.md | READY (dispatch NOW — parallel w/ DRIFT-1) | — |
| DRIFT-3 | **Systemic guard (dev-kinh-dich recommendation).** Add a CI/CD step that verifies the deployed container image matches the latest commit BEFORE declaring a deployment complete — this image-drift class caused BOTH DRIFT-1 and DRIFT-2. **Architect designs first** (cross-service concern: is this one verify-step per service, or a shared deploy-gate?), then routes to the owning zone or cross-service dev. Include a deliberate-stale-image proof (drift detected → deploy fails). | MEDIUM | TASK | architect (design) → owner-zone/cross-service dev (impl) | docs/handoffs/TASK_DEPLOY-DRIFT.md | READY (design-lane; dispatch after DRIFT-1/-2 close OR in parallel on architect lane — no dev WIP contention) | — |
| DRIFT-QA | **QA gate (covers -1 + -2; -3 has its own deliberate-drift proof).** End-to-end through mcp-server: `get_macro_calendar` 200 + real calendar data; all 4 kinh-dich endpoints 200; basic kinh-dich tools non-regression; no test-baseline regression (9277/34). Emit `qa-deploy-drift-<UTC>.json`. | HIGH | TASK | qa | docs/handoffs/TASK_DEPLOY-DRIFT.md | BLOCKED | DRIFT-1, DRIFT-2 |
| DRIFT-CLOSE | PO sign-off vs DONE CONDITION; main terminal commits in-tree work. | HIGH | GATE | po | docs/handoffs/TASK_DEPLOY-DRIFT.md | BLOCKED | DRIFT-QA (DRIFT-3 may close on its own architect+QA proof) |

**Notes:**
- **Priority rationale (PO):** reliability tier outranks ALL active structural work (Phase-0 frontend pilot, P2-TA pilot, BCTC-TABLE, KD-QREF-LANG) in my order, but these are SMALL targeted redeploys/route-fixes, not pilots — they run on the general dev/ops lane and do NOT consume the WIP=2 fleet cap. DRIFT-1 + DRIFT-2 dispatch NOW in parallel; both are isolated single zones with zero collision against active sprints.
- **False-green guard (from incident `3bd9e6ae`):** the prior macro fix gave a false green on a DIRECT `/snapshot` test that bypassed mcp-server; the real path read `MACRO_INDICATORS_URL` (undefined → localhost fallback → refused). DONE CONDITION mandates END-TO-END-through-mcp-server verification for DRIFT-1, not a direct-service curl.
- **DRIFT-2 is a redeploy, not a rebuild-from-new-code:** repo HEAD already carries the Go reboot. If the rebuild surfaces a genuine code defect, escalate to dev-kinh-dich; otherwise ops owns end to end.
- **Recurring-bug guard (binding):** the deploy-drift CLASS now has 2 instances (macro + kinh-dich) from the SAME root cause (image lags commit). DRIFT-3 IS the structural-rethink response per `feedback_recurring_bug_escalation.md` — architect-designed cross-service guard, not another one-off patch. A 3rd drift incident before DRIFT-3 lands → PO blocks all further deploys until the guard ships.
- **Binding (Day-0, every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` zero foreign files; do NOT touch any `pilot-status-*.json`; never ask user to run/deploy — spawn ops/dev. HONEST counts only — verify deployed image SHA, not "should be deployed."

---

## Phase 0 Backlog (Frontend SCALE Pilot) — CLOSED → PHASE 1 MVR BUILD COMPLETE + QA-APPROVED (AWAITING USER G9 SIGN-OFF)

**Status (2026-05-25T08:32Z, PO close-out):** **Phase-1 MVR BUILD COMPLETE + QA-APPROVED.** QA (P1-QA cycle-114) returned APPROVED — frontend MVR Phase 1 PASSES all checks (verification commit `c85f577c`; build commits `3ef797d0` P1-A render-gate, `eeb4d2f8` P1-B1..B4 formatters, `9b55a086` P1-C view-model, `94f12fd0` handoff). Vitest 179/0, Playwright 4/0 (both independently re-run); honest-green PASS; behavior-preservation PASS (P1-E route rewire pure refactor); market-data policy test present+passing; scope-guard PASS (no G4 fence). Report: `reports/TASK_REPORT_P1-FE-WAVE-A.md`.
- **PO graded goals HONESTLY (no inflation) in `pilot-status-frontend.json`:** **G1+G2+G6+G8 = YES (goalsEarned=4)** — formatter primitives + view-model module + render-gate trust surface + honest red/green. **G12 streak 3/3 COMPLETE held EARNED-PENDING (PARTIAL, not counted)** per §4.5. **G9 = PARTIAL** (Path-B PO/QA Playwright render-gate PASS; Path-A user verbal G9 STILL PENDING). N/A or not-exercised for UI-MVR Phase 1: G3 (no composition root), G5 (no mcp-server old-code location), G4 (Phase-2 ESLint fence), G7 (edit-JSON-rerun sandbox not built), G10/G11 (AI-fixability not exercised).
- **Top-level status=ACTIVE, verdict=TBD, decisionMatrix=TBD retained** — per "Scale pilot DONE bar" rule a UI MVR is NOT DONE until USER gives verbal G9 sign-off. Pilot marked **AWAITING-USER-G9-SIGNOFF** (`pilot-status-frontend.json` § awaitingUserG9Signoff).
- **CONTAINER REBUILD:** frontend container currently runs PRE-Phase-1 code; code is committed + QA-passed → **frontend container is now CLEAR to be rebuilt in the SEPARATE docker session** (one-at-a-time, 8GB cap, host memory-panic constraint). NOT rebuilt by PO.
- **TO FULLY CLOSE the frontend pilot:** (1) user verbal G9 sign-off + (2) frontend container rebuild in docker session. (Full 12/12 + matrix is a Phase-2 terminal close, separate from this MVR Phase-1 milestone.)

**Status (historical, Phase 0):** Phase 0 CLOSED 2026-05-25T08:00Z by PO (P0-FE-EXIT verdict=AUTHORIZED). All 6 deliverables landed; Phase 1 OPEN; `dev-frontend` CLEARED for WAVE-A MVR build dispatch (P1-A first, WIP=1 sequential). Exit gate signed off PO-self: the architect's COMPLETE brownfield + READY-FOR-DISPATCH Phase-1 plan (both c4def776) ARE the architectural confirmation — no fresh-architect re-review required (zero unresolved design question, MVR scope BINDING+rationalized, R-1..R-4 addressed, G5=N/A settled, G12 flow-gate baked e4812778 + agent registration verified PASS). SSOT `docs/data/pilot-status-frontend.json`: phase0.status=CLOSED, phase=1, phase1.status=ACTIVE, phase1.gateVerdict=AUTHORIZED.

**Status (historical):** OPEN 2026-05-25T06:56Z by PO (self-initiated per user directive "refactor continue"). **This is the next-up scale pilot in the 2026-05-22 Deep-Module+DDD three-tier rollout.** Scoreboard: master TA pilot CLOSED (12/12, verdict=scale) + **9 of 9 fleet pilots DONE+verdict=scale** (technical-analysis-as-master, alert-engine, api-gateway, kinh-dich, macro-indicators, news-fetch, pdf-extractor, rag-service, stock-price). **2 remained PENDING at pre-0: frontend + mcp-server.** PO charters **frontend FIRST** (this section); **mcp-server stays sequenced LAST/SOLO** (see gate below). Charter: thin `docs/architecture-briefs/2026-05-22-refactor/scale/frontend-charter.md` → canonical G1–G12 in `pilot-charter.md`. Owner = `dev-frontend`. Language LOCKED TypeScript (Remix). Port per system-map.json. SSOT: `docs/data/pilot-status-frontend.json` (flipped phase0=OPEN this cycle). Sprint deadline: kickoff + 6 sprints (2026-07-06).

**WHY FRONTEND FIRST, NOT mcp-server (PO sequencing decision 2026-05-25):** (a) **mcp-server's own charter mandates RUN-SOLO / SCHEDULE-LAST** (`mcp-server-charter.md` §Scheduling L26-62, "non-negotiable"): it runs SOLO, after EVERY other service charter is complete, because its ~132-tool barrel edit has the widest blast radius and it writes the shared substrates (docs/signals, docs/data, scheduler) that a concurrent-commit-race would corrupt. (b) **Right now `apps/mcp-server/` is actively churning** — NEWS-INGEST-2b (dev-mcp-server, landed `e1e08a29`) + `fix(ops): MCP server Docker network` (`a5b6203d`) — chartering mcp-server now would trigger exactly the SSOT-duplicate-key + git-index-race failure class the charter warns against. (c) frontend's zone (`apps/frontend/` ONLY) is fully isolated from all active sprints (NEWS-INGEST, BCTC-TABLE, P2-TA, P0-SP) → zero contention. Frontend FIRST is the correct path TO mcp-server, not a detour.

**MVR-SCOPE FLAG (binding for P0-FE-1, charter §Risk 4):** frontend is the LEAST domain-driven service + LOWEST priority for the trust thesis (the "AI-can't-fix-bugs / dashboards-as-trust" pain is sharpest for computational services, not a UI). Architect MUST evaluate a lighter MVR-style treatment (Playwright render gate + view-model tests, skip heavy primitive extraction) vs. full primitive extraction, and recommend scope. Do NOT force-extract React components as "primitives" — honest G1 for a UI = a small set of PURE formatters (`format-change-direction`, `format-vnd`, `classify-stale-badge`, etc.). Bake the market-data UI policy (always show direction + delta %, never bare snapshot) as a tested scenario.

**FLEET-WIP GATE (binding):** the scale-pilot **WIP=2 fleet cap is currently FULL** — P2-F2 (agent-father) + P2-A1 (dev-technical-analysis) both IN-PROGRESS. NEWS-INGEST + BCTC-TABLE are NOT pilots (general dev lane, do NOT consume the cap). Phase-0 chartering runs on the architect/agent-father planning lane, NOT the dev WIP cap — but **agent-father is occupied by P2-F2**, so P0-FE-3 (flow-baking) GATES on P2-F2 landing. The two architect deliverables (P0-FE-1 + P0-FE-2) have ZERO contention and dispatch NOW.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| P0-FE-1 | Brownfield inventory of `apps/frontend/` (Remix/Vite/Tailwind, NOT DDD-shaped) + **MVR-vs-full-extraction scope recommendation** (charter §Risk 4) — identify the small PURE-formatter primitive set + view-model module boundary + Playwright render-gate trust surface | HIGH | TASK | architect | docs/handoffs/TASK_P0-FE-1-brownfield-inventory.md | **DONE** (architect, COMPLETE — verdict MVR, port 3001, 4 formatters, G5=N/A; c4def776) | — |
| P0-FE-2 | Bug-inventory entry: `frontend_baseline` (G10 metric) — pick/synthesize a primitive-class baseline for a UI formatter (B-class is render/IO, NOT primitive — same caveat as news-fetch P0-NF-2) | HIGH | TASK | architect | docs/handoffs/TASK_P0-FE-2-bug-inventory-entry.md | **DONE** (frontend_baseline synthesized; B-class render/IO noted NOT primitive) | — |
| P0-FE-3 | Agent-father: confirm `dev-frontend` agent + bake thin `.claude/flows/dev-frontend/main.md` with G12 DoD gate (Playwright-render-green-before-RETURN) + ESLint-fence note (TS service → G4 = ESLint per SI-3) | HIGH | TASK | agent-father | docs/handoffs/TASK_P0-FE-3-flow-baking.md | **DONE** (agent registration verified PASS; G12 render-green DoD gate + MVR streak rule baked into flow; e4812778) | P2-F2 (cleared) |
| P0-FE-5 | Phase-1 task plan authoring (architect) — adapt goal-verification methods for a UI (G7=edit-fixture-rerender, G8=render-snapshot honesty) per charter §Risk 2; respect the P0-FE-1 MVR scope verdict | HIGH | TASK | architect | docs/handoffs/TASK_P0-FE-5-phase1-task-plan.md | **DONE** (architect, READY-FOR-DISPATCH — mvr_verdict=MVR, 8 tasks/43 ACs, G7/G8/G9 UI adaptations; c4def776) | P0-FE-1, P0-FE-2 |
| P0-FE-4 | Set anchor + update `pilot-status-frontend.json` deliverable flags (Phase-0 completion honestly recorded) | MEDIUM | TASK | po (pm absorbed) | docs/handoffs/TASK_P0-FE-4-anchor-commit.md | **DONE** (PO — pilot-status phase0=CLOSED, all deliverable flags DONE, MVR verdict recorded, P0-FE-3 flow-gate cited e4812778, schema-validated zero-dup-keys; no fabricated G1–G12) | P0-FE-1, P0-FE-2, P0-FE-3 (all deliverables before anchor) |
| P0-FE-EXIT | Phase 0 exit gate verification (architect+PO) → PO approves Phase 0→Phase 1 | CRITICAL | GATE | architect+po | — | **AUTHORIZED** (PO — Phase 0 CLOSED, Phase 1 OPEN; dev-frontend CLEARED for WAVE-A. PO-self sign-off: architect's terminal-state brownfield+task-plan ARE the architectural confirmation; no fresh-architect re-review needed — no open design question) | P0-FE-1..5 all DONE |

**Notes:**
- **Planning sequence (SPRINT-L, structural refactor):** BA = N/A for Phase 0 (no user-facing requirement — structural). Sequence is **architect → agent-father → po (pm absorbed)**. architect leads (brownfield + bug-inventory + scope verdict + phase-1 plan); agent-father bakes the G12 DoD gate; po sets anchor + sequences (no `pm` agent in this harness).
- **Parallel dispatch eligible NOW:** P0-FE-1 + P0-FE-2 (both architect, independent, zero collision w/ active dev WIP or `apps/mcp-server/` churn). P0-FE-5 depends on FE-1+FE-2. P0-FE-3 GATED on P2-F2 (agent-father lane). P0-FE-4 anchor last.
- **Anti-scope-creep:** `apps/frontend/` ONLY. Do NOT absorb mcp-server/dashboard work.
- **DEV-AGENT DECISION (PO, 2026-05-25):** `dev_agent_file` = **`dev-frontend`** (already named in charter `owner:` + pilot-status; agent-father to CONFIRM existence, not necessarily create). `dev_agent_flow_file` = thin **`.claude/flows/dev-frontend/main.md`** carrying the G12 Playwright-render DoD gate, zone=`apps/frontend/` (matches stock-price/news-fetch per-service-flow precedent).
- **Binding (Day-0, every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` zero foreign files; touch ONLY `pilot-status-frontend.json` (other pilot-status files frozen); never ask user to run/deploy — spawn agents. HONEST counts only.

### Phase 1 MVR Build (WAVE A) — DONE + QA-APPROVED 2026-05-25

| Task ID | Title | Goals | Owner | Status |
|---------|-------|-------|-------|--------|
| P1-A | Playwright render-gate (3 checks + smoke) + PORT env config | G6, G8, G9 | dev-frontend | **DONE** (3ef797d0) |
| P1-B1..B4 | 4 pure formatter primitives → `app/domain/formatters/` + Vitest scenarios (G12 streak #1/#2) | G1, G12 | dev-frontend | **DONE** (eeb4d2f8) |
| P1-C | View-model stub `app/lib/view-models/analysis-vm.ts` composes formatters (G12 streak #3) | G2, G12 | dev-frontend | **DONE** (9b55a086) |
| P1-E | Route rewire `dashboard.analysis.tsx` → formatters (remove local fns); pure refactor | G2 | dev-frontend | **DONE** (in eeb4d2f8/9b55a086 set; handoff 94f12fd0) |
| P1-QA | Phase-1 close-gate: Vitest 179/0, Playwright 4/0, honest-green, behavior-preservation, scope-guard | G1,G2,G6,G8,G12 | qa | **DONE 2026-05-25 — APPROVED** (c85f577c; TASK_REPORT_P1-FE-WAVE-A.md) |

- **G12 streak tasks:** P1-B1 (#1) + P1-B2 (#2) + P1-C (#3) — render-green DoD gate enforced per task (flow e4812778). Streak 3/3 COMPLETE; held EARNED-PENDING per §4.5.
- **Remaining to fully close frontend pilot:** (1) USER verbal G9 sign-off on rendered trust contract; (2) frontend container rebuild in SEPARATE docker session (code committed + QA-passed → CLEAR to rebuild; NOT done by PO). Full 12/12 + decisionMatrix = future Phase-2 terminal close.

---

## mcp-server SCALE Pilot — Phase-0 HELD pre-0 / SEQUENCED LAST / SOLO (analysis-track running NOW)

**Status:** Phase-0 **HELD pre-0** (PO gate RE-AFFIRMED 2026-05-25T07:06Z under user directive *"fan out subagents in parallel, complete the 2 last refactor services [frontend + mcp-server], rebuild the container(s), and verify"*). SSOT: `docs/data/pilot-status-mcp-server.json` (phase0.status=PENDING; `sequencingGate.decision=HELD-LAST-SOLO`). **The user's "do both" is honored by SEQUENCING, not parallel Phase-0 opening** — both services WILL reach containers-rebuilt+verified this rollout; mcp-server's BUILD is serialized SOLO-last (see § BUILD-WAVE SEQUENCING). This is the FINAL pilot — closes the 2026-05-22 rollout at 11/11.

**PARALLEL ANALYSIS-ONLY TRACK (running NOW, dispatched by main terminal this cycle):** an architect runs a **READ-ONLY brownfield inventory** of `apps/mcp-server/` (~132 tools / 10-module barrels) — NO source edits, NO barrel edits, NO pilot-status edits, NO charter/scale-doc edits beyond the brownfield doc it owns. This is parallel-SAFE (zero write contention with the frontend lane or active dev WIP) and front-loads the highest-risk service so its Phase-0 chartering is fast once the gate clears. **It does NOT open Phase 0.**

**DO NOT open Phase 0 (flip phase0.status OPEN + seed the backlog below) until ALL THREE conditions clear** (PO gate):
1. **Frontend Phase 0→Phase 1 transition complete** — mcp-server runs after EVERY other service charter is done (charter §Sequencing mandate, "non-negotiable"). **CONDITION #1 NOW MET (2026-05-25T08:32Z):** frontend Phase 0 CLOSED + Phase 1 MVR build COMPLETE + QA-APPROVED (c85f577c). Conditions #2 (mcp zone quiesced) + #3 (WIP free) STILL pending → mcp-server stays HELD pre-0.
2. **`apps/mcp-server/` quiesced** — NEWS-INGEST-2/-2b CLOSED + NEWS-INGEST-LIVE proven + ops Docker-network fix settled (`a5b6203d` landed) + no active dev/ops sprint touching mcp-server's barrels / docs/signals / docs/data / scheduler. RUN-SOLO requires zero other scale terminal active AND a stable shared-write surface (charter §Key risks 1-2: ~132-tool blast radius + concurrent-commit race).
3. **Scale dev WIP=2 cap FREES** — currently FULL (P2-F2 agent-father + P2-A1 dev-technical-analysis in-flight). mcp-server build must hold a clean SOLO slot.

**Phase-0 backlog (PRE-SEEDED, all HELD until the 3-condition gate clears — mirrors the Frontend Phase-0 chain; IDs activate at charter):**

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| P0-MCP-1 | **Brownfield inventory of `apps/mcp-server/`** (~132 tools, 10-module barrel structure, decomposed 8-slice schema, ~29 cron jobs, all HTTP-client wiring) + barrel-decomposition seams + candidate primitives (signal-bus / sector-classifier / portfolio-aggregator / ops-debug) + G5-inverse map (dead/migrated tool code now in microservices). **ANALYSIS-ONLY, read-only — running NOW in parallel.** | HIGH | TASK | architect | docs/handoffs/TASK_P0-MCP-1-brownfield-inventory.md | **IN-PROGRESS (analysis-only, parallel-safe)** — does NOT open Phase 0 | — |
| P0-MCP-2 | Bug-inventory entry: `mcp_server_baseline` (G10 metric) — pick/synthesize a primitive-class baseline for a cross-cutting helper (signal-bus / sector-classifier) | HIGH | TASK | architect | docs/handoffs/TASK_P0-MCP-2-bug-inventory-entry.md | HELD (gate) | 3-condition gate |
| P0-MCP-3 | Agent-father: confirm `dev-mcp-server` agent + bake/confirm `.claude/flows/dev-mcp-server/main.md` with G12 DoD gate (sandbox-green + full-tool-suite-pass before RETURN) + ESLint-fence note (TS service → G4 = ESLint per SI-3) | HIGH | TASK | agent-father | docs/handoffs/TASK_P0-MCP-3-flow-baking.md | HELD (gate + agent-father lane) | 3-condition gate, P2-F2 |
| P0-MCP-5 | Phase-1 task plan authoring (architect) — barrel-decomposition order (smallest-blast-radius first), per-split full-tool-suite QA gate, scheduler/cron render-verification, G5-inverse HTTP-route-proof per tool, RUN-SOLO commit discipline | HIGH | TASK | architect | docs/handoffs/TASK_P0-MCP-5-phase1-task-plan.md | HELD (gate) | P0-MCP-1, P0-MCP-2 |
| P0-MCP-4 | Set anchor commit (`mcp-server-pre-refactor` tag, local-only) + update `pilot-status-mcp-server.json` deliverable flags + flip phase0.status OPEN | MEDIUM | TASK | po (pm absorbed) | docs/handoffs/TASK_P0-MCP-4-anchor-commit.md | HELD (gate) | P0-MCP-1, P0-MCP-2, P0-MCP-3 |
| P0-MCP-EXIT | Phase 0 exit gate verification (architect signal) → PO approves Phase 0→Phase 1 | CRITICAL | GATE | architect+po | — | HELD (gate) | P0-MCP-1..5 all DONE |

**Notes:**
- **HIGHEST-RISK / RUN-SOLO (charter §Key risks):** ~132-tool blast radius; concurrent-commit race on shared substrates (docs/signals, docs/data, scheduler); history of `git add -am` over-staging (26-file sweeps); ~29 cron jobs coupled inside the service; it also HOSTS trust dashboards (circular-dependency care during split). Every barrel split QA-gated against the FULL tool suite before proceeding.
- **G5 is the INVERSE goal here:** for the Go/Python services G5 deleted old mcp-server TS code; for mcp-server's OWN refactor G5 = remove dead/migrated tool code now living in microservices, with EVERY MCP tool handler proven to route via HTTP.
- **Anti-scope-creep:** `apps/mcp-server/` ONLY (largest single-service zone in the repo).
- **Binding (Day-0, every agent):** explicit-file staging (`git add <path>`, never `-A`/`.` — load-bearing here given the over-staging history); commit-mutex acquired (kind=`sprint-task` per enum-drift workaround) before any add/commit; sequential SOLO commits; no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push` (user owns); all on `main`; `git show --stat HEAD` zero foreign files; touch ONLY `pilot-status-mcp-server.json` among pilot files; never ask user to run/deploy — spawn ops/dev.

---

## BUILD-WAVE SEQUENCING — Final Waves to "Containers Rebuilt + Verified" (PO governance, 2026-05-25)

**Owner:** PO sequences; **main terminal dispatches** each wave when its gate opens. This section is the authoritative dispatch order for the user's end-state ("complete the 2 last refactor services, rebuild the container(s), verify"). **Concurrency verdict: SERIALIZED across the two services' BUILD waves** (analysis/planning may parallelize; BUILD may not). Rationale: true-parallel barrel/source edits across the shared substrates (`docs/signals`, `docs/data`, scheduler, the MCP tool host) reproduce the repo's documented concurrent-commit-race + SSOT-duplicate-key corruption (`feedback_concurrent_commit_race.md`, `feedback_ssot_duplicate_key.md`, mcp-server-charter §Key-risk 2). mcp-server's own charter mandate (RUN-SOLO / SCHEDULE-LAST, "non-negotiable") is the binding constraint.

**Concurrency policy table:**

| Activity | May run parallel? | Constraint |
|---|---|---|
| Frontend Phase-0 planning (P0-FE-1/-2/-5) | YES (its own lane) | zero contention w/ mcp zone |
| mcp-server **analysis-only** brownfield (P0-MCP-1) | YES — alongside frontend planning | read-only, no writes to shared substrate |
| Frontend **BUILD** (Phase-1 dev waves) | on its lane | `apps/frontend/` isolated; safe alongside non-mcp dev |
| mcp-server **BUILD** (Phase-1 dev waves) | **NO — SOLO ONLY** | no other scale/dev terminal touching mcp zone; serialized AFTER frontend build wave + WIP-free + zone-quiesced |

**Ordered final waves (each gate must close before the next dispatches):**

- **WAVE A — Frontend build (per its Phase-1 plan). BUILD COMPLETE + QA-APPROVED 2026-05-25T08:32Z.** Owner: `dev-frontend`. Lane: `apps/frontend/` only. Shipped P1-A/B1-B4/C/E (3ef797d0, eeb4d2f8, 9b55a086, 94f12fd0); QA cycle-114 APPROVED (c85f577c); Vitest 179/0 + Playwright 4/0 green; frontend pilot-status reflects Phase-1 (goalsEarned=4, AWAITING-USER-G9-SIGNOFF). **Gate A→B SATISFIED** (frontend Phase-1 dev shipped + Playwright-render green + pilot-status reflects progress) = mcp-server unblock condition #1 MET. **Note:** the frontend CONTAINER itself is now clear to rebuild in the separate docker session (Wave C scope) — code committed + QA-passed.
- **WAVE B — mcp-server build SOLO (per its Phase-1 plan).** Dispatch: ONLY after (i) WAVE A's build wave is quiet, (ii) the 3-condition gate above clears (frontend Phase 0→1 done + mcp zone quiesced + WIP free), (iii) mcp-server Phase 0 has been opened+closed in a prior cycle. Owner: `dev-mcp-server`, RUN-SOLO — **no other dev/scale terminal active**. Each barrel split QA-gated against the full tool suite. **Gate B→C:** all targeted barrel splits + G5-inverse HTTP-route-proofs landed; full tool suite green; mcp-server sandbox/dashboard green.
- **WAVE C — ops rebuilds affected Docker containers + proves health LIVE.** Dispatch: after WAVE B (and WAVE A if its containers also changed). Owner: `ops`. Action: `docker compose up -d --build` for affected services (frontend container + mcp-server container); then prove live: `get_system_status()` healthy, tool count == expected (`146` baseline per project-stats, adjusted for any G5-inverse removals), affected dashboards render, scheduler crons fire. Disk-green is NOT enough — live health is the truth gate. **Gate C→D:** live container reports healthy + correct tool count + dashboards/crons verified.
- **WAVE D — QA regression / sandbox-green gate (whole-fleet).** Dispatch: after WAVE C. Owner: `qa`. Action: re-run test baseline (target ≥ 9277 pass / 34 known-fail, no NEW fails), sandbox-green across affected services, frozen-surface diff-scope, emit `qa-refactor-final-<UTC>.json`. **Gate D→close:** baseline held + zero new fails + sandboxes green → PO final sign-off on both pilots' Phase transitions; verdict matrices authored PO-only at each pilot's 12/12 terminal.

**Why NOT parallel BUILD (one-line):** frontend's zone is isolated and could in principle build alongside non-mcp dev, but mcp-server's BUILD must be SOLO — and since the user wants BOTH delivered, the safe global ordering is A→B→C→D with mcp-server holding the SOLO slot after frontend's build wave settles.

---

## BUG NEWS-INGEST — News ingest silently rejects entire feed as duplicates (TRACKED BUG FIX)

**Status:** OPEN 2026-05-24T21:49Z; NEWS-INGEST-1 **DONE** 2026-05-24T21:58Z; PO routing 2026-05-24T22:03Z. **Priority: HIGH — production reliability, top of PO order (reliability → coverage → UX → architecture).** Bug report + ops evidence + chain + ACs + PO routing decision: `docs/handoffs/TASK_NEWS-INGEST.md`. **Zone (DETERMINED):** confirmation = `apps/mcp-server/` (dev-mcp-server, done); NEWS-INGEST-2 fix = `vps-scripts/fetch-vn-news.sh` (`cross-service/` script logic → `developer`; `ops` deploys+proves); NEWS-INGEST-2b display fix = `apps/mcp-server/` (dev-mcp-server). NOT a pilot — does NOT consume the WIP=2 fleet cap; does NOT touch any `pilot-status-*.json`.

**Bug:** Live container logs show EVERY `pollNews` cycle ending `fetched:160 inserted:0 duplicates:160`. **CONFIRMED root cause (c):** the VPS proxy re-pushes the SAME ~160 already-stored articles every ~15m cycle (no since-cursor); mcp-server correctly drops all 160 as already-stored → `inserted:0`. The mcp-server dedup layers (title-dedup + partial UNIQUE index) are CORRECT and MUST NOT be changed. **Count correction:** `rag_analyses` is NOT near-empty — it holds **≥160 VN-source rows** (oldest 2026-05-22). The "~1 row" earlier reported was the dashboard LIVE-PANEL count (reuters/bloomberg-only filter), NOT the table count → that filter is NEWS-INGEST-2b.

**DONE CONDITION:** root cause CONFIRMED (done) → NEWS-INGEST-2 cursor fix lands in `fetch-vn-news.sh` (+ NEWS-INGEST-2b display fix if user wants VN articles visible) → QA gate (a real cycle inserts >0 NEW rows w/ DISTINCT source_urls OR deterministic cursor test; panel shows VN articles; no test regression; dedup STILL blocks genuine duplicates) → PO sign-off → **ops PROVES LIVE** (deploy patched script, real cycle shows `inserted` > 0 + `rag_analyses` count rising w/ distinct VN source_urls + panel shows VN stock articles). Disk-green is NOT enough — the live-proof step is the final truth gate.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| NEWS-INGEST-1 | **CONFIRM root cause (ROUTE FIRST).** Per-article debug logging on ONE real cycle; emit histogram; decide (a')/(b). | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_NEWS-INGEST.md | **DONE 2026-05-24T21:58Z (`7e350f56`)** — both hypotheses RULED OUT; root cause = **(c) VPS re-push** of 160 already-stored articles every cycle (160/160 already_in_db, oldest 2026-05-22). mcp-server dedup is CORRECT — do NOT change it. | — |
| NEWS-INGEST-2 | **FIX the re-push at SOURCE.** Add a persistent "since"/last-seen cursor to `vps-scripts/fetch-vn-news.sh` (L180 dedups within-cycle only → re-pushes the same ~160 newest RSS items every ~15m). Push ONLY URLs/`publishedAt` newer than the prior cycle (VPS state file). MUST NOT weaken mcp-server dedup (stays as 2nd line). | HIGH | TASK | **developer** (script logic; `ops` deploys+proves) | docs/handoffs/TASK_NEWS-INGEST.md | **READY** (dispatch NOW — NEWS-INGEST-1 done) | NEWS-INGEST-1 (done) |
| NEWS-INGEST-2b | **FIX the dashboard display filter.** `newsFetchLiveHandler.ts` hard-codes `WHERE source_url LIKE '%reuters%' OR '%bloomberg%'` for ALL branches incl `source=all`, and `VALID_SOURCES` has no VN option → the ≥160 stored VN stock articles are INVISIBLE in `GET /api/news-fetch/live`. Surface VN providers (cafef/vnexpress/vneconomy); keep reuters/bloomberg as non-regression. Do NOT touch the dedup write path. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_NEWS-INGEST.md | **READY** (SIBLING of -2, parallel-eligible — more direct fix for "no stock article") | NEWS-INGEST-1 (done) |
| NEWS-INGEST-3 | **QA gate (covers -2 AND -2b).** -2: real cycle inserts >0 NEW rows w/ DISTINCT source_urls OR deterministic cursor test (N old + M new → exactly M pushed). -2b: `/api/news-fetch/live` returns VN articles when present, reuters/bloomberg still returned (pos+neg). baseline 9277/34 no new fails; dedup still blocks genuine dup-URL + repeated-title (pos+neg). Emit `qa-news-ingest-<UTC>.json`. | HIGH | TASK | qa | docs/handoffs/TASK_NEWS-INGEST.md | BLOCKED | NEWS-INGEST-2, NEWS-INGEST-2b |
| NEWS-INGEST-FIX | fixer cycle (only if QA CHANGES_REQUESTED). | MEDIUM | TASK | fixer | docs/handoffs/TASK_NEWS-INGEST.md | BLOCKED | NEWS-INGEST-3 |
| NEWS-INGEST-CLOSE | PO sign-off vs ACs; main terminal commits in-tree work. | HIGH | GATE | po | docs/handoffs/TASK_NEWS-INGEST.md | BLOCKED | NEWS-INGEST-3 |
| NEWS-INGEST-LIVE | **ops PROVE LIVE (FINAL truth gate).** Deploy patched `fetch-vn-news.sh` to Vinahost; run/await real cycle; show `inserted` > 0 in live `pollNews` log + `rag_analyses` count rising w/ distinct VN source_urls. ALSO paste AUTHORITATIVE `rag_analyses` count (total + non-VN vs VN) for Q1 closure. AND confirm panel shows VN stock articles (-2b live check). | CRITICAL | GATE | ops | docs/handoffs/TASK_NEWS-INGEST.md | BLOCKED | NEWS-INGEST-CLOSE |

**Notes:**
- **NEWS-INGEST-1 verdict (DONE):** Both PO hypotheses ((a') shared URL, (b) title-dedup over-match) RULED OUT on a real live cycle (2026-05-24T21:57:17Z, 160 articles, all distinct/valid URLs). Root cause = **(c)** the VPS re-pushes the SAME ~160 already-stored articles every cycle (no since-cursor) → mcp-server correctly drops all 160 → `inserted:0`. The mcp-server dedup layers are CORRECT and MUST NOT be changed.
- **Fix-zone correction (PO 2026-05-24T22:03Z):** the re-push originates in `vps-scripts/fetch-vn-news.sh` L180 (in-repo VPS crawl script, deployed to Vinahost), NOT `apps/news-fetch/` (that service scrapes Reuters/Bloomberg ONLY — VN sources never flow through it). There is **no `dev-news-fetch` agent** (charter: generic `developer` owns news ingestion). NEWS-INGEST-2 = `developer` (script logic, `cross-service/`) + `ops` (deploy + live-prove). Full trace + line-180 evidence in handoff § PO Routing Decision.
- **Two open questions RESOLVED (same root cause, two angles):** Q1 — `rag_analyses` holds **≥160 VN-source rows** (NOT "~1 row"; the "~1" was the dashboard PANEL count, see Q2). Authoritative total+breakdown captured by ops at NEWS-INGEST-LIVE (live container DB; local-disk `market.db` is stale/junk per PDF-INSPECT trail). Q2 — the live panel structurally EXCLUDES VN articles (reuters/bloomberg-only filter, no VN enum option) → scoped as **NEWS-INGEST-2b** (`dev-mcp-server`, `apps/mcp-server/`); arguably the more direct fix for the user's "why no stock article."
- **Recurring-bug guard (binding):** ≥2 fix commits on the same module without resolution → PO blocks + calls architect (`feedback_recurring_bug_escalation.md`). NEWS-INGEST-2 is the FIRST fix on `fetch-vn-news.sh`'s push-selection logic — NOT triggered. A 2nd cursor-fix commit without resolving `inserted:0` → PO blocks before any 3rd attempt. mcp-server BCTC write path retains its own recurring history (1953/1954) — unchanged.
- **Binding (Day-0, every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); sequential commits; no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` zero foreign files; do NOT touch any `pilot-status-*.json`; never ask user to run/deploy — spawn ops/dev. HONEST counts only.

---

## Sprint BCTC-TABLE — Correct Result-Table Extraction for BCTC Analysis (NEW BUILD)

**Status:** OPEN 2026-05-24T21:24Z (PO from explicit user `/goal`: *"bctc can extract correct result table for analyze"*, via main terminal). Goal: `docs/SPRINT_GOAL.md` (Sprint BCTC-TABLE). Research SSOT (DONE, no new research): `docs/architecture-briefs/2026-05-24-bctc-table-extraction-research.md`. Spec + per-task ACs: `docs/handoffs/TASK_BCTC-TABLE.md` (architect appends blueprint). **Zone:** primary `apps/pdf-extractor/` (sole BCTC extraction owner); model hosting = main-server infra (ops / dev-mainserver-crawls). **WIP=2 fleet cap.** Pilot stays DONE 12/12 FROZEN — `pilot-status-pdf-extractor.json` NOT edited (post-pilot correctness build, not a reopen).

**PRIVACY GUARDRAIL (binding, non-negotiable):** NO task in this sprint sends a financial PDF or page-image to a third-party API. The external-API VLM cross-check is DEFERRED + opt-in (Open Question 1). Phase-0 + the self-hosted track have ZERO external data flow. Any task proposing an off-infra data send is REJECTED back to PO.

**FREEZE COORDINATION:** the 1954c BCTC write-chain consolidation (recurring-bug-escalation freeze) has LANDED (`372fbc91` deprecate pdfOcrWorker; service = sole extraction owner). This sprint builds table-structure extraction ON TOP of the consolidated path. Architect (BT-2) must confirm no collision with frozen write paths before dev touches shared code.

**DONE CONDITION:** (1) parse fix lands + VNM/DHG decimal-shift flips red→green or is caught as `"shift"`; (2) Phase-0 scoreboard covers all 14 gold-set docs × candidates on figure-accuracy + TEDS, PO records measured production pick; (3) winning extractor integrated as adapter, regex column-picking replaced, regression gate meets the agreed figure-accuracy bar, model deployed + ops PROVES live; (4) `reconcile_figures` cross-check gate blocks >10× divergence + WORK alert; (5) audit proves zero off-infra data send.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| BT-1 | **Vietnamese number-format fix (parse-half).** Pure primitives: `vn_number_normalize` (adapter-fed clean string, `.`=thousands `,`=decimal), `reconcile_figures` (generalize >10× `isDecimalShiftAnomaly` → "agree"/"shift"/"low"), `select_period_column` (pick consolidated-current-quarter col). Unit tests w/ VNM `0.000051` + DHG `0.000009` as red→green anchors. Primitives stay PURE (zero infra import). | CRITICAL | TASK | dev-pdf-extractor | docs/handoffs/TASK_BCTC-TABLE.md | READY (dispatch in parallel w/ BT-0; no model needed; ships immediate correctness) | — |
| BT-0 | **Phase-0 SPIKE (gates BT-2+).** Build eval harness + 14-doc gold-set JSON (VNM/DHG anchors). Run PP-StructureV3 + PaddleOCR-VL-0.9B + 1 backup (Surya/Marker or TATR) on the gold-set, CPU, Intel Mac. Score TEDS-Content + GriTS + cell-F1 + figure-accuracy. Emit scoreboard CSV/HTML. SELF-HOSTED candidates ONLY (zero external API). | HIGH | SPIKE | dev-pdf-extractor | docs/handoffs/TASK_BCTC-TABLE.md | READY (dispatch FIRST, parallel w/ BT-1; timebox 1 sprint) | — |
| BT-0-PICK | PO reads BT-0 scoreboard → records production extractor pick + measured pass-bar verdict (default ≥95% within ±0.5% if no user answer). | HIGH | GATE | po | docs/handoffs/TASK_BCTC-TABLE.md | BLOCKED | BT-0 |
| BT-2 | **Architect blueprint (DESIGN ONLY).** Integration design for spike winner as infra adapter: adapter boundary, `ExtractTablesUseCase`, new-primitive wiring, PDF→PNG renderer, main-server hosting (CPU vs GPU — Open Q2), Security Clause (sandbox zero creds, import-linter fence). Confirm no collision w/ 1954c frozen write paths. | HIGH | TASK | architect | docs/handoffs/TASK_BCTC-TABLE.md | BLOCKED | BT-0-PICK |
| BT-3 | **Integrate winning extractor.** Build the infra adapter (e.g. `PpStructureTableAdapter`) + `PdfPageRenderer`; wire through `ExtractTablesUseCase`; replace blind regex column-picking with `select_period_column` over real cells. Zero creds in sandbox. | HIGH | TASK | dev-pdf-extractor | docs/handoffs/TASK_BCTC-TABLE.md | BLOCKED | BT-2, BT-1 |
| BT-4 | **Deploy model to main server.** Host the winning self-hosted extractor (PP-Structure / PaddleOCR-VL) as a main-server infra adapter (Docker). Confirm CPU-feasible or size for GPU per Open Q2. NO model on the Mac in prod. | HIGH | TASK | ops + dev-mainserver-crawls | docs/handoffs/TASK_BCTC-TABLE.md | BLOCKED | BT-2 |
| BT-5 | **Cross-check confidence gate (self-hosted).** Wire `reconcile_figures` into the app layer: >10× divergence → block insert + WORK-channel alert; surface in `/api/bctc-inspect`. Image-track cross-check = SELF-HOSTED VLM only (PaddleOCR-VL on main server). NO external API. | MEDIUM | TASK | dev-pdf-extractor | docs/handoffs/TASK_BCTC-TABLE.md | BLOCKED | BT-3, BT-4 |
| BT-6 | **QA regression gate.** Re-run the BT-0 harness as regression: figure-accuracy meets agreed bar; VNM/DHG green; cross-check fires on >10×; sandbox exit-0 + zero creds; import-linter fence intact; pilot-status diff empty. Audit: zero off-infra data send. Emit `qa-bctc-table-<UTC>.json`. | HIGH | TASK | qa | docs/handoffs/TASK_BCTC-TABLE.md | BLOCKED | BT-5 |
| BT-EXIT | PO sign-off vs DoD on REAL gold-set data + record production pick + privacy audit. Main terminal commits in-tree work. | CRITICAL | GATE | po | docs/handoffs/TASK_BCTC-TABLE.md | BLOCKED | BT-6 |

**Notes:**
- **Dispatch order:** BT-1 + BT-0 FIRST, in parallel (independent; BT-1 ships immediate parse correctness, BT-0 produces the evidence). BT-0-PICK gates the architect hop (BT-2), which gates all integration. WIP=2 cap: BT-1 + BT-0 occupy both slots initially.
- **Why architect hop (D5):** the adapter boundary + new-primitive contracts + main-server hosting are designed ONCE to avoid a rename-churn cycle. Spike findings (BT-0) feed the blueprint (BT-2). PO → Architect → dev.
- **Security Clause (binding, carried from pilot):** OCR/model calls + PDF I/O are impure → infrastructure adapters; `domain/primitives/*` stay PURE (import-linter fence: primitives must not import infrastructure); `sandbox/runner.py` holds ZERO credentials. API keys (if a self-hosted model needs none) live only in the adapter runtime env, never in sandbox, never in a primitive.
- **Vietnamese-format fix placement (D4):** normalization is an ADAPTER step feeding clean strings to the pure `decimal_normalizer` — do NOT make `decimal_normalizer` locale-aware (it must stay deterministic on clean input).
- **Gold-set (do NOT fetch new):** 14 docs already on disk — `data/pdfs-local/` (VCB, FPT, HPG, DHG, DIG, BSR, DGC, SHB, VEA, VNM) + `data/pdfs/` (VNM, VEA). VNM/DHG are mandatory red→green regression anchors.
- **Binding (Day-0, every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` zero foreign files; never ask user to run/deploy — spawn ops/dev.
- **Open questions (do NOT block — Phase-0 proceeds):** (1) third-party API allowed or self-hosted-only [default self-hosted]; (2) main-server GPU? [needed for BT-4 sizing, not BT-0]; (3) figure-accuracy pass-bar + API budget [default ≥95% within ±0.5%]. Full text in `docs/SPRINT_GOAL.md` § Open Questions.

---

## Sprint PDF-INSPECT — Side-by-Side PDF / Extracted-Text Inspector (NEW FEATURE)

**Status:** DONE + CLOSED (RE-SIGNED) 2026-05-24T19:34Z — verified on REAL `market.db` data after TWO reopens (honest trail below). Premature first close 2026-05-24T17:47Z reopened TWICE on real-data defects. Opened 2026-05-24T17:19Z (PO self-initiated from explicit user feature request via main terminal). Goal: `docs/SPRINT_GOAL.md` (Sprint PDF-INSPECT). Spec + ACs + full reopen trail: `docs/handoffs/TASK_PDF-INSPECT.md`. **Zone migrated** `apps/pdf-extractor/` → `apps/mcp-server/` (REOPEN-1: real BCTC data lives in mcp-server's `market.db`, not pdf-extractor's `pdf_extractor.db`). **Impl owner migrated** dev-pdf-extractor → dev-mcp-server. **User-facing URL changed** `localhost:15001/inspect` (fixture-only, premature) → `http://localhost:3000/api/bctc-inspect` (REAL data, LIVE NOW). **WIP=1 strictly sequential.** POST-PILOT feature — pdf-extractor SCALE pilot stays DONE 12/12 + frozen; `pilot-status-pdf-extractor.json` NOT touched (PO-only, inspector is a dev tool not a pilot task); sandbox dashboard surface UNTOUCHED.

**CORRECTED DONE CONDITION (supersedes the premature first close):** "Sprint DONE" = the served viewer renders REAL `financial_reports`/`pdf_extracted_text` rows from the deployed container's `market.db` (verified row counts + non-null-rate of the columns relied upon), NOT fixtures and NOT schema-existence. The premature 17:47Z close was proven on a local uvicorn with seeded fixtures (`localhost:15001`) — at deploy time the viewer was EMPTY on real data → REOPEN.

**Delivery model (FORK RESOLVED, R1):** SERVED FastAPI viewer (port 5001), NOT `file://` — container PDFs + extraction store live in the `market_data:/app/data` named volume a `file://` page cannot reach. **Acceptance (user's real path, L9):** user opens served viewer in browser → list of PDFs → select one → LEFT = rendered PDF, RIGHT = extracted text/fields, side-by-side.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| PI-1 | Design served viewer (pdf-extractor). DESIGN ONLY. | HIGH | TASK | architect | docs/handoffs/TASK_PDF-INSPECT.md | DONE (superseded by REOPEN-1 — read wrong DB) | — |
| PI-2 | Implement served viewer in pdf-extractor (fixture-verified only). | HIGH | TASK | dev-pdf-extractor | docs/handoffs/TASK_PDF-INSPECT.md | DONE-then-DEPRECATED (`4651c080`; reads junk `pdf_extractor.db` — dead on real data; kept w/ DEPRECATED comment) | — |
| PI-3 | Verify under served URL — FIXTURE data only (premature). | HIGH | TASK | qa | docs/handoffs/TASK_PDF-INSPECT.md | DONE-on-fixtures (`0d10f310`; not real-data path) | — |
| PI-EXIT | PO sign-off (PREMATURE — fixture-only, not real data). | CRITICAL | GATE | po | docs/handoffs/TASK_PDF-INSPECT.md | SIGNED-then-REOPENED ×2 (`97cd5763`) | — |
| PI-RO1-DESIGN | REOPEN-1: architect re-ground — inspector → mcp-server, real `market.db` wiring (4 routes). | HIGH | TASK | architect | docs/handoffs/TASK_PDF-INSPECT.md | DONE (`8f7b54fa`) | — |
| PI-RO1-DEV | REOPEN-1: dev-mcp-server build `GET /api/bctc-inspect` over real `market.db`. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_PDF-INSPECT.md | DONE (`1b5799fb`) | PI-RO1-DESIGN |
| PI-RO1-QA | REOPEN-1: QA real-data verify → found all 14 rows `pdf_path=NULL`, list count:0. | HIGH | TASK | qa | docs/handoffs/TASK_PDF-INSPECT.md | CHANGES_REQUESTED (`127cb347`) | PI-RO1-DEV |
| PI-RO2-DESIGN | REOPEN-2: architect re-root-cause — backfill `pdf_path` + serve-time safety net + secondary OCR join. | HIGH | TASK | architect | docs/handoffs/TASK_PDF-INSPECT.md | DONE (`0245ff4c`) | PI-RO1-QA |
| PI-RO2-DEV | REOPEN-2: dev-mcp-server `backfillBctcPdfPaths` + all-rows LIST + secondary OCR join. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_PDF-INSPECT.md | DONE (`69da9d01`) | PI-RO2-DESIGN |
| PI-RO2-QA | REOPEN-2: QA re-verify on REAL `market.db` — count=14, 12 has_pdf, 14 has_ocr, 7 anomaly, VNM PDF+OCR rendered. PASS. | HIGH | TASK | qa | docs/handoffs/TASK_PDF-INSPECT.md | DONE — PASS (`3098c69d`) | PI-RO2-DEV |
| PI-RO2-EXIT | PO final re-sign vs user acceptance on REAL data + record meta-lesson. | CRITICAL | GATE | po | docs/handoffs/TASK_PDF-INSPECT.md | DONE — RATIFIED 2026-05-24T19:34Z | PI-RO2-QA |

**PI-EXIT sign-off (2026-05-24T17:47Z) — PREMATURE (kept on record, NOT erased):** RATIFIED at the time against FIXTURE data. QA had verified under a local uvicorn with seeded fixtures (`http://localhost:15001/inspect`): list→select→LEFT pdf.js render, RIGHT text/tables, VNM `net_profit 0.000051` visible. PI-3 ACs 1-6 PASS, 186/186 pytest, Fence-A/B KEPT. Commit chain PI-1/PI-2 `4651c080` + PI-3 `0d10f310` + PM record `97cd5763`. **WHY THIS WAS WRONG:** acceptance was proven on FIXTURES, never on the deployed real-data path. At DEPLOY time the viewer was EMPTY on real data → REOPEN. The served viewer read the WRONG DB (pdf-extractor's `pdf_extractor.db` = 15,570 junk `status=failed`/`example.com` test rows + a non-existent extractions path). Real BCTC data lives in mcp-server's `market.db`. → meta-lesson recorded below.

**REOPEN-1 (architect re-ground `8f7b54fa` → dev-mcp-server `1b5799fb` → QA CHANGES_REQUESTED `127cb347`):** Inspector MOVED out of pdf-extractor INTO mcp-server (impl owner now dev-mcp-server). Built `GET /api/bctc-inspect` (HTML + `/docs` list + `/pdf/{id}` + `/ocr/{id}`) reading real `financial_reports` + `pdf_extracted_text` from `market.db`. 39 tests, tsc clean, zero-foreign. **BUT** QA on REAL data found `GET /api/bctc-inspect/docs` returned `count:0`: all 14 real `financial_reports` rows had `pdf_path=NULL` (every row entered via the news-inference fallback path `fetchParseAndStoreBctc.ts:645 tryNewsChainFallback`, which hardcodes `pdfPath:null`); the architect's `WHERE pdf_path IS NOT NULL` filter returned zero rows → empty list. Recurring-bug-escalation: 2nd straight assume-the-data-shape defect.

**REOPEN-2 (architect re-root-cause `0245ff4c` → dev-mcp-server `69da9d01` → QA PASS `3098c69d`):** Architect re-spec — backfill + serve-time safety net. dev-mcp-server added idempotent `backfillBctcPdfPaths(db, pdfDir)` (two-pass filename-token matcher links the 14 rows to 17 on-disk PDFs by `action_code+year+quarter`, zero-guess on ambiguity), removed the `WHERE pdf_path IS NOT NULL` filter so the LIST shows ALL 14 real rows with per-row `has_pdf`/`has_ocr` flags, and added a secondary OCR join (`parsePdfFilenameTokens` → `pdf_extracted_text.filename`) for NULL-path rows. 5 files all `apps/mcp-server/`, zero-foreign, 64 tests, tsc clean, write-safety = `UPDATE pdf_path` only (idempotent guard, no INSERT/DELETE).

**REOPEN-2 RE-SIGN (PO, 2026-05-24T19:34Z): RATIFIED on REAL data.** QA REOPEN-2 re-verify against the REAL deployed container (mcp-server rebuilt from `69da9d01`, running on port 3000): `GET /api/bctc-inspect/docs` → `count=14` real docs (NOT 0, NOT 15,552 junk); `has_pdf:true`=12 (architect bar ≥10 MET; 2 VCB rows left NULL by zero-guess ambiguity, still shown w/ OCR), `has_ocr:true`=14, `anomaly_decimal_shift`=7. Playwright headless on `http://localhost:3000/api/bctc-inspect`: select `VNM Q4 2025` → **LEFT** = real 4.1MB VNM PDF rendered by pdf.js (CÔNG TY CỔ PHẦN SỮA VIỆT NAM cover, signed stamp visible); **RIGHT** = DECIMAL-SHIFT ANOMALY banner (OCR `net_profit 0.0001 M VND` vs API `2,840,370 M VND`) + real Vietnamese OCR text. Safety (UUID-400/traversal-404/doc_not_found-404), regression (frozen pdf-extractor dashboard + `pilot-status-pdf-extractor.json` empty diff; 0 PI3 regressions), and write-safety all PASS. Screenshot `/tmp/qa-reopen2-verified.png`. **User acceptance condition — GENUINELY MET on real data:** the VNM decimal-shift bug is visible BY EYE beside the rendered real PDF — the literal user intent. PO independent spot-check (disk+git, pre-trust): `69da9d01`/`0245ff4c`/`3098c69d` all zero-foreign; deliverable files on disk. **PILOT UNTOUCHED** — pdf-extractor SCALE pilot stays DONE 12/12 frozen; `pilot-status-pdf-extractor.json` not edited. Sign-off signal `docs/signals/po-pdf-inspect-reopen2-signoff-20260524T193400Z.json` (supersedes the premature first close's done-condition). **PIPELINE: complete.**

**Out-of-scope follow-ups surfaced (do NOT block this sign-off):**
- **(i) PIPELINE DEFECT — dev-mcp-server task:** `fetchParseAndStoreBctc.ts:645 tryNewsChainFallback()` hardcodes `pdfPath:null` even when a matching PDF exists on disk. The REOPEN-2 startup backfill links them retroactively, but new news-inference rows will keep entering with `pdf_path=NULL` until the fallback path is enhanced to scan for an existing on-disk PDF at insert time (`findExistingPdf(action_code, year, quarter, pdfDir)`). Data-quality fix, NOT inspector scope.
- **(ii) PROD-DATA POLLUTION — ops/dev cleanup:** pdf-extractor's `pdf_extractor.db` holds 15,570 `status=failed` / `example.com` test rows leaked into the production `market_data` volume during SCALE-pilot factory runs. Zero impact on the inspector (it reads `market.db`, never `pdf_extractor.db`) but the prod volume should be truncated/cleaned.

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

## Follow-On Enhancement #2 — Kinh-Dich 64-Quẻ Trading Reference EN/VI Language Switch (KD-QREF-LANG)

**Status:** OPEN 2026-05-24T18:51Z (PO self-initiated from user feature request, routed by main terminal; dispatch signal `po-kd-qref-lang-20260524T185115Z.json`). FOLLOW-ON to KD-QREF (bilingual EN-primary panel shipped `0b401124`, data regenerated `e9608167`). POST-PILOT enhancement #2 on the same `.qref-*` panel — kinh-dich pilot stays DONE 12/12 FROZEN; `pilot-status-kinh-dich.json` NOT edited, no goal reopened. User request: full EN view + full VI view, user-toggled. Decision: `docs/po-decisions/2026-05-24-kinh-dich-que-reference-language-switch.md`. Spec + ACs: `docs/handoffs/TASK_KD-QREF-LANG.md`. Zone: `apps/kinh-dich-service/` (single). Binding gate: `dash-check.mjs` exit-0 with toggle present; 3 trust panels + 17 sandbox dots + modal + `sandbox-traces.js` UNCHANGED.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| KD-QREF-LANG-1 | Design i18n shape (Go struct `{en,vi}` + emit + render/toggle/localStorage contract, trust-gate safe). DESIGN ONLY. | HIGH | TASK | architect | docs/handoffs/TASK_KD-QREF-LANG.md | OPEN | — |
| KD-QREF-LANG-2 | Implement: 64 × `{en,vi}` every textual field from `que_convert/*.md`; re-emit `que-reference.js`; wire EN\|VI toggle + localStorage + localized labels in `index.html`. | HIGH | TASK | dev-kinh-dich | docs/handoffs/TASK_KD-QREF-LANG.md | BLOCKED | KD-QREF-LANG-1 |
| KD-QREF-LANG-3 | Verify: 64 × both langs no-gap, toggle swaps whole panel both ways, persistence, `dash-check.mjs` exit-0, frozen-surface diff-scope, source spot-check. Emit `qa-kd-qref-lang-<UTC>.json`. | HIGH | TASK | qa | docs/handoffs/TASK_KD-QREF-LANG.md | BLOCKED | KD-QREF-LANG-2 |
| KD-QREF-LANG-EXIT | PO sign-off vs ACs; main terminal commits in-tree work (commit-mutex enum defect). | HIGH | GATE | po | docs/handoffs/TASK_KD-QREF-LANG.md | BLOCKED | KD-QREF-LANG-3 |

**Notes:**
- **Architect hop REQUIRED** (PO decision): the i18n shape (`localized{en,vi}` nested vs paired `*En`/`*Vi`) + emitted-key migration (breaking-rename vs additive) + outcome-gloss location (data vs closed-enum JS map) affects both the Go struct AND the JS render — getting it right once avoids a rename-churn cycle. Architect appends design notes + per-task ACs to the handoff, then dev-kinh-dich implements.
- PO decisions D1–D5: (D1) default EN; (D2) `localStorage["kd-qref-lang"]`, file:// safe, try/catch → EN fallback; (D3) `.qref-*` panel ONLY, trust panels stay frozen English; (D4) both langs in Go SSOT → emitted `que-reference.js`, never fetched/hand-typed; (D5) EN\|VI control in `.qref-header`, static labels/headers/legend also localize, no `dot-*`/`.category-chip`/"not wired"/fetch/CDN.
- VI content reused/lightly-trimmed from `que_convert/*.md` (schema verified consistent across files 01/29/SCHEMA.md) — NOT machine-retranslated from English. Field→source map in handoff.
- Commit reality: dev-team agents cannot acquire commit-mutex (gateway absent + `task_claim` enum lacks the kind). Work stays IN-TREE; commit manifest at EXIT; MAIN TERMINAL commits (as KD-QREF `0b401124`).

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

## Follow-On Enhancement (news-fetch live-data inspection view) — DONE + CLOSED 2026-05-24

**Status:** DONE + CLOSED 2026-05-24T17:58Z (PO NF-LD-EXIT sign-off). Opened 2026-05-24T17:02Z (PO self-initiated from user request, signal `po-news-fetch-livedata-20260524T170200Z.json`). User (config admin, France/GMT+7) wanted to eyeball the actual fetched article rows per source pulled from the DB, on the news-fetch dashboard, to judge whether the live pipeline output is correct. **NOT a pilot reopen** — the SCALE pilot stays DONE (12/12, verdict=scale). Small additive feature behind the closed pilot. Owner = generic `developer`. Chain: **architect (NF-LD-1) → dev-mcp-server (NF-LD-2a) + developer (NF-LD-2b) → qa (NF-LD-3) → PO (NF-LD-EXIT)** (NO `pm`/`ba` agent in this harness — PO absorbed close-out: TASKS.md, handoffs, exit gate).

**NF-LD-EXIT sign-off (2026-05-24T17:58Z):** SIGNED OFF. PO independently spot-checked (disk + git, pre-trust): NF-LD-2a `5a91e12f` (3 files all `apps/mcp-server/`, handler SELECT-only — 0 real write verbs, 0 creds), NF-LD-2b `45fd7f74` (2 files all `apps/news-fetch/dashboard/`, `panel-live-data` line 192, 0 creds, `data.js` untouched), QA `59bd79f7` (3 own files, zero-foreign). Security Clause intact, sandbox honest-green not regressed (QA dash-check 4 panels / 6 cards / 0 errors / 0 external net), 9/9 endpoint tests PASS, tsc exit 0, **pilot 12/12 frozen — not touched** (`goalsEarned=12, verdict=scale, status=DONE`). **Deploy gap (non-blocking):** running mcp-server `/health`=200 but `GET /api/news-fetch/live`=404 — route is correct in source on main but the running process predates `5a91e12f`; needs ops `docker compose up -d --build mcp-server` to go live (dispatch ops, never ask user). Until reloaded, the live panel honestly shows EMPTY/ERROR (never fakes). Sign-off record: `docs/handoffs/TASK_NF-LD.md` `## NF-LD-EXIT` section.

**CRITICAL ARCHITECTURE FINDING (binding, drives the whole design):** `apps/news-fetch/` is a STATELESS scraper. It has NO database, NO repository in `src/domain/repositories.ts` (only scraper ports). Verified end-to-end: news-fetch (port 5008) scrapes → returns JSON over HTTP → `newsHeadlinesRefreshJob.ts` (in mcp-server) POSTs to `/api/push-news` (auth: `x-api-key` = `VPS_PUSH_API_KEY`) → `pushNewsHandler.ts` runs `pollNews` → rows persist in **mcp-server's `rag_analyses` table** (`apps/mcp-server/src/infrastructure/db/schema-news.ts`). Therefore the live-DB view **CANNOT** be served by news-fetch (would require giving the stateless scraper DB creds it has never had — a design regression). It MUST be a read-only endpoint on **mcp-server (port 3000 / `/api/*`)**, which legitimately owns `rag_analyses` and has DB access. The news-fetch dashboard's new live section fetches from that mcp-server endpoint over http.

**SECURITY CLAUSE (binding, carried from pilot):** The sandbox process AND the existing sandbox dashboard panels (Primitives / Module / Microservice, fed by `data.js` under `file://`) MUST stay zero-DB-creds / zero-API-keys and MUST NOT be touched. G6/G8/G9 honest-green sandbox panel is frozen. The live view is a SEPARATE, clearly-labelled dashboard section that talks http to mcp-server only — it never runs in the credential-free sandbox harness and never reads a DB directly. The `data.js` / `file://` sidecar mechanism is for the sandbox panels ONLY; the live section is http-fetch (works only when served, degrades honestly to "live view unavailable — open via served dashboard" under `file://`, never fakes data).

**PRODUCT SHAPE (PO decision):**
- **Source of truth:** mcp-server `rag_analyses` rows where `source_type`/`source` ∈ {reuters, bloomberg} (the two news-fetch sources). Per-source grouping; user can eyeball each source independently.
- **Fields per row (from `rag_analyses`):** source (reuters/bloomberg), headline (`source_title`), url (`source_url`), published-at (`published_at`, parsed/ISO), relevance/sentiment verdict (`sentiment` + `impact_direction`/`impact_score` if present), fetched/ingested-at (`created_at`). Dedup-key is computed in news-fetch and NOT persisted in `rag_analyses` — architect decides whether to surface a derived dedup hint or omit (do not fabricate a stored column).
- **Row count:** last **N=20** rows per source (most-recent-first by `created_at`). Cheap query, enough to eyeball correctness.
- **Live vs cached:** **live query** on each section load (read-only `SELECT … ORDER BY created_at DESC LIMIT 20`). No caching layer — the whole point is "see live data". Endpoint is read-only (SELECT only; never writes).

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| NF-LD-1 | Architect: Security-Clause-safe design of read-only live endpoint on **mcp-server** (`GET /api/news-fetch/live?source=&limit=`, SELECT-only on `rag_analyses`, no new write path) + the SEPARATED news-fetch dashboard live section (http-fetch, honest degrade under `file://`, sandbox panels untouched). Confirm exact `rag_analyses` columns → display fields mapping; decide dedup-key surface or omit. Output: design notes appended to handoff + per-task ACs for NF-LD-2/NF-LD-3. | HIGH | TASK | architect | docs/handoffs/TASK_NF-LD.md | DONE | — |
| NF-LD-2a | dev-mcp-server: mcp-server read-only `GET /api/news-fetch/live` route (SELECT-only, source whitelist, LIMIT clamp 1-50, provider derived from url domain, unauth read). 9/9 tests, tsc clean. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_NF-LD.md | DONE (5a91e12f) | NF-LD-1 |
| NF-LD-2b | developer: news-fetch `dashboard/index.html` NEW live section (`panel-live-data`, http-fetch the endpoint, 4 honest states loading/empty/error/file://-degrade). Sandbox panels + `data.js` UNTOUCHED; dash-check PASS. | HIGH | TASK | developer | docs/handoffs/TASK_NF-LD.md | DONE (45fd7f74) | NF-LD-2a |
| NF-LD-3 | QA: verify — (1) endpoint SELECT-only / read-only, (2) Security Clause intact (sandbox env empty-of-creds, sandbox panels honest-green via `data.js` — G6/G8/G9 NOT regressed), (3) live section degrades honestly under `file://`, (4) full smoke green. Emit `qa-news-fetch-livedata-<UTC>.json`. | HIGH | TASK | qa | docs/handoffs/TASK_NF-LD.md | DONE (59bd79f7) — APPROVED | NF-LD-2b |
| NF-LD-EXIT | PO sign-off against acceptance criteria + Security Clause + anti-regression | CRITICAL | GATE | po | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24T17:58Z — SIGNED OFF | NF-LD-3 |

**Notes:**
- **Scope fence:** touches `apps/news-fetch/dashboard/` (new live section only) + `apps/mcp-server/` (one new read-only route — precedent: G5 already established exactly-one mcp-server task is allowed for the HTTP boundary). Do NOT touch the sandbox runner, `data.js`, or the existing 3 sandbox panels. Do NOT absorb cowork-agent (news-scout/market-watcher) work.
- **Constraints binding Day 0 (verbatim):** L84 explicit-file staging (`git add <path>` per file; NEVER `-A` or `.`); no `--force`/`--no-verify`/`--no-gpg-sign`; local-only — do NOT git push source/CI (user owns push); all work on `main` (NO branches); ESM `.js` import suffixes; `Bun.env` not `process.env`; never ask the user — PO decides and continues.
- **Anti-regression:** the SCALE pilot is DONE and stays DONE. This enhancement must NOT flip/alter any pilot goal or `decisionMatrix` in `pilot-status-news-fetch.json` (that file is frozen at 12/12). The live view is product surface, not a pilot goal.
- **Honest-degrade rule (G8 spirit carried forward):** the live section must NEVER fabricate rows. Under `file://` (no server) it shows an explicit "live view requires the served dashboard" message; when served and the endpoint errors it shows the error, not stale/fake data.

---

## Follow-On Enhancement (news-fetch SERVED dashboard — NF-LD-4) — PO SIGNED OFF 2026-05-24 (final gate = NF-LD-4-OPS)

**Status:** PO SIGNED OFF 2026-05-24T20:05Z — design + dev-A + dev-B + QA (round 2 APPROVED) all DONE; **only NF-LD-4-OPS remains** (ops rebuild + PROVE live URL = terminal DONE gate). Self-initiated 2026-05-24T18:50Z from user feedback (signal `po-news-fetch-served-dashboard-20260524T185027Z.json`). Follow-on to the CLOSED NF-LD chain. **NOT a pilot reopen** — news-fetch SCALE pilot stays DONE (12/12, verdict=scale; pilot-status FROZEN, independently re-verified at sign-off). Handoff/spec: `docs/handoffs/TASK_NF-LD.md` `# TASK NF-LD-4` section. Chain: **architect (NF-LD-4-design) → owning dev-\* (architect names) → qa (NF-LD-4-QA) → PO (NF-LD-4-EXIT) → ops rebuild + PROVE served URL** (NO `pm`/`ba` agent — PO absorbs close-out).

**User feedback (verbatim, mild frustration):** the dashboard live panel currently shows "Live data requires the dashboard to be served (e.g. `bun run serve` / `npx serve apps/news-fetch/dashboard`). Not available under file://." User does NOT want a manual serve step: "you need build container and query direct from it."

**GOAL:** user opens ONE served URL in a browser → sees BOTH (a) the 3 sandbox PASS/FAIL panels (from committed `data.js`) AND (b) the Live Data panel POPULATED with real `rag_analyses` rows — zero manual serve, no `file://`, no degrade message in normal use.

**SECURITY-CLAUSE NUANCE (binding):** serving STATIC dashboard files over http does NOT put DB creds in the dashboard. The sandbox PROCESS (`src/sandbox/runner.ts`) MUST stay credential-free (frozen). An http static-file server is fine. `data.js` + the 3 sandbox panels MUST keep working when served over http (do NOT regress G6/G8/G9). The file:// degrade branch STAYS as a graceful fallback (do NOT delete) — it just won't fire in the served flow.

**ARCHITECTURE DECISION (architect decides A vs B + designs — NOT PO):**
- **Option A:** serve dashboard from news-fetch container (5008); live panel cross-origin-fetches mcp-server:3000 (CORS `*` already global). Pro: dashboard stays with owning credential-free service (pdf-extractor "serve from owning service" precedent). Con: relies on CORS; needs NEW Hono static route + news-fetch Dockerfile COPY of `dashboard/` (both confirmed absent today).
- **Option B:** serve dashboard from mcp-server (3000) at e.g. `/dashboards/news-fetch/` — SAME-ORIGIN as the endpoint (no CORS reliance; relative live-fetch URL). Pro: mcp-server build context is repo-root so it already reaches `apps/news-fetch/dashboard/`; mcp-server owns the data + endpoint. Con: couples the news-fetch dashboard artifact into the mcp-server image.
- **PO recommendation handed to architect: lean Option B** (same-origin removes the CORS/file:// risk class that produced the degrade message; pdf-extractor precedent favours A but its served data lives in the SAME service — that same-origin property is what Option B reproduces for news-fetch). Architect makes the final call.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| NF-LD-4-design | Architect: rule serve-location A vs B (+ rationale) + Docker packaging (which Dockerfile COPYs `apps/news-fetch/dashboard/`) + dashboard live-fetch URL strategy (relative if same-origin / absolute `http://localhost:3000` if cross-origin) + confirm `data.js` `<script src>` resolves from served origin + state the EXACT served URL + per-task ACs for dev/qa/ops. DESIGN ONLY. | HIGH | TASK | architect | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24 (OPTION B: serve from mcp-server:3000 at /dashboards/news-fetch/) | — |
| NF-LD-4-dev-A | dev-mcp-server: `newsFetchDashboardHandler.ts` (static-serve, no DB) + `news-fetch-dashboard/` served dir + server.ts wiring + anti-drift sync script + 11 tests. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24 (commit `e160fe04`; sync sed-order FIX `6b012fc8`) | — |
| NF-LD-4-dev-B | generic developer: `apps/news-fetch/dashboard/index.html` source ENDPOINT → relative path (`/api/news-fetch/live?source=all&limit=20`). 1-line change. | HIGH | TASK | generic developer | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24 (commit `d32398f4`) | — |
| NF-LD-4-QA | QA: verify Security Clause (sandbox process credential-free, no creds in served dashboard), served dashboard works (sandbox panels + live panel both render when served), file:// degrade still present as fallback, NO sandbox/`data.js`/pilot regression, pilot 12/12 frozen, sync-script idempotent. Emit signal. | HIGH | TASK | qa | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24 (round 2 APPROVED `a315ac99`; round 1 caught DRY drift → fixed `6b012fc8`; signal `qa-news-fetch-served-dashboard-20260524T223500Z.json`) | — |
| NF-LD-4-EXIT | PO sign-off vs goal + Security Clause + anti-regression; then DISPATCH ops to rebuild the chosen container. | CRITICAL | GATE | po | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24T20:05Z (PO independent disk/git re-verify: sync idempotent 2-run git-diff=0, 0 creds served dir, ENDPOINT relative, file:// degrade kept, data.js byte-identical, pilot 12/12 frozen; sign-off note in handoff) | — |
| NF-LD-4-OPS | ops: `docker compose up -d --build mcp-server` + PROVE — real http GET `http://localhost:3000/dashboards/news-fetch/` returns 200 + `/dashboards/news-fetch/data.js` 200 + live endpoint reachable same-origin + all 4 panels render with zero manual serve. **This is the terminal DONE gate.** | CRITICAL | TASK | ops | docs/handoffs/TASK_NF-LD.md | OPEN (final gate — ops runs after PO EXIT; UNBLOCKED 2026-05-24T20:05Z) | NF-LD-4-EXIT (CLEARED) |

**Notes:**
- **DONE =** user opens a single served URL (architect states the exact URL) → sees sandbox panels + live data with zero manual serve step; Security Clause + pilot 12/12 intact. Ops PROVES it with a real http GET (not word-of-mouth).
- **Brownfield facts (PO-verified, binding inputs):** news-fetch serves NO static files today + its Dockerfile does NOT copy `dashboard/` (both = Option A scope); mcp-server build context is repo-root + owns the endpoint + emits CORS `*` (Option B scope); pdf-extractor PI-INSPECT precedent = serve from owning service container. Detail in handoff `# TASK NF-LD-4`.
- **Constraints binding Day 0 (verbatim):** L84 explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; local-only — NO push of source/CI/Dockerfile/compose (user owns); all on `main` (NO branches); ESM `.js` suffixes; `Bun.env`; never ask user — decide/continue, never ask user to run/build/deploy (dispatch ops/dev).
- **Anti-regression:** pilot stays DONE 12/12; `pilot-status-news-fetch.json` FROZEN — NOT touched. Sandbox runner credential-free + `data.js` + 3 sandbox panels frozen (G6/G8/G9). file:// degrade branch KEPT as fallback.
- **Zone:** architect rules single (`apps/mcp-server/` for B / `apps/news-fetch/` for A) or `multi`. If `multi`, dev-mcp-server is the SOLE committer of any `apps/mcp-server/` file.

---

## Sprint NF-LD-5 — "Refresh / Load latest" button on the served news-fetch live panel (MVP)

**Status:** PO SIGNED OFF 2026-05-24T21:35Z — dev-B + dev-A + QA (APPROVED) + EXIT all DONE; **only NF-LD-5-OPS remains** (ops rebuild + PROVE the button live at the served URL = terminal DONE gate). Opened 2026-05-24T21:20Z (PO self-initiated from explicit user feature request: *"need button to see new feed on http://localhost:3000/dashboards/news-fetch/"*). **Type:** small follow-on to the CLOSED NF-LD-4 chain (served dashboard LIVE + ops-proven; served URL + live endpoint both return 200, PO-verified this cycle). NOT a pilot reopen — news-fetch SCALE pilot stays DONE 12/12, `pilot-status-news-fetch.json` FROZEN — NOT touched (PO independently re-verified at sign-off: last commit `b3407530` pre-NF-LD-5, 12/12 verdict=scale). **Zone: `multi`** (canonical source in `apps/news-fetch/dashboard/` owned by generic developer; served copy in `apps/mcp-server/` owned + regenerated by dev-mcp-server via `sync-news-fetch-dashboard.sh`). **WIP=1 strictly sequential** (NF-LD-5-dev-B → NF-LD-5-dev-A → QA). Handoff + full ACs + PO EXIT record: `docs/handoffs/TASK_NF-LD.md` (`# TASK NF-LD-5`).

**PO SCOPE RULING — Option (A) MVP (PO owns this; not bounced to user):** The user is looking at the served dashboard whose live panel ALREADY shows real `rag_analyses` rows — but only fetches ONCE on page load (IIFE `initLivePanel()` at `apps/news-fetch/dashboard/index.html:314`); the genuine gap is there is no way to pull fresh rows without a full page reload. A "Refresh / Load latest" button that re-calls the EXISTING `GET /api/news-fetch/live` and re-renders directly satisfies "see new feed" honestly: zero backend change, zero new endpoint, zero new security surface, **no new architect design needed** (reuses the NF-LD-4 Option-B same-origin contract). Optional: a `reuters|bloomberg|all` source selector reusing the endpoint's existing `source=` param. **Option (B) — a "Fetch now" button that triggers the stateless news-fetch service to actually scrape sources** — is DEFERRED, NOT this task: it needs a new trigger/POST path into the news-fetch pipeline, touches the stateless-service boundary + Security Clause, and the user has not clearly asked for on-demand scraping. If the user later confirms they want live re-scraping, open NF-LD-6 and spawn architect first.

**DONE =** user opens `http://localhost:3000/dashboards/news-fetch/`, clicks the Refresh button → live panel re-queries the endpoint and re-renders the latest rows WITHOUT a page reload; all 4 honest states (FILE_DEGRADE / LOADING / EMPTY / ERROR) preserved; no fabricated rows; committed served copy == `sync-news-fetch-dashboard.sh` output (anti-drift gate, idempotent md5); zero creds in served files; sandbox panels + `data.js` + sandbox runner untouched; pilot 12/12 frozen. Ops PROVES the button live at the served URL (real http GET 200 + rebuilt container).

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| **NF-LD-5-dev-B** | Generic developer: edit canonical `apps/news-fetch/dashboard/index.html` — add a "Refresh / Load latest" button in `#panel-live-data`, refactor the one-shot `initLivePanel()` fetch+render into a callable `loadLiveData()` wired to the button's click handler; keep the file:// degrade branch + LOADING/EMPTY/ERROR honest states intact; (optional) `reuters\|bloomberg\|all` source selector reusing `source=` param. NO fabricated rows. | HIGH | TASK | developer | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24 (commit `12600a1f`; button + source selector + loadLiveData callable; AC 8/8) | — |
| NF-LD-5-dev-A | dev-mcp-server: regenerate served copy via `bash apps/mcp-server/sync-news-fetch-dashboard.sh`; prove committed == generated (git diff = 0) AND idempotent (2-run md5 identical). NO hand-edits to the served copy. Zone `apps/mcp-server/` only. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24 (commit `15d9b034`; sync script BASE_ENDPOINT fix; md5 `b1d8806f…` idempotent; 20/20 tests; tsc 0) | NF-LD-5-dev-B |
| NF-LD-5-QA | qa: button re-fetches + re-renders without reload; all 4 honest states preserved (no fabricated rows); sync script reproduces committed copy (idempotent); 0 creds in served files; `data.js`/sandbox runner/3 sandbox panels untouched; dash-check PASS; pilot 12/12 frozen; tests + tsc green. Emit signal. If FAIL → CHANGES_REQUESTED → fixer (the OWNING dev of the flagged zone). | HIGH | GATE | qa | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24 — APPROVED (`2a02d3e3`; AC-Q1..Q8 all PASS; signal `qa-news-fetch-refresh-button-20260524T213212Z.json`) | NF-LD-5-dev-A |
| NF-LD-5-EXIT | PO sign-off vs scope ruling + Security Clause + anti-regression (independent disk/git re-verify, not QA word). Then DISPATCH ops to rebuild + PROVE the button live. | CRITICAL | GATE | po | docs/handoffs/TASK_NF-LD.md | DONE 2026-05-24T21:35Z (PO independent disk/git re-verify: anti-drift 2-run git-diff=0 + md5 match, button in BOTH copies, relative endpoint, 0 creds, data.js byte-identical, pilot 12/12 frozen; EXIT record in handoff; signal `po-nf-ld-5-signoff-20260524T213558Z.json`) | NF-LD-5-QA |
| NF-LD-5-OPS | ops: `docker compose up -d --build mcp-server` + PROVE — real http GET `http://localhost:3000/dashboards/news-fetch/` returns 200 with the Refresh button present + live endpoint reachable same-origin; button visibly re-fetches. **Terminal DONE gate.** | CRITICAL | TASK | ops | docs/handoffs/TASK_NF-LD.md | OPEN (final gate — UNBLOCKED 2026-05-24T21:35Z; running container predates `15d9b034` → button not yet in served HTML, PO live-smoke confirmed; rebuild required) | NF-LD-5-EXIT (CLEARED) |

**Notes:**
- **No new architect design** for Option (A) — reuses the NF-LD-4 Option-B same-origin contract (served from mcp-server:3000, relative `/api/news-fetch/live` fetch). Architect is spawned ONLY if scope escalates to Option (B).
- **Anti-drift gate (QA-enforced, carried from NF-LD-4 round 1):** the committed served copy `apps/mcp-server/src/interface/news-fetch-dashboard/index.html` MUST equal `sync-news-fetch-dashboard.sh` output. dev-mcp-server regenerates via the script — NO hand-edits. If the canonical source gains markup the script does not reproduce (e.g. a hand-injected comment block), update the SCRIPT, not the served copy.
- **Constraints binding (verbatim):** L84 explicit-file staging (`git add <path>` per file, NEVER `-A`/`.`); sequential commits (fleet commit-race); no `--force`/`--no-verify`/`--no-gpg-sign`; NO git push (user owns push); all on `main` (NO branches); `Bun.env` not `process.env`; never ask user — decide/continue; never ask user to run/build/deploy — dispatch ops/dev.
- **Security Clause (binding):** sandbox process keeps ZERO DB creds / ZERO API keys; live data stays on mcp-server (legit DB access); served dashboard files contain ZERO creds. Endpoint stays read-only SELECT (frozen from NF-LD-2a) — the button only RE-CALLS it, never adds a write path.
- **Dashboard-honesty ethos:** no false-greens, no fabricated rows. Empty feed must say so (EMPTY state). The button must not invent rows on error.

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
