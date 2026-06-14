# BA Spec — KINHDICH-HOVER-DETAIL
**Task:** BA-KINHDICH-HOVER-DETAIL
**Sprint:** KINHDICH-HOVER-DETAIL
**BA:** ba · 2026-06-14
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS — HAND OFF TO DEVELOPER

---

## 1. Vision (PO, Vietnamese)

> Khi người dùng rê chuột lên tên một quẻ Kinh Dịch bất kỳ trên frontend, tooltip hiển thị nội dung tham chiếu "Tra cứu Kinh Dịch" của đúng quẻ đó — không chỉ một câu tóm tắt như hiện tại.

PO product decision (LOCKED — do not re-open): Option (a) richer tooltip — render `coreMeaning` + Trạng thái (`stateInterpretation`) + Thuận (`favorable`) + Cảnh báo (`warning`) + trend label (`marketTrendLabel`); OMIT `phases[]` table; KEEP "Xem chi tiết →" deep-link.

---

## 2. Functional Requirements

### FR-1 — Enrich tooltip content from QUE_DETAIL
**DDD layer: interface**
On hover, `QueName.tsx` renders the following fields from `QUE_DETAIL[hexagram]`:
1. Tên quẻ (already rendered — `name`, stays as heading)
2. Ý nghĩa cốt lõi: `coreMeaning` (replaces current `hoverSummary ?? coreMeaning` single line)
3. Trạng thái: `stateInterpretation` — preceded by label "Trạng thái:"
4. Thuận: `favorable` — preceded by label "Thuận:"
5. Cảnh báo: `warning` — preceded by label "Cảnh báo:"
6. Xu hướng thị trường: `marketTrendLabel` (already rendered — keep, position after warning)

All five text fields are Vietnamese prose already present in `QUE_DETAIL` — no translation work needed.

### FR-2 — Additional import: QUE_DETAIL
**DDD layer: interface**
`QueName.tsx` imports `QUE_DETAIL` from `~/lib/que-descriptions-detail.generated` alongside the existing `QUE_DESCRIPTIONS` import. Both imports coexist. `QUE_DESCRIPTIONS` is kept (existing callers may rely on it; the fallback path also uses it).

### FR-3 — Graceful fallback
**DDD layer: interface**
If `QUE_DETAIL[hexagram]` is undefined (no detail entry for that id), the component falls back to current behaviour: renders `desc.hoverSummary ?? desc.coreMeaning` from `QUE_DESCRIPTIONS` plus trend label. The plain-span fallback (when even `QUE_DESCRIPTIONS[hexagram]` is absent) is unchanged.

### FR-4 — Deep-link preserved
**DDD layer: interface**
"Xem chi tiết →" anchor to `/dashboard/kinh-dich-reference#que-{hexagram}` is kept unconditionally when `withDetailLink === true`. Position: after the Cảnh báo field, before or after `marketTrendLabel` — developer's discretion on visual order within those two trailing items.

### FR-5 — SSOT constraint enforced
**DDD layer: interface**
`apps/frontend/app/components/QueName.tsx` is the ONLY file modified (QUE-TOOLTIP-DRY mandate). No second tooltip surface, no new components, no edits to the reference route, no edits to any generated file, no edits to codegen scripts.

---

## 3. Non-Functional Requirements

### NFR-1 — Tooltip stays compact
`TooltipContent` width ceiling stays `max-w-xs`. Each of the 4 new clauses is a short Vietnamese sentence (avg 30–60 chars). No horizontal overflow on a standard 1440px desktop. No scroll inside tooltip. The 6-hào table (`phases[]`) is OMITTED — it is tabular and belongs on the reference page.

### NFR-2 — Language
All user-facing label strings are Vietnamese: "Trạng thái:", "Thuận:", "Cảnh báo:". No English labels visible to user.

### NFR-3 — No runtime network calls
`QUE_DETAIL` is already bundled in the frontend at build time — zero new API calls introduced.

### NFR-4 — TypeScript clean
After change: `pnpm check` (tsc) exits 0 in `apps/frontend/`.

### NFR-5 — Served-chunk RAW-verify (DONE BAR — mandatory)
After ops rebuilds the frontend container, QA must run:
```bash
curl -s http://localhost:3001/ | grep -c "stateInterpretation\|Trạng thái\|Sức sáng tạo"
```
OR inspect the JS chunk on `:3001` to confirm the new VN strings (`stateInterpretation` value or `favorable`/`warning` text from at least quẻ 1) are present in the served bundle. A green build alone does NOT satisfy the DONE BAR — the live `:3001` surface must serve the new content.

