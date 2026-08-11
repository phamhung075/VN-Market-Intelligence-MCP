# BA Spec — UC-RDL-P4

**Task:** UC-RDL-P4 · P1 · SPRINT-M/L · zone `apps/mcp-server/` · supervised:true
**BA date:** 2026-08-11
**Audit lineage:** `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#router-dispatch-locking-P4` (CONFIRMED) — "Add composite `dispatch_preflight` MCP tool: presence + orphan probe + roster + intent claim in ONE gateway call." Addresses `router-dispatch-locking-I8/I9/I15/I18`.
**Verdict:** Spec complete. **2 PO blockers** (sequencing/DoD, §5) — routing next_agent=po per this row's own `supervised:true` and precedent (this is a governance/rollout call, not an engineering one).

---

## 0. Provenance / current live state (verified this cycle, not trusted from the brief alone)

- Board row confirmed live at `.task_board.in_progress[]`, `status: IN_PROGRESS`, `supervised: true`. PO's 2026-07-15 adjudication note (on this exact row) already resolved the scope-vs-cowork question: this tool targets the **ROUTER**'s Phase 0a/A/A.5/B (CLAUDE.md step 2.5 + `.claude/skills/dispatch-claim/`), explicitly **not** `scripts/agents-flow/cowork-tick-preflight.sh` (deliberately bash-only, TOKEN-ECONOMY-TICK-PREFLIGHT WU-1) and not dev-team's own Step 0a orphan-drain (already scoped to dev-team per `dispatch-claim/SKILL.md`'s own "Dispatch scope" note: *"dev-team orphan-signals are drained in dev-team Step 0a, not here"*). Treated as already-settled, not re-litigated below.
- **Dependency `UC-RDL-P1` ("Coordinate with UC-RDL-P1 (lock-prefix) landing first"): LANDED.** `UC-RDL-P1` is `DONE_VERIFIED` (`docs/data/orch/archive/2026-07.json`, fix commit `18885ff50`, verified 2026-07-13T20:20:43Z) — `dispatch-claim/SKILL.md` and `task-lock/SKILL.md` already use the `task:<id>` prefix live (re-read this cycle: `CARD.md` and `SKILL.md` both consistent, zero `sprint-task:` value hits outside historical prose at `SKILL.md:492`). **No blocker remains from this dependency.**
- Sibling proposals on the same brief domain, re-checked for live-collision risk with the files this task will touch:
  - `router-dispatch-locking-P3` (orphan escalation repair) is **not** a standalone board row — it is explicitly folded into `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` (orch-state.json:6632 verdict note) and has **already shipped** its `dispatch-claim/SKILL.md` half (commit `234902038`, FR-1/FR-3/FR-6 — the board-state guard, escalation prose sync, and `owner_agent` addition I read live in `SKILL.md` §Orphan-Adoption Probe today are exactly this fix). Its server-side half (`FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS`) is code-complete (commit `fb5207746`, tests `8af71e8c2`) but sits in `.task_board.review[]`, `next_agent: developer` — **not yet QA-verified, not yet in a rebuilt container** (see §5 Q2).
  - `router-dispatch-locking-P5` (CLAUDE.md step 2.5 shrink) is `DONE_VERIFIED` and archived (commit `aef457f38`) — the CLAUDE.md content I read this cycle (5-line pointer + 3-outcome table) already matches. No collision.
  - `router-dispatch-locking-P7` (branch-policy reconciliation) is `READY` as `UC-RDL-P7`, but touches an unrelated file set (developer/qa/pm flow docs, branch checkout convention) — no zone overlap with this task.
  - **Net effect:** the files this task's design will modify (`CLAUDE.md`, `.claude/skills/dispatch-claim/{CARD.md,SKILL.md}`, `apps/mcp-server/src/interface/mcp/tools/system/coordination/`) are currently **not** under concurrent edit by any other live UC-RDL row. Clear to proceed.
