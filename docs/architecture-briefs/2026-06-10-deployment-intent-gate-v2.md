# Architecture Brief: Deployment-Intent Gate v2

**Date:** 2026-06-10
**Author:** architect
**Status:** READY FOR PO SIGN-OFF
**Feeds:** po (policy sign-off) → system-auditor merge-writer (apply checks, probe live, recompute summary) → router push
**Scope:** docs/data/quality-checklist.json — 6 CAP-SVC-* capability blocks only
**Constraint:** standalone containers REMAIN undeployed (HONOR-PANIC-GUARD: 16GB host, kernel-panic record project_host_memory_panic)

---

## 1. Root Error: Single-Axis Conflation

The original deployment-intent gate collapsed two orthogonal concerns into one INFO check per service:

> "Is `<service>` correctly identified as undeployed-by-design?"

This is tautological — it answers itself from the same field it reads (`host_runtime_set.not_deployed_by_design`). It provides zero signal about whether the capability the service embodies is functioning. The check excuses the entire service by confirming its container is off, masking 5 live-in-monolith capabilities and 1 genuinely dark capability.

The compounding error is in the SSOT `_note` at `docs/data/system-map.json .project.infrastructure.docker.host_runtime_set`:

> "auditor must report them INFO/grey, never CRITICAL/WARN"

This blanket instruction was correct for the CONTAINER-RELIABILITY axis only. The audit framework misread it as applying to all audit dimensions for those services.

---

## 2. Two-Axis Policy (v2)

Each of the 6 undeployed-by-design services is assessed on exactly two orthogonal axes. The axes are independent — a service can be PASS on capability while its container is INFO (by design).

### Axis A — Container Reliability (1 check per service, always INFO)

**What it checks:** Is the standalone container correctly absent (not silently crashed), and does the system have no hidden hard-dependency on it?

**Scoring:** Always INFO/grey. Reason: absence is intentional per HONOR-PANIC-GUARD. No WARN/CRITICAL is justified for the container not running.

**Honest question template:**
> "The `<service>` standalone container is intentionally not running (HONOR-PANIC-GUARD, 16GB host). Is its capability served by mcp-server without a silent hard-dependency on the absent container?"

**Recheck:** `docker ps --filter name=<container> | wc -l` confirms absent (expected: 1 = header only). Cross-reference `system-map.json .host_runtime_set.not_deployed_by_design` confirms intent is documented.

### Axis B — Capability (N checks per service, scored PASS/WARN/FAIL on live evidence)

**What it checks:** The actual capability the service was designed to provide — is it functioning, fresh, and observable through the mcp-server monolith via the documented `capability_manifest` probe?

**Scoring:** PASS/WARN/FAIL based on live probe results. NEVER auto-INFO. For the dark service (rag): WARN/NEEDS-REVIEW with written rationale.

**Mandatory dimensions per live capability:**
- Functional Suitability (does the probe return expected shape/content?)
- Data Freshness/SLA (is the data current within declared SLA?)
- Graceful Degradation (does failure mode degrade cleanly, not crash or fabricate?)

**Additional dimensions where the manifest supports a probe:**
- Correctness (spot-check a known-value assertion)
- Observability (does the probe surface enough metadata to detect problems without reading logs?)

---

## 3. SSOT _note Correction

**Current text** (docs/data/system-map.json line 662):
```
"_note": "Services INTENDED to run on this 16GB Mac host. Full fleet kernel-panics (project_host_memory_panic). Services absent from this set are defined-in-repo but NOT deployed by design — auditor must report them INFO/grey, never CRITICAL/WARN."
```

**Corrected text** (system-auditor merge-writer applies this as part of the checklist update, NOT this brief):
```
"_note": "Services INTENDED to run on this 16GB Mac host. Full fleet kernel-panics (project_host_memory_panic). Services absent from this set are defined-in-repo but NOT deployed by design — for the CONTAINER-RELIABILITY axis only, auditor reports INFO/grey (absent container is intentional, never CRITICAL/WARN). The CAPABILITY axes (Functional Suitability, Freshness, Graceful Degradation, Correctness, Observability) MUST be probed live via capability_manifest and scored PASS/WARN/FAIL on real evidence."
```

