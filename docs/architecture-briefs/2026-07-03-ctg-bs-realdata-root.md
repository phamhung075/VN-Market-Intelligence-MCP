<!-- size-justification: SPIKE root-cause recon carrying live-DB/tool-call evidence (get_bctc_refined verbatim markdown, bctc-inspect row dumps, empirical regex tests) inline for RAW-verify by downstream pm/dev/qa without re-running the probe — same precedent as 2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md. Splitting would break the single-reader audit trail. -->
# Architecture Brief — SPIKE-BCTC-CTG-BS-REALDATA-ROOT

**Task:** SPIKE-BCTC-CTG-BS-REALDATA-ROOT | **Parent:** FIX-BCTC-BANK-BS-SECTION-CLASSIFIER | **Date:** 2026-07-03
**Mandate:** real-data root-cause recon (NOT a code patch) for report_id `96e36139-5dac-414d-8e4d-20a4725890d1` (CTG 2026-Q1 consolidated, 56/56 DONE units, 451 materialized `bctc_table_rows`) — locate WHERE `total_assets` is lost across 3 candidate layers.
**Method:** `mcp__gateway__call_tool` not registered in this sub-session (INV-GATEWAY-1, confirmed empirically). Substituted direct HTTP JSON-RPC to the live mcp-server (`POST localhost:3000/mcp`, same running container, `tools/call` — no session header required) + direct `GET /api/bctc-inspect/*` REST reads, per the qa behavioral-DoD precedent. All evidence below is from the LIVE named-volume `market.db`, read-only.

---

## Verdict (one line)

**Root cause is a chain of THREE independent, stacking bugs in `apps/mcp-server` — application-layer parser (dominant) + domain-layer classifier + a section-detection vocabulary gap. Transcription (layer a) is CORRECT and NOT at fault — the grand-total rows exist, pre-parse, with the right values. The parser destroys them before they ever reach `bctc_table_rows`.**

---

## 1. Evidence — the 451 live rows (layer a probe, per qa's method)

`GET /api/bctc-inspect/table/96e36139-5dac-414d-8e4d-20a4725890d1` → `has_pek:false, has_table:true, rows:451, balance_check:null`.

Page numbers present: `[6,7,8,9,10,13,14,15,16,25,29,38,39,40,41,42,43,44,45,46,47,48,49,56,58,60,61]`. **Pages 1–5 are entirely absent** — no row anywhere carries `page_number` 4 or 5.

`code` column distribution (153 unique values across 451 rows) shows two anomaly classes:
- Bolded Roman-numeral tokens: `**I**`, `**II**` … `**XV**` (all on pages 8–9, the income statement).
- Full descriptive text masquerading as `code`: `'**Tổng tài sản**'`, `'**Tổng cộng**'`, `'Cong ty TNHH MTV Quan ly no va Khai thac...'` — i.e. the `code` column holds LABEL text, and (checked directly) the paired `label` column holds what should have been the code/value (e.g. `code:"**Tổng tài sản**"`, `label:"119,220,360"` on page 56).

Confirmed via exact regex replay of `bctcFormType.ts`'s discriminator against all 451 codes: **zero** rows match `ROMAN_SECTION` (`^(XIII|…|I)(\.\d+)?$|^[AB]$`), **zero** rows match `CORP_BALANCE` (`^[0-9]{3}`).

`page-window` probe confirms pages 4–5 DID get refined (`unit-0002`, `row_count:34, confidence:0.75, DONE`) — the unit exists and was materialized once (`bctc_refined_units.row_count=34`), but zero of its rows survive into `bctc_table_rows` today.

## 2. Evidence — the PRE-PARSE source markdown (closes the "is it transcription or parser" question definitively)

Called `get_bctc_refined(report_id=96e36139…)` directly (56 units, verbatim `bctc_refined_units.markdown`). **`unit-0002` (pages 4-5, the primary consolidated balance sheet, assets side) is clean, complete, and correct**:

