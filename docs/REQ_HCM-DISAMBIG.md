<!-- size-justification: 210L — single-sprint REQ doc, atomic AC table + DDD layer mapping + audit findings + gap analysis; cannot split without losing traceability between sprint goal and implementation contract -->

# REQ HCM-DISAMBIG — Harden HCM Ticker vs TP.HCM City Disambiguation

**Sprint:** HCM-DISAMBIG
**PO commit:** `4b0608cd`
**BA author:** ba-agent
**Date:** 2026-05-28
**Status:** READY FOR ARCHITECT
**Handoff target:** `docs/architecture-briefs/2026-05-28-hcm-disambig.md`

---

## 1. Landscape Audit Findings

### 1.1 GEOGRAPHIC_CONTEXT_MAP — Current Coverage

File: `apps/mcp-server/src/domain/services/newsNormalizer.ts:547`

The guard is a Map keyed by ticker. For `"HCM"` the current value is:

```
"tp.hcm", "tp hcm", "tphcm",
"tp.", "tp ",
"thành phố hồ chí minh", "thanh pho ho chi minh",
"thành phố hcm", "thanh pho hcm"
```

The look-behind window is **10 chars** read from `(matchStart - 10)` to `(matchStart + code.length)` then `.toLowerCase()`. Mixed-case variants (`Tp.HCM`, `Tp HCM`, `TpHCM`) are therefore already handled — the window is lowercased before comparison.

**Gaps identified:**

| Surface form | Status | Reason |
|---|---|---|
| `TP. HCM` (dot + space) | **MISSING** | `"tp. hcm"` not in map; `"tp."` fires but only if the 10-char window contains it contiguously before match start — with the space variant the window is `"tp. hcm"` not `"tp.hcm"` |
| `TP-HCM` (hyphen) | **MISSING** | `"tp-hcm"` not in map |
| `TPHCM-Phuket` compound | **SAFE (proven)** | Regex `\b([A-Za-z]{2,5})\b` matches `TPHCM` (5-char token) and `Phuket` as separate tokens; `HCM` is NOT split out of `TPHCM` as a standalone token. Signal #4144 confirms: `affected_stocks: ["HVN"]` only, zero HCM emission. A regression test is still REQUIRED to lock this in. |
| `tp. ` (with space after dot) | **PARTIAL** | `"tp."` covers `"TP.HCM"` but the `.toLowerCase()` window for `"TP. HCM"` is `"...tp. hcm"` — `"tp."` IS present, so the guard fires. **Covered by `"tp."`.** Verify with test. |
| `hồ chí minh` bare (no `tp` prefix) | **INTENTIONALLY OUT** | Adding bare `"ho chi minh"` would collide with `"chứng khoán hồ chí minh"` company alias; alias path (Pattern 3) wins legitimately. Do not add. |

**Net gap: 2 missing prefixes — `"tp. hcm"` and `"tp-hcm"`.**

### 1.2 HCM Aliases — Pattern 3 Safety Audit

File: `apps/mcp-server/src/domain/services/stockAliases.ts:514–517`

```
HCM: { aliases: ["chung khoan ho chi minh", "hcm securities"] }
```

Neither alias contains a city abbreviation pattern. The `detectStocksInText()` call in Pattern 3 uses `isWordBoundaryMatch()` which is purely substring-based on normalised text. There is **no city-collision risk on the alias path** — Risk R-2 is CLEAN.

### 1.3 Existing Test Suite — Task 1788

File: `apps/mcp-server/src/__tests__/1788-hcm-geographic-false-positive.test.ts`

10 cases (AC-1 through AC-10). Covers: `TP.HCM`, `TP HCM`, `Hồ Chí Minh` (full), parenthetical positive, alias positive (`chứng khoán hồ chí minh`), alias positive (`hcm securities`), `detectStocksInText` negative path, and multi-occurrence. **Must stay 100% green.** Zero regressions permitted.

### 1.4 Production Proof — Signal #4144

File: `docs/signals/news_impact_4144_hvn_expansion.json`

Headline: `"Vietnam Airlines TPHCM-Phuket strategic expansion"`
`affected_stocks: ["HVN"]` — HCM correctly absent. Confirms `TPHCM` compound token already suppressed. The MISSING gap is `TP-HCM` (hyphen, separate tokens) and `TP. HCM` (dot-space) — neither appears in signal #4144 but are real headline patterns.

### 1.5 Chef.md Block A — Current Format Rules

File: `docs/agents/unified-agent/flow/chef.md:184–191`

Current rules end at "NO bullet-point ticker dumps." No HCM disambiguation rule exists. The target insertion point is after the existing last rule, before `**Send:**`.

---

## 2. Scope Summary (from Sprint Goal)

**D1 Zone — Extraction hardening** (`apps/mcp-server/src/domain/services/newsNormalizer.ts`)
- Extend `GEOGRAPHIC_CONTEXT_MAP` with 2 missing entries
- Add stock-context positive-disambiguation rule (additive, not blanket suppression)

