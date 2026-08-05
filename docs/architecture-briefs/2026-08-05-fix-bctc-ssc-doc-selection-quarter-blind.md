# FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST — Architecture Brief

**Zone:** `apps/mcp-server/`
**Architect:** architect, 2026-08-05T16:48Z
**Task-id:** FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST
**Build-standard:** not-applicable (bug-fix/refactor in-zone, no new service, no new primitive)
**Routing:** direct to `dev-mcp-server` — PM decomposition skipped (see §6, Routing Decision)

---

## 1. Root cause — RAW-verified at source (re-confirmed, not re-derived)

- `apps/mcp-server/src/infrastructure/fetchers/ssc.ts:85-99` — `listSscDocuments(actionCode, reportType, year, httpClient?)`. **No quarter parameter in the signature at all.** When `mcpConfig.features.disableSscPolling` (default `true` — `apps/mcp-server/src/infrastructure/config.ts:678`) it delegates to `listSscDocumentsWithFlag(..., true, ...)`, which queries HOSE → HNX → UPCOM in parallel (`ssc.ts:150-185`) and returns the **first non-empty source's full document array**, unfiltered by quarter.
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts:61-69` — Step 1: `const docs = await listSscDocuments(actionCode, "quarterly", year, sscHttpClient); ... doc = docs[0]!;` — **unconditional first-element pick**, no title/period matching, no assertion.
- Confirms PO's row note verbatim; no correction needed to the root-cause pin.

## 2. Design question resolved — Option (a) chosen (title/publishedAt-derived selection); Option (b) rejected

**Chosen: (a)** — parse the requested (year, quarter) out of each candidate `SscDocument`'s existing metadata and select the match; fail loud with a named error when none match. Do **not** call `checkPeriodContentConsistency` as a selector.

### Why (a), concretely (not just "cheaper"):

1. **The signal already exists in production data, twice, for free.**
   - `SscDocument.title` (`sscCommon.ts:39-48`) is populated by **all four** fetchers (`sscPortal.ts` ADF table col[3], `hoseDisclosure.ts`, `hnxDisclosure.ts`, `upcomDisclosure.ts`) and already carries explicit Vietnamese quarter/year markers — proven by the **already-shipped** `titleMatchesReportType()` (`sscCommon.ts:119-141`, used by all 4 fetchers today) which keys off exactly `"quý"` / `/\bq[1-4]\b/i` / `"năm"` to distinguish quarterly vs. annual. Six live test-fixture files (`029-ssc-scraper.test.ts`, `104-job-ssc-check.test.ts`, `1025-ssc-adf-pdf-discovery.test.ts`, `1289f-bctc-browser-discovery.test.ts`, `1289f-refinement-direct-api.test.ts`, `034-telegram-notifier.test.ts`) all use titles of the form `"Báo cáo tài chính quý N năm YYYY"` / `"BCTC Quý I 2025"` / `"BCTC QN YYYY"`.
   - `SscDocument.publishedAt` + the **already-shipped, already-tested** `deriveQuarterFromPublishedAt()` (`checkSscReports.ts:125`, 15/15 green in `290-check-ssc-quarter-derive.test.ts`) gives a **second, independent** signal derived from the Vietnamese SSC filing-deadline calendar (May–Jul filing → Q1 of that year; Aug–Oct → Q2; Nov–Dec → Q3; Jan–Apr → Q4 of the **prior** year) — zero new code needed, just reuse.
2. **Option (b) would blur an architecture boundary that is deliberately clean today.** Step 1 (document selection) and Step 2 (PDF text resolution — OCR + news-chain fallback, `bctc/resolvePdfText.ts`) are currently sequential and independent. Running `checkPeriodContentConsistency` as a *selector* requires the *content* of each candidate, which only exists after Step 2 has run — i.e. downloading + OCR-extracting up to N candidate PDFs (typically ≤4, more if a listing spans multiple years — see §5) **before** knowing which one to keep. That multiplies pdf-extractor/OCR cost per request and collapses a boundary that exists for a reason.
3. **`checkPeriodContentConsistency`'s own conservative design does not survive repurposing as a selector.** It was built as a **terminal veto**: `MIN_SIGNAL_COUNT=3` + strict-plurality, returning `null` ("cannot determine") on poor-OCR text — and by design, `null` safely defaults to "proceed" (AC-3 negative control in the shipped detector). As a *selector*, "cannot determine" has no safe default: if every candidate is inconclusive there is nothing to select, and falling back to `docs[0]` on that condition silently reintroduces this exact bug. Title text is clean DOM text, not OCR output — it does not carry this ambiguity.
4. The row's own design-question prose lists the identical tradeoffs ("(a) cheaper but couples to portal title formats... (b) reuses shipped code but costs N downloads") — the downloads-cost point turns out to be a boundary-violation, not just a latency cost, which tips the decision.

The shipped detector (`checkPeriodContentConsistency` in `parseBctcReport.ts` Step 0) is **untouched** and remains the terminal defense-in-depth layer — a title-parse error, encoding quirk, or portal formatting drift that slips past selection is still caught there. Two independent layers, not one replacing the other.

## 3. Reuse audit — why `listSscDocuments()` itself must NOT change signature

`checkSscReports.ts:defaultListDocs()` (line ~208-214) **also** calls `listSscDocuments(code, "quarterly", year)` and depends on getting back **all** quarters' documents for the year — it iterates every doc itself, derives each one's quarter via `deriveQuarterFromPublishedAt`, and decides which are *new* (`checkSscReports.ts:240-247`). Narrowing `listSscDocuments`'s contract to "one quarter" would break this caller. **Selection must be a new layer added only at `fetchParseAndStoreBctc.ts`'s Step 1 call site** — `listSscDocuments`/`listSscDocumentsWithFlag` stay exactly as they are today (existing-interface-covers-the-need: extend, don't duplicate/don't narrow).

## 4. Implementation plan

### 4a. New domain module (pure, zero I/O — mirrors `periodContentExtractor.ts`'s placement but is deliberately much simpler: title text is clean, not OCR)

`apps/mcp-server/src/domain/services/financial-reports/documentTitlePeriodExtractor.ts`
```ts
export interface TitlePeriodSignal { year: number; quarter: 1 | 2 | 3 | 4; }
export function extractPeriodFromTitle(title: string): TitlePeriodSignal | null
```
Regex sketch: quarter from `/qu[ýy]\s*(?:số)?\s*([1-4]|I{1,3}V?)/i` (Vietnamese ordinal "quý I/II/III/IV" AND digit forms both appear in live fixtures — `"BCTC Quý I 2025"` vs `"Báo cáo tài chính quý 1 năm 2025"`) or `/\bQ([1-4])\b/i`; year from `/n[ăa]m\s*(20\d{2})/i` or a bare `/20\d{2}/` near the quarter match. Both must resolve or return `null` (never guess one half).

### 4b. New application module (sibling to the existing `bctc/` split — same FACTORY-APP-split-fetchParseAndStoreBctc convention as `resolvePdfText.ts` / `newsChainFallback.ts` / `insertBctcAnalysis.ts` / `types.ts`)

`apps/mcp-server/src/application/usecases/bctc/selectSscDocument.ts`
```ts
export class SscDocumentPeriodNotFoundError extends Error { /* names actionCode, requested sortKey, candidate count — mirror BctcPeriodContentMismatchError's shape */ }

