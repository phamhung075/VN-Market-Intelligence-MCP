# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN

**Sprint goal:** Clickable DONE-task Decision-Journal drill-down (accordion) on /dashboard/orchestration.
**Started:** 2026-06-05T21:06:28Z

---

### STEP po-S1 · po · 2026-06-05T21:06:28Z

**what-done:** Wrote sprint goal ORCH-DASH-DECISION-DRILLDOWN + first BA task into orch-state.json and claimed the sprint umbrella lock; routed to BA.
**what-considered:**
- Join-key design (a) add optional task-id to STEP format vs (b) sprint-group-only vs (BOTH = router rec)
- Where /api/orchestration is served — must verify the live layer before dispatch (data-serve-integrity lesson; likely apps/mcp-server, not the not-deployed Go plane)
- Scope creep risk: editing/auth/backfill could balloon a one-feature ask
**why-decision:** Forwarded the BOTH recommendation (optional task-id for precise forward mapping + sprint fallback bucket for legacy back-compat) to architect as a confirm-not-decide item, and hard-fenced scope_out (read-only, no backfill, no new storage) to keep it one tight feature.
**why-change:** Did not pre-pick (a) vs (b) myself — join-key + serving-layer location are technical design calls that belong to architect (sprint-kickoff hands to BA→architect), not PO.

### STEP po-S2 · po · 2026-06-05T21:06:28Z

**what-done:** Applied the orch-state edit via read-full→jq→sentinel-verify→atomic mv instead of an inline in-place edit, and deliberately left .head (FIX-MW-OFFHOURS-DISPATCH) untouched.
**what-considered:**
- Inline jq in-place vs temp-file + sentinel verify
- The jq-empty-clobber footgun that has deleted this exact SSOT before (recovered fwd 9e090a90)
- head pointer currently owns an in-flight dev-team FIX — must not be repointed by a kickoff
**why-decision:** Used `[ -s tmp ]` + a 3-key sentinel (new sprint_id present AND exactly one BA task AND head still == FIX-MW) so a botched filter can never clobber the SSOT, and scoped my write to sprint_goal+task_board only.
**why-change:** Stronger than the kickoff template's bare `jq empty` guard — that guard passes empty input as valid JSON; the sentinel-key check closes that hole.

### STEP ba-S1 · ba · 2026-06-05T21:10:02Z

**what-done:** Confirmed serving layer for /api/orchestration is apps/mcp-server (orchestrationHandler.ts), NOT the undeployed Go api-gateway plane; scoped F2 accordingly.
**what-considered:**
- Undeployed Go api-gateway plane (routes :4000) — ruled out by prior sprint note and by api.orchestration.tsx proxy target :3000
- apps/mcp-server:3000 orchestrationHandler.ts (chosen) — confirmed by direct code read: api.orchestration.tsx → :3000/api/orchestration → orchestrationHandler.ts
**why-decision:** Data-serve-integrity lesson mandates verifying the LIVE layer before dispatch; mcp-server proxy chain is code-confirmed and matches the OSC-4c A2 pattern already in production.
**why-change:** No change from router recommendation — confirms it rather than overriding.

### STEP ba-S2 · ba · 2026-06-05T21:10:02Z

**what-done:** Adopted BOTH join-key strategies (optional task-id field in STEP format for forward precision + sprint fallback bucket for legacy back-compat) and made that the F1 acceptance gate.
**what-considered:**
- Sprint-level grouping only (option b) — works with existing data, zero format change, but coarse (all decisions for a sprint show under every DONE task)
- Per-task-id only (option a, forward-only) — precise but leaves all legacy entries orphaned with no clean display path
- BOTH (router recommendation, chosen) — precise forward entries map to their task row; legacy/untagged entries surface under a sprint fallback bucket; no crash on missing data
**why-decision:** Sprint fallback bucket is mandatory for zero-crash on the existing corpus; task-id field is mandatory for the feature to be non-trivially useful going forward; the two are non-conflicting and together satisfy the PO success_metric.
**why-change:** No change from router recommendation; router already forwarded this as "architect confirms" rather than "architect decides."

### STEP ba-S3 · ba · 2026-06-05T21:10:02Z

