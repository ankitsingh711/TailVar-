"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, FileText, Hourglass, Inbox, Landmark, Plus, RefreshCw, Search, ShieldCheck, Wallet, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import {
  coverageState,
  formatCompact,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  initials,
} from "@/lib/format";
import type { ClaimDto, ClaimStatus, CustomerDto, PolicyDto } from "@/lib/types";
import { CoverageBadge, StatusBadge } from "@/components/ui/StatusBadge";
import SIMeter from "@/components/ui/SIMeter";
import { EmptyState, Skeleton, Stat } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import NewPolicyDialog from "./NewPolicyDialog";
import DecisionDialog, { type Decision } from "./DecisionDialog";

type Tab = "claims" | "policies";
type StatusFilter = "All" | ClaimStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "Submitted", label: "Awaiting decision" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Rejected" },
  { value: "All", label: "All claims" },
];

const sum = (xs: string[]) => xs.reduce((a, x) => a + Number(x), 0);

export default function AdminDashboard() {
  const toast = useToast();
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [policies, setPolicies] = useState<PolicyDto[] | null>(null);
  const [claims, setClaims] = useState<ClaimDto[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("claims");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Submitted");
  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<number | "all">("all");
  const [newPolicyOpen, setNewPolicyOpen] = useState(false);
  const [pending, setPending] = useState<{ claim: ClaimDto; decision: Decision } | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c, p, cl] = await Promise.all([
        api<{ customers: CustomerDto[] }>("/api/customers"),
        api<{ policies: PolicyDto[] }>("/api/policies"),
        api<{ claims: ClaimDto[] }>("/api/claims"),
      ]);
      setCustomers(c.customers);
      setPolicies(p.policies);
      setClaims(cl.claims);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [toast]);
  useAutoRefresh(load);

  const policyById = useMemo(() => new Map((policies ?? []).map((p) => [p.id, p])), [policies]);
  const awaiting = (claims ?? []).filter((c) => c.status === "Submitted");
  const approved = (claims ?? []).filter((c) => c.status === "Approved");
  const counts = (claims ?? []).reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});

  const q = query.trim().toLowerCase();
  const matches = (...fields: string[]) => !q || fields.some((f) => f.toLowerCase().includes(q));
  const visibleClaims = (claims ?? []).filter(
    (c) =>
      (statusFilter === "All" || c.status === statusFilter) &&
      matches(c.reference, c.policyReference, c.customerName, c.customerUsername),
  );
  const visiblePolicies = (policies ?? []).filter(
    (p) => (customerFilter === "all" || p.customerId === customerFilter) && matches(p.reference, p.customerName, p.customerUsername),
  );

  const loading = policies === null || claims === null;

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Administrator console</span>
          <h1>Policies &amp; claims</h1>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-secondary btn-icon" onClick={load} aria-label="Refresh data" title="Refresh">
            <RefreshCw size={16} className={refreshing ? "spin" : undefined} />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setNewPolicyOpen(true)}>
            <Plus size={17} />
            New policy
          </button>
        </div>
      </div>

      <section className="stats" aria-label="Summary">
        <Stat
          icon={Hourglass}
          label="Awaiting decision"
          value={loading ? "–" : awaiting.length}
          sub={loading ? " " : awaiting.length ? `${formatMoney(sum(awaiting.map((c) => c.amount)))} blocked` : "Queue is clear"}
          attention={awaiting.length > 0}
        />
        <Stat
          icon={FileText}
          label="Policies issued"
          value={loading ? "–" : policies.length}
          sub={loading ? " " : `${formatCompact(sum(policies.map((p) => p.sumInsured)))} total sum insured`}
        />
        <Stat
          icon={Landmark}
          label="Approved claims"
          value={loading ? "–" : formatCompact(sum(approved.map((c) => c.amount)))}
          sub={loading ? " " : `${approved.length} claim${approved.length === 1 ? "" : "s"} approved`}
        />
        <Stat
          icon={Wallet}
          label="Claimable cover"
          value={loading ? "–" : formatCompact(sum(policies.map((p) => p.remainingSumInsured)))}
          sub={loading ? " " : `Across ${policies.length} polic${policies.length === 1 ? "y" : "ies"}`}
        />
      </section>

      <section className="panel">
        <div className="tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" className="tab" aria-selected={tab === "claims"} onClick={() => setTab("claims")}>
            Claims
            <span className={`count${awaiting.length ? " hot" : ""}`}>{awaiting.length}</span>
          </button>
          <button type="button" role="tab" className="tab" aria-selected={tab === "policies"} onClick={() => setTab("policies")}>
            Policies
            <span className="count">{policies?.length ?? 0}</span>
          </button>
        </div>

        <div className="toolbar">
          <div className="chips" role="group" aria-label={tab === "claims" ? "Filter by status" : "Filter by customer"}>
            {tab === "claims"
              ? STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className="chip"
                    aria-pressed={statusFilter === f.value}
                    onClick={() => setStatusFilter(f.value)}
                  >
                    {f.label}
                    <span className="num">{f.value === "All" ? (claims?.length ?? 0) : (counts[f.value] ?? 0)}</span>
                  </button>
                ))
              : [{ id: "all" as const, displayName: "All customers" }, ...customers].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip"
                    aria-pressed={customerFilter === c.id}
                    onClick={() => setCustomerFilter(c.id)}
                  >
                    {c.displayName}
                  </button>
                ))}
          </div>
          <label className="search">
            <Search size={15} />
            <span className="sr-only">Search</span>
            <input
              className="input"
              type="search"
              placeholder={tab === "claims" ? "Search claim, policy or customer" : "Search policy or customer"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <Skeleton rows={5} />
        ) : tab === "claims" ? (
          visibleClaims.length === 0 ? (
            <EmptyState icon={statusFilter === "Submitted" && !q ? ShieldCheck : Inbox} title={emptyClaimsTitle(statusFilter, q)}>
              {statusFilter === "Submitted" && !q
                ? "New claims from customers will appear here for approval or rejection."
                : "Try a different filter or search term."}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table stack">
                <thead>
                  <tr>
                    <th>Claim</th>
                    <th>Customer</th>
                    <th>Policy</th>
                    <th>Incident date</th>
                    <th className="right">Amount</th>
                    <th>Status</th>
                    <th className="right">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClaims.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Claim">
                        <div className="who-text">
                          <span className="mono" style={{ color: "var(--ink)", fontSize: "0.8rem" }}>
                            {c.reference}
                          </span>
                          <span title={formatDateTime(c.submittedAt)}>{formatRelative(c.submittedAt)}</span>
                        </div>
                      </td>
                      <td data-label="Customer">
                        <div className="who">
                          <span className="avatar avatar-sm" aria-hidden="true">
                            {initials(c.customerName)}
                          </span>
                          <span>{c.customerName}</span>
                        </div>
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
                      <td data-label="">
                        {c.status === "Submitted" ? (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="icon-action approve"
                              onClick={() => setPending({ claim: c, decision: "approve" })}
                            >
                              <Check size={14} strokeWidth={2.6} /> Approve
                            </button>
                            <button
                              type="button"
                              className="icon-action reject"
                              onClick={() => setPending({ claim: c, decision: "reject" })}
                            >
                              <X size={14} strokeWidth={2.6} /> Reject
                            </button>
                          </div>
                        ) : (
                          <div className="decided">
                            {c.status} by {c.decidedBy}
                            <br />
                            {c.decidedAt && formatDateTime(c.decidedAt)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : visiblePolicies.length === 0 ? (
          <EmptyState icon={FileText} title={policies.length ? "No matching policies" : "No policies issued yet"}>
            {policies.length ? "Try a different filter or search term." : "Use New policy to issue cover to a customer."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Customer</th>
                  <th>Coverage</th>
                  <th className="right">Sum insured</th>
                  <th>Utilisation</th>
                  <th className="right">Claimable</th>
                </tr>
              </thead>
              <tbody>
                {visiblePolicies.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Policy">
                      <div className="who-text">
                        <span className="mono" style={{ color: "var(--ink)", fontSize: "0.8rem" }}>
                          {p.reference}
                        </span>
                        <span>
                          {p.claimCount} claim{p.claimCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </td>
                    <td data-label="Customer">
                      <div className="who">
                        <span className="avatar avatar-sm" aria-hidden="true">
                          {initials(p.customerName)}
                        </span>
                        <span className="who-text">
                          {p.customerName}
                          <span className="mono">{p.customerUsername}</span>
                        </span>
                      </div>
                    </td>
                    <td data-label="Coverage">
                      <div className="who-text" style={{ alignItems: "inherit" }}>
                        <span className="nowrap">
                          {formatDate(p.startDate)} – {formatDate(p.endDate)}
                        </span>
                        <span>
                          <CoverageBadge state={coverageState(p.startDate, p.endDate)} />
                        </span>
                      </div>
                    </td>
                    <td data-label="Sum insured" className="right amount">
                      {formatMoney(p.sumInsured)}
                    </td>
                    <td data-label="Utilisation" className="meter-cell">
                      <SIMeter
                        compact
                        sumInsured={p.sumInsured}
                        approved={p.approvedAmount}
                        pending={p.pendingAmount}
                        remaining={p.remainingSumInsured}
                      />
                    </td>
                    <td data-label="Claimable" className="right amount" style={{ fontSize: "0.95rem" }}>
                      {formatMoney(p.remainingSumInsured)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NewPolicyDialog
        open={newPolicyOpen}
        customers={customers}
        onClose={() => setNewPolicyOpen(false)}
        onCreated={(p) => {
          setNewPolicyOpen(false);
          setTab("policies");
          setCustomerFilter("all");
          setQuery("");
          toast("success", `${p.reference} issued to ${p.customerName} for ${formatMoney(p.sumInsured)}.`);
          load();
        }}
      />
      <DecisionDialog
        claim={pending?.claim ?? null}
        policy={pending ? policyById.get(pending.claim.policyId) : undefined}
        decision={pending?.decision ?? "approve"}
        onClose={() => setPending(null)}
        onDecided={({ claim, policy }) => {
          setPending(null);
          toast(
            "success",
            `${claim.reference} ${claim.status.toLowerCase()}. ${policy.reference} now has ${formatMoney(policy.remainingSumInsured)} claimable.`,
          );
          load();
        }}
      />
    </>
  );
}

function emptyClaimsTitle(filter: StatusFilter, q: string) {
  if (q) return "No matching claims";
  if (filter === "Submitted") return "No claims awaiting a decision";
  if (filter === "All") return "No claims yet";
  return `No ${filter.toLowerCase()} claims`;
}
