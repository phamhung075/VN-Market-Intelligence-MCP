<!-- size-justification: SPRINT-S/M spec — 6 copy-site inventory, script contract, durable-ledger persistence shape, DDD mapping, acceptance criteria, zone note for architect. Structural load-bearing for architect+pm+dev chain. -->

# BA Spec — UC-ASL-P2

**Sprint:** ULTRACODE-AUDIT-FIXALL
**Source:** `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#auditor-signal-loop-P2` (verdict: CONFIRMED)
**Zone (as dispatched):** `cross-service/`
**Chain:** ba → architect → pm → dev → qa
**BA task_id:** UC-ASL-P2
**Created:** 2026-07-16T04:40:00Z
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS

---

## Summary

`docs/agents/system-auditor/flow/main.md` and `tier1-probe.md` copy-paste the same 3-step EMIT SEQUENCE (E-1 `post_agent_signal`, E-2 `send_telegram` dedup-gated, E-3 signal-row append + read-back) six times, and the six copies have already drifted (`signal_type` disagrees: `signal_feedback` vs `data_stale` vs `db_integrity_breach`). The 7-day BUG-dedup rule (main.md:661) names no durable store — dedup is left to LLM notebook recall, which is capped at 3 sections and cannot span 7 days. The one candidate ledger, `docs/data/system-auditor-known-issues.json`, is stale since 2026-05-01, unwired (no flow file reads it), and has duplicate fingerprints. Fix: extract one script, `scripts/emit-audit-signal.sh` (pattern proven by `scripts/auditor-notebook-commit.sh` + `scripts/agents-flow/mcp-call.sh`), and a new durable ledger `docs/data/auditor-dedup-ledger.json`.

---

## The 6 copy-paste sites (verified line-exact at HEAD)

| # | File | Lines | Current `type`/`signal_type` | Emits |
|---|---|---|---|---|
| 1 | `main.md` (Tier-2, per stale source) | 292–328 | `data_stale` | E-1+E-2+E-3+read-back |
| 2 | `main.md` (Tier-3, per failing DB check) | 592–628 | `db_integrity_breach` | E-1+E-2+E-3+read-back |
| 3 | `main.md` (D-IMPROVE) | 412–416 | `improvement_proposal` | **E-3 only** (no E-1/E-2 today) |
| 4 | `main.md` (D-BCTC-EVAL) | 344 | n/a (row + unconditional WORK-channel post at :336-340) | **E-3 only**, distinct unconditional WORK post, no dedup |
| 5 | `tier1-probe.md` (general A-xx) | 139–171 | `signal_feedback` | E-1+E-2+E-3+read-back |
| 6 | `tier1-probe.md` (A-20 event-loop stall) | 86–108 | `signal_feedback` | E-1+E-3+read-back (E-2 folded into the general routing line at 157, shared with site 5) |

