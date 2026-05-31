<!-- size-justification: 490L — Phase 1 technical blueprint; 4 BLOCKERs resolved inline; full policy table (bctc-offmarket policy added per OQ-P1-3); flow step-by-step insertion layout; file list for PM task breakdown; DDD layer map; test strategy with DV proof mapping. No code produced. -->

# DWF-PHASE1 — Adaptive Cadence: Technical Blueprint

**Sprint:** DWF-PHASE1
**Task:** P1-ARCH
**Author:** architect · 2026-05-31
**Status:** DESIGN COMPLETE — hand to PM (P1-PM)
**Input:**
- `docs/REQ_DYN-WF-PHASE1.md` (APPROVED spec, 2026-05-31)
- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` (Phase 0+2 foundation brief)
- `docs/agents/cowork-team/flow/main.md` (brownfield — Steps 0b/4.6/4.6b/4.7/4.8/5)
- `scripts/agents-flow/cowork-match-slots.js` (brownfield slot matcher)
- `docs/data/cowork-schedule.json` (14 enabled slots)
- `docs/data/pressure-state.json` (live schema — 9 fields)

**Precondition confirmed:** Phase 0 + Phase 2 SHIPPED (DWF-EXIT 2026-05-31). Leader lock (Step 0b), suffix-free per-slot token (Step 4.6 `cowork-slot:<slot_id>`), published-marker belt (Step 5) are all live on `main`.

---

## Zone

**Single zone: cross-service**

All Phase 1 changes live in:
- `scripts/agents-flow/cowork-match-slots.js` — adaptive mode extension
- `docs/data/cowork-schedule.json` — `policy_id` + `last_fired` fields per slot
- `docs/data/cadence-policy.json` — NEW: policy look-up table SSOT
- `docs/agents/cowork-team/flow/main.md` — new Steps 4.2, 4.3, 4.4, 4.5, 5b inserted

**Zone `apps/mcp-server/` is untouched** (NFR-P1-5 hard constraint). `is_trading_day` MCP tool already exists from Phase 0 — no new MCP tools.

Test file: `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (see BLOCKER-4 resolution).

**BUILD-STANDARD: lean** (cross-service/ exists, extending not replacing)

---

## BLOCKER-1 RESOLUTION — Insertion Point: Suppression BEFORE Per-Work-Item Claim

**Decision: calendar suppression and cadence due-check run AFTER slot matching (Step 2+3) and BEFORE Step 4.6 per-work-item claim. A suppressed slot NEVER acquires a `cowork-slot:<slot_id>` token.**

Rationale:
- A slot suppressed AFTER acquiring the per-work-item claim would hold the `cowork-slot:<slot_id>` token (TTL=180s) even after exit. The slot is then un-claimable by any session for up to 180 seconds — equivalent to a 3-minute starvation window. Although the TTL auto-expires, this is avoidable structural waste and violates NFR-P1-3 (never worse than today) if a guaranteed slot is involved.
- The BA recommendation (before-claim) is confirmed. The Phase 2 invariants (leader lock at Step 0b, per-work-item claim at Step 4.6) are untouched. Phase 1 logic gates the SET of slots that reaches Step 4.6 — it does not modify or bypass Step 4.6 itself.
- AC-P1-4-3 (suppressed slot releases token) is satisfied by design: a slot that never claims cannot have a stale token to release. The "release" obligation described in the spec is rendered vacuous for the before-claim path — which is the correct resolution.

**New step layout in `cowork-team/flow/main.md`:**

```
Step 0a  — Drain DASHBOARD.md (unchanged)
Step 0b  — Claim cowork-leader lock (unchanged — Phase 2)
Step 1   — Resolve current UTC (unchanged)
Step 2+3 — Match enabled slots via cowork-match-slots.js (unchanged — returns cron-matched candidates)
Step 3b  — Drift threshold guard (unchanged)
Step 4   — Silent exit if MATCHES empty (unchanged)
Step 4b  — Collision-detection guard (unchanged)

★ NEW Step 4.2 — Read and validate pressure-state.json (staleness gate)
★ NEW Step 4.3 — Calendar suppression (is_trading_day result — shared from Step 4.8 prev tick OR re-read)
★ NEW Step 4.4 — Cadence due-check: compute CADENCE_MATCHES ⊆ MATCHES via adaptive mode
★ NEW Step 4.5 — Freshness silent-downgrade for gatherer slots
★ NEW Step 4.5b — Final MATCHES = intersection of calendar-allowed + cadence-due

Step 4.6 — Per-work-item claim: operates on CADENCE_MATCHES (not raw MATCHES) — Phase 2 UNCHANGED
Step 4.6b — Heartbeat leader lock (unchanged — Phase 2)
Step 4.7 — Write shared tick snapshot (unchanged)
Step 4.8 — Emit pressure-state.json (unchanged — Phase 0)
Step 5   — Parallel fan-out: WON_SLOTS only (unchanged — Phase 2)
★ NEW Step 5b — Write last_fired for WON_SLOTS (batched atomic patch — see BLOCKER-3)
Step 6   — Write telemetry signal (extend payload — see below)
```

