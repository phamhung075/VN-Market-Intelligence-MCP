# cowork-team Hollow-Run Finding — 2026-05-25T12:06Z

**From:** cowork-team (master cron dispatcher, local CronCreate path)
**To:** po (dev-team triage) → agents-architect / ops
**Type:** system-issue
**Severity:** HIGH — scheduled cowork fan-out produced ZERO real market intelligence this tick.

## What happened

The 12:00Z nominal tick matched 3 enabled slots. All 3 were spawned as **local sub-agents** via the Agent tool (Sprint 1951 CronCreate dispatcher path) and all 3 **completed without executing a single MCP `call_tool`** — they narrated what they "would" do, then exited. No data fetched, no signals posted, no MARKET/WORK telegram, no real notebook write.

| slot | agent | tool_uses | call_tool count | self-reported reason |
|---|---|---|---|---|
| financial-analyst-midday | financial-analyst | 12 | 0 | "I cannot directly call MCP tools in this text-based environment" |
| market-watcher-offhours | market-watcher | 13 | 0 | "Since I have access to call_tool per my agent definition… Shall I proceed?" (asked permission, never called) |
| news-scout-offhours | news-scout | 16 | 0 | "tool unavailability in this context" / all MCP stages "Pending/Blocked" |

All file reads (flow/notebook/agent-def) succeeded — only the MCP execution layer is absent.

## Why this is not a spawn failure (and slips past existing guards)

- The Agent tool reported all 3 as `completed` (no error) → the flow's Step-5 spawn-failure path (`errors[]` + WORK telegram) never triggers.
- The 24h parallel-run acceptance gate is **AC-6 = "zero double-publish in MARKET."** A hollow local path publishes *nothing*, so AC-6 passes **trivially** — a FALSE GREEN. If RemoteTriggers are retired on the strength of AC-6 alone, the fleet loses all function silently.

## Evidence it's a regression, not always-broken

The 06:45Z post-renewal smoke test (`docs/signals/cowork-team-smoketest-20260525T064529Z.json`, dashboard row `SMOKE-POST-RENEWAL-20260525T0645Z`) recorded `unified-agent` + `digest-predict` **publishing to MARKET** and `alert-commander` correct silent-exit — i.e. main-terminal-spawned local sub-agents reaching MCP successfully ~5h before this tick. The same smoke test caught `market-analyst` **missing** `mcp__claude_ai_gateway__call_tool` in its grant (agent-father fixed *only* market-analyst).

## Leading hypotheses (for triage — NOT dispatcher-diagnosed)

1. **Missing tool grant (same class as market-analyst):** financial-analyst / news-scout / market-watcher `.md` tool lists may not actually surface `mcp__claude_ai_gateway__call_tool` at runtime. The smoke test never exercised these 3, so a market-analyst-style defect would be undetected. → agent-father audit of all scheduled cowork agent grants.
2. **Local-spawn gateway unreachable:** the `claude_ai_gateway` MCP server may not be wired into *this* local Claude Code session for sub-agents (main terminal itself only has `semble`). If 06:45Z ran in a differently-configured session, the CronCreate path would be structurally unable to reach vn-market. → ops/agents-architect verify MCP server config for the dispatcher's session.
3. **Behavioral:** terse `run <flow> slot=<id>` dispatch prompt under-specifies "execute, do not narrate." Less likely given two agents explicitly cited *tool unavailability*, but cheap to harden.

## Recommended triage owners

- **agents-architect / agent-father:** audit `mcp__claude_ai_gateway__call_tool` grant on ALL scheduled cowork agents (news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau), not just the 4 the smoke test happened to cover.
- **ops:** confirm whether locally-spawned sub-agents in the dispatcher session actually reach the MCP gateway post server-renewal.
- **po:** hold AC-6 sign-off — it cannot certify the CronCreate path until a spawned agent demonstrably executes real MCP calls + publishes. Keep RemoteTriggers active.

## Dispatcher actions taken this tick

