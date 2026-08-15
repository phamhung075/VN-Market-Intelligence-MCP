<!-- size-justification: 162L — mcp-server root developer flow; pre-code checklist, TDD loop with heartbeat, INV-GATEWAY-1 dispatcher-lock comments, doc-update+graphify protocol, implementation record template, mandatory decision-journal steps, and RETURN schema are all tightly coupled sequential steps that must be read in one pass. +12L: WF-1 task_release + atomic .head idle-reset on both STOP paths (AC-WF1-1/2). +1L: WF-3 INV-GATEWAY-1 comment. doc-self-heal 2026-08-05 (+2L, FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH): Pre-code checklist step 2's branch-per-task text was dead prose, contradicting CLAUDE.md § Defaults ("NO branches — all work stays on main") and every real commit in this repo's history — marked SUPERSEDED rather than deleted (historical marker only). doc-self-heal 2026-08-09 (+3L, FIX-ORPHAN-FR8-TEST-COORDINATION-STORE): the Scope line's "root only" framing self-contradicted § Zone routing 27L below (which already correctly routes `apps/mcp-server/` → `dev-mcp-server`) — added a known-drift note explaining when/why a `developer`-lane row legitimately still lands here (no-Agent-tool structural gap, board row's own `next_agent` already non-specialist), citing the 4x-same-day precedent, so future cycles stop re-deriving it from scratch. doc-self-heal 2026-08-15 (+6L, FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION): the Doc-update+graphify step's `/graphify docs --update --no-viz` instruction assumed the interactive slash-command is reachable from any developer-flow cycle — it is not, for a Task-tool-spawned specialist with no Skill-tool binding (confirmed 2 consecutive cycles: this one and the immediately-prior FIX-PROSECEILING-... cycle); added a known-drift note naming the exact CLI-substitute failure mode (nested `docs/graphify-out/`, AST-only no-LLM) so a future cycle stops re-attempting it from scratch and instead reports the honest `skipped` disposition. -->

# Developer — Main Flow

**Scope:** `apps/mcp-server/` root only (TypeScript/Bun). Dev-* zone agents use [`microservice-main.md`](./microservice-main.md) for `apps/<service>/` zone work.

> **Known drift (doc-self-heal 2026-08-09, `FIX-ORPHAN-FR8-TEST-COORDINATION-STORE`):** `system-map.json`/`zone-detect` SKILL's Tier-1 explicit-zone rule routes `apps/mcp-server/` (the WHOLE service, not just its root) to `dev-mcp-server` — this line's "root only" framing understates that: `dev-mcp-server` is `apps/mcp-server/`'s real zone owner, this file is the fallback used when a `developer`-lane row targets that zone anyway. Repeatedly reached this cycle (and 3x earlier the same day: `FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER`/`FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS`/`FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM`) for the same structural reason: a Task-tool-spawned session with `Read/Edit/Write/Bash` only (no `Agent` tool) cannot nest-spawn `dev-mcp-server` — see `feedback_devteam_flow_needs_nested_agent_spawn_subagent_cannot.md`. When that gap applies AND the board row's own `next_agent`/`dispatch_lane` already reads `developer` (not a zone specialist) at claim time, implement directly and document the deviation in the Implementation Record — do not stall on an unreachable dispatch.

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
1. Confirm task status in `docs/data/orch/orch-state.json` `.task_board` (jq `.task_board.active_sprints[].tasks[] | select(.task_id=="NNN")` — for a flat-lane row, e.g. `ready[]`/`backlog[]`, match on `.id` instead)
2. Branch setup — **SUPERSEDED, do NOT create a `task/NNN-*` branch.** CLAUDE.md § Defaults: `NO branches — all work stays on main`. Stay on `main` (`git branch --show-current` should already read `main`); commit directly per §"After code" step 4 below (pathspec-scoped, never `-a`/`-am`). This step's original branch-per-task text is dead prose — no live commit in this repo's history creates a `task/NNN-*` branch; kept here only as a historical marker of the two workflows having diverged (self-healed 2026-08-05, FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH).

**2b. Sprint-task lock — dispatcher holds it**
```
# INV-GATEWAY-1 (enforced 2026-06-07): commit-mutex/task_claim/task_release MCP calls are the
# dispatcher session's sole responsibility. This specialist agent does NOT call task_claim.
# The outer dev-team dispatcher holds the sprint-task lock for the duration of this spawn.
# Inner agents commit directly (explicit paths) and coordinate via file-based .head atomic writes (WF-1).
# Phase 4 activation: see docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md
```

3. Read `docs/handoffs/TASK_NNN.md` first — use `files_to_read/modify/create` directly, skip redundant scanning
4. `depends_on` not Done →
   ```
   # WF-1 STOP-RELEASE (AC-WF1-1/2) — run BEFORE send_telegram + EXIT
   call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
   // ok=false acceptable (TTL expired) — best-effort cleanup
   now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   jq --arg s "idle" --arg t "$now" --arg u "developer" \
     '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
     docs/data/orch/orch-state.json \
     | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
   send_telegram(channel="bug", message="[developer] STOP: depends_on not Done for task:" + task_id + " — head reset idle")
   ```
   EXIT (PIPELINE: blocked)
