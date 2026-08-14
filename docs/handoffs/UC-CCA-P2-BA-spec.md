# UC-CCA-P2 — Gateway-Availability-Gate DMS-2 Absorption + 5-Flow Extension — BA Requirements Spec

**Task ID:** UC-CCA-P2 (P1, SPRINT-S/M, RESCOPE)
**Agent:** ba · **Date:** 2026-08-14
**Sprint:** ULTRACODE-AUDIT-FIXALL
**Source:** `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#cowork-cycle-agents-P2`

---

## 0. Recap — why this exists (source: task row `.note` + audit Rescope text, re-verified live)

`.claude/skills/gateway-availability-gate/SKILL.md` (canonical Step 0-GW, 101L) probes
`get_system_status` once and fails loud with NO corroboration. `market-watcher/flow/main.md`
independently implements a richer DMS-2 escalation ladder inline (dual-probe + 30s backoff +
`SIBLING_RECENT` corroboration via `get_agent_signals`), and `market-watcher/flow/cycle.md` ALSO
references the plain skill — two divergent gateway gates running per market-watcher cycle. Only
market-watcher and news-scout reference the shared skill today; alert-commander, unified-agent,
digest-predict, bctc-analyst, and fb-market-poster have no Step 0-GW at all. Verifier confirmed the
core defect live and flagged that literal line anchors in the original audit CHANGE text had already
drifted; this BA pass re-verified every anchor against current code (2026-08-14) — several have
drifted further since the audit (fb-market-poster split into 3 files, chef.md/others restructured).

---

## 1. Requirements

