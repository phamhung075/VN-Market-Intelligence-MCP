# BA Spec — FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD

**Task:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD · P0/HIGH · zone multi (`apps/mcp-server/`, `flow-docs`) · supervised:true · plan_only:true
**BA date:** 2026-07-22
**Audit lineage:** `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#router-dispatch-locking-P3` (RESCOPE) — folds this ticket; absorbs REJECTED `router-dispatch-locking-P2`'s implementation notes verbatim (do NOT re-mint or close either row — see §4).
**Verdict:** Spec complete for fix_spec(a)+(c)/AC1+AC3. fix_spec(b)/AC2 is an explicit OPEN RESIDUAL, NOT implemented this wave (per dispatch instruction — see §3). **1 PO blocker** (sequencing, §5). **NEXT: po**, then architect.

---

## 0. Provenance / current live state (verified this cycle)

- Board row confirmed live at `.task_board.in_progress[]` (flat lane), `status: IN_PROGRESS`, `supervised: true`. **`plan_only: true` is present in `docs/data/orch/archive/backlog-detail.json` but ABSENT from the live `.task_board` row copy** — the 2026-07-21T22:47:59Z Supervised-Lane Sweep promotion note claims "supervised/plan_only flags preserved" but only `supervised` actually landed. Restoring `plan_only: true` on the live row is included in this cycle's write (§ below) — this is *adding back* a dropped flag, not clearing one, so it does not violate the "do not clear" constraint.
- `.head.active_task_id` = this task, `.head.next_agent` = `ba` — confirms this is the correct live dispatch target, no drift.
- Three confirmed live recurrences already on file (`docs/data/orch/archive/backlog-detail.json` `recur_20260704T1207/1237/1307`): (1) 2026-07-03 false-orphan of a healthy 90-min agent, unclearable null-session signal; (2) 2026-07-04T12:07Z completion-closeout near-miss (deliverable done, board not updated, adoption would have re-dispatched); (3) 2026-07-04T13:07Z **materialized** — an already-completed task's dead-session lock was adopted, produced unauthorized code execution on the MCP hot-path (`server.ts`), quarantined via `git stash`. This ticket exists specifically to close that class.

---

## 1. Requirements

### FR-1 — Extend `task_heartbeat` with optional `ttl_seconds` + `payload_patch`
**DDD layer:** infrastructure (`apps/mcp-server/src/infrastructure/db/coordinationStore.ts` `heartbeatTask()`) + interface (`apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` Zod schema/registration).

Current `heartbeatTask(task_id, owner_client_session)` only renews `heartbeat_at`/`expires_at` using the row's *existing* `ttl_seconds` column and never touches `payload`. Add two optional params:
- `ttl_seconds` (same bounds as `task_claim`: min 60, max 691200) — when supplied, also persist it as the row's new `ttl_seconds` so subsequent heartbeats keep using the raised value; when omitted, current behavior (reuse existing column) is unchanged.
- `payload_patch` (JSON string, mirrors `task_claim`'s `payload` convention) — shallow-merge parsed `payload_patch` fields into the existing parsed `payload` JSON, re-serialize, `UPDATE ... SET payload = ?`. Malformed/absent existing `payload` → build a fresh object from `payload_patch` alone (non-fatal, matches the file's established "never throw to the MCP tool layer" contract).

This is the literal capability the router's escalation block (`dispatch-claim/SKILL.md:354-359`) already calls today with **no matching server support** — confirmed live: 0 `payload_patch` hits anywhere in `apps/mcp-server/src`, and the SKILL.md prose at `:182-184` explicitly says "no payload_patch in the current MCP surface," contradicting the escalation block 170 lines below it in the same file. **Update `SKILL.md:182-184` prose in the SAME commit** so doc and surface stop contradicting each other (do not ship code + stale doc separately — see NFR-3).

### FR-2 — Null-session match ladder for `orphan-signal` rows (`task_heartbeat` + `task_release`)
**DDD layer:** infrastructure (matching logic in both functions) + interface (new optional params).

