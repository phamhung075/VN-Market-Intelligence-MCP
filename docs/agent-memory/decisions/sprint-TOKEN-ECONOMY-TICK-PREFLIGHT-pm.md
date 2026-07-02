# Decision Journal — Sprint TOKEN-ECONOMY-TICK-PREFLIGHT · pm

**Sprint goal:** Eliminate 80k tokens/hour idle burn from recurring cron ticks by moving deterministic MCP orchestration steps from LLM narration into shell scripts. Fixes 85% of cache-miss cascade over full session history.

**Agent:** pm (decomposition leg)
**Started:** 2026-07-02T00:00:00Z
**Handoff source:** architect (blueprint: docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md)

---

### STEP pm-S1 · pm · 2026-07-02T00:00Z
**task-id:** TOKEN-ECONOMY-TICK-PREFLIGHT
**what-done:** Read architect blueprint + spec; validated 3-WU decomposition; created task units with explicit AC + risk propagation; sequenced dev dispatch (shared helper first).

**what-considered:**

**Zone routing:** Architect confirmed ZONE=root (docs/agents + .claude/skills + scripts/agents-flow) — no apps/<service> touch. PM routes all 3 dev tasks to `developer` (generic), not dev-<service> specialist per `.claude/skills/zone-detect/SKILL.md` Tier-2.

**WU sequencing & dependencies:**
- WU-1 (cowork silent-path) and WU-2 (dev-team SF-1-first) both depend on shared helper `scripts/agents-flow/mcp-call.sh` — build once as part of WU-1 initial scope, WU-2 declares dependency.
- WU-3 (auditor Tier-1) is fully independent — pure shell (no MCP calls, reuses existing probe.sh). Safe to parallelize or sequence after WU-1.
- Decision: Include mcp-call.sh in WU-1 scope; WU-2 depends on it; WU-3 independent.

