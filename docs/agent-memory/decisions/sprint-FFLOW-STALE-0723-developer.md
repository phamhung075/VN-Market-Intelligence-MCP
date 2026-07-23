# Decision Journal — Sprint FFLOW-STALE-0723 · developer

**Sprint goal:** PART A (ops-vps-fetch) recover Vinahost VPS for vn-foreign-flow.service (suspended for non-payment, now paid/resumed); PART B (developer) build the persistent calendar-aware freshness recheck harness that gates PART A's "assume complete fixed" declaration.
**Agent:** developer
**Started:** 2026-07-23T16:24:43Z

---

### STEP developer-S1 · developer · 2026-07-23T16:24:43Z
**task-id:** FFLOW-STALE-0723-B-RECHECK-HARNESS
**what-done:** Built `scripts/check-foreign-flow-freshness.sh` — probes get_market_foreign_flow via mcp-call.sh, computes LCTS by shelling into the live `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` module (bun -e), verdict PASS(0)/STALE(2)/ERROR(3).
**what-considered:**
- Reimplement VN holiday calendar in bash — rejected: AC-B6 forbids hardcoded holiday list; module already exists and is pure (no infra imports).
- Call MCP `is_trading_day` tool via gateway — rejected: tool is deregistered (DWF-PHASE1 unshipped), zero live claims; domain fn still importable directly.
- Shell out to `bun -e` importing vnTradingCalendar.ts from apps/mcp-server (chosen) — reuses canonical SSOT, precedent in scripts/ops-bctc-enrich-reverify-pulljob.sh (docker exec bun -e pattern), no duplicated logic/drift risk.
**why-decision:** Only path that satisfies "reuse canonical source, no hardcode" (AC-B6) while staying a standalone bash script callable from cron/CI.
**why-change:** Hit + fixed a real bash bug during implementation: a single-quoted heredoc nested inside `"$(...)"` (itself inside outer double quotes) is NOT quote-inert when the body has an odd apostrophe count (e.g. "isn't") — bash's outer double-quote scan breaks with "unexpected EOF while looking for matching `'`". Fixed by capturing the heredoc into a plain variable first, then passing `"$js_src"` (no nested quote context). Documented inline as a NOTE in the script.
