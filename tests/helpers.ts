import { getPool } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

export async function resetData() {
  await getPool().query("TRUNCATE claims, policies, sessions, login_failures RESTART IDENTITY");
}

export async function loadUsers(): Promise<Record<"admin" | "customer1" | "customer2", SessionUser>> {
  const { rows } = await getPool().query("SELECT id, username, role, display_name FROM users");
  const byName = Object.fromEntries(
    rows.map((r) => [r.username, { id: r.id, username: r.username, role: r.role, displayName: r.display_name }]),
  );
  return byName as Record<"admin" | "customer1" | "customer2", SessionUser>;
}
