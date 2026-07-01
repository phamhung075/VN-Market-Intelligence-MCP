// apps/mcp-server/src/__tests__/TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR.test.ts
//
// Sprint FIX-BCTC-BANK-SUMMARY-MAPPING — W2: generic markdown row-repair (AC-5, RISK-1)
//
// Root cause (architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md §2, §5 W2):
// the agentic-refine subagent's markdown transcription failed to column-split some rows
// for CTG's specific PDF layout, merging both period values into the label cell:
//   | I. Tiền gửi tại NHNN 21.355.164 35.225.543 | - |
// parseRefinedMarkdown's 2-cell branch is NOT the defect (same code path produced 0
// corrupted rows on VCB's 57 and FPT's 145) — the corruption is in the source text.
// bctcRowRepair.ts detects this SHAPE structurally (anchored Roman/section label
// prefix + trailing VN-formatted numeric tokens) and splits it back into
// (code, clean_label, value_current, value_prior). Generic — no per-ticker allowlist.
//
// AC-5: recovers ~20 corrupted-but-present CTG rows.
// RISK-1: the heuristic must NOT be lossy — verified via:
//   (a) exact spot-check against the architecture brief's known-good example
//       ("Tiền gửi tại NHNN": 21,355,164 / 35,225,543)
//   (b) rows that already carry a real code/value are left byte-identical
//   (c) rows with no anchored Roman/section prefix are left untouched (no guessing)

import { describe, it, expect } from "bun:test";
import { parseRefinedMarkdown, parseVnNumber } from "../application/utils/refinedMarkdownParser.js";
import { repairCorruptedRows } from "../application/utils/bctcRowRepair.js";
import type { BctcTableRow } from "../application/utils/refinedMarkdownParser.js";

