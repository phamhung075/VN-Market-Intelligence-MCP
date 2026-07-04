# PO Notebook

_Last: 2026-07-04T00:42Z_

## Tick 2026-07-04T00:42Z (router-dispatched) — dev-team :07 tick, WIP=0: 2 esc-dispatch signals

**Signal #2 (router-esc4-fu-drainesc-severity-gate) = MINT + BATCH.** `drain-esc-dispatch.md` Step 3 spawns model=opus bctc-analyst for EVERY esc-deep-dive-request — NO severity floor (post-ESC4 INFO still spawns Opus) + NO recurrence guard (byte-identical redispatch w/ known root re-spawns Opus each cycle; router SKIPping by hand). NOT deploy-gated (flow-doc + `scripts/agents-flow/drain-signals.js` only) → leading actionable. MINTED `FIX-DRAINESC-SEVERITY-RECURRENCE-GATE` → ready[] (SPRINT-S/S/high, next_agent=architect, zone=cross-service). Two gates BETWEEN Step 2 mutex + Step 3 spawn: GATE-A severity floor >=HIGH; GATE-B known-root DEDUP (open REFLOW row for {ticker,quarter} OR semantic content-fingerprint N>=2 → route to reflow, skip Opus). Architect picks GATE-B state location (board-row check vs content-fp counter in drain-signals.js). generic_mandate = no ticker hardcode; never suppress a genuine FRESH HIGH.

**Signal #1 (dt-escdispatch-mbb-batch-reflow) = DEDUP → RESOLVED, no mint.** `REFLOW-MBB-Q1-2026` already tracks it (backlog, BLOCKED on user-gated mcp-server rebuild; related+depends → W5-FU-CTG-REFINE + FIX-BCTC-BANK-BS-SECTION-CLASSIFIER + FIX-MCP-MEM-CAP-BUMP-REBUILD). Per-cycle re-fire is a SYMPTOM cured by #2's gate. HARD-CONSTRAINT respected: deploy-gated reflow stays parked, grooms with the 2 W5 review rows. Row left byte-untouched. Considered generalizing to a batch reflow (MBB+CTG) — declined: adds churn without unblocking (still deploy-gated); the `related` link already grooms them together at gate-clear.

**Writes:** scratchpad jq → orch-apply rc=0 (ready 0→1 +1 mint; 2 signal_queue rows NEW/READ→RESOLVED; ~105 pre-existing SHG coherence warns non-blocking). `.head` untouched (router continues from RETURN NEXT). No push (fleet-push timer owns). Provenance "(po router-dispatched)" — 0 session UUID in any tracked file.

## Tick 2026-07-04T00:00Z (router-dispatched) — GVR ESC-4 deep_dive_result: ACCEPT, DEDUP linked (no mint)

Opus verdict (conf 0.9) = legit non-operating income, not extraction artifact; math RAW-verified to the dong. NO content-hash whitelist mechanism exists (ESC-4 applied by bctc-analyst FLOW, not mcp code). DEDUP HIT → appended 4th-emission corroboration to existing backlog `ESC4-HEURISTIC-FIX-TAXBASIS-SOE` (agent-father; AC-2 SOE-conglomerate downgrade is a durable SUPERSET of the one-quarter whitelist ask). No mint. That row later PROMOTED backlog→ready (23:57Z tick).

## Carry-over
- **FIX-DRAINESC-SEVERITY-RECURRENCE-GATE** (ready, architect) — DoD: sub-HIGH → no Opus; byte-identical redispatch w/ open REFLOW → routed-to-reflow, no Opus; NOVEL HIGH, no board row → Opus DOES spawn (no false suppression). Test co-located w/ drain-signals contract tests.
- **REFLOW-MBB-Q1-2026 + W5-FU-CTG-REFINE + TASK-W5-…-VALIDATION-REINGEST** — all one user-gated mcp-server rebuild + reingest gate (next_agent=ops). At gate-clear, batch MBB+CTG reflow in ONE reingest pass. Do NOT redispatch Opus on MBB while parked.
- **FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT** — co-fix with B-11 (same auditor main.md, same two-layer-freshness class). Replay 22:41Z → NO CRITICAL/BUG; real stuck queue (pending>0 + stale SLA) MUST still fire.
- **STALE-DONE reconcile** — FACTORY-*-confidence-50 rows already fixed by FIX-SIGNAL-CONFIDENCE-DEFAULT-50; close on board (qa/router). Spot-check the epic before promoting siblings.
- **DEPLOY-GATE (standing):** any BCTC code/VPS fix → route gated deploy/verify to ops (don't wait on user).
