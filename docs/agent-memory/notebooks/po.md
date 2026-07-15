# PO Notebook

_Last: 2026-07-15T17:28Z (triage 2 dev-team signals: RAG corpus reverify + hybrid max_distance no-op)_

## Tick 2026-07-15T17:28Z — dev-team signal triage (2 signals, degraded gateway/direct-bridge)
Router hand-off, dev-team tick 17:07Z. Both signals apps/rag-service, from qa's RAG-FTS-BUILD-MEMORY-BOUND live-verify.

**Signal 1 — verify-followup (rag corpus repopulation scale reverify):**
- Live-probed corpus myself: `GET :5002/embed/health` index_size=**297 rows now** vs **116 @ qa 16:01Z** verify (+181 in ~1.5h). Re-embed pipeline ALIVE ⇒ NOT stuck-at-116 ⇒ **NO new bug** for dev-rag-service.
- 297 << ~56k representative scale ⇒ AC#1 (no-OOM at ~56k) re-run stays UN-testable ⇒ **TIME-GATED**, not a dispatch. Did NOT force a rebuild against the 116/297-row corpus.
- **Disposition:** annotated existing `RAG-FTS-BUILD-MEMORY-BOUND` review row (`po_triage_note_reverify`) — STAYS review, done_verified WITHHELD, `blocked_on=rag-corpus-repopulation-to-representative-scale` UNCHANGED. Recorded the WITHHELD-lift gate = re-run AC#1 (POST /admin/rebuild-fts under 768m cgroup, docker stats peak-mem, 2x) once corpus ≈ representative scale → then unblock ALPHA-S2 deadline retune. No new/dup task minted.

**Signal 2 — tech-debt (hybrid max_distance no-op):**
- PRE-EXISTING / non-blocking, NOT a regression (git show 619eea227 = 0 lines in search()/hybrid_search()). Default max_distance=0.8: hybrid=true returns hits, hybrid=false returns 0 for same query; hybrid distances cluster 0.0216–0.0242 ⇒ RRF fused-rank score under the distance key ⇒ max_distance a no-op in hybrid mode.
- **Disposition:** minted `SPIKE-RAG-HYBRID-MAXDISTANCE-NOOP` (backlog, type SPIKE, P3, apps/rag-service/, dev, timebox 120). Semantics question: filter vector-leg distance vs keep RRF-under-distance-key. NOT urgent-dispatched → groom by rank.

**WRITE:** single `jq | orch-apply.sh` — Zod Stage0+1 PASS, conservation OK task_total 579→580 (+1 SPIKE), CAS clean. head untouched (idle/router). No locks touched (router-owned). RETURN to router = NOTHING (idle) — nothing needs immediate dispatch; both dispositions recorded on board.

## Carry-over
- **NEXT (router/dev-team):** RAG-FTS-BUILD-MEMORY-BOUND WITHHELD until corpus organically re-populates to ~representative scale, then qa re-runs AC#1 at scale → then ALPHA-S2-RAG-FTS-REBUILD-CRON deadline-retune tail. Neither actionable now (wall-clock gate). SPIKE-RAG-HYBRID-MAXDISTANCE-NOOP sits in backlog for BOUNDED-1 grooming.
- **Heads-up:** rag-service idle mem ~92% of 768m with ZERO FTS activity (tight margin — ALPHA-S2 retune input). Gateway /gateway 502 still USER-escalated (dashboard-managed --token tunnel, aggregator origin down).
- **Prior carry (still open):** RC cascade = SEPARATE supervised dispatch (architect TECH doc first). FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T (supervised ops recon-first); FIX-MCP-TEST-SUITE-INTERVAL-TIMER-LEAK-TEARDOWN + ALPHA-S2-FF-SUB6-BUCKETING-HELPER (dev-mcp-server, non-gating).
