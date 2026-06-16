/**
 * /dashboard/alerts — Cảnh Báo thị trường (Market Alerts).
 *
 * Data source: GET /api/alerts (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.alerts.tsx, mirroring the api.orchestration.tsx precedent.
 *
 * Endpoint contract (GET /api/alerts?limit=100):
 *   {
 *     items: [
 *       { id: string, triggeredAt: ISO8601, severity: "low"|"medium"|"high"|"critical",
 *         signals: Signal[], affectedActions: [{code: string, expectedImpact: string, confidence: number}],
 *         message: string|null, read: 0|1, sentBy: string,
 *         confidenceScore: number|null, outcome: string|null }
 *     ],
 *     count: number, fetchedAt: ISO8601
 *   }
 *
 * Signal shape (v2 — object, not string):
 *   { type: string, severity: string, message: string, confidence: number }
 *
 * Sections rendered:
 *   - Summary header: total + per-severity chips (critical/high/medium/low)
 *   - Severity filter (client-side)
 *   - Table: newest-first, time-ago, severity badge, signal chips (type label + confidence%,
 *     message in title tooltip), tickers+impact, message, confidence, outcome
 *
 * All user-facing copy in plain Vietnamese.
 * Honest empty state only on degrade (502/503/timeout or items==[]).
 * Named export fetchAlertsData(origin, params?) for direct unit testing.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";
import { safeFetch } from "~/lib/api/fetchUtils";

export const meta: MetaFunction = () => [
  { title: "Cảnh Báo — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/alerts DTO contract
// ---------------------------------------------------------------------------

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface AffectedAction {
  code: string;
  expectedImpact: string;
  confidence: number;
}

/**
 * Signal object shape — v2 contract (mcp-server).
 * All fields are optional-safe: render must not throw on missing/empty values.
 */
export interface Signal {
  type: string;
  severity: string;
  message: string;
  confidence: number;
}

export interface AlertItem {
  id: string;
  triggeredAt: string;
  severity: AlertSeverity;
  signals: Signal[];
  affectedActions: AffectedAction[];
  message: string | null;
  read: 0 | 1;
  sentBy: string;
  confidenceScore: number | null;
  outcome: string | null;
}

export interface AlertsDto {
  items: AlertItem[];
  count: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  items: AlertItem[];
  count: number;
  fetchedAt: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// fetchAlertsData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that — same pattern
//  as fetchIntelData in dashboard.intel.tsx)
// ---------------------------------------------------------------------------

function parseAlertsDto(raw: unknown): AlertsDto {
  if (raw === null) {
    return { items: [], count: 0, fetchedAt: new Date().toISOString() };
  }
  if (typeof raw !== "object" || !("items" in raw)) {
    throw new Error("Unexpected response shape from /api/alerts");
  }
  const dto = raw as AlertsDto;
  const items = Array.isArray(dto.items) ? dto.items : [];
  return {
    items,
    count: typeof dto.count === "number" ? dto.count : items.length,
    fetchedAt: typeof dto.fetchedAt === "string" ? dto.fetchedAt : new Date().toISOString(),
  };
}

export async function fetchAlertsData(
  origin: string,
  params?: { limit?: number; severity?: AlertSeverity }
): Promise<LoaderData> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) {
    qs.set("limit", String(params.limit));
  }
  if (params?.severity !== undefined) {
    qs.set("severity", params.severity);
  }
  const qsStr = qs.toString();
  const url = `${origin}/api/alerts${qsStr ? `?${qsStr}` : ""}`;

  const { data, error } = await safeFetch<AlertsDto>(url, parseAlertsDto, {
    label: "dashboard.alerts",
  });
  return { items: data.items, count: data.count, fetchedAt: data.fetchedAt, error };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchAlertsData(origin, { limit: 100 });

  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Per-severity colour helpers
// ---------------------------------------------------------------------------

type SeverityColour = {
  chip: string;       // summary chip bg + text
  badge: string;      // inline severity badge
  row: string;        // table row left-border accent
};

