---
sprint: VN-MACRO-TOOLING
task_id: PROBE-1
type: PROBE
size: S
zone: ops
wave: 1
depends_on: []
blocks: ["VMT-1-TRADE-BALANCE", "VMT-1b-TRADE-BALANCE-BLOC-SPLIT"]
---

# PROBE-1 — ops-vps-fetch: Customs enterprise-type breakdown

## TLDR

Probe the Vietnam Customs (Tổng cục Hải quan) monthly statistics page via Vinahost VPS to locate and capture the enterprise-type breakdown table (FDI vs domestic-bloc attribution). Deliverable: live HTML/JSON sample saved to `scripts/probes/vmt-1-sample.json` + confirmed URL + table structure (column names, data availability).

## [PM] Planning Context

**Blocker:** BLOCKER-1 — VMT-1 `bloc_split` field depends on this probe to confirm parse strategy.

**Why this matters:**
- VMT-1 (trade-balance) needs FDI-bloc vs domestic-bloc split, but Vietnam Customs does not publish this as a direct column.
- The split is derived from enterprise-type breakdown or GSO FDI-attributed data — **architecture must decide the strategy after seeing the live source**.
- VMT-1 total + hs_attribution can proceed without this; only `bloc_split` is blocked.

**Acceptance Criteria:**
- [ ] Fetch `https://www.customs.gov.vn/` monthly trade stats page via Vinahost VPS (VPS_HOST=125.212.251.27, port 3128)
- [ ] Locate enterprise-type breakdown table (doanh nghiệp FDI vs doanh nghiệp nội địa, if exists)
- [ ] Capture live HTML/JSON response to `scripts/probes/vmt-1-sample.json`
- [ ] Document: table column headers, data format (HTML table, Excel download link, PDF), whether FDI and domestic totals are explicit or derived
- [ ] Test curl command saved to `scripts/probes/vmt-probe-1.sh` for reproducibility
- [ ] Email back to Architect with findings; architect decides parse path (direct table vs GSO cross-join estimate)
- [ ] If source NOT found: flag as `is_estimate=true` fallback, escalate blocker to Architect

**Files to read first:**
- `docs/handoffs/ARCH-VN-MACRO-TOOLING.md` § BLOCKER-1, BLOCKER design resolutions
- `docs/REQ_VN-MACRO-TOOLING.md` § Tool 1 — `get_vn_trade_balance`, FR-2 `bloc_split` schema
- `reference_vps_setup.md` — VPS proxy configuration (connection, testing)
- `project_bctc_vps_proxy.md` — existing VPS proxy pattern (how we route geo-blocked calls)

**Files to create:**
- `scripts/probes/vmt-probe-1.sh` — curl script to fetch Customs page via VPS (executable, includes error handling)
- `scripts/probes/vmt-1-sample.json` — raw live response sample (HTML snippet or JSON)

**Dependencies:** None (WAVE-1 parallel)

**Knowledge needed:**
- VPS proxy setup (address, port, auth if needed)
- Vietnam Customs website structure (monthly stats page URL)
- Curl syntax for HTTP proxy routing
- HTML/Excel/JSON parsing concepts (for documenting what you find, not parsing it yet)

---

## Context

From ARCH-VN-MACRO-TOOLING, BLOCKER-1:

> The FDI/domestic bloc split in Vietnam's Customs data is NOT a direct column. Customs (Tổng cục Hải quan) publishes trade statistics broken down by enterprise type (doanh nghiệp FDI vs. doanh nghiệp nội địa) in their monthly statistical reports. This is a two-series cross-join: (a) total trade by HS group (main Customs page), (b) trade by enterprise type (a secondary report page on the same Customs portal).
>
> Parser must join two table reads from the same Customs VPS response or two sequential vpsFetch calls to the Customs monthly stats pages.
> If the Customs site does NOT publish the enterprise-type breakdown in a machine-readable table (possible: some breakdowns are PDF-only), the FDI-bloc split falls back to: use GSO monthly report FDI-attributed export data (GSO publishes the FDI sector's export contribution separately) cross-joined with total Customs figures. This is a 2-source join, NOT a direct column.

---

## Probe Scope

**VPS-routed HTTP fetch targets:**
1. `https://www.customs.gov.vn/` (homepage, find monthly stats link)
2. Monthly trade statistics page (find the enterprise-type breakdown)

**What to capture:**
- Raw HTTP response (HTML or JSON or Excel metadata)
- URL of the breakdown page
- Table structure (column names, data rows if visible)
- Whether data is HTML table, Excel download, or PDF

**What NOT to do:**
- Do NOT parse the data yet
- Do NOT implement the parser
- Just fetch, save, document

---

## Output

**Deliverable files:**
1. `scripts/probes/vmt-probe-1.sh` — shell script to reproduce the fetch
2. `scripts/probes/vmt-1-sample.json` — raw response sample

**Email / Caveman message to Architect:**
```
Subject: PROBE-1 result — Customs FDI-bloc breakdown

Findings:
- URL: [confirmed URL]
- Format: [HTML table / Excel download / PDF / not found]
- Table structure: [column headers, sample row]
- Verdict: [direct parse possible / GSO cross-join fallback needed / source unavailable]

Attached: vmt-1-sample.json (live response sample)
Script: vmt-probe-1.sh (curl command for reproduction)
```

---

## Task Boundaries

**This task ENDS when:**
- Probe script is in `scripts/probes/vmt-probe-1.sh`
- Live sample is captured in `scripts/probes/vmt-1-sample.json`
- Findings communicated to Architect (not to dev; dev waits for Architect decision)

**Next steps (for ARCHITECT only, NOT this task):**
- Decide parse strategy: direct table, GSO cross-join, or estimate fallback
- Gate VMT-1b (bloc_split parser) with the confirmed strategy

**VMT-1a (total + hs_attribution) is NOT blocked by this probe** — dev can start VMT-1a immediately after Zone D lands.
