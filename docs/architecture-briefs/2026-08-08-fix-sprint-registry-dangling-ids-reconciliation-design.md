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
