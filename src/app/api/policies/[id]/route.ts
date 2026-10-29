import { currentUser, json, route } from "@/lib/http";
import { getPolicy, listClaims } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await currentUser();
  const { id } = await params;
  const policy = await getPolicy(user, id);
  const claims = await listClaims(user, { policyId: String(policy.id) });
  return json({ policy, claims });
});
