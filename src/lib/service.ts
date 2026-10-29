import { getPool, withTransaction } from "./db";
import { assertRole } from "./auth";
import { badRequest, conflict, notFound, unprocessable } from "./errors";
import { fromPaise, parseAmount, toPaise } from "./money";
import { parseDate, parseId } from "./validation";
import type { ClaimDto, ClaimStatus, CustomerDto, PolicyDto, SessionUser } from "./types";

// All functions take the authenticated user and apply authorisation themselves, so the
// rules hold no matter which route (or test) calls them. Records a customer does not
// own are reported as "not found" rather than "forbidden" to avoid leaking their existence.

const policyRef = (id: number) => `POL-${String(id).padStart(6, "0")}`;
const claimRef = (id: number) => `CLM-${String(id).padStart(6, "0")}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
const toPolicy = (r: any): PolicyDto => ({
  id: r.id,
  reference: policyRef(r.id),
  customerId: r.customer_id,
  customerUsername: r.customer_username,
  customerName: r.customer_name,
  startDate: r.start_date,
  endDate: r.end_date,
  sumInsured: r.sum_insured,
  pendingAmount: r.pending_amount,
  approvedAmount: r.approved_amount,
  remainingSumInsured: r.remaining_si,
  claimCount: r.claim_count,
  createdAt: new Date(r.created_at).toISOString(),
});

const toClaim = (r: any): ClaimDto => ({
  id: r.id,
  reference: claimRef(r.id),
  policyId: r.policy_id,
  policyReference: policyRef(r.policy_id),
  customerId: r.customer_id,
  customerUsername: r.customer_username,
  customerName: r.customer_name,
  incidentDate: r.incident_date,
  amount: r.amount,
  status: r.status,
  submittedAt: new Date(r.submitted_at).toISOString(),
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
  decidedBy: r.decided_by,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const formatAmount = (s: string) => `₹${Number(s).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

/* ----------------------------------- Customers ----------------------------------- */

export async function listCustomers(user: SessionUser | null): Promise<CustomerDto[]> {
  assertRole(user, "admin");
  const { rows } = await getPool().query(
    "SELECT id, username, display_name FROM users WHERE role = 'customer' ORDER BY username",
  );
  return rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name }));
}

/* ----------------------------------- Policies ------------------------------------ */

export async function listPolicies(user: SessionUser | null): Promise<PolicyDto[]> {
  const u = assertRole(user, "admin", "customer");
  const { rows } =
    u.role === "admin"
      ? await getPool().query("SELECT * FROM policy_summary ORDER BY id DESC")
      : await getPool().query("SELECT * FROM policy_summary WHERE customer_id = $1 ORDER BY id DESC", [u.id]);
  return rows.map(toPolicy);
}

export async function getPolicy(user: SessionUser | null, idInput: unknown): Promise<PolicyDto> {
  const u = assertRole(user, "admin", "customer");
  const id = parseId(idInput, "Policy ID");
  const { rows } = await getPool().query("SELECT * FROM policy_summary WHERE id = $1", [id]);
  if (!rows[0] || (u.role === "customer" && rows[0].customer_id !== u.id)) throw notFound("Policy not found.");
  return toPolicy(rows[0]);
}

export interface CreatePolicyInput {
  customerId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  sumInsured?: unknown;
}

export async function createPolicy(user: SessionUser | null, input: CreatePolicyInput): Promise<PolicyDto> {
  const admin = assertRole(user, "admin");
  const customerId = parseId(input.customerId, "Customer");
  const startDate = parseDate(input.startDate, "Start date");
  const endDate = parseDate(input.endDate, "End date");
  const sumInsured = parseAmount(input.sumInsured, "Sum insured");
  if (endDate < startDate) throw badRequest("End date cannot be before the start date.");

  // The INSERT ... SELECT only succeeds if the target user exists and is a customer.
  const { rows } = await getPool().query(
    `INSERT INTO policies (customer_id, start_date, end_date, sum_insured, created_by)
     SELECT u.id, $2, $3, $4, $5 FROM users u WHERE u.id = $1 AND u.role = 'customer'
     RETURNING id`,
    [customerId, startDate, endDate, sumInsured, admin.id],
  );
  if (!rows[0]) throw badRequest("Selected customer does not exist.");
  return getPolicy(admin, rows[0].id);
}

/* ------------------------------------ Claims ------------------------------------- */

const CLAIM_STATUSES: ClaimStatus[] = ["Submitted", "Approved", "Rejected"];

