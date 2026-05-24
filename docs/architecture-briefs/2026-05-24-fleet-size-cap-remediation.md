# Architecture Brief — Fleet File-Size-Cap Remediation

**Date:** 2026-05-24  
**Author:** agents-architect  
**Status:** AWAITING agent-father execution (staged — user review checkpoint before any file edits)  
**Caps SSOT:** `docs/data/file-size-caps.json` (soft cap = 120 L for `.claude/flows/**`, `.claude/agents/*.md`, `.claude/skills/**`)

---

## Summary

22 agent-system files exceed the 120 L soft cap and lack a `<!-- size-justification: -->` comment. After reading every file, 5 warrant a genuine SPLIT (multi-responsibility bloat), 14 warrant a JUSTIFY comment (coherent single-responsibility content that is dense by necessity), and 3 are borderline LEAVE (will naturally feed a split later or are mid-pilot and frozen). Staged rollout recommended: pilot the 2 largest SPLITs, verify agents still load, then proceed with the rest.

---

## SPLIT Verdicts (5 files) — largest first

### S1 — `.claude/flows/unified-agent/chef.md` (278 L) — SPLIT

**Diagnosis:** Chef carries two distinct responsibilities baked into a single file:
1. The declarative 6-layer recipe protocol (Steps 0–7: what each layer checks, convergence rules, citation discipline, causal chain format) — this is reference content read at flow start.
2. The telemetry scaffolding (ENTRY / CLOSE / FAILED / SILENT / RETURN blocks and their exact message formats) — this is operational boilerplate run every cycle.

These two halves are independently legible and independently evolvable. The telemetry section alone is ~55 L. The recipe (Steps 0–7) is ~165 L. The preamble (knowledge loads, Bootstrap ref) is ~20 L.

**Proposed split:**

| New file | Content | Approx L |
|---|---|---|
| `.claude/flows/unified-agent/chef.md` (trimmed) | Preamble (knowledge loads, Bootstrap ref, ENTRY telemetry call) + Steps 0–7 as compact step-headers with JUMP-TO refs | ~130 L |
| `.claude/flows/unified-agent/chef-telemetry.md` | Full ENTRY / CLOSE / FAILED / SILENT / RETURN block specs with exact message formats, try/catch boundary declarations | ~55 L |

**What moves:** Lines 26–47 (ENTRY Telemetry section) and lines 233–278 (CLOSE Telemetry + FAILED Telemetry + RETURN blocks) move verbatim to `chef-telemetry.md`. Replace in `chef.md` with a single JUMP-TO ref: `→ Telemetry spec: .claude/flows/unified-agent/chef-telemetry.md`.

**agent-father action:** Create `.claude/flows/unified-agent/chef-telemetry.md`. Edit `chef.md` to insert the JUMP-TO and remove the two telemetry sections.

---

### S2 — `.claude/flows/dev-mainserver-crawls/main.md` (235 L) — SPLIT

**Diagnosis:** This flow mixes two responsibilities:
1. The agent orchestration steps (Steps 0–8: drain signal, read recon, select technique, implement scraper, wire into microservice, verify, RAM check, signal QA) — this is the flow.
2. Inline code scaffolding: a full playwright-stealth code snippet (lines 107–117), pip install commands, bash verification scripts — these are reference templates that bloat the flow and belong in the technique doc template.

Additionally, Step 3b (Research if new technique) is a self-contained sub-task with its own output artifact (`docs/mainserver-crawl-techniques/<technique>.md`). It is 25 L of research protocol.

**Proposed split:**

| New file | Content | Approx L |
|---|---|---|
| `.claude/flows/dev-mainserver-crawls/main.md` (trimmed) | Steps 0–8 as compact step-headers, technique selection table, sub-flow reference for Step 3b | ~130 L |
| `.claude/flows/dev-mainserver-crawls/technique-research.md` | Step 3b research protocol (WebSearch, WebFetch, synthesis, technique doc template) + full code snippets (headless playwright pattern, pip install pattern) | ~60 L |

