Bun.env["DB_PATH"] = ":memory:"
// src/__tests__/1383-france-summary-message-quality.test.ts
// Task 1383 — TDD RED: France summary message quality tests
//
// Tests assert FIXED behavior from task 1384:
//   1. No "Khong co" filler lines — empty sections are omitted entirely
//   2. Vietnamese diacritics present in all headers and signal labels
//
// All tests are RED until task 1384 implements the fixes in formatFranceSummaryVI.

import { describe, it, expect } from "bun:test"
import { formatFranceSummaryVI } from "../scheduler/briefings/franceSummaryJob.js"
import type { TaSignalRow } from "../scheduler/briefings/franceSummaryJob.js"

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────────────────────

function mover(code: string, price: number, change_pct: number) {
  return { code, price, change_pct }
}

function alert(id: string, severity: string, message: string, triggered_at: string) {
  return { id, severity, message, triggered_at }
}

function taSignal(
  code: string,
  rsi14: number,
  rsiStatus: TaSignalRow["rsiStatus"],
  priceVsMa20: TaSignalRow["priceVsMa20"],
): TaSignalRow {
  return { code, rsi14, rsiStatus, priceVsMa20, ma20: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// T1: movers=0, alerts=2, ta=0
//   → message contains alerts section
//   → message does NOT contain "Khong co" anywhere
// ─────────────────────────────────────────────────────────────────────────────
describe("Task 1383 — France summary message quality (RED)", () => {

  it("T1: movers=0 alerts=2 ta=0 — alerts present, no 'Khong co' filler", () => {
    const alerts = [
      alert("a1", "critical", "Stop-loss triggered VHM", "2026-04-17T06:00:00"),
      alert("a2", "warning",  "VCB near resistance",    "2026-04-17T05:00:00"),
    ]
    const msg = formatFranceSummaryVI("17/04/2026", [], alerts, [])

    // Alerts section must be present
    expect(msg).toContain("Cảnh báo gần nhất")
    expect(msg).toContain("a1".slice(0, 0) + "Stop-loss triggered VHM")

    // No filler lines
    expect(msg).not.toContain("Khong co")
    expect(msg).not.toContain("Khong co du lieu gia")
    expect(msg).not.toContain("Khong co canh bao")
    expect(msg).not.toContain("Khong co tin hieu ky thuat")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T2: movers=3, alerts=0, ta=0
  //   → movers section present, no alerts/ta section lines, no "Khong co"
  // ─────────────────────────────────────────────────────────────────────────
  it("T2: movers=3 alerts=0 ta=0 — movers present, no filler for missing sections", () => {
    const movers = [
      mover("VHM", 55000, 3.5),
      mover("HPG", 22000, -5.2),
      mover("VCB", 88000, 1.1),
    ]
    const msg = formatFranceSummaryVI("17/04/2026", movers, [], [])

    // Movers section must be present
    expect(msg).toContain("Top biến động giá")
    expect(msg).toContain("VHM")
    expect(msg).toContain("HPG")
    expect(msg).toContain("VCB")

    // No filler anywhere
    expect(msg).not.toContain("Khong co")
    expect(msg).not.toContain("Khong co canh bao")
    expect(msg).not.toContain("Khong co tin hieu ky thuat")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T3: movers=0, alerts=0, ta=2
  //   → TA section present, no movers/alerts section, no "Khong co"
  // ─────────────────────────────────────────────────────────────────────────
  it("T3: movers=0 alerts=0 ta=2 — TA section present, no filler for missing sections", () => {
    const signals: TaSignalRow[] = [
      taSignal("VHM", 78.2, "overbought", "above"),
      taSignal("HPG", 24.1, "oversold",   "below"),
    ]
    const msg = formatFranceSummaryVI("17/04/2026", [], [], signals)

    // TA section must be present
    expect(msg).toContain("Tín hiệu kỹ thuật")
    expect(msg).toContain("VHM")
    expect(msg).toContain("HPG")

    // No filler anywhere
    expect(msg).not.toContain("Khong co")
    expect(msg).not.toContain("Khong co du lieu gia")
    expect(msg).not.toContain("Khong co canh bao")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T4: movers=2, alerts=1, ta=1 — all 3 sections present, no filler
  // ─────────────────────────────────────────────────────────────────────────
  it("T4: movers=2 alerts=1 ta=1 — all 3 sections present, no filler", () => {
    const movers = [mover("VHM", 55000, 3.5), mover("HPG", 22000, -5.2)]
    const alerts = [alert("a1", "high", "Alert message", "2026-04-17T06:00:00")]
    const signals: TaSignalRow[] = [taSignal("VCB", 72.0, "overbought", "above")]

    const msg = formatFranceSummaryVI("17/04/2026", movers, alerts, signals)

    expect(msg).toContain("Top biến động giá")
    expect(msg).toContain("Cảnh báo gần nhất")
    expect(msg).toContain("Tín hiệu kỹ thuật")
    expect(msg).not.toContain("Khong co")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T5: Vietnamese diacritics present in message output
  //   - header: "Bản tin sáng Pháp"
  //   - section headers with diacritics
  //   - signal labels: "quá mua", "quá bán", "giá trên MA20", "giá dưới MA20"
  //   - severity labels: "NGHIÊM TRỌNG", "CẢNH BÁO", "THÔNG TIN"
  // ─────────────────────────────────────────────────────────────────────────
  it("T5: Vietnamese diacritics present in all headers and signal labels", () => {
    // Title / header
    const titleMsg = formatFranceSummaryVI("17/04/2026", [], [], [])
    expect(titleMsg).toContain("Bản tin sáng Pháp")

    // Section headers via movers
    const moversMsg = formatFranceSummaryVI("17/04/2026", [mover("VHM", 55000, 3.5)], [], [])
    expect(moversMsg).toContain("Top biến động giá")

    // Alerts section header
    const alertsMsg = formatFranceSummaryVI(
      "17/04/2026", [],
      [alert("a1", "critical", "Test", "2026-04-17T06:00:00")],
      [],
    )
    expect(alertsMsg).toContain("Cảnh báo gần nhất")

    // TA section header
    const taMsg = formatFranceSummaryVI(
      "17/04/2026", [], [],
      [taSignal("VHM", 78.2, "overbought", "above")],
    )
    expect(taMsg).toContain("Tín hiệu kỹ thuật")

    // Signal labels
    const obMsg = formatFranceSummaryVI(
      "17/04/2026", [], [],
      [taSignal("VHM", 78.2, "overbought", "neutral")],
    )
    expect(obMsg).toContain("quá mua")

    const osMsg = formatFranceSummaryVI(
      "17/04/2026", [], [],
      [taSignal("HPG", 24.1, "oversold", "neutral")],
    )
    expect(osMsg).toContain("quá bán")

    const aboveMsg = formatFranceSummaryVI(
      "17/04/2026", [], [],
      [taSignal("VCB", 55.0, "neutral", "above")],
    )
    expect(aboveMsg).toContain("giá trên MA20")

    const belowMsg = formatFranceSummaryVI(
      "17/04/2026", [], [],
      [taSignal("SSI", 45.0, "neutral", "below")],
    )
    expect(belowMsg).toContain("giá dưới MA20")

    // Severity labels
    const criticalMsg = formatFranceSummaryVI(
      "17/04/2026", [],
      [alert("a1", "critical", "Critical alert", "2026-04-17T06:00:00")],
      [],
    )
    expect(criticalMsg).toContain("NGHIÊM TRỌNG")

    const warningMsg = formatFranceSummaryVI(
      "17/04/2026", [],
      [alert("a2", "warning", "Warning alert", "2026-04-17T06:00:00")],
      [],
    )
    expect(warningMsg).toContain("CẢNH BÁO")

    const infoMsg = formatFranceSummaryVI(
      "17/04/2026", [],
      [alert("a3", "info", "Info alert", "2026-04-17T06:00:00")],
      [],
    )
    expect(infoMsg).toContain("THÔNG TIN")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T6: TypeScript compile check — covered by bun tsc --noEmit
  //     This test simply verifies the import resolves and formatFranceSummaryVI
  //     is callable with the expected signature (catches TS regressions at runtime).
  // ─────────────────────────────────────────────────────────────────────────
  it("T6: formatFranceSummaryVI is callable and returns a string", () => {
    const result = formatFranceSummaryVI("17/04/2026", [], [], [])
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T7: movers=0 alerts=0 ta=0 — title line still present, no filler anywhere
  // ─────────────────────────────────────────────────────────────────────────
  it("T7: all empty — title line present, absolutely no 'Khong co' filler", () => {
    const msg = formatFranceSummaryVI("17/04/2026", [], [], [])

    expect(msg).toContain("Bản tin sáng Pháp")
    expect(msg).not.toContain("Khong co")
    expect(msg).not.toContain("Khong co du lieu gia")
    expect(msg).not.toContain("Khong co canh bao")
    expect(msg).not.toContain("Khong co tin hieu ky thuat")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T8: unaccented ASCII strings are GONE — old strings must NOT appear
  // ─────────────────────────────────────────────────────────────────────────
  it("T8: old unaccented strings completely absent from output", () => {
    const movers = [mover("VHM", 55000, 3.5)]
    const alerts = [
      alert("a1", "critical", "Test", "2026-04-17T06:00:00"),
      alert("a2", "warning",  "Test", "2026-04-17T05:00:00"),
      alert("a3", "info",     "Test", "2026-04-17T04:00:00"),
    ]
    const signals: TaSignalRow[] = [
      taSignal("VHM", 78.2, "overbought", "above"),
      taSignal("HPG", 24.1, "oversold",   "below"),
    ]
    const msg = formatFranceSummaryVI("17/04/2026", movers, alerts, signals)

    // Old unaccented headers
    expect(msg).not.toContain("Ban tin sang Phap")
    expect(msg).not.toContain("Top bien dong gia")
    expect(msg).not.toContain("Canh bao gan nhat")
    expect(msg).not.toContain("Tin hieu ky thuat")

    // Old unaccented signal labels
    expect(msg).not.toContain("qua mua")
    expect(msg).not.toContain("qua ban")
    expect(msg).not.toContain("gia tren MA20")
    expect(msg).not.toContain("gia duoi MA20")

    // Old unaccented severity labels
    expect(msg).not.toContain("NGHIEM TRONG")
    expect(msg).not.toContain("CANH BAO")
    expect(msg).not.toContain("THONG TIN")
  })

})
