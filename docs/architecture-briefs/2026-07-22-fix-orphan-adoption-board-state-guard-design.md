# Architecture Brief — FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (fix_spec(a)+(c)/AC1+AC3)

**Date:** 2026-07-22 · **Architect** · **Zone:** multi (`apps/mcp-server/`, flow-docs)
**Input:** `docs/handoffs/FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD-BA-spec.md` (8 FR, 3 NFR, 8 EC) + PO Q1 ruling (Option B, `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-po.md`)
**Mode:** plan_only — design/ratification only, no production code in this cycle.
**BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new primitives — existing `coordinationStore.ts`/`coordinationTools.ts` functions extended, existing flow docs edited).

---

## 1. DDD layer ratification

BA's per-FR layer assignments are correct as written; ratified without change:

| FR | Files | Layer | Confirmed |
|---|---|---|---|
| FR-1/FR-2/FR-7 | `coordinationStore.ts` (`heartbeatTask`, `releaseTask`), `coordinationTools.ts` (Zod schemas) | infrastructure (db) + interface (mcp tool) | Read at `coordinationStore.ts:711-923`, `coordinationTools.ts:150-218` — file header already declares "infrastructure/db — SQLite access only, no domain imports"; matches. |
| FR-3/FR-4/FR-5/FR-6 | `dispatch-claim/SKILL.md`, `dev-team/flow/main.md` Step 0a-B | interface (procedural orchestration policy, not code) | No domain import surface exists in flow-docs; correct. |
| FR-8 | `coordinationStore.test.ts` (new) | infrastructure test | Matches `orchStateSchema.test.ts` sibling convention. |

Zero domain-layer touch confirmed (no `domain/services` file in scope) — matches BA's own closing line.

---

## 2. Ruling 1 — FR-5 board-flip bundle: **BUNDLE NOW, same commit, shared resolver**

**Decision:** Fix the `main.md:383-388` board-flip write in the SAME commit as FR-4's read-guard, and make both consume ONE shared lane-resolution pass instead of two independently-derived lookups.

**Why bundle:**
- FR-5's two defects (EC-1 prefix-strip, EC-2 flat-lane blindness) are **byte-identical** to the defects FR-3/FR-4 are already fixing in the READ path, in the SAME file, 5 lines away. A separate `dev-team-loop-I9` row would re-derive logic the developer touching this file will already have fully loaded in context — pure duplicated verification cost for zero isolation benefit (files/lines are not disjoint, so the dev-standards "parallel dispatch requires disjoint file scopes" rule would force it sequential anyway).
- FR-5 is **not container-rebuild-gated** (NFR-3 applies only to `apps/mcp-server/` code) — it is a pure flow-doc jq change, so bundling adds no deploy risk and no extra QA-gate class.
- Leaving it unbundled produces a self-inflicted regression: once FR-4 correctly widens the guard to flat lanes (per EC-2, 95%+ of the board), MORE genuinely-active adoptions will legitimately proceed past the guard than before — and every one of them hits the still-broken write, so the adoption "succeeds" (background agent spawned) with **zero board trace** (no `assigned_to`/`adopted_at`/`tree_hygiene_note`). That is a materially worse observability outcome than today for the ticket whose own title is "board-state guard."

**Design — shared resolver, not a copy:**
Per FR-4's own SSOT instruction ("this file's guard text must be a pointer to SKILL.md, not a re-pasted copy of the jq/logic"), extract the lane-resolution logic into ONE jq filter, invoked once per tick (EC-8/FR-3 step 5), producing an in-memory lookup map consumed by THREE call sites (router's Orphan-Adoption Probe, dev-team Step 0a-B read-guard, dev-team Step 0a-B board-flip write):

