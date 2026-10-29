import { currentUser, json, route } from "@/lib/http";
import { getClaim } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  return json({ claim: await getClaim(await currentUser(), id) });
});
