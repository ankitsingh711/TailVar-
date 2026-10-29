import { assertRole } from "@/lib/auth";
import { currentUser, json, route } from "@/lib/http";

export const GET = route(async () => {
  const user = assertRole(await currentUser(), "admin", "customer");
  return json({ user });
});