### FR-1: Absorb the DMS-2 escalation ladder into `gateway-availability-gate/SKILL.md` as the canonical Step 0-GW
Insert, ahead of today's existing confirmed-down actions (a/b/c), the market-watcher ladder:
classify the probe error — **CONFIRMED-BLIND** (error text contains "no such tool"/"tool not
found"/"unknown tool") → skip backoff, go straight to actions a-c; else **TRANSIENT** → wait 30s →
PROBE_2; on 2nd failure → `SIBLING_RECENT = get_agent_signals(from_agent=null, status="all",
hours_back=0.25)`; non-empty → suppress (log + clean EXIT + notebook DEFER entry, NO signal file, NO
bug); empty → actions a-c with payload noting "2x probe failure + no sibling success in 15-min
window".
**Terminology-parity constraint (new finding, not in the original audit text):** `cycle-bootstrap/SKILL.md`
§ Error handling already defines a **CONFIRMED-BLIND/TRANSIENT** classification for its OWN Step-0
bootstrap gate, using the identical trigger-text signature ("no such tool"/"tool not found"/"unknown
tool"). This is not a naming coincidence — for cowork agents that run cycle-bootstrap AFTER Step 0-GW,
a `mcp__gateway__call_tool` session-transport gap would trip BOTH gates identically. Step 0-GW MUST
reuse cycle-bootstrap's exact trigger-text signature, not a second, independently-drifting definition
of the same term.
DDD layer: **infrastructure** (resilience/circuit-breaker adapter over the MCP gateway transport —
cross-cutting, not domain logic).

### FR-2: Keep the existing confirmed-down actions unchanged
Actions a (write `docs/signals/<agent-id>-<ts>.json` bug-escalation) / b (BLOCKED notebook entry,
OVERWRITE- or APPEND-class per agent) / c (EXIT) stay exactly as today. **NEVER add `send_telegram`**
to this path — it is itself a gateway call and fails identically when the gateway is dead (same
rationale `cycle-bootstrap/SKILL.md`'s GATEWAY-BLIND fallback already documents for its own Step 0).
DDD layer: **infrastructure** (unchanged side-effect contract) / **domain** invariant (never
`send_telegram` on confirmed transport-dead).

### FR-3: De-dup market-watcher's double probe (live-verified anchors, drifted from audit text)
- `main.md`: replace the inline Step 3 corroboration block (current file: the `3. Run Step 0-GW
  corroboration probe...` section, roughly lines 61-99, ending immediately before `4. Read and
  execute the matched sub-flow...`) with one line: `3. **Step 0-GW — Gateway availability gate** →
  skill: .claude/skills/gateway-availability-gate/SKILL.md (agent-id=market-watcher; covers cycle.md
  AND eod.md)`. Step -1's existing reference to "Step 0-GW gateway-down (confirmed via live
  dual-probe, no sibling corroboration — never assumed)" (current line 36) is already accurate — no
  edit needed there.
- `cycle.md`: delete the Step 0-GW step block at current lines 26-27 (`**Step 0-GW — Gateway
  availability gate** → skill: ...`). Reword the Execution-contract paragraph (current line 20):
  "Step 0-GW through Step 5b" → "Step 0 through Step 5b"; its terminal-state (b) clause → "an
  explicit main.md Step 0-GW gateway-down EXIT (per gateway-availability-gate skill)".
- Net effect: exactly ONE probe per market-watcher invocation, at the `main.md` dispatcher level,
  before slot/sub-flow routing. `eod.md` has zero gateway gate of its own today (grep-confirmed) and
  is already covered transitively only via `main.md`'s Step 3 — this is unchanged by the dedup (no
  new coverage gained or lost for eod.md).
DDD layer: **application** (flow orchestration — collapsing a duplicated use-case step into one).

### FR-4: Extend Step 0-GW to alert-commander / unified-agent / digest-predict / bctc-analyst (live-verified anchors)
| Agent | File | Anchor (verified 2026-08-14) |
|---|---|---|
| alert-commander | `flow/cycle.md` | Thin dispatcher, zero inline steps today — insert before the `## Dispatch` table's first row (`Bootstrap + Regime + Context + Legal/Crisis → stage-bootstrap.md`). See Q-alert-commander-anchor below (siting choice). |
| unified-agent | `flow/chef.md` | Between `0. Bootstrap` (line 33) and `## Step 0.5 — PUBLISHED MARKER GATE` (line 43) — before the task_claim, so a dead gateway never burns the marker. |
| digest-predict | `flow/main.md` | Before `## Step pre-D: DAILY-PREDICT DEDUP GATE` (line 15) — this single top-of-file placement covers BOTH the non-Sunday `DAILY_CLAIM` path (inside Step pre-D) and the Sunday published-marker path further down the same file (both execute after this point unconditionally). |
| bctc-analyst | `flow/cycle.md` | Immediately after `## Step E2 — Market Hours Guard` (block ends ~line 48/50), before `## Step 0c — Calendar Gate` (line 52) — E2 itself needs no gateway (pure wall-clock check), correctly stays first. |
DDD layer: **application** (wiring a shared infrastructure gate into 4 independent flow use-cases).

### FR-5: fb-market-poster — corrected scope: 3 files, not 1 (audit anchor is stale)
Since the audit (2026-07-12), `fb-market-poster/flow/main.md` was split (TE-T26, 2026-08-06) into a
thin **MODE ROUTER** (SELF-IDENTITY/PRIVACY-GUARD SSOT + VN-day-of-week JUMP dispatch only — computes
`VN_DOW` with **no gateway call at all**) plus **three independent, separately cron-entered pipeline
files**, each with its own `STEP 0 — Bootstrap` and its own published-marker `task_claim`:
`daily.md` (Mon–Fri), `weekly-recap.md` (Sat), `weekly-prediction.md` (Sun). The audit's literal
anchor ("main.md before STEP 0a, line 83") no longer exists — main.md never touches the gateway.
Applying the gate only where the stale anchor pointed (none, or by naive re-mapping only `daily.md`)
would leave `weekly-recap.md`/`weekly-prediction.md` — each its OWN cron-spawned session —
completely uncovered, defeating the stated rationale ("so a dead gateway doesn't burn a task_claim")
for 2 of 3 weekly paths.
**Corrected requirement:** insert the same one-line skill-reference in all THREE files, immediately
before each file's own dedup claim: `daily.md` before `**STEP 0a — Publish-once dedup gate**` (line
40); `weekly-recap.md` and `weekly-prediction.md` before their own `DEDUP_CLAIM` block (each ~line
41-46, immediately after their own `## STEP 0 — Bootstrap`, line 25/28).
DDD layer: **application** (same as FR-4, corrected to the current 3-entry-point shape).

### FR-6: Notebook template class — no new variant needed
Live-verified: all 5 newly-covered agents are **APPEND-class** notebooks (`notebook-write/SKILL.md`
AC-3/AC-6) — `alert-commander/stage-dispatch-log.md:73`, `unified-agent/chef-dish.md:751`,
`digest-predict/daily-predict.md:118`, `bctc-analyst/stage-log-notify.md:18`,
`fb-market-poster/daily.md:844` (all reference APPEND explicitly). Only market-watcher is
OVERWRITE-class. The skill's existing BLOCKED-notebook template already has both variants — reuse
the existing APPEND-class template verbatim for all 5 (only `<agent-id>` substitutes; new SIBLING_RECENT
DEFER-entry wording from FR-1 is agent-id-only, not a new class).
DDD layer: **interface** (agent-facing notebook output contract).

---

## 2. Acceptance Criteria

