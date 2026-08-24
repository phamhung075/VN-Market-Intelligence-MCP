# PO Notebook

## 2026-08-24T21:24Z — dashboard Layer-B re-report: 1 mint (col 2), 1 documented no-op (col 3), 0 new rows for Layer-A health

Prior 20:53Z section dropped whole (OVERWRITE class, preamble+1 section, ≤50L). Full reasoning: `docs/agent-memory/decisions/triage-20260824T2124Z-po.md`.

### The shipped row's own out-of-scope clause was the missing follow-up
User re-reported ("i dont see status is update") the same section a sibling row had just closed. `FIX-DASH-CRON-LAYERB-NEVERFIRED-FALSE-LABEL` (DONE_VERIFIED, `4b4bfea7a`) fixed **column 1 of the 3 the user originally named**, and its own `=== EXPLICITLY OUT OF SCOPE ===` clause says so verbatim, ending "file a SPIKE — do not attempt it here". Nobody filed it. **A DONE_VERIFIED row whose desc contains an out-of-scope clause is an unfiled follow-up until proven otherwise — grep the shipped row's text, not just its status.** The row was already cold-evicted to `archive/2026-08.json`, so a live-board-only dedup would have missed the provenance entirely.

### Two columns, two different classes — the useful call was refusing to mint for one
Col 2 (`Dự kiến lần tới` = "—") is a real gap: `computeExpectedFires()` in `cronStatusCompute.ts` is **pure** (cron-parser + clock, zero DB/telemetry/session) and feeds Layer-A's 89/89. Layer-B carries `cron_expr` on 23/23. Withheld by a literal-`null` type, not impossibility. → minted.
Col 3 (`Trạng thái` = "Phiên làm việc") is a **category** label, honest, and pinned by BA NFR-7:260 / AC-19:362 + two tests. Its only honest enrichment is real session-cron liveness — already owned by `ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG` (P1, 2026-07-22). → **ruled no-op, recorded in the minted row's desc so the ruling is greppable.** Minting there would have reversed a deliberate architectural decision and duplicated a P1.

### Checked the fix's own feasibility instead of forwarding the caller's premise
Caller framed frontend-only as the clean single-zone path. It is single-zone, but `apps/frontend/package.json` has **no cron dependency at all** (mcp-server has `cron-parser ^5.6.1`), so option (b) means adding a dep or hand-rolling cron parsing. Wrote that cost into AC-8 rather than letting architect discover it mid-build. Also confirmed the Remix `loader` (L308) is server-side, so NFR-2's server-clock rule survives option (b) — that one *helps* it.

### Secondary triage: 17 unhealthy Layer-A rows, 0 new rows needed
All 17 map to existing backlog rows. The 5 STALE `*/N 2-8 * * 1-5` crons last fired 08:45–08:55Z today at the **end of their market-hours window** and it is now 21:19Z — they are correctly idle, not stale, which is exactly `FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL`'s thesis. **Read the cron expression before believing a STALE badge.** The other 2 STALE + 1 MISSED + 9 NEVER_FIRED each have a named owner row. Annotated the 9-pair row with live re-corroboration (still 9, membership stable, `foreignFlowFetch` at `*/1 * * * *` with `last_fire=null` is not plausible) since it still reads `medium`.

### Carry-over
- **`FIX-DASH-CRON-LAYERB-NEXTFIRE-INERT-DASH` is `backlog[543]`, `next_agent=architect`** — minted, not dispatched. It is one row among 543; state that, never "unblocked".
- Routed to **architect not a developer on purpose**: the (a)-backend/(b)-frontend fork is a design call, and (a) collides with a live peer in `apps/mcp-server/`. Zone reads `apps/frontend/` as the collision-free default, **not** because the design is settled — AC-8 says re-zone to `multi` if (a) wins.
- AC-2 is a **hard testable AC, not prose advice**: on this exact table a qualifier has already been lost once between BA:364 → brief:127 → implementation. That is what caused the bug just fixed.
- Did NOT touch `.head` (held by live peer `FIX-ORCHAPPLY-CAS-BASELINE-...`, dev-team 20:49Z) — appended to `backlog[]` only, head verified unchanged after the write.
- **Did NOT clear `pending_triage_inbox` (22 envelopes) and did NOT process them.** Router-direct targeted dispatch, narrow intent lock; the flow's unconditional-CLEAR step would have destroyed 22 unprocessed rows. Deferred to a real triage tick, flagged in RETURN.
