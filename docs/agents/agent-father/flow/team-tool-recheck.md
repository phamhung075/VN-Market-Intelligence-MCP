<!-- cap: 120L (flow-file). CHORE-TEAM-TOOL-RECHECK-LOCAL-CRON (2026-08-06, po triage, DECISION=REPLACE not
     retire). Historical writer = cloud RemoteTrigger trig_019Q8D5xttjZn6iytx2Ld9dW, killed 2026-06-22
     by the no-RemoteTrigger directive (feedback_no_remote_trigger_all_local.md), silent since
     2026-06-23. Historical scope (122 files, git log) was a LIVE MCP-probe health sweep (tool
     param-name drift, cron_job_runs, VPS health, get_system_status) — agent-father holds no
     `mcp__gateway__call_tool` grant (confirmed `.claude/agents/agent-father.md` tools line) and
     CANNOT reproduce that portion. This flow RE-ESTABLISHES the STATIC, file-based subset agent-father
     CAN run without gateway access: tool-grant vs declared-write-boundary consistency (the exact class
     of live violation po found this same cycle — alert-commander granted Bash despite a "No other
     filesystem writes permitted" description). The live-probe subset is flagged out-of-scope, not
     silently dropped — see §5. -->
# Agent Father — Team Tool-Grant vs Declared-Boundary Recheck

**Parent:** `docs/agents/agent-father/flow/keep.md` (new step, runs on the existing daily
`.claude/commands/crons/cron-agent-father.md` cadence — `23 14 * * *`, already < 30d, no new cron
registration needed).

## 1. Scope-in set (today's fallback — see §2 for the future authoritative source)

`docs/data/system-map.json .project.agents[].write_boundary` does not exist yet (the mechanism
`GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` designed for exactly this is brief-complete but
not implemented). Until it lands, use the 7 agents enumerated in that brief's §1 as the known
boundary-declared, cowork-content-writer class: `alert-commander, bctc-analyst, market-watcher,
news-scout, digest-predict, unified-agent, qa-responder`.

**Explicitly NOT in scope** (both also carry a "Writes ONLY to..." clause but are a different
class — do not flag): `fb-market-poster` (brief §3 exclusion — no `Edit`, no confirmed instance);
`orch-sentinel` and `system-auditor` (their declared boundary already includes a scripted/wrapper
write path — `scripts/orch-apply.sh` — and an infra-audit mission that legitimately needs `Bash`
for docker/git/sqlite; they are not the "cowork content-writer" class this check targets).

## 2. Per-agent check

For each of the 7:
1. `Grep "^description:" .claude/agents/<id>.md` — confirm it still declares a notebook-only/no-other-writes boundary (if it no longer does, the frontmatter changed — note and skip, do not assume the old text).
2. `Grep "^tools:" .claude/agents/<id>.md` — CRITICAL finding if `Bash` is present (no current mechanism scopes `Bash` to specific files; per `docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md` §7 "Bash-vector gap (not fixed by this brief)"). `Edit`/`Write` alone is expected (needed for the notebook) — not itself a finding.
3. If CRITICAL: `git log -S"tools: <line>" --format='%H %ad %s' -- .claude/agents/<id>.md` to attach the grant's origin commit (a known deliberate grant, e.g. `610110e16` 2026-07-31 "grant Bash to alert-commander, news-scout, market-watcher" for commit-mutex/coverage-stamp.sh, is still a finding — the description text was never updated to reflect it — just annotate, do not downgrade).
4. Mechanical-enforcement check (once per run, not per agent): does `docs/data/system-map.json` contain any `write_boundary` key, AND does `.claude/settings.json` or `.claude/settings.local.json` register a `PreToolUse`/`Write|Edit` hook matching `agent-write-boundary-guard`? Both absent → the run's headline is "boundary is prose-only, zero mechanical enforcement" (true as of 2026-08-06).

## 3. Positive control (mandatory — this row's own AC)

This cycle's run MUST find alert-commander CRITICAL (Bash + unqualified "no other writes" claim,
both true as of 2026-08-06). If a run reports zero findings, the check itself regressed — FAIL LOUD
(`send_telegram(channel="bug", message="[agent-father] team-tool-recheck: 0 findings — expected
alert-commander CRITICAL, check regressed")`), do not write a "clean" report.

## 4. Output

Write `docs/agent-memory/health/team-tool-recheck-<YYYY-MM-DD>-<HHMM>.md` (UTC; new file per run,
matching the pre-2026-06-23 convention — this directory is NOT append-only). Sections: header (run
by: agent-father `keep` flow, scheduled; prior report compared: most recent file in the family, if
any), ACTIVE FINDINGS (one row per mismatched agent: grant, declared boundary, origin commit if
known), MECHANICAL-ENFORCEMENT STATUS (one line), OUT OF SCOPE THIS CYCLE (§5 pointer), RESOLVED
THIS CYCLE (diff against the prior file, if any).

`docs/agent-memory/health/` is drained by `scripts/agents-flow/memory-prune-sweep.sh` at 30d — the
daily cadence here stays ahead of that drain by construction (AC requirement).

**Commit** — same commit-mutex pattern as the notebook write, `own_paths = [the new health file]`:
`.claude/skills/commit-mutex/SKILL.md`.

## 5. Out of scope (flagged, not silently dropped)

The historical writer's live-MCP-probe checks (tool param-name drift vs live schema, `get_cron_health`,
`get_vps_proxy_health`/`get_vps_service_health`, `get_system_status`) need `mcp__gateway__call_tool`,
which agent-father does not hold. Handoff: `docs/signals/2026-08-06-chore-team-tool-recheck-livescope-handoff.json`
recommends a gateway-bound owner (system-auditor's existing Tier-1/Tier-2 dimensions already cover
much of the runtime/freshness overlap; the tool-param-schema-drift class is the genuinely uncovered
remainder) — po to assign.

## 6. RETURN handoff

If ACTIVE FINDINGS is non-empty, fold into `keep.md`'s existing Step 7 PO handoff (same findings
table shape) — do not open a second, parallel PO spawn for this step alone.
