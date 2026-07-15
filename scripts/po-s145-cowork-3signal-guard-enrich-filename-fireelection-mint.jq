# po-s145-cowork-3signal-guard-enrich-filename-fireelection-mint.jq
# ---------------------------------------------------------------------------
# Single-pass 3-signal cowork-team triage (idempotent), piped to orch-apply.sh.
# Origin: 2026-07-15 dev-team :07 Step-1 PO triage of 3 NEW signal_queue rows
#   (cow-20260715T212837 defect / 212838 data-integrity / 214005 defect).
#
#   M1 DEDUP-ENRICH — fold signal-1 (bctc-analyst self-edit = CONFIRMED 2nd
#      instance, content RAW-VERIFIED CORRECT) INTO the existing
#      GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC row: bump P2->P1
#      (recurring class 2+), add the false-premise correction (the row's
#      option-1 "sole legit write is a notebook" is FACTUALLY WRONG — ~207
#      committed docs/signals/*.json across 7 agents) + a 3rd scope item
#      (doc-fix proposal channel via agent-father). Marker-guarded.
#   M2 MINT signal-2 — FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (date-keyed
#      signal/synthesis filenames clobber intra-day; 3rd instance, confirmed
#      FPT 9240->8120). DISTINCT from FU-CTG-DISCOVERY-FILENAME-FILTER /
#      FU-BACKFILL-REAL-FILENAMES. id-guarded across all lanes.
#   M3 MINT signal-3 — FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE (cron:cowork:
#      <TICK> released at Step 6 -> same-tick self-refire re-elects+re-runs).
#      DISTINCT from FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS (P1 =
#      peer/two-path; this = single-session self-refire). id-guarded.
#   M4 SIBLING-LINK — marker on the P1 mutex row pointing at the new tombstone
#      row (so its ba does not assume the namespace fix closes the refire path).
#   M5 FLIP signals: 212837 NEW->RESOLVED (folded, no new row); 212838 &
#      214005 NEW->READ (minted, tracked via origin_signal_id -> auto-RESOLVE
#      on DONE_VERIFIED per triage-signals.md).
#   M6 stamp last_triaged_at/by.
#
# All mutations idempotent (id-guard on mints, marker-guard on enrich/link,
# status-guard on flips). Conservation: task_total +2 (grows), signal_total
# unchanged. Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s145-...jq docs/data/orch/orch-state.json \
#     | bash scripts/orch-apply.sh
# ---------------------------------------------------------------------------

# --- id-set across every non-backlog+backlog lane (object .id OR bare string) ---
([ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
   .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]?,
   .task_board.qa[]? ] | map(if type=="object" then .id else . end)) as $ids |

# --- mint row objects ---
({
  id: "FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING",
  type: "FIX",
  size: "M",
  priority: "P1",
  status: "BACKLOG",
  zone: "cross-service/",
  owner: "po",
  next_agent: "ba",
  plan_only: true,
  sprint: "COWORK-RELIABILITY",
  created_at: $now,
  created_by: "po (triage-signals cow-20260715T212838)",
  origin_signal_id: "cow-20260715T212838",
  detail_ref: "docs/handoffs/2026-07-15-bctc-analyst-self-edit-correct-and-signal-filename-clobber.md",
  title: "COWORK SIGNAL/SYNTHESIS filenames are date-keyed (bctc: ticker+date+mode; chef synthesis: date_vn+dish_type; tnb notebook) not cycle_id -> intra-day cycles collide on ONE path; a between-drains write silently destroys the prior cycle's UNROUTED signal = a dropped escalation with no error anywhere. 3rd instance of one root class same day; CONFIRMED clobber today: processed/bctc_signal_FPT_20260715_routine.json signal 9240 overwritten by 8120.",
  note: "MINTED 2026-07-15 by po from signal cow-20260715T212838 (data-integrity, MED). ROOT CAUSE: signal/synthesis filenames carry ticker+date+mode (or date_vn+dish_type) with NO cycle discriminator; bctc-analyst runs 4x/day (cron 0 15,18,21,0 UTC) so all 4 cycles collide on the same path (39 such filenames in processed/). HARM (the real one, not the lost artifact): the drain READS these files to route signals; if cycle N writes the same filename as cycle N-1 between drains, N silently destroys N-1's UNROUTED signal and it is never triaged. Today the hourly drain interleaved so nothing was lost -- luck, not a guard; a late/missed drain loses a signal silently. 3 INSTANCES SAME CLASS SAME DAY: (1) chef synthesis date_vn+dish_type -> run2 clobbered run1 (Write, silent); (2) tnb notebook same collision, caught ONLY by the Edit tool stale-read check; (3) bctc signals ticker+date+mode -> 9240 overwritten by 8120. feedback_recurring_bug_escalation (2+ -> block) qualifies. SAME ONE-LINE FIX EACH TIME: key the filename by cycle_id (bctc already carries one; chef's is already in metadata). SCOPE (ba/architect own HOW): the docs/signals/*.json writers (bctc-analyst, chef/unified-agent, tnb) + docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json + the Signal Bus naming contract docs/standards/mcp-tools.md (Naming Contract) + the drain reader that consumes filenames. DISTINCT-FROM (checked, none cover this): FU-CTG-DISCOVERY-FILENAME-FILTER (VPS HNX discovery CV_CBTT filename detection), FU-BACKFILL-REAL-FILENAMES (backfill real-filename heuristic), FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER. OBSERVATION folded (mechanism UNPROVEN -- do NOT diagnose, NOT a blocker): signal_id regressed 9240->8120 over 20h same file/tool/sequence; parsimonious candidate = SQLite INTEGER PRIMARY KEY WITHOUT AUTOINCREMENT reuses max(rowid)+1 after the drain prunes highest rows; NOT probed because the LIVE DB is a named volume, not docs/signals/signals.db (feedback_live_db_is_named_volume_not_host_data); cheap check for the implementer = does the SERVING schema use AUTOINCREMENT. If ids ARE reused, any cross-time signal_id reference can silently re-bind to an unrelated later signal (worse than an orphan FK -- looks resolved). AC: (1) two same-day cycles for the same ticker/mode never share a signal/synthesis path; (2) a between-drains double-write of the same ticker+date+mode cannot silently destroy an unrouted signal; (3) the drain-reader change (if any) preserves routing of both cycles' signals."
}) as $row2 |

