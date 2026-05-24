# TASK KD-QREF — 64-Quẻ Trading Reference on the kinh-dich Dashboard

**Owner chain:** architect (KD-QREF-1) → dev-kinh-dich (KD-QREF-2) → qa (KD-QREF-3) → PO (KD-QREF-EXIT)
**Zone:** `apps/kinh-dich-service/` (single zone — anti-scope-creep)
**Classification:** POST-PILOT ENHANCEMENT. Pilot stays DONE 12/12, frozen. Decision doc: `docs/po-decisions/2026-05-24-kinh-dich-que-reference-dashboard.md`.
**Source (read-only, outside repo):** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/` (64 que .md + SCHEMA.md)

---

## Product shape (PO-decided — do not re-litigate)

A new additive **"64 Quẻ — Trading Reference"** section on `apps/kinh-dich-service/dashboard/index.html`, BELOW the existing 3 trust panels.

**Per-que data shape (identical for all 64) — the SSOT field set:**

| Field | Source in `que_convert/NN_*.md` | Reframe rule |
|---|---|---|
| `id` (1-64) | filename / `# NN.` | as-is |
| `name` (VN) + `chinese` (glyph) | `# NN. <Name> <glyph>` | verbatim, never translated |
| `upper` / `lower` trigram + element | `## Quẻ Đơn` table | already in `queMetaList`; reuse |
| `coreMeaningEn` | header `> **...**` line | translate to one English clause |
| `marketTrend` enum | `Xu hướng` keyword | THUẬN LỢI→`favorable`, TRUNG TÍNH→`neutral`, BẤT LỢI→`unfavorable` |
| `marketTrendLabel` | `Xu hướng` | `Favorable (THUẬN LỢI)` bilingual label |
| `stateInterpretationEn` | `Nghề nghiệp` row (career→trade/position framing) + `Xu hướng` tail | translate, reframe to trading-state prose (1-3 sentences) |
| `favorableEn` | `Xu hướng` favorable condition + `Đại Tượng` action | translate, one line |
| `warningEn` | `Cảnh báo` row | translate, one line |
| `phases[6]` | `## Sáu Hào` | per hào: `{phase: 1-6, action: TIEN/GIU/CHO/THAN/LUI, outcome: CÁT/HUNG/VÔ CỬU/HỐI/LỆ, glossEn: <one-line English>}` |

- `action` + `outcome` tokens for phases ALREADY exist in `queDataMap.lines[]` — reuse them as the source of truth; `glossEn` is the new translated one-liner per phase.
- Outcome tokens displayed in VN form with English gloss tooltip/parenthetical (CÁT = auspicious, HUNG = inauspicious, VÔ CỬU = no error, HỐI = regret, LỆ = danger).

**Two display levels (both required):**
1. **Summary row** per que: `NN · Name 字 · <core meaning EN> · [trend chip] · <warning clause>`. Trend chip color-coded: favorable=green-ish, neutral=grey, unfavorable=amber/red-ish (REUSE existing CSS vars; do NOT introduce `scenario-status-dot` or `dot-red` classes — see Trust gate).
2. **Detail** (expand inline or modal — architect picks the pattern that least disturbs the existing modal): trigrams + element, `stateInterpretationEn`, `favorableEn`, `warningEn`, and the 6-phase table.

---

## KD-QREF-1 — architect: design the data asset + dashboard integration (READY)

**Deliverable:** a short design note (append to this handoff or a sibling) + go/no-go on the data-home question.

Decide and document:
1. **Data home:** extend `hexagram_data.go` vs. new `hexagram_reference.go` in the same `reading_composer` package. PO preference: a NEW struct `queReference` keyed by id (keeps the lean scoring `queData` untouched), in a new file. Confirm or override.
2. **Emit path:** how the 64-que reference reaches `index.html`. PO preference: a Go command (mirror `cmd/sandbox -emit-traces` → `sandbox-traces.js`) that emits a generated `window.__QUE_REFERENCE__ = {...}` file (e.g. `dashboard/que-reference.js`) loaded by a `<script src>` tag, with a `DO NOT EDIT — generated` header. Confirm or propose inline-embed alternative.
3. **Render contract:** the exact DOM the dashboard JS builds for the new section, ensuring NO `.category-chip`, NO `scenario-status-dot`/`dot-*`, NO "not wired" text leaks in (so dash-check.mjs stays green). Specify the CSS classes to use (reuse existing vars).
4. **Future-proofing:** confirm the `queReference` shape can later back `/hexagram/{number}/explain` without restructure (do NOT wire it now).
5. **No fence violation:** the new file stays in `reading_composer` (module tier) and does not introduce cross-module/primitive import-direction violations.

