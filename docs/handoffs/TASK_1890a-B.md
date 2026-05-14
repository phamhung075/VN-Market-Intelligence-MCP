---
sprint: 1890
branch: task/1890a-B-manifest-edits
size: S
zone: apps/mcp-server/, docs/
depends_on: [1890a-A]
blocks: []
---

## TLDR

Add three tools to the `financial_analyst` SKILL_MANIFEST (T1, T3, T5: `get_macro_snapshot`, `get_bond_maturity_calendar`, `get_investment_clock_phase`). Verify the package doc for `get_insider_signals` (T2) includes correct params. No code changes — manifest edits only. CRITICAL CONSTRAINT: 1890a-A must be deployed first because this task modifies the same manifest file (`agentBootstrap.ts`) and mirror (`docs/SKILL_MANIFEST.md`). Execute AFTER 1890a-A merge.

---

## [PM] Planning Context

- **Zone:** `apps/mcp-server/` + `docs/`
- **Priority:** HIGH (unblocks B, G, H steps in FA methodology)
- **Acceptance Criteria:**
  - [ ] `financial_analyst` SKILL_MANIFEST in `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` includes `"get_macro_snapshot"` (T1)
  - [ ] SKILL_MANIFEST includes `"get_bond_maturity_calendar"` (T3)
  - [ ] SKILL_MANIFEST includes `"get_investment_clock_phase"` (T5)
  - [ ] Verify `get_insider_signals` is already in SKILL_MANIFEST (it is, line 64 — no change needed)
  - [ ] Mirror file `docs/SKILL_MANIFEST.md` updated in same commit: add same 3 tools to `financial_analyst` array (per agentBootstrap.ts line 27 comment: "Update both files together")
  - [ ] `.claude/tools/package/financial-analyst.md` updated with new sections:
    - New "Macro Intelligence" section includes both T1 (`get_macro_snapshot`) and T5 (`get_investment_clock_phase`)
    - New "Sector Intelligence" section includes T3 (`get_bond_maturity_calendar`)
    - Verify T2 (`get_insider_signals`) entry has correct params: `code` (required), `outstandingShares` (required), `windowDays?` (optional) — critical for FA caller contract (R2 from brief)
  - [ ] No code changes (manifest/doc edits only)
  - [ ] FA TNB audit shows `B=✓, H=✓` on next cycle post-deploy

- **Files to read first:**
  - `docs/architecture-briefs/2026-05-14-1890a-fa-tool-package.md` § Subtask B + Risk Flags
  - `docs/REQ_1890a.md` § T1, T2, T3, T5 (spec for each tool)
  - `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` lines 64, 27 (SKILL_MANIFEST location + comment about dual update)
  - `docs/SKILL_MANIFEST.md` (mirror file — must update in same commit)
  - `.claude/tools/package/financial-analyst.md` (current state before edit)

- **Files to create:**
  - None

- **Files to modify:**
  - `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` — add 3 strings to `financial_analyst` array (T1, T3, T5)
  - `docs/SKILL_MANIFEST.md` — mirror the 3 additions (required by agentBootstrap.ts line 27 comment)
  - `.claude/tools/package/financial-analyst.md` — add new sections for T1, T3, T5; verify T2 params

- **Dependencies:**
  - **CRITICAL:** 1890a-A must be deployed and merged FIRST. This task blocks on 1890a-A because both tasks modify `agentBootstrap.ts`, `SKILL_MANIFEST.md`, and `financial-analyst.md`. To avoid merge conflicts, execute 1890a-B AFTER 1890a-A is merged to main and deployed.

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` — SSOT dual-file pattern (agentBootstrap.ts + docs/SKILL_MANIFEST.md must stay in sync)
  - `docs/architecture-briefs/2026-05-14-1890a-fa-tool-package.md` § Subtask B + Risk Flag R4
  - `docs/REQ_1890a.md` § T1, T2, T3, T5 tool specs + caller contract notes

---

## Tool Details (from Spec)

### T1 — `get_macro_snapshot`
- Exists in registry, MISSING from manifest
- FA B-step: REGIME detection (currently inferred from news; suppression multiplier wrong)
- Manifest addition: `"get_macro_snapshot"`

### T2 — `get_insider_signals`
- Exists in registry AND manifest (line 64 — no change needed)
- **CRITICAL:** Caller contract = `code`, `outstandingShares` (mandatory), `windowDays?` (optional)
- **ACTION:** Verify package doc includes these 3 params. If doc lists `—` or incomplete, update to list all 3.

### T3 — `get_bond_maturity_calendar`
- Exists in registry, MISSING from manifest
- FA step: credit/maturity risk context (medium urgency — BCTC cohort includes bond issuers)
- Manifest addition: `"get_bond_maturity_calendar"`

### T5 — `get_investment_clock_phase`
- Exists in registry, MISSING from manifest
- FA H-step: cycle phase declaration + pyramid tier match
- Manifest addition: `"get_investment_clock_phase"`

---

## Package Doc Structure

Update `.claude/tools/package/financial-analyst.md`:

1. **Market Intelligence section:**
   - Add `get_macro_snapshot` entry with params (source, regimeType, etc. — from tool schema)

2. **Sector Intelligence section (new or existing):**
   - Add `get_bond_maturity_calendar` entry

3. **Macro Intelligence section (new or existing):**
   - Add `get_investment_clock_phase` entry

4. **Existing entries to verify:**
   - `get_insider_signals` must show all 3 params: `code`, `outstandingShares`, `windowDays?`

---

## Risk Flags (from Brief)

- **R4 — SSOT dual-update:** agentBootstrap.ts line 27 comment explicitly requires `docs/SKILL_MANIFEST.md` updated in same commit. Both files must be updated in one task (this task — 1890a-B) to maintain SSOT.
- **R2 — `get_insider_signals` caller contract:** Handler requires `outstandingShares` (mandatory). Prior package doc may have listed `—` or incomplete. Update doc to include all 3 params to prevent silent degradation in FA cycle.

---

## Sequencing Constraint

**CRITICAL: Do NOT start until 1890a-A is merged.** This task modifies the same files as 1890a-A (`agentBootstrap.ts`, `SKILL_MANIFEST.md`, `financial-analyst.md`). Parallel work will create merge conflicts. Start 1890a-B only after 1890a-A merge commit lands on main.

---

## Deployment

After merge, no container rebuild required (manifest/doc edits only). Existing FA cycle will pick up new tools automatically on next execution. Verify FA TNB audit shows B-step and H-step enabled (`B=✓, H=✓`).
