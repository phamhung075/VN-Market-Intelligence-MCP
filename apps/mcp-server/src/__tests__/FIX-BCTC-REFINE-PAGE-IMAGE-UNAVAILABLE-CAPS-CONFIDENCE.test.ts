/**
 * FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-CAPS-CONFIDENCE — unit + integration tests
 *
 * Root cause (verified against live market.db + pdf-extractor/mcp-server logs for report
 * 76129128-947c-422b-a591-e1d2b95cbeb8): pdf-extractor was healthy throughout the 16:37Z
 * batch (zero ERROR/WARN log lines, all /health checks 200 OK). get_bctc_page_image's own
 * tool-log (data/logs/tool-get_bctc_page_image.log) shows the underlying rasterize call for
 * unit-0014/page 28 succeeded cleanly (no "page failed" WARN) yet the pushed unit still
 * carries `image_unavailable`; two later units (0015/page 29, 0019/page 37) never even show
 * a tool-log entry, meaning get_bctc_page_image was never invoked for them at all. The 0.55
 * confidence / <=0.6 cap is spec-compliant (table-page.md / continuation-stitch.md) and is
 * NOT touched by this fix — bctcSanityValidator.ts can only pass confidence through or clamp
 * to 0.4/0.1 and is likewise untouched. This fix is AC2 only: make a whole-batch image-fetch
 * degradation VISIBLE via signal_queue instead of it staying buried in a per-unit DB flag.
 *
 * Covers:
 *   1. hasImageUnavailableFlag — flag-string matching (any `image_unavailable*` variant).
 *   2. shouldSignalImageFetchDegradation — rising-edge threshold (fires once per report).
 *   3. buildBctcImageFetchDegradedRow — row shape, SignalRowSchema/OrchStateSchema acceptance.
 *   4. writeBctcImageFetchDegradedSignal — appends to a fixture orch-state.json.
 *   5. push_bctc_refined_unit wiring — fires exactly on the 2nd image_unavailable push for a
 *      report, never on the 1st or 3rd+, never for unrelated FAILED/DONE pushes.
 */

import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import {
  hasImageUnavailableFlag,
  shouldSignalImageFetchDegradation,
  buildBctcImageFetchDegradedRow,
  writeBctcImageFetchDegradedSignal,
  DEFAULT_ORCH_STATE_PATH,
  SIGNAL_WRITER_ID,
  IMAGE_UNAVAILABLE_SIGNAL_THRESHOLD,
} from "../infrastructure/signals/bctcImageFetchDegradedSignalWriter.js";
import { OrchStateSchema, SignalRowSchema } from "../infrastructure/orchStateSchema.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildPushBctcRefinedUnitHandler } from "../interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.js";

const REPO_ROOT = resolve(__dirname, "../../../..");

let tmpDir: string | undefined;

function makeFixture(): string {
  tmpDir = mkdtempSync(join(tmpdir(), "bctc-imgdeg-signal-test-"));
  const p = join(tmpDir, "orch-state.json");
  const shell = {
    _meta: { schema: "v4", ssot: true, updated_at: "2026-08-06T00:00:00Z", updated_by: "test" },
    head: { status: "idle" },
    task_board: {
      _updated_at: "2026-08-06T00:00:00Z",
      _updated_by: "test",
      active_sprints: [],
      backlog: [],
      archive: [],
    },
    signal_queue: {
      _updated_at: "2026-08-06T00:00:00Z",
      _updated_by: "test",
      rows: [],
      archive: [],
    },
  };
  writeFileSync(p, JSON.stringify(shell, null, 2), "utf8");
  return p;
}

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. hasImageUnavailableFlag
// ═══════════════════════════════════════════════════════════════════════════

