/**
 * /dashboard/kinh-dich-reference — Tra cứu Kinh Dịch (64 quẻ, toàn bộ chi tiết tiếng Việt).
 *
 * Nguồn dữ liệu: import tĩnh QUE_DETAIL từ que-descriptions-detail.generated.ts.
 * KHÔNG gọi API — toàn bộ 64 quẻ được nhúng vào bundle tại build-time.
 * Tìm kiếm/lọc hoàn toàn ở client-side: theo số quẻ, tên quẻ (romanized), hoặc chữ Hán.
 *
 * DDD layer: Remix interface layer — route file thuần UI, không có use-case layer riêng.
 * QUE_DETAIL được import trực tiếp vào component (không qua loader — D4 trong design brief).
 *
 * Anchors: mỗi thẻ quẻ có id="que-{id}" để deep-link từ QueName (subtask 2).
 *
 * Named exports (exported for unit tests):
 *   actionLabel, outcomeLabel, trendBadgeClass, filterQues
 *
 * Decision journal (DJ-GATE-1, QUE-REFERENCE-PAGE-1b):
 *   Static import chosen (D4) — zero latency, SSR-safe, no proxy route needed.
 *   Named helper pattern mirrors dashboard.kinh-dich-signals.tsx precedent.
 *   trendBadgeClass keyed on raw marketTrendLabel substring (THUẬN LỢI / BẤT LỢI / TRUNG TÍNH).
 *   Client-side filter — 64 items, negligible perf, no debounce required.
 */
import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import { PageHeader } from "~/components/PageHeader";
import { QUE_DETAIL } from "~/lib/que-descriptions-detail.generated";
import type { QueDetailDescription } from "~/lib/que-descriptions-detail.generated";

export const meta: MetaFunction = () => [
  { title: "Tra cứu Kinh Dịch — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Helper functions — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Ánh xạ mã hành động (GIU/TIEN/THAN/LUI/CHO/...) sang nhãn tiếng Việt thân thiện.
 */
export function actionLabel(action: string): string {
  switch (action) {
    case "GIU":
      return "Giữ vững";
    case "TIEN":
      return "Tiến";
    case "THAN":
      return "Thận trọng";
    case "LUI":
      return "Lui";
    case "CHO":
      return "Chờ";
    default:
      return action;
  }
}

/**
 * Ánh xạ mã kết quả (CAT/HUNG/LE/VO CUU/HOI) sang nhãn tiếng Việt thân thiện.
 */
export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "CAT":
      return "Tốt lành";
    case "HUNG":
      return "Xấu";
    case "LE":
      return "Vất vả nhưng thành công";
    case "VO CUU":
      return "Không lỗi";
    case "HOI":
      return "Hối tiếc";
    default:
      return outcome;
  }
}

/**
 * Trả về lớp Tailwind CSS cho badge xu hướng thị trường.
 * Dựa trên chuỗi marketTrendLabel chứa "THUẬN LỢI" / "BẤT LỢI" / "TRUNG TÍNH".
 */
export function trendBadgeClass(marketTrendLabel: string): string {
  const upper = marketTrendLabel.toUpperCase();
  if (upper.includes("THUẬN LỢI")) {
    return "bg-emerald-900 text-emerald-300 border border-emerald-700";
  }
  if (upper.includes("BẤT LỢI")) {
    return "bg-red-900 text-red-300 border border-red-700";
  }
  // TRUNG TÍNH or unknown
  return "bg-slate-700 text-slate-300 border border-slate-600";
}

/**
 * Lọc danh sách quẻ theo chuỗi tìm kiếm.
 * Khớp với: số quẻ (id), tên quẻ (romanized), chữ Hán.
 */
export function filterQues(
  ques: QueDetailDescription[],
  query: string
): QueDetailDescription[] {
  if (!query.trim()) return ques;
  const lower = query.toLowerCase().trim();
  return ques.filter((q) => {
    return (
      q.id.toString().includes(lower) ||
      q.name.toLowerCase().includes(lower) ||
      q.chinese.includes(query.trim())
    );
  });
}

