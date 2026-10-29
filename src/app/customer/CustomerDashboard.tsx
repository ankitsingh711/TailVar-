"use client";

import { useCallback, useState } from "react";
import { CalendarDays, FilePlus2, FileText, Hourglass, Inbox, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { coverageDays, coverageState, formatCompact, formatDate, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import type { ClaimDto, PolicyDto } from "@/lib/types";
import { CoverageBadge, StatusBadge } from "@/components/ui/StatusBadge";
import SIMeter from "@/components/ui/SIMeter";
import { EmptyState, Skeleton, Stat } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import NewClaimDialog from "./NewClaimDialog";

const sum = (xs: string[]) => xs.reduce((a, x) => a + Number(x), 0);

export default function CustomerDashboard({ displayName }: { displayName: string }) {
  const toast = useToast();
  const [policies, setPolicies] = useState<PolicyDto[] | null>(null);
  const [claims, setClaims] = useState<ClaimDto[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [claimFor, setClaimFor] = useState<number | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [p, c] = await Promise.all([
        api<{ policies: PolicyDto[] }>("/api/policies"),
        api<{ claims: ClaimDto[] }>("/api/claims"),
      ]);
      setPolicies(p.policies);
      setClaims(c.claims);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [toast]);
  useAutoRefresh(load);

  const loading = policies === null || claims === null;
  const inReview = (claims ?? []).filter((c) => c.status === "Submitted");
  const canClaim = (policies ?? []).some((p) => Number(p.remainingSumInsured) > 0);

  function openClaim(policyId: number | null) {
    setClaimFor(policyId);
    setClaimOpen(true);
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Customer portal</span>
          <h1>Welcome back, {displayName}</h1>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={load} aria-label="Refresh data" title="Refresh">
            <RefreshCw size={16} className={refreshing ? "spin" : undefined} />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openClaim(null)} disabled={!canClaim}>
            <FilePlus2 size={17} />
            File a claim
          </button>
        </div>
      </div>

      <section className="stats" aria-label="Summary">
        <Stat
          icon={ShieldCheck}
          label="Total cover"
          value={loading ? "–" : formatCompact(sum(policies.map((p) => p.sumInsured)))}
          sub={loading ? " " : `${policies.length} polic${policies.length === 1 ? "y" : "ies"}`}
        />
        <Stat
          icon={Wallet}
          label="Claimable now"
          value={loading ? "–" : formatCompact(sum(policies.map((p) => p.remainingSumInsured)))}
          sub="After pending and approved claims"
        />
        <Stat
          icon={Hourglass}
          label="Claims in review"
          value={loading ? "–" : inReview.length}
          sub={loading ? " " : inReview.length ? `${formatMoney(sum(inReview.map((c) => c.amount)))} awaiting a decision` : "Nothing pending"}
          attention={inReview.length > 0}
        />
      </section>

      <section className="form-stack" aria-labelledby="policies-heading">
        <h2 id="policies-heading">Your policies</h2>
        {loading ? (
          <div className="panel">
            <Skeleton rows={4} />
          </div>
        ) : policies.length === 0 ? (
          <div className="panel">
            <EmptyState icon={FileText} title="No policies yet">
              Policies are issued by the administrator. Once one is issued to you it will appear here.
            </EmptyState>
          </div>
        ) : (
          <div className="policy-grid">
            {policies.map((p) => {
              const state = coverageState(p.startDate, p.endDate);
              const empty = Number(p.remainingSumInsured) <= 0;
              return (
                <article key={p.id} className="policy-card" aria-label={`Policy ${p.reference}`}>
                  <div className="policy-card-head">
                    <div>
                      <span className="mono">{p.reference}</span>
                      <div className="policy-term">
                        <CalendarDays size={13} aria-hidden="true" />
                        {formatDate(p.startDate)} – {formatDate(p.endDate)} · {coverageDays(p.startDate, p.endDate)} days
                      </div>
                    </div>
                    <CoverageBadge state={state} />
                  </div>
                  <div className="policy-figure">
                    <span className="label">Claimable</span>
                    <span className="value" data-testid="policy-remaining">
                      {formatMoney(p.remainingSumInsured)}
                    </span>
                    <span className="of">of {formatMoney(p.sumInsured)} sum insured</span>
                  </div>
                  <SIMeter sumInsured={p.sumInsured} approved={p.approvedAmount} pending={p.pendingAmount} remaining={p.remainingSumInsured} />
                  <div className="policy-card-foot">
                    <span className="muted" style={{ fontSize: "0.8125rem" }}>
                      {p.claimCount ? `${p.claimCount} claim${p.claimCount === 1 ? "" : "s"} filed` : "No claims filed"}
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={empty} onClick={() => openClaim(p.id)}>
                      <FilePlus2 size={14} />
                      {empty ? "Fully claimed" : "Claim on this policy"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="claims-heading">
        <div className="panel-head">
          <div className="panel-head-text">
            <h2 id="claims-heading">Your claims</h2>
            <p>Decisions appear here as soon as the administrator makes them.</p>
          </div>
        </div>
        {loading ? (
          <Skeleton rows={4} />
        ) : claims.length === 0 ? (
          <EmptyState icon={Inbox} title="No claims filed">
            {policies.length ? "Use File a claim to claim against one of your policies." : "You can file a claim once you have a policy."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Policy</th>
                  <th>Incident date</th>
                  <th className="right">Amount</th>
                  <th>Status</th>
                  <th className="right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Claim">
                      <span className="mono" style={{ color: "var(--ink)", fontSize: "0.8rem" }}>
                        {c.reference}
                      </span>
                    </td>
                    <td data-label="Policy">
                      <span className="mono">{c.policyReference}</span>
                    </td>
                    <td data-label="Incident date" className="nowrap">
                      {formatDate(c.incidentDate)}
                    </td>
                    <td data-label="Amount" className="right amount">
                      {formatMoney(c.amount)}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={c.status} />
                    </td>
                    <td data-label="Updated" className="right">
                      <span className="decided" title={formatDateTime(c.decidedAt ?? c.submittedAt)}>
                        {c.decidedAt ? `Decided ${formatRelative(c.decidedAt)}` : `Submitted ${formatRelative(c.submittedAt)}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NewClaimDialog
        open={claimOpen}
        policies={policies ?? []}
        initialPolicyId={claimFor}
        onClose={() => setClaimOpen(false)}
        onSubmitted={(c) => {
          setClaimOpen(false);
          toast("success", `${c.reference} submitted for ${formatMoney(c.amount)} on ${c.policyReference}.`);
          load();
        }}
      />
    </>
  );
}
