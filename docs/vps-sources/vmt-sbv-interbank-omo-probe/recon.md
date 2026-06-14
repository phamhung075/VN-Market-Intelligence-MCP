---
source_name: vmt-sbv-interbank-omo-probe
sprint: VN-MACRO-TOOLING
probe: PROBE-4
recon_date: 2026-06-14
verdict_omo: PASS
verdict_interbank_1w: BLOCKED
unblocks: VMT-5b.omo (PASS) | VMT-5b.interbank (BLOCKED — escalate)
---

# Recon: SBV Interbank Rates + OMO Auction Results

## Source URLs
- OMO: `https://www.sbv.gov.vn/vi/web/sbv_portal/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F`
- Interbank rates (OLD PORTAL — BLOCKED): `https://dttktt.sbv.gov.vn/webcenter/portal/vi/menu/rm/ls/lsttlnh`
- SBV FX reference rates (confirmed working, bonus): `https://www.sbv.gov.vn/tỷ-giá`

## TLS
Both `www.sbv.gov.vn` and `dttktt.sbv.gov.vn` require HTTPS.
- `www.sbv.gov.vn`: System cacert (`/etc/ssl/certs/ca-certificates.crt`) works fine.
- `dttktt.sbv.gov.vn`: Unreachable from VPS (100% packet loss — see below). TLS cannot be verified.

---

## PART A: OMO Auction Results — PASS

### Working Request Recipe
```bash
CACERT=/etc/ssl/certs/ca-certificates.crt
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

curl -s --cacert "$CACERT" -L \
  -H "User-Agent: $UA" \
  -H "Accept-Language: vi-VN,vi;q=0.9" \
  -o /tmp/sbv_omo.html \
  -w '\nHTTP:%{http_code}\nFINAL:%{url_effective}' \
  "https://www.sbv.gov.vn/vi/web/sbv_portal/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F"
```

### HTTP Probe Results
- HTTP status: 200
- Final URL: `https://www.sbv.gov.vn/vi/web/sbv_portal/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F`
- Page size: 408,831 bytes
- Platform: Liferay DXP (same as BOP page)
- TLS: Valid, system cacert works
- Anti-bot: None

### Anti-Bot Assessment
**Type:** None
**Technique:** Standard HTTPS fetch

### Page Structure — OMO
The OMO page contains an HTML table embedded in the Liferay page. Data is NOT in a separate JSON API (unlike the BOP page which uses Liferay headless API).

**Table columns:**
| Vietnamese | English |
|---|---|
| Loại hình giao dịch | Transaction type |
| Số thành viên tham gia/trúng thầu | Members bid/won |
| Khối lượng trúng thầu (Tỷ đồng) | Volume won (Billion VND) |
| Lãi suất trúng thầu (%/năm) | Interest rate won (%/year) |

**Page shows:** ONLY the latest auction result (most recent date). Historical data NOT available on this page.

### Live Sample — June 12, 2026
```json
{
  "date": "12/06/2026",
  "title": "Kết quả đấu thầu thị trường mở ngày 12/06/2026",
  "operations": [
    {
      "type": "Mua kỳ hạn - Kỳ hạn 35 ngày",
      "type_english": "Reverse repo — 35-day tenor",
      "operation_class": "ADD",
      "members": "2/2",
      "volume_bn_vnd": 217.45,
      "rate_pct": 4.5
    },
    {
      "type": "Mua kỳ hạn - Kỳ hạn 56 ngày",
      "type_english": "Reverse repo — 56-day tenor",
      "operation_class": "ADD",
      "members": "6/6",
      "volume_bn_vnd": 1000.0,
      "rate_pct": 4.5
    },
    {
      "type": "Tổng cộng",
      "type_english": "Total",
      "volume_bn_vnd": 1217.45
    }
  ]
}
```

### OMO Net Outstanding — Computation Method
**The SBV OMO page does NOT publish a net outstanding total.**
Net outstanding must be computed by the consumer (parser/service):

```
net_outstanding_bn_vnd = SUM(add operations over rolling window that have not yet matured)
                       - SUM(absorb operations over same window)
```

**Operation classification:**
| Vietnamese term | Class | Effect |
|---|---|---|
| Mua kỳ hạn | ADD (reverse repo) | Injects liquidity |
| Bán kỳ hạn | ABSORB (forward sale) | Drains liquidity |
| Tín phiếu NHNN | ABSORB (SBV treasury bills) | Drains liquidity |

