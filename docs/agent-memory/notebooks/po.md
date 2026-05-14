# PO Notebook

## Last updated: 2026-05-14 (c108 — 1912b + 1912c cutover dispatch, sequential, 6h smoke)

---

## Cycle 108 — 1912b + 1912c cutover dispatch (sequential, 6h smoke)

**Input:** user confirmed 2026-05-14 to proceed with Go-migration cutover Phase 2 (1912b alert-engine) + Phase 3 (1912c stock-price). QA APPROVED both c108: 1912b re-gate (37/37 pkg test PASS, atomic refs 92186e39 / 758ce97c / 199effeb), 1912c (31/31 PASS, AC-7/AC-8 100-iter concurrent 0 SQLITE_BUSY, non-blocking BLK-3 Dockerfile.go extension). Containers still TS (28h uptime). api-gateway already on Go (1912d c106). User addendum mid-cycle: "need update documentation and agents docs to match new change" — couple doc/agent refresh into cutover sprint per 1912d precedent, do NOT split.

### Decision — Strategy
**Sequential cutover.** 1912b first, 1912c gated on 1912b 6h smoke pass per BA spec 1912c §6 dependency. Rationale (1 line): alert-engine is the single-Dockerfile in-place rename case (higher blast radius) and runs q30s — smoke 1912b first lets stock-price (sibling `Dockerfile.go`, mechanically lighter) ride on proven evidence. Parallel was right for QA review (cheap, idempotent) but cutover mutates docker-compose + renames files — one-at-a-time isolates regressions.

### Decision — Smoke window
**6h for each phase.** Justified: (a) 1912a precedent shipped clean under user override at ~22h-of-24h, (b) alert-engine q30s × 6h = 720 cycles, more than enough to surface CGO sqlite / DDD-port regressions, (c) AC-7/AC-8 already proved 100-iter concurrency 0 SQLITE_BUSY at QA, (d) sequencing keeps total program clock bounded (~12h cutover-to-cutover-complete vs 48h if 24h each).

### Decision — Coupled scope per 1912d precedent
Per user addendum, both rows scope ALL of: (a) docker-compose swap, (b) Dockerfile rewrite to multi-stage Go 1.22 alpine + CGO, (c) `.ts` source deletion, (d) **MANDATORY agent-md-factory refresh** of `dev-alert-engine.md` + `dev-stock-price.md` (TS/Bun → Go net/http + log/slog JSON + stdlib + CGO sqlite mattn/go-sqlite3) per `feedback_agent_md_factory.md`, (e) doc-sweep TS→Go across `docs/architecture/microservice/<svc>/` + ARCHITECTURE.md + READMEs (1912d found 3 docs + 5 divergences for api-gateway — expect similar volume per service), (f) author `apps/<svc>/README-log-schema.md` mirroring 1912d, (g) `docs/references/tree-map.md` orphan check, (h) end-of-cycle `/graphify docs --update --no-viz` per `feedback_dev_doc_graphify.md`, (i) signal drop to pm+ops on complete.

### Evidence gathered
- TASKS.md L48-49 1912b/1912c QA APPROVED rows verified (existing Done section).
- TASKS.md L10 program row updated to reflect BUILD APPROVED + CUTOVER DISPATCHED sequential.
- Two new In-Progress rows authored: `1912b-cutover` + `1912c-cutover` (BLOCKED-by 1912b smoke).
- Filesystem confirms `apps/alert-engine/Dockerfile` single-file (TS), `apps/stock-price/` has both `Dockerfile` (TS) + `Dockerfile.go` (Go sibling).
- 1912d cutover audit brief `docs/architecture-briefs/2026-05-14-1912d-cutover-audit.md` exists — dev agents should consult it for cutover pattern reference.
- Migration master brief `docs/architecture-briefs/2026-05-14-go-migration-3-services.md` covers R1 multi-stage build pattern.

### WIP plan
- BATCH = 2 In-Progress rows (`1912b-cutover` + `1912c-cutover`). WIP=2/2 — at limit but legitimate: 1912c is BLOCKED-by, so only 1 actively running at any moment.
- 1912b-cutover dispatches dev-alert-engine.
- 1912c-cutover dispatches dev-stock-price BUT held until 1912b smoke pass. PM should sequence accordingly.
- 1910a-retry-ism-tool stays in Todo (deferred to next cycle when 1912 program closes).