This is a one-field edit to system-map.json. The system-auditor merge-writer owns this change (same commit window as quality-checklist.json update).

---

## 4. Per-Service New Check Definitions

Legend for table:
- `dimension` — audit dimension label
- `probe_tool` — exact mcp tool name from capability_manifest (bare name)
- `probe_args` — arguments to pass
- `expected` — what PASS looks like
- `severity` — CRITICAL / WARN / INFO
- `zone_owner` — from system-map.json zones

---

### 4.1 CAP-SVC-STOCK-PRICE (short_key: stock, probe: get_market_snapshot)

Capability: live — VN-Index snapshot confirmed 2026-06-02.

| check_id | dimension | question | metric | expected | probe_tool | probe_args | severity | zone_owner |
|---|---|---|---|---|---|---|---|---|
| STOCK-PRICE-AVAIL-01 | Container Reliability (Axis A) | The stock-price standalone container is intentionally not running (HONOR-PANIC-GUARD). Is its capability served by mcp-server without a silent hard-dependency on the absent container? | `docker ps --filter name=stock-price \| wc -l` = 1 AND system-map confirms absent-by-design | stock-price absent from docker ps (expected); system-map.not_deployed_by_design includes it | docker ps | `--filter name=stock-price` | INFO | ops |
| STOCK-PRICE-FUNC-01 | Functional Suitability | Does get_market_snapshot return a non-null VN-Index value via mcp-server? | response.vn_index non-null numeric | VN-Index value present and numeric (> 0) | get_market_snapshot | `{}` | CRITICAL | dev-mcp-server |
| STOCK-PRICE-FRESH-01 | Data Freshness/SLA | Is the VN-Index snapshot fresher than 30 minutes during market hours (09:00–15:30 VN)? | response.timestamp within 30min during market hours | timestamp age <= 30min during VN market hours | get_market_snapshot | `{}` | WARN | dev-mcp-server |
| STOCK-PRICE-CORRECT-01 | Correctness | Does get_market_snapshot return a VN-Index value in the plausible range (500–3000)? | vn_index between 500 and 3000 | 500 < vn_index < 3000 | get_market_snapshot | `{}` | WARN | dev-mcp-server |
| STOCK-PRICE-DEGRADE-01 | Graceful Degradation | If VPS price endpoint is unavailable, does get_market_snapshot return a stale-flagged response rather than crash or fabricate? | response.stale:true or error.reason present; no crash | stale flag present OR graceful error; no fabricated values | get_vps_proxy_health | `{}` | WARN | dev-mcp-server |

**New checks: 5 (replaces 1 tautological INFO)**

---

### 4.2 CAP-SVC-TECHNICAL-ANALYSIS (short_key: ta, probe: get_technical_indicators, capability: data_limited — 30/35 candles)

Capability: data_limited — probe confirmed 30/35 candles tier3 2026-06-02.

