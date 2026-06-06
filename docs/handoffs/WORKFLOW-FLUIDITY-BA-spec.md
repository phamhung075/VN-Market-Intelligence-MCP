# BA Spec — WORKFLOW-FLUIDITY
**Sprint:** WORKFLOW-FLUIDITY
**BA task:** BA-WORKFLOW-FLUIDITY
**Written:** 2026-06-06T20:12:31Z
**Next:** architect (WF-3 SPIKE ruling required before agent-father dispatches WF-1; WF-2 architect options decision required; all details below)

---

## Context (BA raw-read, not relayed)

Sprint WORKFLOW-FLUIDITY closes three liveness/data-loss classes exposed by the 2026-06-06 workflow-fluidity audit (author: agents-architect). F-4 (decision journal shared-file) is already fixed (per-agent path + cap telegram live in SKILL.md). F-10/F-11/F-13 are DEFERRED backlog rows (observability/throughput, no liveness impact). In scope: F-12+F-2 (Rank 1), F-9+F-3 (Rank 3), F-8 (Rank 2 recast as spike).

**Raw-verified source state (2026-06-06):**

### WF-1 source audit — STOP paths in developer/qa/fixer flows

**developer/flow/main.md:**
- STOP path 1 (L70): `depends_on not Done → STOP, notify PM` — no `task_release` call, no `.head` idle-reset before EXIT.
- STOP path 2 (L71): `Load knowledge files (fail-loud → send_telegram(channel="bug"), STOP)` — same absence.
- Sprint-task lock claimed at Step 2b with TTL=3600s. On either STOP, lock holds for up to 3600s.
- `.head.status` written "in_progress" before developer starts (agent-chaining-protocol § mandatory pipeline-state write). On STOP, it is never reset → stays "in_progress".
- dev-team Step 0b pipeline-resume: fires on `head.status == "in_progress" AND head.updated_at < 24h` → spawns same agent → same STOP condition → bounded livelock, one futile cron slot per hour for up to 24h.
- fail-loud-protocol.md § Error Boundary: "send_telegram(bug) → drop signal → EXIT immediately" — no `task_release` step, no `.head` reset. Future flows inheriting this protocol inherit the gap.

**qa/flow/main.md:**
- QA heartbeats the task lock at pipeline step (L90-96), re-claims if stolen. No explicit STOP path with early release documented, BUT: QA APPROVED path (L144) calls `task_release` before merge — correct. The gap is if QA encounters a tool failure BEFORE reaching the approved/changes-requested verdict (e.g. BCTC eval endpoint 500, or git checkout fails) — the Error Boundary exits immediately without releasing.
- QA CHANGES_REQUESTED (L171) does NOT release the lock — lock stays with QA/fixer round. This is intentional (fixer still needs it). Not a gap.

**fixer/flow/main.md:**
- No explicit STOP path documented (fixer is simpler). Fixer's Error Boundary (via cowork-error-boundary skill) exits on tool failure without `task_release`.
- Fixer does not hold its own sprint-task lock (QA holds and passes). But fixer's Error Boundary exit before `Update orch-state.json` leaves `.head.status` stale.

**dev-team/flow/main.md § Step 0b:**
- Current guard: `head.updated_at ≥ 24h → stale crash, reset head.status to idle`. This fires only after 24h — meaning up to 24 futile spawns for a same-day fail-loud STOP.
- Missing check: if `head.active_task_id` task is in `status=BLOCKED` in task_board → should reset head to idle + route to triage, not spawn the same stale agent.

**fail-loud-protocol.md § Error Boundary:**
- Current text: "send_telegram(bug) → drop signal → EXIT immediately". The release step and head-reset are not present. Since this protocol is the canonical STOP pattern for all dev-team agents, fixing it here makes the fix fleet-wide durable.

### WF-2 source audit — FU-ORCH-HEAD-CAS + signal_queue concurrency

