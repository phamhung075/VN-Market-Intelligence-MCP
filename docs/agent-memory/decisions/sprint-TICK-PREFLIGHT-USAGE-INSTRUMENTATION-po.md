# Decision Journal — Sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION · po

**Sprint goal:** Replace the engineering ESTIMATE of silent-tick cost with a MEASURED number — per-invocation, append-only, local-file-only usage telemetry at each cron preflight script's verdict choke point.
**Agent:** po
**Started:** 2026-08-12T13:03:37Z

---

### STEP po-S1 · po · 2026-08-12T13:05:28Z
**task-id:** BA-TICK-PREFLIGHT-USAGE-INSTRUMENTATION (sprint mint: 1 sprint_goal entry + 1 BA row)

**what-done:** Read all four preflight scripts at source before scoping. Minted `.sprint_goal.entries[]` sprint_id=TICK-PREFLIGHT-USAGE-INSTRUMENTATION (scope_in = WU-0..WU-3, scope_out = 6 binding exclusions, product_decision = the scope rationale below) and `task_board.backlog[]` row `BA-TICK-PREFLIGHT-USAGE-INSTRUMENTATION` (type SPRINT-M, P2, zone `cross-service/`, next_agent `ba`), each via its own `scripts/orch-apply.sh` pipe. Conservation check: task_total 752→753, signal_total 98→98 unchanged. Claimed sprint umbrella lock `task:TICK-PREFLIGHT-USAGE-INSTRUMENTATION` (claimed:true, ttl 3600s).

**what-considered:**
- 1 WU — instrument `cowork-tick-preflight.sh` only. The user's literal "yes" was to the cowork question.
- 3 WUs — the router's own proposal: "same change 3x" across cowork / dev-team / auditor-T1.
- 4 rows — shared lib first (WU-0), then cowork (WU-1), dev-team (WU-2), auditor-T1 gated (WU-3).
- 6 rows — widen to the whole preflight family found at source.

**why-decision:** 4 rows.
- Against 1: measuring cowork alone answers "what does a silent *cowork* tick cost", not "what does the silent-tick *layer* cost", which is the question behind the user's yes. `dev-team-tick-preflight.sh` fires more often than cowork (7/37 min vs 15 min) and, once WU-0 exists, wiring it is ~1 line.
- Against 3-as-equals: **it is not the same change 3x, and the router's premise was wrong.** `cowork-tick-preflight.sh:76-82` and `dev-team-tick-preflight.sh:200-203` each have a single `_emit_verdict()` every verdict routes through — a mechanical hook. `auditor-tier1-probe.sh` has **no choke point**: inline `jq -n` verdict construction at lines 757, 767, 772, 858, 894, 921, and it is dual-mode — `run_tiered_probe()` (tier 2/3) calls `run_probe()` internally then re-emits its own wrapper verdict with a *different field set* (`{verdict:ALL_GREEN|FAILURE,…}` inner vs `{tier,checks_verdict,verdict:SKIP-SPAWN|SPAWN,…}` outer). A naive per-call-site hook double-logs every tier-2/3 tick with two incompatible shapes and silently corrupts the dataset this sprint exists to produce. Correct instrumentation needs a choke-point extraction from a 925-line script guarded by a 1323-line suite — a different risk class, so it gets its own gated, droppable row.
- Against 6: source read found the family is **six**, not three — `code-janitor-tick-preflight.sh`, `db-integrity-probe.sh`, `orch-sentinel-lite-probe.sh` share the identical verdict-JSON-on-stdout shape and silent-tick economics. Widening now triples exposure before the shared lib has proven itself on one live cron. Recorded as the designated follow-up in `scope_out` (d) so it is not lost.
- WU-0 first: three copies of one helper is exactly the debt CLAUDE.md forbids; `scripts/agents-flow/lib/hook-guard.sh` and `lib/notebook-section-direction.sh` are the in-tree extraction precedent.

**why-change:** Four corrections to the intake brief, all found at source, all folded into the BA row as inputs rather than left as questions:
1. **Engine.** The brief proposed reusing a `python3 -c json.dumps()` `log_json()` pattern from another project. Rejected — all four scripts already hard-depend on `jq` and use `jq -nc --arg` as their quote-safe emitter throughout. Adding a python3 dependency to four cron-critical paths is a new failure mode for zero gain. Same log shape, already-present engine.
2. **Ratio.** The brief asked to check before inventing one. It already exists: **4 chars/token**, `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` §W-1, applied at scale in `2026-07-12-token-economy-lazyload-audit.md` (3,162 chars ≈ 790 tok; 23,994 chars ≈ 6k tok). Do not invent, do not bake into a script.
3. **Session ID.** `cowork-tick-preflight.sh` lines 56-57 state `CLAUDE_CODE_SESSION_ID` is "never echoed/logged by this script beyond its use as a bound `task_claim` arg". Logging it — even hashed — breaks that stated contract. Excluded in v1; this sprint is about cost, not correlation.
4. **Honesty caveat, made acceptance-bearing (AC-11).** `verdict_bytes` is a **lower bound** on true per-tick cost: the real cost is the cron prompt text + the flow-doc lines the LLM loads + the tool_result, and the script can only measure the third. Shipping a precise-looking number with an unstated denominator would be worse than the estimate it replaces, so every artifact must state this.

Additional PO-binding calls handed to architect as preferences, overridable only with written rationale: log destination `docs/data/telemetry/tick-usage.jsonl` **git-ignored** (≈500+ lines/day of churn on a tracked file collides with `feedback_shared_main_peer_push_sweeps_held_data_commits` and `feedback_coldevict_bare_commit_sweeps_worker_staged_index`; precedent `docs/data/cycle-snapshot-*.json` is already ignored — the tracked `*-last-verdict.json` / `*-last-snapshot.json` files are single-row snapshots, not append-only growth, so they are not precedent). Two exit-safety negative controls (AC-4 logger must not alter return status — `_emit_verdict` is repeatedly the last statement before an explicit `return`, and cowork's `_step8_silent_release` propagates via `return $?`; AC-5 unwritable destination must not fail the tick) and stdout purity (AC-6, `feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it`) are the three ways this change can break a live cron, so each needs real fault injection, not a happy-path assertion.

`.head` deliberately left `idle`. The router dispatches `ba` directly from this cycle's RETURN; pinning head to a row that is about to be picked up re-creates the stale-pinned-head class the router itself cleaned up at 12:52Z today (`feedback_router_lane_move_must_reset_head_same_write`, `feedback_pm_closeout_leaves_head_non_idle`). The mint reached the board — `orch-apply` conservation confirmed 752→753 — which is the failure `feedback_po_notebook_mint_never_reaches_orchstate_board` names.

The intake brief's suite counts (cowork 20/20, dev-team 37/37, auditor 32/32) are carried into AC-10 as **UNVERIFIED** — QA establishes the real pre-sprint baseline by running them before any edit rather than inheriting a quoted number.
