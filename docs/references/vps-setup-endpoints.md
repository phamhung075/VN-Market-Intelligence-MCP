> Parent: [vps-setup.md](./vps-setup.md)

# Local API Endpoints (VPS Data Receivers)

VPS services push data to local Bun server. These endpoints handle queueing and validation.

---

## `POST /api/push-prices`

**Headers:** None required

**Body:** JSON array of price records
```json
{
  "prices": [
    {
      "code": "VCB",
      "exchange": "HOSE",
      "price": 78500,
      "change": 250,
      "changePercent": 0.32,
      "volume": 1500000,
      "marketCap": 780000000000,
      "foreign": { "buy": 50000, "sell": 45000 },
      "timestamp": "2026-04-21T07:02:15Z"
    }
  ]
}
```

**Response:** `200 OK` or `400 Bad Request` (with error detail)

---

## `POST /api/push-bctc-pdf`

**Content-Type:** `multipart/form-data`

**Fields:**
- `pdf` (file): BCTC PDF binary
- `filename` (string): Original filename (e.g., "BCTC VCB 31.12.2025.pdf")
- `ticker` (string): Stock code extracted from filename

**Response:** `200 OK` (PDF queued for parsing) or `400 Bad Request`

---

## `POST /api/push-news`

**Headers:** None required

**Body:** JSON array of news items
```json
{
  "items": [
    {
      "source": "cafef",
      "title": "VCB báo lãi tăng 15% quý 1",
      "url": "https://cafef.vn/...",
      "publishedAt": "2026-04-21T06:30:00Z",
      "summary": "..."
    }
  ]
}
```

**Response:** `200 OK` or `400 Bad Request`

---

## `POST /api/push-sbv`

**Headers:** None required

**Body:** JSON object with FX rates
```json
{
  "rates": {
    "USD_VND": 24500,
    "EUR_VND": 26800,
    "GBP_VND": 31000,
    "JPY_VND": 165
  },
  "timestamp": "2026-04-21T06:30:00Z"
}
```

**Response:** `200 OK` or `400 Bad Request`
