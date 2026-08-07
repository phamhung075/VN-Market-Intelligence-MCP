# Cowork Signal/Synthesis Filename WINDOW_KEY Keying — Technical Design

**Task ID:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1, plan_only, supervised)
**Sprint:** COWORK-RELIABILITY · **Agent:** architect · **Date:** 2026-08-07
**Input:** `docs/handoffs/FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING-BA-spec.md` (ba_completed_at 2026-08-07T04:30:56Z, po_goahead 2026-08-07T04:41:31Z, "architect-ready as written")
**Status:** DESIGN ONLY — plan_only:true + supervised:true preserved; no code ships from this brief. PO reviews and decides next steps (developer dispatch or further adjudication).

---

## 0. Zone + Standard Detection

**Zone:** `cross-service/` (multi — doc/flow-spec files only, no `apps/<service>` code touched):
- `docs/agents/bctc-analyst/flow/` (cycle.md, stage-analyze.md, stage-consolidate.md, stage-log-notify.md)
- `docs/agents/unified-agent/flow/` (chef.md, chef-dish.md)
- `docs/agents/tran-ngoc-bau/flow/` (main.md — conditional, see §4)
- `docs/standards/mcp-tools.md` (Signal Bus Naming Contract)
- `docs/agents/dev-team/flow/drain-signals.md` (documentation-only line)

**BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new primitives, no new agent, no new interface — every FR below extends an existing convention already live in at least one sibling flow file).

**Brownfield scan clean:** true — every file cited below was read at source this cycle (not paraphrased from the BA spec or the board row); line numbers verified live, not carried from a stale citation.

---

## 1. Source-verification recap (what changed since the BA spec was written)

The BA spec (§1) cites `chef.md` Step 0.5 as *already* deriving `CYCLE_DATE_UTC` pinned-once — I
re-read the live file and confirm this is shipped (`FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE`
landed): `chef.md` lines ~67-105 today compute `SLOT_ID`, `WORK_DATE` (VN, intraday-only),
`VN_HOUR` (VN, intraday-only), and `CYCLE_DATE_UTC` (UTC, canonical, single-fire `MARKER_KEY` +
`chef-dish.md` Step 7.6 `FILEPATH`/`metadata.date_vn`), with the multi-fire branch's own
`MARKER_KEY = "published:" + SLOT_ID + ":" + WORK_DATE + ":" + VN_HOUR` **unchanged** (explicitly
out of scope for that sibling row).

`FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` Component A (propagate `scheduled_utc=<ISO8601>` into every
`spawn-fanout.md` `trigger_prompt`) has **NOT shipped yet** — live-verified against
`docs/data/cowork-schedule.json`: every `bctc-analyst-slot-{1..4}.trigger_prompt` today reads
`"run docs/agents/bctc-analyst/flow/main.md  slot=bctc-analyst-slot-N"` — no `scheduled_utc=`
token present. This row's FR-1 fallback path (slot→cron lookup) is therefore not a hedge for an
edge case — it is the ACTIVE, only-available path on day one of this row's ship. Design below
treats it as such (not as a secondary branch).

`drain-signals.js:173-186` re-confirmed: `fingerprint = sha256(from+type+JSON.stringify(payload)+createdAt)`; the file's own basename appears only in `dest` (the `mv` target) and the DB's
`source_filename` column, never inside the hash input. FR-6 is a genuine no-op — reconfirmed, not
re-verified for form's sake.

---

## 2. FR-1 — WINDOW_KEY: shared pure-function contract

