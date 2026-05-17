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
