/**
 * DWF-phase1-cadence.test.ts
 *
 * Sprint: DWF-PHASE1 — P1-DEV-7
 * Zone:   test-harness (mcp-server zone for bun:test runner reuse; ZERO mcp-server production code under test)
 *
 * Tests scripts/agents-flow/cadence-policy.js (evaluateCadence, loadCadencePolicy, computeTiers, isStale)
 * and the adaptive mode of scripts/agents-flow/cowork-match-slots.js.
 *
 * Import path traversal: apps/mcp-server/src/__tests__/ → ../../../../scripts/agents-flow/
 *
 * RED→GREEN doctrine: each test has an inline comment describing the deliberate-violation proof
 * (what change would make the test go RED). The live test runs the GREEN assertion.
 *
 * 13 tests: T-1..T-13 (T-13 split into T-13, T-13b, T-13c)
 */

import { test, expect, describe, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluateCadence, loadCadencePolicy, computeTiers, isStale } =
  require("../../../../scripts/agents-flow/cadence-policy.js");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { matchSlots } =
  require("../../../../scripts/agents-flow/cowork-match-slots.js");

// ─── Shared fixtures ────────────────────────────────────────────────────────

let policyObj: any;

beforeAll(() => {
  policyObj = loadCadencePolicy();
  if (!policyObj || !policyObj.policies || policyObj.policies.length === 0) {
    throw new Error("cadence-policy.json failed to load — cannot run tests");
  }
});

// ─── T-1: AC-P1-1-1 — gatherer-standard, open/medium/high → 60 ─────────────

describe("T-1: AC-P1-1-1 — gatherer-standard open+medium+high → 60 min", () => {
  // RED proof: Remove the medium/* rule from cadence-policy.json → lookup returns 240 → test fails.
  // GREEN proof: Rule present → returns 60 → test passes.
  test("evaluateCadence(gatherer-standard, open, medium, *) returns 60", () => {
    const result = evaluateCadence("gatherer-standard", "open", "medium", "*", policyObj);
    expect(result.interval_minutes).toBe(60);
    expect(result._cron_fallback).toBe(false);
  });

  test("evaluateCadence(gatherer-standard, open, high, *) returns 30", () => {
    // Verify the high-pressure path (backlog >= 10)
    const result = evaluateCadence("gatherer-standard", "open", "high", "*", policyObj);
    expect(result.interval_minutes).toBe(30);
  });

  test("evaluateCadence(gatherer-standard, open, low, high) returns 60", () => {
    const result = evaluateCadence("gatherer-standard", "open", "low", "high", policyObj);
    expect(result.interval_minutes).toBe(60);
  });

  test("evaluateCadence(gatherer-standard, open, low, low) returns 240", () => {
    const result = evaluateCadence("gatherer-standard", "open", "low", "low", policyObj);
    expect(result.interval_minutes).toBe(240);
  });
});

// ─── T-2: AC-P1-1-2 — chef-intraday, holiday → null (suppress) ──────────────

describe("T-2: AC-P1-1-2 — chef-intraday holiday → null (suppress)", () => {
  // RED proof: Remove the holiday rule for chef-intraday → evaluateCadence returns 240 (safe default),
  //            not null → the test asserting null fails → RED.
  // GREEN proof: holiday rule present → returns null → test passes.
  test("evaluateCadence(chef-intraday, holiday, *, *) returns null interval (suppress)", () => {
    const result = evaluateCadence("chef-intraday", "holiday", "*", "*", policyObj);
    expect(result.interval_minutes).toBeNull();
    expect(result._cron_fallback).toBe(false);
  });

  test("evaluateCadence(chef-intraday, weekend, *, *) returns null interval (suppress)", () => {
    const result = evaluateCadence("chef-intraday", "weekend", "*", "*", policyObj);
    expect(result.interval_minutes).toBeNull();
  });
});

// ─── T-3: AC-P1-1-3 — Unmatched policy/state → 240 (safe default) ───────────

