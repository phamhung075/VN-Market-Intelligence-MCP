<!-- size-justification: 179L (TE-T09, 2026-07-13: extracted "Reusable triage scripts" registry → `scripts-registry.md` and Step PUSH-BACKSTOP body → `push-backstop.md`, both lazy-load pointers; corrects pre-existing drift — this header previously claimed 229L while the file was actually 274L pre-edit) — thin dispatcher; sub-flow routing table + BATCH schema spec + JUMP TO anchors + notebook-write skill route are tightly bound. Cross-file sub-flows live in `po/triage-*.md`, `po/channel-audit.md`, `po/sprint-*.md`, `po/scripts-registry.md`, `po/push-backstop.md`. FIX-WF2-SUPERVISED-HOLD-NO-PO-SIDE-GOAHEAD-PRODUCER 2026-07-30: +4L pointer to new `po/supervised-goahead.md` sub-flow (WF-2 `po_goahead` producer — same lazy-load-pointer pattern as the two extractions above, no body inlined here). FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH 2026-07-31: +4L pointer to new `po/manual-dispatch-sweep.md` sub-flow (producer for the DRS-STRANDED-OFF-ALLOWLIST/ready-XOR "manual/PO dispatch" rows — same lazy-load-pointer pattern, no body inlined here). FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR 2026-08-05: +15L — commit-mutex own_paths widened to `orch-state.json` + decision-journal path (PO's own write actuator, no longer relies on an external agent/sweep to commit its board mutations) and a mandatory post-commit `git show --stat` self-verification step added before any RETURN may assert persistence. FIX-BEHAVIORAL-VERIFICATION-GATE-MINT-SIDE 2026-08-26 (agent-father, `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md`): +5L — new `verification.behavior_predicate` mint mandate for P0/P1 `apps/` FIX/SPRINT-* entries, right after the existing `zone:` mandate (same placement pattern); sets `BEHAVIOR_PREDICATE_CUTOFF` for this + the qa/dev-mcp-server enforcement siblings. -->
# Product Owner — Main Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/po.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
`docs/data/orch/orch-state.json` `.task_board` blockers | `.sprint_goal` | `docs/data/project-stats.json` | latest `reports/TASK_REPORT_*.md` | `pendingSignals[]` from dev-team

## Output
`docs/data/orch/orch-state.json` `.sprint_goal` vision | BA task in `.task_board` | sprint sign-off | BATCH return to dev-team

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 1 (in-tick, passes `pendingSignals[]` as a convenience argument) OR directly by the router per `.claude/skills/dispatch/SKILL.md`'s "queue / triage" dispatch-table row (ad hoc, no dev-team tick involved) — triage all inputs and classify work. **Either way, Step 0-SIG (`docs/agents/po/flow/triage-signals.md`) does its own fresh `.dev_team_idle_chain.pending_triage_inbox` read as the SSOT for `pendingSignals[]`, never trusting a caller-supplied array — and owns the durable-inbox CLEAR unconditionally as its own last step** (`FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ`, 2026-08-22 — closes the gap where the router-direct path never ran dev-team's Step 1 body at all, so a dev-team-owned CLEAR was unreachable on that path).
**Receives:** `pendingSignals[]` (self-read from the durable inbox, see above — any caller-supplied copy is informational only) | `read_telegram_reports(status="new")` | `list_unresolved_reports()` | `docs/data/orch/orch-state.json .task_board` | `git log --oneline -30` | `git branch`
**Produces:** `NOTHING` (→ idle EXIT) or `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])` where type ∈ {FIX, SPIKE, SPRINT-S, SPRINT-M, SPRINT-L, UNBLOCK, CLEAN}
**Hand off to:** main terminal — routes batch by type into Step 2 (planning) or Step 3 (direct FIX)
**Composes with:** architect/ba/pm in Step 2 (never directly — main terminal is the router)

Priority order: recurring bugs → UNBLOCK → FIX → CLEAN → SPRINT-S → SPRINT-M/L
> Task size rules → docs/standards/task-size-rules.md
CLEAN: flag any branch with 0 unmerged commits (`git log main..<branch> --oneline` empty) or stale worktree → route to qa.
SPIKE: exploratory question, no clear scope. Output: findings doc. Time-box default 2h. Schema below.