1. `.claude/skills/gateway-availability-gate/SKILL.md` stays ≤200L post-merge (currently 101L; ladder
   addition estimated +45-55L → ~150-160L — headroom confirmed).
2. Confirmed-down actions (signal write, BLOCKED/APPEND notebook, EXIT) are unchanged in behavior —
   `send_telegram` NEVER appears on this path (FR-2).
3. market-watcher issues exactly ONE gateway probe per invocation post-dedup — `cycle.md`'s Step 0-GW
   block is gone; `main.md`'s single pointer is the only probe (FR-3).
4. All 4 FR-4 agents + all 3 FR-5 fb-market-poster files (7 flow-file insertions total, not the
   audit's original 6/8) carry the Step 0-GW pointer at their earliest gateway-touching point, strictly
   before any `task_claim`/marker mutation in that file.
5. `CONFIRMED-BLIND` in `gateway-availability-gate/SKILL.md` uses the IDENTICAL trigger-text signature
   already defined in `cycle-bootstrap/SKILL.md` § Error handling — no second, divergent definition
   (FR-1 terminology-parity constraint).
6. news-scout (the skill's other existing, unedited consumer — `cycle.md:15`) is verified to inherit
   the new ladder correctly with zero flow-file changes: today it hard-fails to actions a-c on ANY
   transport-dead error (no corroboration at all); post-merge it gains the same suppression path as
   market-watcher — a net reduction in false-positive BUG escalations, not a behavior regression.
   Developer must explicitly re-check news-scout's notebook APPEND-class DEFER wording reads
   coherently, since it inherits a code path it never exercised before.

---

## 3. Blockers (PO-only)

None identified. All technical anchors are live-verified; the rescope note is fully self-contained
and requires no priority/business judgment call.

---

## 4. Open Questions for Architect (HOW-level)

- **Q-alert-commander-anchor:** `alert-commander/flow/cycle.md` is a pure thin dispatcher (Firing Gate
  + a 4-row Dispatch table pointing at `stage-bootstrap.md`/`stage-signals.md`/`stage-dispatch-log.md`)
  with zero inline steps of its own before Stage 1. Two siting options: (a) a new zero-th row in
  `cycle.md`'s own Dispatch table, before "Bootstrap + Regime..."; (b) the pointer line lives inside
  `stage-bootstrap.md` itself, as its own first line. `bctc-analyst/flow/cycle.md` — the closer
  precedent in this repo — keeps its own inline E2 guard at the DISPATCHER level (not pushed into a
  sub-flow file), which argues for (a). Architect should confirm.
- **Q-chef-threading:** `chef.md`'s Step 0.5 marker CLAIM happens in `chef.md`, but the actual publish
  action (`send_telegram`) lives downstream in `chef-dish.md` (already flagged as a cross-file
  threading concern by UC-CCA-P3's own architect brief, for a DIFFERENT reason — Phase-2 late-claim
  relocation). Confirm ONE Step 0-GW in `chef.md` (before Step 0.5) is sufficient for the whole
  pipeline and should NOT be duplicated into `chef-dish.md` — this task's insertion point is
  structurally the earliest gateway-touching step regardless of where the eventual publish lands.
- **Q-file-count-correction:** confirm the corrected file list (10 total: 1 skill + `market-watcher/
  {main,cycle}.md` + `alert-commander/cycle.md` + `unified-agent/chef.md` + `digest-predict/main.md`
  + `bctc-analyst/cycle.md` + `fb-market-poster/{daily,weekly-recap,weekly-prediction}.md`) supersedes
  the audit Rescope's original 8-file list (which named only `fb-market-poster/flow/main.md`, now
  stale per FR-5) as the accepted scope for this task.

---

## 5. Edge Cases

- `SIBLING_RECENT` corroboration MUST use `hours_back=0.25` (15-min window) exactly as today's
  market-watcher inline block — the merge must not silently widen/narrow this window now that 7 flows
  (not 1) share it.
- `eod.md` remains covered ONLY transitively via `main.md`'s single Step 3 probe (it has zero gate of
  its own, pre- and post-fix) — not a new gap, but worth stating explicitly so no one "fixes" it as an
  unrelated scope-creep item.
- `fb-market-poster/weekly-recap.md` and `weekly-prediction.md` share one published-marker key
  namespace (`"published:fb-weekend:" + PERIOD_SAT`) but are independent cron-spawned sessions — the
  Step 0-GW insertion in each file is independent; no shared-state coupling risk from the marker
  namespace overlap.
