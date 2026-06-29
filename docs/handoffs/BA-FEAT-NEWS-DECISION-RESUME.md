# BA Spec — FEAT-NEWS-DECISION-RESUME

**BA task ID:** BA-FEAT-NEWS-DECISION-RESUME
**Sprint task:** FEAT-NEWS-DECISION-RESUME
**Created:** 2026-06-29T16:09:19Z
**BA:** ba
**Zone:** multi (apps/mcp-server + apps/frontend)
**Next:** architect → split two dev hops (dev-mcp-server → dev-frontend)

---

## Context Summary

Feature: surface a plain-Vietnamese one-line "vì sao tốt/xấu" decision résumé skim-first at the
top of each card on `/dashboard/news` (`apps/frontend/app/routes/dashboard.news.tsx`).

PO ground-truth (re-verified during BA analysis):

- `/api/news-sentiment` DTO already has: `sentiment`, `sentiment_score`, `impact_direction`,
  `confidence`, `affected_tickers`, `affected_sectors`, `impact_summary`.
- `impact_summary` = raw HTML article excerpt (title + content truncated) — NOT a reason. Unusable as résumé.
- `rag_analyses.reasoning` = English machine trace, e.g. `"Source: nhandan. Level: country.
  Country keywords matched: vn-index. Domains detected: securities."` — jargon + wrong language.
  NOT surfaceable directly.
- **Live bug confirmed:** DB `sentiment` values are `bullish/bearish/neutral` (produced by
  `detectSentiment()` in `newsNormalizer.ts`). Frontend `SentimentPill` only maps
  `positive/negative` → all bullish/bearish cards render grey "Trung lập".
- Rationale MUST be produced by the classifier (real signals), NEVER fabricated frontend-side.

---

## Requirements

### FR-1: Decision résumé builder in newsNormalizer.ts
**DDD layer:** domain/services
**File:** `apps/mcp-server/src/domain/services/newsNormalizer.ts`

A new field `decision_resume: string | null` must be produced inside `normalizeNews()` after the
existing reasoning computation (~L930-950).

**Inputs (real, already computed in normalizeNews):**
| Input | Variable | Type |
|---|---|---|
| Sentiment verdict | `sentiment` | `"bullish" \| "bearish" \| "neutral"` |
| Analysis level | `level` | `"global" \| "country" \| "domain" \| "action"` |
| Affected stock tickers | `affectedActions` | `string[]` |
| Affected sectors | `affectedDomains` | `DomainType[]` |
| Bullish matched keywords | `bullishMatched` | `string[]` |
| Bearish matched keywords | `bearishMatched` | `string[]` |

**Algorithm (deterministic string templating — NO LLM, NO external call):**

1. If `sentiment === "neutral"` → `decision_resume = null` (no verdict to surface, no résumé shown).

2. Determine prefix:
   - `bullish` → `"Tích cực"`
   - `bearish` → `"Tiêu cực"`

3. Determine signal keywords (pick first 2 from the relevant matched list):
   - `bullish` → take first 2 from `bullishMatched`; if empty → empty list
   - `bearish` → take first 2 from `bearishMatched`; if empty → empty list

4. Determine context suffix (in priority order):
   - If `level === "action"` AND `affectedActions.length > 0`:
     `" cho ${affectedActions.slice(0, 3).join(', ')}"` (cap at 3 tickers)
   - Else if `affectedDomains.length > 0`:
     `" ngành ${affectedDomains.slice(0, 2).map(translateDomain).join(', ')}"` (see FR-1 Note A)
   - Else: no context suffix (country/global with no specific domain)

5. Compose résumé:
   - If keywords list non-empty: `"${prefix}${context}: ${keywords.join(', ')}"`
   - If keywords empty (defensive): `"${prefix}${context}: tín hiệu tổng hợp"`

6. Hard-cap at 120 characters. If result exceeds 120 chars, truncate at last space before the
   limit (never mid-word).

