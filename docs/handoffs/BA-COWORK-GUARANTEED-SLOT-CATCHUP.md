# BA Requirement Spec — COWORK-GUARANTEED-SLOT-CATCHUP

**Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP (`sprint_goal` active, created 2026-07-22T21:32:09Z, `user_prioritized:true`)
**BA task:** BA-COWORK-GUARANTEED-SLOT-CATCHUP
**Status:** SPEC COMPLETE — zero PO blockers
**Author:** ba
**Date:** 2026-07-22
**NEXT:** architect — design the shared catch-up module extension + rule on FR-8 (fanout timeout) and the Track-B pmset/caffeinate residual
**Root cause:** already proven on two planes by PO triage (`docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po.md`) — NOT re-litigated here.

---

## 0. BA Live-Probe Findings (2026-07-22, code-read + live log/data verified — supersede stale notes on subsumed rows)

**0.1 The existing cross-tick dedup (`isSuppressedByBoundaryDedup`) provides ZERO effective suppression for all 8 live guaranteed slots — a real, code-confirmed defect, not a hypothesis.**
`scripts/agents-flow/cowork-match-slots.js` `snapToCronBoundary()` only snaps 3 cron shapes: `"0 */H * * *"`, `"*/M ... * * *"`, and `"0 H * * *"` (fixed hour, minute literally `0`). All 8 guaranteed slots' crons are `"MM H * * *"` with `MM≠0` (`chef-morning "15 5 * * 1-5"`, `chef-eod "45 8 * * 1-5"`, `chef-evening "45 19 * * *"`, `digest-sunday "47 13 * * 0"`, `digest-daily "30 17 * * *"`, `tnb-audit "13 20 * * *"`, `fb-daily "15 9 * * 1-5"`, `fb-weekend "13 13 * * 6,0"`) — none match any snap branch, so `snapToCronBoundary` returns its input (`nowUnix`) unchanged. `isSuppressedByBoundaryDedup` then evaluates `lastFiredUnix >= nowUnix`, which is essentially always `false` for a past `last_fired`. **The schedule-level boundary dedup never suppresses any of these 8 slots — the ONLY thing preventing a duplicate post today is each spawned flow's own `published:<slot_id>:<VN-date>` `task_claim` gate** (`spawn-fanout.md` FR-P2-7). This directly grounds the sprint's instruction that "the dedup marker must be the single arbiter" (FR-6 below) — it already is, in practice, and catch-up must not assume the schedule-level mechanism offers any protection.

**0.2 `last_fired` is stamped at spawn-dispatch, never at delivery — confirmed by absence, not inference.** `docs/agents/cowork-team/flow/last-fired.md` Step 5b writes `last_fired` right after Step 5 fan-out (spawn attempt), independent of whether the spawned flow ever reaches its own publish gate. Grepped all 4 guaranteed-slot-owning flows (`chef.md`, `digest-predict/flow/main.md`, `fb-market-poster/flow/*.md`, `tran-ngoc-bau/flow/*.md`) for `last_fired` writes — **none exist**. So a truncated/failed run still leaves `last_fired` stamped as if it succeeded (see 0.4). This is the exact defect `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY` names.

**0.3 The only reliable, read-only delivery-evidence source available today is `task_list_held(kind:"cowork-slot")`.** It enumerates held coordination locks including `published:<slot_id>:<VN-date>` markers without racing a claim — this is the mechanism catch-up detection must query (FR-3), not `last_fired`.

**0.4 Firer-fanout truncation is reproduced in the live log, not theoretical.** `docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log`: `chef-morning` invoked `2026-07-22T05:28:17Z`, exited `05:58:17Z` (**exactly 1800s later**) with `exit_code=143` (SIGTERM) — `cowork-guaranteed-slot-firer.sh`'s `_bounded_exec` watchdog killed it at `FIRE_TIMEOUT_SECONDS=1800`. `last_fired` for `chef-morning` nonetheless reads `2026-07-22T05:24:58Z` (0.2's defect, live instance).

