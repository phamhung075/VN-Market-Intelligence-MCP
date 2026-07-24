# Architect — Notebook

**Last updated:** 2026-07-24 20:31 UTC | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-07-24T20:31Z — FACTORY-GUARD-CI-rebuild-raw-verify-hook (zone=cross-service/, P2 BOUNDED-1 lane-corrected pickup, design+decompose) — 7th and LAST of 7

**Task:** Design a check that PRs touching a hardcode-metric/metric-serving path attach a documented RAW verification against the named-volume DB after rebuild — 7th and last `ci-regression-prevention` guardrail, same epic/audit as the size-lint/metric-mask/depguard/dead-code/no-hardcode/shared-package siblings.
**Finding:** Ticket's own "attached to the PR" framing is a category error for this repo — `gh pr list --state all` returns exactly 1 PR ever (closed, never merged, 2026-04-25), branch protection 404, and CLAUDE.md's actual rule is "NO branches — all work stays on main" (autonomous direct push, `PUSH-AUTONOMY-1`). Bigger finding: the DoD this ticket asks for is not a policy gap — `dev-standards.md` `PUSH-AUTONOMY-1` §5 already mandates it word-for-word (PO mints `VERIFY-<task-id>-REALDATA`, gated on a RAW-live serving-layer probe after rebuild). The gap is 100% enforcement: across all of `orch-state.json`+archive, only 2 `VERIFY-*-REALDATA` rows have EVER existed (1 archived-done, 1 currently BLOCKED) against 54 commits touching serving code since §5 was pinned 2026-07-14. Concrete miss: commit `e3386bdfa` ("remove DEFAULT-50 confidence mask, wire real severity/finding confidence", self-flagged `rebuild_required: true`) carries zero RAW-verify/REALDATA attestation and no companion VERIFY task. Cross-checked: no other backlog row owns enforcing §5 or automating REALDATA-task minting — no double-count risk.
**Output:** `docs/architecture-briefs/2026-07-24-factory-guard-ci-rebuild-raw-verify-hook.md` — zero-tolerance going forward, no baseline file (this is a forward-only attestation check on the push diff, not a source-file sweep — nothing historical to grandfather, unlike size-lint). Trigger scope composed from 2 already-designed siblings rather than a 3rd invented pattern: DDD infra/interface-layer files (the tiers `depguard-tier-boundaries` fences) whose added lines match `metric-mask-lint`'s own field regex (confidence/score/impact/magnitude/probability). On trigger, requires a `RAW-verify`/`REALDATA` token in the commit-range message OR a touched decision-journal/task-report OR an inline `raw-verify-allow:` escape hatch. Wired PRIMARY into the existing `scripts/git-hooks/pre-push` (this repo's real merge gate, since there's no PR/branch-protection to block on) and SECONDARY as a `.github/workflows/ci.yml` backstop job for bypass visibility (red CI on main is a monitored signal here). Explicitly excludes changing `PUSH-AUTONOMY-1` §5 itself or board-state-aware VERIFY-task-minting verification (deferred — temporally outside the triggering commit range). Minted child dev row `FACTORY-GUARD-CI-RAWVERIFY-IMPL` (`developer`, zone cross-service/) — not self-implemented.
**Next:** pm/dev-team — promote+dispatch `FACTORY-GUARD-CI-RAWVERIFY-IMPL` when picked up; dispatcher (this task's owner) flips `FACTORY-GUARD-CI-rebuild-raw-verify-hook` board status. This closes out all 7 `ci-regression-prevention` guardrail designs.

## 2026-07-24T19:57Z — FACTORY-GUARD-CI-shared-package-import-check (zone=cross-service/, P2 BOUNDED-1 pickup, design+decompose)

**Task:** Design a check that any type/constant in `packages/shared-*` has a real importer AND app-side duplicates don't structurally drift — 6th of 7 `ci-regression-prevention` guardrails, same epic/audit as the size-lint/metric-mask/depguard/dead-code/no-hardcode siblings.
**Finding:** Audit's 2 cited drift examples are stale/understated: "shared-db stale module list" already fixed (`FACTORY-SHARED-fix-shared-db-stale-list`, REVIEW, commit `ef62d2921`, 9/9 confirmed live-matching); "shared-types ComputeTAResponse nullability" is really a 3-way divergence between two already-orphaned/dead shapes (shared-types, the dead TS shadow service scheduled for deletion by `FACTORY-GUARD-CI-DEADCODE-IMPL`, and the live Go contract whose own header documents the drift was investigated/intentional) — not a live-serving bug. Confirmed live debt: 3/3 `packages/shared-*` (types/config/db, 76+73+37L) have **zero real importers repo-wide** (no import specifier, no package.json dependency, anywhere) — same phantom-package shape as the already-pruned `packages/primitives`. Found new undocumented name-collisions (Alert/Signal/McpConfig) between the orphaned shared package and independently-invented live app-side types of the same name — e.g. `McpConfig` in shared-config is a 6-block/73L stub vs the live app's actual 18-block/~300L `infrastructure/config.ts`. **Critical scope catch:** a dedicated, larger backlog task — `FACTORY-SHARED-wire-or-prune-shared-packages` (P2, effort L, risk med, rebuild true, BACKLOG) — already owns the "deliberate keep-or-cut decision per package" work; this CI-guardrail task must NOT preempt/duplicate it.
**Output:** `docs/architecture-briefs/2026-07-24-factory-guard-ci-shared-package-import-check.md` — **baseline/ratchet** (not zero-tolerance, unlike dead-code/metric-mask/no-hardcode — different axis than size-lint's "too voluminous": here the fix is a domain decision already owned by a separate task, not a volume problem). `scripts/audits/shared-package-import-check.sh`: check 1 (blocking) — package-level orphan-importer check, baseline-seeded with the 3 current orphans, fails any NEW zero-importer `packages/*` addition (prevents `packages/primitives`-shaped regrowth); check 2 (advisory-only, non-blocking) — same-exported-symbol-name collision scan (Alert/Signal/McpConfig today), full AST structural diffing explicitly deferred (no TS AST tool wired into any bash-only audit script here; regex field-diff would false-positive on reorder/JSDoc churn). Minted child dev row `FACTORY-GUARD-CI-SHAREDPKG-IMPL` (`developer`, zone cross-service/) — not self-implemented; explicitly excludes any packages/shared-*/ content edits, consumer wiring, or deletion (reserved for `FACTORY-SHARED-wire-or-prune-shared-packages`).
**Next:** pm/dev-team — promote+dispatch `FACTORY-GUARD-CI-SHAREDPKG-IMPL` when picked up; dispatcher (this task's owner) flips `FACTORY-GUARD-CI-shared-package-import-check` board status.

## 2026-07-24T19:31Z — FACTORY-GUARD-CI-no-hardcode-allowlist-scan (zone=cross-service/, P2 BOUNDED-1 pickup, design+decompose)

**Task:** Design a CI scan flagging inline ticker/date/exchange-floor allowlists and per-date special-cases (e.g. `signalText.includes('2023') && year===2024`) introduced in diffs — 5th of the 7 `ci-regression-prevention` guardrails, same epic/audit as the depguard/metric-mask/size-lint/dead-code siblings.
**Finding:** A naive reading of "ticker allowlist" over-scopes ~100x — hundreds of bare ticker arrays in `domain/services/{predictionCascadeMapper,policyImpactMapper,creditFlowAnalyzer,climateImpactMapper,supplyChainEventDetector}.ts` + `cascade/rules/*.ts` are already-legitimate, correctly-homed cascade/policy rule-table data (the same shape `FACTORY-DOMAIN-split-cascade-engine` explicitly legitimizes), NOT the bug class. The real bug class is a ticker/date literal compared INSIDE a control-flow branch. Live-counted 5 real sites/5 files: the ticket's own named example exists verbatim at `newsChainFallback.ts:224` (already tracked `JANITOR-035`, unresolved since 2026-07-08); `cascadeExecutor.ts`/`priceSourceRouter.ts` diverging `LARGE_CAP_FALLBACK`/`MAJOR_CAPS` ticker arrays (already tracked `JANITOR-034`); 2 NEW untracked cosmetic per-ticker branches (`backfillBctcScalarsTool.ts` `action_code==="CTG"`, `pharmaEventMapper.ts` `code==="IMP"`, both diagnostic-text-only). Zero CI/lint coverage confirmed (same pattern as all 4 siblings — 3 eslint configs/7 golangci.yml/2 pyproject.toml, fence/import rules only). Explicitly excluded: `HOSE`/`HNX`/`UPCOM` floor comparisons (stable domain enum, dedup theme owned by `FACTORY-STOCK-extract-vndirect-mapper`), `muasamcong.ts` procurement keyword→stock table (legitimate reference data), `priceBackfillService.ts` `ticker==="BAD"` (test-mock-in-domain-layer, different bug class, never called outside `__tests__/`), `ohlcvBackfill.ts` hardcoded backfill dates (magic-number theme, not special-case-branch theme).
**Output:** `docs/architecture-briefs/2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md` — zero-tolerance CI design (5 sites, small, matches metric-mask/dead-code precedent): single `no-hardcode-allowlist-scan.sh` with 2 mechanically-reliable checks (temporal-combo ban, ticker/code-literal-in-control-flow ban with a HOSE/HNX/UPCOM/BLOOMBERG denylist); explicitly deferred generic cross-file ticker-array-overlap detection (would false-positive against the dozens of legitimately-overlapping rule tables). Child task fixes the 2 cosmetic-only findings outright (zero behavior risk) and annotates the 2 known-debt findings (JANITOR-034/035) with a `hardcode-scan-allow:` escape hatch rather than forcing the human design decision their own ledger entries already flag as out-of-scope. Minted child dev row `FACTORY-GUARD-CI-NOHARDCODE-IMPL` (`developer`, zone cross-service/) — not self-implemented.
**Next:** pm/dev-team — promote+dispatch `FACTORY-GUARD-CI-NOHARDCODE-IMPL` when picked up; dispatcher (this task's owner) flips `FACTORY-GUARD-CI-no-hardcode-allowlist-scan` board status.

---

## Archive (pre-2026-07-24T19:57Z)

[Older cycles archived to git history: FACTORY-GUARD-CI-dead-code-gate (2026-07-24T19:02Z,
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
