import { formatCompact, formatMoney } from "@/lib/format";

interface Props {
  sumInsured: string;
  approved: string;
  pending: string;
  remaining: string;
  /** Show the legend with amounts under the bar. */
  legend?: boolean;
  compact?: boolean;
  /** Amount to draw as "being released" after the other segments (reject preview). */
  releasing?: string;
}

/**
 * Sum-insured meter: approved claims (solid), submitted claims blocking SI (hatched), and
 * remaining claimable SI (track). Widths are proportional to the policy's SI.
 */
export default function SIMeter({ sumInsured, approved, pending, remaining, legend = true, compact, releasing }: Props) {
  const si = Number(sumInsured) || 1;
  const pct = (v: string | number) => `${Math.max(0, Math.min(100, (Number(v) / si) * 100))}%`;
  return (
    <div className={`meter${compact ? " meter-sm" : ""}`}>
      <div
        className="meter-bar"
        role="img"
        aria-label={`${formatMoney(remaining)} of ${formatMoney(sumInsured)} still claimable; ${formatMoney(approved)} approved, ${formatMoney(pending)} pending`}
      >
        <span className="approved" style={{ width: pct(approved) }} />
        <span className="pending" style={{ width: pct(pending) }} />
        {releasing && <span className="preview-release" style={{ width: pct(releasing) }} />}
      </div>
      {legend && (
        <div className="meter-legend">
          <span>
            <i className="approved" /> Approved <b>{formatCompact(approved)}</b>
          </span>
          <span>
            <i className="pending" /> Pending <b>{formatCompact(pending)}</b>
          </span>
          <span>
            <i className="free" /> Claimable <b>{formatCompact(remaining)}</b>
          </span>
        </div>
      )}
    </div>
  );
}
