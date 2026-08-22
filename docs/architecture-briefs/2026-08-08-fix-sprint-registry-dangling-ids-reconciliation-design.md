# FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE — reconciliation + guard-arming design (architect, 2026-08-08)

**Disposition:** `supervised:true, plan_only:true`. This is a design the PO must ratify before
anyone implements. No code shipped, no reconciliation writes performed, no journal files moved.
Zone: `cross-service/` (orch-state schema + 2 scripts, no `apps/` service).
`BUILD-STANDARD: not-applicable` (bug-fix/refactor, in-zone, no new primitives).

---

## 1. Re-baseline — live measurement 2026-08-08, not the 2026-07-30 snapshot

Re-ran the row's own resolver methodology (union of `.task_board.active_sprints[].id` +
`.task_board.closed_sprints[].id` + cold archive `.closed_sprints[].id` / `.closed_sprint_goals`
sprint ids / `.done_tasks[].sprint`, against both reference planes) fresh against the current file.
**The count moved: 34 → 14 dangling ids.** Between 2026-07-30 and today, ~20 ids resolved
organically — mostly via `chore(tasks): cold-evict terminal sprints/done lanes → archive/2026-08.json`
(recent commit `ba7c33b13`) folding completed work's `.sprint` tags into archived `done_tasks[]`. The
**structural defect is unchanged** (no reconciliation classification exists, no guard exists, no
third-state branch exists) — only the raw count moved. Two of the row's four named "top offenders"
(`TOKEN-ECONOMY-AUDIT`, `ULTRACODE-AUDIT-FIXALL`) now technically "resolve" via the archive's
`done_tasks[].sprint` union — but §2.3 below shows that resolution is unsafe, not fixed.

Current dangling set (exact-match against the same union PO used), measured
`2026-08-08T02:5xZ`, both planes:

```
BA-IND-P1-MOMENTUM-FRONTEND    BCTC-DATA-QUALITY              COWORK-GUARANTEED-SLOT-DURABILITY
CRON-WORKFLOW-OPTIMIZE         FE-PAGE-REORG                  FIX-BCTC-CTG-BALANCE-SHEET-REFINE
FIX-ERRAUDIT-WAVE-3            FOLLOW-UP-HARDENING            FRESHNESS-AUTO-REMEDIATE
FU-ORCH-HOT-SUB150             INPUT-VALIDATION-COVERAGE      SYSTEMIC-REMAKE-P1
TASK-17                        TEST-HYGIENE
```

Plus the sentinel case: `"BACKLOG"` as a literal `.sprint` value on 12 task rows across 4 lanes
(5 of them in `backlog[]` itself — 5/361 backlog rows, vs. 262/361 that correctly omit `.sprint`
entirely and 4 that use explicit `null`). This confirms the row's premise: `"BACKLOG"` is not a
sprint id, it is the lane name reused as a "no sprint assigned" sentinel — and it round-trips into
the archive's own closed-id union too (`docs/data/orch/archive/2026-06.json` has 6 `done_tasks[]`
carrying `.sprint:"BACKLOG"`, `2026-08.json` has 1) — same anti-pattern, write-time and cold-storage
side both.

---

## 2. AC-1 — reconciliation classification design

### 2.1 Classification algorithm (2-axis rule)

For each dangling id, resolve two independent signals, then apply an OR-of-first-two priority:

1. **Sprint-goal signal** — does `sprint_goal.entries[]` carry this id, and is its `.status`
   terminal (canonical `DONE`/`DONE_VERIFIED`/`CANCELLED`/`DEFERRED`/`SKIPPED`) or live
   (anything else, e.g. `active`, `PLANNING`)?
2. **Task-lane signal** — of every task row (hot board, all lanes, plus nested
   `active_sprints[].tasks[]` / `closed_sprints[].tasks[]`) carrying this `.sprint` value, are ANY
   in a non-`backlog` lane (`ready`/`in_progress`/`qa`/`review`/`done`/`done_verified`)?

```
sprint_goal status == live         → LIVE, needs active_sprints[] registration
ELIF any referencing row non-backlog → LIVE, needs active_sprints[] registration
ELIF all referencing rows terminal
     (DONE/DONE_VERIFIED/CANCELLED)  → FINISHED, needs closed_sprints[] registration
ELSE (referencing rows exist only
      in backlog[], no goal entry,
      or goal entry is non-terminal
      "PLANNING")                    → PRE-SPRINT LABEL — exempt, no registration required yet
ELSE (id shape is not a topic slug,
      e.g. collides with a bare
      task-number convention)        → NEVER-WAS — strip/rename the field
```

The "pre-sprint label" branch matters: minting a phantom `active_sprints[]` object for work that
has not been sprint-kicked-off yet would be worse than the current gap — it would fabricate a
sprint that never had a kickoff. `po/sprint-kickoff.md` is the only place that should ever create
`active_sprints[]` entries; this design does not bypass that.

### 2.2 Per-id classification (measured 2026-08-08)

