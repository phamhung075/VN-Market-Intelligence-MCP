# DRS-Stranded-Off-Allowlist Zero-Picker Rows — Mechanical Destination — Architecture Brief

**Task:** FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION (P1, cross-service/, direct PO-mint FIX row via Design-Router Sweep — plan_only, no BA/PM relay)
**Author:** architect, 2026-08-09
**PO's directing question (mint note, answered in §1 below):** does agent-father's own standalone cron consume its own board queue, or only act on freshly-spawned intents?
**Decision:** neither, exactly — the cron literally never touches `.task_board` at all (§1), AND `main.md`'s own dispatch table cannot safely be fed a raw board row even if it did (§1.3, the deeper finding). Fix shape: **two disjoint, purpose-fit mechanisms**, not one — (A) a new agent-father-owned board-drain sub-flow with its own two-tier safety envelope for the 79% agent-father concentration, (B) a small widen of the ALREADY-SHIPPED PO manual-dispatch-sweep for the ops-class remainder. AC1's "new sweep lane" and "ratified PO BATCH with mechanical sweep" options are not alternatives here — they are the correct fix for two genuinely different problem classes living inside the same measured number.

---

## 0. Live re-measurement (this cycle, 2026-08-09T00:31Z, NOT trusted from the 2026-07-30/08-06 mint notes)

Ran the row's own named instrument, `scripts/audits/bounded1-supervised-lane-report.sh` (which itself calls `is_drs_stranded_off_allowlist`, `scripts/lib/po-manual-dispatch-eligibility.jq` — the exact predicate AC4 names, not reimplemented):

```
DRS-target rows: 131 — eligible (auto-dispatched): 88 — stranded off-allowlist (policy): 43
```

Breakdown by resolved `next_agent` (43 rows, `awk`'d from the report's own table, not re-derived):

| next_agent | count | % |
|---|---|---|
| agent-father | 34 | 79% |
| ops | 5 | 12% |
| ops-mainserver-fetch | 2 | 5% |
| ops-vps-fetch | 1 | 2% |
| code-janitor | 1 | 2% |

Priority mix (via `priority_rank`, `"high"` normalizes to the same rank as P1): P1/high = 14, P2 = 19, P3/low/med = 10, **P0 = 0 today**. Drift from the mint note's "44 rows, 27 P0/P1" is normal churn (a few dispatched via PO's existing 1-row/tick sweep since 08-06, a few newly minted) — same "not a discrepancy" pattern this codebase's own architect briefs already document for this row family. No P0 currently in the stranded set lowers *urgency* but not *validity* — 14 P1/high rows with zero mechanical picker is still the defect AC1-4 describe.

---

## 1. Diagnosis — reading agent-father's own flow docs (PO's mandatory pre-design question)

### 1.1 The cron never touches `.task_board` — confirmed by exhaustive grep, not inference

`grep -rn "task_board\|next_agent\|effective_next_agent\|orch-state" docs/agents/agent-father/` returns **zero hits** in any of `main.md`, `keep.md`, `scan-orphans.md`, `sweep-fixes.md`, `review.md`, `create.md`, `edit*.md`, `team-tool-recheck.md` — the only 2 hits in the whole directory are `edit-apply.md`'s unrelated `.head.wip` solo-operation exception and `init.md`'s `commit_zone` note (§1.2). `main.md`'s dispatch table (line 19): `trigger=scheduled` (the cron's own invocation, `.claude/commands/crons/cron-agent-father.md`, daily `23 14 * * *`) routes unconditionally to `keep.md`, whose own steps are: orphan+roster scan (Steps 1-2, gated by a 3-commit pre-check), Top-5 mechanical-compliance checks + auto-fix (Steps 3-5, `sweep-fixes.md`), tool-grant recheck (Step 5b). None of these read `.task_board` in any form. **Answer to PO's question: the cron does not consume its own board queue — not "only acts on freshly-spawned intents" either, since even a freshly-spawned `intent=edit` still requires a caller to have ALREADY done row→(agent_name, change_description) translation (§1.3). It is a closed loop over agent-definition-compliance data, structurally blind to `.task_board`.**

### 1.2 `commit_zone` already deliberately excludes `orch-state.json`, with one narrow, presently-unused carve-out