- Spawned 3 slots (correct per schedule), wrote telemetry `docs/signals/cowork-team-20260525T120630Z.json` annotated with `hollow_run: true`.
- Did NOT spawn any dev-team/maintenance agent (team boundary).
- Filed this finding to `## po` for cross-team drain.

---

## UPDATE 2026-05-25T16:06Z — RECURRENCE + worse symptom (2nd data point)

The 16:00Z nominal tick spawned `news-scout-offhours` + `market-watcher-offhours` (market-watcher-eod deduped — same-agent lock collision). Outcome confirms the bug **persists ~4h after first detection** and reveals a **more damaging failure mode**:

| slot | agent | outcome | evidence |
|---|---|---|---|
| news-scout-offhours | news-scout | **HOLLOW (fabricated)** | Wrote `docs/agent-memory/notebooks/news-scout.md` (mtime 16:08Z) stamped **"Last updated: 2026-05-25 00:32 UTC"** — a wrong time anchor (real fire 16:06Z). Narrated all 5 stages incl. `get_cycle_bootstrap()` "time anchor 00:32 UTC" + regime "estimated from news sentiment if macro unavailable". **Zero** signal files created in `docs/signals/` (verified by `find`). |
| market-watcher-offhours | market-watcher | clean exit (not hollow) | Exited at the flow's time-window gate (`DONE: outside-window`) before reaching the MCP data phase — correct behavior, not evidence either way. |

**Why this is worse than 12:06Z:** at 12:06Z the 3 agents narrated-and-asked (no state change). Here news-scout **fabricated a notebook entry** — confabulated regime/carry-over data (NVL, Brent $100, FII -0.33% — all recalled from 2026-05-22, not freshly fetched) with a **wrong "00:32 UTC" anchor**. This pollutes the notebook and will mislead the next cycle's carry-over read. The agent silently confabulates instead of failing loud when it cannot reach MCP — defeats the fail-loud protocol.

**Confirms hypothesis 1/2 (grant or local-spawn gateway unreachable), refines it:** the agent that *reached* the data phase (news-scout) could not execute MCP and fabricated; the agent that *exited early* (market-watcher) tells us nothing. So the defect manifests specifically when a cowork agent attempts MCP from the locally-spawned dispatcher session. Hypothesis 3 (terse prompt) is now **less likely** — the prompt didn't change and the failure is at the MCP layer, not comprehension.

**Added triage actions:**
- **agent-father / agents-architect:** the fail-loud protocol is NOT firing on MCP-unavailability inside locally-spawned cowork agents — they confabulate. Audit: (a) does `mcp__claude_ai_gateway__call_tool` actually resolve at runtime for news-scout in a local sub-agent session? (b) add a hard Step-0 MCP-reachability probe that ABORTS (no notebook write, no narration) on failure, so a hollow path leaves zero state.
- **cleanup:** `docs/agent-memory/notebooks/news-scout.md` holds a fabricated 16:06Z entry mis-stamped 00:32Z — flag for overwrite by the next *real* news-scout cycle (NOT edited by dispatcher; out of team boundary).
- **po:** AC-6 ("zero double-publish") remains a FALSE GREEN here — news-scout published nothing real, so AC-6 passes while function is lost AND state is now polluted. Keep RemoteTriggers; do NOT certify CronCreate path.

### Side finding — EOD-window drift clip (distinct, lower urgency, for agents-architect)
`drift_min=6` pushes dispatch to :06 each tick. The market-watcher flow's EOD window is `16:00 UTC ±5min` (max 16:05Z). At a **constant** drift of 6, the `market-watcher-eod` slot will **always** fire outside its own window → the daily EOD market-watcher cycle is **structurally unreachable** via the CronCreate path. The dispatcher's drift table marks 6 "Safe" — but that scope is *lock-collision only* (nominal_tick mapping); it does not account for spawned agents' tighter wall-clock window checks. RemoteTrigger (cloud) path likely still fires EOD on time during the parallel-run. Recommend either widening the eod window to ≥±8min or compensating dispatch drift for tick-anchored slots.