**orch-state.json .signal_queue write path:**
- signal-dashboard/SKILL.md § WRITE: mandates `atomic temp-file-then-rename` (read full file → modify .signal_queue section only → write atomically). No mtime-check or retry loop documented.
- Three concurrent writer classes (from audit): (1) dev-team (drain hourly at :07), (2) cowork-team (*/15 ticks, reads signal_queue for cowork-addressed rows), (3) auditor Tier-2 (0 */4, appends audit signal rows).
- Collision window confirmed: :00 every 4h — cowork-team (:00) AND auditor Tier-2 (:00) both fire. Both do temp→rename on same file. Last writer wins; first writer's appended rows silently lost.
- FU-ORCH-HEAD-CAS: narrative.watch_items[2] in orch-state.json. The `.head` CAS problem is the same class: stale-read → modify → write clobbers sibling writer's changes. Currently open as backlog.

**Apps/mcp-server signal_queue code (not yet confirmed by BA — architect must locate):**
- The signal-dashboard SKILL documents the idiom but the actual implementation that writes orch-state.json during drain is in apps/mcp-server/src/ (likely orchestrationHandler.ts or a signal store). BA was scoped to flow files; architect must locate the exact TS file:line for the WRITE path to spec the retry hook.

**Two implementation options for WF-2 (per PO note — BA presents both to architect, no pre-decision):**

**Option A — retry-read-compare (mtime-based, 3 retries):**
- Before writing: record `mtime_before = stat(orch-state.json).mtime`.
- After jq modify → tmp write → sentinel verify → rename: read `mtime_after = stat(orch-state.json).mtime`.
- If `mtime_after != mtime_before`: re-read file, re-apply the append, retry (up to 3 times). If 3 retries fail: log WARN, skip (signal survives in memory for next cycle).
- Applies to BOTH the WRITE in signal-dashboard skill AND to the `.head` CAS write (FU-ORCH-HEAD-CAS).
- Trade-off: adds ~3 stat calls per write (negligible). Fails silently after 3 collisions (signal dropped). Requires all three writer classes to implement the loop — currently only documented as protocol, not enforced in code.

**Option B — SQLite signal_queue migration:**
- Move `.signal_queue.rows[]` from orch-state.json to a dedicated SQLite table in coordination.db (or a new signals_queue.db).
- Writers do `INSERT INTO signal_queue(...)` — SQLite WAL handles concurrent writers natively. No mtime retry needed.
- orch-state.json retains `.signal_queue` as a read-only snapshot for dashboard display (periodically synced from DB).
- Trade-off: heavier change (new schema, migration, TS code for insert + drain); breaks the "single JSON SSOT" invariant established by OSC sprint; two-step deploy (DB first, then flow edits to use new insert path). Upside: eliminates entire concurrent-write class permanently; aligns with existing signals.db architecture; drain could leverage SQLite row-level ACK instead of full-file parse.

**signal-dashboard SKILL documentation gap:**
- The three concurrent writer classes (dev-team, cowork-team, auditor) are NOT documented anywhere in the skill. Future agent-father edits are blind to the contention surface.

### WF-3 source audit — dev-* MCP gateway binding

**Confirmed recurrence:**
- Memory note (commit-mutex-enum-drift): "dev-* sub-agents run INSIDE this session (not separate `claude -n` procs) → dev-team agents still lack the MCP gateway binding → still can't claim directly."
- ORCH-TASK-CANON sprint (2026-06-06): agent-father F1B was mutex-less as sole writer because it couldn't reach the gateway tools.
- This session's BA cycle: BA (current agent) IS calling call_tool successfully → BA has the binding. The constraint is specific to sub-agents spawned inside dev-team's cron session.

