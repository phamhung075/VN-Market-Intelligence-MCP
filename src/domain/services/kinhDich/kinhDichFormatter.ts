// src/domain/services/kinhDich/kinhDichFormatter.ts
// Vietnamese plain-text formatter for KinhDichReading.
// Pure domain — NO I/O imports.

import type { KinhDichReading } from "./kinhDichReading.js";
import type { HaoState } from "./haoEncoder.js";

// ── Hào state Vietnamese labels ────────────────────────────────────────────────

const HAO_STATE_LABELS: Record<HaoState, string> = {
  LAO_DUONG: "Lão Dương ⚡ (quá mua, sắp đảo chiều)",
  THIEU_DUONG: "Thiếu Dương (tăng ổn định)",
  THIEU_AM: "Thiếu Âm (giảm ổn định)",
  LAO_AM: "Lão Âm ⚡ (quá bán, sắp hồi phục)",
};

// ── Hào position labels (short, for the 6-line section) ───────────────────────

const HAO_POSITION_LABELS: Record<number, string> = {
  1: "Sơ hào   (Tâm lý)",
  2: "Nhị hào  (Cơ bản)",
  3: "Tam hào  (Giá)   ",
  4: "Tứ hào   (Ngoại) ",
  5: "Ngũ hào  (Ngành) ",
  6: "Thượng hào (Vĩ mô)",
};

// ── Main formatter ─────────────────────────────────────────────────────────────

/**
 * Format a KinhDichReading into a Vietnamese plain-text report.
 *
 * All output is ASCII-compatible plain text (no Markdown, no rich formatting)
 * suitable for Telegram or CLI display.
 */
export function formatReading(reading: KinhDichReading): string {
  const { queChiNh, hoQue, bienQue, nguHanh, haos, changingLines, markov } =
    reading;

  const lines: string[] = [];

  // ── Header ──
  lines.push(
    `=== KINH DICH: ${reading.stockCode} — Que ${queChiNh.name} (${queChiNh.number}) ${queChiNh.chinese} ===`,
  );
  lines.push("");

  // ── Que chinh ──
  lines.push(`Quẻ chính: ${queChiNh.name} — ${queChiNh.coreMeaning.slice(0, 120)}`);
  lines.push(`  Xu hướng: ${queChiNh.trend}`);
  lines.push(`  Tín hiệu: ${queChiNh.tradingSignal} | Độ tin cậy: ${Math.round(queChiNh.confidence * 100)}%`);
  lines.push("");

  // ── 6 Hao ──
  lines.push("6 Hào:");
  for (const hao of haos) {
    const posLabel = HAO_POSITION_LABELS[hao.position] ?? `Hao ${hao.position}`;
    const stateLabel = HAO_STATE_LABELS[hao.state];
    lines.push(`  ${posLabel}: ${stateLabel}`);
  }
  lines.push("");

  // ── Hao dong (changing lines) ──
  if (changingLines.length > 0) {
    const posStr = changingLines.join(", ");
    lines.push(
      `Hào động: ${posStr} — biến chuyển, sự thay đổi đang đến (→ ${bienQue.name})`,
    );
  } else {
    lines.push("Hào động: Không có hào động — quẻ ổn định, xu hướng hiện tại bền vững");
  }
  lines.push("");

  // ── Ho que ──
  const hoCoreMeaning = hoQue.coreMeaning.slice(0, 100);
  lines.push(
    `Hộ quẻ (ẩn sâu): ${hoQue.name} (${hoQue.number}) ${hoQue.chinese} — ${hoCoreMeaning}`,
  );

  // ── Bien que ──
  const bienCoreMeaning = bienQue.coreMeaning.slice(0, 100);
  lines.push(
    `Biến quẻ (tương lai): ${bienQue.name} (${bienQue.number}) ${bienQue.chinese} — ${bienCoreMeaning}`,
  );
  lines.push("");

  // ── Ngu Hanh ──
  const lower = reading.lowerTrigram;
  const upper = reading.upperTrigram;
  lines.push(
    `Ngũ Hành: ${lower.element} ${lower.symbol} (${lower.name}) vs ${upper.element} ${upper.symbol} (${upper.name}) — ${nguHanh.dynamic}`,
  );
  lines.push(`  ${nguHanh.interpretation}`);
  lines.push(`  Điểm ngũ hành: ${nguHanh.score >= 0 ? "+" : ""}${nguHanh.score.toFixed(2)}`);
  lines.push("");

  // ── Markov (optional) ──
  if (markov) {
    const pct = Math.round(markov.probability * 100);
    lines.push(
      `Markov: Xác suất chuyển sang ${markov.nextName} (${markov.nextMostLikely}): ${pct}%`,
    );
    lines.push("");
  }

  // ── Action note ──
  lines.push(reading.actionNote);

  return lines.join("\n");
}
