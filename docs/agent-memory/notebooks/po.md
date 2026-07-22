# PO Notebook

_Last: 2026-07-22T17:25Z (cron-audit push/deploy sequencing — push WITHHELD, 5 rows minted, WIP held at 2)_

## Tick 2026-07-22T17:01–17:25Z — dev-mcp-server RETURN: push gate, rebuild, accept-new ruling

**PUSH WITHHELD.** PUSH-AUTONOMY-1 is a 3-way AND; I RAW-verified each instead of trusting the summary:
(a) supervised cascade dev+**QA**+PO → **FAIL**, no QA leg ever ran; (b) targeted/merge-gate suite 0 fail → PASS; (c) `bun tsc --noEmit` → PASS, re-run myself, rc=0. One hard fail ⇒ gate not green. PUSH-AUTONOMY-1 removed the USER from the loop, not QA. 12 commits sit unpushed. → `BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA`, head.next_agent=qa.

**Tested the load-bearing "41 pre-existing" claim rather than accepting it.** Full suite at BOTH ends of an isolated worktree pinned to base `3509a3974`: BASE 14600 pass/42 fail/1205 files · HEAD 14651 pass/**42** fail/1209 files (dev-mcp-server said 41 — not reproducible, so no exact-count argument is admissible). Fail sets 41/42 identical; the 1 swap is bidirectional flake. Also A/B'd the highest-risk cluster on its own — tool-REGISTRATION tests, risky because the change touched `debugTriggerRoutes.ts` + 5 `*DebugTriggerTool.ts` — 39 pass/0 fail at BOTH. **Zero net new regressions.** Characterisation confirmed, arithmetic not.

**accept-new RULING — premise disproved.** `sshExec.ts` justifies yes→`accept-new` with "could never have succeeded for ANY caller since inception". Git disagrees: `b741c5634` (task-1779c, **QA APPROVED**, 04-30) shipped `openssh-client` AND `ENTRYPOINT ["/entrypoint.sh"]` (ssh-keyscan seeds known_hosts at boot). `6165aa3b4` "rebase Dockerfiles Debian→Ubuntu" silently deleted both, unmentioned. `entrypoint.sh` is still tracked+clean but referenced by NOTHING — dead code ~2.5 months. It worked at inception; a rebase reverted it. Ruling: `accept-new` = stopgap only; durable fix is un-reverting the QA-approved wiring, NOT new hardening. Rejected router's build-time keyscan (couples image build to a VPS that is unreachable *right now*). Rejected verbatim restore (`set -e`+`exit 1` on keyscan fail would turn a VPS outage into total mcp-server death — all 88 crons). Also: `accept-new`'s "still rejects a CHANGED key" is near-illusory here — nothing mounts `/root/.ssh`, so known_hosts is ephemeral ⇒ TOFU on EVERY recreate, not once.

**Rebuild HELD, not dispatched (deviation).** Deploying 17 un-reviewed files whose one new capability (SSH) is unreachable anyway buys nothing today and restarts the 88-cron container. Refusing the push while deploying the same code is incoherent. Next Sunday window 07-26 ⇒ slack. Also: I have no spawn tool — handoff is via head.

**Rows minted (5, all → backlog; WIP untouched at 2/2):** `BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA` · `OPS-REBUILD-MCP-SERVER-OPENSSH` (blocked on QA; baseline image `sha256:c5a2c0f7…` + the 3 hard constraints recorded) · `VERIFY-FIX-VPS-SSH-TRIGGER-FAIL-LOUD-REALDATA` (blocked on the SAME user gate as FIX-VPS-SYSTEMD-STARTLIMIT-HARDENING, with a loud `do_not_misread`: a timeout before the gate clears is NOT evidence the fix is wrong) · `FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION` · `FIX-CRON-SSCCHECKERJOB-DEAD-87D`.
Closed `TRACK-CRON-AUDIT-SERVER-PLANE`→DONE. Updated existing `FIX-MCP-SUITE-HEALTH-BASELINE` (grep-first found it; baseline drifted 40→42) instead of minting a dup.

**sscCheckerJob**: corroborated independently — absent entirely from live `get_cron_health` 7d (80 jobs listed); admissible because it DOES call `recordJobRun`. Shared failure mode = **name-binding gap** (`job_name` ≠ CRONS key ⇒ dies unalarmed), patched for 2 known cases across two hand-maintained maps that had already drifted; row carries the class-fix. `dataAuditJob:weekly` may be a 2nd live-dead job — flagged verify-before-assuming.

## Carry-over
- **WIP=2/2** (DESIGN-COWORK-FANOUT pm + FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD). Nothing promoted this tick — correctly held, not forced.
- Next hop **qa** (head set). Chain: QA APPROVE → push → CI green → unblock ops rebuild → (after VPS gate) real-data verify.
- P0 HOL row `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` still starving behind WIP — carried from the 17:22Z peer tick, still the only ready P0 burning a prod slot daily.
- **Concurrent-peer hazard hit twice:** peer po tick wrote this notebook at 17:22Z uncommitted (nearly destroyed by my overwrite), and its commit `8f1bb3074` then swept my orch-state rows under ITS message. Data safe both times, attribution wrong once. Verified my rows/head/TRACK are committed before proceeding.
- 42-fail suite baseline is a STANDING red that makes any literal full-suite "0 fail" reading of the push gate permanently unsatisfiable — gate text actually says "targeted/merge-gate suite". Worth pinning that reading in dev-standards.
- No push (my own ruling); no ops dispatch (held).
