# Decision Journal — sprint WORKFLOW-FLUIDITY — agent-father

## WF-1 — FAIL-LOUD-STOP-RELEASE
**task_id:** WF-1
**agent:** agent-father
**date:** 2026-06-06
**sprint:** WORKFLOW-FLUIDITY

### what-considered
Only path: STOP paths in developer/qa/fixer/dev-team flows must release the sprint-task lock
and reset .head to idle before EXIT. The pattern chosen is:
(a) task_release via call_tool — for agents with MCP gateway binding (developer, qa in main-terminal
    session context). Best-effort: ok=false acceptable.
(b) Atomic jq .head idle-reset — for ALL agents regardless of MCP binding (jq + temp→mv is
    executable in any bash context; no MCP gateway needed).
(c) For fixer: no task_release (QA holds the lock, not fixer). .head idle-reset only.
(d) For dev-* agents under WF-3 ruling pending: task_release is unreachable. Documented in step 0
    of fail-loud-protocol.md with a pointer to WF-3. TTL expiry (3600s) is the fallback until WF-3
    resolves. .head idle-reset IS executable by all agents.

### why-change
Root cause (F-12 + F-2 from audit): a fail-loud STOP leaves sprint-task lock held for ≤3600s and
.head.status = "in_progress" for ≤24h. dev-team Step 0b pipeline-resume fires on "in_progress"
→ re-spawns same agent → same STOP condition → bounded livelock (up to 24 futile cron cycles).
.head idle-reset is the key fix: it closes the pipeline-resume re-spawn loop immediately.
task_release closes the lock hold window (from ≤3600s to near-zero).

### files-changed
- docs/agents/developer/flow/main.md: STOP-RELEASE block added to step 4 (depends_on) and step 5
  (knowledge fail-loud) as a shared block reference. Both STOP paths now run task_release + .head
  idle-reset before send_telegram + EXIT.
- docs/agents/qa/flow/main.md: Error Boundary pointer annotated with WF-1 STOP-RELEASE block.
  CHANGES_REQUESTED path deliberately NOT touched (fixer still needs the lock — confirmed intentional).
- docs/agents/fixer/flow/main.md: Error Boundary annotated with .head idle-reset only (no
  task_release — fixer doesn't hold the sprint-task lock).
- docs/agents/dev-team/flow/main.md: Step 0b gains BLOCKED-task check before the 24h expiry guard.
  BLOCKED → head reset idle + JUMP TO drain-signals (PO triage). Closes the futile re-spawn path.
- docs/protocols/fail-loud-protocol.md: Error Boundary gains step 0 (STOP-RELEASE) before steps 1-4.
  This makes the fix fleet-wide durable: any future flow that loads this protocol inherits the pattern.

### option-rejected
NOT adding task_release to fixer (would require fixer to hold its own lock; QA is the lock holder
per task-lock-protocol.md § claim-pass pattern; changing this would require a wider refactor).
NOT adding task_release to cowork agents (cowork agents are not in the dev-team pipeline; they use
a different exit pattern via cowork-error-boundary skill).

### dry-run-trace-location
docs/handoffs/WF-1-dry-run-trace.md (AC-WF1-8 annotated trace)

### ac-status
- AC-WF1-1: PASS — developer STOP paths call task_release before EXIT
- AC-WF1-2: PASS — developer STOP paths write .head idle atomically before EXIT
- AC-WF1-3: PASS — QA error-boundary block added (pre-verdict only, not CHANGES_REQUESTED)
- AC-WF1-4: PASS — fixer error-boundary block added (.head idle-reset, no task_release needed)
- AC-WF1-5: PASS — dev-team Step 0b BLOCKED-task guard added before 24h check
- AC-WF1-6: PASS — fail-loud-protocol.md Error Boundary step 0 added
- AC-WF1-7: PASS — no apps/ changes; git diff --stat shows docs/agents/ + docs/protocols/ only
- AC-WF1-8: PASS — dry-run trace in docs/handoffs/WF-1-dry-run-trace.md