**FR-1 Note A — Sector translation table** (needed in builder; must not emit English domain names):
| DomainType | Vietnamese display |
|---|---|
| `oil_gas` | `dầu khí` |
| `banking` | `ngân hàng` |
| `real_estate` | `bất động sản` |
| `steel` | `thép` |
| `aviation` | `hàng không` |
| `retail` | `bán lẻ` |
| `tech` | `công nghệ` |
| `utilities` | `điện` |
| `agriculture` | `nông nghiệp` |
| `insurance` | `bảo hiểm` |
| `securities` | `chứng khoán` |
| `pharma` | `dược phẩm` |
| `logistics` | `vận tải` |
| `gold_mining` | `vàng` |
| `automotive` | `ô tô` |
| `construction` | `xây dựng` |
| `energy` | `năng lượng tái tạo` |
| unknown/fallback | omit domain segment (no crash) |

**FR-1 concrete examples (required in tests):**
- bullish + action + tickers `[VCB, FPT]` + keywords `["tăng trưởng", "lợi nhuận"]`
  → `"Tích cực cho VCB, FPT: tăng trưởng, lợi nhuận"`
- bearish + domain `[banking]` + keywords `["nợ xấu", "lãi suất"]`
  → `"Tiêu cực ngành ngân hàng: nợ xấu, lãi suất"`
- bullish + country level + no domain + keywords `["vn-index", "tăng"]`
  → `"Tích cực: vn-index, tăng"`
- bearish + country + no domain + empty keywords (defensive)
  → `"Tiêu cực: tín hiệu tổng hợp"`
- neutral → `null`

**AnalysisEntry interface extension:** add `decision_resume: string | null` to the exported
`AnalysisEntry` interface in `newsNormalizer.ts` (~L34-67).

---