```bash
# ONE read per dispatcher tick — batch-resolves every orphan-signal's original_task_id
# in a single jq pass (never re-opens the file per-signal — EC-8/FR-3 step 5).
LANE_MAP=$(jq -c '
  def entry($lane): {id: .id, lane: $lane, status: .status};
  [ (.task_board.backlog[]?        | entry("backlog")),
    (.task_board.ready[]?          | entry("ready")),
    (.task_board.in_progress[]?    | entry("in_progress")),
    (.task_board.review[]?         | entry("review")),
    (.task_board.qa[]?             | entry("qa")),
    (.task_board.done[]?           | entry("done")),
    (.task_board.done_verified[]?  | entry("done_verified")),
    (.task_board.active_sprints[]?.tasks[]? | entry("active_sprints"))
  ] | INDEX(.id)
' docs/data/orch/orch-state.json)
```

Both the guard-read (FR-3/FR-4) AND the board-flip write (FR-5) then index `LANE_MAP[bare_id]` — the SAME resolved `{lane, status}` tuple. FR-5's write branches on `.lane`:
- `lane == "active_sprints"` → keep the existing `.task_board.active_sprints[].tasks[] | select(.id == $bare_id)` target.
- any flat lane value → `.task_board[$lane][] | select(.id == $bare_id)` — the SAME `$bare_id` already stripped for the guard check, no second `ltrimstr("task:")` call, no re-derivation.

Canonicalize this filter as `scripts/agents-flow/resolve-task-lane-by-id.jq` (Script Persistence rule, dev-standards.md) — SSOT for "find a task_board row by id across both shapes," referenced from `dispatch-claim/SKILL.md` § Orphan-Adoption Probe and pointed-to (not copied) from `dev-team/flow/main.md` Step 0a-B. This is what actually satisfies FR-4's anti-copy-paste-drift instruction — a prose pointer alone does not prevent two independently-evolving jq blocks; a shared script file does.

**PM decomposition note:** `dev-team-loop-I9` stays un-minted (BA confirmed no board row exists for it) — do not mint it. If it ever surfaces in a future audit pass, annotate as "implemented via FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD" per the same treatment as `router-dispatch-locking-P3` (BA spec §4 precedent) — never re-derive.

---

## 3. Ruling 2 — `backlog+BLOCKED` classification: **TERMINAL** (do not route to the active branch)

**Decision:** A row found in the flat `backlog` lane classifies as terminal-for-adoption-purposes **regardless of `.status`** (BACKLOG or BLOCKED) — no status carve-out inside `backlog`, consistent with the lane-alone-decides pattern BA already applied to the other 6 flat lanes (EC-5).

**Live evidence grounding the call (not a coin-flip):** grepped the live board — 12 of 412 backlog rows currently carry `status:BLOCKED`. One is directly attributable in the decision-journal audit trail (`docs/data/orch/orch-state.json` active_sprints decision log, TASK_2005): *"TASK_2005 in_progress->backlog status=BLOCKED depends_on+=FIX"* — i.e. a row that WAS in-flight got deliberately moved BACK to `backlog` and marked `BLOCKED` because a **new external dependency** (a freshly minted FIX task) must land first. That is the real, observed operational meaning of `backlog+BLOCKED` in this system: "paused pending an out-of-band precondition/decision," resolved by the normal `devteam-backlog-promote-bounded1.jq` depends_on-gate on a later tick — not "an agent should be silently respawned to keep iterating on it."

