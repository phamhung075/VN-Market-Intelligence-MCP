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