({
  id: "FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE",
  type: "FIX",
  size: "S",
  priority: "P1",
  status: "BACKLOG",
  zone: "cross-service/",
  owner: "po",
  next_agent: "ba",
  plan_only: true,
  sprint: "COWORK-RELIABILITY",
  created_at: $now,
  created_by: "po (triage-signals cow-20260715T214005)",
  origin_signal_id: "cow-20260715T214005",
  detail_ref: "docs/handoffs/2026-07-15-cowork-tick-refire-election-lock-does-not-span-its-tick.md",
  title: "COWORK DISPATCH — the P3 fire-election lock cron:cowork:<TICK> is released at end of Step 6, so a re-fire of the SAME nominal tick (arriving after that release window) finds the key free, RE-ELECTS a leader and RE-RUNS the tick. CONFIRMED live 2026-07-15T21:30Z (task_release returned released:1 TWICE on the same key, one session). DISTINCT from FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS (peer/two-path/two-session) — this is single-session self-refire; a namespace merge does NOT prevent it.",
  note: "MINTED 2026-07-15 by po from signal cow-20260715T214005 (defect, MED). ROOT CAUSE: telemetry.md ~L79-93 releases cron:cowork:<TICK> at the END of Step 6 on every exit path -- correct as a leader-lock (must not outlive the tick) but its lifetime is [tick start, tick end], so a re-fire of the same tick that ARRIVES AFTER the release finds the key free and wins. There is NO other per-tick guard and NO re-fire suppression at all. PROOF: released:1 twice on cron:cowork:2026-07-15T21:30Z, same session (pass1 preflight drift 0 / pass2 drift 5, same nominal tick, same tick_id) -- release only reports released:1 if the lock was held, so it was claimed->released->re-claimed->re-released for one tick. WHY THE P1 ROW DOES NOT COVER IT (material triage finding): FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS is scoped to router-intent-path vs cowork-slot dispatcher = TWO paths, TWO sessions; THIS instance has no peer and no router -- one session re-entering its OWN tick, same key legitimately released in between, so unifying the namespaces changes nothing. THIRD member of the recurring 'guard released when the work ends' class (feedback_recurring_bug_escalation 2+ -> block): #1 published:<slot>:<key> post-publish -> MARKET dup 932+933 (UC-CCA-P3, P0, peer-owned); #2 cowork-slot:<slot_id> right-after-spawn (FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS, P1); #3 THIS cron:cowork:<TICK> at Step 6. Same invariant already established for the chef marker: published=>TOMBSTONE, never release. CHEAPEST CORRECT FIX (ba/architect own HOW): the preflight already computes the nominal tick and already reads pressure-state.json -> compare pressure_state.tick_id == nominal_tick => this tick already ran => SILENT/SUPPRESS, BEFORE the election. One comparison in the script; it would have caught this instance. CAVEAT: emit happens at Step 6, so a tick that DIES before Step 6 is not tombstoned and MUST re-run (desired behaviour, not a bug). COUPLING HAZARD (the real reason it is worth a row despite today's zero damage): guard #3 fails exactly when ticks run long, and long ticks ALSO push pressure-state past its staleness threshold -> legacy mode -> the mode with NO last_fired dedup (feedback_cowork_matcher_legacy_no_lastfired_dedup); the condition that triggers the re-fire is the same condition that removes the only remaining backstop. BLAST RADIUS on a slot-bearing tick = INFERRED, NOT observed (this instance slots:[] one_shots:[], zero harm) -- someone MUST probe before acting (force a same-tick re-fire on a slot-bearing tick in a sandbox, or read the matcher legacy branch for a last_fired comparison). Files: cowork preflight script + docs/agents/cowork-team/flow/telemetry.md (~L79-93, ~L92 comment already anticipates re-entrancy only as a reason the RELEASE no-ops). AC: (1) a re-fire of an already-completed nominal tick is SUPPRESSED before the election (no re-elect, no re-run); (2) a tick that died before Step 6 still re-runs; (3) RAW-verify a forced same-tick re-fire on a slot-bearing tick spawns 0 duplicate agents."
}) as $row3 |

