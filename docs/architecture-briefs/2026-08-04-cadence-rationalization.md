<!-- size-justification: ~610L — full 6-family cron inventory (18 rows) + mechanism citations + implementation-ready specs for 3 concrete fixes (literal JSON rows, script contract, skill line-diffs) + a distinct operational-vs-design finding + Phase-3+ greenlight verdict + a re-sequenced numbered candidate list. PLAN-ONLY brief; no implementation performed, no files outside architecture-briefs/+signals/ touched. Widened 2026-08-04T19:24Z per user follow-up (coordinator relay): full cron coverage + implementation-ready specs + re-arm sequenced last. -->

# Cadence Rationalization — Cowork / Dev-Team / System-Auditor / Standalone Crons "Right Moment, Not All the Time"

**Date:** 2026-08-04 (updated 2026-08-04T19:24:22Z — widened scope + implementation-ready specs, see Update Log)
**Author:** agents-architect
**Status:** PLAN-ONLY — awaiting user confirmation of which numbered items (if any) to implement. No cron, flow, or `.task_board` files touched.
**Trigger:** Ad-hoc user request (project owner, via router): "reanalyze all workflow of cowork and dev team and system audit, i want it working on right moment, not all time, give me suggestion for i confirm before." Follow-up (same day, via coordinator): widen to ALL crons, make the confirmed-worth-fixing items implementation-ready, and sequence the fleet re-arm explicitly LAST — "i want analyze all crons workflow and correct this first before run all cron."
**As-of verification:** 2026-08-04T19:24:22Z (git log + live file reads, not memory-only)

### Update Log

- **2026-08-04T18:16Z (original):** 15-row inventory scoped to cowork-team/dev-team/system-auditor per the original ad-hoc request.
- **2026-08-04T19:24Z (this revision):** Widened to 18 rows — added `cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-code-janitor.md` (the 3 remaining standalone crons outside the original three families). Turned proposed items #2/#3/#4 into implementation-ready specs (literal JSON, script contract, skill line-diff). Re-sequenced §8 so the fleet re-arm is explicitly LAST, not first.

---

## 1. Scope and Method

Surveyed **every fixed-interval cron in the repo** — the three originally-scoped families (**cowork-team**, **dev-team**, **system-auditor**) plus the **3 standalone crons** that sit outside them (**agent-father**, **claude-manager-helper**, **code-janitor**), plus **orch-sentinel** (noted in parallel per the original request, not deep-audited). For each: read the live cron registration text (not just a SKILL.md summary — `cron-detect-loop/SKILL.md`'s registered prompts have diverged from `.claude/commands/crons/*.md`'s "manual reference" prompts on 3 of 4 jobs, confirmed by direct comparison), the pre-gate script if one exists, and the flow doc's own idle/exit logic.

Verified live rather than trusting stated facts verbatim:

- **`docs/data/pressure-state.json`** is stale: `emitted_at: 2026-08-01T18:06:23.045Z`, ~72h old against a 20-min staleness threshold.
- **Independent corroboration via git log:** the last "chore(signals): drain + prune" commit (the cowork/dev-team tick fingerprint) is `02d9ac3c7` at 2026-08-01T17:48:21Z. Zero fleet-cron commits in the ~3 days since, consistent with the router session's own `CronList` showing zero registered jobs.
- **New this revision:** grepped every `.claude/skills/*/SKILL.md` for references to `agent-father`, `claude-manager-helper`, `code-janitor` re-arm logic — **none exists**. Only `cron-cowork-team` and `cron-detect-loop` skills re-arm anything, and neither covers these 3 crons (nor `cron-db-data-integrity.md`, already flagged in the original pass). This means these 3 crons have **zero automated recovery** after any session restart, not merely the same 3-day gap measured for the other families — see §6.

---

## 2. Inventory — All 18 Fixed-Interval Crons Across 6 Families