- **Server code shape has changed since the brief was written** (2026-07-12): `coordinationTools.ts` (then 457L monolith) was split into 6 per-tool files under `apps/mcp-server/src/interface/mcp/tools/system/coordination/` (`FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L`, commit `1653cea0a`, 2026-08-09) — `taskClaimTool.ts`, `taskHeartbeatTool.ts`, `taskReleaseTool.ts`, `taskListHeldTool.ts`, `taskForceReleaseOrphanTool.ts`, `weekPeriodTool.ts`, thin `coordinationTools.ts` entry point. The new `dispatch_preflight` tool should follow this **already-established per-tool-file convention** — a new `dispatchPreflightTool.ts` sibling, registered from `coordinationTools.ts`, not appended back into a monolith.
- **Precedent pattern confirmed live:** `get_cycle_bootstrap` (`apps/mcp-server/src/application/usecases/getCycleBootstrap.ts` + `.../system/cycleBootstrapTool.ts`) is exactly the "N-call compound tool" shape the brief's verifier cites — thin interface tool delegates to an `application/usecases/` function that runs the sub-operations, times each independently, and returns a partial-failure envelope (`Promise.allSettled`-style, per-slot `error` key, `sub_call_timings`). This is the layering template for FR-1 below, **with one material difference**: `get_cycle_bootstrap` composes only **reads**; `dispatch_preflight` must compose reads (orphan probe, roster) **and** writes (presence claim/renew, intent claim) in one call — the partial-failure model cannot be applied uniformly to the write steps (§1 FR-6, EC-4).
- `docs/data/tool-registry.json` `totalCount: 183` today (SSOT the brief's own Risk note flags for 3-way sync — CLAUDE.md already references it via a generated-count pointer, not a hardcode, confirmed live at file top).
- `apps/mcp-server` container has been running 2+ days without rebuild (`docker ps`: `Up 2 days (healthy)`) — any new tool is invisible to callers until an explicit, user-gated rebuild (standing policy `feedback_user_gates_delegate_to_ops`).

---

## 1. Requirements

### FR-1 — New `dispatch_preflight` MCP tool (interface + application layers)
**DDD layer:** interface (`apps/mcp-server/src/interface/mcp/tools/system/coordination/dispatchPreflightTool.ts`, new — Zod schema + registration, following the just-shipped per-tool-file split) + application (`apps/mcp-server/src/application/usecases/dispatchPreflight.ts`, new — composes the sub-operations, following the `getCycleBootstrap.ts` layering: usecase does the work, tool file is a thin `server.tool()` wrapper).

Signature per the brief's own `**Change**` text, refined against the live schema read this cycle:

```
dispatch_preflight(
  dispatcher_role: string,            // e.g. "router", "dev-team" — becomes owner_agent on every sub-claim
  owner_client_session: string,       // REQUIRED — $CLAUDE_CODE_SESSION_ID, sole ownership key (unchanged invariant)
  register_presence: boolean = true,  // Step 0a toggle — see EC-6
  claim_task_id?: string,             // if supplied, attempt Phase B claim (see FR-5 — generalized name, not "intent_task_id")
  claim_task_kind?: TaskKind = "intent", // defaults to router's own use case; see FR-5
  claim_ttl_seconds?: number,         // defaults per existing task_claim bounds (min 60 / max 691200)
  claim_payload?: string              // optional JSON, same convention as task_claim's own `payload`
) → {
  presence: { status: "registered" | "renewed" | "error", error?: string },
  orphans: LockRow[],                 // task_list_held(kind="orphan-signal", owner_agent=dispatcher_role) — unfiltered further; branch logic stays client-side (EC-8)
  roster: LockRow[],                  // task_list_held(kind="session-presence") — unchanged semantics from Phase A.5
  claim: { attempted: boolean, claimed?: boolean, current_holder?: CurrentHolder, error?: string } | null,  // null iff claim_task_id omitted
  elapsed_ms: number,
  sub_call_timings: { presence_ms, orphans_ms, roster_ms, claim_ms }
}
```

Internally, the usecase calls the **existing, unmodified** `claimTask`/`heartbeatTask`/`listHeldTasks` functions from `coordinationStore.ts` in-process (no new SQL, no new DB functions for V1 — see NFR-1). This is purely a compositor: it eliminates 4 MCP round-trips (Step 0a claim/heartbeat, Phase A `task_list_held`, Phase A.5 `task_list_held`, Phase B `task_claim`/`task_heartbeat`) down to 1, without changing what data is fetched or what locks are taken.

### FR-2 — Step 0a equivalent: presence claim-or-renew (in-process, first sub-step)
**DDD layer:** application (orchestration order inside the new usecase) + infrastructure (reuses `claimTask`/`heartbeatTask` verbatim).

Reproduce `dispatch-claim/SKILL.md` §Step 0a exactly: `task_id = "session-presence:" + owner_client_session`, `task_kind = "session-presence"`. If `claimTask` returns `claimed:true` → `presence.status = "registered"`. If `claimed:false` and `current_holder.owner_client_session === owner_client_session` (impossible-collision-except-self, per the SKILL's own note that this branch can only mean re-entrant) → call `heartbeatTask` → `presence.status = "renewed"`. Any other outcome is logged as the documented WARN (env misconfig) but **must not** fail the overall call — presence is advisory (P2 INVARIANT, §Non-Adoptable note in `dispatch-claim/SKILL.md`) and **never a gate**, restated as a hard AC here: a `presence.status = "error"` MUST NOT prevent `orphans`/`roster`/`claim` from executing and returning normally.

### FR-3 — Phase A equivalent: orphan-signal probe (read-only)
**DDD layer:** application (orchestration) + infrastructure (reuses `listHeldTasks` verbatim).

`listHeldTasks({ kind: "orphan-signal", owner_agent: dispatcher_role })` — byte-identical semantics to today's `task_list_held(kind="orphan-signal", owner_agent=<role>)` call. **No new filtering, no board-state guard, no escalation logic inside this tool** — see EC-8/non-goal below. The per-signal branch table (redispatch_count check, board-state guard, adopt-claim, escalation heartbeat) remains 100% client-side, exactly as it is today; this FR only removes the round-trip, not the decision logic.

### FR-4 — Phase A.5 equivalent: presence roster read (read-only)
**DDD layer:** application (orchestration) + infrastructure (reuses `listHeldTasks` verbatim).

`listHeldTasks({ kind: "session-presence" })` — unfiltered, matching today's Phase A.5 read. Always included in V1 (see EC-1 for the I15-driven "skip when advisory-only" option, flagged as architect-decidable, not mandatory).

### FR-5 — Phase B equivalent: optional lock claim, generalized beyond `intent:`
**DDD layer:** application (orchestration) + infrastructure (reuses `claimTask` verbatim).

The brief's own signature names this param `intent_task_id?` (implying `task_kind="intent"` is hardcoded). Recommend **generalizing to `claim_task_id?` + `claim_task_kind?` (defaulting to `"intent"`)** for near-zero marginal cost (the underlying `claimTask()` already takes `task_kind` as a parameter — no new server logic, just not hardcoding the enum value in the new tool's schema). Rationale: this keeps V1's **cutover scope** exactly router-only (per §0's already-settled PO scope note — CLAUDE.md/dispatch-claim only, this wave), while not foreclosing a **future, separately-decided** widening to dev-team's own fire-election claim (`cron:<flow-slug>:<TICK>`, `task_kind="sprint-task"`) reusing the *same* tool instead of building a second compositor later. If `claim_task_id` is omitted, `claim` in the response is `null` and no claim/steal/heartbeat attempt is made — supports callers that only want presence+orphan+roster (e.g., a mid-session refresh with no new dispatch pending).