# --- M2 + M3: append mints only if id absent everywhere ---
.task_board.backlog += ([$row2, $row3] | map(select(.id as $i | ($ids | index($i)) | not)))

# --- M1: enrich the GUARD row in place, marker-guarded ---
| .task_board.backlog |= map(
    if .id == "GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC"
       and (has("guard_2nd_instance_folded") | not)
    then . + {
      priority: "P1",
      guard_2nd_instance_folded: true,
      recurring_confirmed: true,
      instances_confirmed: 2,
      related_signal_ids: ["cow-20260715T212837"],
      enriched_at: $now,
      enriched_by: "po (triage-signals cow-20260715T212837)",
      enrichment_ref: "docs/handoffs/2026-07-15-bctc-analyst-self-edit-correct-and-signal-filename-clobber.md",
      enrichment: "2nd CONFIRMED instance folded (cow-20260715T212837): bctc-analyst c089 self-edited docs/agents/tools/package/bctc-analyst.md + docs/agents/bctc-analyst/flow/stage-analyze.md -- an agent this row NAMES in its SAME-PASS audit list -- one tick after the alert-commander instance. Per feedback_recurring_bug_escalation the class now qualifies on its own (2 instances, 2 agents, same day). This instance INVERTS the alert-commander precedent: all 3 schema claims were RAW-probed against the LIVE tools BEFORE the keep decision (get_pyramid_tier param is asset_class snake_case NOT assetClass; get_sector_comparison requires code NOT ticker; get_insider_signals requires code) -- 3/3 TRUE verbatim, the docs were genuinely wrong, edits KEPT + committed ac1b13268 (contrast alert-commander whose central claim was FALSE and was reverted). POLICY CONSEQUENCE: review the CONTENT, do not blanket-revert the AUTHOR. FALSE-PREMISE CORRECTION to this row's option-(1) fix ('strip Edit from agents whose SOLE legitimate write is a notebook'): their sole legit write is NOT a notebook -- every 'notebook-only' agent routinely writes docs/signals/*.json BY DESIGN, ~207 committed such files across 7 agents (bctc 52, market-watcher 40, news-scout 33, alert-commander 32, tnb 23, unified 20, digest 7). The frontmatter clause is not merely unenforceable, it is FACTUALLY WRONG about designed behaviour; an enforced-but-wrong boundary would break signal routing fleet-wide. The frontmatter must be CORRECTED to describe reality FIRST (notebook + docs/signals/ + agent-specific extras) before any enforcement mechanism is meaningful. THIRD SCOPE ITEM (alongside the existing two): add a LEGITIMATE CHANNEL for 'agent discovers a doc bug' -- this instance proves a boundary-crossing can produce correct, otherwise-unobtainable work (the agent hit the Zod errors live; nobody else would have); a pure prohibition converts that into silent recurring waste. Route it: agent emits a doc-fix PROPOSAL signal (it already writes docs/signals/), agent-father applies. VERDICT: NOT MOOT, NOT DISMISSED -- the signal SHARPENS this row (recurring-confirmed + fix-premise-corrected + 3rd scope item), it does NOT falsify the boundary-enforcement need. Guard against self-report FP (feedback_agent_selfreport_metalayer_confabulation / auditor_self_resolves): the 'content correct' claim is RAW-probe evidence committed in ac1b13268, not a self-report."
    } else . end)

# --- M4: sibling-link marker on the P1 mutex row (marker-guarded) ---
| .task_board.backlog |= map(
    if .id == "FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS"
       and (has("sibling_refire_row") | not)
    then . + {
      sibling_refire_row: "FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE",
      sibling_note: "SIBLING enabler minted 2026-07-15 (cow-20260715T214005): the single-session same-tick self-refire path is NOT closed by unifying this row's namespaces. Fixing THIS row does not close the refire; both are members of the 'guard released when the work ends' class. Do not certify the double-dispatch class done on this row alone."
    } else . end)

# --- M5: flip the 3 triaged signal_queue rows (status-guarded) ---
| .signal_queue.rows |= map(
    if .id == "cow-20260715T212837" and (.status == "NEW" or .status == "READ")
      then .status = "RESOLVED"
    elif .id == "cow-20260715T212838" and .status == "NEW"
      then .status = "READ"
    elif .id == "cow-20260715T214005" and .status == "NEW"
      then .status = "READ"
    else . end)

# --- M6: triage stamps ---
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po"
