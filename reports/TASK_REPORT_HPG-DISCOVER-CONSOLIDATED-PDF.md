## Task Report HPG-DISCOVER-CONSOLIDATED-PDF

**Commits (both in HEAD, confirmed):**
- `90c975415` — feat: new script `scripts/migrations/discover-consolidated-bctc-pdf.ts` (+446L, generic `--ticker`/`--year`/`--quarter` CLI args, no hardcoded ticker in logic)
- `65f0995d2` — chore: notebook `docs/agent-memory/notebooks/dev-mcp-server.md` + decision journal `sprint-FLOW-PRICE-ALPHA-LOOP-dev-mcp-server.md` STEP dev-mcp-server-S11 (DJ-GATE-1 present, task-id literal match confirmed)

**Scope:** `git show --stat 90c975415` = exactly 1 file, 446 insertions/0 deletions. Zero `apps/mcp-server/src/` files touched — confirmed no domain/served-code change.

### QA scope (per dispatch): DISCOVERY DELIVERABLE ONLY
Reflow into `financial_reports` is explicitly NOT this task's defect (separate infra bug, follow-up `FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT`, signal already sent to PO).

### Live-DB / live-container RAW-verify (docker exec, named-volume DB, not trusted from router summary)
Container `vn-market-intelligence-mcp-mcp-server-1`, healthy, `toolCount=183` (unchanged, live `/health`):
- `ls -la /app/data/pdfs/` — consolidated "hop nhat" PDF present: `20260130 - HPG - Bao cao tai chinh hop nhat va giai trinh Q4.2025.pdf`, **7,135,524 bytes** (`wc -c` confirms exact byte count).
- Old standalone "rieng" PDF (`20260130-HPG-Bao-cao-tai-chinh-rieng-Cong-ty-me-va-giai-trinh-Q4.2025.pdf`, 4,897,389 bytes) still present, untouched — **no data loss**.
- `bctc_vps_queue` id=223 (direct `bun:sqlite` query, own script, not `sqlite3` CLI which isn't installed in the image): `status="done"`, `attempts=1`, `source_url` = the consolidated hop-nhat URL — **confirmed corrected**.
- `financial_reports` row `918a7abd-ae17-466f-be30-96ec55218ccc`: `pdf_path` still the OLD "rieng" file, `parsed_at="2026-06-07T10:27:16.751Z"` (stale) — **confirms the disclosed reflow gap exists exactly as reported, not silently hidden or fabricated as fixed**.

### Tests / checks (RAW re-run)
- `bun test src/__tests__/BCTC-3b-hsx-fetcher.test.ts` (apps/mcp-server) → **9 pass / 0 fail, 19 expect()** — matches claim.
- `bash scripts/audits/mock-guard.sh --files "scripts/migrations/discover-consolidated-bctc-pdf.ts"` → **PASS**, exit 0.
- Security grep: all 3 SQL statements are parameterized (`?` placeholders, no string interpolation). `HSX_API_TOKEN = "HJ2HNS3SKICV4FNE"` grep-flags as "token" but traced to `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts:54` — an already-shipped, explicitly-documented **public static token scraped from hsx.vn's own JS bundle** (not a secret). Duplicated verbatim, not new debt.
- DDD: N/A — standalone migration script (same class as sibling `scripts/migrations/*.ts`), not domain-layer code, no infra/application import direction to violate.
- `pnpm --filter vn-market check` (canonical project tsc gate) → clean, 0 errors — **but this is a false-clean-by-omission**: root and mcp-server `tsconfig.json` `include` globs (`src/**/*`, `*.ts`) do not cover `scripts/migrations/`, so this file is never actually type-checked by the project's real gate.

### Finding (mine, CAUTION — non-blocking)
Built an isolated tsconfig replicating apps/mcp-server's exact pinned compiler (`./node_modules/.bin/tsc` 5.9.3, identical `compilerOptions`) to directly test the file:
- **1 real, reproducible type error** at `scripts/migrations/discover-consolidated-bctc-pdf.ts:395` — `new Blob([pdfBytes], {...})` where `pdfBytes: Uint8Array` (built via `new Uint8Array(await ...arrayBuffer())`) is not assignable to `BlobPart` under strict DOM lib (`Uint8Array<ArrayBufferLike>` vs required `ArrayBufferView<ArrayBuffer>`).
- Control-checked sibling precedent `scripts/migrations/reparse-bctc-reports.ts` (already-shipped, this task explicitly mirrors its logic) the same way: **2 of its own pre-existing type errors surfaced too** (`exactOptionalPropertyTypes` violations, lines 169/264) — confirming `scripts/migrations/` has **zero tsc coverage project-wide**, not a regression unique to this task.
- Zero runtime impact: Bun strips types at execution; the script already ran successfully live in `--apply` mode (RAW DB-verified above). Zero blast radius: not imported by `src/`, not part of any CI-covered path.
- Not gating on this — same pre-existing structural blind spot as an already-shipped sibling file. Noting for hygiene/future visibility, not this task's fault.

### Verdict
**APPROVED — DONE_VERIFIED.** Discovery deliverable is real, complete, and independently RAW-verified: the correct consolidated ("hop nhat") PDF was discovered, downloaded (byte-exact vs hsx.vn), and the `bctc_vps_queue` row was corrected to reference it — live, on disk, in the running container. No data loss (old file untouched), no fabricated data (mock-guard PASS, real hsx.vn download verified by content-type + size before write), generic script (CLI args, no ticker hardcoded in logic). The known `financial_reports` reflow gap is confirmed present exactly as disclosed and is out of scope for this task (tracked as `FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT`). `deploy_required:false` — no served code changed, nothing to rebuild.

QA did not push to origin, did not run any deploy/rebuild command.