**0.5 Dual-plane double-fire is reproduced in the live log, same day, same slot.** `chef-evening`: `cowork-schedule.json.last_fired = "2026-07-22T19:55:09Z"` (written by the live `*/15` dispatcher's own tick) while the independent launchd firer log shows it separately matched-and-invoked `chef-evening` at `19:59:49Z` — same slot, same VN-date, ~4.5min apart, both inside the same matcher 15-min bucket (`cronMatches`'s `M±2` window is checked against the floored-to-15min tick, not real wall-clock, so any invocation anywhere in that 15-min bucket re-matches). Per 0.1, only the downstream `published:` gate prevented a duplicate Telegram post here.

**0.6 `dish_type` already exists per-slot** (`morning_dish`, `eod_dish`, `evening_preview`, `weekly_digest`, `daily_predict`, `daily_audit`, `fb_daily_post`, `fb_weekly_post`) — the per-dish-type freshness window (FR-2) keys off this existing field; no new taxonomy needed.

**0.7 The "3 callers" are already ONE shared module by design — the fix belongs in exactly one place.** `cowork-match-slots.js`'s own header comment names it the SSOT "for the dispatcher, `cowork-tick-preflight.sh`, and `cowork-guaranteed-slot-firer.sh`: all three invoke this script/module and inherit the same suppression, no per-caller copies" (UC-CDC-P3 precedent, already proven for `isSuppressedByBoundaryDedup`). Grep-confirmed: `cowork-tick-preflight.sh` Step 6 and `cowork-guaranteed-slot-firer.sh` both invoke the identical default command (`node scripts/agents-flow/cowork-match-slots.js`, override via `SLOT_MATCHER_CMD`); `match-slots.md`'s own Steps 1-3 are the ERROR-fallback body of the same call. **Catch-up must extend this ONE module's output — never duplicate the predicate in 3 places.**

**0.8 Row-count reconciliation.** PO's success metric says "all 6 consolidated rows closed together." The 5 subsumed rows are `SPIKE-DEAD-WINDOW-20260722-EIGHT-HOUR-SILENCE` (owner `ops`), `SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING` (owner `po`), `FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION` (owner `ops`), `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE` (owner `architect`), `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY` (owner `null`) — the 6th is this sprint's own umbrella `BA-COWORK-GUARANTEED-SLOT-CATCHUP` task. **Owner fields on the 5 subsumed rows are stale/mismatched** (ops/po/ops/architect/null) relative to where the actual fix lands (scripts/agents-flow + docs/agents/cowork-team — a single cohesive code+doc zone). Architect/PM should reassign a consistent real owner when closing them (§3) rather than leave 5 different stale owners on rows that close together.

---

## 1. Functional Requirements

### FR-1 — Catch-up-due predicate (shared matcher extension) — DDD layer: **domain**
Extend `scripts/agents-flow/cowork-match-slots.js` (or a sibling module it requires, mirroring the existing `cadence-policy.js` pattern) with a pure, ctx-injectable predicate: for each `guaranteed:true` slot whose most recent scheduled fire-time (derived literally from its cron fields, not the floor-15 approximation used for live matching) is chronologically before "now" **and** falls on the same VN-calendar-date the slot is scheduled for (0.6 — note `chef-evening`'s VN-date is inherently "next day" per its own `vn_description`, not "today"; anchor on the slot's own scheduled VN-date, not a naive "today" read), the slot is **catch-up-candidate**.

