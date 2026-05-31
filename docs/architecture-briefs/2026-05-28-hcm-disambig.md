<!-- size-justification: 175L — single-sprint brief, lean by design per TASKS; REQ linked for AC detail, not re-listed -->

# Architecture Brief — HCM-DISAMBIG

**Date:** 2026-05-28
**Architect:** architect
**Sprint:** HCM-DISAMBIG (PO commit `4b0608cd`)
**Zone split:** D1 `dev-mcp-server` | D2 prompt-only (no agent spawn for D2)
**Refs:** `docs/REQ_HCM-DISAMBIG.md` (24 ACs — load for AC detail, not re-listed here)

---

## 1. Brownfield Scan

### 1.1 Zone R-1 Confirmation — apps/news-fetch/ has NO parallel extractor

`apps/news-fetch/` is a pure scraper + ingest service (Reuters/Bloomberg RSS). Its composition root (`composition-root.ts`) wires only `composeNewsIngest` — no `normalizeNews`, no `extractStockTickers`, no `GEOGRAPHIC_CONTEXT_MAP`, no `affectedActions` surface. Zero occurrences found in all `.ts` files under `apps/news-fetch/src/`.

**D1 zone is `apps/mcp-server/` exclusively. Risk R-1 is CLOSED.**

### 1.2 Extraction code paths confirmed

`apps/mcp-server/src/domain/services/newsNormalizer.ts:547` — `GEOGRAPHIC_CONTEXT_MAP` contains 9 HCM entries. The guard runs inside `extractStockTickers()` Pattern 2 look-behind (lines 621–629):

```
lookBehindStart = Math.max(0, matchStart - 10)
lookBehindWindow = text.slice(lookBehindStart, matchStart + code.length).toLowerCase()
```

Pattern 1 (parenthetical) bypasses this guard by design — `(HCM)` always means the ticker.

### 1.3 Chef.md insertion point confirmed

`docs/agents/unified-agent/flow/chef.md:184–191` — the "Format rules" block ends at line 191 with `"NO bullet-point ticker dumps. Every MARKET message is narrative prose."` Line 193 opens `**Send:**`. Insertion point is line 192 (between line 191 and `**Send:**`).

### 1.4 Test glob confirmed

`apps/mcp-server/bunfig.toml` `[test]` section sets `root = "./src"` with no explicit include pattern. Bun's default test discovery picks up all `*.test.ts` files under `root`. A file named `HCM-DISAMBIG-1234.test.ts` placed in `apps/mcp-server/src/__tests__/` is automatically discovered. Per AC-QA-05 and `feedback_fence_false_green`: QA MUST inject a deliberate failing assertion before confirming green pickup.

---

## 2. Architectural Decisions

### D1: Zone split

D1 (extraction) lives entirely in `dev-mcp-server`. `apps/news-fetch/` has no geographic extraction; no changes there. DDD layer: `domain/services/newsNormalizer.ts` — pure business rule, zero infrastructure imports, correct placement.

### D2: Extraction-vs-narrative boundary — independent and parallelizable

D1 (`newsNormalizer.ts` + test file) and D2 (`chef.md` prompt edit) share zero file overlap. They are parallelizable. D2 requires no TS code, no rebuild, no ops step — it is a prompt-only markdown edit. PM MUST dispatch D1 and D2 as separate parallel handoffs. OPS (force-recreate) comes after D1 merges; QA live verification comes after both D2 and OPS.

### D3: R-5 — tp. window arithmetic decision

The look-behind window is `text[matchStart - 10 .. matchStart + 3]` (lowercased).

| Input surface | Chars before `HCM` | Window contains | `"tp."` fires? | `"tp-hcm"` fires? |
|---|---|---|---|---|
| `TP.HCM` | `TP.` (3 chars) | `tp.hcm` | YES | n/a |
| `TP. HCM` | `TP. ` (4 chars) | `tp. hcm` | YES (`"tp."` is substring) | n/a |
| `TP HCM` | `TP ` (3 chars) | `tp hcm` | via `"tp "` | n/a |
| `TP-HCM` | `TP-` (3 chars) | `tp-hcm` | NO — genuine gap | YES (new entry) |
| `TPHCM` | `TPHCM` (5-char token) | entire token is `tphcm` | via `"tphcm"` | n/a |

**Decision:** `"tp."` alone already covers `TP. HCM` via substring match. However, the AC-D1-02 headline `"Giá vàng tại TP. HCM hôm nay"` puts `"TP. HCM"` mid-sentence. The window covers `matchStart - 10` chars before `HCM`, which includes `"tại TP. "` — `"tp."` IS present. Coverage is confirmed.

**Add `"tp. hcm"` explicitly anyway** (belt-and-suspenders, self-documenting intent, mirrors existing `"tp.hcm"` and `"tp hcm"` pattern symmetry). Window length stays at 10 chars per NFR-1 — no change needed.

**The only genuine code gap is `"tp-hcm"`.** Add exactly two entries: `"tp-hcm"` and `"tp. hcm"`.

### D4: Positive disambiguation rule shape

