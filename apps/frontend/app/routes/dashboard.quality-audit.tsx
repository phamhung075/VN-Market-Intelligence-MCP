/**
 * /dashboard/quality-audit — Quality Audit dashboard.
 *
 * Data source: GET /api/quality-checklist (frontend server-side proxy → mcp-server :3000
 * → GET /api/quality-checklist endpoint).
 * The proxy route is api.quality-checklist.tsx, mirroring api.orchestration.tsx.
 *
 * Sections rendered:
 *   - Summary header: pass / warn / fail / info / needs_review / total counts
 *   - Capabilities: collapsible sections grouped by capability, each showing
 *     title, service, deploy_status badge, and a checks[] table with
 *     check_id, dimension, question, severity, status, and optional evidence.
 *
 * StatusBadge mapping:
 *   PASS        → green
 *   WARN        → yellow
 *   NEEDS_REVIEW → yellow
 *   FAIL        → red
 *   INFO        → grey (inline badge — not EvalStatus)
 *
 * Frontend reads over HTTP only — no direct disk read.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { safeFetch } from "~/lib/api/fetchUtils";
import { PageHeader } from "~/components/PageHeader";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "~/components/ui/collapsible";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "~/components/ui/card";

export const meta: MetaFunction = () => [
  { title: "Quality Audit — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/quality-checklist DTO shape
// ---------------------------------------------------------------------------

/** Closed enum for check-level status values. */
type CheckStatus = "PASS" | "WARN" | "FAIL" | "INFO" | "NEEDS_REVIEW";

/** Deploy status for a capability — open string from the upstream API. */
type DeployStatus = string;

interface AuditCheck {
  check_id: string;
  dimension: string;
  question: string;
  severity: string;
  status: CheckStatus;
  evidence?: string;
}

interface AuditCapability {
  capability_id: string;
  title: string;
  service: string;
  deploy_status: DeployStatus;
  checks: AuditCheck[];
}

interface AuditSummary {
  pass: number;
  warn: number;
  fail: number;
  info: number;
  needs_review: number;
  total: number;
}

interface QualityChecklist {
  summary: AuditSummary;
  capabilities: AuditCapability[];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

interface LoaderData {
  checklist: QualityChecklist | null;
  error: string | null;
  fetchedAt: string;
}

function parseQualityChecklistDto(raw: unknown): QualityChecklist {
  if (raw === null) {
    return {
      summary: { pass: 0, warn: 0, fail: 0, info: 0, needs_review: 0, total: 0 },
      capabilities: [],
    };
  }
  if (typeof raw !== "object") {
    throw new Error("Unexpected response shape from /api/quality-checklist");
  }
  return raw as QualityChecklist;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const fetchedAt = new Date().toISOString();

  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const { data, error } = await safeFetch<QualityChecklist>(
    `${origin}/api/quality-checklist`,
    parseQualityChecklistDto,
    { label: "dashboard.quality-audit" },
  );

  return json<LoaderData>({ checklist: data ?? null, error, fetchedAt });
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

/** Inline badge for check-level status (PASS/WARN/FAIL/INFO/NEEDS_REVIEW). */
function CheckStatusBadge({ status }: { status: CheckStatus }) {
  let classes: string;
  switch (status) {
    case "PASS":
      classes =
        "border-green-700 bg-green-900 text-green-300";
      break;
    case "WARN":
    case "NEEDS_REVIEW":
      classes =
        "border-yellow-700 bg-yellow-900 text-yellow-300";
      break;
    case "FAIL":
      classes =
        "border-red-700 bg-red-900 text-red-300";
      break;
    case "INFO":
    default:
      classes =
        "border-slate-600 bg-slate-700 text-slate-400";
      break;
  }
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${classes}`}
    >
      {status}
    </span>
  );
}

/** Badge for capability deploy_status. Blue for DEPLOYED, grey for any other value. */
function DeployStatusBadge({ status }: { status: DeployStatus }) {
  const isDeployed = status === "DEPLOYED";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
        isDeployed
          ? "border-blue-700 bg-blue-900 text-blue-300"
          : "border-slate-600 bg-slate-700 text-slate-500"
      }`}
    >
      {status}
    </span>
  );
}

/** Summary counter card. */
function SummaryCount({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="rounded border border-slate-700 bg-slate-800 px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}

/** Checks table for a single capability. */
function ChecksTable({ checks }: { checks: AuditCheck[] }) {
  if (checks.length === 0) {
    return (
      <p className="text-xs text-slate-500 italic">No checks for this capability.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-900">
            <th className="px-3 py-2 text-left font-medium text-slate-400">
              Check ID
            </th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">
              Dimension
            </th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">
              Question
            </th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">
              Severity
            </th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">
              Status
            </th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">
              Evidence
            </th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check, idx) => (
            <tr
              key={check.check_id}
              className={`border-b border-slate-700 last:border-0 ${
                idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850"
              }`}
            >
              <td className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">
                {check.check_id}
              </td>
              <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                {check.dimension}
              </td>
              <td className="px-3 py-2 text-slate-200 max-w-xs">
                {check.question}
              </td>
              <td className="px-3 py-2 text-slate-400 whitespace-nowrap uppercase">
                {check.severity}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <CheckStatusBadge status={check.status} />
              </td>
              <td className="px-3 py-2 text-slate-500 max-w-xs">
                {check.evidence ?? <span className="italic">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Single collapsible capability section. */
function CapabilitySection({ cap }: { cap: AuditCapability }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader className="px-4 py-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-inset rounded"
              aria-expanded={open}
            >
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-200">
                  {cap.title}
                </CardTitle>
                <span className="text-xs text-slate-500">{cap.service}</span>
                <DeployStatusBadge status={cap.deploy_status} />
                <span className="text-xs text-slate-600">
                  {cap.checks.length} check{cap.checks.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span
                aria-hidden="true"
                className={`flex-shrink-0 text-slate-500 transition-transform duration-200 ${
                  open ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0">
            <ChecksTable checks={cap.checks} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QualityAuditDashboard() {
  const { checklist, error } = useLoaderData<typeof loader>();

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Quality Audit"
        subtitle="Capability-level checklist from GET /api/quality-checklist"
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Could not load quality checklist — {error}
        </div>
      )}

      {checklist ? (
        <div className="space-y-6">
          {/* Summary header */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Summary
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              <SummaryCount
                label="Pass"
                value={checklist.summary.pass}
                colorClass="text-green-400"
              />
              <SummaryCount
                label="Warn"
                value={checklist.summary.warn}
                colorClass="text-yellow-400"
              />
              <SummaryCount
                label="Fail"
                value={checklist.summary.fail}
                colorClass="text-red-400"
              />
              <SummaryCount
                label="Info"
                value={checklist.summary.info}
                colorClass="text-slate-400"
              />
              <SummaryCount
                label="Needs Review"
                value={checklist.summary.needs_review}
                colorClass="text-yellow-400"
              />
              <SummaryCount
                label="Total"
                value={checklist.summary.total}
                colorClass="text-slate-200"
              />
            </div>
          </section>

          {/* Capabilities */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Capabilities ({checklist.capabilities.length})
            </h2>
            <div className="space-y-3">
              {checklist.capabilities.map((cap) => (
                <CapabilitySection key={cap.capability_id} cap={cap} />
              ))}
            </div>
          </section>
        </div>
      ) : (
        !error && (
          <div className="rounded border border-slate-700 bg-slate-800 px-4 py-8 text-center text-sm text-slate-500">
            No quality checklist data available.
          </div>
        )
      )}
    </div>
  );
}