**Why not treat it like `in_progress+BLOCKED` (which BA's own rule already buckets as active):** the two are not symmetric.
- `in_progress+BLOCKED` resumes into a flow that is already downstream of PO/BA/architect scoping — a spec exists, a zone is assigned, and the resumed agent's own flow doc typically re-checks `status` and escalates rather than blindly executing. Blast radius is bounded to "one more agent notices BLOCKED and stops."
- `backlog+BLOCKED` re-adoption would bypass PO-triage/decomposition entirely and go straight to `spawn <agent-for-original_task_kind>` in adopt-resume mode — a categorically bigger blast-radius mismatch, and the exact incident class this P0 exists to close (unauthorized re-execution of work whose current disposition the adopting session cannot verify).
- Asymmetric failure cost: wrongly classifying a genuinely-still-wanted `backlog+BLOCKED` row as terminal only delays it (self-heals via the existing depends_on-gated promote script, or PO/human visibility on the board — nothing is deleted, the orphan-signal release is best-effort per EC-7). Wrongly classifying it as active risks a repeat of the MATERIALIZED incident (unauthorized hot-path execution).

**Cheap observability add (recommended, not required for AC):** when the terminal branch is hit specifically via `backlog+BLOCKED` (vs plain `backlog+BACKLOG`), log a `disposition_detail: "backlog+BLOCKED — ruled terminal, see architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md §3"` so this specific ruling is empirically falsifiable/greppable if it proves wrong in practice.

---

## 4. Ruling 3 — I10 batching vs INV-GATEWAY-1: **batch into the fix_spec(b) successor, I10 fixed FIRST as a hard precondition**

**Scope reminder:** per PO's Option B, this ticket does not touch `execute-tier.md` — this ruling only tells PM how to ORDER the successor row PM is about to mint.

**New finding (widens BA's I10 characterization) — verify before minting successor spec:** re-read `execute-tier.md:42-48` (claim) AND `:64` (finally-release) directly. BOTH omit `owner_client_session`:
```
# :42-48 (claim) — BA's I10 finding, confirmed:
outer_claim = call_tool(..., task_claim, {task_id, task_kind, owner_agent, ttl_seconds, payload})   # no owner_client_session

# :64 (release) — NOT previously flagged, same root defect:
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })          # no owner_client_session
```
`owner_client_session` is a **required** (non-`.optional()`) Zod field on both `task_claim` and `task_release` (`coordinationTools.ts:104-110`, `:199-205`). Neither call site can be satisfying that schema today as literally written — this is a stronger finding than BA's "I10 = task_claim only": the dispatcher-side lock lifecycle in `execute-tier.md` looks non-functional end-to-end, not merely degraded. Flag this corrected scope to PM verbatim for the successor spec.

**Why I10 must be a precondition, not just an adjacent bundle:** the successor's own fix_spec(b) deliverable is "heartbeat the sprint-task lock during long agent runs, OR raise TTL." A dispatcher heartbeat loop calls `task_heartbeat(task_id, owner_client_session)` — `owner_client_session` is required there too, and its value must be the SAME `$CLAUDE_CODE_SESSION_ID` that originally claimed the lock (P1-FINAL sole-key match — `coordinationStore.ts:723-730` comment). You cannot correctly heartbeat a lock using a session key that was never bound to it at claim time. Fixing I10 (bind `owner_client_session: $CLAUDE_CODE_SESSION_ID` at the `:42-48` claim call) is therefore a **hard implementation precondition** for the heartbeat-loop deliverable, not an optional nice-to-bundle.

**Ordering PM should encode in the successor row's spec (same file, sequential sub-steps — `execute-tier.md` is shared-SSOT-adjacent, not disjoint, so these are NOT independently parallel-dispatchable per dev-standards.md's parallel-dispatch table):**
1. **I10 fix (precursor):** add `owner_client_session: $CLAUDE_CODE_SESSION_ID` to both the `:42-48` claim call and the `:64` release call.
2. **TTL raise + heartbeat-loop placement** (fix_spec(b)/AC2 core deliverable) — `execute-tier.md:46` TTL bump, heartbeat loop placed **inside** the `try` block per BA §3, now heartbeating a lock that was actually claimed with a valid session key (depends on step 1).
3. **Doc-ref sync, SAME commit as step 2** (do not defer — this is the exact "code ships, stale doc doesn't" class FR-1 of THIS ticket already had to fix): `task-lock/SKILL.md:33` quick-ref, `docs/agents/tools/package/developer.md:69`, AND one BA did not cite — `docs/protocols/fail-loud-protocol.md:71` ("dev-* rely on TTL expiry (3600s max)") — all three currently say `3600` and must move together with the TTL bump.
4. **INV-GATEWAY-1 dead-call deletion** (`developer/flow/main.md:69,91-95`; mirror in `qa/flow/main.md:139`) — functionally independent of steps 1-3 (different files, no shared runtime state — dev-* specialists never had gateway binding regardless of what the dispatcher does), so it may land in the same commit for narrative coherence but has no ordering dependency on 1-3. Sequence it last only so the cleanup note can say "dispatcher now owns TTL/heartbeat end-to-end" truthfully.

PM should mint the successor with these 4 as ordered sub-tasks (not a flat unordered list) inheriting `supervised:true`/P0, cross-referencing `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` as predecessor, per PO's `successor_requirements`.

---

## 5. File-level design confirmation (FR-1/FR-2, ratifying BA's recommended fix set)

- `heartbeatTask()` (`coordinationStore.ts:723-755`): add optional `ttl_seconds?: number`, `payload_patch?: string` params. When `ttl_seconds` supplied, `UPDATE ... SET ttl_seconds = ?, heartbeat_at = ..., expires_at = unixepoch('now') + ?` (persist the new value, not just this cycle's expiry). When `payload_patch` supplied: `SELECT payload`, `JSON.parse` (catch → `{}` per EC-6), shallow-merge parsed `payload_patch`, `JSON.stringify`, second `UPDATE ... SET payload = ?`. Two-statement (not one CTE) to keep the existing single-writer SQLite pattern this file already uses everywhere else.
- Null-session ladder (FR-2): add as a SEPARATE code path inside `heartbeatTask`/`releaseTask`, gated `task_kind === 'orphan-signal' AND owner_client_session IS NULL` (checked via a `SELECT` first — mirrors `releaseOrphanTask`'s two-step SELECT-then-conditional-mutate at `:864-900`, not a raw combined `WHERE`). New optional params `owner_agent?: string`, `original_owner_client_session?: string`. Match succeeds when caller `owner_agent === row.owner_agent AND caller.original_owner_client_session === JSON.parse(row.payload).original_owner_client_session`. **NFR-1 regression test is load-bearing** — assert this rung is physically unreachable when `row.owner_client_session IS NOT NULL` (i.e., gate the branch selection on the SELECT result, never on caller-supplied kind/flag alone — a caller cannot claim orphan-signal semantics onto a live-session row by lying about `task_kind` in the call, since the gate reads the row's OWN `owner_client_session` column, not a caller assertion).
- `coordinationTools.ts` Zod: add the 3 new optional fields to `task_heartbeat` registration; add `owner_agent`/`original_owner_client_session` optional to `task_release` registration; update both `.describe()` prose blocks in the same commit (FR-7).

---

## 6. Risk flags

- **Deploy sequencing (NFR-3, already correctly flagged by BA):** flow-doc changes describing the new params as live must not ship ahead of the `ops`-gated container rebuild — re-emphasize to PM as a task-ordering constraint (server code lands + rebuilds BEFORE flow-doc prose flips from "planned" to "in production use").
- **Test-before-flow-doc gate (BA §FR-8, ratified):** the live integration round-trip (claim→heartbeat-with-patch→list_held-shows-patch) against the running container is a hard gate before FR-3/FR-4/FR-6 prose ships as "available" — keep this explicit in the PM decomposition, do not let it get silently merged into a generic "write tests" subtask.
- **Closure gate (carried forward, not re-litigated):** this row's DONE flip stays hard-blocked on the fix_spec(b) successor row's EXISTENCE (PO ruling) — architect's role here ends at ratifying scope/design; PM must mint the successor before this ticket's QA-verify can close it.

---

## RETURN
DONE: 3 architect-decidable calls ruled (FR-5 bundle=yes/shared-resolver, backlog+BLOCKED=terminal, I10=batched-into-successor-as-precondition); DDD layers ratified; file-level design confirmed for FR-1/FR-2; 1 new brownfield finding (execute-tier.md:64 release call also missing owner_client_session) surfaced for successor spec.
NEXT: pm — decompose FR-1..FR-8 into atomic dev tasks (this ticket) per §5, AND mint the fix_spec(b)/AC2 successor row per PO's Option B + §4 ordering. SUPERVISED HOLD in effect — do not auto-dispatch past this point without supervisor go-ahead (see board `head.next_action`).
HANDOFF: docs/handoffs/FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD-BA-spec.md (Brownfield Findings appended), this brief.
PIPELINE: continue (supervised — do not auto-advance past architect)
