# Metrics — Primitive Tier

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## Maturity Scale

- **L0** = current broken state  
- **L1** = minimal compliance (started)  
- **L2** = target baseline (acceptable for production)  
- **L3** = strong (most metrics reach this in Phase 5)  
- **L4** = excellent (full automation, lint enforcement, self-healing)

---

## P-1 — SRP Score

**What it measures:** Number of distinct operations per primitive. A primitive must implement exactly one verb.

**Measurement procedure:**
1. Count exported functions/classes in the primitive's `index.ts`.
2. Flag any primitive with >1 exported operation (excluding types and DTOs).
3. `grep -c "^export function\|^export class\|^export const" packages/primitives/<name>/src/index.ts`

| Level | Definition |
|---|---|
| L0 | Multiple operations bundled (e.g., `technicalIndicators.ts` has RSI+MACD+BB in one file) |
| L1 | File extracted to own folder; still exports 2-3 operations |
| L2 | Exactly 1 exported operation function + its input/output types |
| L3 | 1 operation + contract.md documents the single verb explicitly |
| L4 | ESLint rule enforces max-1-export-per-primitive at CI; violation blocks PR |

**Owner:** Architect review at extraction; QA lint gate at L4.  
**When measured:** At extraction (L2 gate) and each CI run (L4 gate).

---

## P-2 — Port-Driven Score

**What it measures:** Percentage of external dependencies that are interface ports (not concrete classes).

**Measurement procedure:**
1. Read all `import` statements in `packages/primitives/<name>/src/`.
2. Count imports of concrete classes (SQLite, HTTP client, `Bun.env`, etc.) as violations.
3. Count imports of interfaces/abstract ports as compliant.
4. Score = compliant / (compliant + violations) × 100%.
5. Shortcut: `grep -rn "from.*infrastructure\|from.*db\|Bun\.env\|process\.env" packages/primitives/<name>/src/` — any match = violation.

| Level | Definition |
|---|---|
| L0 | Concrete SQLite/HTTP imports inside primitive (e.g., `resilientFetcher.ts` in domain/services) |
| L1 | Most deps are ports; 1-2 concrete imports remain |
| L2 | 100% port-driven — no concrete infrastructure imports anywhere in primitive |
| L3 | Ports defined in `packages/primitives/<name>/src/ports.ts`; constructor injection only |
| L4 | Automated import-graph check in CI rejects any direct infra import in `packages/primitives/` |

**Owner:** Developer at extraction; QA at L4 CI gate.  
**When measured:** At extraction (L2 gate); nightly CI (L3/L4).

---

## P-3 — Reusability Score

**What it measures:** How widely the primitive is actually consumed across modules/services.

**Measurement procedure:**
1. Caller count: `grep -rn "from.*packages/primitives/<name>" apps/ packages/modules/ | wc -l`
2. Cross-module reach: count distinct module folders in step 1 output.
3. A primitive used by 0 callers is a dead extraction (should be deleted or merged).

| Level | Definition |
|---|---|
| L0 | Logic exists only inside 1 module; not extracted |
| L1 | Extracted but only 1 caller (the module it was extracted from) |
| L2 | 2+ callers across at least 2 distinct modules |
| L3 | 3+ callers across at least 2 tiers (module + app, or 2 different modules) |
| L4 | Caller count tracked automatically in master dashboard; unused primitives auto-flagged |

**Owner:** Architect at design review; system-auditor automated check at L4.  
**When measured:** At Phase 2 extraction checkpoint; monthly thereafter.

---

## P-4 — Scenario Coverage

**What it measures:** Percentage of public primitive methods covered by at least one scenario JSON.

**Measurement procedure:**
1. Count public method names exported from `packages/primitives/<name>/src/index.ts`.
2. Count `scenarios/*.json` files in the primitive's sandbox folder.
3. Each scenario JSON targets exactly one public method call.
4. Coverage = scenarios / public methods × 100%.
5. Edge-case scenarios: at least 1 "bad input" scenario per primitive (null, empty, out-of-range).

