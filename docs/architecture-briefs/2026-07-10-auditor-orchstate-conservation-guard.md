# FIX-AUDITOR-ORCHSTATE-FULLDOC-OVERWRITE-CLOBBERS-SSOT — Root-Cause Re-Verification + Conservation-Guard Design

**Date:** 2026-07-10
**Author:** architect
**Status:** DESIGN COMPLETE — code change REQUIRED, gap is LIVE today (empirically reproduced)
**Slug:** auditor-orchstate-conservation-guard
**Task:** `FIX-AUDITOR-ORCHSTATE-FULLDOC-OVERWRITE-CLOBBERS-SSOT` (P1, `recurring_bug_escalation:true`, PLAN-ONLY)

---

## 0. Executive Summary

**The routing half of this bug is fixed. The content-safety half is NOT, and is empirically live-exploitable today (2026-07-10).**

- **Routing (fix_spec item 5):** ALREADY SHIPPED, one day after the incident. `SSOT-W1-ORCH-APPLY-WRAPPER`
  (commit `86286d265`, 2026-06-27) made `scripts/orch-apply.sh` the single gated write path; a full
  codebase writer-audit (`docs/signals/processed/orch-state-writer-audit.json`, 2026-06-30,
  `audited_by: dev-mcp-server`) confirms **all 13 live writer call sites — including the
  signal-dashboard skill's WRITE/READ/PRUNE that `system-auditor` uses — route through it**, and found
  **zero** live direct-Bash bypass sites. `.head` is now a **required** Zod field, closing the specific
  "head disappeared" sub-symptom.
- **Content-safety (fix_spec item 3, the CONSERVATION check):** **NEVER IMPLEMENTED, at any layer.**
  I reproduced the exact class of the original incident **live, against the current code**, using the
  project's own existing test-safety pattern (`ORCH_APPLY_LIVE_FILE_OVERRIDE`, zero risk to the real
  file) — see §3. `scripts/orch-apply.sh` accepted a fabricated minimal-scaffold candidate against a
  320-backlog/100-signal-row populated fixture and printed `[orch-apply] OK — candidate applied`,
  collapsing backlog 320→0 and signal rows 100→1 in one atomic rename. **Exit 0. No warning.**
- **Interim mitigation ("Telegram-BUG + notebook only, no signal_queue write"):** **LAPSED / never
  durably wired.** `docs/agents/system-auditor/flow/main.md` still mandates `.signal_queue.rows[]`
  writes in 4 places (Tier-2 E-3, Tier-3 E-3, D-BCTC-EVAL, D-IMPROVE), each marked "mandatory, no skip
  path" / "ANTI-SKIP". Direct evidence of continuous, uninterrupted signal-queue writes from
  `system-auditor` through **2026-07-08** (2 days before this brief) — see §2. The mitigation, if it
  ever ran, was a same-day operational choice never encoded in the flow doc, and could not have survived
  the next cron-fired cycle (system-auditor runs on unattended cron, not router-gated per-cycle).
- **Decision:** implement a magnitude-bounded **conservation circuit-breaker** as a new Stage-2 gate
  inside `scripts/orch-apply.sh` (not per-caller, not baked into `orch-validate.mjs` — see §5 for why),
  with a narrow named-bypass for the 2 already-shipped legitimate eviction writers. A **naive
  never-decrease-per-lane** check (fix_spec's literal wording) would be actively harmful — see §4.2 for
  the false-positive proof against real, common, already-shipped operations.
- **Next agent:** `dev-mcp-server` (via `po` routing, matching board convention — see §7). Zero
  `apps/mcp-server/src` TypeScript changes required; zero container rebuild required (all touched files
  are host-side bash/bun scripts).

---

## 1. Root-Cause Re-Verification — What Actually Happened (2026-06-26)

### 1.1 The commit, read directly

`git show de595a44 --stat` → `docs/data/orch/orch-state.json | 26127 +----` → **20 insertions, 26107
deletions**. The post-image (`git show de595a44:docs/data/orch/orch-state.json | jq`) is a 9-key,
3708-byte document: `.head` **absent entirely**, `.task_board` has only 2 keys (`active_sprints`,
`backlog`, both `[]`/`[]` — `ready`/`in_progress`/`review`/`qa`/`done`/`done_verified` all missing),
`.signal_queue.rows` has exactly 1 row.

### 1.2 The documented WRITE procedure, AT THE TIME of the incident

`git show de595a44^:.claude/skills/signal-dashboard/dashboard-protocol.md` (the version actually live
when the incident fired) shows the WRITE procedure was **already a correct targeted append**:
```
UPDATED=$(echo "$CURRENT" | jq --argjson row "$NEW_ROW" '.signal_queue.rows += [$row] | ...')
TMP=$(mktemp ...); echo "$UPDATED" > "$TMP"; mv "$TMP" docs/data/orch/orch-state.json
```
If this literal pipeline had executed against the real ~26,000-line file, `$UPDATED` would still be the
full document plus one row — it structurally cannot produce a 20-line output. **`scripts/orch-state-validate.sh`
did not exist yet at this commit's parent** (`git show de595a44^:scripts/orch-state-validate.sh` →
`fatal: path exists on disk, but not in 'de595a44^'`) — so at incident time there was **zero validation
gate** between the write and the rename; the only guard was a POST-WRITE read-back that asserts *the
new row's id is present* — a check that is structurally blind to a whole-document replacement (a
scaffold containing only that one row trivially satisfies "row X is present").

