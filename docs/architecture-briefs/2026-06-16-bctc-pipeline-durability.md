# BCTC Pipeline Durability — Architect Brief

**Date:** 2026-06-16
**Task:** ARCH-BCTC-PIPELINE-DURABILITY (SPIKE, P1)
**Investigator:** architect
**Mode:** read-only; no production changes; no board mutations
**Extends:** 2026-06-12-bctc-ctg-fleet-serve-gap.md (refine cron gap) + 2026-06-12-bctc-refine-state-machine-ruling.md (state-machine)
**Timebox:** 120 min

---

## Executive Summary

The 2nd recurrence of BCTC-VPS-PIPELINE-STALE (Root A: afrLoop prefix rollover, 34h outage) shares one structural root with three unresolved issues (Root B: HNX session cookie, Root D: SSC c111 empty, enrich silent-0-rows): **the pipeline has NO active health signal that distinguishes "source is broken" from "ticker has not filed."** Passive TCP-ping health (`passive: true` in `vpsHealthPoller.ts:169`) says the service is alive regardless of data-push age. The enricher's per-ticker 0-URL warn-log exists but is never escalated. A 0-rows enrich marks the queue row `done` (fixed in 989654f2 for the mcp-server leg; the VPS-crawl side still has no fail-loud boundary). This brief defines the four contracts that the held FIX tasks implement.

---

## Brownfield Evidence (code-confirmed)

### Layer map of the pipeline

```
[VPS cron 6h]
  discover-bctc-urls-browser.py (vps-scripts/)
    _discover_ssc() — 3-step ADF: GET loopback → GET ADF page → POST search
    _discover_hnx_upcom() — stateless POST (missing session GET — Root B)
    _ssc_parse_rows() — c111 for title matching (empty for state filers — Root D)
       → pushes source_url to mcp-server via HTTP /bctc-files/

[mcp-server scheduler — every 15 min]
  bctcQueueEnricherJob.ts (interface/scheduler)
    runBctcQueueEnricherJob()
      → discoverHosePdfUrls() [domain/services/bctcDiscovery.ts]
      → writes source_url to bctc_vps_queue
      → logs WARN "0 URLs found" per ticker (NOT escalated)
      → if ALL tickers return 0: logs aggregate WARN (line 414-416) — NEVER alerted

  bctcPdfPullJob.ts (interface/scheduler)
    → pulls PDF via source_url from VPS
    → calls pushBctcExtraction
    → 0-rows enrich: marks enrich_failed (989654f2 FIXED for mcp-server)
    → result.enrichFailed counter exposed in RunResult

[domain/services/vpsHealthPoller.ts]
  vn-bctc-fetch: { passive: true }  ← always returns "healthy" regardless of push age
  vn-bctc-fetch has NO latestTimestampSql, NO maxAgeMs
```

### Gap confirmed: zero-result alerting path

`bctcQueueEnricherJob.ts` line 414:
```typescript
if (result.itemsProcessed > 0 && result.urlsPopulated === 0) {
  logger.warn(`[bctcQueueEnricher] 0 URLs populated …`);
  // ← logger.warn only. No alert. No counter persisted. No escalation.
}
```

During the 34h afrLoop outage, this warn fired ~136 consecutive times (`34h × 4 cycles/h`) without any escalation reaching ops. The alert would have fired within 30 min of the first cycle if Contract 1 existed.

### Gap confirmed: freshness health passive

`vpsHealthPoller.ts` DEFAULT_FRESHNESS_CONFIGS[4]:
```typescript
{ serviceName: "vn-bctc-fetch", description: "…", passive: true }
```
`checkServiceFreshness()` returns `{ healthStatus: "healthy" }` immediately for passive entries without any DB query. The BCTC pipeline has been stale for 34h and health reports "healthy."

### Gap confirmed: enrich fail-loud incomplete

