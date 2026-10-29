import { cookies } from "next/headers";
import { SESSION_COOKIE, destroySession } from "@/lib/auth";
import { json, route } from "@/lib/http";

export const POST = route(async () => {
  const store = await cookies();
  await destroySession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  return json({ ok: true });
});