| check_id | dimension | question | metric | expected | probe_tool | probe_args | severity | zone_owner |
|---|---|---|---|---|---|---|---|---|
| TA-AVAIL-01 | Container Reliability (Axis A) | The technical-analysis standalone container is intentionally not running (HONOR-PANIC-GUARD). Is its capability served by mcp-server without a silent hard-dependency on the absent container? | `docker ps --filter name=technical-analysis \| wc -l` = 1 AND system-map confirms absent | technical-analysis absent from docker ps (expected) | docker ps | `--filter name=technical-analysis` | INFO | ops |
| TA-FUNC-01 | Functional Suitability | Does get_technical_indicators return indicator data for a watchlist ticker (e.g. VCB)? | response has at least one indicator field (rsi, macd, bb, or equivalent) | non-null indicator shape for VCB | get_technical_indicators | `{"ticker":"VCB"}` | CRITICAL | dev-mcp-server |
| TA-FRESH-01 | Data Freshness/SLA | Is the technical indicators data based on candles no older than 7 calendar days? | most recent candle timestamp within 7 days of now | candle age <= 7 days | get_technical_indicators | `{"ticker":"VCB"}` | WARN | dev-mcp-server |
| TA-CORRECT-01 | Correctness (data_limited) | Does get_technical_indicators correctly report data_limited status when fewer than 35 candles are available (known: 30/35)? | response flags data_limited or candle_count < 35 in a visible field | data_limited flag present OR candle_count field shows < 35 | get_technical_indicators | `{"ticker":"VCB"}` | WARN | dev-mcp-server |
| TA-DEGRADE-01 | Graceful Degradation | If candle history is incomplete, does get_technical_indicators return partial results with an explicit data quality caveat rather than silently returning misleading full indicators? | response includes data_limited, partial, or candle_count < expected with non-null indicators or clear empty | partial result with caveat; no silent full-indicator fabrication | get_technical_indicators | `{"ticker":"VCB"}` | WARN | dev-mcp-server |

**New checks: 5 (replaces 1 tautological INFO)**

---

### 4.3 CAP-SVC-KINH-DICH-SVC (short_key: kinh-dich, probe: get_portfolio_conviction)

Capability: live — 38 tickers confirmed 2026-06-02.

| check_id | dimension | question | metric | expected | probe_tool | probe_args | severity | zone_owner |
|---|---|---|---|---|---|---|---|---|
| KINH-DICH-SVC-AVAIL-01 | Container Reliability (Axis A) | The kinh-dich-service standalone container is intentionally not running (HONOR-PANIC-GUARD). Is its capability served by mcp-server without a silent hard-dependency on the absent container? | `docker ps --filter name=kinh-dich \| wc -l` = 1 AND system-map confirms absent | kinh-dich-service absent from docker ps (expected) | docker ps | `--filter name=kinh-dich` | INFO | ops |
| KINH-DICH-SVC-FUNC-01 | Functional Suitability | Does get_portfolio_conviction return conviction data for at least 30 watchlist tickers? | response.tickers count >= 30 with non-null conviction fields | >= 30 tickers with conviction data | get_portfolio_conviction | `{}` | CRITICAL | dev-mcp-server |
| KINH-DICH-SVC-FRESH-01 | Data Freshness/SLA | Is the portfolio conviction data computed within the last 24 hours? | response.computed_at or equivalent timestamp within 24h | conviction age <= 24h | get_portfolio_conviction | `{}` | WARN | dev-mcp-server |
| KINH-DICH-SVC-CORRECT-01 | Correctness | Does get_portfolio_conviction return hexagram data sourced from get_portfolio_conviction (not confabulated from a non-authoritative source)? | response references hexagram_id or hexagram_name with a corresponding source field; not derived from plain text generation | hexagram source field present and traceable to get_portfolio_conviction internal logic | get_portfolio_conviction | `{}` | WARN | dev-mcp-server |
| KINH-DICH-SVC-OBS-01 | Observability | Does get_portfolio_conviction expose enough metadata (confidence_pct, hexagram_id, computed_at) for a caller to assess conviction quality without reading DB? | response has confidence_pct, hexagram reference, and timestamp fields | all three metadata fields present per ticker | get_portfolio_conviction | `{}` | WARN | dev-mcp-server |
| KINH-DICH-SVC-DEGRADE-01 | Graceful Degradation | If hexagram computation fails for a subset of tickers, does get_portfolio_conviction return partial results rather than a full error? | response returns available tickers with non-null data; absent tickers flagged or omitted; no crash on partial failure | partial result gracefully returned; no 500-class error | get_portfolio_conviction | `{}` | WARN | dev-mcp-server |

**New checks: 6 (replaces 1 tautological INFO)**

---

### 4.4 CAP-SVC-ALERT-ENGINE (short_key: alert, probe: get_alerts)

Capability: live — 20 alerts/day confirmed 2026-06-02.

