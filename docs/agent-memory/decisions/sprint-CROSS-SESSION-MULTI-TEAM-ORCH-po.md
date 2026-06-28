# Decision Journal — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · po

**Sprint goal:** Same-role cross-session claim attribution — authoritative key = per-session UUID (owner_client_session), never owner_agent. P1 attribution fix → P2 presence → P3 cron election.
**Agent:** po
**Started:** 2026-06-28T08:18:28Z

---

### STEP po-S1 · po · 2026-06-28T08:18:28Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Signed off architect brief (READY-FOR-PO-SIGNOFF); authored sprint-vision entry in orch-state with DoD gate baked in; next_agent=pm.
**what-considered:**
- APPROVE as-is — brief is grounded in live code (claim sound, attribution broken) + matches project memory ground truth.
- REFINE — harden one acceptance criterion the brief left implicit (step-5 REQUIRED flip).
**why-decision:** Brief is correct and reuse-only; the one gap is acceptance-bar strength, not design → APPROVED with a single DoD hardening, no redesign.
**why-change:** No design change; elevated brief migration-step-5 from implicit to explicit blocking acceptance criterion.

### STEP po-S2 · po · 2026-06-28T08:18:28Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Locked the DoD gate (#2): owner_agent fallback is TRANSITIONAL (rollout window only); step-5 REQUIRED-flip + remove-owner_agent-from-is-mine-path is MANDATORY.
**what-considered:**
- Leave owner_agent as a permanent backward-compat rung (brief §4 reads that way).
- Time-box owner_agent rung; require its removal at step 5.
**why-decision:** A permanent owner_agent rung silently re-opens the same-role multi-team bug (two same-role teams both fall through to role-match). The user's hard constraint forbids role as authoritative key anywhere.
**why-change:** Resolves brief §4-vs-§7-step-5 tension: rung permitted ONLY during migration steps 2-4, removed at step 5.

### STEP po-S3 · po · 2026-06-28T08:18:28Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Approved P3 standing decision in principle: code-enforced fire-time cron election supersedes manual cowork OBSERVE-ONLY / defer-to-live-leader conventions.
**what-considered:**
- Retire the manual convention now on approval.
- Gate supersession to P3 done_verified (manual convention authoritative until then).
**why-decision:** Retiring early leaves a gap window with neither manual nor code gate. Supersession must activate only when the code gate is live + RAW-verified.
**why-change:** Added explicit ACTIVATION GATE (P3 done_verified) + a memory-update owed at P3 sign-off (feedback_router_cowork_defer_to_live_leader, feedback_router_manual_drive_overlaps_devteam_loop).

### STEP po-S4 · po · 2026-06-28T08:18:28Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Confirmed phase gating; emitted PO sign-off signal to pm for atomic FR decomposition. No code triggered.
**what-considered:**
- only: confirm P1=unblocker (no dep), P2 depends P1, P3 depends P1+P2.
**why-decision:** P1 functionally satisfies both explicit user asks — check-before-claim (step 2.5 PRE-CLAIM gate) + register id/start-time (owner_client_session + payload.started_at land in every claim row, returned via current_holder + task_list_held). P2 elevates to a first-class roster; P3 is the cron-dedup layer.
**why-change:** No change from brief §Sequencing Summary.

### STEP po-S5 · po · 2026-06-28T08:22:00Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Folded a mid-review scope expansion (coordinator-relayed: dead session strands its task → need detect-dead-session + takeover-and-continue) as ADDITIVE phase P1.5; verified architect's §P1.5 has NOT yet landed in the brief (still 486L).
**what-considered:**
- HOLD final sign-off until P1.5 section lands.
- Sign P1-attribution now (unchanged + the prerequisite for takeover); record P1.5 additive, HELD decomposition pending architect §P1.5.
**why-decision:** P1 is unchanged AND is the prerequisite (owner_client_session is what lets a peer attribute an expired lock to a SPECIFIC dead session and adopt it). Blocking the unblocker on a not-yet-written section would needlessly delay it. Pre-approved P1.5 SHAPE + DoD + honest ceiling (zero live sessions = zero execution; reaper only keeps state ADOPTABLE) so the requirement is not lost.
**why-change:** Adds P1.5 to scope (after P1, may parallel P2); pm decomposes P1 now, holds P1.5 FRs until architect §P1.5 + po confirm. Coordinator note carries no user authority — folded on merit.

