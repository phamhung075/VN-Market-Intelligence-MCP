# REQ_1945b — Accuracy Digest Frontend Card

**BA task:** BA-1942d
**Date:** 2026-05-18
**Status:** Ready for Architect
**Owner after BA:** architect → dev-frontend + dev-api-gateway

---

## Context

Sprint 1941c shipped `getSystemAccuracyDigestStats()` in
`apps/mcp-server/src/infrastructure/db/signalOutcomeStore.ts`.
This function is currently only called by the daily `accuracyDigestJob` cron
(Telegram WORK digest). No HTTP endpoint exposes it yet.

Sprint 1942b established the COALESCE read-path pattern for frontend display
(fallback gracefully when underlying tables have no data).

This spec covers the frontend card that surfaces system-level accuracy data
on the Analysis dashboard, and the new gateway-proxied HTTP endpoint that
backs it.

The `signal_outcomes` seeding window is active. Expected date for meaningful
data: **2026-05-25** (AC per task 1941b-signal-outcomes-seed-window: ≥30
resolved rows across ≥3 distinct signal_type values).

---

## 1. Route

**Page:** `/dashboard/analysis` (existing route file:
`apps/frontend/app/routes/dashboard.analysis.tsx`).

**Placement:** New `SectionCard` appended below "Kinh Dịch — Cổ phiếu mẫu"
(the last section currently rendered unconditionally on the page), always
visible regardless of selected stock.

**Nav change:** None. No new route file. Card is injected into the existing
page layout as a new unconditional section.

**DDD layer:** interface — Remix loader (server-side fetch) + React component.

---

## 2. Gateway Endpoint Contract

### 2a. New HTTP route required (does not exist yet)

A new route must be added to the mcp-server HTTP API, then proxied through
api-gateway.

**mcp-server internal route:**
```
GET /api/accuracy/digest?days=<N>
```
- `days` — integer, optional, default 30, max 90. Look-back window for
  `getSystemAccuracyDigestStats(db, days)`.

**api-gateway proxy path (frontend calls this):**
```
GET /mcp/api/accuracy/digest?days=30
```
The `/mcp/*` prefix is already proxied verbatim to mcp-server port 3000
via the api-gateway catch-all rule (confirmed in `apps/api-gateway` proxy
config). No api-gateway code change needed beyond verifying the prefix
routes correctly.

**DDD layer of the new route:** interface — HTTP handler in
`apps/mcp-server/src/interface/mcp/server.ts` (same pattern as
`GET /api/signals/stock/:code`).

### 2b. Request

```
GET /mcp/api/accuracy/digest?days=30
Accept: application/json
```

No authentication. No body.

### 2c. Response shape

Mirrors `SystemAccuracyDigestStats` from `signalOutcomeStore.ts`:

```json
{
  "totalResolved": 27,
  "totalCorrect": 18,
  "overallRate": 0.667,
  "bySignalType": [
    { "signal_type": "rsi_oversold",  "correct": 8, "total": 10, "rate": 0.8  },
    { "signal_type": "volume_spike",  "correct": 4, "total": 10, "rate": 0.4  },
    { "signal_type": "price_anomaly", "correct": 5, "total": 7,  "rate": 0.714 }
  ],
  "newStocksCount": 12,
  "neutralOnlyRows": 3,
  "generatedAt": "2026-05-18T07:30:00Z"
}
```

Field definitions (sourced from `SystemAccuracyDigestStats` interface):

| Field | Type | Rule |
|---|---|---|
| `totalResolved` | number | correct + incorrect rows only (neutral excluded) |
| `totalCorrect` | number | outcome_24h = 'correct' rows |
| `overallRate` | number \| null | null when totalResolved < 10 |
| `bySignalType` | SignalTypeAccuracy[] | signal_types with ≥3 resolved rows; rate = correct/total |
| `newStocksCount` | number | stocks with < 3 resolved rows |
| `neutralOnlyRows` | number | rows with outcome_24h='neutral' AND predicted_direction!='NEUTRAL' |
| `generatedAt` | string (ISO-8601) | server timestamp of response |

`bySignalType` item shape:
```ts
{ signal_type: string; correct: number; total: number; rate: number }
```

**Error responses:**
- 500: `{ "error": "internal error" }` — frontend treats as empty state.
- No 404: if `signal_outcomes` table is absent, the function returns the zero
  struct (same guard as `getSystemAccuracyDigestStats` — table guard fires,
  returns zero values silently).

---

## 3. Component Shape

### 3a. Card wrapper

Renders as a `SectionCard` (existing component, same pattern as other cards
on the page):

```
Title: "Signal Accuracy"
Subtitle: "30d · top-3 / bottom-3"
```

### 3b. Normal state (sufficient data)

Two columns side by side (on sm+ screens; stacked on mobile):

**Left column — Top 3 (by accuracy, DESC):**