**D2 Zone — Chef narrative rule** (`docs/agents/unified-agent/flow/chef.md`)
- Add Block A format rule for HCM ticker vs city disambiguation

**D3 Zone — Test coverage** (`apps/mcp-server/src/__tests__/HCM-DISAMBIG-*.test.ts`)
- New test file covering the 9 sprint-goal cases + 6 net-new edge cases below

---

## 3. Acceptance Criteria

### AC Table — Extraction Layer (D1)

| ID | Headline / Input | Expected `affectedActions` | DDD Layer | Notes |
|---|---|---|---|---|
| AC-D1-01 | `"Vietnam Airlines TPHCM-Phuket strategic expansion"` | MUST NOT contain `HCM` | Domain | Regression guard — #4144 exact replay |
| AC-D1-02 | `"Giá vàng tại TP. HCM hôm nay"` | MUST NOT contain `HCM` | Domain | Dot-space variant — gap #1 |
| AC-D1-03 | `"Tp.HCM mở rộng metro line 3"` | MUST NOT contain `HCM` | Domain | Mixed-case — covered by toLowerCase |
| AC-D1-04 | `"TP-HCM họp về quy hoạch"` | MUST NOT contain `HCM` | Domain | Hyphen variant — gap #2 |
| AC-D1-05 | `"Cổ phiếu HCM đóng cửa tăng 2%"` | MUST contain `HCM` | Domain | Stock-context positive — "cổ phiếu" token |
| AC-D1-06 | `"HCM (mã CK) công bố LNST quý 1"` | MUST contain `HCM` | Domain | Parenthetical positive (Pattern 1 fires) |
| AC-D1-07 | `"Chứng khoán Hồ Chí Minh báo lãi"` | MUST contain `HCM` | Domain | Alias positive — Task 1788 AC-6 regression guard |
| AC-D1-08 | `"Mua HCM, bán SSI"` | MUST contain `HCM` | Domain | Trailing comma — word boundary still clean |
| AC-D1-09 | `"Đề xuất mua HCM)"` | MUST contain `HCM` | Domain | Trailing paren — ticker inside sentence |
| AC-D1-10 | `"Chứng khoán HCM (HCM) báo lãi quý 1"` | MUST contain `HCM` | Domain | QA gate positive — over-block regression |
| AC-D1-11 | `"Hội nghị kinh tế TP. HCM năm 2026"` | MUST NOT contain `HCM` | Domain | Dot-space at start of phrase |
| AC-D1-12 | `"Dự án BĐS TP-HCM và khu vực lân cận"` | MUST NOT contain `HCM` | Domain | Hyphen compound, real-estate context |
| AC-D1-13 | `"HPG đặt nhà máy tại TP.HCM nhưng HCM hôm nay tăng 1.5%"` | MUST contain `HCM` (ticker second mention) | Domain | R-1 over-block guard — two tokens in same headline; look-behind on second `HCM` is `"hôm nay "` not geographic |
| AC-D1-14 | `"Mã HCM trên sàn HOSE tăng mạnh"` | MUST contain `HCM` | Domain | Stock-context positive — "mã" token |
| AC-D1-15 | `"khớp lệnh HCM cao bất thường"` | MUST contain `HCM` | Domain | Stock-context positive — "khớp lệnh" token |

### AC Table — Regression (must stay green)

| ID | Source test | Cases | Requirement |
|---|---|---|---|
| AC-REG-1 | `1788-hcm-geographic-false-positive.test.ts` AC-1 through AC-10 | 10 cases | ALL GREEN, zero delta |
| AC-REG-2 | Task 1198 VND currency guard | existing | GREEN |
| AC-REG-3 | Task 1206 false-match guards | existing | GREEN |
| AC-REG-4 | Task 1322 alias tests (VJC "viet jet") | existing | GREEN |

### AC Table — Chef Narrative (D2)

| ID | Rule | DDD Layer | Notes |
|---|---|---|---|
| AC-D2-01 | `docs/agents/unified-agent/flow/chef.md` Block A "Format rules" MUST contain an explicit line: when HCM ticker appears in a dish, first mention renders as `HCM (mã)` or `HCM (cổ phiếu)`; when the city appears, always render as `TP. HCM` | Interface | Prompt-only edit; no rebuild required |
| AC-D2-02 | The disambiguation line MUST appear within the "Format rules" list block, before the `**Send:**` directive | Interface | Placement constraint |
| AC-D2-03 | The rule text itself must use plain Vietnamese — no analyst jargon, per `feedback_market_report_plain_vietnamese` | Interface | Language constraint |

### AC Table — QA Gate (live verification)

