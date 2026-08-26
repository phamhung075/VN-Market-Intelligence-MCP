# UC-SDF-P2 — architect design: filename-contract fix + regime/volatility writer

**Row:** `UC-SDF-P2` (plan_only, timebox 120) · **Author:** architect · **Date:** 2026-08-26
**Scope:** the two units left open by `ba_spec_ref` (`docs/handoffs/UC-SDF-P2-BA-step60-hardening-spec.md`,
which covers ONLY the Step 6.0b detector, already complete) — (1) the filename-contract fix, and
(4) the regime/volatility writer. Units (2) and (3) of the row's 4-unit sequencing guard are
**verified already shipped** — see §1.

---

## 0. Verified-at-source ledger (per the row's own "verify before implementing" warning)

| claim | source | verdict |
|---|---|---|
| Promotion join is nominal-tick-HH:MM vs wall-clock-fire-HH:MM | `emitPressureStateTool.ts:390-401` (floor-to-15 + regex), `tick-snapshot.md:34` (`date -u +%H:%M`) | **CONFIRMED**, re-read live |
| `promoteCycleSnapshot` file-not-found → `{promoted:false,stale:false}` | `emitPressureStateTool.ts:264` | **CONFIRMED** |
| `regime_status` wrong key; real path `.macro_snapshot.data.signals.carry.regime` | `jq paths` on live `cycle-snapshot-latest.json` | **CONFIRMED** — path exists, value currently `"UNKNOWN"` (uppercase; carry inputs are estimate-degraded today) |
| `volatility_level` has zero producer | grep `apps/`,`scripts/` | **CONFIRMED** — zero writers; `get_volatility_indicators` (below) is a real, unused-by-this-pipeline candidate |
| calendar_status wired to `vnTradingCalendar` (unit 3) | `emitPressureStateTool.ts:334`, `vnTradingCalendar.ts:30` `SESSION_STATUSES=["open","holiday","half_day","weekend","unknown"]` | **CONFIRMED DONE** (TASK_2008a). No "closed" member — matches BA's independent finding. |
| cadence-policy rows for alert-commander-market/critical + gatherer open/half_day (unit 2) | `docs/data/cadence-policy.json` (live), `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` §8 item 1, commit `8c2acb44c` | **CONFIRMED DONE — and the row's own wording for this unit is WRONG, see §1.** |
| "43-day-old residue / 102 stale files" (po's 07-16 note) | live `ls docs/data/cycle-snapshot-*.json` | **NOT reproduced** — current population spans ~2 days, consistent with the 24h prune (`tick-snapshot.md:58`) working. Treated as stale characterization superseded by BA's more precise Aug re-measurement (H1/H2); no action taken on the literal "43-day" framing. |

---

## 1. Unit (2) and Unit (3) — CORRECTION: already done, do not re-implement

The row's `po_fold_widen_2026-07-16` note asks for "(2) author the missing cadence-policy rows
(alert-commander-market 15min + alert-commander-critical 240min + gatherer open/half_day tiers);
(3) WIRE calendar_status to the vnTradingCalendar oracle." Both are **complete**, and unit (2)'s
literal ask (real 15min/240min adaptive values) would be a **regression** if implemented now:

- `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` (item 6, item 1) already
  diagnosed this exact "dangling policy_id" gap and **deliberately** chose
  `_cron_fallback: true` / `interval_minutes: null` for **every** `calendar_status` row of both
  `alert-commander-market` and `alert-commander-critical` — not as a placeholder, but because
  alert-commander already self-gates per spawn (market slot: `*/15` during market hours only,
  self-exits otherwise; critical slot: intentionally 24/7 for legal/regulatory/crisis coverage,
  must never be suppressed by calendar/volatility). Commit `8c2acb44c` shipped exactly those 10
  rows; live `docs/data/cadence-policy.json` matches verbatim.
- Gatherer `open`/`half_day` tiers are also present and have been since the original
  `P1-DEV-1` SSOT commit (`5a19485ef`) — never actually missing.
- Giving alert-commander real adaptive intervals (15min/240min) **now** would make a
  safety/regulatory-coverage lane suppressible by `calendar_status`/`volatility_tier` for the
  first time — exactly the "separate, larger design decision" the 2026-08-04 brief explicitly
  declined to make. Not proposed here either. **No further action on units 2/3.**

This narrows the row's 4-unit sequencing guard to **units 1 and 4 only** (see §5).

---

## 2. Unit 1 — filename-contract fix

### 2a. Decision: stop keying promotion on a filename string at all

The row's own wording ("unify the snapshot key + put a date in it") is superseded. Two
independently-executed bash/TS processes agreeing on a derived timestamp string has already
produced **two** confirmed defects (nominal-vs-wall-clock mismatch; BA's own §3 latent
seconds-dropping bug in `cowork-tick-preflight.sh:203`) plus a near-miss. Adding a date component
patches the surface again without removing the coordination requirement that keeps re-breaking.

**Chosen design:** `promoteCycleSnapshot` selects the **newest-mtime** `cycle-snapshot-*.json` file
in `dataDir` (excluding `cycle-snapshot-latest.json` and anything not ending in exactly `.json` —
excludes `.tmp`/`.stage` residue) instead of building an exact `cycle-snapshot-<HH:MM>.json` path
from `tickHHMM`. The existing freshness gate (`:266-295`, unchanged) still runs against whichever
file is selected.

- **Zero change needed to `tick-snapshot.md` / Step 4.7.** It can keep writing
  `cycle-snapshot-${FILE_TICK}.json` with `FILE_TICK=$(date -u +%H:%M)` exactly as today — the
  writer's naming scheme becomes irrelevant to the reader. This is the whole point: remove the
  agreement surface, not relocate it.
- Also **structurally closes** the "no date component" concern (§0): selection is by real
  filesystem mtime, never by parsing a same-HH:MM name, so a same-named residue from a prior day
  can never be picked over a genuinely newer file.
- `promoteCycleSnapshotFn` signature drops the `tickHHMM` parameter:
  `(dataDir: string, copyFileFn?, renameFn?, readFileFn?, nowIsoFn?) => PromoteCycleSnapshotResult`.
  Call site (`runEmitPressureState`) simplifies to `deps.promoteCycleSnapshotFn(dataDir)` — the
  `tickHHMM`-extraction block (`:396-401`) becomes dead code for promotion purposes and should be
  removed (tick_id itself is still needed elsewhere — tombstone check, cadence, telemetry — so
  `tickId` derivation at `:386-394` stays).

### 2b. Compatibility with BA's already-shipped Step 6.0b design

`cowork-snapshot-advance-check.sh` (BA spec §4) is a pure **outcome** observer — `ADVANCED` and
`CANDIDATE` (§4c) are computed from `pressure-state.json.emitted_at` + raw file mtimes, never from
re-deriving the tool's lookup key. Those predicates, and AC-1..AC-8, are **unaffected** by this
change and remain a valid regression detector after it lands, exactly as BA's §7 anticipated.

One follow-up is needed, **not a blocker to landing Step 6.0b now**: §4d's branch-discriminator
table names `FILENAME_MISS`/`TICK_ID_UNPARSEABLE` after the old exact-match mechanism. Once this
fix lands, "no candidate file at all" becomes the only "nothing to promote" branch (rename to
e.g. `NO_CANDIDATE_FOUND`); `TICK_ID_UNPARSEABLE` stops being a promotion-failure cause (tick_id is
no longer read for the promote lookup) though it may still be worth keeping as a
tombstone-adjacent diagnostic. Small (~5L) follow-up to `cowork-snapshot-advance-check.sh`'s branch
table — flagging for whoever implements unit 1, not a new row.

### 2c. Test strategy (unit 1)

`apps/mcp-server/src/__tests__/emit-pressure-state.test.ts` has ~15 call sites passing a 2nd
positional `tickHHMM`/`"HH:MM"` arg to `promoteCycleSnapshot(...)` (base-behavior describe block
`:391-449`, freshness-gate block `:451-575`, integration blocks using `promoteCycleSnapshotFn`).
All need the arg dropped and, where the test's intent is "select this specific fixture file,"
replaced with mtime setup (`utimesSync` or write-order) so "newest" resolves to the intended
fixture. New tests needed: (a) two per-tick files present, newest wins; (b) only an older file
present when a newer non-json/.tmp file also exists — non-json ignored; (c) glob with zero
candidates → `{promoted:false, stale:false}` (same tuple as today's file-not-found branch, verified
unchanged contract for `runEmitPressureState`'s callers).

---

## 3. Unit 4 — restore regime_status / volatility_level writer

### 3a. Root design choice: finish the EMIT-DARK-v2 Option C migration

`last_regime`/`last_volatility_level` are the **only two** of the 9 `PressureState` keys still
sourced from caller-supplied `args` (defaulting to `"unknown"` when absent) — every other field
(`calendar_status`, `signal_backlog`, `dev_queue_depth`, `container_vm_headroom_mb`) was already
moved server-side by the 2026-06-05 EMIT-DARK-v2 refactor, for the documented reason that "the
cowork dispatcher is a pure LLM narration engine" and cannot be trusted to interpolate or
JSON-navigate correctly (`emitPressureStateTool.ts:1-28` file header). `telemetry.md`'s own Step
6.0 call_tool block already **asks** the dispatcher to read `regime_status`/`volatility_level` out
of `cycle-snapshot-latest.json` and pass them as args — that narration-dependent design is the
proximate cause of the wrong-key bug (BA §7) and would keep failing even if the keys were
corrected, because it re-introduces exactly the class of error EMIT-DARK-v2 was created to
eliminate. **Fix: move both fields server-side, same override-pattern precedent already used for
`calendar_status`** (`:423-434` — an in-domain caller arg is honored, else server recomputes).

### 3b. `last_regime` — read from the (now-fixed) cycle-snapshot, server-side, lowercased

Read the file the promotion mechanism just fixed (§2) directly, in-process, no network call:
`docs/data/cycle-snapshot-latest.json` → `.macro_snapshot.data.signals.carry.regime`. Values are
`HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK | "UNKNOWN"` (Go `macro-indicators` service,
`apps/macro-indicators/pkg/application/usecases.go:128,230` — emits literal `"UNKNOWN"` when any
carry input is fixture-degraded; verified live value today is exactly this). **Lowercase before
writing** — `cowork-match-slots.js:223`'s freshness-downgrade gate and `cadence-policy.js:104` both
compare `=== 'unknown'` (lowercase, case-sensitive); passing `"UNKNOWN"` verbatim would silently
never match either check, the same class of case-mismatch bug this row already exists to fix
elsewhere. Missing file / unreadable / path absent → `"unknown"` (unchanged default, honest).

**Deliberately NOT chosen:** calling `get_carry_trade_signal` fresh from inside the tool. It proxies
the identical `/snapshot` endpoint `get_macro_snapshot` (Step 4.7) already calls once per tick — a
second live call would double the load on the macro-indicators service for data already sitting on
disk seconds old. Reading the promoted file is strictly cheaper and, once §2 lands, no less fresh.

**Behavior-change flag (risk, not a defect):** `cowork-match-slots.js`'s `applyFreshnessDowngrade`
(3-condition AND-gate: `last_regime==='unknown' AND signal_backlog===0 AND calendar in
[holiday,weekend]`) currently fires on **every** qualifying off-hours tick, because `last_regime`
has been hard-pinned to `"unknown"` since 06-05. Once a real regime flows through, this downgrade
will fire only on days the carry inputs are themselves estimate-degraded — a large behavior
reduction in how often non-guaranteed gatherer slots get silently dropped off-hours. This is the
intended effect of "restoring the writer," but `scripts/agents-flow/cowork-match-slots.test.js`
fixtures (`:513-610`) assume `'unknown'` as the common case and should get a regression check for
the `'neutral'`/`'hot_money_inflow'` non-suppression path — flagging for developer/QA, not deciding
the fixture content here.

### 3c. `last_volatility_level` — new producer, server-computed, fully decoupled from cycle-snapshot

`apps/mcp-server/src/interface/mcp/tools/market-data/volatilityIndicatorTools.ts` already registers
`get_volatility_indicators` (proxies Go `technical-analysis` service, port 5003 — a **different**
service from macro-indicators). Called with no `tickers`, it returns market-wide
`vol_regime: LOW|NORMAL|ELEVATED|CRISIS` with **zero required arguments** — a real, already-shipped
producer nobody wired into pressure-state. Call its underlying client function,
`computeVolatilityIndicators()` (`infrastructure/microservices/clients.ts`), directly from
`emitPressureStateTool.ts`, the same way `computeContainerVmHeadroomMb`/etc. are already
in-process server computations — **not** via cycle-snapshot, so this field's freshness is fully
independent of unit 1 and of Step 4.7 ever having run this tick.

- Lowercase `vol_regime` before writing (`"LOW"→"low"`, etc. — same case-sensitivity reasoning as
  §3b).
- Wrap in try/catch, default `"unknown"` on any failure (upstream unavailable, timeout) — mirrors
  every other field in this tool; **never** let this call make `emit_pressure_state` throw or fail
  the tick (the tool's own documented contract, `:25`).
- **Open design call, flagging rather than deciding silently:** `cadence-policy.js:104`
  `computeTiers()` currently maps `volatility_tier = (vol==='unknown'||vol==='low') ? 'low' : 'high'`.
  Wiring a real `vol_regime` through unmodified means **`"normal"` — presumably the majority-case
  reading — falls into the `"high"` (denser) cadence tier**, since only literal `"low"`/`"unknown"`
  count as low-tier today. That is very likely NOT the intended reading of "low volatility tier"
  (a calm/typical market should get the relaxed cadence, not the elevated one) and would make the
  adaptive layer run hot almost permanently once this field goes live — a real cost/token-economy
  regression, not merely cosmetic. **Recommend** widening `computeTiers()`'s low-tier set to
  `["unknown","low","normal"]` (1-line change, same file) so only `ELEVATED`/`CRISIS` trigger the
  high-tier cadence — but this is an interpretive product decision about cadence semantics, not a
  mechanical bug fix, so it is called out explicitly rather than folded silently into "restore the
  writer." Whoever implements unit 4 should treat this line as its own numbered AC, sign off on it
  (or override it) rather than inherit it implicitly.

### 3d. Files touched (unit 1 + unit 4, apps/mcp-server zone; both units share one PR-sized change)

- `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` — drop `tickHHMM`
  param from `promoteCycleSnapshot`/`promoteCycleSnapshotFn`/`EmitPressureStateDeps`; glob-newest
  selection; add `readLatestRegimeFn`/`computeVolatilityLevelFn` injectable deps (test seam,
  same convention as the four existing compute*Fn deps); wire both into `PressureState` build
  (`:439-449`) with the same override-if-valid-else-server-compute pattern as `calendar_status`.
- `apps/mcp-server/src/__tests__/emit-pressure-state.test.ts` — signature updates (§2c) + new
  describe blocks for regime-read and volatility-compute (happy path, missing-file, upstream-down).
- `scripts/agents-flow/cadence-policy.js` — `computeTiers()` low-tier set widen (§3c), **only if**
  the recommendation is accepted; `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` needs
  a matching case either way (assert current 2-value set OR the widened 3-value set, whichever is
  chosen — do not leave the test silently proving the un-chosen behavior).
- **No change** to `docs/agents/cowork-team/flow/tick-snapshot.md` (§2a) or
  `docs/data/cadence-policy.json` alert-commander/gatherer rows (§1).
- `docs/agents/cowork-team/flow/telemetry.md:18-19` — Step 6.0's call_tool argument block still
  names `last_regime`/`last_volatility_level` as inputs; once both are server-computed these
  become **optional back-compat overrides only** (same status as `calendar_status`'s arg already
  is post-TASK_2008a) — update the two prose lines to say so, so a future reader does not
  re-litigate "why is the dispatcher still asked to narrate a JSON path." Small (~2L),
  `docs/agents/**` zone — same convention as BA's split: agent-father's exclusive zone, developer
  should not touch this file directly, only flag it in the same PR/dispatch for agent-father.

---

## 4. DDD layer / reuse

Both changes stay inside `emitPressureStateTool.ts`'s existing `interface/mcp/tools/system` layer
— `promoteCycleSnapshot` and the new regime/volatility reads are **infrastructure-adjacent pure
functions already living in this file** (no new domain service needed; `computeVolatilityIndicators`
and the Go carry regime are pre-existing infrastructure clients, reused not duplicated). Extends
the existing injectable-deps seam (`EmitPressureStateDeps`) rather than inventing a second one.
**Scan clean: true.** No new interface proposed where an existing one (get_volatility_indicators,
cycle-snapshot-latest.json) already covers the need.

**BUILD-STANDARD: lean** (`apps/mcp-server` already exists; this extends an existing tool's
established server-side-computation pattern — no new service, no relay required).

---

## 5. Sequencing guard — narrowed

Original 4-unit guard (po, 07-16) required units 1-4 land as one change set to avoid "pruning the
residue files flips every tick to `stale_warning=false` -> adaptive fleet-wide -> degrades
alert-commander 16x" (i.e., unit 2 being a dangling-gap regression trap). **Units 2/3 are done and
safe regardless** (§1) — that specific regression path is closed. The **remaining real ordering
constraint** is narrower and still genuine: unit 4's `last_regime` read (§3b) sources from
`cycle-snapshot-latest.json`, which stays frozen without unit 1. Landing unit 4 alone would swap
"regime pinned unknown forever" (honest) for "regime pinned to whatever was last promoted, however
old, forever" (a stale value masquerading as current) — worse, not better. **Land units 1 and 4
together** (§3d already scopes them as one PR-sized mcp-server change). Unit 4's volatility leg
(§3c) has no such dependency and would be safe alone, but there is no reason to split it out.

---

## 6. Risk flags

- **Behavior change, flagged not silent:** §3b (freshness-downgrade stops firing on most off-hours
  ticks) and §3c (`computeTiers()` low-tier-set interpretation) are real, deliberate product-level
  decisions bundled inside what reads like "just restore a writer." Both are called out as their
  own AC items above so QA/developer sign off on them explicitly rather than inherit them as an
  unreviewed side effect.
- **Security/memory/perf:** none — both new server-side reads are bounded (one local file read
  capped at cycle-snapshot's normal size, ~15KB; one HTTP call with the same 15s deadline pattern
  already used by every other macro/TA tool call in this file). No new persistent state.
- **DDD violation:** none found; no layer crossed that wasn't already crossed by this file's
  existing four compute*Fn functions.

---

## RETURN (see row for terminal-lane disposition)
DONE: filename-contract fix (unit 1) + regime/volatility writer (unit 4) designed; units 2/3
verified already shipped, row wording for them corrected. Zone: apps/mcp-server/ (+ 2L pointer for
agent-father in docs/agents/cowork-team/flow/telemetry.md — not authored here, flagged only).
NEXT: developer implements §2+§3+§3d as one change set (apps/mcp-server zone); a separate,
already-scoped agent-father edit for telemetry.md:18-19 prose (§3d last bullet) — do not block one
on the other, they are independent commits.
