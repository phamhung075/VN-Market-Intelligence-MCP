# Router dev-team — VN-MACRO-TOOLING architect PROBE-FOLD DONE (router RAW-verified) -> pm WAVE-2 dispatch.
# architect (a6edfbdc, commit 9dbfcbbb — router RAW-verified: git show 9dbfcbbb --stat = EXACTLY 3 docs
#   (docs/handoffs/ARCH-VN-MACRO-TOOLING.md +483 [57KB real on disk], decisions/sprint-VN-MACRO-TOOLING.md +60
#   [entries 8-12], architect.md notebook +31); NO Go code, NO orch-state/board, NO signal_queue in commit;
#   HEAD==9dbfcbbb; working tree board clean; .head UNTOUCHED [next_agent=architect]).
# PROBE-FOLD substance RAW-read from decision journal (entries 8-12), sound + honest + matches probe outcomes:
#   E8 VMT-1b.bloc_split = NSO FDI 12.FDI x 14.XK cross-join estimate, is_estimate=true MANDATORY+PERMANENT
#     (customs SPA unblockable — DNS NXDOMAIN + bridge HTTP400; headless-in-Go rejected; dev MUST NOT flip false).
#   E9 VMT-5b.interbank = Option 2 permanent is_estimate=true, rate_1w_pct:null + blocked_reason
#     (no public interbank API; WiData off-limits; IP-whitelist out-of-scope; consistent w/ IRS DD-6 precedent).
#   E10 VMT-2 BOP = direct JSON GET (Liferay article API scopeKey=20117), NO excelize, NO PDF (PROBE-2 live payload).
#   E11 NSO Excel = single getOrFetchNSOMonthlyExcel() cache (TTL 24h monthly) serves VMT-1a/1b/3b/4 — no 4x redundant fetch.
#   E12 Zone A SERIALIZE A1->A2->A3->A4->A5 merge-gated (handlers_vmt.go/usecases_vmt.go/dtos_vmt.go shared; MED recurring-bug).
# WAVE-2 dispatch-ready (architect handoff): A1=VMT-2 (SBV JSON) / A2=VMT-3b+VMT-4 (NSO Excel IIP+CPI) /
#   A3=VMT-1a+VMT-1b (NSO Excel XK/NK/FDI) / A4=VMT-5b.omo (SBV OMO HTML) / A5=VMT-5a (market.db+sbv.gov.vn).
# STILL BLOCKED (do NOT dispatch): VMT-3a PMI needs PROBE-5 (S&P Global — NOT geo-blocked, dev runs LOCAL probe);
#   VMT-5b.interbank + VMT-5b.irs = permanent is_estimate (no parser).
# This write (ONE atomic temp->rename): advance parent BA-VN-MACRO-TOOLING in in_progress[] next_agent architect->pm,
#   stamp probe_fold_commit + arch_decisions + wave2_order + serialization_guard + router_arch_reverify_verdict.
#   Mark VMT-3a-MACRO-INDICATORS-PMI ready->blocked-probe5 (PROBE-5 gate). head -> active/next=pm. 0 new id-lines.
# GUARD: refuse unless head.next_agent=="architect" AND parent in in_progress[] status=="pm-breakdown-done" next_agent=="architect".
# Usage: jq --arg now "$NOW" -f scripts/router-d20-vnmacro-probefold-to-pm-20260614.jq docs/data/orch/orch-state.json
def PARENT: "BA-VN-MACRO-TOOLING";
def SPRINT: "VN-MACRO-TOOLING";
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")==PARENT))][0]) as $p
| if (.head.next_agent != "architect") then error("head.next_agent != architect (\(.head.next_agent)) — refuse")
  elif ($p == null) then error("BA-VN-MACRO-TOOLING not in in_progress[] — refuse")
  elif (($p.status // "") != "pm-breakdown-done") then error("parent status != pm-breakdown-done (\($p.status)) — refuse")
  elif (($p.next_agent // null) != "architect") then error("parent next_agent != architect (\($p.next_agent)) — refuse")
  else . end
# 1. advance parent -> pm
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")==PARENT))
      then (. + {
        status: "architect-probefold-done",
        next_agent: "pm",
        probe_fold_done_at: $now,
        probe_fold_commit: "9dbfcbbb",
        arch_handoff: "docs/handoffs/ARCH-VN-MACRO-TOOLING.md",
        arch_decisions: "E8 VMT-1b=NSO-FDI-cross-join is_estimate=true PERMANENT (customs SPA unblockable); E9 VMT-5b.interbank=Option2 permanent is_estimate=true+blocked_reason (no public API, IP-whitelist out-of-scope, IRS-DD-6 precedent); E10 VMT-2=direct-JSON Liferay article API NO excelize/PDF (PROBE-2 live); E11 NSO-Excel single cache serves VMT-1a/1b/3b/4; E12 Zone-A SERIALIZE A1..A5 merge-gated (MED recurring-bug).",
        wave2_order: "A1=VMT-2(SBV-JSON) -> A2=VMT-3b+VMT-4(NSO-Excel IIP+CPI) -> A3=VMT-1a+VMT-1b(NSO-Excel XK/NK/FDI) -> A4=VMT-5b.omo(SBV-OMO-HTML) -> A5=VMT-5a(market.db+sbv.gov.vn). excelize added to go.mod ONCE at A2. VMT-3a PMI HELD on PROBE-5 (S&P, dev-local). VMT-5b.interbank+irs permanent estimate (no parser).",
        serialization_guard: "Zone A dev tasks (handlers_vmt.go/usecases_vmt.go/dtos_vmt.go) MUST be serial — one dev-macro-indicators task at a time, merge gate between each. PM enforces (feedback_recurring_bug_escalation).",
        router_arch_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the arch badge): git show 9dbfcbbb --stat = EXACTLY 3 docs (handoff 483L/57KB on disk + decision journal 60L entries 8-12 + architect notebook 31L); ZERO Go code, ZERO orch-state/board/signal in commit; HEAD==9dbfcbbb; board working tree clean; .head untouched. Decisions read from journal: 2 BLOCKED sub-fields resolved fail-closed (E8 customs->NSO-FDI is_estimate=true, E9 interbank->Option2 permanent estimate), 3 PASS folded to live contracts (E10 VMT-2 pure-JSON, E11 NSO-Excel shared cache, E12 serialization). Honest is_estimate throughout (GA-4), contract-from-live-payload (GA-7). Sound + dispatch-ready."
      })
      else . end
  ]
# 2. mark VMT-3a PROBE-5-gated (architect: PMI needs PROBE-5, NOT in WAVE-2 serial chain)
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if ((.id // "")=="VMT-3a-MACRO-INDICATORS-PMI")
            then (. + {status: "blocked-probe5", probe5_gate_at: $now,
                       probe5_note: "PMI source = S&P Global (NOT geo-blocked) — needs PROBE-5 characterization before parser; dev-macro-indicators runs the probe LOCALLY (no VPS). Held out of WAVE-2 serial chain per architect probe-fold."})
          else . end
      ] )
      else . end
  ]
# 3. head -> pm
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "pm",
    note: "VN-MACRO-TOOLING architect PROBE-FOLD DONE (a6edfbdc, commit 9dbfcbbb, router RAW-verified 3 docs explicit-path: ARCH-VN-MACRO-TOOLING.md handoff 483L + decision journal entries 8-12 + notebook; NO Go/board/signal in commit; .head untouched). 2 BLOCKED sub-fields RESOLVED fail-closed: VMT-1b.bloc_split=NSO-FDI cross-join is_estimate=true PERMANENT (customs SPA unblockable), VMT-5b.interbank=Option2 permanent is_estimate=true+blocked_reason (no public API; IRS-DD-6 precedent). 3 PASS folded to live per-parser contracts: VMT-2=direct-JSON (NO excelize), NSO-Excel single cache serves VMT-1a/1b/3b/4, VMT-5b.omo=SBV-OMO-HTML. -> pm: attach per-parser contracts from handoff to each WAVE-2 board task + set SERIAL dispatch order A1=VMT-2 -> A2=VMT-3b+4 -> A3=VMT-1a+1b -> A4=VMT-5b.omo -> A5=VMT-5a with merge gate between each (Zone-A MED recurring-bug, handlers_vmt.go/usecases_vmt.go/dtos_vmt.go shared — SERIALIZE dev-macro-indicators). VMT-3a PMI -> blocked-probe5 (S&P NOT geo-blocked, dev-local PROBE-5 first). VMT-5b.interbank+irs permanent estimate (no parser). VMT-D-VPSFETCH done (46095c3d) + VMT-6 done (105b07c4). ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. KINHDICH-HOVER-DETAIL separate chain: dev-frontend done (de8d8d0a) -> ops frontend rebuild dispatched (ac42c0d0). Commit explicit path only."
  }
