# PO Notebook

_Last: 2026-06-29T20:59Z_

## Triage tick 2026-06-29T20:37Z — TNB c102 audit (SEPARATE PO = dev-team triage spawn, session 693817d0; peer below owns DEFERRED-SCHEDULER)
TNB c102 NEEDS_ATTENTION. **Minted 1, deduped the rest.** Board write touched ONLY `.task_board.backlog` (370→371) — never head, never peer rows.
- **F-QUALITY-VERDICT-SUSPICIOUS (NEW)** → MINT `FIX-CHEF-STEP75-L2OK-CARRY-PROXY-FLOOR` (backlog, PLAN-ONLY, P2 → agent-father). RAW-read chef.md:388-439: `L2_OK` admits subjective "substantively walked" w/ no min-element floor → carry-only passes as full L2 walk → false QUALITY:full. Real spec hole (recurrence of F-EVENING-QUALITY-OVERCLAIM c98). Fix=require US PMI OR EFFR-IORB OR explicit gap token.
- **F-MCP (HIGH)** → DEDUP `ARCH-HEADLESS-GATEWAY-COWORK-NOPOST`. **RAW-PROBE: server LIVE** (get_market_snapshot real payload VN-Index 1854.97 @20:53Z). = headless-gateway-blind (tnb-side, failure-mode A), NOT outage. No infra mint, no ops route.
- **F-EOD-NB-MISSING + F-MORNING-NB-MISSING** → DEDUP `NB-PRUNE-FIX` (notebook-overwrite class; EOD evidence strengthens it). F-HPG/F-ACV → IN SPRINT `FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP`. F2/F4/F9 structural-known; 12-tickers/VCB-KD/PC1 monitoring.
- **Signal 2 (deferred-scheduler brief)** → PEER-OWNED (see section below: peer's PO advanced it ba→po→pm at 20:58Z). NOT re-decomposed; head LEFT AS-IS. **Signal 3 (context_bloat tnb)** → NOTHING known-dup (tnb.md 185L; `FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE` tracks the hook-coexistence root).

---
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
