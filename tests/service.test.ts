import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authenticate, createSession, destroySession, getSessionUser } from "@/lib/auth";
import {
  createPolicy,
  decideClaim,
  getClaim,
  getPolicy,
  listClaims,
  listCustomers,
  listPolicies,
  submitClaim,
} from "@/lib/service";
import type { SessionUser } from "@/lib/types";
import { loadUsers, resetData } from "./helpers";

let admin: SessionUser;
let c1: SessionUser;
let c2: SessionUser;

async function expectAppError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
  if (code) expect((err as AppError).code).toBe(code);
}

const policyFor = (customer: SessionUser, sumInsured = "1000000", startDate = "2026-01-01", endDate = "2026-12-31") =>
  createPolicy(admin, { customerId: customer.id, startDate, endDate, sumInsured });

beforeAll(async () => {
  ({ admin, customer1: c1, customer2: c2 } = await loadUsers());
});
beforeEach(resetData);
afterAll(async () => {
  await getPool().end();
});

describe("authentication", () => {
  it("accepts the demo credentials and rejects wrong passwords", async () => {
    expect((await authenticate("admin", "Admin@Demo26", "1.1.1.1")).role).toBe("admin");
    expect((await authenticate("customer1", "Customer1@Demo26", "1.1.1.1")).role).toBe("customer");
    expect((await authenticate(" Customer2 ", "Customer2@Demo26", "1.1.1.1")).username).toBe("customer2");
    await expectAppError(authenticate("customer1", "Customer2@Demo26", "1.1.1.1"), 401, "INVALID_CREDENTIALS");
    await expectAppError(authenticate("nobody", "whatever", "1.1.1.1"), 401, "INVALID_CREDENTIALS");
    await expectAppError(authenticate("", "", "1.1.1.1"), 400);
  });

  it("locks out a username+IP after 10 failures, without affecting other IPs", async () => {
    for (let i = 0; i < 10; i++) await expectAppError(authenticate("admin", "wrong", "9.9.9.9"), 401);
    await expectAppError(authenticate("admin", "Admin@Demo26", "9.9.9.9"), 429, "TOO_MANY_ATTEMPTS");
    expect((await authenticate("admin", "Admin@Demo26", "8.8.8.8")).role).toBe("admin");
  });

  it("creates, resolves and destroys sessions", async () => {
    const token = await createSession(c1.id);
    expect((await getSessionUser(token))?.username).toBe("customer1");
    expect(await getSessionUser("not-a-real-token")).toBeNull();
    await destroySession(token);
    expect(await getSessionUser(token)).toBeNull();
  });

  it("ignores expired sessions", async () => {
    const token = await createSession(c1.id);
    await getPool().query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect(await getSessionUser(token)).toBeNull();
  });
});

describe("policy creation", () => {
  it("creates a policy with full SI available", async () => {
    const p = await policyFor(c1);
    expect(p).toMatchObject({
      reference: "POL-000001",
      customerUsername: "customer1",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      sumInsured: "1000000.00",
      remainingSumInsured: "1000000.00",
      claimCount: 0,
    });
  });

  it("allows a single-day policy (end date == start date)", async () => {
    const p = await policyFor(c1, "5000", "2026-06-01", "2026-06-01");
    expect(p.endDate).toBe("2026-06-01");
  });

  it("rejects end date before start date", async () => {
    await expectAppError(policyFor(c1, "1000", "2026-12-31", "2026-01-01"), 400);
  });

  it("rejects non-positive or malformed SI", async () => {
    for (const si of ["0", "-100", "abc", "10.555"]) await expectAppError(policyFor(c1, si), 400);
  });

  it("rejects invalid customers, including the admin account", async () => {
    await expectAppError(createPolicy(admin, { customerId: 9999, startDate: "2026-01-01", endDate: "2026-02-01", sumInsured: "1" }), 400);
    await expectAppError(createPolicy(admin, { customerId: admin.id, startDate: "2026-01-01", endDate: "2026-02-01", sumInsured: "1" }), 400);
  });

  it("is admin-only", async () => {
    await expectAppError(createPolicy(c1, { customerId: c1.id, startDate: "2026-01-01", endDate: "2026-02-01", sumInsured: "1" }), 403);
    await expectAppError(createPolicy(null, {}), 401);
  });
});

