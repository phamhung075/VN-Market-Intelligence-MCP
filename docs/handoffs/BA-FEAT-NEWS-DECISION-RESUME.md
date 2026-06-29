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
