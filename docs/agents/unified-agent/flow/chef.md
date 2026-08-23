<!-- size-justification: 224L — TE-T16 split (2026-08-06, agent-father): body relocated to chef-dish.md at
     the existing Step-1 intraday silent-exit hard gate, so silent-intraday fires never pay to load
     the 564L post-gate dish-recipe tail or the 265L of TNB knowledge files it lazy-loads. This file
     keeps ONLY the gate-check portion — Step 0.5 published-marker dedup, Step 0 GATHER, Step 1
     CLUSTER/intraday-gate — load-bearing on every fire, including silent ones. Pure relocation, no
     logic changed; prior full-file changelog preserved verbatim in chef-dish.md's header; git log
     has the rest. Design ref: docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-16.
     FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (architect brief 2026-08-07, FOLLOW-UP-1, agent-father
     2026-08-13): +15L (209→224, incl. this header note) — Step 1's Degraded-dish floor trigger condition widened (OR-clause
     covering tool-failure/budget-exhaustion/self-narrated-inability, not just source-down) + its
     inline procedure replaced with a pointer to the new chef-telemetry.md § Degraded-Floor Recovery
     + one Checkpoint pointer added. No new section, in-place growth only.
     UC-CCA-P2-UNIFIED-AGENT (BA spec docs/handoffs/UC-CCA-P2-BA-spec.md, architect-ratified,
     agent-father 2026-08-14): +15L — inserted a Step 0-GW gateway-availability-gate pointer between
     Bootstrap and Step 0.5's task_claim (asymmetric placement vs. the sprint's other 5 FR-4/FR-5
     target files — intentional, protects only the task_claim mutation window; see § Architect
     Brownfield Findings "chef.md placement asymmetry" in the handoff doc). No logic changed
     elsewhere. (Note: the "224L" baseline above had already drifted to 243L pre-existing this edit —
     untouched, out of scope for this XS task.)
     FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING FR-8 (PO 2026-08-14 scope-widening on this row's own
     post-fix RAW-verification failure, agent-father 2026-08-14): +~15L — Step 0's `$BIZ_CTX_SIGNALS`
     per-ticker dict gains `valuation.verdict`/`valuation.note`/`kinhdich.note` (previously
     product/customer/ops/mgmt/source_file/ts only), so downstream steps can bind conviction direction
     to bctc-analyst's own machine-readable "do NOT post bullish signal" gate. The enforcement
     mechanism (new chef-dish.md Step 7.5 sub-check (h) VALUATION_GATE_OK) lives in that file, not
     here — see its own header note, same date. No logic changed elsewhere in this file.
     FIX-CHEF-MARKER-KEY-ANCHOR-4 2026-08-23 (agent-father, architect brief
     2026-08-06-cowork-marker-lifecycle-anchor-and-release.md §2 Component A bullet 3): +37L
     (307→344; the "224L" baseline above had drifted to 307 from untouched interim edits, not
     corrected here). Step 0.5 parses the `scheduled_utc=<ISO8601>` prompt token that ANCHOR-3 now
     appends to every spawn, and derives CYCLE_DATE_UTC from its date portion instead of an
     unconditional `date -u`. The `date -u` branch is RETAINED for genuine ad-hoc/manual invocations
     that carry no token. Closes the retry-drift half of the marker-key defect: a fire that crosses
     midnight UTC now mints the SAME MARKER_KEY as its on-time peer, so the Phase-1 dedup probe can
     actually see it. Parsing reuses the existing `slot=<slot_id>` technique — no new machinery. -->
> Parent: [./main.md](./main.md)

# Unified Agent — Chef Flow (TNB 6-Layer Recipe) — Gate Phase

Executes for all dish windows: Morning (05:23) / Intraday (:13 market hrs) / EOD (08:37) / Evening (19:37).
Input: `$DISH_TYPE` = `morning` | `intraday` | `eod` | `evening`

