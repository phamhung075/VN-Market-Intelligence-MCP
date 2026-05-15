# hsx.vn BCTC API — Developer Recipe

**Source:** Ho Chi Minh Stock Exchange (HOSE) public API  
**Probed:** 2026-05-15 from France (no VPS needed)  
**Existing implementation:** `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts`

---

## 1. Summary

No browser needed. Pure REST JSON. No account, no login, no CSRF, no session cookie.

hsx.vn exposes a plain HTTP JSON API backed by two microservices (`/l/` for listings, `/m/` for media). The SPA frontend reads these endpoints using a static API token embedded in its JS bundle. That same token works from any server-side HTTP client. PDF files are served directly from a CDN (`staticfile.hsx.vn`) with no authentication at all — a plain `GET` returns `200 application/pdf`.

The API is HOSE-only. Tickers listed on HNX or UPCOM (e.g. VEA) return an empty `data.list` from the listing endpoint.

---

## 2. Authentication

**Mechanism:** a single static request header named `type`.

```
type: HJ2HNS3SKICV4FNE
```

**Origin:** hard-coded as `REACT_APP_TYPE` in the hsx.vn SPA JS bundle (confirmed in `main.d430e296.js`, 2026-03-06).

**Observed behaviour without the header:** both endpoints return HTTP 200 with a valid JSON body — the token is NOT currently enforced server-side. However it must be included as a defensive measure: HOSE may start enforcing it on any bundle rebuild, and it is present in all legitimate browser requests.

**Rotation risk:** if HOSE rebuilds their SPA bundle the token value may change. Detection signal: all HOSE tickers simultaneously return empty `data.list`. Recovery: re-fetch `https://www.hsx.vn/static/js/main.*.js` and grep for `REACT_APP_TYPE` or `HJ2HNS`.

---

## 3. Required Headers

| Header | Value | Required? |
|---|---|---|
| `type` | `HJ2HNS3SKICV4FNE` | Defensive — include always |
| `Origin` | `https://www.hsx.vn` | Recommended (CORS origin) |
| `Referer` | `https://www.hsx.vn/` | Recommended |
| `User-Agent` | Any modern browser UA | Recommended |
| `Accept` | `application/json, */*` | Optional |

PDF CDN downloads (`staticfile.hsx.vn`) require none of the above — bare `GET` works.

---

## 4. Endpoint 1 — Ticker to Numeric ID

**URL:** `https://api.hsx.vn/l/api/v1/1/securities/stock`  
**Method:** GET  
**Service slug:** `/l/` = listing service

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `code` | string | Ticker symbol, uppercase (e.g. `VNM`) |

### Response shape

```json
{
  "data": {
    "list": [
      {
        "id": 2281,
        "code": "VNM",
        "name": "Công ty Cổ phần Sữa Việt Nam",
        "brief": "VINAMILK",
        "capital": 20899554450000,
        "isin": "VN000000VNM8",
        "bloomberg": "BBG000BF6NK4",
        "listingVolume": "2,089,955,445"
      }
    ],
    "paging": { "pageIndex": 1, "pageSize": 50, "totalCount": 1, "totalPages": 1 }
  },
  "success": true,
  "message": null
}
```

**Key extraction:** `data.list[0].id` — this is the numeric securities ID used in Endpoint 2.

**Non-HOSE result:** `data.list` is an empty array `[]`. Not an error — the ticker is simply not listed on HOSE.

### Live examples (probed 2026-05-15)

| Ticker | Numeric ID | Exchange |
|---|---|---|
| VNM | 2281 | HOSE |
| HPG | 2458 | HOSE |
| ACB | 2784 | HOSE |
| FPT | 2129 | HOSE |
| VEA | NOT_FOUND | HNX (not on HOSE) |

---

## 5. Endpoint 2 — BCTC PDF List

**URL:** `https://api.hsx.vn/m/api/v1/1/mediafiles/5/{numericId}`  
**Method:** GET  
**Service slug:** `/m/` = media service  
**Path segment `5`:** `typeId = 5` = financial reports (BCTC). Other typeIds exist for other disclosure types.

### Path parameters

| Segment | Description |
|---|---|
| `{numericId}` | Numeric securities ID from Endpoint 1 (e.g. `2281`) |

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `pageIndex` | int | 1-based page number |
| `pageSize` | int | Items per page (max 100) |
| `year` | int | Filter by report year (e.g. `2025`). Pass `0` for all years. |

### Response shape

