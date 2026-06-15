# PO Notebook

## 2026-06-15T20:10Z — FIX-BCTC-ENRICH-SILENT-0ROWS done_verified gate → HOLD (check-a FAIL)

Drove rebuild→verify for the merged enrich-silent-0rows fix (68d54c7b pdf-extractor
Layout-6/7 + 989654f2 mcp-server 0-row gate; pm flipped in_progress→review ad4c1537).
Host SAFE (load 7.45/12, headroom 3077MB, off-market). Rebuilt BOTH images per-container
(force-recreate `up -d --no-deps`, NEVER compose down; one transient zombie-PID on
pdf-extractor cleared by SIGKILL, all 13 peers stayed healthy; builder prune both).
New images: pdf-extractor .Created 19:29Z (sha ef0acd92), mcp-server 19:37Z (4e0206fe)
— both > commit 19:12Z. pek-import-chain ALL OK (no native-lib crash).

**Gate pivot:** board gate named `runBctcReparseJob` but RAW inspection showed that's a
TEXT-stranded recovery path (pdf-parse tiers) — the merged FIX lives in `runBctcPdfPullJob`.
Re-drove VCB 2026Q1(id 292117)+2025Q1(id 224) through the REAL fixed pull job vs
named-volume market.db (sidecar read; in-container Bun reset for WAL-locked DB):
- (a) real VARIED rows: **FAIL** — still 0 bctc_table_rows. fitz: VCB_2026_Q1.pdf =
  53pp, 110 text-chars/first 8pp + images = SCANNED/image-only; Layout-6/7 text-table
  parser can't fire on 0-char input. OCR rasterization is the missing leg.
- (b) fail-loud: **PASS** — both rows → enrich_failed (NOT done), logger.error
  "ENRICH 0-rows — FAIL LOUD", enrichFailed:2. Silent-advance genuinely fixed.
- (c) non-regression: **PASS** — FPT 2026Q1=145, VCB 2025Q4=112 intact + untouched.

**Verdict:** HOLD FIX-BCTC at review (done_verified WITHHELD — check-a fails /goal#1).
Merged code CORRECT but INCOMPLETE. Minted FIX-BCTC-BANK-PDF-OCR-RASTERIZE → ready
(P0, dev-pdf-extractor, generic no-allowlist, PaddleOCR already in-image). Board committed
4763dee7 (explicit path; dirty tree NOT swept — only orch-state + 2 scripts staged).
DJ-GATE written. PUSH held.

### Carry-over
- **FIX-BCTC-BANK-PDF-OCR-RASTERIZE (ready, P0)** = remaining TRUE root of
  get_bctc_full(VCB/CTG)='Chưa có dữ liệu BCTC'. NEXT dispatch → dev-pdf-extractor.
  done_verified = real VARIED rows for VCB AND CTG vs named-volume DB; FPT145/VCB112
  non-regress; genuinely-unparseable PDF still enrich_failed.
- cowork bctc-analyst CTG/VCB/D2D RELEASE block stays JUSTIFIED-blocked (real, not stale).
- FIX-BCTC-ENRICH-SILENT-0ROWS stays review until OCR leg lands ((b)+(c) legs done).
- Reusable: scripts/ops-bctc-enrich-reverify-pulljob.sh (reset queue→pending + run pull
  job, in-container Bun for WAL DB); scripts/po-s64-…-ocr-triage.jq (HOLD+mint).
- Prior carry: 06-16 GATES (vnstock-tradingstats 08:30Z sweep, RSI market-open echo) →
  then release held push (PO deferred; origin ~57 behind benign cloud-chore). PUSH HELD.
- FIX-HNX-SESSION-COOKIE + FIX-SSC-C111-EMPTY-FALLBACK batch one dev-vps-crawls pass.