| id | goal status | referencing rows (lane:status) | classification | action |
|---|---|---|---|---|
| `FE-PAGE-REORG` | active | `backlog:BACKLOG` (BA-FE-PAGE-REORG) | **LIVE** | register `active_sprints[]` |
| `SYSTEMIC-REMAKE-P1` | active | `backlog:BACKLOG` ×2 | **LIVE** | register `active_sprints[]` |
| `FRESHNESS-AUTO-REMEDIATE` | PLANNING | `review:REVIEW` (SPIKE-FRESHNESS-REMEDIATE-TRIAGE) | **LIVE** (task-lane overrides stale PLANNING goal status) | register `active_sprints[]` |
| `INPUT-VALIDATION-COVERAGE` | PLANNING | `review:REVIEW` (IVC-ARCH-BLUEPRINT) | **LIVE** | register `active_sprints[]` |
| `FU-ORCH-HOT-SUB150` | (none) | `review:REVIEW` (FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE) | **LIVE** | register `active_sprints[]` |
| `TEST-HYGIENE` | (none) | `ready:READY` (FIX-MCP-TEST-SUITE-INTERVAL-TIMER-LEAK-TEARDOWN) | **LIVE** | register `active_sprints[]` |
| `BCTC-DATA-QUALITY` | (none) | `backlog:BACKLOG` only | pre-sprint label | exempt for now |
| `COWORK-GUARANTEED-SLOT-DURABILITY` | (none) | `backlog:BACKLOG` only | pre-sprint label | exempt for now |
| `CRON-WORKFLOW-OPTIMIZE` | (none) | `backlog:BACKLOG` only | pre-sprint label | exempt for now |
| `FIX-BCTC-CTG-BALANCE-SHEET-REFINE` | (none) | `backlog:BACKLOG` only | pre-sprint label | exempt for now |
| `FIX-ERRAUDIT-WAVE-3` | (none) | `backlog:BACKLOG` only | pre-sprint label | exempt for now |
| `FOLLOW-UP-HARDENING` | (none) | `backlog:BACKLOG` only | pre-sprint label | exempt for now |
| `BA-IND-P1-MOMENTUM-FRONTEND` | (none) | nested inside CLOSED `MARKET-INDICATOR-DEPTH-P0.tasks[]` ×2, zero hot refs | **FINISHED**, but mislabeled — see below | PO call needed |
| `TASK-17` | (none) | `backlog:BACKLOG` (TASK17-FOREIGN-FLOW) | **NEVER-WAS** — id shape is a bare task-number, not a topic slug | strip/rename field |
| `"BACKLOG"` (sentinel, 12 refs) | n/a | mixed lanes, all pre-existing tasks | **NEVER-WAS** (lane-name-as-sentinel) | strip field → omit (matches the 262/361 majority convention), never write literal `"BACKLOG"` |

`BA-IND-P1-MOMENTUM-FRONTEND` is a genuine edge case: it appears only as the `.sprint` value on 2
tasks nested inside the *already-closed* `MARKET-INDICATOR-DEPTH-P0` sprint's own `tasks[]` array —
i.e. it looks like a predecessor/working name that got folded into `MARKET-INDICATOR-DEPTH-P0` at
close time, and the 2 task rows never got their `.sprint` field corrected to match. Two legitimate
fixes exist and only PO can pick: (a) relabel those 2 nested rows' `.sprint` to
`MARKET-INDICATOR-DEPTH-P0` (simplest, no new phantom object, contingent on confirming it really was
folded and not a distinct real sprint), or (b) register `BA-IND-P1-MOMENTUM-FRONTEND` as its own
`closed_sprints[]` entry if it was in fact a separate, real, now-finished sprint. Flagged, not
resolved here — this needs the human/PO judgment call the row's `supervised:true` flag exists for.

### 2.3 CRITICAL FINDING (flagged, not fixed) — the archiver's own "closed" derivation is unsafe

While tracing the 4 top offenders named in the row's `desc` (`TOKEN-ECONOMY-AUDIT`,
`ULTRACODE-AUDIT-FIXALL`, `COWORK-GUARANTEED-SLOT-CATCHUP`, `FLOW-PRICE-ALPHA-LOOP`), I found all
four now "resolve" into `scripts/agents-flow/decision-journal-archive.sh`'s `CLOSED_IDS_FILE` — but
only via the **weak signal** `jq '[.done_tasks[]? | .sprint] | unique[]?'` (any archived DONE task
that ever carried this `.sprint` tag), never via a genuine `closed_sprints[].id` closure record. All
four still have dozens of open, non-terminal task rows:

| id | goal status | open (non-terminal) rows still referencing it |
|---|---|---|
| `COWORK-GUARANTEED-SLOT-CATCHUP` | **active** | 9 (`TASK-COWORK-CATCHUP-3..10`, `BA-COWORK-GUARANTEED-SLOT-CATCHUP`) |
| `FLOW-PRICE-ALPHA-LOOP` | **active** | 7 (`ALPHA-S2..S6`, `RAG-FTS-BUILD-MEMORY-BOUND`) |
| `TOKEN-ECONOMY-AUDIT` | (none) | 22 (`TE-T*`, mixed backlog/qa/review) |
| `ULTRACODE-AUDIT-FIXALL` | (none) | 23 (`UC-*`, mixed backlog/review) |

Ran the script's own sanctioned read-only mode to confirm this is not theoretical
(`bash scripts/agents-flow/decision-journal-archive.sh --all --dry-run`, `2026-08-08T02:58:41Z`,
no file mutated — the script's own contract guarantees `--dry-run` never calls `mv`/`git mv`):

```
SUMMARY mode=all scanned=596 archived=299 active_stay=26 closed_not_in_scope=0 no_orch_record=271
```

299 `WOULD-ARCHIVE` lines include every one of the ~65 `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-*.md`,
`sprint-FLOW-PRICE-ALPHA-LOOP-*.md`, `sprint-TOKEN-ECONOMY-AUDIT-*.md`,
`sprint-ULTRACODE-AUDIT-FIXALL-*.md` journals. **If `--all` is ever run for real today (no
`--dry-run`), it physically `git mv`s journals for 2 sprints `sprint_goal` itself marks `active`,
plus 2 more with 20+ open backlog/review/qa tasks, out of the live decisions directory** — exactly
the live-editor race AC-6 warns about, except caused by the archiver's move, not a prune. (By
contrast, `CI-RED-RECONCILE` — the row's own largest-file example, `sprint-CI-RED-RECONCILE-po.md`
331592B — genuinely is safe to archive under the same weak signal: zero hot-board rows reference it
at all today, so the weak signal happens to be correct there. The point is it's a coincidence, not a
property of the check.)

