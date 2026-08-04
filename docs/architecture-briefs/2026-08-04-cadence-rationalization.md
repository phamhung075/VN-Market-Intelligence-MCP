<!-- size-justification: ~430L — full 3-family cron inventory (15 rows) + mechanism citations + a distinct operational-vs-design finding + Phase-3+ greenlight verdict + numbered candidate list. PLAN-ONLY brief per explicit ad-hoc request; no implementation performed, no files outside architecture-briefs/+signals/ touched. -->

# Cadence Rationalization — Cowork / Dev-Team / System-Auditor "Right Moment, Not All the Time"

**Date:** 2026-08-04
**Author:** agents-architect
**Status:** PLAN-ONLY — awaiting user confirmation of which numbered items (if any) to implement. No cron, flow, or `.task_board` files touched.
**Trigger:** Ad-hoc user request (project owner, via router): "reanalyze all workflow of cowork and dev team and system audit, i want it working on right moment, not all time, give me suggestion for i confirm before."
**As-of verification:** 2026-08-04T18:12:51Z (git log + live file reads, not memory-only)

---

## 1. Scope and Method

Surveyed every fixed-interval cron across the three always-running loop families — **cowork-team**, **dev-team**, **system-auditor** — plus **orch-sentinel** (noted in parallel per the request, not deep-audited). For each: read the live cron registration text (not just the SKILL.md summary — `cron-detect-loop/SKILL.md`'s registered prompts have diverged from `.claude/commands/crons/*.md`'s "manual reference" prompts on 3 of 4 jobs, confirmed by direct comparison), the pre-gate script if one exists, and the flow doc's own idle/exit logic. Verified two things live rather than trusting the ad-hoc brief's stated facts verbatim:

- **`docs/data/pressure-state.json`** is genuinely stale: `emitted_at: 2026-08-01T18:06:23.045Z`, now 2026-08-04T18:12Z — ~72h old against a 20-min staleness threshold (`cadence-policy.json._staleness_threshold_minutes`).
- **Independent corroboration via git log:** the last "chore(signals): drain + prune" commit (the cowork/dev-team tick fingerprint left by every live dispatch) is `02d9ac3c7` at 2026-08-01T17:48:21Z. Zero fleet-cron commits in the ~3 days since. This is not just pressure-state going stale — the cowork-team and dev-team dispatchers have not ticked at all in that window, consistent with the router session's own `CronList` showing zero registered jobs.

One correction to the ad-hoc brief's stated facts: point #6 named orch-sentinel's cadence as `15 3 * * 0` / `45 1 * * *`. The live authoring doc (`.claude/commands/crons/cron-orch-sentinel.md`) states `18 3 * * 0` (FULL) / `48 1 * * *` (LITE) — close but not identical; corrected below from source.

---

## 2. Inventory — All 15 Fixed-Interval Crons Across the Three Families