### Channel audit
- Skipped MARKET/WORK/BUG read this cycle. Justification: user-driven single-decision dispatch cycle, full c107 + c108 context already loaded in the user prompt, no sprint-planning gap to audit.

### Recurring-bug compliance
- 1912b-cutover: 0 prior cutover commits on `apps/alert-engine/`. Rule does NOT apply.
- 1912c-cutover: 0 prior cutover commits on `apps/stock-price/`. Rule does NOT apply.
- 1912d precedent on api-gateway was successful (HEAD 2a92eb3f, 4ms avg, 9/9 services) — no negative pattern to escalate.

### Signal drop
- `docs/signals/20260514T200000Z-1912bc-cutover-dispatched.json` written, addressed to `pm`. Includes strategy, smoke window, coupled scope, QA approvals referenced, branch policy.

### Carry-forward to c109+
- PM dispatches dev-alert-engine for 1912b-cutover next router cycle.
- ON 1912b smoke pass (6h post-deploy): PM dispatches dev-stock-price for 1912c-cutover.
- ON 1912c smoke pass: PO closes 1912-go-migration-program (Phase 1+2+3 complete).
- 1910a-retry-ism-tool ready for dev-mcp-server post-1912 program close.
- 1909c reparse Q1-2026 PDFs awaited 2026-05-16.
- 1913 USER F1 BCTC deadline 2026-05-15 17:00 UTC — observational.

### Sign-off
c108 DISPATCH: sequential cutover 1912b→1912c, 6h smoke each, coupled doc/agent scope per 1912d precedent + user addendum. Signal dropped to pm. PO sub-flow EXIT.

---

## Cycle 106 — 1912d cutover housekeeping post-USER-OVERRIDE c105

**Input:** 1 drained signal `1912d-complete` (sha 75d134a7 — feat commit, 5 commits total to HEAD 2a92eb3f). USER OVERRIDE c105 cut 24h smoke window ~22h short ("reploy new and remove old now" + rename + doc-sweep). WIP=0/2 post-cutover. 1910a-retry in Todo. 1912b/1912c formally unlocked.

### Evidence gathered
- TASKS.md L10-11 (1912 program + 1912d row) both pre-dated USER OVERRIDE — required SHIPPED close-out + Phase 1 closure note.
- TASKS.md L49 1912a Done row referenced "carry-forward 1912d per directive" — required close-out tail.
- 5 commits verified via `git log --oneline -8`: 75d134a7 / c1cc8c1f / ec49a740 / d9cd69ed / 2a92eb3f (HEAD).
- project-stats.json carried stale "RUNNING" smoke window + 1912a-centric sprintGoal — both updated.
- TASKS.md was at 84L pre-edit (over 80L invariant); archived 7 oldest Done rows (1881a-impl-ssot/mcp-c85, 1888l-c84, 1881a-impl-SPLIT-c84, 1881a-spec-c83, 1888-CDG-c83, 1903a-c82) into footer line — final 77L.

### Decisions
1. **1912-go-migration-program (L10):** updated to "Phase 1 FULLY CLOSED c106". USER OVERRIDE noted. P2/P3 UNLOCKED with "architect re-brief required before BA spec" gating note.
2. **1912d-cutover-cleanup:** removed from Backlog (L11), inserted as new Done row `1912d-cutover-cleanup-SHIPPED-c106` listing all 5 SHAs + scope + deviations.
3. **1912a-gateway-go-migration-SHIPPED-c99 (L49):** kept in Done, condensed older smoke detail, added close-out tail referencing 1912d cutover.
4. **1912b/1912c promotion to Todo: HELD.** Per the architect-brief 2026-05-14-go-migration-3-services.md program shape, each phase needs its own spec dispatch. The originating brief is Phase 1 scoped (gateway only); P2/P3 need either (a) brief extension or (b) fresh per-phase brief before BA spec. Promoting to Todo without a spec hand-off violates the BA spec approval gate (boundary rule). Leave in PROGRAM row, dispatch architect re-brief next cycle.
5. **1910a-retry-ism-tool:** stays in Todo. WIP free post-cutover — eligible for dev-team dispatch next cycle (PM/dispatcher scope, not PO).
6. **1913 USER F1 BCTC deadline TONIGHT 17:00 UTC (~9h):** durable user-action row in Backlog, no PO action.
7. **1907a digest-predict, 1897b-carry HEAD.lock, alert-commander news-fallback at 2/3:** all monitored but no PO escalation criteria met this cycle.