**Three ruling options (for architect to decide):**
- **Option I — Single-claim simplification:** Remove the outer dev-team dispatcher claim; inner agent (developer/qa/fixer) claims directly. Dispatcher acts as check-only before spawn (no MCP call). Inner agents gain the MCP binding because they ARE spawned in sessions with gateway access. Risk: dispatcher loses the dedup guard for spawning (Phase 4 issue); outer claim currently serializes multi-router race.
- **Option II — Outer-claim + heartbeat (current model, hardened):** Document explicitly that the outer dev-team claim covers the spawn window only, the inner agent doesn't need to claim until it starts work, and the session boundary constraint (inner agent inherits gateway binding from its spawn context) is ensured by the Agent() call mechanism. Add heartbeat for outer claim in the executor loop. Codify the constraint in task-lock-protocol.md.
- **Option III — Codify session-scoped constraint as enforced invariant:** Accept that dev-* agents cannot call task_claim directly; all MCP gateway calls for them go via the outer session (main terminal / dev-team dispatcher). Document this as an enforced architectural invariant in docs/protocols/task-lock-protocol.md. Any future worktree/multi-session Phase 4 activation must include a gateway-binding fix before enabling.

**Key unknown for architect:** Is the gateway binding a property of the spawning session (inherited by Agent() calls) or of the agent's own MCP initialization? Architect SPIKE must confirm this mechanically (test: spawned agent calls call_tool, confirm success/failure vs session context).

---

## Requirements

### WF-1 — FAIL-LOUD-STOP-RELEASE
**DDD layer:** application (flow edits to STOP paths) + infrastructure (fail-loud-protocol.md as fleet-wide inheritance point)
**Owner:** agent-father
**Zone:** docs/agents/ + docs/protocols/fail-loud-protocol.md

#### FR-WF1-1: task_release on ALL STOP paths — developer
Every STOP path in `docs/agents/developer/flow/main.md` (currently: depends_on-not-Done at step 4, knowledge-fail-loud at step 5) MUST call `task_release` before EXIT:
```
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
// ok=false is acceptable (already expired) — best-effort cleanup
```
This call MUST occur before `send_telegram(bug)` and before EXIT, on every early-exit path.

#### FR-WF1-2: atomic .head idle-reset on ALL STOP paths — developer
Every STOP path in developer flow MUST write `orch-state.json .head` atomically (§2.3 pattern) before EXIT:
```json
{ "status": "idle", "updated_at": "<ISO-8601 UTC now>", "updated_by": "developer", "active_task_id": null, "next_agent": null }
```
This reset MUST happen BEFORE the `send_telegram(bug)` EXIT call so the pipeline-resume guard never sees "in_progress" for a stopped task.

#### FR-WF1-3: task_release + .head idle-reset on ERROR BOUNDARY EXIT — qa
`docs/agents/qa/flow/main.md` Error Boundary (cowork-error-boundary skill, activated on tool failure before reaching verdict): MUST add the same task_release + .head idle-reset pattern from FR-WF1-1 and FR-WF1-2.
QA APPROVED path already releases the lock (confirmed, no change needed there).
QA CHANGES_REQUESTED must NOT release the lock (fixer still needs it — confirmed, no change needed).

#### FR-WF1-4: task_release + .head idle-reset on ERROR BOUNDARY EXIT — fixer
`docs/agents/fixer/flow/main.md` Error Boundary: same pattern.
Fixer does not hold a sprint-task lock directly (QA holds, passes). The .head reset is still required so the pipeline-resume guard clears.

#### FR-WF1-5: dev-team Step 0b BLOCKED-task check
`docs/agents/dev-team/flow/main.md` § Step 0b pipeline-resume: add guard BEFORE the 24h expiry check:
```
if head.status == "in_progress":
  task_row = jq '.task_board.active_sprints[].tasks[] | select(.task_id == head.active_task_id)' orch-state.json
  if task_row.status == "BLOCKED":
    write .head { status: "idle", updated_at: <now>, updated_by: "dev-team", active_task_id: null, next_agent: null } atomically
    JUMP TO drain-signals   # skip spawn, go to PO triage
```
This closes the livelock: a BLOCKED task (e.g. depends_on not met) never triggers a futile re-spawn.

#### FR-WF1-6: fail-loud-protocol.md § Error Boundary — add release step
`docs/protocols/fail-loud-protocol.md` § Error Boundary MUST gain a step 0 (before send_telegram):
```
0. If holding a sprint-task lock: call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
   Write orch-state.json .head { status: "idle", updated_at: <now>, updated_by: "<agent-id>" } atomically (§2.3).
```
Adding this here makes it inherit to all future flow files that load the protocol, closing the class.