| # | Cron / Slot | Family | Cadence (as coded) | Gating mechanism today | Classification |
|---|---|---|---|---|---|
| 1 | cowork-team master dispatcher | cowork | `*/15 * * * *` heartbeat | `scripts/agents-flow/cowork-tick-preflight.sh` — SILENT gate exits at near-zero cost (script-only, no `main.md` read) when no slot matches/queue empty; per-slot cadence beneath it governed by #3-#6 | **Adaptive** (heartbeat-not-daemon model, DWF Phase 1, shipped 2026-05-31) |
| 2 | chef-morning/eod/evening, digest-sunday/daily, tnb-audit, fb-daily/weekend (**8 slots, `guaranteed:true`**) | cowork | fixed daily/weekly cron each | none — `guaranteed:true` bypasses `cadence-policy.json` entirely, by design (BLOCKER-2 of the Phase-1 blueprint) | **Fixed, and correctly so** — see §4 |
| 3 | chef-intraday | cowork | `policy_id: chef-intraday` | `cadence-policy.json`: 60–120 min during market hours, scaled by volatility; suppressed weekend/holiday (never suppressed while `open` — EC-6 audit) | **Adaptive** |
| 4 | news-scout-offhours/-sentiment, market-watcher-offhours/-eod (4 slots) | cowork | `policy_id: gatherer-standard` | `cadence-policy.json`: 30–240 min scaled by signal-backlog + volatility tier; widens to 480 min weekend/holiday | **Adaptive** |
| 5 | bctc-analyst-slot-1..4, refine-bctc-slot-1..4 (8 slots) | cowork | `policy_id: bctc-offmarket` | `cadence-policy.json`: suppress on holiday, 1440 min (once/day) on weekend, cron-fallback on open/half_day/unknown | **Adaptive** |
| 6 | alert-commander-market / alert-commander-critical (2 slots) | cowork | `policy_id` assigned (`alert-commander-market`/`-critical`) | **no matching rows exist for either `policy_id` in `cadence-policy.json`** — see §3 finding below; agent's own flow already self-gates per spawn (exits silently if no alert condition fires) | **Latent config gap** — currently masked because the whole system is in legacy-cron fallback (see §5) |
| 7 | dev-team | dev-team | `7,37 * * * *` (30 min) | `scripts/agents-flow/dev-team-tick-preflight.sh`: SF-1 singleton + fire-election dedup, **plus a Step-5 idle check** (drainable-signal count, `signals.db` freshness, `signal_queue` NEW-row count, `task_board.active_sprints` emptiness — all empty/fresh → `RUN-IDLE` verdict → release both locks, zero commit, zero board walk, jump straight to end) | **Adaptive at the action level** (bespoke, not on the shared `cadence-policy.json` table); the 30-min *poll* interval itself is fixed 24/7/365 |
| 8 | system-auditor Tier-1 (runtime ping) | system-auditor | `*/30 * * * *` | `scripts/agents-flow/auditor-tier1-probe.sh`: 6 read-only infra checks (docker ps, mcp-server :3000, frontend :3001, disk<85%, per-container mem<85%, launchd loaded) → SKIP-subagent-spawn on `ALL_GREEN` + heartbeat ≤60min | **Adaptive** (health/mutation-delta gated); deliberately **not** market-hours-gated |
| 9 | system-auditor Tier-2 (freshness sweep) | system-auditor | `0 */4 * * *` | same probe, `--tier=2`, SKIP-SPAWN on `ALL_GREEN` + heartbeat ≤480 min, fail-open on anything else | **Adaptive** |
| 10 | system-auditor Tier-3 (deep DB integrity) | system-auditor | `0 2 * * *` | same probe, `--tier=3`, SKIP-SPAWN on `ALL_GREEN` + heartbeat ≤2880 min, fail-open | **Adaptive** |
| 11 | system-auditor Tier-4 (D-FLEET) | system-auditor | none | manual/PILOT invocation only — confirmed never present in any cron config (`docs/agents/system-auditor/flow/main.md:67`) | **Confirmed correctly not-cron — no change** |
| 12 | system-auditor Tier-5 (D-PAGE) | system-auditor | `30 5/4 * * *` (daily, DST-corrected) | **NOT YET ARMED** — `cron-auditor-page-reverify.md` explicitly withholds arming pending 3 documented prerequisites | **Not live — deliberately withheld, not a "fires too often" case** |
| 13 | `cron-db-data-integrity.md` (AUDIT_TIER=DATA) | system-auditor-adjacent | `15,45 * * * *` (30 min) | **none** — unconditional full `system-auditor` subagent spawn every tick, 24/7/365, no shell pre-gate, no market-hours check, no mutation-delta check | **Naively fixed — the clearest gap found in this audit** |
| 14 | orch-sentinel MODE=FULL | meta (noted, not deep-audited) | `18 3 * * 0` (weekly, Sunday) | fixed-time only; Sunday deliberately chosen — VN market fully closed | **Fixed, deliberately calendar-timed** |
| 15 | orch-sentinel MODE=LITE | meta (noted, not deep-audited) | `48 1 * * *` (daily) | fixed-time only; runs **only** dimension OH-1 (fastest-moving) — the cron doc itself states running OH-2/3/4 daily would be "pure token cost with zero new signal" | **Fixed, but already consciously tiered by change-frequency** |

---

## 3. Adaptive vs Naively-Fixed — Summary

**Already adaptive (rows 1, 3–5, 7–10):** two genuinely different but equally load-bearing mechanisms exist in the codebase today:
- **cowork-team's `cadence-policy.json` engine** (rows 3–5) — a shared, declarative, first-match-wins policy table + evaluator module (`scripts/agents-flow/cadence-policy.js`), driven by `pressure-state.json` (calendar status, signal backlog tier, volatility tier).
- **dev-team's and system-auditor's bespoke script-level idle/health gates** (rows 7–10) — inline shell logic (`dev-team-tick-preflight.sh` Step 5, `auditor-tier1-probe.sh`) that independently reinvents the same "skip the expensive part when there's nothing to do" principle, but was never folded into the shared policy table. They are correct and effective as-is, just architecturally parallel rather than unified.

**Naively fixed (row 13):** `cron-db-data-integrity.md` is the one clean miss — it fires a full agent spawn every 30 minutes, every day, with zero conditioning of any kind, unlike every other system-auditor tier which has a shell pre-gate.

**Latent gap, not yet biting (row 6):** the two `alert-commander-*` slots carry `policy_id` values that were never added to `cadence-policy.json` — see §5.

