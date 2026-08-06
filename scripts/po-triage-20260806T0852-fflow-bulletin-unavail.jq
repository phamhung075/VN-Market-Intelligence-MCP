# scripts/po-triage-20260806T0852-fflow-bulletin-unavail.jq
#
# PO triage 2026-08-06T08:52Z — review-lane SECONDARY-drain of
# FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING (CI-RED 1783).
#
# Two id-guarded, idempotent mutations:
#   (1) MOVE review[] -> done_verified[] for FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING.
#       Verification gate ("done_verified ONLY on ci_green_on_subsequent_push") is
#       SATISFIED: CI run 31034705151, headSha 9cc6771e, conclusion=success,
#       2026-08-05T18:26:07Z, `bun test` job success; fix SHA 37ac9a52 is an
#       ancestor of 9cc6771e. Raw local re-verify 2026-08-06: 7 pass / 0 fail.
#       Also drops the self-referential `next_agent: "dev-team"` (not a spawnable
#       agent — the reason this row could never be auto-dispatched) and the
#       secondary-drain claim stamps. next_agent is DELETED not nulled:
#       orchStateSchema TaskSchema types it z.string().optional(), NOT nullable.
#
#   (2) MINT FIX-FFLOW-BULLETIN-OUTAGE-SILENT-OMISSION into backlog[] — the
#       residual PO product-flag carried in the closed row's router_note,
#       resolved rather than dropped. The flag as written ("all-zero movers could
#       mislabel a genuine zero-net-flow day") is near-unreachable; the REAL
#       defect is its inverse (see root_cause on the minted row).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-triage-20260806T0852-fflow-bulletin-unavail.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def CLOSE_ID: "FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING";
def MINT_ID:  "FIX-FFLOW-BULLETIN-OUTAGE-SILENT-OMISSION";