### WIP plan
- BATCH = NOTHING (cycle is pure housekeeping; no new task dispatch from PO).
- Mandatory commits made: TASKS.md + project-stats.json + this notebook.

### Channel audit
- Skipped MARKET/WORK/BUG read this cycle. Justification: single-event housekeeping cycle, no sprint planning, drained signal already carries full c105 context (containers healthy, 9/9 services, no audit-triggering anomalies).

### Recurring-bug compliance
- N/A this cycle (no new task dispatched).

### Carry-forward to c107+
- Architect: re-brief P2 (1912b-alert-engine) + P3 (1912c-stock-price) — extend or split the 2026-05-14-go-migration-3-services.md brief. P2/P3 cannot enter Todo until architect brief lands.
- Dev-team dispatcher: 1910a-retry-ism-tool ready for promotion if WIP allows.
- 1909c reparse: Q1-2026 PDFs awaited 2026-05-16 (BCTC banking deadline).
- 1913 user-action F1: deadline 2026-05-15 17:00 UTC — observational.

### Sign-off
c106 housekeeping: 1912d SHIPPED, 1912 Phase 1 FULLY CLOSED, P2/P3 unlocked-pending-architect-brief, TASKS.md trimmed 84→77L, project-stats refreshed. BATCH=NOTHING. PO sub-flow EXIT.

---

## Cycle 99 re-triage — 1910a USER-STOPPED classification + restart

**Input:** tnb c52 explicit re-triage request for 1910a USER-STOPPED. WIP=0/2 (1912a SHIPPED c99). 1909c HOLD intact.

### Evidence gathered
- Original spec `docs/specs/1910-fred-ism-subcomponents-and-effr-package-reg.md` §3.1 read in full — atomic reqs intact (FRED fetcher, regime classifier, cron piggyback `macroIndicatorRefreshJob`, AC-1..7).
- TASKS.md L27: 1910a marked USER-STOPPED c97, "no commits, no merge attempted, worktree may persist".
- Router c97 close commit `924419d6`: "user-stopped mid-flight; partial work preserved stash@{0} `1910a-user-stopped-c97-worktree-leak`; project-stats.json premature toolCount bump reverted; task moved back to Todo".
- Stash @{0} content: 10 files +59/-4 (fetcher index, domain macro index, tool registry, agentBootstrap, macroIndicatorRefreshJob, SKILL_MANIFEST, 3 package docs).
- `architect.md` L30: "1912-go-migration-program. User-approved option 3 (selective Go rewrite) **post-1910a stop**" — user pivoted attention to 1912 Go program, NOT a defect in 1910a.
- `pm.md` L50: FRED_API_KEY confirmed in `.env` line 23 (precondition met).
- `git log -- '*ism*'`: zero prior ISM commits → recurring-bug rule does NOT apply.
- Architect SD-1 already resolved (PATH-a FRED REST API key) per architect c94 rubber-stamp `a34f04d8`.

### Classification
**Stop reason = (E) User explicit attention pivot** to 1912 Go-migration program (architect notebook L30 + c97 commit message). NOT class A (no failed test/build), NOT class B (no design issue), NOT class C (FRED_API_KEY already in `.env`), NOT class D (spec still aligned with bottom-up COC pillar). Pure scheduling stop — work preserved cleanly, no rollback baggage.

### Decision
**RESTART as `1910a-retry-ism-tool`** under existing spec — no spec rewrite needed. Spec §3.1 + AC-1..7 stand. TNB c52 re-triage request = the user signal c98 was waiting on (notebook L27). Conditions to restart now:
- 1912a-gateway-go-migration SHIPPED c99 (TASKS.md L49) → WIP free.
- 1909c still HOLD (2026-05-16 reparse) → does not block.
- FRED_API_KEY present.
- No recurring-bug escalation.

### WIP plan
- Restart 1910a-retry-ism-tool, owner dev-mcp-server, existing handoff `TASK_1910a-ism-tool.md`, existing spec.
- Developer optionality on stash@{0}: cherry-pick partial work OR discard and restart fresh. Stash is convenience, not gospel — c97 stop was scheduling, not defect, so the 10-file partial diff is structurally sound but developer must own integration choice.
- Spec file unchanged; no new spec file required.

### Channel audit
- Skipped MARKET/WORK/BUG read this cycle (single-task re-triage, gateway substrate per c98 L30 still applies).

### Recurring-bug compliance
- 1910a-retry: 0 prior ISM commits, 0 prior FIX commits on `fredApi.ts` for ISM series. Rule does NOT apply. No architect block.