// ---------------------------------------------------------------------------
// QueCard — hiển thị toàn bộ thông tin một quẻ
// ---------------------------------------------------------------------------

function QueCard({ que }: { que: QueDetailDescription }) {
  return (
    <div
      id={`que-${que.id}`}
      className="rounded-lg border border-slate-700 bg-slate-800 p-4 flex flex-col gap-3 scroll-mt-20"
    >
      {/* Tiêu đề quẻ */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-bold text-slate-100">
          <span className="text-slate-500 mr-1">#{que.id}</span>
          <span className="mr-2">{que.chinese}</span>
          <span>{que.name}</span>
        </h2>
        {/* Badge xu hướng thị trường */}
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${trendBadgeClass(que.marketTrendLabel)}`}
        >
          {que.marketTrendLabel}
        </span>
      </div>

      {/* Quái thượng / hạ */}
      <p className="text-sm text-slate-400">
        <span className="font-medium text-slate-300">Thượng quái:</span>{" "}
        {que.upper} ({que.upperElement})
        {" / "}
        <span className="font-medium text-slate-300">Hạ quái:</span>{" "}
        {que.lower} ({que.lowerElement})
      </p>

      {/* Ý nghĩa cốt lõi */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
          Ý nghĩa cốt lõi
        </p>
        <p className="text-sm text-slate-200">{que.coreMeaning}</p>
      </div>

      {/* Trạng thái hiện tại */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
          Trạng thái hiện tại
        </p>
        <p className="text-sm text-slate-300">{que.stateInterpretation}</p>
      </div>

      {/* Thuận */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-0.5">
          Thuận
        </p>
        <p className="text-sm text-slate-300">{que.favorable}</p>
      </div>

      {/* Cảnh báo */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-0.5">
          Cảnh báo
        </p>
        <p className="text-sm text-slate-300">{que.warning}</p>
      </div>

      {/* Bảng 6 hào */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
          Sáu hào
        </p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-1 pr-2 text-slate-500 font-medium w-12">Hào</th>
              <th className="text-left py-1 pr-2 text-slate-500 font-medium w-28">Hành động</th>
              <th className="text-left py-1 pr-2 text-slate-500 font-medium w-32">Kết quả</th>
              <th className="text-left py-1 text-slate-500 font-medium">Giải nghĩa</th>
            </tr>
          </thead>
          <tbody>
            {que.phases.map((p) => (
              <tr
                key={p.phase}
                className="border-b border-slate-700/50 last:border-0"
              >
                <td className="py-1 pr-2 text-slate-400 font-medium">{p.phase}</td>
                <td className="py-1 pr-2 text-slate-300">{actionLabel(p.action)}</td>
                <td className="py-1 pr-2 text-slate-300">{outcomeLabel(p.outcome)}</td>
                <td className="py-1 text-slate-400">{p.gloss}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route default export
// ---------------------------------------------------------------------------

// Tất cả 64 quẻ theo thứ tự số quẻ tăng dần
const ALL_QUES: QueDetailDescription[] = Object.values(QUE_DETAIL).sort(
  (a, b) => a.id - b.id
);

export default function KinhDichReferencePage() {
  const [query, setQuery] = useState("");

  const filtered = filterQues(ALL_QUES, query);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Tra cứu Kinh Dịch — 64 quẻ"
        subtitle={`Toàn bộ 64 quẻ Kinh Dịch với giải thích chi tiết bằng tiếng Việt`}
      />

      {/* Thanh tìm kiếm */}
      <div className="max-w-md">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên hoặc số quẻ..."
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          aria-label="Tìm kiếm quẻ Kinh Dịch"
        />
        {query.trim() && (
          <p className="mt-1 text-xs text-slate-500">
            Tìm thấy {filtered.length} quẻ
          </p>
        )}
      </div>

      {/* Lưới quẻ — responsive, mobile-first */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">
          Không tìm thấy quẻ nào phù hợp với &quot;{query}&quot;.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((que) => (
            <QueCard key={que.id} que={que} />
          ))}
        </div>
      )}
    </div>
  );
}