**TE-T16 split (2026-08-06):** This file owns ONLY Step 0.5, Step 0, and Step 1 (through the
intraday silent-exit gate). Steps 1.5-8 — the full TNB 6-layer dish recipe, quality-verdict gate,
JSON persist, and log/RETURN — live in `docs/agents/unified-agent/flow/chef-dish.md`, entered ONLY
when the Step 1 gate fires (≥1 cluster qualifies) or `$DISH_TYPE` is a guaranteed-publish window
(`morning`/`eod`/`evening`). No logic changed by this split — pure relocation along the pre-existing
hard branch.

**Tools:** `docs/agents/tools/package/unified-agent.md`

> Error boundary → skill: `.claude/skills/cowork-boundary/SKILL.md`

---

**0. Bootstrap** → skill: `.claude/skills/step-0-cowork/SKILL.md` (replace `<agent-id>` with `unified-agent`) — § 0b only (chef does not consume `$REGIME`; Step 1.5 macro-health-read is the L1 macro source, and this flow does not read notebook carry-over at Step 0a)

---

→ Telemetry spec (ENTRY / CLOSE / FAILED / SILENT / try-catch boundary): `docs/agents/unified-agent/flow/chef-telemetry.md`

> Error boundary → skill: `.claude/skills/cowork-boundary/SKILL.md`

---

<!-- UC-CCA-P2-UNIFIED-AGENT (agent-father, 2026-08-14): asymmetric placement, ratified deliberately
     — do NOT move this before Bootstrap to "match" the other 5 FR-4/FR-5 target files. This gate
     lands AFTER chef.md's own first gateway call (Bootstrap above), by design: it protects ONLY the
     Step 0.5 task_claim mutation window (a gateway that dies between a successful Bootstrap and the
     marker claim). `step-0-cowork/SKILL.md`'s own Bootstrap-gate already covers the general
     confirmed-down case for the Bootstrap call itself — placing this before Bootstrap would be
     redundant there and would NOT close the actual gap. Session-scoped: chef-dish.md shares this
     session and does not need its own gate. Ref: docs/handoffs/UC-CCA-P2-BA-spec.md § Architect
     Brownfield Findings, "unified-agent/chef.md placement asymmetry".

     UC-CCA-P3-FR3-CHEF FOLLOW-UP NOTE (agent-father, 2026-08-14): the "protects ONLY the
     Step 0.5 task_claim mutation window" rationale above is now PARTIALLY STALE — Step 0.5's
     own mutation was converted to a read-only Phase-1 probe by this task (see Step 0.5's own
     note below); the real task_claim mutation this gate was designed to protect now happens in
     chef-dish.md Step 7, reached only after the full Step 0/1/1.5-6.7 pipeline runs (many
     intervening tool calls, a different file). This gate's placement here still correctly
     covers Step 0.5's own probe call and the Bootstrap→Step-0.5 gap it was built for, but it no
     longer sits immediately before the actual marker mutation — a gateway that dies AFTER this
     gate passes but BEFORE chef-dish.md Step 7's claim is a coverage gap this comment does not
     claim to close. Not fixed here (UC-CCA-P2/gateway-availability-gate is a different task's
     zone than UC-CCA-P3/published-marker-gate); flagged for whoever next touches either gate to
     re-derive whether chef-dish.md needs its own Step 0-GW pointer. -->
