# Sprint PDF-INSPECT Goal — Side-by-Side PDF / Extracted-Text Inspector

**Status:** DONE + CLOSED 2026-05-24T17:47Z (PO PI-EXIT sign-off — user acceptance MET under real served URL, L9 honored from PI-1). Opened 2026-05-24T17:19Z (PO self-initiated from explicit user feature request, routed via main terminal). **Severity:** MEDIUM (product surface — extraction-quality QA tooling for the human user; no incident). **Owner chain:** architect (PI-1 design) → dev-pdf-extractor (PI-2 served viewer) → qa (PI-3 verify) → PO (PI-EXIT sign-off). **Zone:** `apps/pdf-extractor/` ONLY (single zone; dev-frontend NOT in scope — see § dev-frontend ruling). **WIP:** 1 strictly sequential.

> POST-PILOT FEATURE. The pdf-extractor SCALE pilot is DONE 12/12 (verdict=scale) and STAYS DONE + frozen. This inspector is a NEW product surface; it does NOT reopen, alter, or touch any pilot goal, `decisionMatrix`, or `pilot-status-pdf-extractor.json` (frozen). The sandbox trace dashboard (`apps/pdf-extractor/dashboard/index.html`) is a SEPARATE surface and is NOT modified by this sprint.

---

## Vision

Give the (non-technical) user a way to eyeball BCTC extraction QUALITY: pick a PDF from a list, then see the ORIGINAL PDF rendered on the LEFT next to the EXTRACTED text/fields on the RIGHT — so bad extractions (e.g. the known decimal-shift bugs like `VNM net_profit=0.000051`) are visible at a glance by comparing source to output.

## Scope

**IN:**
- A **served viewer** inside the pdf-extractor service (FastAPI), reachable in the user's browser via the service port (`http://localhost:5001/...`). This is the delivery model — see § Delivery Model ruling.
- **List endpoint** — GET that returns the available PDFs the user can inspect (doc id + a human label: ticker/period/source where available).
- **PDF-bytes endpoint** — GET that streams the original PDF for a selected doc id (so the browser can render page images on the left).
- **Extracted-content endpoint** — GET that returns the extracted text/tables/fields for that doc id (the right pane).
- **Viewer page** — a served HTML page: a PDF picker → on select, LEFT = PDF rendered (pdf.js or equivalent), RIGHT = extracted text/fields. Side-by-side split.
- An honest-degrade rule: if a PDF has no extraction yet (or vice versa), the page says so explicitly — never fabricates content.

**OUT:**
- NO editing/correcting extractions from the viewer (read-only inspector this sprint).
- NO new cross-service plumbing into mcp-server's BCTC financial DB unless architect proves it is REQUIRED to satisfy the user intent (default: use this service's own extraction store — see § Data-Source ruling). One read-only mcp-server route is permitted ONLY if architect proves the user-meaningful "fields" (parsed financial figures like net_profit) live exclusively there and not in this service's store.
- NO changes to the sandbox trace dashboard, its `traces.js` sidecar, the 3 sandbox panels, or `trust-contract.spec.js` (SI-2 zone discipline — frozen).
- NO `file://` double-click delivery (cannot reach container PDF store or DB — proven below).
- NO dev-frontend (see ruling); dev-pdf-extractor builds a minimal-but-correct viewer page itself.

## Success Metric (the acceptance condition the USER will use)

The user opens the served viewer in a browser (the service is running), sees a **list of available PDFs**, **selects one**, and the page shows the **original PDF rendered on the LEFT** and its **extracted text/fields on the RIGHT, side-by-side**, for that same document. The user can thereby spot a bad extraction by eye (e.g. PDF shows a real net-profit figure while the right pane shows `0.000051`). Verified under the user's ACTUAL access path (served URL in a browser), NOT only via a test-convenience server with a different shape (L9 — bake into QA gate).

---

## Grounded reality (PO archaeology this cycle — informs the design; architect confirms exact shape)

1. **Delivery model = served viewer (FORK RESOLVED).** `docker-compose.yml` mounts `market_data:/app/data` into the pdf-extractor container. The source PDFs (`/app/data/pdfs/`, pulled from VPS), this service's metadata DB (`/app/data/pdf_extractor.db`), AND its extraction JSONs (`/app/data/extractions/{doc_id}.json`) ALL live inside that one named volume. A `file://` double-click page CANNOT reach a named Docker volume → the existing sandbox-dashboard `file://` pattern is WRONG here. The viewer MUST be served by the FastAPI app (already exists: `apps/pdf-extractor/main.py`, port 5001, CORS `*`, `register_routes()` in `interface/handlers.py`). New GET routes + a served static viewer page is the correct shape. **Architect confirms exact route paths + static-serving mechanism; do NOT default to `file://`.**

