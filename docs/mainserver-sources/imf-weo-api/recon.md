# Recon — imf-weo-api

**Date:** 2026-05-13 (supersedes imf-datamapper recon)
**Agent:** dev-mainserver-crawls (confirmed via live probe)
**Source URL:** https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/VNM.NGDP_RPCH
**Trigger:** imf-datamapper blocked by Akamai on main server — switched to api.imf.org SDMX 3.0

## Status: SUPERSEDES imf-datamapper

`docs/mainserver-sources/imf-datamapper/recon.md` documents the Akamai block on
`www.imf.org/external/datamapper/`. This document records the working alternative:
`api.imf.org` SDMX 3.0 API — different domain, no Akamai, Azure/Istio CDN only.

## Working Request Recipe

```bash
# IMF WEO via api.imf.org SDMX 3.0 — no auth, no bot protection
curl -s \
  -H 'Accept: application/json' \
  'https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/VNM.NGDP_RPCH?format=jsondata&dimensionAtObservation=AllDimensions'
# Returns: 200 JSON — Vietnam GDP growth forecasts + historical (1980-2031)
```

## HTTP Probe Results

- **Status:** 200 OK
- **Domain:** api.imf.org (Azure + Istio, NOT Akamai)
- **Content-Type:** application/json
- **Response headers of note:**
  - `server: istio-envoy` — Azure-hosted API, no Akamai Bot Manager
  - No `_abck`, `akamai-grn`, or `x-reference-error` headers
- **Authentication:** None required — public open API

## API Structure — IMF DataMapper SDMX 3.0

Base: `https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/~/{KEY}`

Key format: `{COUNTRY1}+{COUNTRY2}.{INDICATOR1}+{INDICATOR2}` (+ = OR separator)

Query params:
- `format=jsondata&dimensionAtObservation=AllDimensions` → compact SDMX-JSON with all dimensions
  in observation key (most efficient for parsing)

### Dimension indices in observation key

With `dimensionAtObservation=AllDimensions`, observation key format is:
`COUNTRY_IDX:INDICATOR_IDX:FREQUENCY_IDX:TIME_IDX`

Example: `202:0:0:44` = country_idx=202 (VNM), indicator_idx=0 (NGDP_RPCH), freq_idx=0 (A), time_idx=44 (2024)

Dimension value arrays in `structures[0].dimensions.observation`:
- COUNTRY (210 values): sorted array, VNM at index 202
- INDICATOR (145 values): sorted array, NGDP_RPCH at index 0
- FREQUENCY (1 value): ["A"] annual
- TIME_PERIOD (52 values): ["1980", "1981", ..., "2031"] — includes WEO forecasts through 2031

### Key Indicator Codes

| Code | Description |
|---|---|
| NGDP_RPCH | Real GDP growth (% change) |
| NGDPD | GDP current prices (billions USD) |
| PCPIPCH | Inflation, average consumer prices (% change) |
| LUR | Unemployment rate (% of labor force) |
| BCA_NGDPD | Current account balance (% of GDP) |
| GGXCNL_NGDP | Government net lending/borrowing (% of GDP) |

## Sample Response

```json
{
  "meta": {},
  "data": {
    "structures": [{
      "dimensions": {
        "observation": [
          {"id": "COUNTRY", "values": [{"id": "ABW"}, ..., {"id": "VNM"}, ...]},
          {"id": "INDICATOR", "values": [{"id": "NGDP_RPCH"}, ...]},
          {"id": "FREQUENCY", "values": [{"id": "A"}]},
          {"id": "TIME_PERIOD", "values": [{"value": "1980"}, ..., {"value": "2031"}]}
        ]
      }
    }],
    "dataSets": [{
      "observations": {
        "202:0:0:44": ["7.1"],
        "202:0:0:45": ["8.0"],
        "202:0:0:46": ["7.1"]
      }
    }]
  }
}
```

Live-confirmed 2026-05-13:
- VNM NGDP_RPCH 2024: **6.95%**
- VNM NGDP_RPCH 2025: **8.02%** (WEO forecast)
- VNM NGDP_RPCH 2026: **7.10%** (WEO forecast)

## Notes

- api.imf.org returns the full WEO dataset (all 210 countries) even when filtering by country.
  Filter server-side by finding country index in `structures[0].dimensions.observation[COUNTRY].values`.
- WEO includes forecast years (2025-2031) marked by IMF as projections.
- Published twice yearly: April + October WEO release.
- No pagination — single request returns all historical + forecast years.
- Rate limiting: not documented. Use 1-2s gap between requests as courtesy.

## Technique

`open-api-key` (no key required) — standard fetch with Accept: application/json.
RAM cost: ~5MB (no headless browser needed).