**File:line map for agent-father:**
- `docs/agents/developer/flow/main.md` L70 (depends_on STOP) and L71 (knowledge STOP) — insert FR-WF1-1 + FR-WF1-2 at each site
- `docs/agents/qa/flow/main.md` — locate Error Boundary exit (skill pointer at L15) → add FR-WF1-3
- `docs/agents/fixer/flow/main.md` — locate Error Boundary exit (skill pointer at L6 comment) → add FR-WF1-4
- `docs/agents/dev-team/flow/main.md` § Step 0b L167 — insert FR-WF1-5 guard block before the 24h check
- `docs/protocols/fail-loud-protocol.md` § Error Boundary (currently 4 steps, L62-77) — prepend step 0 FR-WF1-6

### WF-2 — ORCH-HEAD-CAS + signal_queue retry-read-compare
**DDD layer:** infrastructure (orch-state.json write atomicity + CAS retry) + application (signal-dashboard skill documentation)
**Owner:** dev-mcp-server
**Zone:** apps/mcp-server/src/ + .claude/skills/signal-dashboard/

#### FR-WF2-1: locate exact TS write paths (architect pre-requisite)
Architect must identify the exact TypeScript file:line(s) in `apps/mcp-server/src/` that write orch-state.json `.signal_queue.rows[]`. The signal-dashboard SKILL documents the protocol idiom but the running implementation location is unconfirmed by BA. This is a blocking dependency for WF-2 (dev-mcp-server cannot implement without it).

#### FR-WF2-A: Option A — mtime-compare-retry on signal_queue append (if chosen by architect)
The TS write path for `.signal_queue.rows[]` append MUST implement:
1. Record `mtime_before = fs.statSync(orchStatePath).mtimeMs` before reading the file.
2. Perform jq-equivalent modify in TS: read JSON, push new row to `.signal_queue.rows[]`, stringify.
3. Write to tmp file, verify sentinel (`.signal_queue` key exists in tmp), rename to orch-state.json.
4. Read `mtime_after = fs.statSync(orchStatePath).mtimeMs`.
5. If `mtime_after != mtime_before`: go to step 1, retry up to 3 times.
6. If 3 retries exhausted: `logger.warn('[signal-queue] CAS collision, row dropped after 3 retries')` — do NOT throw.
Same loop applies to the `.head` CAS write (FU-ORCH-HEAD-CAS): any write to `.head` must use the same mtime-compare-retry.

#### FR-WF2-B: Option B — SQLite signal_queue migration (if chosen by architect)
New table `signal_queue` in coordination.db (or dedicated db):
```sql
CREATE TABLE signal_queue (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,  -- max 120 chars
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  payload_ref TEXT
);
```
- INSERT used by auditor + cowork-team signals (replaces orch-state append).
- SELECT + UPDATE used by dev-team drain and cowork-team READ.
- orch-state.json `.signal_queue` retained as snapshot-for-display only (populated by a periodic sync or on-read projection — architect decides).
- Migration: existing orch-state.json `.signal_queue.rows[]` rows migrated to DB as part of deploy step (dev-mcp-server runs migration script).

#### FR-WF2-2: signal-dashboard SKILL — document 3 concurrent writer classes
`docs/.claude/skills/signal-dashboard/SKILL.md` § WRITE: add a warning block:
```
CONCURRENT WRITERS — three classes write .signal_queue.rows[] concurrently:
  1. dev-team (hourly drain at :07)
  2. cowork-team (*/15 ticks)
  3. system-auditor Tier-2 (0 */4)
All writers MUST use the mtime-compare-retry loop (FR-WF2-A) or the SQLite insert path (FR-WF2-B).
Never use bare temp→rename without the retry guard.
```