**What moves:** Lines 69–139 (Step 3b Research sub-section through all inline code scaffolding) move to `technique-research.md`. Replace in `main.md` with: `→ If new technique: run sub-flow: .claude/flows/dev-mainserver-crawls/technique-research.md`.

**agent-father action:** Create `.claude/flows/dev-mainserver-crawls/technique-research.md`. Edit `main.md` to insert sub-flow ref and remove moved content.

---

### S3 — `.claude/flows/dev-vps-crawls/main.md` (211 L) — SPLIT

**Diagnosis:** Same structural pattern as S2. The flow embeds its own technique-doc template verbatim (lines 66–93, ~28 L of markdown template with fenced code blocks nested inside fenced code blocks). This template is reference material, not flow steps. The VPS SSH implementation (Step 4b: deploying the scraper via heredoc SSH) also contains a large inline code pattern.

**Proposed split:**

| New file | Content | Approx L |
|---|---|---|
| `.claude/flows/dev-vps-crawls/main.md` (trimmed) | Steps 0–7 as compact step-headers, technique lookup logic, sub-flow reference | ~125 L |
| `.claude/flows/dev-vps-crawls/technique-research.md` | Step 3b research protocol + full technique-doc markdown template + VPS scraper code pattern (Step 4b heredoc structure) | ~60 L |

**What moves:** Lines 63–93 (Step 3b Research block + inline template) and lines 107–130 (Step 4b heredoc SSH scraper pattern) move to `technique-research.md`. Replace in `main.md` with: `→ If new technique: run sub-flow: .claude/flows/dev-vps-crawls/technique-research.md`. Step 4b in main.md becomes a compact 3-line pointer.

**agent-father action:** Create `.claude/flows/dev-vps-crawls/technique-research.md`. Edit `main.md` to insert sub-flow ref and remove moved content.

---

### S4 — `.claude/flows/dev-stock-price/main.md` (184 L) — SPLIT

**Diagnosis:** This file is a thin pointer to `microservice-main.md` (lines 1–14) — that is correct. The bloat comes from **three pilot-specific rule sections** (Language Mode, Smoke Checks, DoD Gate G12, R-CGO Gate, Security Rule, Fence Rules, Pre-Revert Tag Protocol, References table) that are binding operational contracts specific to the stock-price Go pilot. These are not general dev-* flow steps — they are pilot charter enforcement content that deserves its own home.

The stock-price pilot has a `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` (the binding authority). The flow is duplicating pilot-specific enforcement clauses that belong in an operational addendum file, not in the thin pointer.

**Proposed split:**

| New file | Content | Approx L |
|---|---|---|
| `.claude/flows/dev-stock-price/main.md` (trimmed) | Pointer to microservice-main.md + Language Mode table + Smoke Checks table + JUMP-TO ref for gates | ~55 L |
| `.claude/flows/dev-stock-price/pilot-gates.md` | DoD Gate G12, R-CGO Gate, Security Rule §Security/CGO Clause, Fence Rules (Depguard), Pre-Revert Tag Protocol, References table | ~130 L |

**What moves:** Lines 53–184 (DoD Gate G12 through References table). Replace in `main.md` with: `→ Pilot gates (G12 / R-CGO / Security / Fences / Tags): .claude/flows/dev-stock-price/pilot-gates.md`. Agent reads pilot-gates.md at task start when any gate is triggered.

**Note:** `dev-kinh-dich/main.md` (157 L) has the same pattern (S5 below) — both splits can be applied in the same agent-father pass.

**agent-father action:** Create `.claude/flows/dev-stock-price/pilot-gates.md`. Edit `main.md` to trim to pointer + compact sections.

---

### S5 — `.claude/flows/dev-kinh-dich/main.md` (157 L) — SPLIT