export function selectSscDocumentForPeriod(
  docs: SscDocument[], actionCode: string, year: number, quarter: 1 | 2 | 3 | 4,
): SscDocument {
  for (const doc of docs) {
    const titleSignal = extractPeriodFromTitle(doc.title);
    const signal = titleSignal ?? deriveQuarterFromPublishedAtAsNumeric(doc.publishedAt); // fallback signal
    if (signal && signal.year === year && signal.quarter === quarter) return doc;
  }
  throw new SscDocumentPeriodNotFoundError(actionCode, year, quarter, docs.length);
}
```
`deriveQuarterFromPublishedAt` already lives in `checkSscReports.ts` (application → application import, no layering violation) and returns `{quarter: "Q1".."Q4", year}` — wrap/adapt to the numeric form used above (`QUARTER_MAP` in `bctc/newsChainFallback.ts:29-38` already has the string→numeric table if a shared mapping is wanted instead of a second table).

### 4c. Modify `fetchParseAndStoreBctc.ts` Step 1 (lines 61-69)

Replace:
```ts
const docs = await listSscDocuments(actionCode, "quarterly", year, sscHttpClient);
if (docs.length === 0) { logger.warn(...); return null; }
doc = docs[0]!;
```
With: call `listSscDocuments` unchanged, then `selectSscDocumentForPeriod(docs, actionCode, year, buildFiscalPeriod(year, quarter).quarter)` (reuse `buildFiscalPeriod`'s existing `QuarterString → 1|2|3|4` conversion — already imported via `bctc/newsChainFallback.ts`, no new conversion helper needed). Catch `SscDocumentPeriodNotFoundError` **inside** this function (mirror the exact fail-loud idiom already shipped one function away at `parseBctcReport.ts:685-701`: `logger.error(...)` + a **debounce-gated** `sendTelegramBug(...)` reusing `isBctcSignalDebounced`/`recordBctcSignalSent` from `infrastructure/db/bctcSignalDebounce.js` with a new debounce key e.g. `` `${year}-Q${quarter}:doc-selection-not-found` ``) then `return null` — this preserves `fetchParseAndStoreBctc`'s own documented contract ("Returns null, never throws, when no documents are found") while still being observably loud (AC-1/AC-2), distinguishable in logs/Telegram from the pre-existing "portal returned zero documents" case.

No other call site changes. `checkSscReports.ts`'s `pdfUrl`-bypass path (Task 289) and `bctcReparseJob.ts`'s `pdfUrl: file://...` path both already skip Step 1 entirely — unaffected, correctly.

