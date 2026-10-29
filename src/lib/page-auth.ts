import { redirect } from "next/navigation";
import { currentUser } from "./http";
import type { Role, SessionUser } from "./types";

export const homeFor = (role: Role) => (role === "admin" ? "/admin" : "/customer");

/** Server-side page guard: unauthenticated -> /login, wrong role -> that user's own home. */
export async function requirePageUser(role: Role): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}