**Correctly fixed by design (rows 2, 11, 14, 15):** calendar-anchored single deliverables, an on-demand-only pilot tier, and a deliberately-not-yet-armed tier all need no change.

---

## 4. Why the 8 `guaranteed:true` Cowork Slots Should Stay Fixed

`chef-morning`, `chef-eod`, `chef-evening`, `digest-sunday`, `digest-daily`, `tnb-audit`, `fb-daily`, `fb-weekend` are not polling loops — each *is* a scheduled deliverable in its own right (publish the morning brief at market open, the EOD wrap at close, the weekly digest on Sunday evening, the daily audit at a fixed hour). There is no "is there work to do" question to gate on; the work is "produce today's/this week's edition," which by definition happens once per calendar period regardless of market activity that day. No condition is proposed for these.

---

## 5. Latent Config Gap Found — Alert-Commander `policy_id` Points Nowhere

`docs/data/cowork-schedule.json` assigns `policy_id: "alert-commander-market"` and `policy_id: "alert-commander-critical"` to the two alert-commander slots, but **`docs/data/cadence-policy.json` has zero rows for either `policy_id`**. Traced the evaluator (`cadence-policy.js` `evaluateCadence()`): an unmatched `policy_id` does **not** fall back to legacy cron the way a `policy_id: null` slot does — it falls through to the function's generic "no rule matched" safe default, `{interval_minutes: 240, _cron_fallback: false}`. If adaptive mode is ever live (requires fresh `pressure-state.json` — currently false, see §6) this would silently convert `alert-commander-market`'s live-market `*/15 min` cadence into a 4-hour cadence — a real degradation for a safety/alerting lane, though `alert-commander-critical`'s off-hours 4h cron happens to coincide with the same 240-min default so it would not regress.

This is not currently causing harm (the whole fleet is in legacy-cron fallback right now per §6), and it is orthogonal to the "right moment" cadence-design question — alert-commander's own flow already self-gates per spawn (documented in `cowork-schedule.json`'s own slot notes: the market slot "evaluates every 15min during market hours, exits silently if neither condition fires"; the critical slot "always fires," by design, for legal/regulatory/crisis coverage). The fix is a config completion, not new adaptive logic — see proposed item #2.

---

## 6. Distinct Finding — This Is an Armed-State Gap, Not (Mostly) a Design Gap

Per the ad-hoc brief's own framing, this is called out separately from the cadence-design question above:

- `cowork-team`, `dev-team`, and system-auditor Tier-1/2/3 are all **session-scoped `CronCreate` registrations** (documented in both `cron-cowork-team/SKILL.md` and `cron-detect-loop/SKILL.md`: "crons evaporate on session exit regardless of `durable` flag ... must be re-armed after every session restart").
- Live evidence (§1) shows zero fleet-cron activity for ~3 days — the router session's `CronList` reports empty. This means **every mechanism in §3's "already adaptive" bucket has been dormant, not disproven** — the cadence engine, the RUN-IDLE gate, and the shell pre-gates have simply not run to prove or falsify themselves recently.
- `docs/data/pressure-state.json` is stale for the same reason: it is only written by a live cowork-team tick (Step 4.8), so its 72h-old `calendar_status: closed` / `signal_backlog: 17` is a symptom of the same root cause, not an independent failure in the pressure-emit path.
- Separately (deliberately, not the same failure mode): **orch-sentinel's crons are not yet armed at all** — `cron-orch-sentinel.md` states explicitly this is a PO-gated action pending a mandatory-critique pass, unrelated to session-restart evaporation. **Tier-5 D-PAGE** is likewise deliberately withheld pending its own 3 prerequisites. Neither should be read as "the loop broke."
- One coverage gap found while tracing this: `/cron-detect-loop` only re-arms 4 jobs (dev-team + Tier-1/2/3). `cron-db-data-integrity.md`'s cron (row 13) is **not** covered by any re-arm skill — even after re-arming the other 4, this one stays dark unless someone remembers to `CronCreate` it by hand every session restart.

**Conclusion:** re-arming the fleet (`/cron-cowork-team` + `/cron-detect-loop`) is a zero-design-change operational action, separate from anything in §8's numbered list, and is very likely the single biggest contributor to whatever "fires all the time" or "feels broken" perception prompted this request — because right now the correct answer to "how often does anything fire" is "not at all," which is a different problem than "fires too often."

---

## 7. Is This the Deferred Phase 3+ Greenlight?

**No.** Re-read both `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` and its Phase-1 blueprint (`2026-05-31-dwf-phase1-adaptive-cadence.md`) end to end. The deferred phases solve different problems than "fire at the right moment":

