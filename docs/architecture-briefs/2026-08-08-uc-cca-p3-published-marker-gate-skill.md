# UC-CCA-P3 — Published-Marker Lifecycle — Technical Design

**Task ID:** UC-CCA-P3 (P0, umbrella) · **Agent:** architect · **Date:** 2026-08-08
**Input:** `docs/handoffs/UC-CCA-P3-BA-spec.md` (BA spec, FR-1..FR-6, PO's 6 ACs, blocker B1, open
questions Q-send-fail/Q-gate-overlap/Q-skill-siting/Q-no-bash/Q-taskkind), plus 2 sibling briefs:
`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` (Component A
window-anchor, Component B procedural release gate) and
`docs/architecture-briefs/2026-08-07-chef-midflow-bail-determinism-guard.md` (Layer 1 in-flow
recovery, Layer 2 system-auditor orphan sweep).

---

## 0. Scope discipline

This brief designs FR-1/FR-2/FR-3/FR-5 in full and FR-4's *consumption contract only* (FR-4's
propagation mechanics are out of scope — already designed on `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` /
Component A, per BA spec). FR-6 is informational, no design needed. B1 is PO-only — §9 documents
both paths, does not pick one.

---

## 1. Brownfield Findings (all verified live this cycle, not inherited from the BA spec)