describe("T-3: AC-P1-1-3 — Unmatched rule → 240 safe default", () => {
  // RED proof: Assert unmatched returns null → test fails (proves 240 is load-bearing, not null).
  // GREEN proof: Unmatched → returns 240 → test passes.
  test("Unrecognized policy_id → safe default 240, not null", () => {
    const result = evaluateCadence("no-such-policy", "open", "low", "low", policyObj);
    expect(result.interval_minutes).toBe(240);
    expect(result._cron_fallback).toBe(false);
  });

  test("Known policy_id, no matching calendar/tier combination → safe default 240", () => {
    // Inject an impossible tier combination not in any rule
    const result = evaluateCadence("gatherer-standard", "completely-unknown-status", "low", "low", policyObj);
    expect(result.interval_minutes).toBe(240);
  });

  test("Empty policy object → safe default 240 (not null)", () => {
    const emptyPolicy = { policies: [] };
    const result = evaluateCadence("gatherer-standard", "open", "low", "low", emptyPolicy);
    expect(result.interval_minutes).toBe(240);
    expect(result.interval_minutes).not.toBeNull();
  });
});

// ─── T-4: AC-P1-2-1 — policy_id=null slot → cron fallback (no regression) ───

describe("T-4: AC-P1-2-1 — policy_id=null slot → cron fallback (no regression)", () => {
  // RED proof: Remove the cron field from a slot in a schedule with policy_id=null →
  //            cronMatches fails → slot absent from output → test fails.
  // GREEN proof: Slot has cron field + policy_id=null → appears in output with due_reason="cron".

  const makeScheduleWithNullPolicy = (cronStr: string) => ({
    slots: [
      {
        slot_id: "test-null-policy",
        cron: cronStr,
        enabled: true,
        guaranteed: false,
        policy_id: null,
        last_fired: null,
        agent: "test-agent",
        flow_path: "docs/test/flow.md",
        trigger_prompt: "test prompt"
      }
    ]
  });

  test("policy_id=null slot with matching cron is in legacy mode output", () => {
    // Use a cron that fires every minute (wildcard)
    const schedule = makeScheduleWithNullPolicy("* * * * *");
    const result = matchSlots(schedule, undefined, { mode: "legacy" });
    expect(result.length).toBe(1);
    expect(result[0].slot_id).toBe("test-null-policy");
  });

  test("policy_id=null slot with matching cron is in adaptive mode output with due_reason=cron", () => {
    const schedule = makeScheduleWithNullPolicy("* * * * *");
    const pressureState = {
      emitted_at: new Date().toISOString(),
      stale_warning: false,
      signal_backlog: 0,
      last_volatility_level: "low",
      last_regime: "unknown",
      calendar_status: "open"
    };
    const result = matchSlots(schedule, undefined, { mode: "adaptive", pressureState, policyObj });
    expect(result.length).toBe(1);
    expect(result[0].due_reason).toBe("cron");
    expect(result[0].cadence_minutes).toBeNull();
  });

  test("policy_id=null slot without matching cron is NOT in output", () => {
    // Cron that never matches (year 2099 trick: impossible DOM combination)
    const schedule = makeScheduleWithNullPolicy("0 0 31 2 *"); // Feb 31 — never fires
    const result = matchSlots(schedule, undefined, { mode: "legacy" });
    expect(result.length).toBe(0);
  });
});

// ─── T-5: AC-P1-3-1 — last_fired=null → always due (first-run) ──────────────

describe("T-5: AC-P1-3-1 — last_fired=null → always due (first-run)", () => {
  // RED proof: Assert that first-run slot (last_fired=null) is NOT included in adaptive output →
  //            test fails → proves first-run semantics are load-bearing.
  // GREEN proof: last_fired=null → slot appears in output with due_reason="first_run".

  const makeAdaptiveSchedule = (last_fired: string | null) => ({
    slots: [
      {
        slot_id: "test-first-run",
        cron: "* * * * *",
        enabled: true,
        guaranteed: false,
        policy_id: "gatherer-standard",
        last_fired,
        agent: "test-agent",
        flow_path: "docs/test/flow.md",
        trigger_prompt: "test prompt"
      }
    ]
  });

  test("last_fired=null → slot included with due_reason=first_run", () => {
    const schedule = makeAdaptiveSchedule(null);
    const pressureState = {
      emitted_at: new Date().toISOString(),
      stale_warning: false,
      signal_backlog: 0,
      last_volatility_level: "low",
      last_regime: "unknown",
      calendar_status: "open"
    };
    const result = matchSlots(schedule, undefined, { mode: "adaptive", pressureState, policyObj });
    expect(result.length).toBe(1);
    expect(result[0].due_reason).toBe("first_run");
  });
});

