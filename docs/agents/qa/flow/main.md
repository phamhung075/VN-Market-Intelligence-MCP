<!-- size-justification: 216L — atomic QA gate flow with JUMP-TO dispatch + BCTC eval hard-gate + mock-production guard (pipeline / approved / changes-requested / architect-review / clean / emergency); TDD/DDD/security/eval/mock-guard checklist steps are tightly sequential and cannot decompose without losing gate ordering; mandatory decision-journal per-task step at verdict routing. +11L: WF-1 error-boundary STOP-RELEASE block (AC-WF1-3). -->
# QA — Main Flow

**Tools:** `docs/agents/tools/package/qa.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`
Signal payload may include `handoff_delta: { last_read_anchor, last_read_at }` from prior round.

## Output
Task report | APPROVED merge or CHANGES_REQUESTED with exact file:line issues

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`
> **WF-1 STOP-RELEASE (AC-WF1-3):** On ANY tool failure BEFORE verdict is reached (pre-approved/changes-requested), run this block first:
> ```
> call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
> // ok=false acceptable — best-effort. Note: CHANGES_REQUESTED does NOT release (fixer holds lock — intentional).
> tmp=$(mktemp); now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
> jq --arg s "idle" --arg t "$now" --arg u "qa" \
>   '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
>   docs/data/orch/orch-state.json > "$tmp"
> [ -s "$tmp" ] && jq -e '.head' "$tmp" > /dev/null && mv "$tmp" docs/data/orch/orch-state.json
> ```
> Then continue with the standard error-boundary exit (send_telegram(bug) + drop signal + EXIT).
> **DECISION JOURNAL RULE:** Terminal output is STATUS-ONLY (RETURN + caveman). All reasoning → `docs/agent-memory/decisions/sprint-<id>.md` via skill `.claude/skills/decision-journal/SKILL.md`.

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 3 — after each developer DONE, gates merge; also Step 2 CLEAN — receives stale branch list from po triage
**Receives:** Step 3: `docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`; Step 2 CLEAN: list of branches with 0 unmerged commits or stale worktrees
**Produces:** Step 3: APPROVED (merge + push + branch delete) or CHANGES_REQUESTED (file:line issues) → RETURN with `NEXT: pm` or `NEXT: fixer`; CLEAN: deleted branches + pruned remotes → EXIT
**Hand off to:** Step 3 APPROVED → main terminal → pm marks Done, unblocks next tier; CHANGES_REQUESTED → main terminal → fixer (round < 2) or architect (round ≥ 2)
**Composes with:** developer (receives from), fixer (sends CHANGES_REQUESTED to), pm (sends APPROVED to), architect (escalates ARCHITECT_REVIEW_NEEDED to)

CLEAN workflow: `for each branch: if git log main..<branch> empty → git branch -d; if worktree → git worktree remove --force + git branch -D; if unmerged → report to WORK`.
Parallel QA: multiple tasks in same tier can be QA'd simultaneously if on different branches.

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md`

| Spawn context | JUMP TO |
|---|---|
| Normal Step-3 QA (post-dev handoff) | `pipeline` |
| Step-2 CLEAN spawn (branch cleanup) | run inline CLEAN one-liner in Role section, then JUMP TO `end` |
| Pipeline result: all green, no arch impact | `approved` |
| Pipeline result: issues found (round < 2) | `changes-requested` |
| Pipeline result: arch concern (new domain/MCP tool/cross-service) | `architect-review` |
| Tests broken on `main` | `emergency` |

After pre-checks (project-root, notebook-read, Smart-Skip), jump to the labelled section. Verdict branches at end of `pipeline` are JUMP TOs, not sequential walks.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `qa`)

**Step 0c — Delta-read handoff** → skill: `.claude/skills/handoff-delta-read/SKILL.md`
```
Read handoff using delta-read skill:
  path: docs/handoffs/TASK_NNN.md
  last_read_anchor: <from signal payload handoff_delta.last_read_anchor, or null>
  last_read_at:     <from signal payload handoff_delta.last_read_at, or null>
→ store anchor_out + read_at into context (emit in RETURN block as handoff_delta for next round)
```

## Smart-Skip
- Test-only change → skip DDD + security. Run: unit + regression + tsc.
- String literal only → skip DDD + security. Run: full suite + tsc.
- Never skip `bun test` + `bun tsc --noEmit`.
- Never skip `mock-guard` when modified files include any production source (non-test, non-fixture).

<!-- jump:pipeline -->
## Pipeline

### BCTC Eval Gate (run after test-run, before verdict)

For any sprint task that touches a BCTC report, fetch eval for each `report_id` in task scope:
```
GET /api/bctc-eval/{report_id}   ← exact path; check schema_version field before parsing
```
Status semantics (consistent across all agent consumers):
- `overall_status = "red"` → hard fail: qa MUST refuse DONE. Write in handoff:
  `BLOCKED: stage N red — <gate_failures summary from gate_failures_json>`
- `overall_status = "yellow"` → soft warning: qa logs in handoff:
  `CAUTION: yellow eval — <stage names that are yellow>`
  Does NOT block merge.
- `overall_status = "green"` → pass; proceed to verdict.

If endpoint returns 404 (eval not yet computed) → log `BCTC-EVAL: not yet computed for {report_id}` in handoff, do NOT block (eval substrate may not be deployed yet).
If endpoint returns 409 → same as 404 treatment.

