import AppShell from "@/components/AppShell";
import { requirePageUser } from "@/lib/page-auth";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const user = await requirePageUser("admin");
  return (
    <AppShell user={user}>
      <AdminDashboard />
    </AppShell>
  );
}
