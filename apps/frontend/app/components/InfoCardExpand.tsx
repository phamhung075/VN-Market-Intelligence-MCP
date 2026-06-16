/**
 * InfoCardExpand — reusable expand-on-click (disclosure) primitive.
 *
 * Usage:
 *   <InfoCardExpand
 *     summary={<span>NEUTRAL / 50% tin cậy / 10 thg 6, 2026</span>}
 *     findingData={sig.findingData}   // full structured object | null
 *     source={sig.source}             // clickable provenance URL | null
 *   />
 *
 * Collapsed: renders only `summary` (the caller-supplied one-line view).
 * Expanded:  renders the full `findingData` object generically, field by field,
 *            plus a clickable source link that opens in a new tab.
 *
 * Rules:
 * - GENERIC: card-agnostic. No per-ticker, per-type hardcode.
 * - Honest empty-state: if findingData is null and source is null, shows
 *   "Không có dữ liệu chi tiết." — NEVER fabricate or placeholder values.
 * - Vietnamese-only user-facing strings.
 * - Keyboard + aria-expanded accessible (Radix Collapsible primitive).
 * - Uses the Collapsible Radix primitive already wired in the project.
 *
 * FIX-INFOCARD-DROPDOWN-EXPAND (INFOCARD-EXPAND-FETCH epic)
 */
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";

// ---------------------------------------------------------------------------
// Label map — Vietnamese display labels for well-known finding_data fields.
// Fields NOT in this map are rendered with the raw key (snake_case → title).
// ---------------------------------------------------------------------------
const FIELD_LABELS: Record<string, string> = {
  event_type: "Loại sự kiện",
  headline: "Tiêu đề",
  direction: "Chiều hướng",
  confidence: "Độ tin cậy",
  magnitude: "Mức độ",
  affected_stocks: "Cổ phiếu liên quan",
  affected_sectors: "Ngành liên quan",
  source: "Nguồn",
  reasoning: "Phân tích",
  imfSentiment: "Tâm lý IMF",
  newsSentiment: "Tâm lý tin tức",
  kinhDichConfidence: "Độ tin cậy Kinh Dịch",
  agentSignalsMajority: "Đa số tín hiệu agent",
  catalyst_stock_code: "Mã kích hoạt",
  time_to_price_move: "Thời gian đến biến động giá",
  macro_event: "Sự kiện vĩ mô",
  sector: "Ngành",
  impact: "Tác động",
};

// Fields to skip in the generic render (already shown in summary or irrelevant UI noise)
const SKIP_FIELDS = new Set(["id", "signal_id", "created_at", "updated_at"]);

// ---------------------------------------------------------------------------
// Helper — format a single field value for display.
// ---------------------------------------------------------------------------
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.length > 0 ? value : "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
  }
  if (typeof value === "object") {
    // Render nested objects as JSON (terse — let the user read the raw detail)
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[đối tượng]";
    }
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Helper — humanise a raw snake_case key to a readable label.
// ---------------------------------------------------------------------------
function humanLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // Fallback: replace underscores with spaces, title-case first word
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// FindingDataPanel — renders the full finding_data object generically.
// ---------------------------------------------------------------------------
interface FindingDataPanelProps {
  findingData: Record<string, unknown> | null;
  source: string | null;
}

export function FindingDataPanel({ findingData, source }: FindingDataPanelProps) {
  const hasSource = source !== null && source.length > 0;

  // Build displayable entries — filter skip fields, source (rendered as link), and empty values
  const displayEntries =
    findingData !== null
      ? Object.entries(findingData)
          .filter(([k]) => !SKIP_FIELDS.has(k) && k !== "source")
          .filter(([, v]) => formatFieldValue(v) !== "—")
      : [];

  const hasDisplayableContent = displayEntries.length > 0 || hasSource;

  if (!hasDisplayableContent) {
    return (
      <p className="text-xs text-slate-500 italic mt-2">Không có dữ liệu chi tiết.</p>
    );
  }

  return (
    <div className="mt-2 space-y-1.5 border-t border-slate-700 pt-2">
      {displayEntries.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-xs">
          <span className="shrink-0 w-36 text-slate-500">{humanLabel(key)}</span>
          <span className="text-slate-200 break-words min-w-0 whitespace-pre-wrap">
            {formatFieldValue(value)}
          </span>
        </div>
      ))}

      {hasSource && (
        <div className="flex gap-2 text-xs pt-1">
          <span className="shrink-0 w-36 text-slate-500">Nguồn</span>
          <a
            href={source!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline underline-offset-2 hover:text-blue-300 break-all min-w-0"
          >
            {source}
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoCardExpand — the main reusable disclosure primitive.
// ---------------------------------------------------------------------------
export interface InfoCardExpandProps {
  /**
   * The summary content always shown (collapsed state).
   * Typically a one-line summary of the signal.
   */
  summary: React.ReactNode;
  /**
   * Full structured detail object from the backend (finding_data).
   * null = genuinely no detail — shows honest empty-state on expand.
   */
  findingData: Record<string, unknown> | null;
  /**
   * Clickable provenance URL/identifier (source field).
   * null = no provenance recorded.
   */
  source: string | null;
  /**
   * Optional extra class on the wrapper div (e.g. border, background).
   */
  className?: string;
}

export function InfoCardExpand({
  summary,
  findingData,
  source,
  className = "",
}: InfoCardExpandProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={className}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">{summary}</div>
          <CollapsibleTrigger
            aria-expanded={open}
            aria-label={open ? "Thu gọn chi tiết" : "Xem chi tiết"}
            className="shrink-0 text-xs text-slate-400 hover:text-slate-200 transition-colors px-1 py-0.5 rounded hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            {open ? "▲ Thu gọn" : "▼ Xem thêm"}
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <FindingDataPanel findingData={findingData} source={source} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