| # | Cron / Slot | Family | Cadence (as coded) | Gating mechanism today | Classification |
|---|---|---|---|---|---|
| 1 | cowork-team master dispatcher | cowork | `*/15 * * * *` heartbeat | `scripts/agents-flow/cowork-tick-preflight.sh` — SILENT gate exits at near-zero cost when no slot matches/queue empty; per-slot cadence beneath it governed by #3–#6 | **Adaptive** (heartbeat-not-daemon model, DWF Phase 1, shipped 2026-05-31) |
| 2 | chef-morning/eod/evening, digest-sunday/daily, tnb-audit, fb-daily/weekend (**8 slots, `guaranteed:true`**) | cowork | fixed daily/weekly cron each | none — `guaranteed:true` bypasses `cadence-policy.json` entirely, by design | **Fixed, and correctly so** — see §4 |
| 3 | chef-intraday | cowork | `policy_id: chef-intraday` | `cadence-policy.json`: 60–120 min during market hours, scaled by volatility; suppressed weekend/holiday (never suppressed while `open`) | **Adaptive** |
| 4 | news-scout-offhours/-sentiment, market-watcher-offhours/-eod (4 slots) | cowork | `policy_id: gatherer-standard` | `cadence-policy.json`: 30–240 min scaled by signal-backlog + volatility tier; widens to 480 min weekend/holiday | **Adaptive** |
| 5 | bctc-analyst-slot-1..4, refine-bctc-slot-1..4 (8 slots) | cowork | `policy_id: bctc-offmarket` | `cadence-policy.json`: suppress on holiday, 1440 min on weekend, cron-fallback on open/half_day/unknown | **Adaptive** |
| 6 | alert-commander-market / alert-commander-critical (2 slots) | cowork | `policy_id` assigned, no matching rows | falls to evaluator's generic "unmatched" fallback (240min) if adaptive mode ever runs; agent's own flow already self-gates per spawn | **Latent config gap — implementation-ready fix in §8 item 1** |
| 7 | dev-team | dev-team | `7,37 * * * *` (30 min) | `dev-team-tick-preflight.sh`: SF-1 + fire-election dedup, plus Step-5 `RUN-IDLE` idle check (signals/db/signal_queue/active_sprints all empty/fresh → zero-cost exit) | **Adaptive at the action level**; bespoke, not on the shared policy table; poll interval itself fixed 24/7 |
| 8 | system-auditor Tier-1 (runtime ping) | system-auditor | `*/30 * * * *` | `auditor-tier1-probe.sh`: 6 read-only infra checks → SKIP-subagent-spawn on `ALL_GREEN` + heartbeat ≤60min | **Adaptive**; deliberately **not** market-hours-gated |
| 9 | system-auditor Tier-2 (freshness sweep) | system-auditor | `0 */4 * * *` | same probe `--tier=2`, SKIP-SPAWN on `ALL_GREEN` + heartbeat ≤480min, fail-open otherwise | **Adaptive** |
| 10 | system-auditor Tier-3 (deep DB integrity) | system-auditor | `0 2 * * *` | same probe `--tier=3`, SKIP-SPAWN on `ALL_GREEN` + heartbeat ≤2880min, fail-open otherwise | **Adaptive** |
| 11 | system-auditor Tier-4 (D-FLEET) | system-auditor | none | manual/PILOT only — confirmed never present in any cron config | **Confirmed correctly not-cron — no change** |
| 12 | system-auditor Tier-5 (D-PAGE) | system-auditor | `30 5/4 * * *` (daily, DST-corrected) | **NOT YET ARMED** — deliberately withheld pending 3 documented prerequisites | **Not live — deliberately withheld, not a "fires too often" case** |
| 13 | `cron-db-data-integrity.md` (AUDIT_TIER=DATA) | system-auditor-adjacent | `15,45 * * * *` (30 min) | **none** — unconditional full `system-auditor` subagent spawn every tick, 24/7/365 | **Naively fixed — implementation-ready fix in §8 item 2** |
| 14 | orch-sentinel MODE=FULL | meta (noted, not deep-audited) | `18 3 * * 0` (weekly, Sunday) | fixed-time only; Sunday deliberately chosen — VN market fully closed | **Fixed, deliberately calendar-timed** |
| 15 | orch-sentinel MODE=LITE | meta (noted, not deep-audited) | `48 1 * * *` (daily) | fixed-time only; runs **only** dimension OH-1 (fastest-moving) | **Fixed, but already consciously tiered by change-frequency** |
| **16** | **cron-agent-father.md** | **standalone (new this revision)** | **`23 14 * * *` (daily)** | **Dispatches unconditionally to `keep.md` (orphan + roster sweep) every day — no diff/mutation check found; runs the full scan regardless of whether any `.claude/agents/*.md` or `docs/agents/*/flow/*.md` file changed since yesterday** | **Naively fixed — lower severity (1x/day); see §8 item 5 (optional)** |
| **17** | **cron-claude-manager-helper.md** | **standalone (new this revision)** | **`30 19 * * 1,4` (Mon + Thu)** | **`git diff --name-only HEAD~3..HEAD`-based routing table + per-pass SKIP-IF stubs: empty diff on a non-Mon/Thu day → JUMP TO end near-zero-cost; Mon/Thu with no diff → lightweight "full-subtree heal" pass only, skipping the other 9 passes** | **Adaptive — best-in-class example in the whole survey; no change recommended** |
| **18** | **cron-code-janitor.md** | **standalone (new this revision)** | **`0 */6 * * *` (every 6h, 4x/day)** | **Mixed: 3 of 4 sweep legs (Memory Prune / Notebook Line-Cap / Cold Archive Sweep) are self-gating idempotent scripts with internal thresholds (cheap no-op most cycles); but the CORE DRY-duplication Decision-Tree scan has no diff-gate — runs a fresh full-codebase grep sweep every cycle regardless of whether any code changed since the last one** | **Naively fixed at the core scan — 2nd clearest gap found; see §8 item 3 (has a ready-made precedent fix sitting in the same repo — row 17)** |

