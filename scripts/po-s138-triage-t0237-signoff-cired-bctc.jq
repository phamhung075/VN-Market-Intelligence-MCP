# scripts/po-s138-triage-t0237-signoff-cired-bctc.jq
# PO triage tick 2026-07-03T02:37Z — single-pass 6-mutation triage (idempotent).
#   M1 RELOCATE FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING in_progress[] -> done_verified[]
#      (QA APPROVED 02:48Z, RAW-verified 7/7 + pnpm check green + mock-guard PASS).
#   M2 RELOCATE FIX-AUDITOR-COMMIT-MUTEX-SKIP backlog[] -> done_verified[]
#      (observation ACs 3/3 met across 3 consecutive auditor T1 ticks).
#   M3 MINT CI-RED-c5b5f885-FIX -> backlog[] (PLAN-ONLY, verify-first: likely already fixed
#      by unpushed 31caeefcd; verification_gate=ci_green_on_subsequent_push).
#   M4 MINT FIX-SEARCH-1466-MOCK-MODULE-POLLUTION -> backlog[] (reviewer follow-up, test-hygiene).
#   M5 MINT FIX-AUDITOR-NOTEBOOK-COMMIT-TRAILER-DOC -> backlog[] (reviewer follow-up, doc).
#   M6 ANNOTATE signal_queue row sau-20260703T024117Z po_disposition, KEEP status=READ
#      (do NOT self-resolve; link to BCTC-HNX-SSL-HARDEN; pending post-deploy freshness verify).
# Reusable pattern for "sign off 2 QA-approved REVIEW rows + record a ci_red FIX with a
# verify-first gate + record a known-cause deploy-pending signal disposition, all in one atomic
# pass". Idempotent: relocations guarded by done_verified membership + null-capture; mints
# id-guarded across all lanes; annotation field-stable.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ);
#   jq --arg now "$NOW" -f scripts/po-s138-triage-t0237-signoff-cired-bctc.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply.sh does Zod + dup-key + CAS-mtime + atomic rename; commit orch-state by EXPLICIT
#  PATH under commit-mutex; PUSH HELD — fleet-push timer pushes.)

def in_lane($lane; $id):
  [ .task_board[$lane][] | select(type=="object") | .id ] | index($id) != null;
def id_anywhere($id):
  [ .task_board | to_entries[] | select(.value|type=="array") | .value[]
    | select(type=="object") | .id ] | index($id) != null;

