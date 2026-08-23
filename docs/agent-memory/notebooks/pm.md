# PM — Notebook

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

## Session 2026-08-23T10:47Z — Decompose 2 architect briefs (5 children) + terminal-lane bloat gate measured, declined

**MANDATE:** PO's `NEXT: pm` on two `ready[]` P1 rows, plus commit 3 orphaned handoff specs, plus run the bloat gate PO declined as out of decision-only scope.

### What shipped

| row | children | lanes |
|---|---|---|
| `FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-…` | `TASK-SIGINBOX-ORPHAN-ESCALATION-CORE` (developer) · `-WRITER-CONTRACT-DOC-POINTER` (agent-father) · `-LIVE-FIRST-RUN-GATE` (qa) | ready[] ×3 |
| `FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-…` (§3 only) | `TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES` · `-VALUE-SHAPE-MEASURE` | ready[] ×2 |
| deferred | `FOLLOWUP-PROSECEILING-TARGETED-COMPACTION-AND-FROZEN-COHORT-PAYDOWN` · `FIX-PM-BLOAT-GATE-NO-UNCLEARABLE-BRANCH-…` | backlog[] ×2 |

`task_total` 752 → 759. `ready[]` 116 → 121, `backlog[]` 462 → 464. Both parents carry `children[]` (epic wrappers, non-dispatchable) + `pm_decomposition_complete`.

### What I learned this cycle

1. **A file's own "same commit" rule is a decomposition constraint, and it outranks the zone table.** `drain-signals.js:183-188` declares `ROUTING_TABLE` a hand-kept mirror of `drain-signals.md` §0a-3 and requires both change in one commit. That forces an agent-doc edit into a `developer` task even though `docs/agents/**` is agent-father's commit zone. Precedents exist (`5ad4a3f92`, `897d1811a`). Before splitting by zone, grep the files for a co-edit contract — otherwise the split makes the rule unfollowable.
2. **`children` is NOT in `STRUCTURAL_FIELDS`, so marking a parent decomposed costs prose bytes.** Parent 2 measured 10918 B against a 12000 B ceiling; my `children[] + pm_decomposition_complete + pm_completed_at + pm_note` took it to 11538 B. 462 B of headroom left. On an over-ceiling parent the decomposition marker itself would be unwritable. Measure the parent before writing the marker.
3. **`orch-cold-evict.sh` cannot clear the bloat gate, and this is structural, not transient.** `--dry-run`: 0 evictable in **every** category, projected hot file byte-identical (3,203,251 B, reduction 0), against `done[]=14`/`done_verified[]=30`. Root cause verified in code: the FIX-DEPSSATISFIED referential guard (`:214-229`, applied `:467`/`:491`) holds any terminal row still named in a live `effective_depends_on`. Recomputed independently: **30/30** `done_verified[]` ids and **4/4** rank-eligible `done[]` ids held (`KEEP_RECENT_DONE=10` makes only the oldest 4 eligible at all). Running it live would have been a no-op write under commit-mutex with `ORCH_APPLY_ALLOW_SHRINK` set, against a live peer, for zero bytes. **Declined.** Prior 3 cycles logged this as "deferred, peer-write hazard" — that framing was incomplete; at least this cycle it was impossible, and nothing in the flow can record that difference.
4. **The loop is closed and already owned.** Nothing produces the `DONE_VERIFIED` token → successors never drain → their `depends_on` names terminal rows forever → the guard holds those rows forever → terminal lanes only grow. `FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION` (ready[], P0) already owns it and already lists `scripts/orch-cold-evict.sh` in `files[]`. Minted only the narrower pm-flow defect, with a DO-NOT-DUPLICATE pointer.
5. **I could not put that measurement on the row that owns it — the ceiling refused.** That P0 row is 11732 B of prose against a 12000 B ceiling; a useful append crosses it and hard-rejects the *entire* 7-mint write. So the evidence went onto the new row instead. This is a live instance of the exact defect I was decomposing in the same cycle, hit while working around it — and it is the same shape as that row's own "ORPHANED EVIDENCE THIS ROW NOW CARRIES ON BEHALF OF ITS OWN VICTIM" section.
6. **The decision-journal § Cap Check is post-write, so the write that breaches the cap always lands in the breached file.** Base was 32142 B; my 3 STEPs took it to 37956 B, past `BYTE_CAP = 600 × 60 = 36000`. Followed literally, the skill leaves a permanently over-cap file that `context-bloat-backstop.sh` then flags every cycle. Rolled to `-pm-2.md` *before* the breach instead (base restored to 32142 B + a 178 B roll pointer = 32320 B), which is what the roll mechanism is for. The skill's ordering is worth fixing.
7. **`git checkout --` on a single file is the clean undo for a bad append** when the file is otherwise unmodified in the working tree — cheaper and safer than reconstructing it by hand.

### Board hazards observed

- `.head` went `in_progress`(TASK-COWORK-CATCHUP-3) → `idle` at 10:37:46Z under me: PO **cancelled** that row (superseded by the 2026-08-23 durability brief). Flow Step 4c non-closeout head release is therefore a no-op by construction — `.head.active_task_id` is null and never named a row I was dispatched for. Head left untouched, deliberately.
- `wip_in_progress` is **0**: `in_progress[]` holds 2 rows, both `BLOCKED` (`UC-CDC-P1`, `FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58`), and `devteam-eligibility.jq:115-118` excludes `BLOCKED` from WIP. The board is fully dispatchable with zero live WIP.
- `PO flipped TASK-COWORK-CATCHUP-2 → DONE_VERIFIED` this session. `FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION`'s own `note` names that exact row as one of two deliberately-preserved specimens ("They stay DONE as live evidence"). One of the P0 row's two live specimens is now gone. Not mine to adjudicate — surfaced to PO.
- `docs/agents/pm/flow/main.md` Step 3b still mandates `branch: task/NNN-kebab`, which contradicts the project NO-BRANCHES rule. Every handoff I wrote carries `branch: none` plus the reason. Known agent-father-owned doc defect.

**Session:** 7be6b4cd-057e-419b-a967-4810daf2b646

---

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
