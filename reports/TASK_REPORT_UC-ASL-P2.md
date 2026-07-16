# Task Report UC-ASL-P2

**Sprint:** ULTRACODE-AUDIT-FIXALL
**Title:** One blessed emit script replaces the 6 copy-pasted EMIT SEQUENCE blocks + durable BUG-dedup ledger
**Children:** UC-ASL-P2-DEV-1 (a1bb6ee48), DEV-2/DEV-3 (35d408423), DEV-4 (319e4f40c)
**QA round:** 1 (first QA pass, no prior CHANGES_REQUESTED round)

## Changed
- `scripts/emit-audit-signal.sh` (new, 487L) + `scripts/emit-audit-signal.test.sh` (new, 265L, 48 checks)
- `docs/data/auditor-dedup-ledger.json` (new, script-managed sidecar; correctly absent from disk pre-first-real-send)
- `docs/agents/system-auditor/flow/main.md` (4 sites replaced: :292-303 Tier-2, :319-329 D-BCTC-EVAL, :397-409 D-IMPROVE, :583-596 Tier-3)
- `docs/agents/system-auditor/flow/tier1-probe.md` (2 sites replaced: :86-97, :124-138)
- `docs/data/system-auditor-known-issues.json` (deleted, 223L)
- `scripts/agents-flow/context-bloat-backstop.sh` (dead gate removed, :18-25 header comment + :185-203 fingerprint gate)
- `docs/references/tree-map.md:252/407`, `docs/references/bundles/bundle-architect.md:74/94` (repointed to new ledger)

## Tests (RAW-reproduced myself, not developer self-report)
- `scripts/emit-audit-signal.test.sh` — **48/48 pass, run 6× back-to-back (0 flake)**, incl. the exact CAS-retry / row-id-collision-race scenario the `e35634fd7` fix targets.
- Additional stress test (not in the harness): sourced the script directly and generated 500 `_gen_row_id()` calls in a tight same-second loop — **0 collisions**, corroborating the `$RANDOM` 4-hex-digit disambiguator fix.
- `scripts/agents-flow/context-bloat-backstop.test.sh` — **2/2 pass** (post dead-gate deletion — confirms `EXISTING_SIGNAL` check at :175-183 remains the sole, functioning suppression guard).
- `mock-guard.sh --files "<all 7 touched files>"` → PASS (no production-source-extension match; non-blocking either way).

## AC verification (BA-spec AC-1..AC-6)
- **AC-1** PASS — script executable, sources `mcp-call.sh` (not reimplemented), `[emit-signal] ABORT e1-failed ...` fires non-zero on E-1 failure (T6, and independently reproduced live — see Blocking Issue below).
- **AC-2** PASS — T1/T2/T3 (fresh-key OK+ledger-write, same-key-in-window SKIP-dedup, aged-past-7d re-send) all green; T4 escalation-bypass (WARN→CRITICAL) also green.
- **AC-3** **FAILS in production for 2 of 6 sites** — see Blocking Issue. The mocked test harness reports PASS for all 12 cases because `mcp_call()` is stubbed to always succeed regardless of `signal_type` value (by design, to keep the suite network-free) — this masks a real transport-level rejection that only manifests against the live MCP server's Zod schema.
- **AC-4** PASS — `git show 35d408423` diff-reviewed byte-for-byte: all 6 sites replaced with a script call, verdict-branch prose kept, no Edit-tool multiline-strip artifacts (Write-tool used per commit message, diff is clean single-block replacements).
- **AC-5** PASS — `docs/data/system-auditor-known-issues.json` deleted; `grep -rn system-auditor-known-issues.json docs/references/ scripts/` → **zero hits** (the live functional pointer locations); `context-bloat-backstop.sh`'s dead gate (:185-203) + header comment (:18-25) removed, `EXISTING_SIGNAL` guard at :175-183 untouched (confirmed via diff + test still 2/2). Remaining grep hits repo-wide are exclusively in historical docs (architecture-briefs, other handoffs, ba/notebook prose, orch-state task-detail text) — explicitly exempted by AC-5's own wording.
- **AC-6** PASS mechanically (marker line is grep-able and was produced, live, during my own verification run) but the marker produced for sites 1/2 in a real invocation is `ABORT e1-failed`, not `OK`/`SKIP-dedup` — i.e. AC-6 is satisfied on marker *format*, but the marker it actually emits in production reveals the AC-3 regression.