function severityColours(severity: AlertSeverity): SeverityColour {
  switch (severity) {
    case "critical":
      return {
        chip: "bg-red-900 text-red-300 border border-red-700",
        badge: "bg-red-900 text-red-300 border border-red-700",
        row: "border-l-2 border-red-700",
      };
    case "high":
      return {
        chip: "bg-orange-900 text-orange-300 border border-orange-700",
        badge: "bg-orange-900 text-orange-300 border border-orange-700",
        row: "border-l-2 border-orange-700",
      };
    case "medium":
      return {
        chip: "bg-yellow-900 text-yellow-300 border border-yellow-700",
        badge: "bg-yellow-900 text-yellow-300 border border-yellow-700",
        row: "border-l-2 border-yellow-700",
      };
    case "low":
      return {
        chip: "bg-slate-700 text-slate-300 border border-slate-600",
        badge: "bg-slate-700 text-slate-300 border border-slate-600",
        row: "border-l-2 border-slate-600",
      };
  }
}

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Nghiêm trọng",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};

// ---------------------------------------------------------------------------
// Helper: relative time ago in Vietnamese
// ---------------------------------------------------------------------------

function timeAgo(isoStr: string): string {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s trước`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  } catch {
    return isoStr;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { badge } = severityColours(severity);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function SeverityChip({
  severity,
  count,
}: {
  severity: AlertSeverity;
  count: number;
}) {
  const { chip } = severityColours(severity);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${chip}`}
    >
      <span className="font-bold text-sm">{count}</span>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Signal type → Vietnamese display label (analyst-friendly)
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_LABEL: Record<string, string> = {
  price_surge: "Giá tăng mạnh",
  price_drop: "Giá giảm mạnh",
  volume_spike: "Khối lượng đột biến",
  volume_drop: "Khối lượng sụt giảm",
  news_mention: "Tin tức",
  circuit_breaker: "Ngắt mạch",
  foreign_net_sell: "Khối ngoại bán ròng",
  foreign_net_buy: "Khối ngoại mua ròng",
  earnings_beat: "Vượt kỳ vọng lợi nhuận",
  earnings_miss: "Dưới kỳ vọng lợi nhuận",
};

/** Map a raw signal type string to a Vietnamese label. Falls back to raw type. */
export function signalTypeLabel(type: string): string {
  if (!type) return "—";
  return SIGNAL_TYPE_LABEL[type.toLowerCase()] ?? type;
}

// ---------------------------------------------------------------------------
// Signal severity → chip colour classes (high→red, medium→yellow, low→grey)
// ---------------------------------------------------------------------------

function signalChipColour(severity: string): string {
  switch ((severity ?? "").toLowerCase()) {
    case "high":
    case "critical":
      return "border-red-700 bg-red-950 text-red-300";
    case "medium":
      return "border-yellow-700 bg-yellow-950 text-yellow-300";
    case "low":
    default:
      return "border-slate-600 bg-slate-700 text-slate-300";
  }
}

/**
 * SignalChip — renders a single Signal object as a tagged chip.
 * Shows: type label (prominent), confidence %, message in title tooltip.
 * Safe against missing/empty fields — never throws.
 */