**Root cause:** `.done_tasks[].sprint` is a per-*task* provenance field (which sprint was this task
filed under when it completed), not a per-*sprint* closure record. Treating "this tag appears on at
least one archived DONE task" as "this sprint is closed" is a category error — a multi-phase sprint
where task 1 of 10 completes and gets cold-evicted will land its own sprint id in the closed-id set
while 9 tasks are still open.

**Required correction (design only — developer implements after PO ratifies):** redefine "closed
enough to archive" for `decision-journal-archive.sh`'s `PROCESS_IDS_FILE` derivation as:

```
id is safe-to-archive  ⟺  (no active_sprints[] entry for id)
                        AND (sprint_goal entry for id, if any, has terminal .status)
                        AND (zero non-terminal task rows, hot board, reference id via .sprint)
```

This is the same task-lane signal as §2.1's classification rule — the reconciliation design and the
archiver-safety fix share one predicate. The existing `.done_tasks[].sprint` union should be
DEMOTED from "authoritative closed" to "candidate — still needs the zero-open-rows check", not
removed (it is still useful signal that a sprint existed at all). This is **AC-4-adjacent, discovered
during design, not literally requested by the row's wording** — but shipping AC-4's third-state
branch without this correction leaves the tool actively dangerous to run for real against 4 named
sprints, 2 of which `sprint_goal` itself calls `active`. Recommend bundling both in the same
implementation PR (§8 sequencing).

---

## 3. AC-2 — arming sequence design

New `Stage 1h` in `scripts/orch-validate.mjs`, new exported function
`checkSprintRegistryReferentialIntegrity(data, cachedArchiveIds)` in
`apps/mcp-server/src/infrastructure/orchStateSchema.ts` (same shape as `checkMissingDependencyReport`
— archive-id resolution injected as a parameter, keeps the function unit-testable without real FS
access, mirrors the existing Stage 1g pattern exactly).

**Known-id universe (for "is this id known at all")** — deliberately the SAME broad union
`decision-journal-archive.sh` already builds (hot `active_sprints[].id` ∪ hot `closed_sprints[].id`
∪ cold archive `closed_sprints[].id` / `closed_sprint_goals` / `done_tasks[].sprint`). Using the
broad (weak-signal-inclusive) union here is correct and intentionally NOT the corrected §2.3 predicate
— Stage 1h's job is only "does this string correspond to some real historical sprint record", a much
lower bar than "is it safe to archive". Keeping the validator's "known" and the archiver's "known"
aligned to the same union avoids the two mechanisms drifting into disagreement about what a
"real" id even is.

