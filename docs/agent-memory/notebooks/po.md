# PO Notebook

**Cycle:** :11 2026-05-26T18:11Z — Sprint BCTC-LAYOUT-FIRST KICKOFF (user-co-authored brief, go-to-build).
**Last update:** 2026-05-26T18:11Z
**Status:** Sprint opened; goal + ladder + handoff written; BA chain seeded. SUPERSEDES BCTC-MD-TABLE. No code, no pilot-status, no frozen surface touched.

---

## 2026-05-26T18:11Z — :11 (LF-KICKOFF)

**Action:** Authored `docs/SPRINT_GOAL.md § Sprint BCTC-LAYOUT-FIRST` (replaced BCTC-MD-TABLE header), TASKS.md ladder LF-BA→LF-EXIT, handoff `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md`, kickoff signal `po-20260526T181140Z.json`.

**Why:** User co-authored a multi-round design brainstorm + gave go-to-build. This IS the architect-grade recurring-bug rethink: `generic_md_table_extractor.py` = 9 MD-EXTRACT commits + `text_table_extractor.py` = 7 BT commits. The bbox column-guessing engine passed ONLY FPT Q4 (id=11), does NOT generalize.

**Two deliverables:** (1) layout-first Tier 0-3 (document map by geometric fingerprint → page zoning + schema inheritance → cross-page stitch → per-unit invariant gate) REPLACING the column-guessing logic; (2) geometric-zone ON/OFF overlay on /api/bctc-inspect (pdf-extractor emits zone-geometry JSON; mcp-server renders toggle). zone=`multi` — architect splits at pdf-extractor↔mcp-server boundary.

**Root cause anchored:** FPT Q1 2026 p5 (NGUỒN VỐN) has NO column header → engine guesses → scramble. Tier-0/1 SCHEMA INHERITANCE = direct fix. Anchors hint-only (geometry is spine; notes p41 matched all 4 statement titles).

**Decisions A-F binding:** A generic/AC-0 grep-proof; B replace-engine/augment-`bctc_table_rows` (text_table_extractor.py 0-byte-diff); C Tier-0 cheap; D schema-inheritance; E geometry-before-text overlay; F DONE=Tier-3 invariants across 18-doc corpus via DIRECT market.db (endpoint stale, never arbiter) + USER verbal G9. 5 prior false-greens.

**Lock:** task_claim NOT acquirable from this thread (MCP call_tool proxy not surfaced as a callable function here; gateway ✓ Connected but thread tool set = Read/Edit/Write/Bash + semble only). Single-user autonomous, no competing PO session → non-fatal; chain dispatch is what matters. Attempted the actual call per anti-hallucination rule — did NOT hallucinate a failure.

**Edits (working tree, NOTHING staged — main terminal commits):**
- docs/SPRINT_GOAL.md (BCTC-LAYOUT-FIRST goal, supersedes BCTC-MD-TABLE)
- docs/TASKS.md (LF-BA→LF-EXIT ladder, replaced BCTC-MD-TABLE block)
- docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md (new chain ledger)
- docs/signals/po-20260526T181140Z.json (kickoff signal to BA)
- docs/agent-memory/notebooks/po.md (this)

**No code, no pilot-status JSON, no frozen surface, no re-extract/batch touched.**

---

## Carry-over (next cycle)

- **NEXT = BA writes LF-BA REQ spec** → returns to PO approval gate (review-ba-spec.md) BEFORE architect LF-DESIGN dispatches. Approve only if spec carries: both deliverables, 4-tier behavior contract, AC-0 grep-proof clause, privacy + host + multi-doc-corpus + DIRECT-DB-arbiter constraints, service-boundary split note.
- **LF chain order:** BA→PO-approve→architect(LF-DESIGN multi-split)→dev-pdf-extractor(LF-EXTRACT)+dev-mcp-server(LF-OVERLAY)→ops(LF-DEPLOY seq single-doc rebuild/recreate)→qa(LF-QA Tier-3 corpus via direct DB)→PO(LF-EXIT)→USER G9.
- **Goal ARMED** (verbatim "table on pdf on all bctc need correct extract text and convert to md style") — clears ONLY on USER verbal G9 across the multi-doc corpus, never on one doc / endpoint. This SUPERSEDES the prior BCTC-MD-TABLE G9 wait (same binding goal, broader corpus bar).
- Re-attempt sprint umbrella task_claim when next in a thread that surfaces the MCP call_tool proxy (kind=sprint-task; workaround kind per commit-mutex enum-drift note if rejected).

## Standing context (carry-over from :04 MCPZONE-BATCH-1, NOT re-dispatch)
- **NEWS-INGEST-3 (qa) — NEXT-READY** (both -2 + -2b landed). **NEWS-INGEST-LIVE (ops)** still OPEN (real VPS cycle inserts >0 NEW distinct VN rows). **NEWS-INGEST-2c (developer)** cosmetic UI backlog. MCPZONE-HARDEN-1 CLOSED. FETCH-ANALYZE CLOSED.
- DEPLOY-DRIFT (-1/-2 ops-rebuild lanes, -3 architect guard) standing. BCTC-TABLE-3 CLOSED (BT3-EXIT2, 79 clean rows). Standing routed: HSG-FIRE-SEVERITY-RECAL, MARKET-SLOTS-DARK (cron re-arm), HOLLOW-RUN-20260525, CHEF-EOD-MACRO-MISATTRIB, context-bloat janitor, cowork-fire (expected-silent off-hours).

## PO order (binding): reliability → coverage → UX → architecture
- Self-initiate; full autonomy. Subagents leave files UNSTAGED; dispatcher commits under commit-mutex. Recurring-bug guard: ≥2 fix commits same module → BLOCK + architect rethink. HONEST counts only — verify SHAs/build-time.