---

## 3. Adaptive vs Naively-Fixed — Summary

**Already adaptive (rows 1, 3–5, 7–10, 17):** three parallel mechanisms, independently converged on the same principle:
- **cowork-team's `cadence-policy.json` engine** (rows 3–5) — shared, declarative, first-match-wins policy table + evaluator, driven by `pressure-state.json`.
- **dev-team's and system-auditor's bespoke idle/health gates** (rows 7–10) — inline shell logic that skips expensive work when there's nothing to do, never folded into the shared policy table.
- **claude-manager-helper's `git diff` routing table** (row 17) — a third, independently-built variant of the same idea, arguably the cleanest of the three: a real mutation-delta check (not a proxy like a heartbeat), with per-pass SKIP-IF stubs on top. **This is the pattern §8 item 3 proposes copying for code-janitor's own gap.**

**Naively fixed:**
- **`cron-db-data-integrity.md`** (row 13) — the clearest miss: zero conditioning of any kind, 48 full agent spawns/day.
- **`cron-code-janitor.md`'s core DRY scan** (row 18) — the second clearest miss, but only for the scan component; 3 of its 4 sweep legs already self-gate at the script level.
- **`cron-agent-father.md`** (row 16) — same shape of gap (unconditional full sweep), but lower severity given its 1x/day cadence.

**Latent gap, not yet biting (row 6):** the two `alert-commander-*` slots reference a cadence policy that doesn't exist in the config table — see §5.

**Correctly fixed by design (rows 2, 11, 14, 15):** calendar-anchored single deliverables, an on-demand-only pilot tier, and a deliberately-not-yet-armed tier all need no change.

---

