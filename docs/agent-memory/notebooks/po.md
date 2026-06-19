# PO Notebook
_overwritten 2026-06-19T08:24Z_

## Cycle po-s108 (2026-06-19T08:24Z) — IDLE-WIP triage: P0 was a stale-DONE decoy; fill slots + groom 50 terminal rows

**Trigger:** dev-team throughput tick — WIP=0 (ready=0/in_progress=0, wip_max=2) during VN market hours; router flagged a "P0 with idle capacity" promotion gap on a 298-row backlog.

**P0 disposition — FALSE ALARM (RAW-verified):** `FIX-BCTC-LIAB-PRIOR-PERIOD` (the flagged P0) is `status:DONE` — merged to main 2026-06-07 (29245173 fix + 04fa26a7 notebook), 5 RED→GREEN tests, 21/21 suite. It was a STALE DONE row sitting in `backlog[]`, NOT an unpromoted P0. Promoting it = re-doing shipped work. Correct action = GROOM it out → done[]. The router's "idle capacity + waiting P0" premise did not survive a raw read of the row.

**Real gap = backlog rot, not promotion.** 50 of 298 backlog rows carried a terminal status (38 DONE / 7 SUPERSEDED / 4 done_verified / 1 resolved) — never relocated to their closed lanes, inflating the live count.

**Promoted 2 (genuinely-actionable HIGH, no blocker, not superseded — fills both free slots, respects wip_max=2):**
- `VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE` → ready, next_agent=cowork-team. LIVE MARKET-channel risk: get_macro_snapshot returns a `{source_tier,text,fetchedAt}` JSON envelope (live since 98df0f43, 2026-05-23); cowork/chef prose-parsers may render raw JSON to MARKET. Distinct from done macro siblings (FDA-2/FEDFUNDS-REGRESS/etc — none address the envelope-parse→MARKET leak). Head pointed here (most urgent, market hours).
- `BPE-ARCH-1` → ready, next_agent=architect. BCTC-PROSE-EXTRACT architect SPIKE (5 blockers), recurring-bug-escalation, NFR-4 mandatory pre-condition, no blocker.

**Held (router-flagged but NOT promotable — per-task reason):**
- `FIX-BCTC-LIAB-PRIOR-PERIOD` P0 — DONE, shipped 06-07 (groomed to done[]).
- `BA-SHIP-WAVE-REAUDIT`, `FIX-PENDING-REFINE-LIMIT-CHECKKIND`, `FU-SCHEMA-DRIFT-P4`, `FU-SCHEMA-DRIFT-P5` — all DONE already (groomed).
- `BCTC-HIST-VPS-BACKFILL` — `DEFERRED-INFRA`, zone infra-vps; VPS lacks pre-Q4-2025 PDFs (external dependency, not a coding lane). Deliberate deferral — held.

**Groomed:** 50 terminal-status rows relocated out of backlog (45→done[], 5→done_verified[]) verbatim. Backlog **298 → 246** (−52: 2 promoted + 50 groomed). 0 terminal rows left in backlog.

**Script:** `scripts/po-s108-idle-wip-promote-groom-terminal-backlog.jq` (atomic temp→[-s]→jq empty→conservation→rename). Guards GREEN: TOTAL 600=600 (pure relocation, no loss/dup — 600 ids all unique), in_progress/review byte-stable, idempotency re-run delta 0. jq trap fixed: `array | index(.id)` evaluates `.id` against the array (Cannot-index error) → bind `.id as $rid` first.

**head** = VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE (cowork-team). po does NOT spawn — router dispatches via next_agent + head.

## Carry-over
- Router TODO: dispatch the 2 promoted ready tasks (head→cowork-team for VERIFY, then architect for BPE-ARCH-1); RAW-verify the macro-envelope MARKET-channel risk live.
- FIX-AUTO-PUSH-TRIGGER-NOT-FIRING done_verified still WITHHELD (qa must observe an AUTONOMOUS launchd push, not a manual run); launchd com.vn-market.fleet-push needs reload after machine restart.
- 3 review[] rows remain QA-gated (ARCH-SHIP-WAVE-REAUDIT PARKED, FIX-ALERT-ENGINE-RSI-SINGLEDIGIT, FIX-BCTC-ENRICH-SILENT-0ROWS) — not promotable, live/USER-gated.
- Backlog now 246 (real count); further grooming possible next tick (check for stale BACKLOG rows whose work shipped under a sibling id).