### 1.3 Conclusion on root cause

This was **not** a documentation/procedure-design defect at the WRITE-idiom level — the documented idiom
was already append-only. The actual write that landed does not match what that idiom can produce, which
means the executing agent did not run the literal bash pipeline faithfully (most consistent with the
class of bug this project already tracks as "LLM fabricates/hand-authors JSON instead of running the
bash-only pipeline that never surfaces full-file content to model context" — `docs/standards/orch-state-access.md §1`
exists specifically to prevent an agent from ever holding the full file in its own context). Two
structural gaps made this possible and, per §3, **one of them still exists today**:
1. No non-empty/failed-read guard before the write proceeds (fix_spec item 2) — **now closed**, see §6.
2. **No CONSERVATION check that the write didn't shrink the board** (fix_spec item 3) — **still absent**.

---

## 2. Interim-Mitigation Status — LAPSED (live evidence, not inference)

The backlog record claims: *"Router operationally switched system-auditor to Telegram-BUG + notebook
only (no orch-state signal_queue write) — removes the collapse trigger until durable fix lands."*

**Current flow doc, read in full** (`docs/agents/system-auditor/flow/main.md`, 787 lines, this session):
- Line 316-328 (Tier-2 emit): `"Step E-3 — SIGNAL ROW (mandatory, same call as E-1, no skip path)"`
- Line 344 (D-BCTC-EVAL): unconditional append instruction
- Line 412-416 (D-IMPROVE): unconditional append instruction
- Line 616-628 (Tier-3 emit): `"Step E-3 ... mandatory, runs immediately after E-1, no skip path"`,
  `"ANTI-SKIP: if the orch-state write fails ... do NOT silently continue without the row."`

No conditional, no feature flag, no "skip if interim mitigation active" branch exists anywhere in this
file. `init.md` (`responsibilities`) also states unconditionally: *"Append WARN/CRITICAL findings to
`docs/data/orch/orch-state.json` `.signal_queue.rows[]`"*.

**Direct evidence the auditor never stopped writing:** `docs/data/orch/archive/2026-07.json` (cold
archive, evicted rows) contains **138 rows with `from: "system-auditor"`**, with timestamps on
2026-07-03, 2026-07-04, and — most recently — **2026-07-08T03:00Z** (2 days before this brief), e.g.
`sau-d4-dev-team-cron-singleton-pipeline_mismatch-20260708`. `system-auditor`'s own `inter_agent.receives_from`
is `{agent: cron, mechanism: scheduled_invocation}` (`init.md:151-153`) — fully unattended, no per-cycle
router gate.

**Conclusion:** whatever "operational" routing choice the 2026-06-26 router made was, at most, a
same-day, session-scoped decision. It was never encoded into the durable flow doc, so it could not
possibly have survived past the first subsequent cron-fired Tier-2/Tier-3 cycle. **This ticket has been
live, not mitigated, for the full two weeks since it was filed.** This materially raises urgency versus
the backlog record's framing.

---

## 3. Live-Exploitability Proof (empirical, this session, zero risk to real file)

