# po-s136-fb-launchd-firer-sprint-mint.jq
#
# Single-pass SPRINT-KICKOFF mint (idempotent): mint the FB-POSTER-LAUNCHD-FIRER
# sprint_goal entry + a 4-row cascade for an OS-level, all-local launchd firer of the
# guaranteed FB slots (fb-daily 09:15Z, fb-weekend 13:13Z) that is INDEPENDENT of any
# live Claude CLI session — closing the missed-slot gap (project_cowork_guaranteed_slot_
# needs_live_cli_session: the */15 cowork dispatcher is session-scoped and evaporates on
# session-end; 06-30 fb-daily 09:15Z was missed because no CLI session was alive then).
#
# Mutations (each id-guarded across ALL lanes + sprint-guard on entries → re-run mints 0):
#   M1 sprint_goal.entries[] += FB-POSTER-LAUNCHD-FIRER (status:active)
#   M2 task_board.ready[]    += FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL  (developer, LEAD)
#   M3 task_board.backlog[]  += FIX-FB-WEEKEND-DEDUP-GATE             (cowork-refactory-expert, router maint lane)
#   M4 task_board.backlog[]  += FB-LAUNCHD-OPS-INSTALL-VERIFY        (ops, depends DEV)
#   M5 task_board.backlog[]  += FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP      (qa, depends OPS)
#
# .head DELIBERATELY UNTOUCHED — owned by the live OHLCV-DEPTH epic (session e71c7736).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#   -f scripts/po-s136-fb-launchd-firer-sprint-mint.jq docs/data/orch/orch-state.json \
#   | bash scripts/orch-apply.sh   (orch-apply does Zod + dup-key + CAS + atomic rename)

def all_ids:
  [ (.task_board.ready[]?), (.task_board.backlog[]?), (.task_board.in_progress[]?),
    (.task_board.review[]?), (.task_board.done[]?), (.task_board.done_verified[]?) ]
  | map(if type == "object" then .id else . end);

. as $root
| (all_ids) as $ids
| ([ .sprint_goal.entries[]?.sprint_id ]) as $sids

# ---- M1: sprint_goal entry --------------------------------------------------
| ( if ($sids | index("FB-POSTER-LAUNCHD-FIRER")) then .
    else .sprint_goal.entries += [{
      "sprint_id": "FB-POSTER-LAUNCHD-FIRER",
      "status": "active",
      "vision": "Guaranteed FB slots (fb-daily 09:15Z Mon-Fri, fb-weekend 13:13Z Sat-Sun) fire reliably via an OS-level, all-local macOS launchd LaunchAgent independent of any live Claude CLI session — closing the missed-slot gap caused by the session-scoped */15 cowork dispatcher (06-30 fb-daily 09:15Z missed, posted ~6h late).",
      "scope_in": "scripts/fb-poster-headless.sh wrapper invoking `claude -p \"run docs/agents/fb-market-poster/flow/main.md slot=<slot>\" --dangerously-skip-permissions` headlessly (no prompts); DST-robust launchd LaunchAgent(s) at the guaranteed slots; idempotent install/uninstall/verify script (launchctl bootstrap/bootout); add the MISSING period-keyed dedup gate to the weekend sub-flows so the weekend firer is double-post-safe.",
      "scope_out": "NO general bypass-everything wrapper (--dangerously-skip-permissions scoped to the single fb-market-poster flow ONLY); NO cloud RemoteTrigger (feedback_no_remote_trigger_all_local); NO change to FB post content/Vietnamese-language/no-fake-data honest-NULL; does NOT retire the cowork */15 dispatcher (launchd is an independent race-and-dedup backstop).",
      "success_metric": "An OBSERVED real firing (near-future test slot or launchctl kickstart) with NO live Claude CLI session writes a real docs/social/fb-post-YYYY-MM-DD.md, AND a second same-period firing no-ops (period-keyed dedup demonstrated for BOTH fb-daily and fb-weekend).",
      "root_cause_ref": "project_cowork_guaranteed_slot_needs_live_cli_session.md",
      "created_by": "po",
      "created_at": $now
    }] end )