($now) as $now
# capture rows to relocate (null if already moved -> idempotent re-run)
| (first(.task_board.in_progress[]
    | select(type=="object" and .id=="FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING")) // null) as $search
| (first(.task_board.backlog[]
    | select(type=="object" and .id=="FIX-AUDITOR-COMMIT-MUTEX-SKIP")) // null) as $auditor

# ── M1: FIX-SEARCH in_progress -> done_verified ────────────────────────────────
| .task_board.done_verified += (
    if ($search != null and (in_lane("done_verified"; "FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING") | not))
    then [ $search + {
        status: "DONE_VERIFIED",
        done_verified: true,
        verified_by: "po",
        verified_at: $now,
        signoff_note: "PO triage sign-off (tick 2026-07-03T02:37Z): QA APPROVED 2026-07-03T02:48Z — RAW-verified 7/7 targeted tests, pnpm check green, full suite under baseline, mock-guard PASS. Fix commits 31caeefcd+1a9cda30b (mcp-server rag client-side fail-soft). Report reports/TASK_REPORT_FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING.md (e753110da). Reviewer follow-up spun to backlog FIX-SEARCH-1466-MOCK-MODULE-POLLUTION.",
        followups: ["FIX-SEARCH-1466-MOCK-MODULE-POLLUTION"]
      } ]
    else [] end
  )
| .task_board.in_progress |= map(select((type=="object" and .id=="FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING") | not))

# ── M2: FIX-AUDITOR backlog -> done_verified ───────────────────────────────────
| .task_board.done_verified += (
    if ($auditor != null and (in_lane("done_verified"; "FIX-AUDITOR-COMMIT-MUTEX-SKIP") | not))
    then [ $auditor + {
        status: "DONE_VERIFIED",
        done_verified: true,
        verified_by: "po",
        verified_at: $now,
        signoff_note: "PO triage sign-off (tick 2026-07-03T02:37Z): observation ACs 3/3 met across 3 consecutive auditor T1 ticks (fd9e7ce12 01:00Z / a2b1513bf 01:30Z / 673225129 02:00Z), each mutex-paired + explicit-pathspec via scripts/auditor-notebook-commit.sh. Shipped 2325d9755+5ac3fa523. Reviewer follow-ups spun to backlog FIX-AUDITOR-NOTEBOOK-COMMIT-TRAILER-DOC.",
        followups: ["FIX-AUDITOR-NOTEBOOK-COMMIT-TRAILER-DOC"]
      } ]
    else [] end
  )
| .task_board.backlog |= map(select((type=="object" and .id=="FIX-AUDITOR-COMMIT-MUTEX-SKIP") | not))

# ── M3: mint CI-RED-c5b5f885-FIX (PLAN-ONLY, verify-first) ─────────────────────
| .task_board.backlog += (
    if (id_anywhere("CI-RED-c5b5f885-FIX") | not)
    then [ {
        id: "CI-RED-c5b5f885-FIX",
        title: "CI-RED-c5b5f885-FIX — CI RED on main HEAD c5b5f885: bun test (run 28632717350)",
        type: "FIX",
        status: "TODO",
        owner: "po",
        priority: "high",
        zone: "apps/mcp-server/",
        plan_only: true,
        created_at: $now,
        created_by: "po",
        origin_signal: "ci_red:c5b5f885b48889aa19c0779eb4efdfa254e46654:bun test",
        run_url: "https://github.com/phamhung075/VN-Market-Intelligence-MCP/actions/runs/28632717350",
        verification_gate: "ci_green_on_subsequent_push",
        status_note: "AC (verification_gate=ci_green_on_subsequent_push): gh run list --branch main --limit 5 shows conclusion=success for a push AFTER c5b5f885b48889aa19c0779eb4efdfa254e46654. VERIFY-FIRST (memory ci_red_can_be_flaky): the failing SHA c5b5f885b PREDATES local HEAD by 13 unpushed commits, one of which (31caeefcd, FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING rag client-side fail-soft, now done_verified) fixes the recurring search_similar_context test TIMEOUT that most plausibly caused this 'bun test' red. Do NOT re-run the workflow and do NOT dispatch coding until the NEXT fleet-push CI result is inspected — this row most likely closes as resolved-by-chain (GREEN). It only becomes a real coding FIX if the subsequent push is still RED on 'bun test' for a DIFFERENT root. Priority: high. Failing jobs: bun test.",
        depends: ["FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING"]
      } ]
    else [] end
  )

# ── M4: mint FIX-SEARCH-1466-MOCK-MODULE-POLLUTION (reviewer follow-up) ─────────
| .task_board.backlog += (
    if (id_anywhere("FIX-SEARCH-1466-MOCK-MODULE-POLLUTION") | not)
    then [ {
        id: "FIX-SEARCH-1466-MOCK-MODULE-POLLUTION",
        title: "1466-sync-db-corruption-bail.test.ts mock.module pollution (reviewer follow-up)",
        type: "FIX",
        status: "TODO",
        owner: "po",
        priority: "low",
        zone: "apps/mcp-server/",
        plan_only: true,
        created_at: $now,
        created_by: "po",
        origin: "FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING reviewer follow-up (done_verified e753110da)",
        status_note: "AC: 1466-sync-db-corruption-bail.test.ts afterAll mock.module leaks module state to subsequent tests (bun test cross-test contamination flagged by worker + QA reviewer). Scope the mock (mock.restore / per-file mock isolation) so no cross-test module pollution; targeted test + full suite green. Test-hygiene, non-urgent.",
        blocking: false
      } ]
    else [] end
  )

# ── M5: mint FIX-AUDITOR-NOTEBOOK-COMMIT-TRAILER-DOC (reviewer follow-up) ───────
| .task_board.backlog += (
    if (id_anywhere("FIX-AUDITOR-NOTEBOOK-COMMIT-TRAILER-DOC") | not)
    then [ {
        id: "FIX-AUDITOR-NOTEBOOK-COMMIT-TRAILER-DOC",
        title: "auditor-notebook-commit.sh commit-trailer spec + election-release ownership doc line (reviewer follow-up)",
        type: "CLEAN",
        status: "TODO",
        owner: "po",
        priority: "low",
        zone: "cross-service/",
        plan_only: true,
        created_at: $now,
        created_by: "po",
        origin: "FIX-AUDITOR-COMMIT-MUTEX-SKIP DONE-gate reviewer notes (done_verified 2325d9755)",
        files: ["scripts/auditor-notebook-commit.sh", "docs/agents/system-auditor/flow/main.md"],
        status_note: "AC (doc-only): (1) scripts/auditor-notebook-commit.sh appends the required Claude-Session commit trailer per docs/policies/commit-convention.md; (2) system-auditor flow gets one doc line clarifying election-release ownership — a router-held fire-election lock is NEVER released by the auditor subagent (left to TTL). Non-urgent.",
        blocking: false
      } ]
    else [] end
  )

# ── M6: annotate bctc signal_queue row — KEEP status READ, do NOT self-resolve ──
| .signal_queue.rows |= map(
    if (type=="object" and .id=="sau-20260703T024117Z")
    then . + {
        status: "READ",
        po_disposition: {
          by: "po",
          at: $now,
          verdict: "KNOWN-CAUSE-DEPLOY-PENDING — kept READ (pending), NOT self-resolved",
          linked_task: "BCTC-HNX-SSL-HARDEN",
          linked_task_lane: "review",
          note: "bctc-discover staleness (last fetch 2026-06-16T20:42:55Z, 38 pending queue items, vn-bctc-fetch VPS route unhealthy ~16d) aligns with the HNX SSL outage. Durable fix BCTC-HNX-SSL-HARDEN is code-complete/in-review but DEPLOY-PENDING behind the user gate (scripts/deploy-vinahost.sh must be run by the user). No new deep-dive spawned. Row STAYS pending: RESOLVE only after post-deploy freshness verification confirms bctc-discover fetch recovers GREEN within the 24h earnings-window SLA."
        }
      }
    else . end
  )

# ── triage stamps ──────────────────────────────────────────────────────────────
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po"
