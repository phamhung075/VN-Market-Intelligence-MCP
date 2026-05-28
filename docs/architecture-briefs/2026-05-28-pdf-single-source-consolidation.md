# PDF Single-Source Consolidation — Architecture Brief

**Sprint:** PDF-SINGLE-SOURCE  
**Date:** 2026-05-28  
**Architect:** architect agent  
**Status:** DESIGN COMPLETE — handoff to dev-pdf-extractor

---

## §1 — Problem Statement

The codebase currently reads PDFs from two live paths plus one dead-orphan path:

| Path (host) | Mount target | Files | Status |
|---|---|---|---|
| `data/pdfs/` | none | 2 (VEA + VNM) | Dead orphan — no code reads, no mount |
| `data/pdfs-local/` | `/app/data/pdfs-local` (pdf-extractor only, `:ro`) | 14 | Dev/eval path — spike + integration tests |
| named volume `market_data:/app/data/pdfs/` | `/app/data/pdfs` (all services) | 15 | Production path — DB references, runtime |

The user directive is: one source only. The DB column `financial_reports.pdf_path` stores `/app/data/pdfs/<filename>` — that path must remain valid byte-for-byte after migration.

---

## §2 — Key Technical Risk: Does Bind Mount Shadow a Named Volume Subdirectory?

**Verdict: PROVEN SAFE. No risk.**

This is not hypothetical. The existing compose line at `docker-compose.yml:89` already does exactly this:

```yaml
- ./data/pdfs-local:/app/data/pdfs-local:ro
```

The `market_data` named volume is mounted at `/app/data` for the pdf-extractor service. The bind mount at `/app/data/pdfs-local` is a second mount that shadows only that subdirectory. The named volume continues to serve `/app/data/market.db`, `/app/data/lancedb/`, `/app/data/extractions/`, etc. **This is Docker's standard Linux namespace mount behavior — a bind mount at a child path shadows only that child; the parent named volume serves all other paths beneath it.**

Evidence: `docker run --rm -v vn-market-intelligence-mcp_market_data:/vol alpine ls /vol/` confirms the named volume already contains both `pdfs/` and `pdfs-local/` subdirectories. The `pdfs-local` bind mount has been shadowing the volume's `pdfs-local/` subdir since that line was added, without affecting any other volume content.

**Conclusion:** Replace `pdfs-local` bind mount with `pdfs` bind mount. The parent named-volume mount at `/app/data` is untouched everywhere else. `/app/data/market.db`, `/app/data/pdf_extractor.db`, `/app/data/lancedb/`, `/app/data/extractions/` all remain on the named volume. No alternative design needed.

---

## §3 — Chosen Canonical Path

**`/app/data/pdfs/`** inside containers, backed by host `data/pdfs/` via bind mount (`:ro`).

Rationale:
- `financial_reports.pdf_path` already stores `/app/data/pdfs/<filename>` — zero DB rewrite.
- `main.py:77` default `PDF_DIR=/app/data/pdfs` already correct.
- `server.ts:885` pdfDir resolves to `data/pdfs` relative to `/app` cwd — already correct.
- Production runtime is already using this path; the consolidation moves host-side eval files to match, not the other way around.
- Named volume bind-shadow pattern is proven safe (see §2).

---

## §4 — Pre-Migration State Audit (live-verified)

### Named volume `pdfs/` (15 files — canonical set):
```
20250429-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2025_signed.pdf
20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf
20260129-DIG-BCTC-hop-nhat-quy-4-nam-2025-cks.pdf
20260130-BSR-Bao-cao-tai-chinh-rieng-Quy-4-nam-2025.pdf
20260130-DGC-BCTC-hop-nhat-quy-4-2025.pdf
20260130-HPG-Bao-cao-tai-chinh-rieng-Cong-ty-me-va-giai-trinh-Q4.2025.pdf
20260130-SHB-Bao-cao-tai-chinh-Q4.2025-Hop-nhat.pdf
20260130-VCB-CBTT-&-BCTC-Hop-nhat-Q4.2025.pdf
20260420-DHG-BCTC-Quy-1.2026.pdf
20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf
20260424-FPT-BCTC-hop-nhat-Quy-1-nam-2026.pdf   ← Q1-2026 only-in-volume
20260424-GAS-CBTT-BCTC-Hop-nhat-Quy-1-2026.pdf  ← Q1-2026 only-in-volume
20260428-EIB-BCTC-hop-nhat-Q1.2026.pdf           ← Q1-2026 only-in-volume
BCTC VEA 31.12.2025 - RIENG - VN.pdf
BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf
```