| ID | Action | Pass criterion |
|---|---|---|
| AC-QA-01 | Inject exact string `"Vietnam Airlines TPHCM-Phuket strategic expansion"` through live `normalizeNews()` after mcp-server rebuild | `affectedActions` empty or `["HVN"]` — no `HCM` |
| AC-QA-02 | Inject `"Tp.HCM mở rộng metro line 3"` through live `normalizeNews()` | `affectedActions` does not contain `HCM` |
| AC-QA-03 | Inject `"TP-HCM họp về quy hoạch kinh tế"` through live `normalizeNews()` | `affectedActions` does not contain `HCM` |
| AC-QA-04 | Inject `"Chứng khoán HCM (HCM) báo lãi quý 1"` through live `normalizeNews()` | `affectedActions` contains `HCM` — over-block check |
| AC-QA-05 | Verify test file `HCM-DISAMBIG-*.test.ts` is picked up by `bun test` glob | Inject deliberate failing assertion to confirm test runner sees the file before confirming green (per `feedback_fence_false_green`) |
| AC-QA-06 | After ops force-recreate of mcp-server, read a fresh `docs/signals/news_impact_*.json` produced AFTER rebuild | File `fetched_at` timestamp is after rebuild; `affected_stocks` shows correct extraction (per `project_mcp_server_write_wedge`) |

---

## 4. Non-Functional Requirements

| ID | Requirement | DDD Layer |
|---|---|---|
| NFR-1 | Look-behind window stays at 10 chars (PO Day-0 constraint) | Domain |
| NFR-2 | HCM stays on watchlist — do NOT remove or suppress globally | Domain |
| NFR-3 | Extend existing `GEOGRAPHIC_CONTEXT_MAP` — no new city-blocklist module | Domain |
| NFR-4 | Chef.md change is prompt-only — no TS/Go code, no microservice rebuild for D2 | Interface |
| NFR-5 | Extraction code change requires ops force-recreate (not restart) of mcp-server | Infrastructure |
| NFR-6 | All work on `main` — no branches | Operations |
| NFR-7 | Commit messages follow `docs/policies/commit-convention.md` | Operations |
| NFR-8 | After fix: run `/graphify docs --update --no-viz` | Operations |
| NFR-9 | Test file name must match bun test runner glob (inject deliberate fail to prove pickup) | Application |

---

## 5. DDD Layer Mapping

| Requirement area | DDD Layer | File(s) |
|---|---|---|
| GEOGRAPHIC_CONTEXT_MAP extension | **Domain** | `apps/mcp-server/src/domain/services/newsNormalizer.ts` |
| Stock-context positive-disambiguation rule | **Domain** | `apps/mcp-server/src/domain/services/newsNormalizer.ts` |
| HCM alias safety (read-only, no change needed) | **Domain** | `apps/mcp-server/src/domain/services/stockAliases.ts` |
| Test suite | **Application** | `apps/mcp-server/src/__tests__/HCM-DISAMBIG-*.test.ts` |
| Chef Block A format rule | **Interface** | `docs/agents/unified-agent/flow/chef.md` |
| mcp-server force-recreate after code change | **Infrastructure** | ops rebuild step |
| QA live verification | **Application / Infrastructure** | QA agent post-rebuild |

---

## 6. Out of Scope (PO-locked)

- New microservice, MCP tool, cron, schema change, DB migration.
- `apps/news-fetch/` ingestion path changes (architect to confirm it delegates to `newsNormalizer.ts` only).
- Re-litigating Task 1788 design decisions.
- Modifying pre-existing signals on disk (including #4144).
- Per-ticker disambiguation map for tickers other than HCM.
- Block B / WORK channel narrative rewrites (TNB audit expects technical context; HCM ticker is already disambiguated by signal ID citation there).
- Bare `hồ chí minh` (no `tp` prefix) added to geographic guard — would collide with company alias path; intentionally excluded.

---

## 7. Blockers for PO

None. All Day-0 constraints documented. Alias path confirmed safe. Two pattern gaps identified and scoped.

---

## 8. Risks Carried Forward to Architect

| Risk | Mitigation in spec |
|---|---|
| R-1 Over-block (look-behind too wide) | Window fixed at 10 chars per NFR-1; AC-D1-13 guards against same-headline over-block |
| R-2 Alias path bypass | Confirmed safe in §1.2; no action required |
| R-3 mcp-server write-wedge | AC-QA-06 mandates post-rebuild signal file verification, not just container health check |
| R-4 Fence false-green | AC-QA-05 mandates deliberate-fail injection to prove test file pickup |
| R-5 `TP. HCM` partial coverage ambiguity | `"tp."` prefix in current map catches the dot, but `"tp. hcm"` (explicit) should be added as belt-and-suspenders per AC-D1-02; architect to confirm exact window arithmetic and decide whether `"tp."` alone is sufficient or explicit entry needed |

---

> Lazy-loaded by: architect before writing `docs/architecture-briefs/2026-05-28-hcm-disambig.md`; pm during task atomization.
