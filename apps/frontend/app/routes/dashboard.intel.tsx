/**
 * /dashboard/intel — Bản Tin AI / CHEF Bulletin Hub.
 *
 * Data source: GET /api/market-digest (frontend proxy → mcp-server :3000).
 * The proxy route is api.market-digest.tsx (already live — not created here).
 *
 * Response shape:
 *   { items: [ { id: number, text: string, ts: string, type: string,
 *                from_agent: string } ],
 *     count: number, fetchedAt: string }
 *
 * items[] are AI-synthesized Vietnamese market bulletins (CHEF dishes) —
 * full prose with newlines + emoji. Rendered with whitespace-pre-wrap.
 * Most recent item is displayed prominently at top; older items below.
 *
 * Honest states:
 *   - items empty (count 0) → friendly empty state, never an error.
 *   - Upstream 5xx / network failure → error banner, never throws.
 *   - Unexpected JSON shape → error banner, never throws.
 *
 * Labels: plain Vietnamese — non-technical user.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";
import { safeFetch } from "~/lib/api/fetchUtils";

export const meta: MetaFunction = () => [
  { title: "Bản Tin AI — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/market-digest DTO
// ---------------------------------------------------------------------------

interface MarketDigestItem {
  id: number;
  text: string;
  ts: string;
  type: string;
  from_agent: string;
}

interface MarketDigestDto {
  items: MarketDigestItem[];
  count: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export interface LoaderData {
  items: MarketDigestItem[];
  count: number;
  fetchedAt: string;
  error: string | null;
}

function parseMarketDigest(raw: unknown): MarketDigestDto {
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

/**
 * Core fetch-and-parse logic — exported for unit testing.
 * Pure async function, no Remix dependency, no JSON wrapping.
 * Bounded by FETCH_DEADLINE_MS (55s); non-fatal on any error.
 */
export async function fetchIntelData(
  origin: string
): Promise<LoaderData> {
  const url = `${origin}/api/market-digest`;
  const { data, error } = await safeFetch<MarketDigestDto>(url, parseMarketDigest, {
    label: "dashboard.intel",
  });
  return { items: data.items, count: data.count, fetchedAt: data.fetchedAt, error };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchIntelData(origin);

  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// DishCard — one CHEF dish bulletin
// ---------------------------------------------------------------------------

function DishCard({
  item,
  prominent,
}: {
  item: MarketDigestItem;
  prominent?: boolean;
}) {
  return (
    <article
      className={[
        "rounded-lg border bg-slate-800 p-5 space-y-3",
        prominent ? "border-blue-700" : "border-slate-700",
      ].join(" ")}
    >
      {/* Header row: timestamp + agent badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {item.ts ? <ClientTimestamp iso={item.ts} /> : null}
        </div>
        {item.from_agent ? (
          <span className="inline-flex items-center rounded border border-slate-600 bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-400">
            {item.from_agent}
          </span>
        ) : null}
      </div>

      {/* Bulletin body — whitespace-pre-wrap preserves newlines + emoji */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
        {item.text}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntelPage() {
  const { items, count, fetchedAt, error } = useLoaderData<typeof loader>();

  const latestItem = items.length > 0 ? items[0] : null;
  const olderItems = items.length > 1 ? items.slice(1) : [];

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Bản Tin AI — CHEF Bulletin Hub"
        subtitle="Bản tin thị trường tổng hợp từ AI agent — phân tích, nhận định và cảnh báo"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3">{count} bản tin</span>
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
          Không thể tải bản tin AI — {error}
        </div>
      )}

      {/* Empty state — count 0, not an error */}
      {!error && items.length === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có bản tin AI
          </p>
          <p className="mt-1 text-xs text-slate-600">
            AI agent chưa tạo bản tin nào. Vui lòng quay lại sau.
          </p>
        </div>
      )}

      {/* Latest dish — prominent at top */}
      {latestItem && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Bản tin mới nhất
          </h2>
          <DishCard item={latestItem} prominent />
        </section>
      )}

      {/* Older dishes — below */}
      {olderItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Bản tin trước đó ({olderItems.length})
          </h2>
          <div className="space-y-4">
            {olderItems.map((item) => (
              <DishCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
