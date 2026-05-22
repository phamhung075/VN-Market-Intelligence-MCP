---
title: "Phase 2 Task Plan (Go) — Technical-Analysis Pilot"
date: "2026-05-23"
author: "po (skeleton) → architect (to expand) → pm (to atomize)"
status: "DRAFT — awaiting architect expansion"
pilot: "technical-analysis"
phase: "2"
sprint_kickoff: "2026-05-23"
sprint_deadline: "2026-07-03"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
phase1_plan_archived: "docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md"
phase1_closure_commit: "9564f6ee"
language: "Go"
---

# Phase 2 Task Plan (Go) — Technical-Analysis Pilot

**PO authored skeleton 2026-05-23.** Architect must expand each bucket into atomic tasks (mirroring Phase 1's `phase-1-task-plan-go.md` per-task spec format). PM then breaks into handoffs and pushes to `docs/TASKS.md`.

---

## Summary

Phase 1 closed with QA verdict PASS (commit `9564f6ee`). Phase 1 delivered G1, G2, G3, G6, G7, G8 = YES; G9 = IN-PROGRESS (PO verbal gate open); G12 = IN-PROGRESS (1/3 streak). G4, G5, G10, G11 were deferred to Phase 2.

Phase 2 must close the remaining six goals (G4, G5, G9, G10, G11, G12) before the 2026-07-03 deadline, then PO calls the decision matrix.

Phase 2 scope is **closure-only** — anti-scope-creep clause from charter §Anti-Scope-Creep is still in force. Pilot covers `technical-analysis` only. Security clause (zero DB credentials / zero API keys in sandbox process) remains in force for every sandbox-touching task.

---

## Bucket Plan (PO scoping — architect to atomize)

### P2-A — Architecture fence in CI (G4)

**Goal:** G4 — Lint blocks cross-tier imports. Proven by 1 deliberate violation that fails CI.

**Charter verification method:** "QA introduces 1 deliberate violation (e.g., adds `import { something } from "../../packages/modules/kinh-dich"` inside a technical-analysis primitive), opens a PR, and confirms CI fails on the ESLint fence rule. QA removes the violation, confirms CI passes."

**Go-language adaptation required (architect to spec):**
- ESLint does not apply to Go. Architect must pick the Go equivalent. Candidates: `go-arch-lint` (declarative YAML), `goimports` boundary rules, custom `golangci-lint` linter, or `depguard` rule in `golangci-lint`.
- X-5 metric spec (`06-metrics-cross-cutting.md`) currently describes ESLint Fence-A/B/C rules. Architect needs to author the Go equivalent without rewriting X-5 (Phase 2 amendment OK).

**Three rules to enforce (translated to Go layout):**

| Rule | What it blocks |
|---|---|
| Fence-A (Go) | Any file in `apps/technical-analysis/pkg/primitive/*` importing from `pkg/module/*`, `pkg/application/*`, `pkg/interface/*`, or any `apps/*` path. |
| Fence-B (Go) | Any file in `apps/technical-analysis/pkg/module/*` importing from `pkg/application/*` or `pkg/interface/*`. Cross-module imports between bounded contexts (post-Phase 2) must go through application layer. |
| Fence-C (Go) | Any `NewSQLite*`, `NewRedis*`, `NewHTTP*` constructor call outside `apps/technical-analysis/cmd/server/main.go`. Composition root discipline. |

**P2-A deliverables (architect to atomize):**
1. Pick the Go fence linter (decision recorded in this plan once architect chooses).
2. Configure rules at module/repo level (config file in `apps/technical-analysis/`).
3. Wire into CI (whichever CI is operational for the monorepo). If no CI is currently wired for Go services, add a step.
4. Author deliberate-violation test artifact (QA-introducible primitive import).
5. Document fence rules in `apps/technical-analysis/api/` or microservice docs.

**Owner agent:** `dev-technical-analysis` (fence implementation) + `qa` (deliberate-violation proof).

**Phase 2 success criterion:** A demonstration commit on `main` shows CI red on deliberate violation, then green on revert.

---

### P2-B — Old TS TA code deletion (G5)

**Goal:** G5 — `services/mcp-server/src/.../technical-analysis/` removed. All callers point to new Go microservice. No "TODO: migrate" comments.

**Charter verification method:** "QA runs `find apps/mcp-server/src -path "*technical*" -name "*.ts"` — must return 0 results. QA runs `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/src/` — must return 0 results. QA verifies all MCP tool handlers that previously called `technicalIndicators.ts` now route via HTTP to `apps/technical-analysis/`. Integration test for the TA MCP tool passes end-to-end."

**P2-B deliverables (architect to atomize):**
1. Brownfield scan of `apps/mcp-server/src/` for any path containing `technical`, `ta-`, RSI/MACD/Bollinger calculator imports. Inventory output.
2. For each caller of old TA code: rewire to HTTP call against `apps/technical-analysis:5003`.
3. Delete (or quarantine via `_deprecated/` move) the old TS technical-analysis files.
4. Remove any "TODO migrate" comments from `apps/mcp-server/src/` and `apps/technical-analysis/`.
5. Run MCP TA tool integration test end-to-end.
6. Verify no production code path imports the old TS module after deletion.

**Owner agent:** `dev-technical-analysis` (deletion + rewiring); `developer` (cross-service mcp-server edits if dev-technical-analysis zone is locked).

**Risk:** This is the highest-risk task in Phase 2 — deleting code in a live monolith. Architect must specify a rollback strategy (e.g., a tagged commit before the delete commit so revert is one command).

**Phase 2 success criterion:** Find / grep both return zero results. TA MCP tool integration test green.

---

### P2-C — G9 user verbal-confirm gate (PO-owned)

**Goal:** G9 — User verifies "RSI working correctly" from dashboard alone. Confirmed verbally at pilot review.

**PO ownership (per charter):** "This goal is confirmed by PO recording user's verbal confirmation in the pilot review summary."

**PO Phase 2 kickoff decision (see §G9 Strategy below):** Async notification via Telegram MARKET channel + signal file. User is non-technical, lives in France (GMT+1 / market in GMT+7), and per `feedback_po_autonomy.md` trusts PO to improve product. A synchronous meeting is not required — async confirm is acceptable per charter.

**P2-C deliverables (PO-owned):**
1. ✅ This document — G9 strategy recorded.
2. Send notification to user via Telegram MARKET channel: "Dashboard ready for trust verification. Open `file://apps/technical-analysis/dashboard/index.html`. Reply YES if you can verify RSI works correctly from dashboard alone, without reading code." (PO sends.)
3. Drop a signal file `docs/signals/po-{timestamp}.json` so dev-team is aware the G9 gate is open.
4. Track response in `docs/po-decisions/2026-05-23-g9-user-confirmation.md` when user replies.
5. On YES response → update `pilot-status.json` `goals[G9].status = "YES"`, `verifiedAt = <ISO>`, `verifiedBy = "po (user verbal async confirmation)"`.
6. On NO response → triage rejection reason. Either re-loop into a dashboard polish task or call decision matrix early.

**Phase 2 success criterion:** User-verbal YES recorded with timestamp; `pilot-status.json` G9 = YES.

**Phase 2 does NOT block on G9** — other buckets proceed in parallel. G9 is a PO async track.

---

### P2-D — AI-fixability proof (G10)

**Goal:** G10 — `dev-technical-analysis` agent fixes a primitive bug in ≤2 cycles. Baseline cycle count is in `docs/data/bug-inventory.json` (Phase 0 deliverable per charter §Baseline Metric Capture).

**Charter verification method:** "QA injects a known, scoped bug into one primitive (bug must be realistic — e.g., off-by-one in RSI period, wrong MACD signal line smoothing). QA records the cycle count (each time the agent submits a fix attempt that does not pass the dashboard scenario). Agent must reach dashboard-green in ≤2 cycles. Baseline is `baselineCycleCount` from `docs/data/bug-inventory.json`. Evidence: git log showing ≤2 fix commits for that bug, final dashboard green."

**Prerequisite check (P0-1 task — outstanding from Phase 0):** `docs/data/bug-inventory.json` may not yet exist (was in TASKS.md as P0-1, owner `system-auditor`). PO must confirm whether P0-1 landed before Phase 1 closed. If not — P2-D depends on P0-1 completion. Architect to verify status in expansion.

**P2-D deliverables (architect to atomize):**
1. Verify or create `docs/data/bug-inventory.json` (if P0-1 outstanding).
2. QA designs a realistic bug to inject. Bug must be scoped to a single primitive (RSI period off-by-one, MACD smoothing wrong, etc.). Document the bug spec before injection so cycle-counting is auditable.
3. QA injects the bug in a separate commit (so the bug-introduction commit is identifiable in git log).
4. QA dispatches `dev-technical-analysis` agent with ONLY the failing dashboard scenario (no other context — proves the dashboard is the trust contract).
5. QA counts cycles: each agent fix-attempt commit that does not flip the scenario card to GREEN = 1 cycle.
6. Success: ≤2 cycles to GREEN.
7. Failure: >2 cycles → G10 = NO. Re-evaluate at decision matrix.

**Owner agent:** `dev-technical-analysis` (fix); `qa` (injection + cycle count + verdict).

**Phase 2 success criterion:** Evidence — git log showing 1 or 2 fix commits between bug-injection commit and final-green commit. Dashboard GREEN at end.

---

### P2-E — Regression alarm bell (G11)

**Goal:** G11 — AI fixes bug A, breaks scenario B → dashboard flips B red → AI forced to fix B before "done".

**Charter verification method:** "QA prepares two linked scenarios: scenario A (primary) and scenario B (regression canary — tests a different primitive that shares an input shape). QA injects bug A. Agent fixes A. QA verifies: if agent's fix inadvertently breaks B, the dashboard shows B as red before the agent marks the task done. If the dashboard shows B red, the agent must fix B in the same task cycle — it cannot ship with a red card. Evidence: at least 1 observed case of B flipping red mid-fix, and the agent addressing it before closing the task."

**P2-E deliverables (architect to atomize):**
1. QA designs scenario pair: A (primary, primitive X) and B (regression canary, primitive Y, shares input shape with X).
2. QA injects a bug that the natural fix for A will accidentally break. (Example: fix to RSI smoothing that propagates wrong constant to MA dispatcher.)
3. QA dispatches `dev-technical-analysis` agent.
4. Agent fixes A. Dashboard scenario A → GREEN, scenario B → RED (regression triggered).
5. G12 flow rule (P2-F below) MUST cause agent to detect B is RED and not mark task DONE.
6. Agent fixes B in the same task cycle.
7. Both A and B GREEN at task close.

**Owner agent:** `dev-technical-analysis` (flow rule + actual fix work); `qa` (scenario design + verdict).

**Dependency:** P2-E gates on P2-F (flow rule) being in place. Architect orders them.

**Phase 2 success criterion:** Single git task where: (a) A bug injected, (b) A fix lands, (c) B turns red mid-task, (d) B fix lands in same task, (e) both green at task DONE.

---

### P2-F — Dashboard-green DoD flow rule + 3-task streak completion (G12)

**Goal:** G12 — `flows/dev-technical-analysis/main.md` updated with the explicit rule: "Do not mark task DONE until sandbox dashboard shows all TA scenarios green." Three consecutive tasks verified following the rule.

**Charter verification method:** "QA reads `flows/dev-technical-analysis/main.md` and confirms it contains an explicit step: 'Do not mark task DONE until sandbox dashboard shows all TA scenarios green.' QA tracks 3 consecutive `dev-technical-analysis` task completions and confirms in each case: (a) git log shows a dashboard-check step before the final commit, (b) the pilot-status.json goal state was updated to IN-PROGRESS during the task, not after."

**Current state per pilot-status.json:** `g12Streak.completed = 1` of 3 required. Phase 1's QA closure run logged as task #1. Two more consecutive Phase 2 dev tasks must follow the rule.

**P2-F deliverables (architect to atomize):**
1. **Architect authors the flow rule** as a new step in `.claude/flows/dev-technical-analysis/main.md`. Per global rule (`feedback_agent_md_factory.md`), agent flow changes go via **agent-father**, not directly. Architect writes the brief, agent-father implements.
2. The flow rule must specify:
   - Before any DONE/commit/Review state in `docs/TASKS.md`, run `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all` and `go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all`.
   - All 30 scenarios must be GREEN.
   - If any is RED → task is NOT done. Re-cycle until green.
   - Sandbox run output appended to the task's handoff doc as evidence.
3. Two consecutive Phase 2 dev tasks (P2-D fix-work and P2-E fix-work both qualify) follow the rule, with git log + dashboard-green evidence recorded.
4. Architect updates `pilot-status.json.goals[G12].g12Streak.tasks` array with each qualifying task.

**Owner agent:** `architect` (flow rule authoring as brief) → `agent-father` (flow file edit); `qa` (3-task verification).

**Phase 2 success criterion:** Flow file contains the explicit DoD rule. Three tasks logged in `g12Streak.tasks[]`. G12 = YES.

---

## Sequencing (PO recommendation — architect may revise)

```
P2-A1 → P2-A2 → ... (G4 fence — independent; can start first)
P2-B1 → P2-B2 → ... (G5 deletion — depends on no fence violations from P2-A)
P2-C   (G9 — async PO track; runs in parallel from day 1)
P2-F1 → P2-F2 (G12 flow rule via architect → agent-father)
   ↓
P2-D1 → P2-D2 (G10 AI-fix — gates on G12 flow rule being in place, otherwise streak doesn't accrue)
P2-E1 → P2-E2 (G11 regression alarm — gates on P2-F flow rule + P2-D pattern stabilization)
```

**Critical path estimate:** P2-F flow rule → P2-D AI-fix proof → P2-E regression proof ≈ 1 sprint (about 5 working days).
**Parallel tracks:** P2-A fence + P2-B deletion can run alongside P2-F authoring.
**G9 (P2-C):** Async — no critical-path impact.

**Deadline budget:** Charter deadline 2026-07-03 ≈ 6 sprints from kickoff. Phase 1 consumed 1 sprint. Phase 2 has ~5 sprints of slack. Pace is comfortable.

---

## G9 Strategy (PO Phase 2 kickoff decision)

**Chosen mechanism:** Async notification via Telegram **WORK** channel (PO permission constraint — `channels.market.write: false` in agent spec; WORK allows sprint-status writes and the user reads all channels) + signal file. PO does NOT schedule a synchronous meeting.

**Rationale:**
1. **User is non-technical and lives in France (GMT+1).** Vietnam market hours are GMT+7. A synchronous meeting requires either user-side late-night or PO-side off-hours — neither aligns with `feedback_po_autonomy.md`'s "user is config admin only, trusts PO to improve product".
2. **Charter §G9 says "Confirmed verbally by user."** "Verbally" is interpretable as direct user statement (typed or spoken). Charter does not mandate a meeting.
3. **The dashboard is already designed for non-technical access** (per `feedback_po_autonomy.md` and dashboard §G6 spec: opens at `file://` URL, no server, no source-code exposure, three panels with plain-language stories).
4. **Async is reversible.** If the user replies NO or asks for revisions, we triage and re-loop. A synchronous meeting that gets a NO is harder to recover from in workflow terms.

**Mechanism:**
1. PO sends one Telegram WORK message: "Phase 2 of TA pilot opening. Dashboard ready at `apps/technical-analysis/dashboard/index.html` (open in browser, no server). Please open it, click on any RSI card, and reply YES or NO to: 'Can you tell from this dashboard whether RSI is working correctly, without reading code?'"
2. PO drops `docs/signals/po-{timestamp}.json` so dev-team is aware G9 gate is open and Phase 2 has started.
3. PO monitors `read_telegram_reports(status="new")` each cycle for user reply.
4. On YES → update `pilot-status.json`. On NO → triage feedback into a dashboard-polish task.
5. **Phase 2 dev work does NOT block on G9.** G9 closes when user replies.

**Documented in:** `docs/po-decisions/2026-05-23-g9-user-confirmation.md` (PO authors on commit).

---

## Goal Mapping

| Goal | Phase 1 state | Phase 2 task(s) | Outcome |
|---|---|---|---|
| G1 | YES | — | — (Phase 1 closed) |
| G2 | YES | — | — (Phase 1 closed) |
| G3 | YES | — | — (Phase 1 closed) |
| G4 | TBD | P2-A | Go fence linter configured + CI fails on deliberate violation |
| G5 | TBD | P2-B | Old TS TA code deleted, all callers HTTP-routed |
| G6 | YES | — | — |
| G7 | YES | — | — |
| G8 | YES | — | — |
| G9 | IN-PROGRESS | P2-C | User verbal-async YES recorded |
| G10 | TBD | P2-D | AI agent fixes injected bug in ≤2 cycles |
| G11 | TBD | P2-E | Regression alarm proven by 1 observed case |
| G12 | IN-PROGRESS (1/3) | P2-F | Flow rule authored + 3-task streak closed |

---

## Risks & Mitigations (PO-flagged for architect attention)

| Risk | Mitigation |
|---|---|
| **R-1**: P0-1 bug-inventory.json may not exist yet → blocks G10 baseline | Architect verify file state at P2-D atomization; if missing, P2-D includes a `system-auditor` subtask to create it. |
| **R-2**: Go fence linter choice impacts effort estimate | Architect picks linter at start of P2-A authoring. Document choice + rationale in this plan. |
| **R-3**: Deleting old TS TA code may break tools we don't know about | Architect specifies brownfield scan as P2-B1 atomic task BEFORE any delete commit. |
| **R-4**: Flow rule changes go via agent-father, not direct architect-write | Architect authors brief; spawn agent-father to implement; QA verifies in flow file before counting streak tasks. |
| **R-5**: User async-reply on G9 may take days. Decision matrix gates on G9 | Phase 2 dev work decoupled from G9 — other goals can reach YES in parallel. Decision matrix call waits for G9 reply OR uses charter §Decision Matrix "2 YES → re-scope" branch if user reply >2 weeks delayed. |
| **R-6**: G10 cycle count may exceed 2 → G10 = NO | Acceptable outcome — proves the hypothesis is wrong. Triggers decision-matrix 2-YES re-scope branch. Not a Phase 2 failure; it's an honest measurement. |

---

## What Architect Owes Next (after PO publishes this skeleton)

1. **Read this skeleton in full.** Understand each bucket's scope and constraints.
2. **Pick Go fence linter for P2-A.** Update this plan with the choice + rationale.
3. **Atomize each bucket** into per-task specs (mirror Phase 1's per-task format: AC list, files touched, smoke check, atomic commit format, goal mapping).
4. **Verify P0-1 bug-inventory.json status.** If missing, add a Phase 0-tail task to this plan.
5. **Author the flow-rule brief for P2-F** — what the new step says, where in `dev-technical-analysis/main.md` it lands, how agent-father implements.
6. **Author X-5 amendment** (or P2-A1 task) to add Go fence rules to `06-metrics-cross-cutting.md` — without rewriting the ESLint section, just append a Go addendum.
7. **Deliverable**: a fully-expanded `phase-2-task-plan-go.md` (this file, replaced or appended to) with all per-task specs filled in. Then handoff to PM for atomization into `docs/TASKS.md` + handoff files.

---

## What PM Owes After Architect Hands Off

1. Per-task handoff files in `docs/handoffs/TASK_P2-*.md` mirroring Phase 1's structure.
2. Update `docs/TASKS.md` Backlog with all Phase 2 tasks.
3. Set first-task-ready field in `pilot-status.json.phase2`.
4. Notify main terminal that Phase 2 is READY-FOR-DISPATCH.

---

## Sunk-Cost Note

None. Phase 2 builds entirely on top of Phase 1's Go service. No revert, no rework.

---

## PO Approval

This skeleton is PO-authored. Architect expansion is the next gate. PO signs off again when architect's expanded plan returns.

**PO signature:** report-analyzer @ 2026-05-23
**Next agent:** architect (to expand + atomize per bucket)
**Then:** pm (to create handoff files + update TASKS.md)
**Then:** dev-technical-analysis (to start P2-A1 or P2-F1 — architect chooses first task)
