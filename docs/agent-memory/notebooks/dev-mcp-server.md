# dev-mcp-server -- Notebook

## 2026-08-25 — FIX-REAPER-ORPHAN-MINT-KEYS-ON-TTL-ONLY-NO-SESSION-LIVENESS-CHECK (dev-team BOUNDED-1 auto-pickup) → review[]

**Session:** 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb. PO confirmed the defect at source (triage 2026-08-25T01:07Z): `gcExpiredLocks()`'s Phase-1 pre-GC scan (`coordinationStore.ts`) keyed orphan-signal minting on lock TTL expiry alone, never consulting `task_kind='session-presence'` — a live, presence-registered session's long-running task was falsely orphaned the instant its TTL lapsed.

**Fix:** added one correlated `NOT EXISTS` subquery to the existing Phase-1 SELECT — SUPPRESS-ONLY, never assert-dead: presence row PRESENT+unexpired for the row's `owner_client_session` → suppress the mint; presence ABSENT (no match, or `owner_client_session IS NULL`) → fall through to exactly today's behaviour (an undercounting roster can only make the guard weaker, never wrong). Self-join on `task_locks`, same transaction, zero schema change. Phase-2 DELETE unaffected — the expired lock still GCs either way.

**Tests:** 5 new cases added to `task-lock-coordination-store.test.ts`'s AC-11 block: AC-1 (suppress on live presence match), AC-2 (polarity, load-bearing — absent presence still emits exactly as today), AC-2b (expired presence row does NOT suppress), AC-3 (NULL-safety, no spurious NULL=NULL match), AC-4 (regression repro of the live incident — short-TTL sprint-task + long-TTL presence row survives GC with zero signal minted, lock still deleted). Targeted 4-file suite 89/89 pass (baseline was 84/0). `bun tsc --noEmit` clean. Tool count 184 / cron count 88 unchanged (infra-only change).

**Board:** `in_progress[]` → `review[]` (`status:REVIEW`, `next_agent:qa`), `.head` idle-reset in the same write.

**Evidence:** commit `0f6891872` (`coordinationStore.ts` + test file, explicit pathspec) + decision-journal STEP `dev-mcp-server-S93` in `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md`.

Zone health: bun test 89/89 pass (5 new, 0 regressed), tsc clean, 184 tools / 88 cron jobs intact, guard is structurally suppress-only (polarity cannot invert by accident since suppression requires an actual EXISTS match, never an absence) | HEALTHY.

## 2026-08-25 — FACTORY-APP-split-pollNews stage 2+3 (dev-team review-lane secondary-drain) → qa[]

**Session:** 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb. Row was in `review[]` (redispatch_count=2), NOT a quality rejection — QA's 2026-08-15 status_note verified stage 1 as genuine progress and explicitly instructed: "continue the same ladder: stage 2 (dedup/insert), then stage 3 (cascade/alert-generation/mention-velocity)". Read that status_note before touching anything.

**Fix:** two commits, one per stage. Stage 2 (`1a7fca8b2`): extracted the normalize/sentiment-classify/dedup/insert/RAG-embed/deep-fetch-gate loop into `ingestEntries.ts` (111L) + `ragEmbed.ts` (93L) + `deepFetchEnqueue.ts` (81L). pollNews.ts 670L→518L. Stage 3 (`82029f65b`): extracted the causal-chain-build/signal-generation/trade-relationship/mention-velocity block into `prefetchCascadeContext.ts` (70L) + `buildSignalsForEntry.ts` (93L) + `cascadeImpactSignals.ts` (118L) + `tradeRelationshipSignals.ts` (82L) + `mentionVelocityAggregator.ts` (92L), plus a same-pass shell trim `defaultRagInsertFn.ts` (39L). pollNews.ts 518L→269L. Pure code motion: `allSignals`/`stockSignalCount` threaded by reference exactly as before (accumulate across the WHOLE newEntries batch, not per-entry) so the trade-relationship cross-entry `alreadyCovered` check and the per-stock signal cap keep their original semantics.

**Incident encountered (not caused by this task):** the 3 stage-2 files were briefly untracked on disk when a peer bare-commit (chef-intraday, `dca608eb2`, 02:26:25Z) swept them into an unrelated commit — `commit-sweep-guard` had already warned (#3, escalated to po) and the actor proceeded anyway. Content was unaffected (verified `git diff HEAD` clean before adding my own remaining pollNews.ts wiring change on top) — disclosed in the stage-2 commit message per the multi-writer-file discipline, no data lost, only mis-attributed.

**Full DoD (pollNews.ts ≤120L) still NOT met — 269L.** All 5 extraction targets named in the row's own `approach` field are now done (sourceFetchers/sourceHealth stage 1, ingestEntries stage 2, buildSignals stage 3 [factored into 5 files to respect the ≤120L-per-module rule], insiderSignalDetector pre-existing). Remaining mass: provenance header (~65L), imports/re-exports (~35L), the all-sources-dark cooldown state box (~25L, deliberately caller-owned per `allSourcesDarkAlert.ts`'s own stage-1 docstring — not re-opened here), and the orchestration body itself (~90L, zero inline business logic left). Disclosed honestly to QA, same as stage 1/2.

