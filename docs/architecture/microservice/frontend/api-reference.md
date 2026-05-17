# Frontend — Interface Layer Documentation

> Service: `apps/frontend/` | Layer: Interface (Remix routes + React components)

## Remix Routes

All routes live in `apps/frontend/app/routes/`.

| Route file | URL path | Data sources |
|---|---|---|
| `_index.tsx` | `/` | Gateway health check |
| `dashboard.tsx` | `/dashboard` (layout) | None (shared nav) |
| `dashboard.server.tsx` | `/dashboard/server` | `GET /health` |
| `dashboard.fetch.tsx` | `/dashboard/fetch` | `GET /news/reuters/headlines`, `GET /news/bloomberg/headlines`, `GET /macro/external` |
| `dashboard.db.tsx` | `/dashboard/db` | `GET /stock/price/history?code=VNINDEX`, `GET /news/reuters/headlines` |
| `dashboard.vps.tsx` | `/dashboard/vps` | `GET /health/<service>` × 4 (news, macro, stock, pdf) |
| `dashboard.analysis.tsx` | `/dashboard/analysis` | `GET /kinh-dich/market`, `POST /macro/snapshot`, `GET /kinh-dich/reading/:code` × N, `GET /stock/price/history?code&days=90`, `POST /ta/ta/indicators` |

### Loader pattern

All loaders follow the same pattern:
1. `Promise.allSettled()` for parallel, per-source error isolation
2. Fulfilled → use value; rejected → push to `errors[]`, use empty/null fallback
3. `fetchedAt: new Date().toISOString()` added to every loader response

### Error response shape

```ts
{ errors: string[] }  // present on all dashboard routes
```

Errors are passed through `toUserFriendlyError()` before display to strip internal API paths.

## Shared Components

### `app/components/ClientTimestamp.tsx`

**Purpose:** Eliminates React hydration errors from `toLocaleString("vi-VN", {timeZone: "Asia/Ho_Chi_Minh"})` mismatches between Node SSR and browser ICU.

**Problem solved:** Node SSR and browser produce different locale-formatted strings for Vietnamese timezone. The mismatch propagates to the React root and triggers `"the entire root will switch to client rendering"`. `suppressHydrationWarning` on individual elements does not prevent the root-level cascade.

**Solution:** SSR renders `"..."` placeholder. After mount, `useEffect` sets the locale-formatted string. No mismatch at any tree level.

#### `ClientTimestamp`

```tsx
interface ClientTimestampProps {
  iso: string;      // ISO 8601 date-time string from loader
  className?: string; // Tailwind classes forwarded to <span>
}
```

Renders full date + time via `toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })`.
SSR output: `<span>...</span>`
Client output: `<span>17/05/2026, 16:30:00</span>`

Source: `apps/frontend/app/components/ClientTimestamp.tsx:42`

#### `ClientTimeString`

```tsx
interface ClientTimeStringProps {
  iso: string;
  className?: string;
}
```

Renders time-only via `toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })`.
Used in `dashboard.vps.tsx` for per-row `checkedAt` cells.

Source: `apps/frontend/app/components/ClientTimestamp.tsx:70`

## Analysis Dashboard — Stock Detail Panel (`dashboard.analysis.tsx`)

When `?stock=CODE` is present in the URL, the loader fetches three data sources in parallel via `Promise.allSettled()`:

1. `GET /kinh-dich/reading/:code` — Kinh Dịch reading (required)
2. `GET /stock/price/history?code&days=90` — 90-day OHLCV (required)
3. `POST /ta/ta/indicators` body `{ code, date: "YYYY-MM-DD" }` — TA snapshot (non-fatal, null on failure)

TA fetch failure is non-fatal: `detail.ta = null` is valid and the UI degrades gracefully (shows "—" for TA rows).

### Detail panel layout

```
[Chart — full width (StockChart, 560px)]
[AnalysisDecision — full width, colored background]
[InfoSourcePanel — full width, 5-row data source table]
[Kinh Dịch column | Price table column]
```

### `computeDecision` scoring

Pure function exported from the route for testability.

| Condition | Score |
|---|---|
| TA trend BULLISH | +2 |
| TA trend BEARISH | −2 |
| KD signal contains "MUA" | +2 |
| KD signal contains "BÁN" | −2 |
| KD signal contains "THẬN TRỌNG" | −1 |
| RSI 30–50 | +1 |
| RSI > 70 | −1 |
| RSI < 30 | +1 (oversold recovery) |
| close[-1] > close[-5] | +1 |
| close[-1] < close[-5] | −1 |

| Score | Label | Color |
|---|---|---|
| ≥ 4 | MUA MẠNH | text-green-400 bg-green-950 |
| 2–3 | MUA | text-green-300 bg-green-900/30 |
| −1–1 | GIỮ | text-yellow-400 bg-yellow-900/20 |
| −2–−3 | BÁN | text-red-300 bg-red-900/30 |
| ≤ −4 | BÁN MẠNH | text-red-400 bg-red-950 |

### `fetchTASnapshot`

```ts
fetchTASnapshot(code: string): Promise<TASnapshot>
// POST /ta/ta/indicators { code, date: "YYYY-MM-DD" }
```

Located in `app/lib/api/client.ts`. Response shape defined in `app/domain/market.ts` as `TASnapshot`.

## UI Components (shadcn/ui primitives)

Located in `apps/frontend/app/components/ui/`:
- `button.tsx` — Radix UI Slot-backed button
- `card.tsx` — card container
- `input.tsx` — form input

## Error Handling

All route components render an error banner when `errors.length > 0`:

```tsx
<div role="alert" aria-live="polite" className="...border-red-700...">
  {errors.map((e) => <p>{toUserFriendlyError(e)}</p>)}
</div>
```

The `toUserFriendlyError` function (co-located in fetch and db route files) strips internal API paths:
- Input: `"Reuters: ApiError: GET /news/reuters/headlines failed: 404 Not Found"`
- Output: `"Reuters: data temporarily unavailable"`
