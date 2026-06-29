---
sprint: FEAT-NEWS-DECISION-RESUME
branch: task/FEAT-NEWS-DR-HOP2-frontend-card
size: S
zone: apps/frontend/
depends_on: TASK-FEAT-NEWS-DR-HOP1
blocks: []
---

## TLDR

Fix the frontend news card: remap `SentimentPill` to show green "Tích cực" for bullish and red "Tiêu cực" for bearish (was showing grey for all due to pill logic mismatch), then render decision résumé as compact skim-first verdict strip above the title, and move impact_summary into a collapsible dropdown.

## [PM] Planning Context

**Zone:** `apps/frontend/` (presentation layer)

**Feature context:**
- Completes FEAT-NEWS-DECISION-RESUME from Hop 1 (backend now provides `decision_resume` field in `/api/news-sentiment`)
- Hop 1 deliverable: `GET /api/news-sentiment` returns `decision_resume: string | null` per item
- This Hop: frontend wiring (FR-4 pill fix + FR-5 card layout)

**Acceptance Criteria:**

- [ ] `Sentiment` type updated (~L37 dashboard.news.tsx): `"positive" | "negative"` → `"bullish" | "bearish"` (matches DB reality)
- [ ] `SentimentPill` logic fixed (~L131-152):
  - `sentiment === "bullish"` → green pill, text "Tích cực"
  - `sentiment === "bearish"` → red pill, text "Tiêu cực"
  - `sentiment === "neutral"` or null → grey pill, text "Trung lập"
  - Remove entirely the old `"positive"` / `"negative"` branches (no longer emitted by Hop 1 DTO)
- [ ] `NewsSentimentItem` interface extends (~L39-51):
  - Add `decision_resume: string | null`
  - Update `sentiment: Sentiment` to use the remap-fixed type
- [ ] `NewsCard` résumé strip (~L170-220):
  - Render `decision_resume` as the first visual element BEFORE title row (if non-null/non-empty)
  - Style: `text-xs font-semibold` with color matching sentiment (green text for bullish, red for bearish)
  - Text only, no icon/emoji (language-boundary: plain Vietnamese)
  - Example: `{item.decision_resume && item.decision_resume.length > 0 ? <p className={...}>{item.decision_resume}</p> : null}`
- [ ] `impact_summary` collapsible (~L200-205):
  - Wrap existing `impact_summary` paragraph in `Radix Collapsible` primitive (already in project at `apps/frontend/app/components/ui/collapsible.tsx`)
  - Import: `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@radix-ui/react-collapsible`
  - Toggle label: "Xem thêm" (collapsed) / "Thu gọn" (expanded)
  - Default state: collapsed (résumé visible, impact hidden until expanded)
  - Only render collapsible when `impact_summary` is non-null/non-empty (existing guard remains)
- [ ] Legacy row handling (~L5d):
  - When `decision_resume` is null (pre-deploy rows), résumé strip simply not rendered
  - Card layout unchanged for legacy rows (no regression)
- [ ] Browser verification (live check on `/dashboard/news`):
  - Bullish cards: green "Tích cực" pill + green résumé text above title
  - Bearish cards: red "Tiêu cực" pill + red résumé text above title
  - impact_summary hidden behind "Xem thêm" toggle
  - Cards without résumé (legacy null rows) render identically to before
  - No layout shift, no console errors

**Files to read first:**
- `apps/frontend/app/routes/dashboard.news.tsx` (L37 Sentiment type, L39-51 NewsSentimentItem, L131-152 SentimentPill, L170-220 NewsCard)
- `apps/frontend/app/components/ui/collapsible.tsx` (reference: Collapsible primitive API)
- BA spec (authoritative) → `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md` (FR-4 and FR-5 sections)

**Files to create:**
- None (single-file modification)

**Files to modify:**
- `apps/frontend/app/routes/dashboard.news.tsx` — Sentiment type + NewsSentimentItem interface + SentimentPill logic + NewsCard résumé + Collapsible impact_summary

**Dependencies:**
- TASK-FEAT-NEWS-DR-HOP1 (Hop 1 must complete and deploy before Hop 2 codes live against the new DTO field)
- ops mcp-server rebuild (between Hop 1 complete and Hop 2 start; router orchestrates this)

**Knowledge needed:**
- `docs/policies/dev-standards.md` — commit convention, DDD layers
- Hop 1 handoff (to understand the DTO contract) → `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/TASK-FEAT-NEWS-DR-HOP1.md`
- BA spec (FR-4 and FR-5 sections) → `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md`
- Project UX standards: "all-info source-link + dropdown recheck" (project memory, standing requirement)

**Non-functional requirements (from BA spec):**
- NFR-1 Language boundary: plain Vietnamese only, no English domain names, no jargon
- NFR-4 Backfill policy: legacy NULL rows must gracefully omit résumé strip (no layout regression)

**Edge cases to handle:**
- `decision_resume` is null (legacy pre-deploy rows) → no résumé strip rendered at all
- `decision_resume` is empty string `""` (should never happen from builder, but guard anyway) → no résumé strip
- `impact_summary` is null → collapsible not rendered (existing guard remains in place)
- `sentiment` is null → grey pill "Trung lập" (defensive, should not happen but safe fallback)
- SentimentPill receives unknown sentiment value → grey pill (defensive)

**Design notes (from Architect):**
- D6: Frontend `parseNewsSentimentDto` is passthrough cast (no field-by-field validation); after dev updates NewsSentimentItem to include decision_resume, the cast will carry it through automatically. No change needed to parseNewsSentimentDto itself.
- Collapsible primitive: already used in the project (InfoCardExpand pattern); reuse same pattern

**Risk flags:**
- RISK-5 (LOW): Legacy NULL rows must guard with `item.decision_resume != null && item.decision_resume.length > 0` (not just `!!item.decision_resume` since empty string '' is falsy, but builder never emits empty-string, only null or populated string)

**Blockers for PO:**
- Hop 1 deploy + container rebuild must complete before this task starts

**Definition of Done (for QA):**
1. `/dashboard/news` — bullish cards show green "Tích cực" pill with green résumé text above title
2. Bearish cards show red "Tiêu cực" pill with red résumé text above title
3. impact_summary hidden by default behind "Xem thêm" / "Thu gọn" toggle
4. Cards with `decision_resume = null` (legacy rows) render without résumé strip, no layout regression
5. No console errors, responsive layout on all viewports
6. No English text in user-facing output (language-boundary check)
7. Collapsible toggle is accessible and toggles correctly on click