| check_id | dimension | question | metric | expected | probe_tool | probe_args | severity | zone_owner |
|---|---|---|---|---|---|---|---|---|
| ALERT-ENGINE-AVAIL-01 | Container Reliability (Axis A) | The alert-engine standalone container is intentionally not running (HONOR-PANIC-GUARD). Is its capability served by mcp-server without a silent hard-dependency on the absent container? | `docker ps --filter name=alert-engine \| wc -l` = 1 AND system-map confirms absent | alert-engine absent from docker ps (expected) | docker ps | `--filter name=alert-engine` | INFO | ops |
| ALERT-ENGINE-FUNC-01 | Functional Suitability | Does get_alerts return a list of alerts with required schema fields (ticker, alert_type, triggered_at)? | response.alerts non-empty array with schema-conformant entries | non-empty array, each entry has ticker + alert_type + triggered_at | get_alerts | `{}` | CRITICAL | dev-mcp-server |
| ALERT-ENGINE-FRESH-01 | Data Freshness/SLA | Has at least one alert been triggered in the last 24 hours (cadence: 20/day declared in capability_manifest)? | max(now - triggered_at) <= 24h for most recent alert | most recent alert <= 24h old | get_alerts | `{}` | WARN | dev-mcp-server |
| ALERT-ENGINE-CORRECT-01 | Correctness | Does get_alert_accuracy return a non-null accuracy report, confirming alerts are being resolved and scored (not orphaned)? | response has accuracy metrics (true_positive_rate or equivalent) | non-null accuracy report | get_alert_accuracy | `{}` | WARN | dev-mcp-server |
| ALERT-ENGINE-OBS-01 | Observability | Does list_alert_rules return the configured rule set, confirming alert engine configuration is inspectable without DB access? | response.rules non-empty | non-empty rules list | list_alert_rules | `{}` | WARN | dev-mcp-server |
| ALERT-ENGINE-DEGRADE-01 | Graceful Degradation | If the alerts DB is unavailable, does get_alerts return a clearly degraded response rather than a crash? | error response has message field; no 5xx propagated silently | graceful error or empty array with status flag | get_alerts | `{}` | WARN | dev-mcp-server |

**New checks: 6 (replaces 1 tautological INFO)**

---

### 4.5 CAP-SVC-NEWS-FETCH (short_key: news, probe: get_agent_signals)

Capability: live — NVL/VHM/HPG ingestion confirmed 2026-06-02.

| check_id | dimension | question | metric | expected | probe_tool | probe_args | severity | zone_owner |
|---|---|---|---|---|---|---|---|---|
| NEWS-FETCH-AVAIL-01 | Container Reliability (Axis A) | The news-fetch standalone container is intentionally not running (HONOR-PANIC-GUARD). Is its capability served by mcp-server without a silent hard-dependency on the absent container? | `docker ps --filter name=news-fetch \| wc -l` = 1 AND system-map confirms absent | news-fetch absent from docker ps (expected) | docker ps | `--filter name=news-fetch` | INFO | ops |
| NEWS-FETCH-FUNC-01 | Functional Suitability | Does get_agent_signals return ingested signals for at least one watchlist ticker (probe: NVL, VHM, or HPG) within the last 48 hours? | response.signals non-empty with ticker matching probe input | non-empty signals for NVL or VHM or HPG within 48h | get_agent_signals | `{"agent":"news-fetch","limit":10}` | CRITICAL | dev-mcp-server |
| NEWS-FETCH-FRESH-01 | Data Freshness/SLA | Is the most recent news signal ingested within the intelligenceCycle cadence (15min during market hours, 4h off-hours)? | most recent signal age <= 60min during market hours; <= 8h off-hours | signal freshness within declared cadence | get_agent_signals | `{"limit":5}` | WARN | dev-mcp-server |
| NEWS-FETCH-CORRECT-01 | Correctness | Do ingested news signals have a non-null source field (not self-generated or confabulated), traceable to a declared VN data source? | signal.source field non-null and matches a known source in system-map.json data_sources | source traceable to declared data source | get_agent_signals | `{"limit":5}` | WARN | dev-mcp-server |
| NEWS-FETCH-DEGRADE-01 | Graceful Degradation | If the VPS news-fetch endpoint is unavailable, does get_agent_signals return stale-flagged signals or a graceful empty rather than crash? | response is either empty array with status note, or stale signals with age flag | graceful degrade; no crash or fabricated urgent signals | get_vps_proxy_health | `{}` | WARN | dev-mcp-server |

