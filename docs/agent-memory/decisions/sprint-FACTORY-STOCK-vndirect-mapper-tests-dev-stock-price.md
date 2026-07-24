# Decision Journal - Sprint FACTORY-STOCK-vndirect-mapper-tests - dev-stock-price

**Sprint goal:** Backfill Tier1/Tier2 VnDirect mapper unit tests (guards the dedup)
**Agent:** dev-stock-price
**Started:** 2026-07-24T12:50:00Z

---

### STEP dev-stock-price-S1 - dev-stock-price - 2026-07-24T12:55:00Z
**task-id:** FACTORY-STOCK-vndirect-mapper-tests
**what-done:** Created vndirect-quote-mapper primitive with mapper.go + mapper_test.go covering 13 test cases.
**what-considered:**
- Test inline fetcher logic directly (rejected: HTTP coupled, not pure)
- Extract mapper to separate primitive (chosen: enables pure table-driven tests)
**why-decision:** Pure primitive with no HTTP dependency allows CGO_ENABLED=0 testing and guards future extraction.
**why-change:** no change

### STEP dev-stock-price-S2 - dev-stock-price - 2026-07-24T13:00:00Z
**task-id:** FACTORY-STOCK-vndirect-mapper-tests
**what-done:** Verified all 7 required test categories: HOSE/HNX/UPCOM scale, INDEX no-scale, empty array, malformed JSON, null pointers.
**what-considered:**
- Skip partial-null test (rejected: edge case could mask bugs)
- Include omitted-fields case (chosen: documents real-world JSON behavior)
**why-decision:** Comprehensive coverage protects against DSI-INV-1 regressions (0 vs nil confusion).
**why-change:** no change
