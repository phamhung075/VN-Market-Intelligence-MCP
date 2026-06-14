---
sprint: VN-MACRO-TOOLING
task_id: PROBE-2
type: PROBE
size: S
zone: ops
wave: 1
depends_on: []
blocks: ["VMT-2-BOP"]
---

# PROBE-2 — ops-vps-fetch: SBV BOP quarterly publication

## TLDR

Probe the State Bank of Vietnam (SBV) Balance-of-Payments quarterly publication page to determine format (PDF vs Excel vs JSON API) and confirm all 10 BOP line items are in one table or split across multiple sheets. Critical: confirm E&O (errors & omissions) sign convention (IMF BPM6 vs reversed). Deliverable: live sample saved to `scripts/probes/vmt-2-sample.json` + confirmed URL + parse path recommendation.

## [PM] Planning Context

**Blocker:** BLOCKER-2 — VMT-2 full BOP parser depends on probe result to confirm parsing strategy.

**Why this matters:**
- SBV publishes BOP data, but format is uncertain (could be PDF, Excel, or JSON).
- If PDF: requires delegating to existing `pdf-extractor` service (async hop, adds latency).
- If Excel: Go service needs `excelize` dependency (only add if confirmed Excel format).
- E&O sign convention is load-bearing: the FX-incidence discriminator logic flips the threshold based on sign convention.

**Acceptance Criteria:**
- [ ] Fetch `https://www.sbv.gov.vn/` BOP quarterly publication page via Vinahost VPS
- [ ] Determine format: PDF, Excel (.xlsx), HTML table, or JSON API
- [ ] If Excel/HTML: capture column headers and at least one sample row
- [ ] If PDF: capture PDF metadata (size, structure hints)
- [ ] Confirm all 10 BOP components in one table or separate sheets (current account, financial account, E&O, etc.)
- [ ] **CRITICAL:** Confirm E&O sign convention (positive = inflow or outflow?) and compare to IMF BPM6 standard
- [ ] Capture live sample to `scripts/probes/vmt-2-sample.json` (or .pdf / .xlsx metadata)
- [ ] Document parse path: direct Go parse, pdf-extractor delegation, or Excel parsing
- [ ] Escalate to Architect: recommend go.mod dependency change (excelize if Excel) or pdf-extractor invoke path

**Files to read first:**
- `docs/handoffs/ARCH-VN-MACRO-TOOLING.md` § BLOCKER-2, DD-2 (parse paths)
- `docs/REQ_VN-MACRO-TOOLING.md` § Tool 2 — `get_vn_bop`, FR-4 (FX-incidence discriminator logic)
- `docs/agent-memory/decisions/sprint-VN-MACRO-TOOLING.md` § Entry 3 (BOP parse path decision)
- `reference_pdf_ocr_vps_architecture.md` — pdf-extractor service (if PDF path is confirmed)
- `project_bctc_hnx_ssl_outage.md` — TLS handling (ensure `--cacert` not `-k`)

**Files to create:**
- `scripts/probes/vmt-probe-2.sh` — curl script to fetch SBV BOP page via VPS
- `scripts/probes/vmt-2-sample.json` (or .pdf / .xlsx) — raw live response sample

**Dependencies:** None (WAVE-1 parallel)

**Knowledge needed:**
- VPS proxy setup
- SBV website structure (quarterly BOP publication URLs)
- PDF vs Excel vs HTML format identification
- IMF BPM6 sign convention for E&O (reference: current_account_deficit = negative; errors_omissions residual absorbs unexplained flows)

---

## Context from Architecture

From ARCH-VN-MACRO-TOOLING, BLOCKER-2:

> **Path A (preferred): Excel download** — SBV publishes quarterly BOP data as Excel (`.xlsx`) in Vietnamese. If confirmed, the Go infra layer must parse Excel. Go does not have a stdlib Excel parser; options are: (a) `github.com/qax-os/excelize` (maintained, no CGO — compatible with modernc.org/sqlite DI pattern), (b) delegate Excel parse to the existing `pdf-extractor` Python service via HTTP if that service has been extended for Excel. **Decision: use `excelize` in Go if probe confirms Excel format. Do NOT call `pdf-extractor` for Excel — keep parse latency in the Go service itself.**
>
> **Path B: PDF** — if SBV BOP is PDF-only, the Go handler must proxy the PDF bytes to `apps/pdf-extractor` (Python, port 8765 on VPS based on memory `reference_pdf_ocr_vps_architecture`) and parse the extracted text. This adds an async hop and introduces latency. **Decision: if PDF path is required, implement as a two-step vpsFetch (download PDF) + HTTP call to pdf-extractor on VPS, with a 30s timeout and `is_estimate=true` on fields that fail parse.**
>
> **E&O sign convention:** SBV historically uses IMF BPM6 sign convention (E&O is a residual — positive means unexplained inflows, negative means unexplained outflows). The probe must confirm this or flag reversal. The domain discriminator logic (`FDI_BENIGN` when `errors_omissions_bn_usd < -1.0`) assumes BPM6 convention. If SBV uses the opposite sign, the discriminator threshold flips to `> +1.0`. **This is a hard blocker for the FX-incidence discriminator — do not hardcode the sign until the probe confirms.**

---

## Probe Scope

**VPS-routed HTTP fetch target:**
- `https://www.sbv.gov.vn/` BOP quarterly publication page (find the URL from homepage)

**What to capture:**
- Raw HTTP response (HTML, PDF metadata, Excel metadata, or JSON)
- Confirmed URL of the BOP publication
- All 10 BOP line items:
  - Current Account: total, trade goods, services, income, transfers
  - Financial Account: FDI, portfolio, other investment
  - Errors & Omissions
  - Overall balance
- **CRITICAL:** E&O sign convention (is positive = inflow or outflow?)

**What NOT to do:**
- Do NOT parse the data
- Do NOT implement the parser
- Just fetch, save, document

---

## Output

**Deliverable files:**
1. `scripts/probes/vmt-probe-2.sh` — shell script to reproduce the fetch
2. `scripts/probes/vmt-2-sample.json` (or .pdf / .xlsx) — raw response sample or metadata

**Email / Caveman message to Architect:**
```
Subject: PROBE-2 result — SBV BOP format + E&O sign convention

Findings:
- URL: [confirmed URL]
- Format: [PDF / Excel / HTML / JSON API]
- All 10 components present: [yes/no, which ones missing if any]
- E&O sign convention: [IMF BPM6 (positive=inflow) / reversed / unclear]
- Parse path recommendation: [excelize (Excel), pdf-extractor (PDF), HTML table parser, etc.]

Attached: vmt-2-sample.json/.pdf/.xlsx (live response sample)
Script: vmt-probe-2.sh (curl command for reproduction)
```

---

## Task Boundaries

**This task ENDS when:**
- Probe script is in `scripts/probes/vmt-probe-2.sh`
- Live sample is captured in `scripts/probes/vmt-2-sample.*`
- Findings (format, E&O sign, parse path) communicated to Architect

**Next steps (for ARCHITECT only):**
- Decide parse path: Go excelize + go.mod update, or pdf-extractor delegation
- Confirm E&O sign convention; bake into domain discriminator logic
- Gate VMT-2 parser with confirmed strategy + dependency (if any)

**VMT-2 parser (Wave 2) is blocked until Architect confirms parse path and E&O sign.**
