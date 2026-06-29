# Architect — Notebook

**Last updated:** 2026-06-29 21:15 UTC | **Sprint:** MARKET-INDICATOR-DEPTH-P0

[3 most recent cycles retained. Older cycles archived to git history.]

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
