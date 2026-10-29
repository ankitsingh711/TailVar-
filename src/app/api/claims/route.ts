import { assertRole } from "@/lib/auth";
import { currentUser, json, readJson, route } from "@/lib/http";
import { listClaims, submitClaim } from "@/lib/service";

export const GET = route(async (req) => {
  const params = new URL(req.url).searchParams;
  const claims = await listClaims(await currentUser(), {
    status: params.get("status"),
    policyId: params.get("policyId"),
  });
  return json({ claims });
});

export const POST = route(async (req) => {
  const user = assertRole(await currentUser(), "customer");
  const body = await readJson(req);
  return json({ claim: await submitClaim(user, body) }, 201);
});