**what-done:** Decomposed the sprint into three atomic sub-tasks (F1/F2/F3) with full AC, DDD layers, and dependency chain; wrote spec to docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-BA-spec.md; created architect task in backlog.
**what-considered:**
- Splitting F2 into API-parse + DTO-extension as separate tasks — rejected (they are one transaction: the handler must both parse journal md and extend its DTO atomically; splitting creates a window where the endpoint returns stale data)
- Rolling F1 (format change) into F2 (API parse) — rejected (F1 owner is agent-father / skill layer, F2 owner is dev-mcp-server; different zones and different deploy surfaces)
- Blocking F3 hard on F1 merge — chosen because the Remix loader type must match the new DTO field; a partial F2 deploy without the decisions key would cause a TypeScript type error in the loader
**why-decision:** Each leg has a distinct zone owner and a clear data dependency: F1 produces the STEP format contract, F2 consumes it server-side and extends the API contract, F3 consumes the API contract client-side; this ordering eliminates ambiguity about who unblocks whom.
**why-change:** No deviation from the intent given by the router; decomposition granularity is finer than the three rough legs in the PO task note (adds explicit acceptance criteria and DDD layer tagging per BA flow step 2).

### STEP architect-S1 · architect · 2026-06-05T21:30:00Z

**what-done:** Confirmed serving layer = apps/mcp-server orchestrationHandler.ts by direct code read; confirmed BOTH join-key strategies (F1 task-id field + F2 sprint fallback bucket).
**what-considered:**
- BA had already read orchestrationHandler.ts directly (OSC-4a, proxy chain :3001→:3000→mcp-server confirmed); re-read the live file to satisfy data-serve-integrity lesson (architect must verify, not relay BA report)
- Go api-gateway :4000 plane — ruled out: `docker ps` context + prior sprint notes confirm it is never deployed on the 16GB host; the mcp-server path is the only live path
- BOTH vs only-task-id vs only-sprint-bucket — BOTH is mandatory: task-id covers forward precision, sprint-bucket covers existing corpus with zero crash
**why-decision:** Data-serve-integrity lesson mandates own raw-read of the serving file; code confirms handler + import chain match BA report exactly; BOTH join-key strategies satisfy the PO success_metric and impose zero backfill obligation.
**why-change:** No change from BA recommendation; architect sign-off is the formal clearance for F1/F2/F3 dispatch.

### STEP architect-S2 · architect · 2026-06-05T21:30:00Z

**what-done:** Ruled on BLOCKER-2 (sprint-id discovery): union of sprint_goal.entries[*].sprint_id + task_board.active_sprints[*].id; expand to include recently-CLOSED sprint_goal entries (status != "active") so DONE tasks from freshly-closed sprints retain their decisions visible on the dashboard.
**what-considered:**
- Only task_board.active_sprints — misses sprints closed mid-session (their tasks are still DONE in the board but sprint removed from active_sprints)
- Only sprint_goal.entries with status=="active" — same gap as above; a sprint may be closed the same day its last task is marked DONE
- Union of sprint_goal.entries (all statuses) + task_board.active_sprints (authoritative dedup) — chosen; the superset catches the edge case; a closed sprint journal file is O(KB), negligible cost
**why-decision:** DONE tasks are the primary feature surface; if their sprint has just been closed, they must still show decisions; union is the only strategy that has no gap; it adds at most ~5 extra journal files on a typical install.
**why-change:** BA recommended "both" (sprint_goal + active_sprints) without specifying how to treat closed sprints; architect extends to all sprint_goal entries regardless of status, capped by file-existence guard (missing file = empty decisions, no crash).

### STEP architect-S3 · architect · 2026-06-05T21:30:00Z

**what-done:** Ruled on BLOCKER-3 latency / EC-6 cache: adopt per-sprint mtime cache (singleton Map keyed by absolute path + mtime) in a new journalStore.ts; synchronous parse is acceptable only if under 100ms for <600 lines; mtime cache eliminates redundant re-parses on the 5-second polling loop.
**what-considered:**
- Synchronous parse every GET: simple, no state; but 5-second polling x multiple journal files = repeated fs.readFileSync + string parse on every tick; unacceptable at scale even if each file is fast individually
- Per-request async parse: adds complexity, no meaningful benefit vs sync for files <1MB
- Singleton mtime cache (chosen): Map<path, {mtime: number, result: StepDto[]}> as a module-level constant in journalStore.ts; revalidated by fs.statSync(path).mtimeMs before serving; invalidated only when file changes; typical hit rate ~100% on 5s poll with no agent writing
- LRU or TTL cache: over-engineered for <10 files; mtime is the natural invalidation signal
**why-decision:** Mtime cache is the idiomatic solution for file-backed data on a polling endpoint; it caps parse overhead to one per file change rather than one per poll tick; the singleton Map pattern is already used in orchStateStore for atomic writes (consistent idiom).
**why-change:** BA flagged EC-6 as a known risk and explicitly recommended mtime cache if architect judged parse latency unacceptable; architect judges it unacceptable at 5s poll frequency with >1 journal file loaded.