# ---- M2: DEV lead → ready[] -------------------------------------------------
| ( if ($ids | index("FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL")) then .
    else .task_board.ready += [{
      "id": "FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL",
      "type": "SPRINT-M",
      "size": "M",
      "status": "READY",
      "priority": "high",
      "zone": "cross-service/",
      "owner": "developer",
      "next_agent": "developer",
      "dispatcher": "dev-team",
      "created_by": "po",
      "created_at": $now,
      "sprint": "FB-POSTER-LAUNCHD-FIRER",
      "title": "Headless fb-poster wrapper + DST-robust launchd LaunchAgent(s) + idempotent install/verify script",
      "deliverables": [
        "D1 scripts/fb-poster-headless.sh — invokes `claude -p \"<trigger_prompt>\" --dangerously-skip-permissions` HEADLESSLY (no option-select, no permission prompts). trigger_prompt + slot times READ from cowork-schedule.json SSOT (slot fb-daily / fb-weekend) via jq — NEVER hardcoded. Logs stdout+stderr to docs/agent-memory/sessions/fb-poster-headless.log (+ -error.log), mirroring fleet-push. NON-ZERO exit on claude failure. Self-gates on the UTC slot window for today's applicable VN day-of-week (DST-robust — see AC3); no-op + log otherwise. Blast radius = the SINGLE fb-market-poster flow ONLY.",
        "D2 launchd/com.vn-market.fb-poster-daily.plist + launchd/com.vn-market.fb-poster-weekend.plist — mirror launchd/com.vn-market.fleet-push.plist structure (KeepAlive false; WorkingDirectory=repo root; StandardOut/ErrPath; EnvironmentVariables PATH MUST include /Users/admin/.local/bin [claude binary] + /Users/admin/.bun/bin + HOME=/Users/admin). DST decision is the HARD PART (AC3) — developer chooses + DOCUMENTS the approach in a plist header comment.",
        "D3 scripts/fb-poster-launchd-install.sh — idempotent install | uninstall | verify (launchctl bootstrap gui/$UID | bootout | print). Copies plists to ~/Library/LaunchAgents. If gui-domain bootstrap needs a user-run privileged command, PRINT the EXACT command for the user (config admin) to paste — do NOT silently fail. Reproducible.",
        "D4 doc pointers: docs/policies/dev-standards.md § Script Persistence (both scripts) + docs/standards/cron-jobs.md (new launchd timers, mirror the fleet-push § entry) + a pointer in the fb-market-poster flow owning doc."
      ],
      "acceptance": [
        "AC1 wrapper runs fully headless (bypass-permissions, zero prompts), exits non-zero on failure, logs to the known path.",
        "AC2 DOUBLE-POST GUARD inherited: the wrapper invokes the SAME flow, whose STEP 0a claims period-keyed task_claim `published:fb-daily:<VN-DATE>` (ttl 100800, kind cowork-slot) — first firer (launchd OR cowork */15) wins, the other no-ops. The wrapper MUST NOT add a second/divergent dedup key. (Weekend dedup is handled by FIX-FB-WEEKEND-DEDUP-GATE — hard prerequisite for the weekend plist.)",
        "AC3 DST-robust: fires correctly under BOTH CET (UTC+1) and CEST (UTC+2) with NO manual edits across DST shifts. launchd StartCalendarInterval fires LOCAL time but slots are UTC — developer picks ONE of: (a) wrapper UTC self-gate + over-fire the launchd entry (e.g. fire at both candidate local times or poll), or (b) compute both local entries + document the caveat. Approach DOCUMENTED in the plist header.",
        "AC4 slot times + trigger_prompt derived from cowork-schedule.json SSOT, never baked (no-hardcode-stats).",
        "AC5 --dangerously-skip-permissions scoped to THIS single flow invocation only — not a general bypass wrapper.",
        "AC6 Vietnamese output + no-fake-data honest-NULL pass-state unchanged (the wrapper changes NOTHING in the flow body)."
      ],
      "design_notes": "Mirror scripts/fleet-worktree-push.sh + launchd/com.vn-market.fleet-push.plist (the proven all-local OS-level firer pattern). SSOT slot truth: cowork-schedule.json fb-daily cron `15 9 * * 1-5` (09:15Z), fb-weekend cron `13 13 * * 6,0` (13:13Z). NOTE a doc discrepancy to reconcile: fb-market-poster/flow/main.md Input says weekend 13:07Z — SSOT cowork-schedule.json (13:13Z) WINS; flag for doc-sync, do not bake 13:07.",
      "verification_gate": "Code committed + scripts executable + `bash scripts/fb-poster-launchd-install.sh --verify` runs clean. done_verified is WITHHELD until the OBSERVED-fire behavioral gate (FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP) passes — 'script exists' / 'launchctl list shows it' is NOT done (exists != fires)."
    }] end )