```json
{
  "data": {
    "list": [
      {
        "fileName": "20260429 - VNM - BCTC DA SOAT XET Q1.2026 - RIENG VN.pdf",
        "fileType": ".pdf",
        "filePath": "~/Uploads/UploadDocuments/2458538/20260429 - VNM - BCTC DA SOAT XET Q1.2026 - RIENG VN.pdf",
        "publishDate": 1767200400,
        "publishFrom": 1767200400,
        "relatedType": 5,
        "publishType": 1.0,
        "time": "01.2026",
        "type": "Quý",
        "langId": 1,
        "createdDate": 1777459990
      }
    ],
    "paging": {
      "pageIndex": 1,
      "pageSize": 5,
      "totalCount": 217,
      "totalPages": 44
    }
  },
  "success": true,
  "message": null
}
```

### Key fields

| Field | Type | Notes |
|---|---|---|
| `fileName` | string | Human-readable filename including ticker, type, period |
| `fileType` | string | Always `.pdf` for financial reports |
| `filePath` | string | Relative path prefixed with `~` — replace with CDN base to get download URL |
| `publishDate` | int | Unix timestamp (seconds) of official publication date |
| `time` | string | Period label e.g. `"01.2026"` (Q1 2026), `"2025"` (annual) |
| `type` | string | Vietnamese: `"Quý"` = quarterly, `"Năm"` = annual |

---

## 6. PDF Download URL Construction

`filePath` values use a `~` prefix as a placeholder for the CDN base:

```
filePath:  ~/Uploads/UploadDocuments/2458538/20260429 - VNM - BCTC DA SOAT XET Q1.2026 - RIENG VN.pdf
CDN base:  https://staticfile.hsx.vn
```

**Rule:** replace the leading `~` with `https://staticfile.hsx.vn`.

```
download URL = filePath.replace("~", "https://staticfile.hsx.vn")
```

**Result:**
```
https://staticfile.hsx.vn/Uploads/UploadDocuments/2458538/20260429 - VNM - BCTC DA SOAT XET Q1.2026 - RIENG VN.pdf
```

URL-encode spaces before using in HTTP clients. The CDN returns `200 application/pdf` with `Content-Length` — no authentication, no redirect, direct download.

**Probe C result (2026-05-15):**
```
HTTP/1.1 200 OK
Content-Length: 3103011
Content-Type: application/pdf
Last-Modified: Wed, 29 Apr 2026 10:53:10 GMT
Accept-Ranges: bytes
```

---

## 7. Curl Recipe

### Step 1 — Resolve ticker to ID

```bash
curl -s \
  -H "type: HJ2HNS3SKICV4FNE" \
  -H "Origin: https://www.hsx.vn" \
  -H "Referer: https://www.hsx.vn/" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  -H "Accept: application/json" \
  "https://api.hsx.vn/l/api/v1/1/securities/stock?code=VNM" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['list'][0]['id'])"
# Output: 2281
```

### Step 2 — Fetch BCTC PDF list

```bash
# Replace 2281 with the ID from Step 1
curl -s \
  -H "type: HJ2HNS3SKICV4FNE" \
  -H "Origin: https://www.hsx.vn" \
  -H "Referer: https://www.hsx.vn/" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  "https://api.hsx.vn/m/api/v1/1/mediafiles/5/2281?pageIndex=1&pageSize=100&year=2025" \
  | python3 -m json.tool
```

### Step 3 — Download a PDF

```bash
# URL-encode the path; no auth headers needed
curl -O --url-query "" \
  "https://staticfile.hsx.vn/Uploads/UploadDocuments/2458538/20260429%20-%20VNM%20-%20BCTC%20DA%20SOAT%20XET%20Q1.2026%20-%20RIENG%20VN.pdf"
```

---

## 8. Python Recipe

```python
import requests
from urllib.parse import quote

HEADERS = {
    "type": "HJ2HNS3SKICV4FNE",
    "Origin": "https://www.hsx.vn",
    "Referer": "https://www.hsx.vn/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}
STATICFILE_BASE = "https://staticfile.hsx.vn"


def get_bctc_urls(ticker: str, year: int) -> list[str]:
    # Step 1: resolve ticker -> numeric ID
    r = requests.get(
        "https://api.hsx.vn/l/api/v1/1/securities/stock",
        params={"code": ticker.upper()},
        headers=HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    items = r.json().get("data", {}).get("list", [])
    if not items:
        return []  # not on HOSE
    numeric_id = items[0]["id"]

    # Step 2: fetch BCTC PDF list
    r2 = requests.get(
        f"https://api.hsx.vn/m/api/v1/1/mediafiles/5/{numeric_id}",
        params={"pageIndex": 1, "pageSize": 100, "year": year},
        headers=HEADERS,
        timeout=10,
    )
    r2.raise_for_status()
    media_items = r2.json().get("data", {}).get("list", [])

    return [
        item["filePath"].replace("~", STATICFILE_BASE)
        for item in media_items
        if item.get("fileType") == ".pdf" and item.get("filePath")
    ]


if __name__ == "__main__":
    urls = get_bctc_urls("VNM", 2025)
    for url in urls:
        print(url)
```

