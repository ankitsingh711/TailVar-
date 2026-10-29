import { currentUser, json, route } from "@/lib/http";
import { listCustomers } from "@/lib/service";

export const GET = route(async () => json({ customers: await listCustomers(await currentUser()) }));