## 4. Why the 8 `guaranteed:true` Cowork Slots Should Stay Fixed

`chef-morning`, `chef-eod`, `chef-evening`, `digest-sunday`, `digest-daily`, `tnb-audit`, `fb-daily`, `fb-weekend` are not polling loops — each *is* a scheduled deliverable in its own right. There is no "is there work to do" question to gate on; the work is "produce today's/this week's edition." No condition is proposed for these.

---

## 5. Latent Config Gap Found — Alert-Commander `policy_id` Points Nowhere

`docs/data/cowork-schedule.json` assigns `policy_id: "alert-commander-market"` and `policy_id: "alert-commander-critical"` to the two alert-commander slots, but **`docs/data/cadence-policy.json` has zero rows for either `policy_id`**. Traced the evaluator (`cadence-policy.js` `evaluateCadence()`): an unmatched `policy_id` does **not** fall back to legacy cron the way a `policy_id: null` slot does — it falls through to the function's generic "no rule matched" safe default, `{interval_minutes: 240, _cron_fallback: false}`. If adaptive mode is ever live this would silently convert `alert-commander-market`'s live-market `*/15 min` cadence into a 4-hour cadence — a real degradation for a safety/alerting lane.

Not currently causing harm (the whole fleet is in legacy-cron fallback right now per §6). Orthogonal to the cadence-design question — alert-commander's own flow already self-gates per spawn (documented in `cowork-schedule.json`'s own slot notes: the market slot "evaluates every 15min during market hours, exits silently if neither condition fires"; the critical slot "always fires," by design, for legal/regulatory/crisis coverage). The fix is a config completion, not new adaptive logic. **Exact rows to add → §8 item 1.**

---

## 6. Distinct Finding — This Is an Armed-State Gap, Not (Mostly) a Design Gap

- `cowork-team`, `dev-team`, and system-auditor Tier-1/2/3 are all **session-scoped `CronCreate` registrations** that evaporate on session exit regardless of the `durable` flag, per both `cron-cowork-team/SKILL.md` and `cron-detect-loop/SKILL.md`.
- Live evidence (§1) shows zero fleet-cron activity for ~3 days — every mechanism in §3's "already adaptive" bucket has been **dormant, not disproven**.
- `docs/data/pressure-state.json`'s 72h-old snapshot is a symptom of the same root cause, not an independent failure.
- Separately (deliberately, not the same failure mode): **orch-sentinel's crons** are PO-gated pending a mandatory-critique pass; **Tier-5 D-PAGE** is withheld pending its own prerequisites. Neither is "the loop broke."
- **`/cron-detect-loop` only re-arms 4 jobs** (dev-team + Tier-1/2/3). `cron-db-data-integrity.md` (row 13) is not covered by any re-arm skill.
- **New this revision:** `cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-code-janitor.md` (rows 16–18) are **also** covered by **zero** re-arm skill — grepped every `.claude/skills/*/SKILL.md`, confirmed no hits. Unlike the 3-day-measured gap for the other families, there is no way to bound how long these 3 have been dark from git history alone (their own commits — `chore(memory/agent-father)`, `chore(memory/code-janitor)`, `chore(memory/claude-manager-helper)` — would need a separate check per agent to date-bound; not performed here, out of scope for a PLAN-ONLY survey, flagged for whoever implements §8 item 4 to verify at execution time).

**Conclusion:** re-arming the fleet is a zero-design-change operational action. Per the user's explicit follow-up instruction, it is sequenced **last** in §8 below — after any config/script corrections are implemented and verified, not before.

---

## 7. Is This the Deferred Phase 3+ Greenlight?

