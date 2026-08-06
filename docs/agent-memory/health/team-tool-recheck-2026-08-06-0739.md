# Team Tool-Grant vs Declared-Boundary Recheck — 2026-08-06T07:39Z

**Run by:** agent-father `keep` flow, Step 5b (`docs/agents/agent-father/flow/team-tool-recheck.md`)
**Trigger:** first run after re-establishment — `CHORE-TEAM-TOOL-RECHECK-LOCAL-CRON` (writer dead 2026-06-23 to 2026-08-06, cloud RemoteTrigger `trig_019Q8D5xttjZn6iytx2Ld9dW` killed 2026-06-22)
**Prior report compared:** none (first run of the re-established writer; historical family last wrote `team-tool-recheck-2026-06-23-1608.md`, not diffed here — different check scope, see §Out of Scope)
**Scope-in set (7):** alert-commander, bctc-analyst, market-watcher, news-scout, digest-predict, unified-agent, qa-responder (per `docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md` §1)
**Mechanical-enforcement status:** PROSE-ONLY, zero mechanical enforcement — `docs/data/system-map.json` has 0 `write_boundary` keys; neither `.claude/settings.json` nor `.claude/settings.local.json` registers an `agent-write-boundary-guard` (or equivalent) PreToolUse hook. Every finding below is currently unenforceable by anything except human/agent review.

---

## ACTIVE FINDINGS

### CRITICAL-01 — alert-commander: `Bash` granted, description claims "No other filesystem writes permitted" (POSITIVE CONTROL)

| Field | Value |
|---|---|
| Declared boundary | `.claude/agents/alert-commander.md:4` — "Writes only to `docs/agent-memory/notebooks/alert-commander.md` (cycle log, full overwrite). No other filesystem writes permitted." |
| Actual grant | `.claude/agents/alert-commander.md:5` — `tools: Read, Write, Edit, Bash, mcp__gateway__call_tool` |
| Origin | `Bash` added by commit `610110e16` (2026-07-31, "fix(claude/agents): grant Bash to alert-commander, news-scout, market-watcher") for a specific documented need (commit-mutex + `task_claim` session-id derivation) — a deliberate, justified grant, but the description text was never updated to reflect it. The claim and the grant have been inconsistent for 6 days. |
| Verdict | REAL — this is the exact live instance po's 2026-08-06 triage cited as evidence the recheck's silence was masking drift. |

### CRITICAL-02 — market-watcher: same pattern

| Field | Value |
|---|---|
| Declared boundary | `.claude/agents/market-watcher.md` — "Writes only to `docs/agent-memory/notebooks/market-watcher.md` ... No other filesystem writes permitted." |
| Actual grant | `tools: Read, Write, Edit, Bash, mcp__gateway__call_tool` |
| Origin | Same commit `610110e16` (2026-07-31), for `coverage-stamp.sh` transport. |
| Verdict | REAL, same class as CRITICAL-01. |

### CRITICAL-03 — news-scout: same pattern

| Field | Value |
|---|---|
| Declared boundary | `.claude/agents/news-scout.md` — "Writes only to `docs/agent-memory/notebooks/news-scout.md` ... No other filesystem writes permitted." |
| Actual grant | `tools: Read, Write, Edit, Bash, mcp__gateway__call_tool` |
| Origin | Same commit `610110e16` (2026-07-31), for `coverage-stamp.sh` transport. |
| Verdict | REAL, same class as CRITICAL-01. |

## CLEAN — no mismatch this cycle

| Agent | Grant | Note |
|---|---|---|
| bctc-analyst | `Read, Write, Edit, mcp__gateway__call_tool` | No `Bash` — grant matches declared boundary |
| digest-predict | `Read, Write, Edit, mcp__gateway__call_tool` | No `Bash` |
| unified-agent | `Read, Write, Edit, mcp__gateway__call_tool` | No `Bash` |
| qa-responder | `Read, Write, Edit, WebSearch, mcp__gateway__call_tool` | No `Bash`; `WebSearch` is read-only, not a write vector |

## NOT IN SCOPE (deliberate exclusion, not an oversight — see `flow/team-tool-recheck.md` §1)

`fb-market-poster` (no `Edit`, no confirmed self-edit instance per the GUARD-COWORK brief §3) and `orch-sentinel`/`system-auditor` (declared boundary already includes a scripted/wrapper write path or an infra-audit mission requiring `Bash` by design) are excluded from this recheck's known-set — not silently skipped, structurally out of the "cowork content-writer" class this check targets.

## OUT OF SCOPE THIS CYCLE — live-MCP-probe checks (needs gateway access agent-father does not hold)

The pre-2026-06-23 writer additionally ran live MCP probes: tool param-name drift vs live schema (e.g. `ticker` vs `code`), `get_cron_health`, `get_vps_proxy_health`/`get_vps_service_health`, `get_system_status`. `agent-father` holds no `mcp__gateway__call_tool` grant and cannot reproduce this subset. Handoff: `docs/signals/2026-08-06-chore-team-tool-recheck-livescope-handoff.json` — po to assign a gateway-bound owner.

## RESOLVED THIS CYCLE

N/A — first run of the re-established writer.

---

**Next run:** next daily `cron-agent-father.md` fire (`23 14 * * *`), via `keep.md` Step 5b, unconditionally (independent of the Pre-Check orphan-sweep gate).
