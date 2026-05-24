# PO Notebook

**Cycle:** rag-service SCALE DEFECT-REOPEN (cycle-78) + news-fetch NF-LD dispatch in-flight.
**Last update:** 2026-05-24T17:05Z
**Status:** rag-service pilot REOPENED (ACTIVE, 10/12, G6+G9 NO, phase2 OPEN, P3 plan authored, commit b43c3d97). news-fetch NF-LD enhancement chain still in-flight (separate concurrent cycle, pilot stays DONE). next_actor=dev-team (rag-service P3-A) + architect (NF-LD-1).

---

## 2026-05-24T17:05Z — rag-service DEFECT-REOPEN (user pilot-review rejected 12/12)

### What happened
- User rejected the rag-service SCALE 12/12 terminal close (po cycle-77, verdict=scale).
- Defect (router-verified): dashboard Microservice tier permanently NOT-RUN with dishonest hint
  "no trace — not implemented / Phase 2" (index.html L439) while main.py comp-root IS implemented
  (74L). Stale "Phase 1" footer (L223) + "NOT-RUN until live HTTP wiring verified" note (L228).
  Tier-3 ZERO scenario evidence — sandbox/__main__.py --tier = [primitive, module] only (L245),
  NO --tier=service. Gold std: TA L105 "L3: 3 service scenarios (httptest.NewServer)".

### Reopen actions (atomic, PO-only goal authority) — commit b43c3d97
- status DONE->ACTIVE; verdict scale->pending; goalsEarned 12->10; closedAt/By/Signal->null
  (prior close VOIDED -> reopen.priorClose). phase2 CLOSED->OPEN. decisionMatrix all->pending.
- G9 YES->NO: canonical arbiter = USER verbal (charter L192-194); Path B Playwright PROXY passed
  by asserting microservice_not_run=true = validated the defect.
- G6 YES->NO (my call): canonical G6 (charter L164) = click a card in EACH panel -> detail view;
  Microservice card is traceId:null + static hint (no clickable toggle) -> not met.
- P3 "service-tier completion" authored (phase2.p3, 5 tasks): P3-A TestClient+fake adapters >=3
  service traces (create_app(embedder,vector_store) seam, main.py <=80L) / P3-B wire panel GREEN
  + delete hint + fix stale footer / P3-C dash-check detail-view assert / P3-D G12 all-3-tier
  evidence / P3-E QA re-verify G6+G8+G9 + PO re-close (G9 final = USER verbal, not auto-proxy).
- Signal: docs/signals/po-rag-service-pilot-REOPEN-20260524T170511Z.json. JSON valid + zero-dup.

### CONCURRENT-COMMIT-RACE hit ([[feedback_concurrent_commit_race]])
- First commit conflated: concurrent po/news-fetch cron grabbed shared index, committed ITS files
  as f4af3a22; my 2 files NOT captured. Local commit-mutex unreachable (coordination.db 0 bytes,
  lives in MCP container). Recovered WITHOUT rewrite: re-staged in a tight one-shot critical
  section (index.lock + foreign-path guard right before commit) -> b43c3d97 = exactly my 2 files.
  f4af3a22 preserved as ancestor.

## news-fetch NF-LD live-data view (separate concurrent cycle 17:05:33Z — pilot stays DONE 12/12)
- User want: show actual fetched article rows per source from DB on news-fetch dashboard.
- KEY: news-fetch (5008) is STATELESS (no DB). Rows live in mcp-server rag_analyses. Live view
  MUST be a read-only SELECT endpoint on mcp-server (3000), NOT on the stateless scraper (creds =
  Security-Clause regression). Sources reuters+bloomberg, N=20 ORDER BY created_at DESC, no cache.
- Outputs (commit f4af3a22): docs/TASKS.md NF-LD block, docs/handoffs/TASK_NF-LD.md,
  docs/signals/po-news-fetch-livedata-20260524T170518Z.json.

## Carry-over
- rag-service: REOPENED (ACTIVE, 10/12). dev-team dispatch dev-rag-service P3-A FIRST (WIP=1,
  P3-A->B->C->D->E chain). Re-close = G6+G8+G9 re-verified by qa + PO atomic 12/12; G9 final flip
  needs USER verbal sign-off (NOT auto-proxy) — do NOT let a Playwright proxy alone re-close G9.
- news-fetch NF-LD: main terminal spawns architect NF-LD-1 (design endpoint + live section), then
  developer NF-LD-2, qa NF-LD-3, PO NF-LD-EXIT. HARD: never touch sandbox runner/data.js/3 sandbox
  panels; never touch pilot-status-news-fetch.json (frozen 12/12); endpoint SELECT-only on mcp-server.
- LESSON: manual commit-mutex critical section is UNSAFE while the fleet is active (multiple
  po/pm/dev crons share the git index). When MCP task_claim unreachable, only safe pattern =
  tight one-shot stage+verify(foreign-path guard)+commit, and ACCEPT a race may steal the slot —
  then re-commit (NEVER rewrite the contender's commit).
- pdf-extractor pilot DONE (prior cycle). BCTC VPS staleness B-08/1972 stays OPEN as INFRA-only.