// ─── T-6: AC-P1-3-2 — last_fired=T-50min, cadence=60 → NOT due ──────────────

describe("T-6: AC-P1-3-2 — last_fired=T-50min, cadence=60 → NOT due", () => {
  // RED proof: Assert slot IS included (due=true) at T-50min → test fails (proves 50 < 60 gate).
  // GREEN proof: elapsed=50min < cadence=60min → slot NOT in output.
  //
  // gatherer-standard + open + low + low → 240 min
  // gatherer-standard + open + low + high → 60 min   ← use this for cadence=60 test
  // gatherer-standard + open + medium + * → 60 min   ← also works

  test("slot with last_fired T-50min and cadence=60min is NOT due", () => {
    const fiftyMinutesAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();
    const schedule = {
      slots: [
        {
          slot_id: "test-cadence-check",
          cron: "* * * * *",
          enabled: true,
          guaranteed: false,
          policy_id: "gatherer-standard",
          last_fired: fiftyMinutesAgo,
          agent: "test-agent",
          flow_path: "docs/test/flow.md",
          trigger_prompt: "test prompt"
        }
      ]
    };
    // open + low + high → 60 min cadence
    const pressureState = {
      emitted_at: new Date().toISOString(),
      stale_warning: false,
      signal_backlog: 1,          // low tier
      last_volatility_level: "high", // high tier → 60 min
      last_regime: "bull",
      calendar_status: "open"
    };
    const result = matchSlots(schedule, undefined, { mode: "adaptive", pressureState, policyObj });
    // elapsed=50min < cadence=60min → not due → empty result
    expect(result.length).toBe(0);
  });
});

// ─── T-7: AC-P1-3-3 — last_fired=T-65min, cadence=60 → IS due ───────────────

describe("T-7: AC-P1-3-3 — last_fired=T-65min, cadence=60 → IS due", () => {
  // RED proof: Assert slot NOT included at T-65min → test fails (proves elapsed >= cadence gate).
  // GREEN proof: elapsed=65min >= cadence=60min → slot in output with due_reason="cadence".

  test("slot with last_fired T-65min and cadence=60min IS due", () => {
    const sixtyFiveMinutesAgo = new Date(Date.now() - 65 * 60 * 1000).toISOString();
    const schedule = {
      slots: [
        {
          slot_id: "test-cadence-due",
          cron: "* * * * *",
          enabled: true,
          guaranteed: false,
          policy_id: "gatherer-standard",
          last_fired: sixtyFiveMinutesAgo,
          agent: "test-agent",
          flow_path: "docs/test/flow.md",
          trigger_prompt: "test prompt"
        }
      ]
    };
    // open + low + high → 60 min cadence
    const pressureState = {
      emitted_at: new Date().toISOString(),
      stale_warning: false,
      signal_backlog: 1,          // low tier
      last_volatility_level: "high", // high tier → 60 min
      last_regime: "bull",
      calendar_status: "open"
    };
    const result = matchSlots(schedule, undefined, { mode: "adaptive", pressureState, policyObj });
    expect(result.length).toBe(1);
    expect(result[0].due_reason).toBe("cadence");
    expect(result[0].cadence_minutes).toBe(60);
  });
});

// ─── T-8: AC-P1-3-4 — Output schema includes due_reason + cadence_minutes ───