**Higher fire rate safety:** When cadence policy fires `chef-intraday` at 60-min intervals (vs. the cron's hourly coverage), the path is: new tick → Step 4.4 computes `due=true` → slot enters CADENCE_MATCHES → Step 4.6 claims `cowork-slot:chef-intraday` (suffix-free) → same Phase 2 dedup path. No bypass. NFR-P1-1 preserved.

---

## BLOCKER-2 RESOLUTION — Policy ID Assignment for All 14 Enabled Slots

**Full assignment table:**

| slot_id | guaranteed | current cron | policy_id | Rationale |
|---|---|---|---|---|
| `chef-morning` | true | `15 5 * * 1-5` | `null` (guaranteed-floor) | guaranteed=true; cron governs; policy cannot suppress |
| `chef-intraday` | false | `13 2-8 * * 1-5` | `chef-intraday` | Market-hours chef; 60 min under high pressure; never suppress during `open` (EC-6) |
| `chef-eod` | true | `45 8 * * 1-5` | `null` (guaranteed-floor) | guaranteed=true; cron governs |
| `chef-evening` | true | `45 19 * * *` | `null` (guaranteed-floor) | guaranteed=true; cron governs |
| `digest-sunday` | true | `47 13 * * 0` | `null` (guaranteed-floor) | guaranteed=true; weekly; cron governs |
| `tnb-audit` | true | `13 20 * * *` | `null` (guaranteed-floor) | guaranteed=true; daily audit; cron governs |
| `bctc-analyst-slot-1` | false | `0 15 * * *` | `bctc-offmarket` | OQ-P1-3: holiday→suppress, weekend→1440min, open→cron |
| `bctc-analyst-slot-2` | false | `0 18 * * *` | `bctc-offmarket` | same |
| `bctc-analyst-slot-3` | false | `0 21 * * *` | `bctc-offmarket` | same |
| `bctc-analyst-slot-4` | false | `0 0 * * *` | `bctc-offmarket` | same |
| `news-scout-offhours` | false | `0 */4 * * *` | `gatherer-standard` | Off-hours gatherer; eligible for freshness downgrade |
| `news-scout-sentiment` | false | `0 5 * * 1-5` | `gatherer-standard` | Pre-market batch; eligible for freshness downgrade |
| `market-watcher-offhours` | false | `0 */4 * * *` | `gatherer-standard` | Off-hours gatherer; eligible for freshness downgrade |
| `market-watcher-eod` | false | `0 16 * * 1-5` | `gatherer-standard` | Post-close batch; eligible for freshness downgrade |

**Notes on guaranteed-floor slots:** `policy_id` is written as `null` in `cowork-schedule.json`. The adaptive matcher treats `policy_id: null` as legacy cron fallback (AC-P1-2-1). No `guaranteed-floor` sentinel entry is needed in `cadence-policy.json` — the null path short-circuits before any policy look-up.

**Missing policy_id defensive rule (BLOCKER-2 invariant):** If a slot has a non-null `policy_id` that does not match any policy in `cadence-policy.json`, the adaptive matcher treats it as `policy_id: null` (legacy cron fallback) and logs a WARN. This is the "unknown policy → conservative fallback" rule — never dispatch-blocking.

---

## BLOCKER-3 RESOLUTION — Batched Atomic `last_fired` Write

**Decision: single batched read → update-all-WON → write-to-tmp → rename after Step 5 fan-out completes.**

Rationale:
- Parallel per-slot writes are a classic lost-update: slot A reads schedule.json, slot B reads it in parallel, A writes (updating its slot), B writes (overwriting A's write using its stale read). Net result: only B's `last_fired` is persisted. For a 14-slot schedule this is non-trivially lossy.
- The serial-per-slot alternative avoids the race but introduces N sequential file I/O operations (14 reads + 14 writes at peak). Unnecessary complexity.
- Batched single write is simpler, deterministic, and O(1) file operations regardless of fan-out count.

**Step 5b algorithm (inserted after fan-out, before Step 6):**

```
NEW Step 5b — Batch last_fired write (after all fan-out attempts complete)

FIRED_AT = NOW_ISO  # use same timestamp for all WON_SLOTS in this tick

if WON_SLOTS is non-empty:
  SCHED_TMPFILE = "docs/data/cowork-schedule.json.tmp"

  # Single read
  schedule = JSON.parse(readFileSync("docs/data/cowork-schedule.json"))

  # Update in memory — only for WON_SLOTS (suppressed + held slots untouched)
  for each slot in schedule.slots:
    if slot.slot_id in [s.slot_id for s in WON_SLOTS]:
      slot.last_fired = FIRED_AT

  # Atomic write: tmp then rename
  writeFileSync(SCHED_TMPFILE, JSON.stringify(schedule, null, 2))
  renameSync(SCHED_TMPFILE, "docs/data/cowork-schedule.json")

On write failure:
  log "[cowork-team] WARN: last_fired write failed: <error> — slot(s): <WON_SLOT_IDS>"
  # Non-fatal: spawn already happened. Next tick computes due from stale last_fired.
  # Conservative: under-suppress (slot may fire again at next tick) — never over-suppress.
  # Do NOT abort or roll back the spawn (FR-P1-7 AC-P1-7-3).
```

**Interaction with EC-5 (concurrent agent-father edits):** The last-write-wins clobber is accepted for Phase 1 as stated in the spec. The write is targeted at `last_fired` only — a concurrent agent-father structural change to a different slot's fields is the risk. Mitigation: log the write timestamp in Step 5b telemetry. The window is narrow (agent-father edits are rare + manual). No file-lock mechanism required in Phase 1.

**No update for FAILED spawns:** Step 5 tracks spawn results (`spawned[]` vs `errors[]`). Step 5b only writes `last_fired` for slots in `WON_SLOTS` where spawn returned success (no agent tool error). A failed spawn does not advance `last_fired` (FR-P1-7 AC-P1-7-2).

---

## BLOCKER-4 RESOLUTION — Cadence Evaluator Module Location and Test Harness

**Decision: cadence evaluator logic extracted into a shared module `cadence-policy.js` co-located with `cowork-match-slots.js` in `scripts/agents-flow/`. Test file lives in `apps/mcp-server/src/__tests__/` using Bun test runner, importing the evaluator via `require`/`import` with a relative path.**

Detailed rationale:

1. **The cadence evaluator is pure JS/JSON logic** — no DB, no HTTP, no MCP calls. It reads `cadence-policy.json` (a JSON file) and evaluates `(policy_id, pressure_state) → interval_minutes`. This is a pure function suitable for Node.js module export.

2. **`scripts/agents-flow/` is the natural home** for cowork dispatch logic. `cowork-match-slots.js` already uses `module.exports` (CommonJS), is testable via the test harness (see existing pattern: `module.exports = { cronMatches, matchSlots, field, dowMatch }`), and is scoped to cross-service dispatch logic. The evaluator `cadence-policy.js` follows the same pattern.

3. **`cowork-match-slots.js` is extended (not replaced):** The `--mode=adaptive` logic calls `require('./cadence-policy.js')` to access the evaluator. The `matchSlots()` function gains an optional `options` parameter:
   - `options.mode = 'legacy'` (default): existing behavior, unchanged
   - `options.mode = 'adaptive'`: for each slot with `policy_id != null`, calls `evaluateCadence(slot, pressureState)` → `due` boolean; for `policy_id == null` slots, falls through to cron-match
   - The `--mode` switch in the CLI entrypoint (`require.main === module` block) reads mode from cadence-policy.json presence.

4. **Test harness:** `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` uses Bun test runner (`bun:test`) — consistent with all other test files in the zone (see `dev-standards.md` test template). The test file imports the evaluator directly:
   ```typescript
   // Node resolve path from apps/mcp-server/ to scripts/agents-flow/
   const { evaluateCadence, loadCadencePolicy } = require('../../../../scripts/agents-flow/cadence-policy.js');
   ```
   No mcp-server source code is involved — the test only exercises the `scripts/agents-flow/` module. No new MCP server code is written (NFR-P1-5). The test lives in `apps/mcp-server/src/__tests__/` to reuse the existing `bun test` runner infrastructure (no new test harness setup needed).

5. **Zone boundary:** `scripts/agents-flow/cadence-policy.js` is cross-service zone. `DWF-phase1-cadence.test.ts` lives in mcp-server zone for harness reuse but tests ZERO mcp-server code. PM must note this in the developer handoff to prevent scope confusion.

---

## Cadence Policy Table — `docs/data/cadence-policy.json`

Full expanded policy table encoding all PO decisions (OQ-P1-1, OQ-P1-3 + EC-6 audit):

```json
{
  "_ssot": "docs/data/cadence-policy.json",
  "_description": "DWF-PHASE1 cadence policy table. First-match wins (array order). interval_minutes: null = suppress. guaranteed=true slots bypass this table entirely (cron governs).",
  "_staleness_threshold_minutes": 20,
  "policies": [

    // --- gatherer-standard: news-scout-*, market-watcher-* ---
    { "policy_id": "gatherer-standard", "calendar_status": "open",    "signal_backlog_tier": "high",   "volatility_tier": "*",    "interval_minutes": 30 },
    { "policy_id": "gatherer-standard", "calendar_status": "open",    "signal_backlog_tier": "medium", "volatility_tier": "*",    "interval_minutes": 60 },
    { "policy_id": "gatherer-standard", "calendar_status": "open",    "signal_backlog_tier": "low",    "volatility_tier": "high", "interval_minutes": 60 },
    { "policy_id": "gatherer-standard", "calendar_status": "open",    "signal_backlog_tier": "low",    "volatility_tier": "low",  "interval_minutes": 240 },
    { "policy_id": "gatherer-standard", "calendar_status": "half_day","signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": 60 },
    { "policy_id": "gatherer-standard", "calendar_status": "holiday", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": 480 },
    { "policy_id": "gatherer-standard", "calendar_status": "weekend", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": 480 },
    { "policy_id": "gatherer-standard", "calendar_status": "unknown", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": 240 },

    // --- chef-intraday: unified-agent convergence scan during market hours ---
    // EC-6 AUDIT: open/* entries are NEVER null — chef-intraday cannot be suppressed during open sessions.
    { "policy_id": "chef-intraday",     "calendar_status": "open",    "signal_backlog_tier": "*",      "volatility_tier": "high", "interval_minutes": 60 },
    { "policy_id": "chef-intraday",     "calendar_status": "open",    "signal_backlog_tier": "*",      "volatility_tier": "low",  "interval_minutes": 120 },
    { "policy_id": "chef-intraday",     "calendar_status": "half_day","signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": 120 },
    { "policy_id": "chef-intraday",     "calendar_status": "holiday", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": null },
    { "policy_id": "chef-intraday",     "calendar_status": "weekend", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": null },
    { "policy_id": "chef-intraday",     "calendar_status": "unknown", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": 120 },

    // --- bctc-offmarket: bctc-analyst-slot-1..4 (OQ-P1-3 decision) ---
    // holiday → null (suppress); weekend → 1440 (once/day); open/half_day/unknown → cron (null treated as cron fallback for open)
    { "policy_id": "bctc-offmarket",    "calendar_status": "holiday", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": null },
    { "policy_id": "bctc-offmarket",    "calendar_status": "weekend", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": 1440 },
    { "policy_id": "bctc-offmarket",    "calendar_status": "open",    "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "bctc-offmarket",    "calendar_status": "half_day","signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": null, "_cron_fallback": true },
    { "policy_id": "bctc-offmarket",    "calendar_status": "unknown", "signal_backlog_tier": "*",      "volatility_tier": "*",    "interval_minutes": null, "_cron_fallback": true }
  ]
}
```

**`_cron_fallback: true` semantics:** When `interval_minutes: null` AND `_cron_fallback: true`, the evaluator treats this slot as if `policy_id == null` for this tick — legacy cron governs. This is the `open/half_day/unknown → cron` behavior for bctc-offmarket slots (OQ-P1-3). The evaluator checks `_cron_fallback` before treating `null` as suppress.

**Tier computation (deterministic — no LLM):**
- `signal_backlog_tier`: `low` = backlog 0–2; `medium` = 3–9; `high` = ≥10
- `volatility_tier`: `low` = `last_volatility_level` in `["unknown","low"]`; `high` = anything else
- `calendar_status`: pass-through from `pressure-state.json` field (emitted by Step 4.8 from `is_trading_day`)
- Unmatched rule → `interval_minutes: 240` (safe default, never null — AC-P1-1-3)

**EC-6 audit result:** No `open` row for `chef-intraday` has `interval_minutes: null`. The policy table is verified to not suppress market-hours chef-intraday slots during open sessions.

---

## OQ-P1-2 Encoding — 20-Minute Staleness Threshold

**Replaces FR-P1-6's "30 minutes" with 20 minutes throughout the blueprint.**

Staleness threshold = **20 minutes** (one `*/15` interval + 5-min jitter/clock-skew buffer).

The threshold is stored in `cadence-policy.json` as `"_staleness_threshold_minutes": 20` (see above). The evaluator and Step 4.2 read this field rather than hardcoding 20. This makes the threshold a tunable SSOT value.

**Updated AC boundary tests:**
- AC-P1-6-2: `emitted_at` 25 minutes old → fallback triggered; `emitted_at` 18 minutes old → adaptive still active (was: 35/29 min).
- AC-P1-6-3: `stale_warning: true` + recent `emitted_at` → fallback triggered (threshold check is one gate; `stale_warning` is an independent gate — either alone triggers fallback).

---

## OQ-P1-3 Encoding — `bctc-offmarket` Policy

The `bctc-offmarket` policy is defined in the table above. Key behavioral mapping:

| `calendar_status` | bctc-analyst-slot-1..4 behavior |
|---|---|
| `holiday` | `interval_minutes: null` → suppressed (AC-P1-1-2 pattern) |
| `weekend` | `interval_minutes: 1440` → fires at most once per 24 hours |
| `open` | `_cron_fallback: true` → cron governs (15:00/18:00/21:00/00:00 UTC) |
| `half_day` | `_cron_fallback: true` → cron governs |
| `unknown` | `_cron_fallback: true` → cron governs (conservative) |

The broad FR-P1-4 calendar suppression rule ("holiday OR weekend → suppress all non-guaranteed") does NOT apply to bctc slots — their `bctc-offmarket` policy overrides it for the weekend case. The gatherer freshness downgrade (FR-P1-5) still uses holiday+weekend for gatherer slots. These two rules are orthogonal:
- FR-P1-5 applies to: `news-scout-offhours`, `market-watcher-offhours`, `news-scout-sentiment`, `market-watcher-eod`
- `bctc-offmarket` applies to: `bctc-analyst-slot-1..4`

Step 4.3 (calendar suppression) logic:
```
if calendar_status in ["holiday", "weekend"]:
  for each slot in MATCHES:
    if slot.guaranteed == false AND slot.policy_id NOT in ["bctc-offmarket"]:
      SUPPRESS_CALENDAR.add(slot.slot_id)
      log reason
    elif slot.policy_id == "bctc-offmarket" AND calendar_status == "holiday":
      SUPPRESS_CALENDAR.add(slot.slot_id)
      log reason
    # bctc-offmarket + weekend: NOT suppressed here; cadence policy will resolve to 1440-min check
```

---

## Detailed Flow Changes — `docs/agents/cowork-team/flow/main.md`

### NEW Step 4.2 — Read and validate pressure-state.json

```
PRESSURE_FILE = "docs/data/pressure-state.json"
STALENESS_THRESHOLD_MINUTES = cadencePolicy._staleness_threshold_minutes  # 20

PRESSURE_MODE = "adaptive"  # default
PRESSURE_STATE = null

if pressure-state.json is missing or fails JSON parse:
  log "[cowork] WARN: pressure-state.json unavailable (missing/malformed) — cadence fallback to legacy cron"
  send_telegram(channel=work, "[cowork] WARN: pressure-state.json unavailable — cadence fallback to legacy cron (reason: <missing|malformed>)")
  PRESSURE_MODE = "legacy"

elif:
  emitted_age_min = (now_unix - parse(emitted_at)) / 60
  if emitted_age_min > STALENESS_THRESHOLD_MINUTES OR pressure_state.stale_warning == true:
    reason = "stale" if emitted_age_min > STALENESS_THRESHOLD_MINUTES else "stale_warning_flag"
    log "[cowork] WARN: pressure-state.json unavailable — cadence fallback to legacy cron (reason: <reason>)"
    # Rate-limit WORK telegram: only if staleness epoch changed vs last tick (avoid repeat warnings)
    PRESSURE_MODE = "legacy"

elif cadence-policy.json is missing or fails JSON parse:
  log "[cowork] WARN: cadence-policy.json missing/malformed — cadence fallback to legacy cron"
  PRESSURE_MODE = "legacy"
```

If `PRESSURE_MODE = "legacy"`: skip Steps 4.3–4.5; use raw MATCHES as CADENCE_MATCHES; proceed directly to Step 4.6. This satisfies NFR-P1-3 (never worse than today) and AC-P1-6-1.

### NEW Step 4.3 — Calendar suppression

Only runs if `PRESSURE_MODE = "adaptive"`.

```
CALENDAR_STATUS = PRESSURE_STATE.calendar_status  # from Step 4.2 (already called in Step 4.8 prev tick)

SUPPRESS_CALENDAR = new Set()

if CALENDAR_STATUS in ["holiday", "weekend"]:
  for each slot in MATCHES:
    if slot.guaranteed == true:
      continue  # guaranteed slots never suppressed (NFR-P1-4)

    if slot.policy_id == "bctc-offmarket":
      if CALENDAR_STATUS == "holiday":
        SUPPRESS_CALENDAR.add(slot.slot_id)
        log "[cowork] calendar suppress: <slot.slot_id> reason=holiday (bctc-offmarket policy)"
      # weekend: NOT suppressed here — cadence policy handles the 1440-min rate
      continue

    # All other non-guaranteed slots
    SUPPRESS_CALENDAR.add(slot.slot_id)
    log "[cowork] calendar suppress: <slot.slot_id> reason=<CALENDAR_STATUS>"

# No token acquired → no task_release needed (BLOCKER-1 resolution)
CALENDAR_ALLOWED = MATCHES.filter(s => !SUPPRESS_CALENDAR.has(s.slot_id))
```

For `CALENDAR_STATUS = "unknown"` or `"open"` or `"half_day"`: no suppression (AC-P1-4-2).

### NEW Step 4.4 — Cadence due-check (adaptive mode)

Only runs if `PRESSURE_MODE = "adaptive"`.

```
signal_backlog = PRESSURE_STATE.signal_backlog
signal_backlog_tier =
  signal_backlog >= 10 ? "high" :
  signal_backlog >= 3  ? "medium" : "low"

volatility_tier =
  PRESSURE_STATE.last_volatility_level in ["unknown", "low"] ? "low" : "high"

CADENCE_MATCHES = []

for each slot in CALENDAR_ALLOWED:
  if slot.policy_id == null:
    # Legacy cron — already matched by Step 2+3
    CADENCE_MATCHES.push(slot with {due_reason: "cron", cadence_minutes: null})
    continue

  policy_result = evaluateCadence(slot.policy_id, CALENDAR_STATUS, signal_backlog_tier, volatility_tier)
  # evaluateCadence: first-match in cadence-policy.json array; unmatched → interval_minutes: 240

  if policy_result._cron_fallback == true:
    # bctc-offmarket on open/half_day/unknown — cron governs, already matched
    CADENCE_MATCHES.push(slot with {due_reason: "cron", cadence_minutes: null})
    continue

  if policy_result.interval_minutes == null:
    log "[cowork] cadence suppress: <slot.slot_id> policy=<slot.policy_id> reason=null_interval calendar=<CALENDAR_STATUS>"
    continue  # suppress — do not add to CADENCE_MATCHES

  cadence_seconds = policy_result.interval_minutes * 60
  last_fired_unix = slot.last_fired ? parse(slot.last_fired).unix() : null

  if last_fired_unix == null:
    # first-run semantics (EC-3): always due
    CADENCE_MATCHES.push(slot with {due_reason: "first_run", cadence_minutes: policy_result.interval_minutes})
    continue

  elapsed_seconds = now_unix - last_fired_unix
  if elapsed_seconds >= cadence_seconds:
    CADENCE_MATCHES.push(slot with {due_reason: "cadence", cadence_minutes: policy_result.interval_minutes})
  else:
    log "[cowork] cadence skip: <slot.slot_id> elapsed=<elapsed_seconds>s cadence=<cadence_seconds>s"
    # no token acquired — no release needed
```

### NEW Step 4.5 — Freshness silent-downgrade for gatherer slots

Only runs if `PRESSURE_MODE = "adaptive"`.

Gatherer set: `["news-scout-offhours", "market-watcher-offhours", "news-scout-sentiment", "market-watcher-eod"]`

```
DOWNGRADED = []

if PRESSURE_STATE.last_regime == "unknown"
   AND PRESSURE_STATE.signal_backlog == 0
   AND CALENDAR_STATUS in ["holiday", "weekend"]:

  for each slot in CADENCE_MATCHES:
    if slot.slot_id in GATHERER_SLOTS AND slot.guaranteed == false:
      DOWNGRADED.push(slot.slot_id)
      log "[cowork] freshness downgrade: <slot.slot_id> — no regime, empty backlog, market closed"

  CADENCE_MATCHES = CADENCE_MATCHES.filter(s => !DOWNGRADED.includes(s.slot_id))
  # Note: these slots were in CADENCE_MATCHES but not yet claimed — no token release needed
```

### NEW Step 4.5b — Resolve final CADENCE_MATCHES

```
# CADENCE_MATCHES is now: cron-matched AND (calendar-allowed AND cadence-due AND not freshness-downgraded)
# Pass CADENCE_MATCHES as the input to Step 4.6 (replaces raw MATCHES)
MATCHES = CADENCE_MATCHES  # rebind for Step 4.6 compatibility
```

### NEW Step 5b — Batch `last_fired` write

See BLOCKER-3 resolution above for full algorithm. Inserted after Step 5 fan-out completes, before Step 6 telemetry.

Only WON_SLOTS with successful spawns update `last_fired`. Failed spawns: `last_fired` untouched.

### Step 6 telemetry extensions

Add to existing telemetry payload:

```json
{
  "pressure_mode": "<adaptive|legacy>",
  "calendar_status": "<status>",
  "suppressed_calendar": ["<slot_ids>"],
  "suppressed_cadence": ["<slot_ids>"],
  "downgraded": ["<slot_ids>"],
  "due_reasons": { "<slot_id>": "<cadence|cron|first_run>" },
  "cadence_minutes": { "<slot_id>": <N|null> }
}
```

---

## `scripts/agents-flow/cadence-policy.js` — New Module

**Location:** `scripts/agents-flow/cadence-policy.js`

**Exports:**
```javascript
module.exports = {
  loadCadencePolicy,   // () → policy object (reads cadence-policy.json)
  evaluateCadence,     // (policy_id, calendar_status, backlog_tier, vol_tier, policy_obj) → {interval_minutes, _cron_fallback}
  computeTiers,        // (pressure_state) → {signal_backlog_tier, volatility_tier}
  isStale,             // (pressure_state, threshold_minutes) → boolean
};
```

**evaluateCadence algorithm:**
1. Filter `policy_obj.policies` by `policy_id` match
2. For each rule in order: check `calendar_status`, `signal_backlog_tier`, `volatility_tier` (all support `"*"` wildcard)
3. First match → return `{interval_minutes: rule.interval_minutes, _cron_fallback: rule._cron_fallback ?? false}`
4. No match → return `{interval_minutes: 240, _cron_fallback: false}` (safe default — AC-P1-1-3)

**`cowork-match-slots.js` extension:**

The `matchSlots()` function gains an `options` object parameter:
```javascript
function matchSlots(schedule, ctx, options = {}) {
  const mode = options.mode || 'legacy';
  const pressureState = options.pressureState || null;
  const policyObj = options.policyObj || null;
  // ...
}
```

When `mode === 'adaptive'`: for each cron-matched slot with `policy_id != null`, call `evaluateCadence()` and compute `due`. Return extended slot objects with `due_reason` + `cadence_minutes` fields (AC-P1-3-4).

The CLI entrypoint (`require.main === module`) checks for `cadence-policy.json` presence:
```javascript
if (require.main === module) {
  let mode = 'legacy';
  let pressureState = null, policyObj = null;
  const policyPath = path.join(cwd, 'docs/data/cadence-policy.json');
  const pressurePath = path.join(cwd, 'docs/data/pressure-state.json');
  if (fs.existsSync(policyPath) && fs.existsSync(pressurePath)) {
    try {
      policyObj = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
      pressureState = JSON.parse(fs.readFileSync(pressurePath, 'utf8'));
      const { isStale } = require('./cadence-policy.js');
      const threshold = policyObj._staleness_threshold_minutes || 20;
      if (!isStale(pressureState, threshold)) mode = 'adaptive';
    } catch (e) { /* mode stays legacy */ }
  }
  const hits = matchSlots(sched, undefined, { mode, pressureState, policyObj });
  // ...
}
```

---

## `docs/data/cowork-schedule.json` Changes

Two new optional fields added per slot:
- `"policy_id": "<policy_name>" | null` — from BLOCKER-2 table above
- `"last_fired": null` — null on first run (EC-3: null = always due)

**Agent-father must add these fields** to all 14 enabled slots per the BLOCKER-2 assignment table. Guaranteed slots: `policy_id: null`. No other field changes. The `last_fired` field already exists in the current schema (observed as `"last_fired": null` for all slots in brownfield read — no schema migration needed).

---

## DDD Layer Assignments

| Deliverable | Layer | File |
|---|---|---|
| `cadence-policy.json` | Infrastructure (policy config) | `docs/data/cadence-policy.json` |
| `cadence-policy.js` evaluator module | Application (orchestration logic) | `scripts/agents-flow/cadence-policy.js` |
| `cowork-match-slots.js` adaptive mode extension | Application (orchestration) | `scripts/agents-flow/cowork-match-slots.js` |
| `policy_id` + `last_fired` fields in schedule | Infrastructure (config) | `docs/data/cowork-schedule.json` |
| Steps 4.2–4.5b (suppression/cadence logic) | Application (orchestration) | `docs/agents/cowork-team/flow/main.md` |
| Step 5b (`last_fired` write) | Application (state tracking) | `docs/agents/cowork-team/flow/main.md` |
| Test suite | Tests | `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` |

**DDD golden rule:** `cadence-policy.js` has zero imports from `apps/mcp-server/`. It reads only JSON files via `fs`. No domain layer violation.

---

## Test Strategy — `DWF-phase1-cadence.test.ts`

**Location:** `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`
**Runner:** `bun:test` (consistent with all existing tests)
**Import path:** `../../../../scripts/agents-flow/cadence-policy.js` (relative from test file to script)
**Zero mcp-server code under test.** DB not used.

| Test ID | AC | Description | DV proof |
|---|---|---|---|
| T-1 | AC-P1-1-1 | `open` + backlog=8 (medium) + volatility=high + gatherer-standard → 60 min | Assert 240 → RED |
| T-2 | AC-P1-1-2 | `holiday` + chef-intraday policy → null (suppress) | Remove holiday rule → null not returned → RED |
| T-3 | AC-P1-1-3 | Unmatched policy/state → 240 min (safe default) | Assert null → RED |
| T-4 | AC-P1-2-1 | `policy_id: null` slot → cron fallback (matchSlots returns slot with `due_reason: "cron"`) | Remove cron field from null-policy slot → RED |
| T-5 | AC-P1-3-1 | `last_fired: null` → always in output (first-run) | Assert not included when last_fired=null → RED |
| T-6 | AC-P1-3-2 | `last_fired=T-50min`, cadence=60 → NOT due | Assert due=true at T-50min → RED |
| T-7 | AC-P1-3-3 | `last_fired=T-65min`, cadence=60 → IS due | Assert not due → RED |
| T-8 | AC-P1-3-4 | Output schema: `due_reason` + `cadence_minutes` present | Strip `due_reason` from expected schema → parse fails → RED |
| T-9 | AC-P1-6-2 | `emitted_at` 25 min old → `isStale` returns true | emitted_at 18 min old → false → RED |
| T-10 | AC-P1-6-3 | `stale_warning: true` + recent emitted_at → `isStale` returns true | stale_warning=false + old emitted_at → isStale via age check only → RED |
| T-11 | bctc-offmarket | holiday → null; weekend → 1440; open → _cron_fallback=true | Assert weekend returns null suppress → RED |
| T-12 | EC-6 audit | No open+chef-intraday rule has interval_minutes: null | Inject null-open rule → test goes RED |
| T-13 | NFR-P1-1 | `cowork-slot:<slot_id>` key format unchanged (grep scripts/agents-flow/ for suffix-free pattern) | Inject tick suffix in key → RED |

**Note on AC-P1-4-3 and AC-P1-5-2 (token release on suppression):** These are satisfied by BLOCKER-1's before-claim design — no token is ever acquired for a suppressed slot. The DV proof for these ACs is: attempt to `task_claim("cowork-slot:<suppressed_slot_id>")` after a suppression tick → `claimed: true` (never blocked). This requires a live integration test with in-memory coordination DB. PM may add this to `DWF-coordination-phase2.test.ts` (already exists) rather than the cadence test file to keep concerns separated.

**Note on AC-P1-7-1 and AC-P1-7-2 (last_fired write):** These are integration tests that require file system access. They belong in a separate test block within `DWF-phase1-cadence.test.ts` that writes to a temp copy of `cowork-schedule.json` and verifies the atomic-patch output. PM must allocate these as a distinct subtask (Step 5b dev task).

---

## Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| `_cron_fallback: true` semantic in cadence-policy.json is novel — a dev might treat `null` as uniform suppress | HIGH | Evaluator must explicitly check `_cron_fallback` before returning suppress decision. T-11 DV test enforces this. Comment in `cadence-policy.js` must document the distinction. |
| `last_fired` write races with agent-father structural edit (EC-5) | MEDIUM | Accepted for Phase 1 (last-write-wins within a narrow window). Log write timestamp in telemetry. Revisit in Phase 1+ if concurrent edits observed. |
| Stale-pressure warning Telegram spam | MEDIUM | Rate-limit: compare `tick_id` in current `pressure-state.json` vs previous tick's `tick_id` (stored in memory within the dispatcher session). Only send WORK telegram when `tick_id` changes (new staleness epoch). |
| `chef-intraday` at 60-min under sustained high volatility → 7 unified-agent sessions per day | MEDIUM (memory) | Host-headroom_mb from pressure-state gates this: if `host_headroom_mb < 2048` (2GB), apply frequency cap for non-guaranteed slots. Architect notes this as a Phase 1+ enhancement — not blocking Phase 1 ship, but PM should flag in handoff. |
| Bun `require()` of `.js` CommonJS module from `.ts` test | LOW | Add `"allowJs": true` or `ts-ignore` import. Existing pattern in test harness TBD — PM must verify with dev before closing this. |
| `cadence-policy.json` missing at deploy time → all adaptive slots fall back to cron | LOW | This is the correct degradation path (NFR-P1-3). No mitigation needed beyond logging. |

---

## Implementation Sequence (for PM task breakdown)

1. **P1-DEV-1:** Create `docs/data/cadence-policy.json` (policy table from this brief).
2. **P1-DEV-2:** Create `scripts/agents-flow/cadence-policy.js` (evaluator module — `loadCadencePolicy`, `evaluateCadence`, `computeTiers`, `isStale`).
3. **P1-DEV-3:** Extend `scripts/agents-flow/cowork-match-slots.js` with `--mode=adaptive` and `options` parameter. Requires `cadence-policy.js` (P1-DEV-2 prerequisite).
4. **P1-DEV-4:** Add `policy_id` + `last_fired` fields to all 14 slots in `docs/data/cowork-schedule.json` per BLOCKER-2 table.
5. **P1-DEV-5:** Add Steps 4.2–4.5b to `docs/agents/cowork-team/flow/main.md` (staleness gate + calendar suppression + cadence due-check + freshness downgrade). Requires P1-DEV-2, P1-DEV-3, P1-DEV-4.
6. **P1-DEV-6:** Add Step 5b to `docs/agents/cowork-team/flow/main.md` (batched `last_fired` write). Requires P1-DEV-5.
7. **P1-DEV-7:** Create test file `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` with T-1..T-13 (DV proofs RED-before-GREEN in same commit). Requires P1-DEV-2, P1-DEV-3.
8. **P1-QA:** Verify all 12 ACs (BLOCKING table from spec § 9) pass; all DV tests RED→GREEN; all 14 enabled slots still dispatch correctly on a live tick with pressure-state.json present; verify legacy fallback when pressure-state.json deleted.

**Parallel-dispatch rule:** P1-DEV-1, P1-DEV-2, P1-DEV-4 have disjoint file scopes → can run in parallel. P1-DEV-3, P1-DEV-5, P1-DEV-6 depend on prior steps → sequential. P1-DEV-7 can run in parallel with P1-DEV-5/6 since it only imports from `scripts/agents-flow/`.

---

## File Count Summary

| Action | Count | Files |
|---|---|---|
| CREATE (cross-service) | 2 | `docs/data/cadence-policy.json`, `scripts/agents-flow/cadence-policy.js` |
| MODIFY (cross-service) | 3 | `scripts/agents-flow/cowork-match-slots.js`, `docs/data/cowork-schedule.json`, `docs/agents/cowork-team/flow/main.md` |
| CREATE (test — mcp-server harness) | 1 | `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` |
| **Total** | **6** | |

Zero changes to `apps/mcp-server/src/` production code (NFR-P1-5 satisfied).

---

## RETURN

```
DONE: Technical design complete — docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md
ZONE: cross-service (docs/data/, docs/agents/cowork-team/flow/main.md, scripts/agents-flow/) + test zone (apps/mcp-server/src/__tests__/)
BLOCKERS: ALL RESOLVED
  BLOCKER-1: Suppression BEFORE per-work-item claim (Step 4.2–4.5b gate CADENCE_MATCHES before Step 4.6; no token acquired for suppressed slots; AC-P1-4-3 vacuously satisfied by design)
  BLOCKER-2: All 14 slots assigned policy_id — 6 guaranteed→null (cron governs), 4 bctc→bctc-offmarket, 4 gatherers→gatherer-standard; missing-policy fallback to null (log WARN)
  BLOCKER-3: Single batched read→update-all-WON→tmp→rename in Step 5b; no parallel per-slot writes; non-fatal on write failure
  BLOCKER-4: Evaluator in scripts/agents-flow/cadence-policy.js (CommonJS, cowork zone); test in apps/mcp-server/src/__tests__/ (bun:test harness reuse, zero mcp-server production code under test)
OQ ENCODINGS:
  OQ-P1-2 (20-min staleness): encoded in _staleness_threshold_minutes: 20 in cadence-policy.json; Step 4.2 reads this field; AC-P1-6-2/6-3 boundary tests updated (25min→fallback; 18min→adaptive)
  OQ-P1-3 (bctc-offmarket policy): holiday→null, weekend→1440, open/half_day/unknown→_cron_fallback=true; reconciled with FR-P1-4 (bctc slots exempt from blanket weekend suppression; gatherer FR-P1-5 unaffected)
NFR-P1-1 VERIFIED: leader lock (Step 0b) + suffix-free cowork-slot:<slot_id> token (Step 4.6) + published-marker belt (Step 5) UNTOUCHED. Phase 1 is purely additive between Step 4b and Step 4.6. Higher fire-rate paths still enter Step 4.6 (no bypass).
NEXT: pm | P1-PM — break design into 8 atomic subtasks per implementation sequence above; create developer handoffs
HANDOFF: docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md
PIPELINE: continue
```
