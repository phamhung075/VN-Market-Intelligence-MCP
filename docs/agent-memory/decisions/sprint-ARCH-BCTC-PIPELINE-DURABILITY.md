# Decision Journal — ARCH-BCTC-PIPELINE-DURABILITY

**task_id:** ARCH-BCTC-PIPELINE-DURABILITY
**date:** 2026-06-16T11:00Z
**agent:** architect
**mode:** SPIKE (design only)

---

## What was considered

**Contract 1 — Zero-result alerting:**
- Option considered: per-ticker alert on every 0-URL miss. Rejected — noisy, fires legitimately when a ticker has not filed. Generic aggregate (all-fleet-zero for 2+ cycles) is the correct discriminator.
- Option considered: alert in VPS crawl script directly. Rejected — VPS script has no Telegram gateway; adds a dependency surface. mcp-server enricher layer is the correct alert boundary.
- Chosen: consecutive-zero counter in SQLite, escalate at cycle 2 during active earnings window (queue has pending rows).

**Contract 2 — Freshness gate:**
- Option considered: replace passive with marketHoursOnly-style guard. Rejected — BCTC is not market-hours scoped; it is earnings-window scoped.
- Chosen: `latestTimestampSql` on `MAX(last_attempt) WHERE status='done'`, threshold 24h, guarded by queue-non-empty check. Additive `queueGuardSql` field on FreshnessConfig — non-breaking.
- why-change: prior passive=true was deliberately set because "BCTC has no realtime table." Post-fix: `bctc_vps_queue.last_attempt` IS a reliable freshness proxy because the pull job always writes `last_attempt` on each successful push.

**Contract 3 — Enrich fail-loud:**
- 989654f2 already implements the mcp-server leg. The only gap is production sendBugFn wiring (which could be un-wired in the scheduler cron caller). Did not add a new fail-loud mechanism in the VPS script — Contracts 1 + 2 provide the aggregate coverage; duplicating alerts at the VPS layer would require the script to have Telegram credentials.
- Ruling: Contract 3 = verify production wiring + Contract 1 handles the aggregate escalation.

**Contract 4 — ADF-brittleness:**
- No new monitoring layer designed. Rationale: Contracts 1 + 2 already cover the symptom class (discovery returns 0) within 30 min / 24h respectively. Adding a third "brittle-regex detector" would instrument the internals of the Python script (not in architect scope; no reliable mechanism).
- Sub-risk A (hardcoded afrLoop fallback default) is a co-located note inside FIX-HNX-SESSION-COOKIE scope.

## why-change (overall)
Pattern reuse: FreshnessConfig / checkServiceFreshness already handles 4 other services identically. BCTC is the only service missing active freshness — consistent addition. No new interface; no new service zone.

## BUILD-STANDARD rationale
not-applicable: all 5 child tasks are bug-fix/hardening in existing zones (apps/mcp-server/, vps-scripts/). No new microservice, no new MCP tool.
