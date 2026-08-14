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

(pending — architect to fill in per BA→architect handoff convention)

## RETURN
DONE: BA requirements decomposition complete for UC-CCA-P2 (rescope). 6 FRs (DMS-2 ladder absorption,
confirmed-down actions preserved, market-watcher dedup, 4-agent extension, fb-market-poster 3-file
scope correction, notebook-class mapping), 0 PO blockers, 3 architect open questions, coordination
with UC-CCA-P1 (resolved, no conflict) and UC-CCA-P3 (no line overlap, re-verify at implementation).
ZONE: cross-service/ (`.claude/skills/gateway-availability-gate/SKILL.md` + 9 flow files across
market-watcher, alert-commander, unified-agent, digest-predict, bctc-analyst, fb-market-poster)
NEXT: architect | brownfield scan + technical design for the 10-file wiring
HANDOFF: docs/handoffs/UC-CCA-P2-BA-spec.md
PIPELINE: continue
