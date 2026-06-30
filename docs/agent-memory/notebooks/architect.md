# Architect — Notebook

**Last updated:** 2026-06-30 20:45 UTC | **Sprint:** OHLCV-UNIT-CONTAM-WHOLEROW-LT1000

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-30T20:45Z — OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 (DESIGN DONE)

**Task:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM | BUG-FIX | zone: apps/mcp-server/ + scripts/migrations/
**BUILD-STANDARD:** not-applicable (bug-fix, no new microservice)
**Root cause confirmed:** CONTAM-6 predicate `(open<100 OR low<100) AND close>=1000` misses whole-row class where ALL fields < 1000. `normalizeOhlcvToVnd` only fires at max(OHLC)<100; `detectAndNormalizeScaleFromPrevClose` blind when entire series contaminated (prevClose also dirty → ratio≈1).
**A (repair migration):** per-ticker anchor (most recent clean bar close>=1000 in last 180d). Candidate: `anchor/row.close >= 100 AND row.close < 1000 AND close > 0`. Exclude INDEX_TICKERS. Dry-run + human-confirm + BEGIN IMMEDIATE txn. New file: `scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts`.
**B (reflow):** NONE needed. RS/ROC/52w = computed-on-read by Go TA microservice (source_tier=3 confirmed in tool code + schema has zero materialized RS cols). Post-repair gateway probe only.
**C.1 (writer guard):** Add `fetchCleanReferenceCloseMap` (full-history `close>=1000` batched query) in `ohlcvWriteService.ts`. Use as `effectivePrevClose` when standard prevClose < 1000. Domain function `normalizeOhlcvToVnd` unchanged (stays pure). C.2: Pass 4 in `ohlcvSanityCheckJob.ts` — per-ticker anchor divergence scan flagging whole-row close<1000 class; index tickers excluded; joins existing hits[]/BUG Telegram path.
**PM decomposition:** 4 tasks: CONTAM-10-MIGRATION / CONTAM-10-WRITER / CONTAM-10-SANITY (parallel) + CONTAM-10-EXEC (sequential: blocks on MIGRATION QA-PASS).
**Key risk:** RISK-1 [HIGH] anchor picks contaminated bar if recent 180d window entirely contaminated — mitigated by dry-run per-ticker report showing anchor_close values for human review.
**Output:** `docs/architecture-briefs/2026-06-30-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000.md` + `docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md`

## 2026-06-30T19:11Z — FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS (DESIGN DONE)

**Task:** FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS | BUG-FIX (RC3) | zone: multi (vps-scripts + mcp-server)
**BUILD-STANDARD:** lean (brownfield, no new service)
**Root cause confirmed:** `vps-scripts/fetch-ohlcv-backfill.sh:134-139` — explicit VNINDEX skip guard with "SUBTASK-B: add dedicated index fetch" placeholder. VnDirect stock_prices has no index data; dedicated endpoint is `vnmarket_prices` (already used by `vnIndexRefreshJob.ts`).
**No TA svc changes needed:** TA svc code is architecturally correct — `ComputeRelativeStrengthUseCase` prepends VNINDEX, `SQLiteMultiTickerOHLCVRepository` handles VNINDEX identically to stocks. Only data depth is missing.
**3 FRs:** FR-A1: VPS script — add dedicated vnmarket_prices VNINDEX fetch block (size=750, no ×1000 normalization); FR-A2: Remove old skip guard; FR-B1: push handler — read type field from payload, pass to validateOhlcvUnit; FR-B2: ohlcv-backfill-done — extend depth probe to include VNINDEX.
**Critical risk:** RISK-1 [HIGH] — vnmarket_prices fromDate/toDate support unverified from VPS; dev must RAW-probe before implementing. RISK-2 [HIGH] — VPS deploy required (not just commit). RISK-6 [LOW] — retry_count >= 5 cap may suppress re-queue on live ohlcv_backfill_queue.
**Output:** `[Architect] Brownfield Findings` → `docs/handoffs/FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS.md`
**Next:** pm splits into TASK-VNINDEX-RS-A (developer, vps-scripts) + TASK-VNINDEX-RS-B (dev-mcp-server).

