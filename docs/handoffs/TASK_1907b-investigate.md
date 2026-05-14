---
sprint: 1907
branch: task/1907b-cowork-trigger-investigate
size: S
zone: ops/
depends_on: [1907a-digest-predict-silence]
blocks: []
---

## TLDR

Investigate the 2026-05-12/13 silent exits for digest-predict cron. Root cause identified in 1907a (DIAG-DONE c90): agent runs in Claude Desktop on external trigger, not Bun scheduler (unwired by design). This follow-up verifies that the iTerm2/launchctl trigger is active and explores any transient credential/firewall issues that may have caused the silent exits during those 2 cycles. Observational task — no code change expected.

---

## [PM] Planning Context

- **Zone:** `ops/` (monitoring + diagnostics)
- **Priority:** LOW (root cause known; observational only)
- **Acceptance Criteria:**
  - [ ] Verify Claude Desktop Session Capture is syncing heartbeats (check `.claude/sessions/` for recent entries)
  - [ ] Confirm launchctl or iTerm2 trigger is active (check system logs or manually run one agent cycle)
  - [ ] Review 1907a report (`reports/TASK_REPORT_1907a-digest-predict-silence.md`) for exact timestamps of 2026-05-12/13 silence
  - [ ] Check cowork server logs during those timestamps for any auth/connection failures
  - [ ] Observe digest-predict cycles for c91-c93 (next 3 cycles) — if silence repeats, escalate to architect for deeper MCP tunnel/firewall investigation
  - [ ] Document findings in ops notebook (lightweight, no formal report required)
  - [ ] If no repeat silence across c91-c93, mark as transient environmental issue (resolved)

- **Files to read first:**
  - `reports/TASK_REPORT_1907a-digest-predict-silence.md` (1907a findings + diag timestamps)
  - `.claude/sessions/` — check for recent Session Capture heartbeats
  - System logs: `~/Library/Logs/Claude/` or similar (depends on macOS Cowork Desktop location)
  - `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md` (if available — external-trigger pattern context)

- **Files to create:**
  - None (observational; findings appended to ops notebook)

- **Files to modify:**
  - `docs/agent-memory/notebooks/ops.md` — append findings after c93

- **Dependencies:**
  - 1907a-digest-predict-silence (DIAG complete; root cause known)

- **Knowledge needed:**
  - `docs/architecture-briefs/2026-05-14-1890a-fa-tool-package.md` — no overlap; different service
  - 1907a diagnostic report for timeline reference

---

## Context from 1907a (DIAG-DONE c90)

Root cause: digest-predict agent runs in Claude Desktop on **external trigger** (iTerm2/launchctl), not in the Bun scheduler. This is by design — the agent is triggered by user interaction or a macOS launchctl job outside the main MCP server.

**Why the 3-day silence on 2026-05-12/13?**
Possibilities:
1. iTerm2 window was closed / launchctl job disabled
2. Cowork Desktop lost connection to market-intelligence-mcp server
3. Credential/auth issue (token expired, VPN down)
4. Firewall rule blocking MCP tunnel

1907a diagnostic commit `717f92f1` confirmed the cron entry does NOT exist in `cronConfig.ts`. The agent is external.

---

## Investigation Steps

1. **Session Capture verification:** Check `~/.claude/sessions/` for timestamps covering 2026-05-12/13. If Session Capture was inactive or not syncing, that explains the silent exit (agent trigger never fired).

2. **System trigger status:** Manually run one digest-predict cycle to confirm the trigger works. Check launchctl status (`launchctl list | grep digest` or similar) and/or iTerm2 activation logs.

3. **Cowork Desktop logs:** Review Claude Desktop application logs during 2026-05-12/13 00:00-12:00 UTC for connection drops or auth failures. Look for MCP server connection errors or tunnel timeouts.

4. **Market-intelligence-mcp server logs:** Check if the MCP server was unreachable during the silence window (firewall, VPN, network issue).

5. **Observe c91-c93:** Monitor digest-predict cycles for the next 3 crons (c91, c92, c93). If silence repeats at the same time, note the pattern (daily? weekly? credential rotation?). If no repeat, assume transient environmental blip.

6. **Escalation logic:** If silence repeats, escalate to architect for deeper MCP tunnel/firewall investigation (beyond ops scope).

---

## Expected Outcome

**Most likely:** The silence was a transient issue (network glitch, Cowork Desktop auto-sleep, credential refresh). Observation across c91-c93 will show normal digest-predict cycles. Task closes as resolved.

**If repeat silence:** Escalate with findings (timestamps, logs, pattern) to architect for root-cause analysis of MCP tunnel or credential refresh mechanism.

---

## Notes

This is a **LOW priority, observational** follow-up. No code change or urgent action expected. The system is not broken (root cause understood). This task documents the investigation and confirms the fix holds across subsequent cycles.
