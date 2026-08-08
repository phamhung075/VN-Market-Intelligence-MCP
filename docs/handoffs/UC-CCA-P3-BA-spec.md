# UC-CCA-P3 — Published-Marker Lifecycle — BA Requirements Spec

**Task ID:** UC-CCA-P3 (P0, umbrella, folds FIX-CHEF-PUBLISHED-MARKER-RELEASE + FU-CHEF-MARKER-INFLOW)
**Agent:** ba · **Date:** 2026-08-08
**Sprint:** ULTRACODE-AUDIT-FIXALL

---

## 0. Recap — why this exists (source: task row `.note` + 3 addenda, RAW-verified)

9 confirmed live incidents, 4 distinct root-cause mechanisms, since 2026-07-02, on the same
`published:<slot_id>:<key>` mutex pattern copy-pasted across 6 agent flows:

| Date | Mechanism | Effect |
|---|---|---|
| 07-02 (x2) | release-after-publish | double-publish (chef-morning, chef-evening) |
| 07-03 | remediation over-corrected to release-on-every-no-post-exit | leaked tombstone suppressed a legit dish |
| 07-15 | agent correctly followed the 07-03 rule, released after a REAL publish | double-publish; 2nd dish was also a FALSE ~29% VN-Index move (MARKET ids 932+933) |
| 07-16, 07-17 | mid-flow ABORT-AFTER-CLAIM (agent bails post-Step-0.5, pre-publish) | false tombstone, next legit dish blocked up to 28h |
| 07-22 | key DIVERGENCE — two peers on ONE wall-clock instant derive `:2026-07-22` vs `:2026-07-23` | simultaneous double-publish AND a predicted-and-confirmed future missed-publish |
| 08-05/06 | catch-up RETRY re-derives the key at retry time, not at the missed window | permanently missed 08-05 evening dish + a mislabelled 08-06 dish |

Two auto-injected memory lessons (`feedback_chef_leaks_published_marker_on_silent_exit` — release
it! — vs `feedback_chef_releases_published_marker_enables_peer_double_publish` — never release it!)
are in **direct contradiction**, which is why every point-patch to date has oscillated. The task
row's own diagnosis: the root cause is not the release call itself, it is that `chef.md` (and its 5
siblings) **claim the marker before the publish decision is known**, which structurally *forces* a
conditional-release rule that agents get wrong in both directions. PO's non-binding design
recommendation collapses that decision entirely: **claim so late there is nothing left to decide.**

---

## 1. Requirements

### FR-1: One shared Published-Marker Gate skill (two-phase: early probe + late claim)
Extract the copy-pasted claim logic into a single reusable procedure, analogous in shape to
`.claude/skills/commit-mutex/SKILL.md` (a mutex-around-a-side-effect skill already proven at fleet
scale). Two phases:
- **Phase 1 (cheap, safe abort)** — at the flow's existing early gate point (chef.md Step 0.5
  equivalent), call `task_list_held(task_id=MARKER_KEY)` **read-only**. If already held → abort the
  expensive gather/synthesis pipeline immediately, **claiming nothing** (a leak is structurally
  impossible from a call that never claims).
- **Phase 2 (commit point)** — immediately before the flow's own `send_telegram` call (not one step
  earlier, not wrapped around synthesis), `task_claim(MARKER_KEY, ...)`. `claimed:false` → EXIT
  without sending (a peer already published this window). `claimed:true` → send → **never
  `task_release` on success; TTL is the sole expiry path.**
DDD layer: **domain** (the publish-state invariant itself: SUCCEEDED → immutable tombstone,
NOT-ATTEMPTED/FAILED → must-not-survive) realized as an **application**-layer skill (the two-phase
procedure). Skill home: `.claude/skills/published-marker-gate/SKILL.md` (new).

### FR-2: Abort-path / mid-flow-bail coverage (AC(2) extension, po 2026-07-17T09:28:15Z)
AC(2) "silent/no-post exit leaves no marker" must also hold for the ABORT/exception/needs-
clarification bail branch **after** the Phase-2 claim succeeds, not only the clean silent-
convergence branch that never claims. Under FR-1's design this is achieved **structurally** (Phase 2
sits immediately before `send_telegram`, collapsing the exposed window to near-zero) rather than by
a conditional-release rule — but the residual window (see Blocker/Open-Question §3, `send_telegram`
itself failing after a successful claim) must be given an explicit, deterministic answer, not left to
agent judgment, or the row reproduces its own defect class one choke point later.
DDD layer: **application** (flow-control contract each of the 6 interface adapters must obey).

