# Recon — sbv-rates

**Date:** 2026-05-13 04:43 UTC
**Agent:** ops-vps-fetch
**Source URL:** `https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68`
**Trigger:** new_source_needed (bootstrap inventory)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: application/xml,text/xml,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8' \
  -H 'Referer: https://portal.vietcombank.com.vn/' \
  -L \
  "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68"
```

## HTTP Probe Results

- **Status:** 200 OK
- **Final URL:** `https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68`
- **Content-Type:** text/xml; charset=utf-8
- **Response time:** 111ms
- **Content-Length:** 2564 bytes
- **Redirect chain:** none
- **Cache-Control:** `public, max-age=426` (~7 minutes TTL)
- **CDN:** Akamai (`akamai-grn` header present)
- **CORS:** `Access-Control-Allow-Origin: https://vcbdigibank.vietcombank.com.vn` — restricted but no authentication required for GET

## Anti-Bot Assessment

- **Type:** none
- **Evidence:** Clean 200 XML response. Akamai CDN is present (`akamai-grn: 0.ec07f2ab.1778647435.37d19ab7`) but no active bot management challenge observed. No `set-cookie` in response. Response comment says "For reference only. Only one request every 5 minutes!" — this is a soft rate limit advisory, not enforced technically.
- **Recommendation:** n/a — plain curl works. Honor the 5-minute advisory (current service polls every 30 minutes — well within limit).

## Page Structure

### XML Paths (XML source)

```
ExrateList/DateTime             → timestamp of rate update (e.g. "5/13/2026 11:36:00 AM")
ExrateList/Exrate/@CurrencyCode → ISO 4217 currency code (e.g. "USD", "EUR", "JPY")
ExrateList/Exrate/@CurrencyName → padded currency name string
ExrateList/Exrate/@Buy          → buy rate (VND per unit, comma-formatted string)
ExrateList/Exrate/@Transfer     → transfer/wire rate
ExrateList/Exrate/@Sell         → sell rate
```

Currencies observed in response: AUD, CAD, CHF, CNY, DKK, EUR, GBP, HKD, INR, JPY, KRW, KWD, MYR, NOK, RUB, SAR, SEK, SGD, THB, USD.

## Sample Response Excerpt

```xml
<!--For reference only. Only one request every 5 minutes!-->
<ExrateList>
  <DateTime>5/13/2026 11:36:00 AM</DateTime>
  <Exrate CurrencyCode="AUD" CurrencyName="AUSTRALIAN DOLLAR   "
    Buy="18,564.18" Transfer="18,751.70" Sell="19,352.18" />
  <Exrate CurrencyCode="USD" CurrencyName="US DOLLAR           "
    Buy="25,950.00" Transfer="26,129.00" Sell="26,310.00" />
</ExrateList>
```

## Notes

- Service confirmed working end-to-end: `PUSH: SBV rates → {"ok":true,"usdVnd":26129}` in log at 04:00 UTC 2026-05-13.
- Minor script bug observed: `fetch-sbv.sh: line 18: [: 321061: unary operator expected` — bash comparison error, non-fatal (push succeeds despite warning).
- `b=68` query param appears to be a branch identifier for Vietcombank. Altering it may return different branch rates.
- The `Access-Control-Allow-Origin` restricts cross-origin browser requests to `vcbdigibank.vietcombank.com.vn` but server-side curl is unaffected.
- Akamai presence means IP-based rate limiting is theoretically possible at higher frequency. Current 30-min interval is safe.
