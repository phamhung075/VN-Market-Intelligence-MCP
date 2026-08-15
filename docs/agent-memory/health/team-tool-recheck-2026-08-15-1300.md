# Team Tool-Grant vs Declared-Boundary Recheck — 2026-08-15T13:00Z

**Run by:** agent-father `keep` flow, Step 5b (`docs/agents/agent-father/flow/team-tool-recheck.md`)
**Trigger:** scheduled (cron-fired daily maintenance cycle, agent-father `main.md` → `keep.md` default; Pre-Check gate on Steps 1-2 was closed this cycle — `git diff --name-only HEAD~3..HEAD` touched zero `.claude/agents/*.md`/`docs/agents/*/flow/*.md` in the 3 commits immediately preceding this run — this step runs unconditionally regardless)
**Prior report compared:** `docs/agent-memory/health/team-tool-recheck-2026-08-14-1257.md`
**Scope-in set (7):** alert-commander, bctc-analyst, market-watcher, news-scout, digest-predict, unified-agent, qa-responder (per `docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md` §1)

## HEADLINE — major shift since last run

Commit `476646c4e` (2026-08-14T23:11:00+02:00, task `FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER`, landed AFTER yesterday's 12:57Z recheck) shipped `scripts/audits/agent-bash-grant-coverage.sh` (mechanical, opt-in-derived, CI-wired) and used it to: (1) fix the AC-8 description/tools self-contradiction on alert-commander, market-watcher, news-scout (the 3 standing CRITICAL findings below) by rewriting their description text to name the Bash scope instead of falsely claiming "No other filesystem writes permitted"; (2) newly grant Bash to digest-predict, unified-agent, qa-responder (plus idea-forge, market-analyst, tran-ngoc-bau — outside this recheck's 7-agent scope-in set) after mechanically confirming each genuinely references `git add`/`git commit`/commit-mutex in its own flow corpus — all 3 already carried the honestly-qualified description text at grant time (no self-contradiction window observed). Net effect: the scope-in set's Bash/no-Bash split flips from 3/4 to 6/1 this cycle.