`docs/agents/agent-father/init.md` line 64-65:
```
excluded: ["docs/data/orch/orch-state.json", "apps/", "docs/data/system-map.json"]
note: "FU-AGENT-FATHER-ORCH-SCOPE: orch-state.json is router-owned — NEVER in agent-father
       commits except the ONE allowed signal-queue DONE-mark per task dispatch."
```
Grep-verified: no agent-father flow file currently exercises that carve-out (the historical commits attributing board lane-moves to "(agent-father)" in `git log` were performed by the dispatching *router* session after agent-father's RETURN, not by agent-father itself editing the file — the standard leaf-agent pattern everywhere else in this fleet). `orch-apply.sh` itself is pure bash/jq/bun (confirmed, no MCP dependency) — agent-father's `Bash` grant is technically *capable* of calling it; the restriction is a deliberate governance boundary (self-imposed blast-radius containment for a "meta-agent... edits the files that define every OTHER agent", `devteam-eligibility.jq:512-514`), not a tool-grant gap. **This governance boundary must be widened, narrowly, for board-drain to write its own lane-move** — see §2.4.

### 1.3 The deeper finding PO's question did not anticipate: `main.md`'s dispatch table cannot safely consume a raw board row at all

`main.md`'s `intent=edit` route requires **structured** `agent_name` (kebab-case) + `change_description` as caller-supplied inputs — `edit.md` → `edit-prepare.md` Step 1 does `Glob: .claude/agents/<agent_name>.md`, i.e. it needs the target already resolved, not a free-text task description. Every OTHER agent on the DRS allowlist (`architect`/`ba`/`pm`/`po`/`agents-architect`) has a **generic** `main.md` — "read a task_board row (or spec), do the work" — which is exactly why `dev-team/flow/execute-tier.md`'s generic spawn shape (`Agent(agent, task_id, run_in_background=true)` + a "run docs/agents/<agent>/flow/main.md, board row is <id>, look it up" prompt) works unmodified for that allowlist. **The identical generic spawn aimed at agent-father would silently fall through to `main.md`'s own "Default when unclear: keep.md" branch** — no error, no row touched, a false-negative dispatch that looks like it ran. This is a SECOND, independent reason (on top of the ratified blast-radius exclusion, `devteam-eligibility.jq:512-514`) that simply adding `agent-father` to the DRS allowlist is the wrong fix, not merely the riskier one — it would not even work mechanically. `ops`/`ops-mainserver-fetch`/`ops-vps-fetch` do NOT share this defect: `ops/flow/main.md`'s own `## Input` is "System alert, pipeline health check, or BUG channel report" (free text, generic — the exact shape the existing PO-BATCH mechanism already feeds). `ops-mainserver-fetch`/`ops-vps-fetch` need "a signal file OR a direct request naming a source URL" — also constructible from a board row's own fields, unlike agent-father's kebab-case-target contract. `code-janitor`'s native input is its own diff-scan trigger, not a row-consuming contract either, but there is exactly 1 such row (§3, out of scope by size).

**Conclusion:** the fix shape is NOT symmetric across the 43 rows. Reusing the SAME generic "spawn with row context" pattern for both classes would work for ops/* (already true — §3) and would silently no-op for agent-father (§1.3) even setting aside blast-radius. Two mechanisms, not one.

---

## 2. Component A — agent-father's own board-drain sub-flow (the 34-row, 79% majority)

### 2.1 Why owned by agent-father, not by DRS/PO-sweep

The row→(`agent_name`, `change_description`) translation this class needs is exactly the **C-1 input contract** `main.md` line 24 already defines and enforces for the structurally identical `improvement_approved_md` signal path (extract `## target_agent`/`## target_files`, never regex-mine free prose). That contract already lives inside agent-father's own `main.md` — duplicating it inside a DRS/PO-sweep call site (a different agent's flow file) would violate "extend, never duplicate" and would silently rot the moment agent-father's own contract changes, since the duplicate has no reason to be kept in sync. The translation belongs with its one existing owner.

### 2.2 New predicate: `effective_files` (missing from the shared library — confirmed by grep, not assumed)

Spot-checked 5 live stranded rows against their `files[]`: 2 of 5 carry `files: []` (empty — `detail_ref`'d elsewhere or a genuine mint-time gap), 1 spans an agent-father-owned file **and** two scripts/CI files (`FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER`), 1 carries a `scripts/git-hooks/pre-commit` file inside an otherwise-`.claude/skills/`-scoped row (`CLEAN-NOTEBOOK-AC2A-CYCLE-BOUNDARY-DEFINITION`). `scripts/lib/devteam-eligibility.jq` has `effective_owner`/`effective_next_agent`/`effective_depends_on` (detail-first, board-fallback) but **no `effective_files`** — add it, same convention, same file (generically useful beyond this task, not agent-father-specific — home is the shared library, not a private copy):
```jq
def effective_files($detail_items):
  (if (.id != null) then $detail_items[.id].files else null end) as $df
  | if ($df != null) and (($df | type) == "array") and (($df | length) > 0) then $df
    else (.files // []) end;
```

### 2.3 New file: `scripts/lib/agent-father-board-drain-eligibility.jq`

`include "scripts/lib/devteam-eligibility";` (same convention as `po-manual-dispatch-eligibility.jq` — compose, never hand-copy). Candidate set = `.task_board.backlog[]`/`.task_board.todo[]` rows, `status IN (BACKLOG, TODO)`, `effective_next_agent($detail_items) == "agent-father"`, `deps_satisfied`, `is_epic_wrapper` false, `is_detail_deferred` false, `has_unbacked_sequencing_prose` false — the SAME conjunct set `is_design_router_candidate` already uses minus the allowlist clause (reuse the shape, not the def, since this candidate set is a single fixed `next_agent` value, not an allowlist lookup).

Two-tier classifier (mirrors `sweep-fixes.md`'s own "auto-fix mechanical/cosmetic only, escalate everything requiring understanding of scope" discipline — same agent, same established risk posture, not a new invention):

```jq
def classify_board_drain_row($detail_items):
  (effective_files($detail_items)) as $files
  | (["docs/agents/", ".claude/agents/", ".claude/skills/", "docs/agent-memory/"]) as $owned_prefixes
  | (["docs/agents/dev-team/", "docs/agents/po/flow/main.md", "docs/agents/agent-father/",
      ".claude/skills/dispatch/", "docs/AGENT_CREATION_GUIDE.md"]) as $deny_prefixes
  | ( ($files | length) > 0
      and (effective_supervised($detail_items) != true)
      and ((.size // "") | test("^(XS|S)$"))
      and (($files | all(. as $f | $owned_prefixes | any($f | startswith(.)))))
      and (($files | any(. as $f | $deny_prefixes | any($f | startswith(.))) ) | not)
    ) as $safe_auto
  | if $safe_auto then "SAFE_AUTO" else "NEEDS_RATIFY" end;
```

**Explicit safety rules surfaced (architect risk-flag, per role charter):**
- Empty/unresolvable `files[]` → conservative default `NEEDS_RATIFY` (cannot verify scope safety — never assume safe on missing data, same posture as `deps_satisfied`'s own "MISSING = unsatisfied" convention elsewhere in this library).
- **Never SAFE_AUTO on `docs/agents/agent-father/**` itself** — agent-father must never unattended-edit its own definition/flows. This is the one rule with no configurable override.
- **Never SAFE_AUTO on dispatch-loop-critical files** (`dev-team/flow/main.md`, `po/flow/main.md`, `dispatch/SKILL.md`) — a mechanical/cosmetic classifier has no way to assess fleet-wide dispatch-logic risk; route to human review unconditionally.
- `supervised:true` rows are excluded from SAFE_AUTO by construction (matches this codebase's standing "supervised requires a human gate" ruling, `devteam-eligibility.jq`'s own DRS-allowlist header) regardless of size/files.

Live spot-check against 5 real rows (§2.2) confirms the classifier lands where a human reviewer would: the scripts/CI-spanning row and the pre-commit-hook row both correctly fall to `NEEDS_RATIFY` (multi-owner file spans), the `supervised:true` row falls to `NEEDS_RATIFY` regardless of size, `TE-T03` (SPRINT-M, empty files) falls to `NEEDS_RATIFY`.

### 2.4 New sub-flow: `docs/agents/agent-father/flow/board-drain.md`

Invoked as a new step inside `keep.md` (after Step 5b, unconditional — like Step 5b, NOT gated by the CADRAT-3 3-commit pre-check, since the board queue's staleness is independent of `.claude/agents/*`/`docs/agents/*/flow/*` commit activity):

- **Step D1** — compute candidates (§2.3), `sort_by([priority_rank, idx])`, cap at **N_SAFE=8** SAFE_AUTO + **N_RATIFY=3** NEEDS_RATIFY per cycle (bounded — this agent carries "fleet-wide blast radius" per its own ratified exclusion; an uncapped sweep is exactly the risk that exclusion exists to prevent, even with the classifier in place).
- **Step D2 (SAFE_AUTO)** — for each: derive `agent_name` from the row's own `files[]` common path prefix (`docs/agents/<agent_name>/...` or `.claude/agents/<agent_name>.md`); derive `change_description` from `title` + `detail`/`desc` verbatim (same "extract structured fields, never regex-mine prose for the target" discipline as C-1 — the TARGET here is `files[]`-derived, not prose-derived, prose only supplies the description). Dispatch the full `edit.md` (prepare + apply, both phases — this tier is pre-vetted safe by construction). On clean completion: stamp the row's own board-drain fields (`board_drain_claimed_at`, `board_drain_claimed_by: "agent-father (board-drain)"`, `board_drain_class: "SAFE_AUTO"`) and flip `BACKLOG/TODO → REVIEW`, `next_agent: "po"` (a human still signs off before it's DONE — board-drain auto-*applies*, it never auto-*closes*) via `orch-apply.sh` — the ONE narrow use of the §1.2 carve-out, restricted to ONLY the rows this exact cycle processed, no other field, no other row.
- **Step D3 (NEEDS_RATIFY)** — for each: dispatch `edit-prepare.md` ONLY (produces an EDIT PLAN, zero writes — the "plan-only/spec-first" envelope AC1 names explicitly). Write the plan into `docs/improvement-proposals/board-drain-<id>.md`, reusing the **already-shipped** `improvement_approved_md` proposal-doc shape/status-lifecycle verbatim (`## target_agent`, `## target_files`, `## Proposed Change` = the EDIT PLAN table, `status: DRAFT`) — this is a NEW *producer* into an artifact family that already has a working *consumer* (`main.md` line 24's `signal type=improvement_approved_md` route: PO approves → `status=APPROVED` → agent-father's own dispatch table runs `edit.md` for real, `status=IMPLEMENTING` → `DONE` after re-verification). Zero new approval machinery. Stamp the board row (`board_drain_class: "NEEDS_RATIFY"`, `board_drain_proposal_ref: <path>`) but do **not** lane-move it — it stays in `backlog[]`, now carrying a pointer a human can act on, visible to PO's normal triage AND to the new candidate class in §3.2.
- **Idempotency:** a row already carrying `board_drain_claimed_at` (regardless of class) is excluded from candidates next cycle — same staleness-window discipline `manual-dispatch-sweep.md`'s `flag_reentrant` already established, reused by convention (not by include — different lane, same idea) with the same 4h-class re-admission window so a row whose SAFE_AUTO apply crashed mid-flight isn't stranded forever.

### 2.5 `init.md` change (governance, narrow, auditable)

```diff
   commit_zone:
-    allowed: ["docs/agents/", "docs/agent-memory/", ".claude/skills/", ".claude/agents/"]
+    allowed: ["docs/agents/", "docs/agent-memory/", ".claude/skills/", ".claude/agents/",
+              "docs/improvement-proposals/"]
     excluded: ["docs/data/orch/orch-state.json", "apps/", "docs/data/system-map.json"]
     note: "FU-AGENT-FATHER-ORCH-SCOPE: orch-state.json is router-owned — NEVER in agent-father
            commits EXCEPT (1) the pre-existing one signal-queue DONE-mark per task dispatch, and
            (2) board-drain.md (FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION)
            MAY call orch-apply.sh to flip ONLY the status/lane + board_drain_* fields of rows it
            itself drained THIS cycle — never any other row, never any other field."
```
(`docs/improvement-proposals/` was already an implicit write target via the pre-existing `improvement_approved_md` status-lifecycle update in `main.md` C-2 — making it explicit in `commit_zone.allowed` closes a governance-doc/actual-behavior gap that predates this task, not a new capability.)

### 2.6 Throughput arithmetic (AC3 — "driven to 0 or a ratified, justified residual")

34 agent-father rows today, daily cron (`23 14 * * *`), cap 8 SAFE_AUTO + 3 NEEDS_RATIFY/cycle = 11 rows touched/cycle → full first pass (every row either auto-applied+committed or proposal-minted) in **~3-4 daily cycles (~3-4 days)**. SAFE_AUTO subset lands (real commits, `review[]`, PO sign-off pending) within that same window. NEEDS_RATIFY subset then depends on PO's own review pace — not zero, but now a small, PO-paced, *mechanically surfaced* residual (the exact "ratified, justified residual" AC3 explicitly allows), not an invisible 34-row backlog nobody is watching. No P0 in this class today (§0) — no urgency argument for a faster (riskier, less-vetted) cadence.

---

## 3. Component B — PO manual-dispatch-sweep widen (the 9-row ops-class remainder)

### 3.1 Why NOT folded into Component A

`ops`/`ops-mainserver-fetch`/`ops-vps-fetch` were excluded from DRS for a *different* reason than agent-father — repeated live-infra-mutation incidents (`devteam-eligibility.jq:514-518`, 3 named feedback docs), not a translation-contract gap. Their `main.md` flows already accept generic task-shaped input (§1.3) — the missing piece is purely the **human gate**, which `docs/agents/po/flow/manual-dispatch-sweep.md` (already shipped, already proven live — "the exact pipe that dispatched THIS OWN fix") already IS. This is AC1's second option verbatim: "an explicit ratified policy that these rows require PO BATCH, in which case PO triage gets a MECHANICAL zero-picker sweep step (priority-ordered, top-N per tick)" — the sweep already exists; it needs widening from 1→N, not replacing.

### 3.2 Changes to `manual-dispatch-sweep.md` (Step 1/2, minimal diff)

- **Step 1 candidate computation:** add an explicit `select(. | effective_next_agent($detail_items) != "agent-father")` conjunct to the existing `DRS-STRANDED-OFF-ALLOWLIST` candidate block. This does **not** touch `is_drs_stranded_off_allowlist` itself (`scripts/lib/po-manual-dispatch-eligibility.jq`) — that shared predicate keeps meaning "off the DRS allowlist" unmodified, still correctly used unchanged by `bounded1-supervised-lane-report.sh`'s own reporting (§4 needs to keep SEEING agent-father rows in its count until board-drain actually clears them). The exclusion is a narrower **call-site** filter specific to this sweep, now that agent-father has its own dedicated mechanism — same "disjoint by construction" principle this file already documents for `is_backlog_xor_gap` vs `is_drs_stranded_off_allowlist`.
- **New 4th candidate class, same file, same Step 1 block:** `AGENT-FATHER-PROPOSAL-PENDING` — rows carrying `board_drain_class == "NEEDS_RATIFY"` with a `board_drain_proposal_ref` whose target `docs/improvement-proposals/*.md` still has `status: DRAFT` (component A's own output, §2.4 Step D3). Same shape as the other 3 classes in this file's existing Step 1 (`{id, priority, rank, idx, class, lane, next_agent, reflag}`), same `flag_reentrant` staleness guard.
- **Step 2 cap:** raise from exactly 1 row/tick to **1 generic (existing behavior, unchanged for BACKLOG-XOR-GAP/READY-XOR) + up to N_OPS=3 additional from the ops-class subset of DRS-STRANDED-OFF-ALLOWLIST + AGENT-FATHER-PROPOSAL-PENDING combined**, priority-ordered. Step 3's fold-into-BATCH is already written as "append this entry... an ADDITIONAL input source" (line 109) — extending it to a small loop over up to 4 entries instead of 1 is additive, not a redesign.
- For an `AGENT-FATHER-PROPOSAL-PENDING` row PO decides to fold into BATCH: PO's own review IS the ratification — set the proposal `status: APPROVED` (not the generic BATCH entry shape §3 of this file's existing Step 3 uses) so it flows through the pre-existing `improvement_approved_md` consumer path in agent-father's `main.md` on its next cron tick, per its own existing C-1/C-2 lifecycle.

### 3.3 Throughput arithmetic

9 ops-class rows today. Manual-dispatch-sweep runs every PO tick ("a handful of ticks per day" — the row's own words, self-verified against this same mechanism's live dispatch of the immediately-preceding task in this family). At N_OPS=3/tick, 3 ticks (well under 1 day) clears the current 9. AGENT-FATHER-PROPOSAL-PENDING volume tracks Component A's own NEEDS_RATIFY output (§2.6, ≤3/day) — comfortably inside the same per-tick budget.

---

## 4. Regression instrument (AC2)

Extend the ALREADY-EXISTING `scripts/audits/bounded1-supervised-lane-report.sh` DRS-STRANDED-OFF-ALLOWLIST section (today: informational-only, never gates exit code) with a ratified ceiling, instead of writing a new script that would re-derive the same count a second way:

```bash
STRANDED_COUNT=<already-computed count, this section's own existing tally line>
WARN_CEILING=15
FAIL_CEILING=25
if (( STRANDED_COUNT > FAIL_CEILING )); then
  echo "[bounded1-supervised-lane-report] FAIL: DRS-STRANDED-OFF-ALLOWLIST=${STRANDED_COUNT} > ${FAIL_CEILING} — board-drain/manual-dispatch-sweep have stopped draining, investigate" >&2
  exit 1
elif (( STRANDED_COUNT > WARN_CEILING )); then
  echo "[bounded1-supervised-lane-report] WARN: DRS-STRANDED-OFF-ALLOWLIST=${STRANDED_COUNT} > ${WARN_CEILING} (ratified residual ceiling)" >&2
fi
```
**Ceiling rationale (data-driven, retunable, not asserted permanent — same convention this repo's other write-gate ceilings use):** today's baseline is 43. §2.6/§3.3 project a residual of roughly "a few days' worth of NEEDS_RATIFY proposals awaiting PO + a few days' worth of ops-class rows between ticks" once both mechanisms are live — comfortably under 15 in steady state. FAIL=25 is the "something broke again" tripwire (e.g. board-drain cron stops firing, or mint rate outpaces drain again — the exact original defect class, now with an automated regrowth alarm instead of relying on the next PO triage cycle to notice by hand).

**Second instrument (classifier correctness, SYNTHETIC-only, no live writes — mirrors this file's own sibling `*-verify.sh` pattern):** new `scripts/audits/agent-father-board-drain-classify-verify.sh` — positive/negative controls for every `classify_board_drain_row` branch: XS/S + owned-only files + non-supervised → SAFE_AUTO; any dev-team/po/agent-father/dispatch-skill file present → NEEDS_RATIFY regardless of size; `supervised:true` → NEEDS_RATIFY regardless of files; empty `files[]` → NEEDS_RATIFY; size M+ → NEEDS_RATIFY. Never touches the live file.

---

## 5. Non-goals / explicit exclusions

- **Not widening the DRS allowlist itself.** Rejected twice over (blast radius, ratified 2026-07-30; mechanically broken for agent-father specifically, §1.3) — Component A is a *parallel* mechanism, never a DRS allowlist edit.
- **Not touching BACKLOG-XOR-GAP/READY-XOR classes' existing 1-row/tick cap.** Out of this task's measured scope (a different, already-fixed defect, `FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER`); §3.2's widen is additive and scoped only to the two classes this task owns.
- **Not building a generic "any next_agent" board-drain framework.** `code-janitor`'s single stranded row and any *future* off-allowlist agent identity are explicitly out of scope — solving for the two classes that are 100% of today's live 43 rows, not a speculative N-agent generalization with no second data point yet (same "unfalsifiable by construction" reasoning the DRS allowlist ratification already used to exclude `system-auditor`).
- **Not auto-closing (DONE) any SAFE_AUTO row.** Board-drain applies and moves to `review[]` for PO/QA sign-off — it never marks anything DONE unattended, regardless of classifier confidence.

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| SAFE_AUTO classifier misclassifies a genuinely risky row as safe | MED | Narrow, allowlist-shaped (not denylist-shaped) file-prefix gate + explicit self-edit/dispatch-critical-file deny-list + size cap + empty-files conservative-default — §4's SYNTHETIC verifier is a merge-blocking regression gate on the classifier, not just documentation |
| Component A's `orch-apply.sh` carve-out scope-creeps beyond "rows this cycle drained" | LOW | `board_drain_claimed_at` timestamp check + explicit init.md note naming the exact restriction; same auditable-narrow-carve-out shape as the pre-existing signal-queue exception |
| Component B's Step 2 widen (1→4) overwhelms dev-team's downstream WIP budget | LOW | BATCH already flows through dev-team's existing Step 3 direct-execute path, which has its own WIP≤2 gating independent of how many entries BATCH carries in one tick — unchanged by this widen |
| Two mechanisms (A + B) both touching `board_drain_*`/`po_manual_dispatch_*` fields on the SAME row simultaneously | LOW | Disjoint by construction: §3.2's explicit `next_agent != "agent-father"` filter keeps B out of A's rows; A's NEEDS_RATIFY rows only enter B's 4th class via A's own `board_drain_class`/`board_drain_proposal_ref` stamp, which B reads but never races to write |
| §0's live count (43) already differs from the mint's 44 by normal churn | LOW | Explicitly re-measured this cycle rather than trusted from either prior note — same discipline this repo's other recent architect briefs already establish for this row family |

## 7. Task decomposition

| step | files | AC |
|---|---|---|
| 1 | `scripts/lib/devteam-eligibility.jq` (+`effective_files`) | New predicate resolves detail-first/board-fallback identically to existing `effective_owner` shape; unit-testable against the 5 live spot-check rows in §2.2 |
| 2 | new `scripts/lib/agent-father-board-drain-eligibility.jq` | `include`s devteam-eligibility.jq only, zero hand-copied predicate logic (AC4); `classify_board_drain_row` matches §2.3's 5 live spot-check verdicts |
| 3 | new `docs/agents/agent-father/flow/board-drain.md`; `docs/agents/agent-father/flow/keep.md` (new unconditional step) | Wired into keep.md's existing daily cron path; caps enforced (N_SAFE=8, N_RATIFY=3); SAFE_AUTO path runs edit.md prepare+apply then lane-moves to review[]; NEEDS_RATIFY path runs edit-prepare.md ONLY + mints a `docs/improvement-proposals/` DRAFT, no live write |
| 4 | `docs/agents/agent-father/init.md` (commit_zone) | Matches §2.5 diff exactly — scope of the new carve-out is auditable from the note text alone |
| 5 | `docs/agents/po/flow/manual-dispatch-sweep.md`; `scripts/lib/po-manual-dispatch-eligibility.jq` (+`is_agent_father_proposal_pending` or equivalent, additive only — `is_drs_stranded_off_allowlist` itself unchanged) | 4th candidate class present in Step 1 output; ops-class rows no longer wait behind a 1-row/tick generic cap; agent-father rows absent from this sweep's own candidate list once Component A ships |
| 6 | `scripts/audits/bounded1-supervised-lane-report.sh` (DRS-STRANDED-OFF-ALLOWLIST section) | WARN>15 / FAIL>25 gate wired per §4; exit code goes red on a synthetic ceiling-breach fixture, green on live data post-ship |
| 7 | new `scripts/audits/agent-father-board-drain-classify-verify.sh` | All 5 branches in §4's classifier list pass; zero live-file I/O |
| 8 | `docs/policies/dev-standards.md` § Script Persistence | Pointer entries for steps 2 and 7's new scripts (CLAUDE.md "Reusable Scripts" convention) |
| 9 (acceptance, cannot close AC3 without this) | live measurement, no code | Re-run `scripts/audits/bounded1-supervised-lane-report.sh` ~4-5 days after steps 1-8 ship; DRS-STRANDED-OFF-ALLOWLIST count must be ≤ WARN_CEILING (15) or carry an explicit PO-ratified justification for a higher residual — **do not mark this row DONE on step 1-8 code-complete alone; AC3 is a live-count assertion, not a code-review checkbox** |

Files list is implementer scope — architect does not write code (`plan_only:true`).

---

## RETURN
DONE: Technical design complete — two disjoint mechanisms (agent-father-owned board-drain sub-flow with a two-tier SAFE_AUTO/NEEDS_RATIFY safety envelope for the 79% agent-father concentration; PO manual-dispatch-sweep widen 1→N for the ops-class remainder), both reusing existing, already-shipped machinery (edit.md's prepare/apply split, the improvement_approved_md proposal lifecycle, manual-dispatch-sweep.md's candidate-class/BATCH-fold pattern, bounded1-supervised-lane-report.sh's own reporting) rather than inventing new dispatch infrastructure.
ZONE: cross-service/ (docs/agents/agent-father/, docs/agents/po/, scripts/lib/, scripts/audits/)
NEXT: pm — multi-file, multi-agent-doc engagement (agent-father flow docs + init.md governance change + PO flow doc + 2 shared jq libraries + 1 audit script extension + 1 new regression script); standard PO→BA→Architect→PM→Developer relay per this row's own dispatch instructions, decompose into tiered developer tasks per §7's table (steps 1-2 → step 3 → steps 4-8 can run tiered/parallel where files are disjoint; step 9 is a post-ship acceptance check, not a dev task)
BUILD-STANDARD: not-applicable (bug-fix/refactor + one new sub-flow + two new scripts in existing zones, no new service/primitive)
HANDOFF: docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md
PIPELINE: continue