**Zone:** multi — `docs/agents/unified-agent/flow/` (chef.md, chef-dish.md, chef-telemetry.md),
`docs/agents/alert-commander/flow/stage-dispatch-log.md`, `docs/agents/bctc-analyst/flow/stage-log-notify.md`,
`docs/agents/fb-market-poster/flow/daily.md`, `docs/agents/digest-predict/flow/` (main.md, daily.md,
weekly.md), `docs/agents/tran-ngoc-bau/flow/` (main.md, auto-cure-and-handoff.md),
`docs/agents/cowork-team/flow/spawn-fanout.md`, `.claude/skills/` (new skill), and — only if FR-5 is
adopted — `apps/mcp-server/` (`dev-mcp-server`'s zone). PM must split the flow-doc track from the
`apps/mcp-server/` track (different specialists); see §9 Path A/B.

### 1.1 The 6 gates — exact current shape (re-verified, not assumed from BA spec prose)

| # | Gate | Claim file:line | Send file:line | Pattern today |
|---|---|---|---|---|
| 1 | chef (4 slots) | `chef.md:108-119` (Step 0.5) | `chef-dish.md:386` (Block A market), `:404` (Block B work) | **EARLY** — claims before Step 0 GATHER, ~650L/6 files before send |
| 2 | alert-commander | `stage-dispatch-log.md:33` | `stage-dispatch-log.md:38` | **LATE** (precedent) — 5 lines before send |
| 3 | bctc-analyst | `stage-log-notify.md:40-41` (5d-1) | `stage-log-notify.md:53` (5e, WORK only) | **LATE** (precedent) — but `task_kind:"sprint-task"`, not `"cowork-slot"` |
| 4 | fb-market-poster | `daily.md:51-57` (STEP 0a) | **no `send_telegram(market)` exists** — publish action is `daily.md:783-803` STEP 5 `Write(docs/social/fb-post-{DATE}.md)` | **EARLY** — claims before STEP 1 data-gather; publish action is a file write, not a Telegram send |
| 5 | digest-predict | `main.md:48-54` (daily), `main.md:100-106` (Sunday) | `daily.md:77`, `weekly.md:78` | **EARLY** — claims in `main.md` before the Dispatch table hands off to `daily.md`/`weekly.md` |
| 6 | tran-ngoc-bau | `main.md:53-66` | `auto-cure-and-handoff.md:15` (Step 7) | **EARLY** — claims before 4 audit phases (`audit-market.md`, `audit-signals.md`, `audit-methodology.md`, `audit-chef-coverage.md`) run |

Corroborates BA spec verbatim: 4/6 EARLY-claim (chef, fb, digest, tnb), 2/6 already LATE
(alert-commander, bctc-analyst). New findings beyond the BA spec:

- **fb-market-poster has no MARKET `send_telegram` call anywhere in its flow.** Its actual
  irreversible publish action is the STEP 5 file `Write`. Any Phase-2 wiring instruction phrased as
  "immediately before `send_telegram`" is wrong for this one gate — generalized in §3 as "immediately
  before the flow's own irreversible publish action."
- **chef-dish.md:19-20 already documents session-state inheritance from chef.md ("...plus the session
  state accumulated in chef.md Steps 0.5/0/1 (signal groups, qualifying clusters,
  **published-marker claim**)")** — i.e. today's design deliberately completes the claim in chef.md
  before chef-dish.md is even entered. Moving Phase 2 into chef-dish.md is therefore a **new
  cross-file threading requirement**, not a same-file relocation like the other 5 gates — flagged as
  a risk in §10 with the exact line to edit.
- **`task_list_held` has no `task_id` filter** (only `kind`/`owner_agent`/`expired` —
  `coordinationTools.ts:225-241`, verified live read). Phase 1's read-only probe must fetch
  `kind="cowork-slot"` and scan client-side for `task_id == MARKER_KEY` — this is a real API-shape
  constraint the skill must document explicitly, not an implementation detail to discover later.
- **`digest-predict/flow/monthly.md`** also contains a `send_telegram(channel="market", ...)` call
  (line 41) but `digest-monthly` is not a registered slot in `docs/data/cowork-schedule.json`
  (confirmed: only `digest-sunday`/`digest-daily` exist) — dead/unscheduled code path, out of scope
  for FR-3's wiring (not one of the BA spec's confirmed-live 6 gates); flagged for a future
  code-janitor pass, not actioned here.

### 1.2 `coordinationTools.ts` / `coordinationStore.ts` (FR-5 target)

- `releaseTask()` (`coordinationStore.ts:888-935`) and `releaseOrphanTask()`
  (`coordinationStore.ts:1000+`) both DELETE unconditionally on an owner-match — confirmed **zero**
  `published:`-prefix check exists today, matching the BA spec's own finding.
- `ReleaseResult` (`coordinationStore.ts:391-393`) = `{ok:true, released:0|1} | {ok:false, error?}` —
  no room for a refusal reason without an additive field.
- `OrphanReleaseResult` (`coordinationStore.ts:395-400`) **already has** `reason: string` — a
  zero-type-change extension point.
- `task_kind` enum (Zod, `coordinationTools.ts:90`) has exactly 7 members; `published:*` markers and
  `cron:*` election locks both currently sit under `task_kind:"cowork-slot"` with opposite release
  semantics — confirms the row's own "prefer a `task_id`-prefix guard over an 8th enum value" design
  constraint is the only option that touches zero call sites.

### 1.3 Reconciliation targets (both re-read in full this cycle)

- `2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` — Component A (window-anchor
  propagation, `scheduled_utc_time`, FR-4's dependency) and Component B (procedural release gate in
  `spawn-fanout.md`, delivery-evidence-conditioned). Confirmed via that brief's own §1: **zero live
  code paths call `task_release` on a `published:*` key today anywhere** — the only historical release
  was a 2026-08-06 **manual PO action**, a content-correctness judgment, not a delivery check.
- `2026-08-07-chef-midflow-bail-determinism-guard.md` — Layer 1 (in-flow degraded-floor widening,
  `chef-telemetry.md`) and Layer 2 (system-auditor orphan sweep, FOLLOW-UP-2). §5 of that brief
  already states its own release-call branches (§2.5, §3.2) **must invoke the Release Gate, never a
  raw `task_release`**, and stay a no-op/log-only stub in the interim. **Verified live this cycle:
  neither Layer 1 nor Layer 2 has landed yet** — `chef-telemetry.md`'s Try/Catch Boundary still reads
  "wraps Steps 0 through 7" (no Step-0.5 pin, no `§ Degraded-Floor Recovery` section) — that row is
  status `REVIEW`, plan-only, unimplemented. This UC-CCA-P3 design must stay compatible with it
  landing later, not assume it has.

---

## 2. DDD Layering

| FR | Layer | Realization |
|---|---|---|
| FR-1 (two-phase gate) | **domain** invariant (publish-state ⇒ marker immunity) realized as an **application**-layer skill | `.claude/skills/published-marker-gate/SKILL.md` |
| FR-2 (abort coverage) | **application** (flow-control contract) | Same skill; "never release" applies to every non-success exit uniformly |
| FR-3 (wire 6 gates) | **interface** (each flow file is the adapter) | 6 flow-doc edits (see §4 table) |
| FR-4 (key consumption) | **domain** (key identity = window) via **application** (skill parameter) sourced from **interface** (already-spec'd propagation) | Skill treats `MARKER_KEY` as an opaque caller-supplied string; zero re-derivation |
| FR-5 (code backstop) | **infrastructure** (`coordinationStore.ts`) enforcing a **domain** invariant expressed as a pure predicate | New `domain/services/publishedMarkerImmunity.ts` + 2-line guard at the top of each infra function |

---

## 3. FR-1/FR-2 — New skill: `.claude/skills/published-marker-gate/SKILL.md`

Structural draft (PM/dev-team to land verbatim, adjusting only the size-justification header per
`docs/policies/dev-standards.md`'s lazy-load convention):

```markdown
---
name: published-marker-gate
description: >
  Two-phase publish-once mutex for cowork guaranteed-slot agents. Phase 1 (cheap, read-only)
  aborts before the expensive pipeline if the window is already published. Phase 2 (commit
  point) claims immediately before the flow's own irreversible publish action and is NEVER
  released on success — TTL is the sole expiry path. Analogous in shape to commit-mutex/SKILL.md
  but AGENT-SIDE, not dispatcher-side (see spawn-fanout.md's own disclaimer, L115) — each of the
  6 cowork guaranteed-slot flows (chef, alert-commander, bctc-analyst, fb-market-poster,
  digest-predict, tran-ngoc-bau) invokes this directly via native call_tool, no Bash grant
  required (same call shape all 6 already use live today).
---

## Inputs (caller-supplied, never re-derived by this skill)
- `MARKER_KEY` (string) — window-anchored, timezone-free, per FR-4 (FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR
  Component A). This skill treats it as opaque — date-scoped, per-window, or ISO-week-period-scoped
  keys are all valid; never hardcode a shape here.
- `MARKER_TTL` (int, seconds) — caller-derived from slot cadence (single-fire 100800s / 28h;
  multi-fire = cadence; weekly ~691200s / 8d).
- `OWNER_AGENT` (string) — e.g. "unified-agent", "alert-commander".
- `OWNER_CLIENT_SESSION` (string) — resolved CLAUDE_CODE_SESSION_ID. REQUIRED. Substitute the ACTUAL
  value — never write the literal text "$CLAUDE_CODE_SESSION_ID" (preserves FR-6's already-shipped
  invariant, be3545412).

## Phase 1 — Cheap probe (OPTIONAL — only for flows with an expensive pre-publish pipeline to
protect: chef, fb-market-poster, digest-predict, tran-ngoc-bau. SKIP for alert-commander/bctc-analyst
— their pre-gate work is not conditioned on the dedup outcome, see design note below.)

Run at the flow's existing early gate point (unchanged location — this is a relocation of intent,
not of file/line):

```
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={ kind: "cowork-slot", owner_agent: OWNER_AGENT })
# task_list_held has NO task_id filter (verified coordinationTools.ts) — scan client-side:
HELD = PROBE.locks contains an entry where task_id == MARKER_KEY AND expires_at > now

if HELD:
  log "[<agent>] publish blocked (Phase-1 probe) — already held key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # claims NOTHING — a leak from this call is structurally impossible.
else:
  proceed with the flow's own gather/synthesis pipeline
```

## Phase 2 — Commit-point claim (MANDATORY, all 6 gates)

Place **immediately before** the flow's own irreversible publish action — `send_telegram` for 5 of
6 gates, the STEP-5 file `Write` for fb-market-poster. Not one step earlier (defeats FR-2), not
wrapped around synthesis (defeats the cost-optimisation Phase 1 exists for).

```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              MARKER_KEY,
  task_kind:            "cowork-slot",
  owner_agent:          OWNER_AGENT,
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds:          MARKER_TTL
})

