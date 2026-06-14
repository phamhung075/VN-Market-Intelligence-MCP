---
sprint: VN-MACRO-TOOLING
task_id: PROBE-3
type: PROBE
size: S
zone: ops
wave: 1
depends_on: []
blocks: ["VMT-3b-MACRO-INDICATORS-GSO", "VMT-4-CPI-COMPONENTS"]
---

# PROBE-3 — ops-vps-fetch: GSO monthly socio-economic release (IIP/retail/FDI/CPI tables)

## TLDR

Probe the General Statistics Office (GSO) monthly socio-economic press release page to locate machine-readable tables for: Industrial Production Index (IIP), retail sales, public investment, FDI (registered+disbursed), and the 11-basket CPI breakdown. Deliverable: live HTML sample to `scripts/probes/vmt-3-sample.json` + confirmed page structure (table positions, column consistency month-to-month).

## [PM] Planning Context

**Blockers:** BLOCKER-3 (VMT-3 GSO path) + BLOCKER-4 (VMT-4 CPI) — both answered by the same probe.

**Why this matters:**
- GSO publishes monthly data on a single press-release page ("Tình hình kinh tế – xã hội"), but table structure may vary month-to-month.
- If tables are consistent (same CSS IDs, fixed column positions), write a config-driven parser.
- If tables are unstable, prefer Excel download path (more stable column structure).
- CPI basket names must be mapped to English keys; weights update ~every 5 years.
- **PMI (S&P Global) is NOT geo-blocked** — can be probed directly from main-server, no VPS needed (parallelizable).

**Acceptance Criteria:**
- [ ] Fetch `https://www.gso.gov.vn/` most recent monthly press-release via Vinahost VPS
- [ ] Locate and document table structure for: IIP, retail sales (nominal), public investment, FDI (registered+disbursed), 11-basket CPI
- [ ] Determine if all 5 indicators are on ONE page or multiple pages
- [ ] Capture CSS table selectors or column indices (if HTML table)
- [ ] If Excel download: confirm column headers, data availability, month-to-month stability
- [ ] **CPI basket names (Vietnamese):** capture all 11 basket names and their English mappings
- [ ] **CPI weights:** confirm whether weights are in the table or require a separate CPI methodology PDF
- [ ] Save live HTML snippet to `scripts/probes/vmt-3-sample.json`
- [ ] Document parse strategy: HTML table (CSS selector) vs Excel download
- [ ] **PMI (separate task):** dev-mainserver-crawls probes `https://www.pmi.spglobal.com/` or `https://www.spglobal.com/market-intelligence/` (not geo-blocked) in parallel

**Files to read first:**
- `docs/handoffs/ARCH-VN-MACRO-TOOLING.md` § BLOCKER-3, BLOCKER-4, DD-3 (cache pattern)
- `docs/REQ_VN-MACRO-TOOLING.md` § Tool 3 (macro-indicators), Tool 4 (CPI-components)
- `docs/agent-memory/decisions/sprint-VN-MACRO-TOOLING.md` § Entry 5 (BLOCKER-6 VIRA/VARA)
- GSO website (find monthly release URL pattern)

**Files to create:**
- `scripts/probes/vmt-probe-3.sh` — curl script to fetch GSO page via VPS
- `scripts/probes/vmt-3-sample.json` — raw HTML snippet or table metadata

**Dependencies:** None (WAVE-1 parallel)

