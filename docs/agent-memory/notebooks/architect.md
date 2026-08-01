# Architect — Notebook

**Last updated:** 2026-08-01 01:50 UTC | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-08-01T01:50Z — FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN (zone=docs/agents/dev-team/flow/, P1/M, PLAN-ONLY, supervised, PO manual-dispatch sweep pick)

**Task:** review[] PRIMARY (next_agent==qa) drain mechanism (shipped 2026-07-22) is real but can't keep pace — 198 rows, ~34/day net inflow, 1 row/tick when it fires, often doesn't fire at all (lost the head-idle race to BOUNDED-1 this very tick). SECONDARY (44 rows, non-qa/null next_agent) has zero automated sweep of any kind.
**Design:** No code change (plan-only). Found un-referenced prior art first: `SPIKE-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE` (agents-architect, 07-29) already split this into Part 1 (`.head`-write-conditional, DONE_VERIFIED the SAME tick as this dispatch), Part 2 (busy-tick reachability, blocked transitively on a stalled P0 rotation task that is itself stuck in REVIEW since 07-29 — same disease), Part 3 (throughput cap, unplanned). Wrote `docs/architecture-briefs/2026-08-01-review-lane-drain-throughput-and-secondary-sweep.md`: §1 = Part 3's design (batch N-oldest via `--argjson take_budget`, `QA_CAP=10` named constant, loop-spawn qa sessions per BGFAN-1, reuses the SPIKE's own `claimed_at`/`claimed_by` correlation idiom). §2 = new SECONDARY-Drain mechanism, deliberately NOT mirroring PRIMARY's `.head`/`qa[]` shape: `TaskBoardSchema` is `.strict()` (9 enumerated lanes, a new lane = real TS schema work) so it stamps in place on the row instead (`TaskSchema` is `.passthrough()`); never writes `.head` at all, so — unlike PRIMARY — it can ship head-decoupled from day one, no P0-rotation blocker inherited. Null-`next_agent` fallback routes to `po`, not `architect` (live data: architect already owns 10/44 SECONDARY rows, largest non-null share — avoided self-concentrating load).
**Finding:** grepped every agent flow doc for `review[]`/`task_board.review` — zero hits outside the PRIMARY QA-Drain block itself. Confirmed live: no agent's own flow scans `review[]` for anything; "route to next_agent's own normal triage surface" (the task's own suggested framing) does not literally exist for any of the 14 SECONDARY next_agent values — the correct model is SLS/RLC/DRS's own proven shape (age-ordered claim → dispatcher-wrap → spawn resolved agent directly), generalized, not a new surface.
**Output:** brief only, no board write (commit zone doesn't cover orch-state.json for this supervised row per dispatch instruction). Recommended board actions left to router/PO/dev-team: mint `FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN`, point `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`'s implementation at brief §1, surface the `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES` stall (blocking a P0), leave `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` open until §1/§2 land with evidence.
**Next:** implementer recommendation = architect direct-implement (same file family I authored BOUNDED-1/SLS/RLC/DRS/PRIMARY-QA-Drain in), dev-team direct-execute as acceptable fallback.

## 2026-07-31T09:27Z — FU-OCR-BOOT-LOOP-SEQUENTIAL (zone=apps/mcp-server/, P3/S, REVIEW-type, dev-team dispatch, BOUNDED-1 auto-pickup)

**Task:** review whether FIX-CTG-3-STEP-D's parallel->sequential bootstrap OCR loop change (composition-root.ts §4b) still trades acceptable startup latency for CPU safety.
**Design:** No code change. Traced the loop's call site first: it fires via `setTimeout(10_000)` AFTER `createBunServer()` already made the server live (composition-root.ts:62 vs :137) — sequential-vs-parallel cannot touch server-boot latency at all, only background Tier-3-cache warmup timing, reframing the row's own premise. Live-probed `vn-market-intelligence-mcp-mcp-server-1` (2 boots' `docker logs` + a read-only `bun -e` query against `/app/data/market.db`) instead of trusting "small in steady state": true on COUNT (271/279 PDFs fast-skip), false on dominant cost — 3 large PDFs (204p/255p/285p) pinned at pdfOcrWorker.ts's 80-page cap, perpetually failing its 50%-completeness gate, fully re-OCR'd every single boot (~10-12min each, ~33min total observed). Cross-checked against my own prior sibling finding (`docs/architecture-briefs/2026-07-28-pdfx-tesseract-concurrency-invariant.md`, apps/pdf-extractor) — measured, same-codebase proof that unbounded OCR concurrency drives near-OOM + CPU starvation, direct corroboration for staying sequential rather than restoring `Promise.allSettled`.
**Finding:** the *actual* backlog driver is unrelated to sequential-vs-parallel: an 80-page hard cap (pdfOcrWorker.ts:261) checked against an uncapped 50%-of-total completeness threshold (pdfOcrWorker.ts:217-219) can never be satisfied for any PDF >160 pages — perpetual delete-then-re-OCR, forever, plus a real availability gap (DELETE runs before re-insert, so concurrent cache reads see zero rows mid-boot).
**Output:** board row `in_progress[]→done_verified[]`, `status:DONE_VERIFIED`, `.head` reset to idle, SAME `orch-apply.sh` write (CANONICAL:SSOT-STATUSFLIP-LANEMOVE). New backlog row minted: `FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH` (P2, `apps/mcp-server/`, owner+next_agent both explicit `dev-mcp-server`).
**Next:** flagged to po (journal, not acted here): this row's cold-detail entry carried `.route` only (no `.owner`/`.next_agent`) — BOUNDED-1's NON-DEV-OWNER/NEXT_AGENT gates don't key on `.route`, so it silently auto-promoted past them; `HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING` has the identical shape live today. Distinct from the already-closed `FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE` (that one covered board-level non-dev `.owner` presence, not detail-level `.route`-only absence).

## 2026-07-31T02:41Z — FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR (zone=cross-service/, P1/M, direct PO-mint FIX, `po/triage-20260731T0212`)

**Task:** every subagent shares ONE git working dir + ONE `HEAD`; any agent that honors a `branch:`
field (e.g. a PM handoff) checks out that branch, and a concurrent peer's commit silently lands on
it. 4 independent hits 2026-07-31 alone.
**Design:** verified git has NO `pre-checkout` hook (only `post-checkout`, which cannot block the
checkout, only revert-after + force the caller's own exit code). Chose AC-1(a): new
`scripts/git-hooks/post-checkout`, hard-reverts any non-`main` checkout in the primary working dir
back to `main`, `MODE=enforce` default (deliberate divergence from the sweep-guard hook's own `warn`
default — justified: zero legitimate off-`main` state exists live today, revert is self-healing not
blocking). Exempts linked worktrees by construction (git-dir vs git-common-dir, live-tested) so it
does not foreclose `SPIKE-C44` later. Rejected (b) worktree-isolation-for-everyone as primary (blast
radius = whole fleet vs `SPIKE-C44`'s own 2-developer scope, itself unstarted) and (c)
schema-level-ban as this row's own primary layer (the `branch:` field lives in free-form markdown,
nothing for a schema to bind to).
**Finding:** 5 live flow docs (`pm/flow/main.md:75`, `developer/flow/main.md:51-54+158`,
`developer/flow/microservice-main.md:53-57+161`, `qa/flow/main.md:37,42,114-124,219-224`,
`fixer/flow/*.md:34,36,60,110`) still actively author/verify/honor the `task/NNN-*` convention
today, post-dating `UC-RDL-P7` STEP1's 2026-07-17 ruling — one of them fired hours before this brief
on the row's own cited incident file. Shipping the hook with zero coordination breaks
`developer/main.md`'s own `VERIFY` line for every M/L task; flagged as a rollout coordination note
for PM, not implemented here (`UC-RDL-P7` STEP2 already owns those 5 files, `agent-father` zone).
**Output:** `docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md`
— AC-4 live positive control satisfied via 5 scenarios in a disposable scratch repo (control
reproduces the hijack; guarded prevents it; non-destructive-conflict edge case fails loud without
discarding uncommitted work; linked-worktree exemption; re-entrancy, 0.39s, no recursion).
**Next:** board row `backlog[]→ready[]`, `next_agent: pm`, `architect_brief`/`architect_review_note`
written via `orch-apply.sh`. Did not implement `scripts/git-hooks/post-checkout` myself (design-only
per `not_my_job`); did not touch the 5 flow docs (`UC-RDL-P7`'s scope, not this row's — AC-3 dedup).