### Host `data/pdfs-local/` (14 files):
- 10 canonical (VPS-named) — subset of the volume's 15, missing the 3 Q1-2026 files.
- 2 internal stub dupes: `BSR_2025_Q4.pdf`, `DGC_2025_Q4.pdf` — byte-identical to their canonical `20260130-*` counterparts (md5-confirmed).
- 2 VEA/VNM — byte-identical (md5-confirmed) to the named-volume copies.

### Host `data/pdfs/` (2 files — dead orphan):
- `BCTC VEA 31.12.2025 - RIENG - VN.pdf` — md5 `b75967de20a55b1cec37a668c1061246`, byte-identical to `pdfs-local/` and volume copies.
- `BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf` — md5 `c4302f7c384b7952c3e2bade04afddb6`, byte-identical.

---

## §5 — Migration Plan (ops executes, STRICTLY before compose change)

### Step M-1: Confirm .gitignore covers `data/pdfs/*.pdf`

Current `.gitignore` does NOT have a `data/pdfs/*.pdf` pattern. It has `apps/pdf-extractor/PDF-Extract-Kit/` but nothing for `data/pdfs/`. **This must be added before populating the directory or git will stage 15 binary PDFs.**

Pattern to add to `.gitignore`:
```
data/pdfs/*.pdf
data/pdfs-local/
```

(dev-pdf-extractor adds this as part of the code-change commit; ops must not copy files until that commit is merged.)

### Step M-2: Delete the 2 orphan files from `data/pdfs/`

```bash
rm "data/pdfs/BCTC VEA 31.12.2025 - RIENG - VN.pdf"
rm "data/pdfs/BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf"
```

### Step M-3: Copy 15 canonical PDFs from named volume to host `data/pdfs/`

```bash
docker run --rm \
  -v vn-market-intelligence-mcp_market_data:/vol:ro \
  -v "$(pwd)/data/pdfs":/out \
  alpine sh -c "cp /vol/pdfs/* /out/"
```

Verify count:
```bash
ls data/pdfs/ | wc -l   # must be 15
```

### Step M-4: Dedup check — merge pdfs-local unique files

Run md5 comparison. All 14 pdfs-local files are covered by the 15 from the named volume (the 3 Q1-2026 files in the volume were MISSING from pdfs-local; VEA/VNM/BSR/DGC all byte-identical). After M-3, there are zero files in pdfs-local that are not already in data/pdfs/.

**No additional copy needed.** The 3 Q1-2026 files come from the volume in M-3. The stub dupes (BSR_2025_Q4.pdf, DGC_2025_Q4.pdf) are dropped intentionally — their canonical VPS-named counterparts are present.

### Step M-5: Delete `data/pdfs-local/` directory

```bash
rm -rf data/pdfs-local/
```

This is safe only after the compose change is applied and both containers have been rebuilt (so no running container depends on `/app/data/pdfs-local`).

**Sequencing constraint:** M-5 MUST come after the compose rebuild (Step C-2 below), not before. Until the rebuild, pdf-extractor still has the `pdfs-local` bind mount active.

---

## §6 — docker-compose.yml Changes

### pdf-extractor service — replace bind mount

Remove:
```yaml
- ./data/pdfs-local:/app/data/pdfs-local:ro
```

Add:
```yaml
- ./data/pdfs:/app/data/pdfs:ro
```

This replaces the existing dev-eval bind mount. The named-volume mount `market_data:/app/data` remains. The new bind at `/app/data/pdfs` shadows only the `pdfs/` subdirectory of the named volume; all other paths on the named volume (`/app/data/pdf_extractor.db`, `/app/data/extractions/`, etc.) are unaffected.

### mcp-server service — add bind mount

mcp-server currently has only:
```yaml
- market_data:/app/data
```

Add (after the named-volume line):
```yaml
- ./data/pdfs:/app/data/pdfs:ro
```

The bind mount is read-only (`:ro`) for PDF access. mcp-server writes to `market.db` via the named volume (that path is unaffected — `/app/data/market.db` is served by the named volume, not the bind). The VPS push handler at `server.ts:885` writes PDFs via `mkdirSync(pdfDir, { recursive: true })` + `writeFileSync(pdfPath, ...)`. This **requires write access**. The bind mount must be writable for the push handler.

**CORRECTION: omit `:ro` for mcp-server.** The push handler writes incoming PDFs to `/app/data/pdfs/<filename>`. Making this read-only would break VPS push. Mount as read-write for mcp-server:

```yaml
- ./data/pdfs:/app/data/pdfs
```

pdf-extractor only reads PDFs (never writes) — `:ro` is correct there.

Final compose diff for volumes sections:

**mcp-server service:**
```yaml
volumes:
  - market_data:/app/data
  - ./data/pdfs:/app/data/pdfs        # ← ADD (rw — VPS push handler writes here)
  - ./mcp.config.json:/app/mcp.config.json:ro
  # ... (other bind mounts unchanged)
```