function SignalChip({ signal }: { signal: Signal }) {
  const rawType = typeof signal?.type === "string" ? signal.type : "";
  // Skip rendering if type is completely empty
  if (!rawType) return null;

  const label = signalTypeLabel(rawType);
  const colourClass = signalChipColour(signal?.severity ?? "");
  const hasConfidence =
    typeof signal?.confidence === "number" && !Number.isNaN(signal.confidence);
  const confidenceText = hasConfidence
    ? `${Math.round(signal.confidence * 100)}%`
    : null;
  const tooltip = typeof signal?.message === "string" && signal.message
    ? signal.message
    : undefined;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${colourClass}`}
      title={tooltip}
    >
      <span>{label}</span>
      {confidenceText && (
        <span className="font-normal opacity-70">{confidenceText}</span>
      )}
    </span>
  );
}

function TickerPill({
  code,
  impact,
}: {
  code: string;
  impact: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-blue-800 bg-blue-950 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
      {code}
      {impact && (
        <span className="font-normal text-blue-400 opacity-80">
          {impact}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary header — total + per-severity chips
// ---------------------------------------------------------------------------

function SummaryHeader({
  items,
  total,
}: {
  items: AlertItem[];
  total: number;
}) {
  const counts: Record<AlertSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const item of items) {
    if (item.severity in counts) {
      counts[item.severity]++;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold text-slate-200">
        {total} cảnh báo
      </span>
      <div className="flex flex-wrap gap-2">
        {(["critical", "high", "medium", "low"] as AlertSeverity[]).map(
          (sev) =>
            counts[sev] > 0 ? (
              <SeverityChip key={sev} severity={sev} count={counts[sev]} />
            ) : null
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertRow — one table row
// ---------------------------------------------------------------------------

function AlertRow({
  item,
  idx,
}: {
  item: AlertItem;
  idx: number;
}) {
  const { row } = severityColours(item.severity);
  const rowBg = idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850";

  return (
    <tr className={`border-b border-slate-700 last:border-0 ${rowBg} ${row}`}>
      {/* Time */}
      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
        <ClientTimestamp
          iso={item.triggeredAt}
          className="text-slate-400"
        />
        <div className="mt-0.5 text-slate-600">{timeAgo(item.triggeredAt)}</div>
      </td>

      {/* Severity */}
      <td className="px-3 py-2">
        <SeverityBadge severity={item.severity} />
      </td>

      {/* Signals — object chips (type + confidence + message tooltip) */}
      <td className="px-3 py-2">
        {Array.isArray(item.signals) && item.signals.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.signals.map((sig, i) => (
              <SignalChip key={i} signal={sig} />
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Affected tickers */}
      <td className="px-3 py-2">
        {item.affectedActions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.affectedActions.map((action, i) => (
              <TickerPill
                key={i}
                code={action.code}
                impact={action.expectedImpact}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Message */}
      <td className="px-3 py-2 max-w-xs">
        {item.message ? (
          <p className="text-xs text-slate-200 leading-relaxed">
            {item.message}
          </p>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Confidence */}
      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
        {item.confidenceScore !== null && item.confidenceScore !== undefined
          ? `${Math.round(item.confidenceScore * 100)}%`
          : "—"}
      </td>

      {/* Outcome */}
      <td className="px-3 py-2 max-w-xs">
        {item.outcome ? (
          <p className="text-xs text-slate-400 leading-relaxed">
            {item.outcome}
          </p>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Severity filter control
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: Array<{ value: AlertSeverity | "all"; label: string }> =
  [
    { value: "all", label: "Tất cả" },
    { value: "critical", label: "Nghiêm trọng" },
    { value: "high", label: "Cao" },
    { value: "medium", label: "Trung bình" },
    { value: "low", label: "Thấp" },
  ];

function SeverityFilter({
  active,
  onChange,
}: {
  active: AlertSeverity | "all";
  onChange: (v: AlertSeverity | "all") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc theo mức độ">
      {FILTER_OPTIONS.map(({ value, label }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={[
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-slate-200 text-slate-900"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-slate-100",
            ].join(" ")}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  const { items, count, fetchedAt, error } = useLoaderData<typeof loader>();
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">(
    "all"
  );

  // Sort newest-first (defensive: items may already be sorted, but guarantee it)
  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
  );

  const filtered =
    severityFilter === "all"
      ? sorted
      : sorted.filter((item) => item.severity === severityFilter);

  const isEmpty = !error && items.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Cảnh Báo Thị Trường"
        subtitle="Tín hiệu rủi ro và cảnh báo từ hệ thống giám sát AI — phân tích mức độ và hành động đề xuất"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} cảnh báo
              </span>
            )}
            <ClientTimestamp iso={fetchedAt} />
          </span>
        }
      />

      {/* Error banner — shown on upstream error */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải cảnh báo — {error}
        </div>
      )}

      {/* Empty state — no data, not an error */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có cảnh báo nào — thị trường đang bình thường.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống giám sát đang hoạt động bình thường. Không có tín hiệu bất thường.
          </p>
        </div>
      )}

      {/* Summary + filter (only when we have data) */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SummaryHeader items={items} total={count} />
          <SeverityFilter
            active={severityFilter}
            onChange={setSeverityFilter}
          />
        </div>
      )}

      {/* Alerts table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900 text-left">
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Thời gian
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Mức độ
                </th>
                <th className="px-3 py-2 font-medium text-slate-400">
                  Tín hiệu
                </th>
                <th className="px-3 py-2 font-medium text-slate-400">
                  Mã / Tác động
                </th>
                <th className="px-3 py-2 font-medium text-slate-400">
                  Thông điệp
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Độ tin cậy
                </th>
                <th className="px-3 py-2 font-medium text-slate-400">
                  Kết quả
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <AlertRow key={item.id} item={item} idx={idx} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filter yielded zero results but items exist */}
      {!isEmpty && !error && filtered.length === 0 && items.length > 0 && (
        <div className="rounded border border-slate-700 bg-slate-800 px-4 py-6 text-center">
          <p className="text-sm text-slate-500">
            Không có cảnh báo nào ở mức "{SEVERITY_LABEL[severityFilter as AlertSeverity]}".
          </p>
        </div>
      )}
    </div>
  );
}
