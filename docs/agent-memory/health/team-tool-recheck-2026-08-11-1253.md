# Team Tool-Grant vs Declared-Boundary Recheck — 2026-08-11T12:53Z

**Run by:** agent-father `keep` flow, Step 5b (`docs/agents/agent-father/flow/team-tool-recheck.md`)
**Trigger:** scheduled (cron-fired maintenance cycle, agent-father `main.md` → `keep.md` default; same check, off-cadence re-run — 39 min after the 12:14Z run this same day)
**Prior report compared:** `docs/agent-memory/health/team-tool-recheck-2026-08-11-1214.md` (most recent prior file in the family)
**Scope-in set (7):** alert-commander, bctc-analyst, market-watcher, news-scout, digest-predict, unified-agent, qa-responder (per `docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md` §1)
**Mechanical-enforcement status:** still PROSE-ONLY for the write-boundary class this check targets. `docs/data/system-map.json` has 0 `write_boundary` keys (`jq '[.. | objects | select(has("write_boundary"))] | length'` = 0). No `agent-write-boundary-guard` string anywhere in `.claude/settings.json` or `.claude/settings.local.json` (0 hits both files). Verdict unchanged: no mechanism scopes `Bash`/`Write`/`Edit` to a specific agent's declared file set.

---

## ACTIVE FINDINGS

### CRITICAL-01 — alert-commander: `Bash` granted, description claims "No other filesystem writes permitted" (POSITIVE CONTROL)

| Field | Value |
|---|---|
| Declared boundary | `.claude/agents/alert-commander.md` — "Writes only to `docs/agent-memory/notebooks/alert-commander.md` (cycle log, full overwrite). No other filesystem writes permitted." |
| Actual grant | `tools: Read, Write, Edit, Bash, mcp__gateway__call_tool` |
| Origin | `Bash` added by commit `610110e16` (2026-07-31, "fix(claude/agents): grant Bash to alert-commander, news-scout, market-watcher") — deliberate, justified grant (commit-mutex/task_claim session-id derivation), but description text never updated to reflect it. Unresolved for 11 days as of this run. |
| Verdict | REAL — unchanged from prior run. |

### CRITICAL-02 — market-watcher: same pattern

| Field | Value |
|---|---|
| Declared boundary | `.claude/agents/market-watcher.md` — "Writes only to `docs/agent-memory/notebooks/market-watcher.md` ... No other filesystem writes permitted." |
| Actual grant | `tools: Read, Write, Edit, Bash, mcp__gateway__call_tool` |
| Origin | Same commit `610110e16` (2026-07-31), for `coverage-stamp.sh` transport. |
| Verdict | REAL, unchanged from prior run. |

### CRITICAL-03 — news-scout: same pattern

| Field | Value |
|---|---|
| Declared boundary | `.claude/agents/news-scout.md` — "Writes only to `docs/agent-memory/notebooks/news-scout.md` ... No other filesystem writes permitted." |
| Actual grant | `tools: Read, Write, Edit, Bash, mcp__gateway__call_tool` |
| Origin | Same commit `610110e16` (2026-07-31), for `coverage-stamp.sh` transport. |
| Verdict | REAL, unchanged from prior run. |

## CLEAN — no mismatch this cycle

| Agent | Grant | Note |
|---|---|---|
| bctc-analyst | `Read, Write, Edit, mcp__gateway__call_tool` | No `Bash`; description's explicit exceptions (`docs/analysis-briefs/{TICKER}.md` on mode=release, `data/bctc-analysis-cache/`) match declared scope |
| digest-predict | `Read, Write, Edit, mcp__gateway__call_tool` | No `Bash` |
| unified-agent | `Read, Write, Edit, mcp__gateway__call_tool` | No `Bash`; description's explicit exception (`docs/data/unified-agent-synthesis-*.json`) matches declared scope |
| qa-responder | `Read, Write, Edit, WebSearch, mcp__gateway__call_tool` | No `Bash`; `WebSearch` is read-only, not a write vector |

## NOT IN SCOPE (deliberate exclusion, not an oversight — see `flow/team-tool-recheck.md` §1)

`fb-market-poster` (no `Edit`, no confirmed self-edit instance per the GUARD-COWORK brief §3) and `orch-sentinel`/`system-auditor` (declared boundary already includes a scripted/wrapper write path or an infra-audit mission requiring `Bash` by design) are excluded from this recheck's known-set — not silently skipped, structurally out of the "cowork content-writer" class this check targets.

## OUT OF SCOPE THIS CYCLE — live-MCP-probe checks (needs gateway access agent-father does not hold)

The pre-2026-06-23 writer additionally ran live MCP probes: tool param-name drift vs live schema (e.g. `ticker` vs `code`), `get_cron_health`, `get_vps_proxy_health`/`get_vps_service_health`, `get_system_status`. `agent-father` holds no `mcp__gateway__call_tool` grant this session and cannot reproduce this subset. Handoff already filed at `docs/signals/processed/2026-08-06-chore-team-tool-recheck-livescope-handoff.json` — already picked up (no new information to add, not re-filed this cycle).

## RESOLVED THIS CYCLE

N/A — all 3 CRITICAL findings persist unchanged from the 2026-08-11T12:14Z run (39 minutes since last check, 11 days total since origin commit `610110e16`). No description-text fix or grant-narrowing landed for alert-commander / market-watcher / news-scout in the interim.

---

**Next run:** next daily `cron-agent-father.md` fire (`23 14 * * *` UTC), via `keep.md` Step 5b, unconditionally (independent of the Pre-Check orphan-sweep gate).
