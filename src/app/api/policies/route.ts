import { assertRole } from "@/lib/auth";
import { currentUser, json, readJson, route } from "@/lib/http";
import { createPolicy, listPolicies } from "@/lib/service";

export const GET = route(async () => json({ policies: await listPolicies(await currentUser()) }));

export const POST = route(async (req) => {
  const user = assertRole(await currentUser(), "admin");
  const body = await readJson(req);
  return json({ policy: await createPolicy(user, body) }, 201);
});
