/**
 * StageCard — renders a single BCTC eval stage as a collapsible Card.
 * Card header: "Stage N — STAGE_NAME" + StatusBadge.
 * Card body (Collapsible): metrics table + gate_failures list + golden_diff.
 * No hardcoded thresholds. All data comes from the EvalStage domain object.
 */
import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "~/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "~/components/ui/collapsible";
import { StatusBadge } from "~/components/bctc-eval/StatusBadge";
import { ChevronDown } from "lucide-react";
import type { EvalStage } from "~/domain/bctc-eval";

interface StageCardProps {
  stage: EvalStage;
}

function MetricsTable({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return <p className="text-xs text-slate-400">No metrics.</p>;
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([key, val]) => (
          <tr key={key} className="border-b border-slate-700">
            <td className="py-1 pr-4 font-mono text-slate-400">{key}</td>
            <td className="py-1 text-slate-200">
              {Array.isArray(val) ? val.join(", ") : String(val)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GateFailureList({ failures }: { failures: EvalStage["gate_failures"] }) {
  if (failures.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-red-400">Gate failures</p>
      <ul className="space-y-1">
        {failures.map((f) => (
          <li key={f.gate_id} className="text-xs text-red-300">
            <span className="font-mono">{f.gate_id}</span>
            {" — threshold: "}{f.threshold}
            {" — actual: "}{f.actual}
            {" — provenance: "}{f.provenance}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoldenDiff({ diff }: { diff: Record<string, unknown> }) {
  if (Object.keys(diff).length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-slate-400">Golden diff</p>
      <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-300">
        {JSON.stringify(diff, null, 2)}
      </pre>
    </div>
  );
}

export function StageCard({ stage }: StageCardProps) {
  const [open, setOpen] = React.useState(false);
  const title = `Stage ${stage.stage_no} — ${stage.stage_name}`;

  return (
    <Card className="border-slate-700 bg-slate-800">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <StatusBadge status={stage.status} showIcon={false} />
              {title}
            </CardTitle>
            <CollapsibleTrigger className="ml-4 rounded p-1 text-slate-400 hover:bg-slate-700">
              <ChevronDown
                size={16}
                className={open ? "rotate-180 transition-transform" : "transition-transform"}
              />
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pb-4 pt-0">
            <MetricsTable metrics={stage.metrics} />
            <GateFailureList failures={stage.gate_failures} />
            <GoldenDiff diff={stage.golden_diff} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
