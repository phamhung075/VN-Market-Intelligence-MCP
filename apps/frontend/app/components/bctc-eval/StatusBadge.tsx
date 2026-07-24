/**
 * StatusBadge — renders an EvalStatus value (green/yellow/red) as a
 * shadcn Badge with appropriate variant and optional lucide icon.
 * No hardcoded thresholds — status comes from server response only.
 *
 * status is OPTIONAL: a stage that has not been computed yet is absent from
 * the server's stage_statuses object (see domain/bctc-eval.ts StageStatuses).
 * Missing/unrecognized status renders a neutral "—" badge instead of
 * crashing — this is a shared component, so it must degrade gracefully
 * for ANY caller, not just the ones known today.
 */
import * as React from "react";
import { Badge } from "~/components/ui/badge";
import { CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EvalStatus } from "~/domain/bctc-eval";

interface StatusBadgeProps {
  status: EvalStatus | undefined;
  showIcon?: boolean;
  className?: string;
}

interface StatusConfig {
  variant: "default" | "outline" | "destructive";
  label: string;
  Icon: LucideIcon;
  iconClass: string;
}

const STATUS_CONFIG: Record<EvalStatus, StatusConfig> = {
  green: {
    variant: "default",
    label: "Green",
    Icon: CheckCircle,
    iconClass: "text-green-400",
  },
  yellow: {
    variant: "outline",
    label: "Yellow",
    Icon: AlertTriangle,
    iconClass: "text-yellow-400",
  },
  red: {
    variant: "destructive",
    label: "Red",
    Icon: AlertCircle,
    iconClass: "text-red-400",
  },
};

export function StatusBadge({ status, showIcon = true, className }: StatusBadgeProps) {
  const config = status !== undefined ? STATUS_CONFIG[status] : undefined;
  if (!config) {
    return (
      <Badge variant="outline" className={className}>
        <span className="text-slate-500">—</span>
      </Badge>
    );
  }
  const { variant, label, Icon, iconClass } = config;
  return (
    <Badge variant={variant} className={className}>
      {showIcon && <Icon size={12} className={iconClass} />}
      {label}
    </Badge>
  );
}
