# Decision Journal — Sprint FACTORY-INFRA-split-ssc-fetchers · dev-mcp-server

**Sprint goal:** Split ssc.ts (1029L at pickup) into per-portal disclosure fetcher modules — structural split only, no dedup-delete.
**Agent:** dev-mcp-server
**Started:** 2026-07-24T05:50:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T06:10:00Z
**task-id:** FACTORY-INFRA-split-ssc-fetchers
**what-done:** Split `ssc.ts` (1029L, bundled SSC+HOSE+HNX+UPCOM) into `sscCommon.ts` (SscDocument/HttpClient types, makeDefaultHttpClient, titleMatchesReportType), `sscPortal.ts` (SSC congbothongtin.ssc.gov.vn: buildSscSearchUrl/parseSscHtml/withBrowserLock/_runSscPath), `hoseDisclosure.ts`, `hnxDisclosure.ts`, `upcomDisclosure.ts` (one module per exchange portal). `ssc.ts` (1029L→186L) kept to `listSscDocuments`/`listSscDocumentsWithFlag` orchestration, re-exporting the full pre-split public surface so all 7 production + 16 test `from "ssc.js"` call sites are unaffected.
**what-considered:**
- Canonical backlog ticket (`FACTORY-INFRA-split-ssc-fetchers` in backlog-detail.json) specifies a `disclosures/` subfolder + `<=120L` per-file cap + separate `browserClient.ts`/`types.ts` — vs. the dispatcher's explicit instruction to mirror this session's flat-sibling-file + re-export-barrel newsNormalizer precedent (also un-capped: 236/387/503/61L). Followed the dispatcher's explicit, more recent instruction — it deliberately cites the already-validated in-session precedent over the older ticket text. **Flagging this divergence** (no `disclosures/` subfolder, `sscPortal.ts` at 388L exceeds the ticket's 120L guidance) for QA visibility.
- Name new HOSE/HNX modules `hose.ts`/`hnx.ts` (mirror portal name) — rejected: collides with existing unrelated market-price fetchers of the same name already in `infrastructure/fetchers/`. Used `hoseDisclosure.ts`/`hnxDisclosure.ts`/`upcomDisclosure.ts`.
- Export previously-private `_runSscPath`/`titleMatchesReportType` (needed cross-module) vs. duplicate bodies per module — chose export: duplication is exactly the follow-up dedup task's target.
**why-decision:** Code-only diff (comments/imports stripped, statement sets sorted) shows the ONLY delta vs. original is 3 functions gaining `export` + 5 re-export barrel lines in `ssc.ts` — zero logic drift.
**why-change:** No change from task brief. Honored the explicit no-dedup-delete scope note — did not consolidate `resolveUrl`/`resolveHoseUrl`/`resolveHnxUrl` or the 3× duplicated HOSE/HNX/UPCOM fetch shape; left for the follow-up dedup task.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T06:10:00Z
**task-id:** FACTORY-INFRA-split-ssc-fetchers
**what-done:** `bun tsc --noEmit` clean. Targeted 9-file ssc/disclosure suite: 85/85 pass (identical before/after). Full `bun test`: 14734 pass/40 skip/43 fail/46780 expect() calls — grep-confirmed zero fail-line overlap with ssc/sscPortal/sscCommon/hoseDisclosure/hnxDisclosure/upcomDisclosure; all 43 match today's documented pre-existing flaky classes (vps_push_log schema-drift, 5000ms MCP-client-timeout, deprecated 1302-technical-indicators) — within the 41-44 range already logged 2x today as flaky-not-deterministic. `gen-project-stats.ts --dry-run`: toolCount 184/cronJobCount 88 unaffected. Server boot probe (PORT=3099): health 200 toolCount=184, both dashboards (`/api/bctc-inspect`, `/dashboards/news-fetch/`) 200.
**what-considered:**
- Full `bun test` vs. targeted-only for G12 Gate 1 — ran both: targeted as fast loop during the `tlsPermissiveAgent` export-tightening edit, full suite as the final gate.
**why-decision:** Grep-verified fail-list overlap (not badge/summary trust) is this zone's standing verification bar.
**why-change:** No change from task brief.
