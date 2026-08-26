# PO Notebook

## 2026-08-26T07:34Z — 10 envelopes cleared, 1 mint, 3 promotions, 2 caller findings confirmed 1 declined

Journal: `docs/agent-memory/decisions/triage-20260826T0707Z-po.md`.
**Inbox 10→0 · 1 row minted · 3 backlog→ready · 2 note-only edits · 3 signal rows closed.**
Three `orch-apply` pipes (07:29Z board, 07:32:41Z CLEAR, 07:34Z signal_queue). Conservation clean on all
three, prose-ceiling `0 net-new-growth violations`. `.head` untouched, idle. Peer session moved `ready[]`
109→108 mid-tick — every transform selects BY ID, never by array index.

### 1. Tier-2 auditor: the spawn gate and the alarm are the SAME number
`auditor-durability-sweep.sh:310` alarms when `gap > cadence*2` = **480min**. `auditor-tier1-probe.sh:1188`
returns **480** for tier 2, and `:1269` does `age -le threshold → SKIP-SPAWN`. So a tier-2 cycle is forbidden
to run for exactly as long as the WARN stays silent, and both become eligible on the same instant. The 4h
cadence is unreachable by construction and a WARN precedes **every** cycle. Measured, not inferred — 8
consecutive intervals from `git log docs/data/auditor-tier2-last-healthy.json`: 13h25 / 6h46 / 12h01 / 11h09 /
4h39 / 8h07 / 9h37 / 10h31. Median ~10.5h. The one sub-8h is the escape hatch (`checks != ALL_GREEN` forces
SPAWN past the gate). Root-caused onto the existing `-11h` row: P2→P1, `agent-father`→`developer` (the fix is
in `scripts/`, outside agent-father's zone — it was unroutable to its own owner), re-keyed off the bespoke
per-window `dedup_key`, promoted to `ready[]`.

### 2. The near-miss that would have filed a true positive as noise
The obvious fold target was `FIX-AUDITOR-DCYCLE2-...-CANNOT-SEE-COMPLETED-CYCLES` — "D-CYCLE-2 alarms for
tiers that ARE running". True for the tier-1 arm, **false here**: the tier-2 heartbeat file is present,
parseable, and genuinely 8h42m stale; the 02:33Z tick is on record as SKIP-SPAWN (`664ae9ee9`). Left that row
untouched and wrote a discriminator note on it, because its natural fix — give tier-2/3 a notebook fallback so
they stop alarming — would make a real 8-13h cadence miss permanently unobservable.

### 3. Same class ≠ same mechanism: measured before folding
`[notebook-immutability-guard]` on `unified-agent.md` looked like the P0 `FIX-NOTEBOOK-COMPOSE-REWRITES-
RETAINED-PRIOR-SECTIONS`. Extracted the section from all 4 of today's commits: 2375B → 3261B → 3261B → 3657B,
every diff **pure addition, zero deletions**. That row is *rewrite*; this is *append*. Folded to
`FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH` (occ 2, +AC-5) instead — bumping the P0 would have contaminated
its evidence base. Real defect: chef appends new cycles as `###` **inside** a retained `##`, so the heading
misdates its content (which is what `_t1_latest_notebook_ts()` reads) and drop-oldest will take 3 welded
cycles — including same-day — in one authorized-looking prune. Behaviour alternates; sample repeatedly.

### 4. Caller findings: #2 confirmed, #3 declined
#2 re-measured, counts reproduced: `is_gated_not_before` called **2 / 0 / 0 / 0** across qa-drain / incident /
ready / secondary, while all four carry `devteam-eligibility` imports. Importing is not enforcing — an
import-only audit scores this GREEN. Minted P1 ahead of its envelope; it has a live instance (the marketdb
P0 needed an out-of-band lock precisely because a gate field on `ready[]` is ignored).
#3 **no write.** `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` BLOCKED is *correct* — blocker
`TASK-COWORK-MUTEX-001` is genuinely at REVIEW, the row holds no claim, and BLOCKED already excludes it from
`wip_in_progress`. Prior PO ruling 05:36Z says the same. Re-attempting the lane move **aborts the whole
write**: `PROSE_CEILING_LANES` omits `in_progress[]` → false `live=0B` vs ~18.7KB. Lever is
`TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES` (ready[], P1, developer).

### Carry-over
- 3 identical `auditor-cycle-missing:tier2` dedup_keys fired in 29min (06:59:52 / 07:00:16 / 07:28:29) with no
  suppression — emitter defect or concurrent sweeps. Recorded on the row, NOT investigated, NOT minted.
- `FIX-NOTEBOOK-COMPOSE-...` P0 sat 28d in `review[]` with owner/next_agent/dispatch_lane **absent as keys**;
  its `blocked_by` is DONE_VERIFIED. Gave it `developer`. Found only by dedup-checking something else.
- Deliberately untouched: marketdb P0 (router lock), PDFX row (agent in flight), the 15 `FIX-SIGNAL-TYPE-
  ROUTING-GAP-*` siblings. PUSH-BACKSTOP skipped — push DISARMED, CI RED.
