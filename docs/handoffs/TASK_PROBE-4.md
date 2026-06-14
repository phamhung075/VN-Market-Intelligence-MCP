---
sprint: VN-MACRO-TOOLING
task_id: PROBE-4
type: PROBE
size: S
zone: ops
wave: 1
depends_on: []
blocks: ["VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO"]
---

# PROBE-4 — ops-vps-fetch: SBV interbank + OMO pages (1w tenor, OMO net outstanding)

## TLDR

Probe the State Bank of Vietnam (SBV) interbank rate fixings and OMO (Open Market Operations) auction pages to confirm: (1) whether 1-week tenor is explicit or derived from a tenor grid, (2) whether OMO net outstanding is stated directly or computed from individual add/drain auction entries. Deliverable: live samples to `scripts/probes/vmt-4-sample.json` + confirmed page structure + calculation method for OMO.

## [PM] Planning Context

**Blocker:** BLOCKER-5 — VMT-5 interbank_1w + OMO_outstanding fields depend on probe result.

**Why this matters:**
- SBV publishes interbank rates daily (business days only) and OMO auction results frequently.
- The 1-week (1w) tenor is the primary benchmark used by the skill; if not explicit, dev must derive it from tenor grid.
- OMO net outstanding is critical for liquidity-stress gauging; if not directly stated, dev must sum individual operations.
- **IRS (Interest Rate Swap) is permanently deferred** to `is_estimate=true` (DD-6 in arch decision journal) — do NOT block VMT-5 on IRS source confirmation.

**Acceptance Criteria:**
- [ ] Fetch SBV interbank rate pages via Vinahost VPS (`https://www.sbv.gov.vn/` rates/IR page)
- [ ] Confirm whether 1w tenor appears explicitly in the tenor grid or must be inferred
- [ ] Capture sample interbank rate table (at least one day's fixings across tenors)
- [ ] Fetch SBV OMO auction results pages via VPS
- [ ] Determine whether OMO net outstanding is stated directly or must be computed:
  - Direct: "Net outstanding as of [date]: X billion VND"
  - Computed: sum of individual reverse-repo add / absorb auction entries
- [ ] Capture sample OMO auction table (at least one day's operations)
- [ ] Save live samples to `scripts/probes/vmt-4-sample.json`
- [ ] Document: interbank page URL, tenor grid structure, 1w tenor explicit/derived; OMO page URL, net outstanding calculation method
- [ ] **IRS:** brief search for HNX or OTC interbank derivative quotes (expected: NOT found or unreliable); report back to Architect; VMT-5 proceeds with `irs.is_estimate=true` regardless

**Files to read first:**
- `docs/handoffs/ARCH-VN-MACRO-TOOLING.md` § BLOCKER-5, DD-6 (IRS deferred)
- `docs/REQ_VN-MACRO-TOOLING.md` § Tool 5 — `get_vn_liquidity_state`, FR-2 (interbank_1w, OMO outstanding)
- SBV website (find interbank rate + OMO auction pages)

**Files to create:**
- `scripts/probes/vmt-probe-4.sh` — curl script to fetch SBV pages via VPS
- `scripts/probes/vmt-4-sample.json` — raw interbank + OMO table samples

**Dependencies:** None (WAVE-1 parallel)

**Knowledge needed:**
- VPS proxy setup
- SBV website structure (interbank rates page, OMO auction results page)
- Interbank tenor terminology (1d, 1w, 2w, 1m, 3m, etc.)
- OMO mechanics (reverse-repo add/absorb, net outstanding calculation)

---

## Context from Architecture

From ARCH-VN-MACRO-TOOLING, BLOCKER-5:

> **SBV interbank + OMO + IRS (VMT-5 gate):**
> SBV publishes:
> - Interbank rates: `https://www.sbv.gov.vn/webcenter/portal/en/home/rm/ir` or equivalent Vietnamese-language rates page — daily fixing by tenor
> - OMO auction results: separate page or section on the SBV site
>
> Probe must confirm: (a) 1-week tenor is explicitly labeled in the tenor grid (not derived), (b) OMO net outstanding is stated directly or must be summed from individual auction add/drain entries.
>
> **IRS (Interest Rate Swap) decision:** HNX publishes limited OTC derivative data. The IRS market in Vietnam is OTC and not consistently machine-readable. **Decision as stated in DD-6: `irs.is_estimate=true` permanently until a confirmed machine-readable URL is found.** Do NOT block VMT-5 on IRS resolution. The field exists in the schema, returns `rate_1y_pct: null, is_estimate: true`. This is correct and honest per GA-4.

---

## Probe Scope

**VPS-routed HTTP fetch targets:**
1. SBV interbank rate page (find URL from homepage or known link)
2. SBV OMO auction results page (find URL from homepage or known link)

**What to capture:**
- Interbank rate table: tenor grid (1d, 1w, 2w, 1m, 3m, 6m, 12m, etc.), daily fixings
- **CRITICAL:** Is 1w tenor explicitly labeled, or must it be interpolated from the tenor grid?
- OMO auction table: date, operation type (add/absorb), amount, tenor
- **CRITICAL:** Is "net outstanding" directly stated, or must it be computed?
- Sample data (at least 1-2 days for interbank, 3-5 auctions for OMO)

**What NOT to do:**
- Do NOT parse the data
- Do NOT implement parsers
- Do NOT implement IRS source search (just note: HNX search likely negative)
- Just fetch, document, save sample

---

## Output

**Deliverable files:**
1. `scripts/probes/vmt-probe-4.sh` — curl script to fetch SBV pages via VPS
2. `scripts/probes/vmt-4-sample.json` — raw interbank + OMO table samples

**Email / Caveman message to Architect:**
```
Subject: PROBE-4 result — SBV interbank + OMO page structure

Findings:
- Interbank page URL: [confirmed URL]
- Tenor grid: [1d, 1w (explicit?), 2w, 1m, 3m, 6m, 12m, etc.]
- 1w tenor: [explicit / must derive from grid / not found]
- OMO page URL: [confirmed URL]
- OMO net outstanding: [directly stated / must compute from add/absorb entries]
- IRS source search: [HNX link found / no machine-readable source / escalate to Architect]

Attached: vmt-4-sample.json (interbank + OMO tables)
Script: vmt-probe-4.sh (curl command)
```

---

## Task Boundaries

**This task ENDS when:**
- Probe script is in `scripts/probes/vmt-probe-4.sh`
- Live samples are captured in `scripts/probes/vmt-4-sample.json`
- Findings communicated to Architect
- Brief note on IRS source search (expected: not found)

**Next steps (for ARCHITECT only):**
- Confirm 1w tenor derivation method (explicit or grid interpolation)
- Confirm OMO net outstanding calculation method
- Gate VMT-5b (interbank + OMO parser) with confirmed strategy

**VMT-5a (policy_rates + SJC + fx_coupling) is NOT blocked by this probe** — dev can start immediately after Zone D lands.

**VMT-5b (interbank_1w + OMO) is blocked until Architect confirms tenor/OMO calculation methods.**

**IRS field is always `is_estimate=true`** — no probe dependency.