**Heartbeat sprint-task lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
if hb.ok == false:
  // Lock stolen — developer's session terminated before QA ran in this session
  send_telegram(channel="bug", "[qa] lock stolen on " + task_id + " — re-claiming for QA review")
  → call_tool(server="vn-market", tool="task_claim", arguments={ task_id: "task:" + task_id, task_kind: "sprint-task", owner_agent: "qa", ttl_seconds: 3600 }) — proceed even if claim fails (QA is non-mutating until merge)
```

```bash
git checkout task/NNN-kebab-description
bun test src/__tests__/NNN-*.test.ts
bun test
bun tsc --noEmit
grep -r "from.*infrastructure" <modified_files>  # must return NOTHING
grep -r "from.*application" <modified_files>     # must return NOTHING
grep -r "process\.env" src/                      # must return NOTHING
grep -r "password\|secret\|token" src/ | grep -v test | grep -v "//"
bash scripts/audits/mock-guard.sh --files "<space-separated modified production files>"
# Exit 1 = HARD-FAIL (fabricated data) → CHANGES_REQUESTED; Exit 2 = CAUTION → log in report, non-blocking; Exit 0 = PASS
```
Verdict routing:
- All checks pass AND no arch concern → JUMP TO `approved`
- Issues found AND round < 2 → JUMP TO `changes-requested`
- Issues found AND round ≥ 2 → JUMP TO `changes-requested` (RETURN block routes to architect)
- New domain service / MCP tool / cross-service HTTP / DDD refactor → JUMP TO `architect-review`

→ journal (MANDATORY per task — pre-verdict): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from handoff / task_board — the task number under QA review, e.g. ARCH-ORCH-F2; omit only if CLEAN branch sweep with no task context>"]
Write at minimum ONE entry per task you complete stamped with its task-id (record WHY this verdict — which checks failed/passed, why APPROVED vs CHANGES_REQUESTED vs ARCHITECT_REVIEW_NEEDED — not on terminal). Routine pass: `what-considered: "only path: all checks green"`, `why-change: "no change from plan"`.

## Task Report

Write to `reports/TASK_REPORT_NNN.md` — never `apps/mcp-server/reports/` or `docs/reports/`.

**Compact** (fix, ≤3 files):
```markdown
## Task Report NNN
changed: [file:lines, ...]
tests: N pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED | CHANGES_REQUESTED

### Issues (if CHANGES_REQUESTED)
- file.ts:42 — exact issue
```
**Full** (new tool/domain service/security): test results, DDD, security, code quality, blockers, merge commit.

## Approval

<!-- jump:approved -->
**APPROVED**: append `[QA] Review Record` → release sprint-task lock → merge + push + clean → return.
Merge commit subject must follow `docs/policies/commit-convention.md` — use `chore` or `feat` type, `<sprint>/<area>` scope; `Task:` trailer optional for merge commits bundling multiple tasks. Merge commits are AC-trailer exempt (AC lives on the feat/fix commit).
If QA writes a non-merge commit that carries `Task:` trailer, it must also carry `AC:` trailer.
QA non-merge commits with sprint scope (digit in scope) MUST carry `Task:` trailer.

**Release sprint-task lock** (last step before merge — atomic with TASKS.md status update):
```
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
// Proceed with merge regardless of ok value — release is best-effort cleanup
```
```bash
git checkout main
git merge --no-ff task/NNN-kebab-description -m "chore(<sprint>/<area>): merge task/NNN-<title>"
git push origin main
# Clean branch — handle worktrees explicitly:
worktree_path=$(git worktree list --porcelain | grep -A1 "branch refs/heads/task/NNN" | grep "worktree" | awk '{print $2}')
if [ -n "$worktree_path" ]; then
  git worktree remove --force "$worktree_path"
fi
git branch -d task/NNN-kebab-description
git push origin --delete task/NNN-kebab-description 2>/dev/null || true  # ignore if no remote
```
```
## RETURN
DONE: Task NNN merged, pushed to main, branch deleted locally + remote, all tests green
NEXT: pm | mark Task NNN done, unblock downstream, queue next developer task
HANDOFF: docs/handoffs/TASK_NNN.md
HANDOFF_DELTA: { "last_read_anchor": "<anchor_out>", "last_read_at": "<read_at>" }
PIPELINE: continue
```

<!-- jump:changes-requested -->
**CHANGES_REQUESTED**: append issues (file:line) → check fixer round count in handoff → return:
```
## RETURN
DONE: QA review complete — N issues found (see [QA] Review Record in handoff)
NEXT: fixer | apply minimum fixes to listed issues      ← round < 2
NEXT: architect | fixer ceiling hit, root-cause needed  ← round ≥ 2
HANDOFF: docs/handoffs/TASK_NNN.md
HANDOFF_DELTA: { "last_read_anchor": "<anchor_out>", "last_read_at": "<read_at>" }
PIPELINE: continue
```

<!-- jump:architect-review -->
**ARCHITECT_REVIEW_NEEDED** → return:
```
## RETURN
DONE: QA flagged architectural issue before merge
NEXT: architect | review Task NNN before merge, then re-run QA
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Commit notebook** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/qa.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/qa.md
git commit -m "chore(memory/qa): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

<!-- jump:emergency -->
## Emergency
Tests fail on main → revert breaking commit → `send_telegram(channel="bug")` → open Backlog task → no merges until green