**Diagnosis:** Identical structural pattern to S4. The kinh-dich thin pointer carries Language Mode (5 L), Smoke Checks table (10 L), plus DoD Gate G12, Security Rule, R-FENCE Gate (ESLint boundaries, full spec with R-2 fallback, AC-4b proof structure), Pre-Revert Tag Protocol, and References table — all pilot-charter enforcement content.

**Proposed split:**

| New file | Content | Approx L |
|---|---|---|
| `.claude/flows/dev-kinh-dich/main.md` (trimmed) | Pointer to microservice-main.md + Language Mode + Smoke Checks + JUMP-TO ref | ~40 L |
| `.claude/flows/dev-kinh-dich/pilot-gates.md` | DoD Gate G12, Security Rule §Zero-Credentials Clause, R-FENCE Gate (full ESLint spec + R-2 fallback), Pre-Revert Tag Protocol, References table | ~120 L |

**What moves:** Lines 47–157 (DoD Gate G12 through References table). Replace in `main.md` with: `→ Pilot gates (G12 / Security / R-FENCE / Tags): .claude/flows/dev-kinh-dich/pilot-gates.md`.

**agent-father action:** Create `.claude/flows/dev-kinh-dich/pilot-gates.md`. Edit `main.md` to trim to pointer + compact sections.

---

## JUSTIFY Verdicts (14 files) — batch table

These files are coherent and atomic. The correct fix is adding a `<!-- size-justification: -->` comment in the first 8 lines (after any YAML frontmatter). No split warranted.

**agent-father action:** For each row, INSERT the `<!-- size-justification: -->` comment at line 1 (or immediately after the closing `---` of YAML frontmatter if present).