**No.** Re-read both `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` and its Phase-1 blueprint (`2026-05-31-dwf-phase1-adaptive-cadence.md`) end to end. Phase 3 (content-addressed router), Phase 4 (persistent workgraph/DAG), and Phase 5 (backpressure governor) solve routing, dependency, and concurrency-budget problems — not firing cadence. The "right moment, not all the time" ask is Phase 1's domain, already shipped for cowork (2026-05-31). The widened audit (rows 16–18) reinforces rather than changes this verdict: `claude-manager-helper` independently reinvented the same Phase-1 principle a third time (via `git diff`, arguably better than either of the other two), further evidence that the gap is "fold existing tactical mechanisms together / patch the 2 remaining naive crons," not "unblock the deferred redesign." **Recommend: do not treat this request as the Phase 3+ greenlight.**

---

## 8. Proposed Changes — Numbered List for User Confirmation

**Nothing below has been implemented. No cron, flow, or `.task_board` file was touched authoring this brief.**

> **ORDERING CONSTRAINT (per explicit user instruction):** if the user greenlights any of items 1–7 below, those corrections must be **implemented and verified first**. Item 9 (re-arming the dormant fleet crons) must run **last**, only after any greenlit corrections are already live — so the fleet resumes on corrected logic, not on the same gaps this brief just found. Do not re-arm before implementing whatever subset of 1–7 the user picks.

### Item 1 — [CONFIG FIX, implementation-ready] Close the alert-commander `cadence-policy.json` gap

**File:** `docs/data/cadence-policy.json`
**Change:** append the following 10 rows to the end of the `policies` array (after the last `bctc-offmarket` row, before the closing `]`). Mirrors the existing `bctc-offmarket` shape (explicit row per `calendar_status` value, for auditability/consistency with the rest of the table) but pins `_cron_fallback: true` unconditionally for both policy IDs — this deliberately preserves *today's actual behavior* (cron governs, since alert-commander already self-gates per spawn) rather than introducing new suppression/widening logic, which would be a separate, larger design decision out of scope here:

```json
    { "policy_id": "alert-commander-market",   "calendar_status": "holiday",  "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-market",   "calendar_status": "weekend",  "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-market",   "calendar_status": "open",     "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-market",   "calendar_status": "half_day", "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-market",   "calendar_status": "unknown",  "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },

    { "policy_id": "alert-commander-critical", "calendar_status": "holiday",  "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-critical", "calendar_status": "weekend",  "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-critical", "calendar_status": "open",     "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-critical", "calendar_status": "half_day", "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "alert-commander-critical", "calendar_status": "unknown",  "signal_backlog_tier": "*", "volatility_tier": "*", "interval_minutes": null, "_cron_fallback": true }
```

**Verification:** `evaluateCadence("alert-commander-market", <any calendar_status>, ..., ...)` must now return `{interval_minutes: null, _cron_fallback: true}` for all 5 calendar statuses (currently returns the generic `{240, false}` unmatched-fallback — confirm via the existing test harness pattern, e.g. add 2 cases to `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` mirroring its existing T-11 `bctc-offmarket` boundary test). **No behavior change on the live system** — this only prevents a future regression once adaptive mode reactivates (§8 item 9).

---

### Item 2 — [NEW GATE, implementation-ready] Pre-gate script for `cron-db-data-integrity.md`

**New file:** `scripts/agents-flow/db-integrity-probe.sh` (same directory + naming convention as `auditor-tier1-probe.sh`).

**Reads (all read-only):**
- **NOT** `docs/data/db-integrity-history.json` — inspected its live content: it's an append-only array of ad-hoc, evolving `{scan_ts, findings[]/counts{}/context{}}` objects whose field shape has changed multiple times across scans (confirmed by comparing early vs. late entries in the live file). Too unstable to be a deterministic diff source for a new script.
- Instead, a **new dedicated snapshot file**, `docs/data/db-integrity-probe-last-snapshot.json`, sole-written by this new script (same sole-writer pattern as `auditor-tier1-last-healthy.json`), shape: `{"checked_at": "<ISO-UTC>", "tables": {"<table_name>": {"rowcount": N}, ...}}`.
- Live DB via the exact same read-only sidecar already documented in `cron-db-data-integrity.md`'s own prompt text (`docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 sqlite3 "file:/data/market.db?immutable=1" "<SQL>"`), one `SELECT COUNT(*) FROM <table>` per watched table (the same 17-table list already named in the cron prompt: `daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes, financial_reports, macro_indicators, sbv_rates, fred_series_daily, deep_fetch_queue, deep_fetch_stats, cron_job_runs, scheduler_locks`).

