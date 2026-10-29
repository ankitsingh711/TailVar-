import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, authenticate, createSession } from "@/lib/auth";
import { clientIp, json, readJson, route } from "@/lib/http";

export const POST = route(async (req) => {
  const body = await readJson(req);
  const user = await authenticate(body.username, body.password, clientIp(req));
  const token = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return json({ user });
});
