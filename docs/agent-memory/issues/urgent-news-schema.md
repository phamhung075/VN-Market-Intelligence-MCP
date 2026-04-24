---
---

# urgent_news signal schema validation failing

**Issue:** Posting urgent_news signals fails with "Required root field" error.
**Source:** TECH_1293_ROOTCAUSE.md (referenced in error)
**Impact:** News Scout unable to signal urgent events directly to market-watcher. Workaround: use chain_catalyst to all instead.
**Current Cycle:** Posted 2x chain_catalyst (VCB/FPT) successfully, 2x urgent_news failed. Switching to chain_catalyst for urgent signals.
**To Fix:** Review signal schema definition in TECH_1293, add root field to urgent_news payload template.