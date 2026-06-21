# Decision Journal — Sprint FE-PAGE-REORG · dev-macro-indicators

**Sprint goal:** FE page reorganisation + DSI-INV-1 data-integrity fixes
**Agent:** dev-macro-indicators
**Started:** 2026-06-21T00:00:00Z

---

### STEP dev-macro-indicators-S1 · dev-macro-indicators · 2026-06-21T01:10:00Z
**task-id:** DSI-MACRO-PHANTOM-STALE-GUARD
**what-done:** Fixed staleness gate for news-mined macro indicators served via buildMacroSection — tightened tracked_indicators window from 48h to 4h using epoch-seconds SQL comparison to bypass ISO-8601 'T' vs space separator ordering trap.
**what-considered:**
- Option A: tighten 48h → 4h (chosen) — matches macro refresh cadence, eliminates phantom carry-over
- Option B: add [STALE] label to rows >4h — cosmetic fix only, phantom values still served to agents
- Option C: drop WTI/dow from tracked_indicators entirely — incomplete, breaks legitimate fresh extractions
**why-decision:** Option A is the only path that stops phantom stale values being served as "current". The R-2 SQLite datetime comparison trap (ISO 'T' > space) was the hidden amplifier — needed epoch-seconds fix to make the gate actually work.
**why-change:** No change from plan; fix spec matched implementation cleanly.