```
Top 3
rank  signal_type  accuracy_rate  sample_count
 1.   rsi_oversold    80.0%          10
 2.   price_anomaly   71.4%           7
 3.   bb_breakout_up  70.0%           4
```

**Right column — Bottom 3 (by accuracy, ASC):**

```
Bottom 3
rank  signal_type   accuracy_rate  sample_count
 1.   price_drop       20.0%           5
 2.   volume_spike     25.0%           4
 3.   bb_breakout_dn   40.0%           5
```

**Footer row (full width):**
```
System: 66.7%  (18 correct / 27 total)  ·  12 stocks still seeding
```
- `overallRate` shown as percentage with 1 decimal (e.g. `66.7%`).
- When `overallRate` is null (totalResolved < 10): show `System: n/a
  (need 10+ resolved)`.
- `newStocksCount` shown as `N stocks still seeding`.

**Accuracy colour coding for each row:**
- `rate >= 0.70` — green text
- `rate 0.40–0.69` — amber text
- `rate < 0.40` — red text

This mirrors the existing `accuracyBadgeProps()` thresholds in
`apps/frontend/app/lib/api/client.ts` (lines 372–387).

### 3c. Insufficient-sample state

When `bySignalType.length === 0` AND `totalResolved > 0`:
```
No signal types have ≥3 resolved samples yet.
(N resolved rows recorded — tracking in progress)
```

When `bySignalType.length < 3`: render only however many rows exist (no
placeholder rows for missing top/bottom entries).

### 3d. Empty state

When `totalResolved === 0 AND neutralOnlyRows === 0` (table is empty or no
directional rows seeded yet):

```
No accuracy data yet.
Signal outcomes are being seeded — check back after 2026-05-25.
```

The date `2026-05-25` is the hard seeding window end from task
1941b-signal-outcomes-seed-window. It must NOT be hardcoded in the component;
it must be a prop or constant passed from the loader (so it can be updated
without a component change).

### 3e. All-neutral state

When `totalResolved === 0 AND neutralOnlyRows > 0`:
```
All resolved outcomes are neutral — no directional accuracy measurable yet.
(N neutral outcomes recorded)
```

---

## 4. Loading State

The loader fetches the accuracy digest endpoint in parallel with existing
calls using `Promise.allSettled`. The card uses a skeleton while loading.

**Skeleton shape:** Two rows of two grey placeholder bars (approximately
matching the two-column table layout), matching the visual footprint of the
normal-state card (reduces layout shift).

Implementation note: Because Remix uses SSR loaders, the card renders
synchronously on the server. The "loading state" is the SSR skeleton
visible during client hydration or when using streaming (if the project
later adopts `defer`). For now, if the `Promise.allSettled` leg for accuracy
is rejected, the card renders the empty state (non-fatal degradation).

The accuracy fetch is **non-fatal**: a failed fetch must not prevent the rest
of the Analysis page from rendering.

---

## 5. States Summary

| State | Trigger condition | What to render |
|---|---|---|
| Loading | SSR in-flight / hydration | Skeleton (2 grey placeholder rows per column) |
| Empty | totalResolved=0 AND neutralOnlyRows=0 | "No accuracy data yet. Check back after 2026-05-25." |
| All-neutral | totalResolved=0 AND neutralOnlyRows>0 | "All resolved outcomes are neutral." + count |
| Insufficient-sample | bySignalType.length=0 AND totalResolved>0 | "No signal types with ≥3 samples yet." + resolved count |
| Partial | 1 ≤ bySignalType.length < 3 | Show available rows only; omit missing rank slots |
| Normal | bySignalType.length ≥ 3 | Top-3 + Bottom-3 columns + footer system rate |

---

## 6. DDD Layer Mapping

| Requirement | DDD Layer | Location |
|---|---|---|
| `getSystemAccuracyDigestStats(db, days)` already exists | infrastructure/db | `apps/mcp-server/src/infrastructure/db/signalOutcomeStore.ts` |
| New `GET /api/accuracy/digest` HTTP handler | interface | `apps/mcp-server/src/interface/mcp/server.ts` |
| `SystemAccuracyDigestStats` type re-export for HTTP response | domain (type) | `signalOutcomeStore.ts` already (no new file) |
| `AccuracyDigestStats` frontend domain type | interface/domain | `apps/frontend/app/domain/market.ts` |
| `fetchAccuracyDigest()` fetch helper | interface | `apps/frontend/app/lib/api/client.ts` |
| Loader call + `Promise.allSettled` wiring | interface/application | `apps/frontend/app/routes/dashboard.analysis.tsx` loader |
| `AccuracyDigestCard` React component | interface | `apps/frontend/app/routes/dashboard.analysis.tsx` (inline component, same file pattern) |
| QA Vitest test for fetch helper | interface | `apps/frontend/app/__tests__/1945b-accuracy-digest-card.test.ts` |

---

## 7. Edge Cases

