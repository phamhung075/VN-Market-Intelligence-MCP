> Parent: [../../../.claude/agents/agents-architect.md](../../../.claude/agents/agents-architect.md)

# Agents Architect — Handler Reference

## Brief-Commit Invariant

**Every time you write or update `docs/architecture-briefs/<file>.md`, you MUST execute ALL THREE steps before exiting:**

### Step 1 — Get UTC timestamp
```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```
Capture output as `UTC_STAMP`.

### Step 2 — Append to notebook
Append to `docs/agent-memory/notebooks/agents-architect.md`:
```markdown
## <UTC_STAMP>

**Brief:** `docs/architecture-briefs/<file>.md`

<1-2 sentence summary of the architecture problem identified and the recommended action>

**Signal dropped:** `docs/signals/<signal-file>.json` → <target-agent>
```

### Step 3 — Commit both files atomically
```bash
git add docs/agent-memory/notebooks/agents-architect.md docs/architecture-briefs/<file>.md
git commit -m "chore(memory/agents-architect): notebook YYYY-MM-DD + brief <slug>"
```

Convention ref: `docs/policies/commit-convention.md § Notebook Commits`

**Rule:** If Step 2 or Step 3 fails, the brief is NOT complete. Retry once. On second failure: `send_telegram(channel="bug", message="[agents-architect] notebook commit failed: <file>")` then EXIT.

---

## Operating Cycle (Inline Flow)

Since this agent has no dedicated flow file, the full operating steps are defined here.

**Step 0 — Read notebook**
Read `docs/agent-memory/notebooks/agents-architect.md` for recent context.

**Step 1 — Survey**
Read agent session logs, notebooks, and signals for system-level patterns.
- `docs/agent-memory/sessions/` — recent sessions (last 3 days)
- `docs/agent-memory/notebooks/*.md` — agent state
- `docs/signals/` — pending signals

**Step 2 — Identify architecture issue**
Formulate the problem: which agents, which communication paths, what is broken or missing.

**Step 3 — Author brief**
Write `docs/architecture-briefs/YYYY-MM-DD-<slug>.md` with:
- Problem statement
- Affected agents/flows/files
- Recommended implementation (actionable for agent-father)
- Dependencies and sequencing

**Step 4 — Drop signal**
Write `docs/signals/<slug>.json` to notify agent-father or pm.

**Step 5 — Apply Brief-Commit Invariant** (see above — mandatory, non-negotiable)

**Step 6 — Notify WORK**
`send_telegram(channel="work", message="[agents-architect] Brief ready: <slug>")` if user-visible impact.

**RETURN**
```
DONE: Brief authored + notebook committed
NEXT: agent-father | implement brief recommendations
HANDOFF: docs/architecture-briefs/YYYY-MM-DD-<slug>.md
PIPELINE: continue
```
