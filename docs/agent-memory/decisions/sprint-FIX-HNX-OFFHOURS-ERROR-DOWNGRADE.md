# Decision Journal — FIX-HNX-OFFHOURS-ERROR-DOWNGRADE · dev-mcp-server

**Sprint goal:** Downgrade off-hours empty-result log from ERROR to DEBUG in HNX/UPCOM fetchers
**Agent:** dev-mcp-server
**Started:** 2026-06-21T01:41:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-21T01:41:00Z
**task-id:** FIX-HNX-OFFHOURS-ERROR-DOWNGRADE
**what-done:** Added clock-injectable `isVnTradingWindow` branch at both error emit sites in `hnx.ts`; extended `options` with `now?: Date`; wrote 6-test coverage file.
**what-considered:**
- only: single correct path — import SSOT `isVnTradingWindow` from `domain/services/tradingWindow.ts`; extend existing `options` param with `now?: Date` for test clock injection; no new files, no API change.
**why-decision:** Minimal-diff, zero scope creep: reuses the canonical domain helper that already defines Mon–Fri 02:00–08:59 UTC window; infra→domain pure import is explicitly allowed per DDD rules.
**why-change:** no change from plan; assertion strategy adjusted to absence-of-error (not presence-of-debug) because logger singleton minLevel=info filters debug before sink.
