# PO Notebook

## Cycle 2026-05-31T09:20Z — OPENED sprint FU-TRUST-REFRESH (BCTC trust remediation, follow-up to BCTC-TRUST-RED). All 5 ODs adjudicated.

Architect brief `docs/architecture-briefs/2026-05-31-bctc-trust-remediation-investigation.md` (aa753e5e) root-caused the digit-run mock data: Haiku refine agent fabricated on EMPTY OCR text. Root cause = unwired DI seam — `/page-text` (handlers.py:728) returns `""` permanently because `main.py create_app()` never constructs/passes `ocr_text_source` to `register_routes()`. Real OCR exists (FPT 35p / ACB 27p in `pdf_extracted_text`). Re-refine TODAY would re-fabricate → seam fix is gating prereq.

**OD verdicts (rationale in SPRINT_GOAL.md FU-TRUST-REFRESH §):**
- OD-1 open sprint → YES. Gates stop bad data but don't produce good data; product shows "Chưa có dữ liệu" until re-refine.
- OD-2 dev-pdf-extractor owns FU-1 → YES. main.py/config.py/handlers.py all pdf-extractor zone, zone-clean.
- OD-3 EBITDA FU-5 here → NO, DEFER to BCTC-LAYOUT-FIRST. It's `apps/mcp-server/` = different zone; folding makes sprint multi-zone + risks rebuild collision. Overrode architect's "include" rec on zone-discipline grounds (recurring cross-zone rebuild collision history).
- OD-4 FPT pages 11–15 missing → ACCEPT + CONDITIONAL ROUTE. Re-refine proceeds on existing pages; agent gets honest text="" for 11–15, degrades (won't fabricate, DT-1 gate). FU-4 QA evaluates if opex 11/24/25/26 appear; if absent → BCTC-LAYOUT-FIRST targeted re-OCR (no PEK for 5 pages here).
- OD-5 market.db read-only mount → **FLAGGED BACK TO ARCHITECT (FU-0 design re-pick).** TWO findings: (1) brief's "volume only mounted in mcp-server" is FACTUALLY WRONG — `market_data:/app/data` already mounted (rw) in BOTH services; no new mount needed, only MARKET_DB_PATH wiring. (2) codebase already has `infrastructure/ocr_text_fetch_client.py` (OcrTextFetchClient → mcp-server `/api/bctc-inspect/ocr`) = the HTTP alternative OD-5 asked about, NOT wired into the page-text factory (sqlite|mistral only). Direct-SQLite vs HTTP-fetch is a real coupling-vs-network-hop trade-off → architect must adjudicate with corrected facts. Did NOT force a mount.

**Dispatch chain I want (returned to router, did NOT dispatch):** po → **architect (FU-0 OD-5 design re-pick)** → dev-pdf-extractor (FU-1) → ops (FU-2 rebuild+rasterize, FU-3 off-HOSE re-refine) → qa (FU-4). Architect needed FIRST because OD-5 is unresolved by design; do NOT go straight to dev.

**Artifacts:** SPRINT_GOAL.md FU-TRUST-REFRESH § prepended (now 214L). TASKS.md: collapsed BCTC-TRUST-RED to one-liner + added FU-TRUST-REFRESH (FU-0..5); now 75L (cap 80, headroom 5).

## Carry-over
- FU-3 off-HOSE-gated: today Sat 2026-05-31 permitted; weekday only 09:00–01:59 UTC. FU-1+FU-2 must land first.
- RISK-1 (HIGH): if market.db unreachable in pdf-extractor, source returns silent "" = same bug. FU-1 MUST add fail-loud startup ERROR. ops verify seam live BEFORE FU-3.
- RISK-2: real data may legitimately trip DT-3 cross-stmt; that's evaluate-don't-clear, not a fail.
- TASKS.md 75L — re-prune toward 80 (closed-sprint ledger is bloat source; archive to TASKS_ARCHIVE.md if it grows).
- Hygiene held: scoped `git add <file>` ONLY (tree has many unrelated HCM/handoff/notebook files); NEVER -A; main only. Gateway wrapper, bare tool names.
- Next dispatchable once FU-TRUST-REFRESH chain runs: SELF-IMPROVE-GATE X-1 · CHEF-ATTN · BCTC-LAYOUT-FIRST Phase 0 (needs architect for #3011) · code-janitor DOUBLON CLEAN (held). FU-MON (Monday open) foreign-flow + Brent/Gold non-zero.