**New checks: 5 (replaces 1 tautological INFO)**

---

### 4.6 CAP-SVC-RAG-SERVICE (short_key: rag, capability: dark — no live probe)

Capability: dark — `capability_manifest.rag.probe = null`, `live_evidence = "embedded in 156-count, not probed"`. The RAG capability's functional boundary cannot be confirmed without a dedicated probe.

**Design decision for dark capability:**
RAG gets ONE honest Axis A container check (INFO, same as others) and TWO Axis B checks scored WARN with explicit "no live probe exists" rationale. The merge-writer MUST NOT mark either capability check PASS — the correct verdict for absence of probe is WARN with a written finding. The system-auditor should add a backlog item: "Define RAG probe tool or designate a dedicated RAG functional check via search_similar_context or search_memory_by_trigger."

| check_id | dimension | question | metric | expected | probe_tool | probe_args | severity | zone_owner |
|---|---|---|---|---|---|---|---|---|
| RAG-SERVICE-AVAIL-01 | Container Reliability (Axis A) | The rag-service standalone container is intentionally not running (HONOR-PANIC-GUARD). Is its capability served by mcp-server without a silent hard-dependency on the absent container? | `docker ps --filter name=rag \| wc -l` = 1 AND system-map confirms absent | rag-service absent from docker ps (expected) | docker ps | `--filter name=rag` | INFO | ops |
| RAG-SERVICE-FUNC-01 | Functional Suitability (dark — proxy probe) | The RAG capability has no dedicated live probe (capability_manifest.rag.probe = null). Does search_similar_context return a non-empty result for a known topic, providing indirect evidence the embedding/retrieval layer is active? | response.results non-empty for a broad query (e.g. "VN-Index") | non-empty results OR explicit "no probe" WARN verdict; NEVER auto-PASS | search_similar_context | `{"query":"VN-Index","limit":3}` | WARN | dev-mcp-server |
| RAG-SERVICE-OBS-01 | Observability / Probe Gap | No canonical RAG probe is registered in capability_manifest. This is an observability gap: the RAG capability embedded in the 156-tool monolith is unverifiable by the auditor without a designated probe. Verdict is NEEDS-REVIEW until a probe is defined. | probe_tool defined in capability_manifest.rag | probe_tool = non-null entry in capability_manifest | none — structural check | examine system-map.json capability_manifest.rag.probe_type | WARN | dev-mcp-server |

**New checks: 3 (replaces 1 tautological INFO). RAG-SERVICE-FUNC-01 and RAG-SERVICE-OBS-01 are the only genuinely unverifiable capability checks — see Section 6.**

---

## 5. Auditor Rule Correction (gate rule for system-auditor)

**Old gate rule (embedded in original framework brief and applied by system-auditor):**
> For services in `not_deployed_by_design`: pre-score all checks INFO. Never escalate to WARN/FAIL/CRITICAL.

**Corrected gate rule (v2):**
> For services in `not_deployed_by_design`:
> - CONTAINER-RELIABILITY checks (dimension = "Container Reliability (Axis A)"): score INFO always. The absent container is intentional per HONOR-PANIC-GUARD. Never WARN/CRITICAL for container absence.
> - CAPABILITY checks (all other dimensions): probe LIVE via `capability_manifest` probe. Score PASS/WARN/FAIL based on real evidence. NEVER pre-score INFO or PASS without a live probe result. For dark capability (probe_type = "none"): score WARN with written rationale — never silent INFO.