**Maturity tracking:** Each ADD entry with tenor N days matures N days after auction date. Parser must track individual entries with their maturity dates, not just rolling totals.

**Tenors seen:** 35 ngày, 56 ngày (June 12, 2026 auction). Standard range: 7, 14, 28, 35, 56, 91 ngày (varies).

### Parse Strategy — OMO
Parse path: HTML → CSS/regex table extraction.

1. GET page URL → Liferay HTML (408KB)
2. Find the most recent auction result section (headline with date pattern `\d{2}/\d{2}/\d{4}`)
3. Extract table rows from HTML table within that section
4. Each row: columns [type, members, volume_bn_vnd, rate_pct]
5. Classify type string: contains "Mua kỳ hạn" → ADD; "Bán kỳ hạn" or "Tín phiếu" → ABSORB
6. Extract tenor from type string: "Kỳ hạn N ngày" → parse N
7. Accumulate net outstanding externally (parser must maintain rolling state)

---

## PART B: Interbank Rates — BLOCKED

### Target URL
`https://dttktt.sbv.gov.vn/webcenter/portal/vi/menu/rm/ls/lsttlnh`

### Host
- `dttktt.sbv.gov.vn` → IP `202.58.245.101`

### Reachability from Vinahost VPS
```
BLOCKED — 100% packet loss
ping -c 4 202.58.245.101 → 0 received, 100% packet loss
```

### Verdict
**BLOCKED** — `dttktt.sbv.gov.vn` is the SBV's legacy Oracle WebCenter Portal. It hosts interbank fixing rates (overnight, 1W, 1M, 3M, 6M, 12M). The host is entirely unreachable from the Vinahost VPS IP. This is not a TLS issue — the host does not respond to ICMP or TCP at the network level.

**Implications for VMT-5b.interbank:**
- 1W interbank tenor: UNKNOWN — source unreachable, cannot confirm if explicit 1W field exists or requires interpolation
- IRS (Interest Rate Swap): permanently `is_estimate=true` per DD-6 — no machine-readable source found anywhere

**Alternative sources considered:**
| Option | Status |
|---|---|
| `dttktt.sbv.gov.vn` (Oracle WebCenter) | BLOCKED (100% packet loss) |
| `www.sbv.gov.vn` main site nav → interbank | No interbank rate table found on main site |
| SBV FX reference rate (`www.sbv.gov.vn/tỷ-giá`) | Accessible but different data (FX, not interbank) |
| NSO press release narrative mentions | Contains interbank rate text mentions — unreliable/unparseable |

**Architect decision required (VMT-5b.interbank):**
Three options for escalation:
1. Find alternative public API/endpoint for interbank rates (other data aggregator)
2. Accept `is_estimate=true` permanently for interbank_1w (same as IRS)
3. Investigate if `dttktt.sbv.gov.vn` is reachable from a different VPS region or IP whitelist

---

## PART C: SBV FX Reference Rates — BONUS (PASS)

Though not in the PROBE-4 scope, confirmed working as a bonus:

```bash
curl -s --cacert "$CACERT" -L \
  -H "User-Agent: $UA" \
  "https://www.sbv.gov.vn/tỷ-giá" \
  -o /tmp/sbv_fx.html
```

**Live sample (June 12, 2026):**
```json
{
  "usd_center_rate": 25155,
  "usd_buy": 23948,
  "usd_sell": 26362,
  "date": "12/06/2026",
  "reference": "218/TB-NHNN"
}
```

Data format: HTML table in Liferay page. Parse same as OMO (HTML table extraction).

---

## Summary Table

| Sub-probe | Verdict | Unblocks |
|---|---|---|
| OMO auction results (www.sbv.gov.vn) | PASS | VMT-5b.omo |
| Interbank rates (dttktt.sbv.gov.vn) | BLOCKED (100% packet loss) | VMT-5b.interbank — ESCALATE |
| IRS (Interest Rate Swap) | N/A — is_estimate=true per DD-6 | VMT-5b.irs — no source |
| FX reference rate (www.sbv.gov.vn/tỷ-giá) | PASS (bonus) | Not in scope |

## Files
- Script: `scripts/probes/vmt-probe-4.sh`
- Sample: `scripts/probes/vmt-4-sample.json`
