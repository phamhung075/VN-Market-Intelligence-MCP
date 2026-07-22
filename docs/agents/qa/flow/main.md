<!-- size-justification: 227L — atomic QA gate flow with JUMP-TO dispatch + BCTC eval hard-gate + mock-production guard (pipeline / approved / changes-requested / architect-review / clean / emergency); TDD/DDD/security/eval/mock-guard checklist steps are tightly sequential and cannot decompose without losing gate ordering; mandatory decision-journal per-task step at verdict routing. +11L: WF-1 error-boundary STOP-RELEASE block (AC-WF1-3). +4L: WF-3 INV-GATEWAY-1 annotations. +1L: FIX-QA-NOTEBOOK-WRITE-SELFCAP-200L APPEND class annotation. UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK 2026-07-22: +42L — Direct-Commit Verify entry point (verify-committed/-approved/-changes), the hard qa-side prerequisite for dev-team's Review-Lane QA-Drain (every one of its 32 live source rows has branch:null, incompatible with the `pipeline` JUMP-TO's git-checkout precondition); additive only, `pipeline`/`approved`/`changes-requested` unchanged. -->
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
> // INV-GATEWAY-1 (2026-06-07): task_release is the dispatcher session's sole responsibility.
> // This best-effort call may silently fail (no MCP gateway binding in specialist sub-session).
> // The dispatcher finally-block and TTL expiry (3600s) are the authoritative release paths.
> call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id })
> // ok=false acceptable — best-effort. Note: CHANGES_REQUESTED does NOT release (fixer holds lock — intentional).
> now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
> jq --arg s "idle" --arg t "$now" --arg u "qa" \
>   '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
>   "docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
> ```
> Then continue with the standard error-boundary exit (`send_telegram(channel="bug", message="[qa] tool failure — EXIT")` + drop signal + EXIT).
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
| dev-team Review-Lane QA-Drain spawn (`mode=verify-committed` in spawn context) | `verify-committed` |
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

**Heartbeat sprint-task lock (dispatcher-side)**
```
// INV-GATEWAY-1 (2026-06-07): task_heartbeat/task_claim/task_release MCP calls are the dispatcher
// session's sole responsibility. QA specialist does NOT call task_heartbeat or task_claim here.
// The dispatcher holds the outer lock; QA proceeds without a direct lock claim.
// Lock-stolen detection: if the dispatcher's heartbeat fails, the dispatcher handles re-claim.
// See docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md (INV-GATEWAY-1).
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

<!-- jump:verify-committed -->
## Direct-Commit Verify (dev-team Review-Lane QA-Drain rows, `branch:null`)

UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22) — the qa-side HARD PREREQUISITE for `docs/agents/dev-team/flow/main.md` § Review-Lane QA-Drain (folds `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`). Every row that drain claims carries `branch: null` — committed straight to `main` via the FIX direct-execute path, never on a `task/NNN-*` branch, often with no `docs/handoffs/TASK_NNN.md` at all (grep-verified 2026-07-21: all 32 live `review[]` rows). The normal `pipeline` JUMP-TO's first line (`git checkout task/NNN-kebab-description`) cannot run against these — using it here guarantee-fails the spawn. Additive entry point only; `pipeline`/`approved`/`changes-requested` are unchanged.

**Input:** the row's own `task_board.qa[]` entry — self-contained (`id`, `commit`, `files[]`, `review_note`/`status_note`, `owner`): `jq --arg id "<task_id>" '.task_board.qa[] | select(.id==$id)' docs/data/orch/orch-state.json`. No handoff-file requirement.
**Fallback (row predates the drain, missing `commit`/`files[]`/`owner`):** derive `commit` via `git log --oneline --all -- <files named in status_note prose or detail_ref's `files[]`>`, cross-check the candidate commit's date against the row's `completed_at`; use `completed_by` as `owner` if `.owner` absent.

**Verify (no checkout — QA already runs on `main`):**
```bash
# 1. Refuse prose-only trust (feedback_router_verify_raw_not_badges) — require a concrete commit ref:
[ -n "$COMMIT" ] && [ "$COMMIT" != "pending" ] && [ "$COMMIT" != "null" ] || ISSUE="no commit reference to verify"

# 2. Commit must be real and on main's ancestry:
git merge-base --is-ancestor "$COMMIT" main || ISSUE="$COMMIT not found in main ancestry"

# 3. Commit must touch the row's own claimed files (if `.files[]` present):
git show --stat "$COMMIT" | grep -qF "<each files[] entry>"   # each must appear, else ISSUE

# 4. Re-run REAL verification — never trust the row's own review_note prose alone:
bun test <touched test file(s) inferred from files[], else targeted zone suite>
bun tsc --noEmit
bash scripts/audits/mock-guard.sh --files "<touched production (non-test) files, if any>"
```
No `ISSUE` set AND all checks pass → JUMP TO `vc-approved`. Any `ISSUE` or failing check → JUMP TO `vc-changes`.