# ---- M3: weekend dedup-gate fix → backlog[] (router maintenance lane) --------
| ( if ($ids | index("FIX-FB-WEEKEND-DEDUP-GATE")) then .
    else .task_board.backlog += [{
      "id": "FIX-FB-WEEKEND-DEDUP-GATE",
      "type": "FIX",
      "size": "S",
      "status": "BACKLOG",
      "priority": "high",
      "zone": "cross-service/",
      "owner": "cowork-refactory-expert",
      "next_agent": "cowork-refactory-expert",
      "dispatcher": "main",
      "parallel_eligible": true,
      "created_by": "po",
      "created_at": $now,
      "sprint": "FB-POSTER-LAUNCHD-FIRER",
      "title": "Add the MISSING period-keyed publish-once dedup gate to the FB weekend sub-flows (weekly-recap.md + weekly-prediction.md)",
      "root_cause": "PO RAW-grep 2026-06-30: docs/agents/fb-market-poster/flow/weekly-recap.md AND weekly-prediction.md contain NO task_claim / NO `published:` marker / NO dedup gate. main.md STEP 0a's 'Weekend note' CLAIMS the equivalent key `published:fb-weekend:<VN-DATE>` 'is inserted in the respective sub-flows' — it is NOT. The MODE ROUTER jumps to the sub-flows BEFORE main.md STEP 0a, so on Sat/Sun there is currently ZERO double-post protection. Shipping a weekend launchd firer alongside the cowork */15 without this would re-introduce the exact double-post class (feedback_guaranteed_slot_week_key_double_post).",
      "fix_spec": "Add a STEP-0a-equivalent publish-once dedup gate at the TOP of BOTH weekly-recap.md and weekly-prediction.md (before expensive data-gathering): derive VN_DATE from CYCLE_START_UTC+7h, claim task_claim(task_id='published:fb-weekend:'+VN_DATE, task_kind='cowork-slot', owner_agent='fb-market-poster', ttl_seconds=100800); on claimed:false → send_telegram(work) + EXIT cleanly (no re-post). Mirror main.md STEP 0a EXACTLY (same kind, same ttl, same VN-DATE derivation). Then correct main.md's 'Weekend note' to point at the now-real gate.",
      "verification_gate": "QA (FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP) demonstrates a second weekend firing in the same VN-DATE no-ops via the `published:fb-weekend:<VN-DATE>` marker.",
      "dispatch_note": "DISPATCHER = main terminal (router) per dispatch table 'update cowork agents -> cowork-refactory-expert -> main'. fb-market-poster flow .md edit = cowork maintenance lane (router-dispatched), NOT a dev-team-cron auto-adopt ready[] row (avoids the po-s109 cowork-team dead-route). HARD PREREQUISITE for enabling the weekend launchd plist — the fb-daily firer can ship WITHOUT this (daily dedup already exists in main.md STEP 0a)."
    }] end )

