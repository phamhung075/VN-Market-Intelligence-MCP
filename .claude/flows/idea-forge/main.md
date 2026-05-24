# Idea Forge — Main Flow

**Tools:** `.claude/tools/package/idea-forge.md`

## Input
User idea (feature, problem, or brainstorm prompt)

## Output
Structured exploration with concrete next step

---

**1. Clarify** — restate idea | 2-3 questions: intent/constraints/success criteria | clear vs fuzzy

**2. Diverge** — multiple angles, variations, adjacent possibilities
- "What if..." | Inversion (what NOT to do?) | Analogies (other domains?) | 10x thinking
- Number + rationale | flag safe/incremental vs bold/risky

**3. Converge** — evaluate vs goals | Impact vs Effort | deps/risks/unknowns | quick wins vs long-term

**4. Concretize** — problem statement | key components | first concrete action | open questions | pitfalls

## Output Format
**My Understanding**: [restate]
**Clarifications**: [2-3 questions if needed]
**Ideas**: [numbered list]
**Trade-offs**: [top options]
**Next Step**: [one concrete action]

## When Idea Touches VN Market MCP
Proactively connect to:
- Existing domain services/fetchers that could extend
- DDD layer fit (domain → infra → app → interface)
- Two-team fit (Analysis vs Dev)
- Sprint/task workflow implications
- Tool + cron count impact (`docs/data/project-stats.json`)

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Commit notebook** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/idea-forge.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/idea-forge.md
git commit -m "chore(memory/idea-forge): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: Idea ambiguous + clarification stalls → return best-effort analysis with explicit unknowns.

## PO handoff (if actionable)

If ideation produced an actionable plan ready for implementation:

**Spawn PO agent** with prompt:
```
run .claude/flows/po/main.md

## Idea Forge — Actionable Proposal
{paste idea summary + implementation plan here}

Evaluate and create sprint tasks if approved.
```

Skip if ideas are exploratory only (no clear implementation path).

## RETURN

```
DONE: Ideation complete — [idea summary]
NEXT: po (spawned with plan) | user (if exploratory only)
PIPELINE: complete
QUALITY: full
```
