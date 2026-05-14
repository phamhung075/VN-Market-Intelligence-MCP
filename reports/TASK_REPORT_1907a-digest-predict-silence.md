# TASK REPORT — 1907a-digest-predict-silence

**Date:** 2026-05-14
**Agent:** dev-mcp-server
**Classification:** Diagnostic (no code change)

---

## Root Cause: (a) Cron Unwired — Never Registered in mcp-server Scheduler

`digest-predict` is a **cowork/Claude Desktop agent**, not a server-side cron job. It has NO registration in the mcp-server scheduler. The 3-day silence is caused by the cowork agent not being invoked by its external trigger (manual or iTerm2 schedule), unrelated to mcp-server.

---

## Evidence

### 1. No digest-predict entry in cronConfig.ts

`apps/mcp-server/src/scheduler/cronConfig.ts` — 130 lines, 46 CRONS keys.
Zero entries matching `digestPredict`, `digest_predict`, or `digest-predict`.

### 2. No digest-predict import in startScheduler.ts

`apps/mcp-server/src/scheduler/startScheduler.ts` — 689 lines.
Zero imports of any digest or daily-digest job. All 50+ jobs that are registered have explicit `import` + `cron.schedule()` pairs. No such pair exists for digest-predict.

### 3. No digest-predict job file in scheduler/

Directory scan of `apps/mcp-server/src/scheduler/` and all subdirs:
- `briefings/`: eveningSummaryJob.ts, franceSummaryJob.ts, morningBriefingJob.ts — no digest job
- `macro/`: predictionMarketJob.ts, predictionOutcomeJob.ts, predictionResolutionJob.ts, calibrationReportJob.ts, etc. — no digest job
- All other subdirs: alerts/, audits/, financial-reports/, market-data/, news-analysis/, portfolio/, system/ — zero `*digest*` or `*daily-digest*` files

### 4. No entry in cron-registry.json

`docs/data/cron-registry.json` — 50+ job entries. Zero entry for `digestPredict` or `digest-predict`.

### 5. Cowork workspace confirms: digest-predict is a Claude Desktop agent

`cowork-workspace-team-claude-desktop/06-digest-predict.md`:
```
| Daily 23:30 | `.claude/flows/digest-predict/daily.md` — daily digest |
| Mon 00:30   | `.claude/flows/digest-predict/monday.md` |
| Sun 23:00   | `.claude/flows/digest-predict/weekly.md` |
```
Invocation mechanism: manual or iTerm2/external cron calling the Claude Desktop agent. NOT the mcp-server Bun scheduler.

### 6. Agent definition confirms: invoked via external schedule, not mcp-server

`.claude/agents/digest-predict.md` `inter_agent.receives_from`:
```yaml
- agent: cron
  mechanism: scheduled_invocation
  trigger: monday_prediction + daily_digest + weekly + monthly
```
The `cron` here refers to an external scheduler (iTerm2 or launchctl) that opens the agent in Claude Desktop — it is NOT the Bun `node-cron` scheduler inside `apps/mcp-server`.

### 7. Last notebook entry: 2026-05-11 21:38 UTC

`docs/agent-memory/notebooks/digest-predict.md` last session block:
```
## Cycle — 21:38 UTC
- cycle_date: 2026-05-11
```
That is 3 days before today (2026-05-14). Session files exist for 2026-05-12 and 2026-05-13 but contain only stub entries (`### Task: daily-digest-20260512`, `### Task: daily-digest-20260513`) with no content — the agent sessions were opened but failed to write the full cycle record.

### 8. Docker log evidence: zero digest-predict invocations

```
docker logs vn-market-intelligence-mcp-mcp-server-1 --since 72h
```
Result: zero lines matching `digest-predict`, `digestPredict`, or `digest_predict`. Only LanceDB I/O scheduler (Rust) traces appeared on grep for "scheduler".

---

## Root Cause Classification

**Class (a): Cron unwired — never registered in mcp-server scheduler.**

More precisely: `digest-predict` was designed to be a **cowork-layer agent** triggered externally (iTerm2/manual), not a Bun server-side cron. The mcp-server has no mechanism to invoke it. The 3-day silence is therefore a **cowork-layer invocation failure**, not a scheduler wiring issue in mcp-server.

Secondary observation: The 2026-05-12 and 2026-05-13 session stub files exist (`### Task: daily-digest-YYYYMMDD` headers only), which means Claude Desktop sessions were opened but the agent exited before writing the digest. This suggests **class (c) secondary factor**: agent side failing silently (no notebook write after session start).

---

## Recommended Remediation (separate task for PO)

The fix is **outside mcp-server zone** — it is an ops/cowork-layer concern:

1. **Immediate (ops):** Verify the iTerm2 or launchctl trigger for `06-digest-predict` is still active. The daily-digest schedule (`Daily 23:30 UTC` per cowork workspace) may have been disrupted by a machine restart or session loss.

2. **Root cause (ops/cowork):** The 2026-05-12 and 2026-05-13 session stubs show the agent was invoked but wrote nothing — investigate why the agent exited early (check cowork agent logs, Telegram send errors, or MCP gateway timeout).

3. **Optional hardening (mcp-server):** If on-demand digest triggering is desired from the server side, a new cron job `digestTrigger` could write a signal to `ask_queue` or fire an MCP tool that cowork reads — but this requires a separate architecture decision and task.

**No code change in apps/mcp-server/ is required or appropriate for this diagnostic finding.**

---

## Files Inspected

- `apps/mcp-server/src/scheduler/cronConfig.ts` (130L) — no digest entry
- `apps/mcp-server/src/scheduler/startScheduler.ts` (689L) — no digest import/schedule
- `apps/mcp-server/src/scheduler/` (all subdirs) — no digest job file
- `docs/data/cron-registry.json` — no digest entry
- `docs/agent-memory/notebooks/digest-predict.md` — last full write 2026-05-11 21:38 UTC
- `docs/agent-memory/sessions/2026-05-12-digest-predict.md` — stub only
- `docs/agent-memory/sessions/2026-05-13-digest-predict.md` — stub only
- `cowork-workspace-team-claude-desktop/06-digest-predict.md` — confirms external invocation model
- `.claude/agents/digest-predict.md` — confirms `inter_agent.receives_from: cron` = external
- `docker logs vn-market-intelligence-mcp-mcp-server-1 --since 72h` — zero digest hits