describe("data isolation", () => {
  it("customers see only their own policies and claims; admin sees all", async () => {
    const p1 = await policyFor(c1);
    const p2 = await policyFor(c2);
    const claim1 = await submitClaim(c1, { policyId: p1.id, incidentDate: "2026-03-01", amount: "100" });
    await submitClaim(c2, { policyId: p2.id, incidentDate: "2026-03-01", amount: "200" });

    expect((await listPolicies(c1)).map((p) => p.id)).toEqual([p1.id]);
    expect((await listPolicies(c2)).map((p) => p.id)).toEqual([p2.id]);
    expect(await listPolicies(admin)).toHaveLength(2);
    expect((await listClaims(c1)).map((c) => c.customerUsername)).toEqual(["customer1"]);
    expect(await listClaims(admin)).toHaveLength(2);

    await expectAppError(getPolicy(c2, p1.id), 404);
    await expectAppError(getClaim(c2, claim1.id), 404);
    expect((await listClaims(c2, { policyId: String(p1.id) })).length).toBe(0);
  });

  it("customers cannot claim against another customer's policy", async () => {
    const p1 = await policyFor(c1);
    await expectAppError(submitClaim(c2, { policyId: p1.id, incidentDate: "2026-03-01", amount: "100" }), 404);
  });

  it("only customers submit claims and only admins decide or list customers", async () => {
    const p1 = await policyFor(c1);
    await expectAppError(submitClaim(admin, { policyId: p1.id, incidentDate: "2026-03-01", amount: "100" }), 403);
    const claim = await submitClaim(c1, { policyId: p1.id, incidentDate: "2026-03-01", amount: "100" });
    await expectAppError(decideClaim(c1, claim.id, "approve"), 403);
    await expectAppError(listCustomers(c1), 403);
    await expectAppError(listPolicies(null), 401);
  });
});

describe("claim validation", () => {
  it("accepts incident dates on the start and end dates (inclusive)", async () => {
    const p = await policyFor(c1);
    await submitClaim(c1, { policyId: p.id, incidentDate: "2026-01-01", amount: "1" });
    await submitClaim(c1, { policyId: p.id, incidentDate: "2026-12-31", amount: "1" });
  });

  it("rejects incident dates one day outside coverage", async () => {
    const p = await policyFor(c1);
    await expectAppError(submitClaim(c1, { policyId: p.id, incidentDate: "2025-12-31", amount: "1" }), 422, "INCIDENT_OUTSIDE_COVERAGE");
    await expectAppError(submitClaim(c1, { policyId: p.id, incidentDate: "2027-01-01", amount: "1" }), 422, "INCIDENT_OUTSIDE_COVERAGE");
  });

  it("rejects zero, negative and malformed claim amounts", async () => {
    const p = await policyFor(c1);
    for (const amount of ["0", "-1", "", "1.001", "ten"]) {
      await expectAppError(submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount }), 400);
    }
  });

  it("allows claiming exactly the full SI, then nothing more", async () => {
    const p = await policyFor(c1, "1000");
    await submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "1000" });
    await expectAppError(submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "0.01" }), 422, "SUM_INSURED_EXCEEDED");
  });

  it("rejects a claim larger than the SI and unknown policies", async () => {
    const p = await policyFor(c1, "1000");
    await expectAppError(submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "1000.01" }), 422);
    await expectAppError(submitClaim(c1, { policyId: 424242, incidentDate: "2026-03-01", amount: "1" }), 404);
  });
});

describe("SI accounting (illustrative example from the brief)", () => {
  it("blocks on submit, releases on reject, keeps consumed on approve", async () => {
    const p = await policyFor(c1, "1000000");
    const first = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-04-10", amount: "600000" });
    expect(first.status).toBe("Submitted");
    expect((await getPolicy(c1, p.id)).remainingSumInsured).toBe("400000.00");

    await expectAppError(
      submitClaim(c1, { policyId: p.id, incidentDate: "2026-04-11", amount: "500000" }),
      422,
      "SUM_INSURED_EXCEEDED",
    );

    const rejected = await decideClaim(admin, first.id, "reject");
    expect(rejected.claim.status).toBe("Rejected");
    expect(rejected.policy.remainingSumInsured).toBe("1000000.00");

    const second = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-04-11", amount: "500000" });
    expect((await getPolicy(c1, p.id)).remainingSumInsured).toBe("500000.00");

    const approved = await decideClaim(admin, second.id, "approve");
    expect(approved.claim.status).toBe("Approved");
    expect(approved.policy).toMatchObject({ remainingSumInsured: "500000.00", approvedAmount: "500000.00", pendingAmount: "0.00" });
  });

  it("approval keeps remaining SI at 4,00,000 in the alternative branch", async () => {
    const p = await policyFor(c1, "1000000");
    const first = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-04-10", amount: "600000" });
    const { policy } = await decideClaim(admin, first.id, "approve");
    expect(policy.remainingSumInsured).toBe("400000.00");
    await expectAppError(submitClaim(c1, { policyId: p.id, incidentDate: "2026-04-10", amount: "500000" }), 422);
  });

  it("handles paise precisely", async () => {
    const p = await policyFor(c1, "0.30");
    await submitClaim(c1, { policyId: p.id, incidentDate: "2026-04-10", amount: "0.10" });
    await submitClaim(c1, { policyId: p.id, incidentDate: "2026-04-10", amount: "0.20" });
    expect((await getPolicy(c1, p.id)).remainingSumInsured).toBe("0.00");
  });
});

