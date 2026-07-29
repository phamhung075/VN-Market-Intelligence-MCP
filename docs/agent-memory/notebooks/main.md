# Dev Team — Sprint Boundary Notebook

**Written:** 2026-07-29T16:11Z

## cycle-20260729T1611Z-verify — RAW-verified dev-mcp-server's SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME completion; broadcast mark-read defect confirmed independently from source, tests re-run GREEN; found+fixed an 8th stale-marker instance (review-lane), `.head` sync was clean this time

- **BGFAN-1 RAW-verification, all claims confirmed real**: commit `2ae2c19d1` real, on HEAD, pathspec-scoped to exactly the 7 claimed files (2 source, 1 new test, 2 docs, notebook, decision journal).
- **Root cause independently re-derived from source, not trusted**: `getSignals()` (`agentSignalStore.ts:897`) matches `to_agent = ? OR to_agent = 'all'`, and its unread-only branch (`:948-951`) runs `UPDATE agent_signals SET status='read' WHERE id IN (...)` unconditionally on every matched row — confirmed this flips a broadcast row's ONE global `status` column read for ALL recipients the first time ANY of them bootstraps, exactly as claimed. New `getBroadcastSignals()` (`:1012+`) independently confirmed non-consuming: bounded only by `expires_at`, no status filter, no UPDATE. `getCycleBootstrap.ts`'s new `getInboxSignals()` helper (`:29-37`) unions `getSignals()` + `getBroadcastSignals()` deduped by id, exactly as claimed.
- **Test claim independently re-run, not just trusted**: `bun test src/__tests__/SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME.test.ts` → **5 pass / 0 fail** (exact match). `bunx tsc --noEmit` → exit 0, clean (exact match). `toolCount`/`cronJobCount` → 184/88, unchanged (exact match).
- **Board lane-move genuine**: row `status:REVIEW`, `next_agent:qa`, no duplicate row left in `ready[]`/`backlog[]`.
- **`.head` sync was clean this time** — dev-mcp-server correctly reset it to `{status:idle, active_task_id:null, next_agent:router}` in the same commit as the lane-move. First clean `.head` sync from a code-writing dev-* agent this session (prior instances all needed a fix).
- **Found an 8th instance of the stale-lane-marker class** (same shape as the 5th/7th): `promoted_at/promoted_by/promotion_note/claimed_at/claimed_by` never stripped when the commit moved the row `in_progress[]`→`review[]`. Fixed with a targeted marker-strip, conservation OK (701→701), committed `bf473cee3`.
- Released sprint-task lock `task:SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME` cleanly after full verification.
- **NEXT: qa** — row in `review[]`, `next_agent:qa` (real code diff, not investigation-only). Not yet dispatched — review-lane QA-Drain remains the mechanism, still gated behind idle-chain fallthrough.
- Open structural gap unchanged: 8 confirmed stale-marker instances this session, still hand-patched per-instance — the underlying claim/promote jq scripts and dev-* lane-move commits still don't uniformly strip markers. Candidate for an architect-level systemic fix given the recurrence count.

## cycle-20260729T1547Z — Tick 15:37Z: cold-evicted 1 item, drained 1 signal, CI dedup, clean BOUNDED-1 claim (no collision this time), dispatched dev-mcp-server on a SPIKE->FIX

- **Preflight**: cold-evict ran automatically (1 signal row → `archive/2026-07.json`, committed `2221bf87b` by the script itself). Verdict RUN, tick `2026-07-29T15:37Z`. No HEAD.lock, no stale worktree locks.
- **Drain**: 1 routed to po (commit-sweep-guard, self-referencing artifact from the cold-evict commit's own sweep-guard warning). 0 pruned (2 candidates still referenced, correctly skipped). Committed `d3911ca02`. CI probe deduped (same known `aa6c044b`). 0a-D signal_queue: no NEW rows.
- **`.head` was correctly idle** this tick (no desync, prior tick's cleanup held) — fell through to BOUNDED-1 (WIP=0).
- **BOUNDED-1 promoted+claimed cleanly this time — no stale-marker collision**: checked `ready[]` for the promote marker BEFORE claiming (lesson applied proactively from the 6 prior instances this session) — only one row carried it, freshly stamped this exact tick. Claimed `SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME` (P2, zone `apps/mcp-server/`, recurring 2+ confirmed bug: `get_cycle_bootstrap` under-returns shared/broadcast `chain_catalyst` vs `get_agent_signals`, both share `getSignals()`'s mark-read side effect — leading hypothesis is the first bootstrap-reader globally marks a broadcast signal read, starving later recipients).
- **Dispatched `dev-mcp-server` directly** — this task is framed SPIKE->FIX (not investigation-only like the prior tick's SPIKE), so instructed it to investigate BOTH recurrences' timing (rule out a pure creation-after-bootstrap artifact), pick a fix direction (non-consuming shared-catalyst read window vs per-recipient read-state), implement, test, and route to **qa** (not po) on completion since this closes with a real code diff. Sprint-task lock `task:SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME` held pending verified completion.
- BOUNDED-1 dispatch consumed the tick — did not fall through to SLS/RLC/QA-Drain/Step 1.


