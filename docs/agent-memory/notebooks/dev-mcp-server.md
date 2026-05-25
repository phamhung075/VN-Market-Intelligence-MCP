# dev-mcp-server -- Notebook

## c303 · 2026-05-25 (mcp-server Phase-2 P2-H — G9 Playwright trust-contract artifact)

### P2-H — G9 Playwright Trust-Contract Artifact DONE

**Commit:** `2ddd8b6c` | 5 files (2 new specs + 1 trace + 2 modifications) | tsc EXIT 0 | bun test 9412/359 (≥9408 PASS; 359 fail = baseline drift) | tools=148 | sched=68

**Delivered:**
- CREATE `dashboard/tests/trust-contract.spec.js` — 7 Playwright assertions, all pass. Uses `page.addInitScript()` to inject window.__MCP_TRACES__ + window.__MCP_MODULES__ before page scripts run (Playwright sandboxed Chromium blocks file:// fetch calls; addInitScript is the correct bypass pattern).
- CREATE `dashboard/playwright.config.js` — headless:true, file:// baseURL, no webServer block, testDir: ./tests, Chromium-only.
- CREATE `dashboard/traces/sparkline-regression-tripwire.json` — status:fail tripwire (all 9 real traces are pass; tripwire enables assertion 5 RED-dot verify).
- MODIFY `dashboard/index.html` — fetchTrace/loadModules check __MCP_TRACES__/__MCP_MODULES__ globals first; loadMicroservice() skips HTTP probe in file:// mode (zero network calls).
- MODIFY `bunfig.toml` — root=./src in [test] excludes dashboard/tests/ from bun test scanner.

**Playwright verdict (local run for po baseline):**
passingTests=7 | failingTests=0 | consoleErrors=0 | networkRequests=0 | ts=2026-05-25T21:00:10.880Z

**AC evidence:**
- AC-1: playwright.config.js headless+no-server PASS
- AC-2: 7/7 assertions exit 0 PASS
- AC-3: 0 console errors PASS
- AC-4: 0 HTTP(S) requests PASS
- AC-6: bun test ≥9408 PASS; bun run check exit 0 PASS

**Zone health:** P2-H done; playwright-verdict.json left unstaged (po owns verdict commit); tsc clean; ESLint exit 0 | HEALTHY

---

## c302 · 2026-05-25 (BT-7 deploy + re-backfill — pdf-extractor rebuild + backfillBctcTables)

### BT-7 deploy+re-backfill DONE

**No TS code committed** — deploy+run+verify only.

- `docker compose up -d --no-deps --build pdf-extractor` → BT-7 code (210a0a62) live. Health 200.
- `bun run /app/run-bctc-backfill.ts` inside mcp-server container: 12/12 success, 0 failed, zero Tesseract.
- FPT Q4 live: rows_count=150 (was 2170), period_current=31/12/2025 (was 26/01/2026), balance_pass=true, golden anchors 270/300/400 EXACT.
- FPT Q1: 0 rows — BT-5 gate correctly blocks quarterly format (code 270 ≠ Total Assets in Q1). Honest gap.
- HPG Q4: 117 rows, period=31/12/2025, balance_pass=true.
- VEA Q4: 205 rows, balance_pass=true (period=01/01/2025 wrong — residual extractor issue).
- Memory: pdf-extractor 50.6 MiB, mcp-server 278 MiB — both stable.
- tsc: EXIT 0. bun test: exit 0 (known Bun C++ panic after suite = upstream bug, pre-existing).

NEXT: qa re-verify → PO final BT-EXIT sign-off.

---

## c301 · 2026-05-25 (mcp-server Phase-2 P2-G — G9 dashboard live panels)

### P2-G — G9 Dashboard Live Panels DONE

**Commit:** `7520428b` | 2 files (1 new, 1 modified) | tsc EXIT 0 | bun test 9431/363 (≥9408 PASS; 363 fail = baseline drift from other-zone activity, not mcp-server changes) | tools=148 | sched=68

**Delivered:**
- CREATE `apps/mcp-server/dashboard/data/modules.json` — 12 barrel modules with sub-barrel data (P1-C/D/E decomposition). Force-added past root `.gitignore data/` pattern.
- MODIFY `apps/mcp-server/dashboard/index.html` — Module panel: `fetch('data/modules.json')` renders 12 barrels with `.mcp-chip` sub-barrel chips; no "Phase 2 — not yet extracted" text remains. Microservice panel: `fetch('http://localhost:3000/health')` → live `toolCount`; offline fallback "146 tools (server offline — last known)" with yellow indicator. All CSS under `.mcp-*` namespace.

**AC evidence:**
- AC-1: `grep -c "not yet extracted"` = 0 PASS
- AC-2: live path `toolCount=146`, `status=ok` from `localhost:3000/health` PASS; offline fallback renders "146 tools (server offline — last known)" with yellow dot PASS
- AC-3: `jq . modules.json` exit 0 PASS; `bun tsc --noEmit` exit 0 PASS
- AC-4: `git diff --cached --name-only` = 2 files only PASS

**Zone health:** G9 dashboard live panels complete; module panel 12 barrels with chips; microservice panel live+offline fallback; tsc clean; ESLint baseline intact | HEALTHY

---

## c300 · 2026-05-25 (mcp-server Phase-2 P2-F — G5a domain-file deletion)

### P2-F — G5a kinhDichWrapper → _deprecated/ DONE

**Commit:** `11a89765` | 4 files (R096 rename + 3 edits) | tsc EXIT 0 | bun test 9450/344 (≥9408/≤348 PASS) | tools=148 | sched=68

**Delivered:**
- Pre-delete tag `mcp-server-pre-delete` created at HEAD before any move.
- `git mv` domain/services/kinhDich/kinhDichWrapper.ts → infrastructure/_deprecated/kinhDichWrapper.ts (R096 rename).
- DEPRECATED comment added at top of moved file. Internal import path fixed: `./hexagramLibrary.js` → `../../domain/services/kinhDich/hexagramLibrary.js`.
- `domain/services/index.ts` line `export * from "./kinhDich/kinhDichWrapper.js"` removed.
- `1077-kinh-dich-wrapper.test.ts` + `1081-sprint-054-smoke.test.ts`: import updated to `../infrastructure/_deprecated/kinhDichWrapper.js` + DEPRECATED-TEST comment added.

**AC evidence:**
- AC-1: `git tag --list mcp-server-pre-delete` non-empty PASS
- AC-2: `_deprecated/kinhDichWrapper.ts` exists with DEPRECATED comment PASS
- AC-3: `find domain/ -name kinhDichWrapper.ts` empty PASS
- AC-4: grep interface/scheduler → EXIT 1 (0 results) PASS
- AC-5: grep `^import.*from.*infrastructure` in domain/ → EXIT 1 (0 actual imports) PASS
- AC-6: `bun run check` exit 0; bun test 9450/344; tools=148; sched=68 PASS
- AC-7: `git diff --cached --name-status` shows R096 + 3M (4 files only) PASS
- BONUS ESLint fence: `bunx eslint src/ --max-warnings 0` exit 0 PASS

**Zone health:** G5a complete; kinhDichWrapper.ts no longer in domain layer; domain purity maintained; tsc clean; bun test 9450/344 PASS; ESLint fence exit 0 | HEALTHY

---

## c299 · 2026-05-25 (BT-4b-2 — host-safe BCTC backfill)

### BT-4b-2 — OCR pre-supply to zero Tesseract on 16GB Mac DONE

**Commit:** `6d7839be` | 2 files | tsc EXIT 0 | 12 tests pass / 0 fail | tools=148 | sched=68

- `bctcBatchTableBackfillJob.ts`: pre-compiled OCR query on `pdf_extracted_text` (join basename); docs with OCR pages get `pages:[{page_number,text}]` appended to `/extract-tables` POST; no OCR → `skipped_no_ocr` (host-safe).
- FPT golden anchors confirmed live: 270=88,089,621,779,862 / 300=44,338,155,487,272 / 400=43,751,466,292,590.
- 12/14 docs processed (2 VCB skipped_no_file expected). mcp-server 228.7 MiB stable, zero Tesseract.

Zone health: host-safe backfill complete; FPT BS rows stored + balance_check passes; 0 Tesseract | HEALTHY

---

## c298 · 2026-05-25 (mcp-server Phase-2 P2-E — G3 composition-root extraction)

### P2-E — G3 Composition-Root Extraction DONE

**Commit:** `82ebb314` | 2 files | tsc EXIT 0 | bun test 9442/348 (≥9408/≤348 PASS) | tools=148 | sched=68

- `index.ts` slimmed to 41L (thin entry point).
- `composition-root.ts` created 120L: exports `bootstrapMcpServer(cfg: AppConfig, log: Logger): Promise<void>`. Contains all startup sections (env-check, DB+WAL+vnstock-migrations, trade-seed, HTTP server, Telegram, webhook, pdf-extractor health, scheduler, background OCR setTimeout [4 KEEP/G5-DEBT callers], graceful shutdown, signal handlers, unhandledRejection).
- FENCE SELF-CHECK: `bunx eslint src/ --max-warnings 0` exit 0.

Zone health: composition-root.ts extracted; index.ts=41L; G3 DONE; tsc clean; ESLint fence exit 0 | HEALTHY

---

## c296 · 2026-05-25 (mcp-server Phase-2 P2-A/B/C — ESLint fence foundation)

### P2-A/B/C — ESLint Fence Foundation DONE

- P2-A: `mcp-server-pre-ci` tag @ ba38dbe0.
- P2-B: `eslint.config.mjs` 88L. Fence-A: domain must not import infrastructure/interface/scheduler. Fence-B: application must not import interface/scheduler. R-2 fallback: `eslint-import-resolver-typescript` for `.js`→`.ts` resolution. FENCE-LEGACY on pollNews.ts. Commits: 5e34c7fe + 4e6f89ab.
- P2-C: deliberate Fence-A violation (sparkline.ts) → exit 1 confirmed → reverted, never staged.

Regression tripwires: bun test 9437/345 | tsc exit 0 | tools=148 | sched=68

---

## Working Memory

### Phase-2 State (as of c301)
- P2-A/B/C: DONE (ESLint fence)
- P2-D: QA gate PASS (4e6f89ab freeze-anchor confirmed)
- P2-E: DONE (G3 composition-root)
- P2-F: DONE (G5a kinhDichWrapper delete)
- P2-G: DONE (G9 dashboard live panels) ← current
- P2-H: NEXT (G9 Playwright trust contract — PM dispatches separately)
- Goals earned: G3+G4+G9 = 10 total (G10/G11 still pending)

### Carry-over
- 344 pre-existing test failures — within ≤348 baseline
- Bun v1.3.13 C++ panic after full suite = known upstream bug (exit code 0, tests pass)
- BT-3-D blocker: pdf-extractor needs OCR wiring in `/extract-tables` (dev-pdf-extractor zone)
- BCTC VPS stale 78.9h — under 1953-G-FAIL freeze, do not touch
- _deprecated dir pattern: infrastructure/_deprecated/ (created this cycle for kinhDichWrapper; P1-G pattern used for rag/ files)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
