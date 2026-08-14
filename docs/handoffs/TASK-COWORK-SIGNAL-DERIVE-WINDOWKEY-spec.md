# `derive_window_key()` — Shared Pure Function Specification

**Task ID:** TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY (P1, size S, zone `cross-service/shared`, plan_only, supervised)
**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (Phase 1, task 1 of 4)
**Sprint:** COWORK-RELIABILITY · **Agent:** developer · **Date:** 2026-08-08
**Status:** SPEC ONLY — `plan_only:true` + `supervised:true` inherited from parent, preserved. **No code ships from
this document.** This is a handoff artifact for a future *unsupervised* developer dispatch to implement verbatim,
after PO re-adjudicates the parent row per its own stated policy.

**Inputs read at source before writing this spec** (all live-verified this cycle, not paraphrased):
- `docs/data/orch/orch-state.json` → `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` (full row, including
  `po_architect_signoff_20260807T0545.amendment_3_FR1_WINDOWKEY_MIDNIGHT_STRADDLE` — the binding correction this
  spec implements).
- `docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md` §1 (source-verification recap)
  and §2 (FR-1 original 3-branch pseudocode — branches 1 and 3 below are unchanged from this source; branch 2 is
  replaced per Amendment 3).
- `docs/agents/bctc-analyst/flow/stage-log-notify.md` line 40-48 (`cycle_tick_ISO` convention this function's
  output format must match).
