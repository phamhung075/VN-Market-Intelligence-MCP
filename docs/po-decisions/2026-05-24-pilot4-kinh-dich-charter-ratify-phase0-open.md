---
title: "kinh-dich (pilot-4) charter v2.0 RATIFIED + Phase-0 decomposition authorized to PM"
date: "2026-05-24"
author: "po"
status: "DECIDED"
program: "fleet-factory-rollout"
verdict: "RATIFIED"
decision: "Ratify the architect's kinh-dich pilot-4 charter v2.0; authorize PM to decompose Phase 0"
parent_open_ruling: "docs/po-decisions/2026-05-24-pilot3-phase1-gate-ratify-and-pilot4-kinh-dich-open.md (Decision 2 — kinh-dich OPENED)"
charter_ratified: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md (v2.0)"
ssot: "docs/data/pilot-status-kinh-dich.json"
architect_draft_signal: "docs/signals/architect-kinh-dich-charter-draft-done-20260524T000005Z.json"
si3_source: "docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md (FINAL, chosen_option=A)"
charter_commit: "4e914a811d68bc9bf00d452485fa4b1aed84cb5d"
dispatch_signal: "docs/signals/po-pilot4-kinh-dich-phase0-open-20260523T225323Z.json"
---

# kinh-dich Pilot-4 Charter v2.0 — RATIFIED

The architect drafted the kinh-dich pilot-4 charter v2.0 + Day-0 SSOT (charter-draft-done
signal `architect-kinh-dich-charter-draft-done-20260524T000005Z.json`, `charter_ready_for_po_ratification: true`,
commit `4e914a81`). This is the third factory-pilot ratification (after macro and stock-price);
I OPENED this pilot last cycle (Decision 2 of `2026-05-24-pilot3-phase1-gate-ratify-and-pilot4-kinh-dich-open.md`).
I verified the charter independently against SI-3 §5, my prior OPEN ruling, the reference
stock-price/macro charters, and jq on `system-map.json` — I did NOT take the architect's word.

**Ruling: the kinh-dich pilot-4 charter v2.0 is RATIFIED. PM is authorized to decompose
Phase 0 into the 6 deliverables (D1-D5 remaining; D0 SSOT already landed).** No user approval
required (full autonomy; fleet factory is a program-level user goal).

Charter + SSOT + draft signal all landed in **one commit `4e914a81`**, which is also current HEAD.

---

## Independent ratification checklist (7 points — all verified this cycle)

| # | Check | Source verified | Result |
|---|---|---|---|
| 1 | **G4 = TS fence, NOT Go depguard** | Charter §G4 lines 202-297: `eslint-plugin-boundaries` (Option A) in `apps/kinh-dich-service/eslint.config.mjs`. AC-4a/4b/4c (charter lines 208-226) are SI-3 §5 (design.md lines 348-350) transcribed VERBATIM with `<svc>` → `kinh-dich-service`. G4 LOCKED at charter v1 (charter §Amendments line 514 + §G4 line 228 "NO architect Amendment needed"). | **PASS** |
| 2 | **R-FENCE per-service gate present** (no R-CGO analog) | Charter §R-FENCE Boundary Clause lines 82-94: novel-tooling gate, no `mattn/go-sqlite3`, no R-CGO. AC-4b deliberate-violation on real `.js` ESM import: `import type { ReadingRequest } from '../../application/dtos.js'` (charter line 216) — matches the actual `.js`-suffixed style. SI-3 §6.3 fallback = add `@typescript-eslint/parser` (stays Option A, charter line 89/232). G7 zero-creds carries over (charter §Security lines 139-149, §R-FENCE line 92). | **PASS** |
| 3 | **12 G-goals across Tracks A/B/C + Phase 0 exit gate** | Charter §12 Completion Goals lines 153-411: G1-G5 Track A, G6-G9 Track B, G10-G12 Track C, standard definitions. SSOT `goals[]` = 12 entries. §Phase 0 exit gate lines 415-428 present. | **PASS** |
| 4 | **§4.5 decisionMatrix present-but-empty (NOT pre-filled)** | Charter §Decision Matrix lines 466-483 + §Constraints line 457 (PO-only, atomic with 12/12). SSOT `decisionMatrix`: speed/trust/scale/verdict all `TBD`, `populatedAt: null`, `populatedBy: null`. | **PASS — empty** |
| 5 | **SSOT Day-0 shape** | jq on `pilot-status-kinh-dich.json`: `status=ACTIVE`, `phase=0`, `language=TypeScript`, `languageLockedAt=2026-05-24`, all 12 goals `TBD`, `goalsEarned=0`, decisionMatrix empty. | **PASS** |
| 6 | **SI-2 not re-claimed** | grep `docs/dashboards/index.html` in charter → lines 330 + 459 both explicitly assign SI-2 to stock-price; kinh-dich G6 (charter §G6 line 323) = `apps/kinh-dich-service/dashboard/index.html` only. | **PASS** |
| 7 | **Service facts match jq on system-map.json** | `jq` query: `kinh-dich-service`, port 5005 (internal==external 5005), zone `apps/kinh-dich-service`, language `ts`, runtime `bun`, specialist `dev-kinh-dich`. Charter frontmatter + §G3 (port 5005 never hardcoded) match. | **PASS** |

