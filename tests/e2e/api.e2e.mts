// Black-box API test against a running deployment (creates policies and claims).
//   BASE_URL=http://localhost:3000 npm run test:api
//   BASE_URL=https://<deployment> npm run test:api
import assert from "node:assert/strict";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const results = { passed: 0, failed: 0 };

interface Res {
  status: number;
  data: any;
  headers: Headers;
}

class Client {
  cookie: string | null = null;
  lastSetCookie: string | null = null;

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (body !== undefined && !h["content-type"]) h["content-type"] = "application/json";
    const res = await fetch(BASE + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      this.lastSetCookie = setCookie;
      const [pair] = setCookie.split(";");
      this.cookie = pair.endsWith("=") ? null : pair;
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  }

  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown, h?: Record<string, string>) => this.req("POST", p, b, h);

  async login(username: string, password: string) {
    const r = await this.post("/api/auth/login", { username, password });
    assert.equal(r.status, 200, `login ${username}: ${JSON.stringify(r.data)}`);
    return r;
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    const err = e as Error;
    results.failed++;
    console.log(`  ✗ ${name}\n      ${err.message.split("\n").join("\n      ")}`);
  }
}

const expectStatus = (r: Res, status: number, label = "") =>
  assert.equal(r.status, status, `${label} expected ${status}, got ${r.status}: ${JSON.stringify(r.data)}`);

console.log(`API end-to-end tests against ${BASE}\n`);

const anon = new Client();
const admin = new Client();
const c1 = new Client();
const c2 = new Client();
let customers: Record<string, number>, p1: any, p2: any, firstClaim: any, secondClaim: any;

await test("health check reports database connectivity", async () => {
  expectStatus(await anon.get("/api/health"), 200);
});

await test("unauthenticated API access is rejected with 401", async () => {
  for (const path of ["/api/me", "/api/policies", "/api/claims", "/api/customers", "/api/policies/1", "/api/claims/1"]) {
    expectStatus(await anon.get(path), 401, path);
  }
  expectStatus(await anon.post("/api/policies", {}), 401, "POST /api/policies");
  expectStatus(await anon.post("/api/claims", {}), 401, "POST /api/claims");
  expectStatus(await anon.post("/api/claims/1/decision", { decision: "approve" }), 401, "POST decision");
});

await test("unauthenticated page access redirects to /login", async () => {
  for (const path of ["/", "/admin", "/customer"]) {
    const r = await anon.get(path);
    assert.ok([302, 303, 307, 308].includes(r.status), `${path} status ${r.status}`);
    assert.match(r.headers.get("location") ?? "", /\/login$/);
  }
});

await test("wrong password and unknown user are rejected identically", async () => {
  const a = await anon.post("/api/auth/login", { username: "customer1", password: "wrong" });
  const b = await anon.post("/api/auth/login", { username: "ghost", password: "wrong" });
  expectStatus(a, 401);
  expectStatus(b, 401);
  assert.equal(a.data.error.message, b.data.error.message);
});

await test("demo accounts log in; session cookie is HttpOnly + SameSite=Lax", async () => {
  await admin.login("admin", "Admin@Demo26");
  await c1.login("customer1", "Customer1@Demo26");
  const r = await c2.login("customer2", "Customer2@Demo26");
  assert.equal(r.data.user.role, "customer");
  assert.match(c2.lastSetCookie ?? "", /HttpOnly/i);
  assert.match(c2.lastSetCookie ?? "", /SameSite=Lax/i);
  if (BASE.startsWith("https://")) assert.match(c2.lastSetCookie ?? "", /Secure/i);
  assert.equal((await admin.get("/api/me")).data.user.role, "admin");
});

await test("logged-in users are routed to their own dashboard", async () => {
  assert.match((await c1.get("/admin")).headers.get("location") ?? "", /\/customer$/);
  assert.match((await admin.get("/customer")).headers.get("location") ?? "", /\/admin$/);
  expectStatus(await admin.get("/admin"), 200);
  expectStatus(await c1.get("/customer"), 200);
});