describe("T-8: AC-P1-3-4 — Output schema: due_reason + cadence_minutes fields present", () => {
  // RED proof: Strip due_reason from expected object → expect(result[0]).toMatchObject({due_reason: ...}) fails.
  // GREEN proof: Both fields present on every output slot in adaptive mode.

  test("adaptive mode output slots have due_reason and cadence_minutes fields", () => {
    const schedule = {
      slots: [
        {
          slot_id: "test-schema",
          cron: "* * * * *",
          enabled: true,
          guaranteed: false,
          policy_id: "gatherer-standard",
          last_fired: null,
          agent: "test-agent",
          flow_path: "docs/test/flow.md",
          trigger_prompt: "test"
        },
        {
          slot_id: "test-schema-null-policy",
          cron: "* * * * *",
          enabled: true,
          guaranteed: false,
          policy_id: null,
          last_fired: null,
          agent: "test-agent2",
          flow_path: "docs/test/flow2.md",
          trigger_prompt: "test2"
        }
      ]
    };
    const pressureState = {
      emitted_at: new Date().toISOString(),
      stale_warning: false,
      signal_backlog: 0,
      last_volatility_level: "low",
      last_regime: "unknown",
      calendar_status: "open"
    };
    const result = matchSlots(schedule, undefined, { mode: "adaptive", pressureState, policyObj });
    expect(result.length).toBe(2);
    for (const slot of result) {
      expect(slot).toHaveProperty("due_reason");
      expect(slot).toHaveProperty("cadence_minutes");
      expect(["cadence", "cron", "first_run"]).toContain(slot.due_reason);
    }
  });

  test("legacy mode does NOT require due_reason (backward compat)", () => {
    const schedule = {
      slots: [
        {
          slot_id: "test-legacy-schema",
          cron: "* * * * *",
          enabled: true,
          guaranteed: true,
          policy_id: null,
          last_fired: null,
          agent: "test-agent",
          flow_path: "docs/test/flow.md",
          trigger_prompt: "test"
        }
      ]
    };
    const result = matchSlots(schedule, undefined, { mode: "legacy" });
    expect(result.length).toBe(1);
    // Legacy mode still includes policy_id/last_fired passthrough but does not gate on them
    expect(result[0].slot_id).toBe("test-legacy-schema");
  });
});

// ─── T-9: AC-P1-6-2 — Staleness threshold 20 min ────────────────────────────

describe("T-9: AC-P1-6-2 — Staleness threshold = 20 min (25min→stale, 18min→fresh)", () => {
  // RED proof: Reverse the assertions — assert 25-min NOT stale → test fails; 18-min IS stale → test fails.
  // GREEN proof: 25-min > 20 threshold → isStale=true; 18-min < 20 threshold → isStale=false.

  test("emitted_at 25 minutes ago → isStale(_, 20) returns true", () => {
    const twentyFiveMinAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const ps = { emitted_at: twentyFiveMinAgo, stale_warning: false };
    expect(isStale(ps, 20)).toBe(true);
  });

  test("emitted_at 18 minutes ago → isStale(_, 20) returns false", () => {
    const eighteenMinAgo = new Date(Date.now() - 18 * 60 * 1000).toISOString();
    const ps = { emitted_at: eighteenMinAgo, stale_warning: false };
    expect(isStale(ps, 20)).toBe(false);
  });

  test("emitted_at exactly at threshold → boundary: just over 20 min → stale", () => {
    const twentyOnMin = new Date(Date.now() - 21 * 60 * 1000).toISOString();
    const ps = { emitted_at: twentyOnMin, stale_warning: false };
    expect(isStale(ps, 20)).toBe(true);
  });

  test("cadence-policy.json has _staleness_threshold_minutes=20 (SSOT check)", () => {
    expect(policyObj._staleness_threshold_minutes).toBe(20);
  });
});

// ─── T-10: AC-P1-6-3 — stale_warning=true overrides age ─────────────────────

describe("T-10: AC-P1-6-3 — stale_warning=true overrides age check", () => {
  // RED proof: Set stale_warning=false + old age → verify isStale via age only (not flag).
  //            Then separately: set stale_warning=true + recent → isStale=true (flag gate).
  // GREEN proof: stale_warning=true + recent emitted_at → isStale=true (flag overrides age).

  test("stale_warning=true + recent emitted_at (1 min ago) → isStale returns true", () => {
    const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    const ps = { emitted_at: oneMinAgo, stale_warning: true };
    expect(isStale(ps, 20)).toBe(true);
  });

  test("stale_warning=false + old emitted_at (25 min ago) → isStale returns true (via age, not flag)", () => {
    // This proves stale_warning is NOT the ONLY gate — age also triggers staleness
    const twentyFiveMinAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const ps = { emitted_at: twentyFiveMinAgo, stale_warning: false };
    expect(isStale(ps, 20)).toBe(true);
  });

  test("stale_warning=false + fresh emitted_at (5 min ago) → isStale returns false", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const ps = { emitted_at: fiveMinAgo, stale_warning: false };
    expect(isStale(ps, 20)).toBe(false);
  });
});

// ─── T-11: OQ-P1-3 — bctc-offmarket policy rules ────────────────────────────

