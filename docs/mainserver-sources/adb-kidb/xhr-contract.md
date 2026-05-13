# ADB KIDB — XHR Contract (Phase 1 Discovery)

**Discovered:** 2026-05-13T09:45Z
**Discovery method:** Playwright network interception + JS bundle static analysis (`/js/web.js`)
**Source URL:** https://kidb.adb.org
**Status:** RESOLVED — direct SDMX v4 API confirmed, no headless browser needed in Phase 2

---

## Finding Summary

The ADB KIDB SPA does not make XHR calls during initial page load (static assets only during
`networkidle`). Data calls trigger lazily after user interaction inside the Vue Router SPA.

However, static analysis of the compiled bundle (`/js/web.js`, 1.26MB) exposed the full API
contract. ADB KIDB exposes a well-documented SDMX v4 REST API:

```
GET https://kidb.adb.org/api/v4/sdmx/data/ADB,{DATAFLOW}/A.{INDICATOR}.{ECONOMY}?format=sdmx-json
```

No authentication. No Akamai. Azure CDN only — all direct `curl` and `fetch()` requests succeed.
Phase 1 is complete. Phase 2 adapter uses direct fetch (~15MB RAM, no Playwright needed).

---

## Working API Endpoints (HTTP 200, confirmed)

### 1. Data endpoint (primary — use in Phase 2 adapter)

```
GET https://kidb.adb.org/api/v4/sdmx/data/ADB,{DATAFLOW}/A.{INDICATOR}.{ECONOMY}?format=sdmx-json
```

Live-tested examples:
```
GET https://kidb.adb.org/api/v4/sdmx/data/ADB,EO_NA/A.NGDP_XDC.VIE?format=sdmx-json
  → 200 JSON — Vietnam GDP at current prices (VND billions), 2000-2024

GET https://kidb.adb.org/api/v4/sdmx/data/ADB,EO_NA_CONST_GOO/A..VIE?format=sdmx-json
  → 200 JSON — Vietnam GDP growth (%), 2000-2024 (latest: 2024=7.09%)

GET https://kidb.adb.org/api/v4/sdmx/data/ADB,MFP_PR/A..VIE?format=sdmx-json
  → 200 JSON — Vietnam CPI/prices (multiple indicators), 2000-2024
```

Pattern notes:
- `{DATAFLOW}` — ADB dataflow ID (see table below)
- `{INDICATOR}` — Specific indicator code, or `.` (dot) for ALL in dataflow
- `{ECONOMY}` — **`VIE`** for Vietnam (ADB code, NOT `VNM`)
- `A.` prefix = Annual frequency

### 2. Indicator metadata endpoint

```
GET https://kidb.adb.org/api/dataflow/indicators/{DATAFLOW}
```

Returns `[{code, name, description}]` array.
Example: `GET https://kidb.adb.org/api/dataflow/indicators/MFP_PR` → 200 JSON

### 3. Dataflow catalog

```
GET https://kidb.adb.org/api/v4/sdmx/structure/dataflow/all/all/
```

Returns XML listing 62 dataflows. Parse with regex or xml.etree.

---

## Response Format — SDMX-JSON Compact

```json
{
  "meta": { "id": "...", "prepared": "2026-05-13T09:45:16Z" },
  "data": {
    "structures": [{
      "dimensions": {
        "series": [
          { "id": "FREQ",         "values": [{"id": "A"}] },
          { "id": "INDICATOR",    "values": [{"id": "NGDP_R_PTX_PS"}] },
          { "id": "ECONOMY_CODE", "values": [{"id": "VIE"}] }
        ],
        "observation": [
          { "id": "TIME_PERIOD",
            "values": [{"value": "2000"}, {"value": "2001"}, ..., {"value": "2024"}] }
        ]
      }
    }],
    "datasets": [{
      "series": {
        "0.0.0": {
          "observations": {
            "0":  ["2.865411946"],
            "24": ["7.091187412"]
          }
        }
      }
    }]
  }
}
```

**Parsing key:**
- Series key `0.0.0` = `FREQ_IDX.INDICATOR_IDX.ECONOMY_IDX`
- `observations[N][0]` is the numeric value (as string)
- `structures[0].dimensions.observation[TIME_PERIOD].values[N].value` is the year string

---

## Vietnam Economy Code

ADB KIDB uses **`VIE`** (not `VNM`) for Vietnam across all endpoints.
Confirmed via codelist: `/api/v4/sdmx/structure/codelist/ADB/CL_ECONOMY_CODES/` → `VIE: Viet Nam`

---

## Key Dataflows for VN Market Intelligence

| Dataflow ID | Name | Confirmed VN indicators |
|---|---|---|
| EO_NA | Economy and Output, National Accounts | NGDP_XDC (GDP current prices VND) |
| EO_NA_CONST_GOO | Growth of Output (% annual change) | NGDP_R_PTX_PS (GDP growth %) |
| MFP_PR | Prices | PCPI_PC_PP_PT (CPI % change), PCPI_IX (CPI index) |
| PPL_LE | Labor Force and Employment | LLF_PE_NUM, LUD_PE_NUM_PS |
| PPL_POP | Population | population time series |
| GLB_ET | External Trade | trade balance indicators |
| GG_GF | Government Finance | fiscal indicators |

Live-confirmed 2026-05-13:
- GDP growth 2024: **7.09%** (`EO_NA_CONST_GOO`, `NGDP_R_PTX_PS`)
- CPI index 2024: **103.63** (`MFP_PR`, `PCPI_IX`)

---

## Phase 2 Adapter

File: `apps/macro-indicators/src/infrastructure/scrapers/adb-kidb.ts`

RAM cost: **~15MB** (direct fetch, no Playwright). Phase 1 complete — no re-run needed unless
ADB KIDB migrates to a different API version.

---

## Re-Run Phase 1 (if ADB updates API)

```bash
python3 apps/macro-indicators/scripts/discover-adb-xhr.py --interact
```

Expected RAM: ~400MB during run. Browser closes immediately after.