**Decision: extend `GEOGRAPHIC_CONTEXT_MAP` (suppress-only) — do NOT introduce a separate `STOCK_CONTEXT_MAP`.**

Rationale:
- The positive cases (AC-D1-05, AC-D1-08, AC-D1-09, AC-D1-14, AC-D1-15) are already handled correctly by the existing code path: Pattern 2 fires when no geographic prefix is in the 10-char look-behind window. Stock-context tokens (`"cổ phiếu"`, `"mã"`, `"khớp lệnh"`) appear AFTER the ticker — they do not appear in the 10-char look-behind before `HCM`, so no suppression fires.
- A separate `STOCK_CONTEXT_MAP` (positive boost) would add code complexity and a new pass over the text for zero marginal benefit: the existing suppress-only logic already yields the correct result for all 15 D1 ACs.
- Simpler wins. DDD golden rule: domain code should encode only what is necessary.
- AC-D1-13 (same-headline over-block) is already safe: the second `HCM` in `"...nhưng HCM hôm nay tăng 1.5%"` has `"hôm nay "` in its look-behind, not a geographic prefix.

---

## 3. Files to Create / Modify

| Zone | File | Action | Layer |
|---|---|---|---|
| D1 | `apps/mcp-server/src/domain/services/newsNormalizer.ts` | Add `"tp. hcm"` and `"tp-hcm"` to `GEOGRAPHIC_CONTEXT_MAP["HCM"]` | Domain |
| D3 | `apps/mcp-server/src/__tests__/HCM-DISAMBIG-<taskid>.test.ts` | Create new test file covering AC-D1-01 through AC-D1-15 | Application |
| D2 | `docs/agents/unified-agent/flow/chef.md` | Insert Block A disambiguation rule at line 192 (after "NO bullet-point ticker dumps", before `**Send:**`) | Interface |

No schema change. No new service. No `docker-compose.yml` change. No `stockAliases.ts` change (alias path confirmed safe).

---

## 4. D2 Prompt Rule — Exact Insertion

Insert the following line as the last bullet in the "Format rules" block (after `"NO bullet-point ticker dumps"` bullet, before `**Send:**`):

```
- Khi nhắc đến cổ phiếu HCM, lần đầu tiên trong tin phải viết `HCM (cổ phiếu)` hoặc `HCM (mã CK)` để phân biệt với thành phố; khi nhắc đến thành phố luôn dùng `TP. HCM`.
```

Plain Vietnamese per `feedback_market_report_plain_vietnamese`. No jargon.

---

## 5. Test File Spec

File: `apps/mcp-server/src/__tests__/HCM-DISAMBIG-<taskid>.test.ts`

- Import `normalizeNews` from `../domain/services/newsNormalizer.js`
- Import `detectStocksInText` from `../domain/services/stockAliases.js`
- Use `makeItem()` factory matching `1788-hcm-geographic-false-positive.test.ts` pattern (same `RssItem` shape)
- Cover all 15 AC-D1-* cases
- Include AC-REG-1 smoke check (re-import `1788` cases inline or cross-reference — do NOT modify `1788-hcm-geographic-false-positive.test.ts`)
- Fence-false-green gate (AC-QA-05): dev MUST inject one deliberate `expect(true).toBe(false)`, run `bun test`, confirm non-zero exit, then remove it before final commit

---

## 6. OPS Step

After D1 merges to main: ops force-recreate mcp-server (named-volume safe). Per `project_mcp_server_write_wedge` — restart is NOT sufficient; image must be rebuilt. Per AC-QA-06: QA verifies post-rebuild signal file `fetched_at` timestamp and `affected_stocks` correctness.

---

## 7. Risks

| Risk | Status | Mitigation |
|---|---|---|
| R-1 Over-block from parallel extractor in news-fetch | CLOSED | Brownfield scan: zero geographic extraction in news-fetch |
| R-2 Alias path bypass | CLOSED (from REQ) | stockAliases.ts aliases contain no city abbreviation |
| R-3 mcp-server write-wedge | OPEN → QA | AC-QA-06 mandates post-rebuild signal file timestamp check |
| R-4 Fence false-green | OPEN → QA | AC-QA-05 mandates deliberate-fail injection before green sign-off |
| R-5 TP. HCM partial coverage | CLOSED | Window arithmetic confirms `"tp."` covers dot-space; `"tp. hcm"` added as belt-and-suspenders; `"tp-hcm"` added for genuine gap |

---

DONE: arch brief written, zone-split confirmed (D1 = dev-mcp-server only; news-fetch has zero parallel extractor), extraction-vs-narrative boundary documented (D1 and D2 are independent and parallelizable), R-5 decision: 10-char window already covers TP. HCM via "tp." substring — add "tp. hcm" (belt-and-suspenders) + "tp-hcm" (genuine gap), R-rule-shape decision: extend GEOGRAPHIC_CONTEXT_MAP suppress-only — no STOCK_CONTEXT_MAP needed (positive cases already work without a boost pass)
NEXT: pm | atomize into per-zone handoffs (D1, D2 parallel; OPS after D1; QA after D2+OPS)
HANDOFF: docs/architecture-briefs/2026-05-28-hcm-disambig.md
PIPELINE: continue