### FR-2: Persist decision_resume in rag_analyses
**DDD layer:** infrastructure
**Files:**
- DB schema initializer (wherever `rag_analyses` CREATE TABLE is defined — find via codebase search)
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` (INSERT, ~L264-302)

**Schema change:**
Add column `decision_resume TEXT` (nullable, no default) to `rag_analyses` table.

Migration path: add `ALTER TABLE rag_analyses ADD COLUMN decision_resume TEXT` in the
schema-upgrade path (same pattern as prior ADD COLUMN migrations in this codebase). Must use
`IF NOT EXISTS` equivalent (SQLite: wrapped in `try/catch` or checked via `PRAGMA table_info`).
Note: SQLite ADD COLUMN with UNIQUE is a known silent no-op (project memory). This column has no
UNIQUE constraint — plain TEXT nullable, safe.

**INSERT update (`analysis.ts` ~L264-289):**
- Add `decision_resume` to the column list in the prepared statement
- Add `entry.decision_resume` (or `null`) to the `.run(...)` positional params
- Value comes from the `AnalysisEntry` produced by `normalizeNews()` (FR-1)

---

### FR-3: Carry decision_resume in the DTO
**DDD layer:** interface
**File:** `apps/mcp-server/src/interface/mcp/routes/newsSentimentHandler.ts`

Three sub-changes:

**FR-3a — RagAnalysisRow interface** (raw DB row type, ~L74-87): add `decision_resume: string | null`

**FR-3b — SELECT query** (~L161-172): add `decision_resume` to the column list.

**FR-3c — NewsSentimentItem interface + mapper** (~L89-102 + L174-203):
- Add `decision_resume: string | null` to `NewsSentimentItem`
- In the mapper, pass through: `decision_resume: row.decision_resume ?? null`

**FR-3d — Fix handler inline comment** (~L36-44): update the documented `sentiment` type from
`"positive" | "negative" | "neutral"` to `"bullish" | "bearish" | "neutral"` to match reality.
(The DTO comment was aspirational; the actual DB and response values were always domain values.)

---

### FR-4: Fix SentimentPill bullish/bearish mapping
**DDD layer:** interface
**File:** `apps/frontend/app/routes/dashboard.news.tsx`

**FR-4a — Update Sentiment type** (~L37): change from
`type Sentiment = "positive" | "negative" | "neutral" | null`
to
`type Sentiment = "bullish" | "bearish" | "neutral" | null`

**FR-4b — Update SentimentPill logic** (~L131-152): remap
- `sentiment === "bullish"` → green pill "Tích cực"
- `sentiment === "bearish"` → red pill "Tiêu cực"
- `sentiment === "neutral"` or null → grey pill "Trung lập"

Remove the `"positive"` / `"negative"` branches entirely (no longer emitted by DTO).

**FR-4c — Update NewsSentimentItem type** (~L39-51): change `sentiment: Sentiment` to use the
updated Sentiment type. No other field changes needed for this FR.

---

### FR-5: Render decision_resume skim-first in NewsCard
**DDD layer:** interface
**File:** `apps/frontend/app/routes/dashboard.news.tsx`

**FR-5a — Extend NewsSentimentItem** (~L39-51): add `decision_resume: string | null`

**FR-5b — Résumé strip in NewsCard** (~L170-220): render `decision_resume` as the first visual
element inside the card article (before the title row), as a compact verdict strip:
- Only rendered when `item.decision_resume` is non-null and non-empty
- Color: matches sentiment — green text for bullish, red for bearish
- Style guidance (implementation detail for dev): `text-xs font-semibold` with appropriate
  color class (`text-green-400` / `text-red-400`)
- No icon, no emoji — text only (language-boundary: plain Vietnamese)

**FR-5c — Move impact_summary into collapsible dropdown** (~L200-205):
- Wrap the existing `impact_summary` paragraph in the `Radix Collapsible` primitive already in
  the project at `apps/frontend/app/components/ui/collapsible.tsx`
- Toggle trigger label: "Xem thêm" (collapsed) / "Thu gọn" (expanded)
- Only render the collapsible when `impact_summary` is non-null/non-empty
- Default state: collapsed (résumé is visible, full excerpt is hidden until expanded)
- This satisfies the standing "all-info source-link + dropdown" UX standard

**FR-5d — No résumé for legacy rows:** When `decision_resume` is null (legacy pre-deploy rows),
the résumé strip is simply not rendered. Existing card layout is unchanged for those rows.

---

## Non-Functional Requirements

**NFR-1 — Language boundary:** All user-facing text in `decision_resume` must be plain Vietnamese.
No English domain names (banking, securities) may appear — use the translation table in FR-1 Note A.
No jargon, no machine-trace fragments.

**NFR-2 — Length budget:** `decision_resume` ≤ 120 chars in DB, target ≤ 100 chars. Enforced by
hard-cap in the builder (FR-1 step 6).

**NFR-3 — No fake data:** Résumé is derived solely from real classifier signals computed inside
`normalizeNews()`. No LLM call, no invented context, no hallucinated company names.

**NFR-4 — Backfill policy (EXPLICIT — not undefined):** Existing `rag_analyses` rows where
`decision_resume IS NULL` receive NO recompute. Frontend renders no résumé strip (graceful omission
per FR-5d). New rows receive the résumé from deploy date. No backfill job required.

**NFR-5 — Rebuild required:** mcp-server schema change (ADD COLUMN) requires container rebuild and
migration execution. ops must rebuild mcp-server after dev-mcp-server completes Hop 1.

---

## Edge Cases

| Case | Expected behaviour |
|---|---|
| `sentiment === "neutral"` | `decision_resume = null`; no résumé strip rendered |
| `bullishMatched` empty on bullish item | `"Tích cực${context}: tín hiệu tổng hợp"` |
| `bearishMatched` empty on bearish item | `"Tiêu cực${context}: tín hiệu tổng hợp"` |
| `affectedActions.length > 3` | Cap tickers at 3 in résumé string |
| `affectedDomains` contains unknown DomainType | Omit domain segment; do not crash |
| Résumé > 120 chars after composition | Hard-truncate at last space ≤ 120 |
| Legacy rows (pre-deploy) `decision_resume = NULL` | No résumé strip on card; card layout unchanged |
| `impact_summary` is null | Collapsible not rendered at all (existing guard remains) |
| `SentimentPill` receives `bullish`/`bearish` (after fix) | Correct colour (green/red) rendered |

---

## DDD Layer Summary

| FR | Layer | File(s) |
|---|---|---|
| FR-1 (builder) | domain/services | newsNormalizer.ts |
| FR-2 (DB + INSERT) | infrastructure | db-schema + analysis.ts |
| FR-3 (DTO) | interface | newsSentimentHandler.ts |
| FR-4 (pill fix) | interface | dashboard.news.tsx |
| FR-5 (card résumé) | interface | dashboard.news.tsx |

---

## Dev Chain (for Architect)

Zone = multi. Two sequential dev hops:

**Hop 1 — dev-mcp-server:** FR-1 + FR-2 + FR-3
- Touches: `newsNormalizer.ts`, DB schema initializer, `analysis.ts`, `newsSentimentHandler.ts`
- Deliverable: `GET /api/news-sentiment` returns `decision_resume` per item (non-null for new bullish/bearish rows)
- Rebuild: mcp-server container rebuild required after Hop 1

**Hop 2 — dev-frontend:** FR-4 + FR-5
- Depends on: Hop 1 (new DTO field must exist before frontend wires it)
- Touches: `dashboard.news.tsx` only
- Deliverable: SentimentPill shows correct colour; résumé strip visible on new rows; impact_summary in dropdown

---

## Blockers for PO

None. PO scoped fully. No questions remaining before dev start.

---

## Acceptance Criteria (QA gate)

1. `GET /api/news-sentiment` response contains `decision_resume: string | null` per item.
2. For a live bullish/bearish row, `decision_resume` is non-null, plain Vietnamese, ≤ 120 chars.
3. For a neutral row, `decision_resume` is null.
4. `/dashboard/news` — bullish cards show green "Tích cực" pill, bearish show red "Tiêu cực" pill.
5. Each card with non-null `decision_resume` shows the résumé strip ABOVE the title row.
6. `impact_summary` is hidden by default behind "Xem thêm" toggle.
7. Cards with `decision_resume = null` (legacy rows) render without résumé strip, no layout regression.
8. No English text in `decision_resume` values (language-boundary check).

---

## [Architect] Brownfield Findings

**Architect task:** ARCH-FEAT-NEWS-DECISION-RESUME
**Completed:** 2026-06-29T16:30Z
**Zone:** multi — `apps/mcp-server/` (Hop 1) + `apps/frontend/` (Hop 2)
**BUILD-STANDARD:** lean (existing services; no new microservice)
**BUILD-STANDARD-REF:** docs/standards/microservice-build-standard.md

---

### Verified paths

| FR | DDD Layer | File | Exact location |
|---|---|---|---|
| FR-1 builder | domain/services | `apps/mcp-server/src/domain/services/newsNormalizer.ts` | `AnalysisEntry` interface L34-67; `normalizeNews()` L833; `bullishMatched`/`bearishMatched` in scope at L872-873; return at L958 |
| FR-2 schema | infrastructure | `apps/mcp-server/src/infrastructure/db/schema-news.ts` | ADD COLUMN pattern: L57 (`data_env`) and L64 (`body_text`) — identical idempotent try/catch; insert new line after L64 |
| FR-2 INSERT | interface | `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` | `INSERT OR IGNORE INTO rag_analyses` prepared stmt L264-270; `.run(...)` positional params L275-295; currently 19 params |
| FR-3 DTO | interface | `apps/mcp-server/src/interface/mcp/routes/newsSentimentHandler.ts` | `RagAnalysisRow` L74-87; `NewsSentimentItem` L90-102; `SELECT` L163-172; mapper return L190-202; header comment L37-44 |
| FR-4 pill | interface | `apps/frontend/app/routes/dashboard.news.tsx` | `Sentiment` type L37; `SentimentPill` L131-152 |
| FR-5 card | interface | `apps/frontend/app/routes/dashboard.news.tsx` | `NewsSentimentItem` L39-51; `NewsCard` L170-220; `impact_summary` inline para L201-205 |

---

### Reuse patterns

- **ADD COLUMN migration** — established pattern at schema-news.ts L57+L64: `try { db.exec("ALTER TABLE rag_analyses ADD COLUMN <col> TEXT"); } catch { /* already exists */ }`. Append as the third rag_analyses ADD COLUMN block. **No UNIQUE** — plain TEXT nullable (project memory: ADD COLUMN UNIQUE is silent no-op on SQLite).
- **Collapsible primitive** — `apps/frontend/app/components/ui/collapsible.tsx` exports `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@radix-ui/react-collapsible`. Already used in the project (InfoCardExpand pattern). FR-5c wraps `impact_summary` in this exact primitive.
- **DomainType import** — already imported in newsNormalizer.ts at L21 from `../../../bctc-schema.js`. The 17-entry translation table stays inside newsNormalizer.ts as a `const DOMAIN_VN_LABEL` — no new import needed.
- **Existing test seam** — `apps/mcp-server/src/__tests__/TASK-17-news-sentiment-endpoint.test.ts` covers `queryNewsSentiment`. Its `insertRow()` helper at L72-80 uses an explicit column list (safe — doesn't break on new column). Dev must add a new AC to this file for `decision_resume` passthrough.

---

### Design decisions

**D1 — `buildDecisionResume()` as a pure helper inside newsNormalizer.ts**
New private function `buildDecisionResume(sentiment, level, affectedActions, affectedDomains, bullishMatched, bearishMatched): string | null` added to the domain helpers section (~L750-820 — below existing `computeImpactScore`/`computeConfidence`). Called at L955 (after reasoning, before return). No new imports. Stays within domain/services — no DDD violation.

**D2 — `DOMAIN_VN_LABEL` as a const map in newsNormalizer.ts**
`const DOMAIN_VN_LABEL: Partial<Record<string, string>>` with 17 FR-1 Note A entries. Using `Partial<Record<string, string>>` (not typed as `Record<DomainType, string>`) to enable the safe-fallback pattern: `DOMAIN_VN_LABEL[d] ?? null` — omit domain segment if unknown DomainType (per edge-case spec). Placed adjacent to the other domain-related constants.

**D3 — Truncation function**
`truncateAt120(s: string): string` — uses `s.slice(0, 120)` then `s.lastIndexOf(' ')` within the 120-char window to find the last word boundary. If no space found below limit, hard-cut at 120. Follows existing `truncateNewsSummary` pattern in `textUtils.ts` (adjacent file). Stays inline in newsNormalizer.ts (single use).

**D4 — INSERT param count change (19 → 20)**
The `INSERT OR IGNORE` at analysis.ts L264 uses positional `?` params. Dev adds `decision_resume` as the 20th column in the column list and `entry.decision_resume` (from `AnalysisEntry`) as the 20th param. The `AnalysisEntry` passed from `normalizeNews()` at L261 already carries the field after FR-1.

**D5 — No changes to the pollNews write path**
`analysis.ts` is the only writer that calls `normalizeNews()` and persists to `rag_analyses`. The pollNews scheduler writes via the same analysis tool call chain — no separate writer to update.

**D6 — Frontend `parseNewsSentimentDto` passthrough**
The existing `parseNewsSentimentDto` at dashboard.news.tsx L73-95 casts `raw as NewsSentimentDto` without field-by-field validation. After dev updates `NewsSentimentItem` to include `decision_resume: string | null`, the cast will carry the field through. No change needed to `parseNewsSentimentDto` itself.

---

### Risk flags

| Risk | Severity | Detail |
|---|---|---|
| RISK-1 | LOW | `buildDecisionResume()` must use `bullishMatched` / `bearishMatched` from `normalizeNews()` scope. These are defined at L872-873 and are local vars — NOT exported. The helper is co-located inside newsNormalizer.ts so closure access is direct. No boundary issue. |
| RISK-2 | LOW | `INSERT OR IGNORE` at analysis.ts L264: if `source_url` UNIQUE conflict causes the row to be skipped, `decision_resume` will never be written for that URL. This is correct and intentional — deduplication wins; the résumé is forfeit for the duplicate insert. |
| RISK-3 | MEDIUM | TASK-17 test `insertRow()` helper currently includes an explicit 12-column INSERT. It does NOT include `decision_resume`. When dev adds the AC-NEW tests for `decision_resume` passthrough, the helper must be extended with an optional `decision_resume?: string | null` param. Failing to do so means the new ACs test a `null` path only — miss the non-null case. |
| RISK-4 | LOW | Truncation edge case: if the composed résumé is exactly 120 chars, `lastIndexOf(' ')` inside `s.slice(0, 120)` may return the final char position — test must cover exactly-120 and 121+ cases to catch off-by-one. |
| RISK-5 | LOW | After Hop 1 deploy + rebuild, all LEGACY rows have `decision_resume = NULL`. Hop 2 frontend must guard with `item.decision_resume != null && item.decision_resume.length > 0` — not `!!item.decision_resume` (empty string '' is falsy but the null check is sufficient per spec since the builder never emits empty-string, only null or a populated string). |

---

### Dev-hop split (for PM)

**Hop 1 — `dev-mcp-server`** (FR-1 + FR-2 + FR-3)

Files to create/modify:
- MODIFY `apps/mcp-server/src/domain/services/newsNormalizer.ts`
  - Add `decision_resume: string | null` to `AnalysisEntry` interface (~L67)
  - Add `const DOMAIN_VN_LABEL` map after existing domain constants (~L820)
  - Add `buildDecisionResume()` pure helper after `computeConfidence()` (~L820)
  - Add `truncateAt120()` inline helper
  - Call `buildDecisionResume()` inside `normalizeNews()` after reasoning (L950), add `decision_resume` to return object (L958)
- MODIFY `apps/mcp-server/src/infrastructure/db/schema-news.ts`
  - Append `try { db.exec("ALTER TABLE rag_analyses ADD COLUMN decision_resume TEXT"); } catch { /* already exists */ }` after the `body_text` block (~L65)
- MODIFY `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts`
  - Add `decision_resume` to INSERT column list (~L266-270)
  - Add `entry.decision_resume` to `.run(...)` positional params (~L295, becomes 20th param)
- MODIFY `apps/mcp-server/src/interface/mcp/routes/newsSentimentHandler.ts`
  - `RagAnalysisRow`: add `decision_resume: string | null` (~L87)
  - SELECT: add `decision_resume` to column list (~L163-172)
  - `NewsSentimentItem`: add `decision_resume: string | null` (~L101)
  - mapper: add `decision_resume: row.decision_resume ?? null` (~L202)
  - Header comment: fix `"positive" | "negative" | "neutral"` → `"bullish" | "bearish" | "neutral"` (~L37)
- CREATE `apps/mcp-server/src/__tests__/FEAT-NEWS-DR-builder.test.ts`
  - Unit tests for `buildDecisionResume()` — the 5 BA concrete examples (FR-1) + 5 edge cases (neutral→null, empty keywords defensive, >3 tickers cap, unknown domain, >120 char truncation)
- MODIFY `apps/mcp-server/src/__tests__/TASK-17-news-sentiment-endpoint.test.ts`
  - Extend `InsertParams` with optional `decision_resume?: string | null`
  - Add `decision_resume` to `insertRow()` helper
  - Add AC-NEW-1: non-null `decision_resume` in DB row passes through to DTO
  - Add AC-NEW-2: null `decision_resume` in DB row → null in DTO item

Deliverable gate (verify gate — contract-from-live-payload):
```bash
curl -s http://localhost:3000/api/news-sentiment | \
  jq '[.items[] | select(.sentiment == "bullish" or .sentiment == "bearish")] | first | {sentiment, decision_resume}'
