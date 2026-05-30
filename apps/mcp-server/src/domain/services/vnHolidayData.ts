/**
 * VN Holiday Data — DWF-DEV-MCP-1
 *
 * Embedded static VN exchange holiday calendar covering 2024–2027.
 * Source: HOSE published annual holiday circulars (updated each October for next year).
 *
 * VN_HOLIDAYS: YYYY-MM-DD → Vietnamese holiday name (full-day closure)
 * VN_HALF_DAYS: Set of YYYY-MM-DD dates with shortened trading sessions
 *
 * Yearly update: dev-mcp-server task each October when HOSE publishes next-year schedule.
 *
 * @module domain/services/vnHolidayData
 */

/**
 * Full-day VN exchange closures (HOSE + HNX follow same calendar).
 * Map of ISO date (YYYY-MM-DD) → holiday name in Vietnamese.
 *
 * Sources:
 *  - Tết Dương Lịch (New Year): 1 Jan
 *  - Tết Nguyên Đán (Lunar New Year): varies by lunar calendar
 *  - Giỗ Tổ Hùng Vương (Hùng Kings Festival): 10th day, 3rd lunar month
 *  - Ngày Giải Phóng (Reunification): 30 Apr
 *  - Quốc Tế Lao Động (Labour Day): 1 May
 *  - Quốc Khánh (National Day): 2 Sep (+ makeups)
 */
export const VN_HOLIDAYS: Record<string, string> = {
  // ─── 2024 ────────────────────────────────────────────────────────────────
  "2024-01-01": "Tết Dương Lịch 2024",
  "2024-02-08": "Tết Nguyên Đán 2024 (nghỉ bù)",
  "2024-02-09": "Tết Nguyên Đán Giáp Thìn 2024 (29 Tháng Chạp)",
  "2024-02-10": "Tết Nguyên Đán Giáp Thìn 2024 (30 Tháng Chạp)",
  "2024-02-12": "Tết Nguyên Đán Giáp Thìn 2024 (Mùng 1 Tết)",
  "2024-02-13": "Tết Nguyên Đán Giáp Thìn 2024 (Mùng 2 Tết)",
  "2024-02-14": "Tết Nguyên Đán Giáp Thìn 2024 (Mùng 3 Tết)",
  "2024-02-15": "Tết Nguyên Đán Giáp Thìn 2024 (Mùng 4 Tết)",
  "2024-02-16": "Tết Nguyên Đán Giáp Thìn 2024 (Mùng 5 Tết)",
  "2024-04-18": "Giỗ Tổ Hùng Vương 2024 (nghỉ bù)",
  "2024-04-30": "Ngày Giải Phóng Miền Nam 2024",
  "2024-05-01": "Quốc Tế Lao Động 2024",
  "2024-09-02": "Quốc Khánh 2024",
  "2024-09-03": "Quốc Khánh 2024 (nghỉ bù)",

  // ─── 2025 ────────────────────────────────────────────────────────────────
  "2025-01-01": "Tết Dương Lịch 2025",
  "2025-01-27": "Tết Nguyên Đán Ất Tỵ 2025 (27 Tháng Chạp / Mùng 1 Tết)",
  "2025-01-28": "Tết Nguyên Đán Ất Tỵ 2025 (Mùng 2 Tết)",
  "2025-01-29": "Tết Nguyên Đán Ất Tỵ 2025 (Mùng 3 Tết)",
  "2025-01-30": "Tết Nguyên Đán Ất Tỵ 2025 (Mùng 4 Tết)",
  "2025-01-31": "Tết Nguyên Đán Ất Tỵ 2025 (Mùng 5 Tết)",
  "2025-04-07": "Giỗ Tổ Hùng Vương 2025",
  "2025-04-30": "Ngày Giải Phóng Miền Nam 2025",
  "2025-05-01": "Quốc Tế Lao Động 2025",
  "2025-09-01": "Quốc Khánh 2025 (nghỉ bù)",
  "2025-09-02": "Quốc Khánh 2025",

  // ─── 2026 ────────────────────────────────────────────────────────────────
  "2026-01-01": "Tết Dương Lịch 2026",
  "2026-01-02": "Tết Dương Lịch 2026 (nghỉ bù)",
  "2026-02-14": "Tết Nguyên Đán Bính Ngọ 2026 (Mùng 1 Tết)",
  "2026-02-13": "Tết Nguyên Đán Bính Ngọ 2026 (30 Tháng Chạp / nghỉ trước Tết)",
  "2026-02-16": "Tết Nguyên Đán Bính Ngọ 2026 (Mùng 2 Tết)",
  "2026-02-17": "Tết Nguyên Đán Bính Ngọ 2026 (Mùng 3 Tết)",
  "2026-02-18": "Tết Nguyên Đán Bính Ngọ 2026 (Mùng 4 Tết)",
  "2026-02-19": "Tết Nguyên Đán Bính Ngọ 2026 (Mùng 5 Tết)",
  "2026-03-27": "Giỗ Tổ Hùng Vương 2026",
  "2026-04-30": "Ngày Giải Phóng Miền Nam 2026",
  "2026-05-01": "Quốc Tế Lao Động 2026",
  "2026-09-02": "Quốc Khánh 2026",

  // ─── 2027 ────────────────────────────────────────────────────────────────
  "2027-01-01": "Tết Dương Lịch 2027",
  "2027-02-05": "Tết Nguyên Đán Đinh Mùi 2027 (Mùng 1 Tết)",
  "2027-02-04": "Tết Nguyên Đán Đinh Mùi 2027 (30 Tháng Chạp / nghỉ trước Tết)",
  "2027-02-06": "Tết Nguyên Đán Đinh Mùi 2027 (Mùng 2 Tết)",
  "2027-02-07": "Tết Nguyên Đán Đinh Mùi 2027 (Mùng 3 Tết)",
  "2027-02-08": "Tết Nguyên Đán Đinh Mùi 2027 (Mùng 4 Tết)",
  "2027-02-09": "Tết Nguyên Đán Đinh Mùi 2027 (Mùng 5 Tết)",
  "2027-04-16": "Giỗ Tổ Hùng Vương 2027",
  "2027-04-30": "Ngày Giải Phóng Miền Nam 2027",
  "2027-05-01": "Quốc Tế Lao Động 2027",
  "2027-09-02": "Quốc Khánh 2027",
  "2027-09-03": "Quốc Khánh 2027 (nghỉ bù)",
};

/**
 * Known VN half-day trading sessions.
 * On these dates, HOSE/HNX operate a shortened session (morning only).
 * `is_trading_day: true`, `session_status: "half_day"`.
 *
 * Typically: the eve of Tết Nguyên Đán (the last working day before Tết).
 */
export const VN_HALF_DAYS: Set<string> = new Set([
  // 2024: Tết eve — 2024-02-07 (Wednesday before Tết holiday block)
  "2024-02-07",
  // 2025: Tết eve — 2025-01-24 (Friday before Tết holiday block starting 2025-01-27)
  "2025-01-24",
  // 2026: Tết eve — 2026-02-12 (Thursday before Tết holiday block starting 2026-02-13)
  "2026-02-12",
  // 2027: Tết eve — 2027-02-03 (Wednesday before Tết holiday block starting 2027-02-04)
  "2027-02-03",
]);

/**
 * Last year covered by the embedded calendar.
 * Dates after this boundary return session_status: "unknown".
 */
export const VN_CALENDAR_LAST_YEAR = 2027;
