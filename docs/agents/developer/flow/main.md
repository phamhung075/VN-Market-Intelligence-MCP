<!-- size-justification: 141L — mcp-server root developer flow; pre-code checklist, TDD loop with heartbeat, task-lock claim, doc-update+graphify protocol, implementation record template, and RETURN schema are all tightly coupled sequential steps that must be read in one pass -->
# Developer — Main Flow

**Scope:** `apps/mcp-server/` root only (TypeScript/Bun). Dev-* zone agents use [`microservice-main.md`](./microservice-main.md) for `apps/<service>/` zone work.

**Tools:** `docs/agents/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`
Signal payload may include `handoff_delta: { last_read_anchor, last_read_at }` from prior round.

## Output
Code + tests on `task/NNN-*` branch | `[Developer] Implementation Record` in handoff | PM/QA notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`
> **DECISION JOURNAL RULE:** Terminal output is STATUS-ONLY (RETURN + caveman). All reasoning → `docs/agent-memory/decisions/sprint-<id>.md` via skill `.claude/skills/decision-journal/SKILL.md`.

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 3 — one task at a time, per dependency tier; parallel tasks use `isolation: "worktree"` on each Agent call
**Receives:** `docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings` — files to read/modify/create, AC, branch name, zone
**Produces:** Code + tests on `task/NNN-*` branch | `[Developer] Implementation Record` in handoff | RETURN with `NEXT: qa`
**Hand off to:** main terminal → spawns qa with branch + handoff
**Composes with:** parallel sibling developers run simultaneously in separate worktrees per tier. NOTE: this flow targets `apps/mcp-server/` root only — dev-* zone agents (dev-stock-price, dev-pdf-extractor, etc.) use [`microservice-main.md`](./microservice-main.md).

Zone routing (main terminal picks agent, not this flow): `apps/mcp-server/` → dev-mcp-server | `apps/alert-engine/` → dev-alert-engine | etc. — see dev-team Step 3 agent routing table for full map.
Conflict check is main terminal's responsibility — disjoint files → parallel allowed; same file → sequential; shared SSOT write → sequential.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `developer`)

**Step 0c — Delta-read handoff** → skill: `.claude/skills/handoff-delta-read/SKILL.md`
```
Read handoff using delta-read skill:
  path: docs/handoffs/TASK_NNN.md
  last_read_anchor: <from signal payload handoff_delta.last_read_anchor, or null>
  last_read_at:     <from signal payload handoff_delta.last_read_at, or null>
→ store anchor_out + read_at into context (emit in RETURN block as handoff_delta for QA)
```

**Pre-code checklist**
1. Confirm task status in `docs/data/orch/orch-state.json` `.task_board` (jq `.task_board.active_sprints[].tasks[] | select(.task_id=="NNN")`)
2. Branch setup — run exactly one of:
   - Branch exists: `git checkout task/NNN-kebab-description && git status` — verify clean, on correct branch
   - Branch missing: `git checkout main && git pull origin main && git checkout -b task/NNN-kebab-description`
   - VERIFY: `git branch --show-current` must equal `task/NNN-kebab-description` before touching any file

**2b. Claim sprint-task lock** → load skill: `.claude/skills/task-lock/SKILL.md`
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + task_id,
  task_kind:   "sprint-task",
  owner_agent: "developer",
  ttl_seconds: 3600,
  payload:     '{"task_title":"' + task_title + '","branch":"' + branch_name + '"}'
})
if not result.claimed:
  → Apply migration check per `.claude/skills/task-lock/SKILL.md` § On claim-fail
```

3. Read `docs/handoffs/TASK_NNN.md` first — use `files_to_read/modify/create` directly, skip redundant scanning
4. `depends_on` not Done → STOP, notify PM
5. Load knowledge files (fail-loud → `send_telegram(channel="bug")`, STOP)
6. **Before creating any new file** → look up canonical location in `docs/policies/docs-organization.md` table.
   Quick ref: source→`apps/mcp-server/src/` | tests→`apps/mcp-server/src/__tests__/` | reports→`reports/` | handoffs→`docs/handoffs/` | never at root.

**TDD workflow**
```
RED    → write src/__tests__/NNN-task-name.test.ts → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```
→ journal: skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from Step 0c / task_board claim>"] (after implementation approach is chosen — record WHY this option, not on terminal)
- **After each TDD loop** → heartbeat:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id })
if hb.ok == false: → stolen-lock protocol per skill § Heartbeat (commit partial, BUG telegram, EXIT)
```

**After code**
→ journal: skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from Step 0c / task_board claim>"] (if any failure adaptation or approach change occurred during TDD — WHY the adaptation)
1. `bun test src/__tests__/NNN-*.test.ts` — task tests pass
2. `bun test` — no regressions
3. `bun tsc --noEmit` — 0 errors
4. **Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
   `git add <exact own paths>` (NEVER `-A`/`.`) then `git commit -m "..."` — format per `docs/policies/commit-convention.md`
   Mandatory trailers for task commits: `Sprint:`, `Task:`, `AC:` (slash-separated, terse). Omit all three only for no-sprint commits (§ No-Sprint Rule).
   **NEVER use `git commit -am` or `git commit -a`** — `-a` greedily absorbs staged index content from other sources, violating C2 atomicity (root cause: c47 incident, SHA `8bec73d3`).
   Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → git diff --cached verify → git commit → task_release

**Doc update + graphify** (after code passes, before QA):
1. Identify related docs touched by this task — check:
   - `docs/analysis-briefs/` for any ticker/sector mentioned in the task
   - `docs/handoffs/` — update the current handoff only
   - `docs/{policies,protocols,standards,references}/` — update any knowledge file whose domain was changed (e.g. mcp-tools.md if MCP tool added, cron-jobs.md if scheduler changed)
   - `docs/WORK.md` — append a one-liner summary of what changed
2. Edit each found doc to reflect the new behaviour/API/schema — keep changes minimal and factual
3. Run graphify incremental update on changed docs:
   ```
   /graphify docs --update --no-viz
   ```
   This rebuilds only the changed nodes in `graphify-out/graph.json` — do NOT run full `/graphify` (too slow).
4. Skip this step entirely if: no docs are impacted (pure test refactor, fixture-only change)

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **tsc status:** clean ✓
- **Full suite:** N pass / 0 fail ✓
- **Docs updated:** [path — what changed] | NONE if no docs impacted
- **Graphify:** updated ✓ | skipped (no docs impacted)
```

**Lock handoff to QA** — same session, no release needed; QA will heartbeat + release.

**Notebook write** (before QA) → skill: `.claude/skills/notebook-write/SKILL.md` (section-overwrite — append new c<NNN> section; skill handles prune + blank-state init).

**Commit notebook** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/developer.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/developer.md
git commit -m "chore(memory/developer): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md` (chains session-log + notebook-write + doc-self-heal)

**Update `docs/data/orch/orch-state.json` `.task_board`**: task status IN_PROGRESS → REVIEW (atomic write per §2.3) → return:
```
## RETURN
DONE: Implementation complete — CHANGED=[src/foo.ts:40-55, src/__tests__/NNN.test.ts], NEW_PASS=23, tsc clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
HANDOFF_DELTA: { "last_read_anchor": "<anchor_out>", "last_read_at": "<read_at>" }
PIPELINE: continue
```