When a claim IS attempted: reproduce the existing 3-outcome semantics from `dispatch-claim/SKILL.md` Pattern verbatim — `claimed:true`; `claimed:false` + `current_holder.owner_client_session === owner_client_session` (self-held, re-entrant — **the tool should itself call `heartbeatTask` in this branch and report `claim.claimed:false` with `current_holder` populated**, so the caller's existing 3-outcome table still works unmodified downstream, matching the P4 verifier's caveat 2 requirement); `claimed:false` + peer session (return `current_holder` as-is, caller does the EXIT/telegram). **The composite tool does NOT decide to spawn — that decision and the peer-collision telegram stay entirely client-side** (P4 verifier caveat 4).

### FR-6 — Composite return contract: partial-failure semantics differ for reads vs. writes
**DDD layer:** application.

Follow `getCycleBootstrap`'s per-slot timing + error envelope for the two **read** sub-calls (`orphans`, `roster`) — a failure in one must not blank out the other (`Promise.allSettled` pattern, reused verbatim). The two **write** sub-steps (`presence`, `claim`) cannot use silent partial-degradation the same way: `claim.claimed`/`current_holder` is the field the caller's spawn-or-EXIT branch is conditioned on, so its `ok`/`error` semantics must be unambiguous and propagate the exact `ClaimResult` shape `claimTask()` already returns (no new truncation/summarization). AC: unit test asserting that an `orphans` or `roster` fetch error does not null out `claim`'s result, and vice versa (all 4 sub-steps are independent failure domains).

