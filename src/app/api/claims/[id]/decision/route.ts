import { assertRole } from "@/lib/auth";
import { currentUser, json, readJson, route } from "@/lib/http";
import { decideClaim } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = assertRole(await currentUser(), "admin");
  const { id } = await params;
  const body = await readJson(req);
  return json(await decideClaim(user, id, body.decision));
});