describe("claim decisions", () => {
  it("cannot decide an already-decided claim", async () => {
    const p = await policyFor(c1);
    const claim = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "100" });
    await decideClaim(admin, claim.id, "approve");
    await expectAppError(decideClaim(admin, claim.id, "reject"), 409, "CLAIM_ALREADY_DECIDED");
    await expectAppError(decideClaim(admin, claim.id, "approve"), 409, "CLAIM_ALREADY_DECIDED");
    expect((await getClaim(admin, claim.id)).status).toBe("Approved");
  });

  it("a rejected claim cannot be re-approved (which would re-consume SI)", async () => {
    const p = await policyFor(c1, "1000");
    const claim = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "1000" });
    await decideClaim(admin, claim.id, "reject");
    await submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "1000" });
    await expectAppError(decideClaim(admin, claim.id, "approve"), 409);
  });

  it("rejects unknown claims and invalid decisions", async () => {
    await expectAppError(decideClaim(admin, 999, "approve"), 404);
    const p = await policyFor(c1);
    const claim = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "100" });
    for (const bad of ["maybe", "", "Submitted", null]) await expectAppError(decideClaim(admin, claim.id, bad), 400);
  });

  it("records who decided and when", async () => {
    const p = await policyFor(c1);
    const claim = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "100" });
    const { claim: decided } = await decideClaim(admin, claim.id, "REJECT");
    expect(decided.decidedBy).toBe("admin");
    expect(decided.decidedAt).not.toBeNull();
  });
});

describe("concurrency", () => {
  it("parallel submissions never over-commit the SI", async () => {
    const p = await policyFor(c1, "1000000");
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => submitClaim(c1, { policyId: p.id, incidentDate: "2026-05-01", amount: "300000" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await getPolicy(admin, p.id)).remainingSumInsured).toBe("100000.00");
  });

  it("parallel decisions on one claim: exactly one wins", async () => {
    const p = await policyFor(c1);
    const claim = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-05-01", amount: "100" });
    const results = await Promise.allSettled([
      decideClaim(admin, claim.id, "approve"),
      decideClaim(admin, claim.id, "reject"),
      decideClaim(admin, claim.id, "approve"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("database-level guards (bypassing the service layer)", () => {
  const db = () => getPool();

  it("trigger blocks direct inserts that exceed SI or fall outside coverage", async () => {
    const p = await policyFor(c1, "1000");
    await expect(
      db().query("INSERT INTO claims (policy_id, incident_date, amount, submitted_by) VALUES ($1, '2026-03-01', 1000.01, $2)", [p.id, c1.id]),
    ).rejects.toThrow(/SUM_INSURED_EXCEEDED/);
    await expect(
      db().query("INSERT INTO claims (policy_id, incident_date, amount, submitted_by) VALUES ($1, '2027-03-01', 1, $2)", [p.id, c1.id]),
    ).rejects.toThrow(/INCIDENT_OUTSIDE_COVERAGE/);
  });

  it("trigger blocks re-deciding or editing a decided claim", async () => {
    const p = await policyFor(c1, "1000");
    const claim = await submitClaim(c1, { policyId: p.id, incidentDate: "2026-03-01", amount: "10" });
    await decideClaim(admin, claim.id, "reject");
    await expect(
      db().query("UPDATE claims SET status = 'Approved', decided_at = now() WHERE id = $1", [claim.id]),
    ).rejects.toThrow(/CLAIM_ALREADY_DECIDED/);
    await expect(db().query("UPDATE claims SET amount = 5 WHERE id = $1", [claim.id])).rejects.toThrow(/CLAIM_IMMUTABLE/);
  });

  it("check constraints reject bad policies and amounts", async () => {
    await expect(
      db().query("INSERT INTO policies (customer_id, start_date, end_date, sum_insured, created_by) VALUES ($1, '2026-02-01', '2026-01-01', 10, $2)", [c1.id, admin.id]),
    ).rejects.toThrow(/policies_dates_chk/);
    await expect(
      db().query("INSERT INTO policies (customer_id, start_date, end_date, sum_insured, created_by) VALUES ($1, '2026-01-01', '2026-02-01', 0, $2)", [c1.id, admin.id]),
    ).rejects.toThrow(/check constraint/);
  });
});