**Mechanical-enforcement status (this check's own target — unchanged, still PROSE-ONLY):** the new gate script enforces flow-demand↔grant CONSISTENCY and description-honesty (AC-8) — a different mechanism from the file-scoped write-RESTRICTION this recheck's §2.4 line tracks. `docs/data/system-map.json` still has 0 `write_boundary` keys (`jq '[.. | objects | select(has("write_boundary"))] | length'` = 0). No `agent-write-boundary-guard` string in `.claude/settings.json` or `.claude/settings.local.json` (0 hits both). Verdict unchanged: no mechanism scopes what a granted `Bash` can actually touch to a specific agent's declared file set — this is the residual gap all 6 findings below still share, now landed via CI-checked, honestly-disclosed grants rather than silent/undocumented ones.

---

## ACTIVE FINDINGS (Bash present — CRITICAL per this check's own Step-2 rule, description quality noted per-row)

| # | Agent | Grant | Description quality | Origin |
|---|---|---|---|---|
| 1 | alert-commander | `Read, Write, Edit, Bash, mcp__gateway__call_tool` | Honestly qualified ("Bash is scoped to git commit-mutex, task_claim session-id derivation, and coverage-stamp.sh transport only") — RESOLVED this cycle, was unqualified through 08-14 | Bash: `610110e16` (07-31); description fix: `476646c4e` (08-14) |
| 2 | market-watcher | `Read, Write, Edit, Bash, mcp__gateway__call_tool` | Honestly qualified (same text) — RESOLVED this cycle | Bash: `610110e16` (07-31); description fix: `476646c4e` (08-14) |
| 3 | news-scout | `Read, Write, Edit, Bash, mcp__gateway__call_tool` | Honestly qualified (same text) — RESOLVED this cycle | Bash: `610110e16` (07-31); description fix: `476646c4e` (08-14) |
| 4 | digest-predict | `Read, Write, Edit, Bash, mcp__gateway__call_tool` | Honestly qualified ("Bash is scoped to git commit-mutex (notebook persistence) only") — NEW grant this cycle, no self-contradiction window | Bash + description: `476646c4e` (08-14) |
| 5 | unified-agent | `Read, Write, Edit, Bash, mcp__gateway__call_tool` | Honestly qualified (same pattern) — NEW grant this cycle | Bash + description: `476646c4e` (08-14) |
| 6 | qa-responder | `Read, Write, Edit, WebSearch, Bash, mcp__gateway__call_tool` | Honestly qualified (same pattern) — NEW grant this cycle | Bash + description: `476646c4e` (08-14) |

All 6 verdicts: REAL per Step-2 rule (Bash present = CRITICAL by construction, "no current mechanism scopes Bash to specific files") — but the substance has changed: this is no longer 3 agents whose description ACTIVELY MISREPRESENTS their write surface; it is 6 agents that all now HONESTLY DISCLOSE a Bash grant, none of which is mechanically confined to its declared file set. Recommend the parent brief (`2026-08-06-guard-cowork-notebook-agent-write-boundary.md` §7 "Bash-vector gap") be re-scoped from 3 to 6 named agents in its next revision — flagged, not actioned here (brief file is architect/PO territory, outside `commit_zone`).

## CLEAN — no mismatch this cycle

| Agent | Grant | Note |
|---|---|---|
| bctc-analyst | `Read, Write, Edit, mcp__gateway__call_tool` | No `Bash` — intentionally grandfathered by `476646c4e`'s own commit message pending `FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH` (confirmed still `status=BACKLOG`, `dispatch_lane=null`, unclaimed); resolution path is a flow-doc rewrite, not a grant |

## NOT IN SCOPE (deliberate exclusion, not an oversight — see `flow/team-tool-recheck.md` §1)

`fb-market-poster` (no `Edit`; same commit also qualified its description text, but the agent stays outside this recheck's known-set per the GUARD-COWORK brief §3 exclusion) and `orch-sentinel` (Bash grant is by-design for its `scripts/orch-apply.sh` wrapper + infra-audit mission; description also qualified by the same commit) are excluded — not silently skipped, structurally out of the "cowork content-writer" class this check targets. Spot-checked both this cycle to confirm the 08-14 commit didn't change their exclusion rationale — it didn't.

## OUT OF SCOPE THIS CYCLE — live-MCP-probe checks (needs gateway access agent-father does not hold)

Unchanged from prior runs — handoff already filed at `docs/signals/processed/2026-08-06-chore-team-tool-recheck-livescope-handoff.json`, no new information to add.

## RESOLVED THIS CYCLE

- **AC-8 description/tools self-contradiction** on alert-commander, market-watcher, news-scout — description text no longer falsely claims "No other filesystem writes permitted" while holding a live `Bash` grant. Fixed by `476646c4e`, first observed by this recheck family today (yesterday's 12:57Z run predates the 23:11 commit).
- **New CI-wired mechanical gate** (`scripts/audits/agent-bash-grant-coverage.sh`) now prevents this specific description/tools self-contradiction class from silently recurring fleet-wide (42/42 agents checked, `--check` exits 0). This does NOT resolve the file-scope-restriction gap this recheck's §2.4 line targets (different mechanism, see HEADLINE) — noted so the two are not conflated in future reports.

## NOT RESOLVED / EXPANDED THIS CYCLE

- Bash-vector/no-file-scope-restriction gap: WIDENED from 3 to 6 agents in the scope-in set (digest-predict, unified-agent, qa-responder newly granted Bash this cycle, all correctly disclosed). Mechanical enforcement (`write_boundary` + `agent-write-boundary-guard` hook) still absent fleet-wide.

---

**Next run:** next daily `cron-agent-father.md` fire (`23 14 * * *` UTC), via `keep.md` Step 5b, unconditionally (independent of the Pre-Check orphan-sweep gate).
