# Decision Journal — Sprint FIX-BCTC-BANK-BS-COLUMN-ORDER · qa

**Sprint goal:** Deep-verify dev-mcp-server's composite bank-form BS column-order + classifier + section-vocab fix (commits d69b13f41 + e73a53688) before review→done_verified promotion.
**Agent:** qa
**Started:** 2026-07-03T08:26:00Z

---

### STEP qa-S1 · qa · 2026-07-03T08:40:00Z
**task-id:** FIX-BCTC-BANK-BS-COLUMN-ORDER
**what-done:** Ran tsc --noEmit (clean), targeted 23-file superset of dev's claimed 22 (389 pass/0 fail incl. FIX-BCTC-BANK-BS-COLUMN-ORDER.test.ts standalone 16/0/54 expect, matches router re-run), full suite (14230 pass/42 skip/65 fail/6 errors, 1168 files, 620.76s), DDD+security+mock-guard scans, commit-scope re-check (7 files exact).
**what-considered:**
- Full-suite fail-count gate: used documented ceiling testBaselineFail=348 (65 << 348) per dispatcher correction, not a stale pass-count baseline.
- Grepped all 65 `(fail)` lines for bctc/bank/refinedMarkdown/parseVnNumber/column-order/detectSection keywords — zero hits; also mapped every fail line to its nearest preceding file-header via awk — all 65 map to unrelated pre-existing-flaky files (pollNews, VPS-proxy/logVpsPush, insider-transactions, telegram, foreign-flow, market-cap, climate-signal, MCP-SSE registration).
- One fail-cluster lives in a file literally named `1405b-bctc-vps-fixes.test.ts` (bctc in filename) — inspected directly: failures are in its "FIX 2 — logVpsPush" describe block (vps_push_log DB race), file does not import refinedMarkdownParser/bctcFormType/bctcRowRepair/parseVnNumber. Not a changed-domain regression.
- FIX-BCTC-BANK-BS-COLUMN-ORDER.test.ts produced zero console-log lines in the full-suite interleaved log (unlike its standalone run) — investigated: 878/1168 files in the full run print no header line at all (Bun only headers a file when it has stdout during that run), so silence is the norm, not an anomaly; fail-line-to-file mapping technique independently confirms 0 fails attributable to this file.
**why-decision:** Every regression-signal path (keyword grep, per-fail file mapping, direct inspection of the one filename false-positive) independently confirms zero changed-domain fails; ceiling gate (348) cleared by wide margin; tsc/DDD/security/mock-guard all clean; DJ-GATE-1 journal (dev-mcp-server) present with task-id.
**why-change:** n/a — verdict is PASS, no scope change. Per dispatcher's explicit BOARD BOUNDARY, did not touch orch-state `.task_board`/`.head` — router owns review→done_verified promotion.