**pdf-extractor service:**
```yaml
volumes:
  - market_data:/app/data
  - ./data/pdfs:/app/data/pdfs:ro     # ← REPLACE ./data/pdfs-local:/app/data/pdfs-local:ro
  - pek_model_cache:/app/PDF-Extract-Kit/models
```

---

## §7 — Code Changes (4 Python files)

All 4 files change `pdfs-local` to `pdfs` in path constants. These are spike + integration test files — host-side paths that run on the developer machine (not inside containers). After consolidation, `data/pdfs/` on the host is the single source.

### 7.1 `apps/pdf-extractor/spike/eval/harness.py` — line 42

```python
# Before:
PDFS_LOCAL = REPO_ROOT / "data" / "pdfs-local"

# After:
PDFS_LOCAL = REPO_ROOT / "data" / "pdfs"
```

Note: variable name `PDFS_LOCAL` can stay as-is — renaming it would require updating lines 585 and 716 which use it. The name is now a misnomer but renaming is cosmetic and out of scope. If dev-pdf-extractor wants to rename: `PDFS_DIR` would be cleaner, updating lines 42/585/716.

### 7.2 `apps/pdf-extractor/spike/fpt_balance_sheet_eval.py` — line 38

```python
# Before:
PDF_PATH = REPO_ROOT / "data" / "pdfs-local" / "20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"

# After:
PDF_PATH = REPO_ROOT / "data" / "pdfs" / "20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"
```

### 7.3 `apps/pdf-extractor/__tests__/integration/test_extract_md_tables_fpt.py` — lines 44 and 47

```python
# Before (lines 44/47 contain):
"VN-Market-Intelligence-MCP/data/pdfs-local/"

# After:
"VN-Market-Intelligence-MCP/data/pdfs/"
```

(Exact replacement — dev-pdf-extractor confirms line numbers match; the string appears twice in the SKIP_REASON or path constant block.)

### 7.4 `apps/pdf-extractor/__tests__/integration/test_extract_tables_bt3d_real_ocr.py` — line 44

```python
# Before:
"VN-Market-Intelligence-MCP/data/pdfs-local/"

# After:
"VN-Market-Intelligence-MCP/data/pdfs/"
```

### 7.5 Read-only check

All 4 files are spike scripts and integration test skip-guards. None write to the PDF directory. The `:ro` bind mount on pdf-extractor is safe. The only writer is mcp-server's VPS push handler (covered in §6 — bind is rw there).

### 7.6 PEK render-seam compatibility

The PEK render-seam fix (commits `3a547488`/`e80f1999`) reads from `financial_reports.pdf_path` to resolve the PDF for re-extraction. Those DB values are `/app/data/pdfs/<filename>`. After migration, the bind mount at `/app/data/pdfs` (host `data/pdfs/`) serves these paths. No change to the render-seam logic — it is preserved.

### 7.7 `.gitignore` addition

Add two lines to `.gitignore`:
```
data/pdfs/*.pdf
data/pdfs-local/
```

`data/pdfs-local/` was never gitignored (the directory was listed in host-side git status as a tracked pattern). Adding it now prevents any leftover stub files from creeping back in.

---

## §8 — Zero DB Rewrite Confirmation

`financial_reports.pdf_path` stores `/app/data/pdfs/<filename>`. After migration:
- The bind mount `./data/pdfs:/app/data/pdfs` serves the host directory at the same container path.
- All 15 canonical filenames are preserved (they come from the named volume in Step M-3).
- No row in `financial_reports` changes. No migration script needed.

`inspection_store.py:100` doc string cites `/app/data/pdfs` — unchanged.
`main.py:77` default `PDF_DIR=/app/data/pdfs` — unchanged.
`server.ts:885` `pdfDir = resolve(process.cwd(), "data", "pdfs")` — unchanged (resolves to `/app/data/pdfs` inside container where cwd is `/app`).

---

## §9 — Rollback Procedure

The named volume `vn-market-intelligence-mcp_market_data` retains its internal `pdfs/` and `pdfs-local/` subdirectories at all times. No `rm` command is ever run inside the volume.

To rollback after a failed migration:

```bash
# 1. Revert docker-compose.yml to the pre-migration state (git checkout)
git checkout docker-compose.yml

# 2. Force-recreate both containers
docker compose up -d --no-deps --force-recreate pdf-extractor mcp-server

# 3. Verify containers use named-volume paths again
docker exec <pdf-extractor-id> ls /app/data/pdfs/
```

The named volume's `pdfs/` subdirectory remains intact throughout — it is never modified by this migration. The bind mount is simply removed from compose, and the named volume subdir is visible again in both containers.

---

## §10 — Verification Gates

### G1 — dev-pdf-extractor (code complete)