describe("T-11: OQ-P1-3 — bctc-offmarket: holiday→null, weekend→1440, open→_cron_fallback", () => {
  // RED proof: Assert weekend returns null (suppress) → test fails, proving 1440 is load-bearing.
  // GREEN proof: holiday→null, weekend→1440, open→_cron_fallback=true.

  test("bctc-offmarket + holiday → interval_minutes=null (suppress, not cron fallback)", () => {
    const result = evaluateCadence("bctc-offmarket", "holiday", "*", "*", policyObj);
    expect(result.interval_minutes).toBeNull();
    expect(result._cron_fallback).toBe(false);
  });

  test("bctc-offmarket + weekend → interval_minutes=1440 (once/day rate)", () => {
    // RED proof for this assertion: if we removed the weekend rule, it would return 240 (safe default),
    // failing the expect(result.interval_minutes).toBe(1440) assertion.
    const result = evaluateCadence("bctc-offmarket", "weekend", "*", "*", policyObj);
    expect(result.interval_minutes).toBe(1440);
    expect(result._cron_fallback).toBe(false);
  });

  test("bctc-offmarket + open → _cron_fallback=true (cron governs)", () => {
    const result = evaluateCadence("bctc-offmarket", "open", "*", "*", policyObj);
    expect(result._cron_fallback).toBe(true);
  });

  test("bctc-offmarket + half_day → _cron_fallback=true (cron governs)", () => {
    const result = evaluateCadence("bctc-offmarket", "half_day", "*", "*", policyObj);
    expect(result._cron_fallback).toBe(true);
  });

  test("bctc-offmarket + unknown → _cron_fallback=true (conservative cron fallback)", () => {
    const result = evaluateCadence("bctc-offmarket", "unknown", "*", "*", policyObj);
    expect(result._cron_fallback).toBe(true);
  });
});

// ─── T-12: EC-6 audit — No open+chef-intraday rule has null interval ─────────

describe("T-12: EC-6 audit — No open+chef-intraday rule has null interval_minutes", () => {
  // RED proof: Inject a null-open rule for chef-intraday → test goes RED
  //            (proving the audit is load-bearing and catches the EC-6 violation).
  // GREEN proof: All open calendar_status rules for chef-intraday have non-null interval_minutes.

  test("No chef-intraday rule with calendar_status=open has interval_minutes=null", () => {
    const chefIntradayOpenRules = policyObj.policies.filter(
      (r: any) => r.policy_id === "chef-intraday" && r.calendar_status === "open"
    );
    // Must have at least one open rule (EC-6 requires them to be non-null)
    expect(chefIntradayOpenRules.length).toBeGreaterThan(0);
    // No open+chef-intraday rule may suppress (EC-6 AUDIT — NFR-P1-1 implicit)
    for (const rule of chefIntradayOpenRules) {
      expect(rule.interval_minutes).not.toBeNull();
      expect(typeof rule.interval_minutes).toBe("number");
    }
  });

  test("chef-intraday open+high → 60 (market-hours chef is never suppressed during open)", () => {
    const result = evaluateCadence("chef-intraday", "open", "*", "high", policyObj);
    expect(result.interval_minutes).toBe(60);
    expect(result._cron_fallback).toBe(false);
  });

  test("chef-intraday open+low → 120 (market-hours chef fires at reduced rate under low volatility)", () => {
    const result = evaluateCadence("chef-intraday", "open", "*", "low", policyObj);
    expect(result.interval_minutes).toBe(120);
    expect(result._cron_fallback).toBe(false);
  });
});

// ─── T-13: AC-P1-7-1/7-2/7-3 — last_fired atomic write (integration stubs) ──