- `digest-predict/main.md`'s Sunday published-marker path is a separate code block further down the
  same file, outside Step pre-D's own `IF weekday != Sunday` guard — confirm (verified: yes) the
  single top-of-file Step 0-GW placement executes unconditionally before BOTH the non-Sunday and
  Sunday branches, since it sits ahead of the weekday branch point entirely.

---

## 6. Coordination (sibling rows in the same neighborhood)

- **UC-CCA-P1-GWBLIND-DEDUP** (audit's sibling "P1", REVIEW, commit `a27d7cd21`): scoped to
  `step-0-cowork/SKILL.md`'s duplicated GATEWAY-BLIND block only — it did NOT touch
  `gateway-availability-gate/SKILL.md`, `market-watcher/flow/main.md`, or `market-watcher/flow/cycle.md`.
  The original audit's "coordinate with sibling P1 on cycle.md" concern is **resolved as a non-issue**:
  P1 never landed a `cycle.md` edit. No file-level conflict with this task.
- **UC-CCA-P3** (published-marker-gate umbrella, READY, 7 `dev-*` rows dispatched): touches the SAME 5
  agent flows (chef.md Step 0.5 internals, digest-predict/main.md task_claim body,
  bctc-analyst/stage-log-notify.md, fb-market-poster/daily.md, alert-commander/stage-dispatch-log.md,
  tran-ngoc-bau/main.md) but at the LATE/claim-time marker-logic layer, not the EARLY entry point this
  task inserts at. No line-range overlap expected (this task's insertions sit strictly BEFORE each
  file's existing task_claim call). Re-verify anchors at implementation time regardless — P3's rows
  are actively dispatchable and may land first.

---

## Out of scope

- `FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK` / TE-T11 (DONE_VERIFIED) — `cycle-bootstrap/SKILL.md`'s
  own Step-0 CONFIRMED-BLIND/TRANSIENT gate is untouched; this task adds a NEW, separate Step 0-GW
  layer that runs BEFORE bootstrap (already true for market-watcher/news-scout; net-new for the other 5).
- UC-CCA-P3 (published-marker-gate skill + release-on-no-publish contract) — see Coordination above,
  not re-derived here.

---

## [Architect] Brownfield Findings

**Zone:** `cross-service/` (row's own field, confirmed correct) — real touched surface is
`.claude/skills/gateway-availability-gate/SKILL.md` + 9 agent flow-doc files across 6 agent families
(market-watcher, alert-commander, unified-agent, digest-predict, bctc-analyst, fb-market-poster).
Zone-detect Tier-1 does not apply (no `apps/` path). **BUILD-STANDARD: not-applicable**
(BUG-FIX/REFACTOR — in-zone dedup + wiring, no new primitives, no new interfaces) — Standard
Detection matrix skip confirmed.

**Ratification — all 10 files re-read live (2026-08-14), byte-for-byte, not trusted from the spec:**
`.claude/skills/gateway-availability-gate/SKILL.md` (101L confirmed), `cycle-bootstrap/SKILL.md`
(CONFIRMED-BLIND/TRANSIENT trigger-text at :109-114 confirmed), `market-watcher/flow/main.md`
(inline block :61-99 confirmed exact, ends immediately before :101 "4. Read and execute..."),
`market-watcher/flow/cycle.md` (Step 0-GW block :26-27 confirmed, Execution-contract paragraph :20
confirmed), `alert-commander/flow/cycle.md` (Dispatch table :33-40, zero inline steps before it,
confirmed), `unified-agent/flow/chef.md` (Bootstrap :33 / Step 0.5 :43 confirmed), `digest-predict/
flow/main.md` (Step pre-D :15 confirmed, top-of-file), `bctc-analyst/flow/cycle.md` (E2 block ends
:48-50, Step 0c :52, confirmed), `fb-market-poster/flow/{daily.md:40, weekly-recap.md:25/27,
weekly-prediction.md:28/30}` (all confirmed), `news-scout/flow/cycle.md:15` (existing unedited
consumer, confirmed unchanged). **Zero drift from BA's own same-day pass** — no line numbers moved
between BA's 11:58Z read and this cycle. FR-6's 5 APPEND-class notebook citations
(`alert-commander/stage-dispatch-log.md:73`, `unified-agent/chef-dish.md` Step 8 "APPEND class",
`digest-predict/daily-predict.md:118`, `bctc-analyst/stage-log-notify.md:18`, `fb-market-poster/
daily.md` ~:844 "AC-6 — APPEND class") independently re-read and confirmed verbatim.

---

### FR-1/FR-2 — DMS-2 ladder absorption design

Restructure `gateway-availability-gate/SKILL.md` § Step 0-GW as follows (replaces the current flat
"probe once, fail immediately" shape at :19-30 with the ladder; :32-82 "Confirmed-down actions" stay
structurally the actions a/b/c today, with ONE additive change to action (a)'s payload text — see
below):

```
## Step 0-GW — Gateway probe

PROBE_1 = call_tool(server="vn-market", tool="get_system_status", arguments={})

### On success — unchanged (log + continue)

### On PROBE_1 failure — classify the error (DMS-2 escalation ladder)

- CONFIRMED-BLIND — error text contains "no such tool" / "tool not found" / "unknown tool"
  (IDENTICAL trigger-text signature to `cycle-bootstrap/SKILL.md` § Error handling's own
  CONFIRMED-BLIND classification — SSOT for the signature lives there; do not fork a second
  definition) → skip the 30s backoff entirely, go straight to Confirmed-down actions below,
  payload UNCHANGED from today (FR-2).
- TRANSIENT — any other error/timeout → WAIT 30s (CPU-spike backoff) → PROBE_2.
  - PROBE_2 succeeds → gateway UP → continue (PROBE_2's own error, if any, is NOT
    re-classified — always falls through to SIBLING_RECENT below, matching market-watcher's
    live behavior byte-for-byte; no new judgment call introduced at this step).
  - PROBE_2 fails → SIBLING_RECENT = get_agent_signals(from_agent=null, status="all",
    hours_back=0.25).
    - non-empty → SUPPRESS: log one line, write a DEFER notebook entry (new template, see
      below), EXIT cleanly. NO signal file. NO bug escalation (FR-1).
    - empty → Confirmed-down actions below, action (a) payload gets ONE additive suffix:
      " — 2x probe failure + no sibling success in 15-min window" (appended to today's
      existing sentence, not a rewrite — keeps FR-2's "actions stay exactly as today" literally
      true for the CONFIRMED-BLIND path and additive-only for this path).

## Confirmed-down actions (a/b/c — unchanged mechanics, FR-2)
[today's a/b/c verbatim, action (a)'s payload conditional per above]

## DEFER notebook entry (SIBLING_RECENT-suppressed path — NEW, distinct from BLOCKED)
OVERWRITE-class (market-watcher): same header/Metrics shape as the existing BLOCKED template,
  body text "DEFERRED — Step 0-GW: 2x probe failure, sibling activity confirmed in 15-min window
  (gateway reachable via peer — this session's failure treated as local transient, not a real
  outage). No data fetched. No signals emitted. No coverage stamps written.", Metrics
  exit_status=deferred, gateway_probe=TRANSIENT_SUPPRESSED, rest unchanged.
APPEND-class (news-scout + all 5 new FR-4/FR-5 consumers): one-line entry, "DEFERRED — Step 0-GW:
  2x probe failure, sibling activity confirmed (15-min window) — suppressing false gateway-down,
  no real outage. No data fetched. No signals emitted.", exit_status: deferred.
```

**Why this design, not a simpler one:** FR-6 already rules "not a new class" — DEFER reuses the
SAME OVERWRITE/APPEND class split as BLOCKED, only the body wording differs (a genuine new *content*
variant, never a new *write-mechanism*). The payload-suffix approach for action (a) (additive, not a
second bespoke string) keeps FR-2's "unchanged" claim literally true for the untouched
CONFIRMED-BLIND path while still satisfying FR-1's explicit payload-note requirement for the
ladder-exhausted path — a single divergent full-rewrite would have made FR-2's audit claim false.

**Size budget:** current 101L. This restructure (~50L: classify+retry+sibling blocks) + 2 DEFER
templates (~20L) + terminology-parity cross-reference (~3L) ≈ **+70-75L → ~171-176L** — higher than
BA's own +45-55L estimate (BA did not account for the DEFER templates as a distinct addition from
the ladder logic itself) but comfortably inside AC-1's ≤200L cap. Flag for whoever implements: keep
DEFER templates terse (mirror the BLOCKED templates' exact line count) to preserve headroom.

**version bump recommendation (non-blocking):** bump the skill's `version:` frontmatter field to the
land date and note the DMS-2/UC-CCA-P2 provenance, mirroring the existing `incident:` field
convention — cosmetic, agent-father's call at implementation time.

---

### FR-3 — market-watcher dedup

Ratified exactly as BA specified, no changes. `main.md` :61-99 → single pointer line (BA's exact
text). `cycle.md`: delete :26-27, reword :20's Execution-contract paragraph per BA's before/after.
Net: one probe per invocation at the dispatcher level, `eod.md` unchanged (still zero gate of its
own, still transitively covered only via `main.md`'s single Step 3 probe — confirmed, not a new gap).

---

### FR-4/FR-5 — 5-flow extension: 2 structural refinements beyond BA's literal text

**1. `alert-commander/cycle.md` and `bctc-analyst/cycle.md` are "thin dispatcher" files whose
Dispatch TABLE — not just body prose — is the execution-order SSOT.** Both files route strictly by
table row order; sub-flow rows (e.g. "Bootstrap + Regime → stage-bootstrap.md") carry NO inline body
text at all, only a table row. Inserting the Step 0-GW pointer as body prose alone (BA's literal
instruction) without a matching table-row edit would leave the table inaccurate about execution
order — a real, if small, doc-drift risk for the next reader. **Design addition (both files):**
- `alert-commander/cycle.md`: add a new ZERO-th Dispatch-table row — `| **Step 0-GW** — Gateway
  availability gate | 0-GW | Inline (FIRST — see below) |` — before the existing "Bootstrap +
  Regime..." row (:37). Ratifies **Q-alert-commander-anchor Option (a)** (see ruling below); place
  the actual inline `## Step 0-GW` section right after the `## Dispatch` table (:40), mirroring
  `bctc-analyst/cycle.md`'s own convention of putting a dispatcher-level inline step immediately
  after its own table.
- `bctc-analyst/cycle.md`: add a new row between the existing "E2 Market-hours guard" row and
  "Bootstrap + Regime" row — `| **Step 0-GW** — Gateway availability gate | 0-GW | Inline (SECOND,
  after E2 — see below) |` — and insert the inline content at BA's specified body position (after
  E2 ends :48-50, before Step 0c :52).

**2. `unified-agent/chef.md` placement asymmetry — ratified, but flagged so it is not "corrected"
later.** Of the 5 FR-4/FR-5 target files, chef.md is the ONLY one where BA's chosen insertion point
(between Bootstrap :33 and Step 0.5 :43) lands the new Step 0-GW gate AFTER that flow's own first
gateway call (`get_cycle_bootstrap`, expanded via the `0. Bootstrap` pointer at :33), not before it.
The other 4 (alert-commander, digest-predict, bctc-analyst, and all 3 fb-market-poster files) all
land Step 0-GW strictly before their own first gateway-touching step. **This is intentional and
correct, not an inconsistency to fix:** `cycle-bootstrap/SKILL.md`'s own Step 0 already carries a
CONFIRMED-BLIND/TRANSIENT/GATEWAY-BLIND-fallback gate (the exact terminology-parity SSOT FR-1 cites)
— if the gateway is genuinely down, Bootstrap's own error handling exits chef.md cleanly before line
34 is ever reached, making a "before Bootstrap" placement redundant for the confirmed-down case here
specifically. BA's stated rationale ("before the task_claim, so a dead gateway never burns the
marker") is narrower and still correct: it protects the Step 0.5 task_claim mutation specifically
against a gateway that dies in the window *between* a successful Bootstrap and the marker claim — a
real, if narrow, race Bootstrap's own gate cannot cover. Ratified as specified, no change.

**Q-alert-commander-anchor RULING: Option (a)** (new Dispatch-table row in `cycle.md` itself, not
inside `stage-bootstrap.md`). `bctc-analyst/cycle.md` is the closer live precedent (E2 kept at the
dispatcher level, not pushed into a sub-flow) and this repo's established "thin dispatcher table is
the execution-order SSOT" convention (finding #1 above) makes (b) actively wrong — burying the
pointer inside `stage-bootstrap.md` would hide it from the one place (`cycle.md`'s own table) a
reader checks to learn what runs and in what order.

**Q-chef-threading RULING: confirmed, one Step 0-GW in `chef.md` is sufficient — do NOT duplicate
into `chef-dish.md`.** `chef.md`/`chef-dish.md` are sub-flows of ONE continuous session (unlike
fb-market-poster's 3 separately cron-entered files) — gateway liveness is a session-scoped property.
This is the same assumption FR-3's own dedup already relies on fleet-wide (market-watcher's single
`main.md`-level probe is accepted as sufficient for its downstream `cycle.md`/`eod.md`, which make
their own later gateway calls without re-probing) — applying it to chef.md/chef-dish.md is consistent,
not a new risk class.

**Q-file-count-correction RULING: confirmed, 10 files supersedes the audit's original 8.** 1 skill +
`market-watcher/{main,cycle}.md` (2) + `alert-commander/cycle.md` (1) + `unified-agent/chef.md` (1) +
`digest-predict/main.md` (1) + `bctc-analyst/cycle.md` (1) + `fb-market-poster/{daily,weekly-recap,
weekly-prediction}.md` (3) = 9 flow files + 1 skill = **10**. Re-counted independently, matches BA's
figure exactly. (Findings #1 above add table-row edits WITHIN 2 already-counted files — no new file.)

---

### FR-6 — notebook class mapping

Ratified as specified — all 5 new consumers independently re-confirmed APPEND-class at their live
anchors (see Ratification above). DEFER-entry wording (this design's own addition, FR-1) reuses the
SAME class split, agent-id-only substitution — not a new class, per BA's own framing.

---

### DDD Layer Mapping (BA's §1 table, accepted as-written)

| FR | Layer | Note |
|---|---|---|
| FR-1/FR-2 | **Infrastructure** | resilience/circuit-breaker adapter over the MCP gateway transport, cross-cutting |
| FR-3 | **Application** | flow orchestration — collapsing a duplicated use-case step into one |
| FR-4/FR-5 | **Application** | wiring a shared infrastructure gate into 5 independent flow use-cases |
| FR-6 | **Interface** | agent-facing notebook output contract |

These are prose/flow-doc files, not typed code — "Infrastructure/Application/Interface" is used in
the same loose sense already established by the `FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING` and
`FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE` precedents (both `cross-service/`, both flow-doc-only).
No objection.

---

### File-by-file edit plan (10 files, ~16 edit sites — for PM's decomposition)

| # | File | Edit(s) | FR |
|---|---|---|---|
| 1 | `.claude/skills/gateway-availability-gate/SKILL.md` | ladder restructure + DEFER templates + terminology-parity xref | FR-1/FR-2 |
| 2 | `market-watcher/flow/main.md` | replace :61-99 with 1-line pointer | FR-3 |
| 3 | `market-watcher/flow/cycle.md` | delete :26-27; reword :20 | FR-3 |
| 4 | `alert-commander/flow/cycle.md` | new table row + new inline `## Step 0-GW` section | FR-4 |
| 5 | `unified-agent/flow/chef.md` | insert pointer between :33 and :43 | FR-4 |
| 6 | `digest-predict/flow/main.md` | insert pointer before :15 | FR-4 |
| 7 | `bctc-analyst/flow/cycle.md` | new table row + insert content after E2 (:48-50), before :52 | FR-4 |
| 8 | `fb-market-poster/flow/daily.md` | insert pointer before :40 | FR-5 |
| 9 | `fb-market-poster/flow/weekly-recap.md` | insert pointer after :25, before :27 | FR-5 |
| 10 | `fb-market-poster/flow/weekly-prediction.md` | insert pointer after :28, before :30 | FR-5 |

No `depends_on` graph needed — every flow-file edit is a self-contained pointer insertion, valid
regardless of the skill file's internal richness (no file blocks another). Recommend landing #1
(the skill) first purely for narrative coherence, not because any edit technically requires it first.

---

### Test strategy (no application code — no unit/integration suite exercises flow-doc prose)

1. **AC-1 (size):** `wc -l .claude/skills/gateway-availability-gate/SKILL.md` ≤ 200 post-edit.
2. **AC-2 (behavior-unchanged):** grep the edited skill file for `send_telegram` — zero hits anywhere
   in the Confirmed-down actions or ladder failure branches (FR-2 domain invariant).
3. **AC-3 (dedup):** next live market-watcher cycle's WORK ping / notebook shows exactly one
   `[GATEWAY]` probe log line, not two.
4. **AC-4 (pointer placement):** grep each of the 5 new consumers' flow file for exactly one Step
   0-GW pointer line, strictly before that file's first `task_claim`/marker mutation.
5. **AC-5 (terminology parity):** manual diff of the 3-string trigger-text list
   (`gateway-availability-gate/SKILL.md` vs `cycle-bootstrap/SKILL.md` § Error handling) — must be
   byte-identical. **Optional follow-up (not this task's scope, flagged for a future janitor/CI
   pass):** a small grep-diff audit script (`scripts/audits/`) could make this self-checking instead
   of review-time-only — not proposed here, avoid scope creep.
6. **AC-6 (news-scout inheritance):** re-read `news-scout/cycle.md` + its notebook-write APPEND
   convention post-merge to confirm the inherited DEFER wording reads coherently — verification-only,
   no file edit (BA's own AC-6 requirement).

---

### Risk flags

- **R1 (payload-branch discipline):** action (a)'s conditional payload suffix (see FR-1/FR-2 design)
  must not collapse into one generic string during implementation — it is the one place FR-1's new
  ladder-exhausted observability and FR-2's "unchanged" claim coexist; losing the branch loses FR-2
  auditability.
- **R2 (PROBE_2 non-reclassification):** PROBE_2's own error is never re-classified as CONFIRMED-BLIND
  even if it happens to match the trigger-text — always falls through to SIBLING_RECENT, matching
  live market-watcher behavior exactly. An implementer "improving" this by symmetrizing the
  classification would be an unrequested behavior change.
- **R3 (UC-CCA-P3 timing):** BA's own §6 flags UC-CCA-P3's rows touch the SAME 5 files at a
  late/claim-time layer and may land first. Re-verify anchors immediately before editing at
  implementation time — do not trust this design doc's line numbers if time has passed (same
  discipline this cycle applied against BA's own numbers, which held with zero drift only because
  same-day).
- **R4 (size headroom):** the ~171-176L post-edit estimate (see FR-1/FR-2) leaves only ~24-29L of
  headroom under the 200L cap — if implementation naturally runs longer, keep an eye on it, but do
  NOT compress the DEFER templates below the BLOCKED templates' own line density just to save room.

**Reuse check:** no new interface, no new script, no new service. The DEFER template reuses the
existing OVERWRITE/APPEND class split verbatim; the ladder reuses cycle-bootstrap's own trigger-text
signature by reference, not reinvention. Nothing to flag.

**Fan-out ruling — NEXT: pm (not a direct agent-father route, unlike the FIX-CHEF-BIZCTX/FIX-CHEF-
USDVND precedents in this same zone):** those precedents were each scoped to files under exactly ONE
agent (`unified-agent`'s own `chef.md`+`chef-dish.md`). `agent-father`'s own `edit` flow
(`docs/agents/agent-father/flow/edit-prepare.md` Step 1) takes a single `agent_name` input and
validates it against `.claude/agents/<agent_name>.md` before reading that ONE agent's files — it is
architecturally single-agent-scoped by its own documented input contract. This task spans SIX
distinct agent families (market-watcher, alert-commander, unified-agent, digest-predict, bctc-analyst,
fb-market-poster) plus one shared, agent-independent skill file — a shape that does not fit one
`agent-father edit` invocation. This is a genuine decomposition need (unlike the 1-agent precedents),
squarely PM's job per architect's own `not_my_job: task breakdown`. Recommend PM mint ~7 atomic
`agent-father`-assigned subtasks (skill file; market-watcher×2-file; alert-commander; unified-agent;
digest-predict; bctc-analyst; fb-market-poster×3-file) — exact grouping/count is PM's call, no
`depends_on` needed between any of them (see File-by-file plan above).

**Scan clean:** true ✓

## Decision Journal
See `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-architect.md`, task_id `UC-CCA-P2`.

## RETURN
DONE: Technical design complete for UC-CCA-P2's 10-file wiring. Ratified BA's 6 FRs with zero live
drift (same-day re-verification). Designed the FR-1/FR-2 DMS-2 ladder restructure for
gateway-availability-gate/SKILL.md (classify→backoff→sibling-corroborate→suppress-or-escalate, new
DEFER notebook template distinct from BLOCKED, additive payload-suffix design keeping FR-2's
"unchanged" claim literally true) — estimated ~171-176L post-edit, inside the ≤200L AC-1 cap. Found 2
structural refinements beyond BA's literal text: (1) alert-commander/cycle.md + bctc-analyst/cycle.md
need a Dispatch-TABLE row edit alongside the body-text insertion (thin-dispatcher table is the real
execution-order SSOT, not prose alone); (2) chef.md is the one FR-4/FR-5 file where Step 0-GW lands
AFTER that flow's own first gateway call — ratified as intentional (protects the task_claim mutation
window specifically; cycle-bootstrap's own Step-0 gate already covers the general confirmed-down
case), not a defect. Resolved all 3 open questions: Q-alert-commander-anchor → Option (a); Q-chef-
threading → single gate in chef.md sufficient, session-scoped; Q-file-count-correction → 10 confirmed.
ZONE: cross-service/ (`.claude/skills/gateway-availability-gate/SKILL.md` + 9 flow files across
market-watcher, alert-commander, unified-agent, digest-predict, bctc-analyst, fb-market-poster)
NEXT: pm | decompose the 10-file/~16-edit-site wiring into per-agent-scoped agent-father subtasks —
agent-father's own edit flow is single-`agent_name`-scoped by its documented input contract, and this
task spans 6 distinct agent families + 1 shared skill file, unlike the 1-agent precedents in this
same zone that skipped PM. No depends_on graph needed between subtasks.
HANDOFF: docs/handoffs/UC-CCA-P2-BA-spec.md
PIPELINE: continue
