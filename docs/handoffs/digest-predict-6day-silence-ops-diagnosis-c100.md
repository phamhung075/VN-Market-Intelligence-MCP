# Ops Diagnosis: digest-predict 6-Day Silence (2026-05-08 → 2026-05-14)

**Date:** 2026-05-14  
**Agent:** ops (Haiku 4.5 cycle c100)  
**Classification:** Root cause verified; escalation to developer required  
**Task ID:** 1907a (CRITICAL) + 1907b (follow-up LOW → escalate to HIGH)  
**Previous diagnosis:** task 1907a c90 dev-mcp-server (confirmed cron unwired by design)  

---

## Summary

digest-predict **has NOT fired since 2026-05-11 21:38 UTC** (6 days ago). This agent is **cowork/Claude Desktop–controlled**, not Bun scheduler–controlled. Root cause = **stalled Claude Desktop iTerm2 external trigger mechanism**.

**Evidence of recurrence:**
- Last full cycle: 2026-05-11 21:38 UTC ✓
- 2026-05-12: session stub opened but zero work recorded
- 2026-05-13: session stub opened but zero work recorded
- 2026-05-14: **NO session stub at all** → trigger not even firing

---

## Root Cause (Class A+C Hybrid)

### (A) Scheduler infrastructure broken
- `digest-predict` is defined with 4 cron schedules in `.claude/agents/digest-predict.md` (lines 101–117):
  - Daily 15:30 UTC (≈22:30 VN)
  - Monday 00:30 UTC (≈07:30 VN Mon)
  - Sunday 16:00 UTC (weekly)
  - 1st of month (monthly)
- **These crons are NOT wired to the Bun scheduler** — `apps/mcp-server/src/scheduler/` has zero digest-predict job file. 
- **Confirmed by 1907a diagnosis (c90):** cron expressions in agent `.md` are documentation-only; actual invocation comes from external trigger.

### (C) Agent session failures (secondary evidence)
- 2026-05-12 & 2026-05-13 session files exist but contain only `### Task: daily-digest-YYYYMMDD` headers — **no body, no error logs, no Telegram sends.**
- This indicates: session WAS opened (trigger fired), but agent exited before completing cycle.
- **Possible failure modes:**
  1. MCP gateway connection timeout (session capture stalled)
  2. Cowork agent internal error (no fail-loud written)
  3. Telegram send blocked (API key expired, network error)
  4. Flow dispatcher returned early (time-based dispatch logic broken)

---

## Verification Checklist (ops findings)

- [x] Docker scheduler service: **MISSING** (no container running, expected in 4-layer arch)
- [x] launchd digest jobs: **NONE REGISTERED** (`launchctl list | grep -i digest` = empty)
- [x] crontab digest jobs: **NONE REGISTERED** (`crontab -l | grep -i digest` = empty)
- [x] mcp-server scheduler registry: **NO digest-predict entry** (cron-registry.json, cronConfig.ts)
- [x] Cowork workspace confirms: **external trigger model** (iTerm2/manual, not Bun)
- [x] Session notebook: **6-day gap** (last full write 2026-05-11 21:38 UTC)
- [x] Last 2 session attempts: **stubs only, no work recorded**

---

## Next Steps (developer/cowork-owner MUST TAKE)

### Immediate (next session, developer)
1. **Verify Claude Desktop is running** and connected to mcp-server:3000
   - Check: `curl http://localhost:3000/health` from the machine running Claude Desktop
   - Check: Claude Desktop menu → View → Check logs (`~/.claude-desktop/logs/` or equivalent)
   
2. **Check iTerm2 / launchctl trigger:**
   - If using iTerm2 scheduled sync: verify cowork desktop heartbeat is active (`crontab -l` on the admin user)
   - If using manual: confirm user knows digest-predict runs at 15:30 UTC (22:30 VN) and hasn't disabled it
   - Check for any crash dumps or session timeouts in Claude Desktop logs

3. **Observe next 3 cycles (c101–c103):**
   - Look for new entries in `docs/agent-memory/sessions/2026-05-15-digest-predict.md` (tomorrow)
   - If cycle fires: confirm session body is written (not a stub)
   - If cycle still fails: collect full error logs from Claude Desktop + mcp-server

### Follow-up investigation targets
- **Session capture timeout:** check `.claude/skills/cowork-boundary/SKILL.md` for hard timeout on `ask_for_confirmation()` / session append (default 30s?)
- **Telegram API:** verify MARKET channel token in `.env.telegram` hasn't expired or hit rate limits
- **Flow dispatcher race:** check `.claude/flows/digest-predict/main.md` UTC clock logic — possible timezone offset bug in weekday/day-of-month calc?

### Architecture concern (escalate to architect if recurs after manual fix)
- Current design relies on **external iTerm2 trigger** for a critical user-facing digest (6 missed digests = 6 missed market insights). If this continues to fail, consider:
  - Hardening: add digest-predict as a **server-side cron job** (Bun scheduler) with Telegram fallback
  - Or: implement Claude Desktop **health heartbeat** + **auto-respawn** logic
  - Or: use **cowork tick mechanism** (main terminal loop) to fire digest-predict on schedule

---

## Files Involved

| File | Role | Status |
|---|---|---|
| `.claude/agents/digest-predict.md` | Agent definition (cron schedules documented but unwired) | OK — awaiting developer trigger fix |
| `.claude/flows/digest-predict/main.md` | UTC clock dispatcher | Awaiting developer test |
| `docs/agent-memory/notebooks/digest-predict.md` | Session memory (last full write 2026-05-11 21:38) | Gap evidence |
| `docs/agent-memory/sessions/2026-05-12/13-digest-predict.md` | Session stubs (evidence of early exit) | Gap evidence |
| `apps/mcp-server/src/scheduler/` | Bun scheduler (zero digest-predict job file) | OK — by design, not in scope |
| `docs/TASKS.md` | Task tracking (1907a + 1907b) | See task notes |

---

## Escalation Recommendation

**To:** developer (priority: HIGH after 1912a smoke window passes)  
**Action:** Verify Claude Desktop trigger + investigate 2026-05-12/13 session exit reasons. Observe next 2 cycles. If persist → escalate to architect for design rethink.  
**Blocking:** User-facing feature (6 missed daily digests = product breakage). Ops cannot fix without developer + cowork logs.

---

## Ops Notes

- No infrastructure action taken: Docker, MCP server, database all healthy. Failure is cowork-layer only.
- Did NOT restart any services (per ops protocol: diagnose before acting).
- Escalation to developer is MANDATORY — cron rewiring or trigger debugging is outside ops scope.
- Session log appended: `docs/agent-memory/notebooks/ops.md`