const REPORT_ID = "ctg-2026q1-w2-row-repair-fixture";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: 20 corrupted (Roman/section-anchored, code=null, values merged into
// label) rows + 2 control rows (1 already-clean, 1 no-anchor) — reproduces the
// exact CTG corruption shape from the architecture brief at realistic scale.
// ─────────────────────────────────────────────────────────────────────────────

const CORRUPTED_ITEMS: Array<{ code: string; label: string; cur: number; prior: number }> = [
  { code: "I", label: "Tiền gửi tại NHNN", cur: 21355164, prior: 35225543 }, // RISK-1 spot-check row
  { code: "I.1", label: "Tiền gửi thanh toán tại NHNN", cur: 8120331, prior: 9045220 },
  { code: "I.2", label: "Tiền gửi dự trữ bắt buộc", cur: 13234833, prior: 26180323 },
  { code: "II", label: "Tiền gửi và cho vay các TCTD khác", cur: 45812093, prior: 38221410 },
  { code: "II.1", label: "Tiền gửi tại các TCTD khác", cur: 30512093, prior: 25221410 },
  { code: "III", label: "Chứng khoán kinh doanh", cur: 5120884, prior: 4982311 },
  { code: "III.1", label: "Chứng khoán kinh doanh - giá gốc", cur: 5320000, prior: 5150000 },
  { code: "IV", label: "Các công cụ tài chính phái sinh", cur: 812334, prior: 655120 },
  { code: "IV.1", label: "Công cụ phái sinh tiền tệ", cur: 812334, prior: 655120 },
  { code: "V", label: "Cho vay khách hàng", cur: 1245812093, prior: 1102334210 },
  { code: "V.1", label: "Cho vay các tổ chức kinh tế, cá nhân trong nước", cur: 1240000000, prior: 1098000000 },
  { code: "VI", label: "Dự phòng rủi ro cho vay khách hàng", cur: -12334812, prior: -10221093 },
  { code: "VI.1", label: "Dự phòng cụ thể", cur: -8120334, prior: -6980221 },
  { code: "VII", label: "Chứng khoán đầu tư", cur: 312884211, prior: 298221093 },
  { code: "VII.1", label: "Chứng khoán đầu tư sẵn sàng để bán", cur: 300000000, prior: 285000000 },
  { code: "VIII", label: "Góp vốn, đầu tư dài hạn", cur: 4812334, prior: 4221093 },
  { code: "VIII.1", label: "Đầu tư vào công ty con", cur: 3120000, prior: 2980000 },
  { code: "IX", label: "Tài sản cố định", cur: 18812334, prior: 17221093 },
  { code: "IX.1", label: "Tài sản cố định hữu hình", cur: 14120000, prior: 13221000 },
  { code: "X", label: "Tài sản có khác", cur: 22334812, prior: 19221093 },
];

function vnFmt(n: number): string {
  const neg = n < 0;
  const digits = Math.abs(n).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return neg ? `(${grouped})` : grouped;
}

function buildFixtureMarkdown(): string {
  const lines = ["BẢNG CÂN ĐỐI KẾ TOÁN", "| Chỉ tiêu | Số cuối kỳ |", "|---|---|"];
  for (const item of CORRUPTED_ITEMS) {
    lines.push(`| ${item.code}. ${item.label} ${vnFmt(item.cur)} ${vnFmt(item.prior)} | - |`);
  }
  // Control 1: already-clean row (real code + real value) — must stay byte-identical.
  lines.push("| XI | Tài sản khác thuộc nhóm kiểm soát | 3.221.093 |");
  // Control 2: no anchored Roman/section prefix — must stay untouched (no guessing).
  lines.push("| Ghi chú: số liệu đã được làm tròn đến hàng triệu đồng | - |");
  return lines.join("\n");
}

describe("W2 row-repair — AC-5: recovers ~20 corrupted-but-present CTG rows", () => {
  const result = parseRefinedMarkdown(buildFixtureMarkdown(), REPORT_ID, [4]);

  it("parses the full fixture with no dropped rows (22 = 20 corrupted + 2 controls)", () => {
    expect(result.rows.length).toBe(22);
  });

  it("recovers exactly the 20 corrupted rows to (code, clean_label, value_current, value_prior)", () => {
    for (const item of CORRUPTED_ITEMS) {
      const row = result.rows.find((r) => r.code === item.code);
      expect(row).toBeDefined();
      expect(row!.label).toBe(item.label);
      expect(row!.value_current).toBe(item.cur);
      expect(row!.value_prior).toBe(item.prior);
    }
  });

  it("recovered rows are no longer flagged is_summary_row (code is now populated)", () => {
    for (const item of CORRUPTED_ITEMS) {
      const row = result.rows.find((r) => r.code === item.code)!;
      expect(row.is_summary_row).toBe(0);
    }
  });

  it("count of recovered rows (matching the 20-item anchor set) is exactly 20", () => {
    const recovered = result.rows.filter((r) =>
      CORRUPTED_ITEMS.some((item) => item.code === r.code && r.value_current !== null),
    );
    expect(recovered.length).toBe(20);
  });
});

describe("W2 row-repair — RISK-1: not lossy", () => {
  const result = parseRefinedMarkdown(buildFixtureMarkdown(), REPORT_ID, [4]);

  it("spot-check: 'Tiền gửi tại NHNN' repairs to EXACT architecture-brief values 21,355,164 / 35,225,543", () => {
    const row = result.rows.find((r) => r.label === "Tiền gửi tại NHNN");
    expect(row).toBeDefined();
    expect(row!.code).toBe("I");
    expect(row!.value_current).toBe(21355164);
    expect(row!.value_prior).toBe(35225543);
  });

  it("a row that already has a real code + value is left completely untouched", () => {
    const row = result.rows.find((r) => r.label === "Tài sản khác thuộc nhóm kiểm soát");
    expect(row).toBeDefined();
    expect(row!.code).toBe("XI");
    expect(row!.value_current).toBe(3221093);
    expect(row!.value_prior).toBeNull();
  });

  it("a code=null row with NO anchored Roman/section prefix is left untouched (no guessing)", () => {
    const row = result.rows.find((r) => r.label.startsWith("Ghi chú:"));
    expect(row).toBeDefined();
    expect(row!.code).toBeNull();
    expect(row!.value_current).toBeNull();
    expect(row!.value_prior).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Genericity — same corruption shape on a synthetic bank never seen during
// development (NOT VCB, NOT CTG) proves this is a structural pattern-match,
// not a per-ticker allowlist.
// ─────────────────────────────────────────────────────────────────────────────

describe("W2 row-repair — genericity (no per-ticker allowlist)", () => {
  it("repairs the identical corruption shape for a synthetic 3rd bank ticker", () => {
    const md = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Chỉ tiêu | Số cuối kỳ |",
      "|---|---|",
      "| II. Vàng bạc, đá quý và kim loại quý khác 1.234.567 987.654 | - |",
    ].join("\n");
    const synth = parseRefinedMarkdown(md, "synthetic-bank-zzz-2026q1", [1]);
    const row = synth.rows.find((r) => r.code === "II");
    expect(row).toBeDefined();
    expect(row!.label).toBe("Vàng bạc, đá quý và kim loại quý khác");
    expect(row!.value_current).toBe(1234567);
    expect(row!.value_prior).toBe(987654);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Direct unit tests on repairCorruptedRows — edge cases at the function
// boundary (finer-grained than the full-markdown integration tests above).
// ─────────────────────────────────────────────────────────────────────────────

function mkRow(overrides: Partial<BctcTableRow>): BctcTableRow {
  return {
    report_id: REPORT_ID,
    statement_section: "balance_sheet",
    row_order: 0,
    code: null,
    label: "",
    period_current: "current",
    value_current: null,
    period_prior: null,
    value_prior: null,
    unit: "billion_vnd",
    page_number: 1,
    source_confidence: 1.0,
    is_summary_row: 0,
    ...overrides,
  };
}

describe("repairCorruptedRows — unit-level edge cases", () => {
  it("row with only ONE trailing number → value_current set, value_prior stays null", () => {
    const rows = [mkRow({ label: "III. Lãi thuần từ hoạt động dịch vụ 4.500.221" })];
    const [repaired] = repairCorruptedRows(rows, parseVnNumber);
    expect(repaired!.code).toBe("III");
    expect(repaired!.label).toBe("Lãi thuần từ hoạt động dịch vụ");
    expect(repaired!.value_current).toBe(4500221);
    expect(repaired!.value_prior).toBeNull();
  });

  it("trailing 1-2 digit token (footnote-length) is NOT treated as a real number — row untouched", () => {
    const rows = [mkRow({ label: "IV. Lợi nhuận chưa phân phối 12" })];
    const [repaired] = repairCorruptedRows(rows, parseVnNumber);
    expect(repaired!.code).toBeNull();
    expect(repaired!.value_current).toBeNull();
    expect(repaired!.label).toBe("IV. Lợi nhuận chưa phân phối 12");
  });

  it("row that already has a code is returned as the SAME object reference (byte-identical, non-lossy)", () => {
    const row = mkRow({ code: "I", label: "Tiền mặt, vàng bạc, đá quý", value_current: 12930996 });
    const [repaired] = repairCorruptedRows([row], parseVnNumber);
    expect(repaired).toBe(row);
  });

  it("row that already has value_current (even with code=null) is returned unchanged (never overwrites real data)", () => {
    const row = mkRow({ code: null, label: "Tổng cộng", value_current: 100 });
    const [repaired] = repairCorruptedRows([row], parseVnNumber);
    expect(repaired).toBe(row);
  });

  it("row with no Roman/section anchor at all is returned unchanged", () => {
    const row = mkRow({ label: "Ghi chú bổ sung không có mã số 1.234.567" });
    const [repaired] = repairCorruptedRows([row], parseVnNumber);
    expect(repaired).toBe(row);
  });

  it("negative parenthesis-wrapped VN numbers ('Dự phòng' deductions) parse correctly through repair", () => {
    const rows = [mkRow({ label: "VI. Dự phòng rủi ro cho vay khách hàng (12.334.812) (10.221.093)" })];
    const [repaired] = repairCorruptedRows(rows, parseVnNumber);
    expect(repaired!.code).toBe("VI");
    expect(repaired!.label).toBe("Dự phòng rủi ro cho vay khách hàng");
    expect(repaired!.value_current).toBe(-12334812);
    expect(repaired!.value_prior).toBe(-10221093);
  });

  it("decimal sub-item anchor (e.g. 'I.1') is preserved in the recovered code", () => {
    const rows = [mkRow({ label: "I.1. Tiền gửi thanh toán tại NHNN 8.120.331 9.045.220" })];
    const [repaired] = repairCorruptedRows(rows, parseVnNumber);
    expect(repaired!.code).toBe("I.1");
    expect(repaired!.label).toBe("Tiền gửi thanh toán tại NHNN");
  });
});
