# PO Notebook

_Last: 2026-07-25T14:59Z (dev-team Step 1 triage — router-referred cold-evict no-op loop: 2 MINTs + 1 SPIKE instance; 2 router claims CORRECTED, 1 of my own hypotheses REFUTED)_

## Tick 2026-07-25T14:37–14:59Z

**Returned BATCH(2).** Both verified on `.task_board` by `id` after write, not asserted from narration.

| Minted | Lane (read back) | Mechanism |
|---|---|---|
| `FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP` | `backlog` ×1, P2/S, `cross-service/` | Step-5.5 trigger is a COUNT gate (`done_n>10`); the eviction it fires is a COUNT-**AND**-AGE gate. Different axes → unclearable by its own action |
| `FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT` | `backlog` ×1, P2/S, `apps/mcp-server/` | bctc SLA "threshold" is not a policy constant — tracks staleness at a fixed 5439-min offset |

Board: `task_total` 655→657, backlog 389→391, `signal_total` 125 unchanged. `.head` **untouched** (router owns closeout).
Also annotated `SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP` with **instance 10** + new **sub-class 5** (trigger/action on different axes).

## Lessons

- **⚠️ A per-file sweep for gate patterns cannot see a trigger/action pair that straddles a file boundary.** The architect's `instance_9_closed` check examined `orch-cold-evict.sh`, correctly ruled its additive sums to be *reporting counters, not firing gates* — and was right. The firing gate lives in the **caller** (`dev-team-tick-preflight.sh:368`). **When a script is side-effecting, enumerate its CALLERS, not only the predicates inside it.**
- **⚠️ `//` in jq fires when the LHS yields NO outputs, not only on null.** `[[] | .[].id // ""]` → `[""]`, length 1. So `--dry-run` reports "would evict: 1" for two lanes that are provably empty. **The instrument I was about to cite as acceptance evidence was itself lying.** Fix the counter before trusting the count.
- **⚠️ `x // "default"` does NOT catch a poison *string*.** `sort_by(.created_at // "0000-…")` guards null/absent, but 10 rows carry the literal `"unknown"`, which string-sorts ABOVE every ISO date — so `reverse()` ranks the oldest rows as the **newest**, and they consume the whole `keep_n=10` window. Schema permits it: `created_at: z.string().optional()` — any string.
- **My own structural-grant hypothesis was WRONG, and checking it is what proved it.** `get_bctc_report_id` is granted by *no* tools package → I predicted bctc-analyst was structurally blind. Probed the live gateway: the tool **works**. My first probe (`stock_code`/`period`) reproduced the *real* cause — a Zod arg-shape mismatch, already diagnosed and closed at `bctc-analyst/flow/main.md:78` on 07-24. **3 telegram reports were stale, not open. Do not mint on a hypothesis that a 30-second probe can settle.**
- **A constant difference between two growing numbers means neither is a policy value.** 12 bctc alerts / 21h: `stale − threshold` = `{5439}`, one element. Positive control in the same stream: `bond_maturity` 10080, `signal_quality_audit` 2880, `news`/`sbv_fx` 30 — all constant. That control is what turns "looks odd" into "isolated to bctc".

## Carry-over

- **Do NOT "fix" the cold-evict trigger by narrowing it to the done[] predicate.** `preflight.sh:419` is the *sole* automated caller and the trigger has **no signal_queue term** — yet the run does evict `signal_queue.rows[]` (commit `127d53a8a` moved exactly one READ row and zero done rows, despite its title). Narrowing it silently kills signal-queue eviction. Trigger must gain a signal_queue disjunct in the *same* change.
- **Sequencing:** that coupling is currently dormant — `signal_queue.rows[]` is 124 `triaged` + 1 `RETRACTED`, none in `TERMINAL_SIGNAL_STATUSES`. It becomes load-bearing the moment `FIX-SIGNALQUEUE-TRIAGED-NO-EXIT-TRANSITION` lands. Not a blocker; do not use it as a reason to skip the disjunct.
- **Fixing the sort alone buys ~7 days, not a fix.** Correct sort → 6 rows evict immediately → `done_n` 16→10 → trigger clears. But dated rows accrue ~1.5/day against a 7d window, so it re-saturates. Both defects or neither.
- **`FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE` contains a stale risk line** — "no cron invokes orch-cold-evict.sh". True when written, invalidated by `83e0578ea` (07-15). Re-read before working either row.
- **`review`=110 / `qa`=0 is ALREADY OWNED — do not re-mint.** `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` (backlog, architect) + `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION`. Router flagged it as unverified; it is tracked, and that row's own history records a prior PO asserting a phantom ownership gap on exactly this question.
- **All 20 new telegram reports + 100 unresolved map to existing rows or are stale.** Dominated by `sla-monitor` repeat-fire on 3 metrics. Only the bctc threshold arithmetic was new.
- **`FIX-SIGNALQUEUE-TRIAGED-NO-EXIT-TRANSITION` still needs the architect semantic ruling** before code (carried from 14:07Z — unchanged).
- **Do NOT let QA close `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` via host CLI / direct sqlite.** Live acceptance is `REBUILD_REQUIRED` (user-gated); correct outcome while unrebuilt is **BLOCKED-ON-REBUILD**, never PASS. (carried)
- **Nothing pushed. No agent dispatched, no container touched.** Two `orch-apply.sh` writes, both validated + conservation-checked; commit-mutex claimed and released (`released:1`).
