# Architecture Brief — CCATO Truth-Gate, MCP-Native Port

**Date:** 2026-07-17
**Author:** architect
**Board row:** `SPRINT-CCATO-TRUTHGATE-MCP-NATIVE` (P0, user-prioritized 2026-07-14, supervised architect→pm)
**Status:** READY — route to pm for decomposition

---

## 1. Trigger

`docs/signals/processed/digest-predict-2026-07-12T174500Z-bug-escalation.json` (fingerprint `6856dd31`, recurred 2x same day): digest-predict's cowork subagent binding has **no Bash** (Read/Write/Edit + gateway only), which blocks its mandatory P-5.5 CLAIM-TRUTH-GATE step — that step currently shells out to `scripts/narrative-truth-gate.sh`.

PO triage (`docs/agent-memory/notebooks/po.md` commit `4e5c56e67`, ratified 2026-07-14 DECISION-4): **fix path (b)**, not (a). Granting Bash to digest-predict was **explicitly DENIED by the user** (router `AskUserQuestion`, 2026-07-14) — no shell capability goes to any narrative cowork agent; this is a STANDING no-Bash cowork design decision, not negotiable per-agent. PO's own key insight, confirmed correct by this brief's brownfield read: `scripts/narrative-truth-gate.sh` is *already* a gateway MCP client internally (raw streamable-HTTP JSON-RPC re-probe, script L165–224) — it only needs Bash+python3 to *launch*. Porting its CCATO engine into a native `vn-market` MCP tool removes that launch dependency entirely; every Read/Write/Edit/gateway-only agent can call it like any other tool.

This is confirmed as the correct generalization, not just a digest-predict patch: all 5 target narrative agents are cowork agents with `tools_packages: [bootstrap, ...]` and **no** Bash entry — verified in `docs/agents/{fb-market-poster,unified-agent,market-watcher,alert-commander,digest-predict}/init.md`. `docs/standards/gateway-call-contract.md` §6b independently corroborates this as a structural cowork-agent class (lists alert-commander/market-watcher/digest-predict/bctc-analyst as "no-Bash cowork cycle agent").

**Structural point that makes this a full-engine port, not just a re-probe swap:** `.claude/skills/cowork-boundary/SKILL.md` states cowork agents are **forbidden** from writing `docs/data/orch/orch-state.json` (only dev-team pipeline agents may write `.head`). The bash engine's FAIL path writes a `narrative_contradiction` row to `.signal_queue.rows[]` via `scripts/orch-apply.sh`. If the new tool only re-probed and left signal-emit to the calling agent, cowork agents could never emit the signal at all. **The signal-emit must happen server-side, inside the tool** — which means the whole engine (scan → re-probe → classify → signal-emit) has to move server-side together, exactly matching PO's "port its CCATO engine" framing.

---

## 2. Brownfield Findings

