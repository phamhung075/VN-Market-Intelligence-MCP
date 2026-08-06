# scripts/po-s153-pdfavail02-close-deploygate-lifecycle-mint.jq
#
# PO directed disposition 2026-08-01 (router SID 685a4df4) — single atomic pass,
# SEVEN mutations, all idempotent:
#
#   M1 CLOSE      PDF-AVAIL-02-FIX  backlog[] -> done_verified[] (DONE_VERIFIED)
#                 with a 4-source verification stamp (commit ancestry / deployed
#                 image build ts / live docker-exec code presence / 11d-clean
#                 signal history). Guard: skip if already out of backlog[].
#   M2 MINT       ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE — architect
#                 design brief owning the WHOLE "user-gated deploy" lifecycle
#                 class (surface leg + auto-close leg + dead substrate leg).
#                 Guard: id-guarded against EVERY lane.
#   M3 MINT       FIX-GITSHA-BUILDARG-NEVER-PASSED-FLEETWIDE — the concrete,
#                 deploy-free bug that makes M2's only existing actuator
#                 (scripts/verify-deploy-sha.sh) structurally dead fleet-wide.
#                 Guard: id-guarded against EVERY lane.
#   M4 AMEND      FIX-BOARD-ROW-PLAN-ONLY-NOT-MIRRORED-FROM-DETAIL — fold the
#                 detail_ref lifecycle-field drift finding in as AC-6 instead of
#                 minting a 4th sibling row (prior-art discipline).
#   M5 AMEND      FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER — link as Leg-3
#                 of the M2 umbrella so the class is swept once, not row-by-row.
#   M6 AMEND      UC-ASL-P5 — record that its own 2026-07-21 SPLIT recommendation
#                 was never executed (2nd measured instance of the M2 surface gap)
#                 and that this pass performed a scoped relief, not a bulk one.
#   M7 RESOLVE    the 30 status=="triaged" pdf-extractor A-20 signal_queue rows
#                 whose home row is now closed -> RESOLVED (cold-evictable).
#                 Guard: status=="triaged" predicate is self-disarming.
#
# Reusable pattern: "a supervised backlog row's fix has demonstrably shipped but
# nothing closed it — close it on 4-source evidence, resolve its orphaned
# corroboration signals, and route the missing close-the-loop MECHANISM to
# architect instead of hand-patching the next occurrence."
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s153-pdfavail02-close-deploygate-lifecycle-mint.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# ---------- helpers ----------
def lane_ids:
  [ (.task_board // {}) | to_entries[] | .value
    | if type=="array" then .[] else empty end
    | if type=="object" then (.id // empty) else empty end ];

def has_id($x): (lane_ids | index($x)) != null;

def amend($id; $patch):
  (.task_board.backlog // []) |= map(
    if type=="object" and .id == $id then . + $patch else . end
  );

# ---------- M1: close PDF-AVAIL-02-FIX ----------
( [ (.task_board.backlog // [])[] | select(type=="object" and .id=="PDF-AVAIL-02-FIX") ] | first ) as $pdfrow
| ( if $pdfrow == null then .
    else
      .task_board.backlog = [ (.task_board.backlog // [])[]
                              | select((type=="object" and .id=="PDF-AVAIL-02-FIX") | not) ]
      | .task_board.done_verified = ((.task_board.done_verified // []) + [
          $pdfrow + {
            status: "DONE_VERIFIED",
            done_verified: true,
            next_agent: null,
            resolution: "FIXED-AND-DEPLOYED",
            completed_at: $now,
            completed_by: "po/po-s153-directed-disposition",
            qa_verified_at: $now,
            qa_verified_by: "po/po-s153 (4-source live verification, see po_closure_verification_20260801)",
            po_closure_verification_20260801: (
              "CLOSED DONE_VERIFIED (PO po-s153, " + $now + ") on FOUR INDEPENDENT RAW SOURCES, each re-checked this tick — not inferred from the row's own prose. "
              + "(1) COMMIT ANCESTRY: c78839c6cea9e67258a928bcc1796bdd81a3cb43 (2026-07-21T05:11:39+02:00, 'fix(microservice/pdf-extractor): PDF-AVAIL-02-FIX offload background-task OCR to worker threads', 7 files / +540 -38) — `git merge-base --is-ancestor c78839c6c HEAD` exits 0, so the fix is on live main. `git log -S 'asyncio.to_thread' -- apps/pdf-extractor/interface/handlers.py` names c78839c6c as the INTRODUCING commit (only later toucher is b3853e817, the 07-29 handlers split refactor). "
              + "(2) DEPLOYED IMAGE: container vn-market-intelligence-mcp-pdf-extractor-1 runs image sha256:a75ddd7336f0 built 2026-07-28T16:41:32Z (container created 16:44:59Z) — 7 days AFTER the commit. Container state 'Up 15 hours (healthy)'. "
              + "(3) LIVE CODE PRESENCE (the decisive check — image timestamp alone is not evidence the fix is IN it): `docker exec ... grep -n asyncio.to_thread /app/interface/handlers.py` returns line 253 `result = await asyncio.to_thread(` plus the fix's own explanatory comment block at 244-246. Corroborated by layout: the live /app/interface/ still has the single pre-split handlers.py (no routes_*.py), consistent with an image built 07-28 i.e. after c78839c6c and before b3853e817 (07-29T01:33Z). "
              + "(4) SIGNAL HISTORY: zero A-20 / event-loop-stall emissions since 2026-07-21T14:12:13Z (sys-20260721T141213-26f0) — 11 days clean as of 2026-08-01, across a detector that was firing every ~30min Tier-1 cycle during the outage. system-auditor notebook reports pdf-extractor 4/4 healthy. "
              + "HOW IT SHIPPED — recorded honestly because it is the reason this row sat open: the deploy was INCIDENTAL, not gated-then-approved. The rebuild that carried c78839c6c into prod was an unrelated 07-28/07-29 pdf-extractor rebuild (FIX-PDFX-TESSERACT-CONCURRENCY / FACTORY-PDF-split-handlers band). The row's own po_sequencing_gate_20260721T16 asked the router to surface the deploy-gate to the user; no trace of that ask reaching the user exists (ops notebook + telegram both checked). So the fix reached prod by LUCK, and the row then stayed BACKLOG for 11 further days because nothing ties 'image rebuilt containing commit X' back to 'close the row X was for'. That MECHANISM gap is now owned by ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE (M2 this pass) — it is NOT re-litigated on this row. "
              + "STALE-DETAIL WARNING: this row's detail_ref (docs/data/orch/archive/backlog-detail.json#PDF-AVAIL-02-FIX) was materially WRONG at closure time (status 'backlog', zone 'ops', owner 'ops', created_at 2026-06-10, no supervised key, and a status_note asserting 'DEPLOYED ... Up 6 hours (healthy)' from a June probe). The HOT board row is authoritative; the detail entry is being corrected in the same commit, and the drift CLASS is folded into FIX-BOARD-ROW-PLAN-ONLY-NOT-MIRRORED-FROM-DETAIL AC-6 (M4). "
              + "NOT CLAIMED: this closure certifies the event-loop stall fix only. It does NOT certify that the live pdf-extractor image equals HEAD — it does not (4 pdf-extractor commits land after the 07-28 build: b3853e817, 1d8b1374f, 200eabcf3, d808a6a11). That residual is exactly what M2/M3 are for."
            )
          }
        ])
    end )

# ---------- M2: mint the deploy-gate lifecycle design brief ----------
| ( if has_id("ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE") then .
    else
      .task_board.backlog = ((.task_board.backlog // []) + [{
        id: "ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE",
        type: "SPIKE",
        size: "M",
        priority: "P1",
        status: "BACKLOG",
        zone: "cross-service/",
        owner: "po",
        next_agent: "agents-architect",
        plan_only: true,
        supervised: true,
        created_at: $now,
        created_by: "po/po-s153 (directed disposition, router SID 685a4df4 — user escalation: 'agents detect the same thing forever and nothing visibly resolves')",
        title: "Design the user-gated-deploy lifecycle: a deploy-gate ask has NO surfacing channel and a shipped fix has NO auto-close, so correct diagnoses read as infinite detection noise",
        question: "What is the minimum durable mechanism that (a) makes a user-gated deploy/decision ask REACH a consumer instead of dying in a disposition prose field, and (b) CLOSES a backlog row when the commit it tracks demonstrably reaches a running image — without hand-patching one row at a time?",
        mode: "spike",
        timebox: 120,
        desc: "MINTED 2026-08-01 by PO from a user escalation, on the back of PDF-AVAIL-02-FIX which was CLOSED DONE_VERIFIED in the same pass after sitting BACKLOG for 11 days while its fix was already live in prod. This row owns the MECHANISM, not that one occurrence. THREE MEASURED LEGS. LEG A — SURFACE GAP: PO's only channel for a user-gated ask today is a prose field on the row. Measured instances: (A1) PDF-AVAIL-02-FIX.po_sequencing_gate_20260721T16 (2026-07-21T16:0xZ) says verbatim 'RECOMMEND: router surface this deploy-gate to the user as the sequencing long pole' — no telegram, no signal_queue row, no ops.md trace; it never reached anyone, and the fix only shipped because an unrelated 07-28 rebuild happened to carry the commit. (A2) UC-ASL-P5.po_triage_20260721_orch_sentinel (2026-07-21T15:36Z) says verbatim 'SPLIT the deploy-free half out and land it ahead of the deploy window' — 11 days on, UC-ASL-P5 is still one undivided supervised row with deploy_gate:'user-approved-off-market'. Both are the SAME failure: a PO decision that requires a non-PO actor was written where no actor reads. LEG B — AUTO-CLOSE GAP: nothing ties 'service image rebuilt AND contains commit X' back to 'close the still-open row X was minted for'. PDF-AVAIL-02-FIX's code was live from 2026-07-28T16:41Z and the row stayed status:BACKLOG/supervised:true until 2026-08-01 — 11 days of a correct detector pointing at an already-fixed defect, which is precisely the noise the user is complaining about. LEG C — THE EXISTING SUBSTRATE IS DEAD, DO NOT ASSUME IT WORKS: scripts/verify-deploy-sha.sh already implements 'compare deployed image label vn.market.git_sha against expected SHA'. RAW-probed 2026-08-01 across all 13 running containers: 9 report the literal string 'unknown', 4 report NOTHING. Zero report a real SHA. Root cause measured, not guessed: every apps/*/Dockerfile declares ARG GIT_SHA=unknown, and docker-compose.yml contains ZERO occurrences of GIT_SHA (no build.args wiring anywhere), so no build ever passes it; additionally apps/pdf-extractor/Dockerfile:19 emits the BARE key `LABEL git_sha=` while the script and every other service use `vn.market.git_sha`. That deploy-free bug is split out as FIX-GITSHA-BUILDARG-NEVER-PASSED-FLEETWIDE and is a hard PREREQUISITE for any label-based design. PRIOR ART — this row is the class owner; do not re-mint siblings: FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER (Leg-3 of the same class: dev-* writes REBUILD_REQUIRED=true into prose no gate reads, so qa live-verifies against an un-rebuilt image), OPS-MCP-SERVER-REACQUIRE-GIT-SHA-LABEL (single-service instance of Leg C), FIX-VERIFY-DEPLOY-SHA-BENIGN-DRIFT + FIX-VERIFY-DEPLOY-SHA-BENIGN-DOC-DRIFT (the same script's false-positive semantics — settle them inside this design rather than separately), UC-ASL-P5 (owns the signal-status canonicalization that makes stale corroboration rows accumulate visibly).",
        deliverable: "A design brief at docs/architecture-briefs/<date>-deploy-gate-lifecycle.md answering, with a decision per point, not a survey. AC-1: name the SURFACING channel for a user-gated ask and prove it has a live consumer — candidates are a first-class signal_queue row type (deploy_gate) that the router/cowork dashboard already scans, and/or send_telegram(channel='work'); whichever is chosen, cite the file+line of the code or flow step that READS it. A second prose field is an automatic reject. AC-2: specify the ASK's structured shape (which row, which commit(s), which service, what the user must authorize, what unblocks on approval) so it is machine-checkable and de-duplicable across ticks — a stuck ask must be re-surfaced on a bounded cadence, NOT re-emitted every tick (that would recreate the noise this row exists to kill). AC-3: specify the AUTO-CLOSE sweep: for every open row carrying a fix commit, decide deployed-ness and propose a status flip. It MUST work for label-less/unknown-label services, because per Leg C that is currently 13/13 of the fleet — the fallback used by hand this tick was `git merge-base --is-ancestor <fix_sha> <deployed_sha_or_build_boundary>` plus an in-container code-presence probe plus 'detector silent since deploy'. State explicitly which signals are REQUIRED vs corroborating. AC-4: the sweep PROPOSES, it must not silently auto-close — a wrong auto-close is worse than a stale row. Route proposals to PO for ratification (PO already has a manual-dispatch-sweep producer to model on: docs/agents/po/flow/manual-dispatch-sweep.md). AC-5: where does the commit->row binding come from? Commit subjects already embed row ids (c78839c6c literally contains 'PDF-AVAIL-02-FIX'); decide whether to parse subjects, require a structured fix_commit field on the row, or both — and say what happens when neither exists. AC-6: name the SCHEDULE and the OWNER agent for the sweep (dev-team tick? cowork slot? ops?), and confirm against the LIVE config that the chosen host actually runs, per feedback_cron_armed_but_wrong_prompt_variant and feedback_fix_landed_in_the_pregate_not_the_probe_the_agent_actually_runs. AC-7: a non-vacuous test — replay the PDF-AVAIL-02-FIX timeline (commit 07-21, incidental rebuild 07-28, row still open) and assert the design would have surfaced the ask on 07-21 AND proposed the close on 07-28. A design that does not close this exact historical case is not accepted. AC-8: state the blast radius on the three prior-art rows above — which are SUPERSEDED by this design, which stay independent. Do NOT widen or weaken the supervised/plan_only withholding gates as part of this.",
        related: ["PDF-AVAIL-02-FIX","FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER","FIX-GITSHA-BUILDARG-NEVER-PASSED-FLEETWIDE","OPS-MCP-SERVER-REACQUIRE-GIT-SHA-LABEL","FIX-VERIFY-DEPLOY-SHA-BENIGN-DRIFT","FIX-VERIFY-DEPLOY-SHA-BENIGN-DOC-DRIFT","UC-ASL-P5"],
        files: ["scripts/verify-deploy-sha.sh","docs/agents/po/flow/triage-signals.md","docs/agents/dev-team/flow/main.md","docs/protocols/docker-deployment-runbook.md"],
        verification_gate: "design_brief_reviewed_by_po",
        supervised_note: "plan_only:true + supervised:true — DESIGN ONLY, no code. next_agent=agents-architect is off the dev-router allowlist by design; reachable via PO's manual-dispatch sweep (docs/agents/po/flow/manual-dispatch-sweep.md). BOUNDED-1 must not auto-pick this up as a coding row."
      }])
    end )

# ---------- M3: mint the deploy-free git_sha prerequisite ----------
| ( if has_id("FIX-GITSHA-BUILDARG-NEVER-PASSED-FLEETWIDE") then .
    else
      .task_board.backlog = ((.task_board.backlog // []) + [{
        id: "FIX-GITSHA-BUILDARG-NEVER-PASSED-FLEETWIDE",
        type: "FIX",
        size: "S",
        priority: "P1",
        status: "BACKLOG",
        zone: "cross-service/",
        owner: "po",
        next_agent: "developer",
        plan_only: false,
        created_at: $now,
        created_by: "po/po-s153 (measured while closing PDF-AVAIL-02-FIX)",
        title: "scripts/verify-deploy-sha.sh is structurally DEAD fleet-wide: docker-compose.yml never passes GIT_SHA, so all 13 running containers label as 'unknown' or nothing — every deploy-SHA check fails identically and proves nothing",
        desc: "MEASURED 2026-08-01, RAW, not inferred. (1) `docker inspect --format '{{ index .Config.Labels \"vn.market.git_sha\" }}'` over all 13 running containers: 9 return the literal 'unknown' (mcp-server, stock-price, macro-indicators, frontend, api-gateway, news-fetch, rag-service, technical-analysis, alert-engine, kinh-dich-service), 4 return empty (pdf-extractor, mcp-gateway, flaresolverr [documented skip], and the label is simply absent). ZERO return a git SHA. (2) ROOT CAUSE A: every apps/*/Dockerfile declares `ARG GIT_SHA=unknown` and `grep -c GIT_SHA docker-compose.yml` returns 0 — there is no build.args block anywhere in compose, so no `docker compose build` path ever supplies the arg and the default always wins. The label was therefore never populated by the normal build path, only ever by a hand-typed `--build-arg`. (3) ROOT CAUSE B (separate, pdf-extractor only): apps/pdf-extractor/Dockerfile:19 emits `LABEL git_sha=\"${GIT_SHA}\" service=\"pdf-extractor\"` — the BARE key `git_sha`, while scripts/verify-deploy-sha.sh and all 10 other services use the namespaced key `vn.market.git_sha`. So even once the arg is wired, pdf-extractor would still read as label-absent. (4) CONSEQUENCE: verify-deploy-sha.sh's compare_shas() takes its 'label absent'/'SHA drift' error branch for 100% of the fleet, 100% of the time. It is referenced by docs/protocols/docker-deployment-runbook.md as the Step-4 deploy gate, and it is the ONLY existing deploy-verification actuator in the repo — it cannot distinguish a genuinely stale container from a correctly-deployed one, which is exactly why PDF-AVAIL-02-FIX's deployment went undetected for 11 days. SUPERSEDES-BY-SCOPE (do not work separately): OPS-MCP-SERVER-REACQUIRE-GIT-SHA-LABEL frames this as one service omitting --build-arg; the measurement above shows it is fleet-wide and structural (compose wiring), not an ops slip. PREREQUISITE FOR: ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE Leg C. RELATED SEMANTICS (fix alongside, they are the same script): FIX-VERIFY-DEPLOY-SHA-BENIGN-DRIFT and FIX-VERIFY-DEPLOY-SHA-BENIGN-DOC-DRIFT both describe the script false-positiving on doc-only commits after a build — the ancestor-plus-empty-zone-diff predicate they propose is the right semantics and should land in the same change.",
        deliverable: "AC-1: docker-compose.yml carries `build.args: GIT_SHA: ${GIT_SHA:-unknown}` (or equivalent) for every locally-built service, and the documented rebuild path in docs/protocols/docker-deployment-runbook.md exports GIT_SHA=$(git rev-parse HEAD) so the normal rebuild populates it with no operator memory required. AC-2: apps/pdf-extractor/Dockerfile:19 label key corrected to `vn.market.git_sha` (keep the existing `service=` label). AC-3: verify-deploy-sha.sh keeps failing LOUD on a genuinely absent label — do NOT paper over the absent case with a warn, that is what made this invisible. AC-4: a test asserting compare_shas() rejects 'unknown' as a non-SHA sentinel rather than treating it as a real mismatch value, so the diagnostic message distinguishes 'never labelled' from 'stale image'. AC-5: fold in the ancestor-plus-empty-zone-diff PASS predicate from FIX-VERIFY-DEPLOY-SHA-BENIGN-DRIFT / -DOC-DRIFT (3 confirmed benign false positives already logged there) and close those two rows out with this one, or state why not. AC-6 (verification): after the change, a rebuild of ONE service must make `scripts/verify-deploy-sha.sh <that service>` exit 0 against HEAD, RAW-shown. NO FLEET REBUILD IS REQUIRED to land this — the label appears per-service on whatever rebuild each service next receives, so this row is NOT user-gated and must not be treated as such.",
        related: ["ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE","OPS-MCP-SERVER-REACQUIRE-GIT-SHA-LABEL","FIX-VERIFY-DEPLOY-SHA-BENIGN-DRIFT","FIX-VERIFY-DEPLOY-SHA-BENIGN-DOC-DRIFT"],
        files: ["docker-compose.yml","apps/pdf-extractor/Dockerfile","scripts/verify-deploy-sha.sh","scripts/test-sha-comparison-unit.sh","docs/protocols/docker-deployment-runbook.md"],
        verification_gate: "live_runtime_query_after_next_rebuild",
        baseline_pass: "unmeasured-at-mint"
      }])
    end )

# ---------- M4: fold detail_ref lifecycle drift into the existing class row ----------
| amend("FIX-BOARD-ROW-PLAN-ONLY-NOT-MIRRORED-FROM-DETAIL";
    { po_scope_extension_20260801: (
        "SCOPE EXTENSION (PO po-s153, " + $now + ") — NO NEW ROW MINTED. Prior-art check per feedback_file_prior_art_check_before_minting_row found this row already owns backlog-detail <-> board mirror coherence, so the finding below is folded in here rather than becoming a 4th sibling; this row's own desc warns that this class was previously 'remediated ONE ROW AT A TIME and the class was never swept'. NEW MEASUREMENT (2026-08-01, cross-match of docs/data/orch/archive/backlog-detail.json items[] against task_board.backlog[]): 198 hot backlog rows carry a detail_ref. Only 99 (50%) agree with their detail entry on status AND zone. 48 DISAGREE on status and/or zone. 51 have NO entry in the detail file at all (dangling detail_ref — the known Stage-1c dangle class, drain-prune-driven; not this row's job, listed for completeness). So the drift is NOT plan_only-specific: it is every lifecycle field. CONCRETE HARM, MEASURED THIS TICK: PDF-AVAIL-02-FIX's detail entry read status 'backlog', zone 'ops', owner 'ops', created_at 2026-06-10, NO supervised key, and a status_note asserting the service was 'DEPLOYED ... Up 6 hours (healthy)', while the hot row was BACKLOG/supervised:true/zone apps/pdf-extractor/recurring_bug_count 6 with five dated 07-20..07-21 dispositions. A router reading detail_ref alone concluded — and told the user — that the item 'was never routed and had sat in backlog since mint', which was materially false in every particular. AC-6 (ADDED): whatever gate AC-1 lands in scripts/orch-validate.mjs must be FIELD-GENERAL, not plan_only-only — at minimum status and zone must be coherent between a board row and its detail entry, or the detail entry must be explicitly and machine-visibly marked non-authoritative for lifecycle fields (a stamped `authoritative_fields` allowlist is acceptable and cheaper than two-way mirroring). Pick ONE direction of truth and enforce it; do not add a second mirroring mechanism. AC-7 (ADDED): the same validator run must REPORT the 48-row drift set and the 51-row dangling set as a count, so the backlog is measurable before and after — a fix that silences the check without draining the set is a false green."
      ,
      updated_by: "po/po-s153" } )

# ---------- M5: link the sibling prose-marker row into the class ----------
| amend("FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER";
    { po_class_link_20260801: (
        "CLASS LINK (PO po-s153, " + $now + "): this row is Leg-3 of the class now owned by ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE. Same shape, different producer — dev-* writes REBUILD_REQUIRED=true into prose no gate reads (here), PO writes 'router surface this deploy-gate to the user' into prose no gate reads (PDF-AVAIL-02-FIX, measured dead for 11 days), PO writes 'SPLIT the deploy-free half out' into prose no gate reads (UC-ASL-P5, still unsplit 11 days on). Do NOT design a third independent marker channel: whoever implements the architect brief must resolve this row's REBUILD_REQUIRED consumer inside that same mechanism, or this row must state why it needs a separate one. Kept OPEN and independently dispatchable — it is not blocked by the brief."
      ,
      related: (((.related // []) + ["ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE","PDF-AVAIL-02-FIX"]) | unique),
      updated_by: "po/po-s153" } )

# ---------- M6: record the unexecuted split + scoped relief on UC-ASL-P5 ----------
| amend("UC-ASL-P5";
    { po_followup_20260801: (
        "FOLLOW-UP (PO po-s153, " + $now + ") — NO RE-MINT, this row remains the single owner of signal status/type canonicalization. TWO ENTRIES. (1) YOUR OWN RECOMMENDATION WAS NEVER EXECUTED: po_triage_20260721_orch_sentinel (2026-07-21T15:36Z) recommended SPLITTING the deploy-free half (stop the emitters writing non-canonical 'triaged'; triage-signals 'mark DONE'->RESOLVED with a no-row guard) out from the deploy-gated half (Zod enum tighten, needs an mcp-server rebuild). 11 days later the row is still one undivided supervised/deploy-gated unit, so the deploy-free half is still hostage to a deploy window that has not come. This is now logged as measured instance A2 of the surfacing gap owned by ARCH-DEPLOY-GATE-LIFECYCLE-NO-SURFACE-NO-AUTOCLOSE. The split is still the right call and is still un-actioned. (2) LIVE COUNTS RE-MEASURED " + $now + ": signal_queue.rows[] = 137, of which 130 are status 'triaged' (95%) — up from the 73 residual recorded on 07-21 despite po-s148's bulk relief, exactly as this row predicted ('the residual keeps growing until the EMITTER is fixed'). scripts/orch-cold-evict.sh TERMINAL_SIGNAL_STATUSES is still READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED — 'triaged' is absent, so those 130 rows can never leave the hot file. This IS the mechanical source of the user-visible 'the same signal spams forever' complaint: the rows are not being re-emitted, they are being retained. (3) THIS PASS DID NOT DO ANOTHER BULK RELIEF. Only the 30 pdf-extractor A-20 rows whose home row PDF-AVAIL-02-FIX was closed DONE_VERIFIED this same tick were flipped triaged->RESOLVED, because for those rows RESOLVED is now semantically TRUE, not a canonicalization convenience. The other ~100 triaged rows are deliberately left alone: relieving them again would once more mask the emitter bug this row exists to fix."
      ,
      updated_by: "po/po-s153" } )

# ---------- M7: resolve the orphaned A-20 corroboration signals ----------
| .signal_queue.rows = [ (.signal_queue.rows // [])[]
    | if (type=="object"
          and ((.summary // "") | test("A-20"))
          and ((.summary // "") | test("pdf-extractor"))
          and (.status == "triaged"))
      then . + {
        status: "RESOLVED",
        resolved_at: $now,
        resolved_by: "po/po-s153",
        resolution_note: "Home row PDF-AVAIL-02-FIX closed DONE_VERIFIED " + $now + " on 4-source live evidence (commit c78839c6c ancestor of HEAD; deployed image built 2026-07-28T16:41:32Z; asyncio.to_thread present in the running container at /app/interface/handlers.py:253; zero A-20 emissions since 2026-07-21T14:12:13Z). These rows were genuine corroboration of a real outage that is now fixed and deployed — they are RESOLVED, not retracted, and are now cold-evictable. Scoped relief only; the 'triaged' emitter bug remains owned by UC-ASL-P5."
      }
      else . end ]

| ._updated_by = "po/po-s153-pdfavail02-close-deploygate-lifecycle-mint"
