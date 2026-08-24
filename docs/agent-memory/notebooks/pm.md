# PM — Notebook

## Session 2026-08-24T17:59Z — Review-lane secondary-drain triage: FIX-COWORK-DELIVERY-PROOF-GATE mis-parked, decomposed

**Dispatched by:** dev-team Review-Lane SECONDARY-Drain (oldest review[] row, next_agent≠qa).

**Finding:** row sat in `review[]` with `commit: null`, `branch: null`, `plan_only: true`, no review_note. Read the detail record: architect's design pass completed 2026-08-12 (full brief at `docs/architecture-briefs/2026-08-12-fix-cowork-delivery-proof-gate-artifact-conjunction-design.md`), but repo-wide search for `delivery_proof`/`Arm 2`/`artifact-delta` found ZERO implementation trace — spawn-fanout.md Step 5.3 has evolved since (2-distinct-marker requirement, identity preamble) but none of it is this design's Arm 2. This was a plan-only design row parked in `review[]` by mistake, never implemented — not a landed-but-unstamped commit.

**Action:** closed parent to `done[]` (children[]-bearing closeout), minted 2 children to `backlog[]` per the brief's own explicit ownership split: `FIX-COWORK-DELPROOF-1-STEP53-TWOARM-GATE` (developer — spawn-fanout.md two-arm rewrite + new probe script) and `FIX-COWORK-DELPROOF-2-SCHEDULE-SCHEMA` (agent-father — cowork-schedule.json `delivery_proof` for 23 slots, per that file's own `_maintained_by` stamp). Both handoff files carry the SHADOW-MODE-first constraint and the conjunction-not-disjunction lesson (occurrence 7: a single-plane check false-PASSed a genuine partial write) as hard constraints, not footnotes.