---

## 6. Expected Artifact Impact

### Check count delta

| Service | Old checks | New checks (Axis A + Axis B) | Net delta |
|---|---|---|---|
| CAP-SVC-STOCK-PRICE | 1 (tautological INFO) | 5 (1 INFO + 4 PASS/WARN/FAIL) | +4 |
| CAP-SVC-TECHNICAL-ANALYSIS | 1 (tautological INFO) | 5 (1 INFO + 4 PASS/WARN/FAIL) | +4 |
| CAP-SVC-KINH-DICH-SVC | 1 (tautological INFO) | 6 (1 INFO + 5 PASS/WARN/FAIL) | +5 |
| CAP-SVC-ALERT-ENGINE | 1 (tautological INFO) | 6 (1 INFO + 5 PASS/WARN/FAIL) | +5 |
| CAP-SVC-NEWS-FETCH | 1 (tautological INFO) | 5 (1 INFO + 4 PASS/WARN/FAIL) | +4 |
| CAP-SVC-RAG-SERVICE | 1 (tautological INFO) | 3 (1 INFO + 2 WARN/NEEDS-REVIEW) | +2 |
| **TOTAL** | **6** | **30** | **+24** |

Total checks after merge-writer applies: 240 + 24 = **264 checks**

6 tautological INFO checks are NOT deleted — they are replaced by the honest Axis A container-reliability checks (same check_id, rewritten question/metric/expected/recheck_how). The 24 new Axis B capability checks are added alongside them.

The `overall` summary field and any per-cap roll-up counts MUST be recomputed by the merge-writer from rows after all probes run — never hand-edited.

### system-map.json _note field

One field edit to `docs/data/system-map.json .project.infrastructure.docker.host_runtime_set._note` as specified in Section 3. The merge-writer applies this in the same commit window as the quality-checklist.json update.

---

## 7. Services Genuinely Not Capability-Verifiable (and Why)

**RAG-SERVICE** is the only genuinely unverifiable capability. Reason:

1. `capability_manifest.rag.probe_type = "none"` and `probe = null` — the mcp-server monolith exposes no dedicated RAG functional endpoint.
2. The proxy probe `search_similar_context` is indirect — it tests the retrieval interface, not the embedding pipeline, vector index health, or document corpus completeness.
3. There is no declared SLA for RAG freshness in system-map.json.
4. The `live_evidence` is "embedded in 156-count, not probed" — this is an architectural gap, not a deployment choice.

The correct verdict is WARN (not INFO, not FAIL) because: the capability may be functioning but is unobservable. The system-auditor should create a backlog task: "Add RAG health probe to capability_manifest — candidate: search_similar_context with a known-answer fixture, or a dedicated /api/rag/health endpoint."

All other 5 services (stock, ta, kinh-dich, alert, news) have registered probes with live_evidence dated 2026-06-02. Their capabilities are verifiable — the merge-writer must probe them live and score on evidence.

---

## 8. Handoff Checklist for System-Auditor Merge-Writer

1. For each of the 6 CAP-SVC-* blocks in quality-checklist.json:
   a. Rewrite the existing `*-AVAIL-01` check in-place: update `question`, `metric`, `expected`, `recheck_how` to the Axis A honest template (Section 4). Keep `severity: INFO`. Keep same `check_id`.
   b. Add all Axis B checks from Section 4 tables as new entries in the cap's `checks` array.
   c. For Axis B checks: run the designated probe live, record `evidence`, `last_verified`, and set `status` to PASS/WARN/FAIL based on real result. For RAG-SERVICE-FUNC-01 and RAG-SERVICE-OBS-01: set `status: "WARN"` with written evidence explaining the probe gap.
2. Apply the `_note` field correction in system-map.json (Section 3).
3. Recompute `"overall"` and any aggregate counters from the full check rows — never hand-edit the summary.
4. Commit via commit-mutex, pathspec: `docs/data/quality-checklist.json docs/data/system-map.json`.
5. Do NOT push — router pushes.
