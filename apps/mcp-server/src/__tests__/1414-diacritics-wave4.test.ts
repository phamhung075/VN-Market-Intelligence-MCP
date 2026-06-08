/**
 * TASK-1414 — test(diacritics-wave4): RED tests for 5 interface/mcp/tools files.
 *
 * All assertions check for CORRECT accented Vietnamese output.
 * Current source code uses unaccented ASCII placeholders → all source-scan tests FAIL (RED).
 * Task 1415 will fix the source strings to make these GREEN.
 *
 * 13+ test cases across 5 files.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { buildSupplyChainExposureOutput } from "../interface/mcp/tools/sector/supplyChainTools.js";
import type { SupplyChainEvent } from "../domain/services/supplyChainEventDetector.js";

// ── Source file paths ─────────────────────────────────────────────────────────

const TOOLS_DIR = join(import.meta.dir, "../interface/mcp/tools");

function readTool(filename: string): string {
  return readFileSync(join(TOOLS_DIR, filename), "utf8");
}

// ── FILE 1: kinhDichTools.ts — 7 strings ─────────────────────────────────────

describe("1414 FILE 1 — kinhDichTools.ts: handler string diacritics", () => {
  const src = readTool("kinhdich/kinhDichTools.ts");

  it("line 734: history row must use Quẻ not Que", () => {
    // Template: `${ts} | Quẻ ${r.hexagramNumber} ...`
    expect(src).toContain("| Quẻ ${r.hexagramNumber}");
    expect(src).not.toContain("| Que ${r.hexagramNumber}");
  });

  it("line 734: history row must use Tín hiệu: not Tin hieu:", () => {
    expect(src).toContain("| Tín hiệu: ${r.tradingSignal}");
    expect(src).not.toContain("| Tin hieu: ${r.tradingSignal}");
  });

  it("line 734: history row must use Độ tin cậy: not Do tin cay:", () => {
    expect(src).toContain("| Độ tin cậy: ${confPct}%`");
    expect(src).not.toContain("| Do tin cay: ${confPct}%`");
  });

  it("line 808: transition header must use Cổ phiếu: not Co phieu:", () => {
    expect(src).toContain("`Cổ phiếu: ${code}`");
    expect(src).not.toContain("`Co phieu: ${code}`");
  });

  it("line 1008: error message must use Lỗi: Không có dữ liệu giải thích cho Quẻ", () => {
    expect(src).toContain("Lỗi: Không có dữ liệu giải thích cho Quẻ ${number}");
    expect(src).not.toContain("Loi: Khong co du lieu giai thich cho Que ${number}");
  });

  it("line 1032: state block header must use Tình trạng quẻ:", () => {
    expect(src).toContain("`Tình trạng quẻ:`");
    expect(src).not.toContain("`Tinh trang que:`");
  });

  it("line 1033: state trend must use Xu hướng: not Xu huong:", () => {
    expect(src).toContain("`  Xu hướng: ${data.state.trend}`");
    expect(src).not.toContain("`  Xu huong: ${data.state.trend}`");
  });

  it("line 1035: state warning must use Cảnh báo: not Canh bao:", () => {
    expect(src).toContain("`  Cảnh báo: ${data.state.warning}`");
    expect(src).not.toContain("`  Canh bao: ${data.state.warning}`");
  });

  it("line 1038: hao section header must use 6 Hào (từng đường): not 6 Hao (tung duong):", () => {
    expect(src).toContain('"6 Hào (từng đường):"');
    expect(src).not.toContain('"6 Hao (tung duong):"');
  });
});

// ── FILE 2: supplyChainTools.ts — 7 strings (lines 79-88) ────────────────────

const stubEvent: SupplyChainEvent = {
  eventType: "route_disruption",
  severity: "high",
  description: "Cảng bị đóng cửa do bão",
  affectedRoutes: ["HCM-HAN"],
  affectedStocks: ["GMD", "VSC"],
  confidence: 0.85,
};

describe("1414 FILE 2 — supplyChainTools.ts: buildSupplyChainExposureOutput", () => {
  it("event block must use SỰ KIỆN GIÁN ĐOẠN not SU KIEN GIAN DOAN", () => {
    const result = buildSupplyChainExposureOutput([], [], stubEvent);
    expect(result).toContain("SỰ KIỆN GIÁN ĐOẠN");
    expect(result).not.toContain("SU KIEN GIAN DOAN");
  });

  it("event type label must use Loại: not Loai:", () => {
    const result = buildSupplyChainExposureOutput([], [], stubEvent);
    expect(result).toContain("  Loại:");
    expect(result).not.toContain("  Loai:");
  });

  it("description label must use Mô tả: not Mo ta:", () => {
    const result = buildSupplyChainExposureOutput([], [], stubEvent);
    expect(result).toContain("  Mô tả:");
    expect(result).not.toContain("  Mo ta:");
  });

  it("routes label must use Tuyến đường bị ảnh hưởng: not Tuyen duong bi anh huong:", () => {
    const result = buildSupplyChainExposureOutput([], [], stubEvent);
    expect(result).toContain("  Tuyến đường bị ảnh hưởng:");
    expect(result).not.toContain("  Tuyen duong bi anh huong:");
  });

  it("affected stocks label must use Cổ phiếu bị ảnh hưởng: not Co phieu bi anh huong:", () => {
    const result = buildSupplyChainExposureOutput([], [], stubEvent);
    expect(result).toContain("  Cổ phiếu bị ảnh hưởng:");
    expect(result).not.toContain("  Co phieu bi anh huong:");
  });

  it("confidence label must use Độ tin cậy: not Do tin cay:", () => {
    const result = buildSupplyChainExposureOutput([], [], stubEvent);
    expect(result).toContain("  Độ tin cậy:");
    expect(result).not.toContain("  Do tin cay:");
  });

  it("null event path must use Sự kiện gián đoạn: Không phát hiện not Su kien gian doan:", () => {
    const result = buildSupplyChainExposureOutput([], [], null);
    expect(result).toContain("Sự kiện gián đoạn: Không phát hiện");
    expect(result).not.toContain("Su kien gian doan: Khong phat hien");
  });
});

// ── FILE 3: alertMuteTools.ts — 1 string ─────────────────────────────────────

describe("1414 FILE 3 — alertMuteTools.ts: unmute expired handler string", () => {
  const src = readTool("alerts/alertMuteTools.ts");

  it("line 142: expired mute message must use lệnh tắt tiếng đã hết hạn and Cảnh báo đã được bật lại", () => {
    expect(src).toContain("lệnh tắt tiếng đã hết hạn");
    expect(src).not.toContain("lenh tat tieng da het han");
  });

  it("line 142: expired mute message must use Cảnh báo đã được bật lại not Canh bao da duoc bat lai", () => {
    expect(src).toContain("Cảnh báo đã được bật lại.");
    expect(src).not.toContain("Canh bao da duoc bat lai.");
  });
});

// ── FILE 4: watchlist.ts — 2 strings (lines 286-287) ─────────────────────────

describe("1414 FILE 4 — watchlist.ts: add_to_watchlist confirmation strings", () => {
  const src = readTool("system/watchlist.ts");

  it("line 286: confirmation must use Đã thêm ... vào danh sách theo dõi not Da them ... vao danh sach theo doi", () => {
    expect(src).toContain("Đã thêm ${actionCode} (${exchange}) vào danh sách theo dõi.\\n");
    expect(src).not.toContain("Da them ${actionCode} (${exchange}) vao danh sach theo doi.\\n");
  });

  it("line 287: alert thresholds must use Cảnh báo: giảm ... tăng not Canh bao: giam ... tang", () => {
    expect(src).toContain("Cảnh báo: giảm ${dropPct}%");
    expect(src).not.toContain("Canh bao: giam ${dropPct}%");
  });

  it("line 287: tăng must replace tang in threshold line", () => {
    expect(src).toContain("tăng +${risePct}%");
    expect(src).not.toContain("tang +${risePct}%");
  });
});

// ── FILE 5: compareTools.ts — 1 string ───────────────────────────────────────

describe("1414 FILE 5 — compareTools.ts: buildRow label diacritics", () => {
  const src = readTool("news-analysis/compareTools.ts");

  it("line 386: buildRow alert label must use Cảnh báo (7d) not Canh bao (7d)", () => {
    expect(src).toContain('buildRow("Cảnh báo (7d)"');
    expect(src).not.toContain('buildRow("Canh bao (7d)"');
  });
});

// ── Regression guard — prior wave test imports ────────────────────────────────
// Prior wave tests (1408, 1410, 1412) must remain GREEN.
// No explicit re-assertion here — full bun test suite covers them.
// Dev must verify: bun test src/__tests__/1408-tool-diacritics.test.ts
//                  bun test src/__tests__/1410-tool-diacritics-sweep.test.ts
//                  bun test src/__tests__/1412-diacritics-wave3.test.ts
