---
task_id: ARCH-VN-MACRO-TOOLING
sprint: VN-MACRO-TOOLING
author: architect
created_at: 2026-06-14T00:00:00Z
---

# Decision Journal — VN-MACRO-TOOLING Architect Cycle

## Entry 1 — Zone-split confirmation

**task_id:** ARCH-VN-MACRO-TOOLING
**what-considered:** (a) keep BA zone split as-is; (b) merge Zone D into Zone A; (c) add a Zone E for cache layer
**decision:** Confirm BA A/B/C/D split. Zone D stays explicit because it is the dependency of all Zone A parsers — PM needs to schedule it as a blocking prerequisite, which requires it to be a distinct task line. Zone E (cache) is NOT a separate zone; SQLite cache adapter goes inside Zone A infrastructure alongside the existing staleness-gated adapters — same pattern, same package.
**why-change:** No change from BA recommendation; rationale: the BA correctly identified the zero-dep ordering of Zone D.

## Entry 2 — vpsFetch as domain port vs free function

**task_id:** ARCH-VN-MACRO-TOOLING
**what-considered:** (a) domain port interface + infrastructure adapter (DDD-clean); (b) free function in infrastructure imported by use-cases directly (simpler, breaks Fence-A)
**decision:** Domain port (VpsFetchPort interface in pkg/domain/ports.go). Reason: the existing code base already enforces Fence-A strictly (the comment "Zero imports from application, infrastructure, or interface layers" is in `pkg/domain/ports.go` header, and this rule is referenced in `repositories.go` header as Fence-C). Breaking Fence-A would introduce the first DDD violation in a mature, clean Go service — unacceptable debt.
**why-change:** Correct DDD choice; cost is one extra interface definition, zero runtime cost.

## Entry 3 — BOP parse path pending probe (Excel vs PDF)

**task_id:** ARCH-VN-MACRO-TOOLING
**what-considered:** (a) assume Excel → add excelize dep now; (b) assume PDF → plan pdf-extractor delegation; (c) defer both paths until probe
**decision:** Defer both. Blueprint specifies both paths (DD-2) with the decision gate at probe time. excelize is NOT added to go.mod until PROBE-2 confirms Excel format. This avoids adding a dependency speculatively that may never be needed. Recurring-bug risk if we hardcode the wrong path before seeing the live payload (memory: feedback_contract_from_live_payload_not_schema_comment).
**why-change:** Probe-first is the load-bearing rule (GA-7 + BLOCKER-2 spec). Deviation would introduce class-F1 parser risk.

## Entry 4 — IRS field deferred to is_estimate permanently

**task_id:** ARCH-VN-MACRO-TOOLING
**what-considered:** (a) block VMT-5 on IRS source confirmation; (b) ship is_estimate=true as default, upgrade later; (c) omit IRS field from schema
**decision:** Ship is_estimate=true as default (option b). IRS field must exist in schema because the skill switch-on contract names it (GA-3: field renames break the switch-on). Omitting the field would break the consuming skill. The honest is_estimate=true approach satisfies GA-4 (no silent static value). HNX TLS history (memory: project_bctc_hnx_ssl_outage) makes a stable machine-readable IRS source unlikely in the short term. VMT-5 ships without blocking on IRS.
**why-change:** Schema completeness + honest estimate flag = correct. Blocking VMT-5 would delay the skill switch-on for interbank/OMO/SJC/fx_coupling unnecessarily.

## Entry 5 — BLOCKER-6 VIRA/VARA: accept degraded mode, no PUT endpoint

**task_id:** ARCH-VN-MACRO-TOOLING
**what-considered:** (a) implement PUT /vira-survey-data manual-input endpoint; (b) accept is_estimate=true degraded mode; (c) block VMT-6 pending source research
**decision:** Accept degraded mode (option b). Rationale: a manual-input PUT endpoint requires authentication, documentation, and a user workflow — this is 3x the scope of VMT-6 and does not appear in the BA spec. The existing tool already has correct is_estimate provenance flags; the EXTEND just adds a new field that honestly reports its state. The degraded mode is a valid shipped state per GA-4. If a machine-readable VIRA/VARA source is found during probing, a follow-up ticket covers the fetcher — no schema change needed.
**why-change:** Scope-correct; honest degraded mode beats a maintenance burden of a manual-input endpoint.

## Entry 6 — SJC gap: no new crawl, reuse existing SQLite data