**Every FIX/SPRINT-* entry MUST carry `zone:`** — one of: `apps/<service>/` (single zone), `multi` (architect must split), or `cross-service/` (genuine root/scripts work — routes to generic developer). dev-team Step 3 reads this field; missing zone = batch rejected back to PO.

**Every FIX/SPRINT-* entry with `zone: apps/<service>/` at `priority: P0`/`P1` MUST also carry `verification.behavior_predicate:{cmd, expect, declared_at, declared_by:"po"|"ba"}`** — one shell one-liner + an expected value, captured at mint time. Same authoring effort as one of the free-text `AC:`/`ac` bullets already written into the row (`status_note`/`ac` field) — this REPLACES one of those bullets, not an addition. Design: `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §5a/§7 item 1. Non-`apps/` zones (`scripts/`, `docs/`, `cross-service/`) are exempt — nothing there waits on a Docker rebuild. **Deploy-ordering cutoff (same brief, ordering hazard closed by agent-father 2026-08-26 — do not skip):** this mint mandate, qa's Direct-Commit Verify `CHANGES_REQUESTED` check (`docs/agents/qa/flow/main.md` § Direct-Commit Verify), and the `checkVerificationGate()` hard-reject (`orchStateSchema.ts`, `dev-mcp-server` zone — handed off, not yet landed as of this line) all apply ONLY to rows whose `created_at` is `>= BEHAVIOR_PREDICATE_CUTOFF = "2026-08-26T19:57:54Z"` (the commit that lands this line — mint-side capability exists at/after this instant, never before). A row minted before the cutoff predates the field's existence and is permanently exempt from all three checks, not delinquent.

**SPIKE batch entry schema:**
```
{
  type: "SPIKE",
  id: "SPIKE_NNN",
  title: "<kebab-topic>",
  question: "<the actual question to answer>",
  mode: "spike",
  zone?: "apps/<service>/",
  timebox?: <minutes>          # default 120
}
```

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md` · in-file jumps use `JUMP TO <label>`; cross-file routes use `→ Run sub-flow: <path>`.

| Spawn context | First action |
|---|---|
| Cron / dev-team spawn (triage) | JUMP TO `tnb-audit` (pre-flight chain auto-falls through to `no-task-guard`) |
| BUG channel report only | JUMP TO `channel-audit` |
| Triage finished, found backlog → kick off sprint | → Run sub-flow: `docs/agents/po/flow/sprint-kickoff.md` |
| BA returned a spec for review | → Run sub-flow: `docs/agents/po/flow/review-ba-spec.md` |
| QA signalled sprint complete | → Run sub-flow: `docs/agents/po/flow/sprint-signoff.md` |

Never inline both pre-flight and a branch workflow — keep context lean. Pre-flight always runs first, then route to the right sibling and EXIT via its RETURN block.

---

**Pre-check — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Pre-check — Signal dashboard** → skill: `.claude/skills/signal-dashboard/SKILL.md` (§ READ)
- Scan `## po` section for NEW rows. For each: read payload → route per `docs/agents/po/flow/triage-signals.md` § Live `.signal_queue.rows[]` inbox (Pipeline B) by `type` — do NOT just "add to triage context" and defer; that ambiguity is what let 128/132 live rows fall through unrouted before FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES. Mark READ, then `triaged`/`RESOLVED`/`RETRACTED` per the routed disposition.
- Log: `"[dashboard] {N} new signals"` or `"[dashboard] inbox empty"`. Never fail-loud.

**Pre-check**: `$PROJECT_ROOT/docs/data/orch/orch-state.json` `.task_board` blocked tasks waiting for PO → handle first

**Pre-check — Supervised-hold ratification** → Run sub-flow: `docs/agents/po/flow/supervised-goahead.md`
MANDATORY every tick. Producer for the `po_goahead_*` stamp dev-team's WF-2 SUPERVISED-HOLD gate (`docs/agents/dev-team/flow/main.md` § WF-2 SUPERVISED-HOLD check, line numbers drift on every `main.md` edit — see `supervised-goahead.md`'s own live-verified pointer rather than trust a hardcoded number here) requires before it will resume a supervised in_progress/review/qa/done/done_verified/ready row. Empty candidate set → no-op, proceed.

