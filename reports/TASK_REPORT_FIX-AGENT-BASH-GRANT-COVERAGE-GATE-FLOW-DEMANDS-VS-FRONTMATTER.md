# Task Report: FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER

date: 2026-08-23
outcome: APPROVED / DONE_VERIFIED (Direct-Commit Verify, branch:null)

changed: scripts/audits/agent-bash-grant-coverage.sh (new), scripts/audits/agent-bash-grant-coverage.test.sh (new), .github/workflows/ci.yml (+job), 8 .claude/agents/*.md (Bash grants), 5 .claude/agents/*.md (AC-8 description fix)

tests: `agent-bash-grant-coverage.sh --check` re-run live: exit 0, 42/42 agents PASS (0 new offenders). `agent-bash-grant-coverage.test.sh`: 10 pass / 0 fail. CI job confirmed live at .github/workflows/ci.yml:529-554.

AC-6 (hard bar, re-derived from raw git, not narration): grant commit `476646c4e` (2026-08-14T21:11Z UTC) < digest-predict notebook self-commit `c4fc71708` (2026-08-22T17:48Z UTC) — a real post-grant live cycle self-committed via the new Bash grant.

AC-8: alert-commander/market-watcher/news-scout/fb-market-poster/orch-sentinel descriptions spot-checked — all reworded to "Bash is scoped to..."; self-contradiction resolved.

verdict: APPROVED

### Issues
None.

Merge Status: DONE_VERIFIED, no merge (already on main). Board write: orch-state.json commit `90162fc4e`.