### STEP po-S6 · po · 2026-06-28T08:32:39Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Confirmed architect §6.5 (brief rev 2 / signal updated) against 6 acceptance lenses. VERDICT = APPROVED-WITH-HARDENING. Lenses PASS clean: #1 honest-bound (§6.5.1 + reaper-no-execute §6.5.2 truthful, not over-promised), #3 slow≠dead (graceSeconds=300 + cadence≤TTL/3 → ≥65min total silence before orphan; no lag path orphans), #5 P1-dep (explicit), #6 reaper-placement (server-side setInterval, no residual cron). Lenses #2 + #4 surfaced REAL correctness gaps (not doc-polish) → closable by LOCKED DoD additions WITHOUT redesign → hardening, not CHANGES-REQUIRED.
**what-considered:**
- CHANGES-REQUIRED (bounce to architect) — rejected: design SHAPE is right + reuse-only; gaps are missing acceptance clauses, not wrong architecture.
- APPROVED as-is — rejected: §6.5.5 sprint-task resume blindly continues over a dead worker's uncommitted live-effect tree mutations; §6.5.4 poison counter never accumulates as written (resets on re-claim) → guard inert.
**why-decision:** Same discipline as po-S1/S2 (P1 = APPROVE + DoD hardening, no redesign). The two gaps are exactly the lenses flagged as fragile; both close with FR-level DoD locks.
**why-change:** Elevates 6 implicit hardening clauses to LOCKED blocking DoD on the P1.5 FR set (po-S7..S9).

