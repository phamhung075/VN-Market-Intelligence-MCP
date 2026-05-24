# Developer — Feature Spike Sub-Flow

**Trigger:** Exploratory task — no architect handoff, no TDD, time-boxed investigation
**Parent flow:** `.claude/flows/developer/main.md` (or `microservice-main.md` when zone-scoped)

## Input
- Spike question or hypothesis (from PO or user direct)
- Optional zone hint (`apps/<service>/`)
- Time-box (default: 2 hours)

## Output
- `docs/spikes/SPIKE_NNN-<topic>.md` findings doc
- No code merged to main; throwaway branch `spike/NNN-*` deleted after

---

## Role in dev-team flow
> Canonical orchestration: `.claude/flows/dev-team/main.md`

**Called from:** dev-team Step 1 PO triage when batch type=SPIKE (PO classifies exploratory work distinct from FIX/SPRINT)
**Receives:** spike question, optional zone hint, time-box
**Produces:** findings doc at `docs/spikes/SPIKE_NNN.md` — no merged code
**Hand off to:** main terminal → po reads findings and decides whether it becomes a real sprint

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`
**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `developer`)

## docs_required
> Read in parallel before Step 1.
- spike question and scope from spawn input
- zone docs if a hint was provided

## Steps

1. **Branch:** `git checkout -b spike/NNN-<kebab-topic>` — throwaway, never merged.
2. **Investigate** — prototype, probe, measure. Skip TDD; this is throwaway code.
3. **Time-box check** — when time-box hits, stop coding and write findings even if incomplete.
4. **Write findings** to `docs/spikes/SPIKE_NNN-<topic>.md`:
   ```markdown
   # SPIKE NNN — <topic>
   - **Question:** [original]
   - **Approach tried:** [what was prototyped]
   - **Findings:** [evidence-based answer]
   - **Recommended next step:** [real sprint task | abandon | needs more investigation]
   - **Code reference:** branch `spike/NNN-*` (deleted at cleanup)
   ```
5. **Cleanup:**
   ```
   git checkout main
   git branch -D spike/NNN-<kebab-topic>
   ```
6. **Commit findings only** (never the spike code) — **mutex-guarded** → skill: `.claude/skills/commit-mutex/SKILL.md`:
   ```
   # own_paths: [docs/spikes/SPIKE_NNN-<topic>.md]
   # Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
   git add docs/spikes/SPIKE_NNN-*.md
   git commit -m "docs(spike): NNN findings — <topic>"
   ```

## RETURN

```
DONE: Spike complete — findings at docs/spikes/SPIKE_NNN-<topic>.md
NEXT: po | review findings, decide on real sprint
PIPELINE: complete
```