- `docs/data/cowork-schedule.json` (live bctc-analyst slot crons, re-confirmed: slot-1 `0 15 * * *`, slot-2
  `0 18 * * *`, slot-3 `0 21 * * *`, slot-4 `0 0 * * *` — the midnight boundary Amendment 3(a) names is real,
  slot-4's cron hour field is literally `0`).

---

## 1. Function contract

```
derive_window_key(
  prompt_text:          string,   # the agent's live trigger_prompt text (spawn-fanout.md payload)
  slot_id:               string,   # e.g. "bctc-analyst-slot-3", "chef-intraday"
  cowork_schedule_json:  object,   # already-loaded contents of docs/data/cowork-schedule.json
  live_mcp_fetched_at:   string    # ISO8601, already in session state (no re-fetch, no wall-clock read)
) -> string   # WINDOW_KEY, compact-ISO form, e.g. "20260807T2100Z"
```

**Domain layer. Pure function.** No network I/O, no filesystem write, no wall-clock read. The only two data
accesses are (a) a `jq` lookup against `cowork_schedule_json` — a value already loaded into session state by the
caller before this function runs, not fetched here — and (b) arithmetic on `live_mcp_fetched_at` — a value
already in session state per the `stage-log-notify.md` no-Bash-`date` convention this function inherits
verbatim. Given the same four inputs, this function MUST return the same output every time — no hidden state,
no `Date.now()`, no `new Date()` with no argument, no shell `date` invocation without an explicit `-d`/`@epoch`
argument sourced from `live_mcp_fetched_at` itself. See §4 for the full purity confirmation.

**Return format — do not invent a new one.** The two concrete worked examples already live in the architecture
brief use a 4-digit-hour+minute compact form with no seconds field, consistently, in both places it appears:
- brief §3.2: `docs/signals/bctc_signal_HPG_20260807T2100Z_routine.json`
- brief §6 (Naming Contract addition): `` `{WINDOW_KEY}` example: `20260807T2100Z` ``

Format: **`YYYYMMDDTHHMMZ`** (UTC), i.e. `pad4(YYYY) + pad2(MM) + pad2(DD) + "T" + pad2(HH) + "00" + "Z"`. The
minute field is always literal `"00"` because every branch below resolves to an exact clock hour (`round DOWN to
HH:00Z` in branches 1/3, an exact `CRON_HOUR:00Z` occurrence in branch 2) — there is no case in which a non-zero
minute is ever produced, so the format needs no minute-rounding logic beyond always emitting `"00"`.

(Note for the implementer: the brief's own §2 prose describes the general style as
`YYYYMMDDTHHMMSSZ-style`, i.e. "in the spirit of compact-ISO", but every concrete instance of the value anywhere
in the brief — including the string this function's own name will be reused for — omits the seconds field. This
spec follows the two concrete instances, not the loose prose gloss, since the concrete strings are what
`bctc_signal_*` filenames and the Naming Contract subsection will literally contain. Do not add a `SS` component.)

---

## 2. Full corrected pseudocode

Branches 1 and 3 are **unchanged** from `docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md`
§2. Branch 2 is replaced per PO's binding `amendment_3_FR1_WINDOWKEY_MIDNIGHT_STRADDLE`.

```
derive_window_key(prompt_text, slot_id, cowork_schedule_json, live_mcp_fetched_at):

  # ---------------------------------------------------------------------
  # Branch 1 — PREFERRED (once FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR Component A
  # ships scheduled_utc= onto live trigger_prompts). UNCHANGED from the brief.
  # ---------------------------------------------------------------------
  IF prompt_text contains "scheduled_utc=<ISO8601>":
    scheduled_utc = parse_iso8601( extract_token(prompt_text, "scheduled_utc=") )
    WINDOW_KEY    = round_down_to_hour(scheduled_utc)     # HH:00Z of the SAME value, no lookup needed
    RETURN format_compact(WINDOW_KEY)                      # "YYYYMMDDTHHMMZ"

  # ---------------------------------------------------------------------
  # Branch 2 — FALLBACK, ACTIVE PATH TODAY (scheduled_utc= does not exist on
  # any live trigger_prompt as of this cycle — re-verified against
  # docs/data/cowork-schedule.json, no slot's trigger_prompt carries the token).
  # REPLACED per PO Amendment 3 — nearest-occurrence, not date-concat.
  # ---------------------------------------------------------------------
  IF prompt_text contains "slot=<slot_id>":

    # 2a. Resolve the slot's nominal cron hour — UNCHANGED lookup from the brief.
    SLOT_RECORD   = jq --arg s "$slot_id" '.slots[] | select(.slot_id==$s)' cowork_schedule_json
    CRON_HOUR_FLD = SLOT_RECORD.cron.split(" ")[1]          # 2nd whitespace-delimited cron field
                                                              # e.g. "21" (slot-3), "0" (slot-4)
    CRON_HOUR     = parseInt(CRON_HOUR_FLD, 10)              # integer 0-23

    # 2b. Parse the passed-in fetch timestamp. Pure parse, no wall-clock read.
    FETCHED_TS  = parse_iso8601(live_mcp_fetched_at)         # epoch seconds
    TODAY_DATE  = calendar_date_of(FETCHED_TS)               # UTC Y-M-D component of the SAME value

    # 2c. Build the 3-candidate set: the CRON_HOUR:00Z occurrence on the day
    #     before, the day of, and the day after TODAY_DATE. This is always
    #     sufficient — see §3.1 for the coverage proof — because consecutive
    #     occurrences of a once-daily cron are exactly 24h apart, and
    #     FETCHED_TS always lies inside a single UTC calendar day, so the
    #     true nearest occurrence is always one of these three.
    #
    #     Order matters for the tie-break in 2d — iterate in this exact
    #     chronological order, do not reorder or parallelize the scan.
    CANDIDATES = []
    FOR OFFSET_DAYS IN [-1, 0, +1]:                          # yesterday, today, tomorrow — in THIS order
      CAND_DATE = TODAY_DATE + OFFSET_DAYS days               # pure calendar-day arithmetic (see §4 —
                                                                # NOT a Bash `date` call; jq's
                                                                # fromdateiso8601/+86400*N/todateiso8601, or any
                                                                # equivalent library call that takes ONLY
                                                                # TODAY_DATE + an integer offset as input, with
                                                                # no wall-clock read, is an acceptable
                                                                # implementation of this line)
      CAND_TS   = utc_timestamp(CAND_DATE, hour=CRON_HOUR, minute=0, second=0)
      CANDIDATES.append(CAND_TS)

    # 2d. Select the candidate with minimum |delta| from FETCHED_TS.
    #     STRICT less-than comparison — see §3.2 for the tie-break rationale.
    BEST       = null
    BEST_DELTA = +infinity
    FOR CAND_TS IN CANDIDATES:                                # scanned in the [-1, 0, +1] order built above
      DELTA = abs(CAND_TS - FETCHED_TS)                        # seconds
      IF DELTA < BEST_DELTA:                                    # strict "<" — an exact tie does NOT overwrite
        BEST       = CAND_TS
        BEST_DELTA = DELTA
      # else (DELTA >= BEST_DELTA): no-op. On an exact tie the FIRST candidate
      # encountered in chronological order — i.e. the chronologically EARLIER
      # (more-past) of the two tied candidates — is kept. No separate
      # tie-break branch is needed; it falls out of "iterate in chronological
      # order + strict less-than" by construction.

    WINDOW_KEY = BEST
    RETURN format_compact(WINDOW_KEY)                         # "YYYYMMDDTHHMMZ"

  # ---------------------------------------------------------------------
  # Branch 3 — EC-1, ad-hoc/manual dispatch, no token at all. UNCHANGED
  # from the brief (same precedent as system-auditor AUDIT_TIER=4).
  # ---------------------------------------------------------------------
  WINDOW_KEY = round_down_to_hour(parse_iso8601(live_mcp_fetched_at))
  RETURN format_compact(WINDOW_KEY)
```

`format_compact(ts)` = `` `${pad4(year(ts))}${pad2(month(ts))}${pad2(day(ts))}T${pad2(hour(ts))}00Z` `` — see §1.

---

## 3. Branch 2 — detailed rationale

### 3.1 Why 3 candidates are always sufficient (coverage proof)

A once-daily cron produces occurrences exactly 24h apart: `..., CRON_HOUR:00Z on day D-1, CRON_HOUR:00Z on day D,
CRON_HOUR:00Z on day D+1, ...`. `FETCHED_TS` always falls inside exactly one UTC calendar day, `TODAY_DATE`. The
*true* global-nearest occurrence to any point inside `[TODAY_DATE 00:00Z, TODAY_DATE+1 00:00Z)` can only be
`TODAY_DATE`'s own occurrence, the occurrence on the day immediately before, or the occurrence on the day
immediately after — no occurrence two or more days away can ever be nearer, because the occurrence exactly one
day away is already at most 24h from any point in `TODAY_DATE`, and the next-nearest candidate beyond that is at
least 48h away. So `{yesterday, today, tomorrow}` always contains the true minimum; a wider window is never
needed and a narrower one (e.g. dropping "today") would be wrong — test case 2 below picks the *yesterday*
candidate, not the same-date one, which is why all three must be evaluated on every call, not short-circuited.

### 3.2 Tie-break rule (defensive — not reachable under the live cron table today)

An exact `|delta|` tie between two candidates can only occur when `FETCHED_TS` sits precisely halfway between two
consecutive occurrences, i.e. exactly 12h from each (since consecutive occurrences are 24h apart). Under the
live `cowork-schedule.json` bctc-analyst crons (slots at 15/18/21/0 UTC) this would require a fire exactly 12h
off its own nominal slot time, which is far outside any observed or designed catch-up/backstop tolerance in this
fleet (backstop fires documented elsewhere run minutes early/late, not half a day) — **not reachable in practice
today.** The rule is still specified explicitly, per the dispatch instruction, for robustness against a future
schedule change (e.g. a 12-hourly cron) that would make it reachable:

**Rule: on an exact tie, prefer the chronologically EARLIER (more-past) candidate.**

Implementation note: this requires no special-case code. Scanning `CANDIDATES` in chronological order
(`[-1, 0, +1]`, i.e. yesterday → today → tomorrow) and updating `BEST` only on a **strict** `<` comparison means
the first candidate reached with the minimum delta is kept, and a later candidate with an *equal* delta never
overwrites it. Since the scan order is chronological, "first reached" and "chronologically earliest of the tied
set" are the same candidate by construction.

*Why earlier, not later, on a tie:* this fallback branch exists specifically for catch-up/backstop and
manual-re-run scenarios (per the brief's own framing, "ACTIVE PATH TODAY" and EC-1's manual-re-run case) — the
operating context is recovering a window that already should have fired, not pre-claiming one that has not yet
opened. Preferring the past candidate on a genuine tie is the conservative choice consistent with that context:
it never resolves an ambiguous fire to a window that has not started yet.

---

## 4. Worked test cases (PO-mandated, both required)

Both cases use the live bctc-analyst crons re-confirmed against `docs/data/cowork-schedule.json` this cycle:
slot-3 → `0 21 * * *` (`CRON_HOUR = 21`), slot-4 → `0 0 * * *` (`CRON_HOUR = 0`). `D` denotes an arbitrary UTC
calendar date; a concrete instantiation (`D = 2026-08-07`) is given alongside each for readability.

### Test case 1 — early-fire, slot-4, `live_mcp_fetched_at = D 23:57:00Z`

- `slot_id = "bctc-analyst-slot-4"`, `CRON_HOUR = 0` (cron `0 0 * * *`, field `[1] = "0"`)
- `FETCHED_TS = D 23:57:00Z`, `TODAY_DATE = D` (date portion of `FETCHED_TS`)
- Candidate set (`CRON_HOUR:00Z` on `TODAY_DATE ± {1,0,-1}` days... i.e. `[-1, 0, +1]` offset from `TODAY_DATE`):

  | Offset | Candidate (`CAND_TS`) | `\|delta\|` from `D 23:57:00Z` |
  |---|---|---|
  | -1 (yesterday) | `(D-1)T00:00:00Z` | `47h57m = 172,620s` |
  | 0 (today) | `D T00:00:00Z` | `23h57m = 86,220s` |
  | +1 (tomorrow) | `(D+1)T00:00:00Z` | `3m = 180s` |

- Minimum `|delta|` = `180s`, held by the **tomorrow** candidate → `BEST = (D+1)T00:00:00Z`.
- `WINDOW_KEY = format_compact((D+1)T00:00:00Z) = "(D+1)T0000Z"`.
- **Result: `(D+1)T0000Z` — matches the required resolution.** (Concrete: `D = 2026-08-07` →
  `live_mcp_fetched_at = "2026-08-07T23:57:00Z"` → `WINDOW_KEY = "20260808T0000Z"`.)
- Confirms Amendment 3(a): the unconditional-date-concat algorithm this replaces would have produced
  `D T0000Z` (today's own midnight — the PREVIOUS day's slot-4 window, clobbering a 24h-old file). The
  nearest-occurrence algorithm correctly resolves to tomorrow's window instead.

### Test case 2 — late-fire, slot-3, `live_mcp_fetched_at = (D+1) 08:00:00Z`

- `slot_id = "bctc-analyst-slot-3"`, `CRON_HOUR = 21` (cron `0 21 * * *`, field `[1] = "21"`)
- `FETCHED_TS = (D+1) 08:00:00Z`, `TODAY_DATE = D+1` (date portion of `FETCHED_TS`)
- Candidate set (`CRON_HOUR:00Z` on `TODAY_DATE ± {1,0,-1}` days, i.e. relative to `D+1`):

  | Offset | Candidate (`CAND_TS`) | `\|delta\|` from `(D+1) 08:00:00Z` |
  |---|---|---|
  | -1 (yesterday, i.e. day `D`) | `D T21:00:00Z` | `11h = 39,600s` |
  | 0 (today, i.e. day `D+1`) | `(D+1)T21:00:00Z` | `13h = 46,800s` |
  | +1 (tomorrow, i.e. day `D+2`) | `(D+2)T21:00:00Z` | `37h = 133,200s` |

- Minimum `|delta|` = `39,600s`, held by the **yesterday** candidate → `BEST = D T21:00:00Z`.
- `WINDOW_KEY = format_compact(D T21:00:00Z) = "D T2100Z"`.
- **Result: `(D)T2100Z` — matches the required resolution.** (Concrete: `D = 2026-08-07` →
  `live_mcp_fetched_at = "2026-08-08T08:00:00Z"` → `WINDOW_KEY = "20260807T2100Z"` — note this is exactly the
  brief's own worked filename example, `bctc_signal_HPG_20260807T2100Z_routine.json`, reached independently
  here via the corrected algorithm rather than copied from it.)
- Confirms Amendment 3(b): the unconditional-date-concat algorithm this replaces would have produced
  `(D+1)T2100Z` (a FUTURE window — the one the real next slot-3 fire would then collide with). The
  nearest-occurrence algorithm correctly resolves to the past window that this late/re-run fire actually
  belongs to instead.

---

## 5. Why "nearest", not "most-recent-at-or-before"

A simpler-sounding rule — "take the most recent `CRON_HOUR:00Z` at or before `live_mcp_fetched_at`" — is wrong
for this fallback branch because the two reachable failure directions require opposite answers:

- **Early-fire (test case 1):** a backstop/catch-up fire a few minutes *before* its own nominal window
  (`D 23:57Z` for a `00:00Z` slot) has **no** `CRON_HOUR:00Z` occurrence at-or-before it that belongs to its own
  intended window — the most-recent-at-or-before occurrence is `D`'s midnight, which is the *previous* day's
  window. A most-recent-at-or-before rule would clobber that 24h-old file, reproducing exactly the collision
  class this whole row exists to close. Only "nearest" (which looks *forward* to `(D+1)T0000Z`, 3 minutes away,
  instead of *backward* to a occurrence 23h57m away) resolves this correctly.
- **Late-fire (test case 2):** a delayed or manually re-run fire *after* its own nominal window
  (`(D+1) 08:00Z` for a `21:00Z` slot the previous day) must resolve *backward*, to `D T2100Z` — the window it
  actually belongs to. Here "most-recent-at-or-before" happens to give the same answer as "nearest" (`D T2100Z`
  is both the most recent occurrence at-or-before `FETCHED_TS`, and the nearest one) — but only because this
  particular delay (11h) is still closer to the past occurrence than the future one.

No single fixed direction (always-backward, always-forward) is correct for both cases; the run can be
early-relative-to-its-own-window (needs a forward look) or late-relative-to-its-own-window (needs a backward
look), and the fallback branch cannot know in advance which one a given `live_mcp_fetched_at` represents. "Take
the occurrence with minimum `|delta|`" is the one rule that is symmetric in both directions and gives the
window-owner-correct answer regardless of which side of its own nominal time a fire lands on. This is the same
UTC-day-boundary hazard the row's 2026-07-22 CAUTION and this task's own Amendment 3 both name — Amendment 3 is
the closure of that hazard specifically for this fallback branch.

---

## 6. Purity confirmation (NFR-2 / EC-3)

- **No Bash `date` calls.** No step in §2 shells out to the `date` binary. `parse_iso8601`, `calendar_date_of`,
  the `± days` arithmetic, and `format_compact` are all pure parse/format/arithmetic operations on the
  `live_mcp_fetched_at` string that is passed in — never a re-read of the system clock. An implementer may use
  `jq`'s `fromdateiso8601` / `todateiso8601` / plain integer `+86400*N` arithmetic (jq is already the mandated
  tool for the schedule lookup in the same function, so this introduces no new dependency), or any language
  runtime's date library called with an explicit epoch/ISO argument sourced only from `live_mcp_fetched_at` —
  never a no-argument constructor (`new Date()` / `Date.now()` / bare `date` with no `-d`/`-u`/`@epoch` flag are
  all forbidden inside this function).