**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md`
Replace `<agent-id>` with `unified-agent`. On gateway dead: write signal file + BLOCKED notebook entry
(APPEND-class) + EXIT. See skill for full protocol and explicit prohibitions.

---

## Step 0.5 — PUBLISHED MARKER GATE — Phase 1 (cheap probe, Layer-A dedup — run BEFORE any send_telegram)

<!-- UC-CCA-P3-FR3-CHEF (agent-father, 2026-08-14, R1 cross-file threading — see architecture
     brief 2026-08-08-uc-cca-p3-published-marker-gate-skill.md §4/§10 R1): this step used to
     claim the marker directly (EARLY-claim defect — before Step 0 GATHER and the full dish
     pipeline). Converted to a Phase-1 read-only probe per .claude/skills/published-marker-gate/
     SKILL.md. MARKER_KEY/MARKER_TTL derivation below is UNCHANGED (still the load-bearing
     FIX-CHEF-INTRADAY-MARKER-CADENCE / FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE fixes) —
     only the outcome of a HELD probe differs (EXIT here instead of claiming here). The actual
     Phase-2 claim now happens in chef-dish.md Step 7, immediately before Block A — see this
     file's own chef-dish.md Input-line note and that file's Step 7 for the other half of this
     threading fix. DO NOT re-add a task_claim call here — that would silently regress to the
     EARLY-claim defect this fix exists to close (flagged MANDATORY verification item, brief §10). -->

<!-- AC-5 / FIX-COWORK-GUARANTEED-BACKSTOP: Layer-A RemoteTriggers fire independent CLI sessions
     that bypass the cowork-team dispatcher. This gate is the ONLY dedup defence when both
     Layer-A and Layer-B fire the same slot concurrently.
     Pattern source: docs/agents/cowork-team/flow/spawn-fanout.md § Published marker gate (FR-P2-7) -->
<!-- FIX-CHEF-INTRADAY-MARKER-CADENCE: marker key + TTL derive from slot cadence so that any
     multi-fire slot (fires >1x/day) gets a per-window marker instead of a per-date one.
     Detection: read the slot's cron from docs/data/cowork-schedule.json; if the hour field
     is a range or list (e.g. "2-8") the slot is multi-fire; a single fixed hour is single-fire.
     Rule is generic — no slot name is hardcoded. -->
<!-- FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE (2026-07-29, PO c109/c113/c119): CYCLE_DATE_UTC
     below is the ONE canonical date-derivation point for chef.md — pinned once here, reused
     verbatim (never recomputed) at all 3 downstream surfaces that must never disagree: (a) the
     Step 7.6 synthesis JSON filepath + metadata.date_vn, (b) the Step 8b session/notebook header,
     (c) this step's single-fire published-marker key. Root cause: chef-evening's cron (`45 19 * * *`)
     fires at 19:45 UTC, which is ALREADY past VN local midnight (VN midnight = 17:00 UTC) — so
     VN-local date is structurally always +1 day vs the UTC day of the fire, and two independently
     -dispatched sessions (Layer-A + Layer-B, or a catch-up + a live fire) racing a few minutes apart
     can each resolve "VN-local date of my own execution moment" slightly differently, producing two
     DIFFERENT published:chef-evening:<date> keys for the SAME real day's content — confirmed live
     2026-07-28 (two synthesis JSONs 8 min apart, date_vn 2026-07-28 vs 2026-07-29, opposite
     conviction direction on overlapping tickers, both self-certified "published"). UTC has no such
     day-boundary/timezone ambiguity relative to a fixed-UTC-hour cron, so pinning ONE UTC date here
     closes the mutex-key race by construction. Scope: only the SINGLE-FIRE branch below (covers
     chef-morning/chef-eod/chef-evening) switches to CYCLE_DATE_UTC — chef-morning/eod fire at
     05:15/08:45 UTC, both BEFORE the 17:00 UTC VN-midnight threshold, so UTC date == VN date for
     them always (this change is a no-op in practice for those two, pure consistency). The MULTI-FIRE
     (intraday, per-hour) branch keeps WORK_DATE/VN_HOUR unchanged — intraday's per-window keying is
     not implicated in this defect and is out of scope. docs/data/cowork-schedule.json's
     `publish_date_basis` for chef-morning/chef-eod/chef-evening was updated iso_week_period-style
     (vn_date → utc_date) to match, so the live catchup-predicate rollover check agrees with the
     actual marker-key basis (same invariant as FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON:
     the config declaring the key basis must never drift from the code deriving the key). -->

Determine the slot being executed from the invocation prompt (`slot=<slot_id>`) and the tick's nominal
fire instant from the same prompt (`scheduled_utc=<ISO8601>`).

<!-- FIX-CHEF-MARKER-KEY-ANCHOR-4 (2026-08-23, agent-father; architect brief
     docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md §2
     Component A bullet 3): CYCLE_DATE_UTC must be ANCHORED to the window this fire belongs to, not
     to whatever instant the executing agent happens to be running at. `date -u` alone is correct on
     an on-time fire and WRONG on every retry that crosses midnight UTC: the retry mints a different
     MARKER_KEY than its on-time peer for the SAME window, so the duplicate-publish gate cannot see
     the peer and both publish. Two live incidents: the 2026-07-22 19:55:41Z / 20:01:30Z two-peer
     straddle, and the 2026-08-06T06:37:39Z post-host-sleep retry that re-anchored to "today" instead
     of the missed 2026-08-05T19:45Z window.

     `scheduled_utc` is supplied by cowork-team's spawn-fanout.md Step 5.2 (SCHEDULED_UTC_LINE) for
     EVERY guaranteed slot, live or catch-up, and traces back to ONE derivation shared with
     `catchup_raw` (`cowork-catchup-predicate.mostRecentCronFireBefore`) — so a retry and its on-time
     peer cannot disagree. Parsed with the SAME technique already used for `slot=<slot_id>` one line
     above; no new parsing machinery.

     The `date -u` fallback is RETAINED and is not dead code: a genuine ad-hoc/manual/pilot
     invocation has no scheduler tick and therefore no token (the chef equivalent of
     system-auditor's AUDIT_TIER=4 manual path), and spawn-fanout OMITS the token rather than
     emitting `scheduled_utc=null` when its producer degrades. Absent token → behave exactly as
     before this fix. -->

```
SLOT_ID        = <slot_id from prompt>   # e.g. chef-morning | chef-eod | chef-evening | chef-intraday
SCHEDULED_UTC  = <ISO8601 from prompt token `scheduled_utc=`, or null if the token is absent>
WORK_DATE      = TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d   # VN date GMT+7 — intraday multi-fire keying ONLY
VN_HOUR        = TZ="Asia/Ho_Chi_Minh" date +%H          # VN hour (00-23) — intraday multi-fire keying ONLY