**v1 scope note (be honest about a known limitation, don't guess):** v1 uses `COUNT(*)` diff only — schema-agnostic, catches the dominant case (new rows arriving), safe without live schema access. A stronger `MAX(updated_at)`-style check is a known fast-follow, **not included here** because the exact freshness-column name per table was not verified against the live schema in this survey. Flagging `daily_ohlcv` specifically as the first candidate for that fast-follow: per the existing memory lesson `reference_daily_ohlcv_updated_at_is_mutation_not_arrival_backfill_rewrites_97pct`, nightly backfill rewrites ~97% of `daily_ohlcv` rows in place — a pure rowcount diff would under-detect real mutation on that one table. Acceptable for v1 since the daily Tier-3 deep-integrity sweep (row 10) still catches it on its own 24h cadence regardless.

**Writes:** only its own `docs/data/db-integrity-probe-last-snapshot.json` (tmp-file + rename, never a raw truncate-write — mirrors `auditor-tier1-probe.sh`'s own heartbeat-write pattern). Never writes `db-integrity-history.json` — that stays the system-auditor subagent's own output, unchanged.

**Verdict/exit contract (mirrors Tier-2/3's `--tier=N` SKIP-SPAWN/SPAWN shape exactly):**
- stdout: one-line JSON `{"verdict": "SKIP-SPAWN"|"SPAWN", "detail": "<reason>", "tables_changed": N, "checked_at": "<ISO-UTC>"}`.
- Exit code `0` = SKIP-SPAWN: **every** watched table's live `COUNT(*)` matches the last recorded snapshot exactly — nothing to re-scan.
- Exit code `1` = SPAWN (**FAIL-OPEN**, identical contract to Tier-2/3): at least one table's count changed, OR the snapshot file is missing/malformed/first-run, OR the live-DB sidecar query itself failed for any reason. Never suppress a legitimate run on a probe fault.

**Cron prompt change:** `.claude/commands/crons/cron-db-data-integrity.md`'s `prompt:` field gets a new first line, same shape as Tier-2/3's WU-3 pattern in `cron-detect-loop/register.md` Job 3/4:
```
Run: bash scripts/agents-flow/db-integrity-probe.sh and read its exit code + one-line JSON verdict. If exit code = 0 (verdict=SKIP-SPAWN): done, log '[cron-db-data-integrity] SKIP-SPAWN (no watched table row-count changed since last sweep)', do NOT spawn a subagent. FAIL-OPEN on anything else — exit code 1 (verdict=SPAWN, includes probe faults/missing snapshot/first-run): proceed to the existing prompt body below unchanged.
```
The existing prompt body (the full `AUDIT_TIER=DATA` instruction block) is otherwise **untouched** — this only prepends the gate, exactly as WU-2/WU-3 did for dev-team and system-auditor Tier-1.

**Also update:** the same cron needs registering into a re-arm skill — see item 4 below (this cron is currently unarmed with zero recovery path, same as rows 16–18).

---

### Item 3 — [NEW GATE, implementation-ready — new finding from the widened audit] Diff-gate for `cron-code-janitor.md`'s core DRY scan

**Precedent already exists in this repo** — `docs/agents/claude-manager-helper/flow/main.md`'s Pre-Check section (row 17) already does exactly this for a near-identical use case (both agents audit repo-wide code/doc drift on a multi-hour cadence).

**Change:** add a Pre-Check step to `docs/agents/code-janitor/flow/main.md`, inserted between the existing Step 0b ("Read notebook") and the Decision Tree section, mirroring `claude-manager-helper/flow/main.md`'s own Pre-Check shape:
```bash
git diff --name-only HEAD~3..HEAD
```
- If the diff touches zero files under the janitor's actual scan surface (source dirs the Reference Commands grep against — `src/`, `apps/*/src/`), **skip the Decision-Tree DRY scan this cycle** (JUMP TO the existing "every scan" sweeps — Memory Prune / Notebook Line-Cap / Cold Archive Sweep — which already have their own internal thresholds and should keep running regardless, they are cheap idempotent scripts).
- If the diff touches ≥1 file under scan scope, run the Decision-Tree DRY scan as today, unchanged.

**Rationale for the specific insertion point:** the 3 script-driven sweeps (Memory Prune, Notebook Line-Cap, Cold Archive) are correctly unconditional today — they are cheap idempotent scripts with their own internal no-op guards (e.g., Cold Archive Sweep already self-guards to a no-op except on the 1st of the month) and should NOT be gated behind a code-diff check (they sweep `docs/agent-memory/` and `docs/handoffs/`, not source code). Only the Decision-Tree DRY-duplication grep scan — the part with real per-invocation cost (multiple `grep -r` passes over `src/`) — should gate on `git diff`.

**No new script file needed** — this is a 3–5 line addition to the existing flow doc, reusing the same `git diff --name-only HEAD~3..HEAD` primitive `claude-manager-helper` already runs every cycle it fires.

---

### Item 4 — [COVERAGE GAP, exact skill file + line-level change] Bring the 4 unarmed crons under an auto-re-arm skill

**Affected crons (currently zero re-arm coverage, confirmed by grep in §1/§6):** `cron-db-data-integrity.md` (row 13, originally flagged), plus **new this revision**: `cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-code-janitor.md` (rows 16–18).

**Exact change:**
- **`.claude/skills/cron-detect-loop/SKILL.md`**
  - Frontmatter `description:` (lines 1–7) — update from "the 4 CronCreate entries that drive the anomaly-detection→dev-team-planning loop" to name the count as 8 and list the 4 new jobs alongside the existing 4.
  - Step 1 idempotency guard (currently checks 4 conditions, lines ~27–31) — add 4 more `cron_expression`/prompt-substring pairs to check for: `23 14 * * *` + prompt contains `agent-father/flow/main.md`; `30 19 * * 1,4` + prompt contains `claude-manager-helper/flow/main.md`; `0 */6 * * *` + prompt contains `code-janitor/flow/main.md`; `15,45 * * * *` + prompt contains `AUDIT_TIER=DATA` (or, once item 2 ships, contains `db-integrity-probe.sh`).
  - "If ALL 4 found → STOP" line updates to "If ALL 8 found → STOP."
- **`.claude/skills/cron-detect-loop/register.md`**
  - Add 4 new "Job N" blocks (Job 5–8) with the exact `CronCreate` calls, reusing each cron's existing cadence/prompt verbatim from its `.claude/commands/crons/*.md` authoring doc (Job 5 = db-data-integrity, gets the item-2 pre-gate prepended if that item ships; Jobs 6–8 = agent-father/claude-manager-helper/code-janitor, prompts unchanged unless item 3/5 ship first).
  - Update the "P3-OBSERVE-ONLY-RETIREMENT" period-key reference section if these 4 crons ever need fire-election locks (out of scope for this item — they don't currently have one, since they're single-fire-family crons with no multi-session collision history observed; flag as a separate, lower-priority follow-up if collision incidents are ever seen).

**Alternative considered and rejected for this item:** creating a brand-new 5th skill (`cron-standalone-team`) instead of extending `cron-detect-loop`. Rejected as first choice because these 4 crons share no dispatch-loop relationship with dev-team/Tier-1/2/3 the way `cron-detect-loop`'s name implies — extending an unrelated skill's scope is a naming-accuracy smell. **Recommend leaving the choice to whoever implements:** either extend `cron-detect-loop` as specified above (fastest, reuses existing idempotency-guard shape) OR spin up a new lightweight `cron-standalone-team` skill mirroring `cron-cowork-team`'s single-purpose shape (idempotency guard + N `CronCreate` calls, no dispatch-loop logic). Both close the coverage gap; the brief has no strong preference, flagging as an open sub-decision.

---

### Item 5 — [OPTIONAL, low priority — new finding from the widened audit] Diff-gate for `cron-agent-father.md`'s daily `keep.md` sweep

Same shape as item 3 (add a `git diff`-based skip for the orphan+roster scan when nothing under `.claude/agents/*.md` / `docs/agents/*/flow/*.md` changed since the last successful run), but marked lower priority: this cron fires once/day, not 4–48x/day, so the token-cost ceiling is already modest. Worth doing only as a batch with item 3 (same pattern, same effort) rather than on its own.

---

### Item 6 — [OPTIONAL, low priority] Widen dev-team's outer poll interval during confirmed extended-idle stretches

Extend dev-team's existing RUN-IDLE gate with a widened outer poll interval during confirmed extended-idle stretches (e.g., N consecutive `RUN-IDLE` ticks + weekend/holiday → widen 30min toward something like `gatherer-standard`'s 480min). Marked low priority: RUN-IDLE already makes idle ticks near-free — this buys fewer tick *counts*, not less real work. Worth doing only if tick-count/host-load itself is the concern.

---

### Item 7 — [OPTIONAL, consistency only] orch-sentinel LITE pre-gate

Consider giving orch-sentinel's daily LITE run (OH-1 plumbing check) the same `ALL_GREEN`+fresh-heartbeat shell pre-gate pattern system-auditor Tier-1/2/3 use. No concrete waste was found here — flagged only for consistency, and the cron is currently PO-gated/not yet armed at all regardless.

---

### Item 8 — [NO CHANGE — confirmed already correct, listed for completeness]

The 8 `guaranteed:true` cowork slots (§4); system-auditor Tier-4/D-FLEET (on-demand/PILOT only); Tier-5/D-PAGE (deliberately not yet armed); and **new this revision**, `claude-manager-helper`'s existing `git diff`-based gate (row 17) — this is the best-in-class example in the whole survey and should be left untouched. Need no action.

---

### Item 9 — [OPERATIONAL, sequenced LAST per explicit user instruction] Re-arm the fleet

Run `/cron-cowork-team` + `/cron-detect-loop` (and, once item 4 ships, whichever skill now also covers rows 13/16–18). **Do this only after** any of items 1–7 the user has greenlit are implemented and verified — the whole point of the ordering constraint at the top of this section is that the dormant crons should resume on corrected logic, not on the same gaps this brief just found.

---

## RETURN

```
DONE: Cadence-rationalization survey widened per user follow-up — 6-family, 18-cron inventory (was 15); 2 naively-fixed crons now confirmed with implementation-ready fixes (cron-db-data-integrity.md §8 item 2, code-janitor DRY scan §8 item 3); 1 config-gap fix made implementation-ready with literal JSON rows (§8 item 1); re-arm coverage gap widened to 4 crons with exact skill file + line-level change (§8 item 4); fleet re-arm explicitly re-sequenced to LAST (§8 item 9) per user instruction. Phase-3+ greenlight verdict unchanged: NO.
NEXT: user — confirm which of items 1–9 in §8 to greenlight (or none), remembering item 9 runs last regardless. No agent-father/dev-team implementation trigger sent; signal remains informational-only pending user pick.
HANDOFF: docs/architecture-briefs/2026-08-04-cadence-rationalization.md
PIPELINE: hold-for-user-confirmation
```