describe("T-13: AC-P1-7-1/7-2/7-3 — last_fired batched atomic write", () => {
  // These are integration tests that exercise the file-system write logic from Step 5b.
  // We implement the Step 5b write logic inline (extracted as a helper) and test it with temp files.
  //
  // T-13:  Successful WON_SLOTS → last_fired written with correct timestamp  (AC-P1-7-1)
  // T-13b: Failed spawn slot excluded from WON_SLOTS → last_fired NOT written (AC-P1-7-2)
  // T-13c: Write failure (permissions) is non-fatal — no throw, spawn unaffected             (AC-P1-7-3)

  /**
   * Minimal replica of Step 5b batched-write logic for testing.
   * Returns { success: boolean, error?: string }
   */
  function batchWriteLastFired(
    scheduleFilePath: string,
    wonSlotIds: string[],
    firedAt: string
  ): { success: boolean; error?: string } {
    const tmpPath = scheduleFilePath + ".tmp";
    try {
      const raw = fs.readFileSync(scheduleFilePath, "utf8");
      const schedule = JSON.parse(raw);
      const wonSet = new Set(wonSlotIds);
      for (const slot of schedule.slots) {
        if (wonSet.has(slot.slot_id)) {
          slot.last_fired = firedAt;
        }
      }
      fs.writeFileSync(tmpPath, JSON.stringify(schedule, null, 2));
      fs.renameSync(tmpPath, scheduleFilePath);
      return { success: true };
    } catch (e: any) {
      // Non-fatal: log and return error (never throw — AC-P1-7-3)
      return { success: false, error: e.message };
    }
  }

  // ── T-13: AC-P1-7-1 — last_fired written after successful spawn ────────────
  // RED proof: Assert last_fired NOT updated after calling batchWriteLastFired → test fails.
  // GREEN proof: last_fired equals FIRED_AT for WON_SLOTS.
  test("T-13: last_fired written for WON_SLOTS after successful spawn", () => {
    const tmpDir  = os.tmpdir();
    const tmpFile = path.join(tmpDir, `schedule-t13-${Date.now()}.json`);

    const schedule = {
      slots: [
        { slot_id: "slot-a", last_fired: null },
        { slot_id: "slot-b", last_fired: null },
        { slot_id: "slot-c", last_fired: null }
      ]
    };
    fs.writeFileSync(tmpFile, JSON.stringify(schedule, null, 2));

    const FIRED_AT = new Date().toISOString();
    const wonIds   = ["slot-a", "slot-c"];
    const result   = batchWriteLastFired(tmpFile, wonIds, FIRED_AT);

    expect(result.success).toBe(true);

    const updated = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(updated.slots[0].last_fired).toBe(FIRED_AT);    // slot-a: updated
    expect(updated.slots[1].last_fired).toBeNull();         // slot-b: untouched (not in WON_SLOTS)
    expect(updated.slots[2].last_fired).toBe(FIRED_AT);    // slot-c: updated

    // Timestamp must be within 5 seconds of now
    const diff = Math.abs(Date.now() - new Date(FIRED_AT).getTime());
    expect(diff).toBeLessThan(5000);

    fs.unlinkSync(tmpFile);
  });

  // ── T-13b: AC-P1-7-2 — Failed spawn → last_fired NOT written ──────────────
  // RED proof: Assert last_fired IS written when slot_id NOT in wonIds → test fails.
  // GREEN proof: Only WON_SLOTS ids update last_fired; failed spawn slot remains null.
  test("T-13b: failed spawn slot (not in WON_SLOTS) leaves last_fired untouched", () => {
    const tmpDir  = os.tmpdir();
    const tmpFile = path.join(tmpDir, `schedule-t13b-${Date.now()}.json`);

    const schedule = {
      slots: [
        { slot_id: "slot-success",  last_fired: null },
        { slot_id: "slot-failed",   last_fired: null }  // failed spawn → not in WON_SLOTS
      ]
    };
    fs.writeFileSync(tmpFile, JSON.stringify(schedule, null, 2));

    const FIRED_AT = new Date().toISOString();
    // Only "slot-success" is in WON_SLOTS (spawn returned success)
    // "slot-failed" is in errors[] — spawn returned error — not in WON_SLOTS
    const wonIds = ["slot-success"];
    const result = batchWriteLastFired(tmpFile, wonIds, FIRED_AT);

    expect(result.success).toBe(true);

    const updated = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(updated.slots[0].last_fired).toBe(FIRED_AT);  // slot-success: updated
    expect(updated.slots[1].last_fired).toBeNull();       // slot-failed: NOT updated (AC-P1-7-2)

    fs.unlinkSync(tmpFile);
  });

  // ── T-13c: AC-P1-7-3 — Write failure is non-fatal ─────────────────────────
  // RED proof: Assert batchWriteLastFired throws on write error → test fails.
  // GREEN proof: Write failure returns { success: false, error: "..." } but does NOT throw.
  test("T-13c: write failure (non-existent directory) is non-fatal — returns error, does not throw", () => {
    const nonExistentPath = "/definitely/does/not/exist/schedule.json";

    const FIRED_AT = new Date().toISOString();
    // Should NOT throw — non-fatal per AC-P1-7-3
    let caught = false;
    let result: { success: boolean; error?: string } = { success: true };
    try {
      result = batchWriteLastFired(nonExistentPath, ["slot-x"], FIRED_AT);
    } catch {
      caught = true;
    }

    expect(caught).toBe(false);        // must not throw (AC-P1-7-3)
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error!.length).toBeGreaterThan(0);
  });
});

