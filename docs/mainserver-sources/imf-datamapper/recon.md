# Recon — imf-datamapper [SUPERSEDED]

> **SUPERSEDED 2026-05-13:** www.imf.org DataMapper is Akamai-blocked from main server.
> Production adapter switched to `api.imf.org` SDMX 3.0 (no bot protection).
> See: `docs/mainserver-sources/imf-weo-api/recon.md` + `apps/macro-indicators/src/infrastructure/scrapers/imf-weo.ts`

# Recon — imf-datamapper (original — archived)

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/VNM
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
# www.imf.org DataMapper API is blocked by Akamai Bot Manager (403)
# Alternative: use datamapper.imf.org subdomain (DNS timeout from main server — likely Akamai geo-routing issue)
# Third option: IMF Data API (api.imf.org) — open, no bot protection
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: application/json' \
  -L \
  "https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/VNM"
# Returns: 403 Access Denied (Akamai Bot Manager)
```

## HTTP Probe Results

- **Status:** 403 Access Denied (www.imf.org DataMapper API) | 000 connection timeout (datamapper.imf.org)
- **Final URL:** https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/VNM
- **Content-Type:** text/html (403 error page)
- **Redirect chain:** none
- **Response headers of note:**
  - `server: AkamaiGHost` — Akamai CDN/WAF
  - `x-reference-error: 18.4cc8c217.1778648348.e71774b6` — Akamai reference ID
  - `akamai-grn: 0.4cc8c217.1778648348.e71774b6` — Akamai request ID
  - No `_abck` cookie offered (hard block, not challenge)
- **datamapper.imf.org:** DNS resolves but connection hangs → STATUS:000 (Akamai edge timeout / IP block)

## Anti-Bot Assessment

- **Type:** akamai_bot (hard block on www.imf.org DataMapper) + potential IP-level block on datamapper.imf.org
- **Evidence:**
  - `server: AkamaiGHost` — confirmed Akamai WAF
  - `x-reference-error` and `akamai-grn` headers — Akamai reference codes
  - Hard 403 "Access Denied" body — not a soft challenge
  - `datamapper.imf.org` → STATUS:000 (TCP connect hang or immediate reset at Akamai edge)
- **Geo-blocked from main server:** no (Akamai Bot Manager block, not geo-fence — France IP not restricted)
- **Recommendation:**
  1. Try IMF's alternative open API: `https://api.imf.org/external/weo/` (IMF World Economic Outlook API) — different domain, may not be behind Akamai Bot.
  2. If DataMapper needed: Botasaurus human simulation (`docs/mainserver-crawl-techniques/botasaurus-human-sim.md`) — Akamai Bot requires `_abck` cookie with sensor data computation. headless_likely_needed: true.

## Page Structure

### JSON Paths (DataMapper API — when accessible)

- `$.values.NGDP_RPCH.VNM.<year>` → GDP growth rate for Vietnam by year (when 200 returned)
- `$.countries.VNM` → country metadata
- URL pattern: `https://www.imf.org/external/datamapper/api/v1/<indicator>/<country-code>`
- Indicators: `NGDP_RPCH` (GDP growth), `PCPIPCH` (inflation), `LUR` (unemployment), `BCA_NGDPD` (current account)

### Alternative: IMF WEO API

- URL: `https://api.imf.org/external/weo/WEOApr2026/weojson?indicator=NGDP_RPCH&country=VNM`
- Returns JSON with full WEO dataset — no Akamai protection observed (different domain)

## Sample Response Excerpt

```html
<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD>
<BODY><H1>Access Denied</H1>
You don't have permission to access "http://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/VNM" on this server.
Reference #18.4cc8c217.1778648348.e71774b6
</BODY></HTML>
```

## Notes

- The www.imf.org DataMapper API was publicly accessible without bot protection in early 2025; Akamai Bot Manager has been added since.
- The IMF DataMapper frontend at https://www.imf.org/external/datamapper/ still works in a browser because it passes full browser fingerprints.
- Recommend probing `api.imf.org` (WEO API) as primary alternative — separate domain with lighter protection.
- FRED (St. Louis Fed) is a better source for US macro data; IMF is specifically useful for VN/EM macro forecasts.
- dev-mainserver-crawls should probe `api.imf.org` as a separate recon target.