def all_ids:
  [ .task_board | to_entries[] | .value
    | if type == "array" then .[] | (.id // .task_id // empty) else empty end ];

# ── (1) sign-off move ────────────────────────────────────────────────────────
def signoff:
  ( [ .task_board.review[] | select((.id // .task_id) == CLOSE_ID) ] ) as $hit
  | if ($hit | length) == 0 then .
    else
      .task_board.review = [ .task_board.review[] | select((.id // .task_id) != CLOSE_ID) ]
      | .task_board.done_verified += [
          ( $hit[0]
            | del(.next_agent, .secondary_claimed_at, .secondary_claimed_by, .secondary_dispatch_target)
            + {
                status: "DONE_VERIFIED",
                owner: "dev-mcp-server",
                updated_at: $now,
                closed_at: $now,
                po_signoff_20260806: (
                  "[po 2026-08-06T08:52Z] DONE_VERIFIED. Verification gate met on all three planes. "
                  + "(a) CODE: canonical copy \"Khoi ngoai: Du lieu khong kha dung (pipeline tam dung)\" is live at "
                  + "apps/mcp-server/src/scheduler/briefings/format/foreignFlowSection.ts:28 — the formatter was extracted "
                  + "out of eveningSummaryJob.ts by FACTORY-SCHEDULER-dedup-briefing-formatters after the fix landed, so "
                  + "the detail_ref's file list (eveningSummaryJob.ts:228) is stale-by-refactor, not unfixed. "
                  + "(b) TEST RAW: bun test src/__tests__/1783-foreign-flow-bulletin.test.ts re-run 2026-08-06 => 7 pass / 0 fail, "
                  + "16 expect() calls. (c) CI GREEN ON SUBSEQUENT PUSH (the row's own explicit done_verified precondition): "
                  + "gh run 31034705151, workflow CI, headSha 9cc6771e, conclusion=success, 2026-08-05T18:26:07Z, `bun test` job success; "
                  + "`git merge-base --is-ancestor 37ac9a52 9cc6771e` confirms the test-fix SHA is contained. "
                  + "NOTE ON TODAY'S RED: CI on main is red as of 2026-08-06T08:41Z (run 31085916894) but the ONLY failing job is "
                  + "size-lint (1 offending doc, 1362 scanned) — `bun test` = success in that same run. Unrelated to 1783; NOT a re-open reason. "
                  + "ROW WAS STRUCTURALLY UNDISPATCHABLE, not merely slow: next_agent was \"dev-team\", a self-reference that no picker can spawn. "
                  + "Deleted on close so the shape is not inherited. "
                  + "RESIDUAL PO-FLAG RESOLVED, NOT DROPPED — re-minted as " + MINT_ID + " (see that row; the original flag was "
                  + "aimed at the wrong branch)."
                )
              }
          )
        ]
    end;

# ── (2) residual-flag mint ───────────────────────────────────────────────────
def mint:
  if (all_ids | index(MINT_ID)) != null then .
  else
    .task_board.backlog += [{
      id: MINT_ID,
      status: "BACKLOG",
      type: "FIX",
      priority: "P2",
      size: "S",
      zone: "apps/mcp-server/",
      owner: "dev-mcp-server",
      next_agent: "dev-mcp-server",
      created_at: $now,
      created_by: "po",
      title: "Foreign-flow pipeline outage renders NO bulletin section at all — the canonical \"Du lieu khong kha dung (pipeline tam dung)\" copy sits behind a branch the production SQL can never reach",
      files: [
        "apps/mcp-server/src/scheduler/briefings/format/foreignFlowSection.ts",
        "apps/mcp-server/src/application/usecases/assembleEveningSummary.ts",
        "apps/mcp-server/src/scheduler/briefings/franceSummaryJob.ts"
      ],
      root_cause: (
        "Verified at CODE level, not from comments. assembleEveningSummary.ts:571-580 selects foreign flow with "
        + "`WHERE date = (SELECT MAX(date) FROM daily_ohlcv) AND foreign_net_vol IS NOT NULL AND foreign_net_vol <> 0`. "
        + "Zero rows is therefore the ONLY shape a real outage (or a genuine all-zero session) can produce — and the "
        + "surrounding try/catch also leaves foreignFlowMovers=[] on any DB error. foreignFlowSection.ts:21 answers that shape "
        + "with `if (movers.length === 0) return []`, and eveningSummaryJob.ts:191 splats the result unguarded "
        + "(`lines.push(...formatForeignFlowSection(...))`), so the entire \"Khoi ngoai\" section vanishes silently with no notice. "
        + "The canonical unavailable copy lives one branch lower, at foreignFlowSection.ts:26-29, gated on "
        + "movers.length > 0 AND every entry netVol === 0 — a set the `<> 0` SQL predicate cannot emit. "
        + "franceSummaryJob.ts:434 is worse: it wraps the call in `if (foreignFlowMovers.length > 0)`, so even a future "
        + "empty-path message would be suppressed there. "
        + "INVERTS THE CLOSED ROW'S RESIDUAL FLAG: FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING's router_note worried the "
        + "unavailable copy could MISLABEL a genuine zero-net-flow day as an outage. Reading the query shows the opposite is "
        + "what actually ships — a genuine outage is labelled as nothing at all, and the misleading branch is unreachable. "
        + "LIVE CORROBORATION, not hypothetical: the board's own user-escalated FFLOW-STALE-0723-A-VPS-FIX records foreign flow "
        + "stalled 2026-07-21 to 2026-07-23 (Vinahost VPS suspended). Throughout that window every evening bulletin would have "
        + "omitted the section in silence rather than saying the pipeline was down."
      ),
      fix_spec: (
        "Make the empty case the one that speaks. Emit the canonical "
        + "\"Khoi ngoai: Du lieu khong kha dung (pipeline tam dung)\" line on movers.length === 0, and drop or invert the "
        + "unreachable all-zero branch (keep it only if a caller can still supply raw unfiltered rows via the injected "
        + "getForeignFlowMoversFn path — decide from the call sites, do not guess). Remove the redundant "
        + "`foreignFlowMovers.length > 0` outer guard at franceSummaryJob.ts:434 so both jobs share one policy. "
        + "DISTINGUISH THE TWO CAUSES IF CHEAP: pipeline stale/absent vs. a real all-flat session are different user messages; "
        + "if the freshness of daily_foreign_flow is already available at the call site, say which one it is rather than "
        + "asserting \"pipeline tam dung\" unconditionally — asserting an infra cause from a data-shape observation is the same "
        + "misattribution class this row exists to fix. If it is not cheaply available, ship the neutral wording and say so."
      ),
      verification_gate: (
        "New test in apps/mcp-server/src/__tests__/ covering (a) movers=[] renders the unavailable line, "
        + "(b) franceSummaryJob path renders it too, (c) a normal nonempty set is byte-unchanged. "
        + "Existing 1783-foreign-flow-bulletin.test.ts and FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.test.ts MUST stay green "
        + "(both assert the current copy) — if either must change, that is a copy-SSOT decision, escalate to PO first. "
        + "Full CI green on the pushed SHA, not subset-verify."
      ),
      po_provenance: (
        "[po 2026-08-06T08:52Z] Minted from the RESIDUAL PO-flag left inside FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING's "
        + "router_note when that row was signed off DONE_VERIFIED this tick. Not a re-open of the CI-red row (that fix is "
        + "verified landed); this is the product-judgment remainder the note explicitly deferred to PO. "
        + "Cross-link, do NOT merge: FIX-FOREIGN-FLOW-COVERAGE (review, ops) widens WHICH codes are fetched; "
        + "FFLOW-STALE-0723-B-RECHECK-HARNESS (review, qa) detects staleness OUTSIDE the bulletin. "
        + "This row is only about what the bulletin TELLS THE READER when the data is not there."
      )
    }]
  end;

signoff | mint