- **No wall-clock reads anywhere else in the function.** The only two inputs consulted are (a) the already-loaded
  `cowork_schedule_json` object via a `jq` lookup (no file re-read — the caller loads it once per cycle, per
  NFR-3 below) and (b) the passed-in `live_mcp_fetched_at` value. Nothing else is read.
- **Deterministic / idempotent.** Calling `derive_window_key()` twice with byte-identical arguments returns
  byte-identical output, always — a required property for NFR-3 (§7) to hold.

---

## 7. Consumers — shared-dependency contract

This function is the **single, shared** dependency of both sibling tasks in this decomposition:

- `TASK-COWORK-SIGNAL-BCTC-REKEY` — bctc-analyst's `docs/agents/bctc-analyst/flow/cycle.md` Step 0c pins
  `WINDOW_KEY` once per cycle by calling this function; `stage-analyze.md` and `stage-log-notify.md` both reuse
  the SAME pinned value (never re-derive) for the filename and the `published:bctc-analyst-<slot_id>:<...>`
  mutex key respectively.
- `TASK-COWORK-SIGNAL-CHEF-INTRADAY` — chef/unified-agent's multi-fire intraday branch (per the architecture
  brief §4, `VN_HOUR` stays the Phase-1 basis for that writer's own hour component — this function's fallback
  branch 2 is written generically enough to serve either writer once `slot_id`/`cowork_schedule_json` resolve to
  the correct slot record for whichever caller invokes it; task 3 owns confirming/wiring that call site, not this
  spec).