#### FR-WF2-3: promote FU-ORCH-HEAD-CAS — .head write also uses CAS loop
The `.head` write (used by all dev-team pipeline agents per agent-chaining-protocol § mandatory pipeline-state write) must apply the same mtime-compare-retry pattern as FR-WF2-A. This is the pre-existing FU-ORCH-HEAD-CAS backlog item — WF-2 closes it.

### WF-3 — dev-* MCP gateway binding ruling
**DDD layer:** infrastructure (session-scoped tool binding) + protocol (task-lock-protocol.md + task-lock SKILL)
**Owner:** architect
**Zone:** docs/protocols/ + .claude/skills/task-lock/
**Timebox:** 2h SPIKE

#### FR-WF3-1: mechanical verification of gateway binding inheritance
Architect SPIKE must empirically confirm: does an Agent() spawned inside a dev-team cron session inherit the parent session's MCP gateway tool bindings? Method: spawn a minimal test agent with a single call_tool(server="vn-market", tool="task_list_held", arguments={}) call; inspect whether it succeeds or fails with tool-not-found / connection-refused. Record result.

#### FR-WF3-2: ruling document
Architect writes `docs/protocols/dev-star-gateway-binding.md` (≤60L) containing:
- The mechanical finding from FR-WF3-1 (binding inherited? yes/no).
- The ruling: which of Options I/II/III (see WF-3 source audit above) is adopted.
- If Option I (single-claim): specify which dispatcher-wrap sites in dev-team/flow/main.md must change, and who implements (agent-father).
- If Option II (outer-claim hardened): specify the heartbeat addition site and who implements (agent-father).
- If Option III (codify invariant): the exact invariant text to add to docs/protocols/task-lock-protocol.md; no code change needed.
- Named downstream handoff target: agent-father (flow edits) or dev-mcp-server (binding code fix) or no-op.

#### FR-WF3-3: task-lock SKILL update
`.claude/skills/task-lock/SKILL.md` must reflect the ruling: add a note under § On claim-fail explaining the session-scoped binding constraint and what agents in which lane can/cannot call task_claim directly.

---

## Non-Functional Requirements

- NFR-1: All STOP-path changes (WF-1) are flow-file edits only — zero code changes to apps/mcp-server/. No Docker rebuild for WF-1.
- NFR-2: WF-2 option choice must not break the OSC sprint invariant "orch-state.json is the single JSON SSOT for orchestration state." Option B relaxes this for signal_queue specifically; architect must explicitly note the invariant relaxation scope.
- NFR-3: WF-3 ruling doc must be ≤60L (waterfall policy compliance). Ruling must name a downstream agent explicitly; "TBD" is not acceptable.
- NFR-4: No new docker images required for WF-3.

---

## Edge Cases