## Blocking Issue — VERDICT: CHANGES_REQUESTED

**`scripts/emit-audit-signal.sh:232`** (inside `_run_e1()`): `--arg st "$CATEGORY_TYPE"` feeds `signal_type:$st` into the `post_agent_signal` MCP call. This directly implements BA-spec FR-2 ("`signal_type=$category_type`") and Architect design decision 1, both of which conflate two *different* fields:
- the E-3 signal-queue row's free-form `type` field (no schema constraint, always was `data_stale`/`db_integrity_breach` etc.), vs
- the `post_agent_signal` MCP tool's `signal_type` **argument**, which is a hard, closed Zod enum (`apps/mcp-server/src/infrastructure/db/agentSignalStore.ts:39-50`): `urgent_news | price_anomaly | cross_validate | suppress | chain_catalyst | fundamental_validation | price_confirmation | verified_chain | signal_feedback | legal_risk | verified_decision`. Neither `data_stale` nor `db_integrity_breach` is a member.

The **pre-refactor code** (`git show 35d408423^:docs/agents/system-auditor/flow/main.md:298` / `:592`) hardcoded `"signal_type": "signal_feedback"` for the E-1 call at every site — a valid enum member — while using the semantic label (`data_stale`, `db_integrity_breach`) only in the E-3 row's `type` field. The refactor's `--category-type` argument now unintentionally does double duty for both fields, breaking E-1 for exactly the 2 sites where `category_type` isn't `signal_feedback`.

**Live, RAW-verified reproduction** (real MCP gateway call, not a mock):
```
$ ARGS='{"from_agent":"qa-verification-probe","to_agent":"qa-verification-probe","signal_type":"data_stale","payload":{...}}'
$ bash scripts/agents-flow/mcp-call.sh post_agent_signal "$ARGS"
[mcp-call] ERROR: tool=post_agent_signal isError=true: MCP error -32602: Input validation error:
Invalid arguments for tool post_agent_signal: [{"received":"data_stale","code":"invalid_enum_value",
"options":["urgent_news","price_anomaly","cross_validate","suppress","chain_catalyst",
"fundamental_validation","price_confirmation","verified_chain","signal_feedback","legal_risk",
"verified_decision"],"path":["signal_type"], ...}]
EXIT=1
```
Then ran the **actual, unmocked** `scripts/emit-audit-signal.sh` (only the write path pointed at a scratch `orch-state.json` copy; E-1 transport hit the real gateway) with the **exact** arguments `docs/agents/system-auditor/flow/main.md:296-302` (Tier-2, site 1) constructs:
```
$ bash scripts/emit-audit-signal.sh --check-id B-04 --category-type data_stale --severity WARN \
    --summary "QA-VERIFY-PROBE do-not-action" --detail-json '{"dedup_key":"data_stale:QA-VERIFY-PROBE:B-04"}'
[emit-signal] ABORT e1-failed [mcp-call] ERROR: ... "received": "data_stale", "code": "invalid_...
RC=1  signal_queue.rows BEFORE=2 AFTER=2   ← E-3 never reached, row NOT written
```