### FR-3: Wire the skill into all 6 existing gates
Confirmed inventory (grepped live, not assumed) — exactly 6 distinct flow files implement a
`published:` gate today:
1. `docs/agents/unified-agent/flow/chef.md` Step 0.5 — covers 4 slots (chef-morning/intraday/eod/evening) in one file; EARLY-claim (defect pattern), date-scoped (single-fire) + per-window (multi-fire, chef-intraday).
2. `docs/agents/alert-commander/flow/stage-dispatch-log.md` — already claims LATE (immediately before the first `channel="market"` send this cycle); tick-scoped key, tombstone-only, `task_kind:"cowork-slot"`.
3. `docs/agents/bctc-analyst/flow/stage-log-notify.md` — already claims LATE (Stage 5d-1, immediately before 5e WORK send); **`task_kind:"sprint-task"`, not `"cowork-slot"`** (inconsistent with the other 5 — see NFR-3).
4. `docs/agents/fb-market-poster/flow/daily.md` STEP 0a — EARLY-claim (defect pattern), date-scoped, plus a period-keyed weekend variant in the same file.
5. `docs/agents/digest-predict/flow/main.md` — EARLY-claim (defect pattern), date-scoped daily + ISO-week-period-scoped Sunday.
6. `docs/agents/tran-ngoc-bau/flow/main.md` — EARLY-claim (defect pattern), date-scoped.

So 2 of 6 (alert-commander, bctc-analyst) already independently converged on the late-claim shape by
tribal knowledge — useful corroborating precedent for FR-1, not something to redesign from zero.
DDD layer: **interface** (each flow file is the adapter that wires its own send path to the shared
skill).

