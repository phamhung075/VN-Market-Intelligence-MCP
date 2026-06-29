---
sprint: FEAT-NEWS-DECISION-RESUME
branch: task/FEAT-NEWS-DR-HOP1-backend-builder
size: M
zone: apps/mcp-server/
depends_on: []
blocks: TASK-FEAT-NEWS-DR-HOP2
---

## TLDR

Build the decision-résumé backend: extend AnalysisEntry with a new `decision_resume` field (line 1-4 Vietnamese verdict), persist to DB via ADD COLUMN + INSERT, and expose via `/api/news-sentiment` DTO. No frontend changes in this task.

## [PM] Planning Context

**Zone:** `apps/mcp-server/` (backend microservice layer)

**Feature context:**
- PO requests: plain-Vietnamese one-liner "vì sao tốt/xấu" skim-first card summary on `/dashboard/news`
- Live bug confirmed: DB sentiment is `bullish/bearish/neutral` but frontend `SentimentPill` only maps `positive/negative` → all bullish/bearish render grey
- Architect design: split into Hop 1 (backend builder + DB + DTO) and Hop 2 (frontend pill fix + card layout)
- This Hop: FR-1 (builder) + FR-2 (DB column + INSERT) + FR-3 (DTO)

**Acceptance Criteria:**

- [ ] `AnalysisEntry` interface extends with `decision_resume: string | null` (line L67 newsNormalizer.ts)
- [ ] `buildDecisionResume()` pure helper implemented (deterministic string templating):
  - Inputs: `sentiment`, `level`, `affectedActions`, `affectedDomains`, `bullishMatched`, `bearishMatched`
  - Algorithm: sentiment→prefix (Tích cực/Tiêu cực/null), keywords pick first 2, context suffix (tickers or domain), hard-cap 120 chars
  - Concrete test cases (all from FR-1 spec):
    - bullish + action + tickers `[VCB, FPT]` + keywords → `"Tích cực cho VCB, FPT: tăng trưởng, lợi nhuận"`
    - bearish + domain `[banking]` + keywords → `"Tiêu cực ngành ngân hàng: nợ xấu, lãi suất"`
    - bullish + country level + no domain + keywords → `"Tích cực: vn-index, tăng"`
    - bearish + empty keywords (defensive) → `"Tiêu cực: tín hiệu tổng hợp"`
    - neutral → `null` (no résumé)
- [ ] `buildDecisionResume()` integrated into `normalizeNews()` at ~L950 (after reasoning, before return); result added to return object
- [ ] `DOMAIN_VN_LABEL` const map added (17 domain translations: dầu khí, ngân hàng, bất động sản, ... thép, hàng không, ... năng lượng tái tạo)
- [ ] `truncateAt120()` helper implements hard-cap at 120 chars (last-space-before-limit, never mid-word)
- [ ] DB schema: `ALTER TABLE rag_analyses ADD COLUMN decision_resume TEXT` (idempotent try/catch, placed after `body_text` block at L65 schema-news.ts)
- [ ] INSERT at analysis.ts L264-295: `decision_resume` added to column list + `.run(...)` params (19→20 params total)
- [ ] DTO pick-up in newsSentimentHandler.ts:
  - `RagAnalysisRow` interface: add `decision_resume: string | null` (~L87)
  - SELECT query: add `decision_resume` to column list (~L163-172)
  - `NewsSentimentItem` interface: add `decision_resume: string | null` (~L101)
  - Mapper: pass through `decision_resume: row.decision_resume ?? null` (~L202)
  - Header comment fix: `"bullish" | "bearish" | "neutral"` (was aspirational `"positive" | "negative"`)
- [ ] Tests:
  - Create `FEAT-NEWS-DR-builder.test.ts` with 10 test cases: 5 concrete FR-1 examples + 5 edge cases (neutral→null, empty keywords, >3 tickers cap, unknown domain, >120 truncation)
  - Extend `TASK-17-news-sentiment-endpoint.test.ts`: update `insertRow()` helper with optional `decision_resume` param; add AC-NEW-1 (non-null passthrough) + AC-NEW-2 (null passthrough)
- [ ] Deliverable gate (RAW verification):
  ```bash
  curl -s http://localhost:3000/api/news-sentiment | \
    jq '[.items[] | select(.sentiment == "bullish" or .sentiment == "bearish")] | first | {sentiment, decision_resume}'
  ```
  Expected: `{ "sentiment": "bullish"|"bearish", "decision_resume": "<VN string ≤120 chars>" }` (non-null for new rows only; legacy rows may still be null).