// ─── computeTiers unit tests (supporting T-1 via tier logic) ─────────────────

describe("computeTiers — tier computation from pressure_state", () => {
  test("signal_backlog=0 → low tier", () => {
    const { signal_backlog_tier } = computeTiers({ signal_backlog: 0, last_volatility_level: "low" });
    expect(signal_backlog_tier).toBe("low");
  });

  test("signal_backlog=3 → medium tier", () => {
    const { signal_backlog_tier } = computeTiers({ signal_backlog: 3, last_volatility_level: "low" });
    expect(signal_backlog_tier).toBe("medium");
  });

  test("signal_backlog=10 → high tier", () => {
    const { signal_backlog_tier } = computeTiers({ signal_backlog: 10, last_volatility_level: "low" });
    expect(signal_backlog_tier).toBe("high");
  });

  test("last_volatility_level=unknown → low volatility_tier", () => {
    const { volatility_tier } = computeTiers({ signal_backlog: 0, last_volatility_level: "unknown" });
    expect(volatility_tier).toBe("low");
  });

  test("last_volatility_level=high → high volatility_tier", () => {
    const { volatility_tier } = computeTiers({ signal_backlog: 0, last_volatility_level: "high" });
    expect(volatility_tier).toBe("high");
  });

  test("last_volatility_level=medium → high volatility_tier (anything not low/unknown)", () => {
    const { volatility_tier } = computeTiers({ signal_backlog: 0, last_volatility_level: "medium" });
    expect(volatility_tier).toBe("high");
  });
});

// ─── cowork-schedule.json schema validation (P1-DEV-4 ACs) ──────────────────

describe("cowork-schedule.json schema — P1-DEV-4 ACs", () => {
  let schedule: any;

  beforeAll(() => {
    // From apps/mcp-server/src/__tests__/ → project root is 4 levels up
    const schedPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "docs",
      "data",
      "cowork-schedule.json"
    );
    schedule = JSON.parse(fs.readFileSync(schedPath, "utf8"));
  });

  test("All 14 enabled slots have policy_id field", () => {
    const enabled = schedule.slots.filter((s: any) => s.enabled);
    expect(enabled.length).toBe(14);
    for (const slot of enabled) {
      expect(slot).toHaveProperty("policy_id");
    }
  });

  test("All 14 enabled slots have last_fired field", () => {
    const enabled = schedule.slots.filter((s: any) => s.enabled);
    for (const slot of enabled) {
      expect(slot).toHaveProperty("last_fired");
    }
  });

  test("All guaranteed=true slots have policy_id=null", () => {
    const guaranteed = schedule.slots.filter((s: any) => s.enabled && s.guaranteed === true);
    for (const slot of guaranteed) {
      expect(slot.policy_id).toBeNull();
    }
  });

  test("All guaranteed=false slots have non-null policy_id", () => {
    const nonGuaranteed = schedule.slots.filter((s: any) => s.enabled && s.guaranteed === false);
    for (const slot of nonGuaranteed) {
      expect(slot.policy_id).not.toBeNull();
      expect(typeof slot.policy_id).toBe("string");
    }
  });

  test("bctc-analyst slots have policy_id=bctc-offmarket", () => {
    const bctc = schedule.slots.filter((s: any) => s.slot_id.startsWith("bctc-analyst"));
    expect(bctc.length).toBe(4);
    for (const slot of bctc) {
      expect(slot.policy_id).toBe("bctc-offmarket");
    }
  });

  test("gatherer slots have policy_id=gatherer-standard", () => {
    const gatherers = ["news-scout-offhours", "news-scout-sentiment", "market-watcher-offhours", "market-watcher-eod"];
    for (const id of gatherers) {
      const slot = schedule.slots.find((s: any) => s.slot_id === id);
      expect(slot).toBeDefined();
      expect(slot.policy_id).toBe("gatherer-standard");
    }
  });

  test("chef-intraday has policy_id=chef-intraday", () => {
    const slot = schedule.slots.find((s: any) => s.slot_id === "chef-intraday");
    expect(slot).toBeDefined();
    expect(slot.policy_id).toBe("chef-intraday");
  });
});
