import { ShieldCheck } from "lucide-react";

export default function Brand({ subtitle = "Policies & claims" }: { subtitle?: string }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <ShieldCheck size={18} strokeWidth={2.2} />
      </span>
      <span className="brand-name">
        Claims Desk
        <small>{subtitle}</small>
      </span>
    </span>
  );
}