`bctcPdfPullJob.ts` — 989654f2 added `enrich_failed` status write + `logger.error`. But:
1. The `sendBugFn` (optional injectable) is wired in production only if the caller passes it. Whether the job scheduler actually wires `sendBugFn` to a real Telegram send must be verified by dev-mcp-server during implementation.
2. The VPS-side crawl script (`discover-bctc-urls-browser.py`) has no fail-loud boundary — it returns `[]` for 0 results, logs to stdout, and the VPS cron proceeds silently.

### Gap confirmed: ADF-brittleness detection latency

The afrLoop rollover was undetectable until a human noticed the 34h outage. The regex `r"(26\d{14,16})"` failed silently — the script returned empty results, which are indistinguishable from a legitimate no-filing condition. The fix (`r"(\d{15,18})"`) was a one-cycle patch. The next counter transition (28xxx prefix, or any format change) will recur under the same gap.

---

## The Four Contracts

### Contract 1 — DURABLE ZERO-RESULT / FRESHNESS ALERTING

**Problem class:** `passive_health_masks_dead_data` — the pipeline cannot tell "no filing" from "discovery is broken" at the aggregate level.

**Contract:**

1. **Consecutive-zero counter (discovery layer, mcp-server):** `bctcQueueEnricherJob` must persist a consecutive-zero-URL cycle counter in SQLite (table `bctc_health_state` OR an existing KV table — dev-mcp-server decides). Reset to 0 when any cycle has `urlsPopulated > 0`. Increment when `urlsPopulated = 0 AND itemsProcessed > 0`. Do NOT count cycles where `itemsProcessed = 0` (empty queue = legitimate idle, not an alert condition).

2. **Alert threshold:** When `consecutive_zero_cycles >= 2` during an **active earnings window**, fire one Telegram BUG alert (`send_telegram(channel="bug")`). Definition of active earnings window: at least one queue row in `bctc_vps_queue` WHERE `status IN ('pending', 'url_not_found')`. This prevents false alerts when the queue is genuinely empty (all tickers resolved or off-season).

3. **Dedup guard:** Alert fires at most once per 6h window (store `last_alerted_at` in the same KV/health-state row). After alert fires, do not re-alert until `urlsPopulated > 0` AND then zero-cycles again.

4. **Generic invariant:** The counter is aggregate across all tickers, not per-ticker. A partial-success cycle (some tickers URL-found, some not) resets the counter to 0 — partial success means discovery is working. Only a full-fleet-zero triggers escalation.

**DDD layer:** `bctcQueueEnricherJob.ts` (interface/scheduler) reads/writes the counter; alert send call goes through the existing `send_telegram` gateway. No domain layer change.

**Maps to:** FIX-BCTC-ZERO-URL-ALERT

---

### Contract 2 — FRESHNESS HEALTH GATE (last_success_age, not passive liveness)

**Problem class:** Same root as Contract 1 but at the health-reporting layer — `passive: true` hides stale BCTC data behind a "healthy" badge.

**Contract:**

1. **Replace passive with active freshness query for `vn-bctc-fetch` in `DEFAULT_FRESHNESS_CONFIGS`:**

```typescript
{
  serviceName: "vn-bctc-fetch",
  description: "BCTC financial reports — active freshness (last_success_age)",
  latestTimestampSql: `
    SELECT MAX(last_attempt) AS latest_at
    FROM bctc_vps_queue
    WHERE status = 'done'
  `,
  maxAgeMs: 24 * 60 * 60_000,  // 24 hours
}
```

2. **Earnings-window guard:** BCTC is a batch process, not a real-time feed. Outside earnings window (when `bctc_vps_queue` has 0 rows with `status IN ('pending','done')`) the check must return `"idle"` not `"unhealthy"`. Gate: query `SELECT COUNT(*) FROM bctc_vps_queue WHERE status IN ('pending','url_not_found','enrich_failed')` before evaluating staleness — if count = 0 AND no recent `done` rows in last 7 days, return `"idle"`. Add an `earningsWindowOnly?: boolean` flag to `FreshnessConfig` (or a `queueNonEmptyGuardSql` field) to express this without hardcoding in the domain service.

