# Decision Journal — Sprint DEFERRED-TASK-SCHEDULER-MVP · po

**Sprint goal:** at(1) one-shot deferred-task scheduler (verify-loop MVP) — decomposed from architect brief 2026-06-29.
**Agent:** po
**Started:** 2026-06-29T20:33:25Z

---

### STEP po-S1 · po · 2026-06-29T20:33:25Z
**task-id:** DEFERRED-TASK-SCHEDULER-MVP (BA-DEFERRED-SCHEDULER + DTS-ST1..ST8)
**what-done:** Decomposed APPROVED brief into a sprint goal + BA spec task (ready[]) + 8 ST backlog rows (all → dev-mcp-server) with a depends DAG and AC-1..AC-12 mapped onto STs as QA gates; one atomic orch-apply write.
**what-considered:**
- BA task lane: ready[] (proven MARKET-INDICATOR pattern, dev-team picks up natively) vs backlog[] (avoid 2nd-BA race). Chose ready[] — coding WIP (dev-mcp-server in_progress=0) is the real cap and all 8 STs stay BACKLOG; ba spec-authoring writes distinct REQ docs, no zone conflict; router intent-gate serializes by intent key.
- ST ordering: serialize on file overlap (ST-1/ST-3/ST-6 all touch coordinationStore.ts; ST-4 touches bootstrap) via depends chain ST-1→{ST-3,ST-6}→ST-2→{ST-4,ST-5,ST-7,ST-8}.
- system-auditor routing (user-flagged open decision): COWORK-spawn vs DEV-signal.
**why-decision:** Confirmed brief default DEV(signal) — system-auditor is explicitly excluded from the cowork-team dispatcher (Team Boundary: maintenance agents invoked by main terminal/self-cron, NEVER cowork-spawned); spawning it directly would violate that boundary. G3 bug-re-probe drains as a DEV signal_queue row; PO triage decides whether to spawn a probe. No deviation noted in sprint goal.
**why-change:** No change from plan — brief design locked with user; PO only decomposed + ruled the one open decision.

### STEP po-S2 · po · 2026-06-29T20:33:25Z
**task-id:** DEFERRED-TASK-SCHEDULER-MVP
**what-done:** Hardened the orch-apply write path after a shell-quoting failure.
**what-considered:**
- Inline single-quoted jq program (broke: embedded SQL snippets `status='pending'`, `'integer'` closed the shell quote → shell tried to exec `id:`) vs jq `-f program.jq`.
**why-decision:** Moved the builder to `scratchpad/dts-build.jq` loaded with `-f` + `--arg now`; apply via `--slurpfile` piped to scripts/orch-apply.sh (Zod tri-point PASS, atomic rename). The 90 coherence warnings are pre-existing other-sprint status-in-lane drift, non-blocking.
**why-change:** No design change — write-mechanism fix only.
