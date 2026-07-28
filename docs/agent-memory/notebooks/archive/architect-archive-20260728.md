# Architect — Notebook Archive (split 2026-07-28)

Pruned from `docs/agent-memory/notebooks/architect.md` when that file exceeded its 12 000-byte
cap (docs/data/file-size-caps.json, agent-notebook class). Archive files are EXEMPT from the cap.
Nothing was dropped — every cycle below is the verbatim pre-split content.

---

## 2026-07-25T11:20Z — FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION (zone=docs/agents/dev-team/flow/, P0 supervised plan_only, out-of-band architect spawn)

**Task:** PO-ruled P0, design PRE-SELECTED (aged round-robin over 5 idle-path consumers + durable `pendingSignals` inbox) — mechanize, do not re-litigate. Board row cannot self-dispatch (supervised+plan_only routes to the Supervised-Lane Sweep, 2nd in the very chain it describes) — router spawned out-of-band.
**Finding:** Confirmed live: `pendingSignals` is a pure in-conversation artifact (grep-confirmed: never written to file/DB/orch-state key). Destructive-before-delivery defect is NOT limited to §0a-1 (file signals) as illustrated — §0a-D (dashboard/`signal_queue` rows) shares the identical unconditional NEW→READ-before-Step1-confirms shape (`drain-signals.md:21-56`). Verified all 12 named destroyed signals still sit in `docs/signals/processed/` (7d prune hasn't hit them yet). Sampled the 363-row historical `routed-to-po` backlog (sqlite3 group-by): genuinely mixed — noise (cowork telemetry, breach hooks) vs plausibly-actionable (`bctc_signal`/data-quality, ~160 rows) — not a clean call, so the recovery-sweep decision is routed to PO explicitly rather than assumed either way.
**Output:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` — new root orch-state key `dev_team_idle_chain` (`z.record(z.unknown())`, same precedent as `narrative`/`dashboard_section_cache`), oldest-`last_served_tick`-wins single-serve-per-tick selection (no same-tick cascade — rejected as reintroducing a smaller-scope fixed-priority race), durable `pending_triage_inbox[]` with durable-append-BEFORE-destructive-move/flip ordering (batched, retain-on-failure), flagged a `signal_total` conservation-guard gap (blind to the new inbox). AC-1..AC-4 mapped onto extending the existing `devteam-dispatch-gate-satisfiability.sh` (per AC-4's explicit instruction, not a new instrument).
**Next:** pm decomposes per brief §6 file list into atomic dev tasks — implementation is a SEPARATE downstream dispatch (row stays `plan_only:true`, SUPERVISED HOLD).

## 2026-07-25T00:10Z — IVC-ARCH-BLUEPRINT (zone=multi, design-first SPIKE handed by PO)

**Task:** Blueprint for uniform strict-schema input-validation coverage across all agent write surfaces (Class A ~162 MCP tool files, Class B orch-state DONE, Class C ~77 docs/data/*.json + notebooks + handoffs) — decide the Class-C enforcement mechanism (must be fail-closed), standardize the descriptive-error contract, rule strict-completeness, inventory Class-A.
**Finding:** `docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md` already mandates a dual-point (Claude-hook + server write-door) pattern for orch-state.json — this blueprint generalizes it, not invent a third mechanism. `orch-state-hook-prewrite.mjs` is explicitly fail-open on validator-infra crash (documented "wedge-guard" tradeoff) — exactly the class PO wants inverted (UC-CRITIC-HOOKS-ENFORCEMENT). 77 docs/data/*.json cluster into ~15-20 real shapes (unified-agent-synthesis-* ×23, cycle-snapshot-* ×5, pilot-status-* ×10, auditor-tier*-last-healthy ×4) — glob-keyed registry, not 77 exact-path entries. Class-A live-counted: 162 tool files / 115 import zod / only 14 use explicit safeParse+descriptive-reject (the real GOLD-pattern bar) / 12 zero-zod spot-checked as read-only (mutation tools deliberately removed task 241, not validation gaps) / 6 confirmed raw-SQL-in-interface-layer gap candidates. Canonical error shape found already 90% built: `foreignFlowValidator.ts`'s `ValidationError{field,reason,originalValue}` + agentSignalTools' message+audit-log pattern + the directive's `path/problem/expected/fix` — merged, not reinvented.
**Output:** `docs/architecture-briefs/2026-07-25-input-validation-coverage-blueprint.md` — decision: fail-closed PreToolUse hook + glob-keyed schema registry (`storeSchemaRegistry.ts`), absorbing orch-state.json's existing hook as registry entry #1 (not a parallel hook); rejected 77x per-store apply-wrapper clones (disproportionate, still needs a hook on top to block bypass) and "shared helper" as a standalone option (same vigilance-shaped weakness as fail-open hooks unless something makes calling it unconditional). Bounded blast radius: registry-miss=pass-through (not a PO-constraint violation, nothing validated today), registry-hit+infra-crash=BLOCK, narrow named emergency bypass mirroring `ORCH_APPLY_ALLOW_SHRINK`, proactive auditor canary probe of the validator chain. Proposed (NOT minted) ~11-14 row decomposition, mostly dev-mcp-server, BA formalizes first.
**Next:** ba formalizes FR/AC spec from the blueprint, hands to pm for task minting (BA→PM→dev-mcp-server chain per agent-roster.md). PM must NOT guess the `IVC-A3+` gap-fix row count ahead of `IVC-A1`'s scripted scan output.

---

## Archive (pre-2026-07-25T17:36Z)

[Older cycles archived to git history: FACTORY-GUARD-CI-rebuild-raw-verify-hook (2026-07-24T20:31Z,
zone=cross-service/, P2 BOUNDED-1 pickup — 7th/last ci-regression-prevention guardrail, DDD infra/
interface trigger scope reused from size-lint/metric-mask siblings, wired into scripts/git-hooks/pre-push
PRIMARY + ci.yml SECONDARY, child FACTORY-GUARD-CI-RAWVERIFY-IMPL), FACTORY-GUARD-CI-shared-package-import-check (2026-07-24T19:57Z,
zone=cross-service/, P2 BOUNDED-1 pickup — 3/3 packages/shared-* zero real importers repo-wide (phantom-
package shape), baseline/ratchet orphan-importer check + advisory name-collision scan, child FACTORY-
GUARD-CI-SHAREDPKG-IMPL), FACTORY-GUARD-CI-no-hardcode-allowlist-scan (2026-07-24T19:31Z,
zone=cross-service/, P2 BOUNDED-1 pickup — narrowed "ticker allowlist" scan to literal-in-control-flow
class (not the legitimate cascade/policy rule tables), 5 live sites (JANITOR-034/035 already tracked +
2 new cosmetic), zero-tolerance no-hardcode-allowlist-scan.sh, child FACTORY-GUARD-CI-NOHARDCODE-IMPL),
FACTORY-GUARD-CI-dead-code-gate (2026-07-24T19:02Z,
zone=cross-service/, P2 BOUNDED-1 pickup — ticket's "4 committed .bak" stale (already 0, self-closed
same-day commit `2a146ecdd`), found 2 uncovered `.backup`/`.patch` survivors + 4 `_deprecated/` dirs/
1,373L + a bigger unlabeled orphan `apps/technical-analysis/src/` (697L, dead since a PO-decided-FINAL
2026-05-22 Go rewrite never swept the TS tree), zero-tolerance `dead-code-gate.sh` 4-check design,
child `FACTORY-GUARD-CI-DEADCODE-IMPL`), FACTORY-GUARD-CI-depguard-tier-boundaries (2026-07-24T18:29Z,
zone=cross-service/, P2 BOUNDED-1 pickup — ticket wrong on 2/3 clauses (TS fences + Python contract
already live/enforced, real TS gap was ESLint never running in CI + missing news-fetch-go-lint job),
net-new go/ast composition-root-logic gate scoped to receiver methods (2 real macro-indicators
offenders, zero false positives), zero-tolerance, 2 child rows FACTORY-GUARD-CI-TSBOUNDARIES-IMPL +
FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL), FACTORY-GUARD-CI-metric-mask-lint (2026-07-24T17:26Z,
zone=cross-service/, P2 BOUNDED-1 pickup — corrected dispatch prompt's inferred intent (composite-
metric-masks-dead-detector was wrong; `detail_ref` carried the real numeric-literal-fallback spec),
4 live offenders/2 files (`cascadeEngine.ts` x3 `?? 0.6`, `marketSentimentCalculator.ts` x1 `?? 1.0`)
+ 1 excludable config default, zero-tolerance cross-language regex script, `metric-mask-allow:`
escape hatch, child `FACTORY-GUARD-CI-METRICMASK-IMPL`), FACTORY-GUARD-CI-size-lint-justification (2026-07-24T16:58Z,
zone=cross-service/, P2 BOUNDED-1 pickup — baseline/ratchet CI gate for 120-LOC+size-justification,
733/748 unjustified live-counted, `size-lint-baseline.json` grandfather, child FACTORY-GUARD-CI-SIZELINT-IMPL),
COWORK-GUARANTEED-SLOT-CATCHUP (2026-07-22T22:06Z,
zone=cross-service/, high user_prioritized design-only — BA 10 FR/7 NFR/12 AC/5-row consolidation,
new pure domain sibling `cowork-catchup-predicate.js`, FR-6 published-marker sole-arbiter ruling,
FR-7 reconciler-not-self-write, FR-8 raise-timeout+accept-residual, Track-B no keep-awake daemon,
READY_FOR_PM), FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (2026-07-21T23:57Z,
zone=multi, P0 supervised, plan_only — FR-5 board-flip bundled into FR-4's commit via ONE shared
`resolve-task-lane-by-id.jq` resolver, backlog+BLOCKED ruled TERMINAL, I10 `owner_client_session`
gap widened + batched into fix_spec(b) successor as hard precondition, SUPERVISED HOLD),
UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-21T22:36Z,
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