# ---- M4: OPS install/verify → backlog[] (depends DEV) -----------------------
| ( if ($ids | index("FB-LAUNCHD-OPS-INSTALL-VERIFY")) then .
    else .task_board.backlog += [{
      "id": "FB-LAUNCHD-OPS-INSTALL-VERIFY",
      "type": "FIX",
      "size": "S",
      "status": "BACKLOG",
      "priority": "high",
      "zone": "cross-service/",
      "owner": "ops",
      "next_agent": "ops",
      "dispatcher": "dev-team",
      "depends": ["FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL"],
      "created_by": "po",
      "created_at": $now,
      "sprint": "FB-POSTER-LAUNCHD-FIRER",
      "title": "Install + bootstrap the FB-poster LaunchAgent(s), verify loaded, surface privileged command to user if needed",
      "deliverables": [
        "Run `scripts/fb-poster-launchd-install.sh install` — copy plists to ~/Library/LaunchAgents + launchctl bootstrap gui/$(id -u).",
        "Install the fb-daily LaunchAgent immediately (daily dedup already exists). HOLD the fb-weekend bootstrap until FIX-FB-WEEKEND-DEDUP-GATE is done_verified.",
        "If gui/loginwindow-domain bootstrap requires a user-run privileged command, surface the EXACT `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.vn-market.fb-poster-daily.plist` to the user (config admin) to paste as `! <cmd>` — do NOT ask the user to make design decisions.",
        "Verify via `launchctl print gui/$(id -u)/com.vn-market.fb-poster-daily` that the agent is loaded."
      ],
      "acceptance": "LaunchAgent(s) loaded + present in launchctl print. NOTE: loaded != fired — the OBSERVED-fire proof is FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP's job, not this one.",
      "depends_note": "Blocked until FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL ships the plists + install script. Weekend enable additionally gated on FIX-FB-WEEKEND-DEDUP-GATE."
    }] end )

# ---- M5: QA fire-verification → backlog[] (depends OPS) ----------------------
| ( if ($ids | index("FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP")) then .
    else .task_board.backlog += [{
      "id": "FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP",
      "type": "FIX",
      "size": "M",
      "status": "BACKLOG",
      "priority": "high",
      "zone": "cross-service/",
      "owner": "qa",
      "next_agent": "qa",
      "dispatcher": "dev-team",
      "depends": ["FB-LAUNCHD-OPS-INSTALL-VERIFY", "FIX-FB-WEEKEND-DEDUP-GATE"],
      "created_by": "po",
      "created_at": $now,
      "sprint": "FB-POSTER-LAUNCHD-FIRER",
      "title": "OBSERVED fire-verification + double-post-guard demonstration + survives-session-end (the critical 'exists != fires' gate)",
      "acceptance": [
        "QA-AC1 OBSERVED real firing: trigger a near-future test slot OR `launchctl kickstart -k gui/$(id -u)/com.vn-market.fb-poster-daily` and RAW-verify it writes a REAL docs/social/fb-post-YYYY-MM-DD.md (verify content + fresh mtime — launchctl list showing the job is NOT proof it ran).",
        "QA-AC2 DOUBLE-POST GUARD demonstrated: a SECOND firing in the SAME period no-ops (daily: `published:fb-daily:<VN-DATE>` held → second run EXITs 'already published'; weekend: `published:fb-weekend:<VN-DATE>` after FIX-FB-WEEKEND-DEDUP-GATE). Demonstrate the cross-firer case too: a cowork */15 catch of the same slot after the launchd fire no-ops.",
        "QA-AC3 SURVIVES SESSION-END (the whole point): a firing with NO Claude CLI session open — verify task_list_held(kind=session-presence) is empty at fire time AND the post is still written.",
        "QA-AC4 no-fake-data: if data is thin the post is honest-NULL, NOT fabricated (RAW-read the produced post for fabrication).",
        "QA-AC5 Vietnamese output unchanged.",
        "QA-AC6 on PASS: relocate FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL to done_verified (this is its withheld behavioral gate); on the weekend leg, gate is satisfied only after FIX-FB-WEEKEND-DEDUP-GATE ships."
      ],
      "depends_note": "Blocked until FB-LAUNCHD-OPS-INSTALL-VERIFY installs the agent(s). Weekend double-post leg additionally gated on FIX-FB-WEEKEND-DEDUP-GATE."
    }] end )

# ---- metadata bump ----------------------------------------------------------
| .task_board._updated_at = $now
| .task_board._updated_by = "po:s136:fb-launchd-firer-mint"