→ journal (MANDATORY): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<id>"]

<!-- jump:vc-approved -->
**verify-committed-approved:** append `[QA] Review Record (direct-commit verify)` — since there is no handoff file, append to the row's own `status_note` field instead of `docs/handoffs/TASK_NNN.md`. Flip `status: QA -> DONE_VERIFIED`, move `.task_board.qa[] -> .task_board.done_verified[]`, IN THE SAME `orch-apply.sh` write (status-flip = lane-move MUST, `execute-tier.md` § MUST — CANONICAL:SSOT-STATUSFLIP-LANEMOVE). No merge/push/branch-delete step — the work is already on `main`.
```
## RETURN
DONE: Task <id> verified against main HEAD commit <commit> — no branch/merge needed (already on main)
NEXT: pm | mark done, unblock downstream
PIPELINE: continue
```

<!-- jump:vc-changes -->
**verify-committed-changes:** append the failing check(s)/`ISSUE` to the row's `status_note` (file:line where applicable). Move `.task_board.qa[] -> .task_board.review[]` (back to review, status `QA -> REVIEW`), stamp `redispatch_count += 1` (mirrors the dead-worker resume convention already live on board rows, e.g. `UC-SDF-P4`'s `redispatch_count`/`resume_note`). Route to the row's own `owner` field, NOT `fixer` — there is no task branch for a fixer to work on; the owner must apply a NEW direct commit.
```
## RETURN
DONE: Direct-commit verify failed for <id> — see status_note for issues
NEXT: <row's own .owner field, e.g. developer/dev-<zone>/ba> | apply a new direct commit fixing the listed issues
PIPELINE: continue
```

## Approval

<!-- jump:approved -->
**DJ-GATE-1** (before DONE flip): verify `docs/agent-memory/decisions/sprint-<SPRINT_ID>-*.md` contains `task-id:** <TASK_ID>`; if absent → status stays REVIEW, `status_note: "journal-missing"`, `send_telegram(channel="work", message="[DJ-GATE-1] journal absent for <TASK_ID> — held REVIEW")`. Full gate: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.

**APPROVED**: append `[QA] Review Record` → release sprint-task lock → merge + push + clean → return.
Merge commit subject must follow `docs/policies/commit-convention.md` — use `chore` or `feat` type, `<sprint>/<area>` scope; `Task:` trailer optional for merge commits bundling multiple tasks. Merge commits are AC-trailer exempt (AC lives on the feat/fix commit).
If QA writes a non-merge commit that carries `Task:` trailer, it must also carry `AC:` trailer.
QA non-merge commits with sprint scope (digit in scope) MUST carry `Task:` trailer.

**Release sprint-task lock** (dispatcher responsibility — see INV-GATEWAY-1):
```
// INV-GATEWAY-1 (2026-06-07): task_release is the dispatcher session's sole responsibility.
// This best-effort call may silently fail (no MCP gateway binding in specialist sub-session).
// The dispatcher finally-block and TTL expiry (3600s) are the authoritative release paths.
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
  Notebook-write class: **APPEND** (AC-6) — compose settled ≤200L body in memory (AC-3 drop-oldest loop if > 200L) before single Write. SSOT: `.claude/skills/notebook-write/SKILL.md`.

**Skills available to this agent (lazy-load — load only when the task requires it):**
- Browser/UI automation for E2E verification → skill: `.claude/skills/webapp-testing/SKILL.md` (trigger: QA task requires Playwright-based UI testing or verifying a web artifact beyond unit tests)

**Commit notebook** (direct — INV-GATEWAY-1):
```bash
# INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
# responsibility; inner specialist agents commit directly (explicit paths), no mutex skill call.
git add docs/agent-memory/notebooks/qa.md
git commit -m "chore(memory/qa): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

<!-- jump:emergency -->
## Emergency
Tests fail on main → revert breaking commit → `send_telegram(channel="bug", message="[qa] EMERGENCY: tests red on main — breaking commit reverted, merges blocked")` → open Backlog task → no merges until green