## 2026-06-30T05:30Z — BA-IND-P1-MOMENTUM-FRONTEND (DESIGN DONE)

**Task:** BA-IND-P1-MOMENTUM-FRONTEND | NEW-FEATURE (lean) | zone: multi (mcp-server + frontend)
**BUILD-STANDARD:** lean (both zones brownfield — mcp-server and frontend exist)
**4 ARCH-RATIFY resolved:** M1: GaugeCard → Option B (extract to ~/components/GaugeCard.tsx; extend with optional `expandContent?: ReactNode` for P1 expand dropdown; P0 page updated to import from new location). M2: formatRSComposite → Option A (co-located in dashboard.momentum.tsx, exported; mirrors P0 formatZScore pattern). M3: source_tier = 3 endpoint-assigned for all 4 sections (no source_tier field in any of 4 client responses; compute-on-read from SQLite). M4: low_sample_warning → detail row when true (transparent, no badge clutter).
**Critical divergence from P0:** P1 handler takes NO `db: Database` param — all 4 sources are remote HTTP via clients.ts (TA service + stock-price service). Server.ts registration: `await handleGetMomentumIndicators(req, res)` (no db).
**Zone A (apps/mcp-server):** 1 new handler file (~180L) + server.ts import+route (~10L change) + 1 test file (7 suites). Standalone, no dependency.
**Zone B (apps/frontend):** GaugeCard extract (1 new + 1 modified file) + api.momentum-indicators.tsx + dashboard.momentum.tsx + TopNav +1 entry + coverage-map +4 GAP rows + 2 test files. RISK: GaugeCard extraction modifies working P0 production file — must commit atomically.
**4 risk flags:** RISK-M1-GAUGECARD-EXTRACT [MEDIUM]; RISK-M2-NO-DB-IN-HANDLER [LOW]; RISK-M3-REGIME-COLOR-CLASSES-MOVE [LOW]; RISK-M4-SERVER-TS-IMPORT-BLOCK [LOW].
**Output:** [Architect] Brownfield Findings → docs/handoffs/BA-IND-P1-MOMENTUM-FRONTEND.md
**Next:** pm decomposes into 2 tasks: TASK-MOMENTUM-A (dev-mcp-server) + TASK-MOMENTUM-B (dev-frontend).

## 2026-06-30T02:00Z — BA-IND-P1-MOMENTUM-RS (DESIGN DONE)

**Task:** BA-IND-P1-MOMENTUM-RS | NEW-FEATURE (lean) | zone: multi (technical-analysis + stock-price)
**BUILD-STANDARD:** lean (both zones brownfield Go services)
**Critical brownfield discoveries:** (1) apps/technical-analysis is Go NOT TypeScript — active code is pkg/ + cmd/; src/ is DEAD. (2) vnstock_trading_stats has NO foreign_buy_vol/foreign_sell_vol — correct source is daily_ohlcv. (3) foreign_room_events event_type is ROOM_FULL/ROOM_REOPEN (NOT ROOM_LOCKED/FULL_ROOM_SELL as BA stated).
**5 ARCH-RATIFY resolved:** RS-1: VNINDEX code in daily_ohlcv confirmed "VNINDEX"; ROC-1: compute-on-read; FAR-1+FAR-2: daily_ohlcv source + shares ADTV unit; 52W: denominator_ma200 in aggregate.
**Zone 1 (apps/technical-analysis Go):** 3 tools via 3 new domain/service files + shared SQLiteMultiTickerOHLCVRepository (IN-clause batch read) + 3 handlers + router extension + 3 MCP tool proxies.
**Zone 2 (apps/stock-price Go):** 1 tool via ForeignFlowRepository (reads daily_ohlcv) + RoomEventRepository (reads foreign_room_events) + domain service + 1 handler + 1 MCP proxy.
**9 risk flags:** RISK-1+2 HIGH (data-source mismatch + event-type correction); RISK-3 HIGH (TS dead code); RISK-4-6 MEDIUM; RISK-7-9 LOW.
**Feed-forward scalars:** momentum_factor_z, market_rs_composite, net_new_highs, foreign_accum_z_market (P1 Fear-Greed hooks).
**Output:** [Architect] Brownfield Findings → docs/handoffs/BA-IND-P1-MOMENTUM-RS.md
**Next:** pm decomposes into 2 per-zone task groups (dev-technical-analysis: 3 tools; dev-stock-price: 1 tool) + MCP proxy layer.