describe("hasImageUnavailableFlag", () => {
  it("matches image_unavailable:text_only_parse (table-page.md variant)", () => {
    expect(hasImageUnavailableFlag(["image_unavailable:text_only_parse"])).toBe(true);
  });

  it("matches image_unavailable:pageN (continuation-stitch.md variant)", () => {
    expect(hasImageUnavailableFlag(["image_unavailable:page29"])).toBe(true);
  });

  it("false for unrelated flags (ocr_corruption, balance_check, etc.)", () => {
    expect(hasImageUnavailableFlag(["ocr_corruption:page_30_unreadable"])).toBe(false);
    expect(hasImageUnavailableFlag(["balance_check:PASSED"])).toBe(false);
    expect(hasImageUnavailableFlag([])).toBe(false);
  });

  it("does not false-positive on a substring that merely contains the word out of position", () => {
    expect(hasImageUnavailableFlag(["prior_image_unavailable_note"])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. shouldSignalImageFetchDegradation
// ═══════════════════════════════════════════════════════════════════════════

describe("shouldSignalImageFetchDegradation", () => {
  it("false below threshold (1st occurrence)", () => {
    expect(shouldSignalImageFetchDegradation(1)).toBe(false);
  });

  it("true exactly at threshold (2nd occurrence, default threshold=2)", () => {
    expect(shouldSignalImageFetchDegradation(2)).toBe(true);
    expect(IMAGE_UNAVAILABLE_SIGNAL_THRESHOLD).toBe(2);
  });

  it("false past threshold (3rd+ occurrence — fires once, never re-fires)", () => {
    expect(shouldSignalImageFetchDegradation(3)).toBe(false);
    expect(shouldSignalImageFetchDegradation(9)).toBe(false);
  });

  it("respects an injected custom threshold", () => {
    expect(shouldSignalImageFetchDegradation(3, 3)).toBe(true);
    expect(shouldSignalImageFetchDegradation(2, 3)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. buildBctcImageFetchDegradedRow
// ═══════════════════════════════════════════════════════════════════════════

describe("buildBctcImageFetchDegradedRow", () => {
  const FIXED_NOW = new Date("2026-08-06T16:38:57.123Z");
  const REPORT_ID = "76129128-947c-422b-a591-e1d2b95cbeb8";

  it("builds a row matching OrchStateSignalRow shape + payload", () => {
    const row = buildBctcImageFetchDegradedRow(REPORT_ID, ["unit-0014", "unit-0015"], FIXED_NOW);

    expect(row.ts).toBe("2026-08-06T16:38:57Z"); // ms stripped
    expect(row.from).toBe("mcp-server");
    expect(row.to).toBe("po");
    expect(row.type).toBe("bctc_image_fetch_degraded");
    expect(row.severity).toBe("HIGH");
    expect(row.status).toBe("NEW");
    expect(row.payload_ref).toBeNull();
    expect(row.summary).toContain("76129128");
    expect(row.summary).toContain("2 refined units");
    expect(row.payload).toEqual({
      report_id: REPORT_ID,
      affected_unit_ids: ["unit-0014", "unit-0015"],
    });
  });

  it("row validates against SignalRowSchema (passthrough payload)", () => {
    const row = buildBctcImageFetchDegradedRow(REPORT_ID, ["unit-0014"], FIXED_NOW);
    const parsed = SignalRowSchema.safeParse(row);
    expect(parsed.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. writeBctcImageFetchDegradedSignal
// ═══════════════════════════════════════════════════════════════════════════

describe("writeBctcImageFetchDegradedSignal", () => {
  it("appends exactly one row; _updated_by is the writer identity, not the calling agent", () => {
    const path = makeFixture();

    writeBctcImageFetchDegradedSignal(
      "76129128-947c-422b-a591-e1d2b95cbeb8",
      ["unit-0014", "unit-0015"],
      path,
      new Date("2026-08-06T16:38:57Z"),
    );

    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk.signal_queue.rows).toHaveLength(1);
    expect(onDisk.signal_queue.rows[0].type).toBe("bctc_image_fetch_degraded");
    expect(onDisk.signal_queue._updated_by).toBe(SIGNAL_WRITER_ID);
    expect(OrchStateSchema.safeParse(onDisk).success).toBe(true);
  });

  it("missing target file → no-op, never throws", () => {
    const missingPath = join(tmpdir(), `bctc-imgdeg-missing-${Date.now()}.json`);
    expect(() =>
      writeBctcImageFetchDegradedSignal("report-x", ["unit-0000"], missingPath, new Date()),
    ).not.toThrow();
    expect(existsSync(missingPath)).toBe(false);
  });

  it("DEFAULT_ORCH_STATE_PATH resolves to the real repo-root orch-state.json", () => {
    expect(DEFAULT_ORCH_STATE_PATH).toBe(resolve(REPO_ROOT, "docs/data/orch/orch-state.json"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. push_bctc_refined_unit wiring — fires exactly once, at the 2nd occurrence
// ═══════════════════════════════════════════════════════════════════════════

describe("push_bctc_refined_unit — image-fetch-degraded signal wiring (AC2)", () => {
  function seedReport(db: Database, id: string): void {
    db.prepare(
      `INSERT OR REPLACE INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type,
          period_start, period_end, sort_key, parsed_at, extraction_confidence,
          pdf_path, text_status, refine_status,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETE', 'PENDING',
               '{}', '{}', '{}', '{}')`,
    ).run(
      id, "KBC", "Kinh Bac Corp", "HNX", "real_estate",
      2026, "Q1", "Q1", "2026-01-01", "2026-03-31", "2026-Q1",
      new Date().toISOString(), 0.9, "/app/data/pdfs/KBC_2026_Q1.pdf",
    );
  }

  function makeSpy(): { fn: (reportId: string, unitIds: readonly string[]) => void; calls: Array<{ reportId: string; unitIds: string[] }> } {
    const calls: Array<{ reportId: string; unitIds: string[] }> = [];
    return {
      calls,
      fn: (reportId, unitIds) => {
        calls.push({ reportId, unitIds: [...unitIds] });
      },
    };
  }

  it("does NOT fire on the 1st image_unavailable push for a report", async () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    seedReport(db, "KBC-1");
    const spy = makeSpy();
    const handler = buildPushBctcRefinedUnitHandler(db, { writeImageFetchDegradedSignal: spy.fn });

    await handler({
      report_id: "KBC-1", unit_id: "unit-0014", page_numbers: [28],
      markdown: "prose text only, no table", confidence: 0.55,
      flags: ["image_unavailable:text_only_parse"], window_status: "DONE",
    });

    expect(spy.calls).toHaveLength(0);
  });

  it("fires exactly once, on the 2nd image_unavailable push, with both affected unit_ids", async () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    seedReport(db, "KBC-2");
    const spy = makeSpy();
    const handler = buildPushBctcRefinedUnitHandler(db, { writeImageFetchDegradedSignal: spy.fn });

    await handler({
      report_id: "KBC-2", unit_id: "unit-0014", page_numbers: [28],
      markdown: "prose text only", confidence: 0.55,
      flags: ["image_unavailable:text_only_parse"], window_status: "DONE",
    });
    expect(spy.calls).toHaveLength(0);

    await handler({
      report_id: "KBC-2", unit_id: "unit-0015", page_numbers: [29],
      markdown: "prose text only", confidence: 0.55,
      flags: ["image_unavailable:text_only_parse"], window_status: "DONE",
    });

    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]!.reportId).toBe("KBC-2");
    expect(spy.calls[0]!.unitIds.sort()).toEqual(["unit-0014", "unit-0015"]);
  });

  it("does NOT re-fire on a 3rd image_unavailable push for the same report", async () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    seedReport(db, "KBC-3");
    const spy = makeSpy();
    const handler = buildPushBctcRefinedUnitHandler(db, { writeImageFetchDegradedSignal: spy.fn });

    for (const unitId of ["unit-0014", "unit-0015", "unit-0019"]) {
      await handler({
        report_id: "KBC-3", unit_id: unitId, page_numbers: [1],
        markdown: "prose text only", confidence: 0.55,
        flags: ["image_unavailable:text_only_parse"], window_status: "DONE",
      });
    }

    expect(spy.calls).toHaveLength(1); // fired once at the 2nd, silent on the 3rd
  });

  it("does NOT fire for units carrying unrelated flags (ocr_corruption, content mismatch)", async () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    seedReport(db, "KBC-4");
    const spy = makeSpy();
    const handler = buildPushBctcRefinedUnitHandler(db, { writeImageFetchDegradedSignal: spy.fn });

    await handler({
      report_id: "KBC-4", unit_id: "unit-0016", page_numbers: [30],
      markdown: "", confidence: 0.0,
      flags: ["ocr_corruption:page_30_unreadable"], window_status: "FAILED",
    });
    await handler({
      report_id: "KBC-4", unit_id: "unit-0017", page_numbers: [33],
      markdown: "", confidence: 0.0,
      flags: ["page_type_content_mismatch:expected_table_found_prose"], window_status: "FAILED",
    });

    expect(spy.calls).toHaveLength(0);
  });

  it("real (non-injected) default deps path does not throw — real signal writer wired end to end", async () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    seedReport(db, "KBC-REAL-DEPS");
    // No deps override — exercises the real writeBctcImageFetchDegradedSignal against the
    // actual repo orch-state.json. Only one push (below threshold) so it never writes.
    const handler = buildPushBctcRefinedUnitHandler(db);

    const result = await handler({
      report_id: "KBC-REAL-DEPS", unit_id: "unit-0000", page_numbers: [1],
      markdown: "prose text only", confidence: 0.55,
      flags: ["image_unavailable:text_only_parse"], window_status: "DONE",
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.ok).toBe(true);
  });
});
