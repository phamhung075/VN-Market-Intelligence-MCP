# PO Notebook

_Last: 2026-06-29T20:58Z_

## This cycle — REVIEW BA spec: BA-DEFERRED-SCHEDULER → APPROVED (chain ba→po→**pm**→dev-mcp-server→qa)

Reviewed `docs/handoffs/BA-DEFERRED-SCHEDULER.md` vs the LOCKED brief (`docs/architecture-briefs/2026-06-29-deferred-task-scheduler.md`). **Faithful 1:1 transposition** — all 12 ACs traced to blocking gates, all 8 STs covered (ST-1/3/6/2/4/5/7/8), **zero scope creep** (spec §0 mirrors the brief Phase-2 OUT list verbatim). BA reported NO blockers; none found. **APPROVED.**

**Advanced chain in ONE atomic orch-apply write:** sprint `po_signoff=APPROVED` + `next_agent=pm` + 3 directives mirrored; BA row `done`/status=DONE/next_agent=pm; head.next_agent=pm (active_task_id stays BA-DEFERRED-SCHEDULER — validator rejects a sprint_id as active_task_id; a done-lane task resolves).

**3 advisory Qs RULED (full text → spec §0.1 D1/D2/D3 + journal po-S3):**
- **D1 done-vs-fired:** MVP terminal success = `fired`; no done-write path, no `mark_task_done` tool; `done` stays in enum (Phase-2). QA-critical: AC-11 MVP terminal-set = {fired,failed,expired,cancelled} — verify `fired` as valid terminal (brief's `done` presumed a Phase-2 confirm callback MVP omits).
- **D2 helper registration (resolves a spec/brief contradiction):** §3.2/§4.4 say "internal, not registered" but §5.2 + brief §d call the 4 helpers via `call_tool` — the sweeper is an LLM agent, can ONLY act via the gateway. RULE: 4 helpers MUST be gateway-reachable (privileged); public surface = exactly schedule_task/cancel/list; no ordinary-agent privilege escalation; mechanism = dev choice; relax §4.4 verify wording. Doc boundary in ST-8.
- **D3 prompt companion file:** RAW-checked SignalRowSchema (orchStateSchema.ts:175) — no body field; consumer reads `payload_ref`. RULE: DEV path ALWAYS writes `docs/signals/one-shot-<id>.json` + payload_ref; summary stays one-liner; drop 500-char threshold. COWORK passes prompt direct to Agent().

**Lessons applied:** review the spec against the design SSOT (brief), not the BA's self-report · RAW-verify the schema before ruling a payload directive (D3) · pin spec/brief contradictions as binding directives so dev/QA don't stall (D2) · orch-apply gated write via `-f` jq file (inline single-quote breaks on embedded SQL) · active_task_id must resolve to a real task_board task.

---
## Carry-over
- NEXT: **pm** | break BA-DEFERRED-SCHEDULER spec into atomic dev tasks for dev-mcp-server. 8 DTS-ST rows already exist in backlog (DAG ST-1→{ST-3,ST-6}→ST-2→{ST-4,ST-5,ST-7,ST-8}); pm refines/sequences + promotes. Directives D1/D2/D3 are BINDING.
- NEXT (other sprint): architect | technical blueprint MARKET-INDICATOR-DEPTH-P0 (BA-INDICATOR-DEPTH-P0 approved earlier; 5 rulings + Gauge-Readiness contract).
- Two active BA-origin sprints (INDICATOR-DEPTH + DEFERRED-SCHEDULER) — distinct intents, router serializes.
- 90 pre-existing orch coherence warnings (status-in-lane drift, other sprints) — NOT mine; non-blocking.
- Phase-2 horizons (headless 24/7 sweeper, adaptive retry, terminal-row prune, firing-recovery, retention) explicitly scope_out — dev must NOT build.