**Risk propagation (architect notes R1–R11):**
- **R1 (blocking-design, RESOLVED):** Live verification of JSON-RPC curl→SSE contract done; mcp-call.sh is the single shared implementation (not per-script reinvention).
- **R2 (WU-1 correctness):** Verdict JSON carries full claimed task objects (re-call would find nothing, orphaning rows). AC: verify full object payload in WU-1 DoD.
- **R3 (WU-1 minor):** SILENT-path emit uses last-known pressure state with safe default `"unknown"` for missing-file. AC: default handling + test edge case.
- **R4 (WU-1 spec prose):** Signal_queue draining stays inline in main.md WORK path (script does READ-ONLY count for SILENT gate only). AC: document fallback clearly; never delete drain logic.
- **R5 (WU-1 debt):** Retire pre-existing `scripts/agents-flow/cowork-tick-autosilent.sh` (dead code, incompatible strategy). Include in WU-1 commit with explicit line item.
- **R6 (WU-2 correctness-critical):** CronCreate/CronList/CronDelete unreachable from curl script. **Self-arm must move into CronCreate prompt text itself** (this session's crons survive restart). Unique to WU-2. AC: cron-detect-loop/SKILL.md Job 1 prompt FUNCTIONALLY CHANGES; self-arm FIRST, then preflight script, only conditionally read main.md on RUN.
- **R7 (WU-2 lock semantics):** Two distinct SKIP paths (SF-1 fail = no-hold; fire-election lost = release SF-1 then skip). Script must preserve distinction. AC: verify lock semantics byte-identical to flow.
- **R8 (WU-2 constraint #4):** Brief states RUN/SKIP; constraint #4 requires explicit ERROR verdict (symmetric to WU-1). AC: add ERROR handling to script + fallback to full flow on error.
- **R9 (WU-3 positive/reuse):** probe.sh already complete; fold A-20 (3x in-container probe) into it rather than duplicate. No new MCP calls needed. AC: extend probe.sh; mcp-call.sh out of scope for WU-3.
- **R10 (WU-3 output boundary):** Heartbeat → new dedicated file `docs/data/auditor-tier1-last-healthy.json` (NOT notebook, to avoid race with subagent writer). AC: atomic overwrite, verify file creation.
- **R11 (all 3 WUs, confirmed):** No WU script writes orch-state.json directly or indirectly. Design walkthrough verified.

**Verdict schema & fallback strategy:**
All 3 WUs emit compact JSON on stdout + matching exit code:
- WU-1: `{"verdict":"SILENT|WORK|LOST_ELECTION|DEFER|ERROR","tick":"...","drift_min":N,"slots":[...],"one_shots":[...],"new_signals":N,"detail":"..."}`
- WU-2: `{"verdict":"RUN|SKIP|ERROR","tick":"...","detail":"..."}`
- WU-3: `{"verdict":"ALL_GREEN|FAILURE","detail":"...","last_healthy_at":"..."}`

On ERROR or full-path failure: script exits non-zero → LLM falls back to original inline pseudocode (never silently skipped), full subagent path unchanged.

**why-decision:** Architect blueprint is complete, brownfield verified, highest-risk unknown (JSON-RPC mechanism) live-proven. Routing to `developer` (not specialist) respects zone constraint. Shared helper + sequencing prevents reinvention and ensures WU-2 unblocks. Risk notes integrated as explicit ACs so dev never loses context on correctness constraints or fallback semantics.

**why-change:** No change from architect plan. All 11 risk notes propagated as-is.

---

## Work Unit Decomposition

### WU-1 — Cowork silent-path script (dev: developer · zone: root/scripts+docs)
**Deliverables:**
- NEW `scripts/agents-flow/mcp-call.sh` (shared helper, ~150L, bash+jq, DRAIN-INJECTION-SAFE)
  - Contract: `mcp_call <tool_name> <json_args_via_jq>` → prints `.result.content[0].text` on stdout; non-zero exit + stderr on error
  - Base URL: `${MCP_HTTP_URL:-http://localhost:3000/mcp}` with fallback to `https://zenmidi.com/vn-market/mcp`
  - Bound params: `jq -n --arg name --argjson args` (never raw interpolation)
- NEW `scripts/agents-flow/cowork-tick-preflight.sh` (~200–250L)
  - Steps 1–8 per brief: TICK compute, presence/fire-election claim, claim_due_scheduled_tasks, blind guard, slot matcher, SILENT gate, emit_pressure_state (on SILENT) or verdict WORK
  - Verdict: one of SILENT/WORK/LOST_ELECTION/DEFER/ERROR
  - On SILENT: election lock released, no LLM reading main.md Step 4.2+
  - On WORK: locks held, LLM continues at Step 4.2 (signal drain, slot fan-out, etc.)
- HOUSEKEEPING: retire `scripts/agents-flow/cowork-tick-autosilent.sh` (dead code, contradicts telemetry.md; include deletion in commit with explicit AC note)
- MODIFIED `docs/agents/cowork-team/flow/main.md`
  - JUMP-TO table at top (SILENT/LOST/DEFER → done; WORK → continue at Step 4.2; ERROR → fallback to full flow)
  - Steps 0a/0b/0b.3/0c/1–4b collapse to single line: "run preflight script; based on verdict..."
  - All original pseudocode **stays inline** as fallback path (annotated as ERROR-recovery path, never deleted)
  - Steps 4.2–8 (signal drain, slot fan-out, spawn, telemetry, release) **unchanged** on WORK path
- UNCHANGED: cowork-match-slots.js (invoked as-is by preflight script)
- ANNOTATE (no functional change): leader-lock.md, blind-guard.md, match-slots.md — add header note that these are now reached only on ERROR fallback

**DoD:** Silent tick = 1 bash call + short JSON reply. Two-session election smoke: exactly one winner (AF-1 preserved). Error path: script failure → ERROR verdict → LLM re-reads full flow, never skips telemetry. Injected-fault test (simulate curl timeout, MCP tool error) proves fallback works.

**Risk focus:** R2 (full objects in verdict), R3 (safe defaults for pressure state), R4 (signal_queue count is read-only), R5 (retire dead script).

---

### WU-2 — Dev-team SF-1-first preflight script (dev: developer · zone: root/scripts+docs)
**Depends on:** WU-1 (mcp-call.sh)

**Deliverables:**
- NEW `scripts/agents-flow/dev-team-tick-preflight.sh` (~150–200L)
  - Steps: TICK compute (largest of {07,37} ≤ minute), presence claim/heartbeat, SF-1 claim (dev-team-cron-singleton, TTL=5400), fire-election claim (cron:dev-team:<TICK>, TTL=600)
  - Verdict: RUN (locks held → LLM reads main.md Step 0-PREFLIGHT onward) or SKIP (peer holds SF-1 → script sends WORK telegram, releases nothing it doesn't hold, exits)
  - ERROR: curl/timeout/malformed response → verdict ERROR, exit non-zero, fallback to full flow
  - Lock semantics preserved: SF-1 fail = no release (never held); fire-election lost = release SF-1 then skip (R7)
- MODIFIED `.claude/skills/cron-detect-loop/SKILL.md` — Job 1 `CronCreate` `prompt:` text **functionally changes** (R6, unique to this WU):
  - Instruction: self-arm FIRST (CronCreate calls inside itself or in prompt preamble), then run dev-team-tick-preflight.sh, only read main.md on RUN verdict
  - Rationale: CronCreate/CronList/CronDelete are CLI-native (unreachable from curl script); self-arm can only be LLM-narrated
  - Effect: every tick (RUN and SKIP both) still arms crons for session survival; orthogonal to which session wins the tick
- MODIFIED `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT:
  - Old: START telegram → presence claim → SF-1 claim → fire-election claim → GCC-PREFLIGHT read → HEAD.lock/worktree-GC (inline pseudocode)
  - New: "run preflight script; on RUN → proceed to GCC-PREFLIGHT and HEAD.lock/worktree-GC; on SKIP/ERROR → fallback to full flow"
  - All original inline pseudocode **stays** as fallback path (never deleted)
  - GCC-PREFLIGHT + HEAD.lock/worktree-GC becomes first .md content read on RUN (no duplicate work)

**DoD:** Skip tick ≤ 2 tool calls (~1k tokens). Lock semantics byte-identical to flow (SF-1 TTL=5400, election TTL=600, release-at-end on RUN unchanged). ERROR verdict explicit (R8); fallback re-reads full flow. Injected-fault test (MCP timeout, tool error, malformed JSON).

**Risk focus:** R6 (self-arm prompt relocation, CRITICAL), R7 (two SKIP paths with different semantics), R8 (ERROR verdict).

---

### WU-3 — Auditor Tier-1 shell healthcheck (dev: developer · zone: root/scripts+docs · independent)

**Deliverables:**
- NEW `scripts/agents-flow/auditor-tier1-probe.sh` (~100–150L)
  - Steps: docker ps health-state sweep, curl :3000/health, curl :3001/, disk headroom (df), container mem creep
  - Thresholds from `docs/agents/system-auditor/flow/tier1-probe.md` (existing A-01..A-32 verdict rules, A-20 multi-probe)
  - Verdict: ALL_GREEN (exit 0) or FAILURE (exit non-zero, JSON detail)
  - On ALL_GREEN: write heartbeat to `docs/data/auditor-tier1-last-healthy.json` (atomic JSON: `{"last_healthy_at":"ISO8601","checks":{...}}`), exit — **no subagent spawned**
  - On FAILURE: print verdict JSON to stdout, exit non-zero → cron LLM spawns system-auditor subagent (full flow, unchanged from today)
- MODIFIED `docs/agents/system-auditor/probe.sh` (extend, not duplicate):
  - Fold A-20 3x-probe sequence (pdf-extractor multi-check loop) into probe.sh itself as a new function or inline section
  - This keeps probe.sh the single SSOT evidence collector; WU-3 wrapper layers thresholds on top
  - No new tool calls from probe.sh itself
- MODIFIED `.claude/skills/cron-detect-loop/SKILL.md` — Job 2 `CronCreate` `prompt:` text:
  - Instruction: run auditor-tier1-probe.sh; spawn system-auditor subagent **only on non-ALL_GREEN verdict**
- ANNOTATE (no functional change) `docs/agents/system-auditor/flow/tier1-probe.md`:
  - Header note: "Tier-1 now has a shell pre-gate (auditor-tier1-probe.sh). Full Tier-1 logic below is reached only on shell failure or as fallback. Tier-2/Tier-3 unchanged."

**DoD:** Healthy T1 tick spawns nothing (~10 seconds, ~0 tokens). Failure path proven by injected fault (stop a canary container, stub a failing curl). Guard against passive health masking dead data: script checks last-success-age (age of last successful all-green write to heartbeat file), not just process-up.

**Risk focus:** R9 (reuse probe.sh, no duplication), R10 (heartbeat file, not notebook), R11 (no orch-state writes).

---

## Dispatch Sequencing

1. **WU-1 (cowork silent-path):** Ship first. Includes mcp-call.sh + retirement of dead script. Low risk, high value (4 cowork ticks/hour silent = 4L payload reads eliminated). Unblocks WU-2.
2. **WU-2 (dev-team SF-1-first):** Depends on mcp-call.sh; critical prompt change in cron-detect-loop/SKILL.md Job 1. Moderate risk (lock semantics), high value (2 dev-team ticks/hour). Can start once WU-1 is in CI.
3. **WU-3 (auditor Tier-1):** Independent; pure shell; lowest risk. Can parallelize with WU-2 or sequence last. Highest value per-tick (eliminates ~48 subagent spawns/day).

**Target:** All 3 WUs in a single commit per developer session (coordinated, not three separate PRs). No new top-level board rows (WIP slot already held in lane `in_progress`).

---

## Validation & Acceptance

- All 3 scripts exit with explicit verdict JSON + matching exit code (never silent success/failure)
- Fallback paths (full flow pseudocode inline, unchanged) tested for each WU on ERROR condition
- Lock semantics verified byte-identical to existing flow (no new/lost holds, same TTLs, same release points)
- mcp-call.sh DRAIN-INJECTION-SAFE (bound params only, no raw interpolation)
- Heartbeat file (WU-3) atomic, no race vs subagent writer
- Each WU includes explicit test case (injected fault or synthetic condition)

---

## Output Hand-off

**Head.next_agent:** developer (generic, per zone=root)
**First dispatchable WU:** WU-1 (cowork silent-path) — unblocks WU-2, includes shared helper mcp-call.sh
**Task chain:**
1. developer: WU-1 (cowork-tick-preflight.sh + mcp-call.sh + retire autosilent + modify main.md + annotate fallback paths)
2. developer: WU-2 (dev-team-tick-preflight.sh, modify main.md + cron-detect-loop/SKILL.md prompt)
3. developer: WU-3 (auditor-tier1-probe.sh, extend probe.sh, modify cron-detect-loop/SKILL.md Job 2, annotate tier1-probe.md)

**Coordination:** CLAUDE_CODE_SESSION_ID=d3292ca4-a9ab-471a-8d8c-d0c723546258 (router session, no cross-session lock required for pm→dev handoff; same session thread).

---

### STEP pm-CLOSEOUT · pm · 2026-07-02T15:45:00Z
**task-id:** TOKEN-ECONOMY-TICK-PREFLIGHT
**what-done:** Validated all 3 WUs against DoD and developer-journal deviations; moved sprint to done lane; created QA backlog entry; set head to idle.

**what-considered:**

**WU-1 verdict: ACCEPT**
- Developer corrected brief's inaccuracies (mcp_call naming vs typo prose, signal_queue schema field mismatch, pressure_mode missing from live schema) against brownfield reality (live `orch-state.json`, real tool signatures, live-tested transport).
- Fixed real bash-brace-parsing bug (`"${var:-{}}"` → `{}}` corruption) — necessary correctness fix.
- All deviations maintain R1-R5 risk boundaries; corrections strengthen accuracy without changing architecture.
- Test verdict: 20/20 mocked regression pass, live-verified mcp-call transport against real mcp-server.

**WU-2 verdict: ACCEPT with QA flag**
- Lock semantics (R7) correctly implemented: two distinct SKIP paths preserved (SF-1 fail = no-hold; fire-election lost = release SF-1 then skip); verified by tests T3/T4.
- Error handling (R8) strengthened beyond WU-1: added `_is_json()` guard on SF-1/fire-election/presence responses (T7/T8 verify malformed JSON → ERROR, not silent SKIP masking transport failure as lock contention).
- Fire-election ERROR releases SF-1 (prevents self-inflicted 90-min deadlock on re-entrant claim); documented in script header; verified by T6/T8.
- Presence step honors main.md's "never a gate" instruction: best-effort, logged on failure, always proceeds to SF-1 (T9/T10 verify RUN reachable despite presence error).
- START telegram dropped from script (token-economy tradeoff; <2 tool calls DoD constraint); survives in ERROR-fallback body.
- gcc-preflight anchor split (jump-to SKILL constraint: anchor must sit immediately above heading, not mid-fenced-code); split into two headed sub-sections, both verbatim.
- **QA Flag (documented in WU-2 developer-S2):** `cron-dev-team.md` deliberately left untouched. SKILL.md documents Job entries as "verbatim copies" but WU-2 modified only `.claude/skills/cron-detect-loop/SKILL.md` Job 1 prompt, not the SSOT file. Developer rationale: SKILL.md is implementation-detail doc; copying complex self-arm+script-branching logic into conceptual-shape reference (cron-dev-team.md) bloats it. However, the "verbatim copy" invariant is now broken. QA decision routing: (A) sync cron-dev-team.md to include self-arm+script-branching (true verbatim SSOT), OR (B) update SKILL.md SSOT pointer to document the intentional one-Job exception and leave cron-dev-team.md as-is. Created backlog entry QA-CRON-DEV-TEAM-SSOT-DIVERGENCE; router dispatches QA separately.
- Test verdict: 37/37 mocked regression pass; zero real task_claim/task_heartbeat/task_release calls; re-verified WU-1 (20/20) still passes (no interference).

**WU-3 verdict: ACCEPT**
- Deviations resolve underspecified prose without changing R9/R10 architectural boundaries:
  - Mem-creep: single-point 85% threshold (consistent with A-30 WARN boundary, not a true trend detector); acceptable for pre-gate tripwire role — full graduated severity work deferred to subagent on FAILURE.
  - Endpoint scope: literal implementation (curl :3000/health + curl :3001/, not full 5-endpoint sweep); matches brief's "fast narrow tripwire" intent; full-fleet sweep stays exclusively in subagent's probe.sh on any FAILURE.
  - Passive-health-masking: two complementary layers — (a) script verifies heartbeat write succeeds (downgrades to FAILURE if write fails, T14 injected-fault proven), (b) SKILL.md Job 2 prompt does cross-tick staleness check (>60min heartbeat age → escalate despite ALL_GREEN verdict). Reconciles DoD "not just process-up" concern (script layer) with "check last-success-age" assignment to LLM/data-file (deliverable 4).
  - `last_healthy_at` on FAILURE: reports PREVIOUS green timestamp from existing heartbeat file (or "never" if never succeeded), not current-run timestamp — useful for staleness detection even on failing ticks (T12/T13 proven).
  - A-20 fold-in: kept signal emission + verdict logic in tier1-probe.md (unchanged), moved only evidence-collection loop into probe.sh (SSOT for probe's job). Honors R9 ("no new tool calls from probe.sh") and keeps MCP-dependent logic out of pure-shell script.
  - bash 3.2.57 compat: avoided arrays (bash 4.4+ only), used string accumulator; used bash 2.0+ idiom `${!#}` for last positional arg (confirmed working on live 3.2.57).
- Test verdict: 32/32 mocked regression pass (function-override on docker/curl/df, zero real calls); live-verified end-to-end against running fleet (RC=0, heartbeat written, A-20 pass_count=3/3); re-verified WU-1/WU-2 full suite (32+20+37=89 tests, all pass, no interference).

**why-decision:** All three WUs' implementations are brownfield-sound and correctly propagate the architect's R1-R11 risk notes. Deviations are narrowly scoped (prose inaccuracies corrected against live schema, underspecified algorithm details resolved within risk boundaries, repo invariant constraints satisfied). Lock semantics byte-identical to original flows (R7 verified). Error handling explicit (R8 strengthened). No new orch-state writes, heartbeat-file isolation preserved (R10), probe.sh evidence-collection SSOT (R9). QA flag documented and routed as a separate backlog entry per PM flow § 4 (blocked tasks + deviations).

**why-change:** No architecture change from PM/architect plan. All deviations are documented in developer journal as implementation-detail corrections and necessary guardrails.

**orch-state updates:**
- `.task_board.in_progress`: removed TOKEN-ECONOMY-TICK-PREFLIGHT
- `.task_board.done`: added TOKEN-ECONOMY-TICK-PREFLIGHT (unchanged task object)
- `.task_board.backlog`: added QA-CRON-DEV-TEAM-SSOT-DIVERGENCE (status=BACKLOG, owner=qa, depends=[])
- `.head`: status=idle, active_task_id=null, next_agent=null, updated_by=pm; note includes operational reminder (cron re-arm needed for prompt changes to take effect) + QA routing note

**Note:** Cron Jobs 1+2 prompt text changes (self-arm sequence, shell pre-gates, spawn branches) only take effect when session-scoped crons are re-armed — next `/cron-detect-loop` invocation or session restart. Current in-session crons still carry pre-sprint prompts. No immediate operational impact; full effect on next cron re-arm.