- **Phase 3 (content-addressed router)** — replaces the "everything → PO" hand-maintained dispatch table with envelope-based routing. Not a cadence problem.
- **Phase 4 (persistent workgraph/DAG)** — replaces faked time-gap `depends_on` edges with real completion-signal dependencies. Not a cadence problem.
- **Phase 5 (backpressure governor)** — sizes spawn *concurrency* budget from host memory headroom. Adjacent to but distinct from firing *cadence*.

The "right moment, not all the time" ask is squarely **Phase 1's domain**, and Phase 1 already shipped for the cowork family on 2026-05-31 (confirmed live in `cadence-policy.json` / `cadence-policy.js` / `cowork-match-slots.js` / `cowork-team/flow/main.md` Steps 4.2–5b). What this survey found is that dev-team and system-auditor independently reinvented the same principle as their own bespoke script gates rather than joining the shared table — a smaller, already-mostly-solved gap, not evidence that Phase 3+ needs unblocking. **Recommend: do not treat this request as the Phase 3+ greenlight.** Nothing found here changes the 2026-05-30 review verdict that Phase 3/4/5 stay deferred.

---

## 8. Proposed Changes — Numbered List for User Confirmation

**Nothing below has been implemented. No cron, flow, or `.task_board` file was touched authoring this brief.** Pick any subset; each is independently shippable.

1. **[OPERATIONAL, zero design change]** Re-arm the fleet: run `/cron-cowork-team` + `/cron-detect-loop`. Restores DWF-Phase1 adaptive cadence, dev-team's RUN-IDLE gate, and system-auditor Tier-1/2/3's shell pre-gates to live operation, and resumes `pressure-state.json` refresh. Likely the highest-impact single action given §6.

2. **[CONFIG FIX, small]** Add explicit `_cron_fallback: true` rows for `alert-commander-market` and `alert-commander-critical` to `docs/data/cadence-policy.json` (mirrors the existing `bctc-offmarket` pattern), closing the dead-config gap in §5 before adaptive mode is ever re-activated on a fresh `pressure-state.json`.

3. **[NEW GATE, small script]** Add a cheap shell pre-gate to `cron-db-data-integrity.md` (row 13), mirroring `auditor-tier1-probe.sh`'s shape: one aggregate query (rowcount + `MAX(updated_at)`) per watched table, diffed against the last snapshot already recorded in `docs/data/db-integrity-history.json`; skip the full subagent spawn when nothing has moved since the last sweep. This is the one cron in the whole survey with zero conditioning today.

4. **[COVERAGE GAP, operational]** Add `cron-db-data-integrity.md`'s registration to the `/cron-detect-loop` re-arm skill (currently covers only 4 of the 5 detect-loop-adjacent crons), so it does not stay silently dark after future session restarts.

5. **[OPTIONAL, low priority]** Extend dev-team's existing RUN-IDLE gate with a widened outer poll interval during confirmed extended-idle stretches (e.g., N consecutive `RUN-IDLE` ticks + weekend/holiday → widen 30min toward something like `gatherer-standard`'s 480min), either by adding dev-team as a new `policy_id` on the shared `cadence-policy.json` table or an equivalent inline rule in `dev-team-tick-preflight.sh`. Marked low priority: RUN-IDLE already makes idle ticks near-free (script-only exit, zero commit, zero board write) — this buys fewer tick *counts*, not less real work. Worth doing only if tick-count/host-load itself (not token cost on idle ticks) is the concern.

6. **[OPTIONAL, consistency only]** Consider giving orch-sentinel's daily LITE run (OH-1 plumbing check) the same `ALL_GREEN`+fresh-heartbeat shell pre-gate pattern system-auditor Tier-1/2/3 use. No concrete waste was found here — LITE already runs only the single fastest-moving dimension, and the cron is currently PO-gated/not yet armed at all — flagged only for consistency across the fleet, per the "for consistency's sake" framing in the original ask.

7. **[NO CHANGE — confirmed already correct, listed for completeness]** The 8 `guaranteed:true` cowork slots (§4), system-auditor Tier-4/D-FLEET (on-demand/PILOT only, confirmed never cron-registered), and Tier-5/D-PAGE (deliberately not yet armed pending its own 3 prerequisites) need no action.

---

## RETURN

```
DONE: Cadence-rationalization survey complete — 3-family, 15-cron inventory; 1 naively-fixed cron found (cron-db-data-integrity.md), 1 latent config gap found (alert-commander policy_id), 1 distinct armed-state finding (fleet crons unarmed ~3 days, NOT a design failure), Phase-3+ greenlight verdict: NO.
NEXT: user — confirm which of the 7 numbered items in §8 to greenlight (or none). No agent-father implementation trigger sent; signal is informational-only pending user pick.
HANDOFF: docs/architecture-briefs/2026-08-04-cadence-rationalization.md
PIPELINE: hold-for-user-confirmation
```
