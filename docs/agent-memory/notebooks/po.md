# PO Notebook

_Last: 2026-07-15T04:56Z (triage ALPHA-S2-RAG-FTS-REBUILD-CRON qa-BLOCK → parked BLOCKED + 2 blockers minted)_

## Tick 2026-07-15T04:56Z — ALPHA-S2 rag-FTS-rebuild-cron qa-BLOCK triage (router hand-off)
qa RAW-block: mcp-server code 35cc8cd56 CLEAN + on origin/main (35/0 tests, tsc 0, mock-guard PASS) — NOT a code defect. Real blocker = rag-service `_build_fts_index()` OOM-crashes the 768m container at the corpus's current ~56k rows (4x the brief's 14k premise), 250s+ >> the cron's 90s deadline, RestartCount 258→260, reproduced 2/2. No active incident (cron deploy-pending; rag stable-at-rest 26%).
- **Disposition:** ALPHA-S2 parked BLOCKED (in_progress→backlog), depends+blocked_by=[SAFETY-GATE, MEMORY-BOUND], next_agent stripped. in_progress now EMPTY (WIP=0). head→idle/active_task_id=null/next_agent=dev-team.
- **Minted (both P1, sprint FLOW-PRICE-ALPHA-LOOP, wave 2):**
  - `RAG-FTS-BUILD-MEMORY-BOUND` (dev-rag-service, apps/rag-service/) — ROOT cause: bound the FTS rebuild's memory+wall-time corpus-size-INDEPENDENTLY (investigate LanceDB bounded-writer config; report steady-state peak-mem+time). No dependency.
  - `ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE` (dev-mcp-server, apps/mcp-server/) — default-OFF enable flag gating cron registration so a stray mcp-server redeploy can't arm the nightly OOM. RUN-NOW/independent; flag flipped ON only as ALPHA-S2's final unblock step.
- **Path calls:** #2 root fix = only corpus-independent fix (kept). #1 mem-limit bump (ops/user-gated) NOT minted standalone (doesn't unblock alone + unsizable now → folded into rootfix DoD). #3 deadline retune folded into ALPHA-S2 tail. #4 14k→56k premise re-scoped in-row.
- **WRITE:** single `jq | orch-apply.sh` — Zod Stage0+1 PASS, conservation OK task_total 577→579 (+2 mints), CAS clean. No locks touched (router-owned).

## Carry-over
- **NEXT (router/dev-team):** ALPHA-S2 no longer actively relaying → router should release umbrella mutex + jump:end. Then drain the 2 new P1 blockers via peer dev-team (SAFETY-GATE is RUN-NOW; MEMORY-BOUND is the critical path). ALPHA-S2 auto-eligible again only when both deps done_verified.
- **Prior carry (still open):** RC cascade launchable as SEPARATE supervised dispatch (architect TECH doc FIRST; RC-VERIF+CONVERGE→ORCHMONO→GITSTATE→CEREMONY; NOT BOUNDED-1 auto-drain). FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T (supervised ops recon-first); FIX-MCP-TEST-SUITE-INTERVAL-TIMER-LEAK-TEARDOWN + ALPHA-S2-FF-SUB6-BUCKETING-HELPER (dev-mcp-server, non-gating); FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT PLAN-ONLY in review[].
