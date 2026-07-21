# Architect — Notebook

**Last updated:** 2026-07-21 23:57 UTC | **Sprint:** ULTRACODE-AUDIT-FIXALL

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-07-21T23:57Z — FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (zone=multi, P0 supervised, plan_only, design-only)

**Task:** BA spec (8 FR/3 NFR/8 EC) + PO Q1 ruling (Option B — this ticket closes fix_spec(a)+(c)/AC1+AC3, fix_spec(b)/AC2 spins a new supervised successor row) — rule 3 architect-decidable calls, then blueprint.
**Finding:** Widened BA's I10 finding — `execute-tier.md:64`'s finally-release call also omits the required `owner_client_session` param (BA only flagged the `:42-48` claim call); `owner_client_session` is a non-optional Zod field on both `task_claim` and `task_release`, so the dispatcher-side sprint-task lock lifecycle in `execute-tier.md` looks non-functional end-to-end as literally written. Live-grepped 12 backlog+BLOCKED rows on the board; one (`TASK_2005`) has a decision-journal-documented cause (in_progress→backlog+BLOCKED on a new `depends_on`) grounding the backlog+BLOCKED ruling in real system behavior, not abstraction.
**Output:** `docs/architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md` — FR-5 board-flip bundled into FR-4's commit via ONE shared `resolve-task-lane-by-id.jq` resolver (router probe + dev-team read-guard + board-flip write, not 3 drifting copies); `backlog+BLOCKED` ruled TERMINAL (asymmetric safety cost, in_progress+BLOCKED not symmetric since it resumes downstream of PO/BA scoping, backlog+BLOCKED would bypass triage entirely); I10 batched into the fix_spec(b) successor as a hard PRECONDITION (not just adjacent bundle) of that row's heartbeat-loop deliverable, 4-step ordering specified (I10 fix → TTL/heartbeat-loop → doc-sync incl. a 4th site BA didn't cite, `fail-loud-protocol.md:71` → INV-GATEWAY-1 dead-call cleanup). DDD layers ratified unchanged from BA. Appended Brownfield Findings to BA-spec handoff. BUILD-STANDARD: not-applicable.
**Next:** pm — decompose FR-1..FR-8 into atomic dev tasks + mint the fix_spec(b)/AC2 successor row per PO Option B + brief §4 ordering. SUPERVISED HOLD recorded on board — do not auto-dispatch pm without supervisor go-ahead.

## 2026-07-21T22:36Z — UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (zone=cross-service/, S4 direct-spawn, implemented directly)

**Task:** PO ruling (instance 9 on the count-threshold-gate class): BOUNDED-1 gate `(ready+in_progress)<1` and SLS gate `(ready+in_progress)<2` both permanently false at ready=36/in_progress=1 — neither auto-pickup lane could ever fire while ready[] is saturated. Deliver gate=in_progress-only + a ready-lane consumer + a review-lane QA-drain + a satisfiability (not lane-resolution) DoD instrument — all 4, not any subset.
**Finding:** Confirmed root cause at source: `ready[]` conflated a staging queue with a concurrency count. 25 of the 36 ready[] rows (CCATO-MCP-T1..8, SYSREMAKE-P2-T1..9, DESIGN-COWORK-FANOUT-T1..8) are PM/architect epic children with a resolved `next_agent` but no `promoted_by` marker BOUNDED-1/SLS claim scripts recognize — unclaimable by anything. `review[]` (32 rows) had zero consumers anywhere in the flow, and ALL 32 rows carry `branch:null` — the normal qa `pipeline` git-checkout mode would guarantee-fail every dispatch (hard prerequisite, not separable, confirmed via grep).
**Output:** Fixed WIP formula to `in_progress` length only (`main.md` + `promote-bounded1.jq`, byte-identical candidate-set parity verified). New Ready-Lane Consumer (`devteam-backlog-claim-ready-lane-consumer.jq`, respects `depends_on` sibling chains — verified it picks `CCATO-MCP-T1` not `T3`). New Review-Lane QA-Drain (`devteam-review-claim-qa-drain.jq` + `qa/flow/main.md` § Direct-Commit Verify additive mode) folding `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`. New `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — replays the REAL scripts end-to-end against the live-shaped saturated fixture, asserts fire+drain (not lane-resolution — the exact false-green class `bounded1-supervised-lane-report.sh` fell into for the inert SLS), includes a negative WIP-cap control. Extracted `scripts/lib/devteam-eligibility.jq` (SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW design principle adopted), migrating 3 hand-copied predicate sets to 1. All candidates Zod+conservation-verified via scratch-copy dry-runs before any live write. Folded (annotated, not re-minted) 4 subsumed rows: `FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER` held REVIEW (root cause of its own dead gate now fixed, lane-resolution logic unchanged), `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` moved READY→REVIEW (implemented), `SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP` instance-9 closed (broader findings-doc scope stays open), `SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW` moved BACKLOG→REVIEW (recommendation shipped, not just documented).
**Next:** dev-team/QA — verify all 4 lanes fire on a live tick (PO AC(3): review[] count strictly decreasing across 2 consecutive ticks with row ids named) before flipping the folded rows to DONE_VERIFIED; zone cross-service/. Committed directly (`b787e9a5d`) mirroring the FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER precedent for this orchestration-script class — no production `apps/` code touched.

## 2026-07-21T21:32Z — FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (zone=cross-service/, P=high, size=M, REVIEW)

**Task:** PO-triaged direct FIX dispatch (router-relayed). `scripts/devteam-backlog-promote-bounded1.jq` claimed rows gated by supervised/plan_only "still launch normally via the router-adjudicated path" — confirm-or-refute, and if false, build the missing sweeper without clearing the gate flags.
**Finding:** CONFIRMED FALSE — grepped every dispatch entry point (`po/flow/main.md` pre-checks, `dev-team/flow/main.md` Step 1) and found no priority-ordered sweep of `task_board.backlog[]` for supervised/plan_only rows anywhere; the PO signal-drain that minted this task already says so in its own `question` field. Live replay of the promote script's own `effective_supervised`/`effective_plan_only` predicates found 16 rows doubly-gated (supervised AND plan_only), 7 P0/P1, oldest 18 days.
**Output:** Built Supervised-Lane Sweep (SLS) — `scripts/devteam-backlog-promote-supervised-lane-sweep.jq` + `scripts/devteam-backlog-claim-supervised-lane-sweep.jq`, wired into `docs/agents/dev-team/flow/main.md` § Supervised-Lane Sweep (spends the pre-existing, named-but-unused 2nd WIP≤2 slot; additive `dispatch_lane` stamp, never clears supervised/plan_only; spawns the resolved specialist directly, bypassing zone-detect's dev-only routing). Acceptance instrument `scripts/audits/bounded1-supervised-lane-report.sh` run live: 16/16 rows resolved, 0 dispatch-lane=none. Corrected the false comment at all 5 sites in the promote script. New scripts dry-run verified (Zod-valid, conservation-neutral, idempotent) against a scratch copy — never run against the live board (dev-team's job next tick).
**Next:** dev-team/QA — verify SLS fires correctly on a live idle-fallthrough tick before flipping REVIEW→DONE_VERIFIED; zone cross-service/.

---

## Archive (pre-2026-07-21T22:36Z)

[Older cycles archived to git history: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING (2026-07-21T18:02Z,
zone=cross-service/, P1 supervised design-first — bounded async schedule_task recheck gated on
won_slots.parallel_group=="gatherers", market-watcher R3 slot-routing fix, 8-row T1-T8 PM decomposition,
READY_FOR_PM), FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD (2026-07-21T17:05Z,
zone=multi cross-service/, P0 router-escalated — universal `scripts/git-hooks/pre-commit` pathspec-
scoped-commit guard + commit-mutex/commit-boundary Layer-1 fix, empirically proved via scratch git
repo, READY_FOR_PM), SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE leg 1: RC-VERIF+RC-CONVERGE
(2026-07-17T05:15Z, zone=multi, P0 authorized route — orch-apply->orch-validate.mjs completion gate
design + DEGRADED StatusEnum value + bug_class/fingerprint convergence ledger, frozen grandfather-ID
allowlist to avoid bricking the hot file, 9-task PM decomposition, READY_FOR_PM), SPRINT-CCATO-TRUTHGATE-MCP-NATIVE (2026-07-17T04:47Z,
zone=apps/mcp-server/, P0 user-prioritized — ported `scripts/narrative-truth-gate.sh` CCATO engine
into native MCP tool `narrative_truth_gate`, DDD layer map domain/services/narrativeTruthGate +
infrastructure/{fileStore,probes,signals}, GATE_VERDICT text marker not isError-on-business-FAIL,
8-task CCATO-MCP-T1..T8 decomposition, READY_FOR_PM), UC-CRITIC-GATEWAY-CONTRACT-DRIFT (2026-07-16T15:44Z,
zone=cross-service/, dev-team relay — reconciled `docs/standards/gateway-call-contract.md` stale
`mcp__claude_ai_gateway__call_tool` prefix, 8-file 1-line fix set (6 BA-cited + 2 folded-in from
sub-bullets of live BACKLOG SPIKE rows), READY_FOR_PM), UC-ASL-P2 (2026-07-16T04:40Z, zone=scripts/+docs/agents/system-auditor/ —
one blessed `scripts/emit-audit-signal.sh` replacing 6 copy-pasted EMIT SEQUENCE blocks, durable
`docs/data/auditor-dedup-ledger.json` BUG-dedup ledger with {ts,sev} severity-rank escalation-bypass,
ratified context-bloat-backstop.sh known-issues.json fingerprint gate DELETE (dead), READY_FOR_PM),
ALPHA-S2-RAG-FTS-REBUILD-CRON (2026-07-15T05:10Z,
zone=multi split, lean single-zone FIX — `POST /admin/rebuild-fts` already shipped/tested,
gap was purely "nobody calls it on a schedule", new `ragRebuildFts()`+`ragFtsRebuildCronJob.ts`,
90s deadline (not OMO's 15s) for FTS build time, READY_FOR_PM), ALPHA-S2-OMO-LIQUIDITY-CRON
(2026-07-15T04:15Z, zone=multi split, lean single-file FIX — `sbv_omo_daily` persist path
100% already shipped, gap was purely "nobody calls the endpoint", HARD/SOFT fail-loud split,
READY_FOR_PM), ALPHA-S2-FOREIGN-FLOW-WRITE-RACE (2026-07-15T00:00Z,
SPRINT-S verdict, zone=multi split — verified FIX-half claim (writeForeignFlowToOhlcv
unconditional daily_foreign_flow upsert, commit 3201c86cc) holds, designed standalone
`foreign_flow_history`+`intraday_foreign_flow_5m` DDL and LAST-value compactor (DDD
bounded-context separation from the price-plane sibling table), 6-subtask split, READY_FOR_PM),
ALPHA-S2-TICK-DOWNSAMPLE-5MIN (2026-07-14T21:30Z,
SPRINT-S zone=multi split — permanent 5-min OHLCV bars table + compaction cron from
`market_prices_history` before the rolling 24h purge deletes surviving ticks, reused
`ohlcvDailyAggregatorJob`'s aggregation shape, standalone 24/7 cron no market-hours gate,
idempotent UPSERT gap-tolerant backfill, flagged `checkDuplicatePriceHistory` W-3 data-loss
landmine, 5-subtask split, READY_FOR_PM), FIX-DAILY-FF-VIEW-JOIN-ANCHOR (2026-07-13T21:00Z,
CI-RED-29f92c5b merge-gate unblock — Shape A bidirectional view over Shape B read-site rewire,
verified exact SQL against isolated `sqlite3 :memory:` scratch session, flagged companion
`daily-foreign-flow-schema.test.ts` regression + `CREATE VIEW IF NOT EXISTS` no-op-on-persisted-DB
footgun, READY_FOR_DEV), UC-RDL-P1 lock-namespace adjudication (2026-07-13T20:00Z,
BOUNDED-1 pickup — `intent:` vs `task:` confirmed intentional two-tier design NOT drift, `sprint-task:`
vs `task:` confirmed REAL drift already independently caught by 2026-07-12 ultracode audit, doc-only
6-AC fix routed to agent-father as sole SKILL.md committer, READY_FOR_DEV), FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (2026-07-13T00:00Z,
bounded design touch — async-reroute over sync-bump for silent BCTC OCR-timeout, reused existing
`extractPdfText()`/`PDF_CONFIDENCE_HIGH_THRESHOLD` classifier, flagged `pdf_path` upsert must-fix
risk, READY_FOR_DEV), ALPHA-S1-CANDLE-RECOVER + STARTUP-CANDLE-GUARD + OHLCV-BACKFILL-DONE-BUG (2026-07-12T19:28Z, wave-1 architect split — VPS-relay recovery + startup/cron candle guard + backfill-done insert-count verification, READY_FOR_PM), BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP (2026-07-10T19:20Z,
PLAN-ONLY — root cause re-confirmed via direct 553L read of orch-cold-evict.sh, 2 concrete mislabels
found (FIX-BCTC-BANK-SUMMARY-MAPPING falsely DONE / FACTORY-INTERFACE-split-server-ts falsely
BLOCKED), D2.5 new-gap for BLOCKED lane, PM D0-D5 decomposition), FIX-AUDITOR-ORCHSTATE-FULLDOC-OVERWRITE-CLOBBERS-SSOT (2026-07-10T15:56Z, PLAN-ONLY — LIVE-reproduced conservation-guard gap, magnitude-bounded circuit-breaker design for orch-apply.sh), FIX-TASKLOCK-OWNER-SESSION-SERVER-SCOPED-DEFEATS-MUTEX (2026-07-10T15:45Z, PLAN-ONLY — stale, already fixed 2026-06-28 via CROSS-SESSION-MULTI-TEAM-ORCH TASK_1980, owner_client_session now sole ownership key), FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION (2026-07-10T10:00Z, SPRINT-S design — D1 financial_reports.id stability fix unblocks D2/D3, R-CRIT-1/2 must-fix risk flags), ARCH-DAILY-FOREIGN-FLOW-TABLE (2026-07-10T02:00Z, BOUNDED-1 pickup — additive `daily_foreign_flow` table + `daily_ohlcv_with_flow` VIEW to structurally close R-1 foreign-flow write-drop, 7-subtask PM atomization), FIX-BCTC-BANK-SCALAR-MAPPING (2026-07-10T00:20Z, LIGHT SPIKE — FR-8 confirmed gateway-blind, FR-9 re-scoped to Track-1 source_report_id carry-forward), SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE (2026-07-08T04:45Z, server exonerated via live curl handshake, 3.5d client-side gateway-blind confirmed, FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE minted), FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM Round 2 (2026-07-08T00:00Z, WRITER-H bypass of writeOhlcvBatch found active/re-contaminating, migrate to writeOhlcvBatch backfill strategy), FACTORY-INTERFACE-split-server-ts (2026-07-04T tick, server.ts 2527L 4-stage extraction plan S1-S4 smallest-safest-first), FIX-DRAINESC-SEVERITY-RECURRENCE-GATE (2026-07-04T01:07Z, GATE-A effective_severity + 2-tier GATE-B board-row-exists/signals_processed recurrence gate), SPIKE-BCTC-DISCOVER-PIPELINE-DEAD (2026-07-03T07:13Z, dead-stage pinned to Stage 3 bctcPdfPullJob overlap/mutex gap, isRunning guard fix, FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD emitted to backlog), SPIKE-BCTC-CTG-BS-REALDATA-ROOT (2026-07-03T07:10Z, 3-layer stacking-bug root cause — parser column-order reversal on bank forms + classifier bold-strip gap + section-vocabulary false-positive — FIX-A..E split), FIX-MCP-MEMORY-CODE-LEAK (2026-07-02T18:17Z, sawtooth-at-tight-cap corroborated live + initDatabase() no-guard hotspot found via source read + McpServer-per-POST rebuild stacking), TOKEN-ECONOMY-TICK-PREFLIGHT (2026-07-02T12:10Z, 3-WU split for cowork/dev-team/auditor tick preflight scripts + stateless-mode MCP verification), ARCH-DASH-CRON-RECHECK-TABLE (2026-07-02T06:50Z, cron-recheck-table SPLIT: job_name hybrid resolution + generic cadence algorithm + Layer-B double-count correction), ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING (2026-07-01T18:20Z, AC-1 spike + bank-form-generic gap + W1-W5 split), BA-PREDICTION-EVIDENCE-REVIVAL (2026-07-01T07:05Z, evidence_type corrections + FR-2.2 VPS proxy 502 root cause + 2-hop split), OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 (2026-06-30T20:45Z, per-ticker anchor repair migration + writer guard + sanity pass 4), FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS (2026-06-30T19:11Z, VPS VNINDEX skip-guard root cause + TASK-VNINDEX-RS-A/B split), BA-IND-P1-MOMENTUM-FRONTEND, BA-IND-P1-MOMENTUM-RS, MARKET-INDICATOR-DEPTH-P0, HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING, FEAT-NEWS-DECISION-RESUME, FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT + 27 earlier cycles pre-2026-06-28.]
