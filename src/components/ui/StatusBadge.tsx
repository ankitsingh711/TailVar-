import { CircleCheck, CircleX, Hourglass } from "lucide-react";
import type { ClaimStatus } from "@/lib/types";
import type { CoverageState } from "@/lib/format";

const CLAIM_ICON = { Submitted: Hourglass, Approved: CircleCheck, Rejected: CircleX } as const;
const CLAIM_LABEL = { Submitted: "Submitted", Approved: "Approved", Rejected: "Rejected" } as const;

export function StatusBadge({ status }: { status: ClaimStatus }) {
  const Icon = CLAIM_ICON[status];
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {CLAIM_LABEL[status]}
    </span>
  );
}

const COVERAGE_LABEL: Record<CoverageState, string> = { active: "In force", upcoming: "Starts soon", expired: "Expired" };

export function CoverageBadge({ state }: { state: CoverageState }) {
  return (
    <span className={`badge badge-${state}`}>
      <span className="dot" aria-hidden="true" />
      {COVERAGE_LABEL[state]}
    </span>
  );
}