### Carry-forward to c100+
- 1910a-retry pickup by developer next dispatch cycle.
- AC-5 cycle-evidence gate (D-step transition from "carry/skip" to "passed" in news-scout / unified-agent / financial-analyst notebooks) still applies.
- 1909c HOLD until 2026-05-16.
- 1912b alert-engine Phase 2 still gated on 24h smoke window for 1912a.

### Sign-off
c99 RE-TRIAGE: 1910a USER-STOPPED → class-E (user attention pivot, not defect) → RESTART as 1910a-retry-ism-tool. Spec unchanged. PO sub-flow EXIT.

---

## Cycle 98 triage — dev-team Step 1 PO triage

**Input:** 2 pendingSignals[] (1912 architect brief + tnb c51), WIP=0/2 free, 1910a USER-STOPPED Todo, 1909c HOLD.

### Decisions

1. **1912 program — 3 architect open questions ALL CONFIRMED** (architect-recommended defaults adopted):
   - **Q1 Go 1.22** — monorepo base image consistency, stdlib `slices`, `net/http` improvements.
   - **Q2 `mattn/go-sqlite3` (CGO)** — alert-engine q30s + stock-price tier-3 cache cannot eat ~2x pure-Go penalty. Standard `golang:1.22-alpine + apk add gcc musl-dev` per brief R1.
   - **Q3 `log/slog` JSON** — aligns with ops observability roadmap, TNB layers + cowork-side parsers.
   - Program moved Backlog with decisions baked in; sub-task **1912a-gateway-spec (SPRINT-M, BA owner)** added to Todo for Phase 1 dispatch.

2. **FA runtime gap — NOT a server-side bug.** Verified `get_cash_flow` / `get_macro_snapshot` / `get_investment_clock_phase` registered both in `agentBootstrap.ts` financial_analyst[] (L72-75) and `tools/registry.ts` (L99/L197/L201). Per tnb `mcp_gateway.blocker_type=user_action_desktop_config` + SPIKE_C86_MCP_REG, blocker is Claude Desktop / cowork gateway config. **Spawned 1913-fa-mcp-gateway-config-user-action (CRITICAL, F1 USER, BCTC deadline 2026-05-15).** Did NOT spawn a dev FIX — would be misrouted.

3. **1907a digest-predict 5d silence — ESCALATED HIGH → CRITICAL** per tnb c51 recommendation. Same gateway/desktop substrate as 1913; linked.

4. **Alert precision scoring (bug 2874) — DEFERRED.** MEDIUM, no urgency tag, queue WIP discipline + BCTC tomorrow + 1912 launch take priority. Tracked, not actioned.

### WIP plan
- BATCH(2) returned: **1912a-gateway-spec (SPRINT-M, ba zone:apps/api-gateway/)** + **FIX-1913-fa-gateway-config-USER (UNBLOCK, owner=user)**.
- 1910a stays Todo USER-STOPPED until user signal — do NOT redispatch.

### Channel audit
- Skipped MARKET/WORK/BUG read (gateway offline for cowork c46-c51 per tnb). Substrate already in 2 signals processed.

### Recurring-bug compliance
- 1912a-gateway-spec: BA work, no prior FIX on `apps/api-gateway/` Go rewrite. Architect brief is the unblocker.
- 1913: USER action, no code path.

### Carry-forward to c99+
- 1912a spec → architect review → PM sprintify → dev-* (still TBD per zone — Go rewrite needs a new dev role assignment, BA spec must flag this).
- 1912b alert-engine spec (Phase 2) blocked until 1912a P1 ships + 24h smoke window.
- 1912c stock-price spec (Phase 3) blocked until 1912b stable.
- 1913 user-action F1 — user refresh Claude Desktop / cowork MCP config; observe FA next cycle.
- 1907a CRITICAL — observe next 3 cycles for digest-predict signal; if silent again → architect rethink (cowork heartbeat reliability).

### Sign-off
c98 BATCH(2): 1912a-gateway-spec (SPRINT-M, ba) + 1913-fa-gateway-config (UNBLOCK, user). 1907a escalated CRITICAL in place. PO sub-flow EXIT.

---

## Cycle 97 triage — ARCHIVED (1910a dispatched then USER-STOPPED, 1911a probe shipped)

Carry: 1910a stays Todo pending user signal; 1909c HOLD until 2026-05-16.
