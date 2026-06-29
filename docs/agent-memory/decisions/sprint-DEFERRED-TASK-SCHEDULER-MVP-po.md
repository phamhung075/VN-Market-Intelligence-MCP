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

### STEP po-S3 · po · 2026-06-29T20:56:06Z
**task-id:** BA-DEFERRED-SCHEDULER (review gate → APPROVED)
**what-done:** Reviewed BA spec vs LOCKED brief AC-1..AC-12 + 8 STs — faithful 1:1 transposition, zero scope creep (spec §0 mirrors brief Phase-2 OUT list verbatim: headless sweeper / adaptive retry / cron-replacement / firing-recovery / terminal-pruning / retention). APPROVED; ruled the 3 advisory Qs (full directives written into spec §0.1 PO Review Directives + a concise mirror on sprint entry).
**what-considered:**
- Q1 done-vs-fired: MVP terminal success = `fired`; no `done`-write path, no `mark_task_done` tool; `done` stays in CHECK enum (reserves Phase-2). CRITICAL for QA: AC-11 lifecycle-completeness MVP terminal-set = {fired,failed,expired,cancelled} (brief's {done,...} list presumed a Phase-2 confirm callback MVP does not build) — verify `fired` as the valid terminal, else false lifecycle-incomplete fail.
- Q2 helper registration: spec §3.2/§4.4 "internal TS, NOT registered" CONTRADICTS its own §5.2 + brief §d pseudocode which call claim_due/complete/expire/fail via call_tool. The sweeper is an LLM agent — it can ONLY act via the gateway `call_tool`, never an in-process fn. RULE: the 4 helpers MUST be gateway-reachable (privileged); public surface stays EXACTLY the 3 tools (schedule/cancel/list); ordinary agents MUST NOT fire-claim/force-complete. Mechanism (restricted package vs single privileged `drain_due_scheduled_tasks` tool) = dev's choice; relax §4.4 verify wording "not in public agent packages" (not "absent from list_server_tools" — gateway-reach needs server registration). Document boundary in ST-8.
- Q3 prompt threshold: RAW-checked SignalRowSchema (orchStateSchema.ts:175) — NO prompt/body field, `.passthrough()` but consumer (dev-team Step 0a) reads `payload_ref`. RULE: DEV path ALWAYS writes companion `docs/signals/one-shot-<id>.json` + sets payload_ref; `summary` stays the one-liner; NEVER embed prompt in summary. Drop the 500-char threshold (needless). COWORK passes prompt direct to Agent() — no file.
**why-decision:** All 12 ACs traced to blocking gates, all 8 STs covered, Phase-2 held OUT — BA reported NO blockers and none found. The 3 Qs are PO-decidable directives (BA invited the ruling), NOT spec defects; Q2's contradiction is resolved by a wording-relax directive, no round-trip to BA needed. Chain advances po→pm.
**why-change:** No change from plan — design SSOT locked; PO ruled the 3 advisories + pinned the helper-registration contradiction so dev/QA don't stall.

### STEP po-S2 · po · 2026-06-29T20:33:25Z
**task-id:** DEFERRED-TASK-SCHEDULER-MVP
**what-done:** Hardened the orch-apply write path after a shell-quoting failure.
**what-considered:**
- Inline single-quoted jq program (broke: embedded SQL snippets `status='pending'`, `'integer'` closed the shell quote → shell tried to exec `id:`) vs jq `-f program.jq`.
**why-decision:** Moved the builder to `scratchpad/dts-build.jq` loaded with `-f` + `--arg now`; apply via `--slurpfile` piped to scripts/orch-apply.sh (Zod tri-point PASS, atomic rename). The 90 coherence warnings are pre-existing other-sprint status-in-lane drift, non-blocking.
**why-change:** No design change — write-mechanism fix only.