**Files to read first:**
- `apps/mcp-server/src/domain/services/newsNormalizer.ts` (L34-67 AnalysisEntry interface, L833-950 normalizeNews, L872-873 bullishMatched/bearishMatched scope)
- `apps/mcp-server/src/infrastructure/db/schema-news.ts` (L57 data_env ADD COLUMN pattern, L64 body_text, target insert after L64)
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` (L261 normalizeNews call, L264-270 INSERT prepared stmt, L275-295 .run params)
- `apps/mcp-server/src/interface/mcp/routes/newsSentimentHandler.ts` (L37-44 header comment, L74-87 RagAnalysisRow, L90-102 NewsSentimentItem, L163-172 SELECT, L174-203 mapper)
- `apps/mcp-server/src/__tests__/TASK-17-news-sentiment-endpoint.test.ts` (L72-80 insertRow helper, test structure)

**Files to create:**
- `apps/mcp-server/src/__tests__/FEAT-NEWS-DR-builder.test.ts` — unit tests for `buildDecisionResume()` builder function (10 cases)

**Files to modify:**
- `apps/mcp-server/src/domain/services/newsNormalizer.ts` — AnalysisEntry interface + buildDecisionResume() + DOMAIN_VN_LABEL + truncateAt120()
- `apps/mcp-server/src/infrastructure/db/schema-news.ts` — ADD COLUMN decision_resume
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` — INSERT decision_resume
- `apps/mcp-server/src/interface/mcp/routes/newsSentimentHandler.ts` — DTO structs + SELECT + mapper + comment fix
- `apps/mcp-server/src/__tests__/TASK-17-news-sentiment-endpoint.test.ts` — extend insertRow() helper + add AC-NEW-1/2

**Dependencies:**
- None (Hop 1 is runnable immediately; Hop 2 blocks on this task + ops rebuild)

**Knowledge needed:**
- `docs/policies/dev-standards.md` — task decomposition, commit convention
- `docs/ARCHITECTURE.md` — 4-layer DDD (domain/infrastructure/interface/presentation)
- `docs/agents/tools/package/dev-mcp-server.md` — developer tools (optional, for reference)
- BA spec (authoritative) → `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md` (FR-1 to FR-3 sections)

**Non-functional requirements (from BA spec):**
- NFR-1 Language boundary: plain Vietnamese only, no English domain names (use DOMAIN_VN_LABEL), no jargon
- NFR-2 Length budget: ≤120 chars (enforced in truncateAt120)
- NFR-3 No fake data: derived solely from real classifier signals in normalizeNews(), no LLM, no invention
- NFR-4 Backfill policy: legacy rows (pre-deploy) receive NO recompute; NULL → frontend graceful omit
- NFR-5 Rebuild required: mcp-server container rebuild after this task completes (ops lane, before Hop 2 starts)

**Edge cases to handle:**
- `sentiment === "neutral"` → `decision_resume = null`
- `bullishMatched` or `bearishMatched` empty → defensive `"tín hiệu tổng hợp"` phrase
- `affectedActions.length > 3` → cap at 3 tickers in résumé
- Unknown `DomainType` in `affectedDomains` → omit domain segment (no crash)
- Résumé > 120 chars → hard-truncate at last space ≤ limit
- Legacy rows `decision_resume = NULL` → RISK-5: frontend must guard with `item.decision_resume != null && item.decision_resume.length > 0`

**Design notes (from Architect):**
- D1: `buildDecisionResume()` = pure helper, co-located in newsNormalizer.ts (~L820), closure access to bullishMatched/bearishMatched is safe
- D2: `DOMAIN_VN_LABEL` = `Partial<Record<string, string>>` (not typed as full Record) to enable safe fallback `?? null`
- D3: Truncation follows existing `truncateNewsSummary` pattern in textUtils.ts (adjacent file)
- D4: INSERT param count 19→20; dev adds entry.decision_resume as 20th param from AnalysisEntry returned by normalizeNews()
- D5: No separate writer to pollNews; analysis.ts is the only INSERT path
- D6: Frontend parseNewsSentimentDto is passthrough cast; no change needed there

**Risk flags (RISK-1 to RISK-5 from Architect):**
- RISK-1 (LOW): buildDecisionResume() closure access is safe (same file)
- RISK-2 (LOW): INSERT OR IGNORE deduplication on source_url UNIQUE is correct
- RISK-3 (MEDIUM): TASK-17 helper insertRow() currently 12 columns, NO decision_resume; dev MUST extend with optional `decision_resume?: string | null` param or new ACs will miss non-null case
- RISK-4 (LOW): Truncation edge case — test 120-char and 121+ cases
- RISK-5 (LOW): Legacy NULL rows — frontend must guard after deploy

**Blockers for PO:**
- None. Feature fully scoped.

**Definition of Done (for QA):**
1. `GET /api/news-sentiment` response contains `decision_resume: string | null` per item
2. For live bullish/bearish row: `decision_resume` is non-null, plain Vietnamese, ≤120 chars
3. For neutral row: `decision_resume` is null
4. All 10 builder test cases (FEAT-NEWS-DR-builder.test.ts) pass
5. TASK-17 tests extend with AC-NEW-1 and AC-NEW-2, all pass
6. No English text in decision_resume values (language-boundary check)
7. Deliverable gate curl command returns non-null decision_resume for new rows