**Exactness required of both consumers, per NFR-3 (single source of truth, restated from the brief and unchanged
by this correction):** every consumer of `WINDOW_KEY` within one agent cycle — the filename AND the
published-marker mutex key — calls `derive_window_key()` **exactly once** per cycle and stores the result in
session state; nothing downstream re-derives it independently, and nothing substitutes the raw, run-start-keyed
`cycle_id` for it (the literal 2026-07-22 CAUTION this row was minted to close). The function signature (§1),
the branch-1/branch-3 behavior (unchanged), and the return format (`YYYYMMDDTHHMMZ`, §1) are the fixed contract
both consumer tasks must code against without modification; only branch 2's algorithm (§2-§3) is new content
introduced by this spec.

---

## 8. Non-goals (plan_only reminder)

- No file inside `docs/agents/bctc-analyst/flow/`, `docs/agents/unified-agent/flow/`, or
  `docs/agents/tran-ngoc-bau/flow/` is touched by this task — those are `TASK-COWORK-SIGNAL-BCTC-REKEY` /
  `TASK-COWORK-SIGNAL-CHEF-INTRADAY` scope (tasks 2/3), separate dispatches.
- No shared pure-function file is created in application code by this task. This document is the spec a future
  *unsupervised* developer dispatch implements from, after PO re-adjudicates the parent row (per the parent's own
  `supervised_note`: "no code ships without parent re-adjudication by PO").