**task_id:** ARCH-VN-MACRO-TOOLING
**what-considered:** (a) new VPS fetch of SJC price in Go service; (b) read SJC price from existing market.db table; (c) call TS SJC crawler from Go
**decision:** Read from market.db (option b). The existing SJC crawler (TS mcp-server side) already writes to market.db. The Go macro-indicators service already reads from market.db for commodity_prices, sbv_rates, market_prices. Adding one more read from the SJC table follows the exact same adapter pattern. No new crawl, no cross-language call. Pure Go domain math for gap computation.
**why-change:** Reuse beats duplication (DDD principle: extend, not duplicate). Cross-language HTTP call from Go to TS for a single number would be an anti-pattern.

## Entry 7 — BUILD-STANDARD: lean (not full)

**task_id:** ARCH-VN-MACRO-TOOLING
**what-considered:** (a) BUILD-STANDARD: full (both apps/macro-indicators/ and apps/mcp-server/ exist, but adding 7 tasks to a live service is significant); (b) BUILD-STANDARD: lean (services exist, pattern established, no new service bootstrap)
**decision:** lean. Both `apps/macro-indicators/` and `apps/mcp-server/` exist and are production services with established patterns. This is feature extension, not new service creation. The flow does NOT require a new PILOT-STATUS-SSOT or ROLE-RELAY. Both dev-macro-indicators and dev-mcp-server drive their zones end-to-end.
**why-change:** Correct classification; the standard detection matrix says "NEW FEATURE (apps/<svc>/ already exists) → BUILD-STANDARD: lean".

---

## PROBE-FOLD Cycle — 2026-06-14 (WAVE-1 recon folded)

## Entry 8 — VMT-1b.bloc_split fallback: accept NSO FDI cross-join, is_estimate=true mandatory

**task_id:** ARCH-VN-MACRO-TOOLING (probe-fold)
**what-considered:**
  (a) Add headless browser (Playwright/Puppeteer) to VPS to render customs.gov.vn SPA and scrape enterprise-type breakdown
  (b) Accept NSO FDI Excel cross-join as permanent estimate (is_estimate=true)
  (c) Omit bloc_split sub-field entirely (return null/absent)
  (d) Mark bloc_split as PLANNED and defer to a future sprint
**decision:** Option (b) — NSO FDI cross-join with is_estimate=true, mandatory and permanent until Customs publishes machine-readable enterprise breakdown.
**rationale:**
  - Option (a) REJECTED: headless browser in Go infrastructure layer = heavyweight dependency, wrong layer for this sprint. Playwright/Puppeteer is an application-layer tool that belongs in a dedicated scraper service. Adding it to the Go macro-indicators binary would inflate the binary, add Node.js runtime dependency to a pure Go service, and introduce a new class of puppeteer-driven flakiness.
  - Option (c) REJECTED: bloc_split must exist in the schema even as a degraded estimate. The skill switch-on contract for `trade-fx-pressure-decomp` references the FDI/domestic split as a discriminator input. Omitting it would silently break the discriminator with a nil-pointer risk in domain code.
  - Option (d) REJECTED: deferring with null output that claims to be dispatched is dishonest; the NSO source is ALREADY confirmed PASS from PROBE-3 — the cross-join is immediately implementable.
  - Option (b) CHOSEN: NSO `12.FDI` sheet (registered capital, M USD) cross-joined against NSO `14.XK` (total exports) yields a FDI export-attribution estimate. It is traceable, live, and honest. is_estimate=true is non-negotiable per GA-4 (no silent static values). Dev MUST NOT flip is_estimate=false for bloc_split without a direct Customs machine-readable column.
**why-change:** Correct fail-closed approach; schema completeness preserved; honest provenance.

## Entry 9 — VMT-5b.interbank: accept permanent is_estimate=true (Option 2)

**task_id:** ARCH-VN-MACRO-TOOLING (probe-fold)
**what-considered:**
  (1) Find alternative public machine-readable interbank endpoint (different aggregator)
  (2) Accept is_estimate=true permanently for interbank_1w
  (3) Investigate SBV IP-whitelist for Vinahost VPS
**decision:** Option 2 — permanent is_estimate=true, rate_1w_pct: null, with a blocked_reason field.
**rationale:**
  - Option 1 REJECTED: No confirmed alternative found. WiData is off-limits per policy. NSO narrative is plain text, unreliable for a structured rate field. Bloomberg/Refinitiv are commercial APIs. No open Vietnamese financial data aggregator with a stable JSON interbank endpoint was identified in the probe or in existing knowledge.
  - Option 3 REJECTED: IP-whitelist with SBV is an indefinite administrative process requiring human intervention with a Vietnamese regulatory body. It cannot be treated as a sprint deliverable — it may take weeks or months, or never happen. Making VMT-5b.interbank a hard blocker on this would stall the entire liquidity-state tool indefinitely.
  - Option 2 CHOSEN: The field exists in the schema (GA-3 compliant — field renames break skill switch-on; field must exist even with null value). is_estimate=true + blocked_reason is the correct honest degraded state per GA-4 and DD-6 (same pattern as IRS). This is consistent with the existing IRS treatment. If `dttktt.sbv.gov.vn` becomes reachable in a future sprint (VPS IP rotation, SBV network change), the parser can be added without any schema change.
  - IRS remains permanently is_estimate=true per DD-6 (no change).