```
## TÀI SẢN
| Mục (Item) | Mã (Code) | Năm 2026 | Năm 2025 |
|---|---|---:|---:|
| **A. TÀI SẢN** | | | |
| I. Tiền mặt, vàng bạc, đá quý | | 12,295,797 | 12,583,484 |
...
| **TỔNG TÀI SẢN CÓ** | | **2,924,176,928** | **2,767,699,300** |
```

`unit-0003` (page 6, liabilities+equity side) is equally clean and contains BOTH remaining grand totals:
```
| **TỔNG NỢ PHẢI TRẢ** | | **2,735,484,770** | **2,588,044,295** |
| **VIII. Vốn chủ sở hữu** | | **188,692,158** | **179,655,005** |
| **TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU** | | **2,924,176,928** | **2,767,699,300** |
```

**All three numbers (2,924,176,928 / 2,735,484,770 / 188,692,158) exactly match the numbers the dev's OWN synthetic unit-test fixture asserts as "correct"** (per the FIX-BCTC-BANK-BS-SECTION-CLASSIFIER review note). The refine agent transcribed this document perfectly. **Layer (a) is exonerated.**

### Correction to a prior brief

`docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md` §2 concluded *"the bank-form grand-total 'Tổng tài sản' row is missing from `bctc_table_rows` for BOTH CTG and VCB … never emitted a recognizable 'Tổng tài sản' table row for either ticker"*. That probe queried `bctc_table_rows` (post-parse) and `bctc_md_tables`, and never queried `bctc_refined_units.markdown` (pre-parse) directly — a methodology gap. This SPIKE closes it: **the row exists pre-parse, correctly labeled and valued; the parser destroys it.** `bctcRowRepair.ts`'s header comment (lines 30-32, "Does NOT fix the separately-diagnosed missing 'Tổng tài sản' grand-total row … there is no row to repair") repeats this now-disproven claim and should be corrected in the same commit as FIX-A below.

## 3. Root cause #1 (dominant) — `refinedMarkdownParser.ts` 4-column branch hardcodes column ORDER

`parseRefinedMarkdown` (lines 419-426):
```ts
} else {
  // 4+ columns: code, label, value_current, value_prior
  const firstCell = rawCells[0]!.trim();
  code = firstCell || null;
  labelRaw = rawCells[1]!;
  ...
```
This assumes cell[0]=code, cell[1]=label — the CORPORATE VAS convention ("Mã số | Chỉ tiêu | …"). CTG's real bank-form table header (Mẫu B02a/TCTDHN) is **`| Mục (Item) | Mã (Code) | Năm 2026 | Năm 2025 |`** — **label first, code second** — the parser never reads the header row's actual cell order; it is purely positional.

Consequence, traced row-by-row against the real markdown:
- Blank-Mã rows (every section header, sub-total, and BOTH grand totals — `**A. TÀI SẢN**`, `**TỔNG TÀI SẢN CÓ**`, `**TỔNG NỢ PHẢI TRẢ**`, `**VIII. Vốn chủ sở hữu**`): `labelRaw = rawCells[1] = ""` (the real, blank Mã cell) → `label === ""` → **row unconditionally dropped** by the "empty label after flag stripping" guard (line 443-446), **with no error emitted for this specific case** (the guard only pushes an error for unparseable *values*, not empty labels here — actually it does push `errors.push(...)` at line 444, but `finalizeBctcRefineTool.ts` only logs the first 5 and treats parser errors as non-fatal `logger.warn`).
- Populated-Mã rows (leaf items, e.g. `| I. Các khoản nợ Chính phủ và NHNN | 7 | 244,904,306 | 144,592,357 |`): `code = "I. Các khoản nợ Chính phủ và NHNN"`, `label = "7"` — **code and label silently swapped**, surviving into the DB as corrupted data. This is the generalized shape of the `code` anomalies found in §1 (full descriptive strings in `code`, short numeric strings in `label`).

