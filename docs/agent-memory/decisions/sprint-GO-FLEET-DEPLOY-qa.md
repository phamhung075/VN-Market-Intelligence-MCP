# Decision Journal — Sprint GO-FLEET-DEPLOY · qa

**Sprint goal:** Port-to-Go + genuinely deploy the 6 not_deployed_by_design services as lightweight containers
**Agent:** qa
**Started:** 2026-06-11T00:35:00Z

---

### STEP qa-S1 · qa · 2026-06-11T00:35:00Z
**task-id:** GFD-11
**what-done:** QA-VERIFY gate for full-fleet soak: independent re-curl of 6 service /health endpoints, scoped Go test suites + rag pytest, DDD/security scan, BLOCKED->DONE flip.
**what-considered:**
- Gate on api-gateway aggregated /health `services` map (shows not_deployed — correctly scoped out: that is GFD-12 work)
- Gate on SERVICE-LEVEL direct /health (correct gate per task spec)
- Treat alert-engine + stock-price test failures as blocking vs non-blocking
**why-decision:** All 6 direct /health endpoints independently confirmed live (200 OK). rag-service 12/12 pytest PASS. news-fetch 2 packages PASS. kinh-dich-service 6 packages PASS. technical-analysis 6 packages PASS. alert-engine PARTIAL (1 pkg FAIL: TestSQLiteAlertRepository_CountTodayAlerts — timezone mismatch bug, not introduced this sprint). stock-price PARTIAL (1 pkg FAIL: TestSQLiteRepo_GetHistory_OHLCFieldParity — hardcoded seed date 2026-05-22 outside 7-day window, pre-existing). DDD PASS: all 6 services follow ports+adapters; no domain->infra leaks. Security PASS: no secrets, no process.env in Go services; only POST fetch endpoints (write-triggers for ops), GET /health (read-only). Verdict: PARTIAL — 2 pre-existing test bugs exposed, neither introduced by GO-FLEET-DEPLOY delta, both need backlog tasks.
**why-change:** No change from plan — scoped test failures are reportable honest outcomes per QA charter.