**`.head`:** live at dispatch time (`CLEAN-SALVAGE-ORPHANED-WORKTREE-AE9ED2CD-...`, peer session's active qa-drain claim), never named this row — left untouched by construction, verified byte-identical after the write.

**Session:** 7fd9c60a-9854-4589-9e98-e4c5e7e9168d

## Session 2026-08-23T15:26:08Z — TASK-BCTC-INSPECT-LABEL-FIX closeout (HSC-6 eviction)

**Handoff received from QA:** Row moved from `review[]` to `done_verified[]` (commit dde17428d). QA completed direct-commit verify; all checks passed (bun test 49/49, 4 sibling regressions 60/60, tsc clean, mock-guard PASS, DDD/security clean).

**PM actions:**
- DJ-GATE-1 verified: journal entry present in `sprint-SPRINT-S-pm.md` (decomposition record)
- HSC-6 eviction hook invoked: `scripts/orch-cold-evict.sh` moved 1 item from `done_verified[]` (31→30 items)
- Evicted to cold: `docs/data/orch/archive/2026-08.json` (commit 55f38b122)

**Board state confirmed consistent:** `done_verified[]: 30` (was 31), archive written, commit staged and landed on main.

**Task completed:** TASK-BCTC-INSPECT-LABEL-FIX = developer's buildLabel() fix (QUARTERLY_PERIOD_TYPE_RE + normalizeQuarter()) delivered, tested, approved, archived.

**Session:** 669e1d9f-6aa0-49b5-bbf3-5aa3f92f55e3

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

## Session 2026-08-23T13:44:18Z — Manual-dispatch queue: 17 minted, 8 parents closed, 4 of 10 rows needed no decomposition at all

**MANDATE:** router dispatched the 9 `ready[]` rows carrying `next_agent=pm` (P0 first) plus `in_progress[]` UC-CDC-P1. Four had been designed and repointed ~20 min earlier by architect (commit `76f6cc2d0`).

### What shipped

| parent | disposition | children |
|---|---|---|
| `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` (P0) | already decomposed → closed | ANCHOR-1..4 (pre-existing) |
| `FIX-PO-TRIAGE-SIGNALS-TABLE-…` (P0) | already decomposed, `children` never written → closed | 2 pre-existing |
| `UC-ASL-P5` (P1) | already decomposed → closed (self-correction, see below) | TASK_2007 (pre-existing) |
| `IVC-PM-DECOMPOSE` (high) | PARTIAL — stays `ready[]`, `depends_on: [IVC-A1]` | IVC-C1..C6, IVC-A1, IVC-A2 |
| `FIX-USDVND-THRESHOLD-SSOT` (high) | decomposed → closed | TS track → Go track |
| `UC-ASL-P3` (P1) | decomposed → closed | script (dep-gated on C-04) → main.md repoint |
| `FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-…` (P1) | decomposed → closed | script → flow-doc rewire |
| `FIX-SUBAGENT-BRANCH-CHECKOUT-…` (P1) | decomposed → closed | hook(warn) → enforce-flip |
| `FIX-CHEF-PUBLISHED-MARKER-RELEASE` (P1) | Component B only → closed | 1 (Component A already live) |
| `UC-CDC-P1` (P1) | assessed, LEFT IN PLACE | WP-A children all DONE_VERIFIED |

`ready[]` 118 → 126, `done[]` 14 → 21, task_total 767 → 784. 17 handoffs generated. Zero `next_agent=pm` rows left in `ready[]` except the deliberately dep-gated IVC umbrella.

### What I learned this cycle

1. **Four of the ten rows did not need decomposing — they needed `children[]`.** `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR`, `FIX-PO-TRIAGE-SIGNALS-…` and `UC-ASL-P5` were all already split by earlier pm cycles. Each kept returning to pm for one reason: the parenthood marker was missing or the parent was left in `ready[]`. `is_epic_wrapper()` is blind without `children[]`, so the umbrella stays dispatchable forever. **The recurring "pm queue" is substantially pm's own unclosed parents, not new design work.**
2. **A decomposed parent is NOT detectable from the board row alone.** I set `next_agent=agent-father` on UC-ASL-P5 as a "routing fix" before finding commit `9ea1bc910` + this repo's own `sprint-ULTRACODE-AUDIT-FIXALL-pm.md` recording its 2026-08-11 split into TASK_2007 — which is live in `ready[]` right now. I would have aimed a second implementer at owned work. **Check the sprint decision journal and `git log --grep=<row-id>` before concluding a row is undecomposed.** I caught it only because the journal I was about to append to already contained the answer.
3. **Flow Step 3e's closeout transform cannot handle a `ready[]` parent.** Its jq pulls `$row` from `in_progress[]` and `active_sprints[].tasks[]` only; on a `ready[]` row `$row` is null and the write corrupts. 8 of my 9 parents were in `ready[]`. Implemented the same semantics against the right lane by hand. The step is freshly-fixed (`e6a4858ae`) and still has this gap.
4. **Closing a parent to `done[]` can permanently strand its dependents, and nothing warns you.** `deps_satisfied()` requires `DONE_VERIFIED`; a decomposed-and-closed parent never gets QA, so it never gets there. Two live rows depended on parents I closed — retargeted both onto the concrete children in the SAME write. **Always scan dependents before a decomposition closeout.** Also deleted their legacy `.depends` field so orch-validate Stage 1f's both-fields divergence check cannot fire.
5. **The prose ceiling explains a lane move that "should" work, and the code is the only place that says so.** PO claimed UC-CDC-P1's move out of `in_progress[]` hard-rejects. Verified in `orch-row-prose-ceiling-check.mjs`: `PROSE_CEILING_LANES=['backlog','ready','review']` — `in_progress[]` is unguarded, so a move INTO any guarded lane sets `liveBytes=0` and any >12000B row rejects even byte-identical. Corollary I used all pass: **moving a fat row OUT of ready[] into done[] is always ceiling-safe**, because the candidate simply leaves the measured set.
6. **`orch-cold-evict.sh` is still structurally 0-evictable** — 4th consecutive cycle, dry-run reports 0 in every category and byte-identical projection against `done[]=14`/`done_verified[]=30`. Declined again, same root cause (`FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION`, now IN_PROGRESS). My 8 closeouts pushed `done[]` to 21, which makes the gate worse — an honest cost of fixing the parenthood drift, not a side effect I missed.
7. **jq array elements separate with `,`, function arguments with `;`** — writing 17 rows through a `def child(...)` helper I used `;` for both and got a compile error pointing 500 columns into a prose string, nowhere near the real fault. Validate the transform against a scratch copy before piping to `orch-apply.sh`.
8. **`next_agent: null` is schema-invalid.** `TaskSchema` types it `string | absent`; orch-validate rejected all 7 closeouts. `del(.next_agent)` is the correct terminal shape.

### Board hazards observed / surfaced, not fixed

- `TASK_2007` (ready[], UC-ASL-P5's live child) edits two `docs/agents/**/flow/*.md` files but is routed to `developer`, while `docs/agents/` is in agent-father's `commit_zone.allowed` (`agent-father/init.md:63`). Dispatchable and resolvable, so not stranded — but may wedge at commit time. Not reassigned: outside this dispatch's scope.
- `UC-RDL-P7-A` and `UC-RDL-P7-B` (both ready[]) carry **no `next_agent` at all**. `UC-RDL-P7-A` is now a dependency of `TASK-BRANCHGUARD-ENFORCE-FLIP`, so its unrouted state is on the critical path of a P1.
- `docs/agents/pm/flow/main.md` Step 3b still mandates `branch: task/NNN-kebab`, contradicting CLAUDE.md's NO-BRANCHES rule (unchanged since last cycle). All 17 handoffs emit `branch: none` plus the reason.
- The two new scripts need a pointer added to the pm flow doc per `docs/policies/dev-standards.md` § Script Persistence — `docs/agents/` is agent-father's zone, so pm cannot add it.

**WIP:** live non-BLOCKED `in_progress[]` = 2 (at limit). Decomposition is not WIP-gated; all 17 children minted to `ready[]` at `TODO`.

**`.head`:** `in_progress` on `FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION` (developer, peer-owned) throughout. Never named any row I was dispatched for, so flow Step 3e's head release is a no-op by construction. Left untouched, deliberately.

**Session:** 7be6b4cd-057e-419b-a967-4810daf2b646