**Exemption (mirrors §2.1's pre-sprint-label branch):** an id referenced ONLY by `backlog[]` rows,
with no `sprint_goal` entry, is not counted as a violation — forward-planning labels on
not-yet-kicked-off work must not be blocked forever. Counted violations = ids referenced by (a) any
non-`backlog` lane row, or (b) any `sprint_goal.entries[]` entry, that fail to resolve against the
known-id union.

**Disposition — `ORCH_SPRINT_REGISTRY_MODE`, default `warn`** (mirrors
`GIT_NOTEBOOK_IMMUTABILITY_MODE`, `.claude/skills/notebook-write/SKILL.md` AC-2a):
- `warn` (default): print every violation to stderr with the same `[N] path: problem / expected /
  fix` shape as the other Stage-1 checks, write ONE aggregated `docs/signals/` entry per run
  (dedup key = hash of the violating-id set, so repeated writes with the same unresolved set don't
  spam — same dedup discipline already required of `signal_queue` per
  `feedback_auditor_signalqueue_append_always_telegram_only_dedup`), **exit 0** — never blocks a
  write.
- `reject`: same detection, `process.exit(2)` — identical failure shape to Stage 1c/1f.

**Arming gate (hard sequencing constraint, per the row's own explicit instruction):** do NOT flip
the default to `reject` until a corpus replay script —
`scripts/audits/verify-sprint-registry-referential-integrity.sh`, same lineage as
`scripts/audits/verify-notebook-immutability-gate.sh` — reads `violations == 0` against the LIVE
file, post-exemption-rule, post-§2.1-reconciliation-writes. Today that number is 14 dangling raw,
minus the exempted pre-sprint-label ids (6), minus `BA-IND-P1-MOMENTUM-FRONTEND` (PO call pending)
and `TASK-17`+`"BACKLOG"` sentinel (need the field strip) = **currently 8 counted violations under
this stricter rule** (`FE-PAGE-REORG`, `SYSTEMIC-REMAKE-P1`, `FRESHNESS-AUTO-REMEDIATE`,
`INPUT-VALIDATION-COVERAGE`, `FU-ORCH-HOT-SUB150`, `TEST-HYGIENE` need registration;
`BA-IND-P1-MOMENTUM-FRONTEND` needs a PO call; `TASK-17`/`"BACKLOG"` need the strip). All 8 must
reach 0 via §2.1's registrations/strips before `warn`→`reject` is armed.

---

## 4. AC-3 — dual-plane coverage design

`checkSprintRegistryReferentialIntegrity()` MUST walk both planes in one pass (a single-plane check
was exactly how this class went undetected on the mismatched plane — same lesson as the row's own
"a check on only one plane leaves the other silently broken"):

- **Plane 1 — `task_board.*[].sprint`:** all 8 flat lanes (`backlog`, `ready`, `in_progress`, `qa`,
  `review`, `done`, `done_verified`, `archive`) PLUS the 2 nested locations
  (`active_sprints[].tasks[].sprint`, `closed_sprints[].tasks[].sprint`) — confirmed live data has
  refs in the nested locations too (`BA-IND-P1-MOMENTUM-FRONTEND`, `OHLCV-UNIT-CONTAM` both only
  appear nested; missing them would silently under-count).
- **Plane 2 — `sprint_goal.entries[].sprint_id`.**

Both planes resolve against the same known-id union from §3. A violation report line always states
which plane(s) it came from (a handful of ids appear on both — e.g. `FE-PAGE-REORG`,
`SYSTEMIC-REMAKE-P1` — report each plane hit, do not dedupe across planes, since AC-3's whole point
is plane-visibility).

---

## 5. AC-4 — third-state branch design for `decision-journal-archive.sh`

Current behavior: an id with no match in `KNOWN_IDS_FILE` at all → `no_orch_record` counter increments,
one `NO-MATCH` line to stdout, loop `continue`s — no distinguishing exit code, no signal, easy to miss
in the 596-line scan output (confirmed: 271 of today's 596 scanned files hit this path).

**Design — explicit third-state branch:**
1. Keep the per-file `NO-MATCH` line (useful detail).
2. At end of run, if `no_orch_record > 0`: write ONE aggregated `docs/signals/` entry (payload =
   the list of derived-but-unresolved ids, deduped against ids already carrying an
   unresolved-signal from a prior run — same dedup discipline as §3's Stage-1h signal) AND set a
   non-zero-but-distinct exit code (propose `2`, reserving `1` for the existing
   setup/config-error class) so a caller (e.g. a future cron wrapper) can distinguish
   "ran clean, nothing to do" (0) from "ran, found unresolvable ids, needs triage" (2) from
   "could not run at all" (1).
3. **Sequencing constraint (this is the important part):** this branch must not ship BEFORE §2.3's
   closed-id-derivation correction. Today, flipping `no_orch_record` from silent-skip to fail-loud
   while the closed-set is still over-inclusive would fail loud on the wrong 271 (genuinely
   unresolvable — legitimate) while staying silent on the far more dangerous 299 `WOULD-ARCHIVE`
   set that includes actively-open sprints. Shipping AC-4 alone, without §2.3, converts a silent
   under-reaction into a loud one while leaving the actually-dangerous over-reaction completely
   invisible — net worse. §8 sequencing orders these correctly.

---

## 6. AC-5 — verification gate (timestamped, measured, not prose)

Post-implementation, the following must be re-run and their raw output pasted into the shipping
commit / journal (not summarized):

1. **Resolver re-run** (same script as §1/§3): `violations == 0` under the counted-violation rule
   (post-exemption). Command: `scripts/audits/verify-sprint-registry-referential-integrity.sh`
   (new script, §3) — expected final line `violations=0`.
2. **`decision-journal-archive.sh --all` moving a previously-unreachable journal, with a before/after
   byte count.** Concrete candidate once §2.1 registers `SYSTEMIC-REMAKE-P1` as `closed_sprints[]`
   (only if PO/QA later confirms it's actually finished — today it is `active`, so do not use it as
   the demo target) or, cleaner, once `TASK-17`'s single backlog row either ships or the field is
   stripped: re-run and show `sprint-<id>-<agent>.md` moving from `docs/agent-memory/decisions/` to
   `docs/archive/decisions/`, `wc -c` before == `wc -c` after (file content unchanged, only location
   moves — this is what makes it safe under AC-6, see §7).
3. **`orch-validate.mjs` full run still exits 0** (Stage 1h in `warn` mode does not regress the
   existing Stage 0/1/1b–1g contract) — `bun scripts/orch-validate.mjs` clean run pasted.

---

## 7. AC-6 — explicit constraint reaffirmed

No journal file's *content* is pruned, split, or edited by anything in this design. The only file
operation anywhere in this brief is `git mv` of a whole, byte-identical file from
`docs/agent-memory/decisions/` to `docs/archive/decisions/` — already `decision-journal-archive.sh`'s
existing, established mechanism (idempotent, `SKIP-EXISTS`-guarded, `git mv -k` preserves rename
history). That is a location change, not a content mutation, and does not race a live editor
appending new `### STEP` blocks the way an in-place prune/rewrite would (per
`feedback_ctxbloat_breach_on_live_sprint_file_defer`). Byte-cap remediation (pruning/splitting an
oversized live journal) remains explicitly out of scope here, exactly as the row specifies, and
remains the separate, already-cross-referenced row `FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR`'s job.

---

## 8. Implementation sequencing (for PM/developer, after PO ratifies)

Strict order — each step's precondition is the prior step's shipped-and-verified state:

1. **PO ratifies** §2.2's classification table (in particular the `BA-IND-P1-MOMENTUM-FRONTEND`
   relabel-vs-register call) and this brief's overall approach.
2. **Data reconciliation writes** (developer, via `scripts/orch-apply.sh`, one jq transform):
   register `active_sprints[]` for the 6 LIVE ids (§2.2), strip/omit `.sprint` for `TASK-17` and the
   12 `"BACKLOG"`-sentinel rows, apply PO's `BA-IND-P1-MOMENTUM-FRONTEND` disposition. Leave the 6
   pre-sprint-label ids untouched (exempt by design, §2.1).
3. **`decision-journal-archive.sh` closed-id-derivation correction** (§2.3) — demote the weak
   `.done_tasks[].sprint` signal, require the zero-open-rows check. Verify with `--all --dry-run`
   that `COWORK-GUARANTEED-SLOT-CATCHUP`/`FLOW-PRICE-ALPHA-LOOP`/`TOKEN-ECONOMY-AUDIT`/
   `ULTRACODE-AUDIT-FIXALL` no longer appear in `WOULD-ARCHIVE` output.
4. **AC-4 third-state branch** ships on top of step 3's corrected predicate (§5).
5. **Stage 1h validator** ships in `warn` mode (§3) — safe to arm immediately, never blocks.
6. **Corpus replay** (`scripts/audits/verify-sprint-registry-referential-integrity.sh`) confirms
   `violations == 0`.
7. **Only then** flip `ORCH_SPRINT_REGISTRY_MODE` default to `reject` in a follow-up, separately
   reviewed change — not bundled into the same commit as step 5, so the replay evidence in step 6 is
   visibly the gate, not asserted-and-armed-together.
8. **AC-5 verification gate** (§6) evidence captured and pasted into the shipping commit.

---

## 9. Files touched (for developer, once PO ratifies)

- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` — new
  `checkSprintRegistryReferentialIntegrity()` export (§3/§4), unit tests alongside existing
  `checkMissingDependencyReport` tests.
- `scripts/orch-validate.mjs` — new Stage 1h wiring (§3), same shape as Stage 1g.
- `scripts/agents-flow/decision-journal-archive.sh` — closed-id-derivation correction (§2.3) +
  third-state branch (§5).
- `scripts/audits/verify-sprint-registry-referential-integrity.sh` — new corpus replay script (§3/§6).
- `docs/data/orch/orch-state.json` — reconciliation writes (§8 step 2), via `scripts/orch-apply.sh`
  only, never raw.
- `docs/policies/dev-standards.md` — CANONICAL pointer for the new env var + script, per existing
  convention (see `GIT_NOTEBOOK_IMMUTABILITY_MODE`'s entry as the model).

---

## 10. Open questions for PO ratification

1. `BA-IND-P1-MOMENTUM-FRONTEND` (§2.2): relabel the 2 nested task rows to `MARKET-INDICATOR-DEPTH-P0`,
   or register it as its own `closed_sprints[]` entry? Needs confirmation it was actually folded in,
   not a distinct sprint.
2. Confirm the 6 "pre-sprint label" ids (§2.1/§2.2) should stay exempt rather than being forced into
   premature `active_sprints[]` registration — recommendation is exempt, but PO owns sprint-kickoff
   authority.
3. Confirm `TASK-17`'s single backlog row (`TASK17-FOREIGN-FLOW`) should simply have `.sprint`
   stripped, not renamed to something else — recommendation is strip (no evidence a
   `TASK-17`-named sprint was ever real).

---

## 11. AMENDMENT (architect, 2026-08-22) — response to `po_verdict: AMEND-THEN-RESUBMIT` (2026-08-14T14:30:24Z)

Still `supervised:true, plan_only:true`. Nothing below ships code, edits `dev-standards.md`/`WORK.md`,
or touches `orch-state.json` — this section is a bounded design amendment addressing PO's 3 blocking
items (A1, A2, A3), 1 non-blocking item (AC-0), and the Q1/Q2/Q3 open-question rulings, per the
`po_goahead_20260814T143024` stamp. §1–§10 above are NOT retracted; each subsection below names the
exact paragraph it supersedes. All numbers in this section are re-measured live 2026-08-22 against the
current `orch-state.json` (3,466,105 bytes) and cross-checked against the real
`scripts/agents-flow/decision-journal-archive.sh --all --dry-run` run (not a re-implementation guess) —
see §11.1.

### 11.1 Re-baseline (live, 2026-08-22) — supersedes §1's counts

Re-ran the resolver two ways: the **broad union** (identical to the archiver script's own
`KNOWN_IDS` — confirmed by running the real script: `START mode=all known_ids=100 ... SUMMARY
scanned=641 archived=355 active_stay=26 closed_not_in_scope=0 no_orch_record=260`, `2026-08-22`), and
the **strict/corrected union** that drops `.done_tasks[].sprint` per §2.3's already-flagged critical
finding (§11.2 below makes this the new Stage-1h rule).

- **Broad-union dangling: 11** (headline count unchanged from PO's own 08-14 re-measurement — but
  the SET churned: `COWORK-GUARANTEED-SLOT-DURABILITY` genuinely resolved, now has a real
  `closed_sprints[]` entry; `CHORE-COMMIT-OVERHEAD` is a brand-new mint, 08-11, never seen by the
  brief; `UC-RDL-P4` is the §11.3/A2 task-id-collision case):
  `BA-IND-P1-MOMENTUM-FRONTEND, BCTC-DATA-QUALITY, CHORE-COMMIT-OVERHEAD, CRON-WORKFLOW-OPTIMIZE,
  FE-PAGE-REORG, FIX-BCTC-CTG-BALANCE-SHEET-REFINE, FIX-ERRAUDIT-WAVE-3, FOLLOW-UP-HARDENING,
  TASK-17, TEST-HYGIENE, UC-RDL-P4`.
- **Strict-union dangling: 22** — the +11 delta the broad union hides today:
  `ANALYSIS-QUALITY-CONVERGENCE, COWORK-GUARANTEED-SLOT-CATCHUP, FIX-BCTC-BANK-SUMMARY-MAPPING,
  FLOW-PRICE-ALPHA-LOOP, FRESHNESS-AUTO-REMEDIATE, INPUT-VALIDATION-COVERAGE,
  PREDICTION-CLAIMS-DAILY-CADENCE, S2-DATA-HONESTY, SYSTEMIC-REMAKE-P1, TOKEN-ECONOMY-AUDIT,
  ULTRACODE-AUDIT-FIXALL`.
- Direct, timestamped reproduction of the live hazard: today's real (not simulated)
  `--all --dry-run` output includes `WOULD-ARCHIVE file=sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-25.md
  id=COWORK-GUARANTEED-SLOT-CATCHUP` — `sprint_goal` marks this id `active` and 10 task rows still
  reference it in non-terminal lanes (§11.7). `archived(would)` has grown 299 (08-08) → 346 (08-14,
  PO's number) → **355 (08-22, this run)** — the anti-correlation PO identified (dangling count
  falling while archiver blast-radius rises) is continuing, not a one-time artifact.
- `"BACKLOG"` sentinel: **22 refs today** (12 at brief-time, 24 at PO's 08-14 ruling) — still
  unaddressed, still round-tripping through the cold archive.

### 11.2 AMENDMENT A1 — Stage 1h's known-id union corrected (supersedes §3's "Known-id universe" paragraph)

§3 (original) deliberately gave Stage 1h the SAME broad union as the archiver, reasoning "known" is a
lower bar than "safe to archive." PO's A1 refutes this directly: under that broad union, ids can
"resolve" (read clean, no Stage-1h violation) via `.done_tasks[].sprint` alone while remaining exactly
the unregistered, sign-off-impossible state this whole row exists to catch — §11.1's 11-id delta is
today's live instance of that same failure, 8 days after PO first found it.

**Corrected rule:** Stage 1h's known-id universe for counted-violation resolution DROPS
`.done_tasks[].sprint` entirely:
```
KNOWN(stage-1h) = active_sprints[].id (hot) ∪ closed_sprints[].id (hot)
                ∪ closed_sprints[].id (cold archive) ∪ closed_sprint_goals sprint ids (cold archive)
```
`.done_tasks[].sprint` is demoted to a candidate/weak signal used ONLY inside
`decision-journal-archive.sh`'s own internal bookkeeping (§5/AC-4's third-state branch, "have I ever
heard of this id at all") — never as sole justification for Stage 1h to call an id resolved, and never
as sole justification for §2.1 to skip registering it. Measured today: strict union = 57 ids vs.
broad = 100; this is exactly why strict-dangling (22) exceeds broad-dangling (11) — the 43-id gap is
made entirely of ids whose only registry-shaped evidence is a per-task provenance tag, not a closure
record.

### 11.3 AMENDMENT A2 — task-id resolution step, new STEP 0 before §2.1's branches

New step, evaluated FIRST, before any of §2.1's/§11.4's branches:
```
STEP 0 — TASK-ID CHECK: is `id` itself a real task id anywhere in the known task-id universe
(hot board, all lanes ∪ nested active_sprints[].tasks[]/closed_sprints[].tasks[] ∪ cold archive
done_tasks[].id)? If YES → this is not a sprint id. New disposition RELABEL: every row currently
carrying `.sprint == id` instead gets `.sprint == <that task's own .sprint value>` (one hop; if that
value is itself unresolved, re-run this same id through step 0 + the branch table, capped at 3 hops
to guard a cycle — none observed live today).
```
Two confirmed live instances (both unchanged since PO's 08-14 finding — neither has been touched):
- **`UC-RDL-P4`** — the exact step-0 pattern. Verified live: `task_board.backlog[]` has
  `id: "UC-RDL-P4", sprint: "ULTRACODE-AUDIT-FIXALL", status: "BLOCKED"` — a real task. `ready[]` row
  `RDL-P4-DISPATCH-TOOL-DEV` (status `READY`) carries `.sprint: "UC-RDL-P4"` — a task id written into
  a sprint field. Disposition: RELABEL `RDL-P4-DISPATCH-TOOL-DEV.sprint` → `"ULTRACODE-AUDIT-FIXALL"`
  (itself classified LIVE, §11.7).
- **`BA-IND-P1-MOMENTUM-FRONTEND`** — a sibling pattern, not literally step 0 (the id itself is not a
  task id; the 2 rows referencing it, `TASK-501-MOMENTUM-API-HANDLER` / `TASK-502-MOMENTUM-FRONTEND`,
  are nested inside the CLOSED `MARKET-INDICATOR-DEPTH-P0` sprint's own `.tasks[]`). Both end in the
  same RELABEL disposition and both were caught by the same "why doesn't this id look like a real
  sprint" scrutiny, so documented alongside step 0 for implementation convenience. Ratified by PO
  ruling Q1 (§10 Q1 / §11.6): relabel to `MARKET-INDICATOR-DEPTH-P0`.

### 11.4 AMENDMENT A3 — branch-table contradiction resolved (supersedes §2.1's branch table)

Corrected table (STEP 0, §11.3, evaluated first):
```
0. id IS itself a real task id                         → RELABEL (§11.3)
1. sprint_goal status == "active"  (EXACT literal
   match — NOT "any non-terminal value")                → LIVE, register active_sprints[]
2. ANY referencing task row sits in a non-backlog
   lane (ready/in_progress/qa/review/done/
   done_verified)                                       → LIVE, register active_sprints[]
3. sprint_goal status is terminal (DONE/DONE_VERIFIED/
   CANCELLED/DEFERRED/SKIPPED) AND every referencing
   row (if any) is terminal-status                       → FINISHED, register closed_sprints[]
4. ELSE — referencing rows exist only in backlog[],
   AND goal entry is absent OR == "PLANNING"              → PRE-SPRINT LABEL, exempt
5. ELSE — no referencing rows at all AND goal status is
   neither "active" nor terminal nor "PLANNING"
   (e.g. "OPEN")                                          → NEW Q4, not resolved here (§11.6)
```
The old branch 1 ("goal status == live, meaning any non-terminal value incl. `PLANNING`") is deleted —
that was the exact self-contradiction PO's A3 identified against the old ELSE branch. `"active"` is
now checked by EXACT STRING VALUE: live measurement today confirms `sprint_goal.entries[].status`
carries exactly 3 non-terminal-shaped values in the corpus — `active` (9 entries, PO has run
sprint-kickoff), `PLANNING` (5 entries, pre-kickoff), and `OPEN` (1 entry — a THIRD vocabulary word
neither this brief nor PO's ruling anticipated; §11.6 Q4).

PO's named live instance re-verified unchanged today: `CHORE-COMMIT-OVERHEAD` (goal `PLANNING`, 8
refs, ALL `backlog[]`) → branch 4, PRE-SPRINT LABEL, exempt (matches PO's Q2 disposition-in-principle
even though this specific id postdates the brief and was never in PO's named 5).

### 11.5 AMENDMENT AC-0 — safety-valve design (non-blocking per PO, sequenced FIRST in §11.8)

Hazard reconfirmed live and unchanged: `docs/policies/dev-standards.md:60` still reads
```
# one-time / occasional backfill:
bash scripts/agents-flow/decision-journal-archive.sh --all
```
with no warning attached (verified 2026-08-22). Any agent running this literally, today, physically
`git mv`s journals for at least `COWORK-GUARANTEED-SLOT-CATCHUP` / `TOKEN-ECONOMY-AUDIT` /
`ULTRACODE-AUDIT-FIXALL` / `FLOW-PRICE-ALPHA-LOOP` (§11.1's real `--dry-run` proof) out from under
open work. `docs/WORK.md` records the same unresolved backfill as a "follow-up PO-routed action" (PO
cited line 339; in the current file that entry is at line 348 — WORK.md is append-only and line
numbers drift, matched here by content, not position).

**Design for developer** (not shipped here, plan_only):
1. `decision-journal-archive.sh --all` (non-`--dry-run` only) refuses to run unless EITHER an
   explicit override env (`DJA_ALLOW_ALL_UNGATED=1`) is set, OR the new corpus-replay script
   (§3/§6, `verify-sprint-registry-referential-integrity.sh`) has just reported `violations==0`
   under the §11.2-corrected rule (exact caching/marker mechanism is a developer implementation
   detail — AC-0 only requires SOME valve exists before step 1 of §11.8, not a specific one).
2. `--dry-run` is unaffected — already zero-mutation, already the sanctioned preview path.
3. Same commit: 1-line caveat added at `dev-standards.md:60` pointing at the new gate; the
   `WORK.md` "follow-up PO-routed action" note is left in place (append-only changelog convention)
   but the new entry documenting this fix explicitly supersedes it.

### 11.6 Updated open questions (supersedes §10)

- **Q1/Q2/Q3 — RATIFIED** by PO 2026-08-14, folded into §11.3/§11.4. Re-verified live today: Q1
  (`BA-IND-P1-MOMENTUM-FRONTEND`) unchanged, still exactly the 2 nested rows named in the ruling. Q2 —
  the 5 named exempt ids (`BCTC-DATA-QUALITY, CRON-WORKFLOW-OPTIMIZE,
  FIX-BCTC-CTG-BALANCE-SHEET-REFINE, FIX-ERRAUDIT-WAVE-3, FOLLOW-UP-HARDENING`) are all still
  backlog-only/no-goal-entry today; `COWORK-GUARANTEED-SLOT-DURABILITY` correctly dropped off this
  list (confirmed: it now has a real `closed_sprints[]` entry, zero dangling status). Q3 —
  `TASK-17` unchanged (1 backlog ref, strip); `"BACKLOG"` sentinel now at 22 refs (was 12 at brief
  time, 24 at PO's ruling — churned, not fixed, still unaddressed).
- **NEW Q4** (blocking only for §11.4 branch 5, non-blocking for everything else): sprint_goal entry
  `PREDICTION-CLAIMS-DAILY-CADENCE` carries `status: "OPEN"` — a value outside this design's 2-word
  vocabulary (`active`/`PLANNING`), and it has ZERO referencing task rows anywhere (hot or nested).
  Recommendation (not decided — PO owns sprint-goal vocabulary): treat `OPEN` as `PLANNING`-equivalent
  for §11.4's predicate (its own `vision` text reads as "flagged problem, not yet decomposed into any
  task" — functionally identical to `PLANNING`'s pre-kickoff meaning). With zero referencing rows it
  then lands in branch 4 (PRE-SPRINT LABEL, exempt — nothing to register against regardless). PO may
  instead prefer normalizing this one live entry's `status` to `PLANNING` directly (a data fix, not a
  design fix) so the predicate's 2-value assumption stays true going forward. Either way: name the
  literal explicitly in the Stage-1h implementation, never an "anything else" catch-all — that
  catch-all is the exact class of bug A3 exists to close.

### 11.7 Amended per-id classification (2026-08-22, supersedes §2.2 for every id that changed)

All 22 strict-dangling ids (§11.1), classified under the corrected §11.4 table. This table is a
**re-run of a script, not a hand-maintained list** — PO's own 08-14 instruction (§2.2's own churn,
twice, proves the point) — and MUST be regenerated again at actual implementation time.

| id | goal status | task-lane signal | classification | action |
|---|---|---|---|---|
| `ANALYSIS-QUALITY-CONVERGENCE` | active | `backlog` only (1) | **LIVE** (branch 1) | register `active_sprints[]` |
| `BA-IND-P1-MOMENTUM-FRONTEND` | (none) | nested inside closed `MARKET-INDICATOR-DEPTH-P0` (2) | RELABEL (§11.3, Q1) | relabel 2 rows → `MARKET-INDICATOR-DEPTH-P0` |
| `BCTC-DATA-QUALITY` | (none) | `backlog` only (1) | PRE-SPRINT LABEL (branch 4, Q2) | exempt |
| `CHORE-COMMIT-OVERHEAD` | PLANNING | `backlog` only (8) | PRE-SPRINT LABEL (branch 4) | exempt |
| `COWORK-GUARANTEED-SLOT-CATCHUP` | active | non-backlog present (`ready`×4, `done`×1) | **LIVE** (branch 1+2) | register `active_sprints[]` |
| `CRON-WORKFLOW-OPTIMIZE` | (none) | `backlog` only (1) | PRE-SPRINT LABEL (branch 4, Q2) | exempt |
| `FE-PAGE-REORG` | active | `backlog` only (1) | **LIVE** (branch 1) | register `active_sprints[]` |
| `FIX-BCTC-BANK-SUMMARY-MAPPING` | active | non-backlog present (`review`×2, `BLOCKED`) | **LIVE** (branch 1+2) | register `active_sprints[]` |
| `FIX-BCTC-CTG-BALANCE-SHEET-REFINE` | (none) | `backlog` only (1) | PRE-SPRINT LABEL (branch 4, Q2) | exempt |
| `FIX-ERRAUDIT-WAVE-3` | (none) | `backlog` only (1) | PRE-SPRINT LABEL (branch 4, Q2) | exempt |
| `FLOW-PRICE-ALPHA-LOOP` | active | non-backlog present (`review`×1) | **LIVE** (branch 1+2) | register `active_sprints[]` |
| `FOLLOW-UP-HARDENING` | (none) | `backlog` only (1) | PRE-SPRINT LABEL (branch 4, Q2) | exempt |
| `FRESHNESS-AUTO-REMEDIATE` | PLANNING | `backlog` only (4) — was `review` at brief-time, since moved back/closed | PRE-SPRINT LABEL (branch 4) — **reverses the original brief's LIVE call, see note below** | exempt |
| `INPUT-VALIDATION-COVERAGE` | PLANNING | non-backlog present (`ready`×1) | **LIVE** (branch 2, goal alone insufficient but task-lane confirms) | register `active_sprints[]` |
| `PREDICTION-CLAIMS-DAILY-CADENCE` | OPEN | none | branch 5 — **Q4, pending PO** | pending |
| `S2-DATA-HONESTY` | active | `backlog` only (1) | **LIVE** (branch 1) | register `active_sprints[]` |
| `SYSTEMIC-REMAKE-P1` | active | **none at all** | **LIVE** (branch 1 only — goal-status-alone case) | register `active_sprints[]` |
| `TASK-17` | (none) | `backlog` only (1) | NEVER-WAS (Q3) | strip field |
| `TEST-HYGIENE` | (none) | non-backlog present (`ready`×1) | **LIVE** (branch 2) | register `active_sprints[]` |
| `TOKEN-ECONOMY-AUDIT` | active | non-backlog present (`review`×1, `done_verified`×1) | **LIVE** (branch 1+2) | register `active_sprints[]` |
| `UC-RDL-P4` | (none) | is itself a task id | RELABEL (§11.3, step 0) | relabel `RDL-P4-DISPATCH-TOOL-DEV.sprint` → `ULTRACODE-AUDIT-FIXALL` |
| `ULTRACODE-AUDIT-FIXALL` | (none — no `sprint_goal` entry exists for it at all, separate minor finding) | non-backlog present (`ready`×3, `in_progress`×1, `done`×6) | **LIVE** (branch 2) | register `active_sprints[]` |

`FRESHNESS-AUTO-REMEDIATE` note: the 08-08 brief classified this LIVE because a `review`-lane row
(`SPIKE-FRESHNESS-REMEDIATE-TRIAGE`) referenced it then. That row is no longer in `review[]` today (14
days later); all 4 current referencing rows are `backlog[]`. This is expected churn, not a design bug —
it demonstrates the algorithm converges correctly on whatever the live state actually is, rather than
needing PO to force one static answer.

`SYSTEMIC-REMAKE-P1` note: this is the exact case PO flagged ("reads clean while `sprint_goal` calls it
`active`") — zero task rows reference it in any lane today, so the ONLY signal is the goal-status-active
branch. Under the corrected rule it is still correctly caught as a counted violation (LIVE, needs
registration) — the old broad-union Stage 1h would have let it resolve silently via a stale
`done_tasks[].sprint` tag; A1 (§11.2) is what makes this case visible again.

### 11.8 Amended sequencing (supersedes §8 — inserts AC-0 as new step 0)

0. **AC-0 safety valve ships first** (§11.5) — independent of everything else below, since the hazard
   is armed today, not latent (per PO's original AC-0 framing).
1. **PO ratifies this amendment** (§11.1–§11.7) + rules on Q4.
2. **Data reconciliation writes**, via `scripts/orch-apply.sh`: register `active_sprints[]` for the
   LIVE rows (§11.7), strip `TASK-17`+the 22 `"BACKLOG"`-sentinel rows, relabel the 2
   `BA-IND-P1-MOMENTUM-FRONTEND` rows and `RDL-P4-DISPATCH-TOOL-DEV` (§11.3). Leave PRE-SPRINT-LABEL
   ids untouched. **Re-run the classification script fresh at this step** — do not reuse §11.7's
   table verbatim, it will already be several days stale by implementation time (same instruction PO
   gave for §2.2, now doubly proven necessary by §11.7's own churn vs. §2.2).
3. `decision-journal-archive.sh` closed-id-derivation correction (§2.3) — now also backs Stage 1h's
   known-id union per A1 (§11.2), a single shared implementation, not two.
4. AC-4 third-state branch (§5), on top of step 3's corrected predicate.
5. Stage 1h validator ships in `warn` mode (§3), using the A1-corrected known-id union (§11.2) and the
   A2/A3-corrected branch table (§11.4) for its exemption logic.
6. Corpus replay confirms `violations == 0` — under the NOW-STRICTER strict-union rule, a materially
   higher bar than the original brief's step 6 (today's true count is 22, not 11).
7. Flip `ORCH_SPRINT_REGISTRY_MODE` to `reject`, separate reviewed change.
8. AC-5 evidence captured (§6).