```
Expected: `{ "sentiment": "bullish"|"bearish", "decision_resume": "<VN string ≤120 chars>" }` (non-null for new rows only; legacy rows may still be null).

Rebuild required: YES (container rebuild for mcp-server to execute ADD COLUMN migration).

---

**Hop 2 — `dev-frontend`** (FR-4 + FR-5) — sequential after Hop 1 + ops rebuild

Files to create/modify:
- MODIFY `apps/frontend/app/routes/dashboard.news.tsx` (single file, all FR-4 + FR-5 changes)
  - `Sentiment` type (L37): `"positive" | "negative"` → `"bullish" | "bearish"`
  - `NewsSentimentItem` (L39-51): add `decision_resume: string | null`
  - `SentimentPill` (L131-152): replace `"positive"` branch with `"bullish"` (green), `"negative"` branch with `"bearish"` (red)
  - `NewsCard` (L170-220):
    - Add résumé strip BEFORE the title row `<div>` (L181): `{item.decision_resume ? <p className="text-xs font-semibold text-green-400 / text-red-400">{item.decision_resume}</p> : null}` — color driven by `item.sentiment`
    - Wrap `impact_summary` paragraph (L201-205) in `Collapsible` / `CollapsibleTrigger` ("Xem thêm"/"Thu gọn") / `CollapsibleContent`; default collapsed; guard `item.impact_summary` non-null/non-empty

Deliverable gate (live browser check):
- `/dashboard/news` — bullish cards show green "Tích cực" pill + green résumé text above title
- bearish cards show red "Tiêu cực" pill + red résumé text above title
- impact_summary hidden behind "Xem thêm" toggle
- Cards without résumé (legacy null rows) render identically to before (no layout shift)

Rebuild required: YES (frontend SSR rebuild).

---

### Scan clean
**true** ✓ — no DDD violations, no new imports across layer boundaries, no cross-service HTTP calls, no LLM calls.