Using the project's own existing test-safety idiom (`ORCH_APPLY_LIVE_FILE_OVERRIDE`, already documented
in `scripts/orch-apply.sh:46-49` and already used by `scripts/test/orch-apply-wrapper-tests.sh`):

```bash
# 1. Built a disposable "populated" fixture: 320 backlog tasks, 100 signal_queue rows, valid head.
bun scripts/orch-validate.mjs populated-fixture.json
  → [orch-validate] Stage 0 + Stage 1 PASS   # sanity: fixture is itself schema-valid

# 2. Built a "collapse" candidate mirroring commit de595a44's exact shape (minimal valid .head,
#    task_board = {backlog:[], active_sprints:[]} only, signal_queue.rows = [1 fabricated row]).
bun scripts/orch-validate.mjs collapse-candidate.json
  → [orch-validate] Stage 0 + Stage 1 PASS   # standalone structural check: ALSO passes

# 3. Fed the collapse candidate through the REAL orch-apply.sh against the POPULATED fixture as "live":
BEFORE: backlog=320 signal_rows=100
ORCH_APPLY_LIVE_FILE_OVERRIDE=live-under-test.json bash scripts/orch-apply.sh < collapse-candidate.json
  → [orch-validate] Stage 0 + Stage 1 PASS
  → [orch-apply] OK — candidate applied → live-under-test.json
  → exit 0
AFTER:  backlog=0 signal_rows=1
```

**This is the exact mechanics of the original incident, reproduced today, through the current,
production, single-gated write path — not a bypass of it.** Every one of the 13 Category-A writer sites
(`docs/signals/processed/orch-state-writer-audit.json`) — including `system-auditor`'s own
signal-dashboard WRITE path — funnels through this same `scripts/orch-apply.sh`. The reason no second
collapse has landed in the two weeks since is that the specific execution-fidelity failure (an agent
fabricating a scaffold instead of running the append pipeline) is probabilistic, not deterministic on
every write — consistent with `recurring_bug_escalation:true` (a latent defect that resurfaces
unpredictably, not a permanently-tripped one).

**Why schema validation alone cannot catch this** (`apps/mcp-server/src/infrastructure/orchStateSchema.ts`):
- `Lane = z.array(TaskSchema)` (line 129) — no `.min()`; an empty array is valid.
- `done/done_verified/in_progress/qa/ready/review` are all `Lane.optional().default([])` (lines 275-280)
  — a document that **omits** these lanes entirely (exactly what the incident produced) is silently
  backfilled to `[]` by Zod, not rejected.
- `TaskBoardSchema.strict()` (line 296) "catches full-doc overwrites and unknown structural keys" per
  its own comment — but the incident's collapsed `task_board` introduced **zero** unknown keys (only
  omitted known-optional ones), so `.strict()` does not fire.
- `HeadSchema.status: z.string()` (line 222) is the only required field — trivially satisfied by
  `{"status":"idle"}`.
- `checkLaneCoherence()` (Stage 1b, `orchStateSchema.ts:430-459`) validates each task's `status` value
  is legal for its lane — it never compares counts, and is candidate-only (no access to the prior
  state).
- No stage anywhere loads or compares against the pre-write live file's contents. `orch-validate.mjs`'s
  entire contract is single-document, stateless structural validation.

---

## 4. Design

### 4.1 What I am building: a magnitude-bounded conservation circuit-breaker in `scripts/orch-apply.sh`

New **Stage 2** (after existing schema validation, before the existing CAS-mtime-guarded rename):

```
task_total(doc)   = Σ length(backlog, ready, in_progress, review, done, done_verified)
                   + Σ active_sprints[].tasks[].length + Σ closed_sprints[].tasks[].length
signal_total(doc) = length(signal_queue.rows)

FLOOR_RATIO   = ${CONSERVATION_FLOOR_RATIO:-0.5}   # candidate must retain ≥50% of live total
MIN_BASELINE  = ${CONSERVATION_MIN_BASELINE:-10}   # skip guard entirely below this size (no false
                                                    # alarms on legitimately-small/early/test boards)

for each of (task_total, signal_total):
  if live_total >= MIN_BASELINE and candidate_total < live_total * FLOOR_RATIO:
    if ORCH_APPLY_ALLOW_SHRINK is set and non-empty:
      log "[orch-apply] SHRINK-ALLOWED: ${ORCH_APPLY_ALLOW_SHRINK}" (stderr, auditable)
    else:
      log "[orch-apply] ABORTED: conservation check failed — <metric> live=<N> candidate=<M> " \
          "(< ${FLOOR_RATIO} floor). Set ORCH_APPLY_ALLOW_SHRINK=<reason> if this is an intentional " \
          "bulk eviction/archival write."
      exit 1   # reuses the existing "validation failed, live file untouched" exit class
```

