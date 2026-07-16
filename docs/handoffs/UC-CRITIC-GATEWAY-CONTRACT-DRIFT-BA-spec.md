# BA Spec — UC-CRITIC-GATEWAY-CONTRACT-DRIFT

**Task:** UC-CRITIC-GATEWAY-CONTRACT-DRIFT · P1 · S · zone cross-service/ · sprint ULTRACODE-AUDIT-FIXALL
**BA date:** 2026-07-16
**Verdict carried forward:** CRITIC → spec complete, zero PO blockers → **NEXT: architect**

---

## 0. Canonical-binding determination (empirical + archival — closes the router's open question)

The router's live probe (`mcp__gateway__call_tool` succeeded this tick) was corroborating but not sufficient alone.
Full chain of evidence, independently verified this cycle:

1. **`.mcp.json` (repo's only MCP server declaration)** registers exactly one server, name `"gateway"`, `https://zenmidi.com/gateway/mcp`. There is no `"claude_ai_gateway"` entry anywhere in repo config. The `mcp__claude_ai_gateway__*` tool surface some sessions see (including this one) is an external/platform-injected connector, not a repo-declared one — confirmed by checking `~/.claude.json` (project-scoped `mcpServers` for this repo = `{}`, empty) and `~/.claude/claude.json` (global, only registers `zenmidi` at `localhost:4004`). Neither config file this repo controls declares `claude_ai_gateway`.
2. **Git-archaeology nails the ordering:**
   - `ad96bd166` (2026-06-14 16:28 +0200) created `docs/standards/gateway-call-contract.md` using the then-current prefix `mcp__claude_ai_gateway__call_tool` — correct at the time.
   - `775e2d8ee` (2026-06-16 08:54 UTC), commit message **`fix(agents): rename mcp__claude_ai_gateway__call_tool → mcp__gateway__call_tool (fleet-wide, 13 agents + CLAUDE.md)`**, is an explicit, deliberate, fleet-wide rename. It touched `CLAUDE.md` + all 13 `.claude/agents/*.md` spawn stubs. It did **not** touch `docs/standards/` (out of its stated scope).
   - `b3612720a` (2026-06-23) re-registered `.mcp.json`'s server explicitly under the name `"gateway"` — consistent with, and downstream of, the June-16 rename.
   - `a6031047e` (2026-07-08) added §6 Degraded-Mode to the contract doc and **still used the stale prefix** (`mcp__claude_ai_gateway__*` at line 94) — i.e. the drift has been silently re-entrenched on every subsequent edit to this file for a month, not just frozen at creation.
3. **Volume corroborates direction, not just recency**: 336 live occurrences of `mcp__gateway__call_tool` repo-wide vs 95 of `mcp__claude_ai_gateway__` (the latter overwhelmingly in dated historical/archival records — see §2 below).

**Conclusion (high confidence, not just "likely correct" per router note): `mcp__gateway__call_tool` is unambiguously canonical.** `docs/standards/gateway-call-contract.md` is the loser doc — it was simply out of scope of the June-16 rename sweep and nobody has closed the gap since, including the ultracode-audit's own broader inventory (see §4 — this exact primitive was independently flagged as `router-dispatch-locking-I11` for a *different* file and `cowork-cycle-agents-I14` for a *third* file, both already change-specified but neither overlapping this task's target file).

---

## 1. Requirements

### FR-1 — Reconcile `docs/standards/gateway-call-contract.md` (the CRITIC-flagged file itself)
DDD layer: **interface** (this doc is the agent-facing contract/interface spec for the MCP call surface, not domain logic).
Exact lines needing `mcp__claude_ai_gateway__` → `mcp__gateway__`:
- L13 (§1 canonical call form)
- L30, L31, L32 (§2 meta-tool table: `search_tools`, `list_server_tools`, `list_servers`)
- L94 (§6 Degraded-Mode load-condition line — currently reads `` `mcp__claude_ai_gateway__*` / `mcp__gateway__*` `` — this line should collapse to the single canonical prefix, not list both)

L20's `SSOT: CLAUDE.md § MCP Tools` cross-reference is already correct and should stay — it's the anchor proving CLAUDE.md was always intended as the upstream SSOT for this section; the doc just never got updated to match it.