**AC (architect):**
- AC-1: data-home + emit-path + render-contract decided and written.
- AC-2: render contract explicitly lists the trust-gate avoidances (no category-chip, no dot-*, no "not wired").
- AC-3: confirms zero new fetch/CDN/cred surface; file:// safe.
- AC-4: hands dev-kinh-dich a concrete file list + struct definition.

## KD-QREF-2 — dev-kinh-dich: implement (BLOCKED on KD-QREF-1)

**Deliverable:** Go data asset populated with all 64 reframed que + emit command + dashboard section rendering it.

Steps:
1. Create the `queReference` Go struct + populate all 64 entries by READING each `que_convert/NN_*.md` and translating/reframing per the field table above. This is human-quality translation content — accuracy matters (it is shown to the user as trading guidance). Pull `action`/`outcome` from existing `queDataMap`; pull trigrams from `queMetaList`.
2. Add the Go emit command (or extend `cmd/sandbox`) that writes `dashboard/que-reference.js` (`window.__QUE_REFERENCE__`), generated-header + DO NOT EDIT marker.
3. Add the dashboard section + JS renderer (summary rows + detail), reusing existing CSS vars, per architect's render contract.
4. Build clean `CGO_ENABLED=0`. Existing tests stay green.

**AC (dev-kinh-dich):**
- AC-1: all 64 que present in the Go asset (count == 64, ids 1..64 contiguous, no gaps). Each has every required field non-empty.
- AC-2: emit command regenerates `que-reference.js` deterministically; file carries the generated/DO-NOT-EDIT header.
- AC-3: dashboard renders all 64 summary rows + a working detail view; trend chips color-coded.
- AC-4: `CGO_ENABLED=0 go build ./...` clean; existing Go tests pass; no new fence violation.
- AC-5: `node dashboard/dash-check.mjs` exits 0 (PASS/WARN) — same as today. (See Trust gate.)
- AC-6: zero fetch / zero CDN / zero credentials in the new section; loads under file://.
- AC-7: the 3 trust panels, `sandbox-traces.js`, modal, edit-rerun handler are UNCHANGED (git diff touches only: the new Go file(s), the emit command, `index.html` additive section, new `que-reference.js`).

## KD-QREF-3 — qa: verify (BLOCKED on KD-QREF-2)

**AC (qa):**
- AC-1: open `index.html` under file://; confirm all 64 que listed, each opens a detail with trigrams + state + favorable + warning + 6 phases. No JS console errors.
- AC-2: run `node dashboard/dash-check.mjs` → exit 0, verdict PASS or WARN, `dotsRed=0`, `jsErrors=0`, `pageErrors=0`, no bad category labels. (This is the binding trust gate.)
- AC-3: spot-check 3 que (incl. 01 Kiền + 29 Tập Khảm + one mid-list) against the source files — trend enum correct, warning faithful, phases match `queDataMap`.
- AC-4: confirm git diff scope is exactly the allowed files (AC-7 above); 3 trust panels + sandbox-traces.js byte-unchanged.
- AC-5: bilingual rule honored — VN name + glyph verbatim, prose English, trend label bilingual.

## KD-QREF-EXIT — PO sign-off (BLOCKED on KD-QREF-3)

PO validates against this spec + the decision doc, records verdict, and (per the commit-mutex defect) MAIN TERMINAL performs the commit since dev-team agents cannot acquire the mutex. PO does not block on the agent committing.

---

## Trust gate (binding, repeated for emphasis)

`node dashboard/dash-check.mjs` MUST exit 0 after the change. It FAILS on: any `dot-red`, any JS console error, any page error, any `.category-chip` whose text is not in {Valid Input, Edge Case, Bad Input → Error}, and body text "not wired"/"not_wired". The new reference section therefore: uses NO `dot-*` classes, emits NO `.category-chip` elements, contains NO "not wired" text. Reference content is NOT a trust scenario.

## Commit reality

`commit-mutex` enum is missing the kind → dev-team agents (no MCP gateway) cannot acquire it. Workaround: dev-kinh-dich leaves work in-tree; main terminal commits at KD-QREF-EXIT. Do not treat "agent didn't commit" as a failure.
