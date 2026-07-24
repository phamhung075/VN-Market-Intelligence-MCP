# Architect — Notebook

**Last updated:** 2026-07-24 19:02 UTC | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-07-24T19:02Z — FACTORY-GUARD-CI-dead-code-gate (zone=cross-service/, P2 BOUNDED-1 pickup, design+decompose)

**Task:** Design a CI gate catching tracked `*.bak`/`*.backup`/`*.patch` files, `_deprecated/`/orphaned `src/` trees, and build-ignored archives — 4th of the 7 `ci-regression-prevention` guardrails, same epic/audit as the depguard/metric-mask/size-lint siblings.
**Finding:** Ticket's "4 currently committed .bak" stale — already 0 (`FACTORY-INTERFACE-delete-bak-files` self-closed same-day, commit `2a146ecdd`, `.gitignore` already covers `*.bak`); found 2 uncovered `.backup`/`.patch` survivors instead. Live `_deprecated/`-named debt: 4 dirs/1,373L across mcp-server/pdf-extractor/stock-price, all self-labeled with stale "delete after G5" headers from a stalled migration phase. Found a BIGGER unlabeled orphan the naming grep alone misses: `apps/technical-analysis/src/` (697L incl. tests) — a dead TS DDD stack surviving from a PO-decided-FINAL 2026-05-22 Go rewrite (Dockerfile/CI/compose all Go-only today, TS tree never swept); last live instance of this shape (macro-indicators/kinh-dich-service already 0 TS files). Caught `apps/technical-analysis/package.json` is partially-live (dashboard/build.sh still needs its esbuild/playwright-core deps — trim, don't delete) and `1081-sprint-054-smoke.test.ts` is partially-live (surgical removal of 3 `it()` blocks, not whole-file delete).
**Output:** `docs/architecture-briefs/2026-07-24-factory-guard-ci-dead-code-gate.md` — zero-tolerance CI design (fix all ~2,070L confirmed-orphaned debt in the same child task before the gate activates, despite bigger absolute LOC than metric-mask/depguard since it's 100% pure subtraction of zero-import-verified code, unlike size-lint's refactor-risk 733-file debt): single `dead-code-gate.sh` with 4 structural checks (bak/backup/patch ban, `_deprecated/`-name ban, Go-service+stray-TS-scaffold ban, `//go:build ignore` ban); deferred full knip/ts-prune/vulture unused-export tooling as documented enhancement (no live debt evidence beyond what the 4 checks catch). Minted child dev row `FACTORY-GUARD-CI-DEADCODE-IMPL` (`developer`, zone cross-service/) — not self-implemented.
**Next:** pm/dev-team — promote+dispatch `FACTORY-GUARD-CI-DEADCODE-IMPL` when picked up; dispatcher (this task's owner) flips `FACTORY-GUARD-CI-dead-code-gate` board status.

## 2026-07-24T18:29Z — FACTORY-GUARD-CI-depguard-tier-boundaries (zone=cross-service/, P2 BOUNDED-1 pickup, design+decompose)

**Task:** Extend depguard/import-linter to enforce ALL layer fences (TS boundaries application->interface + domain->infrastructure; Python pdf-extractor import-linter contract; Go composition-root-contains-no-pkg/module-logic check) — 3rd of the 7 `ci-regression-prevention` guardrails, same epic/audit as the size-lint and metric-mask siblings.
**Finding:** Ticket wrong on 2 of 3 clauses. TS — both named leaks (pollNews interface-import, telegramCommands application-import) already `DONE_VERIFIED`/live-committed, AND both fence directions the ticket asks for already forbidden in all 3 live `eslint.config.mjs` — real gap is ESLint never running in CI at all (zero eslint steps anywhere in `.github/workflows/`). Python — the "missing" import-linter contract already lives at `pdf-extractor/pyproject.toml:69-76`, `DONE_VERIFIED` 2026-07-09, already enforced in `py-lint` — zero work needed. Go — depguard fine for 6/7 services but `news-fetch` (7th `.golangci.yml`) has zero CI job wired at all (ticket didn't name this). The ticket's 3rd ask (composition-root contains no pkg/module-logic) IS genuinely new and real — depguard is import-only, can't express it; live-scanned all 7 services' `cmd/server/**/*.go` and found exactly 2 real offenders (both macro-indicators: `policyRatesAdapter.FetchPolicyRates`, `omoAdapter.FetchOMO` — real HTML/DB-fallback decision logic that also sets a business-semantic `IsEstimate` flag, same bug class as the metric-mask ticket), zero false positives against the other 10 checked composition-root shims when scoped to receiver-methods-only.
**Output:** `docs/architecture-briefs/2026-07-24-factory-guard-ci-depguard-tier-boundaries.md` — TS: zero-tolerance CI-wiring gate (fix 3 live offenders in mcp-server + 1 previously-invisible news-fetch offender caused by a `boundaries/elements` drift where `src/routes/**` isn't mapped, then wire `eslint --max-warnings=0` per service; bonus fix: missing `news-fetch-go-lint` job). Go: net-new `go/ast`-based composition-root-logic gate scoped to receiver methods only (excludes `main()`/free helper funcs — empirically zero false positives), threshold if>=2-or-any-for, `composition-root-logic-allow:` escape hatch, zero-tolerance (debt=2 functions/1 service, fixed in the same child task). Minted 2 child dev rows (different toolchains, independently testable): `FACTORY-GUARD-CI-TSBOUNDARIES-IMPL`, `FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL` (`developer`, zone cross-service/) — neither self-implemented.
**Next:** pm/dev-team — promote+dispatch both `-IMPL` rows when picked up; dispatcher (this task's owner) flips `FACTORY-GUARD-CI-depguard-tier-boundaries` board status.

## 2026-07-24T17:26Z — FACTORY-GUARD-CI-metric-mask-lint (zone=cross-service/, P2 BOUNDED-1 pickup, design+decompose)

**Task:** Scope/design an underspecified-looking backlog row (dispatch prompt claimed "no ticket prose") — the FACTORY-MAINTAINABILITY-2026-06 CI-guardrail companion banning the `confidence_score=50` bug class (non-zero numeric-literal fallback fabricating confidence/score/impact/magnitude/probability metrics).
**Finding:** Dispatch prompt's inferred intent (composite-metric-masks-dead-detector) was wrong — `detail_ref` carries a full spec traced to `2026-06-15-maintainability-factory-audit.md`, the numeric-literal-fallback bug class, not aggregate masking. Zero CI/lint coverage confirmed (3 eslint configs, 7 golangci.yml, 2 pyproject.toml — fence/import rules only). All 5 audit fast-track fixes confirmed `DONE_VERIFIED` (allowlist basis honest). Live-counted real offenders: only 4 non-zero-literal masks across 2 files (`cascadeEngine.ts` x3 `?? 0.6`, `marketSentimentCalculator.ts` x1 `?? 1.0`), plus 1 correctly-excludable genuine config default (`watchlist.ts` alert-threshold `?? 7`) — orders of magnitude smaller than the size-lint sibling's 733.
**Output:** `docs/architecture-briefs/2026-07-24-factory-guard-ci-metric-mask-lint.md` — zero-tolerance CI design (not baseline/ratchet, since debt is small enough to fix in the same child task before the gate activates): single cross-language regex script (not 3 native-linter integrations, given near-zero live debt + zero Go offenders), always-allow `0`/`0.0`/`null` (the honest-absence idiom the 5 fixes established), `metric-mask-allow:` inline escape hatch. Minted child dev row `FACTORY-GUARD-CI-METRICMASK-IMPL` (`developer`, zone cross-service/) — fixes the 4 real masks + annotates the 1 config default + ships script/CI wiring — not self-implemented.
**Next:** pm/dev-team — promote+dispatch `FACTORY-GUARD-CI-METRICMASK-IMPL` when picked up; dispatcher (this task's owner) flips `FACTORY-GUARD-CI-metric-mask-lint` board status.

---

## Archive (pre-2026-07-24T19:02Z)

[Older cycles archived to git history: FACTORY-GUARD-CI-size-lint-justification (2026-07-24T16:58Z,
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
