/**
 * StatusBadge — renders an EvalStatus value (green/yellow/red) as a
 * shadcn Badge with appropriate variant and optional lucide icon.
 * No hardcoded thresholds — status comes from server response only.
 */
import * as React from "react";
import { Badge } from "~/components/ui/badge";
import { CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EvalStatus } from "~/domain/bctc-eval";

interface StatusBadgeProps {
  status: EvalStatus;
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
  const { variant, label, Icon, iconClass } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} className={className}>
      {showIcon && <Icon size={12} className={iconClass} />}
      {label}
    </Badge>
  );
}
