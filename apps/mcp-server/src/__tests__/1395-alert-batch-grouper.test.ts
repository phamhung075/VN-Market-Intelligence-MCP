// apps/mcp-server/src/__tests__/1395-alert-batch-grouper.test.ts
import { describe, it, expect } from "bun:test";
import {
  groupAlertsBySignalSeverity,
  formatBatchGroupMessage,
} from "../domain/services/alertBatchGrouper.js";
import type { Alert } from "../domain/services/alertGenerator.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeAlert(
  id: string,
  actionCode: string,
  signalType: string | null,
  severity: "low" | "medium" | "high" | "critical",
  message = `${actionCode} alert`,
): Alert {
  return {
    id,
    actionCode,
    signals:
      signalType !== null
        ? [
            {
              type: signalType as "price_drop",
              severity,
              message: `${actionCode} ${signalType}`,
              actionCode,
              confidence: 0.9,
              detectedAt: new Date().toISOString(),
            },
          ]
        : [],
    severity,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
}

// ─── groupAlertsBySignalSeverity ─────────────────────────────────────────────

describe("Task 1395 — alertBatchGrouper", () => {
  describe("groupAlertsBySignalSeverity", () => {
    it("T1 — 8 price_drop/high alerts → 1 group with 8 tickers", () => {
      const tickers = ["VCB", "BID", "CTG", "VPB", "TCB", "MBB", "ACB", "HDB"];
      const alerts = tickers.map((t, i) => makeAlert(`id${i}`, t, "price_drop", "high"));
      const groups = groupAlertsBySignalSeverity(alerts);
      expect(groups).toHaveLength(1);
      expect(groups[0].signalType).toBe("price_drop");
      expect(groups[0].severity).toBe("high");
      expect(groups[0].tickers).toHaveLength(8);
      expect(groups[0].tickers).toEqual(tickers);
    });

    it("T2 — price_drop/high x2 + volume_spike/high x1 → 2 groups", () => {
      const alerts = [
        makeAlert("a1", "VCB", "price_drop", "high"),
        makeAlert("a2", "SSI", "volume_spike", "high"),
        makeAlert("a3", "BID", "price_drop", "high"),
      ];
      const groups = groupAlertsBySignalSeverity(alerts);
      expect(groups).toHaveLength(2);
      const pdGroup = groups.find((g) => g.signalType === "price_drop");
      const vsGroup = groups.find((g) => g.signalType === "volume_spike");
      expect(pdGroup?.tickers).toEqual(["VCB", "BID"]);
      expect(vsGroup?.tickers).toEqual(["SSI"]);
    });

    it("T3 — price_drop/critical x1 + price_drop/high x1 → 2 groups", () => {
      const alerts = [
        makeAlert("a1", "VCB", "price_drop", "critical"),
        makeAlert("a2", "BID", "price_drop", "high"),
      ];
      const groups = groupAlertsBySignalSeverity(alerts);
      expect(groups).toHaveLength(2);
      const critGroup = groups.find((g) => g.severity === "critical");
      const highGroup = groups.find((g) => g.severity === "high");
      expect(critGroup?.tickers).toEqual(["VCB"]);
      expect(highGroup?.tickers).toEqual(["BID"]);
    });

    it("T4 — single-alert input → 1 group, tickers.length = 1", () => {
      const alerts = [makeAlert("a1", "VCB", "price_drop", "high")];
      const groups = groupAlertsBySignalSeverity(alerts);
      expect(groups).toHaveLength(1);
      expect(groups[0].tickers).toHaveLength(1);
      expect(groups[0].tickers[0]).toBe("VCB");
      expect(groups[0].alertIds[0]).toBe("a1");
    });

    it("T5 — empty input → empty array", () => {
      const groups = groupAlertsBySignalSeverity([]);
      expect(groups).toHaveLength(0);
    });

    it("T6 — alert with empty signals array → group key uses 'unknown'", () => {
      const alerts = [makeAlert("a1", "VCB", null, "high")];
      const groups = groupAlertsBySignalSeverity(alerts);
      expect(groups).toHaveLength(1);
      expect(groups[0].signalType).toBe("unknown");
    });
  });

  // ─── formatBatchGroupMessage ───────────────────────────────────────────────

  describe("formatBatchGroupMessage", () => {
    it("T7 — N=1 → returns singleMessage verbatim with severity label", () => {
      const group = {
        signalType: "price_drop",
        severity: "high" as const,
        tickers: ["VCB"],
        alertIds: ["a1"],
        singleMessage: "VCB alert: price_drop — VCB giảm 5.2%",
      };
      const result = formatBatchGroupMessage(group);
      expect(result).toBe("[QUAN TRỌNG] VCB alert: price_drop — VCB giảm 5.2%");
    });

    it("T8 — N=8 price_drop/high → correct header + all 8 tickers on bullet line", () => {
      const tickers = ["VCB", "BID", "CTG", "VPB", "TCB", "MBB", "ACB", "HDB"];
      const group = {
        signalType: "price_drop",
        severity: "high" as const,
        tickers,
        alertIds: tickers.map((_, i) => `id${i}`),
        singleMessage: "",
      };
      const result = formatBatchGroupMessage(group);
      expect(result).toBe(
        "[QUAN TRỌNG] price_drop — 8 mã cùng giảm mạnh\n  • VCB, BID, CTG, VPB, TCB, MBB, ACB, HDB",
      );
    });

    it("T9 — N=12 → first 10 visible + (+2 mã khác) suffix", () => {
      const tickers = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"];
      const group = {
        signalType: "price_drop",
        severity: "high" as const,
        tickers,
        alertIds: tickers.map((_, i) => `id${i}`),
        singleMessage: "",
      };
      const result = formatBatchGroupMessage(group);
      expect(result).toContain("(+2 mã khác)");
      expect(result).toContain("T10");
      expect(result).not.toContain("T11");
    });

    it("T10 — volume_spike/critical → verb 'khối lượng đột biến', label 'NGHIÊM TRỌNG'", () => {
      const tickers = ["SSI", "HPG"];
      const group = {
        signalType: "volume_spike",
        severity: "critical" as const,
        tickers,
        alertIds: ["a1", "a2"],
        singleMessage: "",
      };
      const result = formatBatchGroupMessage(group);
      expect(result).toContain("NGHIÊM TRỌNG");
      expect(result).toContain("khối lượng đột biến");
    });

    it("T11 — unknown signal type → verb fallback 'kích hoạt cảnh báo'", () => {
      const tickers = ["VNM", "MSN"];
      const group = {
        signalType: "mystery_signal",
        severity: "high" as const,
        tickers,
        alertIds: ["a1", "a2"],
        singleMessage: "",
      };
      const result = formatBatchGroupMessage(group);
      expect(result).toContain("kích hoạt cảnh báo");
    });
  });
});