### STEP architect-S4 · architect · 2026-06-05T21:30:00Z

**what-done:** Decided on accordion UX: multi-open (independent per-task toggles) rather than single-open (accordion group where opening one closes others).
**what-considered:**
- Single-open: simpler state (one activeTaskId string), conventional accordion UX; but closing the previous entry when opening a new one is destructive for an audit use-case where operator wants to compare two decisions
- Multi-open (chosen): each DONE task row has its own boolean `expanded` state in a Map or Set; operator can keep multiple decision trails visible simultaneously for comparison; implementation cost is essentially the same (Map vs string)
- Modal navigation: rejected (violates FR-3-2 inline expansion requirement)
**why-decision:** The decision-journal is an audit surface, not a menu navigation; the core operator action is "compare what two tasks decided"; single-open makes that impossible without toggling back and forth; multi-open is the only UX that serves the audit use-case natively.
**why-change:** BA left this to architect/dev-frontend; architect decides multi-open and documents it in the handoff so dev-frontend has a clear directive rather than another open question.

### STEP pm-S1 · pm · 2026-06-05T21:39:15Z

**task-id:** PM-ORCH-DASH-DECISION-DRILLDOWN
**what-done:** Broke the architect blueprint into 4 sequential atomic tasks (F1 / F2 / F3 / QA); created TASK_ARCH-ORCH-F1.md through TASK_ARCH-ORCH-QA.md handoff files with full AC, zone, dependencies, and knowledge pointers; updated orch-state.json to mark PM task IN_PROGRESS and set F1/F2/F3/QA tasks to TODO; prepared for agent-father dispatch.
**what-considered:**
- Four tasks (F1/F2/F3/QA) vs three (fold QA into F3) — architect blueprint explicitly names QA as a dependent gate; keeping it separate preserves the audit trail and explicit sign-off boundary
- Ordering: sequential (F1→F2→F3→QA) vs parallel-ready (F1 parallel with F2 skeleton) — architect blueprint rules "sequential dispatch" due to shared SSOT files (SKILL.md, flow .md files, orch-state.json); parallel-prep without commit would hide risk
- Handoff size: granular (6+ sub-steps per task) vs coarse (one big handoff per zone) — chose granular within each task (AC per sub-step, file-by-file modify list) to match the PM flow template and give developer explicit guidance per file
**why-decision:** Architect output named four logical legs; PM's job is to map each leg to exactly one task with dependencies respected, atomicity preserved, and developer acceptance criteria explicit. Four sequential tasks with explicit zone+blocks metadata enable the dev-team Step 3 zone-routed parallel dispatch and keep WIP=2 discipline clean.
**why-change:** No deviation from architect blueprint (which named F1/F2/F3/QA explicitly); PM added structure (TASK_NNN.md per task) and explicit AC/file lists per dev-standards handoff template, not a design change.

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-05T23:45:00Z
**task-id:** ARCH-ORCH-F2
**what-done:** Implemented journalStore.ts (pure parser + mtime cache), extended orchestrationHandler.ts with decisions: DecisionsDto field, and wrote 3 new test files (1978/1979 new, 1977 extended); rebuilt mcp-server container; live curl confirmed decisions.by_task[ARCH-ORCH-F1] + sprint_bucket[ORCH-DASH-DECISION-DRILLDOWN] populated from real fixture.
**what-considered:**
- Parser inWhatConsidered state: exiting on any non-bullet, non-blank line starting with `**` vs only on named field regex matches — chose the `**` prefix check so prose bullets don't accidentally terminate early on missing fields
- Cache bleed between tests (R-2): unique tmpdir per test vs _clearCacheForTesting export — chose BOTH: unique tmpdir paths as primary guard, _clearCacheForTesting() in beforeEach as belt-and-suspenders
- decisionsDir default in buildOrchestrationDto: process.cwd() + relative path vs injected mandatory param — chose optional param with process.cwd() default to keep handleGetOrchestration call site unchanged (backward-compat, minimal diff)
- Sprint-ID dedup: Array.from(new Set) before iterating — prevents double-parse when same sprint-id appears in both sprint_goal.entries and active_sprints (RULING-3)
**why-decision:** Blueprint parse contract was exact — implemented it line-for-line; the optional decisionsDir param is the minimum change to satisfy R-1 (testability) without touching the HTTP handler signature; mtime cache singleton eliminates redundant re-parses on the 5-second polling loop (RULING-4).
**why-change:** No design deviation from architect blueprint or PM AC; all 14 AC met; tsc 0 errors, 59 tests green, live-verify raw JSON confirmed.