| File | L | Justification comment text |
|---|---|---|
| `.claude/flows/ops-mainserver-fetch/main.md` | 178 | `<!-- size-justification: 178L — single fetch-and-recon flow; probe commands, geo-block decision table, anti-bot classification table, and recon doc schema are all mandatory operational content with no factoring seam -->` |
| `.claude/agents/system-auditor.md` | 160 | `<!-- size-justification: 160L — agent definition covers 3-tier audit cadence (Tier 1/2/3), 6-pillar capability list, 60+ check IDs across runtime/fetch/DB surfaces, dedup policy, and typed signal shapes; each section is load-bearing and non-separable from the agent identity -->` |
| `.claude/agents/pm.md` | 156 | `<!-- size-justification: 156L — agent definition embeds parallel-dispatch spawn pattern (S7 dispatcher-wrap with task_claim loop), conflict-check matrix, and inter_agent routing table; all are identity-level content that must load atomically with the agent -->` |
| `.claude/flows/news-scout/stage-signals.md` | 154 | `<!-- size-justification: 154L — stage 3 sub-flow; carries 3 distinct signal schemas (legal_risk / urgent_news / chain_catalyst) each with dedup logic, confidence tables, and exact call_tool payloads; schemas are non-factorizable without breaking the dedup contract -->` |
| `.claude/skills/system-map-query/SKILL.md` | 150 | `<!-- size-justification: 150L — SSOT query reference; 8 jq query groups (microservices, agents, zones, channels, data sources, watchlist, infrastructure) each with multiple named patterns; a query reference loses utility if split — agents need the full pattern set in one load -->` |
| `.claude/flows/ops-vps-fetch/main.md` | 150 | `<!-- size-justification: 150L — VPS recon flow; SSH probe commands, anti-bot classification table, recon doc schema pointer, and signal drop spec are all mandatory; mirrors ops-mainserver-fetch intentionally — same structure, different execution environment -->` |
| `.claude/flows/pm/main.md` | 149 | `<!-- size-justification: 149L — single PM orchestration flow; TASKS.md gate, handoff template, multi-zone handling, DASHBOARD CAS guard, heartbeat lock protocol, and commit convention are all non-separable PM responsibilities executed in sequence -->` |
| `.claude/skills/signal-dashboard/SKILL.md` | 147 | `<!-- size-justification: 147L — SSOT protocol skill for DASHBOARD.md; covers WRITE/READ/ACK/CLOSE/PRUNE operations + payload pointer discipline (3 rules) + signal type taxonomy + per-type doc-load table; splitting operations would break the atomicity guarantee agents depend on -->` |
| `.claude/agents/ba.md` | 147 | `<!-- size-justification: 147L — agent definition embeds parallel-dispatch spawn pattern (S6 dispatcher-wrap with task_claim loop), conflict-check matrix, and inter_agent routing table; all are identity-level content that must load atomically with the agent -->` |
| `.claude/flows/dev-frontend/main.md` | 142 | `<!-- size-justification: 142L — zone-specialist flow; 4-tier build-order constraint table, TDD entry points per tier (3 variants), DDD layer rules table, gateway contract, implementation record template, and doc-self-heal chain are all zone-specific mandatory content with no factoring seam -->` |
| `.claude/flows/developer/main.md` | 141 | `<!-- size-justification: 141L — mcp-server root developer flow; pre-code checklist, TDD loop with heartbeat, task-lock claim, doc-update+graphify protocol, implementation record template, and RETURN schema are all tightly coupled sequential steps that must be read in one pass -->` |
| `.claude/flows/dev-macro-indicators/main.md` | 138 | `<!-- size-justification: 138L — thin pointer + pilot enforcement content (Language Mode, Smoke Checks, G12 DoD, Security Clause, Fence Rules A/B/C, Pre-Revert Tag Protocol, References); identical structure to dev-stock-price — schedule for split when macro-indicators pilot reaches Phase 2 (same pass as S4) -->` |
| `.claude/agents/financial-analyst.md` | 137 | `<!-- size-justification: 137L — agent definition includes signal_output_spec with 4 business-context fields + example JSON block (mandatory chef contract), BCTC deadline table, schedule spec, and always_load knowledge list; all load-bearing identity content -->` |
| `.claude/flows/developer/microservice-main.md` | 135 | `<!-- size-justification: 135L — shared base flow for all 9 dev-* zone agents; carries both TS/Bun and Python/FastAPI TDD workflows, zone-restriction rule, task-lock claim, doc-review chain, implementation record template, and RETURN schema; splitting would degrade usability for all 9 consumers -->` |
| `.claude/agents/news-scout.md` | 133 | `<!-- size-justification: 133L — agent definition covers signal taxonomy (consumes 3 / produces 2), 3-schedule cron stagger (market_hours + off_hours + batch2_sentiment), tool constraints, and identity guards (no_self_abort, write_tool_available); all load-bearing identity content -->` |
| `.claude/agents/market-watcher.md` | 132 | `<!-- size-justification: 132L — agent definition covers 3-schedule cron stagger, identity role enforcement (identity_role constraint + mcp_tool_available guard), always_load knowledge list with 4 entries, Extensions table, and inter_agent routing; all load-bearing identity content -->` |

**Note on dev-macro-indicators:** It carries the same pilot-gate bloat pattern as dev-stock-price (S4) and dev-kinh-dich (S5). It gets a JUSTIFY comment now because the macro-indicators pilot is mid-Phase 1 and the pilot-gates.md split should happen in the same agent-father pass as S4/S5 to avoid 3 separate PRs. Flag for the agent-father: when executing S4 and S5, apply the same split pattern to `dev-macro-indicators/main.md` as a bonus (4th pilot-gates extraction). That would drop it from 138 L to ~50 L.

---

## LEAVE Verdicts (3 files)

| File | L | Reason |
|---|---|---|
| `.claude/agents/report-analyzer.md` | 129 | 9 L over cap. Single-responsibility agent definition. The `signal_output_spec` with example JSON block is the only dense section (~25 L) but it is a mandatory chef contract — identical pattern to financial-analyst.md (JUSTIFIED at 137 L). Will receive a JUSTIFY comment in the same agent-father pass as the 14 JUSTIFY files above — effectively a JUSTIFY, not LEAVE. Added here because it is the lowest-priority item and can be batched with any subsequent pass. |