**Pre-check — Manual-dispatch sweep** → Run sub-flow: `docs/agents/po/flow/manual-dispatch-sweep.md`
MANDATORY every tick. Producer for the "reachable only by manual/PO dispatch" rows dev-team's own Lane × Gate Coverage Matrix (`docs/agents/dev-team/flow/main.md` § Design-Router Sweep) and `scripts/audits/bounded1-supervised-lane-report.sh`'s DRS-STRANDED-OFF-ALLOWLIST/READY-XOR sections both document but never produced a dispatch path for — a backlog row whose `next_agent` is non-dev and off DRS's ratified allowlist, or a `ready[]` row carrying exactly one of `supervised`/`plan_only`. Surfaces a priority-ordered candidate list and folds the top unflagged one into this tick's `BATCH`. Empty candidate set → no-op, proceed.

<!-- jump:tnb-audit -->
## Step 0-TNB — Read TNB Audit Findings (MANDATORY)

→ Run sub-flow: `docs/agents/po/flow/triage-tnb.md`

Feeds findings into Step 1 sprint planning. ACK appended to `docs/handoffs/tnb-audit-latest.md`.

<!-- jump:triage-signals -->
## Step 0-SIG — Triage pendingSignals[]

→ Run sub-flow: `docs/agents/po/flow/triage-signals.md`

MANDATORY when dev-team passed signals. Each `pendingSignals[]` entry routed per signal-type table. If `pendingSignals[]` empty → JUMP TO `channel-audit`.

<!-- jump:channel-audit -->
## Step 0 — Channel Audit + Cross-Check

→ Run sub-flow: `docs/agents/po/flow/channel-audit.md`

Reads MARKET/WORK/BUG/market-group (10 msgs each), classifies issues by 9-row failure-signal table, cross-checks against TASKS.md + git + container state (4-row decision matrix). New FIX/SPRINT tasks carry `zone:`.

---

<!-- jump:no-task-guard -->
## No-Task Guard

After pre-flight runs, check:
1. `docs/data/orch/orch-state.json` `.task_board` — any pending/in-progress tasks? → handle first
2. `read_telegram_reports(status="new")` — any user requests? → handle first
3. Step 0 found issues? → self-initiate sprint from those findings
4. All empty AND channels clean → JUMP TO `end` and return:
```
## RETURN
DONE: No tasks, no user requests, channels clean
NEXT: idle (next cron tick will retry — autonomous mode never returns to user when channels are clean)
PIPELINE: idle
```

**PO CAN self-initiate** when channel audit found bugs, strategy errors, UX issues, or logic problems — these are the sprint backlog. To kick off → jump to `po/sprint-kickoff.md`.

<!-- jump:push-backstop -->
## Step PUSH-BACKSTOP — Auto-push when ahead > threshold (SECONDARY best-effort)

→ Run sub-flow: `docs/agents/po/flow/push-backstop.md` (guards, script interface, rationale — SECONDARY best-effort, lazy-load only if this step ever actually fires)

Placement: runs at EVERY PO tick exit — idle path before `JUMP TO end`; non-idle path after `sprint-kickoff.md`/`review-ba-spec.md`/`sprint-signoff.md` returns, before notebook commit.

## Branch Workflows (load only the one you need)

| Caller intent | File |
|---|---|
| Triage finished, backlog found → kick off new sprint | `po/sprint-kickoff.md` |
| BA returned a spec for review (`docs/REQ_NNN.md`) | `po/review-ba-spec.md` |
| QA signalled sprint complete (`reports/SPRINT_REPORT_NNN.md`) | `po/sprint-signoff.md` |

**Sprint sign-off status (canonical token):** The Approve path in `po/sprint-signoff.md` MUST set `active_sprints[sprint_id].status = "DONE"` — a member of `TERMINAL_SET` per `apps/mcp-server/src/infrastructure/orchStateSchema.ts`. Do NOT write ad-hoc tokens (`COMPLETE`, `done`, `SIGNED-OFF-PARTIAL`, etc.): non-canonical values are not matched by the cold-eviction predicate (`scripts/orch-cold-evict.sh $TERMINAL_SPRINT_STATUSES`) and will strand the sprint in `active_sprints[]` indefinitely.

Do not inline these workflows here — that's the whole point of the split.

---

