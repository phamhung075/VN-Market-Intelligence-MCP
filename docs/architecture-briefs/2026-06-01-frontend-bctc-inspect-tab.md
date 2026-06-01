# Architecture Brief — Frontend BCTC Inspect Tab

**Sprint:** FRONTEND-BCTC-TAB | **Task:** FBT-ARCH
**Date:** 2026-06-01 | **Author:** agents-architect
**Handoff:** dev-frontend (via agent-father)

---

## 1. Decision Lock — A2 Affirmed, Zero mcp-server Edits

**Approach A2 (server-side proxy) is the locked choice.**

Rationale:
- `bctc-inspector.html` has `const BASE = ""` (line 1043). All 13 network calls resolve relative to whatever origin served the HTML. There is no mechanism to reconfigure this at runtime without editing the file.
- A bare `<iframe src="http://localhost:3000/bctc-inspect">` (A1) breaks in every non-localhost environment (Docker compose container name, CF tunnel, staging). It also leaks the internal :3000 port to the browser.
- A2 = the frontend Remix process (server-side) proxies both the HTML document and every `/api/bctc-inspect/*` sub-path to `MCP_SERVER_BASE_URL`. The browser's origin is always `:3001` (or the public domain in production). All relative calls from the loaded HTML resolve against that same origin, hitting the frontend proxy transparently. `BASE=""` never changes.
- Zero bytes of `apps/mcp-server/src/interface/bctc-inspector.html` are touched. The 6-tab + human-confirm + prose-text fix is preserved byte-for-byte.

---

## 2. Proxy-Path Contract

The frontend MUST expose the following paths under its own origin. Every sub-path is a transparent pass-through to `${MCP_SERVER_BASE_URL}` (env var, default `http://localhost:3000`).

### 2a. Viewer HTML — one route

| Frontend path | Upstream | Method | Response |
|---|---|---|---|
| `GET /dashboard/bctc-inspect` | `GET ${MCP_SERVER_BASE_URL}/bctc-inspect` | GET | `text/html` (stream) |

The HTML response is streamed back with its upstream `Content-Type: text/html` header intact. **Do not wrap in a React component or inject any markup** — the raw HTML must be the full response body, so the browser executes its inline `<script type="module">` which wires up the entire viewer. The Remix route for this path must use a `Response` return (not JSX), bypassing React rendering entirely.

### 2b. Data API — wildcard proxy

All paths below are exposed at the frontend origin. The proxy must pass through method, query string, request body, and upstream Content-Type + status code verbatim.

| Sub-path pattern | Methods | Content-Type upstream | Notes |
|---|---|---|---|
| `/api/bctc-inspect/docs` | GET | `application/json` | |
| `/api/bctc-inspect/page-window/:docId` | GET | `application/json` | query: `?page=N` |
| `/api/bctc-inspect/ocr/:docId` | GET | `application/json` | query: `?page=N` |
| `/api/bctc-inspect/table/:docId` | GET | `application/json` | |
| `/api/bctc-inspect/md/:docId` | GET | `application/json` | |
| `/api/bctc-inspect/zones/:docId` | GET | `application/json` | query: `?page=N` |
| `/api/bctc-inspect/pdf/:docId` | GET | `application/pdf` | BINARY — must not buffer/decode |
| `/api/bctc-inspect/page-image/:docId` | GET | `image/png` | BINARY — must not buffer/decode; query: `?page=N` |
| `/api/bctc-inspect/flags/:docId` | GET | `application/json` | |
| `/api/bctc-inspect/correct/:docId` | POST | `application/json` | body: JSON correction payload |
| `/api/bctc-inspect/confirm/:docId` | POST | `application/json` | body: JSON confirm payload |
| `/api/bctc-inspect/confirm/:docId/reset` | POST | `application/json` | |

**Binary stream invariant:** `/pdf/:docId` and `/page-image/:docId` return raw bytes. The proxy MUST pipe the upstream `ReadableStream` directly to the response — never call `.json()` or `.text()` on these. Relay the upstream `Content-Type` header (e.g., `application/pdf`, `image/png`) and the upstream status code. If the proxy buffers and re-emits as a Buffer/Uint8Array, that is acceptable only if the full body is relayed intact. Do not decode or re-encode.

**Query string pass-through:** the Remix resource route receives `request.url`; extract `new URL(request.url).search` and append it verbatim to the upstream fetch URL.

**POST body pass-through:** forward `request.body` (or `await request.arrayBuffer()` if streaming is unavailable in the Remix version) and relay the incoming `Content-Type` request header upstream.

**Status code relay:** if upstream returns 4xx/5xx, relay that status code to the browser — do not convert to a 500 or throw.

---

## 3. HTML Delivery Mechanism

