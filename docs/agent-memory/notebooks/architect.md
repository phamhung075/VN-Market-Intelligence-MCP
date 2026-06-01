# Architect — Notebook

**Last updated:** 2026-06-01 14:12 UTC | **Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD

[3 most recent cycles retained below. Archive in git history.]

## VPS-DEPLOY-PLACEHOLDER-GUARD (2026-06-01T11:20 UTC) — DEPLOY GUARD DESIGN

**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD | Task: ARCH (a/b/c boundary design)

**Root cause confirmed (raw-read):** `scripts/deploy-vps-proxy.sh` render step EXISTS (L108-110) but cafef sprint 814088b0 bypassed it via ad-hoc scp, clobbering `/root/fetch-vn-news.sh` with raw template. 6 hardcode-no-fallback scripts; 9 already safe.

**Key brownfield findings:**
- Deploy script deploys 5 services (prices/bctc/news/sbv/foreign-flow). NOT deployed: tradingeconomics, gso, enrich-bctc-urls, article-body-fetcher.py.
- `article-body-fetcher.py` has ZERO `__PLACEHOLDER__` tokens (it takes `--url` as CLI arg, no MCP contact directly). Pre-scp assert trivially passes for it.
- `fetch-tradingeconomics.sh` has a 3rd placeholder `__TE_API_KEY__`. Deploy script has no sed rule for it. GUARD-2 must use empty-string fallback for TE_API_KEY (not `__TE_API_KEY__`) to avoid GUARD-1 false-block.

**Decisions:**
- GUARD-2: ALL-6 scripts in one slice (symmetric blast radius, convert-all prevents future recurrence of same class)
- GUARD-1 regex: `__[A-Za-z][A-Za-z0-9_]*__` (case-insensitive, broader than original brief)
- GUARD-3 scope: article-body-fetcher.py + pip3 install bs4 only; tradingeconomics/gso/enrich deferred
- Zone: dev-vps-crawls owns all three guards + scripts/deploy-vps-proxy.sh changes
- DV test: inject `__GUARD_TEST_TOKEN__` into fixture → pre-scp assert must exit 1 before scp

**Brief:** `docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md`

---

## PROSE-DEV-1 (2026-05-31T23:00 UTC) — PROSE TEXT LOSS ROOT CAUSE

**Sprint:** PROSE-DEV-1 | Task: ARCH (operator defect — prose pages blank in Văn bản OCR tab)

**Root cause: display layer only (Layer C). Zone: dev-mcp-server.**

**Evidence (concrete, from live DB + code):**
- Layer A (extraction): CLEAN. `pdf_extracted_text` has all 27 ACB pages, text_len 352-2327.
- Layer B (storage/refine): CLEAN. `bctc_refined_units` has 27 DONE prose units, md_len 129-2431.
- Layer C (viewer): ROOT CAUSE. `handleBctcInspectOcr` in `bctcInspectHandler.ts` queries `bctc_layout_units WHERE page_type='table'`. ACB has 5 prose-typed PEK units with `stitched_markdown=""`. When a prose page is requested: table filter returns null → coverage-gap path emits `text_content:""` → viewer shows "No PEK unit for page N". Raw OCR in `pdf_extracted_text` is never consulted.

**Fix (PROSE-DEV-1):**
1. `bctcInspectHandler.ts`: in coverage-gap branch, add `pdf_extracted_text` fallback query for the requested page. Serve `text_content: rawRow.text_content` (+ `confidence: rawRow.confidence`) while keeping `pek_coverage_gap:true`.
2. `bctc-inspector.html`: render `text_content` when `pek_coverage_gap=true` (remove static "No PEK unit" message, replace with gap banner + raw text).

**DV test:** `PROSE-DEV-1-prose-text-display.test.ts` — DV-1 RED (text_content="" before) / GREEN (text_content="Prose page one content" after). DV-2/DV-3 regressions green throughout.

**Brief:** `docs/architecture-briefs/2026-05-31-prose-text-loss.md`

---

## VPS-DEPLOY-PLACEHOLDER-GUARD — DEPLOYER CONSOLIDATION (2026-06-01T14:12 UTC)

**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD | Task: ARCH (wrong-deployer design decision)

**Decision: OPTION A — Consolidate to deploy-vinahost.sh as single canonical deployer.**

**Verification raw (independent read):**
- `deploy-vinahost.sh` → Vinahost 125.212.251.27 (live), 9 services, 0 guards.
- `deploy-vps-proxy.sh` → Vultr 139.180.185.18 (dead since 2026-04-13), 5 services, GUARD-1/2/3.
- `deploy-vinahost.sh` ALREADY has `__TE_API_KEY__` sed rule at L232-234.
- `fetch-tradingeconomics.sh` L15 VPS-side graceful-skip: correct defence-in-depth, retain as-is.
- `enrich-bctc-urls.sh` fully covered by vinahost section 7; no extra guards needed.

**Rationale (A over B):** B keeps Vultr deployer alive → future agents keep landing work on dead host.
GUARD-1 post-deploy SSH verify in deploy-vps-proxy.sh would connect to dead server = false-green.
deploy-vinahost.sh ships superset (9 vs 5 services); no service in deploy-vps-proxy.sh is absent.
article-body-fetcher.py must reach Vinahost (cafef endpoint consumer is mcp-server on Vinahost).

**Task map for PM:** T1=OPS-RECON(ops gate) → T2=GUARD-1 migrate 9 blocks → T3=GUARD-3 article-body
block → T4=retire deploy-vps-proxy.sh + remove VULTR_IP/.env → T5=QA (DV-1..6).

**Brief:** `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md`

---