## 2026-06-29T21:15Z — MARKET-INDICATOR-DEPTH-P0 (DESIGN DONE)

**Task:** ARCH-MARKET-INDICATOR-DEPTH-P0 | NEW-FEATURE (lean) | zone: multi (mcp-server + technical-analysis + macro-indicators + stock-price)
**BUILD-STANDARD:** lean (all 4 zones brownfield)
**Key brownfield discovery:** macro-indicators is Go (not TypeScript as architecture doc states). Active code is in `pkg/` + `cmd/`. `src/_deprecated/` is dead. Risk-HIGH for dev working in wrong folder — PM must call this out explicitly.
**3 ratifications:** (1) OMO-1 → Option A: sbv_omo_daily in dedicated macro_indicators.db (new env MACRO_DB_PATH); (2) INS-1 → accept market_cap_bn proxy, normalization_basis field mandatory; (3) B4 cron → 37 8 * * 1-5 (free slot, Lever C +7 offset from :30).
**Design decisions:** P0-2 event detection relocated from dev-stock-price to mcp-server's vnstockFundamentalsJob (single-writer rule); get_omo_curve deferred to P1 (extend get_vn_liquidity_state for P0 only); OMO persistence = write-on-fetch side effect in LiquidityStateUseCase.
**5 new tools** (toolCount must be re-derived): get_volatility_indicators, get_foreign_room, get_market_sentiment_index, get_insider_sentiment, get_breadth_thrust. Plus extending get_vn_liquidity_state (no new tool).
**Risk flags:** RISK-MACRO-LANG-CONFUSION [HIGH], RISK-SPRINT0-WRITEPATH [HIGH], RISK-P0-4-COVERING-INDEX [MEDIUM], RISK-OMO-DUAL-DB-LIFECYCLE [MEDIUM].
**Output:** `[Architect] Brownfield Findings` → `docs/handoffs/BA-MARKET-INDICATOR-DEPTH-P0.md`
**Next:** pm atomizes into 7 tasks: Sprint-0 + P0-1 + P0-2 + P0-3 + P0-4 + P0-5 + Breadth (all parallel-dispatchable at kickoff).

## 2026-06-29T19:12Z — HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING (DESIGN DONE)

