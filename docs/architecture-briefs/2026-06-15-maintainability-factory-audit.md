<!-- size-justification: generated audit-backlog artifact (94 tasks + 117 findings) — data, not hand-maintained source; regenerate via scripts/factory-audit-brief-gen.jq from the workflow .output. 120L code cap N/A. -->
# Maintainability Factory Audit — 2026-06-15

> Read-only audit of the codebase against **its own** factory/maintainability standards (120-LOC split + size-justification headers, DDD layering / Go Factory-v2 three-tier, no-hardcode real-metric, dedup→`packages/shared-*`, dead-code, complexity, naming, tests). **No code was modified.**
>
> Source: Workflow run `wf_56fbf1b2-b68` (task `wl2ia1tk8`) — 33 agents, 16/16 zones audited → 117 adversarially-verified findings → 94-task zone-routed backlog. Each finding passed a verify pass (real? behavior-preserving? generic across all entities per /goal#2? does not erase a real served metric?).

## Executive Summary

The monorepo is functionally rich but carries severe, systemic reviewability debt: across 16 zones the 120-LOC line-cap is effectively unenforced (only one source file repo-wide carries the mandated size-justification header), producing a long tail of 1,000-4,100-LOC god-files on hot paths (cascadeEngine 3739L, pdf generic_md_table_extractor 4111L, server.ts 2411L, agentSignalStore 1569L, pollNews/assembleBriefing ~1400L each). The highest-severity issues are five live real-metric masks of the confidence_score=50 bug class (server.ts:1393 ?? 50, agentSignalStore:341 destructuring =50, sequential-market-analysis ?? 0.5, finalizeBctcRefine source_confidence ?? 1.0, pek_engine_adapter score 0.7), plus a P0 alert-engine defect where the composition root dead-wires the tested module and runs a divergent duplicate use case. The highest-leverage moves, in order: (1) fix the five metric-masks (small, high-value, but the source_confidence fix must propagate real parser confidence because the column is NOT NULL DEFAULT 1.0); (2) delete the ~10,000 LOC of orphaned dead trees (macro/tech-analysis/kinh-dich TS trees, _deprecated packages, 4 committed .bak files) since these are zero-risk and immediately shrink the review surface; (3) split the unreviewable hot-path god-files along their already-named seams (DDD layers in TS, Factory-v2 tiers in Go); and (4) install CI guardrails (size-lint, depguard, dead-code gate, a metric-mask lint) so the debt cannot return. The Go Factory-v2 cores and several DDD layers are structurally sound — the debt is concentrated in oversize, duplication, dead code, and a handful of metric defaults, almost all behavior-preserving to fix.

## Health by Zone

| Zone | Grade | Headline |
|---|---|---|
| `mcp-server-domain` | **D** | Pure layering but dominated by god-files: 101/155 over cap, cascadeEngine 3739L embeds ~2000L of inline rule tables. |
| `mcp-server-application` | **D** | Four 850-1426L cron-hot god-orchestrators and verbatim-duplicated date/freshness helpers; layering otherwise clean. |
| `mcp-server-infra` | **D** | agentSignalStore 1569L with a confidence=50 mask and a 7-deep INSERT cascade on the hottest write path; 106 over-cap files. |
| `mcp-server-interface` | **F** | 2411L server.ts god-file with 92 inline routes, a live confidence_score ?? 50 mask, and 2 committed .bak files. |
| `mcp-server-scheduler` | **D** | Five 800-1364L cron god-files, a 1191L composition root of 76 copy-paste wrapRun blocks, and hardcoded alert-confidence literals. |
| `pdf-extractor` | **D** | 4111L generic_md_table_extractor god-file, a 0.7 OCR-score mask, an undetected application->infra DDD leak, and shipping deprecated /inspect code. |
| `frontend` | **C** | Healthy at carved seams, but route layer buries domain scoring (computeDecision) in a 1845L god-route; cap unenforced (41 files). |
| `macro-indicators` | **B** | Clean well-fenced Go core; debt isolated to an 831L sandbox, a 778L repositories.go, and a fully dead TS src/ tree. |
| `technical-analysis` | **C** | Clean deployed Go core but an entire orphaned TS service shadows it, the live Go path has zero tests, and two contracts clash on one route. |
| `kinh-dich-service` | **B** | Clean depguard-fenced tiers; debt is a 1167L hexagram-prose file, a 4909L dead TS tree, and unnamed confidence-pipeline constants. |
| `api-gateway` | **B** | Clean three-tier skeleton but the GatewayModule is orphaned from prod, a 421L god-handler carries routing, and a 5x timeout literal is duplicated. |
| `stock-price` | **B** | Conformant prod tiers; debt in a 743L sandbox, a copy-pasted untested VnDirect mapper with a *1000 magic scale, and dead write-back code. |
| `alert-engine` | **C** | Two divergent alert engines with the tested module dead-wired and the duplicate live — a P0 correctness-adjacent defect. |
| `rag-service` | **B** | One of the healthiest zones; debt is two oversized files, an or-0.0 metric mask, ~110L dead SQLite repo, and copy-pasted metadata blocks. |
| `news-fetch` | **C** | Well-layered but two 95%-identical RSS scrapers, a still-duplicated normalizeDate, a 486L sandbox, and a per-source logging bug. |
| `packages-shared` | **F** | All four shared packages have zero importers and have already diverged from the app definitions they were meant to canonicalize. |

## Cross-Cutting Themes (8)

### Eradicate hardcoded/defaulted real-metric values (confidence_score=50 bug class)

**Zones:** mcp-server-interface, mcp-server-infra, mcp-server-scheduler, pdf-extractor, rag-service, kinh-dich-service, stock-price, api-gateway

Five live ?? <literal> / destructuring-default sites silently fabricate confidence/impact metrics indistinguishable from real values on user-facing and downstream-consumed paths. This is the standing-directive's named bug class and the single highest-correctness theme. Fixes are small but two require care: source_confidence is NOT NULL DEFAULT 1.0 (must propagate parser confidence, not null) and several alert jobs have a real strength metric in scope being ignored.

### Delete orphaned dead trees, _deprecated packages, and .bak duplicates

**Zones:** macro-indicators, technical-analysis, kinh-dich-service, mcp-server-infra, mcp-server-interface, rag-service, stock-price, alert-engine, packages-shared

~10,000 LOC of zero-risk dead code dilutes every grep and lets a reviewer edit the wrong tree: three orphaned TS trees on Go services (macro, technical-analysis, kinh-dich), _deprecated rag/kinhDich/domain packages, dead SQLite/write-back code, a phantom bun package, and four committed .bak files. Pure subtraction, behavior-preserving, and the fastest way to shrink the review surface — must lead the program.

### Split unreviewable hot-path god-files along existing DDD/Factory seams

**Zones:** mcp-server-domain, mcp-server-application, mcp-server-infra, mcp-server-interface, mcp-server-scheduler, pdf-extractor, frontend

A dozen files of 700-4111 LOC on cron/HTTP/write hot paths cannot be reviewed in one sitting; each already has named seams (DDD layers, numbered cron steps, per-tier comment banners) making extraction behavior-preserving. This is the bulk of the maintainability debt and the dominant XL effort — staged one-seam-per-PR.

### Restore DDD/Factory-v2 layer boundaries (push logic down, wire orphaned tiers)

**Zones:** frontend, mcp-server-interface, mcp-server-application, pdf-extractor, api-gateway, alert-engine

Business logic leaks UP into interface/scheduler layers (computeDecision in a route, Kinh Dich/TA scoring in MCP tools, BCTC finalize in interface/tools, telegram notifier importing usecases) and composition tiers sit orphaned while logic lives in handlers (api-gateway GatewayModule, alert-engine pipeline, pdf application->infra leak). Re-homing logic and wiring the tested tiers makes boundaries trustworthy and depguard-enforceable.

### Deduplicate copy-paste logic into shared primitives/helpers

**Zones:** mcp-server-domain, mcp-server-application, mcp-server-infra, mcp-server-interface, news-fetch, frontend, stock-price, alert-engine, macro-indicators, technical-analysis

The same logic is forked across files and will drift: BCTC parsing primitives x4, VN-date/freshness helpers x3-4, 12 vnstock Python templates, two 95%-identical RSS scrapers, normalizeDate x3, frontend formatters x3, VnDirect mapper x2, alert severity/channel constants x3, VPS-auth guard x15. Extracting one canonical copy per concern removes the N-place maintenance trap.

### Consolidate the two parallel alert engines onto the tested module

**Zones:** alert-engine

alert-engine's composition root dead-wires the tested Pipeline (_ = alertpipeline.New(...)) and routes production through a divergent EvaluateAlertUseCase with different severity-validation, dedup-window (60 vs 30), and check ordering. This is the only P0 that is correctness-adjacent rather than pure reviewability, and demands golden-output diffing because consolidation changes live alert behavior.

### Make packages/shared-* real or prune them; collapse divergent app DTOs

**Zones:** packages-shared, technical-analysis, frontend, news-fetch

All four shared packages have zero importers and have already diverged (shared-types ComputeTAResponse nullability, shared-db stale module list) — a parallel reality that rots. Either wire one concrete consumer per package and delete the local duplicate in the same PR, or prune (primitives is a phantom). Inter-service DTOs duplicated in routes (orchestration, market-summaries, analysis) belong in the shared package too.

### Promote magic numbers to named, documented constants

**Zones:** mcp-server-domain, mcp-server-application, kinh-dich-service, api-gateway, stock-price, alert-engine, mcp-server-scheduler

Load-bearing domain thresholds are bare literals a reviewer cannot validate: VAS row-code ranges, BCTC confidence ladder (0.55/0.8/0.45/0.65), price-score 0.05 divisor, confidence ceiling 0.8, proxy-timeout 5x, *1000 VND scale, prediction-signal thresholds, dedup windows. Naming + a one-line provenance comment makes them reviewable and adjustable in one place without changing behavior. Distinct from the metric-mask theme: these are intentional thresholds, not masks of a computed value.

## CI Guardrails — stop the debt returning (7)

- CI-size-lint-justification: a CI lint that fails any source file (*.ts/*.py/*.go) over 120 LOC lacking an honest leading size-justification marker (`<!-- size-justification: NNL — reason -->` for TS/MD, `# size-justification:` for Python, `// size-justification:` for Go). Repo currently has exactly one source file carrying it, so the cap is unenforced — this gate stops the 600+ over-cap-without-header backlog from regrowing.
- CI-metric-mask-lint: an ESLint rule (TS) + ruff/custom AST check (Python) + go vet/staticcheck analyzer (Go) banning `?? <numeric-literal>`, `|| <numeric-literal>`, `or <literal>` (Python truthiness), and destructuring numeric defaults (`{ x = 50 }`) on fields named confidence*/score*/impact*/magnitude*/probability* — the confidence_score=50 bug class. Allowlist genuine config/option defaults via an inline annotation so legitimate sites pass explicitly.
- CI-depguard-tier-boundaries: extend depguard/import-linter to enforce ALL layer fences, not just the ones currently covered. TS: boundaries plugin must forbid application->interface and domain->infrastructure (the pollNews + telegramCommands leaks). Python (pdf-extractor): add the missing `source=application forbidden=infrastructure,interface` import-linter contract (the DocLangSerializer leak passed because only domain was fenced). Go: keep Fence-A/B/C depguard and add a check that composition-root tiers (cmd/server) contain no logic that belongs in pkg/module.
- CI-dead-code-gate: a gate that fails on (a) any tracked `*.bak`/`*.backup`/`*.patch` file (4 currently committed), (b) `_deprecated/` or orphaned `src/` trees that no live code imports (knip/ts-prune for TS unused exports; `go vet`/deadcode for Go; vulture for Python), and (c) build-ignored archives left in-tree. Add `*.bak` to .gitignore.
- CI-no-hardcode-allowlist-scan: a scan flagging inline ticker/date/exchange-floor allowlists and per-date special-cases (e.g. `signalText.includes('2023') && year===2024`) introduced in diffs, so reference data lives in shared-config and special-cases are not smuggled into logic. Pairs with the metric-mask lint to satisfy goal#2 (generic).
- CI-shared-package-import-check: a check that any type/constant declared in packages/shared-* has at least one real importer (fails on orphaned 'single source of truth' packages) AND that app-side duplicates of a shared contract do not drift (compare structural shape) — prevents the shared-types/shared-db re-divergence.
- CI-rebuild-raw-verify-hook: for any PR touching a hardcode-metric or metric-serving path, require a documented RAW verification of the served value against the named-volume DB (NOT the host ./data decoy) after a rebuild, attached to the PR — institutionalizes the no-fake-data DoD so metric fixes are proven, not asserted.

## Refactor Backlog (94 tasks)

Priority counts: P0×11 · P1×38 · P2×36 · P3×9

### P0 — 11 task(s)

- **`FACTORY-ALERT-consolidate-dual-engines`** — Consolidate alert evaluation onto the tested module; thin the use case to an adapter
  - zone `alert-engine` · agent **dev-alert-engine** · effort L · risk med · rebuild true
  - files: apps/alert-engine/cmd/server/main.go, apps/alert-engine/pkg/application/evaluate.go, apps/alert-engine/pkg/module/alert_pipeline/pipeline.go
  - approach: main.go:60 dead-wires the tested pipeline (`_ = alertpipeline.New(...)`) while the HTTP path runs the divergent EvaluateAlertUseCase (no severity validation; dedup window hardcoded 60 vs module 30; different check order; different message/reason strings). Make the module the SSOT: construct the use case WITH the pipeline injected; rewrite Execute to build AlertRequest, call pipeline.Run, and map Result into EvaluateAlertResponse; delete the duplicated dedup/cooldown/mute/store/telegram blocks. This CHANGES live behavior (message format, reason strings, severity rejection), so golden-diff outputs and update the existing application tests' expectations; add an invalid-severity->not-fired case.
  - DoD: Use case delegates to the pipeline; the dead-wire removed; golden before/after diff of fired/suppressed outputs reviewed and accepted; application tests (FiresAndStoresAlert, DoesNotFireWhenMuted, DoesNotFireWhenDuplicate) updated and green; invalid-severity case covered; generic; RAW-verify the served alert path after rebuild fires/suppresses per the module semantics.
  - depends_on: FACTORY-ALERT-delete-deprecated-domain
- **`FACTORY-APP-split-pollNews`** — Split pollNews 1426L god-file into single-responsibility modules (staged)
  - zone `mcp-server-application` · agent **dev-mcp-server** · effort XL · risk high · rebuild true
  - files: apps/mcp-server/src/application/usecases/pollNews.ts
  - approach: pollNews() (643-1426) inlines fetcher resolution+CI guards, allSettled health tracking, all-sources-dark cooldown, normalize->insert->embed->deepfetch loop, cascade->signal->dedup->mention_velocity, plus 4 insider keyword allowlists (197-293). Extract into usecases/pollNews/: insiderSignalDetector (to domain), sourceFetchers, sourceHealth, ingestEntries, buildSignals; leave pollNews.ts a ~120L orchestrator. Re-export _resetAllDarkAlert (already exported). NOTE: deduplicateSignalsByStockAndType is NOT currently exported (line 310) — export it if a test seam needs it, do not assume it exists. One extraction per commit.
  - DoD: Each module <=120L; pollNews.ts a thin orchestrator; test seams preserved; one-extraction-per-PR; tests green; generic; RAW-verify against the named-volume DB after rebuild that a poll cycle produces identical signals/inserts; depends on the layering fix to avoid re-touching the same import.
  - depends_on: FACTORY-APP-pollNews-layering-fix
- **`FACTORY-APP-split-assembleBriefing`** — Extract assembleBriefing's 19 numbered steps into briefing/ query modules
  - zone `mcp-server-application` · agent **dev-mcp-server** · effort XL · risk high · rebuild true
  - files: apps/mcp-server/src/application/usecases/assembleBriefing.ts
  - approach: _assembleBriefingImpl (748-1366) runs 19 best-effort numbered steps with inline SQL on the 08:00 cron path. Extract each into a pure query module under usecases/briefing/ (queryTopStories, queryWatchlistSummary, queryUpcomingDeadlines, queryGlobalSnapshot, ...); the existing local helpers (queryInsiderRecent:442, queryForeignFlowSummary:474, queryEvidenceTopScores:538, defaultComputeTa:657) move out cleanly. Move RagRow..FiledAtRow interfaces alongside their queries. Leave _assembleBriefingImpl a thin <=120L sequencer keeping the per-step try/catch. Preserve DailyBriefing type and queryForeignFlowSummary_TEST export.
  - DoD: Each step module <=120L; sequencer thin; public exports (DailyBriefing, queryForeignFlowSummary_TEST) intact; one-step-per-PR; tests green; generic; RAW-verify the assembled briefing payload after rebuild is identical.
  - depends_on: FACTORY-APP-dedup-date-freshness-helpers
- **`FACTORY-DOMAIN-split-cascade-engine`** — Extract cascadeEngine rule tables + orchestration helpers (Steps 1-3 only)
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/domain/services/cascadeEngine.ts
  - approach: cascadeEngine.ts (3739L) on the news->stock cascade hot path. Step 1: move the 8 exported rule-data constants (SECTOR_RULES ~2016L, LEGAL_RISK/POLICY/INSIDER_DUMP/MSCI x3/AGRICULTURE/IMF rules) + their interfaces into domain/services/cascade/rules/*.ts (one per table; data tables may exceed cap WITH a size-justification header). Step 2: barrel re-export via cascade/rules/index.ts; cascadeEngine imports them. Step 3: split orchestration into cascade/macroAdjustments.ts and cascade/comboDetectors.ts, keeping buildCausalChain + types in cascadeEngine.ts. DROP the finding's Step 4 (SECTOR_RULES.map(r=>r.key) is invalid — SectorRule has no .key field and would change the dead-rules report). Each extraction is a pure move of already-exported symbols.
  - DoD: Rule tables + helpers extracted; cascadeEngine imports via barrel; Step 4 explicitly NOT done; cascade tests green; data-table files carry honest size-justification, logic files <=120L or justified; tests green; generic; behavior of the cascade path unchanged verified.
  - depends_on: —
- **`FACTORY-INFRA-agentsignal-confidence-50-default`** — Remove confidence_score=50 destructuring default in agentSignalStore.postSignal
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort S · risk med · rebuild true
  - files: apps/mcp-server/src/infrastructure/db/agentSignalStore.ts
  - approach: At agentSignalStore.ts:341 the `confidence_score = 50` destructuring default fabricates a metric on the central inter-agent write bus. Remove the literal default; persist the caller's actual confidence and store NULL (column nullable) when truly absent, so un-scored signals are distinguishable. Verify no caller relies on the implicit 50 by auditing postSignal call sites; where a caller legitimately has no score, pass null explicitly. Behavior-preserving for callers that already pass a score.
  - DoD: Behavior unchanged for scored signals verified; call-site audit shows no caller depended on the 50 default; unit test asserts absent confidence persists as NULL not 50; tests green; generic; RAW-verify against the named-volume DB after rebuild that agent_signals.confidence_score is NULL for a genuinely un-scored insert and equals the real value otherwise.
  - depends_on: —
- **`FACTORY-INFRA-split-agentSignalStore`** — Collapse the 7-deep INSERT cascade + split agentSignalStore by query seam
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/infrastructure/db/agentSignalStore.ts
  - approach: agentSignalStore.ts (1569L) on the hottest write path: _postSignalInner (326-792) nests 6 column-existence flags 7 deep emitting ~10-12 near-identical INSERTs, re-running 6 column probes every call. Step 1: cache the 6 probes in one memoized detectSignalColumns(db) helper (agentSignals/columnDetect.ts). Step 2: replace the 12 hand-written INSERTs with a single dynamic buildSignalInsert(flags,row) pushing columns/placeholders/binds into parallel arrays. Step 3: split into agentSignals/{postSignal,getSignals,chainQueries,effectiveness,criticGate}.ts + barrel re-exporting existing public names. CRITICAL: add a round-trip unit test under EACH column-flag combination BEFORE refactoring, since buildSignalInsert must reproduce the exact column/bind order of every branch.
  - DoD: Per-flag-combination round-trip tests written and green BEFORE refactor; single dynamic INSERT builder; probes memoized; each module <=120L; barrel preserves public names; tests green; generic; RAW-verify against the named-volume DB after rebuild that signals written under each column combination are byte-identical to pre-refactor.
  - depends_on: FACTORY-INFRA-agentsignal-confidence-50-default, FACTORY-INFRA-agentSignal-sql-binding
- **`FACTORY-INTERFACE-confidence-score-50-mask`** — Replace confidence_score ?? 50 mask in /api/signals/stock handler with honest null
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/mcp-server/src/interface/mcp/server.ts
  - approach: At server.ts:1393 replace `confidence_score: row.confidence_score ?? 50` with `confidence_score: row.confidence_score ?? null` so a NULL stored value surfaces as 'n/a' on the dashboard instead of a fabricated mid-confidence 50. If a numeric is contractually required, compute it from the already-wired getAccuracyStats path (imported L75, called L1405). Behavior-preserving for real (non-null) values; only the absent-value case changes from fabricated 50 to honest null.
  - DoD: Behavior unchanged for non-null rows verified; unit test asserts a NULL-confidence row serializes to null not 50; tests green; no file left >120L without honest justification (server.ts split tracked separately); generic (no per-ticker/date logic); RAW-verify against the named-volume DB after rebuild that a real un-scored signal serializes confidence_score=null and a real 50 stays 50.
  - depends_on: —
- **`FACTORY-INTERFACE-split-server-ts`** — Extract inline server.ts routes into routes/<name>Handler.ts (staged)
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort XL · risk med · rebuild true
  - files: apps/mcp-server/src/interface/mcp/server.ts
  - approach: server.ts is a 2411L god-file dispatching 92 inline `if (method===... && pathname===...)` branches, ~30 still inlined as 100-200L blocks (push-bctc-pdf 973, trigger-pek-extract 598, push-reuters 1473, push-gso 1617, signals/stock 1320, five trigger-*-debug 1692-1996). Following the existing routes/<name>Handler.ts convention (positional `handle<Name>(req,res,db,log)`), move each inline block verbatim into a new handler file, replace with a one-line call, keep the if-condition. One route per commit, largest first. Target: server.ts becomes a <250L route table. Behavior-preserving code-move; combine with the shared auth guard task.
  - DoD: Each moved route is behavior-identical (RAW-verify the signals/stock branch still serves real confidence after rebuild); server.ts under ~250L; no handler file >120L without justification; tests green; generic; one-route-per-PR reviewable in one sitting.
  - depends_on: FACTORY-INTERFACE-confidence-score-50-mask, FACTORY-INTERFACE-vps-auth-guard-dedup, FACTORY-INTERFACE-delete-bak-files
- **`FACTORY-SCHEDULER-split-dataAuditJob`** — Extract dataAuditJob D-n/W-n checks into per-check modules
  - zone `mcp-server-scheduler` · agent **dev-mcp-server** · effort XL · risk med · rebuild true
  - files: apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts
  - approach: dataAuditJob.ts (1300L): runDailyChecks (303-801) holds D-1..D-11, runWeeklyChecks (801-1099) holds W-1..W-7, with 30+ inline findings.push sites. Create news-analysis/audit-checks/ with one file per check group returning AuditFinding[] (checkZeroPriceRows, checkStaleAlerts, checkBctcStranded, checkIndicatorRanges, ...); keep AuditFinding type + shared helpers (checkToCategory:93, severityToPriority:112, getPreviousRowCounts:127, insertFeedbackIfNew:187, buildTelegramMessage:228, INDICATOR_RANGES:70) in dataAuditShared.ts. Orchestrators become `[...checkA(db), ...checkB(db)]`. Preserve in-loop insertFeedbackIfNew side-effect ordering. SQL verbatim, one check per commit.
  - DoD: Each check <=120L and individually testable; SQL + finding semantics + side-effect ordering unchanged; orchestrators thin; tests green; generic; RAW-verify the audit findings output after rebuild is identical.
  - depends_on: —
- **`FACTORY-SCHEDULER-split-intelligenceCycleJob`** — Split intelligenceCycleJob (15-min hot path) into types/marketHours/defaults
  - zone `mcp-server-scheduler` · agent **dev-mcp-server** · effort XL · risk med · rebuild true
  - files: apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts
  - approach: intelligenceCycleJob.ts (1364L), fired every 15 min, mixes CycleResult/CycleDeps contracts, 8+ defaultXxx prod impls, market-hours logic, and the 7-step orchestrator. Split into intelligenceCycle/types.ts, intelligenceCycle/marketHours.ts (isMarketHours:209; note VN_OFFSET_MS is imported from timeConstants, not local), intelligenceCycle/defaults/*.ts (one per defaultXxx), and intelligenceCycleJob.ts keeping runIntelligenceCycle:1136 + concurrency guard. CRITICAL: defaultComputeHexagrams reads/writes module-level _lastHexagramComputedAt and resetHexagramCooldown mutates the same map — keep those two + the map together or the cooldown closure breaks. Preserve the DI seam (deps.*Fn) exactly. Keep ALERT_WINDOW_MS/CYCLE_WARN_THRESHOLD_MS named.
  - DoD: Files split; DI seam preserved; hexagram cooldown closure + map kept together; each file <=120L or justified; cycle tests green; tests green; generic; RAW-verify a cycle run after rebuild produces identical results.
  - depends_on: —
- **`FACTORY-PDF-split-generic-md-table`** — Split the 4111L generic_md_table_extractor god-file behind a thin shim (staged)
  - zone `pdf-extractor` · agent **dev-pdf-extractor** · effort XL · risk med · rebuild true
  - files: apps/pdf-extractor/infrastructure/generic_md_table_extractor.py
  - approach: 4111L, 50+ defs, 390L _process_page, on the layout-first hot path. Extract-by-seam into a package infrastructure/generic_md_table/ keeping public symbols re-exported from a thin generic_md_table_extractor.py shim (callers inject build_document_map/zone_page/ocr_unit at module level — a shim preserves them with no import cycle): markdown_emit.py, ordinal_grid.py, grid_cleanup.py, document_map.py, page_zoning.py, unit_ocr.py, extractor.py (class + _process_page further split into named stage helpers), and a shared constants.py for the regex/constant block. One sub-module per PR, run __tests__ between each.
  - DoD: Sub-modules extracted; thin shim re-exports all public symbols; callers unchanged; each file <=120L or justified; __tests__ green between every PR; tests green; generic; extraction behavior on the hot path unchanged verified.
  - depends_on: —
### P1 — 38 task(s)

- **`FACTORY-ALERT-dedup-window-config`** — Replace hardcoded 60-min dedup window with a config-sourced DedupWindowMinutes
  - zone `alert-engine` · agent **dev-alert-engine** · effort S · risk low · rebuild true
  - files: apps/alert-engine/pkg/application/evaluate.go, apps/alert-engine/pkg/domain/models.go
  - approach: evaluate.go:73 `HasDuplicateFingerprint(fingerprint, 60)` and the L81 '60min' reason string are untethered from config (DefaultCooldownConfig.CooldownMinutes=30; the module passes that same value). Add `DedupWindowMinutes int` to domain.CooldownConfig, default it against the TS DEFAULT_COOLDOWN_CONFIG (confirm the real value, do not invent), replace the literal with cfg.DedupWindowMinutes, and build the reason string via fmt.Sprintf. If the engine-consolidation task lands first, this collapses into it (ensure the module uses a named DedupWindowMinutes, not CooldownMinutes reuse). Note: changes the live dedup window, so confirm the intended default.
  - DoD: Dedup window sourced from named config; reason string derived from it; intended default confirmed against the TS source; test pins the window; tests green; generic; RAW-verify the served suppression decision after rebuild uses the configured window.
  - depends_on: FACTORY-ALERT-consolidate-dual-engines
- **`FACTORY-APIGW-split-handlers`** — Split api-gateway handlers.go into dashboard/middleware/proxy files
  - zone `api-gateway` · agent **dev-api-gateway** · effort M · risk low · rebuild true
  - files: apps/api-gateway/pkg/interface/http/handlers.go
  - approach: handlers.go (421L) on the hottest path bundles JSON/logging helpers (23-56), a ~130L embedded HTML+CSS dashboard (58-219), not-deployed reroute proxy wiring (305-378), and the normal proxy (380-421). Split (same package http): dashboard.go (BuildDashboardHTML + mappers + HTML/CSS), middleware.go (writeJSON/statusRecorder/loggingMiddleware), proxy.go (HandleProxy + a private newReverseProxy(target,errorWriter) collapsing the two near-identical setup blocks 343-377 vs 393-420), handlers.go keeps the struct + HandleHealth/HandleServiceHealth/HandleDashboard. handlers_test.go already covers all four.
  - DoD: Files split; newReverseProxy collapses the duplicate blocks; each file <=120L; handlers_test.go green; tests green; generic; proxy + dashboard behavior unchanged verified.
  - depends_on: —
- **`FACTORY-APIGW-proxy-timeout-constant`** — Promote the 5x proxy-timeout multiplier to a named config accessor
  - zone `api-gateway` · agent **dev-api-gateway** · effort S · risk low · rebuild true
  - files: apps/api-gateway/pkg/interface/http/handlers.go, apps/api-gateway/pkg/infrastructure/registry.go
  - approach: `if timeoutMs==0 { timeoutMs = svc.TimeoutMs*5 }` is duplicated at handlers.go:364-367 and 408-411 — a hidden 5x rule deciding the real proxy deadline (only macro/news set ProxyTimeoutMs explicitly). Add `const defaultProxyTimeoutMultiplier = 5` (comment: proxy ops get 5x the health-probe budget) in registry.go and a ServiceConfig.EffectiveProxyTimeoutMs() accessor returning ProxyTimeoutMs when non-zero else TimeoutMs*multiplier. Replace both handler sites with the accessor. Add a unit test pinning the resolved value. Identical resolved timeout, surfaced at the config tier.
  - DoD: Multiplier named; accessor at config tier; both sites call it; resolved timeout identical; unit test pins it; tests green; generic; proxy timing behavior unchanged verified.
  - depends_on: —
- **`FACTORY-FRONTEND-extract-computeDecision`** — Move computeDecision scoring out of the analysis route into domain
  - zone `frontend` · agent **dev-frontend** · effort M · risk low · rebuild true
  - files: apps/frontend/app/routes/dashboard.analysis.tsx, apps/frontend/app/__tests__/1937-decision-logic.test.ts
  - approach: computeDecision (L998-1076) + DecisionResult are pure TA/RSI/KD/price scoring (MUA MANH/MUA/GIU/BAN) exported from an interface-layer route; the test imports it from ~/routes/dashboard.analysis. Move into app/domain/analysis/decision.ts with named exports; hoist the inline thresholds to named consts (STRONG_BUY_SCORE=4, BUY_SCORE=2, RSI_OVERSOLD=30, RSI_OVERBOUGHT=70, etc.). Re-point the test import to ~/domain/analysis/decision; route imports from the new module. Pure move + re-export, no behavior change (domain has no upstream deps so no cycle).
  - DoD: computeDecision in domain with named thresholds; test re-pointed; route imports from domain; the MUA/BAN decision metric unchanged; tests green; generic; RAW-verify the served decision is identical for sample inputs.
  - depends_on: —
- **`FACTORY-FRONTEND-split-dashboard-analysis`** — Split the 1845L dashboard.analysis route (helpers + ~30 components)
  - zone `frontend` · agent **dev-frontend** · effort XL · risk med · rebuild true
  - files: apps/frontend/app/routes/dashboard.analysis.tsx
  - approach: After computeDecision is extracted: (2) move signalColor/confidencePct/confidenceLabel/indicatorLabel into app/domain/formatters/* (confidenceBar returns JSX -> app/components/analysis/ConfidenceBar.tsx); (3) extract ~30 presentational components (AnalysisDecision, InfoSourcePanel, watchlist grid, detail panel, KD/macro panels) into app/components/analysis/*.tsx, one cluster per <=120L file; (4) leave loader + default export + AnalysisBriefDto types in the route, which drops well under cap. One extraction per commit, run analysis tests between each.
  - DoD: Route under cap; helpers in formatters, components in components/; each new file <=120L; analysis tests green between commits; tests green; generic; dashboard render unchanged verified.
  - depends_on: FACTORY-FRONTEND-extract-computeDecision
- **`FACTORY-KINHDICH-delete-deprecated-ts-tree`** — Delete the 4909L _deprecated TypeScript predecessor tree
  - zone `kinh-dich-service` · agent **dev-kinh-dich** · effort S · risk low · rebuild false
  - files: apps/kinh-dich-service/src/_deprecated/
  - approach: 34 git-tracked files (~4302 LOC excl lockfiles) of the pre-reboot TS/Bun impl, fully superseded by the Go pkg/ tree. The Dockerfile builds only go build ./cmd/server; grep for '_deprecated' across *.go/Dockerfile/*.mod/*.yaml returns nothing. Delete the entire directory in one commit; history retains it.
  - DoD: grep confirms zero live references; go build ./... and Dockerfile build unaffected; tests green; generic; deployed Go binary behavior unchanged.
  - depends_on: —
- **`FACTORY-KINHDICH-extract-hexagram-data`** — Extract 64-hexagram prose to an embedded data asset behind a small loader
  - zone `kinh-dich-service` · agent **dev-kinh-dich** · effort L · risk low · rebuild true
  - files: apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go
  - approach: hexagram_reference.go (1167L) inlines 64 build() literals of EN/VI prose backing the live /hexagram/{number}/explain route. Move the per-hexagram localized prose into a go:embed JSON asset loaded by a <=60L loader; keep the struct types + getQueMeta/getQueData/buildPhases/mapTrendToEnum helpers (which pull from queMetaList/queDataMap — the JSON must hold ONLY the localized glosses, not duplicate those). init() unmarshals once and builds queReferenceList/queReferenceMap as today. Migrate the 64 literals losslessly. Pin the contract with the invariant test (separate task) FIRST. Fallback: split into 4 files with size-justification headers.
  - DoD: Prose in embedded asset; loader + helpers retained; all 64 entries migrated losslessly; logic file <=120L or justified; invariant test green; tests green; generic; RAW-verify /explain serves identical localized prose after rebuild.
  - depends_on: FACTORY-KINHDICH-add-data-invariant-test
- **`FACTORY-KINHDICH-name-confidence-constants`** — Name the confidence-pipeline magic constants in reading_composer
  - zone `kinh-dich-service` · agent **dev-kinh-dich** · effort S · risk low · rebuild true
  - files: apps/kinh-dich-service/pkg/module/reading_composer/reading_composer.go
  - approach: ComposeReading shapes the served Confidence from bare literals: L174 /0.8 ceiling, L182-183 0.7/0.3 markov blend, L144 default activeIndices=[]int{5}, L190 *1000 rounding, L227 truncate 80. Extract a named const block (confidenceScoreCeiling=0.8, markovBaseWeight=0.7, markovBlendWeight=0.3, confidenceRoundDecimals=1000, hoQueGlossTruncateRunes=80, defaultActiveLinePosition=5) each with a provenance comment; substitute. Keep []int{5} as a named const (no real value erased). Add an assertion that markovBaseWeight+markovBlendWeight==1.0.
  - DoD: All confidence-pipeline literals named + documented; resolved Confidence values byte-identical; blend-normalization assertion added; tests green; generic; RAW-verify /reading and /market Confidence unchanged after rebuild.
  - depends_on: —
- **`FACTORY-KINHDICH-name-price-score-constants`** — Name price_score normalization divisor 0.05 and 7-point threshold
  - zone `kinh-dich-service` · agent **dev-kinh-dich** · effort S · risk low · rebuild true
  - files: apps/kinh-dich-service/pkg/infrastructure/price_score.go, apps/kinh-dich-service/pkg/application/usecases.go
  - approach: price_score.go normalizes `ret/0.05` (L62, scales every one of the 6 input scores feeding hao_encoder->hexagram->confidence) and gates `len(prices)<7` (L38); the '7 price points' string is duplicated in application.ErrInsufficientData (usecases.go:16). Introduce dailyReturnNormalizationBand=0.05 (comment citing the VN price-limit basis) and minPricePointsForScoring=7; reference the shared const from ErrInsufficientData so the message cannot drift. No behavior change at default values. The optional per-board field is forward-looking and out of scope here.
  - DoD: Constants named + documented; error message references the shared const; resolved scores unchanged; tests green; generic; RAW-verify the input scores feeding the reading are identical after rebuild.
  - depends_on: —
- **`FACTORY-MACRO-delete-dead-ts-tree`** — Delete orphaned TypeScript src/ tree and broken bun toolchain (pure-Go service)
  - zone `macro-indicators` · agent **dev-macro-indicators** · effort S · risk low · rebuild false
  - files: apps/macro-indicators/src/_deprecated/, apps/macro-indicators/src/infrastructure/scrapers/, apps/macro-indicators/package.json, apps/macro-indicators/tsconfig.json, apps/macro-indicators/bun.lock
  - approach: The Dockerfile builds only Go (COPY cmd/ pkg/ api/; go build ./cmd/server); src/index.ts does not exist (broken start script); scrapers are imported only by the dead _deprecated/index.ts. Delete src/_deprecated/ and src/infrastructure/scrapers/ wholesale, plus package.json/tsconfig.json/bun.lock/node_modules since the service is pure-Go. Verify no live importer outside the app first (already confirmed zero). History + macro-pre-delete tag preserve it.
  - DoD: `grep -r` confirms no live importer of the deleted paths; go build ./... and the docker-compose Go image build unaffected; tests green; generic; behavior of the running Go image unchanged (RAW metric path untouched).
  - depends_on: —
- **`FACTORY-MACRO-split-sandbox`** — Split macro sandbox 831L god-file + collapse 6 copy-paste comparators
  - zone `macro-indicators` · agent **dev-macro-indicators** · effort M · risk low · rebuild true
  - files: apps/macro-indicators/cmd/sandbox/main.go
  - approach: 831L, no header, 6 structurally-identical executeMacroXxx comparators. Split (keep package main, multiple files): main.go (flags+main loop), discovery.go (Scenario/findRepoRoot/discoverScenarios), primitives.go (6 executors + structs + dispatcher), module.go (macroSignals* + module executors + concreteClock). Collapse the 6 comparators into one table-driven compareFields(name, []fieldDiff) helper so each executor only builds its fieldDiff slice (~-400L). Same JSON shapes, PASS/FAIL semantics, exit codes; ComputedAt compared as-is (deterministic fixtures). No _test.go exists in cmd/sandbox so add light coverage of the dispatch.
  - DoD: Files split; comparators collapsed to one helper; PASS/FAIL exit codes identical; each file <=120L or justified; sandbox runs scenarios identically; tests green; generic; test-harness verdicts unchanged.
  - depends_on: —
- **`FACTORY-MACRO-split-repositories`** — Split repositories.go into per-adapter files; share openReadOnly
  - zone `macro-indicators` · agent **dev-macro-indicators** · effort M · risk low · rebuild true
  - files: apps/macro-indicators/pkg/infrastructure/repositories.go
  - approach: 778L bundling 6 adapters. Split (same package, no API change) into repositories_fixture.go, repositories_market_index.go, repositories_commodity.go (commodityStaleBound), repositories_sbv_rate.go (sbvStaleBound), repositories_carry_yield.go (effr/depositYield bounds) — each type+const+helper travels together. Tests already inject *sql.DB into the fetchXxxFromDB helpers so they stay green. Factor the repeated 'open ro -> defer Close -> fetch' shape into the existing openReadOnly helper reused across adapters.
  - DoD: Per-adapter files; openReadOnly shared; all staleness logic + served values preserved; each file <=120L or justified; repositories_test.go green; tests green; generic; RAW-verify VN-Index/commodity/FX/carry-yield values unchanged after rebuild.
  - depends_on: —
- **`FACTORY-APP-split-assembleEveningSummary`** — Refactor assembleEveningSummary to reuse the shared briefing step modules
  - zone `mcp-server-application` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/application/usecases/assembleEveningSummary.ts
  - approach: _assembleEveningSummaryImpl (389-858) repeats assembleBriefing's Step-0..8 best-effort shape and re-defines the same 4 date helpers + parallel row interfaces. After the assembleBriefing extraction, reuse the shared step modules (queryTopStories, queryGlobalSnapshot, freshness gate, prediction-signal query); move evening-specific steps (watchlist movers, foreign-flow movers, TA-RSI) into usecases/evening/ modules <=120L; replace local date/freshness/parseAffectedCodes copies with the shared imports. Sequence AFTER assembleBriefing so both consume the same modules.
  - DoD: Evening summary reuses shared step modules; evening-specific steps <=120L; date helpers imported not redefined; tests green; generic; RAW-verify the evening payload after rebuild is identical; impl is a thin sequencer.
  - depends_on: FACTORY-APP-split-assembleBriefing
- **`FACTORY-APP-dedup-date-freshness-helpers`** — Centralize VN-date/affected-codes/freshness helpers (one home each)
  - zone `mcp-server-application` · agent **dev-mcp-server** · effort M · risk low · rebuild true
  - files: apps/mcp-server/src/application/usecases/assembleBriefing.ts, apps/mcp-server/src/application/usecases/assembleEveningSummary.ts, apps/mcp-server/src/application/usecases/assembleAlertDigest.ts
  - approach: midnightVietnamAsUtc/todayVietnam/parseAffectedCodes/isPriceFresh are duplicated in briefing (406/429/590/613) and evening (238/259/271/316); only todayVietnam is also in alertDigest (93). NOTE: timeConstants.ts header says 'Pure constants only — no functions' so put the date functions in a NEW sibling timeHelpers module (not timeConstants). Centralize isPriceFresh with a named PRICE_FRESHNESS_MS = 24*MS_PER_HOUR (replacing the bare `<=24` literal) taking db + the per-caller log label as an argument; move parseAffectedCodes to a shared db/domain helper. Replace all local copies with imports.
  - DoD: One home per helper (date fns in timeHelpers, not timeConstants); 24h literal named; all copies replaced; assemble tests green; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-APP-split-fetchParseAndStoreBctc`** — Split fetchParseAndStoreBctc + name the news-fallback confidence constants
  - zone `mcp-server-application` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts
  - approach: 895L file: extract the Step-2 OCR/cache-fallback block (223-381) into usecases/bctc/resolvePdfText.ts; extract tryNewsChainFallback (549-895)+buildAnalysisSummary+buildFiscalPeriod into usecases/bctc/newsChainFallback.ts. Hoist the four tuning literals (650-662: NEWS_FALLBACK_BASELINE=0.55, TEMPORAL_DISCOUNT=0.8, FALLBACK_CONF_MIN=0.45, FALLBACK_CONF_MAX=0.65) to named exports with a comment linking the OCR-confidence ladder. Arithmetic identical. NOTE: line 652 has a pre-existing per-date special-case (signalText.includes('2023')&&year===2024) — out of scope, do not extend it; flag it for a separate hardcode task.
  - DoD: File split, orchestrator <=120L; confidence constants named with identical resolved values; pre-existing 2023/2024 special-case left untouched and flagged; tests green; generic; RAW-verify against the named-volume DB after rebuild that BCTC confidence values are unchanged.
  - depends_on: —
- **`FACTORY-DOMAIN-extract-bctc-parsing-lib`** — Extract shared BCTC parsing primitives + VAS regex tables
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts, apps/mcp-server/src/domain/services/financial-reports/cashFlowExtractor.ts, apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts, apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts, apps/mcp-server/src/domain/services/financial-reports/bctcMagnitudeValidator.ts
  - approach: findValue is re-implemented in 3 extractors (cashFlow:63, income:48, balanceSheet:125 — note balanceSheet is 2-arg vs income/cashflow 4-arg, so unification is a reconciliation), applyMultiplier copy-pasted (balanceSheet:160, cashFlow:461), findByCode/findByLabel in bctcScalarAggregator, and the VAS total-assets regex appears named (balanceSheet P_TOTAL_ASSETS:233) and inline (bctcMagnitudeValidator:113). Create financial-reports/lib/lineScan.ts (canonical findValue/findValueByCode/applyMultiplier/detectDivisor) and lib/vasPatterns.ts (shared P_TOTAL_ASSETS/LIABILITIES/EQUITY). Migrate ONE extractor at a time, deleting its local copy and running that extractor's tests before the next. Keep statement-specific patterns local; do NOT merge the extractors.
  - DoD: Shared lib/ created; each extractor migrated one-at-a-time with its tests green between; signature reconciliation (2-arg vs 4-arg) verified value-preserving; tests green; generic; RAW-verify against the named-volume DB after rebuild that BCTC scalar values are identical pre/post.
  - depends_on: —
- **`FACTORY-DOMAIN-relocate-stock-catalog`** — Move STOCK_CATALOG reference table out of stockAliases logic file
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort M · risk low · rebuild true
  - files: apps/mcp-server/src/domain/services/stockAliases.ts
  - approach: stockAliases.ts (828L) embeds STOCK_CATALOG (80-639, ~560L of 66-ticker reference data) with detection logic. Move STOCK_CATALOG + StockCatalogEntry to a pure data module (domain/services/stockAliases/catalog.ts or packages/shared-config) with a size-justification header; keep NORMALISED_ALIASES/NORMALISED_CONTEXT_GUARDS IIFEs and detection functions in stockAliases.ts, importing the raw table. The derived-map builders run identically on the imported table.
  - DoD: Catalog relocated as pure data with header; detection logic file <=120L or justified; normalised maps build identically; detection tests green; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-INFRA-split-vnstockBridge`** — Extract 11 inline Python templates + shared stdout-capture wrapper from vnstockBridge
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort L · risk low · rebuild true
  - files: apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts
  - approach: vnstockBridge.ts (1198L) has 11 *_SCRIPT templates each re-embedding the `_real_stdout=sys.stdout/sys.stdout=_io.StringIO()` banner-suppression preamble and Vnstock().stock(...,source='VCI') boilerplate (the FIX-FUNDAMENTALS-REFRESH-CRON-DEAD comment is repeated per script, proving the fix was hand-applied N times); 17 `/1e9` conversions. Extract each template to vnstock/scripts/*.ts, add a shared wrapVnstockScript(body,symbol) that owns the preamble once; keep TS fetch wrappers in vnstockBridge.ts importing their script; move VnstockRateLimiter/runPython/backoff/junk-detection into vnstock/runtime.ts. Keep tested helpers (stripAnsiAndDetectJunk, isRateLimitResponse, calcBackoffMs) importable from a barrel.
  - DoD: Scripts extracted; banner dance defined once via wrapVnstockScript; public fetch fns + tested helpers importable from barrel; each file <=120L or justified; tests green; generic; RAW-verify against the named-volume DB after rebuild that vnstock fundamentals/prices fetch identical values.
  - depends_on: —
- **`FACTORY-INFRA-split-telegramCommands`** — Split telegramCommands by seam; move /recap orchestration to an application usecase
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort XL · risk med · rebuild true
  - files: apps/mcp-server/src/infrastructure/notifiers/telegramCommands.ts
  - approach: telegramCommands.ts (1071L) mixes router, 9 raw-SQL handlers, presentation (fmtNum:97/stripHtml:113/HELP_TEXT:76), AND imports application usecases (assembleEveningSummary/generatePeriodicSummary at 40-43) — infrastructure reaching UP. Low-risk first: extract fmtNum/stripHtml/HELP_TEXT to telegram/format.ts and handler SQL into a watchlistReadStore. Then (sequence last, behind the existing handler tests): move /recap,/recapw,/recapm orchestration into an application usecase the interface layer invokes, leaving the handler to render the returned summary — restoring the infra->application direction. Keep one thin router <=120L and the never-throws + plain-text contract.
  - DoD: Presentation + SQL extracted; /recap orchestration relocated to application; infra no longer imports usecases; never-throws + plain-text output preserved; handler tests green; tests green; generic; behavior of telegram commands unchanged verified; staged with the layering move last.
  - depends_on: —
- **`FACTORY-INTERFACE-sequential-confidence-05-mask`** — Stop fabricating 0.5 conviction in sequential-market-analysis
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts
  - approach: At line 170 `result.confidence = input.confidence ?? 0.5` fabricates a mid-confidence when the model omits one. Only assign result.confidence when input.confidence is provided; leave it undefined/null otherwise so 'no stated confidence' is distinct from a real 0.5. In-memory result object, no NOT NULL constraint, so unconditionally safe.
  - DoD: Behavior unchanged when input.confidence supplied; test asserts absent confidence does NOT become 0.5; tests green; generic; RAW-verify served payload after rebuild shows null/absent for an unspecified-confidence hypothesis.
  - depends_on: —
- **`FACTORY-INTERFACE-source-confidence-10-mask`** — Propagate real per-row source_confidence in finalizeBctcRefine (not 1.0)
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort S · risk med · rebuild true
  - files: apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts, apps/mcp-server/src/application/utils/refinedMarkdownParser.ts
  - approach: At finalizeBctcRefineTool.ts:398 `row.source_confidence ?? 1.0` persists a perfect-trust 1.0 for unknown extraction confidence into bctc_table_rows. The column is `source_confidence REAL NOT NULL DEFAULT 1.0` (schema-financial-reports.ts:510), so a bare ?? null INSERT would violate NOT NULL. Instead propagate the parser's actual per-row confidence from parseRefinedMarkdown; only when the parser genuinely yields none, fall through to the schema default explicitly with a comment. Do NOT change the column to nullable in this task.
  - DoD: Behavior unchanged when parser supplies a real confidence; rows with a real parser confidence persist that value; NOT NULL never violated; test covers parser-provided and parser-absent cases; tests green; generic; RAW-verify against the named-volume DB after rebuild that bctc_table_rows.source_confidence reflects the parser's real per-row value, not a blanket 1.0.
  - depends_on: —
- **`FACTORY-INTERFACE-extract-finalizeBctc-usecase`** — Move 1100L finalizeBctcRefine handler logic down into application/usecases
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts
  - approach: buildFinalizeBctcRefineHandler (116-1216) is a ~1100L application-layer function (its own header declares 'DDD layer: application') living in interface/tools. The author delimited BLOCK-1..5 / DT/BAL seams. Extract each into application/usecases/finalizeBctcRefine/: backfillScalarColumns, deriveRatioColumns (absorb safeDivideLocal), revalidateBalanceIdentity, recomputeExtractionConfidence, recomputeBctcEval — each <=120L, behind the single wrapping db.transaction. The interface tool keeps only Zod schema + server.tool registration + a thin orchestration call. Preserve call order exactly. Sequence after the source_confidence mask fix.
  - DoD: Logic relocated to application layer; each step <=120L; call order and single transaction preserved; recomputeExtractionConfidence output identical; tests green; generic; RAW-verify against the named-volume DB after rebuild that finalize produces identical BCTC confidence/eval values.
  - depends_on: FACTORY-INTERFACE-source-confidence-10-mask
- **`FACTORY-SCHEDULER-alert-confidence-literals`** — Derive alert/evidence confidence from in-scope strength, not frozen literals
  - zone `mcp-server-scheduler` · agent **dev-mcp-server** · effort M · risk med · rebuild true
  - files: apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts, apps/mcp-server/src/scheduler/market-data/insiderCheckJob.ts, apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts, apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts
  - approach: foreignFlowAlertJob (209,237 =0.75), insiderCheckJob (213,246 =0.85), bbAlertScanJob (218 =0.65), taAlertScanJob (231 =0.7) persist a fixed literal as the `confidence` of signals/evidence that downstream scoring treats as a real metric. A real strength metric is already computed beside it (insider magnitude=min(1,buyDays/10):212; foreignFlow magnitude=min(1,abs(totalNetVolume3d)/500000):236). Derive confidence from the in-scope strength via a small pure scorer in domain/services (testable), OR add an alertConfidence config group in mcpConfig. One job per commit, DB schema unchanged.
  - DoD: Each job's confidence derived from a real in-scope strength signal (or named config), not a frozen literal; signals of differing strength carry differing confidence; per-job tests; tests green; generic; RAW-verify against the named-volume DB after rebuild that persisted signal/evidence confidence varies with the real strength metric.
  - depends_on: —
- **`FACTORY-SCHEDULER-prediction-default-dedup`** — Dedup predictionMarket signalConfig defaults into one DEFAULT constant
  - zone `mcp-server-scheduler` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts
  - approach: Lines 533-546 write volumeSpike 50000 / probabilityShift 5 / minWallets 10 twice (try and catch). Define one named DEFAULT_PREDICTION_SIGNAL_CONFIG object (with a provenance comment) and spread it as the base in both branches: `{ ...DEFAULT_PREDICTION_SIGNAL_CONFIG, ...(pm ?? {}) }`. Identical resolved values, removes dual-maintenance and the catch-branch config bypass. Ideally surface as required fields in the PredictionMarketsConfig loader (config.ts:604).
  - DoD: Single named default object spread in both branches; resolved thresholds unchanged; test pins resolution; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-SCHEDULER-job-table-registry`** — Replace 76 copy-paste scheduleCron/wrapRun blocks with a declarative JOB_TABLE
  - zone `mcp-server-scheduler` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/scheduler/startScheduler.ts
  - approach: startScheduler.ts (1191L) has 76 scheduleCron calls, 64 wrapping an identical jobRunRepo.wrapRun envelope, plus inline closures (walEscalateFn 209-227). Introduce schedulerJobTable.ts with a JOB_TABLE of {name,cron,runner,options} entries and a single loop `for(const j of JOB_TABLE) scheduleCron(j.cron,()=>jobRunRepo.wrapRun(j.name,j.runner),j.options)`. Bespoke entries (restartCadence returns {rowsWritten}:252, monthlySignalQuality recoverMissedExecutions:false:283, dataAuditDaily skips wrapRun:286-288) keep custom runners; move walEscalateFn to walEscalation.ts. Registry MUST carry per-entry options (timezone, recoverMissedExecutions). Target startScheduler ~200L.
  - DoD: Declarative JOB_TABLE + single loop; every job's cron/options/runner reproduced exactly incl bespoke entries; startScheduler under cap or justified; scheduler boot test green; tests green; generic; behavior (which jobs fire, when, with what options) unchanged verified.
  - depends_on: —
- **`FACTORY-NEWS-extract-rss-parse`** — Extract the shared RSS parse layer; collapse the two 95%-identical scrapers
  - zone `news-fetch` · agent **dev-mcp-server** · effort M · risk low · rebuild true
  - files: apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts, apps/news-fetch/src/infrastructure/scrapers/bloomberg-rss.ts, apps/news-fetch/src/infrastructure/scrapers/rss-parse.ts
  - approach: reuters-rss.ts (208L) and bloomberg-rss.ts (209L) share byte-identical parseRssXml/parseDom/extractTag; buildArticle/parseRegex differ only by the NewsSource enum. Extract rss-parse.ts (<=120L) exporting parseRssXml(xml,fetchedAt,maxItems,source) + extractTag; reduce each scraper to a thin class delegating to a shared fetchRss(url,source,maxItems). Keep the normalizeRfcDate re-export for test back-compat (reuters-rss.test.ts imports it). After the split each scraper drops under 120L.
  - DoD: Shared parse layer extracted; each scraper <=120L; normalizeRfcDate re-export preserved; reuters-rss test green; tests green; generic; RSS Article output for both sources unchanged verified.
  - depends_on: —
- **`FACTORY-NEWS-dedup-normalizeDate`** — Fold the two stealth-scraper normalizeDate copies into the published-at primitive
  - zone `news-fetch` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/news-fetch/src/infrastructure/scrapers/bloomberg-stealth.ts, apps/news-fetch/src/infrastructure/scrapers/reuters-stealth.ts, apps/news-fetch/src/primitive/published-at-parser/index.ts
  - approach: normalizeDate is byte-identical in reuters-stealth (124-133) and bloomberg-stealth (141-150), and functionally equivalent to the published-at-parser primitive that already exists to dedup the RSS-side normalizeRfcDate. Add a null-tolerant normalizeDate wrapper to the primitive (parsePublishedAt as the core), replace both local definitions with an import. No test imports the stealth normalizeDate, so no re-export needed.
  - DoD: Single date-normalization home in the primitive; both stealth copies removed; tests green; generic; stealth publishedAt output unchanged verified.
  - depends_on: —
- **`FACTORY-NEWS-split-sandbox`** — Split news-fetch sandbox runner.ts; replace by-name signature switch
  - zone `news-fetch` · agent **dev-mcp-server** · effort L · risk low · rebuild true
  - files: apps/news-fetch/src/sandbox/runner.ts
  - approach: runner.ts (486L) owns CLI parsing, env-gate, registries, scenario discovery, deepEqual, two executors with a by-name signature switch (223-235), main loop, trace writer, and the data.js sidecar generator. Split into src/sandbox/ modules (same dir, import.meta.dir resolution preserved): cli.ts, registry.ts (store an argAdapter fn per entry to replace the if/else chain), discover.ts, equal.ts, execute.ts, report.ts, runner.ts as a thin orchestrator. PASS/FAIL/ERROR semantics unchanged.
  - DoD: Files split; argAdapter replaces the signature switch; each <=120L; sandbox runs scenarios identically; tests green; generic; tooling behavior unchanged.
  - depends_on: —
- **`FACTORY-PDF-paddleocr-score-07-mask`** — Stop defaulting PaddleOCR cell score to 0.7; surface real ink-density or sentinel
  - zone `pdf-extractor` · agent **dev-pdf-extractor** · effort S · risk low · rebuild true
  - files: apps/pdf-extractor/infrastructure/pek_engine_adapter.py
  - approach: At pek_engine_adapter.py:532 `row_density = float(cell.get("score", 0.7))` fabricates a 0.7 confidence when PaddleOCR omits 'score'. row_density flows into the LF-OVERLAY row_bands contract and is a measured value in the sibling _detect_row_bands path. Either compute a real ink-density proxy from the already-clamped y0..y1 band (mirroring _detect_row_bands), or set None / a named _MISSING_CELL_SCORE_SENTINEL so absence is greppable and not confused with a measured 0.7. Add a unit test feeding a cell dict without 'score'.
  - DoD: Behavior unchanged when 'score' present; absence surfaces as a real computed proxy or explicit sentinel, never a fabricated 0.7; test asserts missing-score handling; tests green; generic; RAW-verify the row_bands payload after rebuild that a missing-score cell does not emit a bare 0.7 indistinguishable from a measured one.
  - depends_on: —
- **`FACTORY-PDF-split-extractLayoutFirst-execute`** — Extract ExtractLayoutFirstUseCase.execute into per-Tier private methods
  - zone `pdf-extractor` · agent **dev-pdf-extractor** · effort L · risk med · rebuild true
  - files: apps/pdf-extractor/application/extract_layout_first_usecase.py
  - approach: execute() (211-~692, ~480L) runs Tier 0->1->2->3 inline interleaved with _eval_push_stage1/2/3 (412/423/477). Extract _tier0_document_map, _tier1_zone_pages, _tier2_ocr_and_stitch, _tier3_invariant_gate (each <=120L); execute() becomes the linear pipeline threading results and keeping the eval-push calls at the same points. Keep injected callables and quarantined=1 semantics identical; no signature change to execute() so handlers caller untouched.
  - DoD: Per-Tier methods extracted; execute() signature unchanged; quarantine semantics preserved; each method <=120L; tests green; generic; extraction output unchanged verified.
  - depends_on: —
- **`FACTORY-PDF-delete-deprecated-inspect`** — Delete the deprecated /inspect viewer surface still wired into main.py
  - zone `pdf-extractor` · agent **dev-pdf-extractor** · effort M · risk low · rebuild true
  - files: apps/pdf-extractor/interface/handlers.py, apps/pdf-extractor/infrastructure/inspection_store.py
  - approach: Both files carry a DEPRECATED (PDF-INSPECT-REDO) banner, yet main.py:27/145/249 still constructs InspectionStore and registers four live /inspect* routes (handlers.py 552/569/600/635, ~112L). The mcp-server GET /api/bctc-inspect viewer is the SSOT. Delete the four route closures, drop the InspectionStore construction + the inspection_store param from register_routes/main.py, delete inspection_store.py and interface/viewer.html. Keep active extraction routes untouched. If QA sign-off is pending, gate behind an env flag defaulting off instead of deleting.
  - DoD: Deprecated /inspect routes + store removed (or env-gated off if QA pending); active extraction routes unaffected; handlers.py nearer cap; tests green; generic; live extraction behavior unchanged.
  - depends_on: —
- **`FACTORY-PDF-fix-application-infra-leak`** — Introduce DocLangSerializerPort to remove application->infrastructure import
  - zone `pdf-extractor` · agent **dev-pdf-extractor** · effort M · risk low · rebuild true
  - files: apps/pdf-extractor/application/doclang_serialize_usecase.py, apps/pdf-extractor/domain/modules/financial_reports/ports.py
  - approach: doclang_serialize_usecase.py:18 imports concrete infrastructure.DocLangSerializer (the only `from infrastructure` import in the application layer; import-linter only fences domain so it passes CI silently). Add a DocLangSerializerPort Protocol in domain/modules/financial_reports/ports.py (sibling to DocLangWritePort) describing the .serialize surface; type the usecase param as the Port and drop the infrastructure import; wire the concrete class at the composition root (main.py). Separately add an import-linter forbidden contract source=application forbidden=infrastructure,interface so the class of leak is caught going forward.
  - DoD: Usecase imports only the domain Port; concrete serializer wired at composition root; import-linter forbidden contract added and passing; tests green; generic; serialization behavior unchanged verified.
  - depends_on: —
- **`FACTORY-STOCK-extract-vndirect-mapper`** — Extract a pure VnDirect quote-mapper primitive; collapse Tier1/Tier2 duplication
  - zone `stock-price` · agent **dev-stock-price** · effort M · risk med · rebuild true
  - files: apps/stock-price/pkg/infrastructure/fetchers.go, apps/stock-price/pkg/primitive/vndirect-quote-mapper/mapper.go, apps/stock-price/pkg/primitive/vndirect-quote-mapper/mapper_test.go
  - approach: Tier1.FetchPrice (35-119) and Tier2.FetchPrice (140-223) are ~85L byte-identical except the URL: payload struct, floor->source switch, *1000 scaling, headers. Extract a pure pkg/primitive/vndirect-quote-mapper (stdlib+domain only, CGO_ENABLED=0) MapStockPricesResponse(body,start) owning the payload struct + floor switch + scaling. Introduce named ThousandsVNDScale=1000 and a vnFloors map keyed by HOSE/HNX/UPCOM (single source for source-mapping AND scale-eligibility). Collapse Tier1/Tier2 to one doFetch(url) delegating to the primitive. Write the mapper_test FIRST (see the test-gap task) so the move is behavior-preserving by construction.
  - DoD: Pure mapper primitive with named *1000 scale + vnFloors map; Tier1/Tier2 collapsed to doFetch; mapper_test written first and green; scaling/source logic byte-identical; tests green; generic; RAW-verify the served Price for sample tickers is unchanged after rebuild.
  - depends_on: FACTORY-STOCK-vndirect-mapper-tests
- **`FACTORY-STOCK-split-sandbox`** — Split the 743L stock-price sandbox by executor seam
  - zone `stock-price` · agent **dev-stock-price** · effort M · risk low · rebuild true
  - files: apps/stock-price/cmd/sandbox/main.go
  - approach: 743L holding root resolution, 3 primitive executors + 1 module executor, all JSON DTOs, two dispatchers, float-ptr helpers, and main(). Split (package main): main.go (main+flags+findRepoRoot+run loop), discover.go, exec_primitive_normalizer.go, exec_primitive_selector.go, exec_primitive_staleness.go, exec_module_resolution.go, dispatch.go. Pure file-move, no signature changes.
  - DoD: Files split; each <=120L or justified; sandbox runs identically; tests green; generic; tooling behavior unchanged.
  - depends_on: —
- **`FACTORY-TECHANALYSIS-delete-orphaned-ts-service`** — Delete or attic the orphaned TS shadow service under src/
  - zone `technical-analysis` · agent **dev-technical-analysis** · effort M · risk low · rebuild false
  - files: apps/technical-analysis/src/index.ts, apps/technical-analysis/src/domain/services.ts, apps/technical-analysis/src/application/usecases.ts, apps/technical-analysis/src/infrastructure/calculator.ts, apps/technical-analysis/src/interface/handlers.ts
  - approach: The Dockerfile copies only cmd/ pkg/ api/ and runs go build ./cmd/server; nothing outside src/ imports it except package.json scripts and the TS __tests__. Delete the entire src/ tree plus its package.json start/build wiring (cmd/server Go is the deployed artifact). This auto-resolves the determineTrend 70/30 hardcode finding (latent in dead code) and removes the divergent /ta/indicators TS contract. Must be sequenced WITH the contract-reconciliation and Go-test tasks. If kept as reference, move to apps/_attic/ instead — but deletion is the clean path.
  - DoD: grep confirms no external .ts import of src/; deployed Go service untouched and builds; TS __tests__ targeting src/ deleted or moved with it; tests green; generic; behavior of deployed Go path unchanged.
  - depends_on: FACTORY-TECHANALYSIS-go-livepath-tests, FACTORY-TECHANALYSIS-reconcile-ta-contract
- **`FACTORY-TECHANALYSIS-go-livepath-tests`** — Add Go tests for the deployed request path (application + interface/http + domain)
  - zone `technical-analysis` · agent **dev-technical-analysis** · effort M · risk low · rebuild false
  - files: apps/technical-analysis/pkg/interface/http/router_test.go, apps/technical-analysis/pkg/application/usecases_test.go
  - approach: pkg/application, pkg/interface/http, pkg/domain have zero *_test.go while the green TS suite covers only the dead src/ tree. Add router_test.go (httptest.NewServer(NewRouter(...)) covering GET /health, POST /ta/indicators happy path, invalid-JSON 400, missing closes+symbol 400, useCase-error 500) and usecases_test.go (table tests for Execute: pure-compute path, DB-backed path with a fake PriceRepo, period<=0 default, empty-closes+empty-symbol error). Model on the existing httptest harness proven in cmd/sandbox. Purely additive.
  - DoD: New Go tests exercise the live request path and pass; coverage now includes the shipped path; no production code changed; tests green; generic; this guards the src/ deletion and contract reconciliation.
  - depends_on: —
- **`FACTORY-TECHANALYSIS-reconcile-ta-contract`** — Make api/openapi.yaml the single /ta/indicators contract; conform the Go service
  - zone `technical-analysis` · agent **dev-technical-analysis** · effort M · risk med · rebuild true
  - files: apps/technical-analysis/pkg/interface/http/router.go, apps/technical-analysis/pkg/application/dtos.go, apps/technical-analysis/api/openapi.yaml
  - approach: Go and the dead TS bind the same port/route with divergent contracts (Go: {symbol|closes,period}->array series; TS: {code,days}->scalar+trend). openapi.yaml already describes the Go shape. Confirm the Go shape is canonical and conform the spec/service to it. If scalar+trend is a desired feature, port determineTrend into the Go module tier as a tested primitive with NAMED thresholds (not inline literals) rather than leaving it in dead TS. Behavior-CHANGING on the live endpoint, so golden-diff request/response before and after.
  - DoD: Single authoritative /ta/indicators contract documented in openapi.yaml and matched by the Go service; if trend is ported, thresholds are named config constants with real computation (no placeholders); golden request/response diff reviewed; tests green; generic; RAW-verify the served indicators payload after rebuild matches the spec.
  - depends_on: FACTORY-TECHANALYSIS-go-livepath-tests
- **`FACTORY-TECHANALYSIS-split-sandbox`** — Split the 1805L technical-analysis sandbox; drop dead parseCloses shim
  - zone `technical-analysis` · agent **dev-technical-analysis** · effort L · risk low · rebuild true
  - files: apps/technical-analysis/cmd/sandbox/main.go
  - approach: 1805L god-file (the verification oracle). Extract into a cmd/sandbox/internal package, <=120L each: audit.go, diff.go, scenario_path.go, closes_gen.go (parseCloses + generators), runner_{rsi,macd,bb,ma,cross,module,service}.go, main.go (flags + tier dispatch). Replace runPrimitive switch with `type Runner func(*RawScenario)(interface{},[]string,error)` + a map. Delete the `var _ = parseCloses` shim once parseCloses has a real caller in closes_gen.go. CAVEAT: sandbox_test.go (package main) calls floatEq/generateFromPattern/runRSI/etc as package-local — move those tests or export the identifiers when relocating to internal/.
  - DoD: Files split; runner map replaces switch; dead shim removed; sandbox_test.go updated for the new package layout and green; each file <=120L or justified; tests green; generic; oracle verdicts unchanged.
  - depends_on: —
### P2 — 36 task(s)

- **`FACTORY-ALERT-delete-deprecated-domain`** — Delete dead _deprecated domain package (298L duplicate of primitives)
  - zone `alert-engine` · agent **dev-alert-engine** · effort S · risk low · rebuild false
  - files: apps/alert-engine/pkg/domain/_deprecated/services_v1.go, apps/alert-engine/pkg/domain/_deprecated/services_v1_test.go
  - approach: _deprecated/services_v1.go reimplements djb2Hash/ComputeFingerprint/ShouldSuppressAlert/IsDuplicate, all superseded by pkg/primitive/cooldown-gate and dedup-key-builder. The dir is build-excluded; grep confirms no live importer (only comments reference it). Delete both files.
  - DoD: Directory deleted; grep confirms no live importer; go build + primitive tests green; generic; no runtime change.
  - depends_on: —
- **`FACTORY-ALERT-shared-vocab-package`** — Collapse triple-declared severity/channel constants (Fence-aware)
  - zone `alert-engine` · agent **dev-alert-engine** · effort M · risk low · rebuild true
  - files: apps/alert-engine/pkg/domain/models.go, apps/alert-engine/pkg/primitive/signal-classifier/classifier.go, apps/alert-engine/pkg/primitive/cooldown-gate/gate.go
  - approach: AlertSeverity + 4 severity consts and TelegramChannel + ChannelMarket/Work are declared in domain/models.go (8-31), re-declared verbatim in signal-classifier (18-31), and severityCritical hand-copied in cooldown-gate (31). The primitives enforce Fence-A (stdlib-only), so the higher-value 'shared leaf package both domain and primitives import' option needs an architecture sign-off that a stdlib-only vocab package satisfies Fence-A. Low-risk fallback (no sign-off needed): delete cooldown-gate's lone severityCritical literal and reference the signal-classifier constant, collapsing 3 copies to 2. Same string values either way.
  - DoD: Either a Fence-A-approved shared vocab package consumed by all three, or the cooldown-gate literal collapsed; string values identical; depguard/fence checks pass; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-ALERT-split-sandbox`** — Split the 565L alert-engine sandbox by concern
  - zone `alert-engine` · agent **dev-alert-engine** · effort M · risk low · rebuild true
  - files: apps/alert-engine/cmd/sandbox/main.go
  - approach: 565L mixing discovery, 3 primitive executors, module dispatch + mock ports + alert_pipeline executor, and the CLI loop. Split (package main): discovery.go (Scenario/findRepoRoot/discoverScenarios), exec_primitive.go (3 executors + dispatcher), exec_module.go (sandbox mock ports + executeAlertPipeline), main.go (flags + root + run loop). Add an honest size-justification only if exec_module.go must stay over cap. Mechanical move; existing primitive tests cover the driven code.
  - DoD: Files split; each <=120L or justified; sandbox runs scenarios identically; tests green; generic; tooling behavior unchanged.
  - depends_on: —
- **`FACTORY-ALERT-router-cleanups`** — Delete dead UseCaseExecutor, inject real port into /health, reuse domain severity validation, simplify substring search
  - zone `alert-engine` · agent **dev-alert-engine** · effort S · risk low · rebuild true
  - files: apps/alert-engine/pkg/interface/http/router.go, apps/alert-engine/pkg/infrastructure/sqlite.go
  - approach: Four small cleanups: (1) delete the orphaned UseCaseExecutor interface (router.go:18-22); (2) thread cfg.Port into NewRouter(uc,port) and emit it in handleHealth instead of the hardcoded 5006 (single caller in main.go); (3) replace the inline validSeverities map (router.go:77) with domain.AlertSeverity(body.Severity).IsValid() (keep the 400 message text); (4) replace the bespoke containsStr/findSubstr (sqlite.go:105-123) with strings.Contains and hoist outcomeLookbackDays=90 / defaultPendingLimit=100 to named consts.
  - DoD: Dead interface removed; /health reflects real port; severity validated via domain rule with unchanged 400 message; strings.Contains replaces the hand-rolled scanner; magic numbers named; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-APIGW-split-sandbox`** — Split api-gateway sandbox 744L god-file + dedup executors
  - zone `api-gateway` · agent **dev-api-gateway** · effort L · risk low · rebuild true
  - files: apps/api-gateway/cmd/sandbox/main.go
  - approach: 744L, largest in zone, three near-identical primitive executors (273-298/317-342/363-402) and the sandboxPorts anonymous struct declared 3x (449-453/514-518/524-528). Split (package main): discover.go, trace.go, exec_primitive.go (+ executePrimitive dispatcher), exec_module.go (sandboxPorts + module executors), main.go. Extract a named sandboxService struct to kill the 3x anonymous struct and a buildPrimitiveTrace helper for the repeated compare tail. No assertion logic change.
  - DoD: Files split; sandboxService named type + buildPrimitiveTrace helper; assertion logic unchanged; each file <=120L or justified; sandbox runs identically; tests green; generic; tooling behavior unchanged.
  - depends_on: —
- **`FACTORY-APIGW-split-capability-prober`** — Split capability_prober.go into manifest/probe/prober files
  - zone `api-gateway` · agent **dev-api-gateway** · effort M · risk low · rebuild true
  - files: apps/api-gateway/pkg/infrastructure/capability_prober.go
  - approach: 377L folding manifest parsing (19-168), prober struct+TTL cache (47-229), health-endpoint probe (274-294), and MCP JSON-RPC tools/call probe with SSE handling (296-377). Split (package infrastructure): capability_manifest.go (types + loadManifest), capability_probe.go (probeHealthEndpoint + mcp request/response + probeMcpTool), capability_prober.go keeps struct + ProbeAll + capabilityFor + runProbe. While moving, replace the brittle `ct[:17]=="text/event-stream"` (361) with strings.HasPrefix. capability_prober_test.go covers all three.
  - DoD: Files split; content-type check uses HasPrefix; each file <=120L; capability_prober_test.go green; tests green; generic; probe behavior unchanged verified.
  - depends_on: —
- **`FACTORY-FRONTEND-split-market-summaries`** — Move market-summaries pure helpers to domain; split list/detail JSX
  - zone `frontend` · agent **dev-frontend** · effort L · risk low · rebuild true
  - files: apps/frontend/app/routes/dashboard.market-summaries.tsx, apps/frontend/app/__tests__/task17-market-summaries-loader.test.ts
  - approach: market-summaries.tsx (999L) exports 11 pure helpers the test imports. Relocate outlookLabel/outlookColorClass/formatDateRange/filterTickers/PERIOD_LABELS into a NEW app/domain/market-summaries/format.ts (safe pure move). CAUTION: the canonical app/domain/formatters/change-pct.ts and direction-arrow.ts return objects ({formatted,symbol,cls}) while the route helpers return bare strings — do NOT blindly reuse them; either add string-returning exports or adapt call-sites. Keep fetchSummaries in lib/api/client.ts. Re-point the loader test imports; split list/detail JSX into components/market-summaries/*.tsx.
  - DoD: Pure helpers relocated; formatter-reuse handled without changing rendered output; test imports re-pointed; JSX split; each file <=120L; tests green; generic; market-summaries render unchanged verified.
  - depends_on: —
- **`FACTORY-FRONTEND-reconcile-formatters`** — Reconcile and dedup directionArrow/changePct formatters (behavior decision)
  - zone `frontend` · agent **dev-frontend** · effort M · risk med · rebuild true
  - files: apps/frontend/app/routes/dashboard.market-summaries.tsx, apps/frontend/app/routes/dashboard.global-markets.tsx, apps/frontend/app/domain/formatters/direction-arrow.ts, apps/frontend/app/domain/formatters/change-pct.ts
  - approach: directionArrow is defined 3x and formatChangePct 2x, but the copies DIVERGE in a behavior-visible way: global-markets uses solid triangles ▲/▼ (test asserts '▲'), market-summaries+domain use thin arrows ↑/↓; domain returns objects, routes return strings. This is NOT a mechanical dedup — make a deliberate glyph + return-type decision first (e.g. arrowForTrend vs arrowForDirection, or a normalizing input), update the affected test expectations, THEN delete the in-route copies and import from the formatter module. Treat as a behavior-reconciliation task, not a pure move.
  - DoD: Glyph + return-type contract decided and documented; in-route copies removed; affected tests (reaudit-fe-003, task17-global-markets) updated to the chosen contract and green; tests green; generic; the change-pct/arrow display is intentional and consistent across routes.
  - depends_on: FACTORY-FRONTEND-split-market-summaries
- **`FACTORY-FRONTEND-split-orchestration`** — Split dashboard.orchestration: DTOs to shared, sections to components
  - zone `frontend` · agent **dev-frontend** · effort L · risk med · rebuild true
  - files: apps/frontend/app/routes/dashboard.orchestration.tsx
  - approach: orchestration.tsx (997L, POLL_MS=5000) bundles the polling loader, a DTO contract mirroring backend journalStore.ts/orch-state.json (L50-120), staleness logic, and every render block. Extract the DTOs (StepDto/DecisionsDto/TaskRow/SignalRow/...) to packages/shared-types or app/domain/orchestration/types.ts; extract STALE_THRESHOLD_MS + the staleness predicate to a tested helper; split render blocks into components/orchestration/{HeadPanel,TaskBoard,SignalQueue,SprintGoal,Narrative}.tsx <=120L each; loader stays. Only orchestration-task-board.test.ts covers it — add a render smoke test for any newly-extracted untested component BEFORE splitting it.
  - DoD: DTOs relocated; staleness helper tested; sections componentized with smoke tests added before split; each file <=120L; tests green; generic; orchestration render + polling unchanged verified.
  - depends_on: —
- **`FACTORY-KINHDICH-split-sandbox`** — Split the 752L kinh-dich sandbox CLI by seam
  - zone `kinh-dich-service` · agent **dev-kinh-dich** · effort M · risk low · rebuild true
  - files: apps/kinh-dich-service/cmd/sandbox/main.go
  - approach: 752L single main mixing dispatch, 5 primitive runners, git-hash, dashboard file emission, and discovery. Split into cmd/sandbox/ files (all package main, no API change): main.go (flags+tier loop+summary), runners.go (dispatch + 5 runXxxScenario decoders), emit.go (emitTracesFile/emitReferenceFile + types), discovery.go (findScenarioDir/findDashboardDir/getCommitHash). Optionally factor the repeated []interface{}->[]float64/[]int coercion into one helper. Behavior identical.
  - DoD: Files split; each <=120L or justified; sandbox runs scenarios identically; tests green; generic; dev-tool behavior unchanged.
  - depends_on: —
- **`FACTORY-MACRO-split-or-justify-over-cap`** — Split adapters_vmt_sjc_fx + justify cohesive over-cap Go files
  - zone `macro-indicators` · agent **dev-macro-indicators** · effort M · risk low · rebuild true
  - files: apps/macro-indicators/pkg/infrastructure/adapters_vmt_sjc_fx.go, apps/macro-indicators/pkg/application/usecases.go, apps/macro-indicators/pkg/infrastructure/parsers_vmt_trade.go, apps/macro-indicators/cmd/server/main.go
  - approach: Split-vs-justify triage: (a) adapters_vmt_sjc_fx.go (504L) bundles SJCGoldFXAdapter + SBV policy-rates HTML parse/fetch/TLS — split into the DB adapter + parsers_vmt_sbv_policy_rates.go; (b) usecases.go (489L, cohesive ComputeMacroUseCase) and the VMT parser files — add an honest size-justification header; (c) cmd/server/main.go (394L) — move the 8 one-line adapter shim types (189-368, ~205L) to a sibling cmd/server/adapters.go (still package main, Fence-C preserved), dropping main.go under cap.
  - DoD: sjc_fx split; cohesive files carry honest headers; main.go shims moved to adapters.go (no import-graph change); each file <=120L or justified; go build + tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-APP-pollNews-layering-fix`** — Move source-health tracker singleton from interface down to infrastructure
  - zone `mcp-server-application` · agent **dev-mcp-server** · effort M · risk med · rebuild true
  - files: apps/mcp-server/src/application/usecases/pollNews.ts, apps/mcp-server/src/interface/mcp/tools/news-analysis/sourceHealthTools.ts
  - approach: pollNews.ts:33 imports globalSourceTracker/_resetGlobalSourceTracker from interface (application depending UP, fenced with eslint-disable FENCE-LEGACY at :32). The pure SourceHealthTracker class already lives in domain; only the singleton instance + seeds (interface :43-64) are misplaced. Move the singleton + seedKnownSources + _resetGlobalSourceTracker into infrastructure/health/sourceHealthTracker.ts; have both the interface tool and pollNews import from there; remove the eslint-disable. Preserve the globalThis-key + module-load seeding order exactly.
  - DoD: Singleton relocated to infrastructure; dependency direction restored; eslint-disable removed; load-order/seed behavior preserved; source-health tool tests green; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-DOMAIN-extract-sentiment-lexicons`** — Extract sentiment lexicon + negation tables from sentimentClassifier
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort M · risk low · rebuild true
  - files: apps/mcp-server/src/domain/services/sentimentClassifier.ts
  - approach: sentimentClassifier.ts (589L) holds VN/EN bullish/bearish lexicons + FLIP/SOFT negation tokens (~470L) before classifySentiment:513. Extract data into sentiment/lexicons.ts and sentiment/negation.ts (with NEGATION_WINDOW); keep the matching algorithm in sentimentClassifier.ts importing them. Lexicons are spread via ...arrays so a pure data move preserves behavior.
  - DoD: Lexicon/negation data extracted; algorithm file <=120L or justified; sentiment tests green; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-DOMAIN-split-newsNormalizer`** — Split newsNormalizer types/helpers/tables out of the 979L file
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/domain/services/newsNormalizer.ts
  - approach: newsNormalizer.ts (979L) is the shared type home (AnalysisEntry/AnalysisLevel/Sentiment/...) plus decodeHtmlEntities + ~730L of normalization/classification tables before normalizeNews:833. Extract the type contracts into news/types.ts (or packages/shared-types), HTML/cleanup helpers into news/textClean.ts, classification tables into news/classification.ts; keep normalizeNews as a thin orchestrator. Migrate consumers' `import type` first (mechanical, erased at compile), then move helpers; keep the index.ts barrel re-export.
  - DoD: Types + helpers + tables extracted; consumers re-pointed; barrel public surface preserved; normalization tests green; logic files <=120L or justified; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-DOMAIN-name-bctc-cascade-magic-numbers`** — Name VAS row-code guards + cascade broadcast-floor magic numbers
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts, apps/mcp-server/src/domain/services/cascadeEngine.ts
  - approach: Promote bare literals to named constants: balanceSheetExtractor VAS_ROW_CODE_MIN=10 / MAX=990 / VAS_AGGREGATE_CODE_FLOOR=270 (the `val>=10&&<=990&&%10===0` guard repeated at 99,117,131,138 and `code>=270` at 109); cascadeEngine DEFAULT_BROADCAST_MIN_IMPACT=6 used as `?? DEFAULT_BROADCAST_MIN_IMPACT` (3449). Each carries a one-line provenance comment. NOTE: RAW_VND_THRESHOLD=1e11 is already named+documented (bctcScalarAggregator:15-16,221-226) — do NOT touch it. Default values unchanged.
  - DoD: Literals promoted to named documented constants; resolved values identical; RAW_VND_THRESHOLD untouched; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-XZONE-size-justification-sweep`** — Add honest size-justification headers / split remaining over-cap files (per-zone tracked)
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort XL · risk low · rebuild false
  - files: apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts, apps/mcp-server/src/domain/services/macro/macroCalendar.ts, apps/mcp-server/src/application/usecases/generatePeriodicSummary.ts, apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts, apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts
  - approach: Monorepo-wide only ONE source file carries the mandated header. After the per-file god-file splits land, sweep the residual over-cap files: for genuinely-cohesive files (pure data catalogs, exhaustive type maps, single-responsibility jobs) add an honest leading size-justification header stating the reason; for multi-responsibility files schedule a seam-based split via the relevant per-zone task. This is a per-zone checklist owned by each dev_agent (dev-mcp-server for the mcp-server zones listed, others handled inside their zone's split tasks). Dedupe against findings 1-3 so the same file is not split twice. Must land AFTER the size-lint CI guard exists so the backlog stops growing.
  - DoD: Every remaining over-cap source file across all zones either split or carrying an honest size-justification header; size-lint CI passes clean; no file >120L without justification; tests green; generic; no runtime change.
  - depends_on: CI-size-lint-justification
- **`FACTORY-INFRA-agentSignal-sql-binding`** — Replace string-interpolated SQL with bound placeholders in agentSignalStore reads
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/mcp-server/src/infrastructure/db/agentSignalStore.ts
  - approach: getSignals interpolates the hoursBack window (883) and signal_type with hand-rolled replace(/'/g,"''") escaping (891); getSignalEffectiveness interpolates days (998) + escapes fromAgent (1001)/signalType (1002). Replace each with bound `?` placeholders (`s.signal_type = ?`, `created_at >= datetime('now', ?)` binding the computed interval string, `from_agent = ?`); also parameterize the `WHERE id IN (${ids})` UPDATE at 911. Removes the DIY escaping and makes the read path uniform. Covered by existing getSignals + security-sql-injection tests.
  - DoD: All interpolated fragments replaced with bound params; no hand-rolled quote-escaping remains; getSignals + sql-injection tests green; tests green; generic; served effectiveness values unchanged verified.
  - depends_on: —
- **`FACTORY-INFRA-split-ssc-fetchers`** — Split ssc.ts into per-portal disclosure fetchers (no dedup-delete yet)
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/infrastructure/fetchers/ssc.ts
  - approach: ssc.ts (1029L) bundles four independent scrapers (SSC/HOSE/HNX/UPCOM) + shared withBrowserLock. Split per portal into infrastructure/fetchers/disclosures/{ssc,hoseDisclosures,hnxDisclosures,upcomDisclosures}.ts; move withBrowserLock/HttpClient/resolveUrl/titleMatchesReportType into disclosures/browserClient.ts; SscDocument type into disclosures/types.ts. Do the PURE split only. GATE the 'reconcile against existing hose.ts/hnx.ts and delete the duplicate parser' step behind a separate equivalence-check task — the two impls may parse different endpoints/markup; deletion requires proving semantic equivalence first.
  - DoD: Per-portal split done (no parser deleted); each file <=120L or justified; disclosure fetch tests green; tests green; generic; behavior of all four scrapers unchanged verified; dedup-delete explicitly deferred.
  - depends_on: —
- **`FACTORY-INFRA-split-stores-and-migrations`** — Split vnstockStore per entity + make schema-financial migrations declarative
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort XL · risk med · rebuild true
  - files: apps/mcp-server/src/infrastructure/db/vnstockStore.ts, apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts
  - approach: vnstockStore.ts (937L) owns store/get pairs for 8 entities + runVnstockMigrations. Split into infrastructure/db/vnstock/{financials,tradingStats,officers,shareholders,events,balanceSheet,cashFlow,foreignFlow}Store.ts (each store+get <=120L) + vnstock/migrations.ts + barrel re-export. schema-financial-reports.ts (1079L) runs ~22 inline `if(!colNames.has)ALTER TABLE` migrations — convert to a declarative [{column,ddl}] array iterated by one loop so adding a column is a one-line data entry; keep initFinancialReportsTables a thin orchestrator. Idempotent migrations run identically when data-driven. Add a size-justification to any pure-DDL constant that stays over cap.
  - DoD: Per-entity stores + barrel; migrations data-driven and idempotent (same effect as before); each file <=120L or justified; migration replays cleanly; tests green; generic; RAW-verify against the named-volume DB after rebuild that vnstock financial values persist/read identically.
  - depends_on: —
- **`FACTORY-INTERFACE-delete-bak-files`** — Remove 2 committed .bak dead-code files from the interface zone (+ repo-root .bak)
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort S · risk low · rebuild false
  - files: apps/mcp-server/src/interface/mcp/server.ts.bak, apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts.bak
  - approach: git rm server.ts.bak (1569L) and telegramReportTools.ts.bak (330L); also git rm the two repo-root strays docker-compose.yml.bak and docs/TASKS.md.bak. .bak cannot be imported by TS resolution so deletion is safe. Add `*.bak` to .gitignore so backups are never committed again.
  - DoD: git ls-files shows no .bak tracked; .gitignore blocks *.bak; grep confirms nothing references the .bak paths; tests green; generic; no runtime change.
  - depends_on: —
- **`FACTORY-INTERFACE-vps-auth-guard-dedup`** — Extract one requireVpsApiKey guard; replace 15+ copy-paste auth blocks
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort M · risk low · rebuild true
  - files: apps/mcp-server/src/interface/mcp/server.ts, apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts, apps/mcp-server/src/interface/mcp/routes/pushSbvRatesHandler.ts, apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts, apps/mcp-server/src/interface/mcp/routes/pushNewsHandler.ts
  - approach: The 7-line VPS_PUSH_API_KEY guard appears 15x in server.ts (grep `authHeader !== apiKey`) and in 4 push handlers. Extract routes/_shared/requireVpsApiKey.ts exporting `requireVpsApiKey(req,res): boolean` that writes the 401 and returns false on failure; replace each inline block with `if (!requireVpsApiKey(req,res)) return;`. Carefully preserve exact header precedence (x-api-key then Bearer) and 401 body — some copies use `.replace('Bearer ','')` and differ in header-read casing; normalize in the single guard.
  - DoD: One shared guard; all inline copies replaced; header precedence + 401 body byte-identical to prior behavior; auth tests green; tests green; generic; no auth-semantics change verified.
  - depends_on: —
- **`FACTORY-INTERFACE-move-kinhdich-ta-scoring-down`** — Move Kinh Dich + TA scoring math out of interface tools into domain
  - zone `mcp-server-interface` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts, apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts
  - approach: kinhDichTools.ts:57-414 holds 9 compute* scoring functions + tickerJitter (pure domain logic) inside an interface/tools file; they already take an injectable IKinhDichScoreRepository so the move is clean. Move them to domain/services/kinhdich/haoScoring.ts; the tool keeps only Zod schemas + server.tool + formatting. Likewise extract localComputeRSI/MACD/BB/EMA from technicalIndicatorTools.ts (118,137) into domain/services/market-data/taPrimitives.ts. Add domain-layer unit tests. Numeric output must be byte-identical.
  - DoD: Scoring math relocated to domain with unit tests; interface tools import from domain; hexagram/hao and TA numeric outputs unchanged; tests green; generic; RAW-verify served scores after rebuild are identical.
  - depends_on: —
- **`FACTORY-SCHEDULER-dedup-briefing-formatters`** — Extract shared briefing formatters; break the sibling-job cross-dependency
  - zone `mcp-server-scheduler` · agent **dev-mcp-server** · effort L · risk low · rebuild true
  - files: apps/mcp-server/src/scheduler/briefings/franceSummaryJob.ts, apps/mcp-server/src/scheduler/briefings/eveningSummaryJob.ts, apps/mcp-server/src/scheduler/briefings/morningBriefingJob.ts
  - approach: franceSummaryJob (880L) imports formatGlobalSnapshotSection from morningBriefingJob and formatForeignFlowSection+isVnIndexFresh from eveningSummaryJob — sibling jobs cross-depend. Extract shared formatters into briefings/format/ (globalSnapshotSection, foreignFlowSection, moversSection, alertLines, vnIndexFreshness), each <=120L tested; all three jobs import from there. NOTE: tests import these directly from the job files (1783-foreign-flow-bulletin.test.ts:16, 1512, 1503) — update those test import paths or keep thin re-exports on the job files. One formatter per commit, verbatim move.
  - DoD: Shared formatters extracted; cross-dependency removed; test import paths updated or re-exports kept; each formatter <=120L; tests green; generic; briefing output unchanged verified.
  - depends_on: —
- **`FACTORY-NEWS-fix-source-logging`** — Fix composeNewsIngest logging both sources per call
  - zone `news-fetch` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/news-fetch/src/module/news_ingest/index.ts
  - approach: ingestHeadlines ignores _source and unconditionally emits BOTH a [reuters/headlines] and a [bloomberg/headlines] warn in every fallback branch (109-126), so a Bloomberg ingest prints a spurious Reuters line and vice-versa. Rename _source to source, compute `const tag = source===NewsSource.REUTERS ? '[reuters/headlines]' : '[bloomberg/headlines]'` once, and replace the four duplicated warn pairs with single `console.warn(`${tag} ...`)` calls. Control flow unchanged; only the (currently wrong) log text becomes correct.
  - DoD: Log tag derived from source; spurious cross-source log lines gone; warn lines halved; tests green; generic; control-flow behavior unchanged verified.
  - depends_on: —
- **`FACTORY-NEWS-dedup-handlers-maxitems`** — Dedup the 4 headline route handlers + name the 15/10 maxItems defaults
  - zone `news-fetch` · agent **dev-mcp-server** · effort M · risk low · rebuild true
  - files: apps/news-fetch/src/interface/handlers.ts, apps/news-fetch/src/domain/models.ts
  - approach: handlers.ts (170L) has four near-identical POST/GET handlers (71-159); the maxItems default is a bare 15 (Reuters)/10 (Bloomberg) at 74/97/98/120/143/144 plus the scraper signature defaults. Introduce DEFAULT_MAX_ITEMS={reuters:15,bloomberg:10} (in domain/models.ts) and a resolveMaxItems(raw,source) helper; extract a makeHeadlinesHandler(ingest,source) factory returning {post,get}. Register with app.post/app.get. Collapses ~90L to ~30L and brings the file under cap. Response envelopes + status codes unchanged.
  - DoD: DEFAULT_MAX_ITEMS named (15/10 unchanged); shared handler factory; file <=120L; response envelopes/status unchanged; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-NEWS-go-server-tier-split`** — Move Go news-fetch HTTP handlers out of the fat composition root
  - zone `news-fetch` · agent **dev-mcp-server** · effort M · risk med · rebuild true
  - files: apps/news-fetch/cmd/server/main.go
  - approach: The Go port's cmd/server/main.go (254L) defines handleHealth/handleRSSFetch/handleFetchAll/fetchResult/writeJSON in package main alongside wiring, hardcodes the fetch limit (NewVnEconomyFetcher(nil,20)) and embeds `"port":5008` in the health JSON (123) duplicating the env-resolved port. Move the handlers into internal/httpapi exposing Router(fetchers,store,logger) *chi.Mux; main.go keeps env reads + store.Open + fetcher construction + Router(...) + graceful-shutdown. Replace 20 with a named const/env RSS_MAX_ITEMS; build the health port from the resolved var. This belongs to the Go owning agent.
  - DoD: Handlers in internal/httpapi.Router; main.go a thin composition root under cap; fetch limit + health port named/derived; tests green; generic; RAW-verify the fetch+persist path serves identical articles after rebuild.
  - depends_on: —
- **`FACTORY-SHARED-prune-phantom-primitives`** — Delete the phantom packages/primitives/technical-analysis package
  - zone `packages-shared` · agent **dev-mcp-server** · effort S · risk low · rebuild false
  - files: packages/primitives/technical-analysis/bun.lock
  - approach: packages/primitives/technical-analysis contains only a bun.lock + node_modules — no package.json, no src, referenced nowhere (grep for the package name returns nothing). It pollutes a pnpm@9 workspace with a foreign bun lockfile. Delete packages/primitives entirely; re-introduce a real primitive package only when that tier is actually built.
  - DoD: packages/primitives removed; pnpm workspace install clean; grep confirms zero references; generic; no runtime change.
  - depends_on: —
- **`FACTORY-SHARED-fix-shared-db-stale-list`** — Add missing schema-backtesting to DB_SCHEMA_MODULES + sync guard
  - zone `packages-shared` · agent **dev-mcp-server** · effort S · risk low · rebuild false
  - files: packages/shared-db/index.ts, apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts
  - approach: DB_SCHEMA_MODULES is an 8-entry 'as const' list claiming to enumerate all schema slices, but the db dir has 9 schema-*.ts files (missing schema-backtesting). Add 'schema-backtesting' (alphabetical, before schema-briefings) so the list + DbSchemaModule union match disk. Add a 'keep in sync with infrastructure/db/schema-*.ts' header comment and, if a test step exists, a tiny assertion comparing schema-dir basenames to DB_SCHEMA_MODULES.
  - DoD: List matches the 9 on-disk schema files; sync-assertion or comment added; tests green; generic; constant-only change, no runtime effect (zero importers today).
  - depends_on: —
- **`FACTORY-SHARED-wire-or-prune-shared-packages`** — Wire one consumer per shared package (or prune) + collapse divergent DTOs
  - zone `packages-shared` · agent **dev-mcp-server** · effort L · risk med · rebuild true
  - files: packages/shared-types/index.ts, packages/shared-config/index.ts, apps/technical-analysis/src/application/dtos.ts, apps/news-fetch/src/routes/fetchArticleConfig.ts
  - approach: All four shared packages have zero importers and have already diverged (shared-types ComputeTAResponse, shared-config redeclared in infrastructure/config.ts). Make a deliberate keep-or-cut decision per package, ONE real import edge per PR, deleting the local duplicate in the same PR so net code shrinks — NO big-bang rewrite. CAUTION: Alert/Signal/ServiceHealth shapes are structurally different across apps (not drop-in), and ComputeTAResponse in the app is a SUPERSET (movingAverages/bollingerBands/computedAt) — reconcile shared-types to the app superset FIRST or you erase served fields. For shared-config, promote the news-fetch project-root walk-up + MCP_CONFIG_PATH resolver into shared-config as a strict superset before routing the SSRF-allowlist loader through it, preserving the empty-set-on-missing fallback. Prune any package with no near-term consumer.
  - DoD: At least one real consumer wired per kept package with its local duplicate deleted in the same PR (or the package pruned); divergent contracts reconciled to the app superset with no served field erased; SSRF-allowlist empty-set fallback preserved; tests green; generic; RAW-verify any reconciled served contract (TA indicators) is unchanged after rebuild.
  - depends_on: FACTORY-SHARED-fix-shared-db-stale-list
- **`FACTORY-PDF-extract-tesseract-config`** — Extract shared Tesseract config + DPI constants (5 files)
  - zone `pdf-extractor` · agent **dev-pdf-extractor** · effort M · risk low · rebuild true
  - files: apps/pdf-extractor/infrastructure/ocr_adapter.py, apps/pdf-extractor/infrastructure/ocr_worker.py, apps/pdf-extractor/infrastructure/ocr_backends.py, apps/pdf-extractor/infrastructure/generic_md_table_extractor.py, apps/pdf-extractor/infrastructure/extraction_engine.py
  - approach: The pytesseract call with lang='vie+eng', config='--psm 6' plus its multi-line 'DO NOT remove --psm 6' warning is duplicated across these 5 files (NOT pek_engine_adapter — that uses PaddleOCR; drop it from the list). Create infrastructure/tesseract_config.py exposing TESSERACT_LANG, TESSERACT_PSM6_CONFIG, OCR_RASTER_DPI=200 (+ optional ocr_image_to_string/ocr_image_to_data wrappers carrying the single authoritative warning). Replace the 5 inline call sites; run OCR-path tests after each switch.
  - DoD: Single tesseract_config module; 5 call sites import it; warning comment in one place; OCR-path tests green; tests green; generic; OCR output unchanged verified.
  - depends_on: —
- **`FACTORY-PDF-split-handlers`** — Split pdf handlers.py: schemas, run-helpers, thin routes
  - zone `pdf-extractor` · agent **dev-pdf-extractor** · effort L · risk low · rebuild true
  - files: apps/pdf-extractor/interface/handlers.py
  - approach: After the /inspect deletion, handlers.py still bundles 5 *RequestSchema models (48/118/131/146/167) incl the valid_sections allow-set + validate_section business rule (68-76), three _run_* orchestration helpers (84/185/220), and register_routes (284). Split into interface/schemas.py (the 5 models; move the {balance_sheet,income_statement,cash_flow} allow-set to a domain constant so the interface stops owning that rule), interface/run_helpers.py (or fold _run_* into the relevant usecases), and handlers.py keeping only register_routes with thin closures. Route paths/status codes/request shapes unchanged. Sequence AFTER the /inspect deletion.
  - DoD: Schemas + helpers split out; allow-set moved to a domain constant; each file <=120L; route paths/status/shapes unchanged; tests green; generic; behavior unchanged verified.
  - depends_on: FACTORY-PDF-delete-deprecated-inspect
- **`FACTORY-RAG-confidence-impact-or-00-mask`** — Fix `or 0.0` truthiness mask on confidence/impact_score in rag _dedup_and_trim
  - zone `rag-service` · agent **dev-rag-service** · effort S · risk low · rebuild true
  - files: apps/rag-service/infrastructure/repositories.py
  - approach: At repositories.py:314-315 `float(row.get("confidence") or 0.0)` and same for impact_score collapse a legitimate stored 0.0 into the default. Mirror the existing absent-key-aware _distance handling three lines above: `raw = row.get("confidence"); confidence = float(raw) if raw is not None else 0.0` (and identically for impact_score). Preserves a genuine 0.0. Apply the same is-not-None pattern to the string fields for consistency.
  - DoD: Behavior unchanged when key present and non-zero; a stored 0.0 round-trips as 0.0 distinct from a missing-column row; unit test covers confidence=0.0; tests green; generic; RAW-verify against the named-volume DB after rebuild that a real 0.0-confidence row reads back as 0.0.
  - depends_on: —
- **`FACTORY-RAG-delete-dead-sqlite-repo`** — Delete dead SQLiteAnalysisRepository and phantom AnalysisRepositoryPort
  - zone `rag-service` · agent **dev-rag-service** · effort S · risk low · rebuild false
  - files: apps/rag-service/infrastructure/repositories.py, apps/rag-service/domain/repositories.py
  - approach: SQLiteAnalysisRepository, _row_to_entry, and AnalysisRepositoryPort are referenced only by test_rag_integration.py — never by app_factory.build_real_adapters or any usecase; its schema is also stale (7 cols, missing all 8 Phase-1 metadata cols). Delete the class + _row_to_entry from infrastructure, AnalysisRepositoryPort from domain, and the test that exercises only it. Fix the IndexUseCase docstring that references a non-existent analysis_repo injection point.
  - DoD: Dead class/port/test removed; IndexUseCase docstring corrected; grep confirms no production wiring; tests green; generic; no served-path change.
  - depends_on: —
- **`FACTORY-STOCK-resolve-dead-writeback`** — Resolve dead SaveQuote / Tier-3 write-back: delete the unused writer path
  - zone `stock-price` · agent **dev-stock-price** · effort S · risk med · rebuild false
  - files: apps/stock-price/pkg/infrastructure/fetchers.go, apps/stock-price/pkg/domain/ports.go, apps/stock-price/pkg/domain/_deprecated/services_v1.go
  - approach: SaveQuote (fetchers.go:342) and PriceHistoryPort.SaveQuote (ports.go:12) are called only by the build-ignored _deprecated service; the live Resolve() never writes the cache. Take the DELETE path (behavior-neutral): remove SaveQuote from the repo and the port, drop the now-unused CREATE TABLE market_prices_cache DDL/INSERT, leaving GetHistory as the sole port method. Do NOT take the wire-it path (it adds a new hot-path DB write) without explicit product sign-off.
  - DoD: SaveQuote removed from repo+port; cache DDL/INSERT dropped; no live caller broken (only _deprecated referenced it); go build + tests green; generic; live price-serving path unchanged (no new write side effect introduced).
  - depends_on: —
- **`FACTORY-STOCK-vndirect-mapper-tests`** — Backfill Tier1/Tier2 VnDirect mapper unit tests (guards the dedup)
  - zone `stock-price` · agent **dev-stock-price** · effort M · risk low · rebuild false
  - files: apps/stock-price/pkg/primitive/vndirect-quote-mapper/mapper_test.go
  - approach: The Tier1/Tier2 fetchers (carrying *1000 scaling + floor mapping that produce the served Price) have ZERO test coverage; the suite covers only Tier3/SQLite. Add a pure table-driven mapper_test: STOCK on HOSE/HNX/UPCOM asserts *1000 scale + correct source; INDEX/non-VN floor asserts NO scale; empty data array -> nil quote; malformed JSON -> error; null change/pctChange -> nil pointers not 0. This backfills coverage and makes the extraction behavior-preserving by construction (no live HTTP needed once parsing lives in the primitive).
  - DoD: Mapper test covers scale/source/no-scale/empty/malformed/null cases and is green; coverage now includes the price-producing logic; tests green; generic; guards the extraction task.
  - depends_on: —
- **`FACTORY-TECHANALYSIS-dedup-calculator`** — Dedup sandboxCalculator vs TACalculator via a pkg/module mapper (behavior decision)
  - zone `technical-analysis` · agent **dev-technical-analysis** · effort S · risk low · rebuild true
  - files: apps/technical-analysis/cmd/sandbox/main.go, apps/technical-analysis/pkg/infrastructure/calculator.go
  - approach: sandboxCalculator.Calculate (374-402) duplicates infrastructure.TACalculator.Calculate but OMITS MA5/MA20/MA50 (real drift). Extract the module.Result->domain.TechnicalIndicators mapping into a pure pkg/module ToDomainIndicators (Fence-B allows module->domain; sandbox already imports module, so Fence-C is respected) and have BOTH call it. NOTE: this introduces a NEW module->domain import edge (allowed) and DELIBERATELY changes sandbox output (it will now populate MA5/20/50) — confirm that is the intended oracle behavior and update sandbox expectations. Behavior-preserving for the real service.
  - DoD: Shared ToDomainIndicators mapper; both callers use it; MA5/20/50 drift fixed; module->domain edge confirmed acceptable; sandbox expectations updated for the now-populated MAs; real service output unchanged; tests green; generic.
  - depends_on: FACTORY-TECHANALYSIS-split-sandbox
### P3 — 9 task(s)

- **`FACTORY-APIGW-dedup-default-urls`** — Make StaticServiceRegistry the sole SSOT for default upstream URLs
  - zone `api-gateway` · agent **dev-api-gateway** · effort S · risk low · rebuild true
  - files: apps/api-gateway/cmd/server/main.go, apps/api-gateway/pkg/infrastructure/registry.go
  - approach: main.go:30-42 and registry.go:26-43 enumerate the same 9 default docker URLs (a diff is identical). In main.go, read env vars into the map only for keys actually set (skip empty), then hand that sparse map to NewStaticServiceRegistryWithNotDeployed — the registry's existing get(key,fallback) fills every unset key. Deletes the 10-line literal from main.go; getenv/splitCSV stay local. Identical resolved URLs.
  - DoD: main.go literal removed; registry is the sole default SSOT; resolved URLs identical; tests green; generic; routing behavior unchanged verified.
  - depends_on: —
- **`FACTORY-KINHDICH-add-data-invariant-test`** — Add reading_composer data-integrity invariant test (pins contract pre-extraction)
  - zone `kinh-dich-service` · agent **dev-kinh-dich** · effort S · risk low · rebuild false
  - files: apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go, apps/kinh-dich-service/pkg/module/reading_composer/hexagram_data.go
  - approach: build() silently returns bare queReference{ID:id} when getQueMeta/getQueData is nil and buildPhases returns nil if lines!=6 — failing silently into /explain. The only count guard lives in cmd/sandbox, not the package. Add a package test asserting GetAllQueReferences() len==64; every id 1..64 present exactly once; Name/Chinese non-empty; Phases len==6; UpperElement/LowerElement resolve; queDataMap and queMetaList each have exactly 64 keys. Test-only, zero production change — pins the data contract so the prose extraction is provably lossless.
  - DoD: Invariant test added and green against current data; no production code changed; tests green; generic; contract pinned ahead of the extraction.
  - depends_on: —
- **`FACTORY-APP-console-to-logger`** — Replace console.* with the project logger in 5 application files
  - zone `mcp-server-application` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/mcp-server/src/application/usecases/discoverBctcPdfUrlDirectApi.ts, apps/mcp-server/src/application/usecases/parseBctcReport.ts, apps/mcp-server/src/application/usecases/backfillBctcPdfPaths.ts, apps/mcp-server/src/application/services/imfDataFetcher.ts, apps/mcp-server/src/application/usecases/bctcBatchTableBackfillJob.ts
  - approach: Swap console.error/log/warn for the existing structured logger in these 5 files (discoverBctcPdfUrlDirectApi x3, parseBctcReport x1, backfillBctcPdfPaths x5, imfDataFetcher x1, bctcBatchTableBackfillJob x9). Mechanical. Do NOT attempt the RSI/MA consolidation half of that finding here — domain/services/technicalIndicators.ts is already deleted, so 'import the domain versions' would break the build; decide ONE home for computeMALocal/computeRSILocal in a separate task first.
  - DoD: All console.* replaced with logger; RSI/MA consolidation explicitly out of scope; tests green; generic; behavior unchanged (output now structured).
  - depends_on: —
- **`FACTORY-DOMAIN-extract-sla-config`** — Move DEFAULT_SLA_CONFIG out of freshnessSlaChecker into shared-config
  - zone `mcp-server-domain` · agent **dev-mcp-server** · effort M · risk low · rebuild true
  - files: apps/mcp-server/src/domain/services/freshnessSlaChecker.ts
  - approach: freshnessSlaChecker.ts (718L) embeds DEFAULT_SLA_CONFIG (per-signal threshold table) with the breach-classification algorithm. Move the SignalType union + SignalSlaConfig + DEFAULT_SLA_CONFIG into packages/shared-config/slaConfig.ts (or freshness/config.ts) with a size-justification header; keep checkFreshnessSla importing it and accepting it as the default injectable parameter (header already says it accepts thresholds as params — finish the inversion). Must keep DEFAULT_SLA_CONFIG as the effective default when no override injected.
  - DoD: Config relocated; default unchanged at call sites; logic file <=120L or justified; SLA tests green; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-INFRA-delete-deprecated-rag-kinhdich`** — Delete _deprecated rag/kinhDich infra code and remove the barrel re-exports
  - zone `mcp-server-infra` · agent **dev-mcp-server** · effort M · risk low · rebuild false
  - files: apps/mcp-server/src/infrastructure/rag/_deprecated/vectorstore.ts, apps/mcp-server/src/infrastructure/rag/_deprecated/retriever.ts, apps/mcp-server/src/infrastructure/rag/_deprecated/embeddings.ts, apps/mcp-server/src/infrastructure/_deprecated/kinhDichWrapper.ts, apps/mcp-server/src/infrastructure/rag/index.ts
  - approach: No production code imports these (LanceDB moved to rag-service:5002, kinhDich to kinh-dich-service:5005). BUT rag/index.ts:23-46 actively re-exports the three _deprecated modules and ~6 tests import them. Remove the barrel re-exports first, re-point or delete the test anchors (011/012/013-rag-*, 135-rag-temporal-decay, 1077-kinh-dich-wrapper, security-sql-injection, 1081-smoke), then delete the four files and now-empty dirs.
  - DoD: Barrel re-exports removed; test anchors re-pointed or deleted; grep confirms zero remaining importers; tests green; generic; no runtime change to live paths.
  - depends_on: —
- **`FACTORY-SCHEDULER-split-bctcReparseJob`** — Name PDF-quality magic numbers + extract processStrandedFeedback in bctcReparseJob
  - zone `mcp-server-scheduler` · agent **dev-mcp-server** · effort S · risk low · rebuild true
  - files: apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts
  - approach: Scope is narrow (the finding's main premise was overstated — reparseSingleWithOcrFallback:265 is already DI'd and pure). Real residual work: name the inline quality gates MIN_PDF_TEXT_CHARS (the <100-char gate at 353) and MIN_PDF_CONFIDENCE (the 0.3 gate at 378); extract the agent_feedback escalation loop into a processStrandedFeedback helper. Oversize itself is covered by the zone-wide cap task. Constants + helper extraction are behavior-preserving.
  - DoD: Quality gates named; feedback loop extracted; resolved thresholds unchanged; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-STOCK-delete-dead-port-and-deprecated`** — Delete dead PriceFetcherPort interface and the _deprecated services_v1 archive
  - zone `stock-price` · agent **dev-stock-price** · effort S · risk low · rebuild false
  - files: apps/stock-price/pkg/domain/ports.go, apps/stock-price/pkg/domain/_deprecated/services_v1.go, apps/stock-price/pkg/domain/_deprecated/services_v1_test.go
  - approach: domain.PriceFetcherPort (ports.go:4-7) is superseded by price_resolution.TierFetcher and referenced only by build-ignored code. Delete the interface, then delete the entire pkg/domain/_deprecated/ directory (both files). Update the dangling line-cite in selector.go:8 ('Extracted from domain/services.go L53-65') to a non-line-pinned reference. Sequence after the SaveQuote decision so port edits do not collide.
  - DoD: PriceFetcherPort and _deprecated/ deleted; selector.go comment de-line-cited; grep confirms no live reference; go build + tests green; generic; no runtime change.
  - depends_on: FACTORY-STOCK-resolve-dead-writeback
- **`FACTORY-STOCK-dedup-history-handlers`** — Dedup priceHistory handlers + name the days=30 default
  - zone `stock-price` · agent **dev-stock-price** · effort S · risk low · rebuild true
  - files: apps/stock-price/pkg/interface/http/router.go
  - approach: priceHistory (89-114) and priceHistoryPathParam (118-145) are ~90% identical with a `days:=30` literal repeated (97,129) and the same Atoi/validation/usecase/error block. Extract `const defaultHistoryDays = 30` and a parseDays(r) helper (or a shared runHistory closure) both handlers call after resolving the code from their source. Keep both routes for back-compat; only the body is shared.
  - DoD: defaultHistoryDays named; shared parseDays/runHistory; both routes still registered; resolved behavior identical; tests green; generic; behavior unchanged verified.
  - depends_on: —
- **`FACTORY-TECHANALYSIS-fix-discarded-service-and-port`** — Remove discarded domain service wiring + inject real port into /health
  - zone `technical-analysis` · agent **dev-technical-analysis** · effort S · risk low · rebuild true
  - files: apps/technical-analysis/cmd/server/main.go, apps/technical-analysis/pkg/interface/http/router.go
  - approach: cmd/server/main.go:38 builds domain.NewCalculateTAService and discards it (`_ = ...`); port 5003 is hardcoded in the /health JSON string (router.go:34) and will lie if PORT is env-overridden. Delete the unused domain service wiring (and the stub type if no caller), thread the resolved port into NewRouter(uc, port) and build the health body via a struct + json.Marshal from the real port. Mechanical, behavior-preserving for the default port.
  - DoD: Discarded service wiring removed; /health reflects the actual bound port; NewRouter signature updated with single caller fixed; tests green; generic; normal-operation behavior unchanged.
  - depends_on: —

## Suggested Sprint Sequence

> Advisory only — PO is the single board writer and re-sequences against WIP≤2 and the live BCTC P0 sprint.

- **Wave 13:** Cosmetic/low-priority cleanups, P3 dedups, logging fixes, dead-wire removals, and finally the monorepo-wide size-justification header sweep (last, because it depends on the size-lint CI guard existing and on all the per-file splits having landed so the same file is never split twice). Lowest leverage, lowest risk, run after everything correctness- and reviewability-critical is done.
  - tasks: FACTORY-APP-console-to-logger, FACTORY-SCHEDULER-dedup-briefing-formatters, FACTORY-SCHEDULER-split-bctcReparseJob, FACTORY-STOCK-resolve-dead-writeback, FACTORY-STOCK-delete-dead-port-and-deprecated, FACTORY-STOCK-dedup-history-handlers, FACTORY-APIGW-dedup-default-urls, FACTORY-APIGW-proxy-timeout-constant-TAIL, FACTORY-ALERT-shared-vocab-package, FACTORY-ALERT-router-cleanups, FACTORY-NEWS-fix-source-logging, FACTORY-NEWS-dedup-handlers-maxitems, FACTORY-NEWS-go-server-tier-split, FACTORY-PDF-extract-tesseract-config, FACTORY-PDF-split-handlers, FACTORY-TECHANALYSIS-fix-discarded-service-and-port, FACTORY-KINHDICH-add-data-invariant-test-TAIL, FACTORY-XZONE-size-justification-sweep