Implementation lives in a **new small shared script**, `scripts/orch-conservation-check.mjs` (bun,
matching `orch-validate.mjs`'s runtime), taking `(liveFilePath, candidateFilePath)` and printing the
metrics or the failure reason. `orch-apply.sh` shells out to it (same pattern as its existing, header-mandated
`bun scripts/orch-validate.mjs` call — *"NEVER duplicate or reimplement validation logic"*). This is a
**deliberate departure from folding it into `orch-validate.mjs` itself** — see §5 for why.

### 4.2 Why NOT the fix_spec's literal wording ("counts must NOT decrease" per lane)

The backlog record proposes: *"`.task_board.backlog` and `.task_board.{ready,in_progress,review,done,
done_verified}` + `active_sprints` counts must NOT decrease — abort+restore if they did."* **This is
unworkable as written and would be actively harmful.** Proof, from live evidence gathered this session:

1. **Normal single-task lane moves are the majority of all board writes.** I directly observed this
   ticket's own BOUNDED-1 pickup this session: `promote` moves one row `backlog[]→ready[]` (backlog
   count **-1**), `claim` moves it `ready[]→in_progress[]` (ready count **-1**) — both via `orch-apply.sh`,
   both completely normal, both would be **falsely blocked** by a strict per-lane never-decrease rule.
2. **Two already-shipped, already-production writers intentionally shrink lanes in bulk**, both already
   routed through `orch-apply.sh` per the writer-audit (`docs/signals/processed/orch-state-writer-audit.json`,
   Category A): `scripts/orch-cold-evict.sh` (evicts `done[]`/`done_verified[]`/terminal
   `active_sprints[]`/terminal `signal_queue.rows[]` to cold storage — `scripts/orch-cold-evict.sh:483-485`
   pipes into `orch-apply.sh`) and `docs/agents/pm/flow/task-archive.md` (archives `done[]`/`done_verified[]`
   tasks). A naive rule would permanently break both, or force them to be reflexively exempted from ANY
   conservation checking (defeating the guard's purpose for their call sites).
3. This class of false-positive is exactly what this project's own memory already flags at scale
   (`feedback_auditor_predicate_drift_false_regression`, `feedback_auditor_inverted_predicate_false_db1_critical`)
   — a naive predicate here would be a new instance of the same failure family, not a fix.

**The magnitude-bounded, ratio-based, whole-board-total design in §4.1 avoids both failure modes**: a
single-task lane move nets to zero on `task_total` (item moves between lanes, doesn't leave the
document), so it never trips the floor; only a genuinely catastrophic single-write loss (≥50% of the
whole board, and only once the board is non-trivially sized) trips it — exactly the shape of the actual
incident (100% backlog loss, 99% signal-row loss). Legitimate bulk eviction is handled by an **explicit,
narrow, auditable bypass** (`ORCH_APPLY_ALLOW_SHRINK=<reason>`), mirroring the precedent already in this
exact script for test-only carve-outs (`ORCH_APPLY_LIVE_FILE_OVERRIDE`, `orch-apply.sh:46-49`) — wired
ONLY into `scripts/orch-cold-evict.sh` and `scripts/orch-backlog-stub.sh` (backlog-stub does not
actually shrink counts, only content — audit anyway) and `pm/flow/task-archive.md`; `system-auditor`'s
signal-dashboard WRITE path and every other of the 13 Category-A sites must never set it.

### 4.3 Hook parity (defense-in-depth, not the primary gate)

`scripts/agents-flow/orch-state-hook-prewrite.mjs` (PreToolUse gate on raw `Write`/`Edit` tool calls)
currently only shells out to `orch-validate.mjs` — same blind spot. Extend it to also call
`scripts/orch-conservation-check.mjs` (reads the live file itself + the proposed post-write content),
same bypass contract via an env var the hook can read from its own process env. The writer-audit found
**zero** live direct-Bash/Write-tool bypass sites today, but `orch-apply.sh` is the primary/near-certain
path for this specific bug class (§3 proves the vulnerability through the *intended* path, not a
bypass) — hook parity is secondary hardening, not the load-bearing fix.

---

## 5. Why the guard lives in `orch-apply.sh`, not `orch-validate.mjs`, and not per-caller

- **Not per-caller** (rejected explicitly by fix_spec's own `generic_mandate` and confirmed correct
  here): duplicating this check into `docs/agents/system-auditor/flow/main.md` alone would fix only
  system-auditor while leaving the other 12 Category-A writers, and any future 14th writer, exposed to
  the identical class. `orch-apply.sh` is the one chokepoint all ~290/tick writes already funnel
  through — one implementation, automatic inheritance, zero per-caller edits required (this is *more*
  complete than the ticket's own literal ask, which only mentioned wiring the auditor).
- **Not baked into `orch-validate.mjs`**: that script's entire existing contract (used standalone via
  CLI, inside the PreToolUse hook, and by `orch-apply.sh`) is single-document, stateless, structural
  validation — "is this ONE file well-typed." Every existing call site passes exactly one file path.
  Introducing a "compare against a live baseline" mode would change that contract for every caller,
  including ad-hoc CI/CLI validation of an isolated candidate with no defined baseline. `orch-apply.sh`,
  by contrast, is **already baseline-aware** — it holds `LIVE_FILE` in scope and already runs one
  live-state-aware guard (the CAS-mtime check, `orch-apply.sh:121-131`). The conservation check is a
  natural, same-shape sibling to that existing guard, not a new category of concern.

---

## 6. What is genuinely already fixed (do not re-litigate)

- Routing perimeter: closed (§0, writer-audit verdict "PERIMETER CLOSED" — I re-verified this claim
  against the 13 individually-listed sites and spot-checked `dashboard-protocol.md` + `orch-cold-evict.sh`
  + `orch-backlog-stub.sh` directly; accurate for ROUTING).
- Non-empty-input guard (fix_spec item 2): `orch-apply.sh:92-97` (`[[ ! -s "${TMP}" ]]` → exit 3).
- Atomic temp→rename (fix_spec item 4): `orch-apply.sh:133-138`, same-directory `mktemp` + `mv`.
- `.head` required (closes the "head disappeared" sub-symptom specifically): `orchStateSchema.ts:352`.
- CAS-mtime concurrent-writer guard (not in original fix_spec, but a related hardening): `orch-apply.sh:121-131`.

**Residual gap = conservation check only** (fix_spec item 3). Items 1/2/4/5 are done; item 6
(verification gate) does not exist yet — designed in §8 below, extending the existing test harness
rather than adding a new one.

---

## 7. Board Routing Decision

`next_agent: po` on the board row (matches the sibling `FIX-TASKLOCK-OWNER-SESSION-SERVER-SCOPED-DEFEATS-MUTEX`
precedent closed earlier this tick — architect hands PLAN-ONLY output back to `po`, who mints/dispatches
the implementation task). Unlike that sibling ticket, **this one is not stale — it requires real code
changes** as designed in §4. My explicit recommendation to `po`: route the implementation to
`dev-mcp-server` (the same zone that authored `SSOT-W1-ORCH-APPLY-WRAPPER` per the writer-audit's own
`audited_by` field) — **not** `ops`: every touched file (`scripts/orch-apply.sh`,
new `scripts/orch-conservation-check.mjs`, `scripts/agents-flow/orch-state-hook-prewrite.mjs`,
`scripts/test/orch-apply-wrapper-tests.sh`) is a host-side bash/bun repo script; none touch
`apps/mcp-server/src`, none require a container rebuild or `ops`-gated deploy.

---

## 8. Verification Gate (test design — must FAIL today, PASS after the fix)

Extend the **existing** `scripts/test/orch-apply-wrapper-tests.sh` (already uses the exact
`ORCH_APPLY_LIVE_FILE_OVERRIDE` + throwaway-fixture + real-file-SHA-unchanged safety pattern I used for
§3 — do not create a parallel test file) with 3 new cases:

1. **`COLLAPSE`** — populated fixture (≥312 backlog, ≥97 signal rows, per the ticket's literal ask) +
   scaffold candidate mirroring `de595a44`'s shape → **assert exit 1**, fixture byte-unchanged (hash
   check, same pattern the harness already uses for QA-1/QA-2). **Confirmed RED today** (§3: currently
   exit 0, fixture destroyed) — will go GREEN once §4.1 lands.
2. **`APPEND-HAPPY`** (regression guard — the circuit-breaker must not block the auditor's actual,
   correct write): same populated fixture + one legitimately appended signal row, nothing else touched
   → assert exit 0, `signal_queue.rows.length == pre+1`, `task_board.backlog.length` unchanged, all
   lanes remain arrays.
3. **`SHRINK-ALLOWED`** — same populated fixture + `done_verified[]` emptied +
   `ORCH_APPLY_ALLOW_SHRINK=cold-evict-test` set → assert exit 0 (bypass honored), proving
   `orch-cold-evict.sh`/`task-archive.md` will not regress once the guard lands.

---

## 9. Files Read (citation)

- `docs/agents/system-auditor/init.md` (full, 167 lines), `docs/agents/system-auditor/flow/main.md` (full, 787 lines)
- `.claude/skills/signal-dashboard/SKILL.md`, `dashboard-protocol.md`, `reference.md` (full, all 3)
- `scripts/orch-apply.sh` (full, 142 lines), `scripts/orch-validate.mjs` (grepped + targeted reads)
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (targeted reads: lines 129, 175-338, 340-360, 430-459)
- `scripts/agents-flow/orch-state-hook-prewrite.mjs` (lines 1-80)
- `scripts/test/orch-apply-wrapper-tests.sh` (lines 1-60, header + preflight)
- `docs/signals/processed/orch-state-writer-audit.json` (full)
- `docs/data/orch/archive/2026-07.json` `.signal_rows[]` (filtered on `from=="system-auditor"`)
- `docs/data/orch/archive/backlog-detail.json` — this ticket's full record
- `docs/policies/dev-standards.md` §CANONICAL orch-apply/orch-validate/orch-state-validate sections
- `docs/data/orch/orch-state.json` `.task_board.done[]` — sibling `FIX-TASKLOCK-...` precedent

## 10. Commands Run (citation)

```bash
git show de595a44 --stat
git show de595a44:docs/data/orch/orch-state.json | jq '.head, (.task_board|keys), (.task_board.backlog|length), (.signal_queue.rows|length)'
git show de595a44^:.claude/skills/signal-dashboard/dashboard-protocol.md
git show de595a44^:scripts/orch-state-validate.sh   # → fatal: path exists on disk, but not in de595a44^
git log --oneline --follow -- .claude/skills/signal-dashboard/dashboard-protocol.md
git show -s --format='%H %cI %s' 86286d265d1c8955995244b008c5ca3ac161b3f6 de595a44 d8978e93
jq -c '.signal_rows[]? | select(.from=="system-auditor") | {id,ts,type}' docs/data/orch/archive/2026-07.json
# Empirical repro (throwaway fixtures under scratchpad, ORCH_APPLY_LIVE_FILE_OVERRIDE — real file never touched):
bun scripts/orch-validate.mjs populated-fixture.json           # PASS
bun scripts/orch-validate.mjs collapse-candidate.json          # PASS (standalone)
ORCH_APPLY_LIVE_FILE_OVERRIDE=live-under-test.json bash scripts/orch-apply.sh < collapse-candidate.json
  # → exit 0, backlog 320→0, signal_rows 100→1
```

---

## RETURN

DONE: Root-cause re-verified — routing perimeter closed (2026-06-27/06-30), CONSERVATION check never
implemented, empirically reproduced live-exploitable today. Interim Telegram-only mitigation LAPSED
(auditor writes confirmed continuous through 2026-07-08).
ZONE: multi (scripts/, .claude/skills/signal-dashboard/, no apps/mcp-server/src)
NEXT: po — mint/dispatch implementation to dev-mcp-server per §4 design (conservation circuit-breaker
in orch-apply.sh + new orch-conservation-check.mjs + hook parity + extend existing test harness per §8).
HANDOFF: docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md
PIPELINE: complete
