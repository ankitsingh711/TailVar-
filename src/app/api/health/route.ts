import { getPool } from "@/lib/db";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await getPool().query("SELECT 1");
  return json({ status: "ok", time: new Date().toISOString() });
});
