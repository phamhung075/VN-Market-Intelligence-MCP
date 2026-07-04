# Decision Journal — Sprint FIX-DRAINESC-SEVERITY-RECURRENCE-GATE · architect

**Sprint goal:** Gate drain-esc-dispatch Opus spawn on a severity floor (>=HIGH) + a
recurrence/known-root DEDUP guard — stop wasteful Opus redispatch on stale/known-recurring
BCTC escalations (MBB Q1-2026 ESC-2 fired 4 consecutive cycles on byte-identical stale data).
**Agent:** architect
**Started:** 2026-07-04T00:50:37Z

---

### STEP architect-S1 · architect · 2026-07-04T00:50:37Z
**task-id:** FIX-DRAINESC-SEVERITY-RECURRENCE-GATE
**what-done:** Designed GATE-A (severity floor) + GATE-B (recurrence DEDUP) for
`drain-esc-dispatch.md`, inserted between Step 2/Step 3 per spec. Wrote full brief
`docs/architecture-briefs/2026-07-04-drainesc-severity-recurrence-gate.md` + handoff
`docs/handoffs/TASK_FIX-DRAINESC-SEVERITY-RECURRENCE-GATE.md`.
**what-considered:**
- GATE-A effective_severity: "MAX of row.severity and static ESC-id tier" vs "row.severity
  authoritative, static tier fallback-only". Chose fallback-only — MAX-of-both would
  re-escalate the already-shipped ESC-4 AC-2 INFO downgrade (ESC_DEFAULT_SEVERITY["ESC-4"]=HIGH
  would win), defeating the very fix this task exists to complete. Traced against the live GVR
  SOE example to confirm.
- GATE-B state location: (a) board-row-exists only [ticket's cheapest option], (b) content-fp
  counter column in drain-signals.js [ticket's other option], (c) two-tier: board-row PRIMARY +
  read-only signals_processed COUNT query SECONDARY (chosen).
- Live-queried signals.db: MBB ESC-2 context byte-identical across 2 rows (exact-match works);
  GVR ESC-4 context KEYS DRIFT every cycle (freeform LLM narrative) — exact-content-hash alone
  (the ticket's literal suggestion) provably fails GVR's case. This is why (c) beats a naive (b).
**why-decision:** (c) is cheaper than BOTH ticket-framed options (zero schema change AND zero
new file — signals_processed already stores full payload, json_extract confirmed live) and is
self-healing (board-row status flip reopens the gate; a pure count-based gate would stay stuck
after a real reflow fixes the data, since historical rows never disappear before the 7-day
prune). Board-row-exists is also PROVEN in production already — PO manually created
`REFLOW-MBB-Q1-2026` (backlog/BLOCKED) tracking this exact recurrence.
**why-change:** Ticket's fix_spec suggested a literal `sha256(ticker+quarter+trigger_id+context)`
fingerprint as one option; I did not implement that as the ONLY mechanism because live data
(GVR) disproves its reliability for narrative ESC types. Kept exact-context-match as the Tier-2
bootstrap net (safe-direction failure: under-triggers, never over-suppresses) and made the
board-row check (needs no context match) the primary/authoritative mechanism instead.