export async function listClaims(
  user: SessionUser | null,
  filters: { status?: string | null; policyId?: string | null } = {},
): Promise<ClaimDto[]> {
  const u = assertRole(user, "admin", "customer");
  const where: string[] = [];
  const params: unknown[] = [];
  if (u.role === "customer") {
    params.push(u.id);
    where.push(`customer_id = $${params.length}`);
  }
  if (filters.status) {
    if (!CLAIM_STATUSES.includes(filters.status as ClaimStatus)) {
      throw badRequest(`Status must be one of ${CLAIM_STATUSES.join(", ")}.`);
    }
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.policyId) {
    params.push(parseId(filters.policyId, "Policy ID"));
    where.push(`policy_id = $${params.length}`);
  }
  const sql = `SELECT * FROM claim_details ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC`;
  const { rows } = await getPool().query(sql, params);
  return rows.map(toClaim);
}

export async function getClaim(user: SessionUser | null, idInput: unknown): Promise<ClaimDto> {
  const u = assertRole(user, "admin", "customer");
  const id = parseId(idInput, "Claim ID");
  const { rows } = await getPool().query("SELECT * FROM claim_details WHERE id = $1", [id]);
  if (!rows[0] || (u.role === "customer" && rows[0].customer_id !== u.id)) throw notFound("Claim not found.");
  return toClaim(rows[0]);
}

export interface SubmitClaimInput {
  policyId?: unknown;
  incidentDate?: unknown;
  amount?: unknown;
}

export async function submitClaim(user: SessionUser | null, input: SubmitClaimInput): Promise<ClaimDto> {
  const customer = assertRole(user, "customer");
  const policyId = parseId(input.policyId, "Policy");
  const incidentDate = parseDate(input.incidentDate, "Incident date");
  const amount = parseAmount(input.amount, "Claim amount");

  const claimId = await withTransaction(async (tx) => {
    // Row lock serialises concurrent claims on the same policy, so the remaining-SI check
    // below cannot be raced by a parallel submission.
    const { rows: pol } = await tx.query(
      "SELECT id, customer_id, start_date, end_date, sum_insured FROM policies WHERE id = $1 FOR UPDATE",
      [policyId],
    );
    const policy = pol[0];
    if (!policy || policy.customer_id !== customer.id) throw notFound("Policy not found.");

    if (incidentDate < policy.start_date || incidentDate > policy.end_date) {
      throw unprocessable(
        `Incident date must be within the policy coverage period (${policy.start_date} to ${policy.end_date}).`,
        "INCIDENT_OUTSIDE_COVERAGE",
      );
    }

    const { rows: used } = await tx.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(14,2) AS used
         FROM claims WHERE policy_id = $1 AND status IN ('Submitted', 'Approved')`,
      [policyId],
    );
    const remaining = toPaise(policy.sum_insured) - toPaise(used[0].used);
    if (toPaise(amount) > remaining) {
      throw unprocessable(
        `Claim amount exceeds the remaining claimable sum insured of ${formatAmount(fromPaise(remaining))}.`,
        "SUM_INSURED_EXCEEDED",
      );
    }

    const { rows } = await tx.query(
      `INSERT INTO claims (policy_id, incident_date, amount, submitted_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [policyId, incidentDate, amount, customer.id],
    );
    return rows[0].id as number;
  });
  return getClaim(customer, claimId);
}

export type Decision = "approve" | "reject";

export async function decideClaim(
  user: SessionUser | null,
  idInput: unknown,
  decisionInput: unknown,
): Promise<{ claim: ClaimDto; policy: PolicyDto }> {
  const admin = assertRole(user, "admin");
  const id = parseId(idInput, "Claim ID");
  const decision = typeof decisionInput === "string" ? decisionInput.toLowerCase() : "";
  if (decision !== "approve" && decision !== "reject") {
    throw badRequest('Decision must be either "approve" or "reject".');
  }
  const newStatus: ClaimStatus = decision === "approve" ? "Approved" : "Rejected";

  // Conditional update: only a claim still in Submitted status can change. Two admins
  // deciding at once cannot both succeed because the second UPDATE matches zero rows.
  const { rows } = await getPool().query(
    `UPDATE claims SET status = $2, decided_by = $3, decided_at = now()
      WHERE id = $1 AND status = 'Submitted' RETURNING id, policy_id`,
    [id, newStatus, admin.id],
  );
  if (!rows[0]) {
    const { rows: existing } = await getPool().query("SELECT status FROM claims WHERE id = $1", [id]);
    if (!existing[0]) throw notFound("Claim not found.");
    throw conflict(
      `Claim has already been ${existing[0].status.toLowerCase()} and cannot be decided again.`,
      "CLAIM_ALREADY_DECIDED",
    );
  }
  const [claim, policy] = await Promise.all([getClaim(admin, id), getPolicy(admin, rows[0].policy_id)]);
  return { claim, policy };
}
