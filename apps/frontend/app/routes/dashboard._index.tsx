/**
 * /dashboard — Market Overview (Tổng Quan).
 *
 * Data source: GET /api/market-digest (frontend proxy → mcp-server :3000).
 * The proxy route is api.market-digest.tsx.
 *
 * Response shape:
 *   { items: [{ id:number, text:string, ts:string, type:string, from_agent:string }],
 *     count:number, fetchedAt:string }
 *
 * items[] may be empty — renders a friendly empty state, never an error.
 * Upstream 5xx → shows error banner, never throws.
 *
 * Renders CHEF synthesis dishes as readable cards:
 *   - Vietnamese prose text
 *   - from_agent badge
 *   - ts timestamp via ClientTimestamp
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { safeFetch } from "~/lib/api/fetchUtils";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Tổng Quan — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/market-digest DTO
// ---------------------------------------------------------------------------

interface DigestItem {
  id: number;
  text: string;
  ts: string;
  type: string;
  from_agent: string;
}

interface MarketDigestDto {
  items: DigestItem[];
  count: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

interface LoaderData {
  items: DigestItem[];
  count: number;
  fetchedAt: string;
  error: string | null;
}

function parseMarketDigestDto(raw: unknown): MarketDigestDto {
  if (raw === null) {
    return { items: [], count: 0, fetchedAt: new Date().toISOString() };
  }
  if (typeof raw !== "object" || !("items" in raw)) {
    throw new Error("Unexpected response shape from /api/market-digest");
  }
  const dto = raw as MarketDigestDto;
  const items = Array.isArray(dto.items) ? dto.items : [];
  return {
    items,
    count: typeof dto.count === "number" ? dto.count : items.length,
    fetchedAt: typeof dto.fetchedAt === "string" ? dto.fetchedAt : new Date().toISOString(),
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const fetchedAt = new Date().toISOString();

  // Derive frontend origin for server-side self-call (same pattern as dashboard.orchestration.tsx).
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const { data, error } = await safeFetch<MarketDigestDto>(
    `${origin}/api/market-digest`,
    parseMarketDigestDto,
    { label: "dashboard._index" },
  );

  const dto = data ?? parseMarketDigestDto(null);
  return json<LoaderData>({ items: dto.items, count: dto.count, fetchedAt, error });
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

/**
 * AgentBadge — small pill showing which agent produced this item.
 * Dark slate theme, monospace label.
 */
function AgentBadge({ agent }: { agent: string }) {
  return (
    <span className="inline-flex items-center rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300 uppercase tracking-wide">
      {agent}
    </span>
  );
}

/**
 * TypeBadge — small pill showing the item type (e.g. "synthesis", "news").
 */
function TypeBadge({ type }: { type: string }) {
  const colorClass =
    type === "synthesis"
      ? "border-blue-700 bg-blue-950 text-blue-300"
      : type === "news"
        ? "border-green-700 bg-green-950 text-green-300"
        : type === "signal"
          ? "border-yellow-700 bg-yellow-950 text-yellow-300"
          : "border-slate-600 bg-slate-800 text-slate-400";

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}
    >
      {type}
    </span>
  );
}

/**
 * DigestCard — one market-digest item rendered as a readable prose card.
 * Shows: text (Vietnamese prose), from_agent badge, type badge, timestamp.
 */
function DigestCard({ item }: { item: DigestItem }) {
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      {/* Header row: badges + timestamp */}
      <div className="flex flex-wrap items-center gap-2">
        <AgentBadge agent={item.from_agent} />
        <TypeBadge type={item.type} />
        <span className="ml-auto text-xs text-slate-500">
          <ClientTimestamp iso={item.ts} />
        </span>
      </div>

      {/* Main prose text */}
      <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
        {item.text}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MarketOverview() {
  const { items, count, fetchedAt, error } = useLoaderData<typeof loader>();

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Tổng Quan Thị Trường"
        subtitle="Bản tin tổng hợp từ CHEF — cập nhật tự động"
        actions={
          <span className="text-xs text-slate-500">
            <ClientTimestamp iso={fetchedAt} />
          </span>
        }
      />

      {/* Error banner — shown only on upstream error, not empty items */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải bản tin thị trường — {error}
        </div>
      )}

      {/* Item count subtitle (only when items present) */}
      {!error && count > 0 && (
        <p className="text-xs text-slate-500">{count} bản tin</p>
      )}

      {/* Main content: digest cards or empty state */}
      {!error && items.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">Chưa có bản tin</p>
          <p className="mt-1 text-xs text-slate-600">
            CHEF chưa tổng hợp bản tin nào. Vui lòng quay lại sau.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <DigestCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
