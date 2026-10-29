const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

/** Display-only formatting of a decimal money string in Indian grouping, e.g. ₹10,00,000.00. */
export const formatMoney = (amount: string | number) => inr.format(Number(amount));

/** Short form in lakh / crore for headline figures, e.g. ₹10 L, ₹2.5 Cr. */
export function formatCompact(amount: string | number): string {
  const n = Number(amount);
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, "");
  if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5)} L`;
  return inrWhole.format(n);
}

/** Spells a figure in the Indian system for form hints, e.g. "10 lakh", "1.25 crore". */
export function amountInWords(amount: string | number): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, "");
  if (n >= 1e7) return `${trim(n / 1e7)} crore`;
  if (n >= 1e5) return `${trim(n / 1e5)} lakh`;
  if (n >= 1e3) return `${trim(n / 1e3)} thousand`;
  return null;
}

/** Formats a 'YYYY-MM-DD' calendar date without going through Date (no timezone shifts). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function formatRelative(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)} d ago`;
  return formatDateTime(iso).split(",")[0];
}

/** Today's calendar date in India as 'YYYY-MM-DD'. */
export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Inclusive number of days covered by a start/end date pair. */
export const coverageDays = (start: string, end: string) => Math.round((toUtc(end) - toUtc(start)) / DAY_MS) + 1;

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function addYearsMinusDay(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y + years, m - 1, d));
  return new Date(next.getTime() - DAY_MS).toISOString().slice(0, 10);
}

export type CoverageState = "active" | "upcoming" | "expired";

export function coverageState(start: string, end: string, today = todayIST()): CoverageState {
  if (today < start) return "upcoming";
  if (today > end) return "expired";
  return "active";
}

/** Lets users type "10,00,000" or "₹ 5,000.50"; the server only accepts plain decimals. */
export const normaliseAmountInput = (value: string) => value.replace(/[,\s₹]/g, "");

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