## 5. Reconciled counter-evidence — AC-4 answer

**Family A (10/19, "supplied Qx→detected same-year Q4") is fully explained and fixed by §1-4 above.**

**Family B (9/19, "quarter preserved, year shifted") and the DPM counter-example (report 4407, content earlier than supplied) are a DIFFERENT, unrelated acquisition path — OUT OF SCOPE for this row.**

RAW-verified: `apps/mcp-server/src/interface/mcp/routes/bctcVpsIngestHandler.ts:182-201` (`POST /api/push-bctc-pdf`, wired at `server.ts:743`, **receive-only** from this codebase's perspective — `grep` for any in-repo caller of this endpoint returns none) reads `period_year`/`period_quarter` **directly from external multipart form fields**, validated on **shape only** (year 2000–2099, quarter ∈ {Q1..Q4} — never checked against the PDF). This is a fully separate flow: it never calls `listSscDocuments`, never touches `docs[0]`, and the PDF + its claimed period arrive together from an external pusher (per the prior PO investigation of report_id `5b0dad71`/DPM: "VPS pusher associated the wrong SSC listing URL with a backfill target" — `periodContentExtractor.ts:9` doc comment). The already-shipped `checkPeriodContentConsistency` detector correctly refuses bad associations from **this** path too (that is what produced the 4407/DPM Telegram refusal) — the detector is source-agnostic by construction — but nothing upstream of it validates or corrects what period an external VPS push *claims* before pushing, and that origination point is outside `apps/mcp-server/`'s own code (no in-repo script both decides the period tag and calls this endpoint).

This mechanistically proves family B's direction is unconstrained by "docs[0] = whatever the portal lists first" (it never runs through that code), which is exactly why it breaks the row's own 19/19-always-later argument without contradicting this row's fix: the always-later pattern is a property of family A's mechanism only, not a universal law this fix must reproduce.

**Recommendation (not minted by architect — task breakdown is PO's lane):** a follow-up FIX row scoped to "no upstream validation of the period tag before `/api/push-bctc-pdf` is called" belongs on the board once someone identifies the actual VPS-side pusher script (outside this repo per the VPS/PDF-OCR architecture reference) — likely a different zone (ops-vps-fetch / VPS-side script), not a pure `apps/mcp-server/` change. The only existing related row, `FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT`, is `review[]`/DONE and intentionally scoped to the detector only.

## 6. Secondary finding (non-blocking, flag for regression coverage)

`hoseDisclosure.ts`'s `fetchHoseDisclosures()` docstring claims `year` is "applied via title keyword matching, not query param" (line ~131), but `parseHoseDisclosureHtml(html, reportType)` takes **no year argument** and performs **no year-based filtering anywhere in its body** — only `reportType` is filtered. The `year` HTTP query param sent to hsx.vn may or may not be honored server-side (unverified; the sibling SSC ADF portal is documented, in this same file family, to ignore its own query params entirely — `sscPortal.ts:35-47`). Practical consequence: the HOSE fallback's `docs[]` could legitimately span multiple years today, silently. This row's chosen design (§2, matching **both** year and quarter parsed from title, not quarter alone) inherently self-heals this exposure as a side effect. The stale docstring / unenforced filter is real but independent — worth a one-line doc correction or a follow-up ticket, not blocking this row.

## 7. Sequencing / AC-5 gate

`BCTC-ENRICHER-OLD-QUARTERS` (P1, `apps/mcp-server/`, `dev-mcp-server`) is confirmed **still `BACKLOG`, not started** as of this tick (live-checked). AC-5 ("re-run a historical backfill slice, show stored rows > 0") is blocked on that row landing first — its own note states the discriminating reason (0 URLs found for pre-Q4-2025 quarters, so the slice has nothing to fetch). **This does not block development of this row.** dev-mcp-server should implement AC-1/AC-2/AC-3/AC-4 now; QA must gate the **AC-5 sign-off** specifically on `BCTC-ENRICHER-OLD-QUARTERS` landing — do not accept a substitute "Telegram refusal rate dropped" as AC-5 evidence (the row's own anti-false-green note already rules that out).

## 8. Test plan (maps to the row's ACs)

- **AC-1/AC-2** — new unit tests for `selectSscDocumentForPeriod`: (a) matching candidate present among several → selected; (b) no candidate matches → throws `SscDocumentPeriodNotFoundError`, `fetchParseAndStoreBctc` returns `null` (not `docs[0]`), debounced Telegram bug fires once.
- **AC-3 (regression, family-A replay)** — fixture: a 4-document listing with titles for Q1..Q4 of the same year, **array order = Q4 first** (reproducing the "portal lists newest-first" shape implicated in family A); request Q1 → assert the selected document's title is the Q1 title, not Q4. Reuse the existing multi-quarter title fixture shape already present in `029-ssc-scraper.test.ts` / `104-job-ssc-check.test.ts`.
- **AC-4** — satisfied by §5 of this brief; dev-mcp-server should cite this brief in its own decision-journal entry rather than re-investigate.
- **AC-5** — gated per §7; QA verification step only, not a dev-mcp-server deliverable this cycle.
- Extend coverage to the "new ADF SSC" path (`disableSscPolling=false`) since it shares the same `SscDocument.title` contract — not the default runtime path but reachable via config, and the selector must work identically there.

## 9. Files touched (summary)

| File | Change |
|---|---|
| `domain/services/financial-reports/documentTitlePeriodExtractor.ts` | NEW — pure title parser |
| `application/usecases/bctc/selectSscDocument.ts` | NEW — selection + named error |
| `application/usecases/fetchParseAndStoreBctc.ts` | MODIFY Step 1 (lines ~61-69) |
| `__tests__/FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST.test.ts` | NEW — AC-1/2/3 |
| `docs/architecture/microservice/mcp-server.md` or `usecases.md` (whichever documents the BCTC pipeline) | doc update after ship, per dev-standards |

No changes to: `ssc.ts`, `sscCommon.ts`, `sscPortal.ts`, `hoseDisclosure.ts`, `hnxDisclosure.ts`, `upcomDisclosure.ts`, `periodContentExtractor.ts`, `parseBctcReport.ts`, `checkSscReports.ts` (all reused as-is).
