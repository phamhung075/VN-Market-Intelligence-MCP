# TASK_PDF-INSPECT — Side-by-Side PDF / Extracted-Text Inspector

**Sprint goal:** `docs/SPRINT_GOAL.md` (Sprint PDF-INSPECT). **Opened:** 2026-05-24T17:19Z by PO (self-initiated from explicit user feature request). **Zone:** `apps/pdf-extractor/` ONLY (single zone; +≤1 read-only mcp-server route IFF architect proves required per R4). **WIP=1 strictly sequential.**

> Read `docs/SPRINT_GOAL.md` § Grounded reality + § PO Rulings (R1–R6) + § Binding constraints FIRST. They are binding on every task here and not repeated in full below.

---

## What the user asked for (verbatim intent)
"I need to view the original PDF document alongside its extracted text. Select a PDF from a list, then display it left/right side-by-side to view and compare." Purpose: eyeball BCTC extraction QUALITY — spot bad extractions like the decimal-shift bug `VNM net_profit=0.000051`.

## Acceptance condition the USER will use (the single source of truth for done)
User opens the served viewer in a browser → sees a LIST of PDFs → SELECTS one → page shows ORIGINAL PDF rendered LEFT + EXTRACTED text/fields RIGHT, side-by-side, for that same doc. Verified under the user's REAL served-URL-in-browser path (L9), not a test-convenience-only server.

---

## PI-1 — architect: design the served viewer (DESIGN ONLY, no production code)

**Deliverable:** a short design appended to THIS handoff (section "## PI-1 Design — architect") answering, grounded in the REAL repo + on-disk volume layout (read-only inspect; do NOT guess):

1. **Routes** — exact paths + shapes for the 3 GETs:
   - list endpoint (returns doc id + human label: ticker/period/source where derivable),
   - PDF-bytes endpoint (streams original PDF for a doc id; `application/pdf`),
   - extracted-content endpoint (text + tables[] + confidence for a doc id).
   Plus how the viewer HTML page itself is served by FastAPI (static mount vs route returning HTML — pick one, name the path, keep it OFF the sandbox dashboard surface).
2. **PDF→file mapping (reality #3 — the real unknown).** Decide and WRITE DOWN how a doc id maps to its on-disk PDF for the LEFT pane (option a/b/c in SPRINT_GOAL reality #3, or a better grounded one). State the join key between the PDF list, the `pdf_documents` rows, and the `/app/data/extractions/{doc_id}.json` files. If the local PDF path is NOT currently persisted, say exactly how the list+left-pane will work anyway (e.g. enumerate `/app/data/pdfs/*.pdf`, or re-fetch from `url`).
3. **Data-source ruling (reality #4 / R4).** Confirm RIGHT pane = this service's own `text_content`+`tables` (single zone), OR prove the user-meaningful comparison REQUIRES the parsed financial figures from mcp-server's BCTC DB → then specify exactly ONE read-only SELECT-only mcp-server route (path + columns), and mark zone as `multi`. Default and strongly preferred: single zone.
4. **Render approach for LEFT pane** — pdf.js (CDN vs vendored) or server-rendered page images. Note: served page CAN use a CDN (unlike the zero-network sandbox); but state the choice so dev doesn't guess.
5. **DDD placement** — which layer each new piece lands in (interface/handlers route, infrastructure read for PDF bytes + extraction JSON, a new application read-usecase if warranted). Keep the import-linter fence (Fence-A/B in pyproject.toml) GREEN — no domain→infra/interface import.
6. **SI-2 boundary** — name the new surface's location and the boundary comment text.
7. **Security-Clause distinction** — one sentence confirming the viewer's `/app/data` read access is by-design app-process access, NOT a sandbox zero-credential violation.

**ACs (PI-1):** design covers all 7 points, grounded in real files/layout (cite paths), zone declared (single or multi w/ justification), import-fence impact noted. Architect writes NO production code.

## PI-2 — dev-pdf-extractor: implement the served viewer (per PI-1 design)

**Deliverable:** working served viewer in `apps/pdf-extractor/`:
- The 3 GET routes wired into `interface/handlers.py` (delegating to application/infra per DDD; thin handlers).
- Infra reads: PDF bytes (per PI-1 mapping) + extraction JSON/DB (read-only).
- The served viewer page (per PI-1 location): PDF picker → on select, pdf.js (or chosen) render LEFT + text/tables render RIGHT, side-by-side.
- Honest-degrade: doc with no extraction (or no PDF) shows an explicit message, never fabricates.

**ACs (PI-2):**
1. `GET <list route>` returns the available PDFs (id + label).
2. `GET <pdf-bytes route>/{id}` streams a valid `application/pdf`.
3. `GET <extracted route>/{id}` returns text + tables for that id.
4. Viewer page served by FastAPI renders LEFT=PDF / RIGHT=text side-by-side for a selected doc.
5. Honest-degrade message shown when a side is missing (no fabricated content).
6. `pytest` green (existing 114/114 not regressed; new tests for the new routes/read paths).
7. import-linter fence (`pyproject.toml`) still GREEN; DDD layering respected (no domain→infra/interface).
8. Sandbox dashboard surface UNTOUCHED: `git diff --cached` shows NO change to `dashboard/index.html`, `dashboard/traces.js`, the sandbox runner, or `trust-contract.spec.js`.
9. If `multi` zone (R4): any non-route mcp-server file in `git diff --cached` → STOP + unstage; the one route is SELECT-only (grep proves no INSERT/UPDATE/DELETE).
10. Explicit-file staging only; `git show --stat HEAD` after commit shows zero foreign files.

## PI-3 — qa: verify under the user's REAL access path (L9 binding)

**ACs (PI-3):**
1. **User-path acceptance (L9):** start the service the way it actually runs (served, container or `uvicorn main:app` on port 5001 — NOT a bespoke test-only server with a different route shape), open the viewer URL in a real browser/headless browser, confirm: list renders → select a doc → LEFT shows the rendered PDF, RIGHT shows that doc's extracted text/fields, side-by-side. Capture evidence (screenshot or headless DOM assertion) into the handoff.
2. The 3 GET routes behave per PI-2 ACs 1–3 against real container data.
3. Honest-degrade verified: a doc missing one side shows the explicit message, not fabricated content.
4. SI-2 / pilot freeze NOT regressed: sandbox dashboard 3 panels still honest-green under `file://` (G6/G8/G9 untouched), `trust-contract.spec.js` unchanged.
5. If `multi` zone: the mcp-server route is SELECT-only (grep + behavior), Security-Clause sandbox audit still empty-of-credentials.
6. Full smoke green (`pytest` + import-linter). Emit `qa-pdf-inspect-<UTC>.json`.

## PI-EXIT — PO: sign-off
PO validates deliverables against the user acceptance condition + all PI-3 ACs, ratifies, records lesson if any, signal `po-pdf-inspect-signoff-<UTC>.json`.

---

## Commit discipline (every committer)
Explicit `git add <path>` per file; never `-A`/`.`. No `--force`/`--no-verify`/`--no-gpg-sign`. No `git push`. After commit, `git show --stat HEAD` MUST show only your files (heavy fleet commit-race active — if a foreign file appears, you conflated a commit; do NOT rewrite history, re-stage your own and re-commit). Commit-mutex enum defect known: claim key under `sprint-task` kind if mutex needed (per notebook carry-over).