Reaper-minted `orphan-signal:*` rows always carry `owner_client_session = NULL` (`coordinationStore.ts:545`). P1-FINAL's sole-key match (`WHERE owner_client_session = ?`) can **never** match a NULL column via a bound string parameter — `task_release`/`task_heartbeat`/`task_force_release_orphan` on these rows always return the "no match" branch, confirmed by memory (`feedback_orphan_signal_immune_and_adoption_no_board_guard`) and the architecture brief's P3 verifier. Add an **additive** second matching rung, used ONLY when `task_kind = 'orphan-signal'` AND the stored row's `owner_client_session IS NULL`:

> match succeeds when caller-supplied `owner_agent` equals `row.owner_agent` **AND** a new caller-supplied echo param (e.g. `original_owner_client_session`) equals the `original_owner_client_session` value embedded in the row's own `payload` JSON.

This treats "the caller can quote back the exact value it read via the read-only `task_list_held` probe" as proof of legitimate, informed access — there is no live session to be the "true owner" of a reaper artifact, so the model shifts from session-identity to payload-knowledge for this one row-class only. Implementation should follow the existing `releaseOrphanTask()` two-step SELECT-then-conditional-mutate pattern (safe under SQLite's single-writer model) rather than a raw SQL `WHERE` predicate, since the comparison requires parsing `payload` JSON in JS.

**Two concrete call sites need this new capability to actually work** (both already exist in flow docs and are currently no-ops):
1. Escalation heartbeat, `dispatch-claim/SKILL.md:354-359` — extends TTL + sets `payload.status = "ESCALATED"` so the idempotency check at `:347-349` (`if signal.payload.status == "ESCALATED": skip silently`) stops being dead code. **Note:** this call site does not even pass `owner_agent` today — FR-6 below adds it.
2. Best-effort cleanup release of `"orphan-signal:" + original_task_id` after successful adoption — `dispatch-claim/SKILL.md:394-397`, `dev-team/flow/main.md:391-394` and `:365-370` (git_sha-invalid branch). All three currently return `{ok:true, released:0}` unconditionally.

**NFR-1 (guard-rail, non-negotiable):** this ladder is strictly scoped to `task_kind='orphan-signal'` rows with `owner_client_session IS NULL`. It MUST NOT create any new match path for live-session locks (`sprint-task`, `intent`, `cowork-slot`, `commit-mutex`, `session-presence`, or any orphan-signal row that somehow already has a non-null session) — the P1-FINAL anti-theft invariant (sole-key match) stays exactly as-is for every other case. Architect/dev should add an explicit regression test proving a live-session lock cannot be released/heartbeated via the new `owner_agent`/`original_owner_client_session` params (i.e., the new rung never fires when `owner_client_session` is non-null on the row).

### FR-3 — Board-state guard, router-side (`dispatch-claim/SKILL.md` § Orphan-Adoption Probe)
**DDD layer:** interface (flow-doc/procedural — the boundary between orchestration policy and the MCP tool surface; no domain logic).

Insert a guard **once per signal, before the `redispatch_count >= N_MAX` branch** (not duplicated separately inside both the escalation and adoption sub-branches — see EC-3), scoped to `original_task_kind == "sprint-task"` only (`cowork-slot`/`dashboard-row` already have kind-appropriate completion checks — the `published:<kind>:<period>` probe and "idempotent, always safe to redo" respectively — per the existing Resume Contract table at `SKILL.md:414-420`; this ticket's guard does not touch those two kinds):

1. Strip the `"task:"` prefix from `original_task_id` before any board lookup (**mandatory** — see EC-1, this is a confirmed live bug in the sibling code this guard is modeled on).
2. Resolve the bare id against `docs/data/orch/orch-state.json` `.task_board`, checking **both** shapes in the same lookup (see EC-2 — the guard must not repeat the flat-lane blindness already present in `dev-team/flow/main.md:385`):
   - Flat lanes: `backlog/ready/in_progress/review/qa/done/done_verified` (`.task_board.<lane>[] | select(.id == $bare_id)`).
   - Nested: `.task_board.active_sprints[].tasks[] | select(.id == $bare_id)`.
3. Classify by **lane membership**, not by a bare `.status` token — per the live `LANE_ALLOWED_STATUSES` SSOT (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:416-424`), `BLOCKED` is a valid sub-state of THREE different lanes (`backlog`, `review`, `in_progress` — see EC-5), so a status-only check is ambiguous. Rule:
   - Found in `ready` or `in_progress` (flat) **or** nested with `.status` in `{TODO, IN_PROGRESS, READY, BLOCKED}` → **active** → proceed to adopt.
   - Found in `review`, `qa`, `done`, `done_verified` (flat) **or** nested with `.status` in `{REVIEW, DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED}` → **terminal** → completion-recognizing closeout: log skip, do NOT re-dispatch, best-effort-release the orphan-signal (now actually succeeds per FR-2).
   - Found in `backlog` (flat) → treat as **not-yet-dispatched / terminal-for-adoption-purposes** (a backlog row was never actively claimed under this lock in the first place if it's sitting un-promoted; a genuinely-active backlog+BLOCKED row is the one ambiguous case — flag to architect whether `backlog+BLOCKED` should route to the "active" branch instead, since BLOCKED-in-backlog is closer in meaning to "paused mid-flight" than "not started").
   - **Not found in any lane** (row was archived/cold-evicted, or `detail_ref`-only) → treat as **terminal/absent** → same closeout as terminal (never default to "active" on absence — an absent row must never trigger a re-dispatch).
4. AC1's literal double-check (lane AND status-not-in-terminal-set) should still both be applied as defense-in-depth even though `checkLaneCoherence()` (Stage 1b of `scripts/orch-validate.mjs`) is now a HARD FAIL, not merely a warning — meaning `orch-apply.sh`-gated writes can no longer *create* a lane/status mismatch going forward, but this guard is reading a file that could still carry corruption from before that hard-fail shipped, or from any write that ever bypassed `orch-apply.sh`. Keep both checks; do not simplify to lane-only.
5. Batch-read `.task_board` **once per dispatcher tick**, not once per orphan-signal in the loop (token-economy NFR — orphan-signals are typically few, but there is no reason to re-read the same file N times; use the existing lazy jq-slice pattern per `docs/standards/orch-state-access.md §1`, never `cat` the full file).

### FR-4 — Board-state guard, dev-team-side (`dev-team/flow/main.md` Step 0a-B)
**DDD layer:** interface, same class as FR-3.

Apply the **identical** guard logic before the adopt claim at `main.md:320-329`. Per the rescope's explicit base-skill invariant, this file's guard text must be a **pointer to `dispatch-claim/SKILL.md` as SSOT** ("board-state guard: see `.claude/skills/dispatch-claim/SKILL.md` § Orphan-Adoption Probe — apply identically here"), not a re-pasted copy of the jq/logic — avoiding the exact copy-paste-drift class the standing invariants forbid (this file and the SKILL.md orphan probe are already independently-evolving siblings; the ADD-2 lane-status doc, the N_MAX escalation logic, and the release-in-`finally` pattern are all duplicated today with zero cross-reference). Apply the same best-effort-release annotation to both release-orphan-signal call sites in this file (`:365-370`, `:391-394`).

### FR-5 (recommended in-scope bundle, architect-decidable) — Fix the adjacent board-flip write at `main.md:383-388`
**DDD layer:** interface, same file/step as FR-4.

Directly adjacent to (5 lines from) the code FR-4 touches: the post-adopt board-flip `jq --arg tid "{original_task_id}" ... select(.id == $tid) |= (.assigned_to = ... )` (`main.md:383-388`) has the **same two defects** as the guard this ticket is adding — (a) `$tid` is never stripped of its `"task:"` prefix (EC-1), and (b) it only targets `.task_board.active_sprints[].tasks[]`, never a flat lane. **Both defects mean this line is a 100%-reproducible silent no-op today for the overwhelming majority of live rows** (95%+ of the board is flat-lane — see EC-2's live counts), independent of and compounding `dev-team-loop-I9` (which cites the flat-lane cause but not the prefix-mismatch, so fixing only I9's cited cause would still leave this line broken). Recommend the SAME `resolve-task-lane-by-id` helper logic FR-3/FR-4 need for the guard READ be reused for this WRITE, so there is one code path for "find a task_board row by (possibly-prefixed) id across both shapes" instead of two independently-drifting copies. This is not literally required by AC1 (which only covers the SKIP path), but shipping FR-4's read-guard while leaving this immediately-adjacent write half-broken produces adoptions that succeed but leave zero board trace — architect's call whether to bundle now (same file, same commit, low marginal cost) or spin `dev-team-loop-I9` into its own row (currently un-minted — checked, no board row exists for it).

### FR-6 — Escalation call-site update (`dispatch-claim/SKILL.md:354-359`)
**DDD layer:** interface.

Add `owner_agent: <dispatcher-role>` to the escalation `task_heartbeat` call (currently missing entirely) so FR-2's null-session ladder has the param it needs to match.

### FR-7 — SSOT sync
**DDD layer:** infrastructure (cross-cutting registry).

`docs/data/tool-registry.json` references `task_heartbeat`/`task_release` by name only (no per-tool schema payload duplicated there) — confirmed no edit needed there beyond the existing entries staying accurate. The tool **description strings** inside `coordinationTools.ts` (currently document `task_heartbeat` as "Renew a held lock... does not update payload fields" implicitly via the SKILL.md cross-reference) must be updated in the same commit as FR-1/FR-2 to describe the new optional params — do not let the Zod schema and its own `.describe()` prose diverge (same enum/schema-drift discipline as `feedback_preclaim_gate_taskkind_enum_drift`).

### FR-8 — Tests
**DDD layer:** infrastructure (test layer).

No existing test file covers `coordinationStore.ts` or `coordinationTools.ts` at all (checked — zero `*coordinationStore*test*`/`*coordinationTools*test*` files repo-wide). This ticket is the first code change to this module since it shipped; recommend a new `apps/mcp-server/src/infrastructure/__tests__/coordinationStore.test.ts` (matching the existing `orchStateSchema.test.ts` sibling convention) covering at minimum: (1) `heartbeatTask` with `ttl_seconds`/`payload_patch` on a normal live-session row — TTL and payload update correctly, non-patched fields survive; (2) `heartbeatTask`/`releaseTask` null-session ladder — succeeds with correct `owner_agent`+echoed `original_owner_client_session`, fails on wrong `owner_agent`, fails on wrong echo value; (3) **regression guard for NFR-1** — the null-session ladder never matches a row that HAS a non-null `owner_client_session`, even if `owner_agent`/echo happen to match; (4) malformed/absent existing `payload` on `payload_patch` merge (EC-6) does not throw. Per the brief's own Risk note, gate the flow-doc changes (FR-3/FR-4/FR-6) behind a live integration round-trip (claimed:true → heartbeat with patch → list_held shows patched payload) against the running container before flipping SKILL.md prose to describe the new behavior as available — this depends on a user-gated container rebuild (NFR-3).

### NFR-2 — Backward compatibility
Every existing caller of `task_heartbeat(task_id, owner_client_session)` (fleet-wide — fire-election, session-presence renewal, SF-1, etc.) passes neither `ttl_seconds` nor `payload_patch` today. FR-1/FR-2 must be a strict additive superset: omitting the new params reproduces byte-identical current behavior. No existing call site needs to change except the two named in FR-2/FR-6.

### NFR-3 — Deployment sequencing (user-gated)
`coordinationTools.ts`/`coordinationStore.ts` live in the `apps/mcp-server/` container. Per standing policy (`feedback_container_swaps_user_gated`, `feedback_user_gates_delegate_to_ops`), the code change is **not live** until an explicit user-approved rebuild — route the rebuild step to `ops`, not self-executed by developer. Flow-doc changes (FR-3/FR-4/FR-6) that describe the new server behavior as available should not be flipped to "in production use" in agent-facing prose until that rebuild is confirmed live (avoids re-creating the exact SKILL.md-says-one-thing/surface-does-another contradiction FR-1 is fixing).

**Domain layer:** none of the above touch `domain/services` — this ticket is 100% infrastructure + interface (coordination/orchestration mechanics, not market-data business logic), consistent with `coordinationStore.ts`'s own file-header layer declaration ("infrastructure/db — SQLite access only, no domain imports").

---

## 2. Edge Cases

- **EC-1 (mandatory, confirmed live bug):** `original_task_id` in every orphan-signal payload retains the `"task:"` outer-wrap prefix (e.g. `task:FIX-X`) because both tiers — outer dispatcher-wrap (`execute-tier.md:43`, `SKILL.md:273`) and inner self-claim — key on the SAME `"task:" + id` string (SKILL.md:39 "must match inner self-claim key exactly"). `.task_board.*[].id` fields are bare (`FIX-X`). **Every** jq/lookup comparing these must `ltrimstr("task:")` (or equivalent) first. `dev-team/flow/main.md:383-388`'s existing board-flip jq does NOT do this today and is confirmed to always no-op as a result (see FR-5).
- **EC-2 (mandatory, live-verified counts):** the board is overwhelmingly flat-lane today — `backlog=412, ready=35, in_progress=2, review=34, qa=0, done=12, done_verified=0` vs only `active_sprints=8` (nested). A guard that only scans `active_sprints[].tasks[]` (mirroring the existing buggy pattern at `main.md:385`) would completely fail to protect the exact incident class this ticket exists for — the original 07-03 incident and the FACTORY-INTERFACE 07-04 incident both involved non-sprint-nested work. Both flat and nested shapes are mandatory in the guard read (FR-3 step 2).
- **EC-3:** the board-state guard should run **once per signal**, before branching into the `redispatch_count >= N_MAX` escalation-vs-adopt decision — an already-terminal task should skip BOTH branches uniformly (no BUG-telegram escalation noise for a task that's already done, no adoption). Avoids duplicating the guard logic inside two sub-branches.
- **EC-4:** guard scope is `original_task_kind == "sprint-task"` only; `cowork-slot`/`dashboard-row` orphans are out of scope (existing kind-specific completion checks already cover them per the Resume Contract table).
- **EC-5:** `BLOCKED` is a valid sub-state in three different lanes (`backlog`, `review`, `in_progress` per ADD-2 `LANE_ALLOWED_STATUSES`) — classify by lane membership first, use `.status` only within a lane's already-narrow context, never as a bare cross-lane token match.
- **EC-6:** malformed/absent `payload` JSON on a `payload_patch` merge (or a pre-P1 row with `payload IS NULL`) must be handled non-fatally — build a fresh object from the patch alone, never throw, matching the module's established error contract.
- **EC-7:** two dispatcher sessions racing the same orphan-signal is not a new race — the guard is a READ-only pre-filter; the actual mutex is still the existing `task_claim` INSERT/steal semantics, whose "lost race → skip" branch already exists in both flow docs. A stale-guard-pass followed by a lost claim race degrades to that existing no-op path, not a new failure mode.
- **EC-8:** batch-read `.task_board` once per tick, not once per signal in the probe loop (token economy).

---

## 3. Residual — fix_spec(b)/AC2 explicitly OUT OF SCOPE this wave

Per the dispatching instruction, fix_spec(b) ("stop false-orphaning live agents: heartbeat the sprint-task lock during long agent runs, OR raise the sprint-task lock TTL above typical ~90min agent runtime, currently 3600s") / AC2 is **not implemented in this requirements wave**. This is noted, not silently folded, per the rescope's own closing instruction: "must either be included or left as the ticket's explicit residual."

Carried forward verbatim from the REJECTED `router-dispatch-locking-P2` proposal's absorbed implementation notes (do not re-derive these — the P2 verifier already did the file-level legwork and rejected P2 only because it targeted the wrong files / bypassed this ticket's supervision gate, not because the diagnosis was wrong):

- The operative sprint-task claim site with the hardcoded `ttl_seconds: 3600` is `docs/agents/dev-team/flow/execute-tier.md:42-48` (Tier-batch dispatcher-wrap), **not** `dev-team/flow/main.md` §Step 3 (which only heartbeats SF-1/presence and delegates to this sub-flow). Confirmed live this cycle — `execute-tier.md:42-48`'s `task_claim` also **omits `owner_client_session` entirely** (a distinct, adjacent defect already tracked as `dev-team-loop-I10`, cross-referenced here but not this ticket's to fix).
- Delete the dead `INV-GATEWAY-1`-violating lock calls from `docs/agents/developer/flow/main.md` (`:69` `task_release`, `:91-95` per-TDD-loop `task_heartbeat`) — specialists don't hold the gateway tool per `task-lock/SKILL.md:168-170`; the dispatcher (execute-tier's `finally` wrap) is the sole legitimate releaser.
- Place the dispatcher heartbeat loop *inside* `execute-tier.md`'s `try` block (the actual spawn-wrap), not in `main.md` §Step 3.
- Raise TTL at `execute-tier.md:46` + `.claude/skills/task-lock/SKILL.md:33` quick-ref + `docs/agents/tools/package/developer.md`, and mirror the developer-flow cleanup in `docs/agents/qa/flow/main.md:139`.

**This residual should not be silently dropped after (a)+(c) ship** — see §5 Q1 for the sequencing decision this needs from PO.

---

## 4. Coordination note — do not duplicate or close P3 / P2

- `router-dispatch-locking-P3` (RESCOPE) is implemented BY this ticket's fix_spec(a)+(c) — do not mint a separate board row for P3; when this ticket's implementation lands, annotate P3's brief entry as "implemented via FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD" rather than closing the brief itself (the brief is a dated audit artifact, not a live tracker — do not edit it; see the exclusion-list precedent in `UC-CRITIC-GATEWAY-CONTRACT-DRIFT-BA-spec.md §2`, same "never rewrite dated findings" rule applies here).
- `router-dispatch-locking-P2` (REJECTED) is fully absorbed into §3's residual above — its diagnosis was correct, only its routing (parallel independent change, bypassing this ticket's supervision gate) was rejected. Do not re-propose P2 as a standalone change.

---

## 5. Blockers (PO)

**Q1 — Ticket closure sequencing across the two-wave split.** This ticket is P0/supervised specifically because of three escalating live recurrences, the third of which produced unauthorized code execution on the MCP hot-path. Should `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` (a) stay open/IN_PROGRESS after fix_spec(a)+(c) ship, pending a **second** supervised wave that implements fix_spec(b)/AC2 (§3) before the row is ever allowed to flip DONE — or (b) should PM spin fix_spec(b) into a **new, explicitly-linked** backlog row now (inheriting `supervised:true`/P0, cross-referencing this ticket's id) so this ticket can close cleanly once (a)+(c) verify, with the new row carrying the AC2 residual forward under its own supervised gate? Both preserve the supervision discipline; this is a governance/closure-criteria call (is "all 3 fix_spec items done" the DONE bar for this specific P0 supervised row, or is "the two items this wave targeted" sufficient with an explicit successor), not an engineering one — routing to PO per BA charter (feature-priority/governance question only PO can answer).

No other PO-level blockers — the remaining decisions (FR-5 bundling, the `backlog+BLOCKED` classification in FR-3 step 3, batching P2's cross-referenced I10 note) are architect-decidable engineering scope, not business/priority calls.

---

## 6. Recommended fix set for architect (file : lines : change)

| # | File | Lines | Change |
|---|------|-------|--------|
| 1 | `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` | `task_heartbeat` registration (~151-184), `task_release` registration (~187-218) | Add optional `ttl_seconds`/`payload_patch` (heartbeat only) + new `owner_agent`/`original_owner_client_session` optional params (both tools) per FR-1/FR-2; update `.describe()` prose per FR-7 |
| 2 | `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` | `heartbeatTask()` (~723-755), `releaseTask()` (~768-788) | Implement ttl/payload-merge (FR-1) + null-session ladder (FR-2) per the `releaseOrphanTask()` two-step pattern already in this file |
| 3 | `apps/mcp-server/src/infrastructure/__tests__/coordinationStore.test.ts` (new) | — | FR-8 |
| 4 | `.claude/skills/dispatch-claim/SKILL.md` | `:182-184` (payload_patch prose), `:354-359` (escalation call), `:339-373` (Orphan-Adoption Probe) | FR-1 doc-sync, FR-6, FR-3 |
| 5 | `docs/agents/dev-team/flow/main.md` | `:294-408` (Step 0a-B), optionally `:383-388` (board-flip) | FR-4, optionally FR-5 |
| 6 | `docs/data/tool-registry.json` | — | FR-7 (verify, likely no-op — name-only references) |

No CLAUDE.md edit in scope. No domain-layer file in scope.

---

## RETURN
DONE: BA spec complete for fix_spec(a)+(c)/AC1+AC3. fix_spec(b)/AC2 explicitly flagged as open residual (§3), not silently folded. 1 PO blocker (§5 Q1 — closure sequencing).
NEXT: po — resolve Q1, then architect (brownfield design + file-level ratification of FR-1..FR-8, DDD layer confirmation, ruling on the FR-5/`backlog+BLOCKED` architect-decidable calls).
HANDOFF: docs/handoffs/FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD-BA-spec.md
PIPELINE: continue (supervised — do not auto-advance past PO)

---

## [Architect] Brownfield Findings

- **Zone:** multi (`apps/mcp-server/`, flow-docs) — matches BA header, no split needed.
- **Full design + all 3 ruled architect-decidable calls:** `docs/architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md` (read this — not re-duplicated here).
- **Ruling summary (detail in brief §2-4):**
  1. **FR-5 board-flip bundle → BUNDLE NOW**, same commit as FR-4, sharing ONE lane-resolution pass (new `scripts/agents-flow/resolve-task-lane-by-id.jq`) across the router probe, the dev-team read-guard, AND the board-flip write — not three independently-drifting copies.
  2. **`backlog+BLOCKED` → TERMINAL** (no active carve-out). Grounded in a live example already on the board (`TASK_2005`: in_progress→backlog+BLOCKED on a new `depends_on`) showing the real operational meaning is "paused pending an external precondition," not "resume automatically." Asymmetric safety cost (wrong-active risks repeat of the MATERIALIZED incident; wrong-terminal only delays via the existing depends_on-gated promote script) breaks the tie.
  3. **I10 → batched into the fix_spec(b) successor, fixed FIRST as a hard precondition** of that row's heartbeat-loop deliverable (cannot heartbeat a lock with a session key never bound at claim time). **New finding, widens BA's I10 scope:** `execute-tier.md:64`'s finally-release call ALSO omits the required `owner_client_session` param (not just the `:42-48` claim call) — both must move together. Full 4-step ordering (I10 → TTL/heartbeat → doc-sync incl. a 4th site BA didn't cite, `fail-loud-protocol.md:71` — → INV-GATEWAY-1 cleanup) in brief §4 for PM to encode as ordered sub-tasks, not a flat list.
- **DDD layers:** BA's per-FR assignments ratified without change (brief §1) — infrastructure/db for `coordinationStore.ts`, interface for both the mcp tool registration and all flow-doc changes, zero domain-layer touch confirmed.
- **File-level design (FR-1/FR-2):** two-statement UPDATE pattern for `ttl_seconds`/`payload_patch` (not a combined CTE); null-session ladder as a SELECT-then-conditional-mutate branch mirroring `releaseOrphanTask()` at `coordinationStore.ts:864-900`, gated on the ROW's own `owner_client_session IS NULL` (not a caller-supplied flag) so NFR-1's anti-theft invariant cannot be bypassed by a caller lying about `task_kind`. Detail in brief §5.
- **Scan clean:** true — verified `coordinationStore.ts` (heartbeatTask/releaseTask/releaseOrphanTask, lines 711-923), `coordinationTools.ts` (task_heartbeat/task_release/task_force_release_orphan registrations, lines 150-335), `orchStateSchema.ts` (`LANE_ALLOWED_STATUSES`/`TERMINAL_SET`, lines 40-64 + 416-424), `dispatch-claim/SKILL.md` (Orphan-Adoption Probe, lines 150-421), `dev-team/flow/main.md` Step 0a-B (lines 280-414), `execute-tier.md` (lines 20-68) — all BA line citations confirmed accurate at HEAD; no drift found between spec and code.
- **BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new primitives).

## RETURN
DONE: Technical design complete — 3 architect-decidable calls ruled, DDD layers ratified, file-level design confirmed for FR-1/FR-2, 1 new brownfield finding surfaced (execute-tier.md:64).
NEXT: pm — decompose FR-1..FR-8 (this ticket) + mint fix_spec(b)/AC2 successor row per PO Option B and brief §4 ordering.
HANDOFF: docs/architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md
PIPELINE: continue (supervised — SUPERVISED HOLD after architect; do not auto-dispatch pm without supervisor go-ahead)