**Task:** HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING | MAINTENANCE (not-applicable) | zone: cross-service/
**ROOT:** Two gaps closed: (A) membership — 12 active writers unregistered in AC-6 (pm 283L ACTIVE, fixer/tran-ngoc-bau 185L, code-janitor 165L, ba 164L, agent-father 147L, alert-commander 142L, architect 93L, qa-responder/cowork-refactory-expert/market-analyst/idea-forge); (B) enforcement — AC-5 advisory prose does not block breaches even for registered agents (dev-pdf-extractor 203L, qa+cmh each needed point-patch despite being registered).
**Design — 4 parts:** (1) Audit: 25+2 existing + 12 new APPEND = 37 total APPEND; 2 OVERWRITE unchanged. (2) SSOT batch-register: SKILL.md AC-6 APPEND row + file-size-caps.json note in ONE commit. (3) Headless hook `scripts/agents-flow/notebook-auto-prune.sh`: PostToolUse Write|Edit on notebooks/*.md, parses ## sections, drops oldest until ≤200L; safe-fail if no ## sections found or only preamble+1 section remains — emits signal, never blind-truncates. Hook BACKSTOPS AC-3 (primary remains compose-in-memory before write). (4) Fence `scripts/audits/notebook-class-fence.sh`: scans flows for notebook-write/cowork-end-cycle, cross-checks SKILL.md APPEND+OVERWRITE vs caps.json note (SSOT parity), FENCE-C checks hook wired in settings; --self-test injects "test-ghost-agent" to verify fence is live.
**Key decisions:** Hook backstops (not replaces) AC-3 — if AC-3 correct, hook exits 0 instantly (no overhead). No separate prune tasks for pm.md 283L: hook auto-corrects on next pm write. Bash hook for consistency with all existing hooks. settings.local.json: new hook entry added BEFORE context-bloat-backstop entry.
**Output:** `docs/architecture-briefs/2026-06-29-harden-notebook-write-gate-ac5.md` + `docs/handoffs/HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING.md`
**Next:** agent-father implements Tasks A (SSOT) + B (hook script) + C (fence script) + D (settings wire).

## 2026-06-29T16:21Z — FEAT-NEWS-DECISION-RESUME (DESIGN DONE)

**Task:** ARCH-FEAT-NEWS-DECISION-RESUME | NEW-FEATURE (lean) | zone: `apps/mcp-server/` + `apps/frontend/` (multi)
**BUILD-STANDARD:** lean (brownfield — both services exist; no new microservice)
**5 FRs resolved across 2 hops:**
- FR-1 (domain): `buildDecisionResume()` pure helper added to newsNormalizer.ts (~L820 helpers section). Inputs: `sentiment`, `level`, `affectedActions`, `affectedDomains`, `bullishMatched`, `bearishMatched` — all in scope at normalizeNews() return site (L958). `DOMAIN_VN_LABEL` const map (17 entries, `Partial<Record<string, string>>`) co-located. Neutral→null; hard-cap 120 via `truncateAt120()` helper.
- FR-2 (infra): schema-news.ts ADD COLUMN pattern: `try { db.exec("ALTER TABLE rag_analyses ADD COLUMN decision_resume TEXT"); } catch {}` after existing `body_text` block (~L65). No UNIQUE. analysis.ts INSERT grows 19→20 params.
- FR-3 (interface): newsSentimentHandler.ts — `RagAnalysisRow` + `NewsSentimentItem` + SELECT + mapper + header comment updated. No new imports.
- FR-4 (interface): dashboard.news.tsx `Sentiment` type `positive/negative` → `bullish/bearish`; `SentimentPill` remap.
- FR-5 (interface): dashboard.news.tsx `NewsCard` résumé strip before title row; `impact_summary` wrapped in Radix `Collapsible` (default collapsed, "Xem thêm"/"Thu gọn").
**Key risks:** RISK-3 (MEDIUM — TASK-17 test `insertRow()` must be extended with optional `decision_resume` param). RISK-4 (LOW — truncation off-by-one; test exactly-120 + 121+ cases).
**Output:** `[Architect] Brownfield Findings` → `docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md`
**Next:** pm atomizes into TASK-FEAT-NEWS-DR-HOP1 (dev-mcp-server) + TASK-FEAT-NEWS-DR-HOP2 (dev-frontend, blocks_on HOP1).

## 2026-06-28T07:30Z — FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT (DESIGN DONE)

**Task:** ARCH-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT | BUG-FIX (P1, SPRINT-M) | zone: `apps/pdf-extractor/`
**BUILD-STANDARD:** not-applicable (bug-fix/refactor)
**7 FRs:** FR-1 `_CODE_VALUE_COL_RE` narrowed `\d{3}`; FR-2 label-clean post-parse; FR-3 `_ROMAN_OCR_NORMALIZE` dict (8 entries); FR-4 `_detect_section_start` + `_filter_pages_to_section` (generalized); FR-5 `_dedup_rows_within_section` first-wins; FR-6 vn_number_normalize ALREADY correct — UPSTREAM poppler-artifact space handler in `_parse_value`; FR-7 `_is_notes_section_boundary` flag.
**Key risks:** RISK-1 HIGH (FR-6 trace-first mandatory). RISK-4 MEDIUM (FR-4 keywords may over-filter, scope to first 30 lines).
**Output:** `[Architect] Brownfield Findings` → `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md`
**Sequencing:** FR-3 → FR-1 → FR-2 → FR-7 → FR-5 → FR-4 → FR-6 (trace-first).

---

## Archive (pre-2026-06-28)

[Older cycles archived: FRONTEND-FRESHNESS-TRANSPARENCY, BCTC-REFINE-STALL-RETRIGGER, SSOT-INTEGRITY-PERIMETER, ORCH-STATE-SCHEMA-HARDENING + 27 earlier cycles.]
