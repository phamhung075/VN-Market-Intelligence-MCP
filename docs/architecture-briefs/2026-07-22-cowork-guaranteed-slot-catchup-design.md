# Cowork Guaranteed-Slot Catch-Up — Technical Design

**Date:** 2026-07-22T22:03:07Z · **Author:** architect · **Type:** DESIGN, sprint COWORK-GUARANTEED-SLOT-CATCHUP
**Input:** `docs/handoffs/BA-COWORK-GUARANTEED-SLOT-CATCHUP.md` (10 FR / 7 NFR / 12 AC / 5-row consolidation)
**Zone:** `cross-service/` — `scripts/agents-flow/` + `docs/agents/cowork-team/flow/` + `docs/data/cowork-schedule.json`. No `apps/<service>` microservice files touched (no domain/application/infrastructure DDD layers under `apps/mcp-server/src/`) — this is orchestration tooling, out of the DDD layer table's scope. Per zone-detect Tier-2 ("files span >1 zone OR scripts/ → route to `developer` (generic)"), owner = `developer`, not a `dev-<service>` specialist.
**BUILD-STANDARD:** not-applicable (bug-fix/refactor/maintenance, in-zone, no new `apps/<svc>`).

---

## 1. Brownfield verified paths

- `scripts/agents-flow/cowork-match-slots.js:45-83` `snapToCronBoundary()` — confirmed 0 of 8 guaranteed slots' `"MM H * * *"` cron shape hits any of its 3 snap branches (BA 0.1, independently re-verified against all 8 live cron strings).
- `scripts/agents-flow/cadence-policy.js` — sibling-module precedent: pure, `require`'d conditionally by `cowork-match-slots.js`'s CLI entrypoint (`:191-200`), zero imports back into `cowork-match-slots.js`. This is the pattern the new catch-up module mirrors (§2.1).
- `docs/agents/cowork-team/flow/last-fired.md:14-38` — Step 5b stamps `last_fired` for every `WON_SLOTS` entry unconditionally right after Step 5 spawn, independent of the spawned flow's outcome. This IS the 0.2/0.4 defect; it is the ONLY call site (grep-confirmed zero `last_fired` writes in `chef.md`, `digest-predict/flow/main.md`, `fb-market-poster/flow/main.md`, `tran-ngoc-bau/flow/main.md`).
- `scripts/agents-flow/cowork-guaranteed-slot-firer.sh:91-95,179-236` — has NO `mcp-call.sh`/gateway access of its own (confirmed: no `source`, no `mcp_call` call anywhere in the file) — it only shells out to `claude -p`; all MCP calls happen inside the spawned flow's own session.
- `scripts/agents-flow/cowork-tick-preflight.sh:58-59,215-235` — already `source`s `mcp-call.sh` and already calls `task_claim`/`task_heartbeat`/`claim_due_scheduled_tasks`/`emit_pressure_state`/`send_telegram` via the same helper. This is the reusable pattern for wiring a new `task_list_held` call into a bash caller (§2.4).
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:794-834` `listHeldTasks()` — SQL `SELECT ... claimed_at, expires_at ... FROM task_locks`. **`claimed_at` is returned** — this is the authoritative delivery timestamp needed for FR-7's reconciler (§2.6); no schema change needed.
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:220-247` — confirms `task_list_held` params are `{kind?, owner_agent?, expired?}`, `kind` enum includes `"cowork-slot"`. Matches BA's assumed signature exactly.
- **New brownfield finding, not in BA spec:** the 4 spawned flows do **not** use one uniform date-basis for their `published:` key. Grepped each flow's own gate:
  - `chef.md:48,66-70` → `WORK_DATE` = VN-date (`TZ=Asia/Ho_Chi_Minh date +%Y-%m-%d`).
  - `fb-market-poster/flow/main.md:88-92` → `VN_DATE` = VN-date; weekend variant (`:115`) keys on the **Saturday's** VN-date specifically (`PERIOD_SAT`), not a range.
  - `tran-ngoc-bau/flow/main.md:34-39` → ISO-week `periodKey` via `get_week_period` (date-range string).
  - `digest-predict/flow/main.md:15-40` (`digest-daily`, non-Sunday path) → **`UTC_DATE`**, explicitly NOT VN-date (comment at `:31-37` forbids `get_week_period.periodStart` but says nothing about VN vs UTC — the daily path is UTC-keyed by original design). `digest-sunday` path (`:89-111`) uses `periodKey` like tnb-audit.
  This means FR-3's literal wording ("`published:<slot_id>:<VN-date-or-period>`") is not uniformly true — `digest-daily` is UTC-date-keyed. Catch-up's marker-key computation MUST mirror each flow's actual current behavior per-slot, not assume one convention (§2.3, §7 risk flag). Silently "correcting" `digest-daily` to VN-date in this sprint would orphan any currently-held marker at the VN/UTC day-boundary and risk a duplicate post — **out of scope, not touched here.**