**EC-1 — signal_outcomes table absent (migration not yet run):**
`getSystemAccuracyDigestStats` already has a try/catch table guard that
returns the zero struct silently. HTTP handler must not rethrow — returns
the zero struct as a valid 200 response.

**EC-2 — `bySignalType` has fewer than 3 entries:**
Component must render only the rows that exist. Never fill with placeholder
or "—" rows to reach 3.

**EC-3 — Top 3 and Bottom 3 overlap (fewer than 6 distinct signal types):**
When `bySignalType.length < 6`, the same entry may appear in both columns.
This is correct domain behaviour (e.g. with exactly 3 types, all 3 appear
top AND bottom). No deduplication between columns.

**EC-4 — `overallRate` is null:**
Display `n/a (need 10+ resolved)` in the footer. Do not show a `0%` fallback.

**EC-5 — `days` query param out of range:**
HTTP handler must clamp: `days = Math.min(Math.max(parseInt(days) || 30, 1), 90)`.
Frontend always sends `days=30`; other consumers may send different values.

**EC-6 — Fetch fails (api-gateway 500 or network error):**
`Promise.allSettled` rejection arm renders the empty state. Non-fatal.
No error boundary escalation needed for this card.

**EC-7 — Vietnamese locale formatting:**
`accuracy_rate` is a float 0–1. Display as percentage with 1 decimal using
`(rate * 100).toFixed(1) + "%"`. Do not use `toLocaleString` for percentages
(avoids locale-specific decimal separators in percentage display).
Number counts (totalResolved, sample_count) use `toLocaleString("vi-VN")`.

---

## 8. Non-Functional Requirements

| NFR | Requirement |
|---|---|
| NFR-1 Performance | HTTP handler responds in ≤300 ms (4 SQLite queries, expected ≤200 ms per `getSystemAccuracyDigestStats` AC-10; add 100 ms network budget). |
| NFR-2 Non-fatal | Accuracy card failure must not block the Analysis page render. |
| NFR-3 No new route file | Card added to existing `dashboard.analysis.tsx` — no new Remix route file. |
| NFR-4 SSR-safe | No `useEffect` / `useState` for data fetching — all data from Remix loader. |
| NFR-5 Hydration-safe | Use `suppressHydrationWarning` or `ClientTimestamp` for any timestamp display in the card. |
| NFR-6 Test-first | Vitest test for `fetchAccuracyDigest()` helper BEFORE wiring loader. One test per state (empty, neutral, normal). |

---

## 9. Blockers for PO

None. All data sources confirmed live (Sprint 1941c shipped). Seeding window
is a known constraint (2026-05-25), handled in spec via empty state.
Architect may proceed.

---

## 10. Acceptance Criteria

**AC-1 — Normal render:**
Given `bySignalType` has ≥3 entries, the card renders two labelled columns
("Top 3" and "Bottom 3") with signal_type, accuracy rate (1 decimal %),
and sample_count for each entry. The footer row shows system accuracy rate
or "n/a".

**AC-2 — Empty state:**
Given `totalResolved=0 AND neutralOnlyRows=0`, the card renders the empty
state text containing "No accuracy data yet" and the seeding window end date.
No table, no percentage values.

**AC-3 — Insufficient-sample state:**
Given `totalResolved>0 AND bySignalType.length=0`, the card renders
"No signal types with ≥3 samples yet" with the resolved row count.

**AC-4 — Non-fatal degradation:**
Given the `/mcp/api/accuracy/digest` endpoint returns HTTP 500, the rest of
the `/dashboard/analysis` page renders normally (other sections unaffected).
The accuracy card renders the empty state.

**AC-5 — Colour coding:**
Given a row with `rate >= 0.70`, the accuracy text renders in green.
Given a row with `rate < 0.40`, the accuracy text renders in red.
Given a row with `rate` between 0.40 and 0.69 inclusive, the accuracy text
renders in amber. Thresholds must match `accuracyBadgeProps()` in client.ts.

**AC-6 — HTTP handler clamps `days` param:**
Given `GET /api/accuracy/digest?days=200`, the handler treats it as `days=90`
(max clamp). Given `days=0`, handler treats it as `days=1` (min clamp).
Given `days` absent, handler treats it as `days=30`.

**AC-7 — All-neutral state:**
Given `totalResolved=0 AND neutralOnlyRows>0`, the card renders
"All resolved outcomes are neutral" with the `neutralOnlyRows` count.
No Top/Bottom columns rendered.

---

## 11. Out of Scope

- Historical accuracy trend chart (line chart over time) — deferred.
- Per-stock accuracy breakdown in this card — that is already surfaced via
  the per-signal `AccuracyBadge` in `StockSignalsPanel`.
- Drill-down link to a dedicated accuracy page — deferred.
- BCTC signal types — `signal_outcomes` excludes BCTC signals per domain
  design (directional claims only; BCTC tools have dedicated confidence
  scoring).

---

_Spec complete. No PO blockers. Ready for Architect._
