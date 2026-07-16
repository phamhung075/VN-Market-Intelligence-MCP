# No-Bash agents carry dead `git add`/`git commit` steps in flow docs — 9-agent class, owning row mis-scoped to 1

**Filed:** 2026-07-16 (cowork dispatcher, post-tick 07:30Z, from alert-commander subagent's recurring "PROCESS GAP" notebook note — 5th cycle today).
**Folds into:** `FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH [BACKLOG] priority:low`. **Do NOT mint a competing row.**

## What is real
Nine cowork/analysis agents whose tool grant is `Read, Write, Edit, mcp__gateway__call_tool` (or narrower) — **no Bash** — have literal `git add` / `git commit` lines in their flow docs. Those blocks are structurally unexecutable by the agent: dead code that misleads the reader into thinking the agent self-commits its notebook.

| Agent | Grant has Bash? | Flow doc(s) with git steps |
|---|---|---|
| alert-commander | no | `flow/stage-dispatch-log.md:104-105` |
| unified-agent | no | `flow/prediction.md:35-36`, `flow/weekly.md:38` |
| digest-predict | no | `flow/daily-predict.md:135-136`, `flow/monday.md:88` |
| market-analyst | no | `flow/main.md:139-140` |
| idea-forge | no | `flow/main.md:44-45` |
| tran-ngoc-bau | no | `flow/auto-cure-and-handoff.md:51-52` |
| qa-responder | no | `flow/cycle.md:83-84` |
| market-watcher | no | `flow/eod.md:71` |
| bctc-analyst | no | `flow/stage-log-notify.md` (**already tracked** — the owning row) |

Sweep method: `git`-commit lines in `docs/agents/*/flow/*.md` cross-referenced against `tools:` in `.claude/agents/<agent>.md` (the writer's grant, not the context listing). Agents WITH Bash (developer, ops, qa, pm, dev-*, agent-father, code-janitor, cowork-refactory-expert, …) are correct — excluded.

## What is FALSE (the subagent's implied consequence)
The recurring note says work is "stranded / needs a git-capable session." **It is not stranded.** A catch-up path (git user `report-analyzer`, Bash-capable) commits these notebooks anyway — evidence from `git log`: alert-commander committed 06:56Z ("06:49-06:51Z cycle"), news-scout 05:11Z, unified-agent 05:29Z, market-watcher 04:11Z. The agent's own commit step never runs, but the notebook is picked up downstream. **Functional impact ≈ zero; this is a cosmetic / dead-code defect, which is why the owning row is correctly `priority:low`.**

## The one thing worth fixing in the tracking
The owning row's title names **only** `bctc-analyst stage-log-notify.md`. A fixer routed to it would edit one file and miss the other eight. **Widen the owning row's scope to the 9-agent class** (or note the class in its detail). The fix itself is trivial and non-functional: delete the dead `git add`/`git commit` blocks from the 9 flow docs (agent-father / cowork-refactory-expert scope), leaving the `cowork-end-cycle` skill pointer where present. No behavior change — the catch-up path already covers commits.

## Prior-art checked (before investigating, not after)
Board + handoffs grepped at the "worth chasing" trigger. Hit: `FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH`. Related but distinct: `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE` (UUID leakage, different defect), `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` (self-edit of flow docs). None cover the 9-agent no-Bash-git class. This handoff is the additive delta; no row minted.
