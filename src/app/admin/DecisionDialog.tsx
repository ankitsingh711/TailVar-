"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CircleAlert, LoaderCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import SIMeter from "@/components/ui/SIMeter";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { ClaimDto, PolicyDto } from "@/lib/types";

export type Decision = "approve" | "reject";

interface Props {
  claim: ClaimDto | null;
  policy: PolicyDto | undefined;
  decision: Decision;
  onClose: () => void;
  onDecided: (res: { claim: ClaimDto; policy: PolicyDto }) => void;
}

export default function DecisionDialog({ claim, policy, decision, onClose, onDecided }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [claim, decision]);

  async function confirm() {
    if (!claim) return;
    setBusy(true);
    setError(null);
    try {
      onDecided(await api(`/api/claims/${claim.id}/decision`, { body: { decision } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const approve = decision === "approve";
  const after = claim && policy ? (approve ? policy.remainingSumInsured : String(Number(policy.remainingSumInsured) + Number(claim.amount))) : null;

  return (
    <Modal
      open={claim !== null}
      onClose={onClose}
      title={approve ? "Approve this claim?" : "Reject this claim?"}
      description={
        approve
          ? "The amount stays deducted from the policy's sum insured."
          : "The blocked amount is released and can be claimed again."
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn ${approve ? "btn-approve" : "btn-reject"}`} onClick={confirm} disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {approve ? "Approve claim" : "Reject claim"}
          </button>
        </>
      }
    >
      {claim && (
        <dl className="summary">
          <dt>Claim</dt>
          <dd className="mono">{claim.reference}</dd>
          <dt>Customer</dt>
          <dd>{claim.customerName}</dd>
          <dt>Policy</dt>
          <dd className="mono">{claim.policyReference}</dd>
          <dt>Incident date</dt>
          <dd>{formatDate(claim.incidentDate)}</dd>
          <dt>Submitted</dt>
          <dd>{formatDateTime(claim.submittedAt)}</dd>
          <dt>Amount</dt>
          <dd style={{ fontSize: "1.0625rem" }}>{formatMoney(claim.amount)}</dd>
        </dl>
      )}
      {claim && policy && after && (
        <div className="form-stack" style={{ gap: 10 }}>
          <span className="eyebrow">Claimable sum insured on {policy.reference}</span>
          <div className="impact">
            {approve ? (
              <>
                <span className="to">{formatMoney(after)}</span>
                <span className="muted">unchanged</span>
              </>
            ) : (
              <>
                <span className="from">{formatMoney(policy.remainingSumInsured)}</span>
                <ArrowRight size={16} className="muted" />
                <span className="to">{formatMoney(after)}</span>
              </>
            )}
          </div>
          <SIMeter
            sumInsured={policy.sumInsured}
            approved={approve ? String(Number(policy.approvedAmount) + Number(claim.amount)) : policy.approvedAmount}
            pending={String(Number(policy.pendingAmount) - Number(claim.amount))}
            remaining={after}
            releasing={approve ? undefined : claim.amount}
          />
        </div>
      )}
      {error && (
        <div className="callout callout-error" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