**Choice: raw `Response` from a Remix resource route (not iframe).**

The Remix route at `GET /dashboard/bctc-inspect` fetches the HTML from upstream and returns it as a raw `Response`:

```
return new Response(upstreamHtmlBody, {
  status: upstreamStatus,
  headers: { "Content-Type": "text/html; charset=utf-8" },
});
```

This causes the browser to navigate to that URL and render the full self-contained HTML page. The relative fetch calls inside the page's `<script type="module">` will resolve as:
- `fetch("/api/bctc-inspect/docs")` → `:3001/api/bctc-inspect/docs` → frontend proxy → mcp-server.

No iframe is needed. A same-origin iframe (`<iframe src="/dashboard/bctc-inspect">`) would also work but adds an unnecessary frame boundary. The raw Response approach keeps the viewer filling the full browser viewport cleanly.

The dashboard nav entry navigates to `/dashboard/bctc-inspect` as a full page link (not a nested Remix child route inside the dashboard layout), because the viewer HTML owns its full DOM. The NavLink still sits in the shared nav bar — the tab simply causes a top-level navigation to the viewer URL.

**Implication for Remix file naming:** the route file is `dashboard.bctc-inspect.tsx` but its default export returns a raw `Response`, making it a resource route that bypasses the dashboard layout wrapper. This is intentional — the viewer HTML already has its own layout.

---

## 4. Route / Path Design (Path-Prefix Alignment)

The viewer's script calls `/api/bctc-inspect/*` (absolute from root). The frontend proxy must expose exactly those paths — not `/dashboard/api/bctc-inspect/*` or `/proxy/api/bctc-inspect/*`.

Required Remix resource route files (in `apps/frontend/app/routes/`):

```
dashboard.bctc-inspect.tsx          ← serves proxied viewer HTML at /dashboard/bctc-inspect
api.bctc-inspect[.]docs.tsx         ← GET /api/bctc-inspect/docs
api.bctc-inspect.$docId.tsx         ← wildcard catch-all for all remaining sub-paths
```

Alternative: a single catch-all resource route at `api.bctc-inspect.$.tsx` covering all sub-paths under `/api/bctc-inspect/`. Remix splat route (`$`) resolves the remaining path segments, including `page-window/:docId`, `ocr/:docId`, `pdf/:docId`, `confirm/:docId/reset`, etc.

**Recommended:** one splat route `api.bctc-inspect.$.tsx` handling every method (GET + POST) and every sub-path. Implementation reads `params["*"]` to reconstruct the upstream URL. This is simpler than 12 individual route files and handles any future sub-path additions automatically.

**Path reconstruction in the splat handler:**
```
const subpath = params["*"];  // e.g. "docs", "pdf/ACB_2024Q3", "confirm/ACB_2024Q3/reset"
const search  = new URL(request.url).search;  // preserve ?page=N
const upstream = `${MCP_SERVER_BASE_URL}/api/bctc-inspect/${subpath}${search}`;
```

---

## 5. Nav Placement

Add one entry to the `NAV_ITEMS` array in `apps/frontend/app/routes/dashboard.tsx`:

```typescript
{ to: "/dashboard/bctc-inspect", label: "BCTC Inspect" },
```

Vietnamese label: `"Kiểm tra BCTC"` is acceptable but PO confirmed English tab labels are consistent with existing tabs (Analysis, Services, Fetch Ops, VPS Proxy, Database, BCTC Eval). Use `"BCTC Inspect"` to match the existing `"BCTC Eval"` casing convention.

Position: append after `"BCTC Eval"` entry (last in the array).

---

## 6. Zone + Rebuild

**Zone: `apps/frontend/` only.** No changes to `apps/mcp-server/` under any circumstance.

Files to create/modify (all under `apps/frontend/`):

| File | Action |
|---|---|
| `apps/frontend/app/routes/dashboard.tsx` | Modify — add 1 NAV_ITEMS entry |
| `apps/frontend/app/routes/dashboard.bctc-inspect.tsx` | Create — resource route returning proxied HTML |
| `apps/frontend/app/routes/api.bctc-inspect.$.tsx` | Create — splat resource route proxying all /api/bctc-inspect/* |

The `MCP_SERVER_BASE_URL` env var is already wired in the frontend container (established by `bctc-eval-client.ts` precedent). No new env vars needed.

**Ops action after merge:** rebuild and restart the `frontend` container only (`docker compose build frontend && docker compose up -d frontend`).

---

## 7. Handoff

**Implementation agent:** dev-frontend
**Via:** agent-father (reads this brief, spawns dev-frontend)
**Signal file:** `docs/signals/frontend-bctc-inspect-tab.json`

No design decisions remain open. All constraints are locked above. Implementation is purely mechanical: two new resource routes + one NAV_ITEMS line.