# CYCLE_DATE_UTC — CANONICAL, pinned ONCE here. Reused verbatim (never recomputed) at Step 7.6
# (filepath + metadata.date_vn), Step 8b (notebook header), and the single-fire MARKER_KEY below.
if SCHEDULED_UTC is present and non-empty:
  CYCLE_DATE_UTC = SCHEDULED_UTC[0:10]     # date portion of the NOMINAL fire instant — window-anchored,
                                            # identical for an on-time fire and its late retry
else:
  CYCLE_DATE_UTC = date -u +%Y-%m-%d       # no scheduler tick (ad-hoc/manual) — unchanged legacy path

# Derive cadence from cowork-schedule.json
SLOT_RECORD   = jq --arg s "$SLOT_ID" '.slots[] | select(.slot_id == $s)' docs/data/cowork-schedule.json
CRON_EXPR     = SLOT_RECORD.cron                     # e.g. "13 2-8 * * 1-5" or "15 5 * * 1-5"
CRON_HOUR_FLD = CRON_EXPR.split(" ")[1]              # second cron field = hour

# A single fixed integer → single-fire (one window/day)
# A range (contains "-"), a list (contains ","), or a step (contains "/") → multi-fire
IS_MULTI_FIRE = CRON_HOUR_FLD contains "-" OR contains "," OR contains "/"

if IS_MULTI_FIRE:
  # Per-window key: each hourly (or sub-hourly) window owns its own marker
  # TTL = cadence of the slot in seconds (hourly slot → 3600s, so next window is free)
  # Cadence = 3600 for any range-hour slot; adjust if a future slot has a different step
  # Unchanged by FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE — out of scope, see comment above.
  CRON_MIN_FLD  = CRON_EXPR.split(" ")[0]            # first field = minute (or step)
  CADENCE_SEC   = 3600   # default: hourly (range-hour slots); override here if step differs
  MARKER_KEY    = "published:" + SLOT_ID + ":" + WORK_DATE + ":" + VN_HOUR
  MARKER_TTL    = CADENCE_SEC
else:
  # Single-fire (chef-morning | chef-eod | chef-evening): per-date key with 28h TTL covers the
  # full day (ARCH-DECIDE-D). Keyed on CYCLE_DATE_UTC, NOT WORK_DATE — see fix comment above.
  MARKER_KEY    = "published:" + SLOT_ID + ":" + CYCLE_DATE_UTC
  MARKER_TTL    = 100800   # 28h