### FR-4: Key-agreement input (AC(6), po 2026-07-22T20:10Z — ships as ONE design with sibling row)
The skill MUST accept the mutex key as an **injected, window-anchored value**
(`scheduled_utc_time`, ISO-8601, sourced from the cron's own nominal fire instant) rather than
deriving it from a `date` call made by the executing agent, live or retry. This is **not** newly
designed here — `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR`'s Component A
(`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` §2) already
specifies propagating `scheduled_utc_time` through `cowork-match-slots.js` → `spawn-fanout.md` Step
5's `trigger_prompt` → each flow's Step-0.5-equivalent, with wall-clock fallback reserved for genuine
ad-hoc/manual invocations only. FR-1's skill signature must simply **consume** that field as its
canonical key input (never re-derive it), and the mutex key vs the human-readable display label
(`date_vn`, filenames) must stay two separately-derived values, never one shared expression (PO's
explicit ruling — do not re-litigate).
DDD layer: **domain** (key identity = window, not wall-clock read) realized via **application**
(skill parameter) sourced from an **interface**-layer propagation already spec'd elsewhere.

### FR-5: AC-CODE-GATE — code-enforced release-refusal backstop (ASSESS, not mandated)
The task row frames this explicitly as "assess, do not assume": evaluate a code-level guard at the
`releaseTask()` / `task_force_release_orphan()` choke point in
`apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` (verified live: neither
function currently has any `published:`-prefix check — confirmed by direct read, no guard exists
today) refusing any release whose `task_id` matches `^published:`. Row's own stated design
constraint: **prefer a `task_id`-prefix guard over a new `task_kind` enum value** — `published:`
markers and `cron:` election locks currently share `task_kind:"cowork-slot"` with opposite release
semantics, and `task_list_held`'s live enum is already `["cowork-slot","sprint-task","dashboard-row","commit-mutex","intent","orphan-signal","session-presence"]` (7 members) — adding an 8th has a
known drift cost (Zod enum + SQLite CHECK + every call site,
`feedback_preclaim_gate_taskkind_enum_drift`).
DDD layer: **infrastructure** (`apps/mcp-server/src/infrastructure/coordinationStore.ts` +
`interface/mcp/tools/system/coordinationTools.ts` — the actual lock-store code, not a flow doc).

### FR-6 [ALREADY RESOLVED — informational, not open scope]: `owner_client_session` on chef.md claim
The task row's "ALSO IN SCOPE" item ("chef.md Step 0.5 omits `owner_client_session` entirely") is
**stale**. Live-verified: `chef.md:111-113` already carries the required field with an explicit
non-literal-substitution instruction, shipped by commit `be3545412`
(`FIX-CI-TASKCLAIM-CHEF-MD-OWNER-SESSION-PAYDOWN`, 2026-08-06, i.e. AFTER this row's note was
written) — a separate, already-closed row. **No remaining work here.** Only carry-forward constraint:
when FR-1 extracts the skill, it must preserve this field (and its "substitute the real value, never
the literal `$CLAUDE_CODE_SESSION_ID` string" caveat) rather than regress it during the refactor.
DDD layer: n/a (verification note, not a requirement).

---

## 2. Acceptance Criteria (PO's 6, verbatim scope, mapped to the FRs above)

1. Invariant holds for both single-fire slots (TTL 100800s) and multi-fire slots (TTL = cadence). → FR-1, FR-3.
2. A silent/no-post exit **and** a mid-flow abort/exception/bail exit after the Phase-2 claim leave NO marker. → FR-1, FR-2.
3. A successful publish leaves a marker no agent can release (TTL is the only expiry path). → FR-1, FR-5 (code backstop, if adopted).
4. All 6 copy-pasted gates wired to the one skill. → FR-3.
5. RAW-verify via `task_list_held` after a real evening dish — marker MUST still be held. → verification gate, not a design input.
6. Marker key is window-anchored from the cron fire-window in UTC, never a wall-clock `date` read at the leaf; ships as ONE design together with `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` (architect-first). → FR-4.

**Verification gate (mirrors the sibling ANCHOR row's own gate, since both ship together):** two
same-window peer runs of one slot → exactly one claim succeeds, exactly one synthesis artifact
exists, exactly one MARKET post is emitted; additionally assert the no-false-suppression case (the
NEXT window's key is free at its own fire time — a 100800s TTL from window N must not cover window
N+1); additionally assert AC(2)'s abort-path case with an injected mid-flow bail after Phase-2 claim.

---

## 3. Blockers (PO-only — genuinely undecided, not delegated to architect)

**B1 — Definition-of-done for FR-5 (AC-CODE-GATE).** The row frames the code-gate as an assessment,
not a mandate. Unresolved: if architect's assessment concludes "build it," must the
`apps/mcp-server/` TypeScript change land in the **same** wave as FR-1/FR-3/FR-4 before UC-CCA-P3 can
close DONE, or may architect spin it off as a new sibling `FIX-*` row (deferred, code-level hardening)
while UC-CCA-P3 itself closes on the flow-doc/skill-level fix alone? This determines whether
UC-CCA-P3's own `zone`/`type`/`size` should include `apps/mcp-server/` or stay
`docs/agents/ + .claude/skills/` only, which PM needs before decomposing. No existing PO ruling
addresses this precedent (the sibling architect brief explicitly left an analogous lane-move decision
"to PO/router" rather than deciding it inline).

---

## 4. Open Questions for Architect (HOW-level — PO has already delegated these; flagging so the
design does not silently pick an answer)

- **Q-send-fail:** FR-2's residual window is `task_claim` succeeds → `send_telegram` itself then
  errors (gateway timeout, malformed channel, etc.) before confirmed delivery. PO's design
  recommendation states "never release" unconditionally once claimed. Does that hold literally even
  here (accept a rare stuck tombstone healed only by TTL — consistent with "TTL is the ONLY expiry
  path"), or is there a narrow, mechanically-detectable exception (release ONLY on a demonstrable
  `send_telegram` tool-error return, never on any other exit reason)? Getting this wrong reproduces
  the row's own oscillation at the new choke point instead of the old one.
- **Q-gate-overlap:** `FIX-CHEF-PUBLISHED-MARKER-RELEASE`'s already-brief'd Component B
  (`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` §3) is a
  **procedural, delivery-evidence-conditioned** release gate in `spawn-fanout.md` for human/automated
  release attempts. FR-5 here is a **code-level, unconditional** `^published:` refusal at the
  `releaseTask()` choke point. If FR-5 ships, Component B's conditional-release branch becomes
  unreachable prose (the code refuses first, regardless of the evidence check's outcome) —
  architect must explicitly reconcile these two designs (pick one as canonical, or scope Component B
  down to "how a human/ops runbook explains the code-level refusal," not an actual release path).
- **Q-skill-siting:** FR-1's two-phase CLAIM logic must live INSIDE each of the 6 agent flows (claim
  timing is intrinsically tied to each flow's own `send_telegram` call site) — `spawn-fanout.md`
  itself explicitly disclaims this ("The publisher owns the marker — the dispatcher does NOT call
  publish markers", L115). Confirm the new skill is genuinely agent-side
  (`.claude/skills/published-marker-gate/SKILL.md`, referenced identically from all 6 flows), not
  conflated with Component B's separate dispatcher-side release-gate documentation.
- **Q-no-bash:** `bctc-analyst` has no Bash tool grant
  (`project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts`, already a live constraint on that
  agent). The shared skill must be expressed as native `call_tool`-invokable prose/pseudocode (the
  same shape as `decision-journal`/`notebook-write`/`commit-mutex` skills), never a Bash script,
  or 1 of the 6 target adopters cannot call it.
- **Q-taskkind:** normalize `bctc-analyst`'s `task_kind:"sprint-task"` marker to `"cowork-slot"`
  (matching the other 5) as part of the FR-3 rollout? Flag any in-flight-TTL migration risk (an
  already-held `sprint-task`-kind marker would not be found by a `cowork-slot`-kind query during
  cutover).

---

## 5. Edge Cases

- **Multi-fire vs single-fire key shapes:** chef-intraday (per-VN-hour window) and alert-commander
  (per-tick) are NOT date-scoped like the other 4 — the skill's key-shape parameter must generalize
  date / tick / ISO-week-period / per-window without hardcoding a shape.
- **Layer-A/Layer-B concurrent fire:** independent CLI/RemoteTrigger sessions racing the cowork
  dispatcher on the same slot must converge on the identical `MARKER_KEY` (depends on FR-4) so the
  Phase-2 mutex actually serializes them.
- **Catch-up/retry dispatch:** a retry of a missed window must derive the SAME key as the original
  scheduled window, not the retry's own wall-clock instant (08-05/06 incident) — covered by FR-4's
  `scheduled_utc_time` consumption, not new logic here.
- **Host sleep gaps:** routine on this fleet's host (laptop, France) — "delayed hours past nominal
  tick" is the *normal* case per the sibling ANCHOR row's own finding, not a rare edge case; the skill
  must not assume prompt execution.
- **Weekend/holiday:** the mutex key stays calendar-free by design (no trading-calendar lookup ever
  on the mutex path, PO ruling) — display-label session semantics (if ever needed) are a strictly
  separate, non-mutex field.
- **Cost-optimisation regression:** the early-claim pattern being replaced existed partly to abort
  cheaply before the expensive gather/synthesis pipeline; FR-1's Phase-1 read-only probe must
  preserve that abort-early property or the fix trades a correctness bug for a token-cost regression.

---

## Out of scope (related rows, do not re-derive here)

- `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM` (REVIEW, plan-only spec already authored 2026-08-07,
  `docs/architecture-briefs/2026-08-07-chef-midflow-bail-determinism-guard.md`) — distinct
  execution-determinism root cause (agent overriding its own degraded-floor publish rule).
  Complementary, not blocking: FR-1/FR-2 structurally close the marker-leak *consequence* of a bail
  regardless of whether that row's determinism guard also ships.
- `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` Component A (propagation mechanics) — already designed, FR-4
  only consumes it.
- `FIX-CHEF-PUBLISHED-MARKER-RELEASE` Component B (procedural release gate) — already brief'd;
  reconciliation with FR-5 is Q-gate-overlap above, not a redesign.

---

## RETURN
DONE: BA spec written, requirements + DDD mapping + ACs + blockers/open-questions produced.
NEXT: architect | design FR-1..FR-5 against this spec + the two already-existing architect briefs
(2026-08-06 anchor-and-release, 2026-08-07 midflow-bail) — B1 (definition-of-done scope) flagged for
PO/router at review time, does not block design start.
HANDOFF: docs/handoffs/UC-CCA-P3-BA-spec.md
PIPELINE: continue