### FR-7 — Rollout: individual tools stay live, docs cut over gated on integration test
**DDD layer:** interface (doc layer — `CLAUDE.md`, `.claude/skills/dispatch-claim/{CARD.md,SKILL.md}`).

Per the brief's own Risk note: *"Keep individual tools intact for non-router callers. Gate behind live integration test (claimed:true round-trip) before flipping docs."* `task_claim`/`task_heartbeat`/`task_list_held`/`task_release` are used by many non-router callers (cowork-team slot claims, published-marker gates, commit-mutex, etc. — confirmed live via `dispatch-claim/SKILL.md`'s own namespace table) that must NOT be migrated to the composite tool; only the router's CLAUDE.md step 2.5 + `dispatch-claim` Phases 0a/A/A.5/B cut over. Exact edit targets once the tool is live-verified: `CLAUDE.md` §"BEFORE spawning any agent" (currently the 5-line pointer P5 shipped), `.claude/skills/dispatch-claim/CARD.md` (all 4 phase blocks collapse to 1 call + 1 branch table), `.claude/skills/dispatch-claim/SKILL.md` (Pattern section + Step 0a + Phase A.5 sections become "superseded by `dispatch_preflight` — see CARD.md" pointers, historical Phase A/A.5/B pseudocode either deleted or marked legacy-fallback). See §5 Q1 for whether this cutover ships in the same wave as the tool.

### FR-8 — SSOT sync
**DDD layer:** infrastructure (cross-cutting registry).

`docs/data/tool-registry.json` (`totalCount: 183` today) needs a new `dispatch_preflight` entry in the `system` group (same group as the other 5 coordination tools, confirmed live — `task_claim`/`task_heartbeat`/`task_list_held`/`task_release`/`task_force_release_orphan` all sit in `groups[11].name == "system"`), `totalCount` incremented to 184. `.describe()` prose on the new tool must state explicitly that it does **not** replace the 5 existing tools for non-router callers (per FR-7), avoiding the drift class `feedback_ssot_toolcount_drift` and `feedback_preclaim_gate_taskkind_enum_drift` both warn about.

### FR-9 — Tests
**DDD layer:** infrastructure (test layer).