# Phase 1 — cheap read-only probe (per .claude/skills/published-marker-gate/SKILL.md).
# task_list_held has NO task_id filter — scan client-side for MARKER_KEY.
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={ kind: "cowork-slot", owner_agent: "unified-agent" })
HELD  = PROBE.locks contains an entry where task_id == MARKER_KEY AND expires_at > now

if HELD:
  log "[chef] publish blocked (Phase-1 probe) — already held slot=" + SLOT_ID + " key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # claims NOTHING — a leak from this call is structurally impossible.
```

If NOT held: proceed to Step 0 GATHER. `MARKER_KEY`/`MARKER_TTL` (this exact pair, never
recomputed) are carried forward as session state through Step 0/Step 1 into `chef-dish.md`,
which performs the mandatory Phase-2 claim in its own Step 7, immediately before Block A —
send_telegram in Step 7 only proceeds once that claim succeeds.

---

## Step 0 — GATHER

Call `get_cycle_bootstrap(agent_name="unified-agent")` first. The response includes an `agent_signals` array (cross-agent signal index) — use this directly. Do NOT call `get_agent_signals(agent=…)` as a hard gate; if bootstrap already returned signals, the gather step is unblocked regardless of whether a standalone `get_agent_signals` call is available.

Read all `docs/signals/*.json` with `mtime` within last 24h (or since last dish logged in notebook).

<!-- AUTO-CURE 2026-07-17 (tran-ngoc-bau) — FIX-CHEF-STEP0-BCTC-PROCESSED-DIR-BLINDSPOT:
     Root cause confirmed by direct evidence: docs/agents/dev-team/flow/drain-signals.md §0a-1
     moves EVERY docs/signals/*.json file (bctc_signal_* included) to docs/signals/processed/
     within minutes of creation (observed 2026-07-17: bctc_signal_{FPT,HPG,VCB}_20260717_routine.json
     created ts=18:15Z, drained+moved processedAt=18:20Z — 5min gap), a cadence far faster than
     chef's 2-4x/day dish schedule. By the time ANY chef dish fires after the drain, fresh
     bctc_signal_*/fundamental_* files are already archived and invisible to a docs/signals/*.json-
     only glob — even on cycles where bctc-analyst's extraction SUCCEEDED (not serve-layer-blocked).
     DISTINCT from and additional to the AS-OF-2026-07-17 "14/16 tickers serve-layer-blocked" figure
     (historical — do NOT cite this number as current-cycle status; re-derive availability fresh from
     THIS cycle's Step 0 gather, never from this comment)
     upstream data gap (BCTC-EXTRACT-QUALITY sprint, bctc-analyst-owned) — that explains missing
     DATA; this explains why even SUCCESSFULLY EXTRACTED data (FPT/HPG/VCB 07-17, full
     product/customer/ops/mgmt fields present on disk before tonight's evening dish) never reaches
     the dish. Additive fix only, zero risk to QUALITY_VERDICT/publish logic: drain only ever MOVES
     files (never duplicates), so no double-count risk between the two locations. -->
Also read `docs/signals/processed/bctc_signal_*.json` and `docs/signals/processed/fundamental_*.json`
with `ts` (or `_processed.processedAt`) within the same last-24h window — dev-team's signal drain
(`docs/agents/dev-team/flow/drain-signals.md`) typically archives these into `processed/` within
minutes of creation, well before chef's next scheduled dish; the top-level glob alone structurally
misses them on every cycle after the first hour.

Collect file groups:
- `price_anomaly_*` — from market-watcher
- `news_impact_*` — from news-scout
- `bctc_signal_*` — from bctc-analyst (merged agent; was financial-analyst) — check BOTH
  `docs/signals/` and `docs/signals/processed/` (see AUTO-CURE note above)
- `fundamental_*` — from report-analyzer [TRANSITION: dual-accept `signal_type == "bctc_signal" OR signal_type == "fundamental"` during soak window H-18→H-19; remove `fundamental` branch after H-19 archive] — check BOTH locations, same as bctc_signal_*

**Store as `$BIZ_CTX_SIGNALS` (mandatory — this is the ONLY handle Steps 4/6.5/7/7.5/7.6 in
chef-dish.md read from, including Step 7.5 sub-check (h) VALUATION_GATE_OK (FR-8); without this
store, downstream steps have nothing to reference):**
Build a per-ticker dict from every `bctc_signal_*`/`fundamental_*` file collected above (both
`docs/signals/` and `docs/signals/processed/`), keyed by ticker symbol:
```
$BIZ_CTX_SIGNALS[<TICKER>] = {
  product: <file.product>, customer: <file.customer>, ops: <file.ops>, mgmt: <file.mgmt>,
  valuation: { verdict: <file.valuation.verdict or null>, note: <file.valuation.note or null> },
  kinhdich: { note: <file.kinhdich.note or null> },
  source_file: "<filename>", ts: <file.ts or file._processed.processedAt>
}
```
`valuation`/`kinhdich` (FR-8, PO 2026-08-14 scope-widening) carry the machine-readable publish gate
`bctc-analyst` already computes per ticker (`docs/agents/bctc-analyst/flow/stage-analyze.md`:
`valuation_verdict=AVOID` → "do NOT post bullish signal") plus its Kinh Dịch cross-check note —
chef-dish.md Step 4/7.5 bind conviction direction to these, closing the gap that let an AVOID-gated
ticker (DXG, 2026-08-14 evening) receive an ACCUMULATE call unopposed. Absent on files that predate
this fix or carry no `valuation`/`kinhdich` object — treat as `null`, never fabricate a verdict.
If a ticker has more than one qualifying file this cycle, keep only the most recent by
`ts`/`processedAt`. If ZERO `bctc_signal_*`/`fundamental_*` files were collected this cycle (across
BOTH locations), `$BIZ_CTX_SIGNALS` is empty — this is the ONLY condition under which the
`[gap:business_context_unavailable]` path at Step 7.5 is legitimate. Compute this fresh every cycle
from what THIS Step 0 pass actually read from disk — NEVER from a remembered figure, a prior cycle's
notebook line, or this file's own changelog comments (see FR-0).

Supplementary calls (all OPTIONAL — failure/absence is NOT a blocker):
- `get_market_hexagram()` — market-wide Kinh Dịch state. **501 / tool-not-found = expected; treat as `market_hexagram=unavailable`.** Per memory `feedback_chef_kinhdich_confab`: per-ticker hexagrams come from `get_portfolio_conviction` (Step 5), NOT this call. A 501 here does NOT mean hexagram data is absent.
- `get_macro_snapshot()` — US/VN macro snapshot. **Service unavailable / 5xx = expected** (macro-indicators not in intended runtime; tracked ops board `cow-MACRO-DOWN`). If unavailable: set `macro_state=unavailable` and continue. Do NOT abort.

**P0 Market Indicator Suite (all OPTIONAL — enrich layer analysis if available):**
```
call_tool(server="vn-market", tool="get_volatility_indicators", arguments={})
call_tool(server="vn-market", tool="get_market_sentiment_index", arguments={})
call_tool(server="vn-market", tool="get_foreign_room", arguments={})
call_tool(server="vn-market", tool="get_breadth_thrust", arguments={})
call_tool(server="vn-market", tool="get_roc_momentum", arguments={})
call_tool(server="vn-market", tool="get_relative_strength", arguments={})
call_tool(server="vn-market", tool="get_52w_proximity", arguments={})
call_tool(server="vn-market", tool="get_insider_sentiment", arguments={})
```
If successful: extract volatility regime (gk_vol_20d_pct, vol_regime), market sentiment z-score (news_sentiment_z, sentiment_ema_5d), foreign-room utilization (tickers[].utilization.room_utilization_pct — high pct = exhausted), breadth indicators (mclellan_osc, mclellan_summation, breadth_z_score), momentum indicators (roc, z_score, decile), relative strength metrics (rs, percentile, composite_score), 52-week proximity (pct_from_52w_high, pct_from_52w_low), and insider sentiment (net_sentiment_score). Store as MARKET_INDICATORS context. Use to enrich Step 3 (Layer 2+3 VN stack — FII flow context via foreign-room and sentiment, momentum/RS context for thesis strength) and Step 4 (Layer 4 valuation — volatility/breadth context for conviction scoring, momentum/strength/52w-proximity context for accumulation/distribution risk assessment, insider sentiment context for insider-activity thesis). If any tool returns NULL or error: log `[SKIP] <tool_name> unavailable` and continue — these are enrichment sources only, not blockers.

Note signal count + IDs for LOG step.

---

## Step 1 — CLUSTER (convergence detection)

Group signals by ticker, then by sector.

**Convergence rule — a cluster qualifies when ANY of these is true:**

| Rule | Definition |
|---|---|
| Ticker convergence | ≥2 distinct signal types for the same ticker in same 24h window (e.g. price_anomaly + news_impact for ACB) |
| Sector convergence | ≥3 signals (any type) targeting tickers in the same sector in same 24h window |
| Macro-micro contradiction | A macro signal contradicts the micro signal for a watchlist ticker (e.g. TIGHTENING regime + active BUY alert on VCB) |
| Extreme individual signal | Any signal with `severity=CRITICAL` OR any TA reading outside 2-sigma (RSI < 15 or > 85) — **CHEF may only apply the RSI sub-clause when `get_technical_indicators` was called THIS cycle and returned a numeric RSI value; absent that call, apply `severity=CRITICAL` criterion only** |
| Geopolitical/war convergence (NEW) | Any signal with `event_type` in `[geopolitical_conflict*, trade_war, war]` qualifies as a cluster regardless of ticker/sector count — a single war/trade-war `chain_catalyst` is sufficient to trigger Steps 2-8 even with 0 other signals converging. `*` `geopolitical_conflict` is LANE B; `trade_war` already qualifies today with zero code dependency. |

**Intraday gate:** if `$DISH_TYPE == intraday` AND 0 clusters qualify →
emit SILENT Telemetry per `docs/agents/unified-agent/flow/chef-telemetry.md § SILENT Telemetry`
→ return `DONE: intraday-silent | PIPELINE: complete` and EXIT. No MARKET message.

**Gate-fired contract:** When ≥1 cluster qualifies (or `$DISH_TYPE` is `morning` / `eod` / `evening`), Steps 2–8 are MANDATORY. The agent MUST proceed through all steps and publish. Self-refusal — any English prose such as "I cannot complete the full end-to-end execution here", "these require sequential MCP calls", "BLOCKERS:", or "would you like me to…" — is a flow violation. There is no third path between SENT and FAILED.

**Degraded-dish floor (minimum valid dish) — trigger condition (widened, FIX-CHEF-MIDFLOW-BAIL-DETERMINISM, architect brief 2026-08-07 §2.2):**
```
IF ≥1 supplementary source is down (macro unavailable, get_market_hexagram absent, partial signal set)
   OR execution cannot reach Step 8 for any other reason (tool failure, budget exhaustion,
      uncertainty, self-narrated inability to continue)
```
When triggered: the dish MUST still be published. Procedure lives in `docs/agents/unified-agent/flow/chef-telemetry.md § Degraded-Floor Recovery` — do not re-derive it inline here. That procedure guarantees, at minimum: (1) available signal clusters only; (2) explicit degradation note in Block B WORK message listing which sources were unavailable or which steps were not reached; (3) Block A MARKET prose must not mention unavailable sources — omit that layer cleanly; (4) conviction scores capped at `medium`/degraded. This is the guaranteed floor: a dish with degradation notes beats no dish every time.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

**Morning/EOD/Evening:** always continue even if 0 clusters (publish regime-state update at minimum).

**Continue to dish body:** When Steps 2–8 are required — the gate above fired (≥1 cluster
qualifies) OR $DISH_TYPE is `morning` / `eod` / `evening` — Run sub-flow:
`docs/agents/unified-agent/flow/chef-dish.md` starting at Step 1.5. That file owns the TNB
knowledge lazy-load, Steps 1.5 through 8, and the RETURN block for every non-silent-intraday
cycle. Do not re-derive or duplicate any of its content here.