await test("role enforcement: customers cannot use admin endpoints and vice versa", async () => {
  expectStatus(await c1.get("/api/customers"), 403);
  expectStatus(
    await c1.post("/api/policies", { customerId: 1, startDate: "2026-01-01", endDate: "2026-12-31", sumInsured: "100" }),
    403,
  );
  expectStatus(await c1.post("/api/claims/1/decision", { decision: "approve" }), 403);
  expectStatus(await admin.post("/api/claims", { policyId: 1, incidentDate: "2026-01-01", amount: "1" }), 403);
});

await test("CSRF protections: foreign Origin and non-JSON bodies are refused", async () => {
  const body = { customerId: 1, startDate: "2026-01-01", endDate: "2026-12-31", sumInsured: "100" };
  expectStatus(await admin.post("/api/policies", body, { origin: "https://evil.example" }), 403);
  expectStatus(
    await admin.post("/api/policies", "customerId=1", { "content-type": "application/x-www-form-urlencoded" }),
    415,
  );
  expectStatus(await admin.post("/api/policies", "{not json"), 400);
});

await test("admin lists exactly the two demo customers", async () => {
  const r = await admin.get("/api/customers");
  expectStatus(r, 200);
  customers = Object.fromEntries(r.data.customers.map((c: any) => [c.username, c.id]));
  assert.deepEqual(Object.keys(customers).sort(), ["customer1", "customer2"]);
});

await test("policy validation: bad dates, non-positive SI, bad customer", async () => {
  const base = { customerId: customers.customer1, startDate: "2026-01-01", endDate: "2026-12-31", sumInsured: "1000" };
  const cases: [Record<string, unknown>, number][] = [
    [{ endDate: "2025-12-31" }, 400],
    [{ sumInsured: "0" }, 400],
    [{ sumInsured: -5 }, 400],
    [{ sumInsured: "12.345" }, 400],
    [{ startDate: "2026-02-30" }, 400],
    [{ startDate: "01/01/2026" }, 400],
    [{ customerId: 999999 }, 400],
    [{ customerId: undefined }, 400],
  ];
  for (const [patch, status] of cases) {
    expectStatus(await admin.post("/api/policies", { ...base, ...patch }), status, JSON.stringify(patch));
  }
});

await test("admin creates policies for both customers", async () => {
  const r1 = await admin.post("/api/policies", {
    customerId: customers.customer1,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    sumInsured: "1000000",
  });
  expectStatus(r1, 201);
  p1 = r1.data.policy;
  assert.equal(p1.remainingSumInsured, "1000000.00");
  const r2 = await admin.post("/api/policies", {
    customerId: customers.customer2,
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    sumInsured: 2500.5,
  });
  expectStatus(r2, 201);
  p2 = r2.data.policy;
  assert.equal(p2.sumInsured, "2500.50");
});

await test("data isolation: customer2 cannot see or claim against customer1's policy", async () => {
  const list = await c2.get("/api/policies");
  assert.ok(list.data.policies.every((p: any) => p.customerUsername === "customer2"));
  assert.ok(!list.data.policies.some((p: any) => p.id === p1.id));
  expectStatus(await c2.get(`/api/policies/${p1.id}`), 404);
  expectStatus(await c2.post("/api/claims", { policyId: p1.id, incidentDate: "2026-03-01", amount: "10" }), 404);
  expectStatus(await c1.get(`/api/policies/${p1.id}`), 200);
});

await test("claim validation: incident outside coverage, non-positive amounts, unknown policy", async () => {
  const cases: [Record<string, unknown>, number][] = [
    [{ incidentDate: "2025-12-31" }, 422],
    [{ incidentDate: "2027-01-01" }, 422],
    [{ amount: "0" }, 400],
    [{ amount: "-100" }, 400],
    [{ amount: "abc" }, 400],
    [{ policyId: 99999999 }, 404],
    [{ incidentDate: "2026-13-01" }, 400],
  ];
  for (const [patch, status] of cases) {
    const body = { policyId: p1.id, incidentDate: "2026-04-10", amount: "100", ...patch };
    expectStatus(await c1.post("/api/claims", body), status, JSON.stringify(patch));
  }
});

