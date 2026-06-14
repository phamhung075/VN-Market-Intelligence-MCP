# Router forward-roll: (a) reconcile ARCH-DOCLANG-SERIALIZE in_progress[REVIEW] -> done_verified[], and
# (b) claim DOCLANG-T1-DOMAIN backlog[TODO] -> in_progress[IN_PROGRESS] as WIP slot 2.
# ARCH design deliverable is RAW-confirmed COMPLETE & CONSUMED: brief docs/architecture-briefs/2026-06-14-
# arch-doclang-serialize.md (372L) + additive scaffold (commit 5d121989, zero DB writes) + pm ALREADY
# atomized into DOCLANG-T1..T6 (commit 483d122f, all on board backlog/TODO). A design REVIEW whose output
# pm has already decomposed is accepted-by-consumption => promote to done_verified (frees the slot + unblocks T1).
# DOCLANG-T1-DOMAIN depends ONLY on ARCH-DOCLANG-SERIALIZE -> satisfied the instant ARCH is done_verified.
# Zone apps/pdf-extractor/ does NOT collide with the in-flight ALLZERO apps/mcp-server/ slot. WIP stays 2
# (ALLZERO + T1) because ARCH leaves in_progress in the same write. head stays on ALLZERO (primary chart pipeline).
# GUARD: refuse unless ARCH-DOCLANG in in_progress[] status REVIEW; DOCLANG-T1 in backlog[] status TODO with
#        depends==["ARCH-DOCLANG-SERIALIZE"]; in_progress[] has EXACTLY 2 (ALLZERO+ARCH); and the surviving
#        non-ARCH in-flight entry's zone != apps/pdf-extractor/ (non-collision assertion).
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b reconcile + Step 3 router claim before spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-doclang-t1-claim.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $wip
| ([$wip[] | select(type=="object" and .id=="ARCH-DOCLANG-SERIALIZE")][0]) as $arch
| ([$wip[] | select(type=="object" and .id!="ARCH-DOCLANG-SERIALIZE")][0]) as $surv
| (.task_board.backlog | map(select(type=="object" and .id=="DOCLANG-T1-DOMAIN"))[0]) as $t1
| if $arch == null then error("ARCH-DOCLANG-SERIALIZE not in in_progress[] — refuse")
  elif ($arch.status != "REVIEW") then error("ARCH-DOCLANG status != REVIEW (got \($arch.status)) — refuse")
  elif (($wip|length) != 2) then error("in_progress[] count \($wip|length) != 2 (expect ALLZERO+ARCH) — WIP guard, refuse")
  elif ($surv == null) then error("could not isolate the surviving in-flight entry — refuse")
  elif (($surv.zone // "") == "apps/pdf-extractor/") then error("surviving in-flight slot already apps/pdf-extractor/ — collision, refuse")
  elif ($t1 == null) then error("DOCLANG-T1-DOMAIN not in backlog[] — refuse")
  elif ($t1.status != "TODO") then error("DOCLANG-T1 status != TODO (got \($t1.status)) — refuse")
  elif ((($t1.depends_on // $t1.depends) // []) != ["ARCH-DOCLANG-SERIALIZE"]) then error("DOCLANG-T1 depends \(($t1.depends_on // $t1.depends)) != [ARCH-DOCLANG-SERIALIZE] — refuse")
  else . end
# (a) move ARCH-DOCLANG REVIEW -> done_verified[]
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    ($arch + {
      status: "done_verified",
      verified_at: $now,
      verified_by: "router",
      verify_note: "Design pass COMPLETE & consumed. RAW: brief 2026-06-14-arch-doclang-serialize.md (372L) + additive scaffold commit 5d121989 (zero DB writes, bctc_table_rows regression-clean by design) + pm atomized into DOCLANG-T1..T6 (commit 483d122f, board backlog/TODO). Accepted-by-consumption; no separate QA gate for a design whose output pm already decomposed. Each T1..T6 carries its own per-layer QA gate."
    })
  ])
# (b) claim DOCLANG-T1 backlog -> in_progress, removing ARCH from in_progress in the same write (WIP stays 2)
| .task_board.in_progress = ([$wip[] | select(type=="object" and .id!="ARCH-DOCLANG-SERIALIZE")] + [
    ($t1 + {
      status: "IN_PROGRESS",
      claimed_at: $now,
      claimed_by: "router",
      next_agent: "dev-pdf-extractor",
      dispatch_note: "Dispatched dev-pdf-extractor \($now) as WIP slot 2 (apps/pdf-extractor/, non-colliding with ALLZERO apps/mcp-server/). DOCLANG-T1-DOMAIN (XS): domain port + config layer — DocLangWritePort in domain/modules/financial_reports/ports.py + doclang_output_dir env in infrastructure/config.py. Authoritative spec = handoff docs/handoffs/TASK-DOCLANG-T1.md + design brief docs/architecture-briefs/2026-06-14-arch-doclang-serialize.md. NOTE: architect scaffold (commit 5d121989) already drafted ports.py/config.py stubs — T1 hardens them to the DDD-clean contract per handoff AC (do NOT duplicate; reconcile against the scaffold). Additive only, zero DB writes, bctc_table_rows byte-for-byte clean. Run existing pdf-extractor test suite BEFORE commit (pytest, not pnpm — Python zone). Promote -> review (qa) on green + commit. Unblocks DOCLANG-T2-SERIALIZER."
    })
  ])
| .task_board.backlog |= map(select((type=="object" and .id=="DOCLANG-T1-DOMAIN") | not))
