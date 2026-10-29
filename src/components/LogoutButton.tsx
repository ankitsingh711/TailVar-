"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/api-client";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={logout}>
      <LogOut size={15} aria-hidden="true" />
      Log out
    </button>
  );
}
