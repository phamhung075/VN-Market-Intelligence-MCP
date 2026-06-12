# Decision Journal — Sprint QUE-TOOLTIP-DRY · architect

**Sprint goal:** Hexagram tooltip DRY + single SSOT — QueName everywhere, one canonical description source
**Agent:** architect
**Started:** 2026-06-12T09:00Z

---

### STEP architect-S1 · architect · 2026-06-12T09:00Z
**task-id:** ARCH-QUE-TOOLTIP-DRY
**what-done:** Resolved BLOCKER-1 (SSOT mechanism), BLOCKER-2 (FlipRow scope), confirmed BLOCKER-3 pre-ruled; produced 3-subtask zone-multi design
**what-considered:**
- BLOCKER-1 Option A: add `GET /que-reference` bulk endpoint to kinh-dich-service Go router; gen-que-descriptions.ts calls it at build time
- BLOCKER-1 Option B: parse committed static `que-reference.js` file directly in gen-que-descriptions.ts; hexagramLibrary.ts becomes annotated downstream
**why-decision:** Option B wins — que-reference.js is a committed static file parseable with two string ops + JSON.parse; zero network dependency at codegen time; Option A requires Go service running during `bun run gen:que` = brittle CI + developer friction. Text drift already confirmed (quẻ 1 coreMeaning differs between sources), making current state a live defect. Option B is the lowest-risk fix with strongest SSOT guarantee.
**why-change:** FlipRow deferred: KinhDichFlip DTO has no hexagram numeric ids; migration requires separate DTO + API change per PO-Q4 guidance.