### NFR-6 — Peer container survival
Frontend rebuild must NOT destroy peer containers. Ops must use the isolated rebuild sequence:
`docker compose build frontend && docker compose up -d --no-deps frontend && docker builder prune -f`
Then verify `docker ps -a` shows all peer services still running after rebuild.

---

## 4. Edge Cases

| Case | Handling |
|---|---|
| `QUE_DETAIL[hexagram]` missing (id outside 1–64 or future extension) | Fall back to FR-3 path (existing `QUE_DESCRIPTIONS` render) |
| `stateInterpretation` / `favorable` / `warning` empty string | Omit that clause from render (conditional render per field) |
| `withDetailLink` false/undefined | Deep-link anchor not rendered (existing behaviour, unchanged) |
| User on mobile / small viewport | `max-w-xs` constrains width; Radix manages positioning; no change to breakpoint logic needed |
| Hard-refresh required after rebuild | Expected — ops notifies user to hard-refresh; no cache-busting change required from dev |

---

## 5. DDD Layer Map

| Requirement | DDD Layer | Zone |
|---|---|---|
| FR-1 Tooltip content enrichment | Interface | `apps/frontend/` |
| FR-2 QUE_DETAIL import | Interface | `apps/frontend/` |
| FR-3 Graceful fallback | Interface | `apps/frontend/` |
| FR-4 Deep-link preserved | Interface | `apps/frontend/` |
| FR-5 SSOT constraint | Interface | `apps/frontend/` |
| NFR-1..6 | Interface / Ops | `apps/frontend/` + ops rebuild |

Single-zone change. No domain, application, or infrastructure layer touched.

---

## 6. Scope Out (confirmed by PO)

- `phases[]` table — stays on reference page only
- `kinh-dich-service` zone — JSON-only server; `dashboard/index.html` = file:// dev sandbox, user never opens it
- Codegen scripts (`scripts/gen-que-descriptions.ts`) — no change needed; `QUE_DETAIL` already has all required fields
- Layout/column changes — 1-column layout is live and complete (commit 1aa9dc31); out of scope
- Click-to-expand / popover — out of scope per PO; hover only
- Reference route changes — out of scope

---

## 7. Files to Change (developer checklist)

| File | Change |
|---|---|
| `apps/frontend/app/components/QueName.tsx` | Add `QUE_DETAIL` import; add `detail` lookup; render FR-1 fields inside `TooltipContent`; keep FR-3 fallback and FR-4 deep-link |

That is the complete list — ONE file.

---

## 8. Acceptance Criteria (QA gate)

1. `pnpm check` exits 0 in `apps/frontend/` — no TypeScript errors
2. Visual: hover any quẻ name on `:3001` → tooltip shows at minimum: name heading + coreMeaning paragraph + "Trạng thái:" + "Thuận:" + "Cảnh báo:" + trend label + "Xem chi tiết →" link
3. Tooltip does NOT show `phases[]` table content
4. Tooltip does NOT overflow viewport horizontally on 1440px
5. Served-chunk RAW-verify: `curl -s http://localhost:3001/ | grep -o "stateInterpretation\|favorable\|Trạng thái"` returns at least one match — confirms VN detail strings are in the live bundle (not just in source)
6. `docker ps -a` after rebuild shows all peer containers still running
7. Fallback test: if any quẻ id in QUE_DESCRIPTIONS lacks a QUE_DETAIL entry, that quẻ still renders its existing tooltip without crashing

---

## 9. Blockers

NONE — zero PO questions needed. All decisions are made:
- PO product decision is locked (Option a, richer tooltip)
- Data source is in-bundle (`QUE_DETAIL` all 64 entries confirmed)
- SSOT file identified (`QueName.tsx`)
- Codegen not needed
- Single-zone: developer does not need architect for a one-file UI change at this scale

**Recommended chain:** developer (frontend) → ops (frontend-only rebuild) → qa

---

## 10. Decision Journal

**task_id:** BA-KINHDICH-HOVER-DETAIL
- what-considered: "only path: single-file QueName.tsx enrichment using already-bundled QUE_DETAIL; no codegen extension, no new components, no backend touch — PO decision eliminates all alternatives"
- why-change: "no change from plan; PO locked Option (a); QUE_DETAIL field audit confirms all 5 required fields present for all 64 hexagrams"
