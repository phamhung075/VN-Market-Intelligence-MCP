# BA Spec — FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING

**Agent:** ba · **Date:** 2026-08-07 · **Task:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1, size M, plan_only, supervised)
**Sprint:** COWORK-RELIABILITY · **Blockers for PO:** NONE (all open items below are HOW-questions for architect)

---

## 0. Executive Summary

Three writers (`bctc-analyst`, `chef`/`unified-agent`, `tran-ngoc-bau`) share ONE root-cause CLASS
("no per-window discriminator in a shared key → intra-day collision") but the mechanism differs
per writer:

| Writer | Colliding key | Mechanism | Fix class |
|---|---|---|---|
| bctc-analyst | `docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json` | filename, independent writes | **filename window-anchor** |
| chef/unified-agent | `docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json` | filename, independent writes | **filename window-anchor** (intraday only — single-fire slots already 1:1 once date is window-anchored by the sibling row) |
| tran-ngoc-bau | `## c<NNN> · <ISO>` heading inside ONE shared notebook file | **read-modify-write race on a mutable counter**, not a static filename | **write-serialization**, NOT a filename fix — DIFFERENT mechanism, do not apply FR-2/FR-3's cure here |

**Do NOT re-key on raw `cycle_id`** — PO's 2026-07-22 caution (still binding) proved `cycle_id` is
RUN-START-derived and diverges between two peers of the SAME scheduled window (chef-evening
double-publish, `evening-2026-07-22T19:56:00Z` vs `evening-2026-07-22T20:00:37Z`). The key must be
a **WINDOW_KEY** — the scheduled cron fire-window in UTC — the same anchor
`FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` (READY, architect-owned, design partially landed in
`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` Component A)
already mandates for the publish-mutex key, so filename-key and mutex-key agree **by construction**
(this row's own CRITICAL CAUTION annotation, verbatim requirement).

**Verified NO-OP finding (saves scope):** `scripts/agents-flow/drain-signals.js` fingerprints and
routes purely on JSON **content** (`sha256(from+type+payload+createdAt)`), never on filename. Its
`processed/` destination reuses whatever basename the writer chose. Once the writer's filename is
unique, the drain automatically inherits uniqueness at BOTH the inbox layer and the `processed/`
layer — **no drain-reader code change is required** for AC-1/AC-2. This closes AC-3 by construction;
flagging so the implementer doesn't spend budget re-engineering a reader that isn't broken.

---

## 1. Root-Cause Evidence (read at source this cycle, not paraphrased from the board row)

- **bctc-analyst**, live-verified 2026-08-07: `docs/signals/processed/bctc_signal_HPG_20260807_routine.json`
  carries NO `cycle_id`/`slot` field at all today — worse than the board row's own citation, which
  found `cycle_id`/`slot` present in some earlier revisions. Field presence has DRIFTED, confirming
  PO's 2026-07-30 schema-instability measurement is not a one-off: `git show 236310900:...HPG_20260730...`
  (18:07Z) has 24 keys incl. `cycle_id`/`kd_reading`/`esc4_result`; `git show 23aeea6ed:...` (21:07Z,
  same nominal file) has 12 keys, NONE of the forensic ones, only `esc3_status`/`esc4_status` survive.
- **bctc-analyst's own flow docs never explicitly instruct a routine-mode signal-file emit** —
  `stage-analyze.md:114` documents the emit line for RELEASE mode only
  (`docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_release.json`); `stage-consolidate.md:64` references
  the generic `{mode}` pattern but issues no `Write` instruction. The routine-mode file that collides
  4x/day (the board row's headline complaint) is written under an UNDOCUMENTED convention inferred
  only from inspecting live output — a doc gap this fix should close as a side effect (FR-7).
- **bctc-analyst ALREADY computes a window-anchor value** — `stage-log-notify.md` §5d-1
  (`cycle_tick_ISO`, "the NOMINAL slot fire time from the cron schedule … round DOWN to `HH:00Z`,
  never the agent's own observed bootstrap timestamp") — for its published-marker dedup guard. This
  is exactly the value the filename fix needs; it is computed too LATE (Stage 5, after the signal
  file is already written in Stages 1–4) and is scoped narrowly to the guard. FR-2 below is mostly a
  SEQUENCING fix (pin it earlier), not new logic.
- **bctc-analyst is dispatched via `cowork-schedule.json` as 4 DISTINCT single-fire slots**
  (`bctc-analyst-slot-1..4`, cron `0 15|18|21|0 * * *`), routed through `spawn-fanout.md`'s trigger_prompt
  — the SAME injection point `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR`'s Component A is adding
  `scheduled_utc=` to. Once that lands, bctc-analyst gets a leaf-computed window value "for free" with
  **zero Bash shell-out** — material because bctc-analyst has no Bash tool grant
  (`project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts`) and today's `cycle_tick_ISO` fallback
  already documents a no-Bash workaround (live MCP tool `fetchedAt`) that a wall-clock read would
  duplicate unnecessarily.
- **chef/unified-agent**, `chef.md` Step 0.5 (lines 73–106) already pins `CYCLE_DATE_UTC` ONCE per
  cycle and forbids re-deriving it downstream (`FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE`,
  2026-07-29) — this closes the DAILY straddle for single-fire slots (morning/eod/evening) but is
  STILL a run-time `date -u` call, not a scheduled-window value, so it inherits the exact hazard
  this row's CRITICAL CAUTION describes until the sibling row's Component A lands.
- **chef-dish.md Step 7.6 (lines 549–574) explicitly forward-references THIS row**: "Naming stays
  `date_vn+dish_type` per FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING … that row's structural
  follow-on is cycle_id-keying the filename entirely; this fix only makes the existing date
  component deterministic, it does not add cycle_id." I.e. the sibling row's author already deferred
  the multi-fire discriminator to THIS row by design.
- **chef-intraday is ONE multi-fire slot** (cron `13 2-8 * * 1-5`, 7 windows/day) whose FILEPATH
  (`unified-agent-synthesis-{CYCLE_DATE}-intraday.json`) carries **only** `SLOT_ID="intraday"` — no
  hour component at all — while the SAME slot's published-marker `MARKER_KEY` (Step 0.5,
  `IS_MULTI_FIRE` branch) is **already** `"published:" + SLOT_ID + ":" + WORK_DATE + ":" + VN_HOUR`,
  i.e. per-hour. **The mutex is already correctly discriminated; only the filename is not.** This is
  the tnb-c112 fold-in mechanism exactly (`unified-agent-synthesis-2026-07-17-intraday.json` reflected
  only the 04:13Z cycle; the 14:13Z cycle's write to the identical path never landed / was clobbered).
- **Timezone-basis mismatch risk (new finding, not on the board row):** the multi-fire mutex hour
  (`VN_HOUR`, Asia/Ho_Chi_Minh) and the filepath date (`CYCLE_DATE_UTC`) are two DIFFERENT timezone
  bases already coexisting in chef's own Step 0.5. Naively appending `VN_HOUR` next to a UTC date in
  the NEW filename component risks reintroducing a straddle bug at hourly granularity, structurally
  identical to the daily one `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` just closed — see EC-2.
- **tran-ngoc-bau**: the "notebook collision" in the board row's item (2) is a **different
  mechanism**, not a filename problem. `.claude/skills/notebook-write/SKILL.md` §AC-1 confirms
  headings already carry `## c<NNN> · <ISO-timestamp>` (tnb's live notebook: `## c123 ·
  ~2026-08-06T20:29Z`) — a counter AND a timestamp already present. The collision the board row
  describes is two PEER SESSIONS reading the "highest existing `c<NNN>`" from the SAME stale
  snapshot and computing the SAME next `NNN`, i.e. a read-modify-write race on a shared mutable
  file — the classic TOCTOU class, cured by write-serialization / re-read-before-append, not by a
  bigger key. **Timeline finding that narrows scope:** this instance was one of "3 same-day
  instances" cited when the row was minted **2026-07-15**. `FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-
  BLOCKS-DAILY-CRON` (landed **2026-07-29**) fixed tnb-audit's published-marker gate to correctly
  block a genuine same-day double-dispatch BEFORE it ever reaches the notebook-write step (the gate
  sits at the very top of `main.md`, before the Dispatch table). It is plausible the residual risk
  this row exists to close for tnb is **already substantially mitigated** by that unrelated, later
  fix. Recommend architect RAW-verify (`git log` on `docs/agent-memory/notebooks/tran-ngoc-bau.md`
  for any repeat `c<NNN>` collision since 2026-07-29) before designing new mechanism — do not build
  a fix for a hazard that may already be closed.

---

## 2. Functional Requirements + DDD Layer Mapping

| ID | Requirement | DDD Layer | Notes |
|---|---|---|---|
| FR-1 | WINDOW_KEY availability: consume `scheduled_utc=<ISO8601>` from the invocation prompt (once `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` Component A ships) as the canonical scheduled-fire-window value; fallback (ad-hoc/manual/no-token invocation) = slot_id → cron lookup, rounded down to the slot's own cadence granularity — reusing the pattern already live in `stage-log-notify.md` §5d-1 (`cycle_tick_ISO`) and `chef.md` Step 0.5 (`SLOT_RECORD`/`CRON_HOUR_FLD` lookup). Pure function, no I/O. | **Domain** | Not new logic — extends an existing value's reach to a new call site. Depends on (but is not blocked by) the sibling row's propagation work. |
| FR-2 | bctc-analyst: rewrite `docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json` → `docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json`. Requires MOVING the `cycle_tick_ISO`-equivalent derivation from Stage 5 (`stage-log-notify.md`) earlier to Stage 0c/bootstrap so it is available when Stages 1–4 write the signal file, then reused verbatim at Stage 5 for the (unchanged) published-marker guard — mirrors chef's "pin once, reuse verbatim" pattern. | **Infrastructure** (write path) + **Application** (sequencing/orchestration of the pinned value across stages) | Also close FR-7 (make routine-mode emit explicit) in the same edit since the writer is touched anyway. |
| FR-3 | chef/unified-agent: for the MULTI-FIRE slot only (`chef-intraday`), extend `FILEPATH = docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json` → `...-{SLOT_ID}-{WINDOW_HOUR}.json`, sourced from the SAME hour value the multi-fire `MARKER_KEY` already uses (today `VN_HOUR`; once the sibling row lands, prefer the UTC hour from `scheduled_utc=` — see EC-2 on timezone-basis). Single-fire slots (morning/eod/evening) need NO change here — they already collapse to 1 file/window once `CYCLE_DATE_UTC` itself is window-anchored (sibling row's scope). Directly satisfies the tnb-c112 fold-in AC (every non-silent intraday cycle surfaces its own file; each `Write` is to a now-distinct path so there is no read-modify-write race to begin with — first-write-wins/last-write-clobber both close by construction). | **Infrastructure** | `metadata.cycle_id` (`<DISH_TYPE>-<CYCLE_START_UTC>`) stays informational/audit-only — explicitly do NOT promote it into the filename or mutex key path (PO caution). Document this explicitly in the same edit so a future pass doesn't "fix" it back in. |
| FR-4 | tran-ngoc-bau: **verify-first** (see §1 timeline finding) whether residual risk survives the 2026-07-29 marker-cadence fix. If yes: design write-serialization (fresh-read of current highest `c<NNN>` immediately before compose, inside whatever mutex convention applies to this agent's write path — NOTE: `commit-mutex` SKILL is dispatcher-only per `INV-GATEWAY-1`, so confirm which serialization primitive tnb specialists may actually use before prescribing one). Do NOT apply FR-2/FR-3's window-anchor mechanism here — wrong defect class. | **Infrastructure** (write path) — open, pending verify | Flag to architect as a design DECISION point, not a BA-prescribed mechanism — insufficient certainty to commit further without the RAW-verify. |
| FR-5 | Extend `docs/standards/mcp-tools.md` § Signal Bus — Naming Contract with a new subsection documenting the ticker-keyed (`bctc_signal_*`) and dish-keyed (`unified-agent-synthesis-*`) file families — currently invisible to the SSOT contract (only the generic `{from}-{ISO-timestamp}.json` pattern is documented) — including the new mandatory WINDOW_KEY component this row adds. | **Interface** | Closes a real doc-debt root-contributor: nobody auditing the Naming Contract today would discover this collision class because the contract doesn't acknowledge these files exist. |
| FR-6 | No-op confirmation, documented not implemented: `scripts/agents-flow/drain-signals.js` / `docs/agents/dev-team/flow/drain-signals.md` require **zero** code changes. Add one line to `drain-signals.md` stating the fingerprint is content-based and filename-independent, closing the audit trail on AC-3. | **Application** (documents an existing orchestration invariant) | See §0 verified finding. |
| FR-7 | bctc-analyst doc-debt: make the routine-mode "emit signal file" instruction explicit in `stage-analyze.md` (today only release-mode has an explicit `Emit signal file:` line) — bundle into the same edit as FR-2 since the file is touched anyway. | **Interface** (flow-doc-as-contract) | Low priority, zero-cost bundling only. |

---

## 3. Non-Functional Requirements

- **NFR-1 (no retroactive migration):** old-format files already on disk / in git history are NOT
  renamed or backfilled. Only new writes adopt the new pattern.
- **NFR-2 (respect no-Bash constraint):** bctc-analyst's WINDOW_KEY derivation must not introduce a
  new shell `date` dependency — source from prompt-parsed `scheduled_utc=` (pure string parse) or
  the already-documented live-MCP-timestamp fallback, per `project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts`.
- **NFR-3 (single source of truth for the anchor):** WINDOW_KEY MUST derive from the identical
  upstream value (or an equivalent slot_id→cron lookup) as that slot's published-marker MUTEX key —
  never independently re-derived — so filename-key and mutex-key can never disagree. This is the
  literal text of the row's own CRITICAL CAUTION and is non-negotiable.
- **NFR-4 (dedup fingerprint untouched):** filename changes must not alter
  `sha256(from+type+JSON.stringify(payload)+createdAt)` in `drain-signals.js` — verified today that
  filename plays no role in that computation; NFR is a regression guard, not a new mechanism.
- **NFR-5 (same-window peer collisions are explicitly OUT OF SCOPE here):** two genuine peers of the
  SAME scheduled window (retry + live, or a Layer-A/Layer-B double-dispatch) are EXPECTED to derive
  the SAME WINDOW_KEY and thus the SAME filename by design — this is only safe as long as the
  publish-mutex (owned by `FIX-CHEF-PUBLISHED-MARKER-RELEASE`/`UC-CCA-P3`) actually prevents the
  second peer from reaching the write step. This row's filename fix does not independently solve a
  leaked/bypassed mutex — see EC-4.

---

## 4. Edge Cases

- **EC-1 — ad-hoc/manual invocation, no `slot=`/`scheduled_utc=` token:** WINDOW_KEY falls back to a
  wall-clock read (accepted default, same precedent as system-auditor's `AUDIT_TIER=4` manual-only
  path cited in the sibling architecture brief). A manual debug run could theoretically collide with
  a scheduled run's window if executed in the same hour — acceptable, matches existing precedent.
- **EC-2 — timezone-basis mixing (NEW finding, §1):** do not append a VN-local hour next to a UTC
  calendar date in one filename. Recommend the intraday filename's hour component use the SAME basis
  as whichever value becomes canonical for that slot's date component (UTC, once the sibling row's
  `scheduled_utc_time` lands) — mixing bases reproduces the daily-straddle bug at hourly granularity.
- **EC-3 — bctc-analyst's no-Bash constraint (NFR-2 restated as an edge case):** any fallback path
  that would require a shell `date` call must instead use the documented live-MCP-timestamp fallback
  already established in `stage-log-notify.md`.
- **EC-4 — same-window peer collision is a DIFFERENT, already-owned hazard (NFR-5 restated):** do not
  conflate "two different windows on the same day" (this row's AC) with "two peers of the identical
  window" (the sibling marker-lifecycle rows' AC). Filename fix alone does not protect the latter.
- **EC-5 — tnb heading key already carries counter + timestamp:** any FR-4 design must not assume the
  collision is a "missing discriminator" problem (it is not — see §1) or it will ship the wrong fix.

---

## 5. Adjacent Finding — Explicitly NOT Folded Into This Row's AC

**Field-schema instability** (PO's 2026-07-30 measurement): the 18:07Z and 21:07Z same-nominal-file
revisions of `bctc_signal_HPG_20260730_routine.json` carry **entirely different key sets** (24 keys
with forensic detail vs 12 keys with almost none survived); today's 2026-08-07 live file drops the
`cycle_id`/`slot` fields altogether. This is a **separate problem**: filename-keying (this row) stops
one revision from destroying another on disk; it does **not** make any given revision's *fields*
predictable for a downstream parser. I judge this SEPARABLE — it can be designed and shipped
independently (a versioned field contract for `bctc_signal_*.json` / `unified-agent-synthesis-*.json`
payloads) once revisions stop clobbering each other and are individually inspectable. **Recommend PO
mint a follow-up FIX/FU row** for this once the present row ships; not added to this row's AC per the
dispatch instruction's own guidance to flag rather than scope-creep.

---

## 6. File-by-File Plan (concrete, for architect)

**bctc-analyst:**
- `docs/agents/bctc-analyst/flow/stage-analyze.md` (line 114 + missing routine-mode emit line) —
  filename pattern + FR-7 explicit routine emit.
- `docs/agents/bctc-analyst/flow/stage-consolidate.md` (line 64, generic pattern reference) — update.
- `docs/agents/bctc-analyst/flow/stage-log-notify.md` (§5d-1) — cross-reference the now-shared,
  earlier-pinned WINDOW_KEY value; no logic change to the guard itself.
- `docs/agents/bctc-analyst/flow/cycle.md` or `stage-bootstrap.md` (Step 0c region) — new home for
  the WINDOW_KEY pin-once derivation (moved earlier per FR-2's sequencing requirement).

**chef/unified-agent:**
- `docs/agents/unified-agent/flow/chef-dish.md` (Step 7.6, lines 549–574 + the inline changelog
  comment at 556–558, which explicitly names this row and should be updated to reflect landing).
- `docs/agents/unified-agent/flow/chef.md` (Step 0.5, lines 73–106) — cross-reference only; no
  change to `CYCLE_DATE_UTC`/`MARKER_KEY` derivation itself (owned by the sibling row) unless
  architect judges the timezone-basis fix (EC-2) belongs here.

**tran-ngoc-bau:**
- `docs/agents/tran-ngoc-bau/flow/main.md` (or wherever its Step-8-equivalent notebook append lives)
  — pending the RAW-verify in §1/FR-4; no file change prescribed until that verify is done.

**Naming contract:**
- `docs/standards/mcp-tools.md` § Signal Bus — Naming Contract — new subsection (FR-5).

**Drain reader (documentation only, FR-6):**
- `docs/agents/dev-team/flow/drain-signals.md` — one-line note confirming content-based fingerprint
  is filename-independent. `scripts/agents-flow/drain-signals.js` — no code change.

---

## 7. Acceptance Criteria Mapping (traceability back to the board row)

| Board AC | Satisfied by |
|---|---|
| AC-1 (two same-day cycles never share a path) | FR-2 (bctc), FR-3 (chef-intraday) |
| AC-2 (between-drains double-write can't silently destroy an unrouted signal) | FR-2, FR-3 + FR-6 finding (drain inherits uniqueness at both layers automatically) |
| AC-3 (drain-reader change, if any, preserves routing) | FR-6 — satisfied by NO-OP, verified not assumed |
| AC-4 / tnb-c112 (every non-silent intraday cycle surfaces on disk) | FR-3 (distinct path per hour ⇒ no first-write-wins/last-write-clobber possible) |

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-ba.md`, task_id `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`.

## RETURN
```
DONE: BA spec complete — requirements, DDD mapping, file-by-file plan written.
NEXT: architect | brownfield analysis + technical design for FR-1..FR-7 above.
      FR-4 (tnb) needs a RAW-verify before design (see §1 timeline finding) — flag to architect,
      not a PO blocker.
HANDOFF: docs/handoffs/FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING-BA-spec.md
PIPELINE: continue
```
