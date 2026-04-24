# TECH-135: fix(france-msg-quality) — Omit Empty Sections + Fix Vietnamese Diacritics

status: APPROVED_BY_ARCHITECT
req_ref: REQ-135

---

## Brownfield Impact

- Files modified: `src/scheduler/franceSummaryJob.ts` (function body only — `formatFranceSummaryVI`, `severityLabel`, `rsiLabel`, `ma20Label`)
- Files created: `src/__tests__/1383-france-summary-message-quality.test.ts`
- Files deleted: none
- Breaking changes: no — function signature unchanged, observable output narrows (removes filler lines; callers only read `sent`/counts, not message content)

---

## Architecture Decision

`formatFranceSummaryVI` is a pure string-building function with zero DB/network side effects, living in the interface/scheduler layer. The fix is entirely local to that function and its three private helpers (`severityLabel`, `rsiLabel`, `ma20Label`). No new abstraction layers, no new interfaces, no domain changes — this is a string-literal and control-flow correction inside an already-isolated unit. The existing injectable-dependency design already makes the formatter fully testable without a DB.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `formatFranceSummaryVI` | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `severityLabel` | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `rsiLabel` | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `ma20Label` | interface/scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| TDD test | test | `src/__tests__/1383-france-summary-message-quality.test.ts` | NEW |

---

## Interface Contracts

No interface changes. `formatFranceSummaryVI` signature is unchanged:

```typescript
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[] | number,  // legacy number overload preserved
): string
```

### Behaviour contract change (FR-1)

Old: every section always emits a header or a filler line — output always has three sections.

New: a section is emitted only when its data array is non-empty. The blank-line separator between sections must follow the rule: one `""` between consecutive present sections, no trailing `""` after the last section.

Correct separator logic — build present sections as blocks, join with `"\n\n"`:

```typescript
const header = `Bản tin sáng Pháp — Thị trường VN (${dateStr})`
const blocks: string[] = []

if (movers.length > 0) {
  // ... build moversBlock lines[]
  blocks.push(moversBlock.join("\n"))
}
if (alerts.length > 0) {
  // ... build alertsBlock lines[]
  blocks.push(alertsBlock.join("\n"))
}
if (signals.length > 0) {
  // ... build taBlock lines[]
  blocks.push(taBlock.join("\n"))
}

return header + "\n\n" + blocks.join("\n\n")
```

This pattern guarantees: no trailing blank line (T16), exactly one blank line between sections, no filler when empty.

### Diacritics replacement map (FR-2)

| Location | Old literal | New literal |
|---|---|---|
| `formatFranceSummaryVI` header | `Ban tin sang Phap` | `Bản tin sáng Pháp` |
| `formatFranceSummaryVI` header | `Thi truong VN` | `Thị trường VN` |
| movers section header | `Top bien dong gia` | `Top biến động giá` |
| movers row currency suffix | `dong` | `đồng` |
| alerts section header | `Canh bao gan nhat` | `Cảnh báo gần nhất` |
| TA section header | `Tin hieu ky thuat` | `Tín hiệu kỹ thuật` |
| `severityLabel("critical")` | `NGHIEM TRONG` | `NGHIÊM TRỌNG` |
| `severityLabel("warning")` | `CANH BAO` | `CẢNH BÁO` |
| `severityLabel("info")` | `THONG TIN` | `THÔNG TIN` |
| `rsiLabel("overbought")` | `qua mua` | `quá mua` |
| `rsiLabel("oversold")` | `qua ban` | `quá bán` |
| `ma20Label("above")` | `gia tren MA20` | `giá trên MA20` |
| `ma20Label("below")` | `gia duoi MA20` | `giá dưới MA20` |

### Preserved invariants

- Legacy `taSignals: number` overload: `Array.isArray(taSignals) ? taSignals : []` guard stays.
- `severityLabel` default branch: `s.toUpperCase()` stays (ASCII-safe unknown severity).
- `vi-VN` locale for price formatting: unchanged.
- `runFranceSummary` silent-skip guard (all-empty → no send): unchanged.

---

## Task Breakdown

| Task | Title | Depends on |
|---|---|---|
| 1383 | test(france-msg-quality): write `1383-france-summary-message-quality.test.ts` — all RED | — |
| 1384 | fix(france-msg-quality): implement FR-1 + FR-2 in `franceSummaryJob.ts` | 1383 merged |

### Test cases required (T1–T16 per REQ-135 FR-3)

| # | Scenario | Key assertion |
|---|---|---|
| T1 | movers=0, alerts=2, ta=0 | alerts section present; no "Khong co" |
| T2 | movers=3, alerts=0, ta=0 | movers section present; no "Khong co" |
| T3 | movers=0, alerts=0, ta=2 | TA section present; no "Khong co" |
| T4 | movers=2, alerts=2, ta=2 | all three sections present; no "Khong co" |
| T5 | header | contains `Bản tin sáng Pháp` |
| T6 | movers header | contains `Top biến động giá` |
| T7 | alerts header | contains `Cảnh báo gần nhất` |
| T8 | TA header | contains `Tín hiệu kỹ thuật` |
| T9 | rsiLabel overbought | contains `quá mua` |
| T10 | rsiLabel oversold | contains `quá bán` |
| T11 | ma20Label above | contains `giá trên MA20` |
| T12 | ma20Label below | contains `giá dưới MA20` |
| T13 | severityLabel critical | contains `NGHIÊM TRỌNG` |
| T14 | severityLabel warning | contains `CẢNH BÁO` |
| T15 | severityLabel info | contains `THÔNG TIN` |
| T16 | no trailing blank line | message does not end with `\n\n` |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Separator regression — double blank line between sections | Low | Medium | T16 explicitly asserts no trailing `\n\n`; test with single-section case |
| `Thi truong VN` missed in header (compound literal) | Low | Low | T5 asserts full `Bản tin sáng Pháp — Thị trường VN` substring |
| Currency suffix `dong` missed in movers row | Low | Low | T6 movers section fixture — assert `đồng` in output |
| Legacy number overload broken | Low | High | Existing test suite covers `taCount` path; preserve guard line |

---

## Security Review

- SQL parameterized? Yes — no SQL changes in this task
- File paths validated? N/A — pure string manipulation
- External HTTP rate-limited? N/A — no network calls
- Secrets via Bun.env only? N/A — no env access
