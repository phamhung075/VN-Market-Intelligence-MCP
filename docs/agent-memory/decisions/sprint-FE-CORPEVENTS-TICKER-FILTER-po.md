# Decision Journal — Sprint FE-CORPEVENTS-TICKER-FILTER · po

**Sprint goal:** Add ticker (stock code) filter to /dashboard/corporate-events per user request
**Agent:** po
**Started:** 2026-06-12T15:10:00Z

---

### STEP po-S1 · po · 2026-06-12T15:10:00Z
**task-id:** FE-CORPEVENTS-TICKER-FILTER
**what-done:** Verified live contract then created frontend-only SPRINT-S task for a ticker filter on the corporate-events page.
**what-considered:**
- frontend-only client-side (payload already carries events[].code)
- zone:multi adding a server ?symbol= param to mcp-server corporate-events endpoint
- populate selector from watchlist SSOT vs from payload codes
**why-decision:** Live probe (curl :3001, 237 events/46 codes) proves every event has .code → client-side filter mirrors existing filterEvents/category pattern (DRY); avoids touching CONTAM-9-held dev-mcp-server zone; payload IS the SSOT for codes-present so no hardcode/watchlist read.
**why-change:** no change from plan — scope expectation matched after contract verify.

### STEP po-S2 · po · 2026-06-12T15:41:44Z
**task-id:** FE-CORPEVENTS-TICKER-FILTER
**what-done:** Signed off sprint DONE after independently RAW-verifying QA's live evidence + re-probing the deployed page.
**what-considered:**
- APPROVE — 17/17 live Playwright DOM checks + my own probe (page 200, JS chunk D5xOiZx3 serves 'Chọn mã chứng khoán'/'Tất cả'/distinctCodes), all 10 ACs met, user request satisfied
- REJECT — no defect found; SSR-no-markers was expected client-hydration, not a fault
**why-decision:** User ask ("select stock to filter all event") met: 'Mã:' select, 'Tất cả' default + 46 sorted codes from live payload (no hardcode), client-side cascade with category+days, stale banner intact, 0 server fetches on change. Verified raw not via QA badge.
**why-change:** no change from plan — frontend-only ruling held end-to-end; zero api/mcp-server touch.