**Blast radius:** `main.md:298` (Tier-2 `data_stale`, site 1) and `main.md:592` (Tier-3 `db_integrity_breach`, site 2) will **abort at E-1 on every real invocation** — the two highest-frequency audit categories in the whole system-auditor. Because `run_emit_signal()` does `_run_e1 || return 1` (script:458), E-1 failure short-circuits before E-2 (Telegram) or E-3 (signal-queue row + read-back) ever run — so in production this ships as **complete signal loss** (zero row, zero Telegram) for stale-source and DB-integrity findings, exactly the "passive health masks dead data" failure class this whole sprint exists to fix.
Sites 3/4 (`--e3-only`, E-1 skipped by design) and sites 5/6 in `tier1-probe.md` (`--category-type "signal_feedback"`, a valid enum member, unchanged from legacy behavior) are **not** affected — confirmed via `grep -n "category-type" docs/agents/system-auditor/flow/*.md`.

**Root cause is a spec defect (FR-2 / architect design decision 1), faithfully implemented by dev — not a developer bug.** Recommended fix (mechanical, bounded): decouple the two fields inside `_run_e1()` — either (a) hardcode `signal_type: "signal_feedback"` for the E-1 transport call unconditionally (matches 100% of legacy behavior, zero behavior change), or (b) add a distinct `--signal-type` CLI arg (default `signal_feedback`) so `--category-type` continues to feed only the E-3 row's `type` field + `detail_json`'s implicit categorization, unchanged. Either fix is a small, local diff — no redesign of FR-3/FR-4/FR-5/CAS-retry/ledger needed.

## Non-blocking observations
1. `docs/data/system-auditor-known-issues.json`/dead-gate cleanup (DEV-4) is clean and correctly scoped — no notes.
2. D-IMPROVE site (main.md:397-409, `--e3-only`): the script's generic row shape hardcodes `payload_ref: null` (FR-5's own literal), so improvement-proposal signal rows lose the previous `payload_ref: "{proposal-path}"` click-through. This is spec-mandated (FR-5 as written), not something dev introduced beyond spec, and dev transparently flagged the loss inline in the replacement prose (main.md:409). Not an AC violation — flagging for backlog only if PO wants traceability restored.
3. Ledger read-modify-write race under concurrent same-tick invocations — already identified and explicitly accepted (not blocking) by architect design decision 6; no new information here.

## DDD / Security / Injection review of `scripts/emit-audit-signal.sh`
- All `mcp_call`/`orch-apply.sh` JSON bodies built via `jq -n --arg`/`--argjson` bound params only (`_run_e1`, `_send_bug_telegram`, `_send_orphan_bug_telegram`, `_build_row_json`, `_ledger_upsert`, `_e3_write_row`) — zero string concatenation into a jq filter or shell command. `--detail-json` is validated as parseable JSON (`jq -e .`) before any use (script:185-188).
- Fail-loud confirmed structurally: `_run_e1` return propagates to `run_emit_signal`'s `|| return 1` (script:458); `_e3_write_row` aborts loud on rc=1/3/cas-exhausted/readback-failure (script:339-369). Only E-2 (`send_telegram`) is dedup-gated (script:461-463) — E-1/E-3 unconditional otherwise, matching Hard Constraint 4/5.
- No hardcoded structural data — `check_id`/`category_type`/`severity`/`from_agent`/`to_agent` all named CLI args; `SEVEN_DAYS_SECONDS` is the FR-3-specified business constant, not service/zone/watchlist data.
- `send_telegram` usage (`channel:"bug"`) verified against the live schema (`apps/mcp-server/.../telegramTools.ts:36-37`, `z.enum(["market","work","bug"])`) — compliant.
- bash 3.2-safety confirmed: no `mapfile`, no associative arrays, only `case`/indexed-array/jq lookups.

## Verdict
**CHANGES_REQUESTED.** Did not promote UC-ASL-P2 or its children to `done_verified`. Did not touch `docs/data/orch/orch-state.json` / `.task_board` / `.head`. Did not commit/push production code. Did not merge. Recommend bounce to **fixer** (round 1) for the bounded `_run_e1()` fix described above; flag to **architect** in parallel that FR-2's `signal_type=$category_type` directive itself needs a one-line correction in the BA-spec/architect-brief record so future readers don't re-introduce the same conflation.