### FR-2 — Reconcile the other three live/active reference docs found by direct grep (NOT covered by I11/I14, see §4)
DDD layer: **interface**.
- `docs/standards/mcp-tools.md:28` — "Quick reference" line, same call form.
- `docs/protocols/task-lock-protocol.md:162` — sprint-close verification checklist instruction ("Call each new/modified tool against the live gateway via `mcp__claude_ai_gateway__call_tool`"). **Distinct file from `.claude/skills/task-lock/SKILL.md:169`**, which I11 already change-specifies — do not assume I11 covers this one too, it does not (different file, both currently stale).
- `docs/guides/guide-agent-definition-frontmatter.md:23,25` — the guide new agent authors read to pick a `tools:` line; currently teaches the stale prefix, meaning any agent authored by following this guide today would ship broken.
- `docs/REQ_DYN-WF-FOUNDATION.md:134,332` — a requirements spec (this doc's own genre) with a live acceptance-criterion example and an NFR row citing the stale prefix.
- `docs/data/quality-checklist.json:2347` — a `recheck_how` field (machine-readable re-verification instruction) citing the stale prefix; if ever executed literally by an agent, it fails.

### FR-3 — §6 Degraded-Mode audit pass (explicitly flagged by the router)
DDD layer: **interface / infrastructure boundary** (this section documents client-transport failure handling, i.e. how the interface degrades when the infra connection is absent).
Beyond the L94 prefix fix (FR-1), confirm no other part of §6 (L92-115) silently assumes the old prefix is still valid — read through §6b's workaround coverage matrix and §6d de-escalation rule; both are prose-generic (they say "gateway meta-tools" without hardcoding the wrong prefix) and do not need changes beyond L94. No other §6 edits required — flag this to architect as "audited, only L94 needed a fix" so the pass isn't silently skipped nor over-edited.

### FR-4 — Blast-radius guard: CLAUDE.md is NOT touched
DDD layer: **N/A (process constraint)**.
CLAUDE.md already carries the correct, canonical `mcp__gateway__call_tool` form (confirmed live-read this cycle, matches the June-16 rename). **Zero CLAUDE.md edits are in scope for this task.** Any implementation that touches CLAUDE.md is out of spec and must bounce back through PO (CLAUDE.md is the router's/every agent's operative instruction — highest blast-radius file in the repo).

### FR-5 (non-blocking, architect-ratify) — Permission-grant config carries the stale prefix too
DDD layer: **infrastructure (tool-permission ACL, not code)**.
Both `.claude/settings.local.json` (project) and the global `~/.claude/settings.json` explicitly allow/deny `mcp__claude_ai_gateway__*` tool names but neither lists `mcp__gateway__*` at all. This is why the router's probe worked anyway (global `defaultMode: "auto"` + no explicit deny for `mcp__gateway__*`) — not a hard blocker — but it means the *permission surface* still names the legacy connector while the *documented contract* is being reconciled to the new one. Flag to architect as a judgment call: (a) leave as-is (functionally fine, `auto` mode covers it), or (b) add `mcp__gateway__*` alongside for explicitness/symmetry. This is config, not a doc fix — outside this task's file-edit scope; note only, do not action without architect/ops sign-off (global `~/.claude/settings.json` is outside repo control entirely).

---

## 2. Historical/archival docs — explicitly OUT OF SCOPE, do not edit

Grep surfaces ~95 total occurrences of `mcp__claude_ai_gateway`. The 4 files in FR-1/FR-2 above are the only **live, currently-read-as-instruction** references found. The remainder are dated point-in-time records that must stay byte-accurate to what was true when written (editing them would falsify the historical record, a documented anti-pattern in this repo — audit trails are never rewritten):

- `docs/signals/processed/*.json` (4 files — closed signal records)
- `docs/agent-memory/decisions/*` (sprint decision logs — append-only, dated)
- `docs/agent-memory/sessions/*`, `docs/agent-memory/notebooks/archive/*` (archived session/notebook snapshots)
- `docs/architecture-briefs/2026-06-14-*`, `2026-05-19-*`, `2026-05-31-*` and `2026-07-12-ultracode-workflow-improvement-audit.md` itself (the audit brief's own citation of the drift, at L1977 and the task-row title it minted, is evidence text — never rewrite the finding that describes the bug)
- `docs/protocols/dev-star-gateway-binding.md` and `docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md` (WF-3 SPIKE ruling, dated 2026-06-06/07 — describes a real mechanical finding that was true *before* the June-16 rename; rewriting it would misdate when the fleet-wide rename actually happened)
- `docs/handoffs/*` (8 files, all dated point-in-time handoffs), `docs/incidents/2026-05-06-*`, `reports/TASK_REPORT_*` (3 files), `docs/po-decisions/2026-05-23-*`, `docs/spikes/SPIKE_C86_MCP_REG.md`, `docs/context-capture/context-data-flow-capture.md`, `docs/agent-memory/scheduled-task-execution-*`
- `codebase-analysis-docs/**` — generator-produced snapshot docs (check regeneration source before ever hand-editing; hand-editing a generated artifact is overwritten on next regen and is not a durable fix)
- `docs/data/orch/orch-state.json` — has zero live `mcp__claude_ai_gateway` occurrences today (checked directly); no action needed there.

**Edge case:** `docs/agent-memory/decisions/po-decisions.md` is a rolling *live* log (currently `M` in git status) but its entries are individually dated/append-only — same rule applies: do not retroactively edit past entries; only new entries going forward should cite the current prefix (no action needed, it's a writing-convention note for future entries, not a file edit).

---

## 3. Edge cases (VN-specific / data-quality — not applicable to this doc-only task)

None. This is a pure documentation/config-contract task with no data-plane, locale, or BCTC involvement — noting the "N/A" explicitly per spec template rather than omitting the section.

---

## 4. Coordination note — do not duplicate I11/I14 (already change-specified elsewhere in the same audit)

The same 2026-07-12 ultracode audit brief already independently found and fully change-specified two **other** files with this identical drift, at lines the brief itself pins:
- `router-dispatch-locking-I11` → `.claude/skills/task-lock/SKILL.md:169`
- `cowork-cycle-agents-I14` → `docs/agents/tran-ngoc-bau/flow/bootstrap.md:30`

Checked `.task_board` (all lanes) this cycle: **neither I11 nor I14 has its own board row yet** — only this task (UC-CRITIC-GATEWAY-CONTRACT-DRIFT) is in `in_progress`. Architect should decide: fold I11+I14's two one-line fixes into this task's commit (same primitive, near-zero marginal cost, avoids a second P1/P2 round-trip for an identical 1-line diff class), OR confirm they're tracked to be picked up separately and explicitly exclude them here to avoid scope creep. Either is acceptable — this is an architect call, not a PO blocker (pure sequencing/batching, not a product decision).

---

## 5. Blockers

**None.** Zero questions requiring PO. The router's routing note pre-authorized "reconcile the contract to CLAUDE.md unless tool-registry says otherwise" — independent verification this cycle (git archaeology + `.mcp.json` + settings files) confirms CLAUDE.md's `mcp__gateway__call_tool` is correct with high confidence, no ambiguity remains for PO to resolve.

---

## 6. Recommended fix set for architect (file:line, from-prefix → to-prefix)

| # | File | Lines | Change |
|---|------|-------|--------|
| 1 | `docs/standards/gateway-call-contract.md` | 13, 30, 31, 32, 94 | `mcp__claude_ai_gateway__` → `mcp__gateway__` (L94: collapse dual-prefix mention to single canonical prefix) |
| 2 | `docs/standards/mcp-tools.md` | 28 | same |
| 3 | `docs/protocols/task-lock-protocol.md` | 162 | same |
| 4 | `docs/guides/guide-agent-definition-frontmatter.md` | 23, 25 | same |
| 5 | `docs/REQ_DYN-WF-FOUNDATION.md` | 134, 332 | same |
| 6 | `docs/data/quality-checklist.json` | 2347 | same |
| (opt.) | `.claude/skills/task-lock/SKILL.md` | 169 | same — only if architect folds in I11 |
| (opt.) | `docs/agents/tran-ngoc-bau/flow/bootstrap.md` | 30 | same — only if architect folds in I14 |

No CLAUDE.md edit. No historical/archival doc edits (§2). No code changes (BUILD-STANDARD: not-applicable — pure doc reconciliation).

---

## RETURN
DONE: BA spec complete, requirements written, zero PO blockers.
NEXT: architect — reconcile `docs/standards/gateway-call-contract.md` (+ 5 adjacent live docs) to `mcp__gateway__call_tool`, per fix table above.
HANDOFF: docs/handoffs/UC-CRITIC-GATEWAY-CONTRACT-DRIFT-BA-spec.md
PIPELINE: continue

---

## [Architect] Brownfield Findings

**Zone:** cross-service/ — no `apps/<service>/` file is touched anywhere in this task; every target is `docs/`, `.claude/skills/`, or `docs/agents/<agent>/flow/` (agent-facing contract/skill docs, not application code). Confirmed board row `UC-CRITIC-GATEWAY-CONTRACT-DRIFT.zone` already carries this label — no correction needed.

**Verified paths (RAW re-read at HEAD, byte-exact, all 6 BA-cited lines confirmed — zero discrepancies found):**
- `docs/standards/gateway-call-contract.md:13,30,31,32,94` — confirmed. L94 currently reads the dual-prefix form `` `mcp__claude_ai_gateway__*` / `mcp__gateway__*` `` and must collapse to the single canonical prefix (not delete the sentence, just the stale half).
- `docs/standards/mcp-tools.md:28` — confirmed.
- `docs/protocols/task-lock-protocol.md:162` — confirmed.
- `docs/guides/guide-agent-definition-frontmatter.md:23,25` — confirmed (BA's spec said "23,25"; both are table rows, verified present at those exact lines).
- `docs/REQ_DYN-WF-FOUNDATION.md:134,332` — confirmed.
- `docs/data/quality-checklist.json:2347` (`recheck_how` field) — confirmed via direct line read.
- FR-3 §6 audit pass (L92-115) — re-read in full: §6b's workaround matrix and §6d's de-escalation rule are prose-generic ("gateway meta-tools", no hardcoded prefix); L107's `mcp_call_gateway_meta` discussion is a different call surface (raw JSON-RPC bash bridge, not the tool-binding prefix) and correctly out of scope. **Ratified: only L94 needs a fix, pass is not silently skipped nor over-edited.**

**Reuse patterns:** N/A — pure find/replace across existing docs, no new interfaces, no code.

**Design decisions — ruling on BA's 3 open questions:**

1. **Batch-or-separate (I11/I14) → RULE: FOLD IN.** Traced both IDs past BA's citation: `router-dispatch-locking-I11`/`P9` and `cowork-cycle-agents-I14`/`P12` in `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md` (lines 115/299-307 and 864/1012-1018) are **already tracked** — as sub-bullets inside two live `BACKLOG` SPIKE rows: `UC-RDL-UNVERIFIED-BATCH` (9-item PLAN-ONLY umbrella, `next_agent: ba`) and `UC-CCA-UNVERIFIED-BATCH` (8-item PLAN-ONLY umbrella, `next_agent: ba`). Both require a full BA-spike-then-decompose cycle before ANY of their bullets ship — heavy overhead for a 1-line mechanical fix identical in class to the 6 already batched into this task. Folding in costs near-zero marginal risk (same prefix-swap, zero design decisions) and avoids duplicate future verification work. Add to fix table:
   - `.claude/skills/task-lock/SKILL.md:169` — `mcp__claude_ai_gateway__call_tool` → `mcp__gateway__call_tool`.
   - `docs/agents/tran-ngoc-bau/flow/bootstrap.md:30` — same.
   **PM action required post-ship (not architect's to execute):** update `UC-RDL-UNVERIFIED-BATCH.note` to drop "P9 (gateway tool-name drift in INV-GATEWAY-1)" from its 9-item list (→ 8 remaining) and `UC-CCA-UNVERIFIED-BATCH.note` to drop "P12 (fix stale wrapper name in TNB bootstrap)" (→ 7 remaining), via `scripts/orch-apply.sh`, so a future BA spike on either batch doesn't re-investigate already-shipped work. Do NOT edit the frozen `2026-07-12-ultracode-workflow-improvement-audit.md` brief itself — it is evidence text (§2 exclusion applies).
2. **Settings symmetry → RULE: LEAVE AS-IS, no edit.** `.claude/settings.local.json` is globally gitignored (`~/.config/git/ignore:1:**/.claude/settings.local.json`) — zero commit surface exists in this repo for it regardless of ruling. Global `~/.claude/settings.json` is outside repo control entirely. `defaultMode:"auto"` already covers the functional gap (confirmed live — this session's `mcp__gateway__call_tool` calls work despite the stale ACL entry). Flag stands for the user/ops if explicit symmetry is ever wanted; no action item for this task.
3. **Historical exclusion → RULE: RATIFIED as specified.** Spot-checked the frozen audit brief (confirmed genuinely evidence-text, matches §2's own reasoning) and the `po-decisions.md` rolling-log edge case (append-only, no retroactive edit needed). BA's ~40-file exclusion list stands unchanged — no exceptions found.

**DDD layer:** interface (all FR-1/FR-2/fold-in files are agent-facing contract/skill docs — call-surface spec, not domain logic). FR-4 is N/A (process constraint, zero CLAUDE.md edits, reconfirmed: CLAUDE.md's `mcp__gateway__call_tool` already correct, untouched). FR-5 is infrastructure (permission ACL) but explicitly not actioned per ruling above.

**Risk flags:**
- Mechanical find/replace across 8 files (6 BA + 2 folded-in) — low risk, but each edit MUST use an exact old_string match (not a blind sed-all) since `docs/standards/gateway-call-contract.md:94` requires a *collapse* (delete stale half of a dual-mention), not a straight 1:1 swap — a naive global regex replace would incorrectly leave `` `mcp__gateway__*` / `mcp__gateway__*` `` (duplicated) instead of the single collapsed form.
- Post-edit verification required: `grep -rn "claude_ai_gateway" <8 files>` must return zero hits across all 8 after edits, before flipping this task off IN_PROGRESS.
- No test strategy needed — BUILD-STANDARD: not-applicable (doc-only, no executable code, no new interfaces).

**BUILD-STANDARD:** not-applicable (BUG-FIX/doc-reconciliation, in-zone, no new primitives) — matches BA's classification, ratified.

**Scan clean:** true ✓ — all 8 target files independently re-verified at HEAD this cycle; zero discrepancies from BA's spec found.
