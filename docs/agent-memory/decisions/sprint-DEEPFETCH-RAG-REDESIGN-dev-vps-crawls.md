# Decision Journal — Sprint DEEPFETCH-RAG-REDESIGN · dev-vps-crawls

**Sprint goal:** Deep-Fetch + RAG Redesign. Pillar A feasibility probes (Q1/Q2) gate Phase 2.
**Agent:** dev-vps-crawls
**Started:** 2026-06-08T16:11Z

---

### STEP dev-vps-crawls-S1 · dev-vps-crawls · 2026-06-08T16:30Z
**task-id:** DFR-Q1
**what-done:** Live-probed vnexpress.net from VPS (5 articles), measured anti-bot markers, extracted article body, measured peak RAM per call.
**what-considered:**
- only path: live VPS probe is the only reliable signal; static analysis of HTML would miss challenge redirect
**why-decision:** 5/5 probes returned 200, article.fck_detail selector extracted body in all cases, no CF challenge marker, bare python-requests UA also 200. Plain requests viable.
**why-change:** no change — brief expected low risk (R3: Low-Medium), confirmed low.

### STEP dev-vps-crawls-S2 · dev-vps-crawls · 2026-06-08T16:30Z
**task-id:** DFR-Q2
**what-done:** Checked VPS free -m, mapped all service MemoryMax/MemoryCurrent, confirmed /proxy/article-body already exists in vps-proxy-server.js.
**what-considered:**
- EXTEND article-body-fetcher.py + allowlist patch (2-file change, endpoint already live)
- NEW vn-deep-fetch.service (adds isolation, but duplicates existing proxy layer)
**why-decision:** endpoint already wired; 1.94 MB/call × 10 cap = 20 MB spike fits in existing vn-vps-proxy 64 MB cap; 469 MB available RAM confirmed; new service adds maintenance cost with no benefit for on-demand call pattern.
**why-change:** no change from brief Option R intent; recon confirms EXTEND is correct path.