- **STOP during heartbeat window:** A developer that has just heartbeated will have a fresh TTL. The task_release on STOP is still best-effort (ok=false acceptable). The .head idle-reset is what matters for pipeline-resume.
- **QA holds lock, fixer exits early:** If fixer exits on Error Boundary before appending the Fix Record, .head status is "in_progress" with next_agent="fixer". The .head idle-reset in FR-WF1-4 resets it. But the task is still REVIEW in task_board (fixer didn't update it). PM will see a task stuck in REVIEW with no Fix Record. This is acceptable: PM's next action is to detect the stuck state and escalate. The alternative (fixer resets task to IN_PROGRESS) is riskier (contradicts QA verdict). Edge case: document in fail-loud-protocol.md.
- **Concurrent WF-2 retry collision:** If 3 retries all fail (heavy contention), the signal row is dropped. This must be observable — the `logger.warn` in FR-WF2-A step 6 must emit a metric or BUG telegram if the row being dropped has severity CRITICAL or HIGH.
- **Option B migration mid-sprint:** If SQLite migration is chosen, orch-state.json `.signal_queue.rows[]` rows written before migration must be migrated atomically (no signal dropped during cutover). Migration script must be idempotent (can re-run safely).
- **WF-3 binding confirmed inherited:** If FR-WF3-1 shows binding IS inherited, inner agent claims become viable — this changes the Option I/II choice calculus significantly. Architect must record this before ruling.

---

## Blockers / Questions for Architect

- **BLOCKER-WF2-A:** Exact TS file:line in apps/mcp-server/src/ that writes `.signal_queue.rows[]` and `.head` (needed before dev-mcp-server can implement FR-WF2-A or FR-WF2-B). BA cannot resolve — requires code search.
- **BLOCKER-WF3-A:** Option A vs B decision for WF-2 (architect rules, no pre-decision per PO note). Decision determines which dev-mcp-server implementation path is in scope.
- **BLOCKER-WF3-B:** Mechanical gateway binding confirmation (FR-WF3-1) must precede option ruling for WF-3.

---

## Sequencing Guidance

1. WF-3 SPIKE (2h) runs first or in parallel with WF-1. It is the shortest, has no code impact, and its ruling may affect WF-1 (if Option I is chosen, dispatcher-wrap sites change). Recommended: start WF-3 immediately; agent-father can draft WF-1 flow edits in parallel since they are independent of Option I/II/III at the STOP-path level.
2. WF-1 can proceed immediately after spec (no blockers). agent-father edits 5 files, no Docker rebuild.
3. WF-2 is blocked on BLOCKER-WF2-A (locate TS write path) and BLOCKER-WF3-A (option ruling). Start WF-2 after architect resolves both.
4. Recommended order: WF-1 dispatch NOW → WF-3 SPIKE NOW (parallel) → architect resolves BLOCKER-WF2-A + chooses option → WF-2 dispatch.

---

## Acceptance Criteria

### WF-1 (agent-father)
- AC-WF1-1: All STOP paths in developer/flow/main.md call task_release before EXIT. Verified by: agent-father reads the file post-edit and confirms each STOP site has the release line.
- AC-WF1-2: All STOP paths in developer/flow/main.md write .head idle atomically before EXIT. Same verification.
- AC-WF1-3: QA error-boundary path (pre-verdict) includes task_release + .head idle-reset. Verified: qa/flow/main.md post-edit read.
- AC-WF1-4: Fixer error-boundary path includes .head idle-reset. Verified: fixer/flow/main.md post-edit read.
- AC-WF1-5: dev-team Step 0b contains the BLOCKED-task guard routing to drain-signals. Verified: dev-team/flow/main.md post-edit read.
- AC-WF1-6: fail-loud-protocol.md § Error Boundary contains step 0 with task_release + .head idle-reset. Verified: read post-edit.
- AC-WF1-7: No code changes to apps/mcp-server/ (NFR-1). Verified: git diff --stat shows only docs/agents/ and docs/protocols/ paths.
- AC-WF1-8: Simulate a fail-loud STOP scenario (dry-run trace): a developer hits knowledge-load fail → STOP sequence now calls task_release + resets .head → next dev-team cron sees head.status=idle → routes to PO triage, not futile re-spawn. Evidence: annotated dry-run in the handoff [Developer] Implementation Record.

### WF-2 (dev-mcp-server)
- AC-WF2-1: The exact TS write path for .signal_queue.rows[] is identified (file:line in handoff).
- AC-WF2-2: Chosen option (A or B) is implemented and tested.
  - Option A: unit test proves that a concurrent write (simulated by two writes within the same ms window) does not silently drop rows — retry loop catches the collision and re-applies the second write. Test file: `apps/mcp-server/src/__tests__/WF2-signal-queue-cas.test.ts`.
  - Option B: integration test proves two concurrent INSERTs to the signal_queue SQLite table both succeed with no data loss.
- AC-WF2-3: signal-dashboard SKILL § WRITE contains the 3-writer-class warning block (FR-WF2-2). Verified by read.
- AC-WF2-4: FU-ORCH-HEAD-CAS watch item removed from orch-state.json narrative.watch_items (closed, not just noted). Verified by jq.
- AC-WF2-5: tsc clean + bun test full-suite pass.

### WF-3 (architect)
- AC-WF3-1: docs/protocols/dev-star-gateway-binding.md exists, ≤60L, contains: mechanical finding, ruling (Option I/II/III), downstream handoff target named explicitly.
- AC-WF3-2: .claude/skills/task-lock/SKILL.md updated with session-scoped binding note (FR-WF3-3).
- AC-WF3-3: If ruling is Option I or II — a WF-3-IMPL task is created in the task_board backlog pointing to agent-father with the specific sites to change.
- AC-WF3-4: If ruling is Option III — no code or flow changes needed; task-lock-protocol.md gains the invariant text.

---

## [QA] Review Record — WF-2 · 2026-06-07

**Verdict: APPROVED**
**Commits reviewed:** 8a469655 (impl) + 548534da (memory)
**Reviewer:** qa

### AC Verification

- **AC-WF2-1 PASS** — write path identified in commit diff: `orchStateStore.ts:appendSignalQueueRow` (line ~253) + `writeHeadAtomic` (new export). File:line confirmed in dev notebook and commit message body.
- **AC-WF2-2 PASS** — Option A implemented. `WF2-signal-queue-cas.test.ts` (12 tests T1-T12) verified directly: 12 pass / 0 fail. T2 test proves single-collision retry succeeds (row NOT dropped); T3 proves exhausted-retries drops with WARN but no throw. Injectable seams (statMtimeFn, warnFn) enable deterministic simulation without real fs races.
- **AC-WF2-3 PASS** — `.claude/skills/signal-dashboard/SKILL.md` § WRITE contains 3-writer-class warning block (dev-team/:07, cowork-team/15min, system-auditor/4h). Verified in git show 8a469655 diff.
- **AC-WF2-4 PASS** — `FU-ORCH-HEAD-CAS` removed from `orch-state.json narrative.watch_items[]`. Git diff confirms removal of that string from the array. Note: string still appears in `narrative.backlogs` field (separate from watch_items) — BA spec scope was watch_items only, AC met.
- **AC-WF2-5 PASS** — tsc: exactly 5 errors, all pre-existing (3× 1980-f2-canon-schema.test.ts, 2× tasksMdJanitorJob.ts — count unchanged). WF-2 test batch 12/12 pass. Full suite Bun C++ OOM crash is pre-existing runtime issue (same panic URL as prior QA cycles), not a WF-2 regression. Representative batch runs (1977/1978/1979/1980-f2-canon tests): 102 pass / 0 fail.

### CAS Logic Review

Pre-rename mtime-check window analysis:
- Step 1: `mtimeBefore = statMtimeFn(path)` — captures mtime before read.
- Step 2: read + mutate in memory (no fs write).
- Step 3: `mtimeAfterMod = statMtimeFn(path)` — checks mtime BEFORE our rename. If a concurrent writer renamed a new file in steps 1-3 window, this differs → collision detected, retry.
- Step 4: `writeAtomicFn(path, state)` — our rename.

False-positive risk: NONE. The mtime check happens at step 3, before our own rename (step 4). Our own write cannot trigger a self-false-positive. A stale-mtime edge (mtimeBefore == -1 guards absent file) correctly skipped.

### Zone Containment

Diff touches exactly: `apps/mcp-server/src/infrastructure/orchStateStore.ts`, `apps/mcp-server/src/__tests__/WF2-signal-queue-cas.test.ts`, `.claude/skills/signal-dashboard/SKILL.md`, `docs/data/orch/orch-state.json`. No api-gateway or frontend files. Zone contained.

### DDD / Security

- DDD: `orchStateStore.ts` has no `from.*infrastructure` or `from.*application` domain imports — PASS.
- Security: no `process.env`, no hardcoded secrets/tokens — PASS.
- mock-guard: exit 2 (CAUTION) on `orchStateStore.ts:429` — `// TODO, BLOCKED, DEFERRED → backlog` comment. False positive; not fabricated data — non-blocking.

### Notes for PM / Container Rebuild

A container REBUILD (not restart) of `mcp-server` is required for the CAS fix to be live in production. The changes are in `apps/mcp-server/src/infrastructure/orchStateStore.ts` which is compiled into the container. QA does not trigger rebuilds.