- `TASK-COWORK-SIGNAL-NAMING-CONTRACT` (task 4, `docs/standards/mcp-tools.md` Naming Contract subsection) is not
  attempted here.

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-developer.md`, task_id
`TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY`.

## RETURN
```
DONE: Spec complete for derive_window_key() — branch 1/3 unchanged from architect brief, branch 2 replaced with
      PO Amendment 3's nearest-occurrence algorithm (candidate set {yesterday,today,tomorrow} at CRON_HOUR:00Z,
      min |delta|, tie-break=earlier-by-scan-order). Both PO-mandated test cases worked through explicitly and
      both resolve correctly. plan_only+supervised preserved — no code shipped, no writer files touched.
ZONE: cross-service/shared
NEXT: po | review spec (this row moves to review[], next_agent=po per dispatch instruction)
HANDOFF: docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md
PIPELINE: hold — supervised row, no auto-continue; tasks 2/3/4 remain separate dispatches
```

---

## 9. PO Adjudication — 2026-08-14T14:58:42Z (appended by po, sign-off)

**VERDICT: ACCEPTED — `DONE_VERIFIED`, with ONE binding amendment (Amendment 4, below).**
Same disposition shape as this row's parent received at `po_architect_signoff_20260807T0545`: approved in
place with an acceptance-bearing amendment, **not** returned for rework. The deliverable — branch 2's
nearest-occurrence algorithm — is correct as specified and is not being changed.

### 9.1 What PO re-verified at source this tick (not read from this document's prose)

| Claim in this spec | Verified how | Result |
|---|---|---|
| bctc slot crons `0 15/18/21/0 * * *` | `jq .slots[] docs/data/cowork-schedule.json` | CONFIRMED, all 4 exact |
| `scheduled_utc=` absent from every live trigger_prompt ⇒ branch 1 dormant, branch 2 is the ACTIVE path | `grep -c 'scheduled_utc=' docs/data/cowork-schedule.json` → `0` | CONFIRMED |
| `slot=<slot_id>` present on live trigger_prompts ⇒ branch 2 is reachable at all | live `trigger_prompt` read for all 4 bctc slots + chef-intraday | CONFIRMED (`run …/main.md  slot=bctc-analyst-slot-N`) |
| Test case 1 → `20260808T0000Z` | candidate set + \|delta\| recomputed independently (172620 / 86220 / **180**) | CONFIRMED exact |
| Test case 2 → `20260807T2100Z` | candidate set + \|delta\| recomputed independently (**39600** / 46800 / 133200) | CONFIRMED exact |

Both PO-mandated Amendment-3 cases reproduce to the second. The `YYYYMMDDTHHMMZ` (no `SS`) format call is
**upheld** — deferring to the brief's two concrete instances over its looser prose gloss was the right read,
and flagging it inline so no implementer re-adds a seconds field was the right call.

### 9.2 Amendment 4 — BINDING, acceptance-bearing, on the future unsupervised implementer

**Branch 2 has an unstated precondition and no guard for its violation.**

`CRON_HOUR = parseInt(CRON_HOUR_FLD, 10)` (§2, step 2a) and the §3.1 coverage proof are sound **only** for a
cron whose hour field is a bare integer **and** which fires **once per day**. Neither condition is stated, and
neither is checked. Live-verified against all 23 slots in `docs/data/cowork-schedule.json` this tick:

- **Satisfied by** `bctc-analyst-slot-1..4` — the only writer that actually calls this function (task 2).
- **VIOLATED by** `chef-intraday` = `13 2-8 * * 1-5` (hour field is a **range**, 7 fires/day), and by every
  step-cron: `news-scout-offhours` / `market-watcher-offhours` / `alert-commander-critical` = `0 */4 * * *`,
  `alert-commander-market` = `*/15 2-8 * * 1-5`.

On a violating field the parse is **undefined and unguarded**: `jq`'s `tonumber` *errors* on `"2-8"`, while a
JS `parseInt("2-8", 10)` silently returns **`2`** (and `parseInt("*/4", 10)` returns `NaN`). The silent-`2`
path is the dangerous one — it collapses all seven of chef-intraday's daily windows onto **one key per day**,
reproducing precisely the collision class this parent row exists to close. §3.1's proof also fails outright
there: its load-bearing premise, "consecutive occurrences of a once-daily cron are exactly 24h apart", is
false for a multi-fire cron, so `{yesterday, today, tomorrow}` is not merely insufficient but structurally
the wrong candidate set.

**Required — three changes, none of which touch the verified algorithm or either test case:**

- **(a) §7 is factually wrong and must be corrected.** Strike the claim that this function is "the **single,
  shared** dependency of both sibling tasks" and that branch 2 "is written generically enough to serve either
  writer". Refuted at source: `docs/handoffs/TASK-COWORK-SIGNAL-CHEF-INTRADAY-spec.md` line 13 states, in
  bold, **"This task does NOT depend on `derive_window_key()`."** — task 3 uses `VN_HOUR`. Task 1 and task 3
  are currently in **written disagreement** about whether task 3 consumes task 1; **task 3's version is
  correct** and §7 is corrected to match. `TASK-COWORK-SIGNAL-BCTC-REKEY` is the sole real consumer. This
  same over-claim was inherited from architect brief §2 ("One function, reused verbatim by every writer this
  row touches (bctc-analyst, chef-intraday)") — recorded here so it is not inherited a third time.
- **(b) Add an explicit precondition + fail-loud to branch 2.** If `CRON_HOUR_FLD` does not match
  `^([01]?[0-9]|2[0-3])$`, the function MUST fail loud (throw / non-zero exit) per
  `docs/protocols/fail-loud-protocol.md`. It MUST NOT parse-and-continue, and MUST NOT silently fall through
  to branch 3 — a silent fallback emits a *plausible-looking wrong key*, which is exactly the failure mode
  this row exists to eliminate. ~3 lines in a spec nobody has implemented yet.
- **(c) §3.1 must state its own precondition** ("once-daily cron; not valid for range/step hour fields"), so
  the next reader cannot re-derive the false generality claim from the proof.

### 9.3 Explicitly NOT granted by this sign-off

`plan_only` + `supervised` remain **PRESERVED**. This sign-off certifies the **spec artifact**, not a licence
to ship. Per the parent's own `supervised_note`, no code ships until PO re-adjudicates
`FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` — which still owes review on the remaining children
(`TASK-COWORK-SIGNAL-BCTC-REKEY`, `TASK-COWORK-SIGNAL-CHEF-INTRADAY`, `TASK-COWORK-SIGNAL-NAMING-CONTRACT`)
and remains `BLOCKED`, `next_agent=po`. An implementer arriving here MUST carry Amendment 4 (a)+(b)+(c).