| Level | Definition |
|---|---|
| L0 | No scenarios exist |
| L1 | At least 1 happy-path scenario JSON exists |
| L2 | All public methods have ≥1 scenario JSON; ≥1 edge-case scenario |
| L3 | ≥3 scenarios per method (happy path + 2 edge cases); all pass sandbox run |
| L4 | Coverage % computed automatically on each PR; PR blocked if drops below L2 baseline |

**Owner:** Developer at Phase 1-2; QA at L4.  
**When measured:** Per PR (L4 gate); after each new scenario file added.

---

## P-5 — Shape Compliance

**What it measures:** Whether the primitive's `index.ts` conforms to the contract: one operation function + its DTOs only.

**Measurement procedure:**
1. Parse exports from `packages/primitives/<name>/src/index.ts`.
2. Allowed: 1 operation function, input DTO type, output DTO type, port interfaces.
3. Disallowed: domain entity types, internal helpers, infrastructure references.
4. Pass/fail: any disallowed export = fail.

| Level | Definition |
|---|---|
| L0 | No dedicated `index.ts`; logic accessed via deep import path |
| L1 | `index.ts` exists but exports extra internal types |
| L2 | `index.ts` exports only: 1 function + input DTO + output DTO + ports |
| L3 | `index.ts` has JSDoc header that states the single verb explicitly |
| L4 | Shape validated by AST-based lint rule on every PR |

**Owner:** Architect reviews at extraction; automated at L4.  
**When measured:** At each extraction; continuously at L4.

---

## P-6 — Documentation Completeness

**What it measures:** Whether a `contract.md` exists and accurately describes the primitive's single operation.

**Measurement procedure:**
1. `ls packages/primitives/<name>/contract.md` — existence check.
2. Manual review: contract.md must contain: one-sentence description, input type shape, output type shape, what it does NOT do (boundary statement), port dependencies.
3. Staleness check: `git log --since=<last_contract_update> packages/primitives/<name>/src/` — if source changed after contract, flag as stale.

| Level | Definition |
|---|---|
| L0 | No contract.md |
| L1 | contract.md exists but is stub/placeholder |
| L2 | contract.md covers: description, input/output shapes, boundary statement |
| L3 | contract.md includes port dependencies; updated in same commit as any source change |
| L4 | CI checks contract.md last-modified date vs source last-modified; fails if contract is stale |

**Owner:** Developer authors; Architect reviews; CI enforces at L4.  
**When measured:** At Phase 1 (contract write); continuously at L4.

---

## P-7 — Dashboard Presence

**What it measures:** Whether the primitive has its own sandbox dashboard rendering its scenario JSON.

**Measurement procedure:**
1. Check `packages/primitives/<name>/scenarios/` contains at least 1 `.json` file.
2. Check `sandbox-kit` renderer can render it without errors.
3. Check primitive card appears in master dashboard at `apps/mcp-server/dashboard/index.html`.

| Level | Definition |
|---|---|
| L0 | No sandbox, no scenarios |
| L1 | Scenario JSON exists; not yet wired to renderer |
| L2 | Renderer produces `packages/primitives/<name>/dashboard.html`; card in master dashboard |
| L3 | Dashboard shows input/output diff when scenario JSON is edited; rerun works |
| L4 | Dashboard auto-rebuilds on each `bun run dashboard` CI step; broken dashboards block PR |

**Owner:** Developer builds sandbox; QA verifies render; CI enforces at L4.  
**When measured:** At Phase 1 pilot (L2); L4 after Phase 6 completion.

---

## Summary Table

| Metric | L2 is... | L4 enforcement |
|---|---|---|
| P-1 SRP Score | Exactly 1 exported operation | ESLint max-export rule |
| P-2 Port-Driven Score | 100% port-driven | CI import graph check |
| P-3 Reusability Score | 2+ callers across 2+ modules | Master dashboard auto-flag |
| P-4 Scenario Coverage | All public methods + 1 edge case | PR coverage gate |
| P-5 Shape Compliance | 1 fn + DTOs + ports only | AST lint rule |
| P-6 Docs Completeness | contract.md with all 5 sections | CI staleness check |
| P-7 Dashboard Presence | Scenarios + rendered HTML card | Dashboard CI build gate |