**why-change:** Correct fail-closed; consistent with DD-6 precedent; unblocks VMT-5b delivery.

## Entry 10 — VMT-2 BOP: no excelize needed (pure JSON API confirmed)

**task_id:** ARCH-VN-MACRO-TOOLING (probe-fold)
**what-considered:** (a) Excel path (excelize dep) — original BLOCKER-2 Path A; (b) PDF → pdf-extractor — original BLOCKER-2 Path B; (c) direct JSON (Liferay headless API — confirmed by PROBE-2)
**decision:** Option (c) — direct JSON GET. excelize NOT needed for VMT-2. No PDF. No pdf-extractor delegation.
**rationale:** PROBE-2 live payload confirms SBV BOP is published as a Liferay DXP headless article API at `https://www.sbv.gov.vn/o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168`. All 20 BOP fields are present as JSON string fields in the `fields` object. Q4-2025 payload confirmed complete. The original BLOCKER-2 uncertainty (Excel vs PDF) is now fully resolved: neither path is needed. The `excelize` dep should NOT be added to go.mod for VMT-2.
**note:** excelize IS still needed for VMT-1a/1b/3b/4 (NSO Excel sheets). Add to go.mod only once, when Task A2 (NSO Excel parsing) is dispatched.
**why-change:** Live payload overrides the speculative Excel/PDF analysis in BLOCKER-2. Contract-from-live-payload rule (GA-7) is the load-bearing constraint.

## Entry 11 — NSO Excel: one download serves VMT-1a, VMT-1b, VMT-3b, VMT-4 (efficiency decision)

**task_id:** ARCH-VN-MACRO-TOOLING (probe-fold)
**what-considered:** (a) separate vpsFetch calls per tool/sheet; (b) one vpsFetch for the monthly Excel, parse all needed sheets in one use-case pass; (c) cache-only approach (fetch once, cache, all tools read from cache)
**decision:** Option (c) — cache-first with a single vpsFetch per monthly Excel release. The application use-case for each NSO-backed tool checks the macro_vmt_cache first (TTL: 6h for daily; 24h for monthly releases). If cache hit, parse from cached bytes. If cache miss, one vpsFetch of the monthly Excel, write to cache, then parse. This means all four tools (VMT-1a, VMT-1b, VMT-3b, VMT-4) share one cached Excel download per refresh cycle. No redundant VPS downloads.
**note:** Each tool's use-case still calls its own sheet parser. The shared download is managed by a `getOrFetchNSOMonthlyExcel()` application-layer helper (returns `[]byte` from cache or fresh fetch). This helper is NOT a domain concern — it lives in the application layer as a shared utility function.
**why-change:** Correct efficiency design; avoids 4 redundant 646KB VPS fetches per API call cycle. Consistent with DD-3 (SQLite cache in infrastructure layer).

## Entry 12 — Zone A serialization guard: Zone A parsers must be SERIALIZED

**task_id:** ARCH-VN-MACRO-TOOLING (probe-fold)
**what-considered:** Whether to allow concurrent dev tasks on Zone A files during WAVE-2
**decision:** SERIALIZE Zone A dev tasks. PM must not assign two concurrent dev tasks that both touch `handlers_vmt.go`, `usecases_vmt.go`, or `dtos_vmt.go`. Tasks A1 (VMT-2) → A2 (VMT-3b+VMT-4) → A3 (VMT-1a+1b) → A4 (VMT-5b.omo) → A5 (VMT-5a) must be treated as a serial chain with merge gates between each.
**rationale:** Zone A risk rating is MED (DDD Risk Review). The recurring-bug memory rule (`feedback_recurring_bug_escalation`) flags 2+ commits to the same module as a PM escalation trigger. Five new use-cases all sharing two files (`handlers_vmt.go` + `usecases_vmt.go`) is a structural recipe for merge conflicts and silent function-shadowing bugs if parallelized. The serialization overhead is acceptable given the probe-confirmed contracts reduce per-task dev time.
**why-change:** Explicit guard; PM must enforce as a scheduling constraint in the task board.
