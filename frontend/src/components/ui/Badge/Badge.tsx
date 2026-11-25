import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle,
  Clock,
  Info,
  MinusCircle,
  PaperPlaneTilt,
  PauseCircle,
  Pulse,
  Warning,
  WarningOctagon,
  XCircle,
} from "@phosphor-icons/react";
import styles from "./Badge.module.scss";

export type BadgeTone = "healthy" | "moderate" | "weak" | "critical" | "neutral" | "info" | "accent";

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  pulse?: boolean;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({
  tone = "neutral",
  icon,
  pulse = false,
  mono = false,
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        styles.badge,
        styles[tone],
        mono ? styles.mono : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {pulse && <span className={styles.pulseDot} aria-hidden="true" />}
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export function NeedLevelBadge({ level }: { level: string | null | undefined }) {
  const { t } = useTranslation();
  if (!level) {
    return (
      <Badge tone="neutral" icon={<MinusCircle size={14} weight="bold" />}>
        —
      </Badge>
    );
  }

  const label = t(`badges.need.${level}`, { defaultValue: level });

  switch (level) {
    case "Healthy":
      return (
        <Badge tone="healthy" icon={<CheckCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Moderate":
      return (
        <Badge tone="moderate" icon={<Warning size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Weak":
      return (
        <Badge tone="weak" icon={<WarningOctagon size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Critical":
      return (
        <Badge tone="critical" icon={<XCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={<MinusCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
  }
}

export function CheckResultBadge({ result }: { result: string }) {
  const { t } = useTranslation();
  const label = t(`badges.check.${result}`, { defaultValue: result });

  switch (result) {
    case "Pass":
      return (
        <Badge tone="healthy" icon={<CheckCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Warning":
      return (
        <Badge tone="moderate" icon={<Warning size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Fail":
      return (
        <Badge tone="critical" icon={<XCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={<MinusCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
  }
}

export function LeadStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`badges.leadStatus.${status}`, { defaultValue: status });

  switch (status) {
    case "Replied":
      return (
        <Badge tone="healthy" icon={<CheckCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Sent":
      return (
        <Badge tone="info" icon={<PaperPlaneTilt size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "DraftReady":
      return (
        <Badge tone="accent" icon={<Info size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Rejected":
      return (
        <Badge tone="critical" icon={<XCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={<Clock size={14} weight="bold" />}>
          {label}
        </Badge>
      );
  }
}

export function CampaignStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`badges.campaignStatus.${status}`, { defaultValue: status });

  switch (status) {
    case "Completed":
      return (
        <Badge tone="healthy" icon={<CheckCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Discovering":
    case "Auditing":
      return (
        <Badge tone="accent" pulse icon={<Pulse size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Paused":
      return (
        <Badge tone="moderate" icon={<PauseCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Failed":
    case "Cancelled":
      return (
        <Badge tone="critical" icon={<XCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={<Clock size={14} weight="bold" />}>
          {label}
        </Badge>
      );
  }
}

export function SiteStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`badges.siteStatus.${status}`, { defaultValue: status });

  switch (status) {
    case "Completed":
      return (
        <Badge tone="healthy" icon={<CheckCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Partial":
      return (
        <Badge tone="moderate" icon={<Warning size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Auditing":
      return (
        <Badge tone="accent" pulse icon={<Pulse size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    case "Failed":
    case "Unreachable":
      return (
        <Badge tone="critical" icon={<XCircle size={14} weight="bold" />}>
          {label}
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={<Clock size={14} weight="bold" />}>
          {label}
        </Badge>
      );
  }
}

export function ClaimStatusBadge({ status }: { status: "Verified" | "Unverified" | "Contradicts" }) {
  const { t } = useTranslation();
  const label = t(`badges.claimStatus.${status}`, { defaultValue: status });

  if (status === "Verified") {
    return (
      <Badge tone="healthy" icon={<CheckCircle size={14} weight="bold" />}>
        {label}
      </Badge>
    );
  }
  if (status === "Contradicts") {
    return (
      <Badge tone="critical" icon={<XCircle size={14} weight="bold" />}>
        {label}
      </Badge>
    );
  }
  return (
    <Badge tone="moderate" icon={<Warning size={14} weight="bold" />}>
      {label}
    </Badge>
  );
}