**Zone:** `apps/mcp-server/` (confirmed via `jq '.project.zones[] | select(.id=="mcp-server")' docs/data/system-map.json` → `specialist: dev-mcp-server`; matches board row's `zone` field — no divergence to flag).

### 2.1 What already exists (do not duplicate)

| Artifact | Role | Status |
|---|---|---|
| `scripts/narrative-truth-gate.sh` (456L) | Bash/python3 CCATO engine — negation-lexicon scan, dimension routing, live re-probe via raw JSON-RPC to the gateway, classify, signal-emit via `orch-apply.sh` | DONE_VERIFIED (Tier-1), stays live for Bash-equipped callers |
| `docs/data/claim-tool-map.json` | SSOT: negation lexicon, dimension→tool routing, `arg_style`, `non_ticker_tokens`, `tool_null_markers` | DONE_VERIFIED — **reused unchanged**, read by both runtimes (it's data, not code) |
| `.claude/skills/claim-truth-gate/SKILL.md` | Invocation contract all 6 callers (5 narrative agents + TNB) share | DONE_VERIFIED — needs one new invocation branch (§5.6) |
| CCATO-T3 flow wiring (STEP 4d fb-market-poster, Rule AF-3 CHEF, Step 4f market-watcher, Step 4a-pre alert-commander, P-5.5 digest-predict) | Anchor points in all 5 agent flows already call the skill | DONE_VERIFIED and **live** (digest-predict's escalation proves it fires every cycle) — **no new insertion points needed**, only a swap of what the skill invokes underneath |
| `apps/mcp-server/src/infrastructure/orchStateStore.ts` — `appendSignalQueueRow()`, `writeOrchStateAtomic()` | Zod-validated, CAS-retry (3x, mtime-compare), atomic temp-then-rename write helpers for `.signal_queue.rows[]` from **inside the mcp-server TS runtime** — no shell-out to `orch-apply.sh` | Production precedent: `infrastructure/signals/improvementSignalWriter.ts` already writes `signal_queue` rows this exact way (`system-auditor` → `improvement_proposal` type). This is the accepted server-side write path for TS code; CLAUDE.md's `scripts/orch-apply.sh` wrapper rule governs *host-side/script* writers, not mcp-server's own in-process runtime. |
| `interface/mcp/tools/registry.ts` | Flat array of `register*Tools(server)` fns; `server.ts` needs zero changes to add a tool | Add 1 import + 1 array entry (pattern used by all 183 current tools) |
| `SignalRowSchema.type` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:186`) | `z.string().optional()` — free-form, no enum | **Confirmed no Zod migration needed** for `type: "narrative_contradiction"` — resolves the open item the original 2026-06-30 brief flagged ("must be added to the Zod enum if not present"); verified NOT required. |
| `docker-compose.yml` volumes for `mcp-server` | `./docs/data:/app/docs/data` (rw) + `./docs/data/orch:/app/docs/data/orch` (rw) | Confirmed: both `claim-tool-map.json` and `orch-state.json` are reachable read-write from inside the running container at the same relative paths `orchStateStore.ts`/`improvementSignalWriter.ts` already use. No infra change. |

### 2.2 Reuse map — every dimension's data-fetch is already an importable pure/infra function

The interface/mcp/tools/* files in this codebase are consistently thin wrappers; the actual data-fetch for every one of the 5 dimensions in `claim-tool-map.json` is **already separated out and exported**, independent of the MCP tool registration closure:

| Dimension | `claim-tool-map.json` `.tool` | Underlying function already exported | Verified path |
|---|---|---|---|
| `technical_indicators` | `get_technical_indicators` | `computeTAIndicators(req: {code, closes?})` | `infrastructure/microservices/clients.ts:134` |
| `foreign_flow` | `get_foreign_flow` | `getForeignFlowHistory(code, days)` → `analyzeForeignFlow(history)` | `infrastructure/db/vnstockStore.ts:579`, `domain/services/foreignFlowAnalyzer.ts:63` |
| `macro` | `get_macro_snapshot` | `macroFetch<T>(...)` + `getMacroBaseUrl()` (HTTP POST to macro-indicators svc, port 5004) | `infrastructure/fetchers/fetchDeadline.ts:143`, `interface/mcp/tools/macro/macroHttpClient.ts:15` |
| `financials` | `compare_financials` | `computePeriodDelta(current, previous, type)` + the inline `fetchRow(year, quarter)` DB query in `reports.ts` (not yet exported — see risk R-4) | `domain/services/financial-reports/periodDeltaComputer.ts:131`, `interface/mcp/tools/financial-reports/reports.ts:423-437` |
| `market_snapshot` | `get_market_snapshot` | `fetchHosePrices` / `fetchHnxPrices` / `fetchUpcomPrices` | `infrastructure/fetchers/hose.ts`, `infrastructure/fetchers/hnx.ts` |

**This means the port needs zero self-loopback HTTP call to the gateway and zero reliance on the MCP SDK's private `_registeredTools` map** (see §4 rejected alternatives) — the native tool calls the exact same domain/infrastructure functions the existing 5 tools call, in-process. This is the "extend, never duplicate" pattern already established by this codebase (e.g. `technicalIndicatorTools.ts` already separates `computeTAIndicators` from its own registration wrapper for this same reason).

**Corroborating evidence of parity, found live:** `claim-tool-map.json`'s `tool_null_markers` array already contains the literal string `"period(s) not found"` — which is the *exact* honest-NULL response text `reports.ts`'s `compare_financials` handler returns today (`"Period(s) not found in database for ${actionCode}: ..."`, `reports.ts:445`). The SSOT was evidently authored against the live tool's real output. Reusing `reports.ts`'s guard verbatim (not re-deriving it) keeps this parity intact by construction.

---

## 3. Design

### 3.1 Tool contract

**Name:** `narrative_truth_gate`
**Registered in:** new file `apps/mcp-server/src/interface/mcp/tools/system/narrativeTruthGateTool.ts` (placed alongside the other cross-cutting governance tools already in `tools/system/` — `feedbackTools.ts`, `coordinationTools.ts`, `agentMemoryTools.ts`, `cycleBootstrapTool.ts` — this is a governance/quality-gate tool, not domain-specific to macro/market-data/financial-reports).

```
call_tool(server="vn-market", tool="narrative_truth_gate", arguments={
  post_body: "<composed narrative text>",
  agent_id:  "<calling agent kebab-case id>",
  cache:     { "<TICKER>": { "<dimension_id>": <non-null value> } }  // optional
})
```

Zod schema: `post_body: z.string().min(1)`, `agent_id: z.string().min(1)`, `cache: z.record(z.record(z.unknown())).optional()`.

**Response shape** — plain-text content (matching every other tool in this codebase — no tool here returns structured JSON content), first line is a machine-parseable verdict marker so the calling flow can branch without an exit code (MCP has none):

```
GATE_VERDICT: PASS
```
or
```
GATE_VERDICT: FAIL (2 contradiction(s))
[FAIL] dimension=technical_indicators tool=get_technical_indicators ticker=VNM claim="..." returned="RSI 20.3, MACD..."
[PASS] dimension=foreign_flow tool=get_foreign_flow ticker=ANI — honest no-data confirmed: "..."
[WARN] narrative-truth-gate: dimension=macro tool=get_macro_snapshot ticker=VIC — probe inconclusive: <error>
```
or, for a config error (missing/malformed `claim-tool-map.json`, empty `post_body`):
```
GATE_VERDICT: CONFIG_ERROR: <reason>
```
with `isError: true` set on the tool response **only** for `CONFIG_ERROR` (mirrors the script's exit code `2`). A business-verdict `FAIL` is a **normal, non-error** tool response — exactly as `get_technical_indicators` returns "GIẢM" as a normal response, not an error. Setting `isError:true` on a semantic FAIL would be a protocol misuse and would confuse client-side error handling; do not do it.

The `[FAIL]`/`[PASS]`/`[WARN]` line format is byte-identical to the current script's stdout so `.claude/skills/claim-truth-gate/SKILL.md`'s existing self-correct protocol (which parses `tool=<name> ticker=<ticker>` off the `[FAIL]` line) needs **zero change** beyond the invocation branch itself.

Signal-emit on FAIL happens **inside** the tool (never delegated to the caller) — see §2.1 precedent.

### 3.2 DDD layer map (new files only — nothing existing is modified except registry.ts wiring)

```
domain/services/narrativeTruthGate/
  claimCandidateScanner.ts   — pure: sentence-split, negation-lexicon scan, dimension-keyword
                                match, ticker extraction (TS port of script L144-330, minus the
                                live-probe loop). Input: post_body + ClaimToolMap. Output: candidates[].
  verdictClassifier.ts       — pure: classify(respText, tool_null_markers) → NON_NULL|NULL|ERROR,
                                summarize() (TS port of script L251-278).
  quarterResolver.ts         — pure: resolves latest-fully-elapsed-quarter pair for arg_style
                                "ticker_actionCode_yoy" (TS port of script L236-247). Injectable
                                `now: Date` param — do not read Date.now() directly, for testability.

infrastructure/fileStore/claimToolMapLoader.ts
                                — reads + parses docs/data/claim-tool-map.json (REPO_ROOT-resolve
                                pattern from infrastructure/signals/improvementSignalWriter.ts).
                                Fail-loud on missing/malformed file → surfaces as CONFIG_ERROR.

infrastructure/probes/narrativeTruthProbeAdapters.ts
                                — 5 adapter fns, each wrapping an ALREADY-EXPORTED function from
                                §2.2's reuse map, normalized to a common
                                `ProbeResult = { raw: unknown; isError: boolean }` shape. Per-adapter
                                try/catch isolation — one dimension's transient failure (TA/macro
                                service down) classifies WARN for that candidate only, never aborts
                                the whole scan (C-5-style isolation, same pattern already used by
                                selfImproveOrchestratorJob.ts around improvementSignalWriter.ts).

infrastructure/signals/narrativeContradictionSignalWriter.ts
                                — thin wrapper over orchStateStore.appendSignalQueueRow(); builds the
                                narrative_contradiction row (id/ts/from/to/type/summary/severity/
                                status/payload) matching the script's existing row shape 1:1 (script
                                L416-437). Injectable orchStatePath (test isolation — mirrors every
                                other orchStateStore.ts caller's injectable-fn pattern).

application/usecases/runNarrativeTruthGate.ts
                                — orchestrates: load claim map → scan candidates (domain) → per
                                candidate: cache-hit short-circuit else live probe adapter →
                                classify (domain) → aggregate GateResult{verdict, fails[], warns[]}
                                → emit narrative_contradiction signal(s) on FAIL. Matches this
                                codebase's existing application/usecases/ pattern
                                (getPatternSummary.ts, finalizeBctcRefine.ts).

interface/mcp/tools/system/narrativeTruthGateTool.ts
                                — registers the MCP tool: Zod schema → runNarrativeTruthGate() →
                                format GATE_VERDICT + [FAIL]/[PASS]/[WARN] text report.

interface/mcp/tools/registry.ts — +1 import, +1 array entry (no other change).
```

Layering respects the existing convention exactly: domain/ has zero fs/network I/O; infrastructure/ does I/O only; application/ orchestrates; interface/ is a thin MCP-protocol adapter. No existing production file is modified except the 1-import/1-entry addition to `registry.ts`.

### 3.3 Data contract — unchanged SSOT, dual-runtime read

`docs/data/claim-tool-map.json` stays the single source of truth for `negation_lexicon`, `dimensions[].{id,keywords,tool,requires_ticker,arg_style}`, `non_ticker_tokens`, `tool_null_markers`. Both the bash/python engine and the new TS engine read the same file — this is a **data** file, not code, so dual-runtime consumption does not violate the "SSOT — do not duplicate" rule in `.claude/skills/claim-truth-gate/SKILL.md` (that rule targets re-listing lexicon/tool entries inline in a *script/skill*, not which runtime parses the JSON). No schema change to this file.

### 3.4 Skill dual-path (the only existing-file behavior change outside mcp-server)

`.claude/skills/claim-truth-gate/SKILL.md`'s Invocation contract gets a second branch:

- **No-Bash cowork agents** (fb-market-poster, unified-agent/CHEF, market-watcher, alert-commander, digest-predict): PRIMARY path becomes `call_tool(server="vn-market", tool="narrative_truth_gate", arguments={post_body, agent_id, cache})`.
- **Bash-equipped callers** (TNB backstop in `audit-market.md`): unchanged, still `bash scripts/narrative-truth-gate.sh` — **out of scope for this sprint** (see §6 risk R-5 for why this is deliberately deferred, not forgotten).

Each of the 5 flow files' existing anchor (STEP 4d / Rule AF-3 / Step 4f / Step 4a-pre / P-5.5) is a **single-line invocation swap** — the anchor points, self-correct protocol, and time-sensitivity override text are already correct and do not move.

---

## 4. Rejected alternatives (for the record)

1. **Self-loopback HTTP JSON-RPC** (tool makes an HTTP call back into its own gateway, mirroring what the bash script does today). Rejected: the bash script needs this because it has no native tool-call surface; a TS tool running inside the same process **does** have one — the whole point of "MCP-native" is removing that network hop, not relocating it. Also introduces event-loop reentrancy/session-header complexity for zero benefit once §2.2's direct-function reuse is available.
2. **`server._registeredTools` private-map self-dispatch** (call another tool's handler in-process via the SDK's internal registry, as `apps/mcp-server/src/__tests__/082-tool-watchlist.test.ts:40-51` does for test harnessing). Rejected for production: this is an undocumented, unstable private field on the `McpServer` SDK class, used today **only** in test code (cast via `as unknown as {...}`). Depending on it in shipped code risks silent breakage on an SDK version bump with zero compile-time signal.
3. **Re-probe-only tool, signal-emit left to the calling agent.** Rejected: cowork agents are structurally forbidden from writing `orch-state.json` (`cowork-boundary/SKILL.md`) — this alternative simply cannot work for the exact agents this sprint exists to unblock.

---

## 5. Verification gate (RAW-live probe, per PUSH-AUTONOMY-1)

1. **Unit-level, hard AC:** side-by-side fixture parity. Run BOTH the existing bash engine and the new TS domain-layer scanner against `docs/social/fb-post-2026-06-30.md` and require an **identical candidate set** (same dimension/ticker/claim_text triples) before the port is considered behaviorally faithful — not just "compiles and has green tests." This is the strongest available non-regression proof for a cross-language port of regex/sentence-split logic.
2. **Integration DoD** (`apps/mcp-server/src/__tests__/<N>-narrative-truth-gate-tool.test.ts`, using the existing `callTool()` harness pattern + in-memory DB), replaying the original brief's §9 DoD plus one new assertion:
   - (a) VNM TA-absence claim → FAIL naming VNM + a technical-indicator token
   - (b) foreign-flow-absence claim → FAIL
   - (c) genuine honest-NULL (insufficient OHLCV depth) → PASS, no false positive
   - (d) identical `post_body` → identical verdict across repeated calls (determinism)
   - (e) **new** — FAIL path appends exactly one `narrative_contradiction` row to an injectable/fixture `orch-state.json` (never the live file in tests), `type` field present and matching `SignalRowSchema`
3. **Post-merge, per PUSH-AUTONOMY-1 §5:** po mints `VERIFY-<task-id>-REALDATA` — precondition is the single-service rebuild+deploy (`docker compose build mcp-server && docker compose up -d --no-deps mcp-server`, executed by ops per the 2026-07-03 override, no user gate), then a **live** `mcp__gateway__call_tool(server="vn-market", tool="narrative_truth_gate", ...)` re-run of DoD (a) against the real running container — proves the deployed tool, not just the test suite, is behaviorally equivalent to the already-proven bash engine.
4. **Tool-registry hygiene:** re-run `scripts/gen-tool-registry.ts` after the new file lands so `docs/data/tool-registry.json`'s `totalCount` self-updates (standing "no hardcoded stats" rule) — no manual count edits anywhere.

---

## 6. Risks

- **R-1 (must-verify, not must-fix):** JS regex semantics for the Vietnamese-diacritic `\b[A-Z]{2,4}\b` ticker pattern and the `(?<=[.!?])\s+` lookbehind sentence-split must be confirmed equivalent to Python's, not assumed — closed by §5.1's side-by-side fixture parity AC.
- **R-2 (isolation):** a transient TA-microservice or macro-indicators-microservice outage inside one probe adapter must not abort the whole multi-candidate scan or silently downgrade to PASS — per-adapter try/catch → WARN only for that candidate (§3.2).
- **R-3 (accepted, non-regression):** the new tool does **not** replicate `get_technical_indicators`'s Go-service-then-local-DB-fallback dual path — it calls `computeTAIndicators` once and classifies WARN on failure. This matches the *existing* bash script's behavior exactly (it also does a single live call with no fallback) — not a new gap, just carried forward. Flagged as a possible Tier-2 enhancement, not a blocker.
- **R-4 (small extraction needed):** `reports.ts`'s `fetchRow(year, quarter)` DB query (L423-437) is currently an inline closure inside `compare_financials`'s handler, not a standalone export. The `financials` probe adapter needs the identical query (for exact honest-NULL text parity, per the `"period(s) not found"` marker match documented in §2.2). Developer should export this as a small standalone function from `reports.ts` and call it from both places — a 1-function extraction, not a rewrite. This is the only place in the reuse map that needs a (minimal, additive) touch to an existing file.
- **R-5 (deliberately deferred):** TNB's backstop and any other Bash-equipped caller stay on the bash engine for this sprint. Two engines (Python + TS) now read the same SSOT data file but contain independent detection logic — a real future drift risk if one gets a lexicon/edge-case fix and the other doesn't. Recommend a Phase-2 follow-up (not this sprint): once the TS tool is proven in production, retire the bash script's own engine and turn it into a thin CLI shim over `scripts/agents-flow/mcp-call.sh` calling the native tool (the same pattern `gateway-call-contract.md` §6b already establishes for Bash-equipped agents). Do not implement this now — out of scope, would expand this P0's blast radius unnecessarily.
- **R-6 (low):** `docs/social/fb-post-2026-06-30.md` fixture confirmed present (5205 bytes) — the DoD/parity fixture this brief depends on twice (§5.1, §5.3) will not silently go missing.

---

## 7. Decomposition-ready task list (for pm)

Board row `SPRINT-CCATO-TRUTHGATE-MCP-NATIVE` is `supervised:true` (design-first architect→pm). Suggested atomic tasks, in dependency order:

| ID | Title | Depends on |
|---|---|---|
| `CCATO-MCP-T1-DOMAIN-ENGINE` | Port pure scan/classify/quarter-resolver to `domain/services/narrativeTruthGate/*` + unit tests incl. §5.1 side-by-side parity AC | — |
| `CCATO-MCP-T2-CLAIM-MAP-LOADER` | `infrastructure/fileStore/claimToolMapLoader.ts` | — |
| `CCATO-MCP-T3-PROBE-ADAPTERS` | `infrastructure/probes/narrativeTruthProbeAdapters.ts` (5 adapters, incl. R-4's `reports.ts` extraction) | T1 (types), R-4 |
| `CCATO-MCP-T4-SIGNAL-WRITER` | `infrastructure/signals/narrativeContradictionSignalWriter.ts` | — |
| `CCATO-MCP-T5-USECASE` | `application/usecases/runNarrativeTruthGate.ts` orchestration | T1, T2, T3, T4 |
| `CCATO-MCP-T6-TOOL-REGISTRATION` | `interface/mcp/tools/system/narrativeTruthGateTool.ts` + `registry.ts` wiring + `gen-tool-registry.ts` regen | T5 |
| `CCATO-MCP-T7-SKILL-DUAL-PATH` | Update `.claude/skills/claim-truth-gate/SKILL.md` + 5 flow-file anchor lines (single-line invocation swap each) | T6 |
| `CCATO-MCP-T8-DOD-HARNESS` | Integration test suite replaying §5.2 (a)-(e) | T5, T6 |

`VERIFY-CCATO-MCP-TRUTHGATE-REALDATA` (§5.3) is minted by po post-CI-green per PUSH-AUTONOMY-1 — not a pm-decomposed task.

**BUILD-STANDARD:** lean (`apps/mcp-server/` already exists; new feature, not a new service) — per `docs/standards/microservice-build-standard.md`; dev-mcp-server drives end-to-end, no BA/architect relay required beyond this brief.

---

## 8. Decision journal

Full rationale trail: `docs/agent-memory/decisions/sprint-SPRINT-CCATO-TRUTHGATE-MCP-NATIVE-architect.md`.
