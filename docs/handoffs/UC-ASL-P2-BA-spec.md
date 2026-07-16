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
Source `scripts/agents-flow/mcp-call.sh` (`source`, do not reinvent transport — same precedent `auditor-notebook-commit.sh` already follows). Call `mcp_call "post_agent_signal" "<jq-built args>"` with `from_agent`, `to_agent`, `signal_type=$category_type`, `payload` = `{title, detail, check_id, severity, dedup_key, ...detail_json fields}`. `dedup_key` is a **required** field of `detail_json` — the script does not invent it; every existing call site already computes one (e.g. `data_stale:<source_id>:<check_id>`, `db_integrity_breach:<table>:<check_id>`, `microservice_degraded:<service_id>:<check_id>`). Fail loud (non-zero exit, `[emit-signal] ABORT e1-failed <detail>`) if `mcp_call` returns non-zero — per architect's own Risk note in the brief: "script must fail-loud so a transport outage never silently drops E-1."

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