3. **Threshold:** 24h. Rationale: VPS push cron runs every 6h; 24h = 4 missed cycles = definitively broken, not just delayed.

4. **Generic invariant:** The `latestTimestampSql` keys on `bctc_vps_queue.last_attempt WHERE status = 'done'` — no ticker name, no date literal, no exchange filter. Works for any ticker fleet.

**DDD layer:** `vpsHealthPoller.ts` (domain service) — config change only. `FreshnessConfig` interface may need a `queueGuardSql` field (additive, non-breaking). `checkServiceFreshness()` gains one branch for earnings-window guard (pure, injectable DB).

**Maps to:** FIX-BCTC-FRESHNESS-GATE

---

### Contract 3 — ENRICH FAIL-LOUD

**Problem class:** `silent_swallow_serial_bugs` — a 0-rows enrich advances the queue silently, masking broken parse paths.

**This contract applies to TWO independent layers:**

#### Layer A: mcp-server `bctcPdfPullJob.ts` (989654f2 — already REVIEW)

The `enrich_failed` status write is implemented. The outstanding verification item:
- `sendBugFn` must be wired in the production scheduler call (`bctcPdfPullJob.ts` or its caller cron) — not just injectable-but-not-injected. Dev-mcp-server must confirm the production wiring sends to `channel="bug"`.

#### Layer B: VPS crawl `discover-bctc-urls-browser.py` (NEW)

The VPS crawl script currently has no equivalent fail-loud boundary. It returns `[]` on 0-result discovery and logs to stdout. The VPS cron invokes it as a subprocess — the mcp-server's Contract 1 (consecutive-zero counter) provides the escalation layer for this. Therefore Layer B does NOT require a separate fail-loud mechanism inside the Python script; the aggregate counter at the mcp-server enricher layer is the boundary.

**Rationale:** The fail-loud requirement is satisfied at the FIRST gate that has alert capability (mcp-server). Duplicating alerts inside the VPS script would require the VPS to have Telegram access, creating a new dependency surface. The existing `enrich_failed` status write provides the row-level signal; Contract 1 provides the escalation.

#### Combined fail-loud boundary definition:

```
Enrich result        | Queue row status | Alert path
---------------------|-----------------|---------------------------------------
0 table_rows AND     | enrich_failed    | Contract 1 counter (aggregate)
0 md_tables returned | (NOT done)       | + sendBugFn per-row (Layer A, prod wired)
---------------------|-----------------|---------------------------------------
>0 rows returned     | done             | none (success path)
---------------------|-----------------|---------------------------------------
Fetch error (HTTP)   | error / retry    | existing bctcPdfPullJob error path
```

**Generic invariant:** The 0-rows gate is on the raw extraction result counts, not on ticker identity, bank form type, or exchange. `bctc_table_rows = 0 AND bctc_md_tables = 0` is the universal signal — applies equally to B02-TCTD bank forms, HOSE/HNX/UPCOM, any quarter.

**Maps to:** FIX-BCTC-ENRICH-SILENT-0ROWS (REVIEW, outstanding: prod sendBugFn wiring verification)

---

### Contract 4 — ADF-BRITTLENESS MONITORING

**Problem class:** Source-side counter/token/session changes break the discovery script silently within the same cron cycle; the outage is detected only when a human notices stale data (34h lag in this incident, 5d in the prior one).

**This contract is satisfied by Contracts 1 + 2 together** — they provide detection within 1 cron cycle (Contract 1: fires at the 2nd consecutive-zero cycle = 30 min after first broken cycle; Contract 2: fires at 24h via health gate). No additional monitoring layer is required.

**However, the brittleness CLASS has two sub-risks that the child fixes must address to be durable:**

#### Sub-risk A: afrLoop prefix rollover (Root A — fixed for 26→27, but will recur)