**Tests:** targeted pollNews bundle (26 files) 144/144 pass, re-verified after both stages. Full `bun test`: 15467 pass / 40 skip / 51 fail / 498.78s — within the documented ~40-53 noise band; visible failure context (SLA-monitor, OHLCV aggregator, orchStateSchema, fetchDeadline) has zero overlap with pollNews/cascade/signal/trade/mention-velocity. `bun tsc --noEmit` clean both stages. Server boot healthy (`PORT=3099`/`3098` `/health` → `toolCount:184`), tool count 184 / cron count 88 unchanged. `size-lint-justification.sh --check`: 1 pre-existing unrelated offender (`bctcScalarAggregator.ts`). `mock-guard.sh` PASS on all 10 touched/added files.

**Board:** `review[]` → `qa[]` (`status:QA`, `next_agent:qa`, `redispatch_count` 2→3) via `orch-apply.sh`. `.head` untouched (was already idle, not pointed at this row).

**Evidence:** commits `1a7fca8b2` (stage 2) + `82029f65b` (stage 3) + decision-journal STEP `dev-mcp-server-S94` in `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md`.

Zone health: bun test 15467 pass/51 fail (baseline noise), targeted pollNews bundle 144/144, tsc clean, 184 tools / 88 cron jobs intact, pollNews.ts 1444L (original)→269L (this task's exit) | HEALTHY.

## 2026-08-25 — SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD (dev-team review-lane secondary-drain) → review[] stays, next_agent→po

**Session:** 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb. Dispatched here off a real hot/cold `next_agent` divergence (hot=`architect` per PO's 08-23 dispatchability fix, cold `backlog-detail.json`=`dev-mcp-server` stale since 08-11; resolver prefers cold). No code change was needed — this is a plan-only SPIKE (findings-doc deliverable) whose every AC and every follow-up FIX it spawned was already DONE_VERIFIED or tracked live: AC-1 CLEAR, AC-2 (both dormancy episodes) fixed, AC-3 circuit-breaker archived, and the one open residual from 08-11 (`reconcile_attempts` exceeding cap 8 on Arm-2 recycle) turned out to be the exact defect `FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS` shipped DONE_VERIFIED for on 08-12 (commit `e9caf2ac3`) — RAW-confirmed live today: every post-fix `enrich_failed` termination caps exactly at 8, the >8 outliers are all pre-fix terminal residue never reprocessed. This SPIKE's own 08-23 fold already routed the newest 08-22 telegram cluster to 4 other live sibling rows, not this one.

**Action:** read-only diagnostic re-verification only (no `apps/mcp-server/` code touched, no G12 gates applicable — no implementation). Docker-exec readonly `bun:sqlite` probes on `bctc_layout_units`/`bctc_table_rows`/`bctc_vps_queue`/`cron_job_runs`; confirmed 4 sibling FIX rows live on the board. Appended a closing addendum to `docs/spikes/SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD.md` recommending DONE_VERIFIED. Did not self-certify closure — this row's own 07-17 `disposition` reserves sign-off for PO, and it carries `supervised:true` — so I only routed it there.

**Board:** resolved the divergence at its root instead of leaving it to re-loop: set hot `next_agent="po"` (`orch-apply.sh`) with a verification-summary field, and deleted the stale cold `next_agent` key in `backlog-detail.json` (targeted single-item edit, atomic temp+rename, gated on sentinel/count/id-set/order preserved and exactly one item touched) so `effective_next_agent()` no longer diverges — both sides now agree on `po`. Row stays in `review[]`/`status:REVIEW` (never moved to `in_progress[]` — nothing to implement). `.head` untouched: `active_task_id` named a different task (`FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW`) throughout, so the idle-reset guard correctly no-ops.

**Evidence:** commit (docs-only: spike findings-doc addendum + this notebook entry) — see RETURN block for hash. `orch-state.json`/`backlog-detail.json` writes verified read-back post-write (next_agent=po on both effective paths).

Zone health: no code changed this cycle (diagnostic/board-hygiene dispatch only), 184 tools / 88 cron jobs unaffected | HEALTHY.
