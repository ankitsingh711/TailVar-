import { badRequest } from "./errors";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a calendar date in ISO 'YYYY-MM-DD' form (no time, no timezone) and returns it.
 * ISO date strings compare correctly with plain string comparison.
 */
export function parseDate(input: unknown, field: string): string {
  if (typeof input !== "string" || !DATE_RE.test(input)) {
    throw badRequest(`${field} must be a date in YYYY-MM-DD format.`);
  }
  const [y, m, d] = input.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw badRequest(`${field} is not a valid calendar date.`);
  }
  if (y < 1900 || y > 2200) throw badRequest(`${field} must be between the years 1900 and 2200.`);
  return input;
}

export function parseId(input: unknown, field: string): number {
  const n = typeof input === "string" && /^\d+$/.test(input) ? Number(input) : input;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) {
    throw badRequest(`${field} must be a positive integer.`);
  }
  return n;
}
