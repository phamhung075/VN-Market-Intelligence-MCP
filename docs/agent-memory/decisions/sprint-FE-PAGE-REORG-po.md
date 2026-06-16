# Decision Journal — Sprint FE-PAGE-REORG · po

**Sprint goal:** FE-PAGE-REORG (active); this cycle scopes the cross-cutting ERROR-AUDIT-2026-06-15 epic (ambient to the sprint).
**Agent:** po
**Started:** 2026-06-15T21:24:00Z

---

### STEP po-S1 · po · 2026-06-15T21:24:00Z
**task-id:** FIX-ERRAUDIT-W1-MCP-P0
**what-done:** Minted the 3-wave error-handling audit epic (7 tasks) and dispatched the dev-mcp-server P0 pair into the 1 free coding lane; queued the pdf-extractor P0 pair behind the active same-zone lane; backlogged Waves 2-3.
**what-considered:**
- Dispatch mcp-server P0 pair first (free lane, no fetch surface, lowest-risk Wave-1) vs pdf-extractor P0 pair — pdf-extractor zone is ACTIVELY edited (FIX-BCTC-BANK-PDF-OCR-RASTERIZE in_progress) → same-zone serialization forbids a concurrent agent.
- Mint pek P0s at all vs skip-as-duplicate — RAW-checked: active commits fffef229/56129626 touched ocr_adapter.py + test + docs ONLY; pek_engine_adapter.py:668/:342/:717 unmodified on disk → DISTINCT, real, must mint (queued not dispatched).
- Promote Wave-2/3 to ready vs backlog — backlog; promoting would invite WIP>2 fan-out (host-starvation lesson). ba→architect grooms later.
**why-decision:** dev-mcp-server P0 pair is the safest Wave-1 first dispatch (pure error→marker, no fetch surface, the only free coding lane); pek pair correctly queued via blocked_by to honor same-zone-serialization + WIP≤2.
**why-change:** Board has no `todo` array (brief said "todo"); mapped to live lifecycle: dispatch→in_progress, same-zone-queue→ready+blocked_by, ungroomed→backlog.

### STEP po-S2 · po · 2026-06-16T01:30:00Z
**task-id:** FIX-ERRAUDIT-W1-PEK-P0
**what-done:** Signed off W1-PEK-P0 done_verified (po-s73 atomic dual-mutation) → Wave-1 complete; promoted W2-FRONTEND-SAFEFETCH backlog→ready + set head=ba; decided PUSH-NOW.
**what-considered:**
- done_verified vs reject — QA cycle-274 APPROVED + router RAW-verified live DB (161 healthy/14 quarantined real varied reasons) + pytest 42/0 docker-exec + image .Created > commit; absent paddle/table-extraction strings correctly fire only under forced failure (sentinel-injected per architect matrix) = contracted DoD, not a gap. AC-1..7 + EC-1 met → concur.
- Next wave: W2-FRONTEND (sequence_after dep done_verified, distinct zone) vs W3-MCP-P2 (still backlog, brief orders W2 before W3) → W2-FRONTEND ba first.
- PUSH-now vs hold — 13 local commits all benign chore/RAW-verified fix; the 106-behind divergence is 100% cloud-chore (health-recheck/TNB/memory); a deferred sign-off is honest-done; no CI-red gate, no conflict surface on touched files → push-now.
**why-decision:** Whole W1-PEK chain RAW-verified green; the only reason push was held was the deferred-call policy, not a real blocker — clearing it now publishes a completed wave + unblocks the router's lock-claim for the ba hop.
**why-change:** no change from plan — W2-FRONTEND was the pre-specced next wave hop (sequence_after gate now satisfied by the done_verified mcp-server deadlines).
