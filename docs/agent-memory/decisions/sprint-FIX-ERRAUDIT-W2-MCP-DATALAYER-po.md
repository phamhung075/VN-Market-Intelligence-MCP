# Decision Journal — Sprint FIX-ERRAUDIT-W2-MCP-DATALAYER · po

**Sprint goal:** ERROR-AUDIT-2026-06-15 Wave-2 — kill the confidence_score=50 / fabricated-default class at source (safeQuery/runSection/failLoud + 9 fail-loud migrations).
**Agent:** po
**Started:** 2026-06-16T00:25Z

---

### STEP po-S1 · po · 2026-06-16T00:26:09Z
**task-id:** FIX-ERRAUDIT-W2-MCP-DATALAYER
**what-done:** Flipped W2-MCP-DATALAYER review[]→done_verified[] after own RAW re-verify in the running container (not badge trust).
**what-considered:**
- Trust qa APPROVE (b8f9e31e=HEAD) + upstream report alone → rejected: router-verify-raw-not-badges directive.
- RAW-probe container: image .Created 00:10:01Z post-dates commit 9f4a8eef; safeQuery.ts(5415B) typed {ok:false,reason} contract + failLoud[degraded]; scanMarket getAvgVolumeSync L103/117 → return null (NOT fabricated 0) — chosen.
**why-decision:** Live container carries new image + honest-null code confirms the fabricated-default class is killed for the 3 primary files; qa green + CI 31/31 (only pre-existing tsc) corroborate.
**why-change:** no change from plan.

### STEP po-S2 · po · 2026-06-16T00:26:09Z
**task-id:** FIX-ERRAUDIT-W2-MCP-DATALAYER
**what-done:** Folded qa's 15 out-of-scope surviving-bare-catch sites into the EXISTING FIX-ERRAUDIT-W3-MCP-P2 backlog row (no new task).
**what-considered:**
- Mint a fresh W3 task → rejected: W3-MCP-P2 already exists with sequence_after=W2 (ssot_duplicate_key trap).
- Annotate in-place with .folded_sites marker (idempotent) — chosen.
**why-decision:** Same anti-pattern, generic-across-sites mandate (/goal#2); one SSOT row, dedup-guarded.
**why-change:** no change from plan.

### STEP po-S3 · po · 2026-06-16T00:26Z
**task-id:** FIX-ERRAUDIT-W1-PEK-P0
**what-done:** Promoted W1-PEK-P0 backlog[]→ready[] (next_agent=ba) into the freed coding slot.
**what-considered:**
- Leave in backlog → rejected: dependency RASTERIZE=done_verified (po-s70), pdf-extractor zone FREE, coding WIP 0/2.
- Promote to ready for router lock-claim+spawn through ba→architect→dev chain — chosen; po did NOT spawn.
**why-decision:** P0 BCTC-silent-0-rows class (/goal#1); all hold-conditions lifted; free slot available.
**why-change:** no change from plan.
