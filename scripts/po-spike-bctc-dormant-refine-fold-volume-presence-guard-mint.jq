# po-scoped-triage 2026-07-17T03:04:26Z
# SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD disposition (PO half):
#   (1) FOLD the refine-half dormancy evidence into the existing backlog row
#       FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP (no new mint for the refine half).
#   (2) MINT one PLAN-ONLY backlog durable-guard row for the "same wipe hit two
#       volumes, only one caught" infra gap surfaced by AC-1/AC-2.
# .head is intentionally UNTOUCHED — router owns the SPIKE in_progress row this cycle.
# Conservation: task_total grows by exactly 1 (one mint); no shrink.

.task_board.backlog |= (
  map(
    if .id == "FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP"
    then . + {
      "spike_fold_20260717": {
        "by": "po-scoped-triage-20260717",
        "at": "2026-07-17T03:04:26Z",
        "from_spike": "SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD",
        "action": "FOLD refine-half dormancy into this durable-trigger backstop row — NO new mint (per AC-2 refine_disposition).",
        "evidence": "AC-2 RAW (dev-mcp-server, commit 60bdca243): the agentic-refine producer is STILL dormant — bctc_refined_units MAX=2026-06-30 (no refined row in ~2.5wk) and refine_status PENDING has REGRESSED to 181 (was 151 at the 2026-07-12 SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE filing). Crons bctcPdfPullJob(*/30) + bctcExtractReconcileJob(5,35) fire status=success every tick (RAW cron_job_runs) => liveness/registration is NOT the gap; the session-scoped refine DISPATCH trigger this row already tracks is. Confirms the fragility is live and worsening.",
        "user_visible_symptom": "This dormant refine producer (jointly with the now-being-reseeded PEK-layout half) starved bctcExtractReconcileJob's 3-way OR success check, so overnight 2026-07-15 20:05Z->07-16 07:15Z it mass-terminalized the WHOLE Q4/Q3/Q2/Q1-2025 (walking back into 2024) watchlist backlog as enrich_failed and emitted a 76+ fail-loud RECONCILE-EXHAUSTED report flood (121 duplicate reports 3358-3478 archived). The report-storm itself is already suppressed by the shipped FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER; THIS row is the durable fix for the underlying refine-producer dormancy that CAUSED the flood.",
        "recurrence": "3rd+ observed instance of the identical session-scoped-CronCreate-dormancy defect class: 2026-06-27 BCTC-REFINE-STALL-RETRIGGER, 2026-07-12 SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE, 2026-07-16/17 this SPIKE.",
        "scope_confirm": "Existing AC (1)-(4) remain correct and sufficient; this fold only adds fresh 07-17 corroboration. Once ops re-seeds pek_model_cache and /pek-extract resumes, THIS row is the SOLE remaining convergence lever for refined bctc_table_rows serving-data production. PO recommendation: schedule immediately after ops confirms PEK extraction resumes."
      }
    }
    else . end
  )
  + [ {
    "id": "FIX-INFRA-CRITICAL-VOLUME-PRESENCE-HEALTHCHECK",
    "title": "Post-rebuild critical-volume PRESENCE healthcheck: fail-loud (and where safe auto-reseed) when a producer-critical named/model-cache volume is empty, so a VM-rebuild cannot silently re-empty pek_model_cache (or any manifest volume) without alerting — the 2026-07-15 rebuild wiped TWO volumes (market_data + pek_model_cache) and only market_data was caught",
    "owner": "ops",
    "status": "BACKLOG",
    "zone": "infra",
    "priority": "high",
    "type": "FIX",
    "depends": [],
    "note": "Filed from SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD (AC-1+AC-2, 2026-07-17). ROOT GAP: the 2026-07-15 hypervisor VM crash/rebuild destroyed TWO named volumes — market_data AND pek_model_cache. market_data was CAUGHT and recovered same day (commit 5ba622eca: July-1 host backup restored + all 9 services switched to ./data/live bind-mount). pek_model_cache was NOT caught: left EMPTY (du 12K, only stray yolo/settings.yaml; doclayout_yolo_ft.pt gone) and stayed empty ~2 days, silently crashing EVERY /pek-extract call (FileNotFoundError) => PEK-layout producer dormant. Nothing alerted on the empty volume; the gap only surfaced ~2 days later via a downstream 76+ RECONCILE-EXHAUSTED report FLOOD when bctcExtractReconcileJob mass-terminalized the watchlist backlog it could not enrich. Presence must assert CONTENT (the specific required weights), not merely that the mount exists / du>0. AC (proposed, ops/architect to refine): (1) a durable session-independent (launchd-class, mirror com.vn-market.cowork-guaranteed-slot-firer.plist) healthcheck asserts every producer-critical volume/model-cache contains its REQUIRED artifacts — for pek_model_cache: doclayout_yolo_ft.pt (+ PaddleOCR weights) present and loadable, not just non-empty; (2) the critical-volume manifest (volume -> required files -> re-seed script) is enumerated from an SSOT (docs/data/system-map.json or a dedicated manifest), NEVER hardcoded per NO-HARDCODE standing; (3) on missing/empty, emit ONE fail-loud bug-channel alert that NAMES the committed idempotent recovery (scripts/pek-fetch-weights.sh, commit e418d606d, brief docs/architecture-briefs/2026-05-27-pek-weights-provisioning.md) and, where safe+idempotent, auto-invokes it (populate-empty-volume is low-risk, NOT a destructive swap); (4) fire on boot/post-rebuild AND on a periodic cadence so a future silent wipe is caught in minutes not days; (5) RAW-verify by emptying a scratch volume and confirming the alert (and optional auto-reseed) fires. Scope guard: this is the DURABLE cross-cutting infra guard; it does NOT replace the in-flight ops one-shot PEK re-seed (restores current prod) nor the refine-producer durable fix FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP (a different producer). PLAN-ONLY: do NOT dispatch — schedule after ops confirms /pek-extract resumes.",
    "created_at": "2026-07-17T03:04:26Z",
    "created_by": "po-scoped-triage-20260717",
    "source": "docs/spikes/SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD.md",
    "related": [ "SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD", "FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP" ],
    "supervised": true,
    "supervised_by": "po-scoped-triage-20260717",
    "supervised_note": "PLAN-ONLY / anomaly->BACKLOG. ops-owned infra FIX, null next_agent, no backlog-detail entry -> removed from BOUNDED-1 idle auto-pickup (code non-dev-owner gate is detail-blind, would mis-route to a developer placeholder). Do NOT dispatch; groom+schedule after ops confirms PEK re-seed.",
    "plan_only": true
  } ]
)
| .task_board._updated_at = "2026-07-17T03:04:26Z"
| .task_board._updated_by = "po-scoped-triage-20260717 (SPIKE refine-fold + mint FIX-INFRA-CRITICAL-VOLUME-PRESENCE-HEALTHCHECK PLAN-ONLY)"
| .task_board.last_triaged_at = "2026-07-17T03:04:26Z"
| .task_board.last_triaged_by = "po-scoped-triage-20260717"
| ._updated_at = "2026-07-17T03:04:26Z"
| ._updated_by = "po-scoped-triage-20260717 (SPIKE-BCTC-EXTRACTION-DORMANT refine-fold + volume-presence-guard mint)"