### STEP dev-frontend-S1 · dev-frontend · 2026-06-05T23:54:00Z
**task-id:** ARCH-ORCH-F3
**what-done:** Implemented F3 decision accordion on /dashboard/orchestration: StepDto + DecisionsDto types, DoneTaskGroup multi-open accordion (Set<string> state), DecisionAccordion + StepCard inline components, sprintId threading through TaskBoardPanel; rebuilt frontend container.
**what-considered:**
- Table vs div-based row layout for DONE tasks: table rows cannot contain accordion panels as children; switched to CSS-grid div layout to allow accordion div between row items while preserving the column alignment
- sprintId sourcing: sprint_goal.sprint_id is the current active sprint; tasks in the board are flat (no per-task sprint association in DTO); threading sprint_goal.sprint_id is the correct sprint context for the sprint_bucket fallback
- Chevron rotation convention: ▾ unrotated = open (pointing down), -rotate-180 = closed (pointing up); consistent with existing show/hide chevron in DoneTaskGroup header button
- Empty state wording: "No decisions recorded for this task." (matches TASK_ARCH-ORCH-F3 AC-F3-8 exactly)
**why-decision:** Div-grid layout is the minimum change to make accordion rows work inline; threading sprint_goal.sprint_id satisfies AC-F3-13 without restructuring the DTO; the existing pattern for chevrons in the component (rotate-180 = collapsed) is reused for visual consistency.
**why-change:** No design deviation from architect blueprint (RULING-5 multi-open Set, F3 type additions, component signatures); AC-F3-14 (non-DONE rows inert) is satisfied automatically because only DONE tasks appear in DoneTaskGroup; all 16 AC verified: tsc 0 errors, 353/353 tests, SSR HTML confirms aria-expanded + cursor-pointer + data-testid live.

### STEP agent-father-S1 · agent-father · 2026-06-05T00:00:00Z
**task-id:** ARCH-ORCH-F1
**what-done:** Added optional `**task-id:**` field to decision-journal SKILL.md § Write Entry template and § Rules; injected task_id parameter at all journal-write call sites in developer/flow/main.md, developer/flow/microservice-main.md, architect/flow/main.md, qa/flow/main.md, and cowork-end-cycle/SKILL.md.
**what-considered:**
- Placement: between `### STEP` header and `**what-done:**` — matches architect blueprint parse contract and the existing field ordering; F2 parser regex `/^\*\*task-id:\*\* (.+)/` keyed off this exact position
- Omit vs empty string when no task in scope — chose omit entirely (no `**task-id:**` line written) so F2 parser's absent-line branch routes correctly to sprint_bucket with zero ambiguity
- Inline flow param vs env var injection — chose inline bracket annotation `[task_id: "<...>"]` after each journal-write call, keeping skill as SSOT and flows as callers that pass value (DRY: skill owns format, flows own value sourcing)
**why-decision:** Architect blueprint parse contract is exact (`/^\*\*task-id:\*\* (.+)/`); omitting the line when empty is the only way to guarantee parser routes to sprint_bucket without a trim-empty-string edge case in F2; inline annotation in flows is the lightest wiring that keeps the skill SSOT while giving each flow context for where to source the task_id value.
**why-change:** No change from architect blueprint or PM task spec; agent-father added the injection-pattern prose in SKILL.md § Write Entry to make the calling convention explicit for all future consumers.
