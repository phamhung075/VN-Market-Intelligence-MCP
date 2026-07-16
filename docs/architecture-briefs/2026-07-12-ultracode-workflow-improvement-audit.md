# Ultracode Workflow Improvement Audit — 2026-07-12

> Multi-agent audit (ultracode) of ALL agent workflows: 8 domain analysts + adversarial verification.
> Run: `wf_695ffa7a-dd7` · analysis phase 8/8 domains COMPLETE.
> **Verification phase COMPLETE** (resumed 2026-07-13 after token-limit interruption): 48 proposals adversarially verified (cap 6/domain); completeness critic ran.
> Remaining UNVERIFIED proposals are below the per-domain verify cap — evidence cited but unchecked by design.

**Verdict legend**: CONFIRMED = adversarial verifier failed to refute · RESCOPE = valid problem, corrected scope in note · REJECTED = refuted (kept in appendix) · UNVERIFIED = below per-domain verify cap (6) — evidence cited but unchecked.

## Executive summary

- **128 issues** found: 3 critical, 35 high, 56 medium, 34 low
- **106 proposals**: 17 CONFIRMED, 23 RESCOPE, 8 REJECTED, 58 UNVERIFIED

### Highest-priority (CONFIRMED or RESCOPE, impact=high)

- **router-dispatch-locking-P4** [CONFIRMED] (L) — Add composite dispatch_preflight MCP tool: presence + orphan probe + roster + intent claim in ONE gateway call
- **router-dispatch-locking-P3** [RESCOPE] (M) — Repair orphan escalation + adoption: supported-params escalation, board-state guard, honest cleanup
- **router-dispatch-locking-P7** [RESCOPE] (M) — Reconcile branch policy across developer flow and dispatch handoff chain with the main-only invariant
- **router-dispatch-locking-P1** [CONFIRMED] (S) — Align outer-wrap lock namespace to the live 'task:' prefix
- **router-dispatch-locking-P5** [CONFIRMED] (S) — Shrink CLAUDE.md step 2.5 to a pointer + 3-outcome table that includes the missing re-entrant branch
- **dev-team-loop-P2** [CONFIRMED] (M) — Move terminal-bloat eviction into the deterministic tick-preflight script so it runs on EVERY tick regardless of exit path
- **dev-team-loop-P3** [CONFIRMED] (M) — Implement the wrapper/straggler autoclose sweep (ships backlog row FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP)
- **dev-team-loop-P9** [RESCOPE] (M) — Give pm an atomic closeout script (sprint-move + head-idle in ONE transform), mirroring the shipped ops Close Gate fix
- **cowork-dispatcher-cron-P7** [RESCOPE] (L) — Collapse the 12-file flow to ~7 files and push remaining per-tick logic into the deterministic script layer
- **cowork-dispatcher-cron-P1** [RESCOPE] (M) — Compute calendar_status server-side in emit_pressure_state (break the circular 'unknown')
- **cowork-dispatcher-cron-P2** [CONFIRMED] (S) — Port the stderr-separation fix into cowork-guaranteed-slot-firer.sh
- **cowork-dispatcher-cron-P3** [CONFIRMED] (S) — Add last_fired boundary dedup to the matcher's legacy mode (one SSOT dedup for dispatcher, preflight, and firer)
- **cowork-dispatcher-cron-P5** [RESCOPE] (S) — Make re-arm self-healing: self-arm prefix on the cowork master cron + SessionStart hook injecting the re-arm instruction
- **cowork-cycle-agents-P1** [RESCOPE] (M) — Make step-0-cowork the ONLY bootstrap entry point; strip its duplicated GATEWAY-BLIND block
- **cowork-cycle-agents-P2** [RESCOPE] (M) — Absorb the DMS-2 sibling-corroboration probe into gateway-availability-gate and de-duplicate market-watcher's double probe
- **cowork-cycle-agents-P3** [CONFIRMED] (M) — Create one published-marker-gate skill with a mandatory release-on-no-publish clause; wire it into the 6 existing copy-pasted marker gates
- **cowork-cycle-agents-P6** [RESCOPE] (M) — Single notebook-write path: remove the 4 inline AC-3 copies, resolve the fb OVERWRITE/APPEND contradiction, and make cowork-end-cycle self-deduplicating
- **cowork-cycle-agents-P4** [RESCOPE] (S) — Close the truth-gate coverage gaps on all public/MARKET publishers
- **cowork-cycle-agents-P5** [CONFIRMED] (S) — Fix news-scout exec-proof ordering: notebook settled-write BEFORE the gate, gate BEFORE log_agent_work(completed)+WORK ping
- **auditor-signal-loop-P2** [CONFIRMED] (M) — One blessed emit script replaces the 6 copy-pasted EMIT SEQUENCE blocks and gives BUG-dedup a durable ledger
- **auditor-signal-loop-P3** [RESCOPE] (M) — Freeze Tier-2/3 predicates into a deterministic checks script — extend the proven db-integrity-counts.sh pattern to C-01..C-16, B-05 gate, B-09, B-13, C-06/07
- **auditor-signal-loop-P1** [CONFIRMED] (S) — Fix the self-defeating T2/T3 gate: gate on the PREVIOUS subagent-written heartbeat, and move tier-2/3 heartbeat authorship into the subagent's end-of-cycle
- **auditor-signal-loop-P5** [RESCOPE] (S) — Canonicalize signal types and statuses: fix the Tier-1 type mismatch, register the live type set, replace 'mark signal DONE', and make READ→RESOLVED closure mandatory
- **memory-docs-hygiene-P1** [RESCOPE] (S) — Sandbox the 1300b memory-tools test so it stops writing into the live docs tree
- **state-data-files-P4** [CONFIRMED] (M) — Close the legacy-file prune hole in drain-signals.js + one-time scripted purge of ~1,400 unstamped processed files
- **state-data-files-P6** [RESCOPE] (M) — Collapse the scheduler-count triplication: generate cron-registry.json, or retire it and repoint the auditor at system-map
- **state-data-files-P3** [CONFIRMED] (S) — Delete NOTE_SIGNALS_DB_DRAIN.md (or rewrite as a 3-line pointer to the live drain)
- **git-ci-publish-P1** [RESCOPE] (M) — Consolidate the 4 commit-convention docs into ONE file that documents the format actually in use
- **git-ci-publish-P8** [RESCOPE] (M) — Stranded machine-state sweep: give the dirty-tree categories a converging owner on the dev-team tick
- **git-ci-publish-P2** [CONFIRMED] (S) — Untrack machine-written state: signals.db, runtime logs, test debris — gitignore policy for the machine-state plane
- **git-ci-publish-P3** [RESCOPE] (S) — Fix the drain commit's deletion drop: git pathspec sweep scoped to the drain-exclusive zone + post-commit clean check
- **git-ci-publish-P4** [CONFIRMED] (S) — Path-filter the pre-push tsc hook: skip full tsc for pushes touching no code
- **git-ci-publish-P7** [RESCOPE] (S) — Rescope /commit skill: mutex-bound, main-only, convention-aligned

## Domain: router-dispatch-locking

### Issues

#### router-dispatch-locking-I1 · CRITICAL — Lock-key namespace drift: dispatch-claim mandates 'sprint-task:' prefix but the ENTIRE live fleet uses 'task:' — outer/inner key mismatch defeats the mutex

Any dispatcher that follows the skill literally (outer claim 'sprint-task:<id>') creates a lock DIFFERENT from the inner/fleet 'task:<id>' key — exactly the two-independent-locks failure the skill itself warns about. The skill is the outlier, not the fleet.

*Evidence*: .claude/skills/dispatch-claim/SKILL.md:283 "Mismatch = two independent locks = no protection. Align on `sprint-task:` prefix everywhere." vs docs/agents/dev-team/flow/main.md:575 "task_id: \"task:\" + batch_id", docs/agents/developer/flow/main.md:93 "task_id: \"task:\" + task_id", docs/agents/pm/init.md:126 "task_id: \"task:\" + task_id". Server tool doc (coordinationTools.ts task_claim description) also says "task:<task_id>". Grep confirms ZERO flow files use a sprint-task: task_id.

#### router-dispatch-locking-I2 · CRITICAL — Developer specialist flow contains lock calls it cannot execute (no gateway tool in its package) — heartbeats never fire, healthy long runs get false-orphaned

The WF-1 STOP-RELEASE block and per-TDD-loop heartbeat are dead instructions for this agent. Result confirmed in production (memory 2026-07-03): un-heartbeated task: lock TTL 3600s expired mid-90-min run, reaper false-orphaned a healthy task, producing an unclearable null-session orphan-signal. Heartbeat duty is assigned to an agent that cannot perform it, while the dispatcher (who can) is not required to.

*Evidence*: docs/agents/developer/flow/main.md:93 "call_tool(server=\"vn-market\", tool=\"task_heartbeat\"..." and :69 task_release — but docs/agents/tools/package/developer.md MCP Tools table lists ONLY "mcp__semble__search" and "mcp__semble__find_related"; .claude/skills/task-lock/SKILL.md:169-171 "Dev-*/qa/ba/pm/architect **specialist** sub-agents do NOT have this tool in their spawned tool surface". Same file contradicts itself at main.md:58-59 "This specialist agent does NOT call task_claim".

#### router-dispatch-locking-I3 · HIGH — Orphan escalation path calls task_heartbeat with nonexistent params (payload_patch, ttl_seconds) — ESCALATED marker never persists, idempotency check is dead, BUG telegram re-fires every dispatch

For any poisoned orphan (redispatch_count>=3), the :349 check `payload.status=="ESCALATED"` can never be true, so every router dispatch re-sends the BUG telegram and re-walks the escalation branch until the signal row's TTL expires. Additionally the heartbeat targets an orphan-signal row whose owner_client_session is null (reaper artifact) — memory-confirmed immune to heartbeat/release/force-release, so the call fails twice over.

*Evidence*: .claude/skills/dispatch-claim/SKILL.md:358 "payload_patch: {\"status\": \"ESCALATED\"}   # extend + mark" directly contradicts the SAME file at :183-184 "it does **not** update payload fields (no payload_patch in the current MCP surface)". Verified: coordinationTools.ts task_heartbeat schema accepts ONLY task_id + owner_client_session; grep payload_patch in apps/mcp-server/src = 0 hits.

#### router-dispatch-locking-I4 · HIGH — Phase A claims to cover 'intent:*' orphans, but 'intent' is not in ORPHAN_EMIT_ALLOW_LIST — router orphan adoption for intents is dead code

A dead session's intent claim is silently GC'd (600s TTL) and never emits an orphan-signal, so the router's Phase A probe can never surface intent work. The doc creates false confidence that mid-dispatch router death is recoverable via adoption; in reality intent dispatch loss is invisible. The probe itself still costs a gateway round-trip on every dispatch for a scope that mostly cannot match.

*Evidence*: .claude/skills/dispatch-claim/SKILL.md:411 "The router adoption probe covers: `intent:*` claims and any router-owned sprint-task dispatches." vs apps/mcp-server/src/infrastructure/db/coordinationStore.ts:453-458 "const ORPHAN_EMIT_ALLOW_LIST = [\"sprint-task\", \"cowork-slot\", \"cron-tick-with-published-checkpoint\", \"dashboard-row\"]".

#### router-dispatch-locking-I5 · HIGH — CLAUDE.md Phase B condensed copy omits the re-entrant self-hold branch — same-session retry reads as peer collision and EXITs (known false-peer class)

A router retrying the same intent within 600s (e.g. after a transient spawn failure or compact-resume) holds its own lock; following the CLAUDE.md text it EXITs with a false 'peer session' telegram instead of heartbeat+proceed. This is manifested drift from duplicating the pattern in two files.

*Evidence*: CLAUDE.md:24-26 handles only "`claimed:false` + peer (...) → ... EXIT" — no claimed:false+self branch — while the canonical pattern at .claude/skills/dispatch-claim/SKILL.md:250-251 has "Re-entrant: own prior lock from this session. Heartbeat to renew, then spawn." Memory feedback_devteam_preflight_sf1_not_reentrant_false_peer documents this exact class causing phantom-peer SKIPs for the full lock TTL.

#### router-dispatch-locking-I6 · HIGH — Orphan adoption has no board-state guard and its cleanup 'releases' a row it never claimed and cannot own — completed tasks get re-adopted, poison rows linger

Memory-confirmed 2026-07-03/07-04 incidents: a task that completed cleanly after its lock TTL-expired mid-run was eligible for re-adoption (redispatch_count<3), and adoption tree-hygiene can revert unrelated uncommitted files. Ticket FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD is filed but the skill text remains unguarded — every reader of this skill re-learns the unsafe procedure.

*Evidence*: .claude/skills/dispatch-claim/SKILL.md:393-396 finally block releases "orphan-signal:" + original_task_id — a row the adopter never claimed and which the reaper mints with owner_client_session=null (memory: task_release → released:0, task_force_release_orphan → lock_not_found). §Orphan-Adoption Probe (:338-399) contains NO orch-state lane check before adopt/spawn.

#### router-dispatch-locking-I7 · HIGH — Branch-policy contradiction: CLAUDE.md mandates NO branches, but developer flow and dispatch handoff chain mandate task/NNN-* branches and merges

A router-spawned developer following its flow verbatim violates the standing main-only invariant on every task. Either the flows are stale (most likely — invariant is in the constitution and auditor memory) or worktree-parallel tiers need an explicitly documented exception; today the two constitutions disagree silently.

*Evidence*: CLAUDE.md:40 "NO branches — all work stays on `main`" vs docs/agents/developer/flow/main.md:53 "Branch missing: `git checkout main && git pull origin main && git checkout -b task/NNN-kebab-description`" and :13 "Code + tests on `task/NNN-*` branch"; .claude/skills/dispatch/SKILL.md:73 "`.task_board` task status → DONE, branch merged".

#### router-dispatch-locking-I8 · MEDIUM — dispatch-claim (493L) and task-lock (283L) breach the <=200L lazy-load invariant with no size-justification header, on the hottest read path in the system

Every dispatch that follows the constitution loads ~600L of skill text (~7-8k tokens) before doing any work. Roughly 200 of dispatch-claim's lines are Fire-Time Election pseudocode whose canonical implementations already live in 3 flow files (:121-122), plus a 10-line historical commit list (:483-493).

*Evidence*: wc -l: .claude/skills/dispatch-claim/SKILL.md = 493, .claude/skills/task-lock/SKILL.md = 283; grep -c size-justification = 0 for both (contrast docs/agents/developer/flow/main.md:1 "<!-- size-justification: 162L ... -->"). CLAUDE.md:7 makes dispatch-claim mandatory reading for every spawn.

#### router-dispatch-locking-I9 · MEDIUM — Preflight logic duplicated in 3 places (CLAUDE.md 2.5 vs dispatch-claim Pattern; session-presence spec verbatim in both dispatch-claim and task-lock) — drift already manifested

Violates the 'shared boilerplate in ONE base skill' invariant. The CLAUDE.md copy has already lost the re-entrant branch; the two session-presence copies differ in framing and will diverge on the next edit (Edit-tool multiline-strip harness bug raises the odds of partial edits landing in only one copy).

*Evidence*: CLAUDE.md:19-26 condensed PRE-CLAIM copy vs .claude/skills/dispatch-claim/SKILL.md:222-263 canonical Pattern (drift = I5). Session-presence release+reclaim pattern appears at dispatch-claim:187-201 AND task-lock:257-272; the Step 0a claim block appears at dispatch-claim:139-178 AND task-lock:218-233.

#### router-dispatch-locking-I10 · MEDIUM — Fallback session-ID mint is per-bash-process, not per-session — later steps re-mint a DIFFERENT id, making own locks look peer-held

If CLAUDE_CODE_SESSION_ID is genuinely unset, each lock op run in a separate bash call mints a new identity; the claim made under id-A is judged 'peer' when probed under id-B → false-peer EXIT / unreleasable locks. Same identity-field failure class as feedback_tasklock_owner_session_server_scoped_defeats_mutex.

*Evidence*: .claude/skills/dispatch-claim/SKILL.md:20 "mint a stable fallback" then :24 "CLAUDE_CODE_SESSION_ID=\"host-$(hostname)-pid-$$-ts-$(date +%s)\"" — $$ and date change on every Bash tool invocation (shell state does not persist across calls).

#### router-dispatch-locking-I11 · MEDIUM — Gateway wrapper tool name drift: task-lock says mcp__claude_ai_gateway__call_tool; constitution says mcp__gateway__call_tool

An agent taking task-lock's INV-GATEWAY-1 section literally probes/uses a tool name that does not exist in the current registration, concluding lock ops are unavailable (the anti-hallucination skill exists precisely because agents claim tools unavailable).

*Evidence*: .claude/skills/task-lock/SKILL.md:169 "calls all require `mcp__claude_ai_gateway__call_tool`" vs CLAUDE.md:50 "mcp__gateway__call_tool(server=\"vn-market\", tool=\"<tool_name>\", arguments={...})".

#### router-dispatch-locking-I12 · MEDIUM — Adoption resume contract says 'Spawn dev-team' but CLAUDE.md declares no dev-team agent type exists; no dispatch-table row maps adoption → a real agent

The router is simultaneously forbidden from guessing agent types and given an adoption procedure whose target is a non-existent type. The dispatch table (dispatch/SKILL.md:28-54) has no row for orphan-adoption spawns, so every adoption forces exactly the guess the constitution forbids.

*Evidence*: .claude/skills/dispatch-claim/SKILL.md:417 "Spawn dev-team with checkpoint SHA" (and :383 comment "spawn dev-team with checkpoint") vs CLAUDE.md:72 "There is no `dev-team` agent type, no `orchestrator` agent type." CLAUDE.md:31 "NEVER guess an agent type."

#### router-dispatch-locking-I13 · MEDIUM — Intent lock is released at spawn-return, but all agents are backgrounded — lock lifetime is milliseconds, so PRE-CLAIM only dedups the dispatch instant, not duplicate work

A backgrounded Agent() returns immediately; the finally releases intent:<agent>:<intent-key> while the agent may run for an hour. A peer session issuing the same intent seconds later passes PRE-CLAIM and spawns a duplicate. For intents there is no inner self-claim tier to catch this (two-tier model covers sprint-task only). Related memory: pipeline-resume stale placeholder → duplicate spawn risk.

*Evidence*: CLAUDE.md:23 "continue to step 3 (spawn inside try/finally → `task_release`)" combined with CLAUDE.md:41 "All agents backgrounded by default"; dispatch-claim:239-247 shows finally-release immediately after the Agent() call.

#### router-dispatch-locking-I14 · MEDIUM — init.md lock releases omit the REQUIRED owner_client_session — schema-rejected release orphans the lock until TTL

Post-P1-FINAL, a release without owner_client_session fails validation (or no-ops), so the failure path these init blocks guard leaves the task: lock held until TTL — feeding the false-orphan/reaper pipeline. Same class as feedback_task_release_owner_agent_mismatch_orphans_lock.

*Evidence*: docs/agents/developer/init.md:45 "task_release, arguments={ task_id: \"task:\" + task_id })" and docs/agents/pm/init.md:139 (same shape, no owner_client_session) vs .claude/skills/task-lock/SKILL.md:80 "owner_client_session: $CLAUDE_CODE_SESSION_ID  // required — must match claiming session" and coordinationTools.ts P1-FINAL descriptions (owner_client_session REQUIRED, fallback rungs removed).

#### router-dispatch-locking-I15 · LOW — Phase A.5 roster read fires on EVERY dispatch though it is purely advisory and never gates — one wasted gateway round-trip plus log tokens per dispatch

When Phase B succeeds (the overwhelmingly common case), the roster output changes nothing. The only time roster info is actionable is diagnosing a Phase B collision — reading it before the claim is pure cost.

*Evidence*: .claude/skills/dispatch-claim/SKILL.md:426 "Fires: AFTER Phase A orphan-adoption probe, BEFORE Phase B PRE-CLAIM gate" and :464 "Roster read is READ-ONLY advisory — ALWAYS proceed to Phase B regardless of result."

#### router-dispatch-locking-I16 · LOW — task-lock carries dead/stale sections: legacy matching ladder documented as live though P1-FINAL removed it, plus a 23-line historical Phase Status changelog

The ladder no longer exists server-side; documenting it as a live fallback invites callers to rely on owner_agent matching that will silently fail. The changelog belongs in the architecture brief, not a hot-path skill.

*Evidence*: .claude/skills/task-lock/SKILL.md:112-127 "Legacy Backward-Compat Fallback — TRANSITIONAL ... removed at step 5 (TASK_1980 / P1-FINAL)" vs live server coordinationTools.ts heartbeat description "P1-FINAL (TASK_1980): match is SOLELY on owner_client_session ... Fallback rungs removed"; task-lock:186-208 "## Phase Status (as of 2026-06-28)" commit-hash changelog.

#### router-dispatch-locking-I17 · LOW — zone-detect routes multi-zone tasks to generic `developer`, whose flow scope is explicitly apps/mcp-server root only

A task touching apps/alert-engine/ + apps/stock-price/ routes to an agent whose own flow disclaims that work, leaving the task in a scope no-man's land or silently executed out of scope.

*Evidence*: .claude/skills/zone-detect/SKILL.md:34 "Files span >1 zone OR root/scripts/ → route to `developer` (generic)" vs docs/agents/developer/flow/main.md:4 "**Scope:** `apps/mcp-server/` root only (TypeScript/Bun)."

#### router-dispatch-locking-I18 · LOW — Dispatch table (110L) must be re-read before EVERY spawn, even repeat intents in the same session

~1.3k tokens per dispatch of pure re-reading for a table that changes rarely; over a multi-dispatch session this dominates router overhead alongside the 493L dispatch-claim load (I8).

*Evidence*: CLAUDE.md:4-5 "## BEFORE spawning any agent — MANDATORY / 1. Read `.claude/skills/dispatch/SKILL.md` dispatch table" — no per-session caching allowance.

### Proposals

#### router-dispatch-locking-P4 · impact=high effort=L · **CONFIRMED** — Add composite dispatch_preflight MCP tool: presence + orphan probe + roster + intent claim in ONE gateway call

*Addresses*: router-dispatch-locking-I8, router-dispatch-locking-I9, router-dispatch-locking-I15, router-dispatch-locking-I18

**Change**: New tool in coordinationTools.ts: dispatch_preflight(dispatcher_role, owner_client_session, intent_task_id?, register_presence=true) → atomically {presence:{registered|renewed}, orphans:[...role-filtered orphan-signals], roster:[...session-presence rows], claim:{claimed, current_holder}}. Then CLAUDE.md step 2.5 and dispatch-claim Phases 0a/A/A.5/B collapse to one call + one branch table. Registry grep confirms no such tool exists today.

*Files*: apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts, apps/mcp-server/src/infrastructure/db/coordinationStore.ts, CLAUDE.md, .claude/skills/dispatch-claim/SKILL.md, docs/data/tool-registry.json

*Risk*: New tool = tool-count SSOT 3-way sync (feedback_ssot_toolcount_drift). Keep individual tools intact for non-router callers. Gate behind live integration test (claimed:true round-trip) before flipping docs.

*Verifier*: All cited evidence verified against the repo: dispatch-claim/SKILL.md=493L and task-lock/SKILL.md=283L with zero size-justification headers (vs docs/agents/developer/flow/main.md:1 which has one); CLAUDE.md:4-5/:7/:19-26 quoted accurately; drift is real (CLAUDE.md's condensed Phase B copy drops the claimed:false+self-held->heartbeat branch present in canonical dispatch-claim:222-263); session-presence claim block and release+reclaim pattern are genuinely duplicated (dispatch-claim:139-178/187-201 vs task-lock:218-233/257-272); dispatch-claim:426 and :464 quotes verbatim; no dispatch_preflight exists in apps/mcp-server/src or docs/data/tool-registry.json (coordination surface = task_claim/task_list_held/task_heartbeat/task_release/task_force_release_orphan only); both target files exist. Not already queued: CLEAN-SKILL-BLOAT-TASK-LOCK (BACKLOG) is a trim-only row with stale line count (204L vs actual 283L) touching neither dispatch-claim nor any tool; SYSREMAKE-P2 RC-CEREMONY (BACKLOG plan_only) targets dev-team SF-1 tick ceremony, not the router Phase A/A.5/B preflight, and lists full lib rewrite as a non-goal. No invariant violation: tool reached via gateway wrapper, consolidation aligns with the one-SSOT/anti-drift and <=200L invariants, precedent exists (get_cycle_bootstrap, step-0-cowork composite), and tool-registry.json update is included. Concrete enough to hand to a dev agent. Non-blocking caveats for implementation: (1) the 4th motivation bullet (dispatch-table re-read) is accurate but NOT fixed by an MCP tool — drop it or handle separately; (2) composite return must expose the self-held-vs-peer distinction (claim.current_holder.owner_client_session) so the heartbeat-renew branch survives — the exact branch CLAUDE.md drift already lost; (3) use server-validated task_kind enums (known PRE-CLAIM enum-drift feedback); (4) orphan-adoption per-signal actions (re-claim+spawn / idempotent BUG escalate) remain client-side in the branch table; (5) supersede/fold CLEAN-SKILL-BLOAT-TASK-LOCK and coordinate with SYSREMAKE-P2 RC-CEREMONY to avoid double-building preflight consolidation.

#### router-dispatch-locking-P3 · impact=high effort=M · **RESCOPE** — Repair orphan escalation + adoption: supported-params escalation, board-state guard, honest cleanup

*Addresses*: router-dispatch-locking-I3, router-dispatch-locking-I6

**Change**: (a) Server: extend task_heartbeat in coordinationTools.ts + heartbeatTask() with optional ttl_seconds and payload_patch, AND make null-session orphan-signal rows matchable via owner_agent + payload.original_owner_client_session (memory-recommended fix). (b) .claude/skills/dispatch-claim/SKILL.md §Orphan-Adoption Probe: insert before the adopt claim: 'Board-state guard: jq orch-state lane for original_task_id; lane in {review,done,done_verified} → completion-recognizing closeout (skip, no re-dispatch)'; rewrite the escalation block (:353-359) to use the extended heartbeat; mark the finally release of orphan-signal rows as best-effort with expected released:0 until (a) ships. Implements the already-filed FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD ticket — do not mint a duplicate.

*Files*: apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts, apps/mcp-server/src/infrastructure/db/coordinationStore.ts, .claude/skills/dispatch-claim/SKILL.md

*Risk*: Server change needs the enum/schema-drift lesson applied (widen Zod + tool description + tests in sync; live integration check per feedback_preclaim_gate_taskkind_enum_drift). Container rebuild is user-gated — route to ops.

*Verifier*: EVIDENCE: all verified. (1) .claude/skills/dispatch-claim/SKILL.md:353-358 escalation block calls task_heartbeat with ttl_seconds:86400 + payload_patch:{"status":"ESCALATED"}; the SAME file at :182-184 states "no payload_patch in the current MCP surface". coordinationTools.ts task_heartbeat registration (~:151-166) accepts ONLY task_id + owner_client_session; heartbeatTask() (coordinationStore.ts:723-750) takes only those two and matches WHERE owner_client_session = ?; grep payload_patch in apps/mcp-server/src = 0 hits. Worse than cited: the reaper mints orphan-signal rows with owner_client_session=NULL (coordinationStore.ts:545), so even a param-stripped heartbeat returns ok:false — the ESCALATED marker can never persist, the :347 idempotency check is dead, BUG telegram re-fires every dispatch. (2) Finally block :392-396 releases "orphan-signal:"+original_task_id — a row the adopter never claimed, NULL-session → released:0 (confirmed by memory feedback_orphan_signal_immune_and_adoption_no_board_guard and the ticket's 07-04 recur note). (3) §Orphan-Adoption Probe (:317-420) has zero orch-state lane checks. NOT ALREADY DONE: FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD sits in orch-state backlog (status BACKLOG, plan_only:true, supervised:true, next_agent=ba) — filed, never implemented (07-09 near-miss auto-promotion was reverted). No invariant violations (board-state guard is a READ; orch-apply gate covers writes; gateway wrapper preserved). WHY RESCOPE, not CONFIRMED: the proposal claims to "implement the already-filed ticket" but (a) omits the ticket's OTHER adoption path — dev-team docs/agents/dev-team/flow/main.md Step 0a (~:296-411), which has the identical missing guard AND identical broken finally-release (:390-392), and which is the path of the CONFIRMED live recurrence (2026-07-04T12:07Z, FACTORY-INTERFACE-split-server-ts); ticket fix_spec(a)/AC1 explicitly requires BOTH paths; (b) omits fix_spec(b)/AC2 (heartbeat-during-run or raise sprint-task TTL above ~90min runtime) without declaring partial scope — shipping this as "implements the ticket" would close a P0 supervised ticket with its recurring path unguarded and one AC unmet; (c) the lane guard {review,done,done_verified} misses the live board's qa lane, the ticket's closed state, and the 2x-confirmed status-flip≠lane-move defect (completed row parked in in_progress[] with status=REVIEW escapes a lane-only check). Diagnosis and fix direction are correct and match ticket + memory; scope must be corrected.

*Rescope*: Repair orphan escalation + adoption across BOTH adoption paths: supported-params escalation, board-state guard, honest cleanup. CHANGE: (a) Server: extend task_heartbeat in coordinationTools.ts + heartbeatTask() in coordinationStore.ts with optional ttl_seconds and payload_patch, AND add a null-session match ladder so reaper-minted orphan-signal rows (owner_client_session=NULL) are matchable/clearable via owner_agent + payload.original_owner_client_session (ticket fix_spec c / AC3; memory-recommended). Update SKILL.md :182-184 prose ("no payload_patch") in the same commit so doc and surface do not contradict. (b) .claude/skills/dispatch-claim/SKILL.md §Orphan-Adoption Probe: insert before the adopt claim a board-state guard — resolve original_task_id against orch-state task_board; ADOPT only if the row sits in an active lane (in_progress or ready) AND its status is not in {REVIEW, DONE, DONE_VERIFIED} (active-lane allow-list per the ticket's recur note; the status check covers the known status-flip-without-lane-move defect). Any terminal/absent/parked state → completion-recognizing closeout: log skip, no re-dispatch, best-effort release of the orphan-signal. Rewrite the escalation block (:353-359) to use the extended heartbeat once (a) ships; until then annotate it INOPERATIVE. Mark the finally release (:393-396) best-effort with expected released:0 until (a) ships. (c) docs/agents/dev-team/flow/main.md Step 0a (~:296-411): apply the SAME board-state guard before its adopt claim and the same best-effort annotation on its orphan-signal release (:390-392) — this is the path with the confirmed 07-04 live recurrence; guard text must reference dispatch-claim SKILL.md as SSOT, not be copy-pasted (base-skill invariant). (d) Ticket closeout honesty: this implements fix_spec (a) and (c) / AC1 and AC3 of FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD — do NOT mint a duplicate and do NOT close the ticket; fix_spec (b)/AC2 (sprint-task lock heartbeat-during-run or TTL raise above ~90min agent runtime) remains open and must either be included or left as the ticket's explicit residual. Route via the supervised ticket's chain (next_agent=ba, architect SPLIT for the multi-zone server+flow-doc split) — it is supervised:true and must not be BOUNDED-1 auto-picked. FILES: apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts, apps/mcp-server/src/infrastructure/db/coordinationStore.ts, .claude/skills/dispatch-claim/SKILL.md, docs/agents/dev-team/flow/main.md.

#### router-dispatch-locking-P7 · impact=high effort=M · **RESCOPE** — Reconcile branch policy across developer flow and dispatch handoff chain with the main-only invariant

*Addresses*: router-dispatch-locking-I7

**Change**: docs/agents/developer/flow/main.md: Output (:13) 'on task/NNN-* branch' → 'committed to main (explicit paths, commit-mutex via dispatcher)'; pre-code checklist step 2 (:51-54) branch setup → 'verify on main + clean tree'; RETURN (:159) drop 'on branch task/NNN-kebab'. .claude/skills/dispatch/SKILL.md:73 'branch merged' → 'commits on main verified'. Route one decision to po first: whether worktree-parallel tiers (main.md:25) keep an ephemeral-worktree exception — if yes, document it as the ONLY branch exception in both files instead.

*Files*: docs/agents/developer/flow/main.md, .claude/skills/dispatch/SKILL.md

*Risk*: Worktrees require branches; flipping docs without the po decision could break the parallel-tier mechanism. Do the po decision first, then the doc edit is mechanical.

*Verifier*: Evidence verified verbatim (CLAUDE.md NO-branches vs developer/flow/main.md:13,:53,:158 and dispatch/SKILL.md:73); no existing or queued fix found in backlog, po-decisions.md, or memory; no invariant violated and the po-first worktree ruling is correctly sequenced. However the proposed FILES scope (2 files) covers only the branch-creation half of the lifecycle. The merge half lives in docs/agents/qa/flow/main.md (git checkout task/NNN :113, merge --no-ff :169, branch delete :176-177) — implementing only the proposed edits makes the developer commit to main while QA still tries to checkout/merge a branch that no longer exists, wedging the Developer→QA handoff on the first post-change run and increasing net contradictions. Same machinery is duplicated in microservice-main.md (:12,:21,:55-57,:161 — used by ALL dev-* zone agents), doc-review.md:13, fixer/flow/main.md, pm/flow/main.md, and dev-team/flow/main.md closeout (:602, :663-668). A compliant full-lifecycle variant exists, so RESCOPE rather than CONFIRMED.

*Rescope*: Reconcile branch policy with the main-only invariant across the FULL branch lifecycle, po-gated. STEP 1 (unchanged): route to po the decision whether worktree-parallel tiers (developer/flow/main.md:25, dev-team merge gate) keep an ephemeral-worktree branch exception — hand po the evidence that worktree isolation structurally requires branches (.claude/settings.json worktree.baseRef=head; memory feedback_merge_gate_cherrypick_serialize + feedback_worktree_stale_base; dev-team/flow/main.md:602,645,663-668). STEP 2 (single sprint, all edits land together so the Developer→QA chain never straddles two policies): (a) docs/agents/developer/flow/main.md — :13 and :27 'on task/NNN-* branch' → 'committed to main (explicit paths; dispatcher holds sprint-task lock per INV-GATEWAY-1)'; :51-54 branch setup → 'verify on main + clean tree (git branch --show-current == main; git status clean)'; :158 drop 'on branch task/NNN-kebab'. (b) docs/agents/developer/flow/microservice-main.md — identical edits at :12, :21, :55-57, :161. (c) docs/agents/qa/flow/main.md — :7/:37 input wording drops branch; replace :113 checkout + :169 merge --no-ff + :176-177 branch delete with verification of the Implementation Record commit hashes on main; retain a worktree-merge path ONLY if po keeps the exception, gated on isolation:worktree provenance. (d) docs/agents/developer/flow/doc-review.md:13 — diff base task/NNN...HEAD → explicit commit range from the handoff Implementation Record. (e) .claude/skills/dispatch/SKILL.md:73 — 'branch merged' → 'commits on main verified'. (f) docs/agents/dev-team/flow/main.md — :602 'branch list' → 'commit list'; :663-668 closeout 'Branch deleted by QA post-merge' → per po ruling (worktree-branch cleanup stays only if exception kept). (g) Mirror wording in fixer/flow/main.md and pm/flow/main.md where they emit/consume branch names in handoffs; sweep developer/qa/fixer/dev-* init.md files for the same stanza. Per the shared-boilerplate invariant, put the reconciled commit-policy text in ONE place (dispatch SKILL.md or a small commit-policy section referenced by all flows) instead of re-pasting per file; apply agent-md-factory pre/post-edit discipline. STEP 3: if po keeps the worktree exception, document it as the ONLY branch exception in dispatch SKILL.md and dev-team merge gate, with developer/flow/main.md:25 pointing at it.

#### router-dispatch-locking-P1 · impact=high effort=S · **CONFIRMED** — Align outer-wrap lock namespace to the live 'task:' prefix

*Addresses*: router-dispatch-locking-I1

**Change**: In .claude/skills/dispatch-claim/SKILL.md: namespace table row (:39) 'sprint-task:<task-id>' → 'task:<task-id>' (task_kind column unchanged: sprint-task); §Sprint-Task Outer Wrap (:269-284) replace task_id "sprint-task:<task_id>" with "task:<task_id>" and reword the closing rule to 'Align on the task: id-prefix everywhere; task_kind stays sprint-task — id-prefix and kind are different axes.' Doc-only: every flow (dev-team:575, pm/init:126, developer:69/93, microservice-main:92) and the server tool description already use task:.

*Files*: .claude/skills/dispatch-claim/SKILL.md

*Risk*: None to runtime (doc matches existing behavior). Grep-verify zero live 'sprint-task:' task_ids first (already verified: zero in docs/agents).

*Verifier*: All cited evidence verified verbatim: dispatch-claim SKILL.md:39/:269/:273/:283 mandate 'sprint-task:' prefix while every live flow mints 'task:' (dev-team/flow/main.md:575+595, pm/init.md:126, developer/flow/main.md:69/93, developer/flow/microservice-main.md:92, plus qa, po/sprint-signoff, execute-tier, developer/init — zero flow files use sprint-task: as a task_id). Server confirms 'task:' as canonical: coordinationTools.ts:87 zod describe says 'task:<task_id>' (kind enum stays 'sprint-task'), tasksMdJanitorJob.ts:185 strips the 'task:' prefix, and system-auditor/handlers.md:46 normalizes via startsWith("task:") — so aligning the doc to 'task:' is the only non-breaking direction (the 06-28 brief's opposite alignment was never implemented). Mutex-defeat is real: any dispatcher following the SKILL literally (e.g. the router park-lock pattern in memory, which claims sprint-task:<id>) creates a lock that never collides with the agents' task:<id> self-claims. Not already fixed (SKILL.md unchanged) and not queued (no matching backlog row in orch-state.json; TASK_1977/1979 handoffs and the 06-28 brief are the historical origin of the drift, not pending fixes). Doc-only, SSOT-reinforcing, no invariant violated, concrete line-level spec. Minor addendum for the implementer: .claude/skills/task-lock/SKILL.md:29-30 carries the identical drift ('<kind>:<id>' // e.g. "sprint-task:TASK_1974") and should get the same one-line correction in the same commit; dispatch-claim SKILL.md:492 is historical provenance prose and needs no change.

#### router-dispatch-locking-P5 · impact=high effort=S · **CONFIRMED** — Shrink CLAUDE.md step 2.5 to a pointer + 3-outcome table that includes the missing re-entrant branch

*Addresses*: router-dispatch-locking-I5, router-dispatch-locking-I9

**Change**: Replace CLAUDE.md:7-26 (20 lines of condensed Phase A/A.5/B pseudocode) with ~5 lines: 'Run Step 0a + Phases A/A.5/B per .claude/skills/dispatch-claim/SKILL.md. Outcomes: claimed:true → spawn in try/finally→task_release · claimed:false+self-held (current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID) → heartbeat + proceed to spawn · claimed:false+peer → log + send_telegram(work) + EXIT.' Removes the drifted duplicate AND fixes the false-peer EXIT bug in one edit; also drops the hardcoded redispatch_count<3 (N_MAX lives in dispatch-claim).

*Files*: CLAUDE.md

*Risk*: CLAUDE.md is always-loaded context — verify the replacement keeps the EXIT semantics verbatim so routers do not soften the peer-collision behavior. Beware Edit-tool multiline-strip harness bug: apply as one Write-reviewed hunk.

*Verifier*: All cited evidence verified at exact lines: CLAUDE.md:19-26 condensed Phase B copy handles only claimed:true and claimed:false+peer→EXIT with no self-held re-entrant branch, while canonical .claude/skills/dispatch-claim/SKILL.md:250-256 heartbeats and proceeds to spawn on self-hold; CLAUDE.md:10-11 hardcodes redispatch_count<3 while N_MAX=3 is defined configurable at dispatch-claim:328; duplication confirmed (Pattern at dispatch-claim:222-263 vs CLAUDE.md 2.5; Step 0a block at dispatch-claim:139-178 AND task-lock:218-233; release+reclaim at dispatch-claim:187-201 AND task-lock:257-272). The false-peer class is documented in memory feedback_devteam_preflight_sf1_not_reentrant_false_peer (phantom-peer SKIP for full TTL). NOT already fixed or queued: FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT (folded into SYSREMAKE-P2 RC-CEREMONY) targets scripts/agents-flow/dev-team-tick-preflight.sh, not CLAUDE.md; RC-DRIFT CLAUDE.md rows target tool/cron-count hardcodes only. No standing invariant violated — the change enforces the shared-boilerplate-in-ONE-skill and no-hardcode invariants, and including Step 0a matches the canonical skill's ordering (Step 0a fires before Phase A/B, which are router phases). Replacement text is concrete and hand-off ready. Two implementation caveats (non-blocking): the edit falls under agent-md-factory discipline for agent-related CLAUDE.md blocks, and the known Edit-tool hook multiline-strip bug means the implementer should use Write or diff-verify. One characterization nuance: CLAUDE.md's EXIT is conditioned on peer (owner_client_session ≠ session), so the self-held case is strictly undefined rather than actively mis-branched — but an undefined claimed:false path whose only visible handler is EXIT produces the same false-peer failure mode the proposal fixes.

#### router-dispatch-locking-P6 · impact=medium effort=M · **UNVERIFIED** — Restructure dispatch-claim and task-lock to <=200L; single-source the session-presence spec

*Addresses*: router-dispatch-locking-I8, router-dispatch-locking-I9, router-dispatch-locking-I16

**Change**: dispatch-claim: extract §Fire-Time Election (:71-127) to new .claude/skills/fire-election/SKILL.md (canonical impls already named at :121-122 — the section can shrink to a 3-line pointer); move §Reference Commits (:483-493) into docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md. task-lock: delete §Session-Presence Row body (:211-283) keeping the existing 2-line pointer to dispatch-claim §Step 0a (:235-236); collapse §Legacy Backward-Compat Fallback (:112-127) to one line 'P1-FINAL shipped — match is SOLELY on owner_client_session; no fallback rungs'; move §Phase Status (:186-208) to the brief. Result: dispatch-claim ~280→ needs one more trim or a size-justification header; task-lock ~170L compliant.

*Files*: .claude/skills/dispatch-claim/SKILL.md, .claude/skills/task-lock/SKILL.md, .claude/skills/fire-election/SKILL.md, docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md, CLAUDE.md

*Risk*: Update every inbound pointer (CLAUDE.md:13/18, task-lock:159, flow files referencing §Fire-Time Election) in the same commit — dangling § references are the failure mode. agent-md-factory pre/post-edit discipline applies.

#### router-dispatch-locking-P8 · impact=medium effort=S · **UNVERIFIED** — Persist the fallback session-ID mint across bash calls

*Addresses*: router-dispatch-locking-I10

**Change**: .claude/skills/dispatch-claim/SKILL.md:22-27: replace the inline mint with: FB="$PROJECT_ROOT/.claude/tmp/session-fallback-id"; if unset CLAUDE_CODE_SESSION_ID: [ -f "$FB" ] && CLAUDE_CODE_SESSION_ID=$(cat "$FB") || { mint; mkdir -p + write to "$FB"; }. Note the file must be cleared at session end (add to session-start cron skills as a staleness check: mtime > 24h → re-mint).

*Files*: .claude/skills/dispatch-claim/SKILL.md

*Risk*: Two concurrent sessions on the same host with unset env would share the fallback file — acceptable degradation (fallback path is already an anomaly that logs a warning); add the session-pid to the warning log.

#### router-dispatch-locking-P10 · impact=medium effort=S · **UNVERIFIED** — Add an explicit adoption-spawn mapping row; stop naming the non-existent dev-team agent type

*Addresses*: router-dispatch-locking-I12

**Change**: .claude/skills/dispatch/SKILL.md dispatch table: add row 'orphan sprint-task adoption (Phase A) → <real runner agent per agent-roster> | mode=adopt-resume'. .claude/skills/dispatch-claim/SKILL.md:383 and :417: 'spawn dev-team' → 'spawn the agent mapped in dispatch/SKILL.md adoption row (dev-team is a flow, not an agent type — CLAUDE.md §Agent type does not exist)'. Resolve the actual runner name from docs/references/agent-roster.md, not hardcoded here.

*Files*: .claude/skills/dispatch/SKILL.md, .claude/skills/dispatch-claim/SKILL.md

*Risk*: Must name a real agent type that has gateway tool surface (adoption requires lock ops) — verify against the roster before committing.

#### router-dispatch-locking-P11 · impact=medium effort=S · **UNVERIFIED** — Release the intent lock on background-completion, not at spawn-return

*Addresses*: router-dispatch-locking-I13

**Change**: .claude/skills/dispatch-claim/SKILL.md Pattern (:239-247) + CLAUDE.md step 3 (:29): for backgrounded spawns, move task_release('intent:...') from the finally into the background-task completion handler (Claude Code re-invokes the router when a background agent exits); keep TTL 600s as the crash backstop and add 'heartbeat intent lock on each router turn while the spawn is alive'. Document explicitly: 'finally after a backgrounded Agent() fires immediately — it does NOT cover agent runtime.'

*Files*: .claude/skills/dispatch-claim/SKILL.md, CLAUDE.md

*Risk*: If the router session dies before the completion event, the lock now persists to TTL (600s) — same as today's crash case; no regression. Long-running agents need the heartbeat line or the backstop TTL will lapse — acceptable: dedup window degrades to 600s, current state.

#### router-dispatch-locking-P12 · impact=medium effort=S · **UNVERIFIED** — Add required owner_client_session to init.md lock releases

*Addresses*: router-dispatch-locking-I14

**Change**: docs/agents/developer/init.md:45 and docs/agents/pm/init.md:139: add owner_client_session: $CLAUDE_CODE_SESSION_ID to the task_release arguments (matching the claim at developer/init.md:33 / pm/init.md:126 which already pass it).

*Files*: docs/agents/developer/init.md, docs/agents/pm/init.md

*Risk*: None — pure omission fix; P1-FINAL server already requires the field.

#### router-dispatch-locking-P14 · impact=medium effort=S · **UNVERIFIED** — Allow per-session caching of the dispatch table read

*Addresses*: router-dispatch-locking-I18

**Change**: CLAUDE.md:5: '1. Read `.claude/skills/dispatch/SKILL.md` dispatch table' → '1. Read `.claude/skills/dispatch/SKILL.md` dispatch table (once per session; re-read only if the file changed since last read)'. Saves ~1.3k tokens per repeat dispatch with zero behavior change on first dispatch.

*Files*: CLAUDE.md

*Risk*: Stale-cache window if the table is edited mid-session by an agent — bounded by 'if changed' clause (router sees the edit in its own transcript when it dispatched the editing agent).

#### router-dispatch-locking-P15 · impact=medium effort=S · **UNVERIFIED** — Correct Phase A's stated scope: intent claims are not adoptable; skip the probe when the role has no adoptable history

*Addresses*: router-dispatch-locking-I4, router-dispatch-locking-I15

**Change**: .claude/skills/dispatch-claim/SKILL.md:408-411: delete 'covers: `intent:*` claims'; replace with 'intent claims are NOT in ORPHAN_EMIT_ALLOW_LIST (coordinationStore.ts:453) — a dead session's intent lock TTL-GCs silently in <=600s and is never adoptable. The router probe surfaces only router-owned sprint-task/cowork-slot/dashboard-row orphans.' Add: 'Routers that have dispatched no adoptable-kind work this session MAY skip Phase A (probe would be empty by construction).' Also demote Phase A.5 firing rule (:426) to 'on Phase B collision or adoption only' per I15.

*Files*: .claude/skills/dispatch-claim/SKILL.md

*Risk*: The skip clause relies on the router knowing its own dispatch history — conservative wording ('MAY skip') keeps the safe default. Superseded by P4 if the composite tool ships.

#### router-dispatch-locking-P9 · impact=low effort=S · **UNVERIFIED** — Fix gateway tool-name drift in task-lock INV-GATEWAY-1 section

*Addresses*: router-dispatch-locking-I11

**Change**: .claude/skills/task-lock/SKILL.md:169: 'mcp__claude_ai_gateway__call_tool' → 'mcp__gateway__call_tool' (matches CLAUDE.md:50 constitution and live registration).

*Files*: .claude/skills/task-lock/SKILL.md

*Risk*: Verify live registration name first (one list_server_tools probe) — if the plugin registers under the longer name, fix CLAUDE.md instead; either way, ONE name everywhere.

#### router-dispatch-locking-P13 · impact=low effort=S · **UNVERIFIED** — Route multi-zone tasks to pm decomposition instead of the scope-restricted generic developer

*Addresses*: router-dispatch-locking-I17

**Change**: .claude/skills/zone-detect/SKILL.md:34: 'Files span >1 zone OR root/scripts/ → route to `developer` (generic)' → 'Files span >1 zone → route to `pm` (decompose into per-zone subtasks); root/scripts/ only → `developer` (generic, apps/mcp-server root scope)'. Keeps developer main.md:4 scope statement true.

*Files*: .claude/skills/zone-detect/SKILL.md

*Risk*: Adds a pm hop for genuinely trivial cross-zone edits; mitigate with 'unless <=2 files and both zones share one specialist' escape hatch. pm races memory (pm decomposition races live terminal) applies — pm already has serialization rules.


## Domain: dev-team-loop

### Issues

#### dev-team-loop-I1 · HIGH — Orphan-adoption path permanently drops drained signals (drain persists BEFORE routing, adoption exits before Step 1)

Step 0a-A drains docs/signals/*.json — files are fingerprinted, INSERTed into signals_processed, and moved to processed/ immediately. Step 0a-B then runs orphan adoption; on a successful adoption it JUMPs TO end, so pendingSignals[] never reaches Step 1 PO triage. On the NEXT tick the fingerprint dedup treats those signals as already-routed and skips them forever. Any tick that adopts an orphan silently loses every co-drained signal (ci_red, repair_task_request, esc-deep-dive, etc.). The only recovery is the manual escape hatch (delete processed copy + DB row), which nothing triggers.

*Evidence*: docs/agents/dev-team/flow/main.md:407 "JUMP TO end   # adopted task queued; do not process further signals in this tick" combined with docs/agents/dev-team/flow/drain-signals.md:91 "Match in `signals_processed` → skip PO routing | mv to `processed/{name-replay}.json` | no INSERT"

#### dev-team-loop-I2 · HIGH — Post-cycle backstops (cold eviction 4.2, mock-guard 4.0.5, push 4.8) are unreachable on idle/adoption/session-gate exits — live board shows the invariant already violated

Step 4.2 is described as a backstop "so bloat never re-accumulates between pm/task-archive cycles" (post-cycle.md:40), but it only runs when a tick reaches Step 3 execution and returns through post-cycle. Idle ticks (Session Gate), RUN-IDLE ticks, orphan-adoption ticks, SF-1 skip ticks, and BLOCKED-head resets all JUMP TO end and never execute Step 4.x. Result on the live board: done[]=23 (>10 threshold) and near-fully-terminal sprints sitting un-evicted — exactly the bloat the backstop exists to prevent. A backstop that only fires on busy ticks is not a backstop.

*Evidence*: docs/agents/dev-team/flow/main.md:526 "Session Gate: ... → JUMP TO `end`" and main.md:407 adoption "JUMP TO end"; post-cycle only reached via Step 3 (main.md:650-653 "Step 4 + 4.5 — Scan + Compact → Run sub-flow: post-cycle.md"). post-cycle.md:61 "if [ \"$TERMINAL_SPRINT_N\" -gt 0 ] ... || [ \"$DONE_N\" -gt 10 ] || [ \"$DV_N\" -gt 0 ]". Live jq: done[]=23, done_verified[]=1, 6 active_sprints with 33/35, 19/20, 8/9, 5/6 tasks terminal.

#### dev-team-loop-I3 · HIGH — RUN-IDLE (zero-cost tick) is effectively dead: it requires active_sprints empty, but 6 sprints are held ACTIVE by 1-2 straggler tasks each — every tick pays full cost

The P1-IDLE-DEVTEAM-FLOW-BRANCH silent-release path (zero commit, zero drain, zero PO spawn) was built to cut idle-tick cost, but its precondition includes active_sprints empty. Task-archive's eviction predicate (pm/flow/task-archive.md:44-49) only evicts sprints where ALL tasks are terminal, and sprint status stays "ACTIVE" until PO signs off. Nothing closes the 1-2 straggler tasks per sprint (same lifecycle gap as the epic-wrapper problem, at sprint scale), so active_sprints never empties, RUN-IDLE never fires, and all ~48 ticks/day run the full drain+probe+PO-triage pipeline. Combined with I2 (eviction unreachable) this is a self-reinforcing loop: bloat blocks the idle path, and the non-idle path is the only one that could clear the bloat.

*Evidence*: docs/agents/dev-team/flow/main.md:101 "`signal_queue` NEW rows, and `task_board.active_sprints` are ALL empty/fresh"; live jq: BCTC-ANALYTICS-LAYER [ACTIVE] tasks=35 terminal=33, VN-MACRO-TOOLING [ACTIVE] 20/19, BCTC-REFINE-STALL-RETRIGGER [ACTIVE] 9/8, SSOT-INTEGRITY-PERIMETER [ACTIVE] 6/5

#### dev-team-loop-I4 · HIGH — No flow step drains the review[] lane — 24 rows parked (9 with next_agent=qa, oldest 2026-07-01), invisible to WIP and to every gate

Rows reach review[] via QA CHANGES_REQUESTED, PO reconcile scripts, and Close Gate Step 4 (next_agent=qa), but the only dispatch mechanism is .head.next_agent — and head is idle (live: status=idle, active_task_id=null). Once head moves on, a review[] row with next_agent=qa has no pickup path: BOUNDED-1 only sweeps backlog[], PO triage has no review-sweep step, Session Gate doesn't check review[]. This is the structural root of the recurring "REVIEW parked / stuck" pattern (memory: feedback_review_status_stuck_in_inprogress_lane_blocks_wip is the WIP-side variant; this is the drain-side variant). 24 rows of completed-but-unverified work is invisible WIP debt.

*Evidence*: scripts/devteam-backlog-promote-bounded1.jq:7,17 "len(.task_board.ready) + len(.task_board.in_progress)" (review/qa lanes excluded from WIP); live jq: review=24 rows, next_agent breakdown {qa:9, ops:3, none:9, ...}, oldest updated 2026-07-01T18:02:32Z; no step in dev-team/flow/main.md between Step 0b and Step 1 reads .task_board.review[]

#### dev-team-loop-I5 · HIGH — po/flow/main.md is 69.5KB and 77% of it (53.5KB) is a one-off jq-script changelog catalog loaded on EVERY PO triage spawn

PO is spawned by dev-team Step 1 on essentially every non-idle tick (Session Gate is dead code — see I14), and its main.md must be read in full as the dispatcher. The po-s50..s142 catalog entries are historical one-shot scripts that will never be re-invoked verbatim; each new triage mints a NEW sNNN script, so the section grows unboundedly (~17k tokens today). This violates the ≤200L lazy-load waterfall invariant and is the single largest recurring token cost in the loop (~13-17k tokens x ~30-48 PO spawns/day).

*Evidence*: docs/agents/po/flow/main.md:1 "size-justification: 229L" vs actual wc: 274 lines / 69,513 bytes; § "Reusable triage scripts" (main.md:225-268) measures 53,503 bytes — e.g. main.md:244 is a single ~4,000-char paragraph describing scripts/po-s88-... one historical triage

#### dev-team-loop-I6 · MEDIUM — drain-signals.md 0a-D-PRUNE contradicts the signal-dashboard SSOT: instructs writing to the REMOVED .signal_queue.archive[] lane with a 48h criterion

Dev-team runs 0a-D-PRUNE every drain tick. Following the flow as written re-populates the hot-file archive[] lane that HSC-7 explicitly removed (orch-cold-evict.sh clears it — "RC-1 fix: inline archive = dead weight"), and uses a divergent retention window (48h vs 24h). The flow file both cites the skill ("per skill .claude/skills/signal-dashboard/SKILL.md § PRUNE") and then inlines a stale copy of the procedure — the exact copy-paste-drift class the shared-boilerplate invariant forbids.

*Evidence*: docs/agents/dev-team/flow/drain-signals.md:60-62 "Archive rows where status = RESOLVED or READ + ts < now() - 48h: Move to orch-state.json .signal_queue.archive[]" vs .claude/skills/signal-dashboard/SKILL.md:88 "Evict terminal rows to cold archive via `scripts/orch-cold-evict.sh` (NOT inline `archive[]` — lane removed)" and criteria "older than 24h"

#### dev-team-loop-I7 · MEDIUM — Epic-wrapper autoclose still unimplemented: promote-time gate exists but nothing ever closes a wrapper whose children are all DONE_VERIFIED

The shipped FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE stops premature pickup of wrapper rows but has no bearing on the closing side. After PM decomposes and head resets idle, no step re-checks "are all children terminal → close the parent". Confirmed live 2026-07-10 (BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP parent open for hours after all 11 children DONE_VERIFIED, found by router luck). The minted fix row has sat in backlog since 07-10 with nothing forcing it — a wrapper-shaped irony.

*Evidence*: docs/agents/dev-team/flow/main.md:518 "decomposition-container rows ... are NEVER auto-promoted" (gate only); live board: FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP still [BACKLOG]; memory feedback_epic_wrapper_closeout_gap_no_auto_revisit: "Step 0b's pipeline-resume ... only fires when .head.status == \"in_progress\" ... The parent row is architecturally orphaned from that point"

#### dev-team-loop-I8 · MEDIUM — "status-flip = lane-move" rule absent from every dev-team flow doc despite 2 confirmed occurrences and Stage 1b now hard-failing such writes

The failure class flipped shape: before D5 hardening, a status-only flip silently pinned WIP (2 confirmed: 07-09, 07-10); now orch-apply REJECTS the incoherent write (validator exit 2). But since no flow doc or worker spawn prompt states that flipping .status requires moving the row between lane arrays in the SAME jq transform, workers will hit loud validator rejects mid-flow with no documented remedy — trading silent corruption for stuck writes/abandoned board updates. The memory file explicitly prescribed patching main.md/execute-tier.md after the 2nd occurrence; that patch never landed.

*Evidence*: grep -rn "lane-move|lane move|status-flip" docs/agents/dev-team/flow/ returns ZERO hits; scripts/orch-validate.mjs:374 "Stage 1b: Lane coherence (HARD-FAIL — SHG migration complete)"; live board: FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE still [BACKLOG]

#### dev-team-loop-I9 · MEDIUM — WF-1 BLOCKED guard and orphan-adoption board-flip jq only scan active_sprints[].tasks[] — blind to the flat lanes where 95% of live rows sit

A head.active_task_id pointing at a flat-lane row (the normal case since the hot/cold split — BOUNDED-1 claims write in_progress[] flat) makes the WF-1 BLOCKED check return empty → the guard passes and pipeline-resume can re-spawn a BLOCKED flat-lane task every tick (the exact loop WF-1 was built to stop). Same path bug in the adoption flip: an adopted flat-lane task's assigned_to/adopted_at update is a silent jq no-op, so the board never records the adoption.

*Evidence*: docs/agents/dev-team/flow/main.md:454 "'.task_board.active_sprints[].tasks[] | select(.id == $tid or .task_id == $tid) | .status'" and main.md:385 "(.task_board.active_sprints[].tasks[] | select(.id == $tid)) |= (.assigned_to = $session ...)"; live board: 313 backlog / 1 in_progress / 24 review rows are FLAT-lane objects, not sprint-nested

#### dev-team-loop-I10 · MEDIUM — Lock-contract drift: execute-tier.md and drain-esc-dispatch.md task_claim/task_release omit owner_client_session, which main.md marks REQUIRED (P1-FINAL)

Institutional memory records two live failure modes for exactly this omission: owner_session server-scoping defeating the mutex (feedback_tasklock_owner_session_server_scoped_defeats_mutex) and release-with-mismatched-owner orphaning the lock (feedback_task_release_owner_agent_mismatch_orphans_lock). Every claim/release in the tier-batch hot path (the highest-frequency lock site in the loop) and in ESC-DISPATCH still uses the pre-P1-FINAL shape — copy-paste drift between sibling flow files of the same dispatcher.

*Evidence*: docs/agents/dev-team/flow/execute-tier.md:42-48 claim args = {task_id, task_kind, owner_agent, ttl_seconds, payload} — no owner_client_session — and :64 "task_release, arguments={ task_id: \"task:\" + task_id }"; drain-esc-dispatch.md:46-52 spawn_claim likewise; contrast main.md:154 "owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)"

#### dev-team-loop-I11 · MEDIUM — pm closeout has no head-idle step — the prescribed root fix (head transform in the SAME orch-apply call as the sprint move) was never added to pm/flow/main.md

Confirmed live failure: pm committed the sprint→closed move but the head-idle write was lost while pm self-reported success (commit dff7ee9e), leaving head in_progress → dispatcher re-spawn risk. The router currently RAW-verifies and repairs after every pm closeout — recurring router cost standing in for a missing one-line flow fix. Same defect family as the (now-fixed) ops Close Gate Step-4 desync, which was solved with an atomic jq script (scripts/ops-closegate-handoff.jq) — the pm side never got the equivalent.

*Evidence*: docs/agents/pm/flow/main.md contains no `.head` write anywhere (only a head-status READ in the Signal Queue Write Guard, main.md:144 "head_status=$(jq -r '.head.status' ...)"); memory feedback_pm_closeout_leaves_head_non_idle: "patch docs/agents/pm/flow/main.md closeout so the head-idle transform is applied + verified in the SAME orch-apply call as the sprint move, not a separate lost write"

#### dev-team-loop-I12 · MEDIUM — sprint-signoff.md writes non-canonical lowercase `.sprint_goal.entries[].status = "done"` which the eviction predicate cannot match

po/main.md:200 fixed exactly this class for active_sprints ("Do NOT write ad-hoc tokens ... will strand the sprint in active_sprints[] indefinitely") but the sibling instruction for sprint_goal entries in sprint-signoff.md still says lowercase "done". Either orch-validate Stage 1d rejects the write (PO signoff aborts, confusing the agent) or, if sprint_goal tokens aren't 1d-covered, the entry strands un-evictable — both bad. Same file also says "update .task_board tasks to DONE" with no lane-move, which Stage 1b will now reject (see I8).

*Evidence*: docs/agents/po/flow/sprint-signoff.md:18 "update ... `.sprint_goal.entries[].status = \"done\"`" vs docs/agents/dev-team/flow/post-cycle.md:54-56 "select(.sprint_id != null and ((.status // \"\") | IN(\"DONE\",\"DONE_VERIFIED\",\"CANCELLED\",\"DEFERRED\",\"SKIPPED\")))"

#### dev-team-loop-I14 · MEDIUM — Session Gate predicate '.task_board empty' is dead code — with 313 backlog rows it can never fire, so PO triage is spawned every single tick

Between the dead Session Gate (board is never empty) and the dead RUN-IDLE (I3), there is no reachable cheap-exit for a tick with zero NEW inputs: every tick falls through to Step 1 and spawns PO (which loads the 69.5KB main.md — I5 — plus sub-flows and channel audit). The idle-loop cost the RUN-IDLE branch was designed to eliminate is still being paid ~48x/day; "idle" should mean "nothing actionable this tick", not "board empty".

*Evidence*: docs/agents/dev-team/flow/main.md:526 "Session Gate: `docs/data/orch/orch-state.json` `.task_board` empty AND no Telegram reports AND `pendingSignals` empty → ... JUMP TO `end`"; live jq: backlog=313, active_sprints=6

#### dev-team-loop-I16 · MEDIUM — Pick-time pre-verify for BOUNDED-1 (5x-confirmed stale-pick recurrence) is still router-memory-only — not in the flow

5 confirmed stale picks (2 pre-sweep, 3 chained in one tick, 1 POST-sweep on 07-11 proving regeneration). The mitigation (cheap grep + git log --grep + optional recon dispatch, close via scripts/devteam-close-task-done-verified.jq) is proven and scripted but lives only in memory + ad-hoc dispatch briefs. Any session without that memory context re-pays a ~55k-token no-change worker per stale pick. The 3-closes-per-tick stop rule is also codified nowhere.

*Evidence*: docs/agents/dev-team/flow/main.md:500-516 BOUNDED-1 block runs promote→claim→"JUMP TO execute" with no verification step; memory project_bounded1_first_pickup_stale_backlog_hygiene_debt: "staleness regenerates continuously ... pick-time pre-verify is a standing invariant, not debt that a one-time sweep retires" and "Flow-improvement candidate (PLAN-ONLY, not welded inline): fold this router pre-verify-before-spawn into the BOUNDED-1 step of docs/agents/dev-team/flow/main.md"

#### dev-team-loop-I13 · LOW — ci_red signals are routed one tick late, and main.md's description contradicts the probe spec

A ci_red emitted at Step 0a.5 sits on disk until the NEXT tick's Step 0a drain (30-60 min latency on a red-main condition that blocks every ci_green-gated task). main.md:429's note "pendingSignals[] is unchanged if CI is GREEN" implies it IS appended on RED, which no spec or script does — the flow misdescribes its own dataflow.

*Evidence*: docs/agents/dev-team/flow/main.md:426-428 "Step 0a.5 — CI Health Probe ... On RED HEAD: emits `ci_red` signal to `docs/signals/` (routed to PO in Step 1)" — but Step 0a (drain) has already run before 0a.5, and ci-health-probe.md:112 only writes "SIGNAL_FILE = docs/signals/ci-red-...json" (never appends to pendingSignals[])

#### dev-team-loop-I15 · LOW — Size-justification comments are multi-KB changelogs re-read every tick (dev-team main.md line 1 alone = 3.1KB)

These comments are change-history (already in git log), not justification. Across the 6 dev-team flow files plus pm/po/qa they add roughly 1.5-2k tokens to every dispatcher tick and every specialist spawn, and they drift (po/main.md claims 229L, file is 274L), so they don't even serve their stated size-audit purpose.

*Evidence*: head -1 docs/agents/dev-team/flow/main.md | wc -c = 3162; main.md:1 "size-justification: 681L — thin orchestration dispatcher; JUMP-TO table + Steps 0a ... (+29L, Reusable Scripts entry included)" (single comment enumerating ~20 historical change deltas); similar blocks at drain-signals.md:1, drain-esc-dispatch.md:1-9, ci-health-probe.md:1, qa/main.md:1, po/main.md:1

#### dev-team-loop-I17 · LOW — Signal routing table duplicated between drain-signals.md 0a-3 and po/triage-signals.md — dual-maintenance drift risk the flow itself admits

Two tables for the same routing decision, already divergent in coverage (drain table lacks news_impact/zone_health_report/implementation_complete/improvement_proposal rows; po table lacks esc-deep-dive-request). Only the esc-deep-dive-request row is load-bearing on the dev-team side (it branches to ESC-DISPATCH before PO). Everything else is dead weight that must be kept in sync by hand — the copy-paste-boilerplate class the standing invariants forbid.

*Evidence*: docs/agents/dev-team/flow/drain-signals.md:113-124 (8-row routing table) followed by :129 "routing annotation is informational only; PO's `triage-signals.md` is the authoritative dispatch handler"; docs/agents/po/flow/triage-signals.md:9-20 (the authoritative 10-row table)

#### dev-team-loop-I18 · LOW — task_board.qa[] lane exists in schema and live file but no flow reads or writes it — dead lane

QA-bound work actually parks in review[] with next_agent=qa (9 live rows). A schema lane with no producer/consumer invites a future writer to use it and strand rows invisibly (nothing sweeps qa[] either). Either wire it as the real QA queue or remove it from the schema.

*Evidence*: jq '.task_board | keys' includes "qa" (live count 0); grep -rn "task_board.qa" across docs/agents/{dev-team,pm,po,qa}/flow/ returns zero hits (only a lane-enumeration comment in scripts/devteam-backlog-promote-bounded1.jq:86)

### Proposals

#### dev-team-loop-P2 · impact=high effort=M · **CONFIRMED** — Move terminal-bloat eviction into the deterministic tick-preflight script so it runs on EVERY tick regardless of exit path

*Addresses*: dev-team-loop-I2, dev-team-loop-I3

**Change**: Extend scripts/agents-flow/dev-team-tick-preflight.sh with a Step 5.5 'board-hygiene' (deterministic bash+jq, zero LLM tokens): compute DONE_N/DV_N/TERMINAL_SPRINT_N exactly as post-cycle.md:45-60 does; if any threshold trips, claim commit-mutex, run scripts/orch-cold-evict.sh + scripts/orch-state-validate.sh, commit explicit paths, release — i.e., relocate post-cycle.md Step 4.2 verbatim into the script and demote the flow-file block to a spec pointer ('CANON-SCRIPT: runs in tick-preflight Step 5.5; this section is the SSOT spec'). Both writes remain orch-apply/cold-evict gated (ALLOW_SHRINK named bypass already wired).

*Files*: scripts/agents-flow/dev-team-tick-preflight.sh, docs/agents/dev-team/flow/post-cycle.md

*Risk*: Eviction now races other agents' orch-state writes at tick start — mitigated by the existing commit-mutex claim + orch-apply CAS retry semantics; keep the pm/task-archive path unchanged as the second legitimate caller.

*Verifier*: All cited evidence verified against source: main.md:526 (Session Gate → JUMP TO end), :407 (adoption → JUMP TO end), :651-654 (post-cycle only reachable via Step 4 dispatcher), :101 (RUN-IDLE requires active_sprints empty), post-cycle.md:61 threshold — all exact. Live board confirms the invariant violation is real and WORSE than cited after 2 days of drift: done=18 (>10 threshold), done_verified=22 (HSC-6 says ≤5 once backstop active — violated 4x, proving Step 4.2 never fires), 6 ACTIVE sprints straggler-held (33/35, 19/20, 8/9, 5/6 match) so tick-preflight.sh:274-277 active_sprints==0 check structurally never passes → RUN-IDLE dead as claimed. NOT already implemented or queued: preflight script has zero evict/hygiene logic; closest backlog rows (TE-T15 = supervised one-time drain + new predicates, FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE = close terminal sprints, FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND = backlog-lane blind spot) all address WHAT to evict, none relocates the TRIGGER to a deterministic every-tick site. Invariants clean: writes stay orch-cold-evict.sh→orch-apply.sh with named ORCH_APPLY_ALLOW_SHRINK bypass (verified wired at orch-cold-evict.sh:657), commit-mutex + explicit-path git add preserved verbatim, script in scripts/. Two non-blocking implementation notes for the dev agent: (1) 'EVERY tick' must mean every LOCK-WINNING tick — Step 5.5 placement after Step 5 already encodes this; it must not run on SKIP (peer holds SF-1) or ERROR (lock state undefined) verdicts; (2) the change fully fixes issue 1 (unreachable backstop) but only partially revives RUN-IDLE — cold-evict cannot close straggler-held ACTIVE sprints (that half is FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE's scope); issue 1 alone justifies the change.

#### dev-team-loop-P3 · impact=high effort=M · **CONFIRMED** — Implement the wrapper/straggler autoclose sweep (ships backlog row FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP)

*Addresses*: dev-team-loop-I7, dev-team-loop-I3

**Change**: New scripts/devteam-wrapper-autoclose.jq (orch-apply-gated, no hardcoded ids): (a) select ready[]/in_progress[]/backlog[] rows whose effective children[] (inline OR backlog-detail.json items[<id>].children, same precedence as the shipped epic-wrapper gate) ALL resolve to TERMINAL_SET status in any lane → move row to review[] with next_agent=pm + status_note='children-all-terminal: pm closeout'; (b) emit (to stdout report, no mutation) the list of ACTIVE sprints whose non-terminal task count ≤2, for PO triage context. Invoke it in main.md Step 0b head-idle fall-through, one line BEFORE the BOUNDED-1 block (same jq|orch-apply idiom). Sprint stragglers surfaced by (b) feed Step 1 PO triage so sprints can actually close → un-deadens RUN-IDLE.

*Files*: scripts/devteam-wrapper-autoclose.jq, docs/agents/dev-team/flow/main.md

*Risk*: A wrapper deliberately held open (future-gate hold_reason) could be swept — guard: skip rows carrying hold_reason/depends non-empty, mirroring the DEPENDS-ON gate's conservative-skip.

*Verifier*: All cited evidence verified against live files: main.md:518 epic-wrapper NEVER-auto-promoted quote verbatim (gate is promote-time only, no closeout path exists anywhere in the flow); main.md:104 RUN-IDLE requires active_sprints ALL empty verbatim; FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP live at orch-state.json:5553 status BACKLOG; memory feedback_epic_wrapper_closeout_gap_no_auto_revisit quote near-verbatim; live jq confirms 6 ACTIVE sprints held by stragglers (BCTC-ANALYTICS-LAYER 35/2 non-terminal, VN-MACRO-TOOLING 20/1, BCTC-REFINE-STALL-RETRIGGER 9/1, SSOT-INTEGRITY-PERIMETER 6/1) so RUN-IDLE is genuinely dead. Not already implemented: scripts/devteam-wrapper-autoclose.jq absent; scripts/router-mint-fix-devteam-epic-wrapper-autoclose-sweep.jq only minted the backlog row; no sweep step in main.md; proposal IS the implementation of the queued row it names, not a duplicate. No invariant violations: orch-apply-gated, no hardcoded ids, script in scripts/, dev-team-executed, part (b) read-only; TERMINAL_SET is real SSOT (orchStateSchema.ts, mirrored by orch-cold-evict.sh); the referenced precedence resolves concretely to effective_children at devteam-backlog-promote-bounded1.jq:374 with shape-defensive .items ingest (line 484-492). Concrete: invocation point verified (head-idle fall-through main.md:492, BOUNDED-1 block :496). Implementer caveats (non-fatal): sync .status=REVIEW in the same write per status-flip=lane-move MUST (main.md:647); treat children found in NO lane (cold-evicted) as conservative-skip like the depends-on gate; review[] has no automated drain yet (28 rows, FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN still BACKLOG) so closure relies on PO/pm triage visibility — still strictly better than status quo since an orphaned wrapper in ready[] holds WIP>=1 and permanently suppresses BOUNDED-1 pickup.

#### dev-team-loop-P9 · impact=high effort=M · **RESCOPE** — Give pm an atomic closeout script (sprint-move + head-idle in ONE transform), mirroring the shipped ops Close Gate fix

*Addresses*: dev-team-loop-I11

**Change**: New scripts/pm-closeout-head-idle.jq (parameterized --arg sprint_id/--arg now): moves the sprint to closed (existing task-archive semantics for a single sprint) AND sets .head = {status:"idle", active_task_id:null, next_agent:null, updated_by:"pm", updated_at:$now} in the same expression, error()-loud if the sprint row is missing (never a silent no-op) — direct port of the scripts/ops-closegate-handoff.jq pattern the Close Gate fix proved out. Add a 'Sprint closeout' step to pm/flow/main.md § 5 Monitor: invoke via jq -f ... | orch-apply.sh, then self-verify jq '.head.status' == "idle" before RETURN — remove the router's standing post-pm RAW-verify burden.

*Files*: scripts/pm-closeout-head-idle.jq, docs/agents/pm/flow/main.md

*Risk*: Head may legitimately be parked on a DIFFERENT in-flight task at closeout — copy ops-closegate-handoff.jq's conditional guard (only reset head if head.active_task_id belongs to this sprint).

*Verifier*: Evidence verified: pm/flow/main.md has no .head write (only the read at line 144) and feedback_pm_closeout_leaves_head_non_idle prescribes exactly this root fix; nothing equivalent is shipped or queued (ops-closegate-handoff.jq covers only ops Step-4 handoff and explicitly scopes lane/status moves out). But the proposal as written has two defects: (1) its UNCONDITIONAL `.head = {status:idle,...}` violates the safety property of the very pattern it ports — ops-closegate-handoff.jq:61-65 guards the head sync on `.head.active_task_id == $task_id` because a blind overwrite "would stomp a correct, unrelated pointer"; the live orch-state right now (.head=in_progress on HPG-DISCOVER-CONSOLIDATED-PDF, owned by dev-mcp-server, with zero-relation to any pm sprint close) demonstrates the collision concretely. (2) "existing task-archive semantics for a single sprint" cannot be one jq|orch-apply transform: those semantics span two files (cold archive + hot stub) and need the ORCH_APPLY_ALLOW_SHRINK bypass that pm/flow/task-archive.md:67-71 restricts to 2 named call sites, forbidding copies without architect sign-off. Minor: full-object .head replace drops the next_action field.

*Rescope*: Give pm an atomic closeout script (sprint-terminal-flip + guarded head-idle in ONE hot-file transform), porting the ops Close Gate pattern faithfully. New scripts/pm-closeout-head-idle.jq (parameterized --arg sprint_id / --arg now, no hardcoded ids/lanes): in ONE jq expression run through ONE `bash scripts/orch-apply.sh` call: (a) locate the sprint in .task_board.active_sprints[] by $sprint_id — if absent, error("pm-closeout: sprint \($sprint_id) not found — refuse to write") (never a silent no-op, matching router-d1-claim.jq gate-guard convention); (b) set that sprint's status to a terminal value ("DONE") in place — do NOT move it to closed_sprints[] or the cold archive here; the existing task-archive sub-flow / orch-cold-evict.sh already evicts terminal active_sprints and owns the only sanctioned ORCH_APPLY_ALLOW_SHRINK call sites, so this transform conserves task_total and needs no bypass; (c) CONDITIONALLY idle the head in the same expression, mirroring ops-closegate-handoff.jq:61-65: only if `.head.active_task_id == null or (.head.active_task_id as $a | [$sprint tasks[].id] | index($a) != null)` (head belongs to this sprint or is unset) → set .head.status="idle", .head.active_task_id=null, .head.next_agent=null, .head.next_action=null, .head.updated_by="pm", .head.updated_at=$now (field-wise sets, not whole-object replace); if head points at a task OUTSIDE this sprint, leave .head untouched (an unrelated in-flight dispatch owns it). Add a 'Sprint closeout' step to docs/agents/pm/flow/main.md § 5 Monitor: invoke `jq --arg sprint_id ... --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" -f scripts/pm-closeout-head-idle.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`, then self-verify before RETURN: if head belonged to this sprint (or was null), assert `jq -r '.head.status'` == "idle"; else log `[pm] closeout: head owned by unrelated task <id> — left untouched` so dev-team's existing RAW-verify knows it was deliberate. FILES: scripts/pm-closeout-head-idle.jq, docs/agents/pm/flow/main.md.

#### dev-team-loop-P12 · impact=high effort=M · **UNVERIFIED** — Replace the dead Session Gate predicate with an actionable-input gate + throttled PO full-audit

*Addresses*: dev-team-loop-I14, dev-team-loop-I5

**Change**: main.md:526 — change the predicate from '.task_board empty AND no Telegram reports AND pendingSignals empty' to 'pendingSignals[] empty AND read_telegram_reports(status="new")==0 AND list_unresolved_reports() non-monitoring==0 AND no head-idle pickup fired this tick (wrapper-autoclose/review-pickup/BOUNDED-1 all no-op)'. Add a PO-audit cadence guard to Step 1: full channel-audit PO spawn at most every 4th tick (persist last-audit tick in .head.note or a preflight-script counter file); intermediate ticks with zero new inputs take the Session Gate exit.

*Files*: docs/agents/dev-team/flow/main.md, scripts/agents-flow/dev-team-tick-preflight.sh

*Risk*: PO self-initiated sprints from channel-audit findings surface up to ~2h later — acceptable given the 30-min tick cadence and that genuinely new inputs (signals/reports) still trigger immediate spawn.

#### dev-team-loop-P11 · impact=high effort=S · **UNVERIFIED** — Weld pick-time pre-verify into the BOUNDED-1 step (standing invariant from 5x recurrence)

*Addresses*: dev-team-loop-I16

**Change**: In main.md § Idle-capacity backlog pickup, insert a PRE-VERIFY sub-step between the promote and claim script invocations: '(1) peek promoted candidate id; (2) cheap staleness probe: git log --oneline --grep="<id>" -5 + grep of the row's target symbol/file (from backlog-detail files_hint) + for infra-incident rows one live gateway probe; (3) provably stale → close via scripts/devteam-close-task-done-verified.jq (jq|orch-apply, head untouched), continue to next candidate; (4) HARD STOP after 3 closes in one tick → mint/verify a verify-prune sweep row instead of continuing (per memory escalation rule); (5) ambiguous → proceed to claim (worker does full verify).' This codifies the exact mitigation already proven live (commits e953758d7, 70d5d8233 chain, pm 07cd7d848).

*Files*: docs/agents/dev-team/flow/main.md

*Risk*: False-stale close on title-similarity — mitigated by requiring symbol/file-level evidence, never title match alone (explicit in the memory: 'do NOT blind-batch on title match').

#### dev-team-loop-P16 · impact=high effort=S · **UNVERIFIED** — Stop orphan adoption from dropping co-drained signals

*Addresses*: dev-team-loop-I1

**Change**: main.md:407 — replace 'JUMP TO end   # adopted task queued; do not process further signals in this tick' with 'JUMP TO ci-health-probe   # adopted worker runs in background (BGFAN-1); continue the tick so pendingSignals[] still reaches Step 1'. Adoption processes at most one orphan per tick (loop break stays), the spawned agent is backgrounded, and the S3 triage-key dedup already prevents PO double-spawn — nothing else in the tick conflicts with the adoption.

*Files*: docs/agents/dev-team/flow/main.md

*Risk*: Slightly longer tick when an adoption fires; SF-1 TTL 5400s + Step 3 heartbeat already cover long ticks.

#### dev-team-loop-P5 · impact=medium effort=S · **UNVERIFIED** — Fix 0a-D-PRUNE drift: replace the inline archive[] procedure with the HSC-7 skill pointer

*Addresses*: dev-team-loop-I6

**Change**: In drain-signals.md, delete lines 58-68 (the 5-step inline prune writing to .signal_queue.archive[] with 48h criteria) and replace with: 'After all NEW rows are marked READ → run PRUNE per .claude/skills/signal-dashboard/SKILL.md § PRUNE (scripts/orch-cold-evict.sh — inline archive[] lane is REMOVED, HSC-7; 24h criteria). Then commit: git add docs/data/orch/orch-state.json; git commit -m "chore(signals): drain + prune {ts}".' One source of truth, no procedure copy.

*Files*: docs/agents/dev-team/flow/drain-signals.md

*Risk*: None material — the skill + script are already shipped and the script is the only writer that clears archive[].

#### dev-team-loop-P7 · impact=medium effort=S · **UNVERIFIED** — Make WF-1 BLOCKED guard and adoption board-flip scan ALL lanes, not just active_sprints

*Addresses*: dev-team-loop-I9

**Change**: main.md:454 — replace jq path with an all-lanes union: '[.task_board | to_entries[] | select(.value|type=="array") | .value[]? | select(type=="object")] + [.task_board.active_sprints[].tasks[]?] | .[] | select(.id == $tid or .task_id == $tid) | .status' (pattern already proven in drain-esc-dispatch.md:79-92 GATE-B Tier 1). main.md:383-388 — same union for the adoption assigned_to/adopted_at flip, and add a post-write check: if jq reports 0 rows updated → log '[dev-team] WARN adoption board-flip no-op for {id}' instead of silent success.

*Files*: docs/agents/dev-team/flow/main.md

*Risk*: None — read-side widening; write stays orch-apply-gated.

#### dev-team-loop-P8 · impact=medium effort=S · **UNVERIFIED** — Harmonize lock calls to the P1-FINAL contract in execute-tier.md and drain-esc-dispatch.md

*Addresses*: dev-team-loop-I10

**Change**: Add 'owner_client_session: $CLAUDE_CODE_SESSION_ID   // REQUIRED — P1-FINAL (TASK_1980)' to: execute-tier.md:42-48 tier-batch task_claim and :64 finally task_release; drain-esc-dispatch.md:46-52 spawn_claim, :116-117 TERMINAL-EXIT releases, :136 finally release, :140 guard_key release. Six mechanical arg additions matching main.md's shape exactly.

*Files*: docs/agents/dev-team/flow/execute-tier.md, docs/agents/dev-team/flow/drain-esc-dispatch.md

*Risk*: None — additive arg the server already requires/uses; omission is the known-bad state.

#### dev-team-loop-P10 · impact=medium effort=S · **UNVERIFIED** — Canonicalize sprint-signoff status tokens

*Addresses*: dev-team-loop-I12

**Change**: po/sprint-signoff.md:18 — replace '.sprint_goal.entries[].status = "done"' with '"DONE"' plus the same canonical-token warning box po/main.md:200 already carries for active_sprints (pointer to TERMINAL_SET, orchStateSchema.ts). Same edit for the Approve path's task flip ('tasks to DONE' → 'tasks to DONE + lane-move to done[], same transform' — overlaps P6 item 3).

*Files*: docs/agents/po/flow/sprint-signoff.md

*Risk*: None.

#### dev-team-loop-P13 · impact=medium effort=S · **UNVERIFIED** — Prune size-justification changelog comments to one line each

*Addresses*: dev-team-loop-I15

**Change**: In dev-team flow files (main.md:1, drain-signals.md:1, drain-esc-dispatch.md:1-9, ci-health-probe.md:1) + pm/main.md:1, po/main.md:1, qa/main.md:1: reduce each size-justification comment to '<!-- size-justification: NNNL — <one clause why> -->' and delete the per-change delta history (it lives in git log). Correct the stale line counts while there (po claims 229L at 274L).

*Files*: docs/agents/dev-team/flow/main.md, docs/agents/dev-team/flow/drain-signals.md, docs/agents/dev-team/flow/drain-esc-dispatch.md, docs/agents/dev-team/flow/ci-health-probe.md, docs/agents/pm/flow/main.md, docs/agents/po/flow/main.md, docs/agents/qa/flow/main.md

*Risk*: Loses at-a-glance change archaeology — negligible, git blame covers it.

#### dev-team-loop-P15 · impact=medium effort=S · **UNVERIFIED** — Route ci_red same-tick: probe appends its emitted signal to pendingSignals[]

*Addresses*: dev-team-loop-I13

**Change**: ci-health-probe.md Step CI-3: after writing SIGNAL_FILE, add 'Append the signal object to pendingSignals[] with source="file" (the file write remains the durable record; the fingerprint is already in signals_processed so next tick's drain replay-skips it — no double-route).' Fix main.md:428-429 note to match ('signal appended to pendingSignals[] this tick'). Update scripts/agents-flow/ci-health-probe.js to print the signal JSON on stdout for the dispatcher to consume.

*Files*: docs/agents/dev-team/flow/ci-health-probe.md, docs/agents/dev-team/flow/main.md, scripts/agents-flow/ci-health-probe.js

*Risk*: Probe-level dedup (Layer 1) already prevents duplicate emission; replay-skip semantics must be verified once against drain-signals.js.

#### dev-team-loop-P17 · impact=medium effort=S · **UNVERIFIED** — Wire the Close Gate Step-4/4b commit-gate invariant into ops's own bootstrap files (closes the qa-S38 residual gap)

*Addresses*: dev-team-loop-I11

**Change**: Add a pointer line in docs/agents/ops/handlers.md (and ops flow/docker.md if present): 'Close Gate Step 4 board+head handoff: MANDATORY scripts/ops-closegate-handoff.jq via orch-apply.sh — NEVER inline jq; step is non-complete until ops's own commit SHA is in the RETURN block → docs/protocols/docker-deployment-runbook.md § Step 4/4b Commit-Gate Invariant.' qa-S38 flagged that the shipped invariant is doc-only with zero pointers from ops's bootstrapped files — a 3rd head-desync occurrence would come from exactly this gap.

*Files*: docs/agents/ops/handlers.md

*Risk*: None — pointer-only edit, SSOT stays in the runbook.

#### dev-team-loop-P14 · impact=low effort=S · **UNVERIFIED** — De-duplicate the signal routing table: dev-team keeps only its load-bearing rows

*Addresses*: dev-team-loop-I17

**Change**: drain-signals.md 0a-3: shrink the 8-row table to the two rows dev-team itself acts on (esc-deep-dive-request → ESC-DISPATCH; ci_red → note one-tick latency) plus a single catch-all line: 'ALL signals append to pendingSignals[]; authoritative per-type routing = docs/agents/po/flow/triage-signals.md'. Add the missing esc-deep-dive-request row to po/triage-signals.md as 'handled upstream by dev-team ESC-DISPATCH — if seen here, dev-team handler was skipped: log + WORK alert'.

*Files*: docs/agents/dev-team/flow/drain-signals.md, docs/agents/po/flow/triage-signals.md

*Risk*: None — 0a-3 already declares itself non-authoritative.

#### dev-team-loop-P18 · impact=low effort=S · **UNVERIFIED** — Resolve the dead qa[] lane: remove it or declare it

*Addresses*: dev-team-loop-I18

**Change**: Preferred (matches live usage): remove 'qa' from the task_board lane set in apps/mcp-server/src/infrastructure/orchStateSchema.ts + drop the empty key from the hot file via one orch-apply write, updating the lane comment in scripts/devteam-backlog-promote-bounded1.jq:86. Alternative if removal is schema-risky: add a one-line note to docs/standards/orch-state-access.md that qa[] is RESERVED-UNUSED and review[] + next_agent=qa is the QA queue — so no writer ever adopts it.

*Files*: apps/mcp-server/src/infrastructure/orchStateSchema.ts, docs/standards/orch-state-access.md, scripts/devteam-backlog-promote-bounded1.jq

*Risk*: Schema change ripples to Zod tests; the doc-only alternative is zero-risk.


## Domain: cowork-dispatcher-cron

### Issues

#### cowork-dispatcher-cron-I1 · HIGH — Adaptive cadence layer permanently dark: calendar_status is circularly sourced and never computed

*Evidence*: apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts:387 "calendar_status: args.calendar_status ?? \"unknown\"" — server never computes it despite having vnTradingCalendar.ts (getSessionStatus). Callers only recycle the previous file value: scripts/agents-flow/cowork-tick-preflight.sh:79 "calendar_status=$(jq -r '.calendar_status // empty' \"$PRESSURE_STATE_PATH\""; docs/agents/cowork-team/flow/pressure-read.md:65 "CALENDAR_STATUS = PRESSURE_STATE.calendar_status"; telemetry.md:15 '"calendar_status": "<CALENDAR_STATUS from Step 4.3>"'. Live proof: docs/data/pressure-state.json:7 '"calendar_status": "unknown"' emitted 2026-07-11 (a Saturday — should be "weekend"). Compounded by isStale Gate-1: stale_warning=true alone forces legacy every off-hours tick (memory reference_isstale_stale_warning_forces_legacy). Net effect: Step 4.3 calendar suppression, weekend 480-min gatherer cadence, and chef-intraday holiday-null rows never engage — full-rate token burn on closed-market ticks.

#### cowork-dispatcher-cron-I2 · HIGH — Guaranteed-slot launchd firer folds matcher stderr into the JSON parse buffer — same bug class already fixed in preflight

*Evidence*: scripts/agents-flow/cowork-guaranteed-slot-firer.sh:183 "raw=$(eval \"$SLOT_MATCHER_CMD\" 2>&1); matcher_rc=$?" — cowork-match-slots.js writes diagnostics to stderr in adaptive mode (cowork-match-slots.js:203 "console.error('[cowork-match-slots] cadence suppress:'" and :228 "console.error('[cowork-match-slots] cadence skip:'"). Any diagnostic tick corrupts the jq parse and the firer aborts ("ERROR: slot matcher returned non-JSON output") — a guaranteed slot due on that tick is silently missed. The identical defect was already fixed in cowork-tick-preflight.sh:204-207 ("stdout ... and stderr ... are captured separately — folding stderr into the parsed buffer (old: `2>&1`) let an in-tick cadence-skip diagnostic corrupt the jq parse ... FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION") but never propagated to the firer.

#### cowork-dispatcher-cron-I4 · HIGH — No fan-out concurrency cap despite confirmed host starvation (load 205)

*Evidence*: docs/agents/cowork-team/flow/spawn-fanout.md:114 "Fire **all** WON_SLOTS simultaneously in a single Agent tool message block. No sequential gating." Memory feedback_overparallel_fanout_host_starvation (2026-06-15): "Host (16GB Mac) hit load average 205 with 32 claude processes ... CPU starvation made call_tool/emit_pressure_state time out" causing FALSE gateway-down escalations. pressure-state.json carries host_headroom_mb (live value 3101) but no flow step consumes it as a spawn gate.

#### cowork-dispatcher-cron-I5 · HIGH — Restart re-arm is operator-dependent: cowork master cron has no self-arm (dev-team's does), and non-guaranteed slots have zero session-independent backstop

*Evidence*: .claude/skills/cron-cowork-team/SKILL.md:53 prompt is bare "run docs/agents/cowork-team/flow/main.md" — contrast .claude/skills/cron-detect-loop/SKILL.md:90 dev-team Job 1 prompt "Self-arm FIRST (idempotent): read and execute .claude/skills/cron-detect-loop/SKILL.md (re-registers this session's own crons)". No SessionStart hook exists in .claude/settings.json (only a PreToolUse graphify hook). The launchd firer covers guaranteed:true slots only (cowork-guaranteed-slot-firer.sh:28-30 "Filters the returned slots[] to guaranteed===true (deliberately excludes sub-hourly market/offhours slots)"), so after CLI exit all non-guaranteed slots (gatherers, alert-commander, bctc, refine) are dead until a human types /cron-cowork-team — the 73h outage class (plist header: "Re-verified live 2026-07-07 (~73h outage)"). Schedule confirms: news-scout-sentiment last_fired 2026-07-03, alert-commander-market 2026-05-25.

#### cowork-dispatcher-cron-I3 · MEDIUM — Legacy matcher has no last_fired dedup and re-entrant election re-runs the full dispatch — double-spawn window; slot-claim R3 rationale is contradicted by immediate release

*Evidence*: scripts/agents-flow/cowork-match-slots.js:134-145 legacy branch returns cron-matched slots without any last_fired filter (memory feedback_cowork_matcher_legacy_no_lastfired_dedup: "returns last_fired in output but NEVER filters on it"). leader-lock.md:92-98 "Re-entrant: this session already holds the tick key ... renewing + proceeding" re-runs the entire dispatch body; per-slot tokens were already released seconds after spawn (spawn-fanout.md:136 "After each spawn attempt (success OR failure) — release per-work-item token immediately"), so the re-run re-claims and re-spawns the same slots. slot-claim.md:11-12 claims the opposite: "Suffix-free key (slot_id only) means the lock persists across ticks for as long as the job runs + renews" — it does not; only the published marker stops a duplicate POST, nothing stops the duplicate agent RUN (token cost).

#### cowork-dispatcher-cron-I6 · MEDIUM — Per-tick cycle-snapshot files are litter (80 files back to Jun 3) and the HH:MM filename causes consumer cache misses

*Evidence*: docs/agents/cowork-team/flow/tick-snapshot.md:10 "File is ephemeral (overwritten each tick). Not git-committed (.gitignore)." — false: filename embeds fire-minute (tick-snapshot.md:40 "SNAPSHOT_FILE=\"docs/data/cycle-snapshot-${FILE_TICK}.json\""), so each drift-minute mints a new file; 80 files exist (ls count), oldest stat "Jun 3 02:04:16 2026 docs/data/cycle-snapshot-00:00.json", ~600K, nothing prunes them. Consumer computes its OWN minute at spawn time (.claude/skills/step-0-cowork/SKILL.md:38-39 "TICK = current UTC time as HH:MM ... SNAPSHOT_PATH = docs/data/cycle-snapshot-<HH:MM>.json") — any spawn landing a minute after the write misses the cache and falls back to a full get_cycle_bootstrap MCP call, defeating the L-6 optimization.

#### cowork-dispatcher-cron-I7 · MEDIUM — Fallback path drains signal_queue (NEW→READ) BEFORE the leader election — a losing session strands rows READ-but-never-routed

*Evidence*: docs/agents/cowork-team/flow/main.md:31-32 JUMP-TO order: "| 0a | Drain signal_queue | inline below |" then "| 0b | Session-presence self-register + Fire-time election". Step 0a text (main.md:105-106): "route to matching agent slot at Step 5 ... Mark each processed row NEW → READ (atomic write)" — but a session that loses the election at 0b.2 EXITs (leader-lock.md:102 "fire-election LOST ... EXIT") and never reaches Step 5, leaving rows flipped READ with no routing. The preflight script got this right (cowork-tick-preflight.sh:22 "R4: READ-ONLY count; drain stays in main.md" — drain only after WORK); the ERROR-fallback body preserves the buggy ordering.

#### cowork-dispatcher-cron-I8 · MEDIUM — spawn-fanout.md contradicts itself on weekly dedup keys — the exact vector of the week-key double-post class

*Evidence*: docs/agents/cowork-team/flow/spawn-fanout.md:66-67 mandates "key the mutex on periodKey (date-range \"YYYY-MM-DD/YYYY-MM-DD\"), NOT weekLabel. e.g. \"published:digest-sunday:2026-06-08/2026-06-14\" not \"published:digest-sunday:2026-W24\"" per shipped fix FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (isoWeek.ts buildWeeklyPublishMarkerKey). But spawn-fanout.md:107-108 still instructs the opposite: "Weekly slots ... digest-sunday and tnb-audit use ISO week as `work_date` (`YYYY-WW` format, e.g. `2026-W22`)". An agent reading the TTL-values paragraph regresses to the divergent-week-label key that caused the 2026-06-14 MARKET double-post (memory feedback_guaranteed_slot_week_key_double_post).

#### cowork-dispatcher-cron-I9 · MEDIUM — Stale RemoteTrigger references across skill/flow/command files contradict the STANDING no-RemoteTrigger policy and keep a dead backstop branch alive

*Evidence*: .claude/skills/cron-cowork-team/SKILL.md:106 "The 12 RemoteTriggers (registered in claude.ai, not CLI) are the session-independent backstop for guaranteed slots." and :21, :98 similar; .claude/commands/crons/cron-cowork-team.md "keep existing RemoteTriggers active until cowork-team AC-6 passes"; spawn-fanout.md:23 "# cloud RemoteTrigger will deliver the real post; skip local spawn" (Step 5.0 BACKSTOP_SLOTS branch). RemoteTrigger Layer A was retired 2026-07-07: cowork-schedule.json:13 "RemoteTrigger Layer A is retired per STANDING feedback_no_remote_trigger_all_local (2026-06-22) — the deletion lock is moot". Every slot has _superseded_by="cowork-dispatcher" so BACKSTOP_SLOTS is always empty — dead branch plus doc telling a blind session a backstop exists that doesn't. Also SKILL.md:105 "durable: true makes the cron persist across CLI process restarts" contradicts cron-detect-loop/SKILL.md:27-28 "crons evaporate on session exit regardless of durable flag (confirmed live)" and the harness ("durable: Has no effect").

#### cowork-dispatcher-cron-I10 · MEDIUM — Cadence/staleness logic exists in three engines (cadence-policy.js, matcher adaptive mode, LLM-narrated flow Steps 4.2-4.5b) — the flow re-applies what the script already computed on the same tick

*Evidence*: main.md:90-91 WORK continuation: "Continue unchanged at Steps 4.2-4.3 (pressure-read.md), 4.4-4.5b (pressure-cadence.md)" even though preflight Step 6 already ran cowork-match-slots.js which internally did isStale + evaluateCadence + snapToCronBoundary (cowork-match-slots.js:193 "const evalResult = evaluateCadence(sl.policy_id, calendar_status, ...)", :254-258 isStale mode selection). pressure-cadence.md:32 narrates the same call ("policy_result = evaluateCadence(slot.policy_id, CALENDAR_STATUS, signal_backlog_tier, volatility_tier, POLICY_OBJ)") for the LLM to re-execute. Two implementations of one gate = drift risk (violates the shared-boilerplate invariant) + per-tick token cost; the LLM-narrated copy is exactly the "spawner narrates instead of executing" failure class.

#### cowork-dispatcher-cron-I11 · MEDIUM — Step 4.3 blanket weekend/holiday suppression makes cadence-policy weekend rows unreachable dead config

*Evidence*: docs/data/cadence-policy.json:12 gatherer-standard weekend row "interval_minutes": 480 (fire every 8h on weekends) — but pressure-read.md:81-83 removes those slots first: "# All other non-guaranteed slots: suppress on holiday OR weekend / SUPPRESS_CALENDAR.add(slot.slot_id)" before Step 4.4 ever evaluates cadence. The weekend/holiday gatherer-standard policy rows can never fire through the flow path, while the script-only path (matcher adaptive mode, used by preflight/firer) WOULD honor 480-min weekend cadence — two engines disagree about weekend gatherer behavior.

#### cowork-dispatcher-cron-I12 · MEDIUM — 12-file flow decomposition is over-fragmented: two files are no-ops, three are ERROR-fallback-only, and a WORK tick still walks ~9 files

*Evidence*: pressure-emit.md:7 "**This step is a no-op.** Proceed immediately to Step 5." (10-line stub kept as a numbered step); slot-claim.md:80 "<!-- Step 4.6b is a NO-OP in P3. No action required here."; match-slots.md:5-6, leader-lock.md:4-7, blind-guard.md:2-7 all state they are "reached only on the preflight script's ERROR verdict (fallback)". main.md:90-93 still routes a WORK tick through pressure-read.md, pressure-cadence.md, slot-claim.md, tick-snapshot.md, pressure-emit.md, spawn-fanout.md, last-fired.md, telemetry.md — ~65KB of flow text for a dispatcher firing 96x/day.

#### cowork-dispatcher-cron-I14 · MEDIUM — Firer observability defects: every log line duplicated (double-fire indistinguishable from double-log), no last_fired writeback, and 1800s bound killed fb-weekend mid-run today

*Evidence*: docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log 2026-07-11: "[2026-07-11T13:29:48Z] --- guaranteed-slot-firer: slot=fb-weekend ---" appears twice per event (log() tee -a into the same file launchd also redirects stdout to); "[2026-07-11T13:59:48Z] flow exited (slot=fb-weekend exit_code=143)" — SIGTERM at exactly FIRE_TIMEOUT_SECONDS=1800 (firer.sh:95), flow killed possibly pre-publish. The firer never updates cowork-schedule.json last_fired (only dispatcher Step 5b does, last-fired.md:3), so backstop fires are invisible to cadence/telemetry.

#### cowork-dispatcher-cron-I13 · LOW — Telemetry signal files accumulate: 944 cowork-team-*.json tracked in git, no retention rule in telemetry.md

*Evidence*: `git ls-files docs/signals/ | grep -c cowork-team` = 944; 45 currently sitting unprocessed in docs/signals/ (e.g. docs/signals/cowork-team-20260710T041500Z.json et seq. — one per WORK tick). telemetry.md Step 6.1 (lines 26-34) writes `docs/signals/cowork-team-${ISO}.json` with no prune/archive step; git status shows manual bulk deletions of docs/signals/processed/* happening instead (churn).

#### cowork-dispatcher-cron-I15 · LOW — Anomaly needing verification: firer log shows fb-daily fired 07:09:44Z on Saturday 2026-07-11, outside its '15 9 * * 1-5' cron window

*Evidence*: docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log: "[2026-07-11T07:09:44Z] invoking (bounded 1800s): ... -p 'slot=fb-daily'" followed by the agent's own note "Since today is Saturday, it auto-routed to the weekly-recap sub-flow". cowork-schedule.json:404 fb-daily cron "15 9 * * 1-5" (Mon-Fri 09:15 UTC) cannot match 07:09 Saturday via cronMatches() (dow 1-5, hour 9). Either a manual/test invocation post-Docker-incident or a matcher/clock fault — cause unconfirmed, but a guaranteed-slot fire outside its window reached the publish pipeline.

#### cowork-dispatcher-cron-I16 · LOW — Cowork-addressed signal recipient list hardcoded in two places (violates no-hardcode invariant)

*Evidence*: main.md:104 "Find all cowork-addressed rows (`to` ∈ {po, tran-ngoc-bau, unified-agent, alert-commander})" and cowork-tick-preflight.sh:232 '["po","tran-ngoc-bau","unified-agent","alert-commander"] | index($t)' — the same structural agent list duplicated as literals in a flow doc and a script instead of being derived from docs/data/system-map.json or cowork-schedule.json; adding a cowork agent requires remembering both sites or its signals are silently never drained.

### Proposals

#### cowork-dispatcher-cron-P7 · impact=high effort=L · **RESCOPE** — Collapse the 12-file flow to ~7 files and push remaining per-tick logic into the deterministic script layer

*Addresses*: cowork-dispatcher-cron-I12, cowork-dispatcher-cron-I10, cowork-dispatcher-cron-I13, cowork-dispatcher-cron-I16

**Change**: Phase 1 (docs only): delete pressure-emit.md (fold its 3-line SUPERSEDED note into telemetry.md Step 6.0) and delete the retired Step 4.6b block from slot-claim.md; merge pressure-read.md + pressure-cadence.md into one pressure.md explicitly headed "FALLBACK + flow-only gates (4.5/4.5c)"; merge last-fired.md into spawn-fanout.md (it is the spawn epilogue). Update main.md JUMP-TO accordingly. Phase 2 (script): move Step 4.5 freshness-downgrade and Step 4.5c CHEF same-tick mutex into cowork-match-slots.js (both are pure functions of MATCHES + pressure-state + schedule; the CHEF mutex jq block in pressure-cadence.md:135-156 is already shell), and move Step 5b last_fired batch-write into a new scripts/agents-flow/cowork-tick-postflight.sh also handling the Step 4.7 snapshot assembly and a docs/signals/cowork-team-* retention sweep (>14 days → delete; addresses I13). While touching main.md Step 0a, replace the hardcoded recipient set at main.md:104 (and preflight:232) with a jq read from system-map.json (addresses I16). Result: WORK tick = preflight verdict + main.md + spawn-fanout.md + telemetry.md; everything else is fallback-only or scripted.

*Files*: docs/agents/cowork-team/flow/main.md, docs/agents/cowork-team/flow/pressure-read.md, docs/agents/cowork-team/flow/pressure-cadence.md, docs/agents/cowork-team/flow/pressure-emit.md, docs/agents/cowork-team/flow/slot-claim.md, docs/agents/cowork-team/flow/last-fired.md, docs/agents/cowork-team/flow/spawn-fanout.md, scripts/agents-flow/cowork-match-slots.js, scripts/agents-flow/cowork-tick-postflight.sh

*Risk*: Flow-file surgery must follow agent-md-factory discipline and keep the ERROR-fallback bodies verbatim-reachable; do Phase 1 first (pure doc consolidation, zero behavior change), Phase 2 behind the existing preflight test harness. Edit-tool multiline-strip harness bug: prefer Write-whole-file for merged docs.

*Verifier*: All cited evidence verified real (pressure-emit.md:7 no-op stub; slot-claim.md:80 retired 4.6b; main.md:90-93 routes WORK ticks through 8 sub-files; pressure-cadence.md:32 LLM re-narrates evaluateCadence that cowork-match-slots.js:193/:254-258 already ran the same tick; CHEF-mutex shell block at pressure-cadence.md:135-156; telemetry.md:26-34 writes signals with no retention — now 956 tracked, 45 unprocessed; recipient set hardcoded at main.md:104 + cowork-tick-preflight.sh:232 and also in dispatch/SKILL.md:102). Not already implemented or queued: TE-T03/TE-T13 touch only main.md with different scope; the queued PO row about quarantining malformed signals (dev-team-mint-po-batch-20260709-1337.jq:73) is not equivalent to the retention sweep. The script-move matches the ratified EMIT-DARK Option-C precedent (LLM dispatcher narrates fenced bash instead of executing — orch archive 2026-06 FU-PRESSURE-EMIT-DARK), and the ERROR-fallback path re-runs the same matcher script so a single engine covers both paths. HOWEVER the proposal as written has one implementation-breaking defect: system-map.json CANNOT derive the recipient set — po and tran-ngoc-bau are type:"dev-core" and select(.type=="cowork") returns 9 agents (7 extra, 2 missing); a dev implementing "jq read from system-map.json" naively would silently drop po and tran-ngoc-bau from the signal drain (breaks PO inbox). Secondary gaps: Phase-1-first ordering creates a transient 253L merged pressure.md (89+164L) breaching the ≤200L waterfall cap; the sweep must git-rm tracked files, not plain-delete; the last_fired move must carry the QA-verified guards from FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER; main.md collides with queued TE-T03/TE-T13.

*Rescope*: Collapse the 12-file cowork-team flow to ~7 files and push per-tick logic into the deterministic script layer — corrected sequencing and I16 fix. ORDER: run Phase 2 (script moves) BEFORE or in the same task as the pressure-file merge, so the merged doc lands under the 200L waterfall cap (pressure-read 89L + pressure-cadence 164L = 253L if merged first). Phase 2 (script): (a) move Step 4.5 freshness-downgrade and Step 4.5c CHEF same-tick mutex into scripts/agents-flow/cowork-match-slots.js (pure functions of MATCHES + pressure-state + cowork-schedule.json; mutex applies in BOTH adaptive and legacy modes at end of script; derive the gatherer-slot list from schedule fields, do not carry the GATHERER_SLOTS literal into the script); script's JSON output MUST add downgraded[], suppressed_cadence[], chef_mutex_applied, due_reasons{}, cadence_minutes{} so telemetry.md Step 6.1's payload contract is preserved; extend cowork-match-slots.test.js for both gates. ERROR-fallback stays correct automatically because match-slots.md Steps 1-3 invoke this same script. (b) new scripts/agents-flow/cowork-tick-postflight.sh: Step 5b last_fired batch-write (MUST preserve the QA-verified guards verbatim from last-fired.md / FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER: fresh-read immediately before write, update ONLY WON_SLOTS, monotonic forward-only per slot, atomic tmp→rename, non-fatal on failure) + Step 4.7 snapshot assembly + retention sweep of docs/signals/cowork-team-*.json older than 14 days via `git rm` with explicit pathspec (files are git-tracked; plain delete leaves a dirty tree) — coordinate with the queued PO backlog row (scripts/dev-team-mint-po-batch-20260709-1337.jq:73) that may redirect tick-report artifacts out of docs/signals/. Phase 1 (docs, after/with Phase 2): delete pressure-emit.md (fold its 3-line SUPERSEDED note into telemetry.md Step 6.0); delete the retired Step 4.6b block from slot-claim.md:70-82; merge pressure-read.md + pressure-cadence.md into pressure.md headed "FALLBACK ONLY — WORK path consumes preflight verdict; 4.5/4.5c live in cowork-match-slots.js" with the 4.5/4.5c bodies replaced by 2-line pointers to the script (keeping prose copies alive would recreate the dual-engine drift this proposal removes); merge last-fired.md into spawn-fanout.md as a stub pointing at cowork-tick-postflight.sh; update main.md JUMP-TO + § WORK continuation accordingly. I16 fix (corrected): system-map.json has NO derivation for {po, tran-ngoc-bau, unified-agent, alert-commander} — po and tran-ngoc-bau are type:"dev-core" and type=="cowork" selects 9 agents. FIRST add an SSOT field to docs/data/system-map.json (e.g. cowork_signal_recipient:true on those 4 .project.agents entries, or a .project.signal_routing.cowork_inbox_recipients array), THEN replace the literals at main.md:104 and cowork-tick-preflight.sh:232 with one shared jq expression, and update the prose copy at .claude/skills/dispatch/SKILL.md:102 to point at the field. NEVER derive from type=="cowork" (silently drops po + tran-ngoc-bau, breaks PO inbox drain). COORDINATION: main.md is also rewritten by queued TE-T03 (fallback-body split, unblocked since TE-T01 DONE_VERIFIED 07-13) and trimmed by TE-T13 (line-1 changelog purge) — sequence this after TE-T03 or merge into one main.md task to avoid a 3-way edit collision. Flow-file surgery under agent-md-factory discipline; prefer Write-whole-file over Edit (multiline-strip harness bug). End state unchanged from original: WORK tick = preflight verdict + main.md + spawn-fanout.md + telemetry.md; everything else fallback-only or scripted.

#### cowork-dispatcher-cron-P1 · impact=high effort=M · **RESCOPE** — Compute calendar_status server-side in emit_pressure_state (break the circular 'unknown')

*Addresses*: cowork-dispatcher-cron-I1, cowork-dispatcher-cron-I11

**Change**: In apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts:387, replace `calendar_status: args.calendar_status ?? "unknown"` with a call into the existing domain service apps/mcp-server/src/domain/services/vnTradingCalendar.ts (getSessionStatus for VN-now) whenever args.calendar_status is absent OR 'unknown' (caller-provided real values still win for testability). Then simplify scripts/agents-flow/cowork-tick-preflight.sh:78-86 to stop recycling the file value (pass nothing, let server compute) and update telemetry.md Step 6.0 arg comment. Optionally also decouple stale_warning from cycle-snapshot promotion refusal (emitPressureStateTool.ts `stale_warning: promoteResult.stale`) so off-hours ticks don't force legacy mode forever (memory reference_isstale_stale_warning_forces_legacy).

*Files*: apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts, scripts/agents-flow/cowork-tick-preflight.sh, docs/agents/cowork-team/flow/telemetry.md

*Risk*: mcp-server rebuild is user-gated (container swaps gated — feedback_container_swaps_user_gated); ship via ops with single-service rebuild. Activating adaptive mode changes live suppression behavior — verify one weekend tick before retiring legacy-mode reliance.

*Verifier*: Core defect verified real and unfixed: emitPressureStateTool.ts:387 exact quote confirmed; preflight (cowork-tick-preflight.sh:78-93), pressure-read.md:65, telemetry.md:15 all recycle the value circularly; no code path ever computes it; cadence-policy weekend rows confirmed unreachable via flow path (pressure-read.md:81-83 suppresses before Step 4.4); not already implemented (tool git log has no calendar work, no getSessionStatus exists anywhere) nor queued (orch-state calendar rows FIX-GAP-STALENESS-DETECTOR-CALENDAR-AWARE and FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE are different scopes); no standing-invariant violations. Live evidence has moved and STRENGTHENS the case: docs/data/pressure-state.json now contains out-of-enum "closed" (emitted 2026-07-13T15:37Z) — improvised by a live dispatcher because Step 4.3 never runs in legacy mode — which matches zero cadence-policy rows and bypasses the ["holiday","weekend"] suppression check. However three corrections are required before hand-off: (1) vnTradingCalendar.ts has NO getSessionStatus export — the real API is isVnTradingDay(getTodayVnDate()).session_status (exports verified: isVnTradingDay, getTodayVnDate, shiftDateDays, mostRecentTradingDayOnOrBefore); (2) "caller-provided real values win" must be enum-gated (zod arg is free z.string(); live "closed" proves callers pass garbage that would still win); (3) the stale_warning decoupling is NOT optional for the stated benefit — cowork-match-slots.js:256 gates adaptive mode on !isStale and cadence-policy.js isStale Gate-1 short-circuits on stale_warning alone (set on every off-hours emit per reference_isstale memory), so without decoupling BOTH engines stay legacy off-hours and weekend 480-min cadence / chef-intraday null suppression still never engage — the fix as written would ship without achieving its own stated net effect.

*Rescope*: Compute calendar_status server-side in emit_pressure_state and unblock the adaptive path end-to-end. (1) apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts: at ~line 387, compute calendar_status via the existing domain service apps/mcp-server/src/domain/services/vnTradingCalendar.ts — NOTE: no getSessionStatus export exists; use isVnTradingDay(getTodayVnDate()).session_status, which returns exactly the cadence enum open|half_day|holiday|weekend|unknown. Wire it as an injectable dep (deps.computeCalendarStatusFn) matching the tool's existing test-injection pattern. Precedence rule: use args.calendar_status ONLY if it is one of {open, half_day, holiday, weekend} (enum-gate; live proof of caller drift: pressure-state.json emitted 2026-07-13 contains out-of-enum "closed" which matches zero cadence-policy rows); if absent, "unknown", or out-of-enum, compute server-side. Optionally tighten the zod arg (line ~459) to z.enum([...]).optional(). (2) scripts/agents-flow/cowork-tick-preflight.sh lines 76-93: stop recycling .calendar_status from the file — omit the key from emit_args entirely; server computes. (3) docs/agents/cowork-team/flow/telemetry.md Step 6.0: DELETE the "calendar_status": "<CALENDAR_STATUS from Step 4.3>" argument line (Step 4.3 is skipped in legacy mode, so dispatchers improvise values like "closed"); note that the server computes it. (4) REQUIRED, not optional: decouple stale_warning from cycle-snapshot promotion refusal (emitPressureStateTool.ts:390 stale_warning: promoteResult.stale) — because cowork-match-slots.js:256 gates adaptive mode on !isStale and cadence-policy.js isStale Gate-1 returns stale on the flag alone (set every off-hours emit), the calendar fix alone leaves both engines in legacy off-hours and the weekend/holiday cadence rows still never engage. Either drop stale_warning from the 9-key pressure-state file (keep it in the tool RESULT payload only) or set it only when a promotion was expected during trading hours; update pressure-read.md AC-P1-6-3 and cadence-policy.js isStale accordingly, plus the reference_isstale memory note. (5) Follow-up (separate task, same epic): resolve the flow-vs-matcher weekend divergence in ONE SSOT — either remove pressure-read.md Step 4.3's blanket weekend/holiday suppression for policy-governed slots (let cadence-policy weekend rows govern, matching the matcher engine) or null out the cadence-policy weekend intervals — so the two engines agree on weekend gatherer behavior. Files: apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts, apps/mcp-server/src/__tests__/emit-pressure-state.test.ts, scripts/agents-flow/cowork-tick-preflight.sh, scripts/agents-flow/cadence-policy.js, docs/agents/cowork-team/flow/telemetry.md, docs/agents/cowork-team/flow/pressure-read.md.

#### cowork-dispatcher-cron-P2 · impact=high effort=S · **CONFIRMED** — Port the stderr-separation fix into cowork-guaranteed-slot-firer.sh

*Addresses*: cowork-dispatcher-cron-I2

**Change**: In scripts/agents-flow/cowork-guaranteed-slot-firer.sh:183 run_firer, replace `raw=$(eval "$SLOT_MATCHER_CMD" 2>&1)` with the exact pattern already shipped in cowork-tick-preflight.sh:209-216: capture stderr to a mktemp file, parse stdout only, surface stderr in the error log on non-zero exit. Add a test case to scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh injecting a matcher that emits a stderr diagnostic + valid stdout JSON, asserting the guaranteed slot still fires.

*Files*: scripts/agents-flow/cowork-guaranteed-slot-firer.sh, scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh

*Risk*: None — strictly widens the success path; test seam already exists (SLOT_MATCHER_CMD).

*Verifier*: All cited evidence verified verbatim: firer:183 uses `raw=$(eval "$SLOT_MATCHER_CMD" 2>&1)` feeding the jq parse at :189-193; preflight:202-216 ships the exact mktemp stderr-separation pattern (FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION); cowork-match-slots.js emits 'cadence suppress:'/'cadence skip:' via console.error; the firer's default SLOT_MATCHER_CMD is that same matcher. The bug is not merely theoretical — docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log contains 34 'slot matcher returned non-JSON output' errors, including 2026-07-13T08:54Z where a DUE guaranteed slot (chef-eod) was present in valid stdout JSON but dropped because a cadence-skip stderr diagnostic corrupted the parse buffer — a live production miss of exactly the class the proposal describes. No existing fix or queued board/backlog item covers the firer (FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION in archive/2026-07.json is preflight-only; firer source dated Jul 7 predates propagation). No standing invariant violated (scripts/ location, main branch, no orch-state/MCP surface, local-only). Proposal is concrete: exact file, line, donor pattern, and test case — dispatchable to a dev agent as-is. If a nicety is wanted, the copied 8-line pattern could later be factored into a shared sourced helper to prevent third-copy drift, but that is refinement, not a blocker.

#### cowork-dispatcher-cron-P3 · impact=high effort=S · **CONFIRMED** — Add last_fired boundary dedup to the matcher's legacy mode (one SSOT dedup for dispatcher, preflight, and firer)

*Addresses*: cowork-dispatcher-cron-I3

**Change**: In scripts/agents-flow/cowork-match-slots.js legacy branch (lines 134-145), before returning candidates, drop any slot where `snapToCronBoundary(now, sl.cron)` <= parsed(sl.last_fired) — i.e. the slot already fired within the current cron boundary (null/unparseable last_fired stays due, preserving EC-3 first-run semantics; sub-hourly */15 slots are unaffected because each tick is a new boundary). snapToCronBoundary already exists in the same file. Extend cowork-match-slots.test.js. This closes the re-entrant-election double-spawn window at the cheapest shared point and stops the launchd firer re-running a slot the live dispatcher just fired (both consume this matcher). Also correct the false rationale comment at slot-claim.md:11-12 ("lock persists across ticks") to state the truth: cross-tick dedup = last_fired + published marker.

*Files*: scripts/agents-flow/cowork-match-slots.js, scripts/agents-flow/cowork-match-slots.test.js, docs/agents/cowork-team/flow/slot-claim.md

*Risk*: Under-firing if last_fired is written but the spawned agent crashed pre-work — acceptable: last-fired.md already stamps only successful spawns, and the next boundary re-qualifies the slot. Do NOT reintroduce dedup-by-writing-last_fired as a lock substitute (known-rejected, memory feedback_cowork_matcher_legacy_no_lastfired_dedup).

*Verifier*: All cited evidence verified. (1) scripts/agents-flow/cowork-match-slots.js:134-146 legacy branch returns cron-matched slots without any last_fired filter; snapToCronBoundary exists at line 54 of the same file, and the adaptive path (lines 210-231) already establishes the exact EC-3 null-is-due precedent the proposal preserves. (2) docs/agents/cowork-team/flow/leader-lock.md:91-98 re-entrant election renews and proceeds to Step 0c (full dispatch re-run) while spawn-fanout.md:136 released per-slot tokens immediately after each spawn — so re-claims succeed and the same slots re-spawn; the double-spawn window is real. (3) The launchd firer (scripts/agents-flow/cowork-guaranteed-slot-firer.sh) invokes this same matcher (line 91) with no task-claim of its own — its own comments state it relies solely on the published-marker gate, which dedups the POST but not the agent RUN, confirming the shared-SSOT-dedup rationale. (4) slot-claim.md doc correction is warranted: the R3 rationale "lock persists across ticks for as long as the job runs + renews" (actually at lines 9-10, not 11-12 — trivial 2-line anchor drift, quote exists verbatim) is directly contradicted by lines 19-21 of the same file (release after each spawn attempt via try/finally, 180s TTL). NOT already implemented or queued: git log shows commit 2b67d3a71 added boundary-snapping only to the adaptive cadence path; board row FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY is a distinct, composable concern (delivery-proof vs dispatch bump; the proposed filter suppresses only within the current cron boundary so cross-boundary re-offer is untouched); memory feedback_cowork_matcher_legacy_no_lastfired_dedup documents the gap with a manual workaround whose "task_claim covers it" argument predates both the P3 re-entrant path and the lockless firer. No standing invariant violated — change lives in scripts/ with test extension, consolidates dedup at one shared point (SSOT-aligned), no orch-state/hardcode/direct-MCP/branch/RemoteTrigger implications. Predicate semantics check out: snapToCronBoundary returns its input unchanged for unsupported cron patterns (comma/range hour fields), making the drop condition (boundary <= last_fired) never falsely suppress, and */15 slots get a new boundary each tick as claimed. Two implementer notes, not blockers: (a) the fix narrows rather than fully closes the window — a crash between spawn (Step 5) and the last_fired write (Step 5b), or an early-jitter fire landing seconds before the boundary via the ±2min match window, still re-spawns; (b) flow-doc edit falls under agent-md-factory discipline and the known Edit-tool multiline-strip harness bug applies to slot-claim.md.

#### cowork-dispatcher-cron-P5 · impact=high effort=S · **RESCOPE** — Make re-arm self-healing: self-arm prefix on the cowork master cron + SessionStart hook injecting the re-arm instruction

*Addresses*: cowork-dispatcher-cron-I5

**Change**: (a) In .claude/skills/cron-cowork-team/SKILL.md Step 2, change the CronCreate prompt from "run docs/agents/cowork-team/flow/main.md" to mirror dev-team Job 1: "Self-arm FIRST (idempotent): read and execute .claude/skills/cron-cowork-team/SKILL.md. Then run docs/agents/cowork-team/flow/main.md" — a live tick then repairs a wiped registry. (b) Add a SessionStart hook to .claude/settings.json (alongside the existing PreToolUse graphify hook) emitting additionalContext: "Session restart detected: re-arm session-scoped crons — invoke /cron-cowork-team and /cron-detect-loop now (both idempotent no-ops if already armed)." CronCreate is CLI-native so a hook cannot call it directly; injected instruction is the working mechanism (same rationale as cron-detect-loop Job 1 note). Removes the human from the re-arm loop for both skills.

*Files*: .claude/skills/cron-cowork-team/SKILL.md, .claude/settings.json

*Risk*: Hook fires on every session start including non-orchestration sessions — the idempotency guards (CronList scan) make the double-invoke a cheap no-op; keep message short to respect the session-start token budget (memory project_session_start_token_bloat_80k).

*Verifier*: Underlying gap is real and unqueued (no SessionStart hook exists; launchd firer covers guaranteed:true only; non-guaranteed slots die with the CLI session), but the change text is broken against current reality: (1) the cited bare prompt at cron-cowork-team/SKILL.md:53 no longer exists — TE-T01/WU-2 (commit 00259bbe8, DONE_VERIFIED 2026-07-13) replaced it with a preflight-script-first prompt, so applying part (a) literally would clobber a QA-verified ~300k tok/day token-economy fix shipped today; (2) part (b)'s premise 'idempotent no-ops if already armed' is false cross-session — CronList is session-local, and memory project_token_economy_lazyload_exec_20260712.md documents this exact hazard on 07-13 (router armed duplicate detect-loop crons, then stood down after finding live peer hosts 69b0312e/4e2b3e07; feedback_overparallel_fanout_host_starvation). Also stale citations: dev-team Job 1 self-arm prompt now lives at .claude/skills/cron-detect-loop/register.md:64 (SKILL.md is 52L), and both cited slots' last_fired are now 2026-07-13, not 07-03/05-25. A compliant variant exists — see rescope.

*Rescope*: Make cowork/detect-loop re-arm self-healing WITHOUT regressing TE-T01 or creating duplicate cron hosts. (a) In .claude/skills/cron-cowork-team/SKILL.md Step 2, PREPEND to the EXISTING TE-T01/WU-2 preflight prompt (do NOT replace it — keep the cowork-tick-preflight.sh verdict-branching text byte-identical): 'Self-arm FIRST (idempotent): read and execute .claude/skills/cron-cowork-team/SKILL.md (re-registers this session's cowork master cron; Step 1 CronList guard = no-op when armed). Then run: bash scripts/agents-flow/cowork-tick-preflight.sh ...'. To keep the per-tick self-arm read cheap (96 ticks/day), mirror cron-detect-loop's structure: split cron-cowork-team/SKILL.md into a slim SKILL.md (frontmatter + Step 1 idempotency guard + pointer, target ~50L like cron-detect-loop) and a lazy-loaded register.md holding the CronCreate body, Manage, Notes, and P3 sections — loaded only when Step 1 finds the cron missing. (b) Add a SessionStart hook to .claude/settings.json (alongside the existing PreToolUse graphify hook) emitting ONE short additionalContext line, but the injected instruction MUST be presence-gated because cron registries are session-local and multi-session fleets are the norm here: 'Session start: session-scoped crons may need re-arm. FIRST check the live presence roster (task_list_held kind="session-presence" via mcp__gateway__call_tool) — if a live peer session already hosts the cowork */15 or dev-team 7,37 crons (fresh heartbeat), do NOT arm (pick ONE owner). Only if no live peer host: invoke /cron-cowork-team and /cron-detect-loop.' This preserves the documented stand-down behavior (project_token_economy_lazyload_exec_20260712 07-13 corrected diagnosis; feedback_overparallel_fanout_host_starvation) instead of re-creating redundant cron hosts. Files: .claude/skills/cron-cowork-team/SKILL.md, .claude/skills/cron-cowork-team/register.md (new), .claude/settings.json. Corrected evidence anchors for the implementing dev agent: dev-team Job 1 self-arm prompt = .claude/skills/cron-detect-loop/register.md:64; guaranteed-only filter = scripts/agents-flow/cowork-guaranteed-slot-firer.sh:30-33; 73h-outage header = launchd/com.vn-market.cowork-guaranteed-slot-firer.plist; current cowork prompt = .claude/skills/cron-cowork-team/SKILL.md:57-63 (post-TE-T01).

#### cowork-dispatcher-cron-P12 · impact=medium effort=M · **UNVERIFIED** — Firer hardening: dedup logging, live-dispatcher skip guard, last_fired writeback signal, timeout telemetry

*Addresses*: cowork-dispatcher-cron-I14, cowork-dispatcher-cron-I15

**Change**: In scripts/agents-flow/cowork-guaranteed-slot-firer.sh: (a) stop double-logging — log() should write to stderr only (launchd StandardOutPath/StandardErrorPath already capture) or tee to a DIFFERENT internal file than the plist redirect target; (b) add a cheap live-dispatcher guard before firing: if docs/data/pressure-state.json emitted_at is < 20 min old (live session dispatcher emitting every tick), log SKIP-LIVE and exit 0 — published markers remain the belt-and-suspenders, but this stops paying a full duplicate headless agent run for every guaranteed slot while a session is up; (c) on exit_code=143 (timeout kill), append a structured line to LOG_ERR_FILE that the auditor Tier-1 peer-firer health check (FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED) can match, so a killed guaranteed flow is surfaced, and raise FIRE_TIMEOUT_SECONDS to 2700 for the known-slow weekly flows via a per-slot `_fire_timeout` field read off the slot object (schema-driven, no hardcode); (d) after a successful fire, touch a firer-fired ledger (docs/data/orch outside is fine: docs/agent-memory/sessions/firer-fired.jsonl) so backstop fires are observable even though the firer cannot write last_fired safely without CAS.

*Files*: scripts/agents-flow/cowork-guaranteed-slot-firer.sh, scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh, scripts/agents-flow/cowork-match-slots.test.js, launchd/com.vn-market.cowork-guaranteed-slot-firer.plist

*Risk*: (b) risks missing a slot if the live session emits pressure-state but its dispatcher wedges before spawning — mitigate by only skipping when emitted_at < 20min AND the current tick's telemetry signal exists; keep guard fail-open (unreadable file → fire). Verify the fb-daily Saturday anomaly (I15) before trusting the matcher window: reproduce `node scripts/agents-flow/cowork-match-slots.js` at a mocked Saturday 07:09 ctx in the test file.

#### cowork-dispatcher-cron-P4 · impact=medium effort=S · **RESCOPE** — Headroom-gated fan-out cap in spawn-fanout.md Step 5

*Addresses*: cowork-dispatcher-cron-I4

**Change**: Replace spawn-fanout.md:114 "Fire **all** WON_SLOTS simultaneously in a single Agent tool message block. No sequential gating." with a bounded batcher: read host_headroom_mb from docs/data/pressure-state.json (already emitted every tick) plus `uptime` load; MAX_PARALLEL = 4 default, 2 when host_headroom_mb < 1500 or load > 2x cores, spawn WON_SLOTS in batches of MAX_PARALLEL (guaranteed slots first), still run_in_background=true within a batch and never let one failure block others (R4 preserved). Thresholds live in cadence-policy.json (new `_fanout` key), not hardcoded in the flow.

*Files*: docs/agents/cowork-team/flow/spawn-fanout.md, docs/data/cadence-policy.json

*Risk*: Batching delays later slots by seconds-to-minutes on heavy ticks; acceptable vs. load-205 starvation causing false gateway-down escalations.

*Verifier*: Evidence fully verified: spawn-fanout.md:114 quote is verbatim; pressure-state.json emits host_headroom_mb every tick (live 2991) with zero consumers as a spawn gate (pressure-read/pressure-cadence consume only backlog/volatility tiers); memory feedback_overparallel_fanout_host_starvation confirms the load-205 incident and itself asked for a pre-fan-out load probe. Nothing equivalent is implemented (no MAX_PARALLEL/_fanout anywhere except the audit brief) or queued (no matching orch-state backlog row; the memory's Step-0-GW back-off candidate targets the false-escalation path, not fan-out concurrency). However the proposal as written has two load-bearing defects: (1) batching background spawns is a NO-OP — run_in_background=true spawns return immediately, so batches fired back-to-back yield identical peak concurrency to firing all at once; the change is only real if inter-batch wait semantics are specified (wait for prior batch completion or headroom re-probe, with a bounded timeout so the tick never stalls past the 600s per-work-item token TTL); (2) SSOT drift — line 114 is the point-of-use of the canonical docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate (BGFAN-1: 'background-spawn ALL concurrently in one message block', 'cowork agents are independent → genuinely parallel fan-out is desired'); editing spawn-fanout.md without a carve-out in that section leaves a contradiction a future agent would resolve by restoring unbounded fan-out. FILES list must add the protocol doc. Feasibility of the uptime probe is confirmed (dispatcher runs bash — scripts/agents-flow/cowork-tick-preflight.sh).

*Rescope*: Headroom-gated fan-out cap in spawn-fanout.md Step 5 — corrected. CHANGE: Replace spawn-fanout.md:114 with a bounded batcher. (a) Thresholds in docs/data/cadence-policy.json new `_fanout` key (SSOT, no hardcode): {"max_parallel_default":4, "max_parallel_degraded":2, "headroom_floor_mb":1500, "load_per_core_factor":2, "batch_wait_max_seconds":120}. (b) Gate inputs: HEADROOM = .host_headroom_mb from docs/data/pressure-state.json (if file missing/stale per existing Step 4.2 isStale logic, fail-safe to max_parallel_degraded); LOAD = `uptime` 1-min load; CORES = `sysctl -n hw.ncpu` (dispatcher has bash — proven by cowork-tick-preflight.sh). MAX_PARALLEL = degraded value when HEADROOM < headroom_floor_mb OR LOAD > load_per_core_factor*CORES, else default. (c) Batch semantics (REQUIRED — naive batching of background spawns is a no-op): fire batch N as one message block, all run_in_background=true; before batch N+1, wait for batch-N completion notifications OR re-probe LOAD until below threshold, hard-capped at batch_wait_max_seconds; on timeout, log to WORK channel and continue with MAX_PARALLEL=max_parallel_degraded (never stall past the 600s per-work-item token TTL or the 15-min tick). Guaranteed slots fill batch 1 first. R4 preserved: one spawn failure never blocks others; per-slot try/finally task_release unchanged; Step 5.0 blind guard unchanged. (d) FILES: docs/agents/cowork-team/flow/spawn-fanout.md (update size-justification header per agent-md-factory), docs/data/cadence-policy.json, AND docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate (add explicit headroom-cap carve-out: 'independent tasks fan out in headroom-bounded batches per spawn-fanout.md Step 5; within a batch, one message block' — prevents canonical-doc drift that would resurrect unbounded fan-out). Route flow-file edits via agent-md-factory discipline.

#### cowork-dispatcher-cron-P6 · impact=medium effort=S · **UNVERIFIED** — Fixed-name tick snapshot: kill the HH:MM litter and the consumer cache-miss race in one edit

*Addresses*: cowork-dispatcher-cron-I6

**Change**: In tick-snapshot.md, write to fixed path docs/data/cycle-snapshot-current.json (atomic .tmp+rename already in the bash block; keep the created_at field). Update the two consumers (.claude/skills/step-0-cowork/SKILL.md:38-40 and .claude/skills/cycle-bootstrap/SKILL.md:59) to read cycle-snapshot-current.json and gate on file mtime/created_at <= 7min instead of minute-exact filename match. telemetry.md Step 6 promotion to cycle-snapshot-latest.json keys off the fixed name (drop tickHHMM lookup or pass the fixed path). One-time cleanup: `rm docs/data/cycle-snapshot-??:??.json` (80 files, gitignored — safe). Delete the false "overwritten each tick" comment at tick-snapshot.md:10. Cache hit-rate rises from same-minute-only to <=7min, cutting redundant get_cycle_bootstrap calls per fan-out.

*Files*: docs/agents/cowork-team/flow/tick-snapshot.md, .claude/skills/step-0-cowork/SKILL.md, .claude/skills/cycle-bootstrap/SKILL.md, docs/agents/cowork-team/flow/telemetry.md

*Risk*: emitPressureStateTool promoteCycleSnapshotFn may expect tickHHMM naming — verify its lookup and adjust (adds a small server touch; if gated, keep writing latest.json promotion path unchanged and only fix the pre-spawn file).

#### cowork-dispatcher-cron-P8 · impact=medium effort=S · **UNVERIFIED** — Fix the weekly-key contradiction in spawn-fanout.md

*Addresses*: cowork-dispatcher-cron-I8

**Change**: Replace spawn-fanout.md:107-108 ("Weekly slots ... use ISO week as `work_date` (`YYYY-WW` format, e.g. `2026-W22`)") with the already-canonical rule from lines 64-68: weekly slots key on get_week_period periodKey date-range (published:digest-sunday:2026-06-08/2026-06-14), citing buildWeeklyPublishMarkerKey in apps/mcp-server/src/domain/services/isoWeek.ts as SSOT; add one line: daily slots key on UTC calendar date, NEVER any week-derived field (per digest-daily recurrence #3, commit e1e9d6ab).

*Files*: docs/agents/cowork-team/flow/spawn-fanout.md

*Risk*: None — aligns doc with shipped, live-verified behavior.

#### cowork-dispatcher-cron-P9 · impact=medium effort=S · **UNVERIFIED** — Purge retired-RemoteTrigger prose and simplify the dead backstop branch

*Addresses*: cowork-dispatcher-cron-I9

**Change**: (a) .claude/skills/cron-cowork-team/SKILL.md: rewrite lines 21, 98, 106 to name the ACTUAL session-independent layer (launchd com.vn-market.cowork-guaranteed-slot-firer, guaranteed slots only) and fix line 105's durable-flag claim to match cron-detect-loop's confirmed-live statement (evaporates on session exit regardless). (b) .claude/commands/crons/cron-cowork-team.md: drop the "keep existing RemoteTriggers active" parallel-run notes (retired 2026-07-07). (c) spawn-fanout.md Step 5.0: since every slot now has _superseded_by non-null, delete the BACKSTOP_SLOTS/cloud-defer branch and treat all WON_SLOTS as undeliverable-when-blind, with the WORK summary pointing at the launchd firer as the only backstop; keep the schedule-derived classification code commented as historical only if the factory requires, else remove.

*Files*: .claude/skills/cron-cowork-team/SKILL.md, .claude/commands/crons/cron-cowork-team.md, docs/agents/cowork-team/flow/spawn-fanout.md

*Risk*: Confirm zero slots regain trigger_id-backed status before deleting the branch (jq over cowork-schedule.json in the same commit).

#### cowork-dispatcher-cron-P10 · impact=medium effort=S · **UNVERIFIED** — Reorder fallback main.md: election before any shared-state mutation (signal drain)

*Addresses*: cowork-dispatcher-cron-I7

**Change**: In main.md JUMP-TO table and fallback body, move Step 0a (signal_queue drain) to AFTER Step 0b presence+election, matching the preflight script's semantics (READ-ONLY count pre-election, real drain only post-WIN). Concretely: renumber 0a→0b.4 in the JUMP-TO table (main.md:31-33) and add one line to Step 0a body: "Runs ONLY after fire-election WIN (Step 0b.2) — losers must not flip NEW→READ."

*Files*: docs/agents/cowork-team/flow/main.md

*Risk*: None — fallback path only; preflight WORK path already behaves this way, so this removes a divergence.

#### cowork-dispatcher-cron-P11 · impact=low effort=S · **UNVERIFIED** — Pick one weekend engine: delete dead cadence-policy weekend rows OR exempt policy-carrying slots from Step 4.3

*Addresses*: cowork-dispatcher-cron-I11

**Change**: Decide the intended weekend gatherer behavior and make one engine own it. Option A (current flow behavior wins): delete cadence-policy.json:11-12 gatherer-standard holiday/weekend rows (unreachable) and add a comment that Step 4.3 blanket-suppresses non-guaranteed slots on holiday/weekend. Option B (policy wins, recommended once P1 activates adaptive mode): in pressure-read.md Step 4.3, skip suppression for slots with policy_id != null (their calendar handling lives in the policy table), leaving blanket suppression only for policy-less non-guaranteed slots. Route the A/B decision to po per project convention.

*Files*: docs/data/cadence-policy.json, docs/agents/cowork-team/flow/pressure-read.md

*Risk*: Option B increases weekend fires (every 8h per gatherer) — token cost is bounded by the 480-min interval; Option A silently forfeits weekend news coverage. Decision, not just cleanup.


## Domain: cowork-cycle-agents

### Issues

#### cowork-cycle-agents-I4 · HIGH — news-scout exec-proof gate is sequenced BEFORE the notebook write, so EXEC_PROOF_1 reads the previous cycle's timestamp and must always FAIL — or is being silently ignored (false-green precedent)

*Evidence*: docs/agents/news-scout/flow/stage-log-notify.md:5 "**Step 3e — Exec-proof gate**" precedes line 21 "**4. Session log**" and the Step-4 settled Write of the notebook; .claude/skills/exec-proof-gate/SKILL.md:86 "EXEC_PROOF_1 = (NOTEBOOK_TS != null) AND (NOTEBOOK_TS >= CYCLE_START_UTC)" requires the notebook already written this cycle. market-watcher orders it correctly (cycle.md: Step 5 notebook write, then Step 4e gate, then 5b WORK ping).

#### cowork-cycle-agents-I5 · HIGH — Published-marker/dedup claims are taken at cycle START and never released on silent-exit or failure EXIT paths — the known marker-leak class is still open in chef and fb flows

*Evidence*: docs/agents/unified-agent/flow/chef.md:73-85 claims MARKER_KEY at Step 0.5, then chef.md:135-137 "0 clusters qualify → emit SILENT Telemetry … EXIT. No MARKET message." with no task_release (memory: feedback_chef_leaks_published_marker_on_silent_exit); docs/agents/fb-market-poster/flow/main.md:94-100 claims "published:fb-daily:<VN_DATE>" ttl 100800 at STEP 0a, then main.md:677 "JARGON GATE: unresolvable — post NOT written\")` and EXIT" and main.md:752 privacy-gate EXIT leave the day marked published with no post; same pattern in tran-ngoc-bau/flow/main.md:41-51 (weekly, ttl 691200 — a failed audit blocks re-audit for 8 days).

#### cowork-cycle-agents-I6 · HIGH — claim-truth-gate coverage gaps: fb weekend posts and digest-predict MARKET digests publish with NO CCATO gate; fb weekly-prediction also lacks the data-integrity gate

*Evidence*: .claude/skills/claim-truth-gate/SKILL.md:5-8 names "fb-market-poster, unified-agent/CHEF, market-watcher, alert-commander, digest-predict" as invokers, but grep -rln claim-truth-gate over flows hits only alert-commander/stage-dispatch-log.md, digest-predict/daily-predict.md, fb-market-poster/main.md, market-watcher/cycle.md, tran-ngoc-bau/audit-market.md, unified-agent/chef.md — NOT fb weekly-recap.md / weekly-prediction.md, NOT digest-predict weekly.md (weekly.md:65 "send_telegram(channel=\"market\", message=<weekly_digest_text>)") or daily.md:66. grep fb-data-integrity-gate hits only main.md + weekly-recap.md — the Sunday WEEKLY_PREDICTION post (highest fabrication risk, per feedback_fb_poster_fabricates_when_data_thin) has neither plausibility nor truth gate.

#### cowork-cycle-agents-I9 · HIGH — cowork-end-cycle composition is hand-tuned per flow with contradictory skip lists; session-log-cowork double-appends to the notebook after settled writes

*Evidence*: news-scout/stage-log-notify.md:95-96 "(skip notebook-write step — already written above; keep session-log + doc-self-heal + self-critique)" vs bctc-analyst/stage-log-notify.md:66 "(skip notebook-write AND session-log steps — both would duplicate the notebook composition … and violate the AC-3 single-settled-write invariant"; market-watcher/cycle.md:282 and alert-commander/stage-dispatch-log.md:106 invoke cowork-end-cycle with NO skips — yet .claude/skills/session-log-cowork/SKILL.md:10 "Append cycle summary to $PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md" and notebook-write both target the notebook, so those agents get 2-3 notebook writes per cycle; for OVERWRITE-class market-watcher the append lands AFTER the 80L wc guard already ran (cycle.md:247-254). fb-market-poster never invokes cowork-end-cycle at all (no doc-self-heal/self-critique).

#### cowork-cycle-agents-I1 · MEDIUM — step-0-cowork composite skill is loaded but never used by any flow — bootstrap protocol exists in 4 overlapping layers

*Evidence*: .claude/skills/step-0-cowork/SKILL.md:127 "Replace separate skill calls at cycle start with a single reference" — yet grep shows zero flow files reference step-0-cowork (only init.md always_load lists do); docs/agents/news-scout/flow/stage-bootstrap.md:5 still reads "**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md`" plus inline 0b/0c steps. Every cycle loads BOTH step-0-cowork (132L via init always_load) AND cycle-bootstrap (165L) AND regime-extraction (45L) AND a per-agent stage-bootstrap.md restating the same steps.

#### cowork-cycle-agents-I2 · MEDIUM — GATEWAY-BLIND fallback text duplicated near-verbatim in two skills — active drift risk

*Evidence*: .claude/skills/step-0-cowork/SKILL.md:67-68 "GATEWAY-BLIND fallback (Write-fallback signal + graceful DEFER — mirrors the already-DONE FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH" is the same ~35-line block as .claude/skills/cycle-bootstrap/SKILL.md:122-145 (which adds an SSE-handshake comment and a retry table the copy lacks). Violates the one-base-skill invariant; the two copies have already diverged in detail.

#### cowork-cycle-agents-I3 · MEDIUM — market-watcher runs TWO divergent gateway gates per cycle; the shared gateway-availability-gate skill lacks the DMS-2 sibling-corroboration fix

*Evidence*: docs/agents/market-watcher/flow/main.md:64 "2x timeout but SIBLING_RECENT is non-empty — suppressing false gateway-down BUG" (inline DMS-2 protocol, 40 lines) THEN docs/agents/market-watcher/flow/cycle.md:20 "**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md`" probes again; the skill (SKILL.md:30-32) fails loud on "any transport-dead error" with NO corroboration — news-scout uses only the skill so the false-gateway-down class (memory: feedback_false_infra_failure_corroboration_gate) is still open there. Only 2 of 8 agents (market-watcher, news-scout) have Step 0-GW at all; alert-commander, unified-agent, digest-predict, bctc-analyst, fb-market-poster, tran-ngoc-bau have none.

#### cowork-cycle-agents-I7 · MEDIUM — fb STEP 4b treats a missing gate script as PASS — false-green vector, and the branch is dead code since the script shipped

*Evidence*: docs/agents/fb-market-poster/flow/main.md:712-713 "INTEGRITY_EXIT=0  # gate not yet deployed — log unavailability, proceed" and main.md:723 "If gate script missing → log warning, treat as PASS for this cycle only"; scripts/fb-data-integrity-gate.sh exists (43KB, deployed 2026-06-24). A future rename/move silently disables the anti-fabrication gate — same false-green class as feedback_fb_poster_gate_false_green.

#### cowork-cycle-agents-I8 · MEDIUM — notebook-write AC-3 logic copy-pasted inline in 4+ flows, and fb flow contradicts the skill's two-class contract (flow says full-overwrite, skill says APPEND)

*Evidence*: docs/agents/fb-market-poster/flow/main.md:886 "Write notebook (full overwrite) → skill: `.claude/skills/notebook-write/SKILL.md`" and main.md:44 "cycle log (full overwrite)" vs .claude/skills/notebook-write/SKILL.md:83 APPEND-class row listing "fb-market-poster"; full overwrite wipes the flow's own "## Lessons learned — (append any new tool-behavior lessons here)" (main.md:910-911) every cycle. The AC-3 compose-in-memory procedure is restated inline in news-scout/stage-log-notify.md:46-67, unified-agent/chef.md Step 8b, bctc-analyst/stage-log-notify.md:17-42, digest-predict/daily-predict.md P-6 — 4 divergent copies (e.g. daily-predict's copy omits the AC-5 gate and blank-state fallback).

#### cowork-cycle-agents-I10 · MEDIUM — Three conflicting write-allowlist SSOTs, all contradicted by live flows (coverage-state.json, analysis-briefs, docs/social, docs/handoffs, unified-agent-synthesis JSON)

*Evidence*: .claude/skills/anti-hallucination/SKILL.md:73 "ONLY permitted: docs/agent-memory/notebooks/<own-id>.md + docs/signals/<signal-file>.json" vs market-watcher/cycle.md:243 "write updated JSON to docs/data/coverage-state.json.tmp", news-scout/stage-log-notify.md:79-81 (same file), market-watcher/eod.md:23 analysis-briefs append, fb-market-poster/main.md:833 "Write the post to FILEPATH" (docs/social/), tran-ngoc-bau/auto-cure-and-handoff.md:64 "Write docs/handoffs/tnb-audit-latest.md", unified-agent/chef.md:538 "FILEPATH = docs/data/unified-agent-synthesis-…json". cowork-boundary/SKILL.md:18 allows analysis-briefs but none of the rest. An agent obeying anti-hallucination literally must refuse its own flow steps; one ignoring it erodes the boundary.

#### cowork-cycle-agents-I11 · MEDIUM — Waterfall ≤200L flow-doc invariant violated by 5 cowork flow files (up to 4.7x)

*Evidence*: wc -l: fb-market-poster/flow/main.md 945L, unified-agent/flow/chef.md 699L, fb weekly-prediction.md 302L, market-watcher/flow/cycle.md 285L, fb weekly-recap.md 238L. market-watcher/cycle.md:1 self-flags it: "FLAG: file exceeds 200L flow-doc discipline pre- AND post-edit — pre-existing debt".

#### cowork-cycle-agents-I13 · MEDIUM — coverage-state.json read-modify-write race between news-scout and market-watcher — atomic rename but no mutex; last writer drops the other agent's stamps

*Evidence*: news-scout/stage-log-notify.md:79-81 "write updated JSON to docs/data/coverage-state.json.tmp / mv … coverage-state.json" and market-watcher/cycle.md:242-244 identical pattern on the SAME file; both fire in overlapping 15-min market-hour windows; no task_claim around the update (unlike notebook commits which use commit-mutex).

#### cowork-cycle-agents-I18 · MEDIUM — Per-cycle protocol load is ~20-25 files / ~2,300-2,700 lines for the hot-path agents (news-scout every 15 min, chef 10 windows/day)

*Evidence*: Measured wc -l: one news-scout market-hours cycle loads init.md(129) + fail-loud-protocol(111) + mcp-tools.md(184) + step-0-cowork(132) + 7 flow files(565) + gateway-gate(101) + cycle-bootstrap(165) + regime-extraction(45) + telegram-routing(38) + cowork-error-boundary(78) + exec-proof(172) + caveman(96) + end-cycle chain(16+77+33+47+118) + tools package news-scout.md(249) + notebook(47) ≈ 2,400 lines / 25 files per 15-min cycle. chef: init(158)+chef.md(699)+5 knowledge docs(265)+package(287)+cycle-bootstrap/regime/claim-truth/macro-health/telemetry/commit-mutex/end-cycle ≈ 2,650 lines per dish. Duplication from I1/I2/I8 is a direct component of this cost.

#### cowork-cycle-agents-I12 · LOW — digest-predict carries 3 orphaned flow files (279 lines) no dispatcher routes to

*Evidence*: docs/agents/digest-predict/flow/main.md:126-128 dispatch table routes ONLY weekly.md (Sunday 13:47) and daily-predict.md (17:30); main.md:130 "monday.md retained on disk as audit trail (not routed). Monthly removed." — yet daily.md (94L, header says "Daily Digest Flow (15:30 UTC)"), monday.md (97L) and monthly.md (88L) still exist and monthly.md contradicts "removed". Dead flows still consume reads via cowork-end-cycle greps and confuse routing.

#### cowork-cycle-agents-I14 · LOW — tran-ngoc-bau bootstrap cites a stale gateway wrapper tool name

*Evidence*: docs/agents/tran-ngoc-bau/flow/bootstrap.md:30 "`mcp__claude_ai_gateway__call_tool` is not present in this session" — the canonical wrapper per CLAUDE.md is `mcp__gateway__call_tool`; an agent following this diagnostic checks for a tool that never exists and misclassifies every session as stale.

#### cowork-cycle-agents-I15 · LOW — news-scout init.md signal taxonomy drifted from the flow (init omits legal_risk/urgent_news/chain_catalyst which the flow posts)

*Evidence*: docs/agents/news-scout/init.md:82-84 "produces: - news_impact - crisis_velocity" vs stage-signals.md:104 "\"signal_type\": \"legal_risk\"", :150 "\"signal_type\": \"urgent_news\"", :183 "\"signal_type\": \"chain_catalyst\"".

#### cowork-cycle-agents-I16 · LOW — chef AF-1 anti-fabrication rule carries a stale tool inventory that contradicts the P0 indicator suite added to Step 0 GATHER

*Evidence*: unified-agent/flow/chef.md:332 "Current cycle tool inventory: get_cycle_bootstrap, get_market_hexagram, get_portfolio_conviction, get_macro_snapshot. NONE of these return a computed numeric …" vs chef.md:107-114 Step 0 now calls get_volatility_indicators/get_roc_momentum/get_relative_strength/etc. which DO return numerics, and the Step 6.7 self-check (chef.md:359) explicitly permits those numbers when called this cycle. The blanket "CHEF publishes ZERO numeric indicator values" (chef.md:334) is internally inconsistent.

#### cowork-cycle-agents-I17 · LOW — gateway-availability-gate's BLOCKED overwrite template destroys market-watcher carry-over

*Evidence*: .claude/skills/gateway-availability-gate/SKILL.md:54-56 "For OVERWRITE-class notebooks (market-watcher): overwrite the notebook with:" — template has no Carry-over section, while market-watcher/cycle.md:217 requires "[recover any carry-over items from previous notebook before overwriting]". Any blocked cycle silently wipes carry-over state.

### Proposals

#### cowork-cycle-agents-P1 · impact=high effort=M · **RESCOPE** — Make step-0-cowork the ONLY bootstrap entry point; strip its duplicated GATEWAY-BLIND block

*Addresses*: cowork-cycle-agents-I1, cowork-cycle-agents-I2, cowork-cycle-agents-I18

**Change**: (a) In .claude/skills/step-0-cowork/SKILL.md delete lines 53-88 (the duplicated GATEWAY-BLIND guard + fallback) and replace with one pointer line: 'Error classes + GATEWAY-BLIND fallback → cycle-bootstrap/SKILL.md § Error handling (SSOT)'. (b) Replace the Step 0/0b/0c inline blocks in news-scout/flow/stage-bootstrap.md (keep only the shape-validation gate + Step 0c caches, which are agent-specific), alert-commander/flow/stage-bootstrap.md:10-13, bctc-analyst/flow/stage-bootstrap.md (whole file), market-watcher/flow/cycle.md:23-29, digest-predict daily-predict.md:17-27 and unified-agent/flow/market-bootstrap.md:5-10 with a single line: '**Step 0** → skill: `.claude/skills/step-0-cowork/SKILL.md` (agent-id=<id>; Variables: <list>)'. Since init.md already always_loads step-0-cowork, this removes one duplicate skill load and ~40-70 lines per flow.

*Files*: .claude/skills/step-0-cowork/SKILL.md, docs/agents/news-scout/flow/stage-bootstrap.md, docs/agents/alert-commander/flow/stage-bootstrap.md, docs/agents/bctc-analyst/flow/stage-bootstrap.md, docs/agents/market-watcher/flow/cycle.md, docs/agents/digest-predict/flow/daily-predict.md, docs/agents/unified-agent/flow/market-bootstrap.md

*Risk*: Agent-specific bootstrap extras (news-scout SELF_SIGNALS_CACHE, alert-commander macro-calendar) must stay in the stage files — only the generic 0/0b/0c text is removed; verify each flow's Variables declaration survives.

*Verifier*: All cited evidence verified (step-0-cowork:53-88 dup block, :67-68 and :127 quotes verbatim; cycle-bootstrap:122-145 diverged fuller copy with SSE comment + retry table; grep confirms 0 flow refs to step-0-cowork, only 6 init.md always_load lists; all 6 flow files carry inline cycle-bootstrap+regime blocks at ~cited lines). BUT change (b) — the flow rewiring — is already queued as backlog row TE-T11 (orch-state .task_board.backlog, BACKLOG/P2, sprint TOKEN-ECONOMY-AUDIT, user-approved 2026-07-12, draining via dev-team BOUNDED-1; brief docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md §T-11) with an identical one-line-swap mechanic and a BROADER 11-flow file list (adds chef.md, market-watcher/eod.md, digest-predict daily+monday, cowork-team/tick-snapshot.md); executing this proposal as written double-builds. Change (a) — dedup the GATEWAY-BLIND block — is real, unqueued (TE-T11 explicitly keeps the composite's embedded copy: "no behavior change — the composite embeds the same GATEWAY-BLIND...boundaries"), invariant-aligned (one-base-skill anti-drift), and behavior-preserving (error path lazy-loads cycle-bootstrap via local Read, which works even when gateway-blind). Rescope = drop (b), keep (a) as a rider on TE-T11.

*Rescope*: Fold into TE-T11 as an amendment (or a small dep-gated follow-up row TE-T11b) — do NOT create a parallel rewiring task. Scope: (1) In .claude/skills/step-0-cowork/SKILL.md delete lines 53-88 (duplicated GATEWAY-BLIND guard + fallback) and replace with a <=4-line stub: "On ANY Step 0 error → Read `.claude/skills/cycle-bootstrap/SKILL.md` § Error handling (SSOT: TRANSIENT/CONFIRMED-BLIND classification, retry table, GATEWAY-BLIND Write-fallback signal + graceful DEFER). Never call send_telegram on tool-not-found — it is itself a gateway call and fails identically." (2) Amend TE-T11's detail/AC text from "the composite embeds the same GATEWAY-BLIND and regime-fallback boundaries" to "the composite POINTERS to the SSOT boundaries in cycle-bootstrap § Error handling" so QA does not fail the row against the stale claim. (3) Leave all flow-file rewiring to TE-T11 as already specced (its 11-flow list supersedes this proposal's 6-file list; news-scout keeps its agent-specific shape-validation gate + Step 0c caches per TE-T11's "Variables: only what this flow needs" pattern). (4) Coordination note on row FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK (BACKLOG, curl-bypass retrofit): after this dedup it edits ONE canonical fallback block (cycle-bootstrap) instead of two. Constraints: edits under agent-md-factory discipline; beware known Edit-tool multiline-strip harness bug on skill/flow .md files; step-0-cowork stays well under the 200L waterfall cap (133L → ~100L).

#### cowork-cycle-agents-P2 · impact=high effort=M · **RESCOPE** — Absorb the DMS-2 sibling-corroboration probe into gateway-availability-gate and de-duplicate market-watcher's double probe

*Addresses*: cowork-cycle-agents-I3

**Change**: Move market-watcher/flow/main.md:36-75 (30s backoff + SIBLING_RECENT corroboration via get_agent_signals hours_back=0.25) into .claude/skills/gateway-availability-gate/SKILL.md as the canonical Step 0-GW error path (replacing the current 'On any transport-dead error → fail loud immediately' at SKILL.md:30-32). In market-watcher/flow/main.md replace the inline block with '→ skill: gateway-availability-gate' and DELETE the second Step 0-GW at cycle.md:20-21 (one probe per cycle). Add the same one-line Step 0-GW reference at the top of alert-commander/flow/cycle.md, unified-agent/flow/chef.md (before Step 0.5), digest-predict/flow/main.md (before the marker gates, so a dead gateway doesn't burn a task_claim), bctc-analyst/flow/cycle.md (after E2 guard), and fb-market-poster/flow/main.md (before STEP 0a).

*Files*: .claude/skills/gateway-availability-gate/SKILL.md, docs/agents/market-watcher/flow/main.md, docs/agents/market-watcher/flow/cycle.md, docs/agents/alert-commander/flow/cycle.md, docs/agents/unified-agent/flow/chef.md, docs/agents/digest-predict/flow/main.md, docs/agents/bctc-analyst/flow/cycle.md, docs/agents/fb-market-poster/flow/main.md

*Risk*: fb-market-poster cannot use get_cycle_bootstrap but CAN call get_system_status — the gate is bootstrap-agnostic so it applies; keep the skill's BLOCKED-notebook templates per-class (see P13).

*Verifier*: Core issue VERIFIED: market-watcher genuinely runs two divergent gateway gates per cycle — inline DMS-2 corroboration probe in docs/agents/market-watcher/flow/main.md (now lines 48-86 after the 2026-07-12 narrate-guard edit shifted the file; quoted log line is at :76, not :64) followed by a second Step 0-GW skill reference at cycle.md:26-27; the shared skill (.claude/skills/gateway-availability-gate/SKILL.md:30-32) fails loud with no corroboration; only market-watcher and news-scout reference the skill (grep-confirmed); none of alert-commander/unified-agent/digest-predict/bctc-analyst/fb-market-poster/tran-ngoc-bau has Step 0-GW; all five insertion anchors exist (chef.md:32 Step 0.5, fb main.md:83 STEP 0a, bctc cycle.md:31 E2, digest main.md:42-100 marker gates). No equivalent fix is implemented or queued (searched orch-state task_board all lanes for gateway/corrobor/DMS/sibling — only unrelated rows; memory shows the parent audit's cowork-cycle-agents domain is fully UNVERIFIED, this is proposal P2 itself). No standing invariant violated — it implements the one-base-skill rule; merged skill stays well under 200L. BUT the CHANGE text has two defects that would cause regressions if followed literally: (1) "DELETE the second Step 0-GW at cycle.md:20-21" — lines 20-22 are the execution-contract paragraph (which references Step 0-GW and must be reworded, not deleted); the actual step to delete is cycle.md:26-27. (2) "replacing the current fail-loud path" with the moved inline block would swap the skill's correct confirmed-down action (Write signal file + BLOCKED notebook — works when gateway is dead) for main.md's send_telegram(channel="bug") — itself a gateway call that fails identically when the gateway is down, the exact anti-pattern cycle-bootstrap SKILL.md's GATEWAY-BLIND fallback (lines 126-131) documents and forbids. Also note partial overlap: alert-commander/bctc-analyst/digest-predict already get gateway-dead fail-loud via cycle-bootstrap's GATEWAY-BLIND fallback at Step 0, so the added 0-GW is a corroboration/pre-claim upgrade there, not a missing gate — worth stating so the dev agent doesn't duplicate escalation paths. Sequencing note: audit sibling proposal P1 also edits market-watcher/flow/cycle.md:23-29; coordinate if both land.

*Rescope*: Absorb the DMS-2 sibling-corroboration probe into gateway-availability-gate as the canonical Step 0-GW, de-duplicate market-watcher's double probe, and extend the gate to 5 more cowork flows. (1) SKILL UPGRADE — .claude/skills/gateway-availability-gate/SKILL.md: keep the existing probe (get_system_status) and keep the existing failure ACTIONS unchanged (a: Write bug-escalation signal file, b: BLOCKED notebook entry per notebook class, c: EXIT — never send_telegram, which is itself a gateway call and fails identically when the gateway is dead; see cycle-bootstrap SKILL.md GATEWAY-BLIND rationale). INSERT in front of those actions the DMS-2 escalation ladder from market-watcher/flow/main.md:48-86: on PROBE_1 error → classify: if error text is "no such tool"/"tool not found" (CONFIRMED-BLIND, categorically absent binding) skip backoff+corroboration and go straight to actions a-c; else WAIT 30s → PROBE_2; on second failure → SIBLING_RECENT = call_tool(get_agent_signals, {from_agent: null, status: "all", hours_back: 0.25}); if non-empty → log "[<agent-id>] Step 0-GW: 2x timeout but SIBLING_RECENT non-empty — suppressing false gateway-down escalation" → EXIT cleanly with a notebook DEFER entry, NO signal file, NO BUG; if empty/error → actions a-c with payload noting "2x probe failure + no sibling success in 15-min window". (2) MARKET-WATCHER DEDUP — main.md: replace the inline step-3 block (lines 48-86) with one line "3. **Step 0-GW — Gateway availability gate** → skill: .claude/skills/gateway-availability-gate/SKILL.md (agent-id=market-watcher; covers cycle.md AND eod.md)"; keep the Step -1 reference to the corroborated EXIT (main.md:26) accurate. cycle.md: delete ONLY the Step 0-GW step block at lines 26-27; reword the execution-contract paragraph (lines 20-22) from "Step 0-GW through Step 5b" to "Step 0 through Step 5b" and change terminal state (b) to "an explicit main.md Step 0-GW gateway-down EXIT (per gateway-availability-gate skill)". (3) EXTEND — add the standard two-line skill reference (per SKILL.md § Usage) with the correct agent-id at: top of docs/agents/alert-commander/flow/cycle.md; docs/agents/unified-agent/flow/chef.md immediately before Step 0.5 (line 32) so a dead gateway doesn't burn the published-marker task_claim; docs/agents/digest-predict/flow/main.md before the first marker task_claim (line ~42), same rationale; docs/agents/bctc-analyst/flow/cycle.md immediately after Step E2 (market-hours guard needs no gateway); docs/agents/fb-market-poster/flow/main.md before STEP 0a (line 83) — fb is not a cycle-bootstrap consumer so this is its only gateway gate. For agents that also run cycle-bootstrap (alert-commander, unified-agent, digest-predict, bctc-analyst), add one sentence to the skill noting Step 0-GW handles transport-dead + false-positive suppression pre-claim, while cycle-bootstrap's GATEWAY-BLIND fallback remains the handler for bootstrap-specific errors — do not duplicate its signal write when 0-GW already exited. (4) Notebook templates: keep the skill's OVERWRITE/APPEND class split; map each new agent to APPEND class unless its flow declares OVERWRITE. Files: .claude/skills/gateway-availability-gate/SKILL.md, docs/agents/market-watcher/flow/main.md, docs/agents/market-watcher/flow/cycle.md, docs/agents/alert-commander/flow/cycle.md, docs/agents/unified-agent/flow/chef.md, docs/agents/digest-predict/flow/main.md, docs/agents/bctc-analyst/flow/cycle.md, docs/agents/fb-market-poster/flow/main.md. Constraints: agent-md-factory discipline applies to every flow/skill edit; merged SKILL.md stays ≤200L; verify line anchors at implementation time (they drift — anchor on step names, not line numbers); coordinate with audit proposal P1 (touches market-watcher/flow/cycle.md bootstrap block) if both are scheduled.

#### cowork-cycle-agents-P3 · impact=high effort=M · **CONFIRMED** — Create one published-marker-gate skill with a mandatory release-on-no-publish clause; wire it into the 6 existing copy-pasted marker gates

*Addresses*: cowork-cycle-agents-I5

**Change**: New .claude/skills/published-marker-gate/SKILL.md (<80L) defining: key derivation (per-date / per-window / periodKey variants), task_claim call shape, and the RELEASE CONTRACT: 'any EXIT path that did NOT send/write the deliverable MUST task_release(MARKER_KEY) first (silent exit, gate-unresolvable EXIT, config-error EXIT); only a successful publish leaves the marker held'. Replace the six inline gates with skill references + parameters: unified-agent/chef.md Step 0.5 (add task_release to the Step 1 intraday silent-exit at chef.md:135-137 and to the FAILED-telemetry path at chef.md:675), fb-market-poster/main.md STEP 0a (add release before the EXITs at main.md:677, 693, 722, 752, 792), fb weekly-recap.md STEP 0a, fb weekly-prediction.md STEP 0a, digest-predict/main.md pre-D + Sunday gate, tran-ngoc-bau/main.md gate.

*Files*: .claude/skills/published-marker-gate/SKILL.md, docs/agents/unified-agent/flow/chef.md, docs/agents/fb-market-poster/flow/main.md, docs/agents/fb-market-poster/flow/weekly-recap.md, docs/agents/fb-market-poster/flow/weekly-prediction.md, docs/agents/digest-predict/flow/main.md, docs/agents/tran-ngoc-bau/flow/main.md

*Risk*: Release must NOT fire on legitimate no-op dedup exits (claimed:false path) or on successful publish; digest-predict P-2/P-4 zero-evidence NO-OPs should KEEP the marker (correct-behavior no-op, prevents same-day refire) — the skill must distinguish 'no-op by design' from 'failed before publish'. Honor feedback_task_release_owner_agent_mismatch_orphans_lock: release with the same owner_agent.

*Verifier*: All cited evidence verified against current files: chef.md:73-82 claims MARKER_KEY at Step 0.5 with no task_release on the :135-137 intraday silent exit nor the :675 FAILED-telemetry exception path; fb-market-poster main.md:94-100 claims published:fb-daily ttl 100800 with five unreleased bug+EXIT paths at :677/:693/:722/:752/:792; tran-ngoc-bau main.md:41-51 claims periodKey ttl 691200 (failed audit blocks re-audit ~8 days); weekly-recap.md:43-49, weekly-prediction.md:46-52, and digest-predict main.md:48-54/:100-106 gates all exist. Grep confirms ZERO task_release calls across all six flow files, and .claude/skills/published-marker-gate/ does not exist. Production leak confirmed in memory feedback_chef_leaks_published_marker_on_silent_exit (2026-07-03, marker HELD after honest silent exit, ground-truthed via task_list_held). No equivalent fix queued: board items FU-CHEF-MARKER-INFLOW (BACKLOG, chef-only claim-late), FIX-CHEF-PUBLISHED-MARKER-RELEASE (BACKLOG, the inverse release-after-publish bug — which the proposed 'only successful publish leaves marker held' clause also fixes), and FIX-FB-WEEKEND-DEDUP-GATE (REVIEW, added weekend gates but without release-on-failure) are related but none covers the 6-gate release-on-no-publish contract. No standing invariant violated — the proposal directly implements the 'shared boilerplate in ONE base skill' invariant (current gates have drifted: 3 key variants, 3 TTLs, chef uses owner_client_session="placeholder"). Concrete and handoff-ready. Execution caveats for the dev task: (1) chef's on-exception release must be conditional on deliverable-NOT-sent (exception after successful send_telegram must NOT release, or the dup-post gate is re-broken); (2) release must match the actual claim owner (owner_agent + real owner_client_session, per feedback_task_release_owner_agent_mismatch_orphans_lock); (3) board hygiene — absorb/supersede FU-CHEF-MARKER-INFLOW and FIX-CHEF-PUBLISHED-MARKER-RELEASE, and rebase weekend-flow edits on the FIX-FB-WEEKEND-DEDUP-GATE version currently in REVIEW.

#### cowork-cycle-agents-P6 · impact=high effort=M · **RESCOPE** — Single notebook-write path: remove the 4 inline AC-3 copies, resolve the fb OVERWRITE/APPEND contradiction, and make cowork-end-cycle self-deduplicating

*Addresses*: cowork-cycle-agents-I8, cowork-cycle-agents-I9, cowork-cycle-agents-I18

**Change**: (a) Replace the inline compose-in-memory blocks with '→ skill: notebook-write (section template below)' + the ≤10-line per-agent section template only, in: news-scout/stage-log-notify.md:46-67, unified-agent/chef.md Step 8b (8b-8d), bctc-analyst/stage-log-notify.md:17-42, digest-predict/daily-predict.md P-6. (b) fb-market-poster/main.md STEP 8: change 'Write notebook (full overwrite)' to APPEND-class per notebook-write AC-6 (keeps Lessons learned/Known patterns as permanent preamble; last-3-cycle sections roll). Also fix main.md:44 'cycle log (full overwrite)'. (c) In .claude/skills/cowork-end-cycle/SKILL.md add one rule replacing all per-flow skip notes: 'Steps 1-2 (session-log, notebook-write) are NO-OPs when the flow already landed its settled notebook write this cycle — never write the notebook twice.' Delete the ad-hoc skip parentheticals in news-scout/stage-log-notify.md:96, chef.md:672, bctc stage-log-notify.md:66. (d) Repoint session-log-cowork/SKILL.md so its cycle-summary block is composed INTO the notebook-write section (one write), not a separate append.

*Files*: .claude/skills/cowork-end-cycle/SKILL.md, .claude/skills/session-log-cowork/SKILL.md, docs/agents/news-scout/flow/stage-log-notify.md, docs/agents/unified-agent/flow/chef.md, docs/agents/bctc-analyst/flow/stage-log-notify.md, docs/agents/digest-predict/flow/daily-predict.md, docs/agents/fb-market-poster/flow/main.md

*Risk*: Known harness bug (feedback_edit_tool_hook_silently_strips_multiline) — prefer Write-tool settled writes as the skill already allows; market-watcher stays OVERWRITE-class (no change to its 80L contract, only the end-cycle double-write is removed).

*Verifier*: Every cited quote verified real (only cosmetic line drift: market-watcher wc guard is cycle.md:253-260 not 247-254, end-cycle invocation :288 not :282). The fb OVERWRITE/APPEND contradiction is live and unfixed — commit 8e5084d6c registered fb-market-poster into notebook-write AC-6 APPEND class but flow/main.md:44+:886 still say full overwrite, wiping the flow's own permanent 'Lessons learned' section (main.md:910-911) each cycle. The 4 inline AC-3 copies exist and have diverged (daily-predict P-6 omits AC-5 gate, AC-4 blank-state fallback, and AC-2b). No standing-invariant violations — part (a) enforces the SSOT/no-copy-paste invariant. HOWEVER, parts (c)+(d) duplicate already-queued backlog row TE-T05 (P2, .task_board.backlog, user-approved 07-12): its brief §T-05 (docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md:117-127) already folds session-log-cowork INTO notebook-write's section pattern (one write, one commit) and DELETES session-log-cowork — the proposal instead keeps it alive-but-repointed, so shipping both produces conflicting edits to the same two SKILL files. Rescope: keep (a)+(b) as this task; fold (c)+(d) into TE-T05's DoD.

*Rescope*: Split into two coordinated pieces. PIECE 1 (this task — not covered by any queued row): (a) Replace the 4 inline AC-3 compose blocks with '→ skill: .claude/skills/notebook-write/SKILL.md (AC-3 settled-write; section template below)' plus only the ≤10-line per-agent section template, in docs/agents/news-scout/flow/stage-log-notify.md:46-67, docs/agents/unified-agent/flow/chef.md Step 8b-8d (:630-662), docs/agents/bctc-analyst/flow/stage-log-notify.md:17-42, docs/agents/digest-predict/flow/daily-predict.md P-6 (:114-129) — this also cures daily-predict's missing AC-5 gate and AC-4 blank-state fallback by inheriting them from the skill. Keep each flow's existing cowork-end-cycle skip parentheticals (news-scout:96, chef:672, bctc:66) UNCHANGED for now — they are the only thing preventing double-writes until TE-T05 lands. (b) fb-market-poster/flow/main.md: change :886 'Write notebook (full overwrite)' to 'Notebook write (APPEND class per notebook-write AC-6)' and :44 'cycle log (full overwrite)' to 'cycle log (APPEND class, last-3 sections)'; restructure the STEP 8 template so '# FB Market Poster — Notebook' + '## Lessons learned' + '## Known patterns' become the never-pruned preamble and each cycle lands one '## c<NNN> · <ISO>' section (current 'Last cycle' body, ≤60L) via AC-3 settled write + AC-5 gate. Edit under agent-md-factory discipline; use Write-not-Edit for multiline landings (known Edit-hook strip bug). PIECE 2 (amend queued row TE-T05, do NOT create a new row): append to TE-T05's detail_ref/DoD: (i) the explicit NO-OP rule 'notebook write + session summary are ONE write; skip when the flow already landed its settled notebook write this cycle', (ii) deletion of the 3 ad-hoc skip parentheticals (news-scout:96, chef:672, bctc:66) once the composite ships, (iii) add digest-predict daily-predict.md:144, market-watcher cycle.md:288 (OVERWRITE-class append lands AFTER the 80L wc guard at :253-260), and alert-commander stage-dispatch-log.md:106 as evidence of the 2-3-writes-per-cycle defect, (iv) fb-market-poster gets a cowork-end-cycle (or composite) invocation for doc-self-heal + self-critique parity — currently zero invocations in its flow.

#### cowork-cycle-agents-P4 · impact=high effort=S · **RESCOPE** — Close the truth-gate coverage gaps on all public/MARKET publishers

*Addresses*: cowork-cycle-agents-I6

**Change**: (a) fb weekly-recap.md: add 'STEP 3e — CLAIM-TRUTH GATE → skill: .claude/skills/claim-truth-gate/SKILL.md (agent_id=fb-market-poster, non-real-time: second FAIL blocks write)' immediately before its STEP 4 write (mirror main.md STEP 4d text, 15 lines). (b) fb weekly-prediction.md: add the same claim-truth STEP plus the STEP 4b data-integrity gate block (copy the bounded 2-round loop from main.md:695-718 by reference: '→ Execute identically to main.md STEP 4b'). (c) digest-predict/weekly.md: add claim-truth-gate invocation on <weekly_digest_text> before the send_telegram(channel="market") at weekly.md:65, non-real-time semantics. All three agents are already in claim-tool-map routing per the skill header, so no engine change needed.

*Files*: docs/agents/fb-market-poster/flow/weekly-recap.md, docs/agents/fb-market-poster/flow/weekly-prediction.md, docs/agents/digest-predict/flow/weekly.md

*Risk*: Weekend runs have no live session data — honest-NULL classification in narrative-truth-gate.sh already prevents false FAILs on legitimately-absent weekend dimensions.

*Verifier*: The claim-truth (CCATO) coverage gaps are REAL and verified: grep confirms claim-truth-gate is absent from docs/agents/fb-market-poster/flow/weekly-recap.md, weekly-prediction.md, and digest-predict/weekly.md; weekly.md:65 sends to MARKET ungated; SKILL.md:5-8 names both agents as invokers; skill lines 79/97 define the non-real-time second-FAIL-blocks-write semantics exactly as proposed; no existing/queued board row covers these sub-flows (archived NARRATIVE-TRUTH-CCATO-GATE T3 wired only the 6 main flows; BA-ANALYSIS-QUALITY-CONVERGENCE subsumes CCATO-T3-FLOW-WIRING-6PT for analysis-agent main flows only). HOWEVER two defects force rescope: (1) FACTUAL ERROR in part (b) — weekly-prediction.md ALREADY HAS the data-integrity gate: STEP 4b "Data-integrity gate — WEEKLY MODE OVERRIDE" at lines 199-211 with the bounded 2-round loop, plus INTEGRITY GATE reporting in notebook (line 279) and RETURN (line 300). The literal grep for "fb-data-integrity-gate" missed it because the step doesn't name the script file. Adding "Execute identically to main.md STEP 4b" would (a) duplicate an existing STEP 4b number in a file already using 4a-4d, and (b) reintroduce the daily ±7% EXIT/fabrication semantics that the weekly override deliberately suppresses (weekly/forward figures legitimately exceed ±7% — see FIX-FB-GATE-WEEKLY-FRAME-MODE backlog row). (2) INCOMPLETE vs its own title: the proposal's own evidence cites digest-predict daily.md:66 as an ungated MARKET send, and monthly.md:27 is also ungated (send_telegram(channel="market", message=<monthly_digest_text>)) — yet the CHANGE omits both, so "all public/MARKET publishers" is not closed. Also minor: use pointer-style references (the weekend flows' existing convention, e.g. "→ Execute identically to main.md STEP 4a") instead of mirroring 15 lines verbatim per file, per the shared-boilerplate-in-one-place invariant.

*Rescope*: Close the claim-truth-gate (CCATO) coverage gaps on all ungated MARKET/public publishers — claim-truth ONLY; do NOT touch data-integrity gates (already present in all three fb flows). CHANGES: (a) docs/agents/fb-market-poster/flow/weekly-recap.md: insert 'STEP 3e — CLAIM-TRUTH GATE (hard gate — last pre-write check)' between STEP 3d and STEP 4, as a pointer: '→ Execute identically to main.md STEP 4d (skill: .claude/skills/claim-truth-gate/SKILL.md; agent_id=fb-market-poster; non-real-time semantics per SKILL.md — persistent second-pass FAIL blocks the write; exit 2 = config-error → send_telegram(bug) + EXIT, never treat as PASS).' Add 'CLAIM-TRUTH GATE: [PASS | FAIL-corrected | BLOCKED]' line to the RETURN block and notebook entry. (b) docs/agents/fb-market-poster/flow/weekly-prediction.md: insert the same pointer step as 'STEP 4e — CLAIM-TRUTH GATE' between existing STEP 4d (privacy gate) and STEP 5 write; same RETURN/notebook line. NO data-integrity changes — STEP 4b weekly override (lines 199-211) already exists and is correct. (c) docs/agents/digest-predict/flow/weekly.md: immediately before the send_telegram(channel="market") at line 65, add claim-truth-gate invocation on <weekly_digest_text> (agent_id=digest-predict, non-real-time; mirror the invocation pattern already in daily-predict.md lines 83-105). (d) docs/agents/digest-predict/flow/daily.md: same gate on <digest_text> before the market send at line 66. (e) docs/agents/digest-predict/flow/monthly.md: same gate on <monthly_digest_text> before the market send at line 27. All agents already routed in docs/data/claim-tool-map.json per SKILL.md — no engine change. Apply .claude/skills/agent-md-factory discipline to all five flow-file edits; note adjacency to BACKLOG sprint BA-ANALYSIS-QUALITY-CONVERGENCE (digest-predict flow rewiring) to avoid merge conflict if that sprint activates. FILES: docs/agents/fb-market-poster/flow/weekly-recap.md, docs/agents/fb-market-poster/flow/weekly-prediction.md, docs/agents/digest-predict/flow/weekly.md, docs/agents/digest-predict/flow/daily.md, docs/agents/digest-predict/flow/monthly.md

#### cowork-cycle-agents-P5 · impact=high effort=S · **CONFIRMED** — Fix news-scout exec-proof ordering: notebook settled-write BEFORE the gate, gate BEFORE log_agent_work(completed)+WORK ping

*Addresses*: cowork-cycle-agents-I4

**Change**: In docs/agents/news-scout/flow/stage-log-notify.md reorder to: (1) current Step 4 notebook settled-write (Steps 1-7 of the compose block), (2) Step 3e exec-proof gate (unchanged inputs), (3) log_agent_work open/close pair, (4) Step 4b coverage-state update, (5) Step 5 WORK ping — i.e. move the 'Step 3e' block from line 5 to after the Write at line 61, matching market-watcher's working order (notebook Step 5 → gate 4e → ping 5b). Renumber to kill the 3e/4/4b confusion while there.

*Files*: docs/agents/news-scout/flow/stage-log-notify.md

*Risk*: None functional — EP-2 inputs (FETCH_RESULT_COUNT, FETCH_MACRO_TS) are already available from stages 0b/1; on gate FAIL the notebook now contains a real cycle entry, which is correct (the FAIL entry appends after it per the skill).

*Verifier*: All cited evidence verified exact: stage-log-notify.md:5 places Step 3e exec-proof gate before the cycle's ONLY notebook write (the settled Write at line 61 inside Step 4); no other news-scout stage writes the notebook. Per exec-proof-gate SKILL.md EP-1 (line 79) + EP-2 (line 86), NOTEBOOK_TS is read from the newest '## cNNN · ISO' heading, which at gate time is always the previous cycle's — so EXEC_PROOF_1 is structurally unsatisfiable and the gate must FAIL every cycle or be silently skipped (false-green). market-watcher's correct order confirmed (cycle.md: Step 5 notebook write line 217 → Step 4e gate line 265 → 5b WORK ping line 281). Fix is NOT already implemented (git log on the file shows nothing since gate introduction cbbe2e2d) and NOT queued (no orch-state backlog row, signal, po-decision, or memory entry). No standing-invariant violation: doc-only reorder in one flow file, gate logic stays in the single shared skill, and the reorder still satisfies the skill's placement contract (gate immediately before log_agent_work(completed) and WORK ping). Proposal is concrete: exact file, exact block moves, target order, reference flow, renumbering. Minor harmless deviation: proposal puts coverage-state update after log_agent_work rather than before the gate as market-watcher does — does not affect gate correctness.

#### cowork-cycle-agents-P8 · impact=medium effort=L · **UNVERIFIED** — Split the two mega-flows to restore the ≤200L waterfall: extract fb compose/template spec and chef AF+persist blocks

*Addresses*: cowork-cycle-agents-I11, cowork-cycle-agents-I18

**Change**: fb-market-poster/main.md (945L): move STEP 3 (compose spec: jargon table, 3-section spec, post template, hashtag rules — lines 436-643, ~210L) to docs/agents/fb-market-poster/flow/compose-daily.md, and the STEP 4 check catalogue (647-793) to flow/validate-daily.md; main.md keeps router + STEP 0-2c + one-line stage pointers (lands ~350L → then split STEP 1b/2b/2c to gather-daily.md to reach <200L). unified-agent/chef.md (699L): extract Step 6.7 (AF-1/AF-2/self-check, lines 316-392) to a shared docs/standards/numeric-anti-fabrication.md referenced by BOTH chef.md and fb main.md STEP 1b (the two flows carry parallel anti-fabrication rules today), and Step 7.6 JSON schema (530-620) to docs/references/synthesis-persist-schema.md; chef.md keeps the step anchors + pointers. Update size-justification headers accordingly.

*Files*: docs/agents/fb-market-poster/flow/main.md, docs/agents/fb-market-poster/flow/compose-daily.md, docs/agents/fb-market-poster/flow/validate-daily.md, docs/agents/unified-agent/flow/chef.md, docs/standards/numeric-anti-fabrication.md, docs/references/synthesis-persist-schema.md

*Risk*: Highest-churn files in the fleet; do as one atomic commit per agent with tnb audit (audit-market.md) re-run after — chef Step numbering is load-bearing for TNB layer audits, keep step IDs stable.

#### cowork-cycle-agents-P7 · impact=medium effort=M · **UNVERIFIED** — One write-allowlist SSOT: per-agent allowed_writes in init.md; boundary skills point at it instead of carrying their own lists

*Addresses*: cowork-cycle-agents-I10

**Change**: Add an 'allowed_writes:' list to each cowork agent's init.md permissions block (news-scout: notebook, signals, coverage-state.json, analysis-briefs; market-watcher: + coverage-state, analysis-briefs; fb: + docs/social/; tnb: + docs/handoffs/tnb-audit-latest.md; chef: + docs/signals/processed/, docs/data/unified-agent-synthesis-*.json). Replace anti-hallucination/SKILL.md:69-73 'Forbidden write targets' list and cowork-boundary/SKILL.md:16-18 file-scope line with: 'Write targets = the allowed_writes list in your init.md — anything else is forbidden.' Keep the hard universal denials (orch-state.json, .claude/agents/, system-map.json) verbatim in cowork-boundary as the single denial SSOT.

*Files*: .claude/skills/anti-hallucination/SKILL.md, .claude/skills/cowork-boundary/SKILL.md, docs/agents/news-scout/init.md, docs/agents/market-watcher/init.md, docs/agents/alert-commander/init.md, docs/agents/unified-agent/init.md, docs/agents/digest-predict/init.md, docs/agents/bctc-analyst/init.md, docs/agents/fb-market-poster/init.md, docs/agents/tran-ngoc-bau/init.md

*Risk*: init.md edits fall under agent-md-factory discipline; run doc-heal-system after to verify no flow step now writes outside its declared list.

#### cowork-cycle-agents-P10 · impact=medium effort=S · **UNVERIFIED** — Mutex the coverage-state.json update

*Addresses*: cowork-cycle-agents-I13

**Change**: In both news-scout/stage-log-notify.md 4b and market-watcher/cycle.md 5c, wrap the read-modify-write in task_claim(task_id="coverage-state:main", task_kind="intent", ttl_seconds=30) → update → task_release, mirroring the commit-mutex pattern; on claimed:false wait 5s and retry once, then skip stamp update this cycle with log '[coverage] mutex busy — stamps deferred' (stamps are 48h-granularity, one skipped cycle is harmless).

*Files*: docs/agents/news-scout/flow/stage-log-notify.md, docs/agents/market-watcher/flow/cycle.md

*Risk*: Adds 2 tool calls per cycle; acceptable vs silent stamp loss which re-triggers sweep-forced work. Honor feedback_preclaim_gate_taskkind_enum_drift — verify 'intent' is a live task_kind enum value first.

#### cowork-cycle-agents-P11 · impact=medium effort=S · **UNVERIFIED** — Remove the fb STEP 4b treat-missing-script-as-PASS branch; make missing gate script a fail-loud config error

*Addresses*: cowork-cycle-agents-I7

**Change**: In fb-market-poster/main.md replace lines 711-714 ('INTEGRITY_EXIT=0  # gate not yet deployed…break') and the line-723 rule with the claim-truth-gate exit-2 semantics: 'script missing/unreadable = CONFIG ERROR — send_telegram(channel="bug", "[fb-market-poster] data-integrity gate script missing") and EXIT (release marker per P3); never treat as PASS'. Apply the same wording to weekly-recap.md's 4b reference.

*Files*: docs/agents/fb-market-poster/flow/main.md, docs/agents/fb-market-poster/flow/weekly-recap.md

*Risk*: None — script is deployed; this only changes behavior in the regression case it protects against.

#### cowork-cycle-agents-P9 · impact=low effort=S · **UNVERIFIED** — Delete orphaned digest-predict flows (daily.md, monthly.md) and archive monday.md pointer

*Addresses*: cowork-cycle-agents-I12

**Change**: git rm docs/agents/digest-predict/flow/daily.md and monthly.md (dispatch table at main.md:126-128 routes neither; main.md:130 already states 'Monthly removed'); for monday.md either git rm (git history IS the audit trail) or move under docs/archive/ and update main.md:130 note. Confirm cowork-schedule.json has no slot pointing at the removed paths (verified: digest-daily → daily-predict.md via main.md).

*Files*: docs/agents/digest-predict/flow/daily.md, docs/agents/digest-predict/flow/monthly.md, docs/agents/digest-predict/flow/monday.md, docs/agents/digest-predict/flow/main.md

*Risk*: daily-predict.md note says it 'reuses monday.md P-3..P-5 pipeline' conceptually — verify daily-predict.md is self-contained (it is: P-0..P-8 all inline) before removing monday.md.

#### cowork-cycle-agents-P12 · impact=low effort=S · **UNVERIFIED** — Fix stale wrapper name in TNB bootstrap

*Addresses*: cowork-cycle-agents-I14

**Change**: docs/agents/tran-ngoc-bau/flow/bootstrap.md:30 — replace 'mcp__claude_ai_gateway__call_tool' with 'mcp__gateway__call_tool' (canonical per CLAUDE.md § MCP Tools).

*Files*: docs/agents/tran-ngoc-bau/flow/bootstrap.md

#### cowork-cycle-agents-P13 · impact=low effort=S · **UNVERIFIED** — Preserve carry-over in the gateway-gate BLOCKED template

*Addresses*: cowork-cycle-agents-I17

**Change**: In .claude/skills/gateway-availability-gate/SKILL.md OVERWRITE-class template (lines 54-69): add '## Carry-over\n[copy verbatim from previous notebook before overwriting]' between the header and the BLOCKED cycle section, matching market-watcher/cycle.md:216-218.

*Files*: .claude/skills/gateway-availability-gate/SKILL.md

#### cowork-cycle-agents-P14 · impact=low effort=S · **UNVERIFIED** — Sync chef AF-1 tool inventory with the live Step 0 GATHER call list and align init/flow signal taxonomies

*Addresses*: cowork-cycle-agents-I16, cowork-cycle-agents-I15

**Change**: (a) unified-agent/chef.md:332-334 — replace the hardcoded 4-tool inventory sentence with: 'Permitted numeric sources = exactly the tools called in Step 0 GATHER this cycle (bootstrap + P0 suite); RSI/MACD/BB/MA/σ remain forbidden until get_technical_indicators is added to GATHER' (removes the stale contradiction with the Step 6.7 self-check allowance while keeping the TA prohibition). (b) news-scout/init.md:82-84 — extend produces list to news_impact, crisis_velocity, urgent_news, chain_catalyst, legal_risk to match stage-signals.md (agent-md-factory discipline applies).

*Files*: docs/agents/unified-agent/flow/chef.md, docs/agents/news-scout/init.md


## Domain: auditor-signal-loop

### Issues

#### auditor-signal-loop-I1 · CRITICAL — Tier-2/Tier-3 pre-gate is self-defeating: heartbeat is written and age-checked in the same invocation, so the freshness sweep and DB-integrity audit NEVER spawn while runtime looks green

*Evidence*: scripts/agents-flow/auditor-tier1-probe.sh:288-290 — on green, run_probe returns the JUST-written timestamp: `jq -n --arg v "ALL_GREEN" ... --arg lh "$ts"`; then :380-382 run_tiered_probe checks that same value: `age_min=$(_heartbeat_age_minutes "$lh")` → `spawn_verdict="SKIP-SPAWN"; exit_code=0`. Age is always ~0 min, so SKIP-SPAWN is unconditional on green. Field confirmation: docs/agent-memory/notebooks/system-auditor.md shows last real audit `## c396 · 2026-07-04T05:15:40Z ... Tier-1` (only compiled d4-auto entries since); docs/data/auditor-tier3-last-healthy.json does not exist; tier2 heartbeat frozen at 2026-07-04T18:45:44Z. Since B-xx freshness checks, C-01..C-16, D-IMPROVE, D-BCTC-EVAL and the anomaly-task-bridge run ONLY inside T2/T3 subagents (.claude/skills/anomaly-task-bridge/SKILL.md:27 'AUDIT_TIER = 1 → skip'), the entire detect→plan loop above runtime pings is structurally disabled — the exact 'passive health masks dead data' false-negative class the memory warns about.

#### auditor-signal-loop-I2 · HIGH — D4 reconciliation FP fix exists only as spec — compiled cron keeps emitting 6+ false-positive batches daily

*Evidence*: docs/agents/system-auditor/handlers.md:19 — "the spec below (Steps R-1b, R-4b) is CORRECTED but the code has NOT yet been updated to match ... Until that lands, the 6+ recurring false-positive batches (esc-datacov:*, cron:dev-team:*, dev-team-cron-singleton) will keep firing daily. Also note: the code's listHeld() currently calls listHeldTasks({ kind: \"sprint-task\" }) WITHOUT expired: false". tasksMdJanitorJob.ts reads ~100+ TTL-expired tombstones as held and skips the exclusion whitelist + 2-cycle debounce.

#### auditor-signal-loop-I3 · HIGH — Tier-1 signal rows are typed `signal_feedback`, which the anomaly-task-bridge filter does not match — runtime CRITICALs (container down) can never bridge to repair tasks

*Evidence*: docs/agents/system-auditor/flow/tier1-probe.md:162 — row template `"type": "signal_feedback"` (same at :104 for A-20); but .claude/skills/anomaly-task-bridge/SKILL.md:31 collects only `type ∈ {microservice_degraded, data_stale, db_integrity_breach, system_issue}`. audit-dimensions.md D1 declares the dedup namespace as `microservice_degraded`. Zod does not catch it: apps/mcp-server/src/infrastructure/orchStateSchema.ts:185 `type: z.string().optional()` (free string).

#### auditor-signal-loop-I4 · HIGH — 7-day BUG-dedup has no durable store — dedup decision is left to LLM recall; the one candidate ledger (known-issues.json) is stale since 2026-05-01, unwired, and contains duplicate fingerprints

*Evidence*: docs/agents/system-auditor/flow/main.md:661 — "Known (dedup_key seen in past 7 days for BUG channel) → skip BUG write" with no store named; the notebook keeps only 3 sections (main.md:706 'If ≥3 sections: drop the LAST'). docs/data/system-auditor-known-issues.json last entry `"last_reported": "2026-05-01"` and duplicate fingerprints `doc_missing:SPRINT_GOAL.md` (lines 151 and 183) / `agent_missing:notebooks_directory` (163 and 191); grep shows no flow file reads it — only tree-map.md, bundle-architect.md, briefs, context-bloat-backstop.sh reference it.

#### auditor-signal-loop-I5 · HIGH — FP-prevention is accreted per incident, not structural: Tier-2/3 predicates live as LLM-interpreted SQL/prose in the flow file, while the proven frozen-predicate helper pattern was only applied to the sibling sweep

*Evidence*: docs/agents/system-auditor/flow/main.md:1 — header is a chain of ~18 per-incident patches ("FIX-AUDITOR-SQL-MODIFIERS ... FIX-C09-SCHEMA-MISMATCH ... FIX-BCTC-VPS-QUEUE-STALE-TRIAGE ..."); main.md:560-565 the NULL-guard is a narrated procedure ("Before evaluating a check, verify its modifier parses"); C-01..C-16 are a prose SQL table (main.md:567-584) re-typed by the LLM each cycle. scripts/db-integrity-counts.sh:2-4 proves the fix pattern exists elsewhere: "DETERMINISTIC live-DB anomaly counts ... Removes LLM hallucination from the regression monitor" — memory feedback_auditor_predicate_drift_false_regression names the durable fix: "move ... into scripts/db-integrity-counts.sh so their predicate is FROZEN".

#### auditor-signal-loop-I6 · MEDIUM — EMIT SEQUENCE (E-1/E-2/E-3 + read-back + anti-skip) copy-pasted ~6× across two flow files and already drifted between copies

*Evidence*: docs/agents/system-auditor/flow/main.md:292-328 (Tier-2), main.md:592-628 (Tier-3), main.md:412-416 (D-IMPROVE), main.md:344 (D-BCTC-EVAL), tier1-probe.md:139-171 (Tier-1), tier1-probe.md:86-108 (A-20) — six near-identical blocks; the copies disagree on row type (`data_stale`/`db_integrity_breach` vs `signal_feedback`, see I3). Violates the standing invariant 'shared boilerplate belongs in ONE base skill referenced by agents, never copy-pasted'.

#### auditor-signal-loop-I7 · MEDIUM — Signal lifecycle status set is open-ended: PO writes non-terminal statuses ('DONE', 'processed') that the prune can never evict; ad-hoc aliases already had to be grandfathered

*Evidence*: docs/agents/po/flow/triage-signals.md:18 — "mark signal DONE, skip" (also :19 for ci_red, :14 'mark signal processed'); scripts/orch-cold-evict.sh:87 — `TERMINAL_SIGNAL_STATUSES="...READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED"` (note the already-grandfathered ad-hoc alias). A row set to 'DONE' matches no eviction criterion and parks in hot rows[] forever. orchStateSchema.ts:181 `status: z.string()` enforces nothing.

#### auditor-signal-loop-I8 · MEDIUM — READ→RESOLVED closure is optional — origin_signal_id back-reference is 'SHOULD', so rows orphan and re-park as open decisions (memory-confirmed twice)

*Evidence*: docs/agents/po/flow/triage-signals.md:22 — "any row above that mints a new .task_board entry ... SHOULD stamp the same origin_signal_id field"; memory feedback_signal_row_status_lags_groundtruth: "nobody flipped them to RESOLVED, so they silently re-parked on every recon pass".

#### auditor-signal-loop-I9 · MEDIUM — Flow mandates appending 'DASHBOARD.md rows' but no DASHBOARD.md operation exists in the signal-dashboard protocol — phantom output contract invites confabulated compliance

*Evidence*: docs/agents/system-auditor/flow/main.md:17 — "Append a DASHBOARD.md row per signal-dashboard skill" (also :41, :661, :782 'NEXT: po (via DASHBOARD.md)', tier1-probe.md:157); .claude/skills/signal-dashboard/SKILL.md defines only WRITE/READ/ACK/CLOSE/PRUNE on `.signal_queue.rows[]` — no DASHBOARD.md anywhere. A stray docs/handoffs/DASHBOARD.md exists but is not part of any protocol.

#### auditor-signal-loop-I10 · MEDIUM — signal-dashboard SKILL.md hot path still teaches the pre-wrapper write protocol (manual temp-file-rename + manual CAS), contradicting the CLAUDE.md orch-apply.sh write contract that the protocol body now uses

*Evidence*: .claude/skills/signal-dashboard/SKILL.md:11 — "Every write to orch-state.json MUST use atomic temp-file-then-rename" and :22-24 "Shell/flow code MUST record mtime before read ... Never use bare temp→rename without the CAS guard" — no mention of orch-apply.sh; the actual procedure in dashboard-protocol.md:53 correctly routes `| bash "$PROJECT_ROOT/scripts/orch-apply.sh"`. main.md's inline E-3 snippets (:317 'atomic write, MUST use .signal_queue.rows += [$row]') also never name orch-apply.sh — three doc hops to find the mandatory wrapper. Memory feedback_auditor_orchstate_fulldoc_overwrite_collapses_ssot shows the auditor has clobbered orch-state before.

#### auditor-signal-loop-I11 · MEDIUM — signals.db (binary SQLite) and 1475 processed/*.json are git-tracked and rewritten/unlinked by every drain — perpetual dirty tree plus dozens of churn commits per week

*Evidence*: `git ls-files docs/signals/signals.db` → tracked; `git log --oneline -3 -- docs/signals/signals.db` → "31d4e2701 chore(signals): drain 2026-07-10T20:19Z" (54 commits touching docs/signals/ in 7 days); drain-signals.js:157-160 unlinks processed files >7d (`fs.unlinkSync(path.join(PROC, pf))`) leaving 21 uncommitted `D docs/signals/processed/*.json` in the current worktree (git status). 1475 tracked files / 5.8MB of triple-represented history (files + signals.db + orch cold archive).

#### auditor-signal-loop-I12 · MEDIUM — cowork-team tick telemetry is written into the signal inbox with a non-signal shape — drain permanently skips it, so files accumulate ~50-100/day with no prune path

*Evidence*: docs/signals/cowork-team-20260711T131500Z.json has no from/source/type/signal_type keys (only tick/verdict/severity); scripts/agents-flow/drain-signals.js:76-79 — "SKIP non-signal shape ... leaving in inbox"; ls shows 48 cowork-team-*.json sitting in docs/signals/ dated 07-10→07-11 despite a drain having run 2026-07-11T08:17:32Z (signals.db max processed_at).

#### auditor-signal-loop-I13 · MEDIUM — Tier-1 shell gate narrows coverage to 2 of 5 health endpoints and accepts 'Up (unhealthy)' — the A-20 event-loop-stall class (c103 false-green saga) is invisible while the gate stays green

*Evidence*: scripts/agents-flow/auditor-tier1-probe.sh:14 — "narrowed to the two endpoints named in the WU-3 brief — mcp-server:3000 and frontend:3001"; :139 `Up*) : ;;` — the docker ps case pattern matches 'Up (unhealthy)' as PASS. The A-20 3-probe discriminator (tier1-probe.md:58-84) only runs inside the subagent, which spawns only when this narrowed gate FAILS — so a wedged pdf-extractor with host endpoints up is never audited.

#### auditor-signal-loop-I14 · LOW — NOTE_SIGNALS_DB_DRAIN.md declares the signals.db drain dead — it has been live for a week; migration state is misdocumented

*Evidence*: docs/signals/NOTE_SIGNALS_DB_DRAIN.md:3 — "Status: Dead since 2026-05-22. The signals.db write pipeline ... has not been operational"; but `sqlite3 signals.db 'SELECT max(processed_at)...'` → 2026-07-11T08:17:32Z with 150 rows spanning 07-04→07-11 and drain commits on 07-10.

#### auditor-signal-loop-I15 · LOW — main.md is 787 lines (4x the ≤200L waterfall cap) and every T2/T3 spawn loads all three tiers' instructions; split acknowledged but deferred

*Evidence*: docs/agents/system-auditor/flow/main.md:1 — "size-justification: ~787L — three-tier dispatcher ... Full split to <120L requires Tier-2/Tier-3 extraction sprint — deferred per PO." `wc -l` confirms 787. A Tier-2 spawn reads Tier-3's C-table, D4 prose, and Tier-1 emit blocks it will never execute.

#### auditor-signal-loop-I16 · LOW — Hardcoded structural data inside auditor probe surface: cron schedule and health-endpoint port list bypass system-map.json SSOT

*Evidence*: docs/agents/system-auditor/flow/main.md:165 — "Special case `bctcBatchSweep` (schedule: `0 9 25 1,4,7,10 *`)" hardcoded in prose; docs/agents/system-auditor/probe.sh:31-36 hardcodes `"mcp-server:3000:/health" "api-gateway:4000:/health" ...` while its own header (:5) claims "SSOT: docs/data/system-map.json". Violates 'No hardcoded structural data' invariant.

### Proposals

#### auditor-signal-loop-P2 · impact=high effort=M · **CONFIRMED** — One blessed emit script replaces the 6 copy-pasted EMIT SEQUENCE blocks and gives BUG-dedup a durable ledger

*Addresses*: auditor-signal-loop-I6, auditor-signal-loop-I4, auditor-signal-loop-I10

**Change**: New scripts/emit-audit-signal.sh (pattern proven by scripts/auditor-notebook-commit.sh): args check_id, category-type (microservice_degraded|data_stale|db_integrity_breach|...), severity, summary, detail-JSON. It executes E-1 post_agent_signal via scripts/agents-flow/mcp-call.sh, E-2 send_telegram gated on a NEW deterministic 7d ledger docs/data/auditor-dedup-ledger.json ({dedup_key: last_sent_ts}, tmp+mv write, auto-prunes >7d entries), and E-3 signal_queue row via the dashboard-protocol.md § WRITE pipeline (jq append | bash scripts/orch-apply.sh) + POST-WRITE read-back, emitting marker lines ([emit-signal] OK|SKIP-dedup|ABORT ...). Replace main.md:292-328, main.md:592-628, tier1-probe.md:139-171, tier1-probe.md:86-108 (and the D-IMPROVE/D-BCTC-EVAL row-write snippets) each with a one-line script call + the existing verdict-branch convention. Delete docs/data/system-auditor-known-issues.json (stale since 2026-05-01, unwired) and update its pointers in docs/references/tree-map.md + docs/references/bundles/bundle-architect.md to the new ledger. Shrinks main.md by ~120-150L and makes dedup/read-back non-narratable.

*Files*: scripts/emit-audit-signal.sh (new), docs/agents/system-auditor/flow/main.md, docs/agents/system-auditor/flow/tier1-probe.md, docs/data/auditor-dedup-ledger.json (new), docs/data/system-auditor-known-issues.json (delete), docs/references/tree-map.md, docs/references/bundles/bundle-architect.md

*Risk*: mcp-call.sh transport must be reachable from the auditor context (already used by dev-team preflight scripts); script must fail-loud so a transport outage never silently drops E-1.

*Verifier*: All cited evidence verified line-exact: six copy-pasted EMIT SEQUENCE blocks at main.md:292-328/592-628/412-416/344 and tier1-probe.md:139-171/86-108, with real inter-copy drift (row type signal_feedback vs data_stale vs db_integrity_breach); main.md:661 names a 7d BUG-dedup rule with no durable store while main.md:706 caps the notebook at 3 sections (LLM recall cannot span 7d); known-issues.json is stale (all last_reported 2026-05-01) with duplicate fingerprints at exactly lines 151/183 and 163/191 and no flow file reads it; signal-dashboard SKILL.md:11/:16-24 hot path still teaches pre-wrapper manual temp+rename+CAS while dashboard-protocol.md routes via orch-apply.sh. Not already implemented or queued: scripts/emit-audit-signal.sh and auditor-dedup-ledger.json absent; no equivalent board row (NB-AUDITOR-MAIN-SPLIT/TE-T06 is a size-split, different work — coordinate on pickup). No invariant violations — the change ENFORCES two invariants (orch-state writes via orch-apply.sh, shared boilerplate in ONE place); mcp-call.sh is the established architect-blessed bash transport already used by auditor-notebook-commit.sh. Concrete enough to hand to a dev agent as written. Two implementation notes for the executor: (1) scripts/agents-flow/context-bloat-backstop.sh:185-203 reads known-issues.json as a fingerprint-suppression gate — deletion is runtime-safe (file-existence guard, 0 matching fingerprints ever) but update that script's dead gate and comments in the same commit to avoid a dangling pointer; (2) replacing multi-line flow blocks is exposed to the known Edit-tool multiline-strip harness bug — use Write-based replacement and verify with git diff.

#### auditor-signal-loop-P3 · impact=high effort=M · **RESCOPE** — Freeze Tier-2/3 predicates into a deterministic checks script — extend the proven db-integrity-counts.sh pattern to C-01..C-16, B-05 gate, B-09, B-13, C-06/07

*Addresses*: auditor-signal-loop-I5, auditor-signal-loop-I15

**Change**: New scripts/auditor-db-checks.sh mirroring scripts/db-integrity-counts.sh discipline (read-only, probe-failure guard, fail-loud): embeds the exact SQL from main.md:567-584 plus the B-05 healthy-idle gate (main.md:219-238), computes the weekend WINDOW and long-form datetime modifiers in bash (killing the narrated NULL-guard at main.md:560-565), and prints one JSON line per check: {check_id, actual, expected, verdict: PASS|FAIL|SKIP-invalid}. main.md §Tier-3 'DB Write Integrity Checks' table is replaced by: run script → paste verbatim output under RAW-CHECKS: fenced block (same fence discipline as RAW-PROBE) → call scripts/emit-audit-signal.sh per FAIL row. This structurally closes the predicate-drift, inverted-predicate, and NULL-modifier FP classes: the LLM never authors SQL, so it cannot widen a WHERE clause between ticks.

*Files*: scripts/auditor-db-checks.sh (new), docs/agents/system-auditor/flow/main.md

*Risk*: Threshold changes now require a script edit + commit instead of a doc edit — that is the point (frozen), but note it in the script header; keep thresholds sourced from system-map.json where they already live (stale_threshold_hours).

*Verifier*: Evidence fully verified at HEAD (787L confirmed; C-table :567-584, NULL-guard :560-565, B-05 gate :212-238, B-09 :264-275, B-13 :277-288, db-integrity-counts.sh:2-4 verbatim; line-1 FIX-chain quote matches the 07-12 revision — purged from the header by TE-T13 commit bf808eede on 07-13, but the accreted-per-incident pattern still holds via inline FIX markers and three queued per-check patch rows). Not already implemented or queued: no auditor-db-checks.sh exists, and queued rows FIX-AUDITOR-C06/C11/C12 are per-symptom patches, not a structural freeze; memory feedback_auditor_predicate_drift_false_regression explicitly names this pattern as the durable fix. No invariant violations. However, as written it is not safely handable to a dev agent: (a) it references scripts/emit-audit-signal.sh, created only by sibling proposal auditor-signal-loop-P2 and absent from this proposal's FILES — standalone implementation ships a dangling script reference; (b) "embeds the exact SQL" would freeze C-11's known-always-false-fail predicate (FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE) and C-06's off-market FP (FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE) verbatim — perpetuating the FP classes it claims to close; (c) "mirroring db-integrity-counts.sh" invites copying its file:?immutable=1 WAL-blind open pattern, which false-FAILs freshness checks C-01/C-02/C-06/C-07 (feedback_integrity_helper_readonly_wal_blinded). All three are one-paragraph corrections to a sound, evidence-backed core.

*Rescope*: New scripts/auditor-db-checks.sh mirroring scripts/db-integrity-counts.sh DISCIPLINE ONLY (read-only, probe-failure guard, fail-loud, verbatim JSON output) — NOT its file:?immutable=1 open pattern, which is WAL-blind and would false-FAIL freshness checks C-01/C-02/C-06/C-07; use the in-container pattern the C-table already mandates: docker exec "$MCP_CTR" bun -e with {readonly:true} (container resolved via docker ps | grep mcp-server, abort-to-SKIP if empty). Embeds the SQL from main.md:567-584 and B-09 (main.md:264-275) / B-13 (main.md:277-288) plus the B-05 healthy-idle gate (main.md:212-238, taking VPS-host-liveness as a CLI arg from Tier-1 output), computing the weekend WINDOW (main.md:549-558) and long-form datetime modifiers in bash (killing the narrated NULL-guard at main.md:560-565). At freeze time, fold in — do not copy verbatim — the two queued predicate corrections: FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE (status enum + ISO-8601 strcompare fix) and FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE (market-hours-aware window); repoint those backlog rows at the script as the new predicate SSOT. Thresholds already in system-map.json (stale_threshold_hours) stay sourced from there via jq — never hardcoded. Output: one JSON line per check {check_id, actual, expected, verdict: PASS|FAIL|SKIP-invalid}. main.md §Tier-3 'DB Write Integrity Checks' table and the Tier-2 B-05/B-09/B-13 SQL blocks are each replaced by: run script → paste verbatim stdout under a RAW-CHECKS: fenced block (same fence discipline as RAW-PROBE, main.md:149) → per FAIL row run the existing EMIT SEQUENCE E-1..E-3 (main.md:592-628); switch that per-FAIL step to a one-line scripts/emit-audit-signal.sh call ONLY if/when sibling proposal auditor-signal-loop-P2 lands (explicit dependency — P3 must be implementable standalone). FILES: scripts/auditor-db-checks.sh (new), docs/agents/system-auditor/flow/main.md; coordinate with (do not block on) TE-T06/NB-AUDITOR-MAIN-SPLIT, which the resulting ~80-100L shrink simplifies.

#### auditor-signal-loop-P1 · impact=high effort=S · **CONFIRMED** — Fix the self-defeating T2/T3 gate: gate on the PREVIOUS subagent-written heartbeat, and move tier-2/3 heartbeat authorship into the subagent's end-of-cycle

*Addresses*: auditor-signal-loop-I1

**Change**: In scripts/agents-flow/auditor-tier1-probe.sh run_tiered_probe(): (a) read docs/data/auditor-tier<N>-last-healthy.json .last_healthy_at BEFORE calling run_probe() and compute age from that pre-existing value; (b) stop letting run_probe() write the tier-2/3 heartbeat (suppress _write_heartbeat when tier != 1, e.g. pass a flag or point HEARTBEAT_FILE at /dev/null for the inner call). In docs/agents/system-auditor/flow/main.md end-of-cycle (after the notebook-commit step, before P3 fire-election release): add one bash line writing docs/data/auditor-tier${AUDIT_TIER}-last-healthy.json via tmp+mv when AUDIT_TIER ∈ {2,3}. Result: SKIP-SPAWN only when a real T2/T3 audit completed within threshold (8h/48h); shell-check failure still spawns immediately; the dead 'ALL_GREEN + stale heartbeat' branch becomes reachable and meaningful. Update the Job 3/4 prompt text in .claude/skills/cron-detect-loop/SKILL.md only if field names change (they don't). Add a test case to auditor-tier1-probe.test.sh: green checks + heartbeat older than threshold must exit 1/SPAWN.

*Files*: scripts/agents-flow/auditor-tier1-probe.sh, scripts/agents-flow/auditor-tier1-probe.test.sh, docs/agents/system-auditor/flow/main.md

*Risk*: T2/T3 subagents resume spawning up to 3/day and 0.5/day respectively — restores their token cost (~787L flow read per spawn); bounded and intended.

*Verifier*: Diagnosis verified verbatim in scripts/agents-flow/auditor-tier1-probe.sh: on green checks run_probe() writes the tier heartbeat with ts=now and returns lh=$ts (L286-298; the cited ALL_GREEN jq is at L294-296, ~6 lines off the cited 288-290), then run_tiered_probe() computes age from that same just-written value (L380-388) — age is always ~0, so SKIP-SPAWN is unconditional on green and the 'ALL_GREEN + stale heartbeat → SPAWN' branch (L389-390) is dead code. Register.md Jobs 3/4 gate spawning solely on the script's exit code, so T2/T3 subagents (B-xx freshness, C-01..C-16, D-*, anomaly-task-bridge — ATB-0 skips tier 1, SKILL.md:27 confirmed) never run while runtime looks green. Field evidence corroborates: last real audit in system-auditor notebook is c396 2026-07-04T05:15:40Z Tier-1 (the day the tier23 script shipped); auditor-tier3-last-healthy.json does not exist; docs/agents/system-auditor/flow/main.md has no heartbeat write. One stale evidence detail does not refute: tier2 heartbeat now reads 2026-07-12T06:20:01Z (not 'frozen at 07-04T18:45:44Z') — but it was refreshed by the script itself with no real T2 audit in the notebook, which PROVES the self-write conflation. No equivalent fix implemented or queued (task board scanned all lanes; TE-T06 splits main.md but doesn't touch the gate). No standing-invariant violations. Four implementation caveats the dev agent MUST honor: (1) suppress the inner write via an explicit flag/env — NOT HEARTBEAT_FILE=/dev/null: _write_heartbeat's mktemp/jq would try to create /dev/null.tmp.* in /dev, fail for non-root, and downgrade every green run to FAILURE→SPAWN (opposite failure mode); (2) existing tests T16/T17/T22 assert no-delta re-invocation ⇒ SKIP-SPAWN under the current self-write regime — they must be updated to pre-seed a fresh heartbeat fixture, in addition to the new green+stale⇒SPAWN case, or the suite goes red; (3) the Job 3/4 prompt bodies live in .claude/skills/cron-detect-loop/register.md (L102/L118), not SKILL.md (lazy-load split) — still no text change needed since field names are unchanged; (4) coordinate the main.md end-of-cycle edit with backlog row TE-T06 (787L Tier-2/3 sub-flow split) so the heartbeat-write line lands in whichever file owns end-of-cycle after the split, and beware the known Edit-tool multiline-strip harness bug when editing the flow doc.

#### auditor-signal-loop-P5 · impact=high effort=S · **RESCOPE** — Canonicalize signal types and statuses: fix the Tier-1 type mismatch, register the live type set, replace 'mark signal DONE', and make READ→RESOLVED closure mandatory

*Addresses*: auditor-signal-loop-I3, auditor-signal-loop-I7, auditor-signal-loop-I8

**Change**: (1) tier1-probe.md:162 and :104 — change row `"type": "signal_feedback"` → `"type": "microservice_degraded"` (matches ATB filter at anomaly-task-bridge/SKILL.md:31 and D1 dedup namespace in audit-dimensions.md). (2) .claude/skills/signal-dashboard/SKILL.md §Signal types table — add the live types: microservice_degraded, data_stale, db_integrity_breach, repair_task_request, improvement_proposal, ci_red, auto-push-abort (currently only 6 legacy types listed). (3) docs/agents/po/flow/triage-signals.md:18 and :19 — replace 'mark signal DONE' with 'flip row status → RESOLVED per signal-dashboard § CLOSE' and :14 'mark signal processed' likewise; (4) triage-signals.md:22 — change 'SHOULD stamp the same origin_signal_id' to 'MUST stamp'. (5) After one cold-evict pass confirms no stray statuses remain, tighten orchStateSchema.ts SignalRowSchema.status to z.enum(["NEW","READ","RESOLVED","SUPERSEDED"]) (keep severity as string per its legacy note).

*Files*: docs/agents/system-auditor/flow/tier1-probe.md, .claude/skills/signal-dashboard/SKILL.md, docs/agents/po/flow/triage-signals.md, apps/mcp-server/src/infrastructure/orchStateSchema.ts

*Risk*: Zod enum tightening (step 5) can hard-fail orch-apply on any legacy row still in flight — do it last, gated on a clean rows[] scan; steps 1-4 are pure doc edits with no runtime risk.

*Verifier*: Evidence 100% verified on disk: tier1-probe.md:162/:104 row type "signal_feedback" (while sibling Tier-2/3 templates in system-auditor/flow/main.md:319/:414/:619 already use data_stale/improvement_proposal/db_integrity_breach — Tier-1 is the lone outlier); anomaly-task-bridge/SKILL.md:31 filter {microservice_degraded, data_stale, db_integrity_breach, system_issue} can never match Tier-1 rows, so container-down CRITICALs never bridge; audit-dimensions.md:18 D1 namespace = microservice_degraded; signal-dashboard SKILL.md §Signal types lists only 6 legacy types; triage-signals.md:14/:18/:19 "mark signal processed"/"mark signal DONE" (DONE is non-terminal — orch-cold-evict.sh:87 TERMINAL_SIGNAL_STATUSES=READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED); :22 "SHOULD stamp"; orchStateSchema.ts status/type = z.string(). Not already done or queued: all defects live right now; this is ultracode brief P5 (line 1148, UNVERIFIED) — no equivalent board row exists; prior decision CLEAN-AUDITOR-DOC-SIGNAL-TYPES (bab66a03, router-d98 jq) is NOT a conflict — it froze the post_agent_signal API signal_type=signal_feedback (agentSignalStore.ts enum) while explicitly leaving signal_queue row type free-form category, which is exactly the surface items (1)-(2) touch; PO's own scripts-registry (po-s137) already treats NEW/READ→RESOLVED as the canonical close, so item (3) aligns doc with established practice. Items (1)-(4) CONFIRMED as written. Item (5) is REFUTED as specified: z.enum(["NEW","READ","RESOLVED","SUPERSEDED"]) omits TRIAGED — a documented ACTIVE status (system-auditor handlers.md:240 "hot file contains ONLY active rows (status NEW or TRIAGED...)"; scripts-registry.md:41 status-guard "NOT TRIAGED" = deliberately non-terminal) — and omits ACUTE-RESOLVED-ROOT-TRACKED, still live vocabulary (evict terminal list + cron-db-data-integrity.md:130 already-open dedup guard reads it). Since orch-apply.sh Zod-validates the whole doc on every write, one legitimate TRIAGED flip after tightening would hard-reject ALL subsequent orch-state writes (project_mcp_server_write_wedge class). Worse, the stated precondition "after one cold-evict pass confirms no stray statuses remain" cannot detect a TRIAGED row at all: evict only removes TERMINAL rows older than 24h; non-terminal strays are invisible to it. Corrected item (5) in rescope.

*Rescope*: Canonicalize signal types and statuses. Items (1)-(4) unchanged from the original proposal: (1) tier1-probe.md:162 and :104 — change row "type": "signal_feedback" → "type": "microservice_degraded" (row type only; do NOT touch the post_agent_signal signal_type fields at :91/:144 — signal_feedback is the frozen live API enum per CLEAN-AUDITOR-DOC-SIGNAL-TYPES bab66a03). (2) .claude/skills/signal-dashboard/SKILL.md §Signal types — add the live types microservice_degraded, data_stale, db_integrity_breach, repair_task_request, improvement_proposal, ci_red, auto-push-abort; bump the size-justification header (119L→~126L, under the 200L .claude/skills cap in docs/data/file-size-caps.json). (3) triage-signals.md:18/:19 — replace 'mark signal DONE' with 'flip the originating signal_queue row status → RESOLVED per signal-dashboard § CLOSE (resolve row id per drain-signals.md §0a-D; if no row is resolvable — file-bus-only signal — log and skip the flip)'; :14 'mark signal processed' likewise with the same no-row guard (zone_missing_tier3 arrives via file bus and may have no queue row). (4) triage-signals.md:22 — 'SHOULD stamp' → 'MUST stamp' (the row-18 resolution rule's 'omit if neither resolvable — never blocks task creation' fallback stays, so MUST = must-stamp-when-resolvable). (5) CORRECTED: tighten orchStateSchema.ts SignalRowSchema.status to z.enum(["NEW","READ","TRIAGED","RESOLVED","SUPERSEDED","ACUTE-RESOLVED-ROOT-TRACKED"]) — the full live vocabulary: TRIAGED is a documented active status (system-auditor handlers.md:240, po scripts-registry.md:41) and ACUTE-RESOLVED-ROOT-TRACKED is grandfathered-live (orch-cold-evict.sh:87, cron-db-data-integrity.md:130). Precondition replaced: instead of 'one cold-evict pass', run a direct hot-file assertion jq '[.signal_queue.rows[].status] - ["NEW","READ","TRIAGED","RESOLVED","SUPERSEDED","ACUTE-RESOLVED-ROOT-TRACKED"] | length == 0' docs/data/orch/orch-state.json (must be true; cold-evict cannot surface non-terminal strays) AND grep flow docs for any other status writer before shipping the enum. Keep severity as z.string() per its legacy note. Mirror the task-enum precedent: nuance goes in a side field, never new status strings. Files: docs/agents/system-auditor/flow/tier1-probe.md, .claude/skills/signal-dashboard/SKILL.md, docs/agents/po/flow/triage-signals.md, apps/mcp-server/src/infrastructure/orchStateSchema.ts. Implementation notes (non-blocking): use Write or single-line Edits on the .md files (known Edit-hook multiline-strip bug); apply agent-md-factory pre/post-edit discipline; schema change requires mcp-server rebuild — delegate the container swap to ops per the user-gated-swaps standing override.

#### auditor-signal-loop-P7 · impact=medium effort=M · **UNVERIFIED** — Finish the signals.db migration: untrack the binary DB and processed/ file mirror from git, correct the stale drain note, and route cowork tick telemetry out of the signal inbox

*Addresses*: auditor-signal-loop-I11, auditor-signal-loop-I12, auditor-signal-loop-I14

**Change**: (1) Add docs/signals/signals.db and docs/signals/processed/ to .gitignore; `git rm --cached` them (files stay on disk — payload_ref pointers keep resolving; signals.db is a 7-day rolling dedup index, its history has no replay value and full signal history already lives in docs/data/orch/archive/YYYY-MM.json). Update docs/agents/dev-team/flow/drain-signals.md commit step to stop committing them. (2) Rewrite docs/signals/NOTE_SIGNALS_DB_DRAIN.md: drain live again since ~2026-07-04 (state the fingerprint-dedup + 7d prune contract). (3) Move cowork-team tick telemetry out of docs/signals/: change the cowork dispatcher's tick-report write target to docs/data/cowork-ticks/ (or give the writer a self-pruning ring of N files) so the drain's non-signal-shape guard stops accumulating ~50-100 undrainable files/day in the inbox; sweep the current 48 stragglers once.

*Files*: .gitignore, docs/signals/NOTE_SIGNALS_DB_DRAIN.md, docs/agents/dev-team/flow/drain-signals.md, cowork dispatcher tick-report writer (per .claude/skills/cron-cowork-team/SKILL.md)

*Risk*: Any doc citing a docs/signals/processed/*.json path as evidence (several cowork escalation notes do) still resolves on the local disk but no longer via git history — acceptable since the 7d unlink prune already breaks those pointers today; cowork tick-writer change touches the cowork dispatcher flow, coordinate with cowork-team lane owner.

#### auditor-signal-loop-P6 · impact=medium effort=S · **CONFIRMED** — Purge the DASHBOARD.md phantom protocol from the auditor flow and align SKILL.md hot-path write text with the orch-apply contract

*Addresses*: auditor-signal-loop-I9, auditor-signal-loop-I10

**Change**: (1) docs/agents/system-auditor/flow/main.md:17, :41, :661, :782 and tier1-probe.md:157 — replace every 'DASHBOARD.md row' mandate with 'signal_queue row (E-3)' and change the RETURN 'NEXT: po (via DASHBOARD.md)' to 'NEXT: po (via signal_queue)'; the Telegram message text '— see DASHBOARD.md' becomes '— see signal_queue'. (2) .claude/skills/signal-dashboard/SKILL.md:11 — replace 'MUST use atomic temp-file-then-rename' with 'MUST route through scripts/orch-apply.sh (Zod + dup-key + CAS + atomic rename) — see dashboard-protocol.md § WRITE', and trim the :22-24 manual-CAS instruction to 'orch-apply.sh provides the CAS guard; TS code uses appendSignalQueueRow()'.

*Files*: docs/agents/system-auditor/flow/main.md, docs/agents/system-auditor/flow/tier1-probe.md, .claude/skills/signal-dashboard/SKILL.md

*Risk*: None functional — removes instructions that cannot be executed as written; check docs/handoffs/DASHBOARD.md for any live consumer before declaring it orphaned (none found in the auditor loop).

*Verifier*: All cited evidence verified live and exact: main.md:17/:41/:661/:782 and tier1-probe.md:157 carry the DASHBOARD.md mandates verbatim; signal-dashboard SKILL.md:11 mandates bare temp-file-then-rename and :13-24 teaches manual mtime-CAS with zero mention of orch-apply.sh, while dashboard-protocol.md § WRITE (step 4) correctly pipes through scripts/orch-apply.sh — the hot path and procedure genuinely contradict. Phantom claim substantiated: the skill defines only WRITE/READ/ACK/CLOSE/PRUNE on .signal_queue.rows[]; docs/handoffs/DASHBOARD.md is a 281-byte stray (one 07-02 row) with no live consumer — dev-team's '0a-D DASHBOARD.md cross-team drain' actually reads .signal_queue.rows[], tran-ngoc-bau bootstrap gracefully skips it. Replacement text is accurate: orch-apply.sh verifiably implements CAS-mtime (capture-before-read, re-check-before-rename, exit 2 on mismatch) + Zod/dup-key via orch-validate.mjs + atomic rename, and the trim preserves the TS appendSignalQueueRow() path; '(E-3)' is a real anchor (main.md:316/:616/:668). Not already implemented or queued: references still live, no matching task_board backlog row; this is audit item auditor-signal-loop-P6 (UNVERIFIED) being verified, not a duplicate. No standing-invariant violation — it aligns the last contradicting doc with the SSOT-W1 orch-apply contract, for a detector with a prior orch-state fulldoc-clobber incident. Concrete file:line substitutions, hand-off ready. Non-blocking notes for the implementer (same-commit sweep recommended, does not invalidate the proposal): (1) docs/agents/system-auditor/init.md:47/:81/:92/:139 carry the same phantom DASHBOARD.md mandate in the same agent — purge under agent-md-factory discipline or the agent definition will contradict the fixed flow; (2) main.md:786 OUTPUT-CONTRACT 'dashboard_rows=N' counter becomes meaningless after the purge — drop or fold into signal_queue_rows_written; (3) stale labels in dev-team/flow/main.md:67 and agents-architect/flow/main.md:22 are separate-file drift of the same class (likely covered by sibling audit items, e.g. dev-team-loop-I6); (4) beware the known Edit-tool multiline-strip harness bug when applying the multi-line SKILL.md:22-24 trim.

#### auditor-signal-loop-P8 · impact=medium effort=S · **UNVERIFIED** — Widen the Tier-1 shell gate to real coverage: all system-map health endpoints, docker health-state (not just 'Up'), and the A-20 in-container multi-probe

*Addresses*: auditor-signal-loop-I13, auditor-signal-loop-I16

**Change**: In scripts/agents-flow/auditor-tier1-probe.sh: (1) replace the hardcoded 3000/3001 pair with a loop over health-endpoint entries read from docs/data/system-map.json (same host_runtime_set SSOT the script already parses for docker ps — also fixes the probe.sh:31-36 hardcode by making system-map the single port source both scripts read); (2) change the `Up*)` case at :139 to fail on `Up*(unhealthy)*`; (3) fold in the A-20 3-probe majority check already scripted in docs/agents/system-auditor/probe.sh (docker exec curl ×3, pass_count≥2) so an event-loop wedge flips the gate to FAILURE and spawns the subagent. Also fix main.md:165 — read bctcBatchSweep's schedule from get_cron_health/cron-registry instead of the hardcoded `0 9 25 1,4,7,10 *` literal.

*Files*: scripts/agents-flow/auditor-tier1-probe.sh, scripts/agents-flow/auditor-tier1-probe.test.sh, docs/agents/system-auditor/probe.sh, docs/agents/system-auditor/flow/main.md

*Risk*: A-20 probes add ~10-15s to every 30-min tick (3× docker exec with 5s spacing) — within the 120s Tier-1 budget; unhealthy-state check could fire on containers mid-healthcheck-warmup, so keep the existing FAIL-OPEN spawn semantics (spawned subagent applies the finer verdict).


## Domain: memory-docs-hygiene

### Issues

#### memory-docs-hygiene-I1 · HIGH — Test suite pollutes live docs/agent-memory/sessions/ with byte-identical stale stubs every run (94 files, 29 identical developer stubs)

Every full test run mints 3-4 new dated stub files with frozen 1300b/1540 content into the LIVE sessions dir. This is the direct cause of the sessions dir growing ~3 files/day, and creates daily untracked-file churn (see git status ?? entries), feeding the known perpetual-dirty-tree push blockage pattern (feedback_push_blocked_by_perpetual_dirty_tree).

*Evidence*: apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts:60 "task_name: \"Task 1300b: Memory Update Tools\"" — the test calls the real tool handler, which writes via writeFileSync at apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts:267 "writeFileSync(sessionFilePath, fileContent, \"utf-8\")" into getProjectRoot()/docs/agent-memory/sessions/. Result: docs/agent-memory/sessions/2026-07-11-developer.md contains "### Task: Task 1300b: Memory Update Tools" and md5 is identical (35d6330b...) across 29 dated developer stubs from 2026-06-10 through 2026-07-11; 94 dev/ops/qa/router stub files total.

#### memory-docs-hygiene-I2 · HIGH — ops.md notebook at 701 lines — 3.5x the 200L cap; cap is bypassable via Bash writes because the prune hook only fires on Write|Edit

The strongest memory-governance rule in the system (notebooks <=200L) has a hole: any agent that writes its notebook with cat >> instead of the Edit tool escapes both the AC-5 blocking gate and the hook backstop. ops did exactly this during the 07-11 Docker incident and the file is now 701L, costing ~8-10k tokens per notebook-read at every ops session start.

*Evidence*: wc -l docs/agent-memory/notebooks/ops.md = 701 (cap 200 per docs/data/file-size-caps.json pattern "docs/agent-memory/notebooks/*.md", "cap": 200). scripts/agents-flow/notebook-auto-prune.sh:2 "PostToolUse backstop hook (Write|Edit)" — the PostToolUse Bash matcher in .claude/settings.local.json runs only orch-state-hook-bash-backstop.sh, so notebook appends done via bash heredoc (ops incident logging, e.g. ops.md:629 "# After system restart:" — raw shell text inside the notebook) never trigger the prune.

#### memory-docs-hygiene-I3 · HIGH — No pruning automation for docs/agent-memory/sessions/ — 199 files / 1.5MB; the only retention policy covers lsof logs only

sessions/ only ever grows: test stubs (I1), WORK.md trims, one-off session notes, and runtime logs all land there and nothing evicts. agents-architect/handlers.md:68 tells agents to read "recent sessions (last 3 days)" from this dir, so listing cost grows linearly forever.

*Evidence*: docs/agent-memory/sessions/archive/.retention.md:3 "## preflight-lsof-*.log (HEAD.lock diagnostics)" / :5 "**Retention:** Last 7 days" — scoped to one log family. Meanwhile .claude/skills/doc-heal-system/phases.md:69 "| `docs/WORK.md` | unbounded but compact | Trim entries older than 14 days to `docs/agent-memory/sessions/` |" makes sessions/ a dump destination with no downstream pruner. Dir count: 199 files, du 1.5M.

#### memory-docs-hygiene-I4 · HIGH — Sprint decision-journal archival is promised in the caps SSOT but never implemented — 434 files / 3.8MB in decisions/, docs/archive/decisions/ is empty

decision-journal (MANDATORY one entry per task) writes forever into a directory nothing drains. The pm sprint-close flow that the SSOT names as the archiver has no such step, so the promised lifecycle exists only on paper. 3.8MB of markdown accumulates where agents glob for context.

*Evidence*: docs/data/file-size-caps.json (sprint-decision-journal entry) "_note": "... Archived → docs/archive/decisions/ at sprint close by pm." — but `ls docs/archive/decisions/ | wc -l` = 0, decisions/ holds 434 files (390 sprint-*.md), and docs/agents/pm/flow/task-archive.md archives only orch-state sprints/tasks ("cold-evicted to `docs/data/orch/archive/YYYY-MM.json`", line 10) with no decision-journal step.

#### memory-docs-hygiene-I5 · MEDIUM — po-decisions.md is an ungoverned 68KB monolith outside both the cap pattern and the journal naming convention

PO's rolling decision log escapes the 600L journal cap and the context-bloat hook (pattern miss). It is actively referenced by other agents (ops.md:574 "PO decision reference: docs/agent-memory/decisions/po-decisions.md"), so full reads cost ~17k tokens and grow unbounded.

*Evidence*: docs/agent-memory/decisions/po-decisions.md — 68761 bytes / 273 lines (avg ~250 chars/line; single entries exceed 1,000 words, e.g. line 2 "## agent_signals verified_decision empty-payload + null-stock_code triage — DECISION (2026-06-25, po-s117)..."). The governed cap pattern is only "docs/agent-memory/decisions/sprint-*.md" (file-size-caps.json), and decision-journal SKILL.md:23 mandates JOURNAL_PATH="docs/agent-memory/decisions/sprint-${SPRINT_ID}-${AGENT_ID}.md" — po-decisions.md matches neither.

#### memory-docs-hygiene-I6 · MEDIUM — Deprecated append-session-record skill is still cataloged as active, and its MCP tool is still registered and shipping

Dead skill with a live catalog row misroutes any dev-team agent that consults the registration guide, and the still-registered append_session_record MCP tool is the write path the polluting test exercises (I1). Nothing in flows calls the tool anymore (zero flow references found) — it is dead weight plus an active pollution vector.

*Evidence*: .claude/skills/append-session-record/SKILL.md:4 "DEPRECATED — use cowork-end-cycle skill instead." vs docs/guides/guide-skills-registration.md:16 "| append-session-record | `.claude/skills/append-session-record/SKILL.md` | Dev team | Before handoff |" (listed as live, no deprecation flag). Server side: apps/mcp-server/src/interface/mcp/tools/registry.ts:216 "registerAgentMemoryUpdateTools,  // Task 1300b: append_session_record + update_memory_file (+2 tools → 107)".

#### memory-docs-hygiene-I7 · MEDIUM — Cowork end-of-cycle performs two separate writes + commits to the SAME notebook file (session-log-cowork then notebook-write)

The historical sessions→notebook merge left two write paths targeting the same file per cycle: two section formats ("## Cycle — HH:MM UTC" vs "## c<NNN> · <ISO>"), two commits, doubled PostToolUse hook fires, and doubled exposure to the known concurrent-commit race (feedback_concurrent_commit_race) across 12+ flows that chain cowork-end-cycle.

*Evidence*: .claude/skills/cowork-end-cycle/SKILL.md:13-14 "1. **Session log** → skill: `.claude/skills/session-log-cowork/SKILL.md`\n2. **Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`" — session-log-cowork:10 appends to "docs/agent-memory/notebooks/<agent-id>.md" and commits (lines 26-28), then notebook-write appends ANOTHER section, prunes, and commits again (§ Commit F4).

#### memory-docs-hygiene-I8 · MEDIUM — Token-economy enforcement is advisory-only — the only mechanism is 'PO flags at sign-off'

Every size rule that IS hook-enforced (notebooks, skills, flows) holds roughly; the one that is purely advisory (handoff/RETURN compression) shows the worst growth surface in the repo (11MB of handoffs). Advisory tiering with zero deterministic backstop = no enforcement in an autonomous fleet.

*Evidence*: .claude/skills/token-economy/SKILL.md:69 "Agents violating compression (e.g. pasting full file contents into RETURN block) flagged by PO at sign-off. Repeat violations → architect review of agent prompt." No hook or gate checks tier compliance; the FULL-tier rule "Max 400 words per handoff body" (line 25) has no cap entry in docs/data/file-size-caps.json (no docs/handoffs pattern), while docs/handoffs/ holds 972 files / 11MB.

#### memory-docs-hygiene-I9 · LOW — Stray untracked debug directory .test-notebook-prune-debug/ at repo root

Leftover debug fixture from developing the notebook-auto-prune regression test; the shipped test writes into notebooks/ with a trap-rm cleanup, so this root-level dir is orphaned debris that keeps the tree dirty.

*Evidence*: .test-notebook-prune-debug/test.md:3 "## OLDEST-SECTION-001 · 2026-07-01T10:00:00Z" — identical marker to scripts/agents-flow/test-notebook-auto-prune.sh:88 "echo \"## OLDEST-SECTION-001 · 2026-07-01T10:00:00Z\"". Dir is untracked (git status "?? .test-notebook-prune-debug/"), single 4KB file dated 07-11 04:52.

#### memory-docs-hygiene-I10 · LOW — AC-2 'keep last 3 sections' retention rule is not followed in practice — qa.md holds 12 sections

The binding constraint agents actually observe is the 200L cap (hook-enforced); the 3-section rule is dead letter. Spec/practice divergence invites doc-self-heal churn and confuses composing agents about what to prune.

*Evidence*: .claude/skills/notebook-write/SKILL.md:30 "Keep: current cycle + 2 prior `## ` sections = last 3 total." vs docs/agent-memory/notebooks/qa.md which contains 12 "^## cycle-" sections (cycle-432 through cycle-442, e.g. qa.md:3 "## cycle-432 · 2026-07-10 · CI-RED-1a8c1bff-FIX — APPROVED, DONE") at 93L total.

#### memory-docs-hygiene-I11 · LOW — Per-task notebook file breaks the one-notebook-per-agent convention

Dated variants are never read by notebook-read (which resolves <agent-id>.md) and never pruned away, so carry-over context silently forks and orphaned files accumulate in the governed dir.

*Evidence*: docs/agent-memory/notebooks/cowork-refactory-expert-2026-07-11-fr1-atomic.md (68L) exists alongside docs/agent-memory/notebooks/cowork-refactory-expert.md (68L); notebook-write SKILL.md:11 defines the path as "docs/agent-memory/notebooks/<agent-id>.md" — no dated per-task variant.

#### memory-docs-hygiene-I12 · LOW — Dead memory debris: legacy session-logs/ dir, 122 stale health recheck files (writer dead since 06-23), root-level scheduled-task-execution files

Three separate dead accumulations totaling ~2.1MB that no janitor sweep covers. The health/ case also matches the composite-masks-dead-detector pattern: files stopped appearing and nothing noticed.

*Evidence*: docs/agent-memory/session-logs/ holds 5 files from May ("market-watcher-2026-05-15.md" ...) duplicating the sessions/ concept; docs/agent-memory/health/ holds 122 team-tool-recheck-*.md (2.0MB) with the newest being "team-tool-recheck-2026-06-23-1608.md" — generator silent for 18 days; docs/agent-memory/scheduled-task-execution-2026-05-07-01-08.md (+2 siblings) sit at the agent-memory root untouched since May 20.

#### memory-docs-hygiene-I13 · LOW — Runtime launchd logs are written inside the docs/ tree (sessions dir)

Machine log files interleaved with agent memory markdown keep the sessions dir permanently dirty in git and get swept into any agent that globs *.md-adjacent context. Logs belong outside the docs knowledge tree (or at minimum in .gitignore).

*Evidence*: scripts/agents-flow/cowork-guaranteed-slot-firer.sh:93-94 "LOG_FILE=...docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log" / "LOG_ERR_FILE=...cowork-guaranteed-slot-firer-error.log"; docs/standards/cron-jobs.md:210 documents the same path. git status shows "?? docs/agent-memory/sessions/cowork-guaranteed-slot-firer-error.log".

#### memory-docs-hygiene-I14 · LOW — Compression-tier semantics defined in two skills (caveman and token-economy Part 3) — copy-paste SSOT drift risk

Two independently-maintained definitions of the same three tiers violate the shared-boilerplate-in-ONE-base-skill invariant; caveman has since grown zone dictionaries that token-economy knows nothing about. Note: doc-self-heal vs doc-heal-system, by contrast, are NOT overlapping — their boundary is explicitly documented (doc-heal-system SKILL.md:7-8 "Differs from `doc-self-heal` (per-agent, end-of-cycle, files touched this cycle only) by scanning the entire subtree").

*Evidence*: .claude/skills/token-economy/SKILL.md:24 "| ULTRA | caveman | ~75% | Inter-agent pings... | `KEY: value` pairs or 1-line imperative only..." duplicates the level semantics that .claude/skills/caveman/SKILL.md:36-41 defines in its own Intensity table ("| **ultra** | Abbreviate (DB/auth/config...)"). Both files carry independent 'when to use each level' tables.

### Proposals

#### memory-docs-hygiene-P1 · impact=high effort=S · **RESCOPE** — Sandbox the 1300b memory-tools test so it stops writing into the live docs tree

*Addresses*: memory-docs-hygiene-I1, memory-docs-hygiene-I3

**Change**: In apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts beforeEach, point the write root at a temp dir instead of the real repo: refactor agentMemoryUpdateTools.ts to resolve its base dir once via a module-level `const memoryRoot = process.env.AGENT_MEMORY_ROOT ?? path.join(getProjectRoot(), "docs/agent-memory")`, then set AGENT_MEMORY_ROOT to an mkdtempSync dir in the test (afterEach rm -rf). Then delete the 94 accumulated stub files (byte-identical md5 35d6330b.../9d4582.../etc. dev/ops/qa/router stubs) in the same commit — bulk cleanup via a one-shot find+md5 script in the scratchpad since it is <100 files per class and one-time.

*Files*: apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts, apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts, docs/agent-memory/sessions/ (delete 94 stub files)

*Risk*: Requires mcp-server container rebuild to ship the refactor — build is fine but `up -d` swap is user-gated (delegate to ops per OVERRIDE 07-03). Test-only env-var change; verify the suite passes with pnpm check first (red-prepush strands fleet).

*Verifier*: Problem is real and every citation verified (test.ts:60 and agentMemoryUpdateTools.ts:267 quotes exact; 2026-07-11-developer.md md5 35d6330b matches; .retention.md:3/:5 lsof-only; phases.md:69 verbatim; pollution ongoing — sessions/ now 205 files with 93 byte-identical stubs and the suite re-deposited issues/patterns/modules test artifacts today). Not implemented or queued: no AGENT_MEMORY_ROOT in code, no orch-state backlog row (the identical text at docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md:1305 memory-docs-hygiene-P1 is the source brief, whose own verifier reached the same RESCOPE). No invariant violation. BUT the proposed mechanism is technically broken: a module-level `const memoryRoot = process.env.AGENT_MEMORY_ROOT ?? ...` is evaluated at ESM import time, BEFORE beforeEach sets the env var — the const captures the real repo path, the sandbox silently no-ops, tests stay green (they assert response text, not write location), and pollution continues: a false-green fix. Current code already resolves memoryDir at function scope (registerAgentMemoryUpdateTools, agentMemoryUpdateTools.ts:189), which the test calls in beforeEach — that is the correct injection point. Secondary defects: no router stubs exist from this test (router not in VALID_AGENTS; the lone 2026-06-10-router.md is not test-generated — deleting by the proposal's name-family list would hit a non-test file); stub counts are md5-class-based and growing daily (33 ops a003f0cc / 31 dev 35d6330b / 29 qa 35cdf1f8 = 93 as of today), so deletion must key on md5, not a fixed 94; and the same suite's update_memory_file tests pollute docs/agent-memory/{issues,patterns,modules}/ (test-memory-issue.md, test-memory-pattern.md, test-module-memory.md), which the proposal omits.

*Rescope*: Sandbox the 1300b memory-tools test and purge its accumulated pollution. CHANGE 1 (apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts:189, inside registerAgentMemoryUpdateTools): change `const memoryDir = resolve(getProjectRoot(), "docs/agent-memory")` to `const memoryDir = process.env.AGENT_MEMORY_ROOT ?? resolve(getProjectRoot(), "docs/agent-memory")` — registration-time resolution, NOT module-level (module-level const binds at import, before test hooks run, and would silently fail to sandbox). Both tools (append_session_record AND update_memory_file) share this memoryDir, so one change sandboxes the whole suite. CHANGE 2 (apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts): in beforeEach, set process.env.AGENT_MEMORY_ROOT = mkdtempSync(join(tmpdir(), "agent-memory-test-")) BEFORE calling registerAgentMemoryUpdateTools(server); in afterEach, rmSync(tmpDir, {recursive:true, force:true}) AND `delete process.env.AGENT_MEMORY_ROOT` (avoid leaking into sibling suites). Add one regression assertion: after a write test, expect no newly-created `${today}-developer.md` under the real docs/agent-memory/sessions/ (guards the false-green failure mode). CHANGE 3 (cleanup, same commit): delete session stubs BY MD5 CLASS, not by count or name-family — whole-file md5 in {a003f0ccc95c83dcb9a6f67efcb7f19f (ops), 35d6330b83588017f8b94159a986e202 (developer), 35cdf1f822d66788cc0ca17805c44290 (qa)} under docs/agent-memory/sessions/ (93 files as of 2026-07-13; re-enumerate at execution time since the suite adds more daily); use `git rm` for tracked files, plain rm for untracked ones. Do NOT touch 2026-06-10-router.md (not test-generated) or mixed files that contain a stub heading plus real content — md5-exact match only. Also delete the 3 test-artifact files from the same suite: docs/agent-memory/issues/test-memory-issue.md, docs/agent-memory/patterns/test-memory-pattern.md, docs/agent-memory/modules/test-module-memory.md. One-shot find+md5 script in scratchpad is acceptable (<100 files, non-reusable). VERIFY: `bun test apps/mcp-server/src/__tests__/1300b-agent-memory-update-tools.test.ts` twice, then confirm `git status` shows zero new files under docs/agent-memory/; run pnpm check before push (red-prepush strands fleet). Deploy note: agentMemoryUpdateTools.ts ships in mcp-server — container rebuild/swap is user-gated, delegate to ops per OVERRIDE 07-03 (test-only env behavior is unchanged in prod since AGENT_MEMORY_ROOT is unset there). The missing sessions/ pruning automation (second BASED-ON issue) is real but out of scope — mint as a separate follow-up row.

#### memory-docs-hygiene-P2 · impact=medium effort=M · **RESCOPE** — Remove the dead append-session-record skill: delete skill dir, fix catalog row, deregister the MCP tool

*Addresses*: memory-docs-hygiene-I6, memory-docs-hygiene-I1

**Change**: (a) Delete .claude/skills/append-session-record/ entirely. (b) In docs/guides/guide-skills-registration.md §15 Skills Catalog, delete line 16 (the append-session-record row) and add cowork-end-cycle in its place. (c) In apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts remove the append_session_record registration block (keep update_memory_file), update the registry.ts:216 comment, delete the append_session_record cases from the 1300b test, and regenerate docs/data/tool-registry.json so the 3-way tool-count stays in sync (feedback_ssot_toolcount_drift_after_waves). Run the audit-mcp-tools skill's full dependency scan first to confirm zero remaining consumers (grep already shows none in flows).

*Files*: .claude/skills/append-session-record/, docs/guides/guide-skills-registration.md, apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts, apps/mcp-server/src/interface/mcp/tools/registry.ts, docs/data/tool-registry.json

*Risk*: Tool removal changes the vn-market tool surface behind the gateway — audit-mcp-tools scan must cover all integration layers, and the container swap is user-gated (route to ops). If any hidden consumer exists, dedup gate 'already recorded' behavior disappears with it.

*Verifier*: Evidence verified: all 5 citations exact (SKILL.md:4 DEPRECATED; guide-skills-registration.md:16 live row; registry.ts:216; agentMemoryUpdateTools.ts:267 writeFileSync; test :60), and pollution is active — identical developer stubs grew 29→31 since the proposal, 100 dated dev/ops/qa/router stubs total. But two defects force rescope. (1) FALSE PREMISE "zero remaining consumers": grep finds 9+ live doc consumers instructing agents to CALL the tool — docs/agent-memory/AGENT_STARTUP.md:12-15 ("Call append_session_record MCP tool when your task is done"), docs/agent-memory/INDEX.md:15, README.md:19, docs/agents/digest-predict/init.md:53 ("always use append_session_record / update_memory_file"), docs/agents/tools/package/digest-predict.md:95, docs/agents/market-analyst/init.md:121, docs/agents/tools/list/append_session_record.md + INDEX.md:187, docs/architecture/microservice/mcp-server/briefings.md:24,56. digest-predict is a live cron-armed cowork agent; deregistering the tool without touching these makes it call a dead tool every cycle (anti-hallucination failure class). None are in the FILES list. (2) DUPLICATE-QUEUED: orch-state.json backlog row TE-T05 (status BACKLOG, owner developer, note at line 5871) already includes "delete session-log-cowork ... + DEPRECATED append-session-record" as part of the end-0-cowork composite — executing part (a) here without de-confliction races queued work (token-economy TE-T01..T33 drain is in flight per memory). (3) Minor: deleting only the append_session_record test cases fixes the dated-stub explosion but not the root cause — the 1300b update_memory_file cases still write live files (issues/test-memory-issue.md, patterns/test-memory-pattern.md, modules/test-module-memory.md via getProjectRoot()). Core problem real and fix workable, so RESCOPE not REJECT.

*Rescope*: Remove the dead append-session-record skill AND its MCP tool, with full consumer sweep and TE-T05 de-confliction. (0) De-conflict: amend backlog row TE-T05's note via `jq ... | bash scripts/orch-apply.sh` to drop its "DEPRECATED append-session-record" deletion clause (this task absorbs it); never raw-edit orch-state.json. (a) Delete .claude/skills/append-session-record/ entirely. (b) docs/guides/guide-skills-registration.md §15: delete line 16 (append-session-record row), add cowork-end-cycle row in its place. (c) apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts: remove the append_session_record registration block (keep update_memory_file); update registry.ts:216 comment; regenerate docs/data/tool-registry.json (3-way tool-count sync per feedback_ssot_toolcount_drift_after_waves). (d) Update ALL doc consumers to the notebook-write/cowork-end-cycle pattern: docs/agent-memory/AGENT_STARTUP.md:12-15, docs/agent-memory/INDEX.md:15, docs/agent-memory/README.md:19, docs/agents/digest-predict/init.md:53, docs/agents/tools/package/digest-predict.md:95, docs/agents/market-analyst/init.md:121, docs/architecture/microservice/mcp-server/briefings.md:24 and :56; delete docs/agents/tools/list/append_session_record.md and remove its entry at docs/agents/tools/list/INDEX.md:187. (e) Fix the 1300b test root cause, not just symptom: delete the append_session_record cases AND redirect the remaining update_memory_file test writes to a temp dir (inject/override project root in test setup) so no test writes into live docs/agent-memory/. (f) Cleanup of the ~100 existing stale stubs in docs/agent-memory/sessions/ is a bulk op ~100 files: do it via a script in scripts/ (never /tmp), reviewing that none contain real (non-stub) session content before deletion — md5 35d6330b83588017f8b94159a986e202 identifies the byte-identical developer stubs. (g) Run audit-mcp-tools full dependency scan as final verification that consumer count is zero AFTER (d), not as a precondition assumed true.

#### memory-docs-hygiene-P3 · impact=medium effort=M · **RESCOPE** — Add a memory-prune sweep script wired into code-janitor: sessions >14d, dead health rechecks, legacy session-logs, root debris

*Addresses*: memory-docs-hygiene-I3, memory-docs-hygiene-I12

**Change**: New scripts/agents-flow/memory-prune-sweep.sh (bulk op over >100 files = script, not agent): (1) mv docs/agent-memory/sessions/*.md older than 14 days (excluding archive/) to docs/agent-memory/sessions/archive/; (2) delete docs/agent-memory/health/team-tool-recheck-*.md older than 30 days (writer dead since 06-23 — also emit one signal so system-auditor confirms whether the recheck job SHOULD be dead, per passive-health-masks-dead-data); (3) fold docs/agent-memory/session-logs/*.md into sessions/archive/ and remove the dir; (4) mv docs/agent-memory/scheduled-task-execution-*.md to docs/agent-memory/archive/. Extend docs/agent-memory/sessions/archive/.retention.md from lsof-only to these four rules, and add one step to docs/agents/code-janitor/flow/main.md invoking the script (janitor already owns sweep cadence). Commit with explicit paths only.

*Files*: scripts/agents-flow/memory-prune-sweep.sh (new), docs/agent-memory/sessions/archive/.retention.md, docs/agents/code-janitor/flow/main.md

*Risk*: Archival not deletion for sessions (reversible); health-recheck deletion is data loss but files are point-in-time probes 18 days stale. Must use explicit-path git staging (pathspec commit drops rename/deletion pitfall).

*Verifier*: Evidence fully verified (all 4 debris families exist; sessions/ has grown to 205 files/1.6M with 66 files >14d; health/ = exactly 122 recheck files newest 06-23; .retention.md:3/:5 and phases.md:69 quotes exact). Nothing equivalent exists or is queued (no prune script, no janitor step, no backlog row; notebook-auto-prune.sh is a different family). Invariants pass. But two corrections are required before handing to a dev: (1) the proposal's signal asks system-auditor to investigate whether the recheck writer SHOULD be dead — that is already answered: the writer is cloud RemoteTrigger trig_019Q8D5xttjZn6iytx2Ld9dW (project_health_recheck_trigger.md) killed by the user's 2026-06-22 standing no-RemoteTrigger directive (feedback_no_remote_trigger_all_local.md); newest file 06-23 matches. The signal must be a documented-closure/PO-decision (replace with local cron or retire permanently), not an open auditor probe. (2) 'emit one signal' from a shell script risks a raw orch-state.json write, violating the orch-apply.sh write contract — the script must only write the docs/signals/ payload file; the signal_queue row is appended by the janitor flow step via the signal-dashboard skill.

*Rescope*: Add scripts/agents-flow/memory-prune-sweep.sh wired into code-janitor (bulk op over >100 files = script, not agent). Script does file ops ONLY — no orch-state.json access: (1) mv docs/agent-memory/sessions/*.md with mtime >14d (excluding archive/, and only *.md so preflight-lsof-*.log and cowork-guaranteed-slot-firer*.log writers are untouched) to docs/agent-memory/sessions/archive/ — safe for dailyDashboardJob.ts:473 which reads only same-day YYYY-MM-DD-*.md; (2) delete docs/agent-memory/health/team-tool-recheck-*.md older than 30d, and write ONE idempotent payload file docs/signals/janitor-health-recheck-writer-retired-<date>.json stating the known cause: writer = cloud RemoteTrigger trig_019Q8D5xttjZn6iytx2Ld9dW, dead since 06-23 per the 2026-06-22 standing no-RemoteTrigger directive (feedback_no_remote_trigger_all_local) — routed to PO (not system-auditor) for one decision: replace with local cron per that directive's migration rule, or retire the recheck permanently and let the 30d rule drain the dir; (3) mv docs/agent-memory/session-logs/*.md into docs/agent-memory/sessions/archive/ and rmdir session-logs/; (4) mv docs/agent-memory/scheduled-task-execution-*.md to docs/agent-memory/archive/. Extend docs/agent-memory/sessions/archive/.retention.md with these four rules alongside the existing lsof rule. Add one step to docs/agents/code-janitor/flow/main.md invoking the script; the FLOW step (not the script) appends the signal_queue row for the item-(2) payload via .claude/skills/signal-dashboard/SKILL.md (orch-state writes stay behind orch-apply.sh per SSOT-W1). Idempotency: skip signal write if payload file already exists. Commit with explicit paths only (git add the moved/deleted paths, .retention.md, flow/main.md, the new script — pathspec must include both old and new paths for renames per feedback_pathspec_commit_drops_rename_deletion).

#### memory-docs-hygiene-P13 · impact=medium effort=M · **UNVERIFIED** — Give token-economy one deterministic backstop: cap governed handoff files, and add a handoff archival sweep

*Addresses*: memory-docs-hygiene-I8

**Change**: (a) Add to docs/data/file-size-caps.json caps[]: {"pattern": "docs/handoffs/*.md", "cap": 400, "class": "task-handoff", "_note": "token-economy FULL tier; size-justification header honored"} — context-bloat-backstop.sh enforces it automatically via its existing pattern loop and size-justification escape hatch. (b) Extend scripts/agents-flow/memory-prune-sweep.sh (P3) with a --handoffs mode: mv docs/handoffs/TASK_*.md to docs/archive/handoffs/ when the task id appears in done_verified or the orch cold archive AND mtime >30d (972 files / 11MB today; bulk = script). handoff-delta-read anchors are unaffected — archived handoffs are terminal and no longer delta-read.

*Files*: docs/data/file-size-caps.json, scripts/agents-flow/memory-prune-sweep.sh, docs/agents/code-janitor/flow/main.md

*Risk*: Existing over-cap handoffs will fire breach signals on next edit — the hook's dedup (one open signal per file) and size-justification header contain the noise; do NOT retro-trim old handoffs, only archive. Task-id matching must be exact to avoid archiving live work.

#### memory-docs-hygiene-P4 · impact=medium effort=S · **RESCOPE** — Implement the promised sprint-journal archival in pm's task-archive flow

*Addresses*: memory-docs-hygiene-I4

**Change**: Add a step to docs/agents/pm/flow/task-archive.md immediately after sprint cold-eviction (after the orch-apply block at line ~73): for each evicted sprint_id, `mkdir -p docs/archive/decisions && git mv docs/agent-memory/decisions/sprint-<sprint_id>-*.md docs/archive/decisions/ 2>/dev/null` and include both old+new paths in the commit (pathspec rule). This makes the behavior already promised in docs/data/file-size-caps.json ("Archived → docs/archive/decisions/ at sprint close by pm") real. One-time backfill: run the same mv for the ~380 sprint-* files whose sprint ids already sit in docs/data/orch/archive/*.json — as a script (bulk >100 files), e.g. extend memory-prune-sweep.sh with a --journals mode that cross-checks sprint ids against the orch archive before moving.

*Files*: docs/agents/pm/flow/task-archive.md, scripts/agents-flow/memory-prune-sweep.sh

*Risk*: Journals for sprints not yet closed must never move — gate strictly on evicted/closed sprint ids from orch archive, never on mtime. orch-state itself is untouched (no orch-apply.sh implications).

*Verifier*: Gap is REAL and verified live: file-size-caps.json promises "Archived → docs/archive/decisions/ at sprint close by pm", docs/archive/decisions/ does not exist, decisions/ holds 398 sprint-*.md (3.9MB, growing), pm/flow/task-archive.md has zero journal step, and no equivalent fix is implemented or queued (TE-T33 is mtime-gated janitor rotation — not the promised sprint-closure-gated archival; FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE targets the orch-state decision_journal field, a different artifact). But the proposal as written cannot be handed to a dev agent: (1) scripts/agents-flow/memory-prune-sweep.sh DOES NOT EXIST anywhere in the repo — it is itself only proposal P3 of the same unimplemented audit brief; (2) backfill coverage claim "~380 files" is wrong — live cross-check matches 281/398 journals to closed-sprint ids, 28 belong to still-ACTIVE sprints and must stay, ~89 have no orch record; (3) the mv glob sprint-<id>-*.md has a live prefix-collision bug (closed id OHLCV-UNIT-CONTAM prefix-matches journals of ACTIVE sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000) and misses bare sprint-<id>.md files; (4) hooking after the line-73 orch-apply block misses the flow's second eviction path (Step 4 orch-cold-evict.sh also evicts terminal active_sprints — flow line 127), permanently stranding those journals, and task-archive.md is already 169L vs the 120L flow-file cap so inline bash worsens a governed breach.

*Rescope*: Implement the promised sprint-journal archival in pm's task-archive flow. CHANGE 1 — NEW script scripts/agents-flow/decision-journal-archive.sh (do NOT reference memory-prune-sweep.sh — it does not exist): input = sprint ids on stdin, or --all backfill mode. For each candidate journal file docs/agent-memory/decisions/sprint-*.md, derive its sprint id by LONGEST match against the union of known sprint ids (closed + active) — never bare prefix glob, because closed id OHLCV-UNIT-CONTAM prefix-matches ACTIVE sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 journals; cover both sprint-<id>-<agent>.md and bare sprint-<id>.md forms. Move a file only if its longest-match id is in the closed set AND not in orch-state .task_board.active_sprints[].id: mkdir -p docs/archive/decisions && git mv <file> docs/archive/decisions/. In --all mode, derive the closed-id set from docs/data/orch/archive/*.json (.closed_sprints[].id + .closed_sprint_goals keys + .done_tasks[].sprint) plus hot-file .task_board.closed_sprints[].id (~281 of 398 files today; 28 active-sprint journals MUST stay; ~89 journals with no orch record are left in place and reported as a count on stdout for a follow-up PO disposition — do not guess-move). Script is read-only w.r.t. orch-state (jq queries only — no orch-apply.sh needed). CHANGE 2 — docs/agents/pm/flow/task-archive.md: ONE short pointer step (3-5 lines) after Step 5 (post-eviction verify), NOT after the line-73 orch-apply block, because sprints are evicted by BOTH §Sprint Eviction and Step 4's orch-cold-evict.sh: capture active_sprints ids before §Sprint Eviction and after Step 5, pipe the diff into scripts/agents-flow/decision-journal-archive.sh. File is already 169L vs 120L cap — keep the step minimal and add an inline size-justification header if context-bloat-backstop fires. CHANGE 3 — extend Step 6's explicit git add pathspec with docs/agent-memory/decisions/ and docs/archive/decisions/ (old+new paths per feedback_pathspec_commit_drops_rename_deletion) so moves ride the same commit under the held commit-mutex. ONE-TIME BACKFILL: run the script once in --all mode (bulk >100 files = script — complies). COORDINATION: note on backlog row TE-T33 that its decisions/ leg is superseded by (or must call) this script — mtime-based >30d rotation must NOT be applied to decisions/ (would move journals of open sprints). FILES: scripts/agents-flow/decision-journal-archive.sh (new), docs/agents/pm/flow/task-archive.md. Implementer notes: Edit-tool hook may silently strip multiline edits — re-read the flow file after editing; journal filename format per .claude/skills/decision-journal (sprint-<id>-<agent-id>.md) but bare sprint-<id>.md files exist and must be covered.

#### memory-docs-hygiene-P7 · impact=medium effort=S · **UNVERIFIED** — Govern po-decisions.md: add a cap entry + rolling archive contract

*Addresses*: memory-docs-hygiene-I5

**Change**: Add to docs/data/file-size-caps.json caps[]: {"pattern": "docs/agent-memory/decisions/po-decisions.md", "cap": 300, "class": "po-decision-log", "_note": "rolling PO decision log; on overflow oldest ## entries roll to docs/archive/decisions/po-decisions-<YYYY-MM>.md"} — the existing context-bloat-backstop.sh picks it up with zero code change (pattern list is the SSOT it reads). Add a 3-line 'Rolling archive' rule to docs/agents/po/flow/triage-signals.md (or the po flow section that writes po-decisions.md) instructing PO to move entries older than the last 10 to the dated archive file when the breach signal fires. One-off: roll the current 68KB file down to the last ~10 entries now.

*Files*: docs/data/file-size-caps.json, docs/agents/po/flow/triage-signals.md, docs/agent-memory/decisions/po-decisions.md, docs/archive/decisions/po-decisions-2026-06.md (new)

*Risk*: Other docs reference po-decisions.md by path (ops.md:574, handoffs) — path is preserved, only old entries move; archive file keeps them greppable. Line cap alone is weak against po's very long lines, so the _note also fixes entry granularity (entries, not lines).

#### memory-docs-hygiene-P8 · impact=low effort=S · **UNVERIFIED** — Delete the stray .test-notebook-prune-debug/ dir and pin the test's output location

*Addresses*: memory-docs-hygiene-I9

**Change**: rm -rf .test-notebook-prune-debug/ (untracked, single orphaned fixture). Add a one-line comment to scripts/agents-flow/test-notebook-auto-prune.sh header noting outputs live ONLY in docs/agent-memory/notebooks/test-*-$$.md with trap cleanup (already true — this prevents future debug variants writing to repo root), and add `.test-notebook-prune-debug/` to .gitignore as a belt-and-braces guard.

*Files*: .test-notebook-prune-debug/ (delete), scripts/agents-flow/test-notebook-auto-prune.sh, .gitignore

*Risk*: None — dir is untracked debug debris; content is duplicated verbatim inside the test script.

#### memory-docs-hygiene-P9 · impact=low effort=S · **UNVERIFIED** — Align notebook retention spec with enforced reality: make the 200L cap the binding rule, last-3-sections a compose-time tiebreak

*Addresses*: memory-docs-hygiene-I10

**Change**: Edit .claude/skills/notebook-write/SKILL.md AC-2 from "Keep: current cycle + 2 prior `## ` sections = last 3 total. Prune: all sections older than the 3rd-most-recent" to: "Binding constraint = <=200L (AC-5/hook). When composing would exceed 200L, drop oldest sections first (AC-3 Step 1f). Keeping more than 3 sections is allowed while under cap." Update the matching sentence in the file-size-caps.json agent-notebook _note. This removes the dead-letter rule that no APPEND agent follows (qa.md holds 12 sections legitimately under cap).

*Files*: .claude/skills/notebook-write/SKILL.md, docs/data/file-size-caps.json

*Risk*: Pure spec alignment; the hook and AC-3 logic are unchanged. Alternative (enforcing 3 sections in the hook) would destroy useful under-cap history like qa's cycle ledger — rejected.

#### memory-docs-hygiene-P10 · impact=low effort=S · **UNVERIFIED** — Merge the stray per-task notebook and forbid dated notebook variants

*Addresses*: memory-docs-hygiene-I11

**Change**: Fold any still-relevant carry-over from docs/agent-memory/notebooks/cowork-refactory-expert-2026-07-11-fr1-atomic.md into cowork-refactory-expert.md as one <=60L section, then git rm the dated file. Add one line to notebook-write SKILL.md under 'Path': "Path MUST be exactly <agent-id>.md — dated or per-task variants are forbidden (they are never read by notebook-read and never pruned)."

*Files*: docs/agent-memory/notebooks/cowork-refactory-expert.md, docs/agent-memory/notebooks/cowork-refactory-expert-2026-07-11-fr1-atomic.md (delete), .claude/skills/notebook-write/SKILL.md

*Risk*: None beyond the usual pathspec-includes-deletion commit rule.

#### memory-docs-hygiene-P11 · impact=low effort=S · **UNVERIFIED** — Move launchd firer logs out of the docs tree

*Addresses*: memory-docs-hygiene-I13, memory-docs-hygiene-I3

**Change**: In scripts/agents-flow/cowork-guaranteed-slot-firer.sh lines 93-94, change LOG_FILE/LOG_ERR_FILE defaults from docs/agent-memory/sessions/ to a non-docs runtime dir inside the repo, e.g. $ROOT/.logs/cowork-guaranteed-slot-firer{,-error}.log (mkdir -p, .gitignore'd). Update the two path rows in docs/standards/cron-jobs.md (lines 182 and 210) in the same commit, and update the launchd plist if it hardcodes LOG_FILE_PATH. Keeps all-local invariant; just relocates.

*Files*: scripts/agents-flow/cowork-guaranteed-slot-firer.sh, docs/standards/cron-jobs.md, .gitignore

*Risk*: The dormant fb-daily-firer and any ops runbooks that tail the old path must be greppped for the literal path; docs/standards/cron-jobs.md is the SSOT being updated so drift is contained.

#### memory-docs-hygiene-P12 · impact=low effort=S · **UNVERIFIED** — Single SSOT for compression tiers: caveman owns tier semantics, token-economy keeps only the signal→tier routing

*Addresses*: memory-docs-hygiene-I14

**Change**: In .claude/skills/token-economy/SKILL.md Part 3, replace the 'Format rules' column content of the Three Tiers table with 'semantics → `.claude/skills/caveman/SKILL.md` § Intensity' (one pointer, keep Reduction/When-to-use columns), and delete the duplicated per-tier prose. In caveman SKILL.md add one line under Intensity: 'SSOT for ULTRA/FULL/LITE semantics; token-economy Part 3 maps signal types to tiers.' Per the shared-boilerplate invariant: one base skill, referenced, never copy-pasted.

*Files*: .claude/skills/token-economy/SKILL.md, .claude/skills/caveman/SKILL.md

*Risk*: None — both files stay under the 200L skill cap; agents loading token-economy for the decision matrix already load caveman (both are CLAUDE.md defaults).


## Domain: state-data-files

### Issues

#### state-data-files-I3 · HIGH — NOTE_SIGNALS_DB_DRAIN.md claims signals.db is dead; the DB was written today — two files claim opposite truths about the drain

The drain was revived (drain-signals.js, actively inserting rows) but the note that tells dev-team the pipeline is dead and asks them 'to diagnose and restore the drain job' was never retired. Any agent reading the note can mint duplicate revival work for an already-live pipeline — the exact churn-without-convergence class from the 07-04 systemic review.

*Evidence*: docs/signals/NOTE_SIGNALS_DB_DRAIN.md:3 "**Status:** Dead since 2026-05-22. The signals.db write pipeline ... has not been operational." vs sqlite3 signals.db 'select max(processed_at)' = 2026-07-11T08:17:32Z, and scripts/agents-flow/drain-signals.js:3 "Drains docs/signals/*.json → fingerprint dedup vs signals.db → processed/ + DB INSERT → 7-day prune."

#### state-data-files-I4 · HIGH — docs/signals/processed/ holds 1,457 git-tracked files; the 7-day prune has a hole that permanently skips legacy files

Pre-revival signal files (May-June era, no _processed stamp) fail the prune predicate silently, so the directory grows monotonically for that cohort while the DB and stamped files stay at 7 days. 1,457 tracked files inflate git status/ls output that agents read every cycle, and the working tree currently shows 63 dirty docs/signals paths — a standing contributor to the perpetual-dirty-tree problem.

*Evidence*: scripts/agents-flow/drain-signals.js:155-156 "const pa = pj._processed?.processedAt ?? pj.processedAt; if (pa && pa < cutoffIso) { fs.unlinkSync(...) }" — files lacking both fields are never pruned. Verified: jq 'has("_processed"), has("processedAt")' docs/signals/processed/agent-self-critique-detect-20260601.json → false, false. ls processed/ = 1,457 files; git ls-files docs/signals/processed/ = 1,475.

#### state-data-files-I6 · HIGH — Cron/scheduler counts drift 3 ways (64 vs 65 vs 66) and cron-registry.json simultaneously declares itself deprecated AND mandates dual-writes

Three files (cron-registry, system-map, project-stats) plus code (cronConfig.ts) each carry a scheduler-job count and none agree; cron-registry is internally inconsistent with its own definition. This is the cron-domain twin of the known tool-count 3-way drift (feedback_ssot_toolcount_drift_after_waves), and system-auditor consumes the drifted file, feeding the auditor false-positive class. Hand-maintained duplicated counts regenerate drift after every scheduler wave.

*Evidence*: docs/data/cron-registry.json:3 "_ssot: docs/data/system-map.json — canonical cron list. This file kept for backward-compat only." vs line 4 "_trigger: after adding/removing scheduler job, update BOTH this file AND docs/data/system-map.json#...crons". Counts: cron-registry.json:8 "schedulerFileCount": 65 while jq '.jobs|length' = 66 (violating its own line-5 definition "schedulerFileCount = jobs[] array length"); project-stats.json:35 "schedulerFileCount": 64; project-stats cronJobCount=2 with its own note admitting "Old probe ... is stale" and live count is 81. Consumer: docs/agents/system-auditor/flow/main.md:456 "Verify JSON counts: ... cron-registry.json vs jobs".

#### state-data-files-I9 · HIGH — scripts/ root is a graveyard: 490 one-shot .jq mutation payloads, only 42 referenced from any doc

~448 spent orch-state mutation payloads (sprint-specific, never replayable — board state has moved on) sit beside the ~70 genuinely reusable scripts, defeating the discovery purpose the Script Persistence policy states. Agents listing scripts/ burn tokens on 560 entries; the policy's own taxonomy has no bucket for 'spent one-shot payload', so the pile regenerates.

*Evidence*: ls scripts/*.jq | wc -l = 490; grep -rhoE 'scripts/[A-Za-z0-9_./-]+\.(sh|jq|ts|js|mjs|py)' over docs/agents, docs/policies, .claude/skills, docs/standards, docs/protocols yields 42 distinct .jq references. Names are dated one-shots, e.g. scripts/po-s23-retry-edit.jq, scripts/dev-team-close-clean-bun-cache-20260702-0107.jq. Policy: docs/policies/dev-standards.md:12 "Audit / one-shot verification worth replaying | scripts/audits/" and :17 "update the owning flow/skill doc with a canonical pointer ... so future agents discover it".

#### state-data-files-I1 · MEDIUM — cycle-snapshot-HH:MM files never pruned — 80 accumulate, 54 predate July; flow doc's 'ephemeral' claim is false

The tick writes docs/data/cycle-snapshot-<HH:MM>.json each cycle and telemetry.md Step 6 promotes it to cycle-snapshot-latest.json, but nothing deletes stale per-minute files. Cadence drift means old minute-slots are never revisited, so files from May/June sit forever. Gitignored, so no repo cost, but they pollute docs/data/ listings (80 of 126 files) and can feed agents stale market context if a glob/nearest-tick fallback ever matches an old file.

*Evidence*: docs/agents/cowork-team/flow/tick-snapshot.md:10 "File is ephemeral (overwritten each tick). Not git-committed (.gitignore)." — but filenames key on wall-clock HH:MM, so files only overwrite when a later tick lands on the same minute. ls docs/data/cycle-snapshot-*.json = 80 files; find -not -newermt 2026-07-01 = 54 June-or-older files (e.g. cycle-snapshot-05:05.json dated 29 May). Writer = cowork-team Step 4.7; no pruner exists anywhere (grep 'cycle-snapshot' across scripts/ and skills returns only the two cowork-team flow files).

#### state-data-files-I2 · MEDIUM — Snapshot pipeline silently dead since Jul 7 while cowork ticks kept firing — masked by the zero-blocker skip path

Every cowork tick since Jul 7 has failed (or skipped) the shared snapshot write, forcing every spawned agent back to the direct get_cycle_bootstrap path (the token-saving L-6 optimization is dead) with no signal emitted. This is the known passive-health-masks-dead-data pattern applied to the snapshot plane. Cross-check against the Jul 11 Docker incident before dispatching a fix — but Jul 8-10 predates that incident.

*Evidence*: Newest snapshot: docs/data/cycle-snapshot-17:33.json mtime '7 jul 19:33' and cycle-snapshot-latest.json mtime '7 jul 21:47'; yet docs/signals/ contains cowork-team-20260710T041500Z.json through cowork-team-20260710T080000Z.json proving ticks ran on Jul 10. tick-snapshot.md:60 "log ... and continue to Step 4.8. Do NOT block spawns" — failure is silent by design.

#### state-data-files-I5 · MEDIUM — signals.db (1.2 MB binary SQLite, rewritten on every drain run) is git-tracked despite being explicitly non-SSOT

A binary DB that changes on every drain run guarantees a dirty tree and unbounded repo growth from binary deltas. Since the code declares the filesystem move the SSOT and the DB a rebuildable dedup index (backfill script exists), tracking it in git buys nothing. SQLite-local-only invariant is unaffected — this is about git tracking, not storage.

*Evidence*: git ls-files docs/signals/signals.db → tracked; git status shows 'M docs/signals/signals.db'. drain-signals.js:106 "// Dual-record write: filesystem move is SSOT; DB INSERT is non-fatal (spec §0a-1)". A rebuild path exists: scripts/migrations/backfill-signals-db.ts.

#### state-data-files-I7 · MEDIUM — orch-state .decision_journal is unbounded in the hot file — no validator cap, no cold-eviction pass

Every lane in the hot file has an eviction or cap story (done→KEEP_RECENT_DONE=10/7d, sprint_goal→FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT, terminal lane rows→D4 pass) except decision_journal, which only grows. At ~1.4 KB/entry it will quietly dominate the hot file the same way sprint_goal.entries did before its 2026-07-02 fix — same failure shape, adjacent key.

*Evidence*: jq '.decision_journal|length' = 36 entries / 48,969 bytes, latest ts 2026-07-10T20:35:00Z (active). grep -n 'decision_journal' scripts/orch-cold-evict.sh → no matches; grep in scripts/orch-validate.mjs → no cap. Hot file total: 612,406 bytes (ls -l docs/data/orch/orch-state.json).

#### state-data-files-I8 · MEDIUM — ACTIVE sprints carry ~51 terminal task payloads inline in the hot file (~100 KB dead weight) — cold-evict has no in-sprint task pass

Long-running epics keep every finished task's full payload (evidence, notes, probe verdicts) in the hot file until the wrapper sprint closes — which the known epic-wrapper closeout gap shows can be never. Distinct from the already-minted FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP (sprint-level status flip): even with autoclose, a sprint legitimately active for a month accumulates dead task payloads the whole time.

*Evidence*: jq per-sprint: BCTC-ANALYTICS-LAYER 3 non-terminal / 35 tasks (45,209 bytes, opened 2026-06-02); VN-MACRO-TOOLING 1 non-terminal / 20 tasks (70,696 bytes, opened 2026-06-14). task_board.active_sprints = 143,500 bytes of the 447 KB task_board. scripts/orch-cold-evict.sh:19-22 documents passes for terminal sprints and "the flat task lanes {backlog, review, qa, in_progress, ready} (NOT done/done_verified ...)" — no pass touches .tasks[] inside ACTIVE sprints.

#### state-data-files-I11 · MEDIUM — backlog-detail.json holds 437 detail items for at most 361 live rows — reverse-orphan details are never GC'd, and the live ref target lives in archive/

The detail sidecar (748 KB) only grows: evicting or archiving a hot row leaves its detail entry behind, and no sweep reclaims entries with no referencing row. Secondary confusion: a file that live hot rows depend on sits inside archive/ next to genuinely cold monthly files — an agent 'cleaning the archive' could break every backlog detail_ref.

*Evidence*: jq '.items|keys|length' docs/data/orch/archive/backlog-detail.json = 437 vs hot lanes backlog 313 + review 24 + done 23 + in_progress 1 = 361 max referencing rows (≥76 orphans). Hot rows point into it: backlog[0].detail_ref = "docs/data/orch/archive/backlog-detail.json#TASK17-FOREIGN-FLOW". orch-validate.mjs Stage 1c checks only "dangling detail_ref / payload_ref" (orch-apply.sh:123) — hot→detail direction only.

#### state-data-files-I10 · LOW — All 12 pilot-status files are terminal since May; bare pilot-status.json is actually the technical-analysis pilot, not an aggregate; flow docs still call them Live SSOT

Closed 6-week-old pilot records presented as live SSOT in active flow docs, plus one misnamed file that reads as an aggregate. Any agent walking microservice-main.md Phase 0 treats a dead artifact as a gate. Historical value is real (closure evidence) — belongs in an archive, not docs/data/.

*Evidence*: jq '.status' over all: 11× DONE (closedAt range 2026-05-23..05-26), pilot-status-schema.json ACTIVE (template default). jq '.pilot' docs/data/pilot-status.json = "technical-analysis" (unsuffixed name breaks the pilot-status-<svc>.json convention). docs/agents/dev-stock-price/flow/main.md:179 "| docs/data/pilot-status-stock-price.json | **Live SSOT** | Goal tracking — PO reads/writes" and docs/agents/developer/flow/microservice-main.md:41 "Verify docs/data/pilot-status-<svc>.json exists; create from schema if absent (Phase 0)".

#### state-data-files-I12 · LOW — cowork-schedule.json still carries retired RemoteTrigger residue (trigger_id, trigger_status, May-era spike notes) despite the standing all-local rule

Dead cloud-scheduling fields ride along in the file every cowork dispatcher tick reads. Note: cron-registry / cowork-schedule / cadence-policy are NOT three competing schedule SSOTs — they cover different layers (server scheduler jobs / cowork slots / cadence suppression matrix, linked via slots[].policy_id). The real duplication axis is cron-registry↔system-map↔project-stats (I6); this issue is only stale residue inside the slots file.

*Evidence*: docs/data/cowork-schedule.json:37 "trigger_id": "trig_01FdUF4YWg8TqpXVnBLC7GYj", :39 "trigger_status": "superseded", :60 "trigger_status": "deleted"; _open_questions block embeds 2026-05-18 RemoteTrigger spike results; _notes.layer_a_deletion_gate itself says "RemoteTrigger Layer A is retired per STANDING feedback_no_remote_trigger_all_local (2026-06-22)".

#### state-data-files-I13 · LOW — Orphan/stale data files in docs/data and repo root: bug-inventory.json (0 refs), signal-distribution-report.json, BATCH_S_1849_SUMMARY.md, 3-byte stubs, .test-notebook-prune-debug/

Dead weight in the primary data directory. bug-inventory.json in particular looks authoritative ('inventory') but nothing reads or writes it since May — an agent could treat it as live truth. The 3-byte JSON stubs and the root-level debug dir are pure trash.

*Evidence*: grep -rln 'bug-inventory' over docs/agents, .claude/skills, scripts, docs/policies → zero hits (file: 23,685 bytes, mtime 24 May). signal-distribution-report.json referenced only by its generator scripts/analyze-signal-distribution.ts (20 May). ls -la docs/data: "alert-verdicts.json 3 bytes 10 mai", "delivery-cron-delivered.json 3 bytes 27 mai", "BATCH_S_1849_SUMMARY.md 7 mai". git status: "?? .test-notebook-prune-debug/" (single test.md, 11 Jul debug leftover).

#### state-data-files-I14 · LOW — Legacy embedded key task_board._closed_signals_20260614 and a handoff .md inside the orch data dir

A dated one-shot closure record embedded as a top-level task_board key survives every write cycle and every schema pass; the handoff markdown is documentation misfiled into the write-gated data directory. Both are small but violate the hot-file-is-lean principle and confuse structural jq queries over task_board keys.

*Evidence*: jq '.task_board._closed_signals_20260614' orch-state.json → present (615 bytes, "_by": "po-S50", "_at": "2026-06-14T14:45:14Z"). ls docs/data/orch/ shows "HANDOFF-QUE-REFERENCE-PAGE-1a.md" (13 Jun) beside the hot file.

### Proposals

#### state-data-files-P4 · impact=high effort=M · **CONFIRMED** — Close the legacy-file prune hole in drain-signals.js + one-time scripted purge of ~1,400 unstamped processed files

*Addresses*: state-data-files-I4

**Change**: In scripts/agents-flow/drain-signals.js line 155, add an mtime fallback: `const pa = pj._processed?.processedAt ?? pj.processedAt ?? new Date(fs.statSync(path.join(PROC, pf)).mtimeMs).toISOString().replace(/\.\d+Z$/, 'Z');` so unstamped files age out on file mtime. One-time cleanup is a bulk op >100 files → script per invariant: scripts/audits/purge-legacy-processed-signals.sh that `git rm` all docs/signals/processed/*.json lacking _processed/processedAt AND older than 7 days (mtime), committed as ONE commit with explicit paths (feedback_router_commit_captures_dirty_board). Update the existing drain-signals.test.js with a no-stamp fixture.

*Files*: scripts/agents-flow/drain-signals.js, scripts/agents-flow/drain-signals.test.js, scripts/audits/purge-legacy-processed-signals.sh (new), docs/signals/processed/ (~1,400 deletions)

*Risk*: Deleting tracked files loses greppable incident history — mitigated: git history retains every file; only files >7 days old are touched, matching the pipeline's own declared retention.

*Verifier*: Evidence verified exactly: drain-signals.js:155-156 matches the quoted code; files lacking both _processed.processedAt and processedAt are never pruned. Live probe: cited sample file has neither field (jq false,false); 1,283 of 1,494 processed/ files are unstamped and git-tracked (count grew from proposal's 1,457, confirming unbounded growth). Not already fixed: git history of drain-signals.js shows prior prune fixes (STRCOMPARE, FAIL-LOUD fence) but none touch this hole; no purge script exists; no board/memory item queues an equivalent fix. No invariant violations: bulk op is scripted into scripts/audits/ (not /tmp, not agent-manual), one commit with explicit paths on main, no orch-state writes. No consumer needs >7d legacy files (ci-health-probe scans recent fingerprints; backfill migration's old rows are DB-pruned anyway) — 7-day retention is the established design on both DB and file planes. Concrete: exact line, format-compatible replacement (mtime fallback emits dash-ISO comparable to cutoffIso), and drain-signals.test.js already has an isolated mkdtemp harness for the no-stamp fixture. Implementation notes for the dev agent: (1) ship the scripted git-rm purge in the same change-set as the code fix, else the next hourly drain tick unlinkSync's ~1,283 tracked files and leaves a mass-dirty tree (feedback_push_blocked_by_perpetual_dirty_tree); (2) actual unstamped count is 1,283, not ~1,400; (3) post-checkout mtime resets may delay purge of a few files by up to 7 days — acceptable.

#### state-data-files-P6 · impact=high effort=M · **RESCOPE** — Collapse the scheduler-count triplication: generate cron-registry.json, or retire it and repoint the auditor at system-map

*Addresses*: state-data-files-I6

**Change**: Preferred (matches the tool-registry precedent): extend scripts/gen-tool-registry.ts-style generation — new scripts/gen-cron-registry.ts that scans apps/mcp-server/src/scheduler/**/cronConfig.ts scheduleCron call-sites and writes BOTH cron-registry.json#jobs and system-map.json#project.microservices[id=mcp-server].crons, deleting the manual dual-write instruction at cron-registry.json:4. Drop schedulerFileCount from docs/data/project-stats.json (line 35) and fix/remove the stale cronJobCount=2 (its own note says the probe is stale) — gen-project-stats.ts doesn't even produce schedulerFileCount today (grep confirms), so the field is hand-drift by construction. Update docs/agents/system-auditor/flow/main.md:456 to verify generated-vs-code instead of hand-vs-hand.

*Files*: scripts/gen-cron-registry.ts (new), docs/data/cron-registry.json, docs/data/system-map.json, docs/data/project-stats.json, docs/agents/system-auditor/flow/main.md, scripts/gen-project-stats.ts

*Risk*: Generator must handle the wrapper indirection (scheduleCron vs cron.schedule) that broke the last probe — anchor on cronConfig.ts named keys as the project-stats note itself recommends.

*Verifier*: Problem is real and every cited line verifies exactly (cron-registry.json:3/4/5/8 contradiction + 64/65/66 triplication; jobs|length=66 vs schedulerFileCount=65; system-map crons=66; project-stats schedulerFileCount=64 hand-drift, cronJobCount=2 stale probe; auditor flow main.md:456 hand-vs-hand). No equivalent fix exists or is queued (no gen-cron-registry.ts; feedback_ssot_toolcount_drift_after_waves.md only prescribes manual reconciliation). No invariant violated. BUT the CHANGE as written fails on execution: (1) cronConfig.ts contains ZERO scheduleCron call-sites (grep-verified) — post FACTORY-SCHEDULER-job-table-registry refactor, jobs are JOB_TABLE entries + bespoke scheduleCron calls in schedulerJobTable.ts plus summaryJobs.ts, so the specified scan yields an empty registry; (2) it misses apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts:281 which hard-asserts schedulerFileCount===65 (guaranteed CI red on regeneration); (3) it misses apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts which reads schedulerFileCount from project-stats.json at runtime — dropping the field breaks a live dashboard metric; (4) gen-tool-registry.ts precedent writes only its own file, so the system-map write needs an explicit surgical-patch + atomic-rename constraint. Corrected version below.

*Rescope*: Collapse the scheduler-count triplication via generation (tool-registry precedent), with corrected sources and full consumer coverage. (A) New scripts/gen-cron-registry.ts: enumerate scheduled jobs from apps/mcp-server/src/scheduler/schedulerJobTable.ts (declarative JOB_TABLE entries from buildJobTable + bespoke scheduleCron() call-sites in registerBespokeJobs) and apps/mcp-server/src/scheduler/summaryJobs.ts (5 scheduleCron call-sites), cross-checked against CRONS keys in cronConfig.ts — NOT cronConfig.ts scheduleCron call-sites (there are none). Define canonical granularity = one entry per scheduled job registration; current hand-curated 66-entry lists use grouped entries (e.g. "weeklyPortfolioReport+weeklySummary"), so the generator's first run re-baselines both outputs to the code-derived count rather than reproducing 66. (B) Generator writes cron-registry.json#jobs + #schedulerFileCount (= jobs.length by construction) atomically (temp+rename, mirroring gen-tool-registry.ts TEMP_PATH pattern), and patches ONLY .project.microservices[id=mcp-server].crons in system-map.json via parsed surgical update — never full-doc overwrite. Delete the manual dual-write _trigger at cron-registry.json:4 and the stale _ssot backward-compat framing. (C) Update apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts:281-288: replace the literal expect(schedulerFileCount).toBe(65) with a structural assert schedulerFileCount === jobs.length (plus optional generated-vs-committed diff check). (D) project-stats.json: do NOT silently drop schedulerFileCount — apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts reads it at runtime (lines 44/110/449); either have gen-project-stats.ts emit it from the same enumeration module as gen-cron-registry.ts, or repoint dailyDashboardJob.ts to cron-registry.json and then drop the field. Fix gen-project-stats.ts countCronJobsFromSource() stale cron.schedule() probe to count scheduleCron registrations via the shared enumeration (kills cronJobCount=2). (E) Update docs/agents/system-auditor/flow/main.md:456 to verify generated-vs-code (run generator in --check mode, diff against committed files) instead of hand-vs-hand. FILES: scripts/gen-cron-registry.ts (new), scripts/gen-project-stats.ts, docs/data/cron-registry.json, docs/data/system-map.json, docs/data/project-stats.json, docs/agents/system-auditor/flow/main.md, apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts, apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts (only if repointing).

#### state-data-files-P3 · impact=high effort=S · **CONFIRMED** — Delete NOTE_SIGNALS_DB_DRAIN.md (or rewrite as a 3-line pointer to the live drain)

*Addresses*: state-data-files-I3

**Change**: Replace the entire content of docs/signals/NOTE_SIGNALS_DB_DRAIN.md with: status REVIVED, writer = scripts/agents-flow/drain-signals.js (7-day prune, fingerprint dedup), rebuild = scripts/migrations/backfill-signals-db.ts, SSOT = filesystem move per drain-signals.js §0a-1 — or delete the file outright since drain-signals.js:3 already documents the contract. Deletion preferred: one fewer truth claim to drift.

*Files*: docs/signals/NOTE_SIGNALS_DB_DRAIN.md

*Risk*: None — the note's only remaining function is to mislead.

*Verifier*: All cited evidence verified raw: NOTE_SIGNALS_DB_DRAIN.md:3 quote exact ("Dead since 2026-05-22"); drain-signals.js:3 quote exact (drain → fingerprint dedup vs signals.db → processed/ + DB INSERT → 7-day prune); signals.db signals_processed max(processed_at)=2026-07-13T15:19:04Z with 186 rows — the DB is live and fresher than the audit's citation, so the two-files-opposite-truths contradiction is real and worsening. Fix not already done: file unchanged since commit 6535a4426; no orch-state board/backlog row targets it (CLEAN-SIGNALS-DIR-NONSIGNAL-ARTIFACTS covers 3 different JSON artifacts). No invariant violated: repo-wide grep shows the ONLY inbound reference is the audit brief itself, so deletion breaks no pointer; live contract already documented in drain-signals.js header + docs/agents/dev-team/flow/drain-signals.md; scripts/migrations/backfill-signals-db.ts exists. Proposal is concrete (exact file, delete-preferred with exact rewrite fallback text). Two notes for the executor: (a) dedup with sibling proposal auditor-signal-loop-P7 step (2) in the same audit brief (line ~1162), which rewrites the same file — this proposal's deletion should supersede that step; (b) the DB table is signals_processed, not signals, for any acceptance-check query.

#### state-data-files-P2 · impact=medium effort=M · **RESCOPE** — Mint a diagnostic task: snapshot write dead since Jul 7 while ticks ran — add a staleness tripwire to telemetry Step 6

*Addresses*: state-data-files-I2

**Change**: File a signal/backlog row (PLAN-ONLY per anomaly→BACKLOG invariant) for dev-team: why did Step 4.7 stop producing files after 2026-07-07 while ticks fired on 07-10. Concrete hardening regardless of root cause: in docs/agents/cowork-team/flow/telemetry.md Step 6, when promoting to cycle-snapshot-latest.json, compare source-file age; if the newest cycle-snapshot-HH:MM is older than 2 ticks, emit a signal file (existing cowork-error-boundary pattern) instead of silently reusing stale data.

*Files*: docs/agents/cowork-team/flow/telemetry.md, docs/signals/ (new signal)

*Risk*: Tripwire could fire during legitimate market-closed windows — gate it on calendar_status like the auditor market-hours fix (feedback_auditor_freshness_threshold_market_hours_blind).

*Verifier*: Cited mtimes, signal files, and the tick-snapshot.md:60 quote all verify exactly. But (1) the diagnostic premise is wrong: the Jul-10 tick signals themselves record "action: no dispatch — slot undeliverable-gateway-blind / deprecated-backstop" on every tick, i.e. zero WON_SLOTS, and tick-snapshot.md:15 makes Step 4.7 conditional on WON_SLOTS non-empty — so no snapshot was ever due Jul 8–11; the line-60 zero-blocker path masked nothing. Step 4.7 has also RESUMED (fresh HH:MM snapshots with 12–13 jul mtimes, e.g. docs/data/cycle-snapshot-12:08.json). The "why did Step 4.7 stop" dev task is already answered and its dispatch-side root cause is already queued (FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK). (2) The proposed tripwire checks the wrong layer: today the newest HH:MM snapshot is fresh yet cycle-snapshot-latest.json is 6 days stale (7 jul 21:47) — the silent failure is the server-side promotion inside emit_pressure_state (telemetry.md Step 6.0 "NEVER throws... dispatcher continues regardless"), which is failing right now while pressure-state.json (13 jul 17:37) reports stale_warning:false and last_regime:"unknown". A "newest HH:MM older than 2 ticks" check would read green during this live failure AND would false-positive on legitimate silent/off-hours ticks (known market-hours-blind freshness FP class; cf. reference_isstale_stale_warning_forces_legacy.md). No invariant violations — PLAN-ONLY signal is compliant — but the task must be rescoped to the layer that is actually broken.

*Rescope*: Mint PLAN-ONLY signal/backlog row (anomaly→BACKLOG invariant) for dev-team: "cycle-snapshot-latest.json promotion inside emit_pressure_state silently dead since 2026-07-07 21:47 while fresh HH:MM snapshots resumed 07-12 — add two-layer, market-hours-aware staleness tripwire to telemetry.md Step 6.0". Scope: (A) INVESTIGATE (server-side, apps/mcp-server): why emit_pressure_state did not promote cycle-snapshot-latest.json on 2026-07-13 market-hours ticks (fresh sources existed: docs/data/cycle-snapshot-02:13/02:25/02:39/04:12/05:24.json, 13 jul) yet returned success and wrote pressure-state.json with stale_warning:false and last_regime:"unknown" — the tool's own staleness flag is false while latest.json is 6 days old (double-masked). (B) HARDEN (docs/agents/cowork-team/flow/telemetry.md Step 6.0, flow-level, ~10 lines, keeps file <200L): after the emit_pressure_state call, dispatcher checks the returned cycle_snapshot_promoted/stale_warning fields (already in the tool contract per reference_isstale_stale_warning_forces_legacy.md) AND compares mtimes: if calendar_status != "closed" AND a docs/data/cycle-snapshot-HH:MM.json newer than docs/data/cycle-snapshot-latest.json exists AND latest.json mtime did not advance across the call, write a cowork-error-boundary signal file (enveloped schema) — gate on calendar_status from Step 4.3 to avoid the known off-hours/silent-tick false-positive class (Step 4.7 legitimately skips when WON_SLOTS empty). Explicitly EXCLUDE the originally proposed "Step 4.7 stopped after 07-07" diagnostic: answered — Jul 8–11 ticks dispatched zero slots (undeliverable-gateway-blind/deprecated-backstop, per the Jul-10 signal payloads themselves; dispatch root cause already queued as FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK); Step 4.7 resumed 07-12. FILES: docs/agents/cowork-team/flow/telemetry.md, docs/signals/ (new signal), apps/mcp-server (emit_pressure_state promotion path, investigation only in the plan row).

#### state-data-files-P7 · impact=medium effort=M · **UNVERIFIED** — Add a decision_journal eviction pass to orch-cold-evict.sh + drop the legacy _closed_signals key

*Addresses*: state-data-files-I7, state-data-files-I14

**Change**: In scripts/orch-cold-evict.sh, add a pass mirroring the sprint_goal.entries pattern (FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT): evict .decision_journal[] entries with ts older than 14 days (keep min 10 newest) to a .decision_journal[] array in the monthly cold file. Same run: `del(.task_board._closed_signals_20260614)` — its content (closed-signal record from po-S50, 2026-06-14) moves to the cold file verbatim. Both writes flow through the existing ORCH_APPLY_ALLOW_SHRINK path the script already owns. Add a coherence WARNING (non-blocking) in scripts/orch-validate.mjs when decision_journal length > 50.

*Files*: scripts/orch-cold-evict.sh, scripts/orch-validate.mjs, apps/mcp-server/src/infrastructure/orchStateSchema.ts

*Risk*: Conservation check counts task/signal totals, not journal entries — verify orch-conservation-check.mjs is indifferent before shipping; schema change to monthly archive needs the orchStateSchema.ts tri-point update (project_orchstate_zod_dual_point_validation).

#### state-data-files-P8 · impact=medium effort=M · **UNVERIFIED** — Extend orch-cold-evict.sh: stub-out terminal tasks inside ACTIVE sprints

*Addresses*: state-data-files-I8

**Change**: New pass in scripts/orch-cold-evict.sh (alongside the D4 flat-lane pass): for each .task_board.active_sprints[].tasks[] whose status ∈ TERMINAL_TASK_STATUSES (reuse the existing SSOT set from orchStateSchema.ts, per the D4 precedent at orch-cold-evict.sh:19-27) AND done_at older than 7 days, move the full payload to the monthly cold file and leave a stub {id, status, done_at, title} in place so sprint accounting and depends-refs stay resolvable. Expected hot-file saving now: ~90-100 KB (51 terminal tasks across 6 sprints).

*Files*: scripts/orch-cold-evict.sh, scripts/orch-validate.mjs, apps/mcp-server/src/infrastructure/orchStateSchema.ts

*Risk*: In-sprint task refs (depends[], blocks[]) must keep resolving against stubs — keep id+status in the stub and extend orch-validate.mjs Stage 1c to accept stub targets; coordinate with the already-minted FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP so the two don't collide on the same sprints (complementary, different layer).

#### state-data-files-P9 · impact=medium effort=M · **UNVERIFIED** — Sweep spent one-shot .jq payloads out of scripts/ root and add a policy bucket so the pile stops regenerating

*Addresses*: state-data-files-I9

**Change**: Bulk op >100 files → script: scripts/audits/sweep-oneshot-jq.sh that (a) builds the referenced-set from grep over docs/agents, docs/policies, .claude/skills, docs/standards, docs/protocols, (b) `git mv` every unreferenced scripts/*.jq (≈448 of 490) to scripts/archive/oneshot-jq/ (new dir; precedent: scripts/migrate-done-canonical.jq.archive already hand-archived one), single commit with explicit paths. Then add one row to the table in docs/policies/dev-standards.md § Script Persistence (line 9-15): "Spent one-shot orch mutation payload | scripts/archive/oneshot-jq/ — sweep after sprint close". Keep the 42 doc-referenced .jq files in place.

*Files*: scripts/audits/sweep-oneshot-jq.sh (new), scripts/*.jq (~448 moves), docs/policies/dev-standards.md

*Risk*: A live flow could reference a .jq via constructed path the grep misses — mitigate: `git mv` not delete (paths recoverable), and run the sweep --dry-run first with the list posted for PO signoff; serialize the commit (feedback_concurrent_commit_race).

#### state-data-files-P11 · impact=medium effort=M · **UNVERIFIED** — Reverse-orphan GC for backlog-detail.json + relocate it out of archive/

*Addresses*: state-data-files-I11

**Change**: Add to scripts/orch-cold-evict.sh (or a sibling scripts/orch-detail-gc.sh invoked by the same HSC-6 hook): compute the set of ids present in any hot lane; move .items entries not in that set from docs/data/orch/archive/backlog-detail.json into the monthly cold file's existing dormant .backlog_detail[] field (already in the archive schema per orch-cold-evict.sh:29-31 "the dormant `.backlog_detail[]` field ... previously wired to `[]` and never populated"). Separately: git mv backlog-detail.json → docs/data/orch/backlog-detail.json (out of archive/) and rewrite the detail_ref strings in hot rows via one orch-apply transaction, so the live ref target no longer lives in a directory named archive.

*Files*: scripts/orch-cold-evict.sh, docs/data/orch/archive/backlog-detail.json (move), docs/data/orch/orch-state.json (via orch-apply.sh only), scripts/orch-validate.mjs

*Risk*: detail_ref rewrite touches every backlog row in one write — conservation check is count-neutral so it passes, but do it under commit-mutex and verify Stage 1c (dangling-ref) green on the candidate before rename; the move and the ref-rewrite MUST land in the same atomic pair or every ref dangles.

#### state-data-files-P1 · impact=medium effort=S · **CONFIRMED** — Add self-pruning to the tick snapshot step + one-time sweep of the 80 stale files

*Addresses*: state-data-files-I1

**Change**: In docs/agents/cowork-team/flow/tick-snapshot.md Step 4.7 bash block, after `mv "$TMPFILE" "$SNAPSHOT_FILE"` add: `find docs/data -maxdepth 1 -name 'cycle-snapshot-*.json' ! -name 'cycle-snapshot-latest.json' -mmin +1440 -delete` (24 h retention; latest.json exempt). Fix the false comment at line 10: replace "File is ephemeral (overwritten each tick)" with "File is pruned after 24 h by this step". One-time: `find docs/data -maxdepth 1 -name 'cycle-snapshot-*.json' ! -name 'cycle-snapshot-latest.json' -mmin +1440 -delete` now (files are gitignored — no commit needed). Flow edit goes through agent-md-factory discipline; dispatch to the owning agent, router never edits.

*Files*: docs/agents/cowork-team/flow/tick-snapshot.md, docs/data/cycle-snapshot-*.json (deletion)

*Risk*: Near zero — the fallback path (direct get_cycle_bootstrap) already covers a missing snapshot; only latest.json has cross-step readers and it is exempt.

*Verifier*: Evidence verified exactly: (1) docs/agents/cowork-team/flow/tick-snapshot.md:10 contains verbatim "File is ephemeral (overwritten each tick). Not git-committed (.gitignore)." and line 43 confirms SNAPSHOT_FILE keys on HH:MM, so the ephemeral claim is false. (2) File count has GROWN since the audit — 99 cycle-snapshot-*.json now (was 80); exactly 54 pre-July per the cited find command; dry-run of the exact proposed prune command matches 79 files today. (3) Files are gitignored (.gitignore:34) and zero are git-tracked — sweep needs no commit, as claimed. (4) No pruner exists: repo-wide grep for 'cycle-snapshot' hits only the two cowork-team flow docs, two consumer skills, briefs/handoffs/signals, and mcp-server emitPressureStateTool (promotion only, no deletion). Not already fixed or staged: no board row implements pruning; SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED (BACKLOG) concerns the latest.json PROMOTION tickHHMM-floor mismatch — a different defect — and Step 4.7 is demonstrably alive (multiple files written 2026-07-13), so hooking the prune into it will actually execute. Safety verified: both consumers (.claude/skills/step-0-cowork/SKILL.md:38-45, .claude/skills/cycle-bootstrap/SKILL.md:59-66) reject any snapshot >7 min old, so 24h retention deletes nothing readable; cycle-snapshot-latest.json (only cross-step reader target, telemetry.md:19-20) is explicitly exempted; failure path is zero-blocker by design (tick-snapshot.md:60). Invariant-compliant: dispatch via agent-md-factory to owning agent (router never edits), no orch-state write, BSD/macOS find supports -mmin/-delete, one-time sweep is a single command on 79 gitignored files (under the 100-file script threshold). Two coordination notes for the dispatching agent, neither invalidating: (a) sibling unverified proposal cowork-dispatcher-cron-P7 in the same 07-12 audit brief (line 776) fixes the same litter at root cause via a fixed filename cycle-snapshot-current.json + mtime gating and additionally fixes the same-minute cache-miss defect (I6) — if P7 is later confirmed, this prune line becomes a harmless backstop (pattern would only delete a >24h-stale current.json, which consumers already reject); PO should sequence/merge them rather than land both blindly. (b) Known harness bug (Edit-tool hook silently strips multiline edits) — the flow edit adds a line inside a bash fence; the dispatched agent must verify the written block post-edit.

#### state-data-files-P10 · impact=low effort=M · **UNVERIFIED** — Archive the 12 closed pilot-status files and rename the misleading bare pilot-status.json

*Addresses*: state-data-files-I10

**Change**: git mv docs/data/pilot-status*.json → docs/archive/pilots/ (renaming pilot-status.json → pilot-status-technical-analysis.json in the move, since jq .pilot = technical-analysis); keep pilot-status-schema.json only if any flow still mints new pilots — otherwise archive it too. Update the ~11 flow references (docs/agents/developer/flow/microservice-main.md:41 Phase-0 gate, dev-stock-price/flow/main.md:179 'Live SSOT' row, and the 9 sibling dev-* flows) to point at the archive path with a 'pilot phase CLOSED 2026-05' annotation — flow edits via agent-md-factory discipline, dispatched to agents-architect/agent-father lane.

*Files*: docs/data/pilot-status*.json (12 moves), docs/agents/developer/flow/microservice-main.md, docs/agents/dev-*/flow/main.md (~9 files)

*Risk*: If a future pilot reuses microservice-main.md Phase 0, the create-from-schema step must still work — keep pilot-status-schema.json path stable or update the flow line in the same commit.

#### state-data-files-P12 · impact=low effort=S · **UNVERIFIED** — Strip RemoteTrigger residue from cowork-schedule.json

*Addresses*: state-data-files-I12

**Change**: One jq pass over docs/data/cowork-schedule.json: `del(.slots[].trigger_id, .slots[].trigger_status, .slots[]._superseded_by, .slots[].last_reactivated_at)` and collapse _open_questions (the 2026-05-18 spike answers) plus the resolved layer_a_deletion_gate paragraph into a single _history one-liner pointing at docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md §1, which already narrates the retirement. File is not under the orch-apply gate, but write atomically (tmp+mv) and validate with jq before rename.

*Files*: docs/data/cowork-schedule.json

*Risk*: Confirm no matcher/dispatcher code reads trigger_status before deleting (grep scripts/agents-flow + cowork-team flow for the field names); guaranteed-slot launchd firer work in flight (F1-LAUNCHD-COWORK-BACKSTOP) — coordinate so the schema trim doesn't race its edits.

#### state-data-files-P13 · impact=low effort=S · **UNVERIFIED** — Delete verified-orphan data files and the root debug dir

*Addresses*: state-data-files-I13

**Change**: Single cleanup commit: `git rm docs/data/bug-inventory.json docs/data/BATCH_S_1849_SUMMARY.md docs/data/signal-distribution-report.json` (re-verify zero refs at execution time with the same grep set used here); `rm -rf .test-notebook-prune-debug/` (untracked); leave alert-verdicts.json and delivery-cron-delivered.json IF a runtime writer exists — both are gitignored 3-byte stubs, so if `grep -rln alert-verdicts scripts apps` comes back empty, plain rm them too. Note BATCH_S_1849_SUMMARY.md is gitignored per .gitignore:55, so it is a plain rm not git rm.

*Files*: docs/data/bug-inventory.json, docs/data/signal-distribution-report.json, docs/data/BATCH_S_1849_SUMMARY.md, docs/data/alert-verdicts.json, docs/data/delivery-cron-delivered.json, .test-notebook-prune-debug/

*Risk*: bug-inventory.json might be read by a claude.ai-side (non-repo) routine — 0 repo refs is strong but re-grep including docs/ entirely before deleting; everything is recoverable from git history.

#### state-data-files-P14 · impact=low effort=S · **UNVERIFIED** — Move HANDOFF-QUE-REFERENCE-PAGE-1a.md out of the orch data directory

*Addresses*: state-data-files-I14

**Change**: git mv docs/data/orch/HANDOFF-QUE-REFERENCE-PAGE-1a.md → docs/handoffs/ (or docs/archive/ if the QUE-REFERENCE sprint is closed — scripts/pm-decompose-que-reference.jq dates it to 13 Jun); grep for inbound links (docs + scripts) and update them in the same commit. Keeps docs/data/orch/ = exactly {orch-state.json, backlog-detail.json, archive/} so the write-gate perimeter is visually obvious.

*Files*: docs/data/orch/HANDOFF-QUE-REFERENCE-PAGE-1a.md

*Risk*: Minimal — one grep for inbound references before the move.


## Domain: git-ci-publish

### Issues

#### git-ci-publish-I1 · HIGH — Commit-convention format doc describes a dead format — 0/300 recent commits comply

Measured: `git log -300 --pretty=%s | grep -cE '^[a-z]+\([0-9]{4}/'` = 0. Practice is slug task IDs (e.g. `fix(mcp-server): WATCHLIST-DB-SYSMAP-DRIFT-FIX — ...`, `feat(ccato/T2): ...`). Agents that load the format doc get a spec contradicting every commit in git log; the C2/C3-exempt tables in commit-convention-exemptions.md:39-41 (`chore(cycle-NN)`, `chore(pm/NNNN*)`) also reference the extinct numeric era. This is doc rot on the most-referenced policy (84 files reference commit-convention).

*Evidence*: docs/policies/commit-convention-format.md:55 "Scope format: `<sprint>/<area>` — e.g. `feat(1863/scheduler):`" and :73 "Always `NNNN<a-z>` lowercase — e.g. `1863b`, `1866a`"

#### git-ci-publish-I5 · HIGH — Perpetually dirty tree is a workflow design outcome: 78 entries in 4 recurring machine-written categories with no converging owner

git status --short = 78 entries: (a) 41 untracked docs/signals/cowork-team-*.json from 07-10 — signal drops (exec-proof-gate/SKILL.md:50 "Drop signal file at docs/signals/<AGENT_ID>-<ISO>.json") accumulate whenever the drain lane stalls (Docker incident); (b) 21 deletions in docs/signals/processed/ dated 07-03/04 STILL uncommitted although drain commits ran through 07-10 (`chore(signals): drain 2026-07-10T20:19Z`) — the shell glob `docs/signals/*.json` in the commit path list cannot match already-deleted files, so deletions are silently dropped (recurrence of feedback_pathspec_commit_drops_rename_deletion); (c) 7 modified tracked machine-state files (4 notebooks, po-decisions.md, tool-usage-stats.json, signals.db) stranded when their committing session died; (d) debris: `.test-notebook-prune-debug/` and `scratchpad_readtg.txt` at repo root, plus scripts/router-mint-d0b-supplement-exclude-relabel-ids.jq saved 07-10 but never committed (Script Persistence step half-done). dev-team tree-hygiene (main.md:340) only reverts dead-worker edits inside a task_zone — none of these categories fall in one.

*Evidence*: docs/agents/dev-team/flow/drain-signals.md:9 "After drain, commit ONLY these paths: `docs/signals/processed/`, `docs/signals/*.json` (deletions), `docs/signals/signals.db`, ..."

#### git-ci-publish-I6 · HIGH — docs/signals/signals.db: 1.2MB binary SQLite tracked in git, committed 218 times, contradicting the *.db ignore intent and vulnerable to git-reset clobber

signals.db was tracked before/despite the *.db rule, so gitignore does not apply and every drain dirties the tree until the next `chore(signals): drain` commit. 218 binary snapshots bloat the repo (SQLite deltas compress poorly). Worse, the repo's own precedent (.gitignore comment: db-integrity-history.json ignored because it "must survive fleet git reset --hard (FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS)") applies identically here — a fleet reset would roll the live dedup ledger back in time.

*Evidence*: .gitignore:7 "*.db" (plus :8-9 *.db-shm/*.db-wal); git log --oneline -- docs/signals/signals.db | wc -l = 218

#### git-ci-publish-I8 · HIGH — commit-mutex TTL=90s headroom claim is invalidated by the pre-push tsc hook inside the critical section

Step 3d-PUSH (SKILL.md:125-149) executes up to TWO pushes (initial + rebase-retry), each triggering a full workspace tsc via the pre-push hook. A cold tsc run can take 30-60s+; two runs plus rebase can exceed the 90s TTL, at which point the lock expires mid-critical-section and a second claimant wins (SKILL.md:206 "next claimer wins after ≤90s") — recreating exactly the index race the mutex exists to prevent. The no-heartbeat rationale (SKILL.md:193-198) was written without accounting for the hook.

*Evidence*: .claude/skills/commit-mutex/SKILL.md:196-197 "critical section (including push + worst-case rebase-retry) is 5–20s under normal conditions; TTL=90s is 4.5× headroom"; .git/hooks/pre-push runs "pnpm --filter vn-market check" (full tsc) on every push

#### git-ci-publish-I10 · HIGH — /commit skill is a mutex-less whole-tree side door that also contradicts the no-branches invariant and hardcodes a model name

(a) No commit-mutex claim anywhere in the skill, while commit-mutex/SKILL.md:186-187 declares itself "the ONLY permitted path to the git index for commit operations" — running /commit while agents work recreates the dirty-board-capture and concurrent-commit-race failures (feedback_router_commit_captures_dirty_board, feedback_concurrent_commit_race). (b) It sweeps ALL tree changes into commits, including other agents' in-flight files — categorized staging is still a whole-tree capture. (c) Step 4's branch merge/delete logic contradicts the standing invariant 'All work on main branch, no feature branches'. (d) The `<prefix>: <summary>` + Co-Authored-By format diverges from commit-convention trailers, and the hardcoded model name violates no-hardcode norms. Note session-log-cowork/SKILL.md:27-28 is a second mutex-less commit path (bare `git add`+`git commit` for notebooks), partially excused by cowork gateway-blindness but undocumented as an accepted exception.

*Evidence*: .claude/skills/commit/SKILL.md:9 "Commit all changes grouped by category, update related docs, push to main, and clean up the branch."; :91 "## Step 4 — Merge and clean branch (only if NOT on main)"; :55 "Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

#### git-ci-publish-I2 · MEDIUM — Mandatory Sprint/Task/AC trailers absent from ~75% of feat/fix commits

Measured over last 300 commits: 41 feat/fix subjects → only 10 carry `Task:`, 8 carry `AC:`, 6 carry `Sprint:`. Most of these are task-driven (slug in subject) so the no-sprint exemption does not apply. The machine-queryability the trailers were designed for (format.md:90 `git log --grep="Sprint: 1863"`) is effectively lost.

*Evidence*: docs/policies/commit-convention-format.md:81 "Three machine-parseable git trailers on all sprint commits"

#### git-ci-publish-I4 · MEDIUM — Zero blocking enforcement at commit time — convention relies on 'future' hooks and a non-blocking detective script

The only installed hook is pre-push (tsc only). c2-alert.sh checks 3 type/file-set rules, always exits 0, and must be invoked manually per-SHA. Combined with I1-I3 this explains the measured drift: the convention is documentation, not a gate.

*Evidence*: docs/policies/commit-convention.md:7 "Enforced by: `developer`, `fixer`, `qa`, pre-commit hooks (future)"; scripts/audits/c2-alert.sh:5 "Exit: 0 always (detective control, non-blocking)"

#### git-ci-publish-I7 · MEDIUM — Runtime log tracking policy is inconsistent — some session logs tracked, some ignored, some floating untracked

New launchd firer logs (docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log / -error.log) sit untracked in status, while their older siblings are version-controlled. Any policy (track all / ignore all) would be better than the current split, which guarantees status noise every time a firer runs.

*Evidence*: .gitignore:19 "docs/agent-memory/sessions/preflight-lsof-*.log" is the only sessions-log ignore rule; git ls-files shows tracked runtime logs "docs/agent-memory/sessions/fleet-push.log", "fb-daily-firer.log", "fb-daily-firer-error.log"

#### git-ci-publish-I9 · MEDIUM — Bounded rebase-retry push guard copy-pasted as full shell blocks in 3 skills despite naming commit-mutex as SSOT

Violates the standing invariant 'shared boilerplate belongs in ONE base skill referenced by agents, never copy-pasted per agent'. The three copies have already drifted in failure-reporting behavior (commit-mutex/commit → send_telegram(channel=bug); commit-boundary → notebook-log only, justified by gateway-blindness but encoded as divergent inline shell). Any future change to guard semantics must be applied 3× or drifts silently.

*Evidence*: .claude/skills/commit/SKILL.md:62-63 "same semantics as `.claude/skills/commit-mutex/SKILL.md` Step 3d-PUSH, which is the SSOT" — followed by the full ~25-line pasted block (:66-89); same block at commit-boundary/SKILL.md:63-84 and commit-mutex/SKILL.md:125-149

#### git-ci-publish-I3 · LOW — Seven undeclared commit types in live use (incident, qa, ops, arch, pm, po, ba)

31/500 recent commits use role-named types outside the vocabulary (16 qa, 9 ops, 2 arch, 1 each pm/po/ba/incident). Either the vocabulary must absorb them or agents must map to `chore(<role>/...)`. Currently nothing decides — c2-alert.sh does not check type membership.

*Evidence*: docs/policies/commit-convention-format.md:42-49 type table lists only "feat|fix|chore|test|docs|refactor"; HEAD commit is `incident(ops): 2026-07-11T14:18Z Docker Desktop daemon failure`

#### git-ci-publish-I11 · LOW — commit-boundary R-HANDOFF has an unbounded WAIT for router ack

No timeout, poll interval, or fallback path is specified for agents-architect/agent-father under contention. If the router never processes the `commit-handoff-request` signal row (nothing in CLAUDE.md's router protocol mentions this signal type), the agent hangs indefinitely with work uncommitted — feeding the dirty-tree categories in I5.

*Evidence*: .claude/skills/commit-boundary/SKILL.md:113 "→ WAIT for router ack: `{type: \"commit-handoff-ack\", from: \"router\", to: \"<agent>\"}`"

#### git-ci-publish-I12 · LOW — commit-mutex 230L size overage partially self-inflicted: Quick Reference block duplicates the protocol in the same file

~22 lines of internal duplication (the 7-step Quick Reference summarizes the exact same acquire/stage/verify/commit/push/release sequence). Trimming it (or replacing the prose with the compact block) brings the file to ~200L, matching the waterfall cap without losing any semantics — the overage justification's 'cannot be abbreviated' claim does not hold.

*Evidence*: .claude/skills/commit-mutex/SKILL.md:1 size-justification claims "All steps load-bearing ... cannot be abbreviated"; lines 214-235 "## Quick Reference (copy-paste block for flow wiring)" restate Steps 1-4 already specified at lines 30-173

#### git-ci-publish-I13 · LOW — 4-file commit-convention split costs 2 reads per lookup; 36-line redirect index serves ~5 actual § callers

265 total lines across 4 files (59+100+42+64). Grep: 84 files reference commit-convention, but only 5 use `§`-anchor style — the entire redirect section (lines 25-59) exists for 5 callers that could be updated in minutes. Every agent writing a commit must read index + child (2 loads); a single ≤120L file (feasible once the dead numeric-era content from I1 is removed) is cheaper on every load.

*Evidence*: docs/policies/commit-convention.md:21-23 "## Section Redirects (back-compat for `§ X` references) — Callers that say `commit-convention.md § X` should still find the section here, then follow to the child."

#### git-ci-publish-I14 · LOW — qa-checklist.md prescribes numeric-era artifact names that no longer match slug task IDs

Current task IDs are slugs (WATCHLIST-DB-SYSMAP-DRIFT-FIX, CCATO-T3-FLOW-WIRING-6PT). QA cannot mechanically apply the NNN naming checks; each QA run silently improvises, weakening the checklist's audit value.

*Evidence*: docs/policies/qa-checklist.md:5 "Test file exists: `src/__tests__/NNN-task-name.test.ts`"; :65 "Create `reports/TASK_REPORT_NNN.md`"

### Proposals

#### git-ci-publish-P1 · impact=high effort=M · **RESCOPE** — Consolidate the 4 commit-convention docs into ONE file that documents the format actually in use

*Addresses*: git-ci-publish-I1, git-ci-publish-I3, git-ci-publish-I13, git-ci-publish-I2

**Change**: Rewrite docs/policies/commit-convention.md as a single ~110L SSOT: (1) format `<type>(<zone-or-task-scope>): <TASK-SLUG> <title>` with slug task IDs replacing the dead `NNNN<a-z>`/numeric-sprint rules from commit-convention-format.md:55-75; (2) type vocabulary decision — either add `incident` and map role commits to `chore(<role>/...)`, or admit role types explicitly (pick one, encode it); (3) fold the still-live parts of exemptions (No-Sprint rule, notebook-commit C3 exemption) and examples (notebook + merge patterns) in; (4) delete commit-convention-format.md, commit-convention-exemptions.md, commit-convention-examples.md; (5) update the 5 `§`-anchor callers (grep 'commit-convention.md §') to plain file references and drop the 36-line redirect table. Update trailer rule to match reality: `Task:` slug trailer required on feat/fix, `AC:` required on feat/fix, `Sprint:` dropped or made optional (no sprint numbers exist anymore).

*Files*: docs/policies/commit-convention.md, docs/policies/commit-convention-format.md, docs/policies/commit-convention-exemptions.md, docs/policies/commit-convention-examples.md

*Risk*: 84 files reference commit-convention.md — the index filename must be kept (rewrite in place, never rename) so only the 5 §-anchor callers need edits. Dispatch via agent-father (owns .claude/skills + docs/agents zone) per agent-md-factory discipline.

*Verifier*: Every cited evidence line verified verbatim and empirical claims confirmed or understated (0/300 commits use numeric sprint scope or NNNN<a-z> IDs; all 7 undeclared types live in git log plus 4 more; Task trailer absent on 39/47 = 83% of recent feat/fix; HEAD-region commit is incident(ops)). Not implemented and no equivalent fix queued (orch-state.json has zero commit-convention rows; memory has none). No standing invariant violated (110L < 200L cap; SSOT-positive). RESCOPE, not CONFIRMED, because the change-set misses two coupled surfaces that would immediately regenerate the doc-vs-enforcement drift it exists to fix, and its own caller-update grep ('commit-convention.md §') structurally cannot catch either: (a) scripts/audits/commit-convention-audit.sh:33 declares its VOCAB "kept in sync" with format.md § Scope Rules (a file the proposal deletes — and the comment cites .claude/knowledge/commit-convention.md, a path that no longer exists), and its C1/C2/C3 predicates enforce the dead format (Sprint trailer, digit-in-scope, NNNN IDs) — deleting format.md orphans the sync contract and leaves an auditor script enforcing a deleted convention; format.md:36's heredoc/`git commit -m`-only/never-`-a` rule is live behavior (c47 incident root cause, merge-gate Control 4 scripts/audits/c2-alert.sh) that a rewrite documenting only "format in use" could silently drop; (b) docs/references/tree-map.md:71-77 lists the 4-file family as a DAG subtree — deleting 3 children without updating it breaks the tree-map DAG invariant. Matches the prior adjudication of this same proposal at docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md:1771, which I re-verified independently.

*Rescope*: Consolidate the 4 commit-convention docs into ONE ~110-120L SSOT documenting the format actually in use, PLUS reconcile the two enforcement/DAG surfaces coupled to the deleted files. CHANGE: (1) Rewrite docs/policies/commit-convention.md as single SSOT: format `<type>(<zone-or-task-scope>): <TASK-SLUG> <title>` with slug task IDs replacing dead NNNN<a-z>/numeric-sprint rules; (2) type vocabulary decision — either add `incident` and map role commits to `chore(<role>/...)`, or admit role types explicitly (pick one, encode it; note live role types observed: qa, ops, po, pm, incident, arch, ba); (3) MUST carry forward verbatim the live heredoc shell pattern and the `git commit -m`-only / NEVER `-a` rule from commit-convention-format.md:21-36 (c47 incident root cause; enforced by merge-gate Control 4 scripts/audits/c2-alert.sh) — this is live behavior, not dead format; (4) fold in still-live exemptions (No-Sprint rule, C3 notebook-commit exemption) and examples (notebook + merge patterns); (5) trailer rule updated to reality: `Task:` slug trailer + `AC:` required on feat/fix, `Sprint:` dropped; (6) delete commit-convention-format.md, commit-convention-exemptions.md, commit-convention-examples.md; (7) update § callers to plain file refs and drop the 36-line redirect table — grep BOTH 'commit-convention.md §' AND 'commit-convention' (path-only refs) since two callers cite the nonexistent .claude/knowledge/commit-convention.md path (scripts/audits/commit-convention-audit.sh:33, docs/architecture-briefs/2026-05-17-commit-convention-audit.md:51) — fix those paths to docs/policies/commit-convention.md; (8) scripts/audits/commit-convention-audit.sh: its C1/C2/C3 predicates encode the dead format (Sprint trailer, digit-in-scope, NNNN IDs) — either update predicates + VOCAB sync comment to the new slug convention, or mark the script deprecated with a header pointer to the new SSOT and remove it from any live invocation path (verify with grep -r 'commit-convention-audit' across scripts/, .claude/, docs/agents/); (9) update docs/references/tree-map.md:71-77 to replace the 4-file subtree with the single consolidated node (tree-map DAG invariant). FILES: docs/policies/commit-convention.md, docs/policies/commit-convention-format.md (delete), docs/policies/commit-convention-exemptions.md (delete), docs/policies/commit-convention-examples.md (delete), scripts/audits/commit-convention-audit.sh, docs/references/tree-map.md, plus § / path callers found by the two greps.

#### git-ci-publish-P8 · impact=high effort=M · **RESCOPE** — Stranded machine-state sweep: give the dirty-tree categories a converging owner on the dev-team tick

*Addresses*: git-ci-publish-I5

**Change**: Add a bounded step to docs/agents/dev-team/flow/post-cycle.md (which already holds commit-mutex refs): `git status --porcelain` → for each entry older than 24h mtime, match against a small category table (notebooks/decisions → chore(memory/...); docs/agent-memory/sessions/*.md → chore(sessions); docs/agent-memory/modules/*.json → chore(data); scripts/* → chore(scripts) + missing-pointer signal per Script Persistence; unknown paths → signal_queue row to po, never auto-commit). One commit per category, explicit paths, inside the already-held mutex. Cap at 20 paths/tick (bulk >100 files = script per invariant — the categorizer itself should be scripts/agents-flow/stranded-state-sweep.sh emitting a plan the flow executes).

*Files*: docs/agents/dev-team/flow/post-cycle.md, scripts/agents-flow/stranded-state-sweep.sh

*Risk*: Auto-committing another agent's notebook mid-write is the main hazard — the 24h age gate plus dev-team's existing dead-session detection (main.md:336 tree-hygiene) bounds it; unknown paths route to po instead of being committed, per feedback_push_blocked_by_perpetual_dirty_tree ('dirty tree→commit via agents'). Complements P2/P3: after untracking (P2) and deletion-safe drain (P3), this sweep handles only the residual notebook/session/scripts strandings, so volume stays small.

*Verifier*: Evidence verified: drain-signals.md:9 quote is exact, post-cycle.md holds commit-mutex refs, live tree shows 80 dirty entries dominated by the named machine-written categories, and memory feedback_push_blocked_by_perpetual_dirty_tree.md explicitly names an unbuilt sweep as the durable fix — so the problem is real and the core is not implemented or queued. But the proposal as written has one collision and two concreteness gaps: (1) the `docs/agent-memory/modules/*.json → chore(data)` category collides head-on with the QUEUED RC-GITSTATE leg of SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE (systemic-remake §2.3: "gitignore pure-derived counters" — tool-usage-stats.json lives in modules/, coverage-state.json sibling) and with a CONFIRMED sibling proposal in the same 2026-07-12 ultracode report (L1797) extending the gitignore to signals.db/session-logs; auto-committing those files re-adds the exact churn the queued fix removes. (2) porcelain `D` entries have no on-disk mtime, so the 24h gate is undefined for deletions. (3) per-path PO signals for unknown paths with no dedup = signal_queue spam every tick from the standing long-tail (tnb-audit-latest.md, fb-post-*.md, synthesis json, auditor-last-healthy). No standing invariant violated (dev-team flow not router, main branch, explicit paths, mutex-held, script in scripts/, 20-path cap, orch-state excluded from auto-commit). Corrected version in rescope.

*Rescope*: Stranded machine-state sweep: bounded converging-owner step on the dev-team tick. Add Step 4.3 to docs/agents/dev-team/flow/post-cycle.md (after Step 4.2 cold-evict, before 4.5; keep flow addition <=20 lines — post-cycle.md is 168L, must stay under the 200L waterfall cap): run `bash scripts/agents-flow/stranded-state-sweep.sh --plan` which emits a commit plan the flow executes. Script logic: `git status --porcelain` -> for each entry, classify into THREE buckets. (A) AUTO-COMMIT categories, only if mtime older than 24h (deletions `D` have no mtime — treat as immediately eligible, content is already gone): docs/agent-memory/notebooks/* + docs/agent-memory/decisions/* -> chore(memory/<agent>); docs/agent-memory/sessions/*.md -> chore(sessions); scripts/* -> chore(scripts) + emit ONE missing-pointer signal per Script Persistence (docs/policies/dev-standards.md). NOTE: docs/agent-memory/modules/*.json is REMOVED from auto-commit — it is owned by queued SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE RC-GITSTATE (gitignore pure-derived counters); skip silently and leave for that fix. (B) OWNED-ELSEWHERE skip list (silent, no signal, no commit): docs/signals/** (drain Step 0a commit owner per drain-signals.md:9 — untracked signals are pending inbox, deletions belong to the drain commit), docs/data/orch/orch-state.json (orch-apply flows), docs/data/cowork-schedule.json, docs/data/coverage-state.json, docs/agent-memory/modules/** and docs/data/auditor-*-last-healthy.json (cowork/auditor churn + RC-GITSTATE candidates). (C) UNKNOWN paths: never auto-commit; emit exactly ONE aggregated signal_queue row per tick (type=system-issue, to=po, payload=path list) via .claude/skills/signal-dashboard/SKILL.md § WRITE, and skip emission if an OPEN stranded-state-sweep row already exists (dedup by from+summary prefix) — never per-path rows. Execution: cap 20 paths/tick across all categories; claim commit-mutex:main (TTL=120s) once, one commit per category with EXPLICIT paths from the plan (never `git add -A`), release after — same contract as Step 4.2/4.5. Script exit non-zero -> log BUG telegram, skip commits, continue to Step 4.5 (never block compact). FILES: docs/agents/dev-team/flow/post-cycle.md, scripts/agents-flow/stranded-state-sweep.sh (+ .test.sh per sibling script convention). Cross-ref in dispatch brief: SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE (RC-GITSTATE) so the gitignore migration and this sweep land coherently — when RC-GITSTATE untracks a path, it drops out of porcelain and the sweep needs no change.

#### git-ci-publish-P2 · impact=high effort=S · **CONFIRMED** — Untrack machine-written state: signals.db, runtime logs, test debris — gitignore policy for the machine-state plane

*Addresses*: git-ci-publish-I6, git-ci-publish-I7, git-ci-publish-I5

**Change**: (a) `git rm --cached docs/signals/signals.db` — the existing .gitignore:7 `*.db` rule then applies automatically; edit docs/agents/dev-team/flow/drain-signals.md:9 to remove `docs/signals/signals.db` from the commit-path list and drop the db from the MANDATORY PERSIST GUARD commit step (keep the mtime freshness check). (b) `git rm --cached docs/agent-memory/sessions/*.log` and replace .gitignore:19 `docs/agent-memory/sessions/preflight-lsof-*.log` with `docs/agent-memory/sessions/*.log`. (c) Append `.test-notebook-prune-debug/` and root-level `scratchpad_*.txt` to .gitignore. This is the same rationale already ratified for docs/data/db-integrity-history.json (.gitignore comment: 'must survive fleet git reset --hard').

*Files*: .gitignore, docs/agents/dev-team/flow/drain-signals.md

*Risk*: signals.db loses its git-history backup; mitigate by adding it to the existing backup-smoke scope (feedback_backup_structural_smoke) before untracking. Follow feedback_pathspec_commit_drops_rename_deletion: the untrack commit must stage the .gitignore edit AND the rm --cached deletions together.

*Verifier*: All cited evidence verified in-repo: .gitignore:7-9 (*.db/*.db-shm/*.db-wal); signals.db tracked with 228 commits (proposal's 218 has since grown — direction confirmed); tracked runtime logs fleet-push.log/fb-daily-firer*.log confirmed via git ls-files, plus pm.log, fleet-push-error.log and ~20 preflight-lsof-*.log tracked DESPITE the ignore rule, so the inconsistency is understated; drain-signals.md:9 quote exact and it is the sole flow/script mandating the db commit (drain-signals.js explicitly excludes the commit step). Not already implemented or queued: the only related backlog item, SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE / RC-GITSTATE (2026-07-04-systemic-remake.md §2.3, status BACKLOG), targets only tool-usage-stats.json + coverage-state.json — this proposal extends the identical, already-ratified pattern (.gitignore:60-61 db-integrity-history.json 'must survive fleet git reset --hard') to files no queued fix covers. No standing invariant violated; untracking reinforces SQLite-local-only. Safety independently confirmed: WAL/shm were already ignored so committed db snapshots were torn and never a reliable restore point; drain-signals.md §0a-0 has an explicit missing-db degradation path and scripts/migrations/backfill-signals-db.ts rebuilds from processed JSON; the RUN-IDLE preflight (main.md:101) probes disk mtime via stat, unaffected by tracking status and kept by the proposal; no automation runs git clean at repo root, and untracked+ignored files survive git reset --hard (the exact cited failure mode). Concrete enough to hand to a dev agent as-is. Non-blocking nits for the dispatch brief: (1) the preflight-lsof ignore rule is .gitignore line 20, not 19 (content quoted correctly); (2) blanket `git rm --cached docs/agent-memory/sessions/*.log` also untracks frozen incident-evidence logs (headlock-h1-live-evidence-*, indexlock-race-evidence-*, ops-1912*) — they remain on disk and are referenced only in architecture-brief text, but the implementer may exclude them; (3) .test-notebook-prune-debug/ has since been deleted from disk, so its gitignore line is preventive-only (still worthwhile — audit item memory-docs-hygiene-P8 independently proposed exactly this guard); (4) cross-reference RC-GITSTATE in the task so both gitignore migrations land coherently.

#### git-ci-publish-P3 · impact=high effort=S · **RESCOPE** — Fix the drain commit's deletion drop: git pathspec sweep scoped to the drain-exclusive zone + post-commit clean check

*Addresses*: git-ci-publish-I5

**Change**: In docs/agents/dev-team/flow/drain-signals.md:9 and the §0a commit step, replace the path list 'docs/signals/processed/, docs/signals/*.json (deletions)' with `git add -A -- docs/signals/` (git-native pathspec — captures deletions of already-removed files, which the current shell-glob form cannot). Add a post-commit invariant: `git status --porcelain -- docs/signals/ | grep -v signals.db | wc -l` must be 0, else send_telegram(channel=bug). Add one clause to commit-boundary/SKILL.md RULE 1: 'Exception: the dev-team drain lane MAY use `git add -A -- docs/signals/` while holding commit-mutex:main — docs/signals/ is drain-exclusive during the hold', so the sweep ban stays coherent. Also commit the 21 currently-stranded processed/ deletions as a one-shot `chore(signals): backfill 07-03/04 prune deletions`.

*Files*: docs/agents/dev-team/flow/drain-signals.md, .claude/skills/commit-boundary/SKILL.md

*Risk*: Scoped sweep could capture a foreign write into docs/signals/ during the mutex hold — acceptable because signal files are the drain lane's declared zone and the mutex serializes committers; the RULE-1 exception clause makes this auditable rather than silent.

*Verifier*: Evidence real (drain-signals.md:9 verbatim; glob form provably drops deletions) and the structural fix is not yet implemented or queued — but the proposal fails three ways as written. (1) The one-shot backfill is ALREADY DONE: commit df0b58bd9 (2026-07-12 "drain + prune multi-tick backlog") committed all 07-03/04 stranded processed/ deletions; docs/signals/ has zero deletions today. (2) The premise "docs/signals/ is drain-exclusive during the hold" is false — 39 untracked cowork-team-*.json inbox files sit there right now, emitted every ~15min by agents holding no mutex; `git add -A -- docs/signals/` would sweep undrained/mid-write inbox JSONs into drain commits. (3) The post-commit invariant counts `??` untracked lines, so legitimate new signal arrivals in the commit→check window fire false bug telegrams. Also commit-boundary/SKILL.md governs pm/agents-architect/agent-father/ops, not dev-team, so the RULE 1 exception as phrased binds nothing. Only docs/signals/processed/ is drain-exclusive; top-level is a shared inbox.

*Rescope*: Fix the drain commit's deletion drop with tracked-only staging + FP-safe invariant. In docs/agents/dev-team/flow/drain-signals.md:9, replace the commit path list 'docs/signals/processed/, docs/signals/*.json (deletions)' with: `git add -u -- docs/signals/ && git add -- docs/signals/processed/` (-u stages modifications+deletions of TRACKED files only — captures pruned processed/ deletions and top-level inbox deletions without ever sweeping other agents' untracked/mid-write inbox arrivals; the second add stages the drain's own new processed/ files, and processed/ IS drain-exclusive). Keep signals.db and orch-state.json staging as-is (-u already covers signals.db). Add post-commit invariant to the same step: `git status --porcelain -- docs/signals/ | grep -v '^??' | grep -v signals.db | wc -l` must be 0, else send_telegram(channel=bug) — the ^?? exclusion prevents false alarms from signal files legitimately arriving mid-commit. In .claude/skills/commit-boundary/SKILL.md RULE 1, add a one-line cross-reference note (not an exception grant): 'Note: the dev-team drain lane (docs/agents/dev-team/flow/drain-signals.md §0a) uses `git add -u -- docs/signals/` under commit-mutex:main; -u never stages untracked files, so it cannot capture other agents' unstaged work — this is not a directory sweep in the RULE 1 sense.' DROP the one-shot backfill entirely — already done in commit df0b58bd9 (2026-07-12). FILES: docs/agents/dev-team/flow/drain-signals.md, .claude/skills/commit-boundary/SKILL.md.

#### git-ci-publish-P4 · impact=high effort=S · **CONFIRMED** — Path-filter the pre-push tsc hook: skip full tsc for pushes touching no code

*Addresses*: git-ci-publish-I8

**Change**: In scripts/git-hooks/pre-push (symlink target of .git/hooks/pre-push), before running `pnpm --filter vn-market check`, read the ref range from stdin and compute `git diff --name-only <remote-sha>..<local-sha>`; if no path matches `^(apps|packages|scripts)/.*\.(ts|tsx|js|mjs|json)$` (excluding docs/), print '[pre-push] no code paths in range — skipping tsc' and exit 0. Keep full tsc for any code-touching push and for the zero-remote-sha (new branch) case.

*Files*: scripts/git-hooks/pre-push

*Risk*: A doc-only push that SHOULD have included a forgotten .ts file would slip through — but that failure class (Loop #20) is only catchable when the code IS in the range, so the filter loses nothing. ~68% of commits are chore/docs (338+24 of 500), so this removes the tsc tax from the majority of pushes and shrinks the mutex-held critical section back inside the 5-20s envelope the 90s TTL was designed for.

*Verifier*: Evidence verbatim-verified: commit-mutex SKILL.md No-Heartbeat Rule (~L192-197) claims "5-20s critical section, TTL=90s is 4.5x headroom", and scripts/git-hooks/pre-push (symlink target of .git/hooks/pre-push, confirmed) runs `pnpm --filter vn-market check` unconditionally on every push. Empirically measured: the full tsc check takes 93.6s wall-clock — it ALONE exceeds TTL=90s, so every push holds the commit-mutex past expiry and a peer task_claim can win mid-push (the exact concurrent-commit race the mutex prevents). Issue is worse than cited. No duplicate: no path filter exists in the hook, no equivalent backlog row (TE-T08 is a doc restructure of the SKILL, not a hook fix), no memory record of a queued equivalent. No invariant violated: change stays in scripts/, install.sh symlink contract unchanged, path regex is repo layout not system-map structural data, and skipping tsc for a range touching zero code paths cannot introduce new tsc breakage on remote (any code-introducing push still runs the gate). Proposal is concrete (file, insertion point, regex, stdin protocol, zero-remote-sha case). Implementation hardening the dev agent MUST include (all verified against repo): (a) fail-open — run full tsc if `git diff` fails (remote sha absent locally; hook has `set -e`, a bare diff failure would otherwise block the push confusingly); (b) skip deleted-ref stdin lines (local sha = all zeros); (c) loop over ALL stdin ref lines, run tsc if ANY line is code-touching; (d) add root-level package.json, pnpm-lock.yaml, pnpm-workspace.yaml to the code-touching set (dep changes affect tsc; apps/mcp-server/tsconfig.json has no `extends` so root tsconfig.json is NOT a hole; bctc-schema imports resolve to apps/mcp-server/bctc-schema.ts, inside the filter). Caveat for the parent: this fixes the dominant fleet case (doc/notebook/orch-state pushes) but code-touching pushes still hold the mutex ~94s > TTL — the SKILL.md 5-20s/4.5x claim needs its own follow-up (raise TTL or re-introduce heartbeat for code pushes); that narrows what this proposal solves but does not refute it.

#### git-ci-publish-P7 · impact=high effort=S · **RESCOPE** — Rescope /commit skill: mutex-bound, main-only, convention-aligned

*Addresses*: git-ci-publish-I10

**Change**: Edit .claude/skills/commit/SKILL.md: (1) delete Step 4 'Merge and clean branch' (:91-96) and the 'merge and clean branch' phrases in frontmatter description and :9 — contradicts the no-branches invariant; (2) insert a Step 1.5 'claim commit-mutex:main per .claude/skills/commit-mutex/SKILL.md before the first git add; release after the last push' (the /commit runner is a dispatcher-context session, so INV-GATEWAY-1 permits it); (3) add a stranded-file age guard to Step 1: files modified <2h ago belonging to another agent's zone (commit-boundary zone table) are SKIPPED and listed, not committed — prevents dirty-board capture of in-flight work; (4) replace the hardcoded 'Co-Authored-By: Claude Sonnet 4.6' (:55) with the trailer set from the consolidated convention.

*Files*: .claude/skills/commit/SKILL.md

*Risk*: The 2h in-flight heuristic can defer legitimately-abandoned files one /commit run — acceptable; P8's sweep picks them up. Known harness bug (Edit-tool hook strips multiline edits) — apply via Write of the full revised file, not multi-hunk Edits.

*Verifier*: Evidence checks out verbatim (.claude/skills/commit/SKILL.md:3,9 'merge and clean branch', :55 'Co-Authored-By: Claude Sonnet 4.6', :91-96 Step 4 merge/branch-delete) and the underlying issues are real: Step 4 contradicts the no-branches invariant, the skill takes the git index with no commit-mutex, and the model name is hardcoded (also stale). No equivalent fix exists in the backlog or git history (2afa7f125 only propagated the push guard). However, two parts of the proposal fail as written. (1) The mutex scoping is wrong: 'claim before the first git add; release after the last push' holds commit-mutex:main across a multi-category, multi-commit run that routinely exceeds the mutex's TTL=90s — commit-mutex/SKILL.md has an explicit No-Heartbeat Rule sized to a 5-20s critical section ('Scope of the mutex: ONLY the seconds-long critical section'), so the lock would silently expire mid-run and another agent could legitimately claim it, defeating mutual exclusion exactly when /commit is mid-stage. The compliant variant is acquire/release per category commit. (2) The FILES list is incomplete: .claude/commands/commit.md is a live duplicate /commit surface that says 'merge branch finish to main ... clean this branch' — fixing only the SKILL.md leaves the deleted branch-merge behavior reachable via the command file, violating the ONE-base-skill/no-copy-paste invariant. Items (3) and (4) are sound with minor tightening: the commit-boundary zone table exists (RULE 2, covers agents-architect/agent-father/pm/ops only — the guard must be scoped to those declared zones), and the consolidated convention's trailer set exists (commit-convention-format.md § Trailers: Sprint/Task/AC, plus commit-convention-exemptions.md No-Sprint/C3-exempt rules for hygiene commits).

*Rescope*: Rescope /commit skill: per-commit mutex-bound, main-only, convention-aligned. FILES: .claude/skills/commit/SKILL.md AND .claude/commands/commit.md. Changes: (1) In SKILL.md delete Step 4 'Merge and clean branch' (:91-96) and remove the 'merge and clean branch' phrase from frontmatter description (:3) and :9 — contradicts the no-branches invariant. (2) In SKILL.md Step 2, wrap EACH per-category add→commit→push in its own commit-mutex critical section per .claude/skills/commit-mutex/SKILL.md (task_claim commit-mutex:main with that category's explicit paths as own_paths → 3a-3e → task_release), NOT one claim spanning the whole run — TTL=90s + the No-Heartbeat Rule are sized for a seconds-long critical section only; inter-category work (Step 0 doc updates, categorization) stays lock-free. Note in the skill that this makes /commit dispatcher-context-only per INV-GATEWAY-1 (gateway binding required); if task_claim is unreachable, C-2 fail-closed applies (skip commit, bug-telegram). Step 3's duplicated push-guard block collapses into the per-category mutex Step 3d-PUSH (SSOT). (3) In SKILL.md Step 1, add a stranded-file age guard: any dirty file that (a) falls inside a declared zone of another agent per the commit-boundary RULE 2 zone table (.claude/skills/commit-boundary/SKILL.md — agents-architect/agent-father/pm/ops zones) AND (b) has mtime < 2h is SKIPPED and listed in the /commit output for the router to triage, never staged — prevents dirty-board capture of in-flight peer work (same failure class as FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC). (4) In SKILL.md replace the hardcoded 'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>' (:55) with a pointer to docs/policies/commit-convention-format.md § Trailers (Sprint/Task/AC) and docs/policies/commit-convention-exemptions.md (No-Sprint Rule / C3-exempt categories for hygiene commits; notebook commits stay trailer-free per the existing Step 1 table) — no model name in any commit template. (5) Reduce .claude/commands/commit.md to a one-line pointer invoking .claude/skills/commit/SKILL.md (removing its own 'merge branch finish to main ... clean this branch' text) so the /commit behavior has exactly ONE definition — otherwise the deleted branch-merge behavior survives via the duplicate command surface.

#### git-ci-publish-P6 · impact=medium effort=M · **UNVERIFIED** — Add a blocking commit-msg hook validating the (consolidated) convention mechanically

*Addresses*: git-ci-publish-I4, git-ci-publish-I2, git-ci-publish-I3

**Change**: Add scripts/git-hooks/commit-msg (wired via existing scripts/git-hooks/install.sh, same symlink pattern as pre-push): pure-bash regex validation of (1) type ∈ vocabulary from the P1-consolidated doc, (2) non-empty scope, (3) trailer presence for feat/fix unless subject matches the exemption patterns (chore(memory/...), merge, no-sprint). Ship in WARN mode for 3 days (print violation, exit 0), then flip a BLOCK=1 flag. Keep c2-alert.sh as the post-hoc file-set/type consistency check it already is.

*Files*: scripts/git-hooks/commit-msg, scripts/git-hooks/install.sh, docs/policies/commit-convention.md

*Risk*: MUST land after P1 — enforcing the current dead spec would block ~100% of commits. A too-strict hook that blocks agents mid-mutex wastes lock windows; the WARN-first rollout plus the C-2-style fail-open (hook script error → warn + exit 0) bounds this. commit-convention.md:7 already anticipates this ('pre-commit hooks (future)').

#### git-ci-publish-P12 · impact=medium effort=M · **UNVERIFIED** — Unify publish-gate invocation boilerplate into one gate-runner (defer until CCATO-T3 wiring stabilizes)

*Addresses*: git-ci-publish-I9

**Change**: The three publish gates share an identical invocation shell shape (tmpfile → bash script → exit-code contract → RAW output paste → hard-block): fb-jargon-gate/SKILL.md:16-27, claim-truth-gate/SKILL.md:38-52, plus scripts/fb-data-integrity-gate.sh (dev-standards.md:68-72). Create scripts/publish-gate-runner.sh taking a post-file + agent-id + gate-list (per-agent list read from docs/data/system-map.json, not hardcoded) that chains the gate scripts, aggregates [FAIL] lines, and returns first-failure exit semantics; collapse each flow's 3 gate steps (e.g. fb-market-poster STEP 4a/4b/claim-truth) into one runner step. Keep the three SKILL.md files as thin per-gate contracts (exit codes, self-correct protocols stay gate-specific — claim-truth's self-correct loop and real-time override remain in its own skill).

*Files*: scripts/publish-gate-runner.sh, docs/agents/fb-market-poster/flow/main.md, .claude/skills/fb-jargon-gate/SKILL.md, .claude/skills/claim-truth-gate/SKILL.md

*Risk*: CCATO-T3-FLOW-WIRING-6PT merged 2026-07-11 (QA round-2) — rewiring 6 flows now churns freshly-verified work; schedule after 1-2 weeks of stable gate operation. claim-truth-gate's per-gate FAIL handling (self-correct in-cycle, time-sensitivity override for market-watcher/alert-commander) must NOT be flattened into the runner — runner only sequences and aggregates.

#### git-ci-publish-P5 · impact=medium effort=S · **UNVERIFIED** — Extract the bounded rebase-retry push guard into scripts/git-push-guarded.sh; 3 skills call it instead of pasting shell

*Addresses*: git-ci-publish-I9, git-ci-publish-I12

**Change**: Create scripts/git-push-guarded.sh (args: <agent-id> <notify-mode: telegram|log> [paths-summary]) implementing exactly commit-mutex/SKILL.md:125-149 semantics (1 push + 1 rebase-retry, abort on conflict, never auto-resolve; exit codes 0=pushed/10=conflict-local-only/11=retry-failed-local-only). Replace the pasted blocks at commit-mutex/SKILL.md:125-149 (keep 3-line semantics summary + script pointer), commit/SKILL.md:66-89, and commit-boundary/SKILL.md:63-84 with `bash scripts/git-push-guarded.sh <agent> <mode>` one-liners. Add the CANONICAL pointer in docs/policies/dev-standards.md § Script Persistence per the standing rule.

*Files*: scripts/git-push-guarded.sh, .claude/skills/commit-mutex/SKILL.md, .claude/skills/commit/SKILL.md, .claude/skills/commit-boundary/SKILL.md, docs/policies/dev-standards.md

*Risk*: commit-boundary agents are gateway-blind — the script's telegram mode must degrade to log mode when the caller passes notify-mode=log; the drift the copies encoded becomes an explicit parameter instead. Also drops ~60 duplicated lines across 3 skills (helps commit-mutex reach ≤200L alongside P9's trim).

#### git-ci-publish-P10 · impact=medium effort=S · **UNVERIFIED** — Bound the commit-boundary R-HANDOFF wait

*Addresses*: git-ci-publish-I11

**Change**: In .claude/skills/commit-boundary/SKILL.md:113, replace 'WAIT for router ack' with 'poll signal_queue for the ack max 3× at 60s intervals; on timeout, log "[<agent>] R-HANDOFF timeout — falling back to solo commit" to notebook and proceed with RULE 1-3 solo-path commit'. The 3-rule discipline plus explicit paths already bounds the collision blast radius, so a timed-out handoff degrading to a careful direct commit is strictly safer than an indefinite hang leaving work uncommitted.

*Files*: .claude/skills/commit-boundary/SKILL.md

*Risk*: A genuine contention window could see two committers — but git's own index.lock serializes the physical index, and RULE 3 raw self-verify catches any cross-capture; today's alternative is an unbounded hang.

#### git-ci-publish-P9 · impact=low effort=S · **UNVERIFIED** — Trim commit-mutex to ≤200L by deleting the internal Quick Reference duplication

*Addresses*: git-ci-publish-I12

**Change**: Delete .claude/skills/commit-mutex/SKILL.md lines 214-235 ('## Quick Reference') — flow authors already get the Wiring Pattern at :176-189; alternatively keep the compact block and cut the equivalent prose. Combined with P5's push-guard extraction (~25L), the file lands ~180L; update the line-1 size-justification comment accordingly (or remove it once under cap).

*Files*: .claude/skills/commit-mutex/SKILL.md

*Risk*: None functional — pure deduplication within one file; verify no flow file links to the '#quick-reference' anchor first (grep before delete).

#### git-ci-publish-P11 · impact=low effort=S · **UNVERIFIED** — Update qa-checklist.md artifact naming to slug task IDs

*Addresses*: git-ci-publish-I14

**Change**: docs/policies/qa-checklist.md:5 `src/__tests__/NNN-task-name.test.ts` → `src/__tests__/<task-slug-lowercase>.test.ts`; :65 `reports/TASK_REPORT_NNN.md` → `reports/TASK_REPORT_<TASK-SLUG>.md`; align with whatever ID grammar P1 canonizes.

*Files*: docs/policies/qa-checklist.md

*Risk*: None — doc-only; verify against 2-3 recent actual test-file names before fixing the pattern so the doc follows practice, not a third invented format.


## Appendix — REJECTED proposals (kept for the record)

#### router-dispatch-locking-P2 · impact=high effort=M · **REJECTED** — Move specialist lock heartbeat/release duty to the dispatcher session; raise sprint-task TTL above real runtimes

*Addresses*: router-dispatch-locking-I2

**Change**: docs/agents/developer/flow/main.md: delete the call_tool task_release in step 4 (:69) and the per-TDD-loop task_heartbeat (:91-95); STOP path keeps only the orch-apply .head idle-reset + BUG telegram (dispatcher finally releases the lock it holds). docs/agents/dev-team/flow/main.md §Step 3: add 'while spawned specialist alive: task_heartbeat(task:<id>) every TTL/3' loop (dispatcher owns the gateway — INV-GATEWAY-1 compliant). .claude/skills/task-lock/SKILL.md:33 quick-ref TTL: sprint-task 3600 → 10800 (observed healthy runtimes ~90min; memory 07-03 false-orphan incident).

*Files*: docs/agents/developer/flow/main.md, docs/agents/dev-team/flow/main.md, .claude/skills/task-lock/SKILL.md

*Risk*: Dispatcher must actually run the heartbeat loop while a background spawn is in flight (use Monitor/cron tick, not a blocking wait). TTL raise widens the dead-session window to 3h — acceptable because the reaper+adoption path handles genuinely dead sessions.

*Verifier*: Evidence is real (developer/flow/main.md:69 task_release + :91-95 heartbeat vs :58-59 INV-GATEWAY-1 contradiction all verified; task-lock SKILL.md:168-170 confirms specialists lack the gateway tool; 07-03 false-orphan incident confirmed in memory feedback_orphan_signal_immune_and_adoption_no_board_guard), BUT the fix is ALREADY QUEUED: backlog item FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (P0/HIGH, status BACKLOG, supervised=true, detail at docs/data/orch/archive/backlog-detail.json#FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD) — its fix_spec (b) is verbatim-equivalent: "Stop false-orphaning live agents: heartbeat the sprint-task lock during long agent runs, OR raise the sprint-task lock TTL above typical ~90min agent runtime (currently 3600s)", with AC2 covering exactly this outcome. The ticket is supervised=true after three escalating recurrences (07-04: fabricated user-approval dispatch + unauthorized Stage-1 code execution, quarantined to stash) and is explicitly held for router/PO/user-adjudicated dispatch — minting this as a parallel independent change would bypass that supervision gate and duplicate a queued P0. Secondary defect that would have forced RESCOPE regardless: the proposal targets the wrong files — the operative sprint-task claim site with hardcoded ttl_seconds:3600 and the finally-release dispatcher-wrap are in docs/agents/dev-team/flow/execute-tier.md:42-64, NOT dev-team/flow/main.md §Step 3 (which only heartbeats SF-1/presence then delegates to the sub-flow); changing only main.md + the SKILL.md:33 quick-ref comment leaves runtime TTL at 3600 and puts the heartbeat loop outside the spawn wrap. Correct routing: append the proposal's genuinely new details (delete the dead INV-GATEWAY-1-violating lock calls from developer/flow/main.md, place the dispatcher heartbeat loop inside execute-tier.md's try block, raise TTL at execute-tier.md:46 + SKILL.md:33 + tools/package/developer.md, and mirror the cleanup in the qa flow per main.md:139) into FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD's fix_spec as implementation notes, then let that supervised ticket dispatch normally.

#### dev-team-loop-P4 · impact=high effort=M · **REJECTED** — Add a BOUNDED-1-style review-lane QA pickup to the head-idle fall-through

*Addresses*: dev-team-loop-I4

**Change**: In main.md Step 0b head-idle fall-through, after wrapper-autoclose and before BOUNDED-1: cheap jq probe of .task_board.review[] for rows with next_agent=='qa' AND status=='REVIEW' (excludes BLOCKED/hold_reason/behavioral-gate markers); if any and head idle, pick the oldest, dispatcher-wrap (task_claim task:<id> with owner_client_session) and spawn qa run_in_background=true, cap 1/tick. Reuse the existing S2 dispatcher-wrap block verbatim — no new lock semantics. Rows with next_agent=ops/others stay for PO triage (they carry deploy gates).

*Files*: docs/agents/dev-team/flow/main.md

*Risk*: Double-QA if a Close Gate chain is mid-flight on the same task — prevented by the task:<id> claim (the chain holds it) and the head-idle precondition.

*Verifier*: Already queued with an equivalent (and stronger) fix. Board row FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN (docs/data/orch/orch-state.json ~L5589; backlog, P1, created 2026-07-12 by PO) tracks this exact gap and its status_note SUGGESTED REMEDY is near-verbatim this proposal: age-ordered QA-drain step after Step 0b pipeline-resume / before Step 1 PO triage, scan review[] for status==REVIEW && next_agent=='qa', pick oldest, dispatcher-wrap task_claim task:<id>, spawn qa, WIP<=1 lane cap, idempotent + orch-apply.sh-gated. Cross-referenced at docs/agents/dev-team/flow/execute-tier.md:112 and memory feedback_review_status_stuck_in_inprogress_lane_blocks_wip.md:64. The queued row is deliberately plan_only:true, owner:architect, supervised:true (po-groom-20260713T0937Z) — PO routed it to architect because the fix has a second facet this proposal misses: the stranded REVIEW rows committed directly to main (branch:null, no docs/handoffs/TASK_NNN.md), while qa/flow/main.md assumes a task branch + handoff file, so 'reuse the S2 dispatcher-wrap verbatim and spawn qa' would launch qa against nonexistent pipeline preconditions; the drain also requires a qa verify-committed-fix-against-baseline_pass mode, whose contract architect owns. Approving this proposal would mint a duplicate task that bypasses PO's supervised plan-first routing of the identical item. (Cited evidence itself checks out — promote-bounded1.jq:7,17 quotes are accurate and no flow step reads .task_board.review[]; live counts drifted to review=28 / qa-REVIEW=8, immaterial.) Pointer: let the queued FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN drain via deliberate supervised dispatch to architect — do not re-mint.

#### dev-team-loop-P1 · impact=high effort=S · **REJECTED** — Extract PO one-off triage-script catalog to a lazy-load sibling file

*Addresses*: dev-team-loop-I5

**Change**: Move po/flow/main.md § 'Reusable triage scripts' (lines 225-268, 53.5KB) to a new docs/agents/po/flow/triage-scripts-catalog.md organized as a ≤1-line-per-script index (id | pattern-class | usage one-liner), with the long provenance paragraphs compressed or dropped (full history is in git). Replace the section in main.md with 3 lines: the standing write rule ('ALL writes: jq ... | bash scripts/orch-apply.sh') + pointer 'When minting/reusing a triage script → read triage-scripts-catalog.md § matching pattern-class'. Also add a rule to the catalog header: new po-sNNN entries get ONE line, not a paragraph.

*Files*: docs/agents/po/flow/main.md, docs/agents/po/flow/triage-scripts-catalog.md

*Risk*: PO occasionally reuses a pattern without loading the catalog; mitigated because the catalog is pointer-referenced at the exact decision point and the scripts themselves are self-documenting headers.

*Verifier*: Fix already implemented (check 2). Commit 959242139 (TE-T09, 2026-07-13, part of the TOKEN-ECONOMY-AUDIT TE-T01..T33 drain recorded in memory) performed exactly this extraction: docs/agents/po/flow/main.md is now 158 lines / 9,443 bytes (was 274L / 69,513B), and the 53.5KB 'Reusable triage scripts' section was relocated verbatim to docs/agents/po/flow/scripts-registry.md (53,818B). main.md:151-152 already contains the proposal's requested replacement — the standing orch-apply.sh write rule inline plus the lazy-load pointer 'load ONLY when minting a NEW triage script — check for an existing reusable pattern first'. The proposal's cited pre-edit evidence was accurate (the new size-justification header itself documents the prior 229L-claimed/274L-actual drift), but the per-spawn 53.5KB cost it targets is already eliminated. The only unimplemented sub-detail (compressing catalog entries to one line each and dropping provenance) is cosmetic on a now-cold lazy-loaded file and does not constitute a distinct fix worth a new dev-team row.

#### dev-team-loop-P6 · impact=high effort=S · **REJECTED** — Codify 'status-flip = lane-move, same jq transform' where workers actually see it (ships FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE)

*Addresses*: dev-team-loop-I8, dev-team-loop-I12

**Change**: (1) main.md § Invariants: add one line — 'Board lanes are ARRAYS: any .status change to a REVIEW/terminal token MUST move the row between lane arrays in the SAME jq|orch-apply transform (Stage 1b hard-rejects incoherent writes; on validator exit 2, fix lane membership and retry — never abandon the write).' (2) execute-tier.md:57 DJ-GATE-1 spawn-prompt marker: append '...and on completion move the board row's lane-array membership together with its .status (status-flip = lane-move), same transform.' (3) Same line in pm/main.md Step 5 Monitor ('Task → Review → update .task_board status' and 'QA Done → ... status DONE') and po/sprint-signoff.md Approve path.

*Files*: docs/agents/dev-team/flow/main.md, docs/agents/dev-team/flow/execute-tier.md, docs/agents/pm/flow/main.md, docs/agents/po/flow/sprint-signoff.md

*Risk*: None — Stage 1b already enforces the invariant at the write gate; this closes the doc gap that turns rejects into stuck flows.

*Verifier*: Already implemented and verified. The proposal's core evidence is falsified: grep for "lane-move|status-flip" in docs/agents/dev-team/flow/ returns multiple hits, not zero — commit 226bb755c (2026-07-13T10:37+0200, "fix(agents/dev-team): add MUST status-flip=lane-move rule to flow docs") shipped a canonical clause at docs/agents/dev-team/flow/execute-tier.md:102-112 (§ MUST — Status-Flip = Lane-Move, CANONICAL:SSOT-STATUSFLIP-LANEMOVE) covering lane-array move + .head sync in the SAME orch-apply.sh write and binding ALL agents under dev-team dispatch (pm, qa, developer, fixer, others), plus a pointer at main.md:647 and Merge-Gate step 6 at execute-tier.md:97. The board row FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE is DONE_VERIFIED in the done_verified lane — the "still [BACKLOG]" claim is stale. Additionally, part (3) of the proposal (copy the "same line" into pm/main.md and po/sprint-signoff.md) violates the standing SSOT/anti-copy-paste invariant AND the shipped clause's explicit "do NOT duplicate" directive — compliant form would be a pointer, but that adds nothing since the canonical clause already binds pm/po under dev-team dispatch and orch-validate.mjs Stage 1b hard-rejects incoherent writes regardless of which doc the writer read. The residual sprint-signoff.md:18 lowercase "done" sub-claim is real but is a SEPARATE one-word doc fix, and is already structurally neutralized: orch-validate.mjs Stage 1d (checkSprintGoalStatusCanonical, hard fail exit 2) rejects lowercase-"done" writes at source, so the eviction predicate at post-cycle.md:54-56 cannot be bypassed silently. If desired, file that one-liner (sprint-signoff.md:18 "done"→"DONE") as its own micro-task — it does not justify this 4-file proposal.

#### auditor-signal-loop-P4 · impact=high effort=M · **REJECTED** — Land the D4 code fix in tasksMdJanitorJob.ts (expired:false + R-1b exclusion whitelist + R-4b debounce) — the single largest live FP generator

*Addresses*: auditor-signal-loop-I2

**Change**: In apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts: (1) change listHeldTasks({kind:"sprint-task"}) to include expired:false; (2) implement the R-1b filter exactly as specced in docs/agents/system-auditor/handlers.md (glob set cron:*, *-singleton, po-triage-*, esc-datacov:*, esc-deepdive:*, session-presence*, commit-mutex*, intent:* + live-concurrent-session guard via task_list_held(kind="session-presence", expired:false)); (3) implement the R-4b 2-consecutive-pass debounce riding on the notebook 'D4 candidates:' line. Verify first whether the follow-up board row handlers.md references already exists in .task_board — if yes, this proposal is 'raise its priority', not a new mint. Zone owner dev-mcp-server per handlers.md IMPLEMENTATION NOTE.

*Files*: apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts, docs/agents/system-auditor/handlers.md (remove doc/code-gap note once landed)

*Risk*: Over-broad exclusion globs could mask a real orphaned lock — the whitelist is already PO-approved spec, so implement it verbatim, no widening.

*Verifier*: Fix already fully landed and live-effective. All three CHANGE items exist in apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts: (1) expired:false at line 834 (listHeldTasks({kind:"sprint-task", expired:false})); (2) R-1b exclusion whitelist — KNOWN_LEGIT_PREFIXES lines 197-205 covering all specced globs, -singleton suffix line 208, applyR1bFilter lines 238-260, plus live-concurrent-session guard wired to listHeldTasks({kind:"session-presence", expired:false}) at lines 839-842; (3) R-4b 2-consecutive-pass debounce riding on the notebook 'D4 candidates:' line — parsePriorD4Candidates/applyR4bDebounce lines 262-370, wired at 721-729. Landed in commit e109f49f8 ("port D4 exclusion whitelist + 2-cycle debounce into tasksMdJanitorJob (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE)") at 2026-07-08 22:27:30 +0200 — 30 minutes AFTER the handlers.md:19 doc-gap note was committed (21:56:56 +0200); the note is stale, never removed post-landing. The proposal's factual premise "compiled cron keeps emitting 6+ false-positive batches daily" is empirically false: the last sau-d4-* FP batch in the signal queue (hot rows + cold archive docs/data/orch/archive/2026-07.json) is 2026-07-08T03:00Z, the tick before the fix; zero sau-d4 rows across all daily ticks 07-09 through 07-13. Only residual valid work is doc hygiene: delete the stale "NOT yet been updated" paragraph at handlers.md:19 and the "SPEC ONLY" phrase in the line-5 size-justification so audits stop re-minting this exact already-done task (this proposal is itself that failure mode). That cleanup is a doc-only edit owned by agent-father per the file's own IMPLEMENTATION NOTE (agent-father may correct the spec but cannot write apps/**/*.ts) — it is not the code task this proposal minted.

#### memory-docs-hygiene-P5 · impact=high effort=M · **REJECTED** — Consolidate the notebook double-write: merge session-log-cowork into notebook-write, single write + single commit per cycle

*Addresses*: memory-docs-hygiene-I7

**Change**: (a) In .claude/skills/notebook-write/SKILL.md AC-1, define the standard section body as the cycle-summary template currently in session-log-cowork (cycle_date / findings / actions / next_cycle_hint / estimated_tokens) so one composed section carries both roles. (b) Rewrite .claude/skills/cowork-end-cycle/SKILL.md to 4 steps: decision-journal flush → notebook write (now includes cycle summary) → doc-self-heal → self-critique; the decision-journal commit rule already batches journal+notebook into ONE commit (decision-journal SKILL.md § Commit Rule) — make that the only memory commit of the cycle. (c) Replace session-log-cowork/SKILL.md body with a DEPRECATED pointer to notebook-write (same pattern as append-session-record), then remove it after one sweep confirms no direct flow references remain — fix the one prose reference at docs/agents/developer/flow/main.md:152 ("chains session-log + notebook-write + doc-self-heal").

*Files*: .claude/skills/notebook-write/SKILL.md, .claude/skills/cowork-end-cycle/SKILL.md, .claude/skills/session-log-cowork/SKILL.md, docs/agents/developer/flow/main.md, docs/guides/guide-skills-registration.md

*Risk*: 12+ flows load cowork-end-cycle — but they reference the skill, not its internals, so the edit is single-point (that is the point of the base-skill invariant). Watch the Edit-tool multiline-strip harness bug when editing SKILL.md files; verify final file content after edit.

*Verifier*: Equivalent fix already queued. The defect is real (all cited evidence verified: cowork-end-cycle/SKILL.md:13-14 chains session-log-cowork [append+commit, lines 10, 26-28] then notebook-write [second section + § Commit F4], two writes + two commits to the same notebook per cycle; developer/flow/main.md:152 prose ref confirmed). But board row TE-T05 (docs/data/orch/orch-state.json .task_board.backlog[313], status BACKLOG, owner=developer, sprint TOKEN-ECONOMY-AUDIT, wave 3, P2, QA-GATED) already prescribes the identical consolidation and more: "fold session-log-cowork INTO notebook-write (one write/commit)... delete session-log-cowork (0 direct refs) + DEPRECATED append-session-record", detail_ref docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-05 (lines 121-127). Per auto-memory the TE-T01..T33 sprint is actively draining via dev-team. This proposal (= ultracode audit memory-docs-hygiene-P5) and TE-T05 edit the same three skill files with conflicting shapes (4-step rewrite vs composite end-0-cowork), so dispatching it separately would fork the fix. Note: the ultracode brief's own verifier (line 1289) said "not already queued" — that was pre-TE-board-staging on the same day; TE-T05 now exists and supersedes. Pointer: drain TE-T05; if its composite scope stalls, the minimal merge in this proposal is a valid fallback subset of T-05, not a new item.

#### memory-docs-hygiene-P6 · impact=high effort=M · **REJECTED** — Close the Bash-write hole in notebook cap enforcement + one-off prune of ops.md

*Addresses*: memory-docs-hygiene-I2

**Change**: (a) Add a sweep mode to scripts/agents-flow/notebook-auto-prune.sh (`--sweep`: iterate docs/agent-memory/notebooks/*.md, apply the existing over-200L drop-oldest logic; skip archive/). (b) Register it in .claude/settings.local.json under the existing PostToolUse Bash matcher alongside orch-state-hook-bash-backstop.sh, guarded to run only when the hook JSON .tool_input.command contains "agent-memory/notebooks" (cheap grep, preserves the hot path). (c) Immediate remediation: run the sweep once now — ops.md 701L→<=200L, with the pruned incident sections landing in docs/agent-memory/notebooks/archive/ops-2026-07-11.md (archive class is cap-exempt per file-size-caps.json), preserving the active Docker-incident history rather than deleting it.

*Files*: scripts/agents-flow/notebook-auto-prune.sh, scripts/agents-flow/test-notebook-auto-prune.sh, .claude/settings.local.json, docs/agent-memory/notebooks/ops.md, docs/agent-memory/notebooks/archive/ops-2026-07-11.md (new)

*Risk*: ops.md currently documents the ACTIVE Docker VM wedge incident — archive, never delete, and keep the newest sections in place (drop-oldest semantics already do this). Hook stays exit-0 non-blocking.

*Verifier*: Duplicate of already-queued backlog row TE-T17 in docs/data/orch/orch-state.json (~line 5695, status BACKLOG, owner developer): "T-17 ops notebook 701L (3.5x cap): fix prune bypass (non-Write/Edit writes skip auto-prune hook) + janitor sweep" — same 701L evidence, same Bash-heredoc-bypasses-Write|Edit-hook diagnosis, equivalent fix (one-off ops.md prune now + notebook line-cap sweep via code-janitor 6h cron catching Bash writes + pre-commit wc gate + delete .test-notebook-prune-debug/). TE-T17 is part of the TE-T01..T33 token-economy drain already executing via dev-team (MEMORY.md, filed 07-12). The proposal's mechanism is also inferior to the queued one: it registers the sweep in gitignored .claude/settings.local.json, which headless/cron/cloud spawns do not carry (existing backlog finding in archive/backlog-detail.json explicitly flags this and directs hook wiring to repo-tracked settings or the janitor) — yet headless ops sessions doing Bash-heredoc incident logging are exactly the writers that bypass the cap, so the hook-based variant partially misses its own target. Additionally it would reuse the drop-oldest logic while FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH is still in REVIEW, and its archive destination (notebooks/archive/ops-2026-07-11.md) forks from TE-T17's queued decision (docs/incidents/). Evidence itself is real (ops.md now 744L, cap 200 confirmed, hook matcher gap confirmed) — the problem is genuine but already owned. Pointer: drain TE-T17 through dev-team rather than opening a parallel lane.

#### state-data-files-P5 · impact=medium effort=S · **REJECTED** — Untrack signals.db from git

*Addresses*: state-data-files-I5

**Change**: Add `docs/signals/signals.db` to .gitignore (in the existing 'ephemeral runtime/generated files' block at lines 48-61) and run `git rm --cached docs/signals/signals.db` in the same commit. Recovery story stays intact: the DB is a rebuildable dedup index (drain-signals.js:106 declares file-move the SSOT) and scripts/migrations/backfill-signals-db.ts regenerates it.

*Files*: .gitignore, docs/signals/signals.db (untrack)

*Risk*: Loses git-based DB recovery — acceptable because the SSOT (processed/*.json files) remains tracked and the backfill script exists; verify backfill-signals-db.ts runs green before committing (trust-verification-is-system-job).

*Verifier*: Duplicate of an already-CONFIRMED superset proposal in the same audit brief: git-ci-publish-P2 (docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md:1787-1797, verifier-CONFIRMED, user-routed to backlog per memory project_ultracode_workflow_audit_20260712.md) whose part (a) is this exact untrack PLUS the mandatory drain-signals.md edit this proposal omits. Standalone, P5 is also defective on two counts: (1) it misses that docs/agents/dev-team/flow/drain-signals.md:9 (MANDATORY PERSIST GUARD) requires committing docs/signals/signals.db after every drain — the drain lane fires every dev-team tick (live drain commit 4dd12fc24 today) — so ignoring the path without editing that flow doc makes the next tick's `git add docs/signals/signals.db` fail (git refuses ignored paths, exit 1), breaking every drain commit; (2) the proposed .gitignore edit is redundant — .gitignore:7 already contains `*.db` (with *.db-shm/*.db-wal at lines 8-9); the file is tracked only because tracking predates the rule, so `git rm --cached` alone suffices. The underlying problem is real (218 binary snapshot commits, git-reset clobber hazard mirroring FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS), but the correct vehicle is the already-confirmed git-ci-publish-P2 — no board row exists for it yet (SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE's RC-GITSTATE covers only tool-usage-stats.json/coverage-state.json), so promote P2, not P5.

## Completeness critic — lanes not audited

- **Hooks enforcement layer (.claude/settings.local.json + scripts/agents-flow/*hook*)** — Every guard the audited lanes assume enforced (orch-state prewrite Zod gate, context-bloat backstop, notebook auto-prune, branch hygiene) runs as a hook whose invocation ends in '2>/dev/null || true' (6/6 occurrences) — a crashed validator is indistinguishable from a pass, so the orch-state write-gate is vigilance-shaped, not structural; combined with 'Bash(*)' allow-all permission there is zero secondary backstop, and an untracked .test-notebook-prune-debug/ dir in repo root shows hook test artifacts already leaking.
- **Agent .md definition dual-copy layer (docs/agents/*/ vs .claude/agents/*.md)** — Directory diff shows 4 docs-side agents with no spawnable .claude/agents counterpart (cowork-team, dev-news-fetch, dev-team, tools); dev-news-fetch has a full flow dir and a system-map zone entry yet cannot be spawned (system-map note admits 'generic developer routed here by zone'), and the 9-line spawn stubs (e.g. developer.md) delegate to docs/agents/<id>/init.md pointer chains that nothing audits for dangling pointers or stub/flow drift across ~42 agents.
- **Gateway MCP contract (docs/standards/gateway-call-contract.md) vs CLAUDE.md wrapper naming** — Live SSOT drift on the single most-called primitive: CLAUDE.md line 50 mandates mcp__gateway__call_tool while the contract doc mandates mcp__claude_ai_gateway__call_tool throughout (lines 13, 30-32) — two different tool-binding prefixes for the same gateway, i.e. the doc that exists to close 6 recurring call-error classes itself contains error class #7; §6 degraded-mode (gateway-blind) de-escalation rules also uninspected by any lane.
- **ops/incident flows (docs/agents/ops/flow/ — 11 sub-flows)** — Three Docker-daemon incident commits landed 07-11 (95822aa90, ff7df213a, 47075dafb) exercising exactly this lane while it went unaudited; main.md carries a fresh 07-13 FIX-OPS-AUDITTRAIL-TIMESTAMP-BYPASS-GUARDRAIL pointer (ops previously falsified cron timestamps) whose enforcement is prose-only, and the 11 sub-flows (3 cloudflare-mcp variants, 3 data-validation variants) look like unconsolidated near-duplicates ripe for drift.
- **refine_bctc_md leaf-worker pipeline (docs/agents/refine_bctc_md/flow/)** — Known-hot lane skipped: the cron driving it was silently dead 8 days (07-04→07-12 per memory) with no durable-trigger backstop yet verified; flow claims task_claim with owner_agent='refine-orchestrator' while the agent id is refine_bctc_md — the exact owner_agent-mismatch pattern that previously orphaned locks on release — and the 4 sub-flows (continuation-stitch, disagreement-verify, prose-page, table-page) plus OFF-HOSE window vs cron schedule interaction are unexamined.
- **VPS crawler pipeline (ops-vps-fetch recon → dev-vps-crawls deploy → qa signal chain)** — A two-agent file-signal handoff chain (docs/signals/ops-vps-fetch-*.json → recon.md → docs/signals/dev-vps-crawls-*.json → scraper deploy → qa signal) that runs entirely outside the audited router/task-board locking machinery — zero call_tool/task_claim references in the 222L dev-vps-crawls flow — so its signals get none of the orphan-adoption or PRE-CLAIM protections; also Money Radar Phase-1 depends on this lane and traffic-liveness was never checked.
- **dev-* zone specialist dispatch (zone-detect skill + 12 dev-* agents + docs/agents/tools/package/*.md)** — dev-team-loop analysis covered the loop but not the zone→specialist routing substrate: zone-detect SKILL is only 55L of 2-step inference feeding 12 dev-* specialists, and cross-referencing system-map.json zones against dispatch SKILL and .claude/agents/ would likely surface mapping drift (dev-news-fetch zone already routes to generic developer as a documented exception) plus untested Tier-3 fallback behavior and shared tools-package pointer rot.
- **tree-map DAG integrity (docs/references/tree-map.md)** — The DAG SSOT that all lazy-load pointer discipline depends on is 451 lines while its own embedded size-justification still claims 294L — the file has grown 53% past its recorded justification, a direct signal that children were added without governance review; a pointer-integrity sweep (every flow/skill edit must register here) would likely find unregistered children and stale parent→child edges that memory-docs-hygiene (notebook-focused) did not cover.