### FR-2 — Bounded per-dish-type freshness window — DDD layer: **domain**
Add a new config field per slot in `docs/data/cowork-schedule.json` (name TBD by architect, e.g. `catchup_max_lateness_minutes`), keyed by the existing `dish_type` (0.6 — no new taxonomy). BA-recommended starting bounds (architect/PO may adjust; these are defaults, not a blocker):
- `fb_daily_post` / `fb_weekly_post` — tight, ≤120min: a market-summary FB post hours late is misleading content (matches the sprint vision's own example, "a stale FB post at 22:00 for a 16:15 slot may be worthless").
- `morning_dish` / `eod_dish` — ≤180min: same-trading-session analysis context decays fast.
- `evening_preview` / `daily_predict` / `daily_audit` — ≤360min (6h): off-market synthesis/prediction/audit, less time-decay-sensitive but still same VN-day.
- `weekly_digest` — ≤24h within the same ISO-week period (it is inherently a look-back report).
A catch-up-candidate (FR-1) outside its bound is NOT retro-fired — routed to FR-5 (structured miss) instead.

### FR-3 — Delivery-evidence check via the published marker, not `last_fired` — DDD layer: **infrastructure**
"Already delivered today" MUST be determined by querying real delivery evidence (0.3), not the schedule's `last_fired` (proven unreliable, 0.1/0.2/0.4/0.5). Call `call_tool(server="vn-market", tool="task_list_held", arguments={kind:"cowork-slot"})` and check for `published:<slot_id>:<VN-date-or-period>` among held entries (weekly slots: ISO `periodKey`, per the existing `FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP` convention — not `YYYY-MM-DD`). Held → skip catch-up (already delivered). Absent + FR-1 + within FR-2's window → catch-up-eligible.

### FR-4 — Explicit VN-date rollover skip rule — DDD layer: **domain**
If the VN-calendar-date (or ISO-week period) at catch-up-check time no longer matches the missed slot's own scheduled VN-date/period, the slot MUST NOT be retro-fired under the new date's marker (would either mislabel yesterday's content as today's, or silently consume today's own slot). Skip firing; emit FR-5 tagged with the **original** missed VN-date; the next normal nominal tick still handles today's own occurrence of the slot independently.

### FR-5 — Structured (non-silent) miss record — DDD layer: **infrastructure** + **interface**
When a catch-up-candidate is not fired (FR-2 window exceeded, or FR-4 rollover), write a structured record — file per miss (`docs/signals/cowork-guaranteed-slot-miss-<slot_id>-<VN-date>.json`) or append to a durable ledger (mirroring the already-shipped `docs/data/auditor-dedup-ledger.json` atomic tmp+mv pattern) — fields: `{slot_id, dish_type, scheduled_vn_date, scheduled_utc_time, detected_at, reason: "rolled_past_vn_date"|"freshness_window_exceeded", catchup_attempted:false}`. Emit exactly ONE work-channel Telegram notice per miss — visible, not silent, not per-tick spam.

### FR-6 — Dedup arbitration hardening: published marker is the sole fire-authorization gate — DDD layer: **infrastructure**
Consolidates `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE`. Per 0.1/0.5, schedule-level boundary dedup already provides no real protection for these 8 slots — the `published:<slot_id>:<VN-date>` gate is the only real one. Catch-up MUST reuse the identical `published:` key/gate the normal fire path already uses (not a parallel/independent marker) — a catch-up invocation racing a normal invocation, or the launchd firer racing the live dispatcher, resolves through the exact same single-winner `task_claim`, adding a 3rd caller but zero new race surface.

### FR-7 — `last_fired` reflects delivery, not spawn-dispatch — DDD layer: **infrastructure** + **application**
Consolidates `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY`. Per 0.2/0.4, the current write (`last-fired.md` Step 5b, right after spawn, regardless of outcome) means a truncated/failed run (e.g. `exit_code=143`) is indistinguishable from a real delivery to the next catch-up check. Architect chooses the shape between: (a) the spawned flow itself writes its own slot's `last_fired` immediately after its `published:` claim succeeds (new responsibility, atomic tmp+rename per the existing pattern), or (b) a lightweight reconciler (run at the next tick/catch-up-check) reads `task_list_held` for `published:<slot_id>:<VN-date>` and back-fills `last_fired` to match. Acceptance bar: a run that never reaches its publish gate must NOT leave a `last_fired` stamp implying success — the next catch-up check (FR-1/FR-3) must still see it as due.

### FR-8 — Firer fanout must complete, not re-truncate — DDD layer: **infrastructure**
Consolidates `FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION`. 0.4 proves the exact failure mode: `_bounded_exec`'s `FIRE_TIMEOUT_SECONDS=1800` watchdog kills a chef dish mid-run. A catch-up-eligible slot re-fired through the same firer inherits the identical bound and will re-truncate identically unless addressed. **Architect must rule explicitly** between: (a) raise `FIRE_TIMEOUT_SECONDS` for dish types that genuinely need >30min (chef dishes fan out to multiple subagent stages), (b) diagnose + bound why the chef flow exceeds 30min, or (c) explicitly scope-out as an accepted, no-worse-than-today risk (catch-up fires once, may still truncate, same as a normal fire) — silence is not acceptable; this FR requires a stated ruling.

### FR-9 — Single shared-module wiring across all 3 callers — DDD layer: **application**
Per 0.7, `cowork-tick-preflight.sh` Step 6, `cowork-guaranteed-slot-firer.sh`, and `match-slots.md`'s ERROR-fallback body already invoke one shared script — extending catch-up/freshness/rollover/delivery-check logic in that ONE place (mirroring the existing `isSuppressedByBoundaryDedup` UC-CDC-P3 precedent) means all 3 callers inherit it identically with zero per-caller reimplementation. The remaining wiring work is each caller correctly consuming the NEW fields the shared module returns (e.g. `is_catchup:true`, miss records) — not re-deriving the predicate.

### FR-10 — Doc-honesty: correct the `guaranteed` semantics — DDD layer: **interface**
Update: `docs/data/cowork-schedule.json` (schema-level note describing `guaranteed` semantics), `docs/agents/cowork-team/flow/*.md` (wherever `guaranteed`/dedup is described — `main.md`, `match-slots.md`, `last-fired.md`, `spawn-fanout.md`), `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` (append an **addendum section** — do not rewrite the dated historical brief body per repo convention that architecture briefs are point-in-time records), `docs/protocols/cowork-master-cron-runbook.md`. New stated semantics: *"`guaranteed:true` means the slot is delivered within its bounded catch-up/freshness window even across a host-standby or session-down gap, OR a structured (non-silent) miss is recorded when the VN day has rolled past — it does not mean unconditional delivery regardless of elapsed time."*

---

## 2. Non-Functional Requirements

- **NFR-1 (no stale-as-fresh mislabeling):** a catch-up-delivered dish must source its content as-of its OWN run-time, never backdated to the original slot's nominal time.
- **NFR-2 (additive-only, zero regression):** the existing ±2min cron-match, Step 4.6 per-work-item lock, and published-marker gate are unchanged; every existing test (cowork-match-slots tests, `cowork-guaranteed-slot-firer.test.sh`, tick-preflight tests) stays green.
- **NFR-3 (token-cost bound):** the catch-up check itself is a pure Node/bash predicate + one `task_list_held` gateway call — no LLM invocation on a "no catch-up due" tick, matching the architecture brief §4 established no-op-tick-is-free pattern.
- **NFR-4 (no per-slot hardcode):** catch-up window bounds and the predicate must be data-driven off `cowork-schedule.json` (`dish_type`-keyed), never a per-`slot_id` if/else chain — mirrors the firer script's own stated design principle; a future 9th guaranteed slot inherits catch-up automatically.
- **NFR-5 (idempotent under session/supervisor churn):** a catch-up fire goes through the identical Step 4.6 per-work-item token (`cowork-slot:<slot_id>`, TTL=180s) + published-marker gate (FR-6) — no new race surface.
- **NFR-6 (observability):** every catch-up fire (success) or recorded miss is distinguishable in logs/telemetry from a normal on-time fire — extend `telemetry.md`'s signal payload rather than blending all 3 outcomes into one undifferentiated `last_fired` stamp.
- **NFR-7 (VN timezone discipline):** all VN-date computations use `Asia/Ho_Chi_Minh`, matching the existing `WORK_DATE` convention (`spawn-fanout.md`) — never derive VN-date from a naive UTC-date read (misclassifies the ~17:00–24:00 UTC band, already the next VN calendar day, as seen in `chef-evening`'s own schedule).

---

## 3. Consolidation Disposition (subsumed — do NOT re-litigate, re-open, or re-investigate)

| Row | Owner today | Disposition |
|---|---|---|
| `SPIKE-DEAD-WINDOW-20260722-EIGHT-HOUR-SILENCE` | ops | Root-caused by PO triage (0-note in this sprint's `.sprint_goal.root_cause`) — its "machine sleep ruled out" finding is corrected (it WAS standby). Close DONE with findings, no new investigation. |
| `SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING` | po | Root-caused (0.7 — the 3-caller shared-module wiring already exists structurally; catch-up extends it). Close DONE with findings. |
| `FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION` | ops | Real bug, reproduced live (0.4). Implemented via FR-8 in this sprint. Close DONE with the FR-8 ruling + test. |
| `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE` | architect | Real, reproduced live (0.5). Implemented via FR-6 in this sprint. Close DONE with test. |
| `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY` | null | Real, confirmed by code-absence (0.2). Implemented via FR-7 in this sprint. Close DONE with test. |

**Recommendation (not a blocker):** architect/PM reassign a single consistent owner (the developer/zone that lands FR-1..9, likely `developer` against `scripts/agents-flow/` + `docs/agents/cowork-team/`) to these 5 rows when closing them together, rather than leave the current 5 divergent stale owner fields (0.8).

`OPS-COWORK-GUARANTEED-SLOT-INSTALL` stays `REVIEW`, untouched — not part of this consolidation (Track B already shipped).

---

## 4. Track B (already shipped) — explicitly out of BA/dev build scope, one architect ruling only

The launchd firer (`com.vn-market.cowork-guaranteed-slot-firer`) is installed and working (`last-exit 0`, per `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`). **Not reopened.** VPS option stays REJECTED (security surface, brief §3). The one remaining Track-B item is a pure architect ruling, not a BA spec item: whether a thin `pmset`/`caffeinate` keep-awake OPS task is worth adding (reduces how often catch-up is even needed) vs. simply documenting the standby residual as accepted (Track A's catch-up already covers it either way). This does not block Track A (FR-1..10) shipping.

---

## 5. Edge Cases (VN-market / pipeline-state specific)

- `chef-evening`'s scheduled VN-date is inherently "next day" (`vn_description: "02:45 VN next day"`) — catch-up VN-date bookkeeping must anchor on the slot's own scheduled VN-date derived from its UTC cron + description, never a naive "today" read (FR-1/FR-4).
- Weekly slots (`digest-sunday`) use ISO-week `periodKey` dedup, not `YYYY-MM-DD` — catch-up must call `get_week_period` and key on the date-range string, mirroring `FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP` (FR-3).
- Multiple slots missed the same day (07-22: `chef-eod` 08:45Z AND `fb-daily` 09:15Z both silent) — catch-up must independently evaluate and, where eligible, fire EACH due-but-undelivered slot on the next live tick, not just the most recent.
- A catch-up-eligible slot detected shortly before its OWN next regular occurrence (e.g. `chef-eod` catch-up at 15:40Z with `chef-evening`'s 19:45Z window 4h away) — no coupling risk; distinct `slot_id`/`published:` keys, both proceed independently.
- Missing/malformed per-dish-type freshness config on a newly-added slot (schema drift) — default CONSERVATIVELY SHORT (not long/unbounded): posting stale content is the harm being guarded against, unlike the existing "malformed `last_fired` → conservative, still fires" precedent (which optimizes for not-under-firing). Log a config-drift warning.
- `task_list_held` gateway call itself fails/times out (gateway transient, per memory `feedback_devteam_preflight_error_gateway_transient_rerun`) — treat as transient: skip catch-up this tick (fail conservative — no catch-up rather than an unverified duplicate-risking fire), retry next tick. Never fall back to firing blind without a delivery-confirmation read.

---

## 6. Numbered Acceptance Criteria

1. **AC-1:** Unit test proves the catch-up predicate (FR-1) returns due=true for a synthetic 07-22-shaped scenario (chef-eod/fb-daily missed 08:45Z/09:15Z windows, `nowUnix` ctx-injected to 17:34Z same VN-date, no `published:` marker present) — using the existing `ctx`/`nowUnix` test-seam pattern already proven in `cronMatches`/`matchSlots`.
2. **AC-2:** Unit test proves the predicate returns due=false + routes to structured-miss (FR-4) once the VN-date has rolled past the missed slot's scheduled date.
3. **AC-3:** Unit test proves the per-dish-type freshness bound (FR-2) rejects catch-up once elapsed-since-scheduled exceeds that slot's configured max-lateness, even on the SAME VN-date.
4. **AC-4:** Integration test proves catch-up detection correctly reads `task_list_held(kind:"cowork-slot")` (FR-3) and treats an existing `published:<slot_id>:<VN-date>` entry as already-delivered — zero catch-up fire attempted.
5. **AC-5:** Test reproduces a truncated run (simulated `exit_code=143` before the publish-marker claim) and confirms `last_fired` is NOT stamped as delivered (FR-7) — the next catch-up check still sees the slot as due.
6. **AC-6:** Architect brief states an explicit ruling for FR-8 (raised timeout | flow-duration fix | accepted-risk scope-out) — not silently unaddressed.
7. **AC-7:** A simulated double-fire (dispatcher-tick + firer both matching the same slot in the same window) resolves to exactly ONE successful `published:<slot>:<date>` claim — the loser's own flow exits cleanly at its own publish-gate check (FR-6); zero duplicate Telegram post.
8. **AC-8:** Grep confirms `cowork-schedule.json`'s `guaranteed` semantics note + all 4 `docs/agents/cowork-team/flow/*.md` touch points + the durability-brief addendum + the cron runbook are updated (FR-10) — historical brief body untouched, addendum-only.
9. **AC-9:** All 5 consolidated rows (§3) plus this sprint's own umbrella task close DONE together, each with findings/tests recorded — none left orphaned at a stale mismatched owner.
10. **AC-10:** tsc + every existing touched test suite (cowork-match-slots tests, `cowork-guaranteed-slot-firer.test.sh`, tick-preflight tests) stays GREEN — zero regression (NFR-2).
11. **AC-11:** `OPS-COWORK-GUARANTEED-SLOT-INSTALL` stays `REVIEW`, untouched; Track B / VPS option not reopened (§4).
12. **AC-12 (QA session-down survival, extends 2026-07-07 brief §6):** with no live CLI session and the host resuming after a simulated standby that elapsed a guaranteed slot window, the next live firer tick either fires the missed slot exactly once (published-marker verified, real deliverable, zero duplicate, zero stale-as-fresh) when still within its bounded window, or records a structured miss (not silent) when the VN day rolled past.

---

## 7. Cascade-Ordering Enforcement

```
ba (this doc)
  │
  ▼
architect — brief:
  · designs the shared catch-up module extension (FR-1,3,4,6,7,9) as ONE addition to
    cowork-match-slots.js (or a sibling module), consumed identically by
    cowork-tick-preflight.sh + cowork-guaranteed-slot-firer.sh + match-slots.md fallback
  · rules explicitly on FR-8 (fanout timeout: raise | fix flow duration | scope-out)
  · rules on the Track-B pmset/caffeinate residual (§4) — optional, non-blocking
  · reassigns a consistent real owner to the 5 consolidated rows (§3/0.8) for PM's decomposition
  │
  ▼
pm — decomposes into tasks; scripts/agents-flow/ + docs/agents/cowork-team/ +
     docs/data/cowork-schedule.json are ONE tightly-coupled shared-module zone
     (sequential/single-owner, not parallel-dispatch split — FR-1..9 share one module)
  │
  ▼
developer (zone owner per architect's §3 reassignment) → qa RAW-verify per AC-1..AC-12
     (session-down survival test, extends architecture-brief 2026-07-07 §6)
```

---

## Decision Journal

**task_id:** BA-COWORK-GUARANTEED-SLOT-CATCHUP
See `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-ba.md`.

## [Architect] Brownfield Findings

**Full design:** `docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md` (this section is a pointer + summary; the brief is the authoritative design doc per router instruction).

- **Zone:** `cross-service/` — `scripts/agents-flow/` + `docs/agents/cowork-team/flow/` + `docs/data/cowork-schedule.json`. No `apps/<service>` microservice files touched.
- **Verified paths:** `scripts/agents-flow/cowork-match-slots.js:45-83` (snap-boundary gap, re-confirmed), `cadence-policy.js` (sibling-module precedent, reused), `last-fired.md:14-38` (sole premature-stamp call site), `cowork-guaranteed-slot-firer.sh` (confirmed zero MCP access today), `cowork-tick-preflight.sh` (confirmed `mcp-call.sh` reuse pattern), `coordinationStore.ts:794-834 listHeldTasks()` (confirmed `claimed_at` field exists — powers FR-7's reconciler with zero schema change).
- **New brownfield finding (not in BA spec):** the 4 spawned flows do NOT share one date-basis for their `published:` marker — `chef.md`/`fb-market-poster` daily = VN-date, `fb-weekend` = Saturday-anchor VN-date, `tnb-audit`/`digest-sunday` = ISO `periodKey`, but `digest-daily` (non-Sunday path) = **UTC-date**, not VN-date. Catch-up must mirror each flow's actual per-slot basis (new `publish_date_basis` schema field), not assume VN-date uniformly — correcting `digest-daily`'s basis is explicitly out of scope for this sprint (risk of orphaning a held marker at the day-boundary).
- **Reuse patterns:** new pure domain module `scripts/agents-flow/cowork-catchup-predicate.js` mirrors the existing `cadence-policy.js` sibling pattern (dependency-injected `field`/`dowMatch`, one-directional `require` from `cowork-match-slots.js`'s CLI entrypoint — never circular). All 4 spawned flows' existing published-marker gates are reused completely unchanged (zero edits) — catch-up candidates are unioned into the same `MATCHES` array the live matcher already produces, so `slot-claim.md`/`tick-snapshot.md`/`spawn-fanout.md` need no logic changes.
- **Design decisions:**
  - FR-1/2/4 predicate (domain, pure) lives in the new sibling module; FR-3's `task_list_held` call (infrastructure, I/O) lives per-caller, conditional on `catchup_raw` being non-empty (NFR-3 preserved) — DDD golden rule (domain has zero imports from infrastructure) enforced by construction.
  - FR-6: published-marker `task_claim` ratified as sole, symmetric arbiter across all firing planes — explicitly rejects a "stand-down" derived-signal design (repeats this sprint's own root-cause class of bug). Zero new code; catch-up reuses the identical gate.
  - FR-7: Option (b) — reconciler reading `task_list_held`'s `claimed_at`, NOT per-flow self-writes (Option (a) rejected — reintroduces the lost-update race `last-fired.md`'s batched-write design was built to avoid, and contradicts prior art on the board: `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY`'s own note requires a path-agnostic delivery-proof source).
  - FR-8: raise `FIRE_TIMEOUT_SECONDS` per `dish_type` (not per-slot, NFR-4) + accept bounded residual — NOT a flow-duration diagnosis/shortening (out of architect's boundary, and the TNB 6-layer methodology is a deliberate product requirement).
  - Track-B: document the residual, no pmset/caffeinate keep-awake daemon — Track A's catch-up already provides the correctness backstop; a keep-awake daemon only reduces frequency, at a real always-on host-resource cost.
  - FR-5: per-miss-file (not ledger) — free cross-caller idempotency via existence-check, no CAS/locking needed.
- **Owner reassignment (5 consolidated rows):** all reassigned `owner: developer`, `next_agent: pm` — see brief §10 for full table + rationale (one cohesive `cross-service/` zone, not split across ops/po/architect/null).
- **Risk flags:** (1) FR-6 does not fix marker-lifecycle leak/release bugs — separate, unclosed rows; (2) `digest-daily` UTC-date quirk mirrored not fixed; (3) reconciler and catch-up detection must fail independently on `task_list_held` transport error, not couple into one abort path; (4) raised `fire_timeout_seconds` is a real (bounded) host-resource tradeoff; (5) `publish_date_basis` values should be re-grep-verified against live flow code at implementation time, not trusted from this point-in-time brief.
- **Scan clean:** true ✓
- **BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new `apps/<svc>`)

## RETURN
DONE: BA spec complete — requirements written to `docs/handoffs/BA-COWORK-GUARANTEED-SLOT-CATCHUP.md`. Zero PO blockers. Architect design complete — full brief `docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md`.
NEXT: pm — decompose FR-1..FR-10 into atomic dev tasks (single shared-module zone, sequential not parallel-dispatch); route the cron-runbook doc subtask to agent-father, the rest to developer; true up board row `type: SPRINT-S` → likely SPRINT-M/L given 10-FR/5-row scope (router-flagged, non-blocking).
HANDOFF: `docs/handoffs/BA-COWORK-GUARANTEED-SLOT-CATCHUP.md` + `docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md`
PIPELINE: continue