This single positional assumption explains: (i) why unit-0002 contributes **0 of its 34 real rows** (every row is a blank-Mã row on the assets side), (ii) why unit-0003's two grand totals + equity subtotal are dropped, (iii) the qa-flagged page-45 equity-movement misalignment (`### 13.1 Báo cáo tình hình thay đổi vốn chủ sở hữu`, header `| Mục | Số dư đầu năm | Phát sinh trong năm | | Số dư cuối kỳ |` — same label-first shape, PLUS a 5-real-column table where the fixed "4+ cols: use first 4" logic (comment at line 391) additionally **truncates the 5th column** ("Số dư cuối kỳ" / closing balance) entirely).

**This is a generic defect, not CTG-specific**: the synthetic 13/13 test suite passed because its hand-built fixture used the code-first convention (matching VCB's actual transcription, per its own docblock admission quoted by qa: *"the real transcribed markdown text is not reproduced verbatim"*). Any bank ticker whose refine agent emits the `Mục (Item) | Mã (Code)` (label-first) header order will hit this exact bug.

## 4. Root cause #2 — `isBankFormFromRows` exact-anchor regex has zero tolerance for markdown emphasis

`bctcFormType.ts` line 76: `ROMAN_SECTION = /^(XIII|…|I)(\.\d+)?$|^[AB]$/` — requires the **entire** `code` string to equal a bare Roman numeral/letter. CTG's own income-statement unit (pages 8-9, unaffected by root cause #1's column order since that table is code-first) stores its section codes as **`**I**`, `**II**` … `**XV**`** (bold-wrapped — the refine agent's convention for marking summary/header rows). `**I**` does not match `^I$`. Empirically replayed: **0/451 real codes match `ROMAN_SECTION`, 0/451 match `CORP_BALANCE`** → `isBankFormFromRows` returns `hasRomanOrSection(false) && !hasCorpBalance(true)` = **false** → CTG's real bank-form row set is classified **CORPORATE**.

This is independently fatal even in a hypothetical world where root cause #1 is fixed: real agent-refined markdown legitimately bolds section/summary codes, and the classifier's positive signal can never fire against bolded text. Confirmed via `bctcScalarAggregator.ts` line 725 (`const isBankPath = isBankFormFromRows(rows)`) — with `isBankPath=false`, every income/balance scalar lookup (`findByCode(rows,"10")`, `findTotalAssetsCorporate` via codes 270/280/440, etc.) targets VAS 3-digit corporate codes that **do not exist anywhere** in this bank-form row set → every scalar resolves `null` → **exactly** reproduces the qa-observed log line `"scalar backfill: no non-null scalars found"` (ALL scalars null, not just total_assets).

## 5. Root cause #3 (compounding, section-tagging) — bank canonical BS title has zero `detectSection` coverage, plus a false-positive ToC keyword match

Empirically replayed `detectSection` (`refinedMarkdownParser.ts` lines 54-127) against the real titles:
```
unit-0002 title "… BÁO CÁO TÌNH HÌNH TÀI CHÍNH HỢP NHẤT (Tiếp theo)" → detectSection = "general"
unit-0001 ToC bullet "- Báo cáo lưu chuyển tiền tệ hợp nhất"          → detectSection = "cash_flow"  (FALSE POSITIVE)
unit-0001 ToC bullet "- Báo cáo tình hình tài chính hợp nhất" (=BS)   → detectSection = "general"
```
`SECTION_HEADERS`/`FOLDED_SECTION_KEYWORDS` only recognize the CORPORATE VAS title `BẢNG CÂN ĐỐI KẾ TOÁN` — the bank-form (Mẫu B02a/TCTDHN) canonical title **`BÁO CÁO TÌNH HÌNH TÀI CHÍNH`** ("Statement of Financial Position") is never in the vocabulary. Separately, unit-0001 is CTG's table-of-contents page (`MỤC LỤC`); its bullet "Báo cáo lưu chuyển tiền tệ hợp nhất" folds to a string containing the substring `"LUU CHUYEN TIEN TE"`, which false-positively fires the cash_flow keyword match.

Interaction with the RC-3 fix already shipped (commit 2c7fb5b0, `carrySection`/`initialSection` threading): **before that fix, every unit independently defaulted to `initialSection="general"`**, so the ToC's false "cash_flow" detection would NOT have propagated past unit-0001. The carry-forward mechanism (correctly designed to solve its own targeted case — a continuation page with no title line) has the **side effect of propagating this pre-existing false positive into every downstream unit**, including unit-0002/0003. Net effect: even if root cause #1 is fixed so the grand-total row's `label` is correctly populated, its `statement_section` would land as `"cash_flow"` (or, absent the ToC bug, `"general"` — the vocabulary gap alone still applies). `bctcScalarAggregator.ts`'s bank fallback for total_assets only tries `findByLabelExcluding(rows, "balance_sheet", …)` then `findByLabelExcluding(rows, "general", …)` (lines 825-827) — **`"cash_flow"` is never attempted**, so the row would still not be found even after RC #1 is fixed, unless RC #3 is also fixed.

## 6. Why W2 (`bctcRowRepair.ts`, commit 2cd9e105) cannot recover these rows

W2's `repairRow` only processes rows already present in the `rows` array with `code===null && value_current===null && value_prior===null` (a DIFFERENT corruption signature: label+numbers merged into one un-split cell). The grand-total/section-header rows in this SPIKE are `continue`'d out of the array **inside the per-line loop, before `repairCorruptedRows` ever runs** (empty-label guard, §3) — there is no row object left for W2 to touch. W2 is a real, correct fix for its own targeted signature (and plausibly explains the 440→451 row-count improvement qa observed) but is structurally incapable of fixing this defect class.

## 7. Fix design — split by layer

| # | Layer | File | Fix | Risk |
|---|---|---|---|---|
| **FIX-A** | application (parser) | `refinedMarkdownParser.ts` (4-cell/5+-cell branch, lines 386-426) | Stop assuming positional order. Capture the header row's own cell text (already segmented, just discarded today) once per unit and build an explicit column→field map by matching header cell text against `/mã|code/i` vs `/mục|chỉ\s*tiêu|item/i`; fall back to today's code-first default when the header is absent/ambiguous (0-diff for VCB/FPT). Also stop truncating at 4 cells — carry through all columns declared by the header (fixes the page-45 "Số dư cuối kỳ" 5th-column loss too). | HIGH value, MEDIUM risk — touches the parser's core row-shape branch; needs the mandatory real-fixture regression (FIX-C) before merge. |
| **FIX-B** | domain (classifier) | `bctcFormType.ts` `isBankFormFromRows` | Strip markdown emphasis markers (`**`, `__`, leading/trailing `*`) from each `code` before testing `ROMAN_SECTION`/`CORP_BALANCE`. Small, surgical, cannot introduce new false positives (VAS 3-digit codes never carry bold markup either). | LOW risk. |
| **FIX-C** | test/process | new `.test.ts` (extends or supersedes `FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.test.ts`) | Add a fixture built from **verbatim `bctc_refined_units.markdown` captured live via `get_bctc_refined(96e36139…)`** for unit-0002 (pages 4-5), unit-0003 (page 6), and unit-0038 (page 45) — not hand-written. Assert `total_assets=2924176928`, `total_liabilities=2735484770`, `equity_total=188692158`, `balanceViolation=null`, AND that no row is silently dropped (row-count parity check between raw pipe-rows in the markdown and parsed output). This is the single highest-leverage process fix: 2 of the last 2 DoD cycles failed specifically because synthetic fixtures diverged from the real document (recurring-bug bar). | Must land in the SAME PR as FIX-A/FIX-B — it is the regression gate, not optional follow-up. |
| **FIX-D** | detectSection vocabulary | `refinedMarkdownParser.ts` `SECTION_HEADERS`/`FOLDED_SECTION_KEYWORDS` | Add the bank-form canonical BS title (`BÁO CÁO TÌNH HÌNH TÀI CHÍNH`, folded `BAO CAO TINH HINH TAI CHINH`) → `balance_sheet`. Separately, tighten the ToC false-positive: table-of-contents lines are typically markdown bullets (`- …`) or appear before the first real pipe-table — cheapest fix is to require the folded keyword match to NOT be inside a `-`/`*`-prefixed bullet line, or simply to require the match to be the FIRST non-blank text of a title-style line (`#`/`##`) rather than a substring-anywhere match. Needs its own fixture (unit-0001 ToC + unit-0002 title) asserting `finalSection` stays correct end-to-end. | MEDIUM risk — shared code with the already-shipped RC-3 carry-forward mechanism; verify interaction explicitly (§5). |
| **FIX-E** (doc only) | — | `bctcRowRepair.ts` header comment (lines 10-16, 30-32) + cross-reference in `2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md` | Correct the now-disproven "row absent from source markdown" claim (§2) so future agents don't re-trust it. | Trivial, no code risk. |

**Sequencing:** FIX-A and FIX-D are both prerequisites for total_assets to resolve (§5's aggregator section-fallback argument) — they must ship together with FIX-C's real-data regression gate. FIX-B is independent and can ship in parallel (fixes the classifier regardless, needed for ANY bank ticker with bold-wrapped section codes, not just CTG). FIX-E is a same-PR doc cleanup.

## 8. Recommended follow-on tasks

1. **`FIX-BCTC-BANK-BS-COLUMN-ORDER`** — type FIX, zone `apps/mcp-server/`, next_agent `dev-mcp-server`. Scope: FIX-A + FIX-D + FIX-C (real-markdown regression fixture) as ONE unit — they are interdependent per §5/§7 sequencing; splitting them risks a partial fix that still fails the behavioral DoD (the same trap that produced 2 prior failed cycles). **This supersedes/re-scopes `FIX-BCTC-BANK-BS-SECTION-CLASSIFIER`** — that row's title ("balance-sheet section classifier drops/mistags rows") undersold the actual defect (it's a column-order + section-vocabulary bug, not primarily a classifier bug); recommend PM close it as superseded-by this new row, carrying forward its `qa_verdict=APPROVE-CODE` history as prior-art context (the 3 RC fixes it shipped are real and should NOT be reverted — they fix genuinely distinct cases and are non-regressions).
2. **`FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP`** — type FIX, zone `apps/mcp-server/`, next_agent `dev-mcp-server`, size S. Scope: FIX-B only. Independent, low-risk, can ship immediately without waiting on #1.
3. Fold FIX-E (doc correction) into #1's PR as a same-commit doc diff — no separate task needed.
4. **`FIX-BCTC-BANK-SUMMARY-MAPPING`** (existing BACKLOG stub) — recommend PO/PM mark **STALE/SUPERSEDED**: its own cold-storage detail already routes through the 2026-07-01 SPIKE's W1-W5 decomposition (W1-W4 largely shipped across prior sprints), and its remaining open scope (the CTG total_assets=0 defect) is now fully owned by follow-on #1 above with a concrete, verified root cause — no new BA/architect SPIKE cycle needed on that stub.
5. Do NOT re-open `FIX-BCTC-BANK-BS-SECTION-CLASSIFIER` for a 4th narrow classifier-only patch — that is the exact anti-pattern this SPIKE was commissioned to stop (recurring-bug bar, 2nd DoD-cycle failure).

## 9. What this SPIKE did NOT need (no unreachable-data gap)

All evidence above came from the live named-volume `market.db` via direct HTTP JSON-RPC (`get_bctc_refined`, `finalize_bctc_refine` history) and `GET /api/bctc-inspect/*` — no data was unreachable within the 120-minute timebox. `bctc_balance_checks` returned `null` for this report_id (table not populated for agentic-refine-path reports) — flagged as a minor observability gap, not blocking this SPIKE's conclusions.

## 10. Standard Detection

SPIKE / recon, not a build — **BUILD-STANDARD: not-applicable**.

## Decision Journal
See `docs/agent-memory/decisions/sprint-SPIKE-BCTC-CTG-BS-REALDATA-ROOT-architect.md`.