2. **This service's extracted-content store (RIGHT pane source — default).** Extraction output is persisted by `HTTPPDFStorageRepository.store_extraction()` to `/app/data/extractions/{doc_id}.json` with fields: `document_id`, `tables[]` (table_index/headers/rows/page_number), `text_content` (full OCR/extracted text), `ocr_confidence`, `extraction_time_ms`. Document metadata is in SQLite `pdf_documents` (id, url, source_type, status, extracted_at). This is the natural RIGHT-pane source and this service is the extraction owner.

3. **The one genuine UNKNOWN architect MUST resolve (do NOT let dev guess) — PDF→file mapping.** `pdf_documents.url` stores the VPS SOURCE URL, not a local `/app/data/pdfs/<file>` path. So: how does a registered doc id map to its on-disk PDF for the LEFT pane? Architect picks ONE of: (a) the local PDF file already exists in `/app/data/pdfs/` under a derivable name → list/serve from there; (b) only the JSON extraction exists locally and the PDF must be re-fetched from `url` on demand; (c) the list is the set of `/app/data/pdfs/*.pdf` files joined to extractions by a deterministic id. Architect grounds this in the REAL on-disk layout (read-only inspect of the volume / repositories) and writes it down. The list endpoint, the PDF-bytes endpoint, and the join key all depend on this.

4. **"Extracted text/fields" semantics (Data-Source ruling — architect confirms).** Default RIGHT pane = this service's own extraction (`text_content` + `tables`), because this service owns extraction and the user's primary intent (does the extractor read the PDF correctly?) is satisfied by it. The downstream parsed financial figures (the literal `net_profit=0.000051`) live in mcp-server's BCTC DB. Architect decides whether the user-meaningful comparison needs those parsed figures too; if yes, ONE read-only mcp-server SELECT-only route is permitted (precedent: G5 / NF-LD-2 already established exactly-one mcp-server read-route is allowed for an HTTP boundary). If the in-service `text_content`/`tables` already let the user eyeball quality, keep it single-zone.

5. **SI-2 boundary (binding).** This inspector is a DIFFERENT surface from the sandbox trace dashboard. Decide its OWN location/route (e.g. a `viewer/` dir or an `/inspect` route — architect picks), keep an SI-2 boundary comment, and do NOT merge into `docs/dashboards/index.html` (stock-price exclusive) nor the sandbox `dashboard/index.html`.

6. **Security-Clause distinction (binding, must stay explicit).** The zero-credential SANDBOX (Security Clause) is unchanged and untouched. THIS viewer is a REAL served surface that legitimately reads the PDF store + the extraction DB/JSON inside the container — that DB/file access is BY DESIGN and is NOT a Security-Clause violation. Every agent in the chain keeps this distinction explicit so no one confuses the inspector's legitimate read access with the sandbox's zero-credential rule. (The inspector is served by the app process, which already has `/app/data` access; the sandbox is a separate credential-free runner.)

## PO Rulings (binding — propagate to every agent)

- **R1 — Delivery model:** Served FastAPI viewer. NOT `file://`. (Fork resolved per reality #1.)
- **R2 — dev-frontend NOT in scope.** A minimal correct viewer (pdf.js for the left, a clean text/table render on the right) is well within dev-pdf-extractor's zone and avoids a cross-zone handoff. dev-pdf-extractor builds the viewer page itself. If a richer UI is later wanted, that's a separate follow-on.
- **R3 — Read-only inspector this sprint.** No edit/correct-from-viewer.
- **R4 — Single zone default.** `apps/pdf-extractor/` only. A second zone (one mcp-server read-route) is allowed ONLY if architect proves it required by reality #4; if added, it is SELECT-only/read-only and dev must unstage any other mcp-server file.
- **R5 — Acceptance under user's real path (L9).** QA must verify the served-URL-in-browser path with PDF-left/text-right rendering — NOT only a test convenience server. Bake into PI-3.
- **R6 — pilot frozen.** Do not touch `pilot-status-pdf-extractor.json`, the sandbox runner, `traces.js`, the 3 sandbox panels, or `trust-contract.spec.js`.

## Binding constraints (Day-0, verbatim — every agent)

- Zone: `apps/pdf-extractor/` (+ at most ONE read-only mcp-server route IF architect proves required per R4).
- Explicit-file staging: `git add <path>` per file; NEVER `-A` or `.`. No `--force` / `--no-verify` / `--no-gpg-sign`. Do NOT `git push` (user owns push). All work on `main` (NO branches).
- Heavy fleet commit-race active this session: each committer stages ONLY its explicit files and verifies `git show --stat HEAD` has nothing foreign before/after commit.
- Never ask the user to run code/deploy — spawn the right agents. PO decides and continues.
- Honest-degrade: viewer never fabricates a PDF render or extracted content; missing data shows an explicit message.
