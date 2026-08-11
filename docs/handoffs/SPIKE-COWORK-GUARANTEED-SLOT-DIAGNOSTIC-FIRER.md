---
sprint: SPIKE-COWORK-GUARANTEED-SLOT
branch: spike/guaranteed-slot-diagnostic-firer
size: S
zone: cross-service/ops
depends_on: []
blocks: ["SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING"]
---

## TLDR

Check whether `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` and `com.vn-market.cowork-guaranteed-slot-firer` launchd agent are being **invoked** or **not invoked** at all. This cheap diagnostic ($0 cost) decides whether to investigate launchd/plist (invocation stopped) or dispatcher wiring (invocation blocked). All 8 guaranteed:true cowork slots have been dark for 67h since 2026-08-08T20:23:36Z; non-guaranteed slots on same dispatcher run normally (stuck state, not outage).

---

## [PM] Planning Context

### Zone
**cross-service/ops** — Launchd agent invocation verification (system level)

### Acceptance Criteria
- [ ] Launchd agent state verified: `launchctl list | grep com.vn-market.cowork-guaranteed-slot-firer`
  - Note return status code and output (loaded vs unloaded vs error)
  - Capture full output line if present
- [ ] Firer script log checked for entries after 2026-08-08T20:23:36Z
  - Exact log file location: scripts/agents-flow/cowork-guaranteed-slot-firer.sh (or wherever it writes logs)
  - If logs found after timestamp: firer WAS invoked (no invocation problem)
  - If NO logs after timestamp: firer was NOT invoked (launchd/plist problem)
- [ ] Independent corroboration from agent notebooks confirms firer status
  - docs/agent-memory/notebooks/unified-agent.md (should have entry if chef-morning fired on those dates)
  - docs/agent-memory/notebooks/fb-market-poster.md (should have entry if fb-daily fired)
  - docs/agent-memory/notebooks/digest-predict.md (should have entry if digest-daily fired)
  - Check mtime of notebook files: all stuck at 2026-08-08 or earlier
- [ ] One-page findings doc created at: `docs/data/cowork-guaranteed-slot-findings-firer-status-20260811.md`
  - Section 1: Launchd output (verbatim)
  - Section 2: Firer log evidence (last 10 lines if logs exist; "no logs found after 2026-08-08T20:23:36Z" if none)
  - Section 3: Diagnosis (one of: "Invocation stopped (launchd/plist issue)" or "Invoked but no fires (wiring issue)")
  - Section 4: Evidence summary (bullet points)
  - Section 5: Next step (if invocation stopped → ops/infrastructure; if invoked-but-failing → Task 2)

### Files to read first
- **scripts/agents-flow/cowork-guaranteed-slot-firer.sh** (the firer script itself; check for log output directive, log file location)
- **docs/data/cowork-schedule.json** (current state of all 8 guaranteed:true slots, .last_fired fields, _superseded_by fields)
- **docs/agent-memory/notebooks/unified-agent.md** (mtime should indicate last run; should have cycle entries if chef slots fired)
- **docs/agent-memory/notebooks/fb-market-poster.md** (mtime should indicate last run)
- **docs/agent-memory/notebooks/digest-predict.md** (mtime should indicate last run)

### Files to create
- **docs/data/cowork-guaranteed-slot-findings-firer-status-20260811.md** — findings doc (launchd state, firer logs, diagnosis, next step)

### Files to modify
- None (this is a diagnostic task; no code changes)

### Dependencies
- None (can start immediately)

### Blockers unblocked by this task
- SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING (tier 2) — waits for findings from this task

### Knowledge needed
- Basic launchd knowledge (launchctl list, plist files, agent loading/unloading)
- Log file navigation (finding last entries, timestamps)
- docs/policies/dev-standards.md § Git conventions
- docs/protocols/fail-loud-protocol.md § Error reporting

---

## [PM] Background

### The Problem
All 8 enabled guaranteed:true cowork slots have stopped firing since 2026-08-08T20:23:36Z (~67 hours):
- chef-morning (cron 15 5 * * 1-5) last_fired 2026-08-07T05:19:06Z (missed Mon/Tue)
- chef-eod (cron 45 8 * * 1-5) last_fired 2026-08-07T08:54:12Z (missed Mon/Tue)
- chef-evening (cron 45 19 * * *) last_fired 2026-08-08T19:54:58Z (missed Fri/Mon)
- fb-daily (cron 15 9 * * 1-5) last_fired 2026-08-07T09:23:01Z (missed Mon/Tue)
- fb-weekend (cron 13 13 * * 6,0) last_fired 2026-08-08T13:24:06Z (missed Sun)
- digest-daily (cron 30 17 * * *) last_fired 2026-08-08T17:38:08Z (missed Fri/Mon)
- digest-sunday (cron 47 13 * * 0) last_fired 2026-07-19T13:49:28Z (3 Sundays missed)
- tnb-audit (cron 13 20 * * *) last_fired 2026-08-08T20:23:36Z (missed Fri/Mon)

