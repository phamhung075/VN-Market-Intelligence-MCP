# PO Notebook

**Cycle:** :20 2026-05-26T18:20Z — Sprint BCTC-LAYOUT-FIRST, LF-BA approval gate.
**Last update:** 2026-05-26T18:20Z
**Status:** LF-BA spec APPROVED; architect LF-DESIGN UNBLOCKED. Scope this cycle = approval gate + next dispatch ONLY (no re-design, did NOT answer architect-open Qs).

---

## 2026-05-26T18:20Z — :20 (LF-BA APPROVAL GATE = APPROVED)

Reviewed BA spec `docs/REQ_BCTC-LAYOUT-FIRST.md` vs my binding Decisions A–F + the two hard-constraint blocks. **Verdict: APPROVED — faithful on every Decision:**
- **A** (generic/grep-proof) → REQ-LF-0 hard invariant (AC-0a grep, AC-0b corpus, AC-0c structured untouched); inherited by REQ-LF-7c overlay JSON (positional `col_0` descriptors).
- **B** (replace column-guesser / augment structured) → REQ-LF-5a `text_table_extractor.py` 0-byte-diff; redesign target = `generic_md_table_extractor.py`; REQ-LF-5c no new write to `bctc_table_rows`.
- **D** (schema inheritance = named fix) → REQ-LF-1 ROOT-CAUSE ANCHOR (FPT Q1 pages 3-6 one unit; page 41 anchor-collide proves geometry-spine), REQ-LF-2b page-5 inherits page-3 grid.
- **E** (pdf-extractor JSON / mcp-server toggle / boundary split) → REQ-LF-7 + REQ-LF-8 + REQ-LF-8f no Python import (DB read only).
- **F** (done-bar) → REQ-LF-4e DIRECT market.db arbiter (endpoint NEVER), 7-pt Done-Bar incl. USER verbal G9.
- **Privacy/host** → REQ-LF-6 (no external API, sequential single-doc, never `run_bctc_batch_sweep`) + NFR-1/2.

**3 architect-open Qs CORRECTLY DEFERRED** (recorded, NOT answered by me): zone+md schema vs `bctc_table_rows`; exact boundary JSON contract; quarantined-unit storage for QA direct-DB count. Architect resolves in LF-DESIGN.

Recurring-bug guard cleared — this redesign IS the root-cause rethink (9 MD-EXTRACT + 7 BT commits).

**Edits (working tree, NOTHING staged — main terminal commits):**
- docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md (PO approval entry)
- docs/TASKS.md (LF-BA DONE / LF-DESIGN READY)
- docs/agent-memory/notebooks/po.md (this)

**No code, no pilot-status JSON, no frozen surface touched.**

---

## Carry-over (next cycle)

- **NEXT = architect LF-DESIGN** (zone=`multi`, design-only no code): 4-tier blueprint, split at pdf-extractor↔mcp-server boundary, resolve the 3 open Qs, per-task ACs for LF-EXTRACT + LF-OVERLAY, brief → `docs/architecture-briefs/`.
- **At LF-EXIT (my next gate on this sprint):** do NOT rubber-stamp. Re-verify LIVE via DIRECT market.db (`docker compose exec -T mcp-server bun -e` + `bun:sqlite`) — endpoint can be stale. Check multi-doc Tier-3 pass-rate (not one doc), FPT Q1 p5 scramble fixed, `text_table_extractor.py` 0-byte-diff, overlay ON/OFF. **5 prior false-greens** on this surface — goal stays ARMED until USER verbal G9.
- **LF chain order:** architect(LF-DESIGN)→dev-pdf-extractor(LF-EXTRACT)+dev-mcp-server(LF-OVERLAY)→ops(LF-DEPLOY seq single-doc rebuild/recreate)→qa(LF-QA Tier-3 corpus via direct DB)→PO(LF-EXIT)→USER G9.
- **Lock note:** task_claim NOT acquirable from this thread (gateway ✓ but thread toolset = Read/Edit/Write/Bash + semble only). Single-user autonomous, non-fatal; chain dispatch is what matters. Re-attempt umbrella claim when next in a thread that surfaces the MCP call_tool proxy.

## Standing context (carry-over, NOT re-dispatch)
- **NEWS-INGEST-3 (qa) NEXT-READY**; **NEWS-INGEST-LIVE (ops)** OPEN (real VPS cycle inserts >0 NEW distinct VN rows); **NEWS-INGEST-2c (developer)** cosmetic UI backlog.
- DEPLOY-DRIFT (-1/-2 ops-rebuild, -3 architect guard) standing. BCTC-TABLE-3 CLOSED (BT3-EXIT2, 79 clean rows). BCTC-TABLE-2 + MCPZONE-HARDEN-1 stay SEPARATE — NOT folded into LAYOUT-FIRST. Standing routed: HSG-FIRE-SEVERITY-RECAL, MARKET-SLOTS-DARK, HOLLOW-RUN-20260525, CHEF-EOD-MACRO-MISATTRIB, context-bloat janitor, cowork-fire (expected-silent off-hours).

## PO order (binding): reliability → coverage → UX → architecture
- Self-initiate; full autonomy. Subagents leave files UNSTAGED; dispatcher commits under commit-mutex. Recurring-bug guard: ≥2 fix commits same module → BLOCK + architect rethink. HONEST counts only — verify SHAs/build-time. NOT-RUN panels are not green.
