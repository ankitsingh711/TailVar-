"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/api-client";
import { formatCompact, formatDate, formatMoney, normaliseAmountInput, todayIST } from "@/lib/format";
import type { ClaimDto, PolicyDto } from "@/lib/types";

interface Props {
  open: boolean;
  policies: PolicyDto[];
  initialPolicyId: number | null;
  onClose: () => void;
  onSubmitted: (c: ClaimDto) => void;
}

export default function NewClaimDialog({ open, policies, initialPolicyId, onClose, onSubmitted }: Props) {
  const [policyId, setPolicyId] = useState<number | null>(null);
  const [incidentDate, setIncidentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const firstClaimable = policies.find((p) => Number(p.remainingSumInsured) > 0)?.id ?? null;
    setPolicyId(initialPolicyId ?? firstClaimable);
    setIncidentDate("");
    setAmount("");
    setError(null);
  }, [open, initialPolicyId, policies]);

  const policy = policies.find((p) => p.id === policyId);
  const value = normaliseAmountInput(amount);
  const amountFormatOk = /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0;
  const remaining = Number(policy?.remainingSumInsured ?? 0);
  const over = amountFormatOk && Number(value) > remaining;
  const dateOutside = Boolean(policy && incidentDate && (incidentDate < policy.startDate || incidentDate > policy.endDate));

  let amountHint: { text: string; tone?: "error" | "ok" } = { text: "" };
  if (amount && !amountFormatOk) amountHint = { text: "Enter an amount greater than zero, with at most 2 decimals.", tone: "error" };
  else if (over) amountHint = { text: `That is ${formatMoney(Number(value) - remaining)} more than the ${formatMoney(remaining)} still claimable.`, tone: "error" };
  else if (amountFormatOk && policy) amountHint = { text: `${formatMoney(remaining - Number(value))} will remain claimable after this claim.`, tone: "ok" };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!policy) return setError("Choose the policy you are claiming against.");
    if (!incidentDate) return setError("Enter the date the incident happened.");
    if (dateOutside) return setError(`The incident date must be between ${formatDate(policy.startDate)} and ${formatDate(policy.endDate)}.`);
    if (!amountFormatOk) return setError("Enter the claim amount.");
    if (over) return setError(`You can claim up to ${formatMoney(remaining)} on this policy.`);
    setBusy(true);
    setError(null);
    try {
      // The server re-validates everything; the checks above only give faster feedback.
      const { claim } = await api<{ claim: ClaimDto }>("/api/claims", { body: { policyId: policy.id, incidentDate, amount: value } });
      onSubmitted(claim);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const today = todayIST();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="File a claim"
      description="Your claim blocks its amount on the policy straight away while it is reviewed."
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || over || dateOutside}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {busy ? "Submitting…" : "Submit claim"}
          </button>
        </>
      }
    >
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: 6 }}>
          Policy
        </legend>
        <div className="options" style={{ gridTemplateColumns: "1fr" }}>
          {policies.map((p) => {
            const empty = Number(p.remainingSumInsured) <= 0;
            return (
              <label key={p.id} className="option">
                <input
                  type="radio"
                  name="policy"
                  value={p.id}
                  checked={policyId === p.id}
                  disabled={empty}
                  onChange={() => setPolicyId(p.id)}
                />
                <span className="option-text" style={{ flex: 1 }}>
                  <strong className="mono">{p.reference}</strong>
                  <span>
                    {formatDate(p.startDate)} – {formatDate(p.endDate)}
                  </span>
                </span>
                <span className="option-text" style={{ textAlign: "right" }}>
                  <strong className="num">{formatCompact(p.remainingSumInsured)}</strong>
                  <span>{empty ? "fully claimed" : `claimable of ${formatCompact(p.sumInsured)}`}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor="incident-date">
            Incident date
          </label>
          <input
            id="incident-date"
            className="input"
            type="date"
            value={incidentDate}
            min={policy?.startDate}
            max={policy?.endDate}
            aria-invalid={dateOutside}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
          <span className={`field-hint${dateOutside ? " error" : ""}`}>
            {policy ? `Covered ${formatDate(policy.startDate)} to ${formatDate(policy.endDate)}` : ""}
            {policy && today >= policy.startDate && today <= policy.endDate && !incidentDate && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setIncidentDate(today)}
                  style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontWeight: 600, cursor: "pointer", fontSize: "inherit" }}
                >
                  Use today
                </button>
              </>
            )}
          </span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="claim-amount">
            Claim amount
          </label>
          <div className="input-wrap">
            <span className="input-prefix">₹</span>
            <input
              id="claim-amount"
              className="input has-prefix num"
              inputMode="decimal"
              placeholder="6,00,000"
              value={amount}
              aria-invalid={Boolean(amount) && (!amountFormatOk || over)}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <span className={`field-hint${amountHint.tone ? ` ${amountHint.tone}` : ""}`} data-testid="amount-hint">
            {amountHint.text}
          </span>
        </div>
      </div>
      {policy && remaining > 0 && (
        <div className="quick" style={{ marginTop: -8 }}>
          <button type="button" onClick={() => setAmount(remaining.toLocaleString("en-IN", { maximumFractionDigits: 2 }))}>
            Claim the full {formatMoney(remaining)}
          </button>
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