**One function, reused verbatim by every writer this row touches** (bctc-analyst, chef-intraday).
Not new logic where a working precedent exists (`stage-log-notify.md` §5d-1's `cycle_tick_ISO`,
chef.md's `CRON_HOUR_FLD` lookup) — this FR **names and relocates** that precedent, not
reinvents it.

```
derive_window_key(prompt_text, slot_id, cowork_schedule_json, live_mcp_fetched_at):
  # 1. Preferred (once FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR Component A ships):
  IF prompt_text contains "scheduled_utc=<ISO8601>":
    WINDOW_KEY = round scheduled_utc DOWN to HH:00Z, compact form YYYYMMDDTHHMMSSZ-style
                 (reuse the exact compact-ISO convention already used for cycle_tick_ISO)
    RETURN WINDOW_KEY

  # 2. Fallback (ACTIVE PATH TODAY — scheduled_utc= does not exist yet on any live trigger_prompt):
  IF prompt_text contains "slot=<slot_id>":
    SLOT_RECORD   = jq --arg s "$slot_id" '.slots[] | select(.slot_id==$s)' cowork_schedule_json
    CRON_HOUR_FLD = SLOT_RECORD.cron.split(" ")[1]   # e.g. "15" for bctc-analyst-slot-1
    TODAY_UTC     = date portion of live_mcp_fetched_at (NO Bash `date` call — NFR-2/EC-3)
    WINDOW_KEY    = TODAY_UTC + "T" + zeroPad(CRON_HOUR_FLD) + "00Z"
    RETURN WINDOW_KEY

  # 3. EC-1 — ad-hoc/manual, no token at all:
  WINDOW_KEY = live_mcp_fetched_at rounded DOWN to HH:00Z   # accepted default, same precedent as
                                                              # system-auditor AUDIT_TIER=4
  RETURN WINDOW_KEY
```

Pure function: no I/O beyond a `jq` lookup against an already-loaded schedule file and reading a
value already present in session state (`live_mcp_fetched_at` — the same no-Bash fallback
`stage-log-notify.md` §5d-1 already documents). **Domain layer.**

**NFR-3 (single source of truth, non-negotiable):** every consumer of `WINDOW_KEY` in a given
agent's cycle (filename AND published-marker mutex key) calls this SAME derivation exactly ONCE
per cycle and stores the result in session state; nothing downstream re-derives it independently.
This is the literal fix for the CAUTION the row was annotated with on 2026-07-22 — cycle_id
(run-start-keyed) is explicitly NOT this function's output and must not be substituted for it.

---

## 3. FR-2 (+ FR-7) — bctc-analyst

### 3.1 Sequencing fix (pin earlier)

**Home for the pin:** `docs/agents/bctc-analyst/flow/cycle.md` **Step 0c — Calendar Gate + Mode
Selection**. This step already runs "AFTER stage-bootstrap.md ... BEFORE stage-analyze.md" — the
exact ordering FR-2 needs (WINDOW_KEY must exist before Stages 1-4 write the signal file). No new
step required; add one line deriving `WINDOW_KEY` (§2's function) alongside the existing
`CYCLE_MODE` assignment, store as a session variable for the rest of the cycle.

**Stage 5 reuse (no logic change to the guard itself):** `stage-log-notify.md` §5d-1's
`task_claim(task_id="published:bctc-analyst-<slot_id>:<cycle_tick_ISO>", ...)` — rename the
variable reference from a locally-recomputed `cycle_tick_ISO` to the Step-0c-pinned `WINDOW_KEY`
(same value, same format, just sourced from the earlier pin instead of a second computation at
Stage 5). This is the concrete meaning of "pin-earlier sequencing fix, not new logic" — confirmed
by re-reading `stage-log-notify.md` line 43 live.

### 3.2 Filename rekey (FR-2 proper)

```
docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json
  → docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json
```

Example: `docs/signals/bctc_signal_HPG_20260807T2100Z_routine.json` (slot-3, 21:00 UTC fallback
path). **Infrastructure layer** (write path) + **Application layer** (Step-0c sequencing).

### 3.3 FR-7 — explicit routine-mode emit (bundled, same files touched anyway)

`stage-analyze.md` line 114 documents the emit line for **release** mode only
(`R4. Signal + ledger` block). No equivalent line exists in the **Routine Mode** section (Steps
1–4c) — confirmed live; the routine-mode file that collides 4x/day is written under an
undocumented convention. Add, at the end of Step 4c (Evidence Fragment Recording, immediately
before the `---`/`## Release Mode` header):

```
Emit signal file: docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_routine.json
```

### 3.4 Doc-debt correction found this cycle (fold in, zero extra scope)

`stage-consolidate.md`'s own `## Output` section (line 64) states the pass results are "merged
into the `bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json` signal file **in `stage-log-notify.md` step
5**" — this is stale/incorrect: `stage-log-notify.md` Stage 5 is Notebook + Notify + Deadline; it
contains no `bctc_signal` write instruction anywhere. The actual emit line lives in
`stage-analyze.md` (R4 for release; the new FR-7 line for routine). Correct this cross-reference
in the same edit — an implementer following the existing (wrong) pointer would land the merge
logic in the wrong file.

### 3.5 Files (bctc-analyst)

- `docs/agents/bctc-analyst/flow/cycle.md` — Step 0c: add `WINDOW_KEY` derivation (§2 function).
- `docs/agents/bctc-analyst/flow/stage-analyze.md` — line 114 filename pattern update (release) +
  new explicit routine-mode `Emit signal file:` line (FR-7) + WINDOW_KEY substitution both places.
- `docs/agents/bctc-analyst/flow/stage-consolidate.md` — line 64 cross-reference correction (§3.4)
  + filename pattern update (cosmetic, no logic — this stage performs no disk write).
- `docs/agents/bctc-analyst/flow/stage-log-notify.md` — §5d-1: rename `cycle_tick_ISO` reference to
  the Step-0c-pinned `WINDOW_KEY`; no change to the guard's claim/skip logic.

---

## 4. FR-3 (+ EC-2) — chef/unified-agent (chef-intraday multi-fire only)

**Single-fire slots (morning/eod/evening): NO change.** Confirmed live — `CYCLE_DATE_UTC` already
collapses each to 1 file/window (sibling row's shipped scope). Touching these here would be
scope-creep on a defect that's already closed.

### 4.1 Filename extension

```
docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json
  → docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}-{HOUR_COMPONENT}.json    (intraday only)
```

**NFR-3 governs `HOUR_COMPONENT`'s source, not a free choice.** The multi-fire `MARKER_KEY`
already in production is `"published:" + SLOT_ID + ":" + WORK_DATE + ":" + VN_HOUR` (live-verified,
`chef.md`, unchanged by the sibling row). NFR-3 requires the filename's new hour component derive
from the **identical** upstream value as this mutex key — today that value is `VN_HOUR`, not a
UTC hour. **Phase 1 of this design uses `VN_HOUR` verbatim**, reusing the exact variable already
computed in Step 0.5:

```
Example: docs/data/unified-agent-synthesis-2026-08-07-intraday-09.json   (VN_HOUR=09, 02:13Z fire)
```

### 4.2 EC-2 — timezone-basis hazard: real in principle, bounded in practice today

Appending a VN-local hour next to a UTC calendar date (`CYCLE_DATE_UTC` + `VN_HOUR`) is the
same class of basis-mixing bug the sibling row just closed at daily granularity. **Concretely
bounded for the LIVE cron shape**: chef-intraday's cron is `13 2-8 * * 1-5` — UTC hours 2-8 map
1:1, monotonically, to VN hours 9-15 (UTC+7), entirely within one VN calendar day, nowhere near
the VN-midnight boundary (17:00 UTC). There is no live fire pattern today that can produce two
different UTC windows aliasing to the same `(CYCLE_DATE_UTC, VN_HOUR)` pair, nor a VN-day rollover
mid-window. **This is a real latent hazard, not a false alarm — it is schedule-shape-contingent,
not structurally closed.** If `chef-intraday`'s cron is ever widened to span 17:00 UTC (VN
midnight), this filename+mutex pair would reproduce the exact daily-straddle defect at hourly
grain.

**Phase 2 (deferred, not this row's ship — flagged as a dependency, see §6):** once
`FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` Component A lands `scheduled_utc_time` on chef's live-match
path (today shipped only for the catch-up path per that row's own Component A gap-finding), the
*principled* close is to migrate **both** the multi-fire `MARKER_KEY` and this new filename hour
component to a UTC hour derived from `scheduled_utc_time`, in the same change, so NFR-3 continues
to hold on a basis that has no day-boundary blind spot. Migrating `MARKER_KEY`'s basis is outside
this row's own scope as ratified (the ANCHOR row explicitly excluded multi-fire from its own AC) —
**do not silently bundle a mutex-key basis change into this row's Phase 1 ship.** Record as a
named follow-on task for PM/PO, not as in-scope work here.

### 4.3 `metadata.cycle_id` — explicit non-promotion (PO caution, restated)

`metadata.cycle_id` (`<DISH_TYPE>-<CYCLE_START_UTC>`) stays informational/audit-only. Do NOT
promote it into the filename or the mutex key path — this is the literal 2026-07-22 CAUTION
(`cycle_id` is run-start-keyed, diverges between two peers of the same scheduled window). Document
this explicitly in the `chef-dish.md` Step 7.6 edit so a future pass doesn't "fix" it back in
(BA's own instruction, restated here as an AC for the eventual developer).

### 4.4 Files (chef/unified-agent)

- `docs/agents/unified-agent/flow/chef-dish.md` — Step 7.6 (`FILEPATH` line + inline changelog
  comment at the top of the block, which explicitly names this row and should be updated to
  reflect landing) — add `-{VN_HOUR}` for the intraday branch only; explicit non-promotion note
  for `metadata.cycle_id` (§4.3); EC-2 residual-risk comment (§4.2) for the next reader.
- `docs/agents/unified-agent/flow/chef.md` — Step 0.5: **cross-reference only** — confirm
  `VN_HOUR` stays the value both the filename and `MARKER_KEY` share; no change to the
  `CYCLE_DATE_UTC`/`MARKER_KEY` derivation itself (owned by the sibling row, not reopened here).

---

## 5. FR-4 — tran-ngoc-bau: RAW-verify result (per BA §1 + dispatch instruction)

**Verify performed this cycle** (not deferred): `git log --since=2026-07-29` on
`docs/agent-memory/notebooks/tran-ngoc-bau.md` → exactly **one** commit
(`1f670c381`, "notebook c123 2026-08-06 20:29Z"). Read the live notebook: it retains 1 section on
disk (`c123`) but its own preamble cites the prior two retained-then-pruned cycles by number —
`c121` (2026-07-31, cited in the file's own history note) and `c122` (2026-08-04T20:29Z, cited
inline in `c123`'s own body as the cycle whose self-cure claim it is auditing). **Three tnb-audit
cycles ran since the 2026-07-29 marker-cadence fix (c121, c122, c123) — zero repeat `c<NNN>`
collision observed in any of them.** This corroborates, but with a thin sample (3 cycles, no
adversarial double-dispatch attempt in that window) — it does not prove the race is structurally
unreachable, only that it has not recurred since the gate that used to force >1 same-window
dispatch attempts (weekly-key-blocking-daily-cron) was fixed.

**Serialization primitive availability (BA's open question, resolved):** `INV-GATEWAY-1`
(`commit-mutex` SKILL, dispatcher-only) does **not** apply here — that restriction is scoped to
`dev-*`/`qa`/`ba`/`pm`/`architect` **specialist sub-agent** sessions, which the WF-3 ruling
(`docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md`) found structurally lack
a working gateway binding for `task_claim` in their spawn context. `tran-ngoc-bau` is a different
class: its own tools package (`docs/agents/tools/package/tran-ngoc-bau.md`) confirms `task_claim`
is **ACTIVE** and already in live use (`main.md`'s own PUBLISHED MARKER GATE, Step G-2, calls it
directly today). **If** a write-serialization design is ever needed here, `task_claim` (a fresh
per-cycle claim on a `notebook-write:tran-ngoc-bau` key, held only across the
read-highest-`c<NNN>`→compose→write critical section, released immediately after) is an available
primitive — NOT `commit-mutex` (wrong tool: that skill governs the shared git index critical
section, not the notebook's own read-modify-write race, and is gateway-restricted for a reason
that doesn't apply to tnb regardless).

**Design decision — NOT MADE this cycle, flagged for PO (per dispatch instruction):**

Given (a) the mechanism this row was minted for is genuinely different from FR-2/FR-3's class
(BA §1, EC-5 — a TOCTOU read-modify-write race, not a missing filename discriminator), (b) the
2026-07-29 fix already removed the ONE known trigger (forced same-day multi-dispatch under a
stale weekly gate) that produced the original collision, and (c) only 3 cycles of post-fix
evidence exist (thin, not zero, not adversarial) — **I am not designing a new write-serialization
mechanism this cycle.** Building one now would be speculative engineering against a hazard with no
recurrence in the available evidence window. Recommend PO choose one of:

1. **Close FR-4 as "monitor, no action"** — re-open only if a genuine repeat `c<NNN>` collision
   is observed in a future audit or notebook-write pre-commit hook flag.
2. **Commission a cheap, correctly-scoped design now anyway** (a `task_claim`-based read-lock
   around the existing notebook-write critical section) as defense-in-depth, given this row's own
   3-instance-same-day recurring-bug-escalation history — cheap because the primitive
   (`task_claim`) is already proven in tnb's own flow, no new mechanism class needed.

Both are legitimate; this is a risk-tolerance call, not a technical one — hence the PO flag rather
than an architect default.

**No file changes prescribed for tran-ngoc-bau this cycle** — none until PO adjudicates (1) vs (2)
above.

---

## 6. FR-5 — Signal Bus Naming Contract (`docs/standards/mcp-tools.md`)

Live-verified: the current `## Signal Bus — Naming Contract` section (lines 148-164) documents
only the generic `docs/signals/{from}-{ISO-8601-timestamp}.json` pattern. Neither
`bctc_signal_{TICKER}_*` nor `unified-agent-synthesis-*` (which lives under `docs/data/`, not even
`docs/signals/`) is acknowledged — confirming BA's finding that an SSOT audit of this contract
today cannot discover either file family, let alone this collision class.

**New subsection, added after the existing contract block:**

```markdown
### Ticker-keyed and dish-keyed file families (WINDOW_KEY component, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING)

Two file families exist outside the generic `{from}-{ISO-timestamp}.json` pattern above —
both MUST carry a WINDOW_KEY (scheduled cron fire-window, UTC, rounded down to the slot's own
cadence granularity — never a run-start timestamp / raw `cycle_id`) as their cycle discriminator:

- `docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json` — bctc-analyst, per-ticker,
  `mode` ∈ {routine, release}. `{WINDOW_KEY}` example: `20260807T2100Z`.
- `docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}[-{HOUR_COMPONENT}].json` —
  chef/unified-agent. `{HOUR_COMPONENT}` present ONLY for the multi-fire `intraday` slot; absent
  for single-fire slots (morning/eod/evening), which already collapse to 1 file/window once
  `{CYCLE_DATE}` itself is UTC-anchored.

**WINDOW_KEY invariant:** for any given writer, the SAME value backs both this filename component
AND that writer's published-marker mutex key (`task_claim` on `published:<slot>:<key>`) — never
independently re-derived. Two peers of the identical scheduled window are EXPECTED to collide on
this key by design; the mutex, not the filename, is what prevents the second peer's write (see
NFR-5 — same-window peer collisions are a different, separately-owned hazard).
```

**Files:** `docs/standards/mcp-tools.md` — new subsection, § Signal Bus — Naming Contract.

---

## 7. FR-6 — Drain reader (documentation-only, no code change)

Reconfirmed at source this cycle (§1 above; not re-paraphrased): `drain-signals.js:173`
`fingerprint = sha256(from+type+JSON.stringify(payload)+createdAt)` — the file's basename never
enters the hash. `dest`/`source_filename` reuse whatever basename the writer chose, so a WINDOW_KEY
rekey is fingerprint-neutral by construction — AC-3 is closed with **zero** drain-reader code
change.

**File:** `docs/agents/dev-team/flow/drain-signals.md` — add one line near §0a-1's fingerprint
description: *"Filename is never part of the fingerprint; renaming a writer's basename convention
(e.g. WINDOW_KEY-keying, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING) requires no change here."*
`scripts/agents-flow/drain-signals.js` — **no code change.**

---

## 8. Design decisions summary (for the eventual developer handoff)

| Layer | Decision |
|---|---|
| Domain | One `derive_window_key()` pure function (§2), no I/O beyond an already-loaded schedule lookup + a session-state timestamp read. Shared contract, not per-writer reinvention. |
| Application | Sequencing: pin WINDOW_KEY at bctc-analyst's Step 0c (before Stages 1-4 write); pin chef's `VN_HOUR` reuse at the existing Step 0.5 (already pinned there for the mutex — filename reuses it, no new pin). |
| Infrastructure | Filename template edits only, in the exact files the writer already touches — no new write path, no new file, no new tool call. |
| Interface | `docs/standards/mcp-tools.md` Naming Contract extension (FR-5); `drain-signals.md` one-liner (FR-6); both are documentation-of-existing-invariant, not new contract surface. |

**Reuse-not-duplicate check:** every FR above extends a value or pattern that already exists in at
least one sibling flow file (`cycle_tick_ISO`, `CRON_HOUR_FLD` lookup, `CYCLE_DATE_UTC` pin-once,
`VN_HOUR`, `task_claim`). No new interface, no new agent capability, no new MCP tool is proposed
anywhere in this design.

**Test strategy (for developer, once dispatched):**
- Unit-level: `derive_window_key()`'s 3 branches (scheduled_utc present / slot→cron fallback /
  ad-hoc wall-clock) — pure function, straightforward table-driven test.
- Integration: two same-day bctc-analyst slots (e.g. slot-1 15:00Z, slot-2 18:00Z) must resolve to
  two DISTINCT `bctc_signal_HPG_*` paths on disk (AC-1); a manual re-run of the SAME slot within
  the same fallback hour must resolve to the SAME path (EC-1 accepted collision, mutex is what
  actually protects it per NFR-5).
- Regression: `drain-signals.test.js`'s existing fingerprint-neutrality assertions must still pass
  unmodified against a WINDOW_KEY-keyed filename (NFR-4).
- chef-intraday: two same-VN-day, different-hour fires must land two distinct
  `unified-agent-synthesis-*-intraday-{HH}.json` files (AC-4/tnb-c112 fold-in).

---

## 9. Acceptance-criteria mapping (unchanged from BA §7 — carried forward, not redesigned)

| Board AC | Satisfied by |
|---|---|
| AC-1 (two same-day cycles never share a path) | §3.2 (bctc), §4.1 (chef-intraday) |
| AC-2 (between-drains double-write can't silently destroy an unrouted signal) | §3.2, §4.1 + §7 (drain inherits uniqueness automatically) |
| AC-3 (drain-reader change, if any, preserves routing) | §7 — satisfied by confirmed NO-OP |
| AC-4 / tnb-c112 (every non-silent intraday cycle surfaces on disk) | §4.1 (distinct path per VN_HOUR ⇒ no first-write-wins/last-write-clobber) |

FR-4/tnb has no AC mapping this cycle — see §5, PO decision pending.

---

## 10. Open items for PO (explicit, not buried)

1. **FR-4 disposition** (§5) — "monitor, no action" vs. "commission a cheap `task_claim`-based
   read-lock now anyway." Not a technical blocker; a risk-tolerance call.
2. **EC-2 Phase 2** (§4.2) — migrating chef-intraday's multi-fire `MARKER_KEY` basis from
   `VN_HOUR` to a UTC hour (once `scheduled_utc_time` reaches the live-match path) is a **new**,
   separate small task — it reopens scope the sibling ANCHOR row deliberately excluded. Recommend
   PO mint a follow-on FIX/FU row once `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` Component A ships,
   rather than silently fold it into this row's Phase 1 developer handoff.
3. Per BA §5 (not re-litigated here, carried forward as a reminder): the field-schema-instability
   finding (bctc_signal_* payload keys drifting cycle-to-cycle) is a separate, already-flagged
   follow-up — this row's filename fix does not make any revision's fields predictable, only stops
   revisions from destroying each other on disk.

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-architect.md`, task_id
`FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`.

## RETURN
```
DONE: Technical design complete for FR-1..FR-7/NFR-1..NFR-5/EC-1..EC-5. plan_only+supervised
      preserved — no code shipped. FR-4 RAW-verify performed (§5): 3 tnb-audit cycles since the
      2026-07-29 marker-cadence fix, zero repeat c<NNN> collision — disposition flagged to PO,
      not decided by architect.
ZONE: cross-service/ (multi — see §0)
NEXT: po | review brief, adjudicate §10 open items, decide developer dispatch
HANDOFF: docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md
PIPELINE: hold — supervised row, no auto-continue
```