**Real inter-copy drift confirmed:** sites 1/2 use `data_stale`/`db_integrity_breach`; sites 5/6 use `signal_feedback` even for what is conceptually a `microservice_degraded` event (this mismatch is separately tracked as auditor-signal-loop-I3 — NOT in this task's scope, but the new script's `category-type` arg must accept whatever literal each call site already passes; it must NOT silently "correct" the value — that is I3's fix, a different task).

Sites 3 and 4 are structurally different from 1/2/5/6 — they never had E-1 (`post_agent_signal`) or a dedup-gated E-2. FR-6 below explicitly preserves this asymmetry.

---

## FR-1 — New script `scripts/emit-audit-signal.sh`

**DDD layer:** Interface (CLI/flow-doc call-site contract) wrapping Application (emit-sequencing orchestration).

Args (named, not positional — mirrors `auditor-notebook-commit.sh`'s explicit-arg discipline):
`check_id`, `category_type` (the literal `signal_type`/`type` string the call site already uses — enum is open per-site, script does not validate/rewrite it), `severity` (`CRITICAL|WARN|INFO`/`CRITICAL|HIGH|MED`, call-site-dependent — pass through verbatim), `summary` (≤120 chars, truncated by the script if longer), `detail_json` (arbitrary payload fields merged into the E-1 `payload` object), `from_agent` (default `system-auditor`), `to_agent` (default `po`), and an opt-in `--emit-telegram` / `--no-telegram` flag (see FR-6 — default ON for sites 1/2/5/6, sites 3/4 call with `--no-telegram`).

Env: `CLAUDE_CODE_SESSION_ID` not required (no task-lock claimed by this script — it does not touch the commit-mutex; the row write goes through `orch-apply.sh`, which has its own CAS guard, not a task-lock).

## FR-2 — E-1 `post_agent_signal`

**DDD layer:** Application.
Source `scripts/agents-flow/mcp-call.sh` (`source`, do not reinvent transport — same precedent `auditor-notebook-commit.sh` already follows). Call `mcp_call "post_agent_signal" "<jq-built args>"` with `from_agent`, `to_agent`, `signal_type=$category_type`, `payload` = `{title, detail, check_id, severity, dedup_key, ...detail_json fields}`. **CRITICAL CORRECTION:** `signal_type` **must** be a valid `SignalTypeSchema` enum member (`signal_feedback` is always safe); the `category_type` argument feeds only the E-3 signal-queue row's free-form `type` field and detail categorization, never the E-1 transport `signal_type` parameter. `dedup_key` is a **required** field of `detail_json` — the script does not invent it; every existing call site already computes one (e.g. `data_stale:<source_id>:<check_id>`, `db_integrity_breach:<table>:<check_id>`, `microservice_degraded:<service_id>:<check_id>`). Fail loud (non-zero exit, `[emit-signal] ABORT e1-failed <detail>`) if `mcp_call` returns non-zero — per architect's own Risk note in the brief: "script must fail-loud so a transport outage never silently drops E-1."

## FR-3 — Durable BUG-dedup ledger `docs/data/auditor-dedup-ledger.json`

**DDD layer:** Infrastructure (persistence).
**Shape:** flat map, `{ "<dedup_key>": "<ISO-8601 last_sent_ts>" }` — e.g. `{"data_stale:HOSE-VNINDEX:B-04": "2026-07-14T08:00:00Z"}`. No nested history, no severity field — this ledger only answers "was Telegram sent for this key within the window", nothing else.
**Dedup key:** the `dedup_key` field already embedded in each existing EMIT SEQUENCE's payload (see FR-2) — reused verbatim, never re-derived by the script.
**Window:** 7 days, matching the existing (currently undurable) rule at `main.md:661`.
**Write discipline:** tmp-file + `mv` same-directory atomic rename (mirrors the pattern already used for `docs/data/auditor-tier1-last-healthy.json` / `auditor-tier2-last-healthy.json`) — **NOT** routed through `orch-apply.sh` (that wrapper's scope is `docs/data/orch/orch-state.json` only; this is a separate small sidecar file, single-writer — only this script ever writes it). Missing/malformed file on read → treat as empty dedup state (never fail loud; self-heal by writing a fresh file on next write) — expected on first run and on the known-issues.json migration day.
**Reset/prune semantics:** on every invocation, before checking the current key, drop any ledger entries with `last_sent_ts` older than 7 days (self-pruning — no separate cron, no unbounded growth). This is the "durable ledger" replacing the in-memory/LLM-recall dedup that resets every agent invocation (auditor-signal-loop-I4) and the notebook's 3-section cap (main.md:706) that cannot span 7 days.

## FR-4 — E-2 `send_telegram`, gated by the ledger

**DDD layer:** Application (dedup policy) + Infrastructure (ledger read/write).
If `--no-telegram` passed → skip entirely (sites 3/4, see FR-6). Otherwise: read ledger, compute `now - last_sent_ts[dedup_key]`. If `< 7d` → emit `[emit-signal] SKIP-dedup <dedup_key> last_sent=<ts>` marker, do **not** call `send_telegram`. Else → `mcp_call "send_telegram" '{"channel":"bug","message":"..."}'` (channel/message contract per `docs/standards/gateway-call-contract.md §4` — lowercase channel, `message` field, no positional args), then update `ledger[dedup_key] = now` and write the ledger (FR-3 discipline).
**Dedup scope note (carried over unchanged from current behavior, not a new design choice):** dedup gates the Telegram channel only — E-1 (`post_agent_signal`) and E-3 (signal row) always fire regardless of dedup state. This matches today's main.md:661 wording, which names the rule only for "BUG channel" writes, never for the signal row or the `post_agent_signal` call.

## FR-5 — E-3 signal-row append + POST-WRITE read-back

**DDD layer:** Infrastructure (integration with the existing orch-state SSOT write gate).
Build the row per `.claude/skills/signal-dashboard/SKILL.md` § WRITE shape: `{id: "{from[0:3]}-{ts}", ts, from, to, type: $category_type, summary (≤120), severity, status: "NEW", payload_ref: null}`. Apply via:
```
jq --argjson row "$ROW" '.signal_queue.rows += [$row]' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
**CAS-retry contract (new — not present in any of the 6 current copies):** `orch-apply.sh` exit 2 = concurrent-writer CAS mismatch (per its own header contract) — the script must re-read the live file, rebuild the row-append filter, and retry, up to 3 attempts, matching the concurrent-writer note already documented in `signal-dashboard/SKILL.md` ("WF-2 ... retry up to 3 times if changed"). Exit 1 (validation/conservation failure) or 3 (usage error) → **no retry**, immediate `[emit-signal] ABORT e3-write-failed rc=<n>`.
After a successful (`exit 0`) apply: run the mandatory read-back —
```
jq --arg id "$ROW_ID" -e '[.signal_queue.rows[] | select(.id==$id)] | length > 0' docs/data/orch/orch-state.json
```
Absent → `[emit-signal] ABORT e3-readback-failed <id>` + trigger a BUG-channel Telegram (bypassing the FR-4 dedup gate — a false-green orphan-key bug is never itself dedup-suppressed) and exit non-zero. This is the exact anti-false-green check already present in all 6 current copies — FR-5 keeps it, does not weaken it.

## FR-6 — D-IMPROVE / D-BCTC-EVAL asymmetry preserved

**DDD layer:** Application (call-site contract).
Sites 3 and 4 (main.md:412-416, main.md:344) never had an E-1/E-2 today — only a signal-row write. The script must support an **E-3-only mode** (`--no-telegram` and simply never call `post_agent_signal` when the call site doesn't pass one — i.e. E-1 is itself optional, triggered only when the caller supplies enough fields for it, or an explicit `--e3-only` flag makes this unambiguous rather than inferred). Consolidating all 6 sites into "one script" must **not** introduce new Telegram spam for D-IMPROVE (which has none today) or change D-BCTC-EVAL's existing unconditional WORK-channel post (main.md:336-340, which is a separate `[BCTC-EVAL] ...` delta message, not a BUG-dedup emission, and stays outside this script's scope — only D-BCTC-EVAL's row-write at :344 is replaced by a script call).

## FR-7 — Flow-file replacement (main.md / tier1-probe.md)

**DDD layer:** Interface (agent flow-doc orchestration).
Each of the 6 sites' multi-line EMIT SEQUENCE block is replaced by: the existing PASS/WARN/CRITICAL verdict-branch prose (kept — the LLM still decides *whether* to emit) followed by a single script invocation + "paste the verbatim `[emit-signal] ...` marker line into the notebook" instruction (mirrors sibling proposal P3's prescribed RAW-CHECKS-paste pattern for consistency across the same audit). **Process constraint (architect risk note, carried from the brief):** use **Write-based full-block replacement + `git diff` verify** for these edits, not the `Edit` tool — per the known Edit-tool multiline-strip harness bug (`feedback_edit_tool_hook_silently_strips_multiline`).

## FR-8 — Dead-reference cleanup

**DDD layer:** Infrastructure (dead-reference removal).
Delete `docs/data/system-auditor-known-issues.json` (223 lines, stale since 2026-05-01, zero flow files read it — confirmed by grep). Repoint the two documentation pointers: `docs/references/tree-map.md:252/:407` and `docs/references/bundles/bundle-architect.md:74/:94` to describe `docs/data/auditor-dedup-ledger.json` instead. Fix `scripts/agents-flow/context-bloat-backstop.sh:185-203` — its fingerprint-suppression gate reads the file being deleted. **Recommend deletion of the dead gate + its comments** (not a repoint): the verifier's evidence shows 0 matching fingerprints ever fired (the gate's `context_bloat:<file-path>` fingerprint namespace never appears in `known-issues.json`, which only ever held `log_error:`/`log_warn:`/`memory_stale:` fingerprints) — repointing this gate at the new ledger's `<type>:<id>:<check_id>` namespace would be a semantically unrelated, behavior-changing repurpose, not a like-for-like swap. Architect should confirm this reasoning before dev executes (flagged as ARCH-RATIFY-1 below, not a PO blocker).

---

## Edge Cases

**EC-1 — Ledger absent/corrupt on first run.** Treat as empty dedup map; never fail loud; self-heal by writing a fresh file on the next successful E-2 send. Expected on the known-issues.json migration day.

**EC-2 — mcp-call.sh transport outage.** E-1 failure must abort loud (FR-2) — this was the explicit Risk called out in the CONFIRMED brief; a silent skip here would re-introduce the exact "passive health masks dead data" class the underlying audit domain exists to catch.

**EC-3 — orch-apply.sh CAS collision at the top of the hour.** `signal-dashboard/SKILL.md`'s own WF-2 note names three concurrent writers colliding at :00/4h (dev-team hourly drain, cowork-team 15-min tick, system-auditor Tier-2). FR-5's 3-retry loop is the shell-side implementation of the same CAS-retry discipline the TS path (`appendSignalQueueRow()`) already has.

**EC-4 — Severity escalation inside the dedup window** (e.g. same `dedup_key` recurs WARN→CRITICAL within the 7-day Telegram-mute window). The CONFIRMED brief does not specify a bypass rule for this. This is a technical design choice, not a business/priority question — flagged to architect as ARCH-RATIFY-2, not a PO blocker. BA recommendation (non-binding): bypass the mute on severity increase, since a worsening condition is new information, not a repeat of the same alert — but this is architect's call.

**EC-5 — I3's `signal_type` mismatch is out of scope.** Sites 5/6 currently emit `signal_feedback` for what auditor-signal-loop-I3 flags as conceptually `microservice_degraded`. This script must pass through whatever literal value each call site supplies — it must not silently normalize/correct it. Fixing I3 is a separate, not-yet-minted task; do not fold it into UC-ASL-P2 (scope creep risk explicitly avoidable here).

**EC-6 — UTF-8 / Vietnamese diacritics in `summary`/`check_id`/`source_id`.** No new risk — jq/bash already handle UTF-8 safely elsewhere in this repo (e.g. ticker names, source IDs); no VN-specific financial-data edge case applies since this is a pure ops/infra script, not a market-data path.

---

## DDD Layer Map

| Requirement | File(s) | DDD Layer | Reason |
|---|---|---|---|
| FR-1, FR-6 | `scripts/emit-audit-signal.sh` (arg contract) | Interface | CLI boundary called by flow docs |
| FR-2, FR-4 | `scripts/emit-audit-signal.sh` (E-1/E-2 logic) | Application | Orchestrates dedup policy + signal emission over existing infra transport (`mcp-call.sh`) |
| FR-3 | `docs/data/auditor-dedup-ledger.json` + read/write in the script | Infrastructure | New persistence store, tmp+mv atomic write |
| FR-5 | `scripts/emit-audit-signal.sh` (E-3 + retry) | Infrastructure | Integration with the existing `orch-apply.sh` SSOT write gate |
| FR-7 | `docs/agents/system-auditor/flow/main.md`, `tier1-probe.md` | Interface | Agent flow-doc call sites |
| FR-8 | `docs/data/system-auditor-known-issues.json` (delete), `docs/references/tree-map.md`, `docs/references/bundles/bundle-architect.md`, `scripts/agents-flow/context-bloat-backstop.sh` | Infrastructure | Dead-reference cleanup |

---

## Acceptance Criteria (for pm/dev/qa)

**AC-1** `scripts/emit-audit-signal.sh` exists, is executable, sources `scripts/agents-flow/mcp-call.sh` (not a reimplemented transport), and exits non-zero with a distinct `[emit-signal] ABORT ...` marker on E-1 transport failure — never silently skips E-1.

**AC-2** A first call with a fresh dedup_key sends Telegram (marker `[emit-signal] OK ...`) and writes `docs/data/auditor-dedup-ledger.json[dedup_key]`. A second call with the same `dedup_key` inside 7 days emits `[emit-signal] SKIP-dedup ...` and does NOT call `send_telegram` (verify via absence of a second BUG-channel message). A third call after the ledger entry is artificially aged past 7 days sends Telegram again.

**AC-3** Every call, dedup-skipped or not, still appends a signal-queue row and passes the POST-WRITE read-back — verify by asserting the row `id` is present in `.signal_queue.rows[]` after each of the 3 calls in AC-2.

**AC-4** All 6 flow-file sites (main.md:292-328/592-628/412-416/344, tier1-probe.md:139-171/86-108) are replaced with a script call + verdict-branch prose kept; `git diff` shows no stray multiline-strip artifacts (Write-based edit, not Edit-tool).

**AC-5** `docs/data/system-auditor-known-issues.json` is deleted; `tree-map.md` and `bundle-architect.md` pointers repointed to the new ledger; `context-bloat-backstop.sh`'s dead gate removed (or repointed only if architect overrides ARCH-RATIFY-1) with no dangling file reference remaining (`grep -r system-auditor-known-issues.json docs/ scripts/` returns zero hits post-change, excluding this spec/the audit brief's own historical mention).

**AC-6** A live Tier-2 or Tier-3 audit cycle (or a dry-run invocation) produces a `[emit-signal] OK|SKIP-dedup|ABORT` marker line that QA can grep verbatim — no narrated "row written" claim without the marker.

---

## Blockers

**ZERO PO blockers.** The CONFIRMED brief already specifies the file list, the ledger shape, the dedup rule, and both of the architect-verifier's implementation notes (known-issues.json deletion safety; Edit-tool multiline-strip risk). Remaining open items are architect-level technical design choices, not business/priority questions:

**ARCH-RATIFY-1:** Confirm FR-8's recommendation — delete (not repoint) `context-bloat-backstop.sh`'s dead known-issues.json gate, since its fingerprint namespace is semantically unrelated to the new ledger's dedup_key namespace.

**ARCH-RATIFY-2:** Decide EC-4's severity-escalation-inside-dedup-window bypass rule (BA recommends bypass-on-increase, non-binding).

**ARCH-RATIFY-3 (zone — see note below):** Confirm the ZONE for this task. None of the touched files are `apps/<service>/` — every file is under `scripts/`, `docs/agents/system-auditor/`, or `docs/references/`. Per the dispatch instruction ("architect MUST pin ZONE: apps/<service>/ in RETURN if a single-service landing is chosen"): there is no single-service `apps/` landing here at all — this is agent-tooling/flow-doc infrastructure, not application microservice code. Recommend architect set a precise zone such as `scripts/ + docs/agents/system-auditor/` (not `apps/<service>/`, and not the broad `cross-service/` label this task was dispatched under) so PM's zone-isolation check for parallel dispatch has an accurate, narrow value.

---

## Files Modified (scope for architect/pm/dev)

- `scripts/emit-audit-signal.sh` (new)
- `docs/data/auditor-dedup-ledger.json` (new, script-managed)
- `docs/data/system-auditor-known-issues.json` (delete)
- `docs/agents/system-auditor/flow/main.md`
- `docs/agents/system-auditor/flow/tier1-probe.md`
- `docs/references/tree-map.md`
- `docs/references/bundles/bundle-architect.md`
- `scripts/agents-flow/context-bloat-backstop.sh`

No `apps/` code changes in this task — see ARCH-RATIFY-3.

---

## Hard Constraints (propagate to architect → pm → dev → qa)

1. Reuse `scripts/agents-flow/mcp-call.sh` for the transport — do not reinvent a curl/SSE parser.
2. All `docs/data/orch/orch-state.json` writes go through `scripts/orch-apply.sh` only — never raw write, per CLAUDE.md SSOT-W1-ORCH-APPLY-WRAPPER.
3. `docs/data/auditor-dedup-ledger.json` is a separate sidecar file, NOT part of orch-state.json, and does NOT go through `orch-apply.sh` — it uses its own tmp+mv atomic write.
4. Fail-loud on E-1/E-3 failure (never silently continue without the signal — matches all 6 existing copies' ANTI-SKIP rule).
5. Dedup (FR-3/FR-4) gates the Telegram channel only, never E-1 or E-3.
6. Use Write-based replacement (not Edit tool) for the 6 flow-doc multiline blocks; verify with `git diff`.
7. No hardcoded structural data — `check_id`/`dedup_key`/thresholds are passed as args or read from `system-map.json`, never inlined in the script.
8. Injection-safety: every `mcp_call`/`orch-apply.sh` JSON body built via `jq -n --arg`/`--argjson` bound params only, matching `auditor-notebook-commit.sh`'s own discipline.

---

## Handoff to Architect

ZONE: recommend narrowing from dispatched `cross-service/` to `scripts/ + docs/agents/system-auditor/` — see ARCH-RATIFY-3.
SPEC: this file.
NEXT: architect — produce technical design; resolve ARCH-RATIFY-1/2/3; confirm CAS-retry loop shape (FR-5) and E-3-only mode contract (FR-6) before dev implementation.

---

## [Architect] Brownfield Findings

**Zone:** `scripts/` (root + `scripts/agents-flow/`) + `docs/agents/system-auditor/` + `docs/references/` (2 doc-pointer edits only) — **NOT** `apps/<service>/`, **NOT** the dispatched `cross-service/` label.
Per `.claude/skills/zone-detect/SKILL.md` Tier-2 inference: "Files span >1 zone OR root/scripts/ → route to `developer` (generic)." Confirmed precedent for non-`apps/` zone naming: `docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md:16` used `ZONE: root (docs/agents + .claude/skills + scripts)`; `docs/handoffs/TASK_FIX-I-A.md:101` used `ZONE: vps-scripts/`. `cross-service/` is reserved for tasks touching 2+ live `apps/<service>/` zones (e.g. `TASK_P1-DEV-*`), which this task does not. dev-team Step 3 routes this task to the generic **`developer`** specialist, not any `dev-<service>` agent.

**Verified paths (re-verified live at HEAD, matches BA's inventory exactly):**
- `docs/agents/system-auditor/flow/main.md:292-328` (Tier-2 `data_stale` EMIT SEQUENCE), `:592-628` (Tier-3 `db_integrity_breach`), `:412-416` (D-IMPROVE, E-3-only today), `:344` (D-BCTC-EVAL, E-3-only today, distinct unconditional WORK post at :336-340 stays untouched)
- `docs/agents/system-auditor/flow/tier1-probe.md:139-171` (general A-xx `signal_feedback`), `:86-108` (A-20 event-loop stall, E-2 folded into :157's routing line)
- `scripts/agents-flow/mcp-call.sh` (transport to reuse, `mcp_call()` function, confirmed exit-code contract: 0=success, non-zero=error w/ stderr detail)
- `scripts/auditor-notebook-commit.sh` (structural precedent: named-arg discipline, `set -uo pipefail`, bash 3.2-safe — no `mapfile`/associative arrays, RAW-verifiable one-line `[marker] ...` output convention, trap-based cleanup)
- `scripts/orch-apply.sh:33-39` (exit-code contract confirmed: 0=applied, 1=validation/conservation failure — no retry, 2=CAS mtime mismatch — caller retries, 3=usage error — no retry). This exactly matches FR-5's CAS-retry-only-on-2 contract; no design gap here.
- `scripts/agents-flow/context-bloat-backstop.sh:24,185-203` (dead known-issues.json fingerprint-suppression gate) — confirmed this is a SEPARATE mechanism from the file's own `EXISTING_SIGNAL` dedup check at `:175-183` (a signals-dir wildcard-file existence check, unrelated to known-issues.json) — deleting :185-203 does not remove the script's only dedup guard, it removes a second, redundant one that never fired.
- `.claude/skills/signal-dashboard/SKILL.md:13-24` (WF-2 concurrent-writer note: dev-team hourly drain, cowork-team 15-min tick, system-auditor Tier-2 all collide at :00/4h — confirms FR-5's 3-retry CAS loop is not speculative, it is the shell-side counterpart of `appendSignalQueueRow()`'s already-shipped TS CAS loop) and `:62` (POST-WRITE read-back contract, orphan-key bug precedent 2026-06-18)
- `docs/standards/gateway-call-contract.md:65-73` (send_telegram contract: lowercase `channel`, `message` field, no positional args — confirmed, FR-4 as written already complies)

**Reuse patterns:**
- Extend, never duplicate: `scripts/agents-flow/mcp-call.sh`'s `mcp_call()` is `source`d verbatim (matches `auditor-notebook-commit.sh:88`) — no new curl/SSE parser.
- New script follows `auditor-notebook-commit.sh`'s exact structural conventions: `set -uo pipefail`, bash-3.2-safe (no `mapfile`, no associative arrays — portable `case`/indexed-array lookups only), named args (not positional), one-line grep-able `[emit-signal] ...` markers, `trap ... EXIT` for any lock-like cleanup (N/A here — this script claims no task-lock per FR-1, only the ledger's own tmp+mv).
- orch-state.json write reuses the existing `jq '...' | bash scripts/orch-apply.sh` idiom unchanged — no new wrapper.

**Design decisions:**

1. **Script layout (single-file, function-organized DDD split — bash has no module system, so layer separation is enforced by function naming/ordering, not file separation):**
   - **Interface** (top of file): `_parse_args()` — named-flag parser (`--check-id`, `--category-type`, `--severity`, `--summary`, `--detail-json`, `--from-agent` [default `system-auditor`], `--to-agent` [default `po`], `--e3-only`, `--no-telegram`). Validates `--detail-json` parses as JSON (`jq -e .` guard, same pattern `mcp-call.sh:113` already uses for its own body-build) — malformed JSON → `[emit-signal] ABORT malformed-detail-json` exit 2, never string-concatenated into any jq filter (per Hard Constraint 8).
   - **Application** (middle): `_run_e1()`, `_check_dedup()`, `_run_e2()`, severity-rank comparison (see ARCH-RATIFY-2 below), CAS-retry control flow for E-3.
   - **Infrastructure** (bottom): `_ledger_read()`/`_ledger_write()` (tmp+mv, same-directory as `docs/data/auditor-dedup-ledger.json`, mirroring `auditor-tier1-last-healthy.json`'s pattern), `_e3_write_row()` (the `jq | orch-apply.sh` pipe + read-back assert).

2. **E-3-only mode contract (resolves FR-6's flagged ambiguity — BA explicitly deferred this to architect):** ONE explicit flag, `--e3-only`, is the sole switch — never inferred from omitted args. `--e3-only` present → E-1 (`post_agent_signal`) is skipped entirely AND E-2 (ledger read/check + `send_telegram`) is skipped entirely; only E-3 (signal-row write + read-back) executes. `dedup_key` becomes optional in `--detail-json` when `--e3-only` is set (sites 3/4 have none today); it remains a hard-required field of `--detail-json` otherwise (E-2 cannot dedup without it). `--no-telegram` (standalone, without `--e3-only`) is kept as a SEPARATE, currently-unused-by-any-of-the-6-sites flag: E-1 still fires, only E-2 is skipped — reserved for a future call site that wants PO-dashboard visibility (`post_agent_signal`) without Telegram. Sites 3/4 (main.md:412-416, :344) call with `--e3-only`. Sites 1/2/5/6 call with neither flag (default: full E-1+E-2+E-3).

3. **CAS-retry loop shape (resolves FR-5's "re-read the live file and rebuild the row-append filter" instruction):** Implemented as a plain `for attempt in 1 2 3` bash loop that re-invokes the IDENTICAL `jq --argjson row "$ROW_JSON" '.signal_queue.rows += [$row]' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` command each iteration. No special "rebuild" logic is needed: `jq` re-reads the live file fresh from disk on every invocation (it is not a cached variable), so each retry automatically operates against the current post-collision state — the append filter itself is base-state-independent (`+= [$row]` with a fixed `$ROW_JSON` is safe to replay verbatim against any base document). `rc=0` → break, success. `rc=2` (CAS mismatch) → loop again (up to 3 total attempts). `rc=1` or `rc=3` → immediate `[emit-signal] ABORT e3-write-failed rc=<n>`, no retry (per FR-5). If all 3 attempts return `rc=2` → distinct marker `[emit-signal] ABORT e3-cas-exhausted rc=2` (kept distinct from `e3-write-failed` so QA/dev can tell CAS-contention-exhaustion apart from a genuine schema/conservation validation failure) — both are non-zero exit, both trigger the same POST-WRITE-read-back-style non-dedup-gated BUG telegram per FR-5's anti-false-green clause.

4. **ARCH-RATIFY-1 — CONFIRMED: DELETE, not repoint, `scripts/agents-flow/context-bloat-backstop.sh:185-203`** (and its line-24 header comment referencing `system-auditor-known-issues.json`). Agree with BA's reasoning: the gate's `context_bloat:<file-path>` fingerprint namespace never once appears in `known-issues.json`'s actual contents (only `log_error:`/`log_warn:`/`memory_stale:` fingerprints ever existed there per the audit brief's own line-cited evidence) — 0 matching fingerprints ever fired, confirmed dead code. Repointing at the new ledger's `<type>:<id>:<check_id>` dedup-key namespace would silently change this gate's semantics (a Telegram-mute-window key vs a file-fingerprint-suppression key are different concepts) rather than perform a like-for-like swap — that is scope creep this task should not absorb. The script's OTHER dedup mechanism (`EXISTING_SIGNAL` signals-dir check, :175-183) is untouched and remains the sole suppression guard post-deletion — confirmed this is not a coverage regression (see Verified Paths above).

5. **ARCH-RATIFY-2 — RESOLVED: severity-escalation-inside-dedup-window bypass rule, WITH a minimal amendment to FR-3's ledger shape.** BA's FR-3 specifies a bare-timestamp ledger value (`{dedup_key: last_sent_ts}`, "no severity field") but EC-4 simultaneously asks architect to decide a severity-aware bypass rule — implementing any severity-comparison rule requires storing the previously-sent severity somewhere. Resolution: **the ledger value becomes a small flat object, not a bare string** — `{"<dedup_key>": {"ts": "<ISO-8601>", "sev": <int 1|2|3>}}`. This is still "flat map, current-state-only, no nested history" in the sense FR-3 intended (one entry per key, overwritten in place, never an array of past events) — the amendment adds one sibling field, not a list. Rule: on each E-2 invocation, normalize the call site's raw `--severity` string to an internal-only rank (never rewrites the literal value passed to E-1/E-3 payloads — this normalization is purely for the bypass decision, distinct from EC-5's category_type passthrough rule which this does not touch): `CRITICAL→3`, `HIGH→2`, `WARN→2`, `MED→1`, `INFO→1`, any unrecognized string→1 (conservative floor — never spuriously triggers a bypass off a malformed value). If `dedup_key` present in ledger AND `now - ts < 7d`: `new_rank > stored_rank` → **bypass the mute**, send Telegram, log a distinct marker `[emit-signal] OK-escalation-bypass <dedup_key> prev_sev=<stored_rank> new_sev=<new_rank>` (grep-distinguishable from plain `OK` per AC-6), and overwrite the ledger entry with `{ts: now, sev: new_rank}`. `new_rank <= stored_rank` → unchanged behavior, `[emit-signal] SKIP-dedup ...`. Window-expired (`now - ts >= 7d`) → unchanged behavior, sends and overwrites regardless of rank (AC-2's third-call test is unaffected by this rule). This directly implements BA's own non-binding EC-4 recommendation ("bypass mute on severity increase — a worsening condition is new information") with the smallest schema change that makes it possible.

6. **Ledger read-modify-write race — NEW risk, not raised in the BA spec (flagged proactively per architect responsibility to surface production footguns):** FR-3 calls the ledger "single-writer" meaning no OTHER script writes it — true, but this does not rule out TWO CONCURRENT invocations of `emit-audit-signal.sh` itself (e.g. a Tier-2 stale-source finding and a Tier-3 db-integrity finding both firing within the same audit tick, each with a different `dedup_key`, both doing an unguarded read→modify→write on the same ledger file). A lost-update race here silently drops one of the two ledger entries. **Ruling: accept as a known, bounded risk — do not add `flock`/file-locking.** Worst case is one redundant Telegram send within the 7-day window for the entry that got clobbered (never a lost E-1 or E-3 — those are unaffected by this race), which is strictly better than today's non-existent/undurable dedup. This exactly mirrors the already-accepted tradeoff of the sibling `auditor-tier1-last-healthy.json`/`auditor-tier2-last-healthy.json` tmp+mv writers (also unlocked, also low-frequency). If production observation later shows this actually causing duplicate BUG-channel noise, file a follow-up FIX task — out of this task's effort=M scope.

**DDD Layer Map (confirms/refines BA's FR table):**
| Layer | Component | Notes |
|---|---|---|
| Interface | `scripts/emit-audit-signal.sh` arg parser; `main.md`/`tier1-probe.md` call sites | CLI boundary + flow-doc orchestration prose (kept, LLM still decides *whether* to emit) |
| Application | E-1/E-2 dedup+severity-rank policy, CAS-retry control flow | Orchestrates over existing infra transport, no new transport |
| Infrastructure | ledger tmp+mv read/write; `orch-apply.sh` integration; `mcp-call.sh` (reused, not modified) | New persistence (ledger) + integration with existing SSOT write gate |

**Test strategy:**
- New `scripts/emit-audit-signal.test.sh` (bash test, mirrors `context-bloat-backstop.test.sh`/`cowork-guaranteed-slot-firer.test.sh` convention, mocks `mcp_call`/`orch-apply.sh` via a stub function override) covering: fresh-key OK+ledger-write; same-key-in-window SKIP-dedup (no Telegram call observed); aged-past-7d entry sends again; WARN→CRITICAL same-key-in-window triggers `OK-escalation-bypass` (new AC, see below); `--e3-only` skips E-1/E-2 entirely; E-1 transport failure (mocked non-zero `mcp_call`) → `ABORT e1-failed`, non-zero exit; E-3 read-back failure (mocked false assert) → `ABORT e3-readback-failed` + non-dedup-gated BUG telegram; CAS-retry (mocked `orch-apply.sh` returning 2,2,0 across 3 calls) → succeeds on 3rd attempt with plain success marker; CAS-exhausted (mocked 2,2,2) → `ABORT e3-cas-exhausted rc=2`.
- Flow-doc edit verification: after Write-based replacement of the 6 sites, `git diff` reviewed for stray multiline-strip artifacts (known Edit-tool hook bug) — Write tool only, never Edit tool, for `main.md`/`tier1-probe.md` (carries BA's FR-7 constraint forward unchanged).
- Live/dry-run integration: one real Tier-2 or Tier-3 cycle (or manual script invocation against a SCRATCH copy of `orch-state.json`, never the live file, for anything beyond a single real dry-run) producing a grep-able `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT` marker line, satisfying AC-6.

**New acceptance criterion (architect addition, folds into AC-2/AC-6 scope, not a new numbered AC — pm may add as AC-7 if preferred):** a same-`dedup_key` call with a HIGHER severity than the ledger's stored value, issued inside the 7-day window, emits `[emit-signal] OK-escalation-bypass ...` and DOES call `send_telegram` — verify via presence of a second BUG-channel message plus the distinct marker text.

**Risk flags:**
- Inherited (BA/brief): `mcp-call.sh` transport reachability — fail-loud on E-1 failure, no new mitigation needed beyond FR-2 as written.
- New (this review): ledger read-modify-write race under concurrent Tier-2/Tier-3 invocation — see design decision 6 above; accepted, not blocking.
- Shell-portability constraint (carried from `auditor-notebook-commit.sh` precedent): bash 3.2 (macOS system bash) — no `mapfile`, no associative arrays. Severity-rank lookup and ledger key access must use `case` statements / `jq` (not bash associative arrays).
- No DDD violations found; no security hole beyond the already-flagged injection-safety constraints (Hard Constraint 8), which the design's `--detail-json` JSON-validity guard (decision 1) satisfies.

**Standard Detection:** BUG-FIX / REFACTOR (in-zone, no new primitives) → **BUILD-STANDARD: not-applicable** (skip microservice-build-standard — this is agent-tooling/flow-doc infrastructure, not a service).

**Scan clean:** true ✓

---

## [QA] Review Record — CHANGES_REQUESTED (round 1)

**QA session:** 2026-07-16T07:50:00Z · Task Report: `reports/TASK_REPORT_UC-ASL-P2.md` · DJ: `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-qa.md` §qa-S4

**Tests (RAW-reproduced):** `scripts/emit-audit-signal.test.sh` 48/48, run 6x, 0 flake. `scripts/agents-flow/context-bloat-backstop.test.sh` 2/2. AC-1/AC-2/AC-4/AC-5/AC-6 confirmed PASS.

**AC-3 BLOCKING (file:line):** `scripts/emit-audit-signal.sh:232` — `--arg st "$CATEGORY_TYPE"` feeds `signal_type:$st` into the `post_agent_signal` MCP call. This directly implements this spec's own **FR-2** ("`signal_type=$category_type`") and the Architect's design decision 1, both of which conflate two different fields:
- the E-3 signal-queue row's free-form `type` field (unconstrained), vs
- `post_agent_signal`'s `signal_type` **argument**, a closed Zod enum (`apps/mcp-server/src/infrastructure/db/agentSignalStore.ts:39-50`): `urgent_news | price_anomaly | cross_validate | suppress | chain_catalyst | fundamental_validation | price_confirmation | verified_chain | signal_feedback | legal_risk | verified_decision`. Neither `data_stale` nor `db_integrity_breach` is a member.

The pre-refactor code hardcoded `"signal_type": "signal_feedback"` at every E-1 call site (a valid enum member) precisely to avoid this — `--category-type`'s semantic label was previously used ONLY in the E-3 row's `type` field, never as the E-1 transport arg.

**Live-verified, twice:** (1) direct gateway call with `signal_type:"data_stale"` → `MCP error -32602 invalid_enum_value`. (2) the real (unmocked) `scripts/emit-audit-signal.sh`, run against a scratch `orch-state.json` copy, with `main.md:296-302`'s exact site-1 args → `[emit-signal] ABORT e1-failed ...`, `signal_queue.rows` count unchanged (E-3 never reached, per `run_emit_signal`'s `_run_e1 || return 1` short-circuit at script:458).

**Blast radius:** `main.md:298` (Tier-2 `data_stale`) and `main.md:592` (Tier-3 `db_integrity_breach`) — the two highest-frequency audit categories — lose 100% of their signal-queue row + Telegram alert on every real invocation. Sites 3/4 (`--e3-only`, E-1 skipped) and `tier1-probe.md` sites 5/6 (`--category-type "signal_feedback"`, valid enum member, unchanged from legacy) are unaffected.

**Recommended fix (bounded, mechanical — no redesign of FR-3/FR-4/FR-5/CAS-retry/ledger needed):** decouple the two fields inside `_run_e1()` — either (a) hardcode `signal_type: "signal_feedback"` unconditionally for the E-1 transport call (= 100% legacy-behavior match), or (b) add a separate `--signal-type` CLI arg (default `signal_feedback`) so `--category-type` continues to feed only the E-3 row's `type` field + `detail_json` categorization, unchanged.

**Spec note (for BA/architect, not a PO blocker):** FR-2's own wording ("`signal_type=$category_type`") should be corrected in this spec so the conflation isn't re-taught on a future read.

**VERDICT: CHANGES_REQUESTED.** Board NOT promoted to `done_verified` (task + 4 children left as-is). `orch-state.json`/`.head` untouched by QA. No merge, no push.

---

## [QA] Review Record — RE-GATE round 2 — APPROVED

**QA session:** 2026-07-16T08:24Z · Task Report: `reports/TASK_REPORT_UC-ASL-P2.md` · DJ: `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-qa.md` §qa-S5

**Fix under re-gate:** commit `f1bcf63a3` — `scripts/emit-audit-signal.sh:232` now hardcodes `--arg st "signal_feedback"` for E-1's `signal_type` transport arg; line 328's `--arg type "$CATEGORY_TYPE"` for the E-3 row's free-form `type` field is unchanged (verified by grep, no regression).

**LIVE UNMOCKED repro (decisive check, mandatory — mocked harness alone cannot prove this):**
1. Sanity re-confirm the enum is genuinely closed: direct `mcp_call post_agent_signal` with `signal_type:"data_stale"` → still `MCP error -32602 invalid_enum_value` (unchanged — proves this is a real, live Zod gate, not a fluke).
2. Ran the REAL (unmocked) `scripts/emit-audit-signal.sh` against the REAL gateway + the LIVE `docs/data/orch/orch-state.json`, `--no-telegram` (E-1 still fires; only E-2/ledger skipped — avoids BUG-channel spam from a synthetic test signal):
   - `--category-type data_stale --check-id B-04` → `[emit-signal] OK no-telegram id=sys-20260716T062418-3847 check_id=B-04`, rc=0. Row read-back independently confirmed: `{"id":"sys-20260716T062418-3847",...,"type":"data_stale",...}` present in `.signal_queue.rows[]`.
   - `--category-type db_integrity_breach --check-id C-02` → `[emit-signal] OK no-telegram id=sys-20260716T062429-158b check_id=C-02`, rc=0. Row read-back independently confirmed: `{"id":"sys-20260716T062429-158b",...,"type":"db_integrity_breach",...}` present.
   - Both: no `invalid_enum_value`, no `ABORT e1-failed` — E-1 now succeeds for exactly the 2 sites that broke in round 1.
3. **Cleanup:** removed both test rows via `jq '.signal_queue.rows |= map(select(...))' | orch-apply.sh` (conservation check: signal_total live=4→candidate=2, task_total unchanged 542=542, `[orch-apply] OK`). Post-cleanup `git diff docs/data/orch/orch-state.json` is **empty** — live SSOT byte-identical to pre-repro state, the 2 pre-existing rows (`cow-20260716T043200`, `cow-20260716T052700`) untouched.

**Harnesses (RAW-reproduced):** `scripts/emit-audit-signal.test.sh` **49/49** (48 + the fixer's new T1 `e1_signal_type_is signal_feedback` assertion, closing the exact mock blind spot that hid AC-3 in round 1). `scripts/agents-flow/context-bloat-backstop.test.sh` **2/2**.

**AC-1..AC-6 re-confirmed:** AC-1 (script executable, sources `mcp-call.sh`, fail-loud `ABORT e1-failed` marker present) PASS. AC-2 (T1/T2/T3/T4 dedup+escalation-bypass) PASS via harness. AC-3 (every call appends + read-back passes) PASS — harness T1-T12 AND live repro above (2 independent live invocations, both real gateway + real orch-state.json). AC-4 (6 flow-file sites replaced with script calls) PASS — `grep -n emit-audit-signal.sh` hits all 6 former site line ranges in `main.md`/`tier1-probe.md`. AC-5 (dead-reference cleanup) PASS — `docs/data/system-auditor-known-issues.json` absent from disk; zero refs in `tree-map.md`/`bundle-architect.md`/`context-bloat-backstop.sh` (both doc files now point at `auditor-dedup-ledger.json`; dead gate :185-203 confirmed removed, `EXISTING_SIGNAL` guard at :175-183 intact). AC-6 (grep-able `[emit-signal]` marker from a live/dry-run invocation) PASS — both live repro lines above.

**DDD-layering + injection-safety re-check:** full-file re-read of `scripts/emit-audit-signal.sh` (487L) — every `jq`/`mcp_call`/`orch-apply.sh` body built via `jq -n --arg`/`--argjson` bound params only (`_run_e1`, `_send_bug_telegram`, `_send_orphan_bug_telegram`, `_build_row_json`, `_ledger_upsert`, `_e3_write_row`); zero string-concatenated jq filters; no `eval`; no `process.env`/hardcoded-secret hits. `orch-apply.sh` invoked ONLY inside `_e3_write_row` (E-3) — confirmed via grep, single call site. Ledger read/write (`_ledger_write`) confirmed tmp+mv same-directory, never routed through `orch-apply.sh` (Hard Constraint 3 intact). Fail-loud structurally confirmed: `_run_e1 || return 1` short-circuit, `_e3_write_row` aborts loud on rc=1/3/cas-exhausted/readback-failure.

**VERDICT: APPROVED.** All 6 ACs pass, both harnesses green (49/49, 2/2), live unmocked repro clean on both regressed sites (`data_stale`, `db_integrity_breach`), no regression on line 328, conservation preserved (test rows cleaned, `git diff` empty on `orch-state.json`). Per dispatcher instruction: QA does NOT self-advance `.head`/`.task_board`, does NOT promote UC-ASL-P2 or its 4 children to `done_verified`, does NOT merge/push/release `task:UC-ASL-P2` — dispatcher owns promotion + push after this verdict.


