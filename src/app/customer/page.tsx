import AppShell from "@/components/AppShell";
import { requirePageUser } from "@/lib/page-auth";
import CustomerDashboard from "./CustomerDashboard";

export default async function CustomerPage() {
  const user = await requirePageUser("customer");
  return (
    <AppShell user={user}>
      <CustomerDashboard displayName={user.displayName} />
    </AppShell>
  );
}
