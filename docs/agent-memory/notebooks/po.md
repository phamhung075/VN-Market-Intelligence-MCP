# PO Notebook

_Last: 2026-07-31T14:57Z (dev-team triage tick). Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-3.md` STEP po-S91, po-S92, po-S93._

## This cycle

- **Router said "probably NOTHING". It was 3 mints.** The three telegram reports (4236/4237/4238) really were already-actioned dedups — but two MANDATORY pre-checks and one undrained signal each produced a real row. **An "idle" tick is a claim about inputs, not about the pre-checks.**
- **The ci_red was NOT dispositionable as flake.** Relay framing was "IMF external-API network flakiness, not a real regression". `triage-signals.md` forbids exactly that: CI-plane green baseline is **0 fail**, so "pre-existing/flake" is a **fabricated disposition unless it names an already-open FILE-scoped row**. PRIMARY (`dedup_key`) and SECONDARY (check_id/head_sha/file) both zero-hit across backlog+ready+in_progress+review+qa. Nearest row `FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE` = different file, no dedup.
- **The flake hypothesis was itself the bug.** `gh run view 30639708394 --log-failed` → `FAILEDFILE: src/__tests__/1296b-imf-integration.test.ts` (1 file). Reading it: AC-7 `runImfIndicatorPollerJob` carries an explicit `35_000` timeout commented "poller has 30s timeout + overhead", AC-8 hits `getLatestImfIndicators`. **Non-hermetic — a live external API inside CI.** So the row is actionable whether or not this fire was transient. Untouched by any recent commit; green on prior commit `6775752af`.
- **Promoted my own Carry-over L18 to the board.** manual-dispatch-sweep's strand defect had been notebook-only since a prior tick — **invisible to every backlog sweep**. Now `FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW` (P1).
- **Mechanism proven by control flow, not by the instance.** Repo grep of `po_manual_dispatch_flagged_at` → only Step 1's two exclusion filters, their `dev-standards.md:517/521` mirror, a verifier fixture, two historical mint scripts. **Nothing anywhere clears it**, and the sub-flow self-declares "Consumer of this stamp: none automated by design". Flagged+undispatched ⇒ permanently unreachable. Correcting L18: only **TE-T12** is stranded — deploy-lane got dispatched and is now DONE_VERIFIED.
- **Doc drift, reproduced live.** `triage-signals.md`'s ci_red template hardcodes `status: "TODO"` for a `backlog[]` append; orch-apply Stage 1b **ABORTS** (`expected: BACKLOG|BLOCKED`). Minted as its own row. Fail-loud, so nothing was corrupted — but the validator's message offers "move the row to another lane" as an alternative remedy, which is the wrong fix.

## Carry-over

- **Did NOT stamp a manual-dispatch candidate for the 2nd tick running.** 40 unflagged remain (TE-T14 top). **Stamping under a saturated WIP cap deterministically manufactures the next stranded row** — flag rate is not the binding constraint, dispatch is. Resume stamping only after the strand row ships.
- **WIP freed mid-tick.** `FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT` → DONE_VERIFIED 14:53:43Z. in_progress 2→1; the long-carried `rebuild_required` blocker is **closed**. Re-verify at the RUNTIME plane if "fix landed, still firing" reports recur.
- **`FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH` (review, `next_agent: po`) needs nothing from me** — `po_blocking_gate: "cleared"`, `po_gate_cleared_at 2026-07-30T23:04:45Z`, commit `e27f6f0a5`. The `next_agent: po` is residual; it awaits done_verified. Do not re-review it.
- **PO's own signal routing table still matches 0 of its 16 live types** — `FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES` is minted in backlog (`next_agent: agent-father`), deliberately deferred by dev-team on WIP cap. Still 100% fall-through to "unknown type → skip".
- **`gh run view <run_id> --log-failed` remains the only disposition-grade read for a ci_red.** `failing_jobs[].name` carries zero file identity. **NEVER `--update`.**
- **jq precedence trap:** `[.a.b|length, .a.c|length]|add` chains the pipe across the comma and errors "Cannot index number". Parenthesise each: `[(.a.b|length),(.a.c|length)]|add`. Cost me one wasted conservation probe.
- **`FIX-NOTEBOOK-AUTOPRUNE-...-ZERO-TS-NOTEBOOKS` still gates two REVIEW rows** (`...LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES`, `...LINECAP-SWEEP-BYTE-BLIND-BACKSTOP`). **Do not let QA merge the three.** `po.md` is one of the 11.
- **`daily_ohlcv.updated_at` is a MUTATION timestamp, not arrival** — nightly backfill rewrites ~97% of rows. Never diagnose coverage off it.
- **Not run this tick:** channel-audit (router relayed `read_telegram_reports`/`list_unresolved_reports` — do NOT re-run, it burns the `new` status). TNB: `tnb-audit-latest.md` ACKed 2026-07-28T22:55Z, unchanged since, no re-ACK. supervised-goahead: `should_hold=false`, nothing held.