The fix `r"(\d{15,18})"` eliminates the prefix dependency. But the fallback default `"27000000000000000"` is still a hardcoded prefix value. Dev-vps-crawls must ensure the extraction logic has NO hardcoded prefix as a fallback — if the regex fails to extract, the behavior must be a logged failure (return `[]` immediately) not a silent retry with a stale counter. The script's step2 already handles "ViewState not found" gracefully with a logged error, so this is a matter of removing the hardcoded fallback default from the fix.

**Scope:** This is inside FIX-HNX-SESSION-COOKIE scope (same file, same dev) — add as a co-located hardening note in the task, NOT a new child task.

#### Sub-risk B: Session cookie requirements change (HNX — Root B)

The session cookie is established per-call. If HNX changes the referrer URL or cookie name, the `_discover_hnx_upcom()` GET will still succeed (returns 200) but the subsequent POST may return 302 again. Detection: Contract 1's consecutive-zero counter at the mcp-server layer will catch this within 30 min (2 cycles) — no additional VPS-side monitor needed.

**Monitoring resolution:** Contract 1 catches any discovery script failure within `2 × cron_interval` (currently 15 min → 30 min detection; 6h VPS cron → 12h detection). The 34h gap is reduced to at most 12h (VPS cron cadence) for VPS-side failures, 30 min for mcp-server enricher failures.

**Maps to:** FIX-HNX-SESSION-COOKIE (sub-risk A co-located) + FIX-SSC-C111-EMPTY-FALLBACK (same file, same cycle)

---

## Child Fix → Contract Mapping

| Child Task | Contract | Layer | Notes |
|---|---|---|---|
| FIX-HNX-SESSION-COOKIE (P1) | Contract 4 (ADF-brittleness) | VPS crawl | Session GET before POST in `_discover_hnx_upcom()`. Co-locate: remove hardcoded fallback from afrLoop fix. |
| FIX-SSC-C111-EMPTY-FALLBACK (P1) | Contract 4 (ADF-brittleness) | VPS crawl | c111-empty → c3 fallback in `_ssc_parse_rows()`. Same file, same dev cycle as HNX fix. |
| FIX-BCTC-ZERO-URL-ALERT (P2) | Contract 1 (zero-result alerting) | mcp-server scheduler | Consecutive-zero counter + Telegram BUG alert. Earnings-window guard. |
| FIX-BCTC-FRESHNESS-GATE (P2) | Contract 2 (freshness health gate) | mcp-server domain | Replace `passive:true` with active `latestTimestampSql` on `bctc_vps_queue`. |
| FIX-BCTC-ENRICH-SILENT-0ROWS (REVIEW) | Contract 3 (enrich fail-loud) | mcp-server scheduler | `enrich_failed` write confirmed (989654f2). Outstanding: verify `sendBugFn` wired in prod. |

---

## Implementation Constraints

### /goal#2 — Generic, no per-ticker allowlist

All five contracts express conditions in terms of row-level data (status columns, aggregate counts, timestamp MAX) with no ticker name filter, no exchange discriminator, no date literal, no bank-form type exception. The earnings-window guard in Contract 2 uses `COUNT(*)` across the whole queue — same result whether 1 or 100 tickers are in queue.

### /goal#1 — Honest gap over silent empty

Contract 3 enforces this: `enrich_failed` is honest. A caller receiving `enrich_failed` status from a queue row knows the enrichment did not produce data — it is not silently masked as `done`. Contract 1 escalates the signal so a human can intervene. The 989654f2 `enrich_failed` write is the correct architecture; the gap is production wiring (sendBugFn) and the VPS-layer equivalent.

### Existing patterns reused

- `FreshnessConfig.passive` → extended with `earningsWindowOnly` or `queueGuardSql` flag (additive, non-breaking)
- `checkServiceFreshness()` pattern (DB query → age comparison) already handles the `vn-price-fetch` pattern; BCTC is the same shape with an earnings-window guard
- `BctcQueueEnricherRunResult.urlsPopulated` already exposed — counter increments/resets are additive state written adjacent to the existing result accumulator

