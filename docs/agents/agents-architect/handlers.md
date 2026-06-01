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

**BLOCKED / EXIT**

If at any step an unresolvable blocker is encountered (file unreadable after 1 retry, signal write fails, notebook commit fails after 1 retry):
```
## RETURN
BLOCKED: <one-line description of the blocker>
ACTION: send_telegram(channel="bug", message="[agents-architect] BLOCKED: <description>")
NEXT: EXIT — do not proceed to subsequent steps
PIPELINE: blocked
```

**RETURN**
```
DONE: Brief authored + notebook committed
NEXT: agent-father | implement brief recommendations
HANDOFF: docs/architecture-briefs/YYYY-MM-DD-<slug>.md
PIPELINE: continue
```

---

## Improvement-Proposal Review

> Three-lane rule + proposal schema SSOT: `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §1 and §3.

**Trigger:** invoked when `docs/data/orch/orch-state.json` `.signal_queue.rows[]` has `status=NEW` rows of `type=improvement_proposal`.

**Step IP-1 — Read each proposal doc** from the path in the signal_queue row `payload_ref` field.

**Step IP-2 — Validate lane classification** by applying the THREE-LANE rule (first-match-wins, lane-C tested first) from the brief above §1.
- If lane label is wrong → correct it in the `## Lane` section of the proposal doc. Note correction in the architect-review section.
- Validate `## target_agent` is a valid kebab-case agent id that maps to a real agent in `.claude/agents/`. If missing or invalid → mark proposal `status=DRAFT-INCOMPLETE`, write `send_telegram(channel="work", message="[agents-architect] Proposal {id}: target_agent invalid — returned to system-auditor for re-emit")`, skip to next proposal.
- Validate `## target_files` is non-empty and each path exists in the repo. If empty → same DRAFT-INCOMPLETE treatment.

**Step IP-3 — Validate evidence concreteness:** the `## Evidence` section must carry a `check_id` or a metric with numeric data and dates. If vague → mark `status=DRAFT-INCOMPLETE`, send WORK message asking system-auditor to re-emit with evidence.

**Step IP-4 — Fill architect-review section** in the proposal doc:
```markdown
## Architect Review

**Lane confirmed:** {LANE-A | LANE-B | LANE-C}
**Evidence validated:** yes | no (with reason)
**target_agent confirmed:** {kebab-case id}
**target_files confirmed:** {list}
**Proposed change scope:** {N files — list}
**Architect notes:** {any caveats}
```

**Step IP-5 — Update proposal doc status** to `ARCHITECT-REVIEWED`.

**Step IP-6 — Write signal to PO:**
```json
{
  "from": "agents-architect",
  "to": "po",
  "type": "improvement_proposal",
  "payload": "docs/improvement-proposals/{id}.md",
  "priority": "normal",
  "createdAt": "{ISO-8601 UTC}"
}
```
Write to `docs/signals/{id}-review.json`.

**Step IP-7 — Mark DASHBOARD row** `status=READ`.

**Step IP-8 — Commit** (Brief-Commit Invariant extended):
```bash
git add docs/improvement-proposals/{id}.md docs/signals/{id}-review.json docs/agent-memory/notebooks/agents-architect.md
git commit -m "chore(improve): architect-review {id}"
```
Explicit paths only — never `-A`.

**RETURN**
```
DONE: {N} proposals reviewed — {M} ARCHITECT-REVIEWED, {K} DRAFT-INCOMPLETE
NEXT: po (via signals + DASHBOARD rows)
PIPELINE: continue
```