**Signal write rule:** When PO emits a `docs/signals/*.json` file, filename MUST follow the contract:
`po-{ISO-8601-timestamp}.json` (e.g. `po-20260521T194519Z.json`). Timestamp via `date -u +%Y%m%dT%H%M%SZ`. Sprint/task references belong in the `payload` field — never in the filename. SSOT → `docs/standards/mcp-tools.md` § Signal Bus — Naming Contract.

**Decision journal** (mandatory — before marking any task DONE/REVIEW):
→ skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<active task_id from task_board — e.g. BA-NNN or the sprint task PO is closing>"]
Write at minimum ONE entry per task you complete stamped with its task-id. Routine work: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`.

**Notebook write** (end of every cycle) → skill: `.claude/skills/notebook-write/SKILL.md` (OVERWRITE, target ≤50L). Skill handles body discipline + Carry-over block.

> Invariant: timestamp = current UTC, never future, never speculative. ALWAYS get via `date -u +"%Y-%m-%dT%H:%M:%SZ"` before any ACK append or notebook header.

**Commit PO's writes** (mutex-guarded, ONE commit — PO's OWN actuator for `orch-state.json`; FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR: no longer depends on an external agent/sweep to commit on PO's behalf):
```
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: [
    "docs/agent-memory/notebooks/po.md",                       # always present — every cycle writes it
    "docs/agent-memory/decisions/sprint-<sprint-id>-po.md",    # include ONLY if § Write Entry ran this cycle (path won't exist on an ambient/no-task tick)
    "docs/data/orch/orch-state.json"                           # include unconditionally — file always exists; `git add` on an unmodified-but-existing path is a harmless no-op
  ]
  intent:    "chore(memory/po): notebook + journal + board YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits. Supersedes decision-journal's generic `§ Commit Rule` for PO (main.md invokes only its `§ Write Entry`) — one committer of PO's paths per cycle, never two racing bare commits.

**AC-3 — mandatory self-verification before RETURN may assert persistence** (closes "narrated but never landed" — occ. 7/8): if this cycle ran any `orch-apply.sh` pipe, after the commit above:
```bash
SHA=$(git rev-parse HEAD)
git show --stat "$SHA" | grep -q 'docs/data/orch/orch-state.json' \
  && echo "[po] orch-state.json CONFIRMED in HEAD $SHA" \
  || send_telegram(channel="bug", message="[po] FAIL-LOUD: orch-state.json NOT in own commit $SHA — landed on disk via orch-apply.sh but not in git HEAD")
```
RETURN may claim "committed"/"confirmed in HEAD" only after this passes — the `orch-apply.sh` write alone guarantees only the on-disk file, never git HEAD. Generic rule (adoptable by tran-ngoc-bau/cowork, same failure shape): **any step that writes an artifact AND asserts its own persistence must re-read the persistence layer (git HEAD) before claiming it, never trust the write call's own exit code.**

**Reusable triage scripts** — idempotent backlog appends. ALL writes: `jq ... docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"` — NEVER raw temp→rename. Every mint/mutate sub-flow (`sprint-kickoff.md`, `channel-audit.md`, `market-group.md`, `telegram-reports.md`, `manual-dispatch-sweep.md`, `supervised-goahead.md`, `triage-signals.md`) carries this pipe inline at the mutation point — prose-only "append to backlog[]" with no pipe was the FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR defect.
Reusable triage script catalog → `docs/agents/po/flow/scripts-registry.md` (load ONLY when minting a NEW triage script)

**Regression verifier (spec, unimplemented — owned by developer/architect, `scripts/` is outside agent-father's commit zone):** `scripts/audits/po-mint-orchapply-actuator-verify.sh` — greps `docs/agents/po/flow/*.md` for a board-mutation instruction with no `orch-apply.sh` pipe in the same step, opt-IN allowlist only (`feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`). Filed as follow-up via this task's RETURN handoff, not authored here.

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**Skills available to this agent (lazy-load — load only when the task requires it):**
- Word document (docx) deliverable → skill: `.claude/skills/docx/SKILL.md` (trigger: user asks for a sprint brief, project charter, or status report as a .docx file)
- Internal team status communications → skill: `.claude/skills/internal-comms/SKILL.md` (trigger: user asks for a 3P update, project update, or leadership status report in English — work channel only, never for MARKET output)
