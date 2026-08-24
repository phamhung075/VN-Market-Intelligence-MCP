# Decision Journal — Sprint SPRINT-CCATO-TRUTHGATE-MCP-NATIVE · dev-mcp-server

**Sprint goal:** Port the CCATO claim-truth-gate engine (`scripts/narrative-truth-gate.sh`) into a native `vn-market` MCP tool so the 5 no-Bash narrative cowork agents can run the mandatory pre-write gate without shell access.
**Agent:** dev-mcp-server
**Started:** 2026-07-30T19:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-30T19:00:00Z
**task-id:** CCATO-MCP-T1-DOMAIN-ENGINE
**what-done:** Ported `scanClaimCandidates`/`classifyVerdict`/`resolveLatestElapsedYoyPeriods` to `domain/services/narrativeTruthGate/*`, zero I/O; added `CCATO-MCP-T1-DOMAIN-ENGINE.test.ts` (28 tests incl. the §5.1 side-by-side parity AC against the real bash engine).
**what-considered:**
- Hand-derive expected candidates from reading the python script vs. actually running the existing bash/python engine (with its live network probe intercepted by a local stub) and diffing its real stdout against the new TS scanner — chose the live-engine diff: it's the literal §5.1 AC wording ("run BOTH... require an identical candidate set"), and R-1's regex-divergence risk can only be closed empirically, not by inspection.
- `classifyVerdict` accepting a T3-shaped `{raw,isError}` wrapper vs. accepting the raw `resp_obj`-like value the python script itself uses (incl. its `{_probe_error}` sentinel) — chose the latter: T1 has no dependency on T3 (not yet built), and this stays a byte-faithful port of script L251-278 rather than inventing a new contract T3 must then conform to.
**why-decision:** The parity harness (fixed-non-null stub gateway forcing every candidate to FAIL so `claim_text` prints) ran cleanly against `docs/social/fb-post-2026-06-30.md` on the first attempt — TS/python candidate sets were byte-identical (2/2), closing R-1 for this fixture without needing a regex rewrite.
**why-change:** No change from the architect brief's §3.2 file layout / §5.1 AC — this operationalizes both exactly as specified.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-08-06T07:57:10Z
**task-id:** CCATO-MCP-T4-SIGNAL-WRITER
**what-done:** Built `infrastructure/signals/narrativeContradictionSignalWriter.ts` (+ split-out `narrativeContradictionSignalTypes.ts`, size-lint <=120L each) — thin wrapper over `orchStateStore.appendSignalQueueRow()`, byte-faithful port of script L417-437's row dict. 9 new tests, 26 expect().
**what-considered:**
- `OrchStateSignalRow`'s TS param type only declares `payload_ref: string|null` (file-ref convention), but the bash row uses an object-shaped `payload` (agent_id/claim/tool/ticker/probe_ticker/returned_value/cycle/gate_version) — extended the interface (`NarrativeContradictionSignalRow extends OrchStateSignalRow { payload: ... }`, `payload_ref: null` to satisfy the required base field) rather than writing a bespoke fs read-modify-write here; `SignalRowSchema` is `.passthrough()` so the extra key + harmless null `payload_ref` both validate cleanly — confirmed via `OrchStateSchema.safeParse` in tests, not just inspection.
- Script L445's `--arg who "narrative-truth-gate"` sets `.signal_queue._updated_by` to the WRITER/tool identity, not the calling agent's `agent_id` (which only appears inside the row's own `from`/`payload.agent_id` fields) — easy to miss (both look like "the agent" at a glance); added `SIGNAL_WRITER_ID = "narrative-truth-gate"` constant and a dedicated test asserting `_updated_by !== callingAgentId` so this fidelity point can't silently regress.
- Single-finding vs. array-only write API — chose array-only (`writeNarrativeContradictionSignals(findings[], ...)`, looping internally, one `appendSignalQueueRow` call per finding own CAS window) since brief §3.2 says T5 emits "signal(s)" (plural) per gate run; empty array is an explicit no-op branch, not a caller-side guard.
**why-decision:** Reusing `appendSignalQueueRow`/`writeOrchStateAtomic` verbatim (T4 has zero bespoke fs writes) keeps the atomic-rename/CAS-retry/Zod-validation guarantees intact for free, matching the brief §2.1 precedent (`improvementSignalWriter.ts`) exactly; the interface-extension approach is the smallest change that reconciles the pre-existing `payload_ref`-only type with the script's `payload`-object row shape without touching `orchStateStore.ts` (out of this task's file list).
**why-change:** No change from brief §3.2's named file/shape — the `narrativeContradictionSignalTypes.ts` split is additive (same size-lint-driven precedent T1/T2 already established this sprint for brand-new files).

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-08-24T15:07:00Z
**task-id:** CCATO-MCP-T7-SKILL-DUAL-PATH
**what-done:** Rewrote `.claude/skills/claim-truth-gate/SKILL.md` into an explicit Path A (MCP-native `call_tool narrative_truth_gate`, primary for the 5 cowork agents) / Path B (bash script, TNB-only) contract, then swapped the 5 T3 anchors (fb-market-poster/daily.md STEP 4d, unified-agent/chef-dish.md Rule AF-3, market-watcher/cycle.md Step 4f, alert-commander/stage-dispatch-log.md Step 4a-pre, digest-predict/daily-predict.md P-5.5) from `GATE_EXIT = skill ...` (bash exit-code idiom) to `GATE_VERDICT = call_tool(...)` (text-verdict idiom), leaving self-correct/time-sensitivity prose untouched per brief.
**what-considered:**
- Also swapping qa-responder/cycle.md + digest-predict/{daily,weekly,monthly}.md (which reference the same skill but were never part of T3's original 6-anchor list) vs. staying inside brief §3.4's named 5 — chose staying inside the named 5: the brief's own decomposition table says "5 flow-file anchor lines", TNB (audit-market.md) is explicitly R-5-deferred, and those extra 4 files still work correctly post-edit since they only ever pointed at the shared skill (no local exit-code prose to go stale).
- Full block rewrite per anchor vs. a literal single line — brief called it a "single-line invocation swap" but the anchors' `Invoke:`/`Exit-code handling:` blocks hard-code bash exit-code semantics (0/1/2) throughout; a true 1-line edit would leave the surrounding bullets internally inconsistent, so I swapped the invocation call + relabeled the 3 outcome bullets (0→PASS/1→FAIL/2→CONFIG_ERROR) while leaving self-correct steps/time-sensitivity text byte-identical, matching the brief's "anchor points... already correct and do not move" constraint on everything except the call itself.
**why-decision:** `narrative_truth_gate`'s `[FAIL]`/`[PASS]`/`[WARN]` line format is byte-identical to the bash script's stdout (confirmed via CCATO-MCP-T6-TOOL-REGISTRATION.test.ts, re-ran 10/10 pass this task) so the self-correct protocol's stdout-parsing prose needed zero change — only the outer invocation/verdict-source needed updating.
**why-change:** No change from brief §3.4 — TNB/Path B deliberately left alone (R-5), matching the brief exactly.
