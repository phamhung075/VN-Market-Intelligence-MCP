# Decision Journal — Sprint FEAT-NEWS-DECISION-RESUME (QA)

## Entry qa-S1

**date:** 2026-06-29
**agent:** qa
**task-id:** TASK-FEAT-NEWS-DR-HOP1
**verdict:** APPROVED

**what-considered:**
- FR-1: buildDecisionResume() pure helper with DOMAIN_VN_LABEL (17 domains) and truncateAt120() — co-located in domain/services/newsNormalizer.ts, no infra/interface imports.
- FR-2: ADD COLUMN decision_resume TEXT (idempotent try/catch, no UNIQUE constraint — correctly avoiding SQLite silent no-op trap).
- FR-3: DTO carry in newsSentimentHandler.ts — RagAnalysisRow + NewsSentimentItem + SELECT + mapper + header comment fix.
- Tests: FEAT-NEWS-DR-builder.test.ts (11 cases: 5 FR-1 concrete + 5 edge + 1 DOMAIN_VN_LABEL coverage) + TASK-17 extended (AC-NEW-1/2). All 30 pass / 0 fail.
- tsc: clean.
- DDD: newsNormalizer.ts imports only domain/models/shared-types, bctc-schema, and domain services — no infra/interface imports.
- Security: no process.env in modified files, parameterized INSERT with 20 `?` placeholders, mock-guard PASS.
- ADD COLUMN: plain TEXT, no UNIQUE (SQLite silent-no-op trap avoided — explicitly documented in comment).
- End-to-end pipeline proof: integration script ran normalizeNews(bullish mock item) → INSERT → queryNewsSentiment on in-memory DB. decision_resume = "Tích cực cho VCB, FPT: tăng, tăng trưởng" (40 chars, correct FR-1 template, plain Vietnamese, NFR-1 clean).
- Live DTO shape: decision_resume field present in all 20 served items (legacy rows correctly null per NFR-4 backfill policy).
- Container healthy: image 2916e192a697, up 4 min post-rebuild by ops.

**why-change:** no change from plan — all checks green, pipeline proven, DoD met.

**residual:**
- Live rows currently null (all legacy pre-rebuild). Per NFR-4 backfill policy, this is expected and correct. Frontend (HOP2) must guard with `item.decision_resume != null && ...` per RISK-5.
- HOP2 (dev-frontend) is now UNBLOCKED.

## Entry qa-S2

**date:** 2026-06-29
**agent:** qa
**task-id:** TASK-FEAT-NEWS-DR-HOP2
**verdict:** APPROVED

**what-considered:**
- FR-4 pill: Sentiment type = "bullish"|"bearish"|"neutral"|null (no positive/negative). SentimentPill branches: bullish→green Tích cực, bearish→red Tiêu cực, null/neutral→grey Trung lập. No leftover positive/negative branch. PASS.
- FR-5 résumé strip: rendered ABOVE title row with `item.decision_resume != null && item.decision_resume.length > 0` guard. Color driven by sentiment. Null-omit path: no empty box rendered. Collapsible wraps impact_summary (default collapsed, Xem thêm/Thu gọn labels). Source link preserved. PASS.
- Tests: 27/27 pass (Suite 8 AC-NEW-1/2 + bearish + ITEM_WITH_CHIPS passthrough). tsc: 0 errors. DDD: no infra/application imports. Security: no secrets. mock-guard exit 0.
- Live :3001: /dashboard/news → 200. CSS confirms 2 green pills + 1 red pill rendered (border-green-700/border-red-700 in SSR HTML). No extra text-green-400/text-red-400 beyond pills → null-omit path confirmed (all 20 live rows have decision_resume=null per NFR-4 legacy backfill). Proxy end-to-end: decision_resume field present in DTO (null for legacy rows). FR-4 pill fix live-proven; FR-5 null-omit live-proven; non-null strip proven via Suite 8.

**why-change:** no change from plan — all checks green, live proven where testable per spec boundary.
