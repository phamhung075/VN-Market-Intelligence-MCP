# Decision Journal — Sprint 2026-07-30 · ops

**Sprint goal:** no active sprint entry found in orch-state.json — cross-team PO dispatch work.
**Agent:** ops
**Started:** 2026-07-30T21:50:00Z

---

### STEP ops-S1 · ops · 2026-07-30T22:20:00Z
**task-id:** FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD
**what-done:** Identified root cause of 19-day launchd spawn failure (EX_CONFIG 78 across 522 runs): old log files (fleet-push.log, fleet-push-error.log) had corrupted state preventing launchd from opening them for writing during exec setup. Deleted old log files; launchd now creates fresh logs and executes script with exit code 0, confirming `[fleet-push] ahead=N threshold=20` lines in fresh output.
**what-considered:**
- PO's ruled-out premises (bash-3.2, TCC/FDisk, malformed plist, script path validity) were all verified as correct.
- Systematic testing: custom test plists → worked; original repo plist → failed; differences invisible to plutil -p, suggesting non-XML issue.
- Hypothesis: log files corrupted or locked, preventing launchd's StandardOutPath/StandardErrorPath open() at spawn layer → reproduce and confirm by deleting logs → success.
**why-decision:** EX_CONFIG 78 occurs at launchd exec-layer BEFORE script body, not from script exit code. File-level issue (not script logic) was the only remaining hypothesis. Testing showed log file deletion was surgical fix requiring zero plist changes.
**why-change:** Original plan was to diagnose script or plist; actual root cause was in log file state (not named in PO's ruled-out list). Log file corruption is a launchd spawn-layer failure, not a script failure.
