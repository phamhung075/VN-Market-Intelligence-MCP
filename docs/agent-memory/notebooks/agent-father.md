# Agent Father — Notebook

**Last updated:** 2026-05-07
**Sprint:** maintenance cycle 2

## Last Session Summary
Keep sweep (34 agents). 0 CRITICAL, 0 HIGH findings. 2 auto-fixes applied:
- `flows/dev-team/main.md` — missing Error Boundary (orchestration flow, not sub-agent) — FIXED
- `agent-roster.md` — 10 agents unregistered (report-analyzer + 9 dev-* microservice agents) — FIXED

## Lessons Learned
- idea-forge, market-analyst had `always_load: []` — empty list is not enough. fail-loud-protocol must be explicit entry. [from cycle 1]
- system-auditor, cowork-refactory-expert, claude-manager-helper flows were missing Error Boundary and RETURN — they existed before the pattern was standardized. [from cycle 1]
- code-janitor had KNOWLEDGE LOAD FAILURE PROTOCOL inline but not the always_load pointer — both are required (inline = runtime instructions, always_load = load trigger). [from cycle 1]
- Check #8 (permissions.channels): multiline grep on YAML indentation does not match well — use single-line `permissions:` grep instead. [from cycle 1]
- **NEW:** dev-team/main.md is an orchestration flow, not a sub-agent flow — it still requires Error Boundary per guide Section 6.2.
- **NEW:** When new dev-* microservice agents are created, they must be explicitly added to agent-roster.md. The shared flow design (all use microservice-main.md) can mask missing roster entries during review.
- **NEW:** Glob `.claude/flows/*/` returns nothing — use Bash `ls .claude/flows/` to list flow directories.

## Cross-Team Notes
- cowork-refactory-expert handles live tool surface rewrites (grep registerTool) — do not duplicate
- claude-manager-helper handles DAG integrity and tree-map enforcement — do not duplicate
- Review flow classifies missing [PLANNED] sections (document_zone, document_registry) as LOW, not FAIL
- dev-* agents all share `.claude/flows/developer/microservice-main.md` — check that flow file, not per-agent dirs
- `docs/agent-memory/notebooks/main.md` = dev-team sprint boundary state (intentional, written by main terminal)
- `docs/agent-memory/notebooks/WORK.md` = status dump artifact (intentional, LOW orphan — do not delete)
- `dev-team` flow dir has no matching agent file — intentional (orchestration, not sub-agent)

## Carry-Over
- monitor next review: confirm idea-forge / market-analyst / code-janitor don't regress on always_load [cycle 1]
- LOW: document_zone + document_registry sections still [PLANNED] across all agents — not a blocker [cycle 1]
- LOW: semble-search in agents/ dir but classified as skill in roster — verify if it should be removed from .claude/agents/ [NEW]
- Next keep: verify dev-* microservice agent versions stay current (all at 2026-05-06, one sprint behind)