await test("illustrative example: 6L claim blocks SI, further 5L claim refused", async () => {
  const r = await c1.post("/api/claims", { policyId: p1.id, incidentDate: "2026-01-01", amount: "600000" });
  expectStatus(r, 201);
  firstClaim = r.data.claim;
  assert.equal(firstClaim.status, "Submitted");
  assert.equal((await c1.get(`/api/policies/${p1.id}`)).data.policy.remainingSumInsured, "400000.00");
  const over = await c1.post("/api/claims", { policyId: p1.id, incidentDate: "2026-12-31", amount: "500000" });
  expectStatus(over, 422);
  assert.equal(over.data.error.code, "SUM_INSURED_EXCEEDED");
});

await test("rejecting the 6L claim releases SI back to 10L; it cannot be decided again", async () => {
  const r = await admin.post(`/api/claims/${firstClaim.id}/decision`, { decision: "reject" });
  expectStatus(r, 200);
  assert.equal(r.data.claim.status, "Rejected");
  assert.equal(r.data.policy.remainingSumInsured, "1000000.00");
  expectStatus(await admin.post(`/api/claims/${firstClaim.id}/decision`, { decision: "approve" }), 409);
  expectStatus(await admin.post(`/api/claims/${firstClaim.id}/decision`, { decision: "reject" }), 409);
});

await test("the 5L claim is now accepted; approving it keeps SI consumed", async () => {
  const r = await c1.post("/api/claims", { policyId: p1.id, incidentDate: "2026-12-31", amount: "500000" });
  expectStatus(r, 201);
  secondClaim = r.data.claim;
  const d = await admin.post(`/api/claims/${secondClaim.id}/decision`, { decision: "approve" });
  expectStatus(d, 200);
  assert.equal(d.data.policy.remainingSumInsured, "500000.00");
  assert.equal(d.data.policy.approvedAmount, "500000.00");
});

await test("customer sees updated statuses on next retrieval; other customer cannot", async () => {
  const mine = (await c1.get("/api/claims")).data.claims;
  const byId = Object.fromEntries(mine.map((c: any) => [c.id, c.status]));
  assert.equal(byId[firstClaim.id], "Rejected");
  assert.equal(byId[secondClaim.id], "Approved");
  expectStatus(await c2.get(`/api/claims/${secondClaim.id}`), 404);
  assert.ok((await c2.get("/api/claims")).data.claims.every((c: any) => c.customerUsername === "customer2"));
  const all = (await admin.get("/api/claims")).data.claims;
  assert.ok(all.some((c: any) => c.id === secondClaim.id && c.customerUsername === "customer1"));
});

await test("decision validation: bad decision value and unknown claim", async () => {
  const r = await c1.post("/api/claims", { policyId: p1.id, incidentDate: "2026-05-05", amount: "1" });
  expectStatus(await admin.post(`/api/claims/${r.data.claim.id}/decision`, { decision: "maybe" }), 400);
  expectStatus(await admin.post(`/api/claims/${r.data.claim.id}/decision`, {}), 400);
  expectStatus(await admin.post("/api/claims/99999999/decision", { decision: "approve" }), 404);
  expectStatus(await admin.post("/api/claims/abc/decision", { decision: "approve" }), 400);
  expectStatus(await admin.post(`/api/claims/${r.data.claim.id}/decision`, { decision: "reject" }), 200);
});

await test("concurrent submissions over HTTP never exceed the remaining SI", async () => {
  // Remaining is 5,00,000; five parallel 2,00,000 claims -> exactly two may succeed.
  const rs = await Promise.all(
    Array.from({ length: 5 }, () => c1.post("/api/claims", { policyId: p1.id, incidentDate: "2026-07-01", amount: "200000" })),
  );
  assert.equal(rs.filter((r) => r.status === 201).length, 2, rs.map((r) => r.status).join(","));
  assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.status === 422));
  assert.equal((await c1.get(`/api/policies/${p1.id}`)).data.policy.remainingSumInsured, "100000.00");
});

await test("tampered session cookie is rejected", async () => {
  const forged = new Client();
  forged.cookie = "tv_session=forged-token-value";
  expectStatus(await forged.get("/api/policies"), 401);
});

await test("logout revokes the session server-side", async () => {
  const stolen = c2.cookie;
  expectStatus(await c2.post("/api/auth/logout"), 200);
  const replay = new Client();
  replay.cookie = stolen;
  expectStatus(await replay.get("/api/policies"), 401);
});

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exit(results.failed ? 1 : 0);