5. Load knowledge files (fail-loud → run STOP-RELEASE block above first, then `send_telegram(channel="bug", message="[developer] knowledge load failed for task:" + task_id)`, STOP)
6. **Before creating any new file** → look up canonical location in `docs/policies/docs-organization.md` table.
   Quick ref: source→`apps/mcp-server/src/` | tests→`apps/mcp-server/src/__tests__/` | reports→`reports/` | handoffs→`docs/handoffs/` | never at root.

**TDD workflow**
```
RED    → write src/__tests__/NNN-task-name.test.ts → must FAIL
GREEN  → minimum code to pass → must PASS
REFACTOR → clean → still PASS
REPEAT per acceptance criterion
```
→ journal (MANDATORY per task): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from Step 0c / task_board claim>"] (after implementation approach is chosen — record WHY this option, not on terminal; routine work: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`)
- **After each TDD loop** → heartbeat:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "task:" + task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
if hb.ok == false: → stolen-lock protocol per skill § Heartbeat (commit partial, BUG telegram, EXIT)
```

**After code**
→ journal (MANDATORY — pre-REVIEW gate): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from Step 0c / task_board claim>"] (if no earlier entry was written yet for this task, write it now — minimum one entry per task before REVIEW; include any failure adaptation or approach change WHY)
1. `bun test src/__tests__/NNN-*.test.ts` — task tests pass
2. `bun test` — no regressions
3. `bun tsc --noEmit` — 0 errors
4. **Commit directly** (INV-GATEWAY-1 — no mutex skill invocation from this specialist)
   `git add <exact own paths>` (NEVER `-A`/`.`) then `git commit -m "..." -- <same exact paths>` — the pathspec MUST be repeated on the `git commit` command itself, not just the prior `git add`; format per `docs/policies/commit-convention.md`
   Mandatory trailers for task commits: `Sprint:`, `Task:`, `AC:` (slash-separated, terse). Omit all three only for no-sprint commits (§ No-Sprint Rule).
   **NEVER use `git commit -am` or `git commit -a`** — `-a` greedily absorbs staged index content from other sources, violating C2 atomicity (root cause: c47 incident, SHA `8bec73d3`). A bare `git commit -m "..."` with no trailing pathspec is ALSO rejected — `scripts/git-hooks/pre-commit` hard-blocks it once this session's pooled bare-commit warn count passes threshold.
   # INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
   # responsibility; this specialist commits directly (explicit paths) — no commit-mutex skill call here.

**Simplicity gate** (before REVIEW) → skill: `.claude/skills/simplicity-gate/SKILL.md`
Run after all tests GREEN and code committed. Self-check: all 4 questions NO (or simplify + re-run).
Certify in handoff Implementation Record before proceeding to doc update.

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
   **Known structural gap (doc-self-heal 2026-08-15, confirmed 2 consecutive cycles):** a Task-tool-spawned
   specialist (Read/Edit/Write/Bash only, no Skill-tool binding) cannot invoke the interactive `/graphify`
   slash-command. The raw CLI equivalent (`graphify update <path>`) is AST/code-only (no LLM, does not touch
   markdown prose) AND treats `<path>` as its own project root — running it against `docs` creates an
   unwanted NESTED `docs/graphify-out/` instead of updating the canonical root-level graph. When this gap
   applies: do not attempt the raw CLI as a substitute; mark this step `Graphify: skipped (no Skill-tool
   binding — structural gap, see notebook)` in the Implementation Record rather than fabricate a run.
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

**Notebook write** (before QA) → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `developer`; APPEND class — AC-3 settled-write + AC-5 wc gate apply).

**Commit notebook** (direct — INV-GATEWAY-1):
```bash
# INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
# responsibility; inner specialist agents commit directly (explicit paths), no mutex skill call.
git add docs/agent-memory/notebooks/developer.md
git commit -m "chore(memory/developer): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/developer.md
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md` (decision-journal flush + one settled notebook write (absorbs session-log) + doc-self-heal + self-critique trigger-check)

**Update `docs/data/orch/orch-state.json` `.task_board`**: task status IN_PROGRESS → REVIEW (atomic write per §2.3) → return:
```
## RETURN
DONE: Implementation complete — CHANGED=[src/foo.ts:40-55, src/__tests__/NNN.test.ts], NEW_PASS=23, tsc clean
NEXT: qa | run full QA pipeline on branch task/NNN-kebab
HANDOFF: docs/handoffs/TASK_NNN.md
HANDOFF_DELTA: { "last_read_anchor": "<anchor_out>", "last_read_at": "<read_at>" }
PIPELINE: continue
```