### STEP po-S7 · po · 2026-06-28T08:32:39Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** LOCKED DoD-P15-1 (sprint-task pre-resume tree hygiene) + DoD-P15-2 (read-only marker probe) on the adoption FRs (P1.5-AF-1/AF-2).
**what-considered:**
- DoD-P15-1: §6.5.5 sprint-task adopter "continues from last commit SHA" but a dead worker (parse-error/crash) leaves UNCOMMITTED tracked edits + untracked files in the SHARED working tree; a live-effect edit (hook/config/schema) is ALREADY LIVE and a SHA-checkpoint is blind to it (feedback_dead_worker_uncommitted_live_file_revert). LOCK: before resuming, the dev-team adopter MUST `git status --porcelain` the task zone and `git checkout -- <file>` every uncommitted live-effect edit to last-good; leave untracked artifacts, surface in board note; SHA = resume POINT, tree-hygiene = resume PRECONDITION. Router (P1.5-AF-1) NEVER reverts — DEFERs to the dev-team adopter (router routes, never implements). Caveat: clause is for the single-host shared-tree topology (current fleet); a separate-clone topology resumes from last PUSHED commit and the dead host's dirty tree is out of scope.
- DoD-P15-2: the published-artifact existence probe in the cowork-slot + cron-tick resume contract MUST be a read-only `task_list_held`, NEVER `task_heartbeat`/`task_claim` — heartbeat is create-if-absent and would MASK a never-fired publish, defeating dedup (feedback_guaranteed_slot_week_key_double_post recurrence #3).
**why-decision:** DoD-P15-1 is the single most likely double-corruption path (the lens called it out); a blind continue can wedge the system live. DoD-P15-2 closes the marker-masking false-green.
**why-change:** Both are NEW blocking clauses absent from §6.5; neither changes the architecture.

### STEP po-S8 · po · 2026-06-28T08:32:39Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** LOCKED DoD-P15-3 (poison-counter carry-forward + escalate-once) + DoD-P15-4 (reaper scan = ALLOW-LIST).
**what-considered:**
- DoD-P15-3: as written, the adopter re-claims the original task_id with a FRESH payload; the reaper reads redispatch_count "default 0 if absent" → counter RESETS to 1 every adoption → N_MAX=3 NEVER reached → poison-task loops forever (guard inert). LOCK: the adopter MUST propagate redispatch_count from the orphan-signal payload INTO the re-claim payload (carry-forward) so the next reaper emit increments from the carried value. Escalation idempotency: BUG telegram fires ONCE on the transition to ESCALATED (payload.status set); a later adopter seeing status==ESCALATED SKIPS silently (no re-telegram) — else every online session re-escalates every 600s for 24h = BUG-channel spam. The poison test MUST assert the count CHAINS across 3 REAL adopt→die cycles, not a hand-set rc=3.
- DoD-P15-4: §6.5.2 scan is a DENY-list (NOT IN session-presence/orphan-signal + NOT LIKE published:%) → it WILL emit un-adoptable orphan-signals for commit-mutex (60s transient serialization lock), intent:* (router pre-claim), and cron:* fire-claims — none have a resume-contract row in §6.5.5, so an adopter has UNDEFINED behavior. LOCK: emit ONLY for kinds with a defined resume contract (sprint-task, cowork-slot, cron-tick-with-published-checkpoint, dashboard-row) via an ALLOW-LIST; a future task_kind defaults to NOT-emitting.
**why-decision:** Without carry-forward the headline poison-task feature is a no-op; allow-list prevents un-actionable signal noise + adopter undefined-behavior.
**why-change:** NEW blocking clauses; carry-forward is the load-bearing fix for §6.5.4.

### STEP po-S9 · po · 2026-06-28T08:32:39Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** LOCKED DoD-P15-5 (reaper timer self-heal) + DoD-P15-6 (honest-bound doc-repeat) + SEQUENCING gate; RELEASED P1.5 decomposition to pm.
**what-considered:**
- DoD-P15-5: the server-side setInterval(600s) reaper MUST wrap gcExpiredLocks in try/catch and log+continue on a transient DB-busy — a single uncaught error must NOT kill the interval, else the all-sessions-dead gap silently re-opens. Test: inject a GC error, assert the timer still fires the next tick.
- DoD-P15-6: §6.5.1 mandates "state explicitly in every doc that references this design" — LOCK that the honest-bound line (zero live sessions = zero execution; reaper only makes work adoptable) is carried verbatim into the router step-2.5 SKILL + dev-team Step 0a flow text + any orphan-signal mechanism doc.
- SEQUENCING: P1.5-* FRs blockedBy TASK_1980 (P1-FINAL REQUIRED-flip / remove owner_agent fallback) — NOT merely TASK_1973 (column add): orphan attribution is only UNAMBIGUOUS once NO lock row carries NULL owner_client_session (grounds my po-S2 owner_agent-transitional lock). Preferred: additionally gate the two AF adoption FRs on TASK_1981 (P1 regression green) since adoption rides on the flip being PROVEN.
**why-decision:** Self-heal keeps the only always-on liveness component durable; doc-repeat keeps the honest bound honest at every reference; the blockedBy gate makes the ordering unbreakable.
**why-change:** RELEASES the HELD P1.5 decomposition (gate satisfied) with 6 locked DoD additions; NEXT=pm.

### STEP po-S10 · po · 2026-06-28T11:36:02Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Router dogfooding found the P1 gate NON-FUNCTIONAL: step-2.5 PRE-CLAIM `task_claim(task_kind="intent")` → -32602; deployed enum = 4 kinds, 'intent' absent. RAW-verified 3 in-code enum sites all carry only the 4 (CHECK coordinationStore.ts:180, TS-union :233, Zod coordinationTools.ts:86). 0 'intent:' locks ever existed → gate never once succeeded since TASK_1976/1977 shipped task_kind="intent". Same class as commit-mutex enum-drift.
**what-considered (A — taxonomy):**
- only-intent+orphan-signal: smaller, but leaves session-presence (P2) as a 3rd future enum-widen → drift window #3.
- COMPLETE 7-kind taxonomy in ONE migration: intent + orphan-signal + session-presence added now; caller logic still ships per-phase (P1.5/P2); inert CHECK value with no caller is harmless.
**why-decision:** A = COMPLETE taxonomy, ONE Migration-3. 2nd recurrence of enum-drift → fix the CLASS not the symptom (feedback_recurring_bug_escalation; CLAUDE.md "root cause definitif"). Collapses 3 migration/rebuild/drift windows into 1 + removes concurrent-tree contamination on the shared enum line.
**why-change:** Brief §3 L100-102 enum + §3.2 left router-gate task_kind unspecified; AF-side filled "intent", MCP-side never widened — under-specified-brief drift.

### STEP po-S11 · po · 2026-06-28T11:36:02Z
**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH
**what-done:** Decisions B/C/D + sequence. Taxonomy ALREADY blessed: po-S8/DoD-P15-4 names intent:* as a router-gate kind the reaper ALLOW-LIST excludes (TASK_1983) → no architect redesign; only the schema lagged.
**what-considered (B — dedicated kind):**
- doc-only (route router to an existing kind): WRONG — shipped CLAUDE.md/dispatch-claim task_kind="intent" is correct; schema must match it.
- dedicated 'intent' kind: correct. Router's "self-collide on TASK_<N>" framing imprecise (mutex keys on task_id PK; intent:* ≠ sprint-task:* → no PK collision) but a dedicated kind IS right for (i) query-surface integrity (task_list_held(kind=sprint-task) must not return router gates), (ii) reaper allow-list (intent=transient dispatch gate, not adoptable work; already excluded by DoD-P15-4).
**why-decision:** C = ONE dev-mcp-server corrective `FIX-COORD-TASKKIND-ENUM-INTENT-GATE` as Migration-3 (own detection guard — editing line-180 CHECK alone NO-OPS on live DBs, its 'commit-mutex' guard already passed) widening all 3 sites + describe strings + folding redispatch_count column → SUPERSEDES TASK_1982 entirely; re-gate TASK_1983-1988 blockedBy→corrective; P2-MCP-1 enum scope pre-satisfied. D = QA DoD adds the missing LIVE integration check (router PRE-CLAIM claimed:true vs DEPLOYED schema, named-volume db) closing TASK_1981's store-level-only gap; also added as AC to TASK_1988.
**why-change:** architect OFF critical path (design coherent); only a non-blocking brief §3/§3.2 doc-sync owed. Held P1.5 fan-out unblocks AFTER corrective rebuilt+QA-green.