**Knowledge needed:**
- VPS proxy setup
- GSO website structure (monthly release page URL pattern)
- HTML CSS selector syntax (document table selectors, don't parse yet)
- CPI basket definitions (Vietnamese terminology)
- Excel file format (if download is required)

---

## Context from Architecture

From ARCH-VN-MACRO-TOOLING, BLOCKER-3+4:

> **GSO monthly report format (VMT-3 gate):**
> GSO (`https://www.gso.gov.vn/`) publishes monthly socio-economic data via:
> - Press release HTML page (`bai-viet/` path) with embedded tables
> - Separate Excel download link (`/documents/` path) on the same press release
>
> The key question is whether IIP, retail, public-investment, and FDI are all on ONE press-release page or split across multiple. Based on GSO's historical format, they are typically all in one monthly `"Tình hình kinh tế – xã hội"` press release with multiple embedded HTML tables — but the URL and table structure vary monthly.
>
> **Decision: probe the most recent GSO monthly release URL. If HTML tables are consistent (same table IDs / ordering) month-to-month, write a CSS-selector-based parser. If not, prefer the Excel download path (more stable column structure).** The parser MUST be driven by a config map (column indices / table positions) read from a JSON config file, NOT hardcoded offsets.
>
> **PMI is not geo-blocked:** S&P Global PMI press page (`https://www.pmi.spglobal.com/` or `https://www.spglobal.com/market-intelligence/`) is globally accessible. Dev can probe and write the PMI parser from the main-server (no VPS needed). This can proceed in parallel with GSO VPS probing.
>
> **CPI basket format (VMT-4 gate):**
> GSO publishes CPI as part of the same monthly socio-economic press release that covers IIP/retail/FDI (BLOCKER-3). The 11-basket breakdown with individual weights is in a dedicated table within that same release page. **The BLOCKER-3 and BLOCKER-4 probes can be merged into a single ops-vps-fetch task** (one probe call to GSO monthly page answers both). The probe must confirm: (a) basket names in Vietnamese (they are stable but need to be mapped to English keys), (b) whether weights (trọng số) are in the table or require a separate CPI methodology PDF.

---

## Probe Scope

**VPS-routed HTTP fetch targets:**
1. `https://www.gso.gov.vn/` (homepage, find monthly press-release link)
2. Most recent monthly socio-economic press-release page (`bai-viet/` path)
3. (Optional) Excel download link if mentioned

**What to capture:**
- Raw HTML of the press-release page (or PDF/Excel metadata)
- Table positions/CSS IDs for: IIP, retail sales, public investment, FDI, CPI baskets
- CPI basket names in Vietnamese (all 11) with English mapping suggestions
- CPI basket weights (if in table)
- Confirm all 5 indicators (IIP, retail, public-invest, FDI, CPI) on same page or separate

**What NOT to do:**
- Do NOT parse the data yet
- Do NOT implement parsers
- Just fetch, document, save sample

**Parallel task (VMT-3a-PMI):**
- Dev probes S&P Global PMI page separately (not geo-blocked, can start immediately after Zone D lands, no probe gate)

---

## Output

**Deliverable files:**
1. `scripts/probes/vmt-probe-3.sh` — curl script to fetch GSO page via VPS
2. `scripts/probes/vmt-3-sample.json` — raw HTML snippet or table structure metadata

**Email / Caveman message to Architect:**
```
Subject: PROBE-3 result — GSO table structure + CPI basket names

Findings:
- URL: [confirmed monthly press-release URL]
- IIP table: [position/CSS ID, column headers]
- Retail sales: [position/CSS ID, column headers]
- Public investment: [position/CSS ID, column headers]
- FDI (registered+disbursed): [position/CSS ID, column headers]
- CPI baskets (11): [Vietnamese names], English mappings suggested
- CPI weights: [in table / separate PDF / not found]
- Parse strategy: [HTML CSS selectors / Excel download]

Attached: vmt-3-sample.json (HTML snippet)
Script: vmt-probe-3.sh (curl command)

PMI probe: separate task (dev-mainserver-crawls probes S&P directly, parallel)
```

---

## Task Boundaries

**This task ENDS when:**
- Probe script is in `scripts/probes/vmt-probe-3.sh`
- Live sample is captured in `scripts/probes/vmt-3-sample.json`
- Findings communicated to Architect

**Next steps (for ARCHITECT only):**
- Confirm parse strategy (HTML CSS selectors vs Excel)
- If HTML: provide config map template (table IDs, column positions)
- If Excel: confirm dev should use existing Excel library
- Gate VMT-3b (GSO path) and VMT-4 (CPI) with confirmed strategy

**VMT-3a (PMI path) is NOT blocked by this probe** — dev can start PMI probe immediately after Zone D lands (S&P is not geo-blocked).

**VMT-3b + VMT-4 are blocked until Architect confirms GSO table structure and parse strategy.**