**Supplementary checks:** WIP=2 cap holds — {stock-price ACTIVE/phase=1, kinh-dich ACTIVE/phase=0};
TA + macro both `DONE`/`scale` (frozen/closed, untouched). No alert-engine (pilot-5) charter dir
exists. No `.golangci.yml` / Go depguard text in the kinh-dich charter. `git index.lock` absent,
no live git process.

---

## What I do NOT touch

- **SSOT mutation is PM's** — PM owns `pilot-status-kinh-dich.json` Phase-0 fields. This ruling is
  ratify + Phase-0-open authority only; I do not mutate the SSOT here (mirrors the stock-price
  Decision-1 pattern: gate-open authority, PM does the SSOT write on dispatch).
- **decisionMatrix stays empty** — §4.5: populated ONLY at 12/12 terminal, by PO, in the atomic
  closure commit. Not now.
- **DORMANT/CLOSED freeze** — `apps/technical-analysis/**`, `apps/macro-indicators/**`,
  `pilot-status.json`, `pilot-status-macro-indicators.json` untouched. stock-price SSOT (PM-owned,
  phase=1) untouched.
- **No pilot-5 (alert-engine)** charter opens — WIP=2 cap.

---

## Phase 0 authorization (binding) — dispatched to PM

PM decomposes kinh-dich **Phase 0** into the architect's planned deliverables (D0 already landed):

- **D0 (DONE)** `pilot_status_ssot` — `docs/data/pilot-status-kinh-dich.json` (architect, this charter cycle).
- **D1** `brownfield_inventory` — `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md`.
  Confirm exact primitive set + module name; G5a superseded-vs-retained `domain/services.ts` logic;
  G5b exact MCP handlers reaching kinh-dich domain; **R-FENCE feasibility (AC-4b deliberate-violation
  proof on real `.js`-suffixed import style)**. Owner: architect/system-auditor (+ dev-kinh-dich R-FENCE confirm).
- **D2** `bug_inventory_entry` — `docs/data/bug-inventory.json` `kinh_dich_baseline` block (baselineCycleCount;
  fallback `1.5` if <2 bugs in 60d). (gitignored dir → `git add -f`.)
- **D3** `dev_agent_file` — `.claude/agents/dev-kinh-dich.md` factory-mode confirmation (TS primary, G12 DoD,
  R-FENCE lazy-load). Owner: agent-father.
- **D4** `dev_agent_flow_file` — `.claude/flows/dev-kinh-dich/main.md` with **G12 DoD-Gate baked Day 0** +
  Fence-A/B/C + pre-revert tag protocol (`kinh-dich-pre-ci`, `kinh-dich-pre-delete`, `kinh-dich-pre-inject`).
  Owner: agent-father.
- **D5** `phase_1_task_plan` — `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md`
  (atomic tasks, per-task AC, WIP=1, **R-FENCE gate baked into the first-fence task AC exactly as
  stock-price baked R-CGO into P1-B1**).

**Phase-0 exit gate:** all 6 deliverables landed + SSOT phase-0 fields populated + no code in
`src/primitive`/`src/module` yet + architect verification signal. PM owns the SSOT phase-0 mutations.
G12 may reach EARNED-PENDING after the Phase-1 streak; PO flips it YES only at 12/12 terminal.

---

## Constraints held

L84 explicit-file staging (per-path `git add`, no `-A`/`.`); no `--force`, no `--no-verify`,
no `--no-gpg-sign`; no `git push`; all on `main`. Did NOT mutate the kinh-dich SSOT (PM-owned).
Did NOT touch DORMANT/CLOSED/FROZEN app source or SSOTs. decisionMatrix empty until 12/12 terminal.
No pilot-5 opened (WIP=2). System facts via jq on `system-map.json`, never hardcoded.

**Decision owner:** PO. **No user approval required.**
**Recorded:** 2026-05-24 (UTC instant 2026-05-23T22:53:23Z).