**Actual LEAVE count: 0** — report-analyzer should receive the same JUSTIFY comment treatment. It is listed separately because the initial triage placed it at the bottom of the priority ladder; agent-father may include it in the JUSTIFY batch pass without a separate staged cycle.

---

## Staged Rollout Plan

### Pilot 1 — S1 (chef.md, 278 L) + S2 (dev-mainserver-crawls, 235 L)

Execute first. These are the two largest files and have the cleanest split seams (chef: recipe vs telemetry; dev-mainserver-crawls: flow steps vs research sub-flow). After agent-father commits:
1. Verify unified-agent session loads without KLFL on chef.md.
2. Verify dev-mainserver-crawls loads and the sub-flow ref resolves.
3. Confirm neither file triggers size-cap backstop hook after split.

**Gate:** Both agents load cleanly in a fresh cowork session → proceed to Pilot 2.

### Pilot 2 — S3 (dev-vps-crawls, 211 L) + S4/S5 combo (dev-stock-price 184 L + dev-kinh-dich 157 L + dev-macro-indicators 138 L bonus)

S3 mirrors S2 structurally — low risk after Pilot 1 is proven. S4+S5+bonus are a 3-file combo of the same pilot-gates extraction pattern — do in one commit to minimize PR overhead.

**Gate:** All three pilot pointer flows load; pilot-gates.md refs resolve; sandbox smoke checks still pass for active pilot tasks.

### Final pass — JUSTIFY batch (14+1 files)

Add `<!-- size-justification: -->` comments to all 14 JUSTIFY files plus report-analyzer. This is a pure metadata pass — no content changes, no agent behavior changes. Agent-father can do all 15 in one commit.

---

## Implementation Notes for agent-father

1. **Never break a JUMP-TO ref** — when creating a sub-flow file, the pointer line in the parent must use the exact path format: `→ Sub-flow / pilot gates: .claude/flows/<agent>/<file>.md` so agents following the flow can resolve it.
2. **Preserve YAML frontmatter position** — the `<!-- size-justification: -->` comment goes immediately after the closing `---` of any YAML frontmatter block (lines 1–N of frontmatter), before the first heading. For files without frontmatter, it goes at line 1.
3. **Do not split ops-mainserver-fetch or ops-vps-fetch** — both are 150–178 L but are atomic ops flows. The probe commands and anti-bot tables cannot be factored without making the flow non-executable as a standalone.
4. **chef-telemetry.md and microservice-main.md are siblings** — the existing `microservice-main.md` pattern (shared base flow, thin pointer per agent) is the correct model for the pilot-gates.md extraction. Reuse that model.
5. **pilot-gates.md files are lazy-loaded** — after the split, add a lazy_load entry in each dev-* agent definition pointing to the pilot-gates.md file with `trigger: pilot_gate_check`. This is an agent-father edit to the `.claude/agents/dev-stock-price.md`, `.claude/agents/dev-kinh-dich.md`, and `.claude/agents/dev-macro-indicators.md` files.

---

## Verdict Summary

| Verdict | Count | Files |
|---|---|---|
| SPLIT | 5 | chef.md, dev-mainserver-crawls/main.md, dev-vps-crawls/main.md, dev-stock-price/main.md, dev-kinh-dich/main.md |
| JUSTIFY | 14+1 | ops-mainserver-fetch, system-auditor, pm, news-scout/stage-signals, system-map-query, ops-vps-fetch, pm/main, signal-dashboard, ba, dev-frontend, developer/main, dev-macro-indicators (bonus SPLIT later), financial-analyst, microservice-main, news-scout, market-watcher + report-analyzer |
| LEAVE | 0 | (report-analyzer folded into JUSTIFY batch) |

**PILOT:** S1 (chef.md) + S2 (dev-mainserver-crawls/main.md) first.  
**NEXT ACTOR:** agent-father (staged — user review checkpoint before execution).
