# Task Report: TASK_2008c — delete telemetry.md calendar arg + fail-loud pressure-read.md

date: 2026-08-23
outcome: APPROVED / DONE_VERIFIED (Direct-Commit Verify, branch:null, no commit id in status_note — located via git log on files[])

changed: docs/agents/cowork-team/flow/telemetry.md, docs/agents/cowork-team/flow/pressure-read.md. Commit `7beb78e07` confirmed ancestor of main.

verification: diff matches claim exactly — telemetry.md L15 calendar_status arg deleted (FR-A4, correctly leaves the distinct Step-6.1 payload field at :63 untouched); pressure-read.md gains CALENDAR_STATUS_DOMAIN 5-value enum + fail-loud (FR-A5). Line-count headers (163L/117L) verified via `wc -l`, exact match. No unit-test twin (documented — Step 4.3 is pure prose); accepted given TASK_2008a/b's own code+tests close the mechanism this doc wires into, and live docs/data/pressure-state.json (2026-08-23) shows a valid domain value ("weekend") flowing end-to-end.

verdict: APPROVED

### Issues
None.

Merge Status: DONE_VERIFIED, no merge (already on main). Board write: orch-state.json commit `90162fc4e`.