---

## 2. Design — shared catch-up module (FR-1, FR-3, FR-4, FR-6, FR-7, FR-9)

### 2.1 New pure domain module: `scripts/agents-flow/cowork-catchup-predicate.js`

Mirrors the `cadence-policy.js` sibling-module pattern cited in FR-1 (pure, `require`'d one-way by `cowork-match-slots.js`'s CLI entrypoint — never the reverse, avoiding circularity). Dependency-injected, not `require`-coupled to `cowork-match-slots.js`: it accepts `field`/`dowMatch` as parameters rather than requiring the sibling file itself, so `cowork-match-slots.js → cowork-catchup-predicate.js` stays a one-directional edge.

Exports (domain layer, zero I/O, ctx-injectable — matches `dev-standards.md`'s "domain has zero imports from infrastructure"):
```js
mostRecentCronFireBefore(cron, nowUnix, { field, dowMatch })
  // generic reverse-cron walker (bounded 8-day lookback) — reuses the SAME field()/dowMatch()
  // already exported by cowork-match-slots.js (no reimplementation). Handles "MM H * * *" with
  // DOW list/range/wildcard — exactly the 8 guaranteed-slot shapes, but genuinely generic
  // (NFR-4): works for any cron using minute+hour+DOW fields.

toVnDateString(unixSeconds)        // Asia/Ho_Chi_Minh YYYY-MM-DD (NFR-7)

computeCatchupCandidates(schedule, nowUnix, ctx, { field, dowMatch })
  // For each guaranteed:true, enabled, !_disabled_by slot NOT already in the live cronMatches()
  // result this tick:
  //   1. scheduledFireUnix = mostRecentCronFireBefore(slot.cron, nowUnix, ...)
  //   2. basis = slot.publish_date_basis (NEW field, §2.3) → compute scheduledKeyPart
  //      (VN-date | UTC-date | periodKey | Saturday-anchor VN-date, per basis)
  //   3. nowKeyPart = same basis computed against nowUnix
  //   4. if scheduledKeyPart !== nowKeyPart → FR-4 rollover: emit as a miss candidate,
  //      reason="rolled_past_vn_date", catchup_eligible=false
  //   5. else: elapsedMinutes = (nowUnix - scheduledFireUnix)/60; bound = per-dish_type
  //      catchup_max_lateness_minutes (§2.3, default CONSERVATIVELY SHORT on missing config
  //      per BA edge case); if elapsedMinutes > bound → miss candidate,
  //      reason="freshness_window_exceeded", catchup_eligible=false
  //      else → catchup_eligible=true
  //   6. Return one record per slot: {slot_id, dish_type, agent, flow_path, cron,
  //      trigger_prompt, guaranteed:true, scheduled_utc_time, scheduled_key_part,
  //      expected_publish_task_id: "published:" + slot_id + ":" + scheduled_key_part,
  //      catchup_eligible, reason (null when eligible)}
  // Pure — does NOT check task_list_held. That is FR-3's infrastructure-layer half (§2.4),
  // deliberately kept out of this domain function (DDD golden rule).
```

`cowork-match-slots.js` CLI entrypoint (`require.main === module` block, `:270-300`) additively `require`s this module (same conditional-require pattern already used for `cadence-policy.js`) and merges the output into the JSON stdout contract as a new top-level field:
```json
{"slots": [...unchanged...], "drift_min": N, "catchup_raw": [...computeCatchupCandidates() output, ALL entries including ineligible ones...]}
```
`catchup_raw` costs nothing extra on the ~99% of ticks where it's empty (still one sync, no-I/O Node invocation — NFR-3 preserved). `matchSlots()` (the exported JS function used by tests) also grows an optional 4th return field so the existing 8-scenario test file (`cowork-match-slots.test.js`) is untouched — this is purely additive to the CLI JSON contract, not a signature break (NFR-2).

### 2.2 New per-dish-type config: `docs/data/cowork-schedule.json._dish_type_catchup_config`

New top-level key (sibling to existing `_notes`/`_runtime`/`_ssot`), keyed by `dish_type` (FR-2, no new taxonomy per BA 0.6), each entry `{catchup_max_lateness_minutes, fire_timeout_seconds}` (folds FR-2's freshness bound and FR-8's per-firer-invocation bound into ONE config block, since both are dish_type-keyed knobs — avoids scattering two new dish_type-keyed configs across two locations). Plus a `_default` entry for schema-drift safety (BA edge case: missing/malformed config on a newly-added slot → conservative SHORT, not long — `_default.catchup_max_lateness_minutes` starts low, e.g. 60min, never "unbounded"). Starting values per BA's own recommended defaults (§1 FR-2) — PM/developer may tune `fire_timeout_seconds` from real telemetry once shipped (see §3 FR-8 ruling for the rationale on which dish types get raised).

New per-slot fields on `.slots[]` (additive, NFR-2): `publish_date_basis: "vn_date" | "utc_date" | "iso_week_period" | "vn_date_saturday_anchor"` — set from the brownfield findings in §1 (chef-morning/eod/evening/fb-daily = `vn_date`; fb-weekend = `vn_date_saturday_anchor`; digest-sunday/tnb-audit = `iso_week_period`; digest-daily = `utc_date`, mirroring its existing behavior, not "fixing" it).

### 2.3 Delivery-evidence check (FR-3) — infrastructure layer, per-caller, conditional

`task_list_held(kind:"cowork-slot")` is an MCP/gateway call — it cannot live inside the pure Node module (domain has zero I/O). Each of the 3 callers, ONLY when `catchup_raw` is non-empty (preserves NFR-3's "no LLM invocation / one gateway call on a no-catch-up tick" verbatim), calls it once and checks each `catchup_raw[].expected_publish_task_id` against the returned `locks[].task_id` list:
- Held → drop from output entirely (FR-3: "already delivered", not a miss, not a fire).
- Not held + `catchup_eligible:true` → real catch-up-candidate → tag `is_catchup:true`, fields copied from `catchup_raw` (same shape as a normal matched slot: `slot_id, agent, flow_path, trigger_prompt`, `guaranteed:true`) → append into `MATCHES` (or the bash equivalent) so Steps 4.6 (slot-claim.md), 4.7 (tick-snapshot.md), 5 (spawn-fanout.md) consume it **unchanged** — zero edits to those 3 files (NFR-2, minimal diff).
- Not held + `catchup_eligible:false` → FR-5 structured miss (§2.5).

This one-line membership check is trivial enough (and MCP-call-bound, not logic-bound) that it is implemented per-caller rather than centralized — consistent with the existing precedent that each of the 4 spawned flows already implements its own (near-identical) published-marker gate inline (`spawn-fanout.md`'s own comment: "The publisher owns the marker"). This is NOT the class of duplication FR-9/0.7 warns against — that warning targets the SUBSTANTIVE predicate (FR-1/2/4), which stays centralized in `cowork-catchup-predicate.js`.

**Wiring per caller (FR-9):**
- **cowork-team dispatcher (LLM path):** new sub-flow `docs/agents/cowork-team/flow/catchup-check.md`, JUMP-TO table entry **Step 4.55** (between `pressure-cadence.md` 4.4-4.5b and `slot-claim.md` 4.6-4.6b) — reads `catchup_raw` from the same slot-matcher call Step 1-4b already made (no re-invocation), conditionally calls `task_list_held`, appends eligible candidates into `MATCHES`, writes miss records for ineligible ones.
- **`cowork-tick-preflight.sh`:** extend Step 6 (already calls `SLOT_MATCHER_CMD`) to also read `.catchup_raw` from the same JSON; add Step 6.5 — conditional `mcp_call "task_list_held" '{"kind":"cowork-slot"}'` (mirrors its own existing `mcp_call` idiom verbatim) — folds eligible candidates into the `slots` array of its verdict JSON (so the WORK-continuation path in `main.md` treats them identically, per its own documented contract) and writes miss records for ineligible ones directly (it already has `send_telegram` access via `mcp_call`). Extend the Step 7 SILENT gate: a tick with zero live `slots`/`one_shots`/`signal_count` but a non-empty (post-delivery-check) catch-up-fire list or an **unlogged** miss must verdict `WORK`, not `SILENT` (dedup: check for the miss's ledger/companion file existing already before counting it toward the gate, so an already-recorded miss doesn't force `WORK` every subsequent tick).
- **`cowork-guaranteed-slot-firer.sh`:** currently has zero gateway access. Add `source "$SCRIPT_DIR/mcp-call.sh"` (identical to `cowork-tick-preflight.sh`'s own pattern) + `_load_env` already exists for Telegram tokens. After the existing `SLOT_MATCHER_CMD` call (`run_firer()` `:192`), read `.catchup_raw`; if non-empty, ONE conditional `mcp_call "task_list_held" ...` call; append eligible candidates to the `guaranteed===true` filtered fire-list (already filters on `.slots[]?` — extend to `(.slots + .catchup_raw_eligible)[]? | select(.guaranteed==true)`); ineligible → write miss record + one `send_telegram` (mirrors the WARN pattern the firer already uses at `:149,161`). This is the launchd-cadence (900s) instance of the same check — since it runs independently of the dispatcher's 15-min tick, it is the plane most likely to actually deliver the catch-up during a session-down window (Track B's whole purpose).

### 2.4 FR-6 — dedup arbitration ruling (also answers `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE`'s own open design question)

That board row asks: *"Which plane is authoritative, and how does the non-authoritative plane learn to stand down?"* **Ruling: neither plane stands down — the published-marker `task_claim` is ratified as the sole, symmetric arbitration point for all 3+ planes (dispatcher, firer, catch-up, router-intent), by construction, not by one plane deferring to another.**

Rejected alternative ("launchd fires only when no live dispatcher session is detected"): "is a live session detected" is itself a *derived* signal, and this exact system has a documented, repeated history of derived-signal staleness (`isSuppressedByBoundaryDedup`'s broken snap branches — this very sprint's root cause; `trigger_status` deprecated as a discriminator per `FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS`; session-presence TTL gaps elsewhere in this codebase). Building a NEW derived "stand-down" signal to arbitrate between planes repeats the same class of bug this sprint exists to fix. The published-marker `task_claim` is a direct, atomic, single-winner DB primitive with zero known false-negative in the gathered evidence (0.1, 0.5, and `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY`'s own board note all independently confirm: schedule metadata got corrupted, but the actual Telegram/MARKET post never double-fired). Catch-up reuses this identical gate unchanged (§2.3) — zero new race surface, per NFR-5.

**Risk flag (explicit, not closed by this sprint):** this ruling closes the *arbitration-design* gap (no plane needs to know about another). It does **not** close the marker-*lifecycle* robustness gap the same board row cites: `feedback_chef_leaks_published_marker_on_silent_exit`, `feedback_chef_releases_published_marker_enables_peer_double_publish`, `feedback_fb_dedup_gate_orphaned_test_lock_false_block`. Those are agent-flow-internal marker-lifecycle bugs (leak-on-bail, premature release), tracked under their own existing rows, unrelated to which plane fires. PM/QA must not mark those resolved by this sprint's close-out.

### 2.5 FR-5 — structured miss record: per-file (not ledger)

BA offered two shapes; **ruling: per-miss file** (`docs/signals/cowork-guaranteed-slot-miss-<slot_id>-<VN-date-or-period>.json`), not the ledger (`auditor-dedup-ledger.json` pattern). Rationale: the per-file path gives free cross-caller idempotency — any of the 3 callers checks "does this file already exist" before writing + before sending the one Telegram notice, with zero additional locking (a ledger requires read-modify-atomic-write-with-CAS across 3 independent, differently-scheduled processes — unnecessary complexity for a low-frequency event). Atomic tmp+rename, matching the existing convention. Fields exactly per BA FR-5.

### 2.6 FR-7 — `last_fired` reflects delivery (Option (b): reconciler, not per-flow self-write)

**Ruling: Option (b).** Rejected Option (a) (each of the 4 spawned flows writes its own `last_fired` right after its own publish-marker claim): this would add 4 new concurrent writers of the same shared `cowork-schedule.json` from independently-scheduled, potentially-parallel (`BGFAN-1`) background-spawned processes — reintroducing exactly the lost-update race class `last-fired.md`'s own existing Step 5b was deliberately designed to avoid ("single batched read→update-all-WON→write.tmp→rename... avoids lost-update race from parallel fan-out"). It would also make `last_fired` correctness depend on WHICH plane spawned the flow — directly contradicted by live prior art already on the board (`FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY`'s own note, 07-21 chef-evening incident: *"the fix must NOT be implemented as 'also bump last_fired on the router dispatch path' — the delivery-proof source must be an artifact the SLOT produces... read independently of WHICH path spawned the agent. Path-agnostic by construction."*).

Design: remove the unconditional post-spawn stamp from `last-fired.md` Step 5b. Replace with a **reconciliation pass**, run once per dispatcher tick (same single-writer-per-tick discipline, same atomic batched tmp+rename), that reuses the SAME `task_list_held(kind:"cowork-slot")` response already fetched for §2.3 (zero extra gateway calls when both run in the same tick) plus `claimed_at` from each held lock: for every `guaranteed:true` slot, if a `published:<slot_id>:<its own basis-key>` marker is held AND its `claimed_at` is newer than the slot's stored `last_fired`, backfill `last_fired = ISO(claimed_at)`. If no such marker exists yet (spawn attempted but not yet delivered — truncated, still running, or genuinely failed), `last_fired` is left **unchanged** — this is the literal AC-5 acceptance bar. Path-agnostic by construction: it doesn't matter whether the dispatcher, the firer, or the router-intent path spawned the flow — whoever's marker lands gets picked up on the next dispatcher tick that runs (durable, SQLite-backed; survives session-down gaps — the reconciler doesn't need to run WHILE the session is down, only once when it resumes).

---

## 3. FR-8 ruling — firer fanout timeout (explicit, per BA's requirement)

**Ruling: (a) raise `FIRE_TIMEOUT_SECONDS`, data-driven per `dish_type` (not per-`slot_id`, NFR-4) via `_dish_type_catchup_config.<dish_type>.fire_timeout_seconds` (§2.2) — combined with an explicit, bounded (c) accepted-residual-risk statement. Not (b).**

Evidence: `chef.md` is an 812-line, 8-step, sequential (no subagent `Agent()` fan-out found — confirmed by grep, zero hits) single-session flow: Step 0 alone issues 10+ MCP tool calls; Steps 1-6 run the full TNB 6-layer synthesis; Step 7 writes a dual-output (MARKET + WORK) dish; Step 7.5 runs a deterministic quality-verdict gate; Step 7.6 persists JSON. `fb-market-poster/flow/main.md` is comparably heavy (945 lines). This is legitimately a long sequential LLM-reasoning + tool-call chain, not a bug — the 2026-07-22 chef-morning SIGTERM at exactly 1800s (`05:28:17Z → 05:58:17Z`, `exit_code=143`) is consistent with a genuinely long real flow, not a hang.

Why not (b) (diagnose/shorten flow duration): the TNB 6-layer methodology, dual-output requirement, and anti-fabrication/quality gates are PO/BA-owned product requirements — shortening them to fit a timeout is a product tradeoff, not an architecture fix, and is explicitly outside this role's boundary (`not_my_job: infrastructure diagnosis`, `forbidden_outputs: NEVER write production code`). A full latency-profiling investigation into WHY each step takes as long as it does is ops/developer diagnostic work, not a design ruling.

Why (a) is safe: the firer's `FIRE_TIMEOUT_SECONDS` is a "eventually reap a runaway process" backstop, not the anti-pileup control (the published-marker gate + per-work-item token are — §2.4/NFR-5). Raising it for the heavy dish types (`morning_dish`, `eod_dish`, `evening_preview`, `fb_daily_post`, `fb_weekly_post`) to a value comfortably above the observed near-1800s real duration (starting recommendation: 3000s / 50min for chef dish types, 2400s / 40min for fb dish types — PM/developer should instrument one real post-fix run's wall-clock time and tune from telemetry rather than treat these as final) stays well inside the tightest catch-up freshness bound (`fb_daily_post` ≤120min = 7200s) so a raised timeout can never itself cause a freshness-window miss. Lighter dish types (`daily_predict`, `daily_audit`, `weekly_digest` — 101-148-line flows) keep the current 1800s default (`_default.fire_timeout_seconds`), NFR-2 backward-compatible.

**Accepted residual (explicit, per BA's option (c)):** even after raising the bound, an outlier run (e.g. a slow upstream fetcher retry storm) could still truncate. This residual is accepted, not further engineered around, in this sprint. If repeat truncations are observed post-fix (via the new distinguishable telemetry, NFR-6), PM may open a separate, low-priority perf-investigation backlog row — not a blocker here.

---

## 4. Track-B ruling (§4 of BA spec — non-blocking, architect-only call)

**Ruling: document the residual as accepted. Do not add a pmset/caffeinate keep-awake OPS task.**

Rationale: Track A's bounded catch-up (FR-1..10, this design) already provides the CORRECTNESS backstop for the standby-gap scenario — a missed slot either catches up within its bounded freshness window or gets a structured, visible miss record; nothing is silently lost either way. A keep-awake daemon's only marginal benefit on top of that is *reducing how often* catch-up is invoked, not fixing correctness (already fixed). Against that marginal benefit: a laptop kept awake 24/7 has a real, ongoing power/wear/host-availability cost, and the router's own framing already treats this as optional/non-blocking. VPS stays REJECTED (unchanged, brief §3, not reopened here).

**Non-blocking optional follow-up (NOT part of this sprint, NOT gating Track A):** if ops wants to reduce catch-up frequency further at lower cost than blanket `caffeinate`, a per-slot `pmset schedule wake` at each guaranteed slot's own UTC cron time (waking briefly at 8 specific times/day rather than staying awake continuously) is a cheaper alternative — PM may mint this as an optional low-priority ops backlog row if desired; it is explicitly not required for this sprint's DoD.

---

## 5. FR-10 — doc touch points (route each to its owning doc-owner)

| File | Change | Owner |
|---|---|---|
| `docs/data/cowork-schedule.json` | `guaranteed` semantics note (new wording per BA FR-10) + `_dish_type_catchup_config` + per-slot `publish_date_basis` | developer (schema owner alongside the code change) |
| `docs/agents/cowork-team/flow/main.md` | JUMP-TO table: add Step 4.55 row; WORK-continuation note | developer |
| `docs/agents/cowork-team/flow/match-slots.md` | Document `catchup_raw` field in the matcher's returned contract | developer |
| `docs/agents/cowork-team/flow/last-fired.md` | Rewrite Step 5b per §2.6 (reconciler, not post-spawn stamp) | developer |
| `docs/agents/cowork-team/flow/spawn-fanout.md` | Note `is_catchup:true` tag passes through unchanged (union already in MATCHES, §2.3 — no logic change, doc-only clarification) | developer |
| **NEW** `docs/agents/cowork-team/flow/catchup-check.md` | New Step 4.55 sub-flow (§2.3) | developer |
| `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` | Addendum section only — historical body untouched (repo convention) | developer (or agent-father per that brief's own doc-owner convention — PM to confirm at decomposition) |
| `docs/protocols/cowork-master-cron-runbook.md` | Update guaranteed semantics + `last_fired` staleness-check note (now reconciler-backed, not dispatch-stamped) | agent-father (existing doc owner per its own header) — PM routes this one subtask there, not to developer |

---

## 6. DDD layer map

| Piece | Layer | Location |
|---|---|---|
| `computeCatchupCandidates`, `mostRecentCronFireBefore`, `toVnDateString` | domain | `scripts/agents-flow/cowork-catchup-predicate.js` (pure, ctx-injectable, zero I/O) |
| `task_list_held` call + held-marker filter (§2.3) | infrastructure | per-caller (dispatcher LLM step / `cowork-tick-preflight.sh` / `cowork-guaranteed-slot-firer.sh`) |
| `last_fired` reconciliation (§2.6) | infrastructure + application | `last-fired.md` (batched write, atomic tmp+rename) |
| Miss-record write + Telegram (§2.5) | infrastructure + interface | per-caller, `docs/signals/cowork-guaranteed-slot-miss-*.json` |
| Union of catch-up candidates into `MATCHES` / firer fire-list (§2.3/§2.4) | application | `catchup-check.md` (new), `cowork-guaranteed-slot-firer.sh` `run_firer()` |
| `_dish_type_catchup_config` schema | domain (config) | `docs/data/cowork-schedule.json` |

---

## 7. Files to create / modify

**Create:**
- `scripts/agents-flow/cowork-catchup-predicate.js` (domain, pure)
- `scripts/agents-flow/cowork-catchup-predicate.test.js` (plain-assert harness, mirrors `cowork-match-slots.test.js` conventions — AC-1/AC-2/AC-3)
- `docs/agents/cowork-team/flow/catchup-check.md` (new sub-flow)

**Modify:**
- `scripts/agents-flow/cowork-match-slots.js` — CLI entrypoint only (`:270-300`), additive `catchup_raw` field; `matchSlots()` exported signature grows an optional 4th return field (non-breaking)
- `scripts/agents-flow/cowork-tick-preflight.sh` — new Step 6.5 (conditional `task_list_held`), extend Step 7 SILENT gate, extend verdict JSON contract
- `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` — add `mcp-call.sh` sourcing, consume `catchup_raw`, apply per-dish_type `fire_timeout_seconds`
- `scripts/agents-flow/cowork-tick-preflight.test.sh`, `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` — extend for new behavior (NFR-2: existing cases stay green, new cases added)
- `docs/agents/cowork-team/flow/main.md`, `match-slots.md`, `last-fired.md`, `spawn-fanout.md` — per §5
- `docs/data/cowork-schedule.json` — per §2.2, §5
- `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`, `docs/protocols/cowork-master-cron-runbook.md` — addendum/update per §5

**Explicitly NOT modified:** `digest-predict/flow/main.md`, `fb-market-poster/flow/main.md`, `tran-ngoc-bau/flow/main.md`, `chef.md` — their existing published-marker gates are reused as-is (§2.4); `digest-daily`'s UTC_DATE key is mirrored, not corrected (§1).

---

## 8. Test strategy (mapped to BA's AC-1..AC-12)

- **AC-1, AC-2, AC-3** → `cowork-catchup-predicate.test.js`, ctx/`nowUnix`-injected (same seam already proven for `cronMatches`/`matchSlots`): 07-22-shaped scenario (chef-eod/fb-daily missed windows), rollover-past-VN-date scenario, freshness-bound-exceeded scenario.
- **AC-4** → new test in `cowork-tick-preflight.test.sh` (mocked `task_list_held` response) proving a held `published:` marker suppresses catch-up.
- **AC-5** → new test simulating a truncated run (marker never claimed) proving `last_fired` stays unchanged (extend `cowork-match-slots.test.js` or a new reconciler-focused test alongside `last-fired.md`'s logic).
- **AC-6** → satisfied by §3 of this brief (explicit ruling recorded).
- **AC-7** → extend `cowork-guaranteed-slot-firer.test.sh` with a simulated dispatcher-tick + firer-tick double-match resolving to one `task_claim` winner (mock the coordination store).
- **AC-8** → grep check across the FR-10 file list (§5), part of QA RAW-verify.
- **AC-9** → PM/QA close-out gate, not architect's job — tracked via owner reassignment (§9).
- **AC-10** → run `node scripts/agents-flow/cowork-match-slots.test.js`, `bash scripts/agents-flow/cowork-tick-preflight.test.sh`, `bash scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` unchanged + green, plus new tests above.
- **AC-11** → no action (verify no edits touched `OPS-COWORK-GUARANTEED-SLOT-INSTALL` or VPS references — confirmed none in §7's file list).
- **AC-12** → QA session-down survival test extends 2026-07-07 brief §6, using the same `ctx`-injection seam to simulate an elapsed guaranteed-slot window, then a real firer invocation.

---

## 9. Risk flags

1. **FR-6 does not fix marker-lifecycle bugs** (leak-on-bail, release-enables-peer-double-publish) — explicitly out of scope, tracked under separate existing rows (§2.4). PM/QA must not conflate.
2. **`digest-daily`'s UTC_DATE key is a pre-existing quirk**, mirrored not fixed (§1, §7) — flagging for PM to optionally mint a separate low-priority row; NOT this sprint's scope, changing it now risks a duplicate post at the VN/UTC day-boundary transition.
3. **Reconciler ordering dependency:** `last_fired` reconciliation (§2.6) and catch-up detection (§2.3) both consume the same `task_list_held` response but must NOT be coupled into a single hard sequential dependency — if `task_list_held` transport-fails, catch-up must fail conservative (skip this tick, BA edge case) while reconciliation simply no-ops (leaves `last_fired` as-is) — developer must keep these two failure paths independent, not one aborting the other.
4. **`fire_timeout_seconds` raise is a real host-resource tradeoff**, not free — a longer-running headless `claude -p` process holds more memory/CPU per invocation; bounded by the fact only guaranteed slots (currently 8, low daily cadence) are affected, not sub-hourly market slots.
5. **New `publish_date_basis`/`vn_date_saturday_anchor` per-slot fields must be reviewed against each flow's ACTUAL current gate code at implementation time** (this brief's §1 grep is point-in-time) — developer should re-grep before hardcoding basis values into the schema, in case a flow's gate changes between this brief and implementation.

---

## 10. Owner reassignment — 5 consolidated rows (§3/0.8 of BA spec)

Per BA's recommendation and this brief's zone/DDD analysis (§ header): all 5 rows land in the SAME cohesive `cross-service/` orchestration zone (`scripts/agents-flow/` + `docs/agents/cowork-team/`), not split across ops/po/architect/null as today. Reassigning `owner` (additive field, no lane/status change — that stays PM/QA's job per AC-9's "close together" bar):

| Row | New owner | New next_agent | Disposition |
|---|---|---|---|
| `SPIKE-DEAD-WINDOW-20260722-EIGHT-HOUR-SILENCE` | developer | pm | Root-caused by PO (standby, not sleep-ruled-out) — no code change; closes on PM/QA coordinated pass with the other 4, not standalone. |
| `SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING` | developer | pm | Root-caused (this brief §2.4 + BA 0.7) — the 3-caller shared module already exists structurally, catch-up extends it; no separate code change beyond FR-1..9. |
| `FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION` | developer | pm | Implemented via FR-8 ruling (§3) — raise `fire_timeout_seconds` per dish_type. |
| `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE` | developer | pm | Implemented via FR-6 ruling (§2.4) — published-marker ratified as sole arbiter; zero new code, reused as-is by catch-up. |
| `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY` | developer | pm | Implemented via FR-7 ruling (§2.6) — reconciler replaces post-spawn stamp. |

**Not reassigned, not reopened:** `OPS-COWORK-GUARANTEED-SLOT-INSTALL` (stays REVIEW, untouched, AC-11).

---

## 11. RETURN

DONE: Technical design complete. Shared catch-up module designed as ONE additive extension (`cowork-catchup-predicate.js`, pure domain module + `catchup_raw` field on the existing matcher CLI contract), consumed identically by all 3 callers (dispatcher `catchup-check.md`, `cowork-tick-preflight.sh` Step 6.5, `cowork-guaranteed-slot-firer.sh`). FR-8 ruled: raise `FIRE_TIMEOUT_SECONDS` per dish_type + accept bounded residual (not flow-duration diagnosis). Track-B ruled: document residual, no keep-awake daemon. FR-6 ruling closes `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE`'s own open design question (published-marker ratified as sole arbiter, symmetric across planes — not one plane standing down for another). Brownfield finding: `digest-daily` uses UTC-date (not VN-date) for its published marker — must be mirrored, not corrected, in this sprint. 5 consolidated rows reassigned to `owner: developer` / `next_agent: pm` (additive fields only — lane/status unchanged, AC-9's "close together" bar stays PM/QA's).
ZONE: cross-service/ (scripts/agents-flow/ + docs/agents/cowork-team/)
NEXT: pm — decompose FR-1..FR-10 into atomic dev tasks per §7's file list (single-owner/sequential per BA's own cascade note — one shared-module zone, not parallel-dispatch split); route the `cowork-master-cron-runbook.md` doc-only subtask to `agent-father` (existing doc owner) rather than `developer`; flag the board row `type: SPRINT-S` mismatch (router note: scope is 10-FR/5-row, likely SPRINT-M/L) for PM to true up when sequencing.
HANDOFF: `docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md` (this file) + `docs/handoffs/BA-COWORK-GUARANTEED-SLOT-CATCHUP.md` (Brownfield Findings appended)
PIPELINE: continue
