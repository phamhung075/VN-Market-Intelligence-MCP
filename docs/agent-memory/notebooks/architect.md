# Architect — Notebook

**Last updated:** 2026-07-24 16:58 UTC | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-07-24T16:58Z — FACTORY-GUARD-CI-size-lint-justification (zone=cross-service/, P2 BOUNDED-1 pickup, design+decompose)

**Task:** Scope/design an underspecified backlog row (title-only, no approach/dod/files) — the FACTORY-MAINTAINABILITY-2026-06 CI-guardrail companion for the 120-LOC + `size-justification`-header standard the audit brief already declared but never enforced.
**Finding:** Zero existing mechanism covers `apps/**/*.ts|py|go` size — the only live analog, `context-bloat-backstop.sh` + `file-size-caps.json`, explicitly excludes code ("Code and data JSON are explicitly NOT governed") and is a session-time Claude-tool hook, not a CI gate. Live-counted (ticket said stale "600+"): 748 files >120L across apps/+packages/, 733 unjustified, 15 already carry the exact `size-justification:` convention this ticket proposes (organic FACTORY-* split precedent). Ticket prose was wrong on TS comment syntax (`<!-- -->` invalid in `.ts`) and on the suggested `agent-father` router (its own init.md disclaims production code; sibling row UC-ASL-P6 is `supervised:true` for the identical un-routable next_agent+zone combo).
**Output:** `docs/architecture-briefs/2026-07-24-factory-guard-ci-size-lint-justification.md` — baseline/ratchet CI design (grandfather today's 733, fail only new/regrown offenders; full-tree scan at CI time, not diff-only, closing the doc-hook's non-Claude-tool-edit gap); marker corrected to `//` (ts/go) / `#` (py); minted child dev row `FACTORY-GUARD-CI-SIZELINT-IMPL` (`developer`, zone cross-service/) for the script+baseline+workflow wiring — not self-implemented.
**Next:** pm/dev-team — promote+dispatch `FACTORY-GUARD-CI-SIZELINT-IMPL` when picked up; dispatcher (this task's owner) flips `FACTORY-GUARD-CI-size-lint-justification` board status.

## 2026-07-22T22:06Z — COWORK-GUARANTEED-SLOT-CATCHUP (zone=cross-service/, high user_prioritized, design-only)

**Task:** BA spec (10 FR/7 NFR/12 AC/5-row consolidation) — design shared catch-up module extension (FR-1,3,4,6,7,9), rule explicitly on FR-8 (firer fanout timeout) and the Track-B pmset/caffeinate keep-awake residual, reassign owners on the 5 consolidated rows.
**Finding:** Grep-confirmed `cowork-guaranteed-slot-firer.sh` has zero MCP/gateway access today (no `mcp-call.sh` sourcing) and zero `last_fired` write call-sites exist in any of the 4 spawned flows — the ONLY stamp site is `last-fired.md` Step 5b, unconditional right after spawn (0.2/0.4's defect, re-confirmed at source). `coordinationStore.ts listHeldTasks()` returns `claimed_at` — powers a path-agnostic FR-7 reconciler with zero schema change. New brownfield finding not in BA spec: the 4 spawned flows do NOT share one date-basis for their `published:` marker — `digest-daily`'s non-Sunday path keys on **UTC-date**, not VN-date, unlike chef/fb/tnb-audit — catch-up must mirror this per-slot, not assume VN-date uniformly (correcting it is out of scope, risks orphaning a held marker at the day-boundary).
**Output:** `docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md` — new pure domain sibling module `cowork-catchup-predicate.js` (mirrors `cadence-policy.js` precedent, DI'd `field`/`dowMatch`, one-directional require, zero circularity); `task_list_held` delivery-check kept per-caller/infrastructure (DDD golden rule: domain has zero I/O), conditional on non-empty `catchup_raw` (NFR-3 preserved); FR-6 ruled — published-marker `task_claim` ratified as sole symmetric arbiter across all firing planes (rejected a "stand-down" derived-signal design — repeats this sprint's own root-cause bug class), directly answering `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE`'s own open design question; FR-7 ruled Option (b) reconciler over Option (a) per-flow self-write (avoids reintroducing the lost-update race `last-fired.md`'s batched write was built to avoid, matches path-agnostic prior art already on that row's own note); FR-8 ruled raise `FIRE_TIMEOUT_SECONDS` per dish_type (`_dish_type_catchup_config`, NFR-4) + accept bounded residual, NOT a flow-duration diagnosis (chef.md is a legitimately heavy 812-line sequential 8-step flow, zero subagent fan-out, confirmed by grep); Track-B ruled document-the-residual, no keep-awake daemon (Track A's catch-up already provides correctness backstop). Appended Brownfield Findings to BA handoff. 5 consolidated rows + umbrella task reassigned `owner:developer`/`next_agent:pm` via `orch-apply.sh` (additive fields only, lane/status untouched — AC-9's "close together" bar stays PM/QA's). BUILD-STANDARD: not-applicable.
**Next:** pm — decompose FR-1..FR-10 into atomic dev tasks (one shared-module zone, sequential not parallel-dispatch); route the cron-runbook doc subtask to agent-father, rest to developer; true up board row `type: SPRINT-S` → likely SPRINT-M/L (router-flagged, non-blocking).

## 2026-07-21T23:57Z — FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (zone=multi, P0 supervised, plan_only, design-only)

**Task:** BA spec (8 FR/3 NFR/8 EC) + PO Q1 ruling (Option B — this ticket closes fix_spec(a)+(c)/AC1+AC3, fix_spec(b)/AC2 spins a new supervised successor row) — rule 3 architect-decidable calls, then blueprint.
**Finding:** Widened BA's I10 finding — `execute-tier.md:64`'s finally-release call also omits the required `owner_client_session` param (BA only flagged the `:42-48` claim call); `owner_client_session` is a non-optional Zod field on both `task_claim` and `task_release`, so the dispatcher-side sprint-task lock lifecycle in `execute-tier.md` looks non-functional end-to-end as literally written. Live-grepped 12 backlog+BLOCKED rows on the board; one (`TASK_2005`) has a decision-journal-documented cause (in_progress→backlog+BLOCKED on a new `depends_on`) grounding the backlog+BLOCKED ruling in real system behavior, not abstraction.
**Output:** `docs/architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md` — FR-5 board-flip bundled into FR-4's commit via ONE shared `resolve-task-lane-by-id.jq` resolver (router probe + dev-team read-guard + board-flip write, not 3 drifting copies); `backlog+BLOCKED` ruled TERMINAL (asymmetric safety cost, in_progress+BLOCKED not symmetric since it resumes downstream of PO/BA scoping, backlog+BLOCKED would bypass triage entirely); I10 batched into the fix_spec(b) successor as a hard PRECONDITION (not just adjacent bundle) of that row's heartbeat-loop deliverable, 4-step ordering specified (I10 fix → TTL/heartbeat-loop → doc-sync incl. a 4th site BA didn't cite, `fail-loud-protocol.md:71` → INV-GATEWAY-1 dead-call cleanup). DDD layers ratified unchanged from BA. Appended Brownfield Findings to BA-spec handoff. BUILD-STANDARD: not-applicable.
**Next:** pm — decompose FR-1..FR-8 into atomic dev tasks + mint the fix_spec(b)/AC2 successor row per PO Option B + brief §4 ordering. SUPERVISED HOLD recorded on board — do not auto-dispatch pm without supervisor go-ahead.

---

## Archive (pre-2026-07-21T23:57Z)

[Older cycles archived to git history: UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-21T22:36Z,
zone=cross-service/, S4 direct-spawn — fixed WIP formula to in_progress-only, new ready-lane consumer +
review-lane QA-drain + dispatch-gate satisfiability instrument, extracted shared devteam-eligibility.jq,
committed directly b787e9a5d), FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (2026-07-21T21:32Z,
zone=cross-service/, P=high size=M REVIEW — built Supervised-Lane Sweep SLS spending the
named-but-unused 2nd WIP≤2 slot, 16/16 supervised/plan_only rows resolved, dispatch_lane stamp),
DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING (2026-07-21T18:02Z,
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
