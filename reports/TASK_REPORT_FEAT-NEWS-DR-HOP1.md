## Task Report TASK-FEAT-NEWS-DR-HOP1

changed: [
  apps/mcp-server/src/domain/services/newsNormalizer.ts (AnalysisEntry.decision_resume? + DOMAIN_VN_LABEL + truncateAt120() + buildDecisionResume() + normalizeNews() integration),
  apps/mcp-server/src/infrastructure/db/schema-news.ts (ADD COLUMN decision_resume TEXT idempotent),
  apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts (INSERT 19→20 params),
  apps/mcp-server/src/interface/mcp/routes/newsSentimentHandler.ts (RagAnalysisRow + NewsSentimentItem + SELECT + mapper + header comment fix),
  apps/mcp-server/src/__tests__/FEAT-NEWS-DR-builder.test.ts (new — 11 cases),
  apps/mcp-server/src/__tests__/TASK-17-news-sentiment-endpoint.test.ts (AC-NEW-1 + AC-NEW-2 added)
]
tests: 30 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS

### End-to-end pipeline proof
Integration run (normalizeNews → INSERT → queryNewsSentiment on in-memory DB):
  - Input: bullish mock item (VCB, FPT + "tăng trưởng" keywords)
  - normalizeNews() output: sentiment=bullish, decision_resume="Tích cực cho VCB, FPT: tăng, tăng trưởng"
  - INSERT succeeded (20-param prepared statement)
  - queryNewsSentiment() returned: decision_resume="Tích cực cho VCB, FPT: tăng, tăng trưởng" (40 chars, ≤120, plain Vietnamese, NFR-1 clean)

### Live DTO gate
curl http://localhost:3000/api/news-sentiment → 20 items, decision_resume field present in all items.
Legacy rows correctly null (pre-rebuild, per NFR-4 backfill policy).
Container image 2916e192a697, healthy (rebuilt by ops).

verdict: APPROVED