```bash
# Zero pdfs-local references in repo Python/YAML files
grep -r "pdfs-local" \
  apps/pdf-extractor/spike/ \
  apps/pdf-extractor/__tests__/ \
  docker-compose.yml
# Expected output: empty

# .gitignore updated
grep "data/pdfs" .gitignore
# Expected: data/pdfs/*.pdf
```

### G2 — ops (deploy complete)

```bash
# Both containers see 15 files at /app/data/pdfs/
docker exec <pdf-extractor-container-id> ls /app/data/pdfs/ | wc -l
# Expected: 15

docker exec <mcp-server-container-id> ls /app/data/pdfs/ | wc -l
# Expected: 15

# Named volume other paths still intact (spot-check)
docker exec <mcp-server-container-id> ls /app/data/market.db
# Expected: file present
```

### G3 — qa (regression on PEK render-seam)

```bash
# Hit the BCTC inspect endpoint for FPT sentinel
curl -s "http://localhost:3000/api/bctc-inspect?reportId=e71f845d-ffa5-48f9-8f09-30ac2cd09c65&page=5" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('has_pek:', d.get('has_pek'))"
# Expected: has_pek: True

# Direct DB count of bctc_layout_units (must be unchanged from pre-migration count)
docker exec <mcp-server-container-id> bun -e "
  const {Database} = require('bun:sqlite');
  const db = new Database('/app/data/market.db', {readonly:true});
  const r = db.query('SELECT COUNT(*) as n FROM bctc_layout_units').get();
  console.log('bctc_layout_units count:', r.n);
"
# Expected: same count as before migration (recorded by ops before starting)
```

---

## §11 — Hard Constraints Checklist

| Constraint | Status |
|---|---|
| No branches — all on main | Enforced |
| Scoped `git add` per file, never `-A` | Enforced (dev standard) |
| `apps/pdf-extractor/PDF-Extract-Kit/` zero-diff | Not touched by this sprint |
| Market-hours guard `handlers.py:403` intact | Not touched; no Python logic change |
| Rebuild NOT during HOSE-open (02:00–08:59 UTC Mon–Fri) | ops schedules accordingly |
| CPU-only, 8GB Docker cap | No container resource change |
| `pek_model_cache` named volume untouched | Compose change does not touch this mount |
| Frozen files unchanged | `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json`, `generic_md_table_extractor.py` — none touched |
| Fail-loud on missing PDF | `inspection_store.py:171` raises if `os.path.isfile(pdf_path)` is False — preserved; bind-mount provides the file at the same path |
| Leave architect notebook unstaged | Notebook update committed separately by main terminal |

---

## §12 — DDD Layer Assignment

This sprint is infrastructure-layer only. No domain or application layer changes.

| File | Layer | Change type |
|---|---|---|
| `docker-compose.yml` | infrastructure (deploy) | Bind mount replacement |
| `spike/eval/harness.py` | infrastructure (eval/dev harness) | Path constant |
| `spike/fpt_balance_sheet_eval.py` | infrastructure (eval/dev harness) | Path constant |
| `__tests__/integration/test_extract_md_tables_fpt.py` | infrastructure (integration test) | Path constant |
| `__tests__/integration/test_extract_tables_bt3d_real_ocr.py` | infrastructure (integration test) | Path constant |
| `.gitignore` | repo hygiene | Pattern addition |

BUILD-STANDARD: **not-applicable** (maintenance/refactor — no new primitives, no new service).

---

## §13 — Handoff Chain

```
architect → dev-pdf-extractor → ops → qa
```

**dev-pdf-extractor:**
- 4 Python path constant updates (§7.1–§7.4)
- `.gitignore` addition (§7.7)
- Commit: `chore(pdf-extractor): PDF-SINGLE-SOURCE — consolidate pdfs-local → pdfs path`
- Do NOT touch `docker-compose.yml` (ops task)
- Do NOT run ops steps

**ops (STRICTLY off-hours — not during 02:00–08:59 UTC Mon–Fri):**
- After dev commit merged: apply `.gitignore` confirms `data/pdfs/*.pdf` is ignored
- Step M-1 through M-3 (delete orphans, copy 15 PDFs from named volume)
- Apply compose changes (§6)
- `docker compose up -d --no-deps --force-recreate pdf-extractor mcp-server`
- Run G2 gates
- Step M-5 (delete `data/pdfs-local/` — ONLY after containers are healthy)
- Capture `ls /app/data/pdfs/` count from both containers, record pre-migration `bctc_layout_units` count for G3 baseline

**qa:**
- Run G3 gates (has_pek regression + DB count unchanged)
- Confirm `pdfs-local` grep = 0 in running container mounts (`docker inspect <pdf-extractor-id> | jq '.[].Mounts'`)