---

## 9. TypeScript Recipe

```typescript
const HSX_HEADERS = {
  type: "HJ2HNS3SKICV4FNE",
  Origin: "https://www.hsx.vn",
  Referer: "https://www.hsx.vn/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};
const STATICFILE_BASE = "https://staticfile.hsx.vn";

async function getBctcUrls(ticker: string, year: number, timeoutMs = 10_000): Promise<string[]> {
  const signal = AbortSignal.timeout(timeoutMs);

  // Step 1: resolve ticker -> numeric ID
  const listingUrl = `https://api.hsx.vn/l/api/v1/1/securities/stock?code=${encodeURIComponent(ticker.toUpperCase())}`;
  const r1 = await fetch(listingUrl, { headers: HSX_HEADERS, signal });
  if (!r1.ok) return [];
  const j1 = await r1.json() as { data?: { list?: Array<{ id: number }> } };
  const list = j1?.data?.list ?? [];
  if (list.length === 0) return []; // not on HOSE

  const numericId = list[0].id;

  // Step 2: fetch BCTC PDF list
  const mediaUrl =
    `https://api.hsx.vn/m/api/v1/1/mediafiles/5/${numericId}` +
    `?pageIndex=1&pageSize=100&year=${year}`;
  const r2 = await fetch(mediaUrl, { headers: HSX_HEADERS, signal });
  if (!r2.ok) return [];
  const j2 = await r2.json() as { data?: { list?: Array<{ fileType?: string; filePath?: string }> } };

  return (j2?.data?.list ?? [])
    .filter(item => item.fileType === ".pdf" && item.filePath)
    .map(item => item.filePath!.replace("~", STATICFILE_BASE));
}
```

---

## 10. Filtering for BCTC Only

The mediafiles endpoint (`typeId=5`) already scopes results to financial reports. However the list may contain non-BCTC items (e.g. annual reports, ESG reports). To isolate BCTC filings, filter by `fileName` keywords:

```python
BCTC_KEYWORDS = ["BCTC", "BAO CAO TAI CHINH", "BÁO CÁO TÀI CHÍNH"]

def is_bctc(file_name: str) -> bool:
    upper = file_name.upper()
    return any(kw in upper for kw in BCTC_KEYWORDS)
```

```typescript
const BCTC_KEYWORDS = ["BCTC", "BAO CAO TAI CHINH", "BÁO CÁO TÀI CHÍNH"];
const isBctc = (name: string) =>
  BCTC_KEYWORDS.some(kw => name.toUpperCase().includes(kw));
```

Observed `fileName` patterns from live probe:

| Pattern | Period type |
|---|---|
| `... BCTC DA SOAT XET Q1.2026 ...` | Quarterly reviewed |
| `... BCTC HOP NHAT 2025 - DA KIEM TOAN ...` | Annual consolidated audited |
| `... BCTC RIENG 2025 - DA KIEM TOAN ...` | Annual standalone audited |
| `... BCTC Q4.2025 - HOP NHAT ...` | Q4 consolidated |

---

## 11. Known Limitations

| Limitation | Detail |
|---|---|
| HOSE only | HNX and UPCOM tickers return empty `data.list`. Use a separate HNX data source for those. |
| `pageSize` max 100 | VNM has 217 total mediafiles across all years — paginate with `pageIndex` to retrieve all. |
| `year=0` returns all years | No `year` filter is applied; useful for initial full backfill. |
| Token rotation risk | `HJ2HNS3SKICV4FNE` is static in the SPA bundle. Any HOSE SPA rebuild may change it. Detection: all tickers return empty list simultaneously. Recovery: grep new `main.*.js` for `REACT_APP_TYPE`. |
| Spaces in filePath | `filePath` values contain literal spaces. URL-encode before use in HTTP clients. |
| Unix timestamps in seconds | `publishDate` and `publishFrom` are Unix epoch seconds, not milliseconds. |
| No rate limit observed | No 429 responses seen during probing. Be conservative: 1 req/s recommended for batch operations. |

---

## 12. Existing Implementation

Production TypeScript implementation:

```
apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts
```

The fetcher implements the exact two-call recipe above using Bun's native `fetch` + `AbortController`. Key design decisions:

- `HSX_BCTC_ENABLED=false` env gate to disable Strategy 0 entirely
- Never throws — all errors return empty array (caller falls through to next strategy)
- `pageSize=100` in a single page (sufficient for most tickers per year)
- `fileType === ".pdf"` guard before `filePath.replace("~", ...)`
- Shared `buildHsxHeaders()` helper used for both calls