if CLAIM.claimed != true:
  log "[<agent>] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # a peer claimed between this Phase-1 probe and this Phase-2 claim — do NOT send anything.
else:
  proceed immediately to the publish action (send_telegram / file Write)
  # NEVER task_release on success, and NEVER on ANY exit after this point — successful send,
  # failed send, exception, process death: all leave the marker in place. TTL is the SOLE
  # expiry path (AC-3; resolves Q-send-fail literally — see §7).
```

## Design note — why Phase 1 is optional per-gate
alert-commander and bctc-analyst already independently converged on LATE-claim-only (no separate
early probe) because their pre-gate work is not wasted on a dedup miss: alert-commander's
claim-truth-gate + snapshot always runs regardless of dedup outcome (its Firing Gate has already
decided fire/no-fire before this point); bctc-analyst's extraction is the core deliverable
independent of the WORK-channel notify this marker dedups. Retrofitting Phase 1 onto either would
add a call with no cost-optimisation benefit — skip it there, per the existing correct precedent.
```

**Design decision (dev-team's call at implementation time, not mandated here):** by the time Phase 2
fires in chef/digest-predict/tran-ngoc-bau, the full synthesis has already run even on a Phase-2 miss
(the peer-race window between Phase 1 and Phase 2). Recommend still persisting/logging the
already-synthesized content locally (synthesis JSON, notebook entry marked
`quality_verdict: duplicate_blocked` or equivalent) rather than discarding it — but do NOT send to
MARKET/WORK. This is a value-preserving suggestion, not an AC requirement; flag for PM to decide
scope.

---

## 4. FR-3 — Wiring table (all 6 gates, concrete diffs)

| # | Gate | Phase-1 file:line (unchanged location, defect claim → read-only probe) | Phase-2 file:line (NEW location) | Notes |
|---|---|---|---|---|
| 1 | chef | `chef.md:108-119` → replace `task_claim` with skill Phase-1 call | **NEW**: `chef-dish.md`, immediately before `:386` (Block A) — gates BOTH Block A + Block B (claim failure skips the whole Step 7, matching today's binary EXIT semantics) | Cross-file threading required — see §10 R1 |
| 2 | alert-commander | N/A (no Phase 1) | `stage-dispatch-log.md:33` — swap inline prose for skill pointer; verify `task_kind`/TTL already match skill contract (they do) | Cosmetic normalization only |
| 3 | bctc-analyst | N/A (no Phase 1) | `stage-log-notify.md:40-41` — swap inline prose for skill pointer; **`task_kind:"sprint-task"` → `"cowork-slot"`** (Q-taskkind, resolved YES — see §7) | task_kind migration, bounded ≤1h risk window (§7) |
| 4 | fb-market-poster | `daily.md:40-58` (STEP 0a) → replace `task_claim` with skill Phase-1 call; same for the weekend `published:fb-weekend:` variant | **NEW**: `daily.md`, immediately before `:791` (`Write(FILEPATH, ...)` in STEP 5) | PUBLISH_ACTION = file Write, not `send_telegram` — see §1.1 |
| 5 | digest-predict | `main.md:15-61` (daily) + `main.md:65-111` (Sunday) → skill Phase-1 calls | **NEW**: `daily.md:77`, `weekly.md:78` — immediately before each's own `send_telegram(market)` line | Cross-file: `main.md` probes, `daily.md`/`weekly.md` claim |
| 6 | tran-ngoc-bau | `main.md:15-71` → skill Phase-1 call | **NEW**: `auto-cure-and-handoff.md`, immediately before `:15` (Step 7 `send_telegram(work)`) | Cross-file: `main.md` probes, `auto-cure-and-handoff.md` claims |

**`chef-dish.md:19-20` diff (the specific cross-file threading fix for gate #1):** the "Input" line
currently reads "...plus the session state accumulated in chef.md Steps 0.5/0/1 (signal groups,
qualifying clusters, **published-marker claim**)" — must change to "...(signal groups, qualifying
clusters, **`MARKER_KEY`/`MARKER_TTL`/`OWNER_CLIENT_SESSION` from the Phase-1 probe — the Phase-2
claim itself now happens in this file, Step 7, immediately before Block A)".

**`spawn-fanout.md:84-121` diff (Q-skill-siting doc-debt cleanup, authorized under "detect then
reduce debt"):** trim the FR-P2-7 inline pattern comment block to a one-line pointer —
`See .claude/skills/published-marker-gate/SKILL.md — dispatcher does NOT call publish markers, the
spawned agent does (unchanged invariant).` — removes ~35L of now-duplicated prose that was the
original copy-paste source of the 4 EARLY-claim defect instances.

---

## 5. FR-4 — Key-agreement consumption contract (mechanics NOT designed here)

The skill's `MARKER_KEY` input is opaque and caller-derived — this design imposes exactly one
constraint on Component A's already-spec'd propagation
(`2026-08-06-...anchor-and-release.md` §2): whatever `scheduled_utc=<ISO8601>` parsing each flow's
Step-0.5-equivalent performs MUST complete **before** this skill's Phase 1 call (the probe needs the
final key, not a placeholder). This is naturally satisfied by construction — Phase 1 sits at each
flow's existing early gate point, which is exactly where Component A already lands the
`scheduled_utc=` parse (chef.md Step 0.5, and the generalized "each guaranteed slot's Step-0.5-
equivalent" per that brief's §2 point 4). No new sequencing risk introduced.

---

## 6. FR-5 — Code-enforced release-refusal backstop (ASSESS → verdict: adopt; see §7 Q-gate-overlap
for full reasoning; §9 for the B1 sequencing question this does NOT resolve)

**New file:** `apps/mcp-server/src/domain/services/publishedMarkerImmunity.ts`
```ts
/**
 * Domain invariant: a published:* task_id is release-immune once claimed.
 * SUCCEEDED publish -> immutable tombstone; TTL is the sole expiry path.
 * UC-CCA-P3 FR-5 (AC-CODE-GATE) — code-enforced backstop after 3x prose-gate oscillation
 * (07-02 release-after-publish, 07-03 release-on-no-post, 07-15 conditional-release-wrong-direction).
 */
const PUBLISHED_MARKER_PREFIX = "published:";

export function isPublishedMarkerTaskId(task_id: string): boolean {
  return task_id.startsWith(PUBLISHED_MARKER_PREFIX);
}
```

**Modify `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`:**
- `releaseTask()` (currently `:888-935`) — as the FIRST statement, before `getCoordinationDb()`:
  ```ts
  if (isPublishedMarkerTaskId(task_id)) {
    return { ok: true, released: 0, reason: "published_marker_immune" };
  }
  ```
  Extend `ReleaseResult` (`:391-393`) additively: `{ok:true, released:0|1, reason?: string} | {ok:false, error?:string}` — every existing caller already treats `released:0` as a legitimate no-op (per the function's own JSDoc), so this is non-breaking; `reason` is new, optional, additive.
- `releaseOrphanTask()` (currently `:1000+`) — same guard, same placement:
  ```ts
  if (isPublishedMarkerTaskId(task_id)) {
    return { released: false, reason: "published_marker_immune" };
  }
  ```
  `OrphanReleaseResult.reason` already exists (`:395-400`) — **zero type change** needed here.

**Design constraints honored (per the row's own stated preference, re-verified):**
- `task_id`-string-prefix guard, **not** a new `task_kind` enum member — zero Zod enum / SQLite
  CHECK / call-site changes (avoids `feedback_preclaim_gate_taskkind_enum_drift`).
- **Unconditional** — no evidence-check, no owner-check exception, no caller-supplied bypass flag.
  Applies to every caller identically: human-invoked, agent-invoked, or a future automated
  orphan-sweep (`FIX-CHEF-MIDFLOW-BAIL-DETERMINISM` §3.2). This is the ONE choke point; correctness
  does not depend on every caller remembering to check first.
- Placed at **infrastructure**, not interface — `coordinationTools.ts`'s two call sites
  (`:208`, `:320`) need **zero changes**; the guard is inside the store function both wrap, so it is
  impossible to route around via any current or future MCP tool built on the same store functions.

**Test strategy:** new `coordinationStore.test.ts` cases (or extend existing suite if present) —
(1) claim `published:test:<key>`, `releaseTask` with the correct `owner_client_session` → assert
`{ok:true, released:0, reason:"published_marker_immune"}`, NOT `released:1`; (2) same key, stale
heartbeat, `releaseOrphanTask` → assert `{released:false, reason:"published_marker_immune"}` even
though the heartbeat genuinely IS stale (proves the guard fires **before** the orphan-staleness
check, unconditionally); (3) negative control — a `cron:*`-prefixed or `sprint-task`-kind lock with
identical staleness still releases normally (proves the guard is scoped to the `published:` prefix
only, zero regression on unrelated lock classes).

---

## 7. Open Questions — Architect-owned, resolved

**Q-send-fail — RESOLVED: never release, no exception, literally, even on a demonstrable
`send_telegram` tool-error return.**
Reasoning: (1) matches PO's "never release" framing, repeated verbatim across 3 separate row notes on
this task; (2) is the *only* answer internally consistent with FR-5 as specified — a narrow
conditional-release exception coded into the flow-doc layer would be refused by FR-5 at the
infrastructure layer anyway once it ships, so specifying one anywhere is dead prose from day one;
(3) the row's own `abort_path_ac_extended` note already states this outcome explicitly for the
adjacent 07-17 leak case ("the AC-CODE-GATE release-refusal backstop... guards the WRONG direction
for THIS leak — the leak is prevented by the late-claim redesign, not the release guard") — same
logic applies here: FR-1/FR-2's late-claim design is what shrinks the exposure window to "near-zero,"
not a conditional release rule at the new choke point, which would just relocate the exact
oscillation this task exists to end. Flow-doc language for FR-2: "regardless of exit reason after a
successful Phase-2 claim — successful send, failed send, exception, process death — never call
`task_release`." Residual risk accepted: a rare stuck tombstone, self-healing via TTL (28h for
single-fire, one cadence period for multi-fire) — smaller blast radius than any of the 4 confirmed
historical incident classes.

**Q-gate-overlap — RESOLVED: FR-5 is canonical; Component B is scoped down to diagnostic/escalation
documentation, never an actual release path.**
Once FR-5 ships, Component B's §3 step-3 branch ("BOTH absent → release is safe, proceed") is
permanently unreachable — `task_release`/`task_force_release_orphan` both refuse unconditionally
regardless of what the delivery-evidence check concludes. This must be an explicit edit to that
brief's §3, not left as stale-but-technically-true prose: step 3 becomes *"BOTH absent → this is a
genuine leaked tombstone. There is no automated or human release path once FR-5 ships — escalate via
BUG telegram + signal for PO visibility. Remedy is TTL expiry only, or a deliberate, audit-logged,
out-of-band DB intervention outside the MCP tool surface (never a normalized, agent-invocable call)."*
The delivery-evidence check itself (§3 steps 1-2) is **repurposed, not deleted** — it remains the
correct mechanism for *classifying* why a marker is held (genuinely leaked vs. genuinely published —
exactly the classification the 08-06 manual release got wrong), now advisory rather than gating an
actual release action. `docs/protocols/dwf-ops-runbook.md` § Published Marker Interaction and the
`spawn-fanout.md` Release Gate block (once `FIX-CHEF-PUBLISHED-MARKER-RELEASE` lands) must both carry
this reconciliation note. **Same reconciliation applies to `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM` §3.2's
future system-auditor orphan sweep** (FOLLOW-UP-2, unimplemented) — that detector must FLAG only,
never attempt a release call, once FR-5 ships; flagged here for whoever implements that row
(agent-father) to cross-reference.

**Q-skill-siting — RESOLVED: genuinely agent-side, confirmed by direct re-read this cycle.**
`spawn-fanout.md:115` ("The publisher owns the marker — the dispatcher (this flow) does NOT call
publish markers") is the disclaimer BA spec cited; re-verified live at that exact line. The FR-P2-7
block (`spawn-fanout.md:84-121`) is documentation/pattern-reference only — it was never itself an
invocable gate, and is in fact the **original copy-paste source** the 4 EARLY-claim defect instances
were cloned from. New skill home confirmed: `.claude/skills/published-marker-gate/SKILL.md`,
referenced identically from all 6 flow files. `spawn-fanout.md` itself is trimmed to a 1-line pointer
(§4).

**Q-no-bash — RESOLVED: already satisfied by construction, confirmed by live historical evidence.**
`feedback_local_cowork_subagents_gateway_blind.md` (2026-07-07 entry) records `unified-agent`
(chef, **no Bash grant**) successfully calling `task_claim` natively at Step 0.5 in the currently-live
design — i.e. all 6 gates today already invoke `task_claim`/`task_list_held` via plain
`call_tool(...)` prose, zero Bash, `bctc-analyst` included. The new skill is a straight extraction of
an already-proven, already-Bash-free call pattern — same prose+call_tool shape as
`decision-journal`/`notebook-write`. No new capability required.

**Q-taskkind — RESOLVED: yes, normalize `bctc-analyst` to `"cowork-slot"` as part of FR-3.**
Matches all other 5 gates; avoids permanently special-casing 1/6 adopters inside the shared skill's
contract; un-blocks a clean `task_list_held(kind="cowork-slot")` sweep across every live
`published:*` marker (today, `bctc-analyst`'s markers are invisible to that exact query shape — the
future system-auditor orphan sweep from `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM` §3.2 would silently miss
them entirely if left as `"sprint-task"`). **Migration risk (bounded, self-healing):** an in-flight
`sprint-task`-kind marker claimed under the old kind remains functionally correct for
`bctc-analyst`'s own dedup for its remaining TTL (3600s = 1h, the shortest of all 6 gates — no
migration script needed, natural drain within 1h of the flow-doc cutover landing). The only residual
gap is an external cross-kind query (e.g. a future orphan sweep) missing that marker for ≤1h — low
severity, not a correctness break for `bctc-analyst`'s own gate.

---

## 8. Reconciliation summary (both sibling briefs)

- **`2026-08-06-...anchor-and-release.md`:** Component A unchanged, consumed as-is (§5). Component B
  reconciled per Q-gate-overlap above — scoped down from "a release path" to "diagnostic + escalation
  runbook," pending FR-5's fate (§9).
- **`2026-08-07-...midflow-bail-determinism-guard.md`:** unchanged design, confirmed still compatible.
  Its own §5 already states its release-call branches must be no-op/log-only stubs until "UC-CCA-P3's
  Release Gate" ships — this design supplies that gate as FR-1/FR-2 (claim-timing structurally
  shrinks the leak window) + FR-5 (code-level unconditional refusal, if adopted). Once both land, that
  row's §2.5 true-abort fallback and §3.2 orphan sweep should call `send_telegram(channel="bug", ...)`
  to flag, and never attempt `task_release` at all (superseding its own "invoke the Release Gate"
  language, since the Release Gate under this design never actually releases anything — see
  Q-gate-overlap). Flagged for agent-father (that row's implementer) to pick up when FOLLOW-UP-1/2
  land; not actioned in this row's own scope.

---

## 9. B1 (PO-only blocker) — NOT resolved here, both paths documented

**Path A — single wave.** UC-CCA-P3 closes DONE only once FR-1/FR-2/FR-3/FR-4 (flow-doc + skill,
`docs/agents/` + `.claude/skills/`) **and** FR-5 (`apps/mcp-server/src/domain/services/` +
`infrastructure/db/coordinationStore.ts`) all ship together. PM decomposes into ≥2 parallel dev-team
tracks under one sprint-close gate: a flow-doc track (no dev-* zone needed — pure markdown) and a
`dev-mcp-server` code track (TypeScript). Gives AC(3) ("no agent can release") a **hard** guarantee
immediately upon close.

**Path B — deferred sibling.** UC-CCA-P3 closes DONE on FR-1/FR-2/FR-3/FR-4 alone. FR-5 spins off as
a new sibling row (suggested id `FIX-PUBLISHED-MARKER-RELEASE-CODE-GATE`, P1, `dev-mcp-server`,
zone `apps/mcp-server/`). Interim control: Component B's **original** conditional procedural gate
(not yet scoped-down per §7 — that reconciliation itself becomes conditional on which path is chosen)
stands as the only release-immunity control until the sibling lands. Gives AC(3) a **soft**
(procedural) guarantee at close, hard guarantee later.

Architect's non-binding observation (does not decide): this row is P0 specifically because
prose-only/procedural fixes have already oscillated across 4 distinct incident classes since
2026-07-02 — Path A closes that residual risk immediately; Path B re-opens (even if narrower than
before) the same class of risk this task exists to end, for however long the sibling row sits in
backlog. This is flagged for PO/router, not decided here, per the task's explicit instruction.

---

## 10. Risk Flags

- **R1 (chef cross-file threading, DDD-adjacent):** chef-dish.md:19-20 currently documents the
  published-marker claim as already-complete session state inherited from chef.md. This design
  requires threading `MARKER_KEY`/`MARKER_TTL`/`OWNER_CLIENT_SESSION` forward instead (Phase-1-only
  state), with the actual claim now happening inside chef-dish.md. If dev-team misses this and
  Phase 2 is (re)placed back in chef.md "for convenience," the whole FR-1/FR-2 redesign silently
  regresses to the EARLY-claim defect pattern — flag as a MANDATORY verification item in QA/dev
  review, not just a doc nicety.
- **R2 (fb-market-poster generalization footgun):** any implementer who copy-pastes "immediately
  before `send_telegram`" verbatim onto fb-market-poster will fail to find one — there is no
  MARKET-channel Telegram send in that flow. Phase 2 must land before the STEP 5 file `Write`
  instead. Called out explicitly in §4's table to prevent this.
- **R3 (probe API-shape footgun):** `task_list_held` has no `task_id` filter. An implementer who
  assumes server-side filtering exists will write a query that silently returns unfiltered results
  and either false-positives (matches the wrong key) or false-negatives (never matches). The skill
  draft in §3 states this explicitly.
- **Security:** no new attack surface — `owner_client_session` handling unchanged, FR-5's guard adds
  a pure read-before-write short-circuit, no new external input path.
- **Perf:** Phase 1 adds one `task_list_held(kind="cowork-slot")` call per cycle for 4/6 gates —
  cheap (indexed query, ~19-21 total live rows across the whole system per a recent live count) —
  negligible.
- **DDD:** FR-5 correctly enforces a domain invariant at the infrastructure boundary via a pure
  domain-layer predicate — no violation. No new interface duplicated (extends the existing
  `releaseTask`/`releaseOrphanTask` functions in place, does not fork a parallel release path).

---

## 11. Verification Gate (mirrors PO's own, per BA spec §2)

1. Two same-window peer runs of one slot → exactly one Phase-2 claim succeeds, exactly one synthesis
   artifact exists, exactly one MARKET post is emitted.
2. No-false-suppression: the NEXT window's key is free at its own fire time (a 100800s TTL from
   window N must not cover window N+1).
3. AC(2) abort-path: inject a mid-flow bail immediately after a successful Phase-2 claim (before the
   publish action executes) → RAW-verify (`task_list_held`) the marker is STILL held afterward (never
   released) AND no MARKET/WORK message was sent for that cycle.
4. AC(3), if FR-5 ships: attempt `task_release`/`task_force_release_orphan` on a live `published:*`
   key from any caller (correct owner, wrong owner, orphan-sweep-shaped call) → all refuse
   unconditionally, `released:0`/`false` with `reason:"published_marker_immune"`.
5. AC(4): grep confirms all 6 gates reference `.claude/skills/published-marker-gate/SKILL.md` for
   both phases they use, zero remaining inline copy-pasted claim logic.
6. AC(5): RAW-verify via `task_list_held` after a real evening dish — marker MUST still be held.

---

## 12. BUILD-STANDARD

`BUG-FIX / REFACTOR (in-zone, no new primitives)` → `BUILD-STANDARD: not-applicable`. This
extracts/relocates existing, already-proven call patterns into one shared skill and adds an
unconditional guard to two existing functions — no new domain primitive, no new agent, no new
service.

---

## 13. Files to create / modify (full list for PM decomposition)

**Create:**
- `.claude/skills/published-marker-gate/SKILL.md`
- `apps/mcp-server/src/domain/services/publishedMarkerImmunity.ts` (only if FR-5 adopted — Path A/B, §9)

**Modify (flow-doc track, FR-1/FR-2/FR-3):**
- `docs/agents/unified-agent/flow/chef.md` (Step 0.5 → Phase-1 probe only)
- `docs/agents/unified-agent/flow/chef-dish.md` (Step 7 → add Phase-2 claim before Block A; fix
  Input line 19-20)
- `docs/agents/alert-commander/flow/stage-dispatch-log.md` (swap inline prose → skill pointer)
- `docs/agents/bctc-analyst/flow/stage-log-notify.md` (swap inline prose → skill pointer;
  `task_kind` fix)
- `docs/agents/fb-market-poster/flow/daily.md` (STEP 0a → Phase-1 probe; STEP 5 → add Phase-2 claim
  before `Write`; same for the weekend sub-flow variant)
- `docs/agents/digest-predict/flow/main.md` (both gates → Phase-1 probes only)
- `docs/agents/digest-predict/flow/daily.md` (add Phase-2 claim before `:77`)
- `docs/agents/digest-predict/flow/weekly.md` (add Phase-2 claim before `:78`)
- `docs/agents/tran-ngoc-bau/flow/main.md` (gate → Phase-1 probe only)
- `docs/agents/tran-ngoc-bau/flow/auto-cure-and-handoff.md` (add Phase-2 claim before `:15`)
- `docs/agents/cowork-team/flow/spawn-fanout.md` (trim FR-P2-7 block to 1-line pointer)

**Modify (code track, FR-5, only if adopted this wave — Path A):**
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (`releaseTask`, `releaseOrphanTask`,
  `ReleaseResult` type)
- New/extended test file covering the 3 cases in §6.

**Modify (reconciliation, not gated on this row's own close):**
- `docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` §3 (scope-down
  language per Q-gate-overlap)
- `docs/protocols/dwf-ops-runbook.md` § Published Marker Interaction (cross-reference the
  reconciled gate)

---

## RETURN
DONE: Technical design complete — FR-1/FR-2/FR-3/FR-5 fully specified, FR-4 consumption contract
defined, all 4 architect-owned open questions resolved, both sibling briefs reconciled, B1 presented
as both paths (not decided — PO-only).
ZONE: multi (docs/agents/ + .claude/skills/ + apps/mcp-server/ conditional on B1 Path A/B)
NEXT: pm | decompose FR-1/FR-2/FR-3 (flow-doc track) + FR-5 (code track, gated on PO's B1 ruling)
HANDOFF: docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md (this file) +
docs/handoffs/UC-CCA-P3-BA-spec.md (pointer section appended)
PIPELINE: continue