### Why This Is Critical
- **User-facing output plane down:** MARKET dishes, Facebook posts, digests, quality audit (the agent whose job is to catch issues is itself dark)
- **Stuck state, not outage:** Non-guaranteed slots on same dispatcher (market-watcher, alert-commander, news-scout) tick normally → rules out general dispatcher failure
- **Silent failure:** Zero escalation on BUG channel despite 67 hours of production silence

### The $0 Diagnostic Question
This task answers: **Did the firer stop being INVOKED, or is it INVOKED but FAILING?**
- If invocation stopped → launchd/plist problem (ops/infrastructure scope)
- If invocation but no fires → dispatcher wiring problem (Task 2 scope, this SPIKE's original hypothesis)

This answer **decides everything** for downstream investigation.

### Architecture Context
Architect brief (docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md) marks this as "findings doc, no code change" — 3-caller shared module (cowork-match-slots.js) already exists. Findings narrow the actual fix scope.

### Related Tickets
- **SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING** (parent, priority P0, this task's context)
- **BA-COWORK-GUARANTEED-SLOT-CATCHUP** (epic, contains FR-1..9 work; this SPIKE is subsumed but not yet closed)
- **FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE** (related launchd/dual-plane system issue)
- **FIX-CHEF-MIDFLOW-BAIL-DETERMINISM** (related agent-side failure mode, P1)

---

## [Developer] Checklist

Use this once you pick up this task:

1. **Launchd Agent State**
   ```bash
   launchctl list | grep com.vn-market.cowork-guaranteed-slot-firer
   # Record: loaded/unloaded/not found
   # If error: capture it
   ```

2. **Firer Script Location & Log Config**
   - Read `scripts/agents-flow/cowork-guaranteed-slot-firer.sh`
   - Find the log output directive (where does it write logs?)
   - Likely locations: `~/.vn-market/logs/`, `docs/data/`, `/tmp/`, or stdout only

3. **Check Firer Logs**
   ```bash
   # If logs found, show last 20 lines:
   tail -20 <log-file>
   # Check timestamps: any entries after 2026-08-08T20:23:36Z?
   ```

4. **Corroborate with Agent Notebooks**
   - If firer was running, downstream agents (unified-agent, fb-market-poster, digest-predict) should have cycle entries
   - Check mtime of their notebooks: if stuck at 2026-08-08 or earlier, corroborates "no fire since that date"

5. **Diagnose**
   - **If launchd says "not loaded":** agent was unloaded or plist is broken
   - **If logs are absent after cutoff date:** invocation stopped (launchd problem)
   - **If logs exist and show invocation but no fires:** supervisor/wiring problem (go to Task 2)

6. **Write Findings Doc**
   - Create `docs/data/cowork-guaranteed-slot-findings-firer-status-20260811.md`
   - Verbatim launchd output
   - Log evidence or "no logs found"
   - Clear diagnosis: invocation stopped vs invoked-but-failing
   - Evidence bullets
   - Recommendation: escalate or proceed to Task 2

7. **Commit & Move Task to REVIEW**
   - Commit findings doc: `git add docs/data/cowork-guaranteed-slot-findings-firer-status-20260811.md`
   - Commit message per docs/policies/commit-convention.md
   - Update task board (via pm/po) to move this task to REVIEW

---

## [QA] Review Criteria

- [ ] Launchd output is verbatim (not paraphrased)
- [ ] Log file location is documented (where logs actually are, not guessed)
- [ ] Last log entry timestamp is clear (if logs exist)
- [ ] Diagnosis is unambiguous: invocation stopped OR invoked-but-failing
- [ ] Evidence supports diagnosis (logs + launchd state + notebook corroboration align)
- [ ] Findings doc is self-contained (can be read without other context)
- [ ] Next step is clear: ops escalation vs Task 2 wiring trace

---

## Open Questions for Developer

- Where does `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` write its logs? Stdout only, or to a file?
- Has the plist file (`com.vn-market.cowork-guaranteed-slot-firer.plist`) been edited or moved since 2026-08-08?
- Are there any system logs (launchd errors) that mention this agent after 2026-08-08?

---

**End Handoff**