### No new services, no new MCP tools

All four contracts are implemented within existing files:
- `vpsHealthPoller.ts` (config extension)
- `bctcQueueEnricherJob.ts` (counter + alert path)
- `bctcPdfPullJob.ts` (prod wiring verification for sendBugFn)
- `vps-scripts/discover-bctc-urls-browser.py` (session GET + c3 fallback + fallback-default removal)

### Schema addition (Contract 1 only)

A persistent consecutive-zero counter requires one of:
- A new row in an existing KV/config table (preferred — no migration needed if such a table exists)
- A new `bctc_health_state` table (single-row, CREATE IF NOT EXISTS — no migration risk)

Dev-mcp-server chooses; the brief does not prescribe the exact table name.

---

## Risk Flags

**RF-1 (MEDIUM) — Contract 2 earnings-window guard:** If `bctc_vps_queue` is truncated or all rows permanently `url_not_found`, the guard may incorrectly return `idle` rather than `unhealthy`. Dev must verify the guard reads both `done` (freshness) AND `pending/url_not_found` (active queue) to distinguish "queue empty = off-season" from "queue empty = queue was wiped."

**RF-2 (LOW) — Contract 1 dedup guard state loss:** If mcp-server container restarts, the in-DB counter survives. If the table is in-memory or wiped on restart, the alert may not fire on the expected 2nd cycle. Guard: counter must be persisted in SQLite, not in-process memory.

**RF-3 (LOW) — Contract 4 VPS-cron cadence:** The VPS cron runs every 6h. Contract 1 is at the mcp-server enricher (15 min cadence). For VPS-side failures (the afrLoop class), detection is limited by the VPS cron interval, not the mcp-server enricher. Contract 1 fires when the enricher sees 0 URLs from its own discoverHosePdfUrls() calls — but the enricher's `discoverHosePdfUrls()` does NOT invoke the VPS Python script directly. The enricher uses `bctcDiscovery.ts` (hsx.vn iboard + cafef fallback). The VPS script is a separate path. So Contract 1 catches enricher-side discovery failures; VPS-crawl failures propagate through the queue (no new source_url written → queue stays pending) which Contract 2 catches at the 24h freshness threshold. The monitoring gap for VPS-side failures is up to 24h — this is acceptable (down from 34h+ in the current state) given the 6h push cadence.

**RF-4 (LOW) — SSC afrLoop fallback default removal:** The fallback default `"27000000000000000"` acts as a circuit-breaker for the afrLoop regex failure. Removing it means step 1 failure causes an immediate empty return for that ticker. This is correct behavior (fail-loud-per-ticker) and reduces false-discovery noise, but dev must verify the `"ViewState not found"` guard remains intact so step 2 does not attempt a search with a null loop value.

---

## BUILD-STANDARD: not-applicable

All changes are bug-fixes / hardening to existing service zones. No new service. No new interface in a new zone. All four fix tasks are in-zone (apps/mcp-server/ or vps-scripts/).

---

## Appendix — Recurrence Class Evidence

The afrLoop prefix rollover is the second recurrence of the same class:
- Recurrence 1: first reported as BCTC-VPS-PIPELINE-STALE-5D (resolved by one-time flush, no hardening)
- Recurrence 2: 34h outage 2026-06-13T23:45Z → 2026-06-15T17:08Z

Root cause quote from recon.md: "The pipeline is a fragile regex-based session impersonation of Oracle ADF. Any counter prefix change or server-side session requirement change breaks it silently with 'no PDF found' — indistinguishable from a legitimate no-filing result. There is NO active-freshness health gate: the system cannot tell the difference between 'ticker hasn't filed' and 'discovery script is broken.'"

This brief's four contracts directly resolve that structural gap.
