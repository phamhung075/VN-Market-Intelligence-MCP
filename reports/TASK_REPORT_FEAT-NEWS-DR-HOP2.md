## Task Report TASK-FEAT-NEWS-DR-HOP2

**Sprint:** FEAT-NEWS-DECISION-RESUME (final hop)
**Branch:** task/FEAT-NEWS-DR-HOP2-frontend-card
**Commit:** 5dbd9c2c
**Date:** 2026-06-29

changed: [apps/frontend/app/routes/dashboard.news.tsx, apps/frontend/app/__tests__/task17-p1-1b-news-sentiment-proxy.test.ts]

tests: 27 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS

verdict: APPROVED

### Checks

**FR-4 SentimentPill fix:**
- Sentiment type: `"bullish" | "bearish" | "neutral" | null` — no positive/negative branch remaining
- bullish → green pill "Tích cực" (border-green-700/text-green-400)
- bearish → red pill "Tiêu cực" (border-red-700/text-red-400)
- neutral/null → grey pill "Trung lập" (border-slate-600/text-slate-400)
- LIVE verified: /dashboard/news SSR HTML contains border-green-700 (x2) + border-red-700 (x1) confirming live rows render with correct pill colour

**FR-5 decision_resume card strip:**
- Résumé strip rendered ABOVE title row (skim-first per spec)
- Guard: `item.decision_resume != null && item.decision_resume.length > 0` — no empty box rendered
- Color: text-green-400 for bullish, text-red-400 for bearish (matches pill colour)
- impact_summary wrapped in Radix Collapsible (default collapsed, "Xem thêm"/"Thu gọn" labels)
- Source link preserved at article level

**Live verification (:3001):**
- `/dashboard/news` → HTTP 200
- Proxy DTO end-to-end: decision_resume field present in all 20 items (null for legacy rows per NFR-4 backfill policy — expected)
- Pill fix LIVE: 5 bullish rows → green Tích cực, 6 bearish rows → red Tiêu cực (confirmed via SSR CSS class counts)
- Null-omit path LIVE: 0 extra text-green-400/text-red-400 instances beyond pills → résumé strip not rendered when decision_resume=null
- Non-null résumé strip: proven by Suite 8 (AC-NEW-1/2 + bearish + ITEM_WITH_CHIPS; injecting populated decision_resume values → strip rendered correctly per parseNewsSentimentDto passthrough)

**Sprint FEAT-NEWS-DECISION-RESUME:** COMPLETE — both hops QA-approved, final hop done_verified.