No existing test file covers a compound coordination tool. Recommend `apps/mcp-server/src/application/usecases/__tests__/dispatchPreflight.test.ts` (mirroring `coordinationStore.test.ts`'s just-added sibling convention, commit `8af71e8c2`) covering at minimum: (1) fresh session → `presence.status="registered"`, `claim.claimed=true` when `claim_task_id` supplied and free; (2) re-entrant same-session call → `presence.status="renewed"`, `claim.claimed=false` + `current_holder.owner_client_session` equals caller's own session (self-held branch); (3) peer-held `claim_task_id` → `claimed:false` + `current_holder.owner_client_session` is the PEER's session, distinguishable from (2); (4) `claim_task_id` omitted → `claim === null`, other 3 fields still populated; (5) FR-6 independence — inject a DB error on ONE sub-call (mock/stub), assert the other 3 still return normally; (6) `db_unavailable` refuse-all mode (existing module-level flag) propagates to all 4 sub-results consistently, none silently defaults to a misleading success shape.

**Domain layer:** none of the above touch `domain/services` — consistent with `coordinationStore.ts`'s own file-header layer declaration ("infrastructure/db — SQLite access only, no domain imports") and the sibling `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD-BA-spec.md`'s identical finding for this same module family.

---

## 2. Edge Cases

- **EC-1 (architect-decidable, not mandatory):** `router-dispatch-locking-I15` observes Phase A.5's roster read fires on every dispatch though it's purely advisory; a sibling `router-dispatch-locking-P15` (UNVERIFIED, not board-minted) proposes demoting it to "fire only on Phase B collision or adoption." FR-4 keeps the roster read unconditional in V1 (matches the brief's own literal `**Change**` signature — no `include_roster` toggle proposed there); flag to architect whether to add a toggle now (near-zero marginal cost, same pattern as `register_presence`) or defer to whenever/if P15 is separately minted.
- **EC-2 — presence must never gate (restated as a hard AC, not new):** see FR-2. A caller must be able to trust that `orphans`/`roster`/`claim` are attempted and returned regardless of `presence.status`.
- **EC-3 — self-held vs. peer-held claim must remain distinguishable:** the composite response's `claim.current_holder.owner_client_session` field is load-bearing — this is the exact distinction CLAUDE.md's OLD condensed copy dropped (per `router-dispatch-locking-I5`, already fixed by `UC-RDL-P5`) and the P4 brief's own verifier explicitly calls out as a caveat the composite design must not re-lose. AC: an integration test asserting `current_holder` is present and session-comparable in both the self-held and peer-held cases (FR-9 items 2/3).
- **EC-4 — writes can't use the same partial-failure model as reads:** see FR-6. Do not let a `Promise.allSettled`-style "return null + log error" shape leak into the `claim` field — an ambiguous `claim` result that the caller misreads as `claimed:false` (peer) when it was actually a DB error would cause a false-peer EXIT (the exact failure class `router-dispatch-locking-I5`/memory `feedback_devteam_preflight_sf1_not_reentrant_false_peer` already documents for the old condensed CLAUDE.md copy) or, worse, a caller that treats a DB error as "safe to skip" and silently drops a dispatch. `claim` must carry an explicit `error` field distinct from `claimed:false`.
- **EC-5 — `intent:` orphans structurally don't exist (I4, re-confirmed live this cycle):** `ORPHAN_EMIT_ALLOW_LIST` in `coordinationStore.ts:460-465` is `["sprint-task", "cowork-slot", "cron-tick-with-published-checkpoint", "dashboard-row"]` — `"intent"` is explicitly and permanently excluded (comment at :441: *"transient router pre-claim gate — NOT adoptable work"*). A router-scoped `dispatch_preflight(dispatcher_role="router", ...)` call's `orphans` array will empirically be **empty by construction** for pure intent-dispatch sessions — this is expected, not a bug, and matches the already-CONFIRMED `router-dispatch-locking-I4` finding. Do not "fix" this inside the new tool; it is the correct, documented behavior of the underlying allow-list.
- **EC-6 — `register_presence=false` use case:** a caller that already freshly registered presence this tick (e.g., calling `dispatch_preflight` twice in quick succession for two different `claim_task_id`s within the same dispatch cycle) should be able to skip the presence sub-step entirely rather than pay a redundant heartbeat. When `false`, `presence` in the response is `{status: "skipped"}`.
- **EC-7 — `FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS` is NOT a functional dependency of V1:** verified this cycle — none of FR-1..FR-6 above call `task_heartbeat` with `payload_patch`/`ttl_seconds`/`owner_agent` (those params only matter for the ESCALATION branch, which stays 100% client-side per FR-3/P4-verifier-caveat-4). Initial hypothesis (before reading the live `taskHeartbeatTool.ts` schema this cycle) was that this composite tool would need that sibling's new heartbeat params — **confirmed false**; the only heartbeat call this tool makes is the plain 2-arg renewal (Step 0a re-entrant / FR-5 self-held branch), which has been supported since before this ticket existed. Recorded here so architect doesn't have to re-derive this. Kept as a **sequencing** (not functional) consideration in §5 Q2 because both changes share the same container-rebuild gate.
- **EC-8 (explicit non-goal, scope boundary):** the board-state guard (lane/status classification of an orphan-signal's `original_task_id` against `docs/data/orch/orch-state.json` `.task_board`) is **out of scope for this tool**, even though server-side precedent for reading `orch-state.json` from inside the `apps/mcp-server` container already exists (`orchestrationHandler.ts` §OSC-4a serves a read-only projection; `tasksMdJanitorJob.ts` already reads `.task_board`/`.head` for reconciliation) and the volume mount (`./docs/data/orch:/app/docs/data/orch`) already grants filesystem access. That guard is `router-dispatch-locking-P3`'s already-shipped fix (§0), lives entirely in flow-doc/client-side branch logic today, and folding it server-side would (a) roughly double this task's effort past its current `L` sizing, (b) re-open a section that just shipped and was RAW-verified, and (c) blur the "coordination lock mechanics" vs. "orch-state.json board semantics" module boundary that `coordinationStore.ts`'s own file header explicitly disclaims ("no domain imports"). Flagged explicitly so architect does not accidentally scope-creep this into a P3 re-implementation.
- **EC-9 (explicit non-goal):** the brief's own verifier caveat (1) already flags that `router-dispatch-locking-I18`'s "re-read the 110L dispatch table before every spawn" motivation is real but **not fixable by an MCP tool** (it's a markdown-file re-read cost, not a coordination-lock round-trip) — a separate `router-dispatch-locking-P18` (per-session caching, UNVERIFIED) targets it. Do not fold dispatch-table caching into this tool's scope.
- **EC-10 — deployment gate:** per standing policy, the new tool is inert until an explicit user-gated `apps/mcp-server` container rebuild — route that step to `ops`, not self-executed (`feedback_user_gates_delegate_to_ops`, `feedback_container_swaps_user_gated`).

---

## 3. Non-goals (explicit, to bound the L-effort scope)

1. No board-state guard / orphan-adoption decision logic server-side (EC-8) — stays client-side, unchanged from today.
2. No dispatch-table caching (EC-9) — separate proposal if pursued.
3. No migration of cowork-team's or dev-team's own preflight callers in this wave (already PO-settled, §0) — only the CLAUDE.md-step-2.5/router-scope caller migrates, and only after live verification (FR-7, §5 Q1).
4. No change to `claimTask`/`heartbeatTask`/`listHeldTasks`/`releaseTask` themselves — this is a pure compositor over existing, unmodified infrastructure functions.

---

## 4. Coordination notes

- Do not duplicate or re-open `router-dispatch-locking-P3`'s already-shipped board-state guard (§0, EC-8) — cross-reference, don't re-implement.
- `FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS` (sibling sprint `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD`, currently `.task_board.review[]`) touches the **same directory** (`apps/mcp-server/src/interface/mcp/tools/system/coordination/`) this task will add a new file to. No code-level collision expected (different files: it edits `taskHeartbeatTool.ts`/`taskReleaseTool.ts`; this task adds `dispatchPreflightTool.ts`), but both want a container rebuild before their respective docs/behavior can be called "live" — see §5 Q2 for whether to batch the two rebuilds.

---

## 5. Blockers (PO)

**Q1 — Cutover sequencing / DoD.** Per the brief's own Risk note ("gate behind live integration test... before flipping docs"), should this SPRINT-M's DONE bar require the **full cutover** (CLAUDE.md + dispatch-claim CARD.md/SKILL.md rewritten to call `dispatch_preflight`, old 4-call pattern retired for the router) in the same wave as the tool shipping — or should the row close once the tool ships + passes a live integration round-trip (`claimed:true`/re-entrant/peer-collision all reproduced against the running container), with the CLAUDE.md/dispatch-claim doc cutover spun into an explicit, linked follow-up? CLAUDE.md is always-loaded fleet-wide context (every agent, every spawn) — flipping it before the tool has been exercised live is the same class of blast-radius call PO already made explicitly on sibling `router-dispatch-locking-P5`'s Risk note ("verify the replacement keeps EXIT semantics verbatim"). This is a governance/DoD-scope call, not an engineering one (BA charter boundary).

**Q2 — Rebuild sequencing with `FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS`.** That sibling sprint's server-side change is code-complete + tested but sits in `review[]`, `next_agent: developer`, not yet QA-verified or containerized (§0, §4). Both it and this task land in the same `apps/mcp-server` container and both require a user-gated rebuild before their behavior is callable. Should this task's implementation be sequenced to land **after** that sibling reaches `DONE_VERIFIED` + rebuild (one combined rebuild covering both coordination-tool changes, lower ops cost, precedent: this row's own note already asked to coordinate with `UC-RDL-P1` landing first for exactly this reason) — or proceed independently since §0/EC-7 confirms this task has **no functional dependency** on that sibling's new heartbeat params? Recommend defaulting to "coordinate the rebuild, not the implementation" (design/build UC-RDL-P4 now, hold the actual container rebuild until both are ready) unless PO has a reason to want it faster — flagging as a blocker rather than assuming, since sequencing calls on this exact row have twice already been PO's to make (UC-RDL-P1, the 2026-07-15 cowork-scope adjudication).

No other PO-level blockers — the remaining decisions (FR-1's exact response field naming, FR-5's `claim_task_kind` generalization, EC-1's roster-toggle, FR-7's precise line-level doc edits) are architect-decidable engineering scope, not business/priority calls.

---

## 6. Recommended fix set for architect (file : change)

| # | File | Change |
|---|------|--------|
| 1 | `apps/mcp-server/src/application/usecases/dispatchPreflight.ts` (new) | FR-1/FR-2/FR-3/FR-4/FR-5/FR-6 — compositor usecase, layered per `getCycleBootstrap.ts` precedent |
| 2 | `apps/mcp-server/src/interface/mcp/tools/system/coordination/dispatchPreflightTool.ts` (new) | FR-1 — thin `server.tool()` Zod wrapper, registered in `coordinationTools.ts` alongside the other 6 |
| 3 | `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` | Add `registerDispatchPreflightTool(server)` call; bump the "6 MCP tools" header comment to 7 |
| 4 | `apps/mcp-server/src/application/usecases/__tests__/dispatchPreflight.test.ts` (new) | FR-9 |
| 5 | `docs/data/tool-registry.json` | FR-8 — new entry, `system` group, `totalCount` 183→184 |
| 6 | `CLAUDE.md`, `.claude/skills/dispatch-claim/CARD.md`, `.claude/skills/dispatch-claim/SKILL.md` | FR-7 — gated behind §5 Q1's PO ruling; do NOT edit until the live integration test passes (or PO explicitly approves same-wave cutover) |

No domain-layer file in scope. No change to any of the 5 existing coordination tools' schemas or behavior (FR-7 non-goal 4).

---

## RETURN
DONE: BA spec complete — 9 FRs + 10 edge cases + 4 explicit non-goals mapped to DDD layers, grounded in live re-read of `coordinationStore.ts`/`coordinationTools.ts` (post-split), `dispatch-claim/{CARD.md,SKILL.md}`, and confirmed status of all 4 sibling UC-RDL rows (P1 DONE_VERIFIED, P3 folded+shipped, P5 DONE_VERIFIED, P7 unrelated files). 2 PO blockers (§5 — cutover DoD sequencing, rebuild-batching sequencing with the FIX-ORPHAN-FR2-FR6-FR7 sibling).
NEXT: po — resolve Q1/Q2, then architect (brownfield design + file-level ratification of FR-1..FR-9, DDD layer confirmation, EC-1/FR-5 architect-decidable calls).
HANDOFF: docs/handoffs/UC-RDL-P4-BA-spec.md
PIPELINE: continue (supervised — do not auto-advance past PO)
