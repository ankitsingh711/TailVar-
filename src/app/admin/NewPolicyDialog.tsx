"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/api-client";
import { addYearsMinusDay, amountInWords, coverageDays, formatDate, normaliseAmountInput, todayIST } from "@/lib/format";
import type { CustomerDto, PolicyDto } from "@/lib/types";

const SI_PRESETS = [
  ["5 L", "500000"],
  ["10 L", "1000000"],
  ["25 L", "2500000"],
  ["50 L", "5000000"],
  ["1 Cr", "10000000"],
] as const;

interface Props {
  open: boolean;
  customers: CustomerDto[];
  onClose: () => void;
  onCreated: (p: PolicyDto) => void;
}

export default function NewPolicyDialog({ open, customers, onClose, onCreated }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = todayIST();
    setCustomerId("");
    setStartDate(today);
    setEndDate(addYearsMinusDay(today, 1));
    setSumInsured("");
    setError(null);
  }, [open]);

  const datesInvalid = Boolean(startDate && endDate && endDate < startDate);
  const si = normaliseAmountInput(sumInsured);
  const siInvalid = sumInsured !== "" && !(/^\d+(\.\d{1,2})?$/.test(si) && Number(si) > 0);
  const words = !siInvalid ? amountInWords(si) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return setError("Choose the customer this policy is for.");
    if (!startDate || !endDate) return setError("Enter both coverage dates.");
    if (datesInvalid) return setError("The coverage end date can't be before the start date.");
    if (!sumInsured || siInvalid) return setError("Enter a sum insured greater than zero, with at most 2 decimals.");
    setBusy(true);
    setError(null);
    try {
      const { policy } = await api<{ policy: PolicyDto }>("/api/policies", {
        body: { customerId: Number(customerId), startDate, endDate, sumInsured: si },
      });
      onCreated(policy);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Issue a new policy"
      description="The full sum insured is claimable from day one of coverage."
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {busy ? "Issuing…" : "Issue policy"}
          </button>
        </>
      }
    >
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: 6 }}>
          Customer
        </legend>
        <div className="options">
          {customers.map((c) => (
            <label key={c.id} className="option">
              <input
                type="radio"
                name="customer"
                value={c.id}
                checked={customerId === String(c.id)}
                onChange={(e) => setCustomerId(e.target.value)}
              />
              <span className="avatar" aria-hidden="true">
                {c.displayName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span className="option-text">
                <strong>{c.displayName}</strong>
                <span className="mono">{c.username}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor="start-date">
            Coverage start date
          </label>
          <input id="start-date" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="end-date">
            Coverage end date
          </label>
          <input
            id="end-date"
            className="input"
            type="date"
            value={endDate}
            min={startDate || undefined}
            aria-invalid={datesInvalid}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="quick" style={{ marginTop: -8 }}>
        {[1, 2, 3].map((y) => (
          <button key={y} type="button" onClick={() => startDate && setEndDate(addYearsMinusDay(startDate, y))}>
            {y} year{y > 1 ? "s" : ""}
          </button>
        ))}
        <span className={`field-hint${datesInvalid ? " error" : ""}`} style={{ alignSelf: "center", marginLeft: 6 }}>
          {datesInvalid
            ? "End date is before the start date."
            : startDate && endDate
              ? `${coverageDays(startDate, endDate)} days of cover · ${formatDate(startDate)} to ${formatDate(endDate)}, inclusive`
              : ""}
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="sum-insured">
          Sum insured
        </label>
        <div className="input-wrap">
          <span className="input-prefix">₹</span>
          <input
            id="sum-insured"
            className="input has-prefix num"
            inputMode="decimal"
            placeholder="10,00,000"
            value={sumInsured}
            aria-invalid={siInvalid}
            onChange={(e) => setSumInsured(e.target.value)}
          />
        </div>
        <div className="quick">
          {SI_PRESETS.map(([label, value]) => (
            <button key={value} type="button" onClick={() => setSumInsured(Number(value).toLocaleString("en-IN"))}>
              ₹{label}
            </button>
          ))}
        </div>
        <span className={`field-hint${siInvalid ? " error" : ""}`}>
          {siInvalid ? "Use digits only, up to 2 decimal places." : words ? `₹ ${words}` : ""}
        </span>
      </div>

      {error && (
        <div className="callout callout-error" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
