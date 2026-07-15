# PO Notebook

_Last: 2026-07-15T19:02Z (dev-team triage: cowork preflight presence-claim signal + UC-RDL-P4 withhold adjudication)_

## Tick 2026-07-15T19:02Z — signal cow-20260715T184053 + UC-RDL-P4 adjudication
Router hand-off. Board RAW: ready 0 / in_prog 0 / review 25 / done_verified 45 / backlog 396; signal_queue 1 NEW.

**Signal cow-20260715T184053 (cowork-team, system-issue, MED):** `cowork-tick-preflight.sh` Step 2 (~L127-138) `task_heartbeat`s `session-presence:<session>` WITHOUT ever `task_claim`ing it. Fresh session tick-1 (no presence row yet) → heartbeat ok=false → verdict=ERROR → return 1 → expensive LLM fallback. Inverts cowork-team/flow/main.md Step 0b.1 (presence is NEVER a gate) + reopens the exact cost TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 removed (once per fresh session + once per >30min presence lapse). Deterministic, self-heals (ttl 1800>900 tick), non-blocking → cost/contract defect not outage. Reproduces scars feedback_chain_mutex_ttl_lapse (ok:false→re-CLAIM not heartbeat) + feedback_task_claim_held_lock_noop.

**UC-RDL-P4 withhold adjudication → decision (ii) fast standalone FIX:** NOT subsumed. UC-RDL-P4 = composite `dispatch_preflight` MCP tool for the ROUTER dispatch preflight (apps/mcp-server/, Phase A/A.5/B). The signal bug lives in a DIFFERENT flow/zone — the cowork TICK preflight bash (scripts/agents-flow/, cross-service). Even post-UC-RDL-P4 that bash keeps its own presence logic, and it's deliberately a single-bash-call token path (WU-1) that a heavier per-tick MCP round-trip would regress → composite tool is NOT its natural home. FIX priority > SPRINT-M, and the bug bleeds tokens NOW.

**Actions (single `jq | orch-apply.sh`; Zod Stage0+1 PASS, conservation task_total 580→581 +1 mint, CAS clean):**
- Signal → status READ (triaged). Later flips READ→RESOLVED via FIX done_verified (origin_signal_id back-ref).
- Minted `FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP` — FIX, P1, size S, zone cross-service/, owner po, next_agent developer, **promotable** (BOUNDED-1-eligible: no supervised/children/deps, board next_agent non-empty). baseline_pass=true (ran cowork-tick-preflight.test.sh → 20/20 green pre-fix). origin_signal_id=cow-20260715T184053. AC = fresh-session→SILENT/WORK not ERROR + re-entrant→clean+TTL-renewed + presence transport-err non-gating + no cowork-slot leak; NOTE dev/qa must UPDATE test T3 (asserts old gating) + add fresh/re-entrant cases.
- UC-RDL-P4 → `supervised:true` (stops BOUNDED-1 re-promote/re-withhold churn) + `po_adjudication` note; STAYS BACKLOG for deliberate SPRINT-M start (PO sprint-initiation authority). Cross-ref: when the composite tool is designed, honor claim-first/presence-never-a-gate + weigh cowork-tick migration; also SYSREMAKE-P2 RC-CEREMONY "shared tick-preflight-lib" would eventually re-home this preflight (compatible w/ the standalone contract fix).
- `.head` untouched (idle→router; dev-team session 69b0312e owns it). No locks touched. RETURN = BATCH(1 FIX) to router for Step-3 direct dispatch.

## Carry-over
- **NEXT (router/dev-team):** dispatch FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP (developer, cross-service bash + test update). Close-gate flips signal cow-20260715T184053 READ→RESOLVED on done_verified. UC-RDL-P4 awaits a DELIBERATE SPRINT-M kickoff (not idle auto-pickup) — coordinate UC-RDL-P1 lock-prefix landing first.
- **Prior carry (still open):** RAG-FTS-BUILD-MEMORY-BOUND WITHHELD (corpus-scale wall-clock gate) → then ALPHA-S2-RAG-FTS-REBUILD-CRON retune. SYSREMAKE-P2 RC cascade = SEPARATE supervised architect-led dispatch (TECH doc first). Gateway /gateway 502 still USER-escalated (dashboard --token tunnel aggregator down). SPIKE-RAG-HYBRID-MAXDISTANCE-NOOP in backlog for grooming.
