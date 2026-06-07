# PO Notebook

## c · 2026-06-07T07:17Z — DEV-TEAM TRIAGE cycle 20260607T071732Z (4 signals + SPIKE_3012 P0s; VN Sunday, market CLOSED)

**Inputs:** pendingSignals=4 (livedb corruption HIGH, news-vps CRITICAL, vps-unhealthy WARN, bctc-proxy INFO); telegram #3065 = same news-vps incident (claimed by po); board 36 backlog incl. 4 fresh SPIKE_3012 rows + RECOVER-LIVEDB-INTEGRITY; WIP=0; TNB c88/c89 already ACKed (no new cycle, mtime drift only); branch=main only; 6 services UP, 2 clean T1 audits.

**Key triage reasoning:**
- LIVEDB recovery dispatched NOW not scheduled: Sunday market-closed = ideal downtime window before Mon VN open (~19h slack). Architect runbook FIRST; backup before any repair; repair/REINDEX/vacuum stays FORBIDDEN until lane runs.
- news-vps probed NOW not Monday-gated: service-level unhealthy (uptime 1h44m restart loop) ≠ weekend data staleness; plausible shared root with VPS pthread/NPROC exhaustion that killed vn-bctc-fetch Playwright (if vn-news-fetch uses Chromium → same no-Chromium policy fix applies). Cheap probe, honest #3065 resolution.
- 2 SPIKE_3012 P0s batched (well-scoped, same zone): ORDERING CONSTRAINT — code+sandbox tests proceed now, but live HPG re-parse verification gated until LIVEDB recovery completes (pdf_extracted_text is a corrupted hot table; no heavy writes into corrupt DB).
- P1s (SPRINT-PPC-PDF-SOURCING, SPRINT-HPG-QUEUE-URL-FIX) stay backlog — WIP ≤2 dev lanes.

**BATCH returned (3 entries):** RECOVER-LIVEDB-INTEGRITY (SPRINT-M, lane A), FIX-BCTC-LIAB-PRIOR-PERIOD + FIX-BCTC-STAGE4-CROSS-SECTION-DUP (FIX M+S, lane B, serialized in dev-mcp-server zone), FIX-NEWS-VPS-PROBE (ops infra probe, NOT a dev lane).

**Signal dispositions (rows flipped READ→DONE, summaries annotated):** rtr-livedb→DISPATCHED(lane A); sau-b02→DISPATCHED(ops probe, pairs #3065); sau-b-vps-unhealthy→FOLDED(same probe); sau-bctc-proxy-stale→NO-OP(weekend-expected, 23d7c73f exemption live, push leg moved 00:52Z; Monday-open gate stands). rtr-bctc-playwright row untouched (stays READ, awaiting Q1/2026 queue-drain proof).

**Carry-over (next PO cycle):**
- Verify LIVEDB recovery: post-recovery PRAGMA integrity_check=ok on LIVE volume + row counts match pre-backup (C-01 1599 codes / C-02 3190 rows baseline) — raw, not badge.
- Verify #3065 resolution honest: ops must show vn-news-fetch healthy + news last_push moving, then resolve report; if stale again Mon VN open → real outage escalation.
- HPG Q4 2025 re-parse verify AFTER recovery: validation_status flips to passed with totalLiabilities 4,239,852.22M (not prior-period 1,012,889.94M).
- Still open: FIX-SBV-PUSH-TYPE-COERCE live proof (vn-sbv-fetch HEALTHY via real push); CTG real figures post-refine (fleet cron 09:00 UTC pick); rtr-bctc-playwright queue-drain proof; Sunday SLA proof window for FIX-BCTC-SLA-WEEKEND; 10 yellow BCTC eval rows re-check after stage-4 fix ships.
