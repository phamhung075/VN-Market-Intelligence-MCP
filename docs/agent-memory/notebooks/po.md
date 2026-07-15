# PO Notebook

_Last: 2026-07-15T00:46Z (ALPHA-S2-FF epic-close follow-up triage; PLAN-ONLY, WIP=0, head idle; coordination_session 69b0312e)_

## Tick 2026-07-15T00:46Z — ALPHA-S2-FF close follow-up intake (2 rows, PLAN-ONLY)
Router closed epic ALPHA-S2-FOREIGN-FLOW-WRITE-RACE (parent+SUB1-5 done_verified; qa APPROVE 36c1e3148; CI-green 4491a1f2e; umbrella mutex released). head IDLE, WIP=0. Directive: triage 2 follow-ups into backlog ONLY — no sprint launch, no WIP raise, no dev dispatch, no `.head` touch.
- **MINT (+1 backlog 395→396):** `FIX-MCP-TEST-SUITE-INTERVAL-TIMER-LEAK-TEARDOWN` (P3, apps/mcp-server/, dev-mcp-server, sprint=TEST-HYGIENE, plan_only). Root = tests arm setInterval-style sla-monitor/reaper timers with no unref/clearInterval in afterAll → leaked intervals hold Bun loop open + log flood ('not seeded yet (age=-1)', 'periodic reaper armed') → full `bun test` hangs ~test22 034-telegram-notifier. Bun v1.3.13 post-run panic is a SEPARATE upstream instability (fires after results print). P3: CI unaffected (green), impact = LOCAL full-suite verification only; UNRELATED to ALPHA-S2-FF (its tests 100% green).
- **SUB6 DECISION = prioritized@P3** (not dropped): ALPHA-S2-FF-SUB6-BUCKETING-HELPER — in-place edit P2→P3, optional/stretch=false, po_decision stamped, status stays BACKLOG. Both compactor jobs (intraday5mCompactorJob.ts + intradayForeignFlow5mCompactorJob.ts) now live → 5-min bucketing genuinely duplicated → real drift risk = tracked XS debt worth keeping (reduce-debt standing). P3 = pure architecture/DRY, zero functional impact.
- **WRITE:** one atomic `jq -f <scratchpad>/alpha-s2-ff-followup-triage.jq | bash scripts/orch-apply.sh` (Zod Stage0+1 PASS; conservation live=575→candidate=576 net +1; CAS clean). Verified live: head idle/active_task_id:null, new row ×1, SUB6 P3, all 6 ALPHA-S2-FF done_verified rows intact, total 576. NO code dispatched, NO commit (router/fleet-push timer owns tree hygiene).

## Standing method (survives rotation)
- **PLAN-ONLY intake:** mint to backlog[] status:BACKLOG (never ready[]); in-place field-edit for reprioritize (no delete/re-add); id-guard via `any(. == id)` over collected lane ids (NOT `index()` with an evaluated needle — feedback_orchstate_jq_index_needle). Conservation = mint +N, in-place edit +0.
- **Board writes:** ONE atomic `jq … | bash scripts/orch-apply.sh` (Zod+dup-key+conservation+CAS+atomic rename); `.head` never touched on PLAN-ONLY intakes; dry-run to a scratchpad candidate + recompute counts BEFORE piping to orch-apply.
- **Priority discipline:** test-infra with green CI = P3 (local-only, not reliability-critical); DRY/architecture refactor with zero functional impact = P3 floor. Reserve P0/P1 for reliability→coverage.
- **task_total formula:** flat-lane objects + active_sprints[].tasks[] + closed_sprints (currently 576 = 480+77+19).

## Carry-over
- **NEXT (dev-team):** both new rows drain from backlog[] when WIP frees — FIX-MCP-TEST-SUITE-INTERVAL-TIMER-LEAK-TEARDOWN + ALPHA-S2-FF-SUB6-BUCKETING-HELPER (both →dev-mcp-server, apps/mcp-server/, neither gating).
- **Prior carry (still open):** ALPHA-S2-TICK-DOWNSAMPLE-5MIN promoted 07-14 (P1, ready→drains); stale P1 `FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK` (6d+, mcp-call.sh on-disk-unwired) awaits supervised bounded-1 promote; FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT stays PLAN-ONLY in review[] (never close on a pek report).
