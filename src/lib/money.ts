import { badRequest } from "./errors";

// NUMERIC(14,2) upper bound: 999,999,999,999.99
const MAX_PAISE = 99_999_999_999_999n;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

/** Converts a non-negative decimal string with up to 2 fraction digits to integer paise. */
export function toPaise(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, frac = ""] = (negative ? value.slice(1) : value).split(".");
  const paise = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return negative ? -paise : paise;
}

export function fromPaise(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const s = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

/**
 * Validates a user-supplied monetary amount (JSON number or string) and returns it
 * normalised to a 2-decimal string. Rejects zero/negative values, more than two
 * decimal places, exponent notation and values beyond the column's precision.
 */
export function parseAmount(input: unknown, field: string): string {
  let raw: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw badRequest(`${field} must be a number.`);
    raw = String(input);
  } else if (typeof input === "string") {
    raw = input.trim();
  } else {
    throw badRequest(`${field} is required.`);
  }
  if (raw.startsWith("-")) throw badRequest(`${field} must be greater than zero.`);
  if (!AMOUNT_RE.test(raw)) {
    throw badRequest(`${field} must be a positive amount with at most 2 decimal places.`);
  }
  const paise = toPaise(raw);
  if (paise <= 0n) throw badRequest(`${field} must be greater than zero.`);
  if (paise > MAX_PAISE) throw badRequest(`${field} is too large.`);
  return fromPaise(paise);
}
